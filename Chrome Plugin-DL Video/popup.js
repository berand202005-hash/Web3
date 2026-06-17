document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');
  const rescanBtn = document.getElementById('rescan-btn');
  const statusBadge = document.getElementById('status-badge');
  let activeTabUrl = '';

  // Load and scan page
  scanCurrentPage();

  // Rescan on button click
  rescanBtn.addEventListener('click', () => {
    scanCurrentPage();
  });

  async function scanCurrentPage() {
    // Show loading, hide others
    loadingState.classList.remove('hidden');
    videoList.classList.add('hidden');
    emptyState.classList.add('hidden');
    statusBadge.classList.add('hidden');
    videoList.innerHTML = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        activeTabUrl = tab.url;
      }
      if (!tab) {
        showEmptyState("No active tab found.");
        return;
      }

      // Check for restricted URLs (like chrome:// settings, extensions store)
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('https://chrome.google.com')) {
        showEmptyState("Extensions are not permitted to run on system pages or the Chrome Web Store.");
        return;
      }

      // Execute content script programmatically
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Parse results
      if (results && results[0] && results[0].result) {
        const videos = results[0].result;
        displayVideos(videos);
      } else {
        showEmptyState("Could not scan the page contents.");
      }
    } catch (error) {
      console.error('Scanning error:', error);
      showEmptyState("Failed to access page. Try reloading the tab.");
    }
  }

  function showEmptyState(message) {
    loadingState.classList.add('hidden');
    videoList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    if (message) {
      emptyState.querySelector('p').textContent = message;
    }
  }

  function displayVideos(videos) {
    loadingState.classList.add('hidden');

    if (!videos || videos.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    videoList.classList.remove('hidden');
    
    // Update status badge
    statusBadge.textContent = `${videos.length} Video${videos.length > 1 ? 's' : ''} Found`;
    statusBadge.classList.remove('hidden');

    videos.forEach((video) => {
      const card = createVideoCard(video);
      videoList.appendChild(card);
    });
  }

  function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';

    // Left container
    const left = document.createElement('div');
    left.className = 'video-card-left';

    // Icon
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'video-icon-wrapper';
    iconWrapper.innerHTML = `
      <svg class="video-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 7a2 2 0 0 0-2.45-1.45L16 7V5a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l4.55 1.45A2 2 0 0 0 23 17V7z"/>
      </svg>
    `;

    // Info
    const info = document.createElement('div');
    info.className = 'video-info';

    const title = document.createElement('div');
    title.className = 'video-title';
    title.textContent = video.name;
    title.title = video.name; // Tooltip for full text

    // Meta tags
    const metaTags = document.createElement('div');
    metaTags.className = 'video-meta-tags';

    const formatBadge = document.createElement('span');
    formatBadge.className = 'badge badge-format';
    formatBadge.textContent = video.type;

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge badge-source';
    sourceBadge.textContent = video.source;

    metaTags.appendChild(formatBadge);
    metaTags.appendChild(sourceBadge);

    if (video.isStream) {
      const warningBadge = document.createElement('span');
      warningBadge.className = 'badge badge-warning';
      warningBadge.textContent = 'Stream';
      warningBadge.title = 'Adaptive streaming format (HLS/DASH). Standard downloading may only fetch the playlist metadata file rather than the full video.';
      metaTags.appendChild(warningBadge);
    }
    
    info.appendChild(title);
    info.appendChild(metaTags);
    
    left.appendChild(iconWrapper);
    left.appendChild(info);

    // Download Button
    const btn = document.createElement('button');
    btn.className = 'download-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      Download
    `;

    btn.addEventListener('click', () => {
      downloadVideo(video, btn, activeTabUrl);
    });

    card.appendChild(left);
    card.appendChild(btn);

    return card;
  }

  function downloadVideo(video, button, referrerUrl) {
    // Temporarily update button state
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.classList.add('downloading');
    button.innerHTML = `
      <svg class="spinner" viewBox="0 0 24 24" style="width: 12px; height: 12px; border-width: 2px; border-top-color: var(--success);"></svg>
      Saving...
    `;

    const downloadOptions = {
      url: video.url,
      filename: video.filename,
      saveAs: true // Prompts the location select dialog
    };

    const startDownload = () => {
      chrome.downloads.download(downloadOptions, (downloadId) => {
        // Clean up the rule if we set one
        if (referrerUrl) {
          chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [1]
          });
        }

        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message;
          console.warn('Download error:', errMsg);
          
          if (errMsg !== 'Download canceled by the user') {
            button.innerHTML = `⚠️ Error`;
            button.style.background = 'rgba(239, 68, 68, 0.2)';
            button.style.color = '#ef4444';
            button.style.border = '1px solid #ef4444';
            button.style.boxShadow = 'none';
            
            setTimeout(() => {
              button.disabled = false;
              button.classList.remove('downloading');
              button.style.background = '';
              button.style.color = '';
              button.style.border = '';
              button.style.boxShadow = '';
              button.innerHTML = originalHTML;
            }, 3000);
            return;
          }
        }

        // Revert button styling after the browser has accepted the request
        setTimeout(() => {
          button.disabled = false;
          button.classList.remove('downloading');
          button.innerHTML = originalHTML;
        }, 1500);
      });
    };

    // Apply header modification rules if referrerUrl is provided
    if (referrerUrl) {
      try {
        const urlObj = new URL(referrerUrl);
        const ruleId = 1;
        const rule = {
          id: ruleId,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Referer', operation: 'set', value: referrerUrl },
              { header: 'Origin', operation: 'set', value: urlObj.origin }
            ]
          },
          condition: {
            urlFilter: video.url,
            resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'media', 'other']
          }
        };

        chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ruleId],
          addRules: [rule]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('declarativeNetRequest Error:', chrome.runtime.lastError.message);
          }
          startDownload();
        });
      } catch (e) {
        console.error('Failed to parse referrer URL for headers:', e);
        startDownload();
      }
    } else {
      startDownload();
    }
  }
});

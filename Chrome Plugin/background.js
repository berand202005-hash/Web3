import { updateRecording } from './db.js';

let recordingTimer = null;
let currentRecordingId = null;

// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    recordingState: 'idle',
    recordingId: null,
    duration: 0,
    options: {
      mode: 'tab',
      quality: '720p',
      mic: false,
      autoResumeMin: 5,
      selectedModel: ''
    }
  });
});

// Handle alarms for auto-unpause
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'auto-unpause') {
    const { recordingState } = await chrome.storage.local.get('recordingState');
    if (recordingState === 'paused') {
      await resumeRecording();
    }
  }
});

// Listener for messages from popup or offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'background') return;

  switch (message.type) {
    case 'start-recording-request':
      handleStartRecording(message.options);
      break;
    case 'pause-recording-request':
      handlePauseRecording();
      break;
    case 'resume-recording-request':
      handleResumeRecording();
      break;
    case 'stop-recording-request':
      handleStopRecording();
      break;
    case 'offscreen-recording-started':
      startTimer();
      chrome.storage.local.set({ recordingState: 'recording' });
      break;
    case 'offscreen-recording-saved':
      handleRecordingSaved(message.recordingId, message.pageContext);
      break;
    case 'offscreen-error':
      cleanupRecordingState();
      chrome.storage.local.set({ recordingState: 'error', errorMsg: message.error });
      break;
    case 'region-selection-confirmed':
      handleRegionSelectionConfirmed(message.crop);
      break;
    case 'region-selection-cancelled':
      cleanupRecordingState();
      break;
  }
});

async function handleStartRecording(options) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      throw new Error('No active tab found.');
    }

    currentRecordingId = 'rec_' + Date.now();
    await chrome.storage.local.set({
      recordingState: 'starting',
      recordingId: currentRecordingId,
      duration: 0,
      options: options
    });

    // Extract page context using chrome.scripting
    let pageContext = {
      title: activeTab.title || 'Untitled Tab',
      url: activeTab.url || '',
      headings: '',
      description: '',
      snippet: ''
    };

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const meta = document.querySelector('meta[name="description"]');
          const desc = meta ? meta.getAttribute('content') : '';
          const headings = Array.from(document.querySelectorAll('h1, h2'))
            .map(el => el.textContent.trim())
            .slice(0, 5)
            .join(' | ');
          // Get a clean text snippet
          const text = document.body.innerText || '';
          const snippet = text.replace(/\s+/g, ' ').substring(0, 800).trim();
          return { desc, headings, snippet };
        }
      });
      if (results && results[0]) {
        pageContext.description = results[0].result.desc || '';
        pageContext.headings = results[0].result.headings || '';
        pageContext.snippet = results[0].result.snippet || '';
      }
    } catch (e) {
      console.warn('Could not extract page script content (e.g. on restricted chrome:// page):', e);
    }

    if (options.mode === 'region') {
      await chrome.storage.local.set({ recordingState: 'selecting' });
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['selection.js']
      });
      return; // Stop here, wait for region-selection-confirmed
    }

    // Ensure offscreen document is open
    await setupOffscreenDocument();

    if (options.mode === 'tab') {
      // Tab Capture
      chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
        if (!streamId || chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError?.message || 'Failed to get tab media stream ID.');
        }

        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId,
          recordingId: currentRecordingId,
          mic: options.mic,
          quality: options.quality,
          pageContext,
          format: options.format
        });
      });
    } else {
      // Screen Capture
      chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], activeTab, (streamId) => {
        if (!streamId) {
          // User cancelled selection
          cleanupRecordingState();
          return;
        }

        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'start-recording',
          streamId,
          recordingId: currentRecordingId,
          mic: options.mic,
          quality: options.quality,
          pageContext,
          isScreen: true,
          format: options.format
        });
      });
    }
  } catch (err) {
    console.error('Error starting recording:', err);
    cleanupRecordingState();
    chrome.storage.local.set({ recordingState: 'error', errorMsg: err.message });
  }
}

async function handlePauseRecording() {
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'pause-recording' });
  stopTimer();
  chrome.storage.local.set({ recordingState: 'paused' });

  // Start auto-unpause alarm
  const { options } = await chrome.storage.local.get('options');
  const delay = parseFloat(options.autoResumeMin) || 5;
  chrome.alarms.create('auto-unpause', { delayInMinutes: delay });
  console.log(`Auto un-pause alarm scheduled in ${delay} minutes`);
}

async function handleResumeRecording() {
  await resumeRecording();
}

async function resumeRecording() {
  chrome.alarms.clear('auto-unpause');
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'resume-recording' });
  startTimer();
  chrome.storage.local.set({ recordingState: 'recording' });
}

async function handleStopRecording() {
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' });
  stopTimer();
  chrome.storage.local.set({ recordingState: 'stopping' });
  chrome.alarms.clear('auto-unpause');
}

function cleanupRecordingState() {
  stopTimer();
  chrome.alarms.clear('auto-unpause');
  chrome.storage.local.set({
    recordingState: 'idle',
    recordingId: null
  });
  currentRecordingId = null;
}

// Timer management
function startTimer() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = setInterval(async () => {
    const { duration } = await chrome.storage.local.get('duration');
    chrome.storage.local.set({ duration: duration + 1 });
  }, 1000);
}

function stopTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

// Setup/Teardown offscreen document
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');
  
  if (!offscreenDocument) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture and record video/audio streams from Chrome API'
    });
  }
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');
  
  if (offscreenDocument) {
    await chrome.offscreen.closeDocument();
  }
}

// Ollama analysis
async function handleRecordingSaved(id, pageContext) {
  cleanupRecordingState();
  await closeOffscreenDocument();

  // Trigger local Ollama to generate smart title and summary
  const { options } = await chrome.storage.local.get('options');
  const model = options.selectedModel;

  if (model && model !== '') {
    // Perform fetch to local Ollama instance
    try {
      const systemPrompt = `You are a helpful video categorization assistant. The user has recorded a browser session. Use the tab title, URL, description, headings, and page content snippet to generate a smart, descriptive file name and a summary.
Format your output strictly as a JSON object:
{
  "title": "Smart Title Here (Max 6 words, no file extension)",
  "summary": "Brief 2-3 sentence summary of what this webpage/content is about."
}
Do not return any conversational text or markdown code blocks outside of the valid JSON structure.`;

      const prompt = `Webpage Details:
Title: ${pageContext.title}
URL: ${pageContext.url}
Description: ${pageContext.description}
Headings: ${pageContext.headings}
Content Snippet: ${pageContext.snippet}`;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          system: systemPrompt,
          format: 'json',
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.response);
        if (parsed.title && parsed.summary) {
          await updateRecording(id, {
            aiTitle: parsed.title,
            aiSummary: parsed.summary,
            modelUsed: model
          });
        }
      }
    } catch (err) {
      console.error('Ollama generation failed, falling back to default:', err);
    }
  }

  // Notify dashboard contexts that the recording is ready and finalized
  chrome.runtime.sendMessage({
    target: 'dashboard',
    type: 'recording-finalized',
    recordingId: id
  });
}

async function handleRegionSelectionConfirmed(crop) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) throw new Error('No active tab found.');

    const data = await chrome.storage.local.get(['recordingId', 'options']);
    const recordingId = data.recordingId;
    const options = data.options;

    await chrome.storage.local.set({ recordingState: 'starting' });

    // Extract page context using chrome.scripting
    let pageContext = {
      title: activeTab.title || 'Untitled Tab',
      url: activeTab.url || '',
      headings: '',
      description: '',
      snippet: ''
    };

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const meta = document.querySelector('meta[name="description"]');
          const desc = meta ? meta.getAttribute('content') : '';
          const headings = Array.from(document.querySelectorAll('h1, h2'))
            .map(el => el.textContent.trim())
            .slice(0, 5)
            .join(' | ');
          const text = document.body.innerText || '';
          const snippet = text.replace(/\s+/g, ' ').substring(0, 800).trim();
          return { desc, headings, snippet };
        }
      });
      if (results && results[0]) {
        pageContext.description = results[0].result.desc || '';
        pageContext.headings = results[0].result.headings || '';
        pageContext.snippet = results[0].result.snippet || '';
      }
    } catch (e) {
      console.warn('Could not extract page content:', e);
    }

    // Ensure offscreen document is open
    await setupOffscreenDocument();

    chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
      if (!streamId || chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError?.message || 'Failed to get tab media stream ID.');
      }

      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'start-recording',
        streamId,
        recordingId,
        mic: options.mic,
        quality: options.quality,
        pageContext,
        crop: crop, // Pass selection rectangle coordinates!
        format: options.format
      });
    });

  } catch (err) {
    console.error('Error starting region recording:', err);
    cleanupRecordingState();
    chrome.storage.local.set({ recordingState: 'error', errorMsg: err.message });
  }
}

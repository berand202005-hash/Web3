import { 
  getAllRecordings, 
  getRecording, 
  deleteRecording, 
  updateRecording, 
  saveChatMessage 
} from './db.js';

let recordings = [];
let activeRecording = null;
let activeVideoUrl = null;
let activeMicUrl = null;
let isOllamaOnline = false;

// DOM elements
const recordingsList = document.getElementById('recordings-list');
const searchInput = document.getElementById('search-input');
const btnRefresh = document.getElementById('btn-refresh-gallery');

const activeViewer = document.getElementById('active-viewer');
const noActiveViewer = document.getElementById('no-active-viewer');

const videoTitle = document.getElementById('video-display-title');
const metaDate = document.getElementById('meta-date');
const metaDuration = document.getElementById('meta-duration');
const metaSize = document.getElementById('meta-size');
const metaUrl = document.getElementById('meta-url');

const videoElement = document.getElementById('main-video');
const audioElement = document.getElementById('mic-audio');

const mixerPanel = document.getElementById('mixer-panel');
const volumeVideo = document.getElementById('volume-video');
const volumeMic = document.getElementById('volume-mic');

const btnDlVideo = document.getElementById('btn-download-video');
const btnDlMic = document.getElementById('btn-download-mic');
const btnDelete = document.getElementById('btn-delete');
const renameInput = document.getElementById('rename-input');

const chatModelSelect = document.getElementById('chat-model-select');
const aiSummaryText = document.getElementById('ai-summary-text');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

const ollamaStatusIndicator = document.getElementById('ollama-status-indicator');
const ollamaStatusText = document.getElementById('ollama-status-text');

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize gallery list
  await loadGallery();

  // Check Ollama connection
  await checkOllama();

  // Search input filter
  searchInput.addEventListener('input', () => {
    filterAndRenderGallery();
  });

  // Refresh gallery
  btnRefresh.addEventListener('click', async () => {
    await loadGallery();
  });

  // Delete recording
  btnDelete.addEventListener('click', async () => {
    if (!activeRecording) return;
    if (confirm(`Are you sure you want to delete "${activeRecording.aiTitle || activeRecording.title}"?`)) {
      await deleteRecording(activeRecording.id);
      resetViewer();
      await loadGallery();
    }
  });

  // Rename recording
  renameInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const newTitle = renameInput.value.trim();
      if (newTitle && activeRecording) {
        activeRecording = await updateRecording(activeRecording.id, {
          title: newTitle,
          aiTitle: null // Clear AI title if manually overridden
        });
        videoTitle.textContent = newTitle;
        renameInput.value = '';
        await loadGallery();
        highlightActiveItem(activeRecording.id);
      }
    }
  });

  // Synced Playback Event Handlers
  videoElement.addEventListener('play', () => {
    if (audioElement.src) {
      audioElement.currentTime = videoElement.currentTime;
      audioElement.play().catch(err => console.error('Audio sync play failed:', err));
    }
  });

  videoElement.addEventListener('pause', () => {
    if (audioElement.src) {
      audioElement.pause();
    }
  });

  videoElement.addEventListener('seeking', () => {
    if (audioElement.src) {
      audioElement.currentTime = videoElement.currentTime;
    }
  });

  videoElement.addEventListener('ratechange', () => {
    if (audioElement.src) {
      audioElement.playbackRate = videoElement.playbackRate;
    }
  });

  // Audio Mixer volume control
  volumeVideo.addEventListener('input', () => {
    videoElement.volume = volumeVideo.value;
  });

  volumeMic.addEventListener('input', () => {
    audioElement.volume = volumeMic.value;
  });

  // Download video
  btnDlVideo.addEventListener('click', () => {
    if (!activeRecording) return;
    const isMP4 = activeRecording.format === 'mp4';
    const extension = isMP4 ? '.mp4' : '.mkv';
    const name = (activeRecording.aiTitle || activeRecording.title).replace(/[^a-z0-9]/gi, '_').toLowerCase() + extension;
    triggerDownload(activeRecording.videoBlob, name);
  });

  // Download mic track
  btnDlMic.addEventListener('click', () => {
    if (!activeRecording || !activeRecording.micBlob) return;
    const name = (activeRecording.aiTitle || activeRecording.title).replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_mic.webm';
    triggerDownload(activeRecording.micBlob, name);
  });

  // Chat send
  btnSendChat.addEventListener('click', () => {
    sendChatMessage();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Listen for recording finalization to refresh automatically
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'dashboard' && message.type === 'recording-finalized') {
      await loadGallery();
      if (message.recordingId) {
        await selectRecording(message.recordingId);
      }
    }
  });
});

async function loadGallery() {
  try {
    recordings = await getAllRecordings();
    filterAndRenderGallery();
  } catch (err) {
    console.error('Error loading gallery:', err);
  }
}

function filterAndRenderGallery() {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = recordings.filter(rec => {
    const title = (rec.aiTitle || rec.title).toLowerCase();
    const pageTitle = (rec.pageTitle || '').toLowerCase();
    const url = (rec.url || '').toLowerCase();
    return title.includes(query) || pageTitle.includes(query) || url.includes(query);
  });

  renderGalleryList(filtered);
}

function renderGalleryList(list) {
  recordingsList.innerHTML = '';
  if (list.length === 0) {
    recordingsList.innerHTML = '<div class="empty-state"><p>No recordings found</p></div>';
    return;
  }

  list.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'recording-item';
    item.dataset.id = rec.id;
    if (activeRecording && activeRecording.id === rec.id) {
      item.classList.add('active');
    }

    const titleText = rec.aiTitle || rec.title;
    const dateText = new Date(rec.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div class="recording-item-header">
        <span class="recording-item-title">${escapeHTML(titleText)}</span>
      </div>
      <div class="recording-item-meta">
        <span class="recording-item-url" title="${escapeHTML(rec.url || '')}">${escapeHTML(rec.url ? new URL(rec.url).hostname : 'Local Screen')}</span>
        <span class="recording-item-duration">${formatDuration(rec.duration)}</span>
      </div>
      <div class="recording-item-meta" style="margin-top: 2px;">
        <span style="font-size: 10px; opacity: 0.8;">${dateText}</span>
        <span style="font-size: 10px; opacity: 0.8;">${formatSize(rec.size)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      selectRecording(rec.id);
    });

    recordingsList.appendChild(item);
  });
}

async function selectRecording(id) {
  try {
    const record = await getRecording(id);
    if (!record) return;

    activeRecording = record;

    // Highlight item
    highlightActiveItem(id);

    // Revoke old URLs
    if (activeVideoUrl) URL.revokeObjectURL(activeVideoUrl);
    if (activeMicUrl) URL.revokeObjectURL(activeMicUrl);

    // Setup video source
    activeVideoUrl = URL.createObjectURL(record.videoBlob);
    videoElement.src = activeVideoUrl;
    videoElement.load();

    // Setup mic audio source (if present)
    if (record.micBlob) {
      activeMicUrl = URL.createObjectURL(record.micBlob);
      audioElement.src = activeMicUrl;
      audioElement.load();
      mixerPanel.style.display = 'block';
      btnDlMic.style.display = 'inline-block';
      // Reset mixer volumes
      volumeVideo.value = 1;
      volumeMic.value = 1;
      videoElement.volume = 1;
      audioElement.volume = 1;
    } else {
      audioElement.removeAttribute('src');
      activeMicUrl = null;
      mixerPanel.style.display = 'none';
      btnDlMic.style.display = 'none';
    }

    // Set metadata texts
    videoTitle.textContent = record.aiTitle || record.title;
    metaDate.textContent = new Date(record.date).toLocaleString();
    metaDuration.textContent = formatDuration(record.duration);
    metaSize.textContent = formatSize(record.size);
    btnDlVideo.textContent = record.format === 'mkv' ? 'Download MKV Video' : 'Download MP4 Video';

    if (record.url) {
      metaUrl.style.display = 'inline-block';
      metaUrl.href = record.url;
      metaUrl.textContent = record.pageTitle || 'Visit Webpage';
    } else {
      metaUrl.style.display = 'none';
    }

    // Set AI Summary
    if (record.aiSummary) {
      aiSummaryText.textContent = record.aiSummary;
    } else {
      aiSummaryText.textContent = isOllamaOnline 
        ? "AI summary not generated. (Make sure you select a model in settings during recording)"
        : "Ollama offline. Start Ollama locally to enable summaries.";
    }

    // Enable chat inputs
    chatInput.disabled = false;
    chatInput.placeholder = "Ask Ollama about this session...";
    btnSendChat.disabled = false;

    // Render Chat Messages
    renderChat(record.chatHistory || []);

    // Show viewer
    activeViewer.style.display = 'flex';
    noActiveViewer.style.display = 'none';

  } catch (err) {
    console.error('Error selecting recording:', err);
  }
}

function resetViewer() {
  activeRecording = null;
  videoElement.pause();
  audioElement.pause();
  videoElement.removeAttribute('src');
  audioElement.removeAttribute('src');
  if (activeVideoUrl) URL.revokeObjectURL(activeVideoUrl);
  if (activeMicUrl) URL.revokeObjectURL(activeMicUrl);
  activeVideoUrl = null;
  activeMicUrl = null;

  chatInput.disabled = true;
  chatInput.placeholder = "Select a recording to begin chatting...";
  chatInput.value = '';
  btnSendChat.disabled = true;

  activeViewer.style.display = 'none';
  noActiveViewer.style.display = 'flex';
}

function highlightActiveItem(id) {
  const items = recordingsList.querySelectorAll('.recording-item');
  items.forEach(el => {
    if (el.dataset.id === id) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Do not revoke instantly because click triggers download async
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Chat rendering
function renderChat(history) {
  chatMessages.innerHTML = '';
  
  if (history.length === 0) {
    chatMessages.innerHTML = `
      <div class="system-chat-message">
        No conversation yet. Ask a question to analyze this recorded session!
      </div>
    `;
    return;
  }

  history.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `chat-msg ${msg.role}`;
    bubble.innerHTML = escapeHTML(msg.content).replace(/\n/g, '<br>');
    chatMessages.appendChild(bubble);
  });

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send chat message
async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !activeRecording) return;

  chatInput.value = '';
  
  // Append user message
  const userMsg = { role: 'user', content: text };
  const updatedHistory = await saveChatMessage(activeRecording.id, userMsg);
  renderChat(updatedHistory);

  // Check if Ollama is connected
  if (!isOllamaOnline) {
    const sysMsg = { role: 'system', content: 'Could not contact local Ollama instance. Please make sure Ollama is serving locally.' };
    await saveChatMessage(activeRecording.id, sysMsg);
    renderChat([...updatedHistory, sysMsg]);
    return;
  }

  // Show typing indicator
  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-msg assistant typing';
  typingBubble.innerHTML = `
    <div class="typing-indicator">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `;
  chatMessages.appendChild(typingBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  chatInput.disabled = true;
  btnSendChat.disabled = true;

  try {
    const model = chatModelSelect.value;
    
    // Prepare prompt with video and page context
    const contextPrompt = `You are a helpful AI assistant. You are chatting with the user about a recording they made of the following webpage:
Webpage Title: ${activeRecording.pageTitle || 'N/A'}
Webpage URL: ${activeRecording.url || 'N/A'}
Page Summary: ${activeRecording.aiSummary || 'N/A'}

Use this webpage metadata to answer the user's questions. 
Keep your answers helpful, concise, and focused on the topic of the webpage.

User Question: ${text}`;

    // Prepare message history formatted for Ollama /api/chat
    const apiMessages = [
      { role: 'system', content: `You are a helpful assistant talking about this video recording session. The webpage title was "${activeRecording.pageTitle || 'N/A'}" and URL was "${activeRecording.url || 'N/A'}". Summary: "${activeRecording.aiSummary || 'N/A'}"` }
    ];

    // Filter out previous system messages for cleanly passing history
    const historyClean = (activeRecording.chatHistory || [])
      .filter(msg => msg.role === 'user' || msg.role === 'assistant');

    apiMessages.push(...historyClean);

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: apiMessages,
        stream: false
      })
    });

    if (res.ok) {
      const data = await res.json();
      const assistantText = data.message.content;
      
      // Save assistant message
      const assistantMsg = { role: 'assistant', content: assistantText };
      const finalHistory = await saveChatMessage(activeRecording.id, assistantMsg);
      
      // Remove typing bubble and render
      typingBubble.remove();
      renderChat(finalHistory);
      
      // Refresh current activeRecording reference
      activeRecording.chatHistory = finalHistory;
    } else {
      throw new Error('Ollama chat request failed.');
    }

  } catch (err) {
    console.error('Chat error:', err);
    typingBubble.remove();
    const errMsg = { role: 'system', content: 'Error: Failed to fetch response from Ollama. (' + err.message + ')' };
    const finalHistory = await saveChatMessage(activeRecording.id, errMsg);
    renderChat(finalHistory);
  } finally {
    chatInput.disabled = false;
    btnSendChat.disabled = false;
    chatInput.focus();
  }
}

// Check Ollama connection and load models
async function checkOllama() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (res.ok) {
      const data = await res.json();
      const models = data.models || [];
      
      if (models.length > 0) {
        isOllamaOnline = true;
        ollamaStatusIndicator.className = 'ollama-badge connected';
        ollamaStatusText.textContent = 'Ollama Connected';
        
        // Populate dropdown
        chatModelSelect.innerHTML = '';
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          chatModelSelect.appendChild(opt);
        });

        // Pre-select model from options if available
        const { options } = await chrome.storage.local.get('options');
        if (options && options.selectedModel) {
          const found = models.some(m => m.name === options.selectedModel);
          if (found) {
            chatModelSelect.value = options.selectedModel;
          }
        }
      } else {
        isOllamaOnline = true;
        ollamaStatusIndicator.className = 'ollama-badge connected';
        ollamaStatusText.textContent = 'Ollama (No Models)';
      }
    } else {
      throw new Error('Ollama tag endpoint error');
    }
  } catch (err) {
    isOllamaOnline = false;
    ollamaStatusIndicator.className = 'ollama-badge disconnected';
    ollamaStatusText.textContent = 'Ollama Offline';
    chatModelSelect.innerHTML = '<option value="">No Models Available</option>';
  }
}

// Format duration Helper: (ms to MM:SS or HH:MM:SS)
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format file size Helper: (bytes to MB)
function formatSize(bytes) {
  if (bytes === 0) return '0.0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// Escape HTML Helper
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

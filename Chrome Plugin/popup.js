let currentMode = 'region';
let currentFormat = 'mp4';

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const configPanel = document.getElementById('config-panel');
  const recordingPanel = document.getElementById('recording-panel');
  
  const modeTab = document.getElementById('mode-tab');
  const modeRegion = document.getElementById('mode-region');
  const modeScreen = document.getElementById('mode-screen');
  const formatMp4 = document.getElementById('format-mp4');
  const formatMkv = document.getElementById('format-mkv');
  const qualitySelect = document.getElementById('quality-select');
  const autoResumeInput = document.getElementById('auto-resume-input');
  const micToggle = document.getElementById('mic-toggle');
  
  const ollamaStatus = document.getElementById('ollama-status');
  const modelGroup = document.getElementById('ollama-model-group');
  const modelSelect = document.getElementById('model-select');
  
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  
  const timerDisplay = document.getElementById('timer-display');
  const recStateLabel = document.getElementById('recording-state-label');
  const pauseBtnText = document.getElementById('pause-btn-text');
  const pauseSvgPath = document.getElementById('pause-svg-path');
  
  const linkDashboard = document.getElementById('link-dashboard');

  // Load stored state & options
  const data = await chrome.storage.local.get(['recordingState', 'duration', 'options']);
  const state = data.recordingState || 'idle';
  const duration = data.duration || 0;
  const savedOptions = data.options || {};

  // Restore options in inputs
  if (savedOptions.mode) {
    currentMode = savedOptions.mode;
  } else {
    currentMode = 'region';
  }
  setActiveMode(currentMode);

  if (savedOptions.format) {
    currentFormat = savedOptions.format;
  } else {
    currentFormat = 'mp4';
  }
  setActiveFormat(currentFormat);

  if (savedOptions.quality) qualitySelect.value = savedOptions.quality;
  if (savedOptions.autoResumeMin) autoResumeInput.value = savedOptions.autoResumeMin;
  if (savedOptions.mic !== undefined) micToggle.checked = savedOptions.mic;

  // Initialize UI based on recording state
  updateUIState(state, duration);

  // Check Ollama Connection
  await checkOllama(savedOptions.selectedModel);

  // Event Listeners for Mode Toggle
  modeTab.addEventListener('click', () => {
    currentMode = 'tab';
    setActiveMode('tab');
    saveOptions();
  });
  modeRegion.addEventListener('click', () => {
    currentMode = 'region';
    setActiveMode('region');
    saveOptions();
  });
  modeScreen.addEventListener('click', () => {
    currentMode = 'screen';
    setActiveMode('screen');
    saveOptions();
  });

  // Event Listeners for Format Toggle
  formatMp4.addEventListener('click', () => {
    currentFormat = 'mp4';
    setActiveFormat('mp4');
    saveOptions();
  });
  formatMkv.addEventListener('click', () => {
    currentFormat = 'mkv';
    setActiveFormat('mkv');
    saveOptions();
  });

  // Settings changes autosave
  qualitySelect.addEventListener('change', saveOptions);
  autoResumeInput.addEventListener('change', saveOptions);
  micToggle.addEventListener('change', saveOptions);
  modelSelect.addEventListener('change', saveOptions);

  // Start Recording
  btnStart.addEventListener('click', async () => {
    const options = {
      mode: currentMode,
      format: currentFormat,
      quality: qualitySelect.value,
      mic: micToggle.checked,
      autoResumeMin: parseFloat(autoResumeInput.value) || 5,
      selectedModel: modelSelect.value || ''
    };
    
    // Save to storage and send request
    await chrome.storage.local.set({ options });
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'start-recording-request',
      options
    });
    if (options.mode === 'region') {
      window.close();
    }
  });

  // Pause/Resume Recording
  btnPause.addEventListener('click', async () => {
    const { recordingState } = await chrome.storage.local.get('recordingState');
    if (recordingState === 'recording') {
      chrome.runtime.sendMessage({ target: 'background', type: 'pause-recording-request' });
    } else if (recordingState === 'paused') {
      chrome.runtime.sendMessage({ target: 'background', type: 'resume-recording-request' });
    }
  });

  // Stop Recording
  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ target: 'background', type: 'stop-recording-request' });
  });

  // Open Gallery Dashboard
  linkDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Listen for storage changes to update UI elements live (e.g. Timer)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.recordingState) {
      updateUIState(changes.recordingState.newValue, 0);
    }
    if (changes.duration && changes.duration.newValue !== undefined) {
      timerDisplay.textContent = formatDuration(changes.duration.newValue);
    }
  });

  // Helper: toggle mode styles
  function setActiveMode(mode) {
    modeTab.classList.remove('active');
    if (modeRegion) modeRegion.classList.remove('active');
    modeScreen.classList.remove('active');

    if (mode === 'tab') {
      modeTab.classList.add('active');
    } else if (mode === 'region') {
      if (modeRegion) modeRegion.classList.add('active');
    } else {
      modeScreen.classList.add('active');
    }
  }

  // Helper: toggle format styles
  function setActiveFormat(format) {
    formatMp4.classList.remove('active');
    formatMkv.classList.remove('active');

    if (format === 'mkv') {
      formatMkv.classList.add('active');
    } else {
      formatMp4.classList.add('active');
    }
  }

  // Helper: save options
  async function saveOptions() {
    const currentOptions = {
      mode: currentMode,
      format: currentFormat,
      quality: qualitySelect.value,
      mic: micToggle.checked,
      autoResumeMin: parseFloat(autoResumeInput.value) || 5,
      selectedModel: modelSelect.value || ''
    };
    await chrome.storage.local.set({ options: currentOptions });
  }

  // Helper: update whole UI panels based on state
  function updateUIState(state, durationSec) {
    if (state === 'idle' || state === 'error' || state === 'stopping') {
      configPanel.classList.add('active');
      recordingPanel.classList.remove('active');
      timerDisplay.textContent = '00:00:00';
    } else {
      configPanel.classList.remove('active');
      recordingPanel.classList.add('active');
      timerDisplay.textContent = formatDuration(durationSec);

      if (state === 'paused') {
        recStateLabel.textContent = 'Paused';
        recStateLabel.parentElement.classList.add('paused');
        pauseBtnText.textContent = 'Resume';
        // Play icon path
        pauseSvgPath.setAttribute('d', 'M8 5v14l11-7z');
      } else {
        recStateLabel.textContent = 'Recording';
        recStateLabel.parentElement.classList.remove('paused');
        pauseBtnText.textContent = 'Pause';
        // Pause icon path
        pauseSvgPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
      }
    }
  }

  // Helper: Format seconds to HH:MM:SS
  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // Helper: check local Ollama availability
  async function checkOllama(previouslySelectedModel) {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        
        if (models.length > 0) {
          ollamaStatus.classList.remove('disconnected');
          ollamaStatus.classList.add('connected');
          ollamaStatus.querySelector('.status-text').textContent = 'Ollama Connected';
          
          modelGroup.style.display = 'flex';
          modelSelect.innerHTML = '';
          
          models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            if (previouslySelectedModel === m.name) {
              opt.selected = true;
            }
            modelSelect.appendChild(opt);
          });
          
          saveOptions();
        } else {
          // Connected but no models
          ollamaStatus.classList.remove('disconnected');
          ollamaStatus.classList.add('connected');
          ollamaStatus.querySelector('.status-text').textContent = 'Ollama (No Models)';
          modelGroup.style.display = 'none';
        }
      } else {
        throw new Error('Ollama endpoint error');
      }
    } catch (err) {
      // Offline fallback
      ollamaStatus.classList.remove('connected');
      ollamaStatus.classList.add('disconnected');
      ollamaStatus.querySelector('.status-text').textContent = 'Ollama Offline';
      modelGroup.style.display = 'none';
    }
  }
});

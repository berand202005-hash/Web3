import { saveRecording } from './db.js';

let videoRecorder = null;
let micRecorder = null;

let videoChunks = [];
let micChunks = [];

let tabAudioContext = null;
let recordingStartTime = 0;
let totalPausedTime = 0;
let lastPausedTime = 0;

let activeStream = null;
let activeMicStream = null;

let currentRecordingId = null;
let currentPageContext = null;
let currentFormat = 'mp4';

let animationFrameId = null;
let canvasVideoTrack = null;
let cropVideoElement = null;
let isDrawing = false;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.type) {
    case 'start-recording':
      await startRecording(message);
      break;
    case 'pause-recording':
      pauseRecording();
      break;
    case 'resume-recording':
      resumeRecording();
      break;
    case 'stop-recording':
      await stopRecording(currentRecordingId, currentPageContext);
      break;
  }
});

async function startRecording(options) {
  currentRecordingId = options.recordingId;
  currentPageContext = options.pageContext;
  currentFormat = options.format || 'mp4';
  isDrawing = true;
  
  videoChunks = [];
  micChunks = [];
  totalPausedTime = 0;
  
  const isScreen = !!options.isScreen;
  const quality = options.quality || '720p';
  
  let width = 1280;
  let height = 720;
  let fps = 30;

  if (quality === '1080p') {
    width = 1920;
    height = 1080;
    fps = 60;
  } else if (quality === '480p') {
    width = 854;
    height = 480;
    fps = 30;
  }

  // Constraints for getUserMedia using the captured stream ID
  const baseConstraints = {
    video: {
      mandatory: {
        chromeMediaSource: isScreen ? 'desktop' : 'tab',
        chromeMediaSourceId: options.streamId,
        maxWidth: width,
        maxHeight: height,
        maxFrameRate: fps
      }
    }
  };

  const fullConstraints = {
    ...baseConstraints,
    audio: {
      mandatory: {
        chromeMediaSource: isScreen ? 'desktop' : 'tab',
        chromeMediaSourceId: options.streamId
      }
    }
  };

  try {
    // 1. Get the Tab/Screen Capture stream
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(fullConstraints);
    } catch (audioErr) {
      console.warn('Could not capture stream with audio, falling back to video-only capture:', audioErr);
      // Retry without audio if user didn't share audio (common in desktop screen capture)
      stream = await navigator.mediaDevices.getUserMedia(baseConstraints);
    }

    activeStream = stream;

    // 2. Tab Audio Routing back to speakers (Only in Tab/Region mode to avoid echo in Screen mode)
    if (!isScreen && stream.getAudioTracks().length > 0) {
      tabAudioContext = new AudioContext();
      const source = tabAudioContext.createMediaStreamSource(stream);
      source.connect(tabAudioContext.destination);
    }

    // 3. Microphone stream (if toggled)
    if (options.mic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeMicStream = micStream;

        // Start independent recording for the mic
        const micMimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        micRecorder = new MediaRecorder(micStream, { mimeType: micMimeType });
        
        micRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) micChunks.push(e.data);
        };
      } catch (micErr) {
        console.error('Microphone access denied or failed:', micErr);
        activeMicStream = null;
        micRecorder = null;
      }
    }

    // Crop rendering if region coordinates are provided
    let finalStream = stream;
    if (options.crop) {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute('playsinline', '');
      
      // Position offscreen but keep sizes to force Chromium to decode frames
      video.style.position = 'absolute';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      
      document.body.appendChild(video);
      cropVideoElement = video;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.style.width = `${video.videoWidth}px`;
          video.style.height = `${video.videoHeight}px`;
          video.play()
            .then(resolve)
            .catch(err => {
              console.error('Video element play failed in offscreen:', err);
              reject(err);
            });
        };
        video.onerror = () => reject(new Error('Video stream error'));
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const scaleX = video.videoWidth / options.crop.viewportWidth;
      const scaleY = video.videoHeight / options.crop.viewportHeight;

      const sx = options.crop.x * scaleX;
      const sy = options.crop.y * scaleY;
      const sw = options.crop.width * scaleX;
      const sh = options.crop.height * scaleY;

      canvas.width = sw;
      canvas.height = sh;

      function drawFrame() {
        if (isDrawing) {
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
          animationFrameId = requestAnimationFrame(drawFrame);
        }
      }

      animationFrameId = requestAnimationFrame(drawFrame);

      const canvasStream = canvas.captureStream(fps);
      canvasVideoTrack = canvasStream.getVideoTracks()[0];

      const mixedStream = new MediaStream();
      mixedStream.addTrack(canvasVideoTrack);
      stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

      finalStream = mixedStream;
    }

    // 4. Initialize Video Recorder based on selected format
    let videoMimeType = '';
    if (currentFormat === 'mp4') {
      videoMimeType = 'video/mp4;codecs=avc1.424028,mp4a.40.2';
      if (!MediaRecorder.isTypeSupported(videoMimeType)) {
        videoMimeType = 'video/mp4;codecs=avc1.64003E,opus';
        if (!MediaRecorder.isTypeSupported(videoMimeType)) {
          videoMimeType = 'video/mp4';
          if (!MediaRecorder.isTypeSupported(videoMimeType)) {
            // Fallback to MKV/WebM if MP4 is completely unsupported
            videoMimeType = 'video/x-matroska';
            if (!MediaRecorder.isTypeSupported(videoMimeType)) {
              videoMimeType = 'video/webm';
            }
          }
        }
      }
    } else {
      videoMimeType = 'video/x-matroska';
      if (!MediaRecorder.isTypeSupported(videoMimeType)) {
        videoMimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(videoMimeType)) {
          videoMimeType = 'video/webm';
        }
      }
    }

    videoRecorder = new MediaRecorder(finalStream, { mimeType: videoMimeType });
    videoRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunks.push(e.data);
    };

    // 5. Start Recorders
    recordingStartTime = Date.now();
    videoRecorder.start(1000);
    if (micRecorder) {
      micRecorder.start(1000);
    }

    // Notify background that recording has successfully started
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'offscreen-recording-started'
    });

  } catch (err) {
    console.error('Failed to initialize recording in offscreen document:', err);
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'offscreen-error',
      error: err.message
    });
  }
}

function pauseRecording() {
  if (videoRecorder && videoRecorder.state === 'recording') {
    videoRecorder.pause();
    lastPausedTime = Date.now();
  }
  if (micRecorder && micRecorder.state === 'recording') {
    micRecorder.pause();
  }
}

function resumeRecording() {
  if (videoRecorder && videoRecorder.state === 'paused') {
    videoRecorder.resume();
    totalPausedTime += (Date.now() - lastPausedTime);
  }
  if (micRecorder && micRecorder.state === 'paused') {
    micRecorder.resume();
  }
}

async function stopRecording(recordingId, pageContext) {
  isDrawing = false;
  return new Promise((resolve) => {
    let videoStopped = false;
    let micStopped = !micRecorder;

    const checkAndSave = async () => {
      if (videoStopped && micStopped) {
        const recordingEndTime = Date.now();
        const duration = (recordingEndTime - recordingStartTime) - totalPausedTime;

        // Build blobs
        const videoBlob = new Blob(videoChunks, { type: videoRecorder.mimeType || 'video/x-matroska' });
        const micBlob = micChunks.length > 0 ? new Blob(micChunks, { type: micRecorder.mimeType || 'audio/webm' }) : null;

        // Cleanup tracks
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }
        if (activeMicStream) {
          activeMicStream.getTracks().forEach(track => track.stop());
        }
        if (canvasVideoTrack) {
          canvasVideoTrack.stop();
          canvasVideoTrack = null;
        }
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        if (cropVideoElement) {
          cropVideoElement.pause();
          cropVideoElement.srcObject = null;
          cropVideoElement.remove();
          cropVideoElement = null;
        }
        if (tabAudioContext) {
          tabAudioContext.close();
          tabAudioContext = null;
        }

        // Save to IndexedDB
        try {
          const timestamp = new Date();
          const record = {
            id: recordingId,
            videoBlob,
            micBlob,
            title: `Recording - ${timestamp.toLocaleString()}`,
            date: timestamp.toISOString(),
            duration: Math.max(1000, duration), // Minimum 1 second duration
            size: videoBlob.size + (micBlob ? micBlob.size : 0),
            url: pageContext.url,
            pageTitle: pageContext.title,
            aiTitle: null,
            aiSummary: null,
            format: currentFormat,
            chatHistory: []
          };

          await saveRecording(record);

          chrome.runtime.sendMessage({
            target: 'background',
            type: 'offscreen-recording-saved',
            recordingId,
            pageContext
          });
          resolve();
        } catch (err) {
          console.error('Error saving recording to IndexedDB:', err);
          chrome.runtime.sendMessage({
            target: 'background',
            type: 'offscreen-error',
            error: 'Database save failed: ' + err.message
          });
          resolve();
        }
      }
    };

    videoRecorder.onstop = () => {
      videoStopped = true;
      checkAndSave();
    };

    if (micRecorder) {
      micRecorder.onstop = () => {
        micStopped = true;
        checkAndSave();
      };
      micRecorder.stop();
    }

    videoRecorder.stop();
  });
}

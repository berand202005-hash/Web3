(function() {
  // Prevent duplicate overlays
  if (document.getElementById('streamrec-select-overlay')) return;

  // Create CSS style block
  const style = document.createElement('style');
  style.id = 'streamrec-select-styles';
  style.textContent = `
    #streamrec-select-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.4);
      z-index: 999999999;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
    }
    #streamrec-select-box {
      position: absolute;
      border: 2px solid #00e5ff;
      background: transparent;
      pointer-events: auto; /* Allow handle dragging and inside dragging */
      box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.5); /* Glowing selection cutout */
      display: none;
      box-sizing: border-box;
    }
    
    /* Bounding Box resize handles */
    .streamrec-handle {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #00e5ff;
      border: 1px solid #08090c;
      border-radius: 50%;
      z-index: 1000000002;
    }
    .streamrec-handle.tl { top: -5px; left: -5px; cursor: nwse-resize; }
    .streamrec-handle.tc { top: -5px; left: calc(50% - 5px); cursor: ns-resize; }
    .streamrec-handle.tr { top: -5px; right: -5px; cursor: nesw-resize; }
    .streamrec-handle.ml { top: calc(50% - 5px); left: -5px; cursor: ew-resize; }
    .streamrec-handle.mr { top: calc(50% - 5px); right: -5px; cursor: ew-resize; }
    .streamrec-handle.bl { bottom: -5px; left: -5px; cursor: nesw-resize; }
    .streamrec-handle.bc { bottom: -5px; left: calc(50% - 5px); cursor: ns-resize; }
    .streamrec-handle.br { bottom: -5px; right: -5px; cursor: nwse-resize; }

    #streamrec-select-toolbar {
      position: absolute;
      background: #12141a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 8px 12px;
      display: none;
      gap: 8px;
      z-index: 1000000000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      align-items: center;
      pointer-events: auto;
    }
    .streamrec-btn {
      background: #ff334b;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 2px 6px rgba(255, 51, 75, 0.3);
      transition: all 0.2s;
    }
    .streamrec-btn:hover {
      background: #ff4d61;
      transform: translateY(-1px);
    }
    .streamrec-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #f5f6f9;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: none;
    }
    .streamrec-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .streamrec-dims {
      color: #8a8f9d;
      font-size: 11px;
      font-family: sans-serif;
      margin-right: 8px;
      font-variant-numeric: tabular-nums;
    }
  `;
  document.head.appendChild(style);

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'streamrec-select-overlay';

  // Create selection box with resize handles
  const selectBox = document.createElement('div');
  selectBox.id = 'streamrec-select-box';
  selectBox.innerHTML = `
    <div class="streamrec-handle tl" data-handle="tl"></div>
    <div class="streamrec-handle tc" data-handle="tc"></div>
    <div class="streamrec-handle tr" data-handle="tr"></div>
    <div class="streamrec-handle ml" data-handle="ml"></div>
    <div class="streamrec-handle mr" data-handle="mr"></div>
    <div class="streamrec-handle bl" data-handle="bl"></div>
    <div class="streamrec-handle bc" data-handle="bc"></div>
    <div class="streamrec-handle br" data-handle="br"></div>
  `;
  overlay.appendChild(selectBox);

  // Create selection toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'streamrec-select-toolbar';
  toolbar.innerHTML = `
    <span id="streamrec-dims" class="streamrec-dims">0 x 0</span>
    <button id="streamrec-btn-confirm" class="streamrec-btn">Record Region</button>
    <button id="streamrec-btn-cancel" class="streamrec-btn streamrec-btn-secondary">Cancel</button>
  `;
  overlay.appendChild(toolbar);
  document.body.appendChild(overlay);

  // Tracking state
  let isDragging = false;
  let isResizing = false;
  let activeHandle = null;
  let startX = 0;
  let startY = 0;
  let cropData = null;
  let initialRect = null;

  overlay.addEventListener('mousedown', (e) => {
    // Check if clicked a resize handle
    const handleEl = e.target.closest('.streamrec-handle');
    if (handleEl) {
      e.stopPropagation();
      isResizing = true;
      activeHandle = handleEl.dataset.handle;
      initialRect = {
        left: parseFloat(selectBox.style.left) || 0,
        top: parseFloat(selectBox.style.top) || 0,
        width: parseFloat(selectBox.style.width) || 0,
        height: parseFloat(selectBox.style.height) || 0,
        right: (parseFloat(selectBox.style.left) || 0) + (parseFloat(selectBox.style.width) || 0),
        bottom: (parseFloat(selectBox.style.top) || 0) + (parseFloat(selectBox.style.height) || 0)
      };
      toolbar.style.display = 'none';
      return;
    }

    // Ignore if click is inside toolbar
    if (e.target.closest('#streamrec-select-toolbar')) return;

    // Standard drag-creation
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectBox.style.left = `${startX}px`;
    selectBox.style.top = `${startY}px`;
    selectBox.style.width = '0px';
    selectBox.style.height = '0px';
    selectBox.style.display = 'block';

    toolbar.style.display = 'none';
  });

  overlay.addEventListener('mousemove', (e) => {
    const currentX = e.clientX;
    const currentY = e.clientY;

    if (isDragging) {
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(startX - currentX);
      const height = Math.abs(startY - currentY);

      selectBox.style.left = `${left}px`;
      selectBox.style.top = `${top}px`;
      selectBox.style.width = `${width}px`;
      selectBox.style.height = `${height}px`;

      cropData = { x: left, y: top, width, height };
      document.getElementById('streamrec-dims').textContent = `${width} x ${height}px`;
    } else if (isResizing && initialRect && activeHandle) {
      let boxX = initialRect.left;
      let boxY = initialRect.top;
      let boxW = initialRect.width;
      let boxH = initialRect.height;

      // Handle horizontal resize
      if (activeHandle.includes('l')) {
        const newX = Math.max(0, Math.min(currentX, initialRect.right - 20));
        boxW = initialRect.right - newX;
        boxX = newX;
      } else if (activeHandle.includes('r')) {
        boxW = Math.max(20, Math.min(currentX - initialRect.left, window.innerWidth - initialRect.left));
      }

      // Handle vertical resize
      if (activeHandle.includes('t')) {
        const newY = Math.max(0, Math.min(currentY, initialRect.bottom - 20));
        boxH = initialRect.bottom - newY;
        boxY = newY;
      } else if (activeHandle.includes('b')) {
        boxH = Math.max(20, Math.min(currentY - initialRect.top, window.innerHeight - initialRect.top));
      }

      selectBox.style.left = `${boxX}px`;
      selectBox.style.top = `${boxY}px`;
      selectBox.style.width = `${boxW}px`;
      selectBox.style.height = `${boxH}px`;

      cropData = { x: boxX, y: boxY, width: boxW, height: boxH };
      document.getElementById('streamrec-dims').textContent = `${boxW} x ${boxH}px`;
    }
  });

  overlay.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      finishDragging();
    } else if (isResizing) {
      isResizing = false;
      activeHandle = null;
      initialRect = null;
      finishDragging();
    }
  });

  function finishDragging() {
    if (!cropData || cropData.width < 20 || cropData.height < 20) {
      selectBox.style.display = 'none';
      toolbar.style.display = 'none';
      cropData = null;
      return;
    }

    // Position the toolbar below or inside
    positionToolbar(cropData);
  }

  function positionToolbar(crop) {
    const toolbarLeft = Math.max(10, crop.x + (crop.width - toolbar.offsetWidth) / 2);
    let toolbarTop = crop.y + crop.height + 12;
    if (toolbarTop + 50 > window.innerHeight) {
      toolbarTop = Math.max(10, crop.y - toolbar.offsetHeight - 12);
    }

    toolbar.style.left = `${toolbarLeft}px`;
    toolbar.style.top = `${toolbarTop}px`;
    toolbar.style.display = 'flex';
  }

  // Action buttons
  document.getElementById('streamrec-btn-confirm').addEventListener('click', () => {
    if (cropData) {
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'region-selection-confirmed',
        crop: {
          x: cropData.x,
          y: cropData.y,
          width: cropData.width,
          height: cropData.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        }
      });
      cleanup();
    }
  });

  document.getElementById('streamrec-btn-cancel').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'region-selection-cancelled'
    });
    cleanup();
  });

  function cleanup() {
    const overlayEl = document.getElementById('streamrec-select-overlay');
    if (overlayEl) overlayEl.remove();
    const styleEl = document.getElementById('streamrec-select-styles');
    if (styleEl) styleEl.remove();
  }
})();

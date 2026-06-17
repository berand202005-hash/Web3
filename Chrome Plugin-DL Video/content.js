(function() {
  const videoUrls = new Map(); // Use Map to prevent duplicates while retaining source info

  // Helper to extract file extension and basic name
  function getFileInfo(urlStr) {
    try {
      const url = new URL(urlStr);
      let pathname = url.pathname;
      
      // Get the last segment of the path
      let filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'video';
      
      // Decode URL encoding
      filename = decodeURIComponent(filename);
      
      // Clean up filename: keep only safe characters (alphanumeric, spaces, dots, dashes, underscores)
      filename = filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
      
      // Extract extension
      const extMatch = filename.match(/\.([a-z0-9]+)$/i);
      let ext = extMatch ? extMatch[1].toLowerCase() : '';
      
      // List of common video extensions
      const streamingExtensions = ['m3u8', 'mpd'];
      const commonExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v', 'ts', '3gp', ...streamingExtensions];
      
      if (!ext || !commonExtensions.includes(ext)) {
        // Default to mp4 if no valid video extension is found
        ext = 'mp4';
      }
      
      // Ensure the filename ends with the extension
      if (!filename.toLowerCase().endsWith('.' + ext)) {
        filename = `${filename}.${ext}`;
      }
      
      const isStream = streamingExtensions.includes(ext);
      
      return { filename, ext, isStream };
    } catch (e) {
      return { filename: 'video.mp4', ext: 'mp4', isStream: false };
    }
  }

  function sanitizeFilename(name, ext) {
    let cleanName = decodeURIComponent(name);
    
    // Strip the extension if the name already ends with it
    const extRegex = new RegExp(`\\.${ext}$`, 'i');
    cleanName = cleanName.replace(extRegex, '');
    
    // Keep only safe characters: letters, numbers, spaces, dots, dashes, underscores
    cleanName = cleanName.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
    
    // Trim spaces and leading/trailing dots
    cleanName = cleanName.trim().replace(/^\.+|\.+$/g, '');
    
    if (!cleanName) {
      cleanName = 'video';
    }
    
    return `${cleanName}.${ext}`;
  }

  // 1. Scan for <video> elements
  const videos = document.querySelectorAll('video');
  videos.forEach((video, index) => {
    let sources = [];
    if (video.src) {
      sources.push({ url: video.src, source: 'Video tag src' });
    }
    if (video.currentSrc) {
      sources.push({ url: video.currentSrc, source: 'Video currentSrc' });
    }
    
    // Scan child <source> elements
    const sourceElements = video.querySelectorAll('source');
    sourceElements.forEach(srcEl => {
      if (srcEl.src) {
        sources.push({ url: srcEl.src, source: 'Source element' });
      }
    });

    sources.forEach(src => {
      if (src.url && src.url.startsWith('http')) {
        const absoluteUrl = new URL(src.url, document.baseURI).href;
        const { filename: urlFilename, ext, isStream } = getFileInfo(absoluteUrl);
        
        // Use a descriptive name if available
        let displayName = video.title || video.getAttribute('aria-label') || urlFilename;
        if (!displayName || displayName === 'video') {
          displayName = `Embedded Video ${index + 1}`;
        }

        const finalFilename = sanitizeFilename(displayName, ext);

        videoUrls.set(absoluteUrl, {
          url: absoluteUrl,
          name: displayName,
          filename: finalFilename,
          type: ext,
          source: src.source,
          isStream: isStream
        });
      }
    });
  });

  // 2. Scan for links to video files
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v'];
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    const href = link.href;
    if (href && href.startsWith('http')) {
      const absoluteUrl = new URL(href, document.baseURI).href;
      const { filename: urlFilename, ext, isStream } = getFileInfo(absoluteUrl);
      if (videoExtensions.includes(ext)) {
        const displayName = link.textContent.trim() || urlFilename;
        const finalFilename = sanitizeFilename(displayName, ext);
        videoUrls.set(absoluteUrl, {
          url: absoluteUrl,
          name: displayName,
          filename: finalFilename,
          type: ext,
          source: 'Link anchor',
          isStream: isStream
        });
      }
    }
  });

  // Convert map to array of values
  return Array.from(videoUrls.values());
})();

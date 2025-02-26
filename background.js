// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  createContextMenuItems();
});

// Create context menu items
function createContextMenuItems() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'convertWebP',
      title: 'Convert to JPG',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'convertPNG',
      title: 'Convert to PNG',
      contexts: ['image']
    });
  });
}

// Track downloads to prevent duplicates and manage state
const downloadStates = new Map();

// Track connected ports
const connectedPorts = new Set();

// Handle port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    connectedPorts.add(port);
    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  }
});

// Clean up download states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of downloadStates.entries()) {
    if (now - state.timestamp > 300000) { // 5 minutes timeout
      downloadStates.delete(key);
    }
  }
}, 60000); // Check every minute

// Safe message sending function
function safeNotifyPopup(message) {
  for (const port of connectedPorts) {
    try {
      port.postMessage(message);
    } catch (error) {
      console.warn('Failed to send message to popup:', error);
      connectedPorts.delete(port);
    }
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'convertWebP' || info.menuItemId === 'convertPNG') {
    const format = info.menuItemId === 'convertWebP' ? 'jpg' : 'png';
    await handleManualConversion(info.srcUrl, format);
  }
});

// Handle manual conversion
async function handleManualConversion(url, format) {
  try {
    // Fetch and convert the image
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const blob = await response.blob();
    if (!blob) throw new Error('Failed to get image blob');

    // Convert the image
    const convertedBlob = await convertImage(blob, format);
    if (!convertedBlob) throw new Error('Conversion failed');

    // Generate safe filename
    const filename = generateSafeFilename(url, format);

    // Create data URL for download
    const dataUrl = await blobToDataURL(convertedBlob);

    // Start download
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (!downloadId) {
        console.error('Download failed:', chrome.runtime.lastError);
        return;
      }
      // Add to recent conversions
      addToRecentConversions(url, filename).catch(console.error);
    });
  } catch (error) {
    console.error('Manual conversion failed:', error);
  }
}

// Handle download interception
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Check if this is a WebP image
  const isWebP = isWebPImage(downloadItem);
  if (!isWebP) {
    suggest();
    return;
  }

  // Get auto-convert settings
  chrome.storage.sync.get(['autoConvert', 'preferredFormat'], async (result) => {
    const autoConvert = result.autoConvert || false;
    const format = result.preferredFormat || 'jpg';

    if (!autoConvert) {
      suggest();
      return;
    }

    // Prevent duplicate processing
    const downloadKey = getDownloadKey(downloadItem);
    if (downloadStates.has(downloadKey)) {
      suggest();
      return;
    }

    try {
      // Mark download as in progress
      downloadStates.set(downloadKey, {
        timestamp: Date.now(),
        status: 'processing'
      });

      // Generate filename first
      const filename = generateSafeFilename(downloadItem.url, format);
      if (!filename) {
        throw new Error('Invalid filename');
      }

      // Cancel original download
      suggest({ cancel: true });

      // Fetch and convert the image
      const response = await fetch(downloadItem.url);
      if (!response.ok) throw new Error('Failed to fetch image');
      
      const blob = await response.blob();
      if (!blob) throw new Error('Failed to get image blob');

      // Convert the image
      const convertedBlob = await convertImage(blob, format);
      if (!convertedBlob) throw new Error('Conversion failed');

      // Create data URL for download
      const dataUrl = await blobToDataURL(convertedBlob);

      // Start new download
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (!downloadId) {
          console.error('Download failed:', chrome.runtime.lastError);
          cleanupDownload(downloadKey);
          return;
        }

        // Track the new download
        downloadStates.set(downloadKey, {
          timestamp: Date.now(),
          status: 'downloading',
          downloadId: downloadId,
          originalUrl: downloadItem.url,
          newFilename: filename
        });

        // Add to recent conversions
        addToRecentConversions(downloadItem.url, filename).catch(console.error);
      });

    } catch (error) {
      console.error('Auto-conversion failed:', error);
      cleanupDownload(downloadKey);
      suggest(); // Fallback to original download
    }
  });

  return true;
});

// Helper functions
function isWebPImage(downloadItem) {
  const url = downloadItem.url.toLowerCase();
  const mime = downloadItem.mime?.toLowerCase() || '';
  return url.includes('.webp') || 
         mime.includes('image/webp') || 
         url.includes('format=webp');
}

function getDownloadKey(downloadItem) {
  return `${downloadItem.url}_${downloadItem.id}`;
}

function cleanupDownload(downloadKey) {
  downloadStates.delete(downloadKey);
}

async function convertImage(blob, format) {
  try {
    // Create canvas and load image
    const img = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw and convert
    ctx.drawImage(img, 0, 0);
    return await canvas.convertToBlob({
      type: format === 'jpg' ? 'image/jpeg' : 'image/png',
      quality: 0.9
    });
  } catch (error) {
    console.error('Image conversion error:', error);
    return null;
  }
}

function generateSafeFilename(url, format) {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.pathname.split('/').pop() || 'image';
    
    // Remove query parameters and extension
    filename = filename.split('?')[0].replace(/\.[^/.]+$/, '');
    
    // Clean up filename
    filename = filename.replace(/[^a-zA-Z0-9-_]/g, '_')
                      .replace(/_+/g, '_')
                      .substring(0, 200);
    
    // Ensure we have a valid filename
    if (!filename || filename.trim().length === 0) {
      filename = `image_${Date.now()}`;
    }
    
    return `${filename}.${format}`;
  } catch (error) {
    return `image_${Date.now()}.${format}`;
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

// Handle download state cleanup
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  
  for (const [key, state] of downloadStates.entries()) {
    if (state.downloadId === delta.id) {
      cleanupDownload(key);
      break;
    }
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.autoConvert) {
    const isEnabled = changes.autoConvert.newValue;
    if (isEnabled) {
      chrome.contextMenus.removeAll();
    } else {
      createContextMenuItems();
    }
  }
});

// Store recent conversions
async function addToRecentConversions(originalUrl, convertedFilename) {
  try {
    const { recentConversions = [] } = await chrome.storage.local.get('recentConversions');
    
    recentConversions.unshift({
      originalUrl,
      convertedFilename,
      timestamp: Date.now()
    });

    // Keep only last 10 conversions
    while (recentConversions.length > 10) {
      recentConversions.pop();
    }

    await chrome.storage.local.set({ recentConversions });
    
    // Notify popup using the safe message sending function
    safeNotifyPopup({
      action: 'updateRecentConversions',
      recentConversions
    });
  } catch (error) {
    console.error('Error storing conversion:', error);
  }
} 
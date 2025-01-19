// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'convertWebP',
    title: 'Convert to JPG',
    contexts: ['image']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'convertWebP') {
    // Check if the image is WebP or has WebP content
    const isWebP = info.srcUrl.toLowerCase().includes('.webp') || 
                   info.srcUrl.toLowerCase().includes('image/webp') ||
                   info.srcUrl.toLowerCase().includes('format=webp');
                   
    if (isWebP) {
      try {
        // Inject content scripts if they haven't been injected yet
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['node_modules/image-conversion/build/conversion.js', 'converter.js']
        });

        // Send message to content script to convert
        chrome.tabs.sendMessage(tab.id, {
          action: 'convert',
          imageUrl: info.srcUrl
        });
      } catch (error) {
        console.error('Script injection error:', error);
      }
    } else {
      try {
        // Inject content scripts for error message
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['converter.js']
        });

        // Show error for non-WebP images
        chrome.tabs.sendMessage(tab.id, {
          action: 'showError',
          message: 'This is not a WebP image'
        });
      } catch (error) {
        console.error('Script injection error:', error);
      }
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'convertWebP') {
    chrome.tabs.sendMessage(sender.tab.id, {
      action: 'convert',
      imageUrl: request.imageUrl
    }, (response) => {
      sendResponse(response);
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'updateAutoConvert') {
    chrome.storage.sync.set({ autoConvert: request.enabled }, () => {
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'downloadConverted') {
    // Handle the converted image data
    const originalFilename = getFilenameFromUrl(request.originalUrl);
    const filename = generateJpgFilename(originalFilename);
    
    // Create a download from the blob URL
    chrome.downloads.download({
      url: request.convertedImage,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (downloadId) {
        // Add to recent conversions after successful download
        addToRecentConversions(request.originalUrl, filename)
          .then(() => sendResponse({ success: true, downloadId }))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } else {
        // Handle download error
        const error = chrome.runtime.lastError;
        console.error('Download failed:', error);
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'showError',
          message: 'Download failed. Please try again.'
        });
        sendResponse({ success: false, error: error?.message || 'Download failed' });
      }
    });
    return true; // Will respond asynchronously
  }
  return false; // No response needed for other messages
});

// Extract filename from URL
function getFilenameFromUrl(url) {
  try {
    // First try to get filename from URL path
    const urlObj = new URL(url);
    let filename = urlObj.pathname.split('/').pop();
    
    // Remove query parameters if present
    filename = filename.split('?')[0];
    
    // Remove .webp extension if present
    filename = filename.replace(/\.webp$/i, '');
    
    // If filename is empty or invalid, generate a timestamp-based name
    if (!filename || filename.length < 1) {
      filename = generateTimestampFilename();
    }
    
    // Clean the filename of invalid characters
    filename = sanitizeFilename(filename);
    
    return filename;
  } catch (e) {
    // Fallback to timestamp if URL parsing fails
    return generateTimestampFilename();
  }
}

// Generate a timestamp-based filename
function generateTimestampFilename() {
  const date = new Date();
  return `image_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
}

// Clean filename of invalid characters
function sanitizeFilename(filename) {
  // Remove invalid characters
  let cleaned = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  // Limit length to 255 characters
  cleaned = cleaned.substring(0, 255);
  // Ensure it's not empty
  return cleaned || 'image';
}

// Generate final JPG filename
function generateJpgFilename(baseFilename) {
  return `${baseFilename}.jpg`;
}

// Store recent conversion
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
    
    // Notify popup to update UI
    chrome.runtime.sendMessage({
      action: 'updateRecentConversions',
      recentConversions
    });
  } catch (error) {
    console.error('Error storing conversion:', error);
  }
} 
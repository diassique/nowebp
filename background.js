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
    chrome.contextMenus.create({
      id: 'separator',
      type: 'separator',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      id: 'batchConvert',
      title: '🔥 Convert All WebP Images (PRO)',
      contexts: ['image']
    });
  });
}

// Track conversions in progress
const conversionInProgress = new Set();

// Show conversion status in content script
async function showConversionStatus(tabId, status, isError = false, isPro = false) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (status, isError, isPro) => {
        const div = document.createElement('div');
        div.style.cssText = `
          position: fixed;
          top: 16px;
          right: 16px;
          background: ${isError ? 'rgba(239, 68, 68, 0.9)' : isPro ? 'rgba(79, 70, 229, 0.9)' : 'rgba(34, 197, 94, 0.9)'};
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 14px;
          z-index: 2147483647;
          transition: opacity 0.3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        div.textContent = status;
        document.body.appendChild(div);
        setTimeout(() => {
          div.style.opacity = '0';
          setTimeout(() => div.remove(), 300);
        }, 2000);
      },
      args: [status, isError, isPro]
    });
  } catch (error) {
    console.warn('Failed to show conversion status:', error);
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'convertWebP' || info.menuItemId === 'convertPNG') {
    const format = info.menuItemId === 'convertWebP' ? 'jpg' : 'png';
    await handleConversion(info.srcUrl, format, tab.id);
  } else if (info.menuItemId === 'batchConvert') {
    await handleBatchConversion(tab.id);
  }
});

// Handle batch conversion
async function handleBatchConversion(tabId) {
  try {
    // Show PRO feature message
    await showConversionStatus(tabId, '✨ Upgrade to PRO to unlock batch conversion!', false, true);
    
    // Execute content script to find all WebP images
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const images = Array.from(document.querySelectorAll('img'));
        return images
          .filter(img => {
            const src = img.src.toLowerCase();
            return src.includes('.webp') || src.includes('format=webp');
          })
          .map(img => ({
            url: img.src,
            alt: img.alt || 'image'
          }));
      }
    });

    const webpImages = results[0].result;
    if (webpImages.length === 0) {
      await showConversionStatus(tabId, 'No WebP images found on this page', true);
      return;
    }

    // Show how many images were found
    await showConversionStatus(tabId, `Found ${webpImages.length} WebP images! Upgrade to convert all at once.`, false, true);
  } catch (error) {
    console.error('Batch conversion failed:', error);
    await showConversionStatus(tabId, 'Failed to scan for WebP images', true);
  }
}

// Handle single conversion
async function handleConversion(url, format, tabId) {
  // Prevent duplicate conversions
  if (conversionInProgress.has(url)) {
    return;
  }

  try {
    conversionInProgress.add(url);
    
    // Show converting status
    await showConversionStatus(tabId, 'Converting...');

    // Fetch and convert the image
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const blob = await response.blob();
    if (!blob) throw new Error('Failed to get image blob');

    // Convert the image
    const convertedBlob = await convertImage(blob, format);
    if (!convertedBlob) throw new Error('Conversion failed');

    // Generate filename
    let filename = decodeURIComponent(url.split('/').pop() || '');
    filename = filename.replace(/\.webp$/i, '').replace(/[^\w\s\-\.]/g, '_');
    if (!filename || filename.trim().length === 0) {
      filename = `image_${Date.now()}`;
    }
    filename = `${filename}.${format}`;

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
        showConversionStatus(tabId, 'Conversion failed', true);
        return;
      }
      // Show success message
      showConversionStatus(tabId, 'Conversion successful!');
    });
  } catch (error) {
    console.error('Conversion failed:', error);
    showConversionStatus(tabId, 'Conversion failed', true);
  } finally {
    conversionInProgress.delete(url);
  }
}

// Helper functions
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

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
} 
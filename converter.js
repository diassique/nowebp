// Show status message
function showStatus(message, isError = false) {
  const status = document.createElement('div');
  status.className = 'webp-conversion-status';
  status.textContent = message;
  status.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: ${isError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(79, 70, 229, 0.9)'};
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(status);
  return status;
}

// Track conversions in progress
const conversionsInProgress = new Set();

// Convert image function
async function convertImage(imageUrl, filename, format = 'jpg') {
  // Prevent multiple conversions of the same image
  if (conversionsInProgress.has(imageUrl)) {
    return;
  }
  
  conversionsInProgress.add(imageUrl);
  const status = showStatus('Converting...');

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // Convert using image-conversion library
    const convertedBlob = await imageConversion.compress(blob, {
      quality: 0.9,
      type: format === 'jpg' ? 'image/jpeg' : 'image/png'
    });

    // Create a new blob with explicit type
    const newBlob = new Blob([convertedBlob], { 
      type: format === 'jpg' ? 'image/jpeg' : 'image/png' 
    });
    
    // Create blob URL for download
    const blobUrl = URL.createObjectURL(newBlob);

    // Ensure filename has correct extension
    const finalFilename = filename ? filename : `converted.${format}`;
    const properFilename = finalFilename.toLowerCase().endsWith(`.${format}`) ? 
      finalFilename : finalFilename.replace(/\.[^/.]+$/, '') + `.${format}`;

    // Send to background script with filename
    chrome.runtime.sendMessage({
      action: 'downloadConverted',
      convertedImage: blobUrl,
      originalUrl: imageUrl,
      filename: properFilename
    });

    // Update status
    status.textContent = 'Converted! Choose where to save.';
    status.style.background = 'rgba(34, 197, 94, 0.9)';
    setTimeout(() => {
      status.remove();
      URL.revokeObjectURL(blobUrl); // Clean up blob URL
    }, 3000);

  } catch (error) {
    console.error('Conversion error:', error);
    status.textContent = 'Conversion failed. Please try again.';
    status.style.background = 'rgba(239, 68, 68, 0.9)';
    setTimeout(() => status.remove(), 3000);
  } finally {
    // Clean up tracking
    setTimeout(() => {
      conversionsInProgress.delete(imageUrl);
    }, 1000); // Small delay to prevent immediate retries
  }
}

// Listen for conversion requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'convert') {
    // Prevent duplicate conversion requests
    if (conversionsInProgress.has(request.imageUrl)) {
      sendResponse({ success: false, error: 'Conversion already in progress' });
      return false;
    }
    
    convertImage(request.imageUrl, request.filename, request.format)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  } else if (request.action === 'showError') {
    const status = showStatus(request.message, true);
    setTimeout(() => status.remove(), 3000);
    sendResponse({ success: true });
    return false; // Already responded synchronously
  }
}); 
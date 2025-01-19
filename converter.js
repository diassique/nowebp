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

// Convert image function
async function convertImage(imageUrl) {
  const status = showStatus('Converting...');

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // Convert using image-conversion library
    const convertedBlob = await imageConversion.compress(blob, {
      quality: 0.9,
      type: 'image/jpeg'
    });

    // Create blob URL for download
    const blobUrl = URL.createObjectURL(convertedBlob);

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'downloadConverted',
      convertedImage: blobUrl,
      originalUrl: imageUrl
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
  }
}

// Listen for conversion requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'convert') {
    convertImage(request.imageUrl)
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
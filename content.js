// Listen for auto-convert setting changes
let autoConvertEnabled = false;

// Initialize storage handling
async function initializeStorage() {
    try {
        if (!chrome.storage) {
            console.error('Chrome storage API not available');
            return;
        }

        const result = await chrome.storage.sync.get(['autoConvert']);
        autoConvertEnabled = result.autoConvert || false;

        if (autoConvertEnabled) {
            processExistingWebPImages();
        }
    } catch (error) {
        console.error('Error initializing storage:', error);
    }
}

// Initialize on load
initializeStorage();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.autoConvert) {
        autoConvertEnabled = changes.autoConvert.newValue;
        if (autoConvertEnabled) {
            processExistingWebPImages();
        }
    }
});

// Process all WebP images on the page
function processExistingWebPImages() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        if (isWebPImage(img.src)) {
            handleWebPImage(img);
        }
    });
}

// Check if URL is a WebP image
function isWebPImage(url) {
    return url.toLowerCase().includes('.webp');
}

// Handle WebP image conversion
function handleWebPImage(img) {
    // Add click listener if not already added
    if (!img.dataset.webpHandled) {
        img.dataset.webpHandled = 'true';
        img.addEventListener('click', async (e) => {
            if (e.ctrlKey || e.metaKey) return; // Allow normal click behavior with modifier keys
            
            e.preventDefault();
            e.stopPropagation();

            try {
                // Send message to background script to convert image
                const response = await chrome.runtime.sendMessage({
                    action: 'convertWebP',
                    imageUrl: img.src
                });
                
                if (!response?.success) {
                    console.error('Conversion failed:', response?.error);
                }
            } catch (error) {
                console.error('Error sending message:', error);
            }
        });

        // Add visual indicator
        addConversionIndicator(img);
    }

    // Auto-convert if enabled
    if (autoConvertEnabled) {
        chrome.runtime.sendMessage({
            action: 'convertWebP',
            imageUrl: img.src
        }).catch(error => {
            console.error('Auto-conversion failed:', error);
        });
    }
}

// Add visual indicator for convertible images
function addConversionIndicator(img) {
    const indicator = document.createElement('div');
    indicator.className = 'webp-convert-indicator';
    indicator.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(79, 70, 229, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.2s;
    `;
    indicator.textContent = 'Click to Convert';

    // Position the indicator
    const imgRect = img.getBoundingClientRect();
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        margin: 0;
        padding: 0;
        width: ${img.width}px;
        height: ${img.height}px;
    `;

    // Replace img with wrapper
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    wrapper.appendChild(indicator);

    // Show indicator on hover
    wrapper.addEventListener('mouseenter', () => {
        indicator.style.opacity = '1';
    });
    wrapper.addEventListener('mouseleave', () => {
        indicator.style.opacity = '0';
    });
}

// Watch for dynamically added images
const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'IMG' && isWebPImage(node.src)) {
                handleWebPImage(node);
            }
        });
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Process existing images on page load
document.addEventListener('DOMContentLoaded', processExistingWebPImages); 
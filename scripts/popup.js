document.addEventListener('DOMContentLoaded', async function() {
    const toggleButton = document.getElementById('toggleButton');
    const toggleCircle = toggleButton.querySelector('div');
    const recentList = document.getElementById('recentList');
    let isEnabled = false;

    // Wait for chrome APIs to be ready
    if (!chrome.storage) {
        console.error('Chrome storage API not available');
        return;
    }

    try {
        // Initialize toggle state from storage
        const result = await chrome.storage.sync.get(['autoConvert']);
        isEnabled = result.autoConvert || false;
        updateToggleState();

        // Initialize recent conversions
        loadRecentConversions();

        toggleButton.addEventListener('click', function() {
            isEnabled = !isEnabled;
            updateToggleState();
            
            // Update storage and notify background script
            chrome.storage.sync.set({ autoConvert: isEnabled });
            chrome.runtime.sendMessage({
                action: 'updateAutoConvert',
                enabled: isEnabled
            });
        });
    } catch (error) {
        console.error('Error initializing storage:', error);
    }

    function updateToggleState() {
        if (isEnabled) {
            toggleButton.classList.remove('bg-indigo-100');
            toggleButton.classList.add('bg-indigo-600');
            toggleCircle.classList.remove('bg-indigo-600');
            toggleCircle.classList.add('bg-white');
            toggleCircle.style.transform = 'translateX(24px)';
        } else {
            toggleButton.classList.remove('bg-indigo-600');
            toggleButton.classList.add('bg-indigo-100');
            toggleCircle.classList.remove('bg-white');
            toggleCircle.classList.add('bg-indigo-600');
            toggleCircle.style.transform = 'translateX(0)';
        }
    }

    // Add smooth transition to toggle circle
    toggleCircle.style.transition = 'transform 0.3s ease-in-out';

    // Listen for recent conversion updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateRecentConversions') {
            updateRecentConversionsList(request.recentConversions);
        }
    });

    function loadRecentConversions() {
        chrome.storage.local.get(['recentConversions'], function(result) {
            if (result.recentConversions) {
                updateRecentConversionsList(result.recentConversions);
            }
        });
    }

    function updateRecentConversionsList(conversions) {
        if (!conversions || conversions.length === 0) {
            recentList.innerHTML = `
                <div class="text-xs text-gray-500 text-center py-3">
                    No recent conversions
                </div>
            `;
            return;
        }

        recentList.innerHTML = conversions.map(conversion => `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-2">
                    <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span class="text-xs text-gray-600 truncate max-w-[200px]">${conversion.convertedFilename}</span>
                </div>
                <span class="text-xs text-gray-400">${getTimeAgo(conversion.timestamp)}</span>
            </div>
        `).join('');
    }

    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
}); 
console.log('Background script running')

let counter = 0;

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ time: 0 });
    console.log('Extension installed');
});

// Handle alarms if needed
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'timer') {
        counter++;
        chrome.action.setBadgeText({
            text: counter.toString()
        });

        // chrome.notifications.create('timer-notification', {
        //     type: 'basic',
        //     iconUrl: 'timer.png',
        //     title: 'Timer Update',
        //     message: `Timer has been running for ${counter} minute(s)`
        // });
    }
});

// Basic message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request);
    return true;
});

// Function to turn on captions
function turnOnCaptions(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
            function clickCaptions() {
                const captionsButton = document.querySelector([
                    '[aria-label*="Turn on captions"]',
                    '[data-tooltip*="Turn on captions"]',
                    '[data-is-muted="true"][aria-label*="captions"]',
                    'button[aria-label*="subtitle"]',
                    '[data-tooltip*="subtitle"]',
                    '[aria-label*="closed captions"]',
                    '[data-tooltip*="closed captions"]'
                ].join(','));

                if (captionsButton) {
                    const isCaptionsOff = 
                        captionsButton.getAttribute('aria-label')?.toLowerCase().includes('turn on') || 
                        captionsButton.getAttribute('data-tooltip')?.toLowerCase().includes('turn on') ||
                        !document.querySelector('[aria-label*="Turn off captions"]');
                    
                    if (isCaptionsOff) {
                        captionsButton.click();
                        console.log('Captions turned on');
                    }
                }
            }

            // Initial attempt
            clickCaptions();

            // Keep trying every second for 10 seconds
            let attempts = 0;
            const interval = setInterval(() => {
                clickCaptions();
                attempts++;
                if (attempts >= 10) clearInterval(interval);
            }, 1000);
        }
    });
}

// Function to check if in meeting
function checkForActiveMeeting(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
            return {
                inMeeting: document.querySelector([
                    '[aria-label*="Leave call"]',
                    '[aria-label*="End call"]',
                    '[data-tooltip*="Leave call"]',
                    '.presence-meeting-status',
                    '[data-meeting-status]'
                ].join(',')) !== null
            };
        }
    }, (results) => {
        if (results?.[0]?.result?.inMeeting) {
            turnOnCaptions(tabId);
        }
    });
}

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (tab.url?.includes('meet.google.com')) {
        turnOnCaptions(tab.id);
    }
});

// Check when URL changes within a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('meet.google.com')) {
        checkForActiveMeeting(tabId);
        
        let checkCount = 0;
        const interval = setInterval(() => {
            checkForActiveMeeting(tabId);
            checkCount++;
            if (checkCount >= 30) clearInterval(interval);
        }, 2000);
    }
});

// Check existing tabs when extension loads
chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
    tabs.forEach(tab => {
        checkForActiveMeeting(tab.id);
    });
});

// Listen for navigation events
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.url.includes('meet.google.com')) {
        checkForActiveMeeting(details.tabId);
    }
});
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
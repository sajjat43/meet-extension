console.log('Background script running')

let counter = 0;

// Store last known meeting data
let lastKnownMeetingData = {
    participants: [],
    meetingUrl: '',
    timestamp: '',
    isActive: false
};

// Store active Meet tab ID
let activeMeetTabId = null;

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

            // Keep trying every second indefinitely
            setInterval(clickCaptions, 1000);

            // Also try when the UI updates
            const observer = new MutationObserver(() => {
                clickCaptions();
            });

            // Watch for UI changes
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    });
}

// Function to get participant details
function getParticipantDetails(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
            const participants = [];
            const participantElements = document.querySelectorAll([
                '[role="listitem"]',
                '[data-participant-id]',
                '[data-requested-participant-id]',
                '[class*="participant-item"]'
            ].join(','));

            participantElements.forEach(element => {
                // Get name
                const nameElement = element.querySelector([
                    '[data-self-name]',
                    '[data-participant-name]',
                    '[class*="participant-name"]',
                    '[class*="roster-entry-name"]'
                ].join(','));

                // Get email
                const emailElement = element.querySelector([
                    '[data-hovercard-id]',
                    '[data-email]',
                    '[class*="participant-email"]',
                    '[title*="@"]'
                ].join(','));

                const name = nameElement?.textContent?.trim() || 'Unknown';
                let email = '';

                if (emailElement) {
                    email = emailElement.getAttribute('data-hovercard-id') || 
                           emailElement.getAttribute('data-email') || 
                           emailElement.getAttribute('title') || 
                           emailElement.textContent.trim();
                }

                if (name !== 'Unknown' || email) {
                    participants.push({
                        name: name,
                        email: email || 'Email not available'
                    });
                }
            });

            return {
                participants,
                timestamp: new Date().toISOString(),
                meetingUrl: window.location.href,
                isActive: true
            };
        }
    }, (results) => {
        if (results?.[0]?.result) {
            if (results[0].result.participants.length > 0) {
                lastKnownMeetingData = results[0].result;
                chrome.storage.local.set({ 
                    participantData: lastKnownMeetingData 
                }, () => {
                    console.log('Stored participants:', lastKnownMeetingData.participants.length);
                });
            }
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
            activeMeetTabId = tabId;
            lastKnownMeetingData.isActive = true;
            turnOnCaptions(tabId);
            getParticipantDetails(tabId);
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
        turnOnCaptions(tabId);
        checkForActiveMeeting(tabId);
    }
});

// Track tab switching
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url?.includes('meet.google.com')) {
            turnOnCaptions(tab.id);
        }
    });
    
    if (lastKnownMeetingData.participants.length > 0) {
        chrome.storage.local.set({ 
            participantData: lastKnownMeetingData 
        }, () => {
            console.log('Maintained participants on tab switch:', lastKnownMeetingData.participants.length);
        });
    }
    
    if (activeMeetTabId) {
        getParticipantDetails(activeMeetTabId);
    }
});

// Check captions more frequently
setInterval(() => {
    if (activeMeetTabId) {
        chrome.tabs.get(activeMeetTabId, (tab) => {
            if (!chrome.runtime.lastError && tab) {
                turnOnCaptions(activeMeetTabId);
            }
        });
    }
}, 2000);

// Check all Meet tabs when extension starts
chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
    tabs.forEach(tab => {
        checkForActiveMeeting(tab.id);
    });
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeMeetTabId) {
        if (lastKnownMeetingData.participants.length > 0) {
            chrome.storage.local.set({ 
                participantData: lastKnownMeetingData 
            }, () => {
                console.log('Maintained participants after tab close:', lastKnownMeetingData.participants.length);
            });
        }
        activeMeetTabId = null;
        lastKnownMeetingData.isActive = false;
    }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE && activeMeetTabId) {
        turnOnCaptions(activeMeetTabId);
    }
});

function getMeetAttendanceData(meetingCode) {
    // Get auth token first
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError) {
            console.error('Auth error:', chrome.runtime.lastError);
            return;
        }

        // Get current user email
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
            if (!userInfo.email) {
                console.error('No user email found');
                return;
            }

            const today = new Date();
            const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
            
            // Format dates for the API
            const startTime = sevenDaysAgo.toISOString();
            const endTime = today.toISOString();

            // Make the API request
            fetch(`https://admin.googleapis.com/admin/reports/v1/activity/users/${userInfo.email}/applications/meet?startTime=${startTime}&endTime=${endTime}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Process the attendance data
                const meetingData = processMeetingData(data, meetingCode);
                // Store the data
                chrome.storage.local.set({ meetingAttendance: meetingData });
            })
            .catch(error => console.error('Fetch error:', error));
        });
    });
}

function processMeetingData(data, targetMeetingCode) {
    if (!data.items) return [];

    return data.items
        .filter(item => {
            const events = item.events || [];
            return events.some(event => 
                event.name === 'call_ended' && 
                event.parameters.some(param => 
                    param.name === 'meeting_code' && 
                    param.value === targetMeetingCode
                )
            );
        })
        .map(item => {
            const meetingEvent = item.events.find(e => e.name === 'call_ended');
            const parameters = meetingEvent.parameters;

            return {
                meetingCode: parameters.find(p => p.name === 'meeting_code')?.value,
                duration: parameters.find(p => p.name === 'duration_seconds')?.intValue,
                participants: parameters.find(p => p.name === 'participant_emails')?.multiValue || [],
                startTime: item.id.time,
                organizer: parameters.find(p => p.name === 'organizer_email')?.value
            };
        });
}
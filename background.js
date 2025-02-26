console.log('Background script running')

let counter = 0;

// Reset all meeting data initially
let lastKnownMeetingData = {
    participants: [],
    meetingUrl: '',
    timestamp: '',
    isActive: false,
    platform: ''
};

// Store active Meet and Teams tab IDs
let activeMeetTabId = null;
let activeTeamsTabId = null;

// Function to turn on captions for Google Meet
function turnOnMeetCaptions(tabId) {
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
                        console.log('Meet captions turned on');
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

// Function to turn on Teams captions
function turnOnTeamsCaptions(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
            function clickCaptions() {
                // More comprehensive selectors for Teams captions button
                const captionsSelectors = [
                    '[data-tid="toggle-captions"]',
                    '[data-tid="toggle-subtitles"]',
                    '[aria-label*="Turn on captions"]',
                    '[aria-label*="turn on subtitles"]',
                    '[title*="Turn on captions"]',
                    '[title*="turn on subtitles"]',
                    'button[name*="captions"]',
                    'button[name*="subtitles"]'
                ];

                const captionsButton = document.querySelector(captionsSelectors.join(','));

                if (captionsButton) {
                    const isCaptionsOff = 
                        captionsButton.getAttribute('aria-label')?.toLowerCase().includes('turn on') ||
                        captionsButton.getAttribute('title')?.toLowerCase().includes('turn on') ||
                        captionsButton.getAttribute('name')?.toLowerCase().includes('turn on');
                    
                    if (isCaptionsOff) {
                        captionsButton.click();
                        console.log('Teams captions turned on');
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

// Function to check if in a Google Meet meeting
function checkForActiveMeetMeeting(tabId) {
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
            turnOnMeetCaptions(tabId);
            getParticipantDetails(tabId);
        }
    });
}

// Function to check if URL is a Teams meeting URL
function isTeamsMeetingUrl(url) {
    // Specific pattern for your meeting URL
    const meetingIdPattern = /teams\.live\.com\/meet\/(\d+)/;
    return url && meetingIdPattern.test(url);
}

// Function to get Teams meeting status
function getTeamsMeetingStatus(tabId) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
            function isInMeeting() {
                // Check for Teams live specific elements
                const meetingIndicators = {
                    // Video elements specific to Teams live
                    video: document.querySelector([
                        'video',
                        '.video-element',
                        '.ts-video-element',
                        '[class*="video-state"]'
                    ].join(',')),

                    // Meeting controls for Teams live
                    controls: document.querySelector([
                        '.ts-calling-screen',
                        '.ts-meeting-panel',
                        '.calling-controls',
                        '[class*="control-bar"]'
                    ].join(',')),

                    // Participant elements
                    participants: document.querySelector([
                        '.ts-participant',
                        '.participant-item',
                        '.roster-list',
                        '[class*="participant"]'
                    ].join(','))
                };

                // Log detection results
                console.log('Teams Live Meeting Detection:', {
                    hasVideo: !!meetingIndicators.video,
                    hasControls: !!meetingIndicators.controls,
                    hasParticipants: !!meetingIndicators.participants,
                    url: window.location.href
                });

                // Consider in meeting if we have any of these indicators
                return Object.values(meetingIndicators).some(el => el !== null);
            }

            function getParticipants() {
                const participants = new Set();

                // Teams live specific participant selectors
                const selectors = [
                    '.ts-participant',
                    '.participant-item',
                    '[class*="participant-name"]',
                    '[class*="attendee-name"]'
                ];

                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        const name = el.textContent.trim();
                        if (name && name.length > 1) {
                            participants.add(name);
                        }
                    });
                });

                return Array.from(participants)
                    .filter(name => 
                        name.length > 1 && 
                        !name.includes('More') &&
                        !name.includes('Guest'))
                    .map(name => ({
                        name,
                        email: name.includes('@') ? name : ''
                    }));
            }

            return {
                inMeeting: isInMeeting(),
                participants: getParticipants(),
                meetingUrl: window.location.href,
                timestamp: new Date().toISOString()
            };
        }
    }, (results) => {
        if (results?.[0]?.result) {
            const { inMeeting, participants, meetingUrl, timestamp } = results[0].result;

            if (inMeeting) {
                lastKnownMeetingData = {
                    participants,
                    meetingUrl,
                    timestamp,
                    isActive: true,
                    platform: 'teams'
                };
                activeTeamsTabId = tabId;
            } else {
                lastKnownMeetingData = {
                    participants: [],
                    meetingUrl: '',
                    timestamp: '',
                    isActive: false,
                    platform: ''
                };
                activeTeamsTabId = null;
            }

            chrome.storage.local.set({ 
                participantData: lastKnownMeetingData 
            });
        }
    });
}

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    if (tab.url?.includes('meet.google.com')) {
        turnOnMeetCaptions(tab.id);
    }
});

// Monitor tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('meet.google.com')) {
        checkForActiveMeetMeeting(tabId);
    } else if (isTeamsMeetingUrl(tab.url)) {
        getTeamsMeetingStatus(tabId);
    }
});

// Monitor tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeMeetTabId) {
        getParticipantDetails(activeMeetTabId);
    }
    if (activeTeamsTabId) {
        turnOnTeamsCaptions(activeTeamsTabId);
    }
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && isTeamsMeetingUrl(tab.url)) {
            getTeamsMeetingStatus(tab.id);
        }
    });
});

// Regular status check
setInterval(() => {
    if (activeTeamsTabId) {
        chrome.tabs.get(activeTeamsTabId, (tab) => {
            if (!chrome.runtime.lastError && tab && isTeamsMeetingUrl(tab.url)) {
                getTeamsMeetingStatus(activeTeamsTabId);
            } else {
                lastKnownMeetingData = {
                    participants: [],
                    meetingUrl: '',
                    timestamp: '',
                    isActive: false,
                    platform: ''
                };
                chrome.storage.local.set({ participantData: lastKnownMeetingData });
                activeTeamsTabId = null;
            }
        });
    }
}, 2000);

// Check all Meet and Teams tabs when extension starts
chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
    tabs.forEach(tab => {
        checkForActiveMeetMeeting(tab.id);
    });
});

chrome.tabs.query({ url: ["*://teams.microsoft.com/*", "*://teams.live.com/*"] }, (tabs) => {
    tabs.forEach(tab => {
        console.log('Checking Teams tab on startup:', tab.url);
        getTeamsMeetingStatus(tab.id);
    });
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeMeetTabId) {
        activeMeetTabId = null;
        lastKnownMeetingData.isActive = false;
    }
    if (tabId === activeTeamsTabId) {
        activeTeamsTabId = null;
    }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        if (activeMeetTabId) {
            turnOnMeetCaptions(activeMeetTabId);
        }
        if (activeTeamsTabId) {
            turnOnTeamsCaptions(activeTeamsTabId);
        }
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

// Check more frequently for Teams live meetings
setInterval(() => {
    chrome.tabs.query({ url: "*://teams.live.com/meet/*" }, (tabs) => {
        tabs.forEach(tab => {
            if (isTeamsMeetingUrl(tab.url)) {
                getTeamsMeetingStatus(tab.id);
            }
        });
    });
}, 1000);

// Monitor tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('teams.live.com/meet/')) {
        getTeamsMeetingStatus(tabId);
    }
});

// Clear data on startup
chrome.runtime.onStartup.addListener(() => {
    lastKnownMeetingData = {
        participants: [],
        meetingUrl: '',
        timestamp: '',
        isActive: false,
        platform: ''
    };
    chrome.storage.local.set({ participantData: lastKnownMeetingData });
});
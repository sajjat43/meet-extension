const timeElement = document.getElementById('timer');
const emailElement = document.getElementById('email');

let previousMeetingData = null;
let lastKnownParticipants = {
    count: 0,
    participants: [],
    url: '',
    inMeeting: false
};

function updateTime() {
    const currentTime = new Date().toLocaleTimeString();
    timeElement.textContent = `Current time: ${currentTime}`;
}

updateTime();
setInterval(updateTime, 1000);

// Show loading state
emailElement.innerHTML = `
    <div style="text-align: center; padding: 20px;">
        <div class="loading-spinner"></div>
        <div style="margin-top: 10px;">Loading profile data...</div>
    </div>
`;

// Get user profile info using chrome.identity API
chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
    if (userInfo.email) {
        // Get auth token
        chrome.identity.getAuthToken({ 
            interactive: true,
            scopes: [
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile'
            ]
        }, function(token) {
            if (chrome.runtime.lastError) {
                console.error('Auth error:', chrome.runtime.lastError);
                emailElement.innerHTML = `
                    <div class="error-message">
                        Authentication Error
                        <div class="sign-in-prompt">
                            Please ensure you are signed in to Chrome and try again
                        </div>
                    </div>
                `;
                return;
            }

            // Fetch user data with token
            fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
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
                emailElement.innerHTML = `
                    <div class="profile-container">
                        <div class="profile-header">
                            <div class="login-status">
                                <span class="material-icons" style="color: #4CAF50;">check_circle</span>
                                <span>Logged in</span>
                            </div>
                        </div>
                        <div class="profile-info">
                        ${data.picture ? `<img src="${data.picture}" alt="Profile Picture" style="width: 50px; border-radius: 50%; margin-top: 10px;">` : ''}
                            <div>Name: ${data.name || 'N/A'}</div>
                            <div>Email: ${userInfo.email}</div>
                        </div>
                    </div>
                `;

                // Start a timer
                chrome.alarms.create('timer', {
                    periodInMinutes: 1
                });
            })
            .catch(error => {
                console.error('Fetch error:', error);
                emailElement.innerHTML = `
                    <div class="error-message">
                        Error fetching user data
                        <div class="sign-in-prompt">
                            ${error.message}
                        </div>
                    </div>
                `;
            });
        });
    } else {
        emailElement.innerHTML = `
            <div class="error-message">
                No Google Account found
                <div class="sign-in-prompt">
                    Please sign in to Chrome
                </div>
            </div>
        `;
    }
});

// Update badge
chrome.action.setBadgeText({ text: 'meet' });
chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

// Function to save meeting data to storage
function savePreviousMeeting(meetingData) {
    chrome.storage.local.set({
        previousMeeting: {
            timestamp: new Date().toISOString(),
            participantCount: meetingData.count,
            meetingUrl: meetingData.url,
            participants: meetingData.participants
        }
    });
}

// Function to check if meeting ended and update previous meeting data
function updatePreviousMeeting(currentMeetingData, previousData) {
    if (previousData && !currentMeetingData.inMeeting) {
        // Meeting ended, save it as previous meeting
        savePreviousMeeting(previousData);
    }
    return currentMeetingData;
}

// Add this function to render previous meeting section
function renderPreviousMeeting(element) {
    chrome.storage.local.get('previousMeeting', (data) => {
        if (data.previousMeeting) {
            const meeting = data.previousMeeting;
            const meetingTime = new Date(meeting.timestamp).toLocaleString();
            
            element.innerHTML = `
                <div class="previous-meeting-container">
                    <div class="previous-meeting-header">
                        <span class="material-icons">history</span>
                        <span>Previous Meeting</span>
                    </div>
                    <div class="previous-meeting-content">
                        <div class="previous-meeting-info">
                            <div class="previous-meeting-time">
                                <span class="material-icons">schedule</span>
                                <span>${meetingTime}</span>
                            </div>
                            <div class="previous-meeting-participants">
                                <span class="material-icons">group</span>
                                <span>${meeting.participantCount} participants</span>
                            </div>
                            <div class="previous-meeting-url">
                                <span class="material-icons">link</span>
                                <a href="${meeting.meetingUrl}" target="_blank">${meeting.meetingUrl}</a>
                            </div>
                        </div>
                        <div class="previous-participants-list">
                            ${meeting.participants.map(p => `
                                <div class="previous-participant">
                                    <span class="material-icons">account_circle</span>
                                    <span>${p.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else {
            element.innerHTML = ''; // Clear if no previous meeting
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup loaded');

    const googleMeetElement = document.getElementById('googleMeet');
    const meetParticipantsElement = document.getElementById('meet-participants');

    if (!googleMeetElement || !meetParticipantsElement) {
        console.error('Required elements not found');
        return;
    }

    function updateMeetStatus(active = false, data = null) {
        googleMeetElement.innerHTML = `
            <div class="meet-container">
                <div class="meet-header">
                    <span class="material-icons">videocam</span>
                    <span>Google Meet Status</span>
                </div>
                <div class="meet-status">
                    ${active ? `
                        <div class="meet-active">
                            <span class="material-icons" style="color: #4CAF50;">video_camera_front</span>
                            <div class="meet-info">
                                <div class="meet-title">${data.title || 'Active Meeting'}</div>
                                <div class="meet-participants">
                                    <span class="material-icons">group</span>
                                    <span>${data.count} participants</span>
                                </div>
                                <div class="meet-url">${data.url}</div>
                            </div>
                        </div>
                    ` : `
                        <div class="meet-inactive">
                            <span class="material-icons" style="color: #666;">videocam_off</span>
                            <span>No active Google Meet sessions</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function updateParticipantsList(participants = []) {
        if (participants.length === 0) {
            meetParticipantsElement.innerHTML = '';
            return;
        }

        let html = `
            <div class="participants-container">
                <div class="participants-header">
                    <span class="material-icons">people</span>
                    <span>Participants (${participants.length})</span>
                </div>
                <div class="participants-list">
        `;

        participants.forEach(p => {
            html += `
                <div class="participant-item ${p.isCurrentUser ? 'current-user' : ''} ${p.isSpeaking ? 'speaking' : ''}">
                    <div class="participant-info">
                        ${p.avatarSrc ? 
                            `<div class="avatar-container ${p.isSpeaking ? 'speaking' : ''}">
                                <img class="participant-avatar" src="${p.avatarSrc}" alt="">
                                ${p.isSpeaking ? '<div class="speaking-indicator"></div>' : ''}
                            </div>` :
                            `<span class="material-icons ${p.isSpeaking ? 'speaking' : ''}">account_circle</span>`
                        }
                        <div class="participant-details">
                            <div class="participant-name">
                                ${p.name}
                                ${p.isCurrentUser ? '<span class="current-user-badge">(You)</span>' : ''}
                                ${p.isSpeaking ? '<span class="speaking-badge">Speaking</span>' : ''}
                            </div>
                            ${p.role ? `<div class="participant-role">${p.role}</div>` : ''}
                        </div>
                    </div>
                    <div class="participant-status">
                        <span class="material-icons status-icon ${p.isMuted ? 'muted' : ''}" title="${p.isMuted ? 'Muted' : 'Unmuted'}">
                            ${p.isMuted ? 'mic_off' : 'mic'}
                        </span>
                        <span class="material-icons status-icon ${p.isVideoOff ? 'video-off' : ''}" title="${p.isVideoOff ? 'Camera Off' : 'Camera On'}">
                            ${p.isVideoOff ? 'videocam_off' : 'videocam'}
                        </span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        meetParticipantsElement.innerHTML = html;
    }

    function checkGoogleMeet() {
        chrome.tabs.query({ url: "*://meet.google.com/*" }, (tabs) => {
            console.log('Found Meet tabs:', tabs?.length);

            if (!tabs || tabs.length === 0) {
                updateMeetStatus(false);
                updateParticipantsList([]);
                return;
            }

            const tab = tabs[0];
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    const participantElements = document.querySelectorAll([
                        '[role="listitem"]',
                        '[data-participant-id]',
                        '[data-requested-participant-id]',
                        '[class*="participant-item"]'
                    ].join(','));

                    const participants = Array.from(participantElements)
                        .filter(element => {
                            const nameElement = element.querySelector([
                                '[data-self-name]',
                                '[data-participant-name]',
                                '.zWGUib',
                                '[class*="participant-name"]',
                                '[class*="roster-entry-name"]'
                            ].join(','));

                            return nameElement !== null;
                        })
                        .map(element => {
                            const nameElement = element.querySelector([
                                '[data-self-name]',
                                '[data-participant-name]',
                                '.zWGUib',
                                '[class*="participant-name"]',
                                '[class*="roster-entry-name"]'
                            ].join(','));

                            const avatarElement = element.querySelector('.KjWwNd');
                            const roleElement = element.querySelector('.d93U2d');

                            // Updated speaking detection
                            const isSpeaking = element.querySelector('.IisKdb')?.classList.contains('gjg47c') || 
                                             element.querySelector('.cS7aqe')?.classList.contains('NMm5M');

                            // Updated mute status detection
                            const micButton = element.querySelector('[role="button"][aria-label*="microphone"]');
                            const isMuted = micButton?.getAttribute('aria-label')?.toLowerCase().includes('unmute') ||
                                          micButton?.getAttribute('data-is-muted') === 'true' ||
                                          element.querySelector('.FTMc0c')?.classList.contains('Nep7Ue') ||
                                          element.querySelector('.uB7U9e')?.classList.contains('ZyxbVb');

                            // Updated video status detection
                            const videoButton = element.querySelector('[role="button"][aria-label*="camera"]');
                            const isVideoOff = videoButton?.getAttribute('aria-label')?.toLowerCase().includes('turn on') ||
                                             videoButton?.getAttribute('data-is-muted') === 'true' ||
                                             element.querySelector('[aria-label*="camera off"]') !== null;

                            const name = nameElement?.textContent?.trim() || 'Unknown';
                            const isCurrentUser = name.includes('(You)') || 
                                               element.querySelector('.NnTWjc') !== null;

                            return {
                                name: name.replace('(You)', '').trim(),
                                isCurrentUser,
                                avatarSrc: avatarElement?.src || '',
                                role: roleElement?.textContent?.trim() || '',
                                isMuted,
                                isVideoOff,
                                isSpeaking: isSpeaking && !isMuted // Only show speaking if not muted
                            };
                        });

                    return {
                        count: participants.length,
                        participants,
                        url: window.location.href,
                        title: document.title,
                        inMeeting: participants.length > 0
                    };
                }
            }, (results) => {
                if (chrome.runtime.lastError) {
                    console.error('Script execution error:', chrome.runtime.lastError);
                    updateMeetStatus(false);
                    return;
                }

                const result = results?.[0]?.result;
                if (result) {
                    console.log('Meeting data:', result);
                    updateMeetStatus(true, result);
                    updateParticipantsList(result.participants);

                    // Store the data
                    chrome.storage.local.set({
                        lastMeetingData: result
                    });
                }
            });
        });
    }

    // Initial check
    checkGoogleMeet();

    // Update every 2 seconds
    const intervalId = setInterval(checkGoogleMeet, 2000);

    // Cleanup on popup close
    window.addEventListener('unload', () => {
        clearInterval(intervalId);
    });
});

// Function to control mic and camera
function toggleMicCamera(tabId, type) {
    chrome.scripting.executeScript({
        target: { tabId },
        function: (controlType) => {
            // Find the correct button based on type
            const selector = controlType === 'mic' 
                ? '[aria-label*="microphone"], [aria-label*="mic"], [data-is-muted]'
                : '[aria-label*="camera"], [aria-label*="video"]';
            
            const button = document.querySelector(selector);
            if (button) {
                button.click();
                return true;
            }
            return false;
        },
        args: [type]
    });
}

// Update the participant item HTML generation
function generateParticipantHTML(participant) {
    return `
        <div class="participant-item">
            <div class="participant-info">
                ${participant.avatarSrc ? 
                    `<img class="participant-avatar" src="${participant.avatarSrc}" alt="">` :
                    `<span class="material-icons">account_circle</span>`
                }
                <div class="participant-details">
                    <div class="participant-name">
                        ${participant.name}
                        ${participant.isCurrentUser ? '<span class="current-user-badge">(You)</span>' : ''}
                        ${participant.role ? `<div class="participant-role">${participant.role}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="participant-status">
                ${participant.isPinned ? 
                    '<span class="material-icons" title="Pinned">push_pin</span>' : ''
                }
                <span class="material-icons" title="${participant.isMuted ? 'Muted' : 'Unmuted'}">
                    ${participant.isMuted ? 'mic_off' : 'mic'}
                </span>
                <span class="material-icons" title="${participant.isVideoOff ? 'Camera Off' : 'Camera On'}">
                    ${participant.isVideoOff ? 'videocam_off' : 'videocam'}
                </span>
            </div>
        </div>
    `;
}

// Add this function to display attendance data
function displayAttendanceData() {
    chrome.storage.local.get('meetingAttendance', (data) => {
        if (data.meetingAttendance) {
            const attendanceElement = document.getElementById('attendance');
            if (!attendanceElement) return;

            let html = '<div class="attendance-container">';
            data.meetingAttendance.forEach(meeting => {
                html += `
                    <div class="meeting-record">
                        <div class="meeting-header">
                            <span class="material-icons">event</span>
                            <span>Meeting: ${meeting.meetingCode}</span>
                        </div>
                        <div class="meeting-details">
                            <div>Start Time: ${new Date(meeting.startTime).toLocaleString()}</div>
                            <div>Duration: ${Math.floor(meeting.duration / 60)} minutes</div>
                            <div>Organizer: ${meeting.organizer}</div>
                        </div>
                        <div class="participants-list">
                            <div class="participants-header">
                                <span class="material-icons">people</span>
                                <span>Participants (${meeting.participants.length})</span>
                            </div>
                            ${meeting.participants.map(email => `
                                <div class="participant">
                                    <span class="material-icons">person</span>
                                    <span>${email}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            attendanceElement.innerHTML = html;
        }
    });
}

function displayParticipants() {
    const participantsElement = document.getElementById('meet-participants');
    if (!participantsElement) return;

    chrome.storage.local.get('participantData', (data) => {
        if (data.participantData?.participants?.length > 0) {
            let html = `
                <div class="participants-container">
                    <div class="participants-header">
                        <span class="material-icons">group</span>
                        <span>Meeting Participants (${data.participantData.participants.length})</span>
                        ${data.participantData.isActive ? 
                            '<span class="active-badge">Active</span>' : 
                            '<span class="inactive-badge">Last Known State</span>'
                        }
                    </div>
                    <div class="meeting-url">${data.participantData.meetingUrl}</div>
                    <div class="participants-list">
            `;

            data.participantData.participants.forEach(participant => {
                html += `
                    <div class="participant-item">
                        <div class="participant-info">
                            <span class="material-icons">account_circle</span>
                            <div class="participant-details">
                                <div class="participant-name">${participant.name}</div>
                                <div class="participant-email">${participant.email}</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                    <div class="last-updated">
                        Last updated: ${new Date(data.participantData.timestamp).toLocaleString()}
                    </div>
                </div>
            `;
            participantsElement.innerHTML = html;
        } else {
            participantsElement.innerHTML = `
                <div class="no-participants">
                    <span class="material-icons">error_outline</span>
                    <span>No participant data available</span>
                </div>
            `;
        }
    });
}

// Update display frequently
setInterval(displayParticipants, 2000);
displayParticipants();
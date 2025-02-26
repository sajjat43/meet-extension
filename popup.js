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
    timeElement.textContent = new Date().toLocaleTimeString();
}
setInterval(updateTime, 1000);
updateTime();

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
                        <div class="previous-meeting-info"></div>
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

// Function to check Google Meet status and participants
function checkGoogleMeet() {
    const googleMeetElement = document.getElementById('googleMeet');
    const meetParticipantsElement = document.getElementById('meet-participants');
    const previousMeetingElement = document.getElementById('previousMeeting');

    // Add error handling for missing elements
    if (!googleMeetElement || !meetParticipantsElement || !previousMeetingElement) {
        console.error('Required elements not found in the DOM');
        return;
    }

    // Query for ALL Google Meet tabs
    chrome.tabs.query({
        url: ["*://meet.google.com/*"]
    }, (tabs) => {
        let meetHtml = `
            <div class="meet-container">
                <div class="meet-header">
                    <span class="material-icons">videocam</span>
                    <span>Google Meet Status</span>
                </div>
                <div class="meet-status">
        `;
        
        if (tabs && tabs.length > 0) {
            // Execute script in ALL Meet tabs
            Promise.all(tabs.map(tab => {
                return new Promise((resolve) => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            function getParticipantName(element) {
                                const possibleNameElements = [
                                    ...element.querySelectorAll('[role="button"]'),
                                    ...element.querySelectorAll('.ZjFb7c, .zWGUib, .KsBfEc'),
                                    ...element.querySelectorAll('[aria-label]'),
                                    ...element.querySelectorAll('[data-participant-id]'),
                                    ...element.querySelectorAll('[title]')
                                ];

                                for (const el of possibleNameElements) {
                                    const ariaLabel = el.getAttribute('aria-label');
                                    if (ariaLabel && !ariaLabel.includes('menu') && !ariaLabel.includes('More')) {
                                        return ariaLabel.split('(')[0].trim();
                                    }

                                    const title = el.getAttribute('title');
                                    if (title && !title.includes('menu') && !title.includes('More')) {
                                        return title.split('(')[0].trim();
                                    }

                                    const text = el.textContent.trim();
                                    if (text && !text.includes('menu') && !text.includes('More') && text.length > 1) {
                                        return text;
                                    }
                                }

                                return 'Unknown';
                            }

                            function getParticipantInfo(element) {
                                // Try to get email from various attributes and elements
                                const possibleEmailElements = [
                                    ...element.querySelectorAll('[data-hovercard-id]'), // Gmail hovercard
                                    ...element.querySelectorAll('[data-email]'), // Direct email attribute
                                    ...element.querySelectorAll('[aria-label]'), // Aria label might contain email
                                    ...element.querySelectorAll('[title]') // Title might contain email
                                ];

                                let email = '';
                                for (const el of possibleEmailElements) {
                                    // Check data-hovercard-id
                                    const hovercardId = el.getAttribute('data-hovercard-id');
                                    if (hovercardId && hovercardId.includes('@')) {
                                        email = hovercardId;
                                        break;
                                    }

                                    // Check data-email
                                    const dataEmail = el.getAttribute('data-email');
                                    if (dataEmail && dataEmail.includes('@')) {
                                        email = dataEmail;
                                        break;
                                    }

                                    // Check aria-label
                                    const ariaLabel = el.getAttribute('aria-label');
                                    if (ariaLabel) {
                                        const emailMatch = ariaLabel.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
                                        if (emailMatch) {
                                            email = emailMatch[0];
                                            break;
                                        }
                                    }

                                    // Check title
                                    const title = el.getAttribute('title');
                                    if (title) {
                                        const emailMatch = title.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
                                        if (emailMatch) {
                                            email = emailMatch[0];
                                            break;
                                        }
                                    }
                                }

                                // Get name (your existing getParticipantName function)
                                const name = getParticipantName(element);

                                return {
                                    name,
                                    email: email || 'Email not available',
                                    isPinned: !!element.querySelector('[aria-label*="pin"], [data-is-pinned="true"]'),
                                    isMuted: !!element.querySelector('[aria-label*="muted"], [data-is-muted="true"]'),
                                    isVideoOff: !!element.querySelector('[aria-label*="camera off"], [data-is-camera-off="true"]')
                                };
                            }

                            const participantElements = document.querySelectorAll('[data-participant-id], [role="listitem"]');
                            const participants = Array.from(participantElements).map(element => getParticipantInfo(element));

                            const inMeeting = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]') !== null;

                            return {
                                tabId: window.location.href,
                                inMeeting,
                                count: participants.length,
                                participants,
                                url: window.location.href,
                                title: document.title
                            };
                        }
                    }, (results) => {
                        if (chrome.runtime.lastError) {
                            console.error('Script execution error:', chrome.runtime.lastError);
                            // Return last known data if there's an error
                            resolve(lastKnownParticipants);
                            return;
                        }
                        const result = results?.[0]?.result;
                        if (result && result.inMeeting && result.count > 0) {
                            // Update last known participants if we have valid data
                            lastKnownParticipants = result;
                        }
                        resolve(result || lastKnownParticipants);
                    });
                });
            })).then(results => {
                // Filter out errors and use last known data if needed
                const activeMeetings = results.filter(result => result && (result.inMeeting || result === lastKnownParticipants));
                
                if (activeMeetings.length > 0) {
                    // Show all active meetings
                    activeMeetings.forEach(meeting => {
                        meetHtml += `
                            <div class="meet-active">
                                <span class="material-icons" style="color: #4CAF50;">video_camera_front</span>
                                <div class="meet-info">
                                    <div class="meet-title">${meeting.title || 'Active Meeting'}</div>
                                    <div class="meet-participants">
                                        <span class="material-icons">group</span>
                                        <span>${meeting.count} participants</span>
                                    </div>
                                    <div class="meet-url">${meeting.url}</div>
                                </div>
                            </div>
                        `;

                        // Show participants for this meeting
                        if (meeting.participants.length > 0) {
                            let participantsHtml = `
                                <div class="participants-container">
                                    <div class="participants-header">
                                        <span class="material-icons">people</span>
                                        <span>Participants (${meeting.count})</span>
                                    </div>
                                    <div class="participants-list">
                            `;
                            
                            meeting.participants.forEach(participant => {
                                const isCurrentUser = participant.name.includes('You');
                                participantsHtml += generateParticipantHTML(participant, isCurrentUser, meeting.tabId);
                            });
                            
                            participantsHtml += `
                                    </div>
                                </div>
                            `;
                            
                            meetParticipantsElement.innerHTML = participantsHtml;
                        }
                    });

                    // Check for ended meetings
                    if (previousMeetingData && !activeMeetings.some(m => m.url === previousMeetingData.url)) {
                        savePreviousMeeting(previousMeetingData);
                    }

                    // Update previous meeting data
                    previousMeetingData = activeMeetings[0];
                } else {
                    meetHtml += `
                        <div class="meet-inactive">
                            <span class="material-icons" style="color: #666;">videocam_off</span>
                            <span>No active Google Meet sessions</span>
                        </div>
                    `;
                    meetParticipantsElement.innerHTML = '';
                    lastKnownParticipants = { count: 0, participants: [], url: '', inMeeting: false };
                }

                meetHtml += `</div></div>`;
                googleMeetElement.innerHTML = meetHtml;
            });
        } else {
            meetHtml += `
                <div class="meet-inactive">
                    <span class="material-icons" style="color: #666;">videocam_off</span>
                    <span>No active Google Meet sessions</span>
                </div>
            </div></div>`;
            googleMeetElement.innerHTML = meetHtml;
            meetParticipantsElement.innerHTML = '';
            lastKnownParticipants = { count: 0, participants: [], url: '', inMeeting: false };
        }
    });
}

// Update Meet status more frequently (every 2 seconds)
setInterval(checkGoogleMeet, 2000);

// Initial Meet status check
checkGoogleMeet();

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
function generateParticipantHTML(participant, isCurrentUser, tabId) {
    return `
        <div class="participant-item ${isCurrentUser ? 'current-user' : ''}">
            <div class="participant-info">
                <span class="material-icons">account_circle</span>
                <div class="participant-details">
                    <div class="participant-name">
                        ${participant.name}
                        ${isCurrentUser ? '<span class="current-user-badge">You</span>' : ''}
                    </div>
                    <div class="participant-email">${participant.email}</div>
                </div>
            </div>
            <div class="participant-status">
                ${participant.isPinned ? '<span class="material-icons" title="Pinned">push_pin</span>' : ''}
                ${isCurrentUser ? `
                    <button class="control-button ${participant.isMuted ? 'off' : 'on'}" 
                            onclick="toggleMicCamera(${tabId}, 'mic')" 
                            title="${participant.isMuted ? 'Unmute' : 'Mute'}">
                        <span class="material-icons">${participant.isMuted ? 'mic_off' : 'mic'}</span>
                    </button>
                    <button class="control-button ${participant.isVideoOff ? 'off' : 'on'}" 
                            onclick="toggleMicCamera(${tabId}, 'camera')" 
                            title="${participant.isVideoOff ? 'Turn on camera' : 'Turn off camera'}">
                        <span class="material-icons">${participant.isVideoOff ? 'videocam_off' : 'videocam'}</span>
                    </button>
                ` : `
                    <span class="material-icons" title="${participant.isMuted ? 'Muted' : 'Unmuted'}">${participant.isMuted ? 'mic_off' : 'mic'}</span>
                    <span class="material-icons" title="${participant.isVideoOff ? 'Camera Off' : 'Camera On'}">${participant.isVideoOff ? 'videocam_off' : 'videocam'}</span>
                `}
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

// Display Teams meeting status
function displayTeamsStatus() {
    const teamsElement = document.getElementById('teams');
    if (!teamsElement) return;

    chrome.storage.local.get('participantData', (data) => {
        const meetingData = data.participantData;
        
        // More strict validation of meeting data
        const isValidMeeting = 
            meetingData?.isActive === true && 
            meetingData?.platform === 'teams' && 
            meetingData?.participants?.length > 0 &&
            meetingData?.meetingUrl?.includes('/meet/') &&  // Must be a meeting URL
            meetingData?.timestamp && // Must have recent timestamp
            (new Date().getTime() - new Date(meetingData.timestamp).getTime()) < 5000; // Data must be recent (within 5 seconds)

        if (isValidMeeting) {
            teamsElement.innerHTML = `
                <div class="teams-container">
                    <div class="teams-header">
                        <span class="material-icons">groups</span>
                        <span>Teams Meeting Active</span>
                        <span class="active-badge">Live</span>
                    </div>
                    <div class="meeting-details">
                        <div class="participant-count">
                            <span class="material-icons">person</span>
                            <span>Participants: ${meetingData.participants.length}</span>
                        </div>
                        <div class="meeting-url">${meetingData.meetingUrl}</div>
                        <div class="last-updated">Last updated: ${new Date(meetingData.timestamp).toLocaleString()}</div>
                    </div>
                    <div class="participants-list">
                        ${meetingData.participants
                            .filter(p => p.name && !p.name.includes('Unknown'))  // Filter out unknown participants
                            .map(p => `
                                <div class="participant-item">
                                    <span class="material-icons">account_circle</span>
                                    <span>${p.name}</span>
                                </div>
                            `).join('')}
                    </div>
                </div>
            `;
        } else {
            // Clear the meeting data if it's invalid
            chrome.storage.local.set({
                participantData: {
                    participants: [],
                    meetingUrl: '',
                    timestamp: '',
                    isActive: false,
                    platform: ''
                }
            }, () => {
                teamsElement.innerHTML = `
                    <div class="no-meeting">
                        <span class="material-icons">videocam_off</span>
                        <span>No active Teams meeting</span>
                    </div>
                `;
            });
        }
    });
}

// Update displays less frequently to avoid false positives
setInterval(displayTeamsStatus, 3000);
displayTeamsStatus();
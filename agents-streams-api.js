'use strict';
//const fetchJsonFile = await fetch('./api.json');
//const DID_API = await fetchJsonFile.json();
//if (DID_API.key == process.env.DID_API_KEY) alert('Please put your api key inside ./api.json and restart..');
const DID_API = { key: process.env.DID_API_KEY, url: 'https://api.d-id.com' };

// Set your Agent ID.
// In D-ID Studio: open your agent → Embed settings → copy the value of `data-agent-id` and paste it below.
// You can also create an Agent via API: POST /agents.) Docs: https://docs.d-id.com/reference/createagent
let agentId = 'agt__uA1wt2j';


// ===== DOM refs and states =====
const videoWrapper = document.getElementById('video-wrapper');
const idleVideo = document.getElementById('idleVideoElement');
const streamVideo = document.getElementById('streamVideoElement');
const connectButton = document.getElementById('connectButton');
const textArea = document.getElementById('textArea');
const interruptButton = document.getElementById('interruptButton');
const previewName = document.getElementById('previewName');
const connectionLabel = document.getElementById('connectionLabel');
const answers = document.getElementById('answers');
const actionButton = document.getElementById('actionButton');
const speechButton = document.getElementById('speechButton');
const container = document.getElementById('container');
const hiddenDiv = document.getElementById('hidden');
const hiddenH2 = document.getElementById('hidden_h2');

let peerConnection = null;
let streamId = null;
let sessionId = null;
let chatId = null;
let isFluent = false; // set from stream session 'fluent' flag
let isStreamReady = false;
let isStreamPlaying = false;
let currentVideoId = null;
let qaCounter = 0; // Counter for Q&A pairs

// ===== Helper Functions =====

// LocalStorage functions for Q&A storage using hash objects
function initializeQACounter() {
    const stored = localStorage.getItem('qa_counter');
    qaCounter = stored ? parseInt(stored, 10) : 0;
}

function storeQuestion(question) {
    qaCounter++;
    const exchangeKey = `exchange_${qaCounter}`;

    const exchangeData = {
        id: qaCounter,
        question: question,
        answer: null,
        timestamp: new Date().toISOString(),
        status: 'waiting_for_answer'
    };

    localStorage.setItem('qa_counter', qaCounter.toString());
    localStorage.setItem(exchangeKey, JSON.stringify(exchangeData));
    console.log(`Stored ${exchangeKey}:`, exchangeData);
}

function storeAnswer(answer) {
    const exchangeKey = `exchange_${qaCounter}`;
    const existingData = localStorage.getItem(exchangeKey);

    if (existingData) {
        const exchangeData = JSON.parse(existingData);
        exchangeData.answer = answer;
        exchangeData.status = 'completed';
        exchangeData.answerTimestamp = new Date().toISOString();

        localStorage.setItem(exchangeKey, JSON.stringify(exchangeData));
        console.log(`Updated ${exchangeKey} with answer:`, exchangeData);
    }
}

function getStoredQAPairs() {
    const count = parseInt(localStorage.getItem('qa_counter') || '0', 10);
    const pairs = [];

    for (let i = 1; i <= count; i++) {
        const exchangeKey = `exchange_${i}`;
        const storedData = localStorage.getItem(exchangeKey);

        if (storedData) {
            try {
                const exchangeData = JSON.parse(storedData);
                pairs.push({
                    id: exchangeData.id,
                    question: exchangeData.question,
                    answer: exchangeData.answer || 'No answer recorded',
                    timestamp: exchangeData.timestamp,
                    answerTimestamp: exchangeData.answerTimestamp,
                    status: exchangeData.status
                });
            } catch (error) {
                console.error(`Error parsing ${exchangeKey}:`, error);
            }
        }
    }
    return pairs;
}

async function fetchWithRetry(url, options, retries = 3) {
    try {
        const res = await fetch(url, options);
        if (!res.ok && retries > 0) {
            console.warn('Fetch failed, retrying...', url);
            await new Promise((r) => setTimeout(r, (Math.random() + 1) * 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        return res;
    } catch (err) {
        if (retries > 0) {
            console.warn('Fetch error, retrying...', url);
            await new Promise((r) => setTimeout(r, (Math.random() + 1) * 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
}
function updateVideoDisplay(stream, isPlaying) {
    console.log('Updating video display. Playing:', isPlaying);
    if (!isFluent) {
        const streamOpacity = isPlaying && isStreamReady ? 1 : 0;
        idleVideo.style.opacity = 1 - streamOpacity;
        streamVideo.style.opacity = streamOpacity;
        if (isPlaying && stream) {
            streamVideo.srcObject = stream;
            streamVideo.muted = !isStreamReady;
            if (streamVideo.paused) streamVideo.play().catch(() => { });
        }
        // Ensure UI is usable for talk avatars as soon as we have media or connection is ready
        if (isStreamReady) {
            connectionLabel.innerHTML = 'Connected';
            actionButton.removeAttribute('disabled');
            speechButton.removeAttribute('disabled');
        }
    } else {
        idleVideo.style.opacity = 0;
        streamVideo.style.opacity = 1;
        streamVideo.muted = false;
        if (isPlaying && isStreamReady) {
            connectionLabel.innerHTML = 'Connected';
            actionButton.removeAttribute('disabled');
            speechButton.removeAttribute('disabled');
        } else {
            connectionLabel.innerHTML = '';
            actionButton.setAttribute('disabled', true);
            speechButton.setAttribute('disabled', true);
        }
    }
}
function stopStream() {
    // console.log('Stopping video stream...');
    const stream = streamVideo.srcObject;
    if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamVideo.srcObject = null;
    }
}
function closeConnection() {
    // console.log('Closing peer connection...');
    if (!peerConnection) return;
    try { peerConnection.close(); } catch { }
    peerConnection = null;
    isStreamReady = false;
    isStreamPlaying = false;
}
function switchModes() {
    const options = document.querySelectorAll('#buttons input[name="option"]');
    const checkedIndex = Array.from(options).findIndex((opt) => opt.checked);
    options[(checkedIndex + 1) % options.length].checked = true;
}
async function handleAction() {
    const selectedOption = document.querySelector('input[name="option"]:checked')?.value;
    if (selectedOption === 'chat') return chat();
    if (selectedOption === 'speak') return speak();
    if (selectedOption === 'audio') return handleAudioInput();
}

// Make handleAction globally accessible for webSpeechAPI.js
window.handleAction = handleAction;

// Make Q&A functions globally accessible for analysis
window.getStoredQAPairs = getStoredQAPairs;
window.clearQAStorage = function() {
    const count = parseInt(localStorage.getItem('qa_counter') || '0', 10);

    // Remove all exchange objects
    for (let i = 1; i <= count; i++) {
        const exchangeKey = `exchange_${i}`;
        localStorage.removeItem(exchangeKey);
    }

    // Remove counter
    localStorage.removeItem('qa_counter');
    qaCounter = 0;
    console.log('All Q&A exchange objects cleared from localStorage');
};

// Additional utility function to get a specific exchange
window.getExchange = function(exchangeId) {
    const exchangeKey = `exchange_${exchangeId}`;
    const storedData = localStorage.getItem(exchangeKey);

    if (storedData) {
        try {
            return JSON.parse(storedData);
        } catch (error) {
            console.error(`Error parsing ${exchangeKey}:`, error);
            return null;
        }
    }
    return null;
};

async function handleAudioInput() {
    const audioMode = document.querySelector('input[name="audioMode"]:checked')?.value || 'chat';

    // Voice mode always uses speech-to-text conversion
    if (audioMode === 'chat') {
        return chat();
    } else {
        return speak();
    }
}

// ===== Main Functions =====
async function connect() {
    console.log('Connecting to Agent...');
    hiddenDiv.style.display = 'none';
    container.style.display = 'flex';
    connectionLabel.textContent = 'Connecting…';
    actionButton.disabled = true;
    speechButton.disabled = true;

    if (peerConnection?.connectionState === 'connected') return;
    // Clean up any existing connections or streams
    stopStream();
    closeConnection();

    // 1) Fetch Agent info
    console.log('Fetching agent info...');
    const resAgent = await fetch(`${DID_API.url}/agents/${agentId}`, {
        method: 'GET',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' }
    });
    if (!resAgent.ok) throw new Error(`Failed to fetch agent info: ${resAgent.status} ${resAgent.statusText}`);
    const agentData = await resAgent.json();

    previewName.innerText = agentData.preview_name;
    hiddenH2.innerText = `${agentData.preview_name} Disconnected`;
    console.log('Agent loaded:', agentData);

    // 2) Create Agent's Chat session
    console.log('Creating chat session...');
    const resChat = await fetch(`${DID_API.url}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ persist: true })
    });
    if (!resChat.ok) throw new Error(`Failed to create chat: ${resChat.status} ${resChat.statusText}`);
    const chatData = await resChat.json();
    chatId = chatData.id;
    console.log('Chat session created:', chatId);

    // Create a new stream
    console.log('Creating stream session...');
    const streamOptions = { compatibility_mode: 'on', fluent: true };
    const resStream = await fetchWithRetry(`${DID_API.url}/agents/${agentId}/streams`, {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(streamOptions)
    });
    if (!resStream.ok) throw new Error(`Failed to create stream: ${resStream.status} ${resStream.statusText}`);
    const { id, session_id, offer, ice_servers, fluent } = await resStream.json();
    streamId = id;
    sessionId = session_id;
    isFluent = !!fluent;
    console.log('Stream created: ', streamId, '\nFluent mode:', isFluent);

    if (!isFluent) {
        // Prep idle visuals for talk (non-fluent) avatars
        videoWrapper.style.backgroundImage = `url(${agentData.presenter.thumbnail})`;
        idleVideo.src = agentData.presenter.idle_video;
    }

    // Start the WebRTC connection and submit network info (asynchronously)
    console.log('Setting up WebRTC connection...');
    const RTCPeerConnectionCtor =
        window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    peerConnection = new RTCPeerConnectionCtor({ iceServers: ice_servers });

    // Submit Network information (ICE candidates → API)
    peerConnection.addEventListener('icecandidate', (event) => {
        const body = event.candidate
            ? { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex }
            : {};
        fetch(`${DID_API.url}/agents/${agentId}/streams/${streamId}/ice`, {
            method: 'POST',
            headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, ...body })
        });
        console.log('ICE candidate sent');
    });

    // Connection state changes
    peerConnection.addEventListener('connectionstatechange', () => {
        console.log('Peer connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connecting') {
            connectionLabel.innerHTML = 'Connecting…';
        }
        if (peerConnection.connectionState === 'connected') {
            setTimeout(() => {
                if (!isStreamReady) isStreamReady = true;
                // For non-fluent (talk) avatars, enable controls on connect
                if (!isFluent) {
                    connectionLabel.innerHTML = 'Connected';
                    actionButton.removeAttribute('disabled');
                    speechButton.removeAttribute('disabled');
                }
            }, 300);
        }
        if (peerConnection.connectionState === 'disconnected') {
            document.querySelector('#hidden').style.display = 'flex';
            document.querySelector('#container').style.display = 'none';
            actionButton.setAttribute('disabled', true);
            speechButton.setAttribute('disabled', true);
        }
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
            stopStream();
            closeConnection();
        }
    });

    // Remote media → <video> + simple “playing” detection
    peerConnection.addEventListener('track', (event) => {
        console.log('Remote track received');
        const stream = event.streams[0];
        const [track] = stream.getVideoTracks();
        if (!track) return;

        streamVideo.srcObject = stream;
        streamVideo.muted = !isStreamReady;

        let lastBytes = 0;
        const interval = setInterval(async () => {
            if (!peerConnection || peerConnection.connectionState === 'closed') {
                clearInterval(interval);
                return;
            }
            try {
                const receiver = peerConnection.getReceivers().find((r) => r.track === track);
                if (!receiver) return;
                const stats = await receiver.getStats();
                stats.forEach((report) => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        const nowPlaying = report.bytesReceived > lastBytes;
                        if (nowPlaying !== isStreamPlaying) {
                            isStreamPlaying = nowPlaying;
                            console.log('Stream playing state changed:', isStreamPlaying);
                            updateVideoDisplay(stream, isStreamPlaying);
                        }
                        lastBytes = report.bytesReceived;
                    }
                });
            } catch { }
        }, 400);
    });

    // Data channel - Chat Answers, Fluent + Interrupt (Only for Premium+ Agents)
    const dc = peerConnection.createDataChannel('JanusDataChannel');
    dc.onmessage = (event) => {
        let msg = event.data;
        if (msg.includes('chat/answer')) {
            msg = decodeURIComponent(msg.replace('chat/answer:', ''));
            console.log('Agent:', msg);

            // Store answer in localStorage
            storeAnswer(msg);

            answers.innerHTML += `<div class='agentMessage'> ${msg}</div><br>`;
            answers.scrollTo({ top: answers.scrollHeight + 50, behavior: 'smooth' });
        }
        if (msg.includes('stream/started')) {
            console.log(msg)
            if (isFluent) {
                const m = msg.match(/{.*}/);
                if (m) {
                    const data = JSON.parse(m[0]);
                    currentVideoId = data.metadata.videoId;
                    interruptButton.style.display = 'inline-flex';
                    speechButton.style.display = 'none';
                    actionButton.style.display = 'none';
                }
            }

        }
        if (msg.includes('stream/done')) {
            console.log(msg)
            if (isFluent) {
                currentVideoId = null;
                interruptButton.style.display = 'none';
                speechButton.style.display = 'inline-flex';
                actionButton.style.display = 'inline-flex';
            }
        }
    };

// Interrupt Button logic
    interruptButton.onclick = () => {
        if (!currentVideoId) return;
        console.log('Interrupting video', currentVideoId);
        dc.send(JSON.stringify({ type: 'stream/interrupt', videoId: currentVideoId, timestamp: Date.now() }));
        interruptButton.style.display = 'none';
        speechButton.style.display = 'inline-flex';
        actionButton.style.display = 'inline-flex';
    };

    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send SDP answer (Start a WebRTC connection endpoint)
    console.log('Sending local SDP answer...');
    await fetch(`${DID_API.url}/agents/${agentId}/streams/${streamId}/sdp`, {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, session_id: sessionId })
    });
}
async function chat() {
    if (!peerConnection || !isStreamReady) return;
    const val = textArea.value.trim();
    if (!val) return;
    textArea.value = '';
    console.log('Sending chat text:', val);

    // Store question in localStorage
    storeQuestion(val);

    answers.innerHTML += `<div class='userMessage'> ${val}</div><br>`;
    answers.scrollTo({ top: answers.scrollHeight + 50, behavior: 'smooth' });
    const payload = {
        messages: [{ content: val, role: 'user', created_at: new Date().toISOString() }],
        streamId,
        sessionId
    };
    await fetch(`${DID_API.url}/agents/${agentId}/chat/${chatId}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}
async function speak() {
    if (!peerConnection || !isStreamReady) return;
    const val = textArea.value.trim();
    if (!val) return;
    textArea.value = '';
    console.log('Sending speak text:', val);
    answers.innerHTML += `<div class='agentMessage'> ${val}</div><br>`;
    answers.scrollTo({ top: answers.scrollHeight + 50, behavior: 'smooth' });
    await fetchWithRetry(`${DID_API.url}/agents/${agentId}/streams/${streamId}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: { type: 'text', input: val }, session_id: sessionId })
    });
}



// On page load actions
(async function onPageLoad() {

    // Initialize Q&A counter from localStorage
    initializeQACounter();

    // Focus text area and disable action buttons until connected
    textArea.focus();
    actionButton.setAttribute('disabled', true);
    speechButton.setAttribute('disabled', true);

    // Add event listeners to DOM elements
    textArea.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handleAction(); }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') { event.preventDefault(); switchModes(); }
    });
    connectButton.addEventListener('click', () => connect());
    actionButton.addEventListener('click', handleAction);
    speechButton.addEventListener('click', () => toggleStartStop?.());

    // Show/hide audio mode buttons based on selected option
    document.querySelectorAll('input[name="option"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const audioModeButtons = document.getElementById('audioModeButtons');
            const textAreaPlaceholder = document.getElementById('textArea');

            if (radio.value === 'audio' && radio.checked) {
                audioModeButtons.style.display = 'block';
                textAreaPlaceholder.placeholder = 'Use microphone button — Auto speech-to-text and submit';
            } else if (radio.checked) {
                audioModeButtons.style.display = 'none';
                if (radio.value === 'chat') {
                    textAreaPlaceholder.placeholder = "Write something — 'Chat' replies, 'Speak' repeats.";
                } else {
                    textAreaPlaceholder.placeholder = "Write something — 'Chat' replies, 'Speak' repeats.";
                }
            }
        });
    });

    // Auto-connect for demo
    connectButton.click();
})();

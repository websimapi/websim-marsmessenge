import confetti from "canvas-confetti";

const AI_AVATAR = "icon.png";
const AI_PROMPT_COMPOSER = `You are "Mission Control", a helpful AI assistant on Mars. Your job is to help the user compose a message to send back to another user. Converse with them naturally to understand what they want to say. Help them articulate their thoughts and feelings. Keep your responses concise, friendly, and encouraging. Your name is MC. When you believe the message is complete and the user is ready to send it, end your response with the exact phrase "[READY_TO_TRANSMIT]".`;
const AI_PROMPT_JSON_GENERATOR = `You are a data-structuring AI. Based on the provided conversation history, create a detailed JSON object that captures the essence of the message. The JSON should be comprehensive enough for another AI to perfectly reconstruct the context, tone, and key points of the message. The JSON must have the following structure:
{
  "subject": "A brief subject line for the message.",
  "from_persona": "A description of the sender's persona or tone (e.g., 'A hopeful scientist', 'A lonely colonist').",
  "key_points": [
    "A summary of the first main point.",
    "A summary of the second main point."
  ],
  "emotional_tone": {
    "primary": "e.g., 'hopeful', 'somber', 'excited'",
    "secondary": "e.g., 'nostalgic', 'curious'"
  },
  "full_message_text": "The complete, formatted message that the user wants to send, as composed during the conversation.",
  "raw_conversation_summary": "A summary of the conversation that led to this message."
}
Respond ONLY with the JSON object and no other text.`;
const AI_PROMPT_COURIER = `You are "Message Relay", an AI courier. You have just received a data packet from another planet. Your task is to deliver this message to the user. The data is in JSON format.
First, introduce yourself and explain that a message has arrived after a long journey. Then, deliver the message contained in the \`full_message_text\` field. Deliver it verbatim, as if you are reading a letter from the sender. Use the \`from_persona\` and \`emotional_tone\` to inform your delivery style. After delivering the message, remain available to answer any questions the user might have about it, using the entire JSON object as your context. Your name is MR.`;

const room = new WebsimSocket();

// --- DOM Elements ---
const peersList = document.getElementById('peers-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const finalizeButton = document.getElementById('finalize-button');
const recipientNameSpan = document.getElementById('recipient-name');
const loadingIndicator = document.getElementById('loading-indicator');
const transmissionsList = document.getElementById('transmissions-list');

// --- App State ---
let conversationHistory = [];
let selectedRecipientId = null;
let appMode = 'composing'; // 'composing' or 'receiving'
let isMessageReadyToTransmit = false;

// --- Main Initialization ---
async function initialize() {
    await room.initialize();
    console.log("Room initialized. Client ID:", room.clientId);

    room.subscribePresence(handlePresenceUpdate);
    room.subscribeRoomState(handleRoomStateUpdate);

    resetConversation(AI_PROMPT_COMPOSER, "Welcome to Mars Messenger! I'm Mission Control, or MC for short. Talk to me, and I'll help you compose your message. Who are we sending it to today?");

    sendButton.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    finalizeButton.addEventListener('click', handleFinalizeAndTransmit);

    renderPeers();
}

// --- Conversation & AI ---

function resetConversation(systemPrompt, welcomeMessage) {
    appMode = 'composing';
    conversationHistory = [{
        role: "system",
        content: systemPrompt
    }];
    chatMessages.innerHTML = '';
    addMessageToChat('ai', welcomeMessage, "MC");
    selectedRecipientId = null;
    isMessageReadyToTransmit = false;
    finalizeButton.classList.add('hidden');
    chatInput.placeholder = "Talk to Mission Control to compose your message...";
}

function startReceivingConversation(messageData) {
    appMode = 'receiving';
    chatMessages.innerHTML = '';
    conversationHistory = [{
        role: 'system',
        content: AI_PROMPT_COURIER
    }, {
        role: 'user',
        content: JSON.stringify(messageData, null, 2)
    }];
    chatInput.placeholder = "Talk to Message Relay about the received message...";
    
    addSystemMessage(`Message received from ${room.peers[messageData.from]?.username || 'an unknown sender'}. Handing over to Message Relay...`);
    
    getAiResponse();
}


async function handleSendMessage() {
    const userInput = chatInput.value.trim();
    if (!userInput || loadingIndicator.classList.contains('hidden') === false) return;

    chatInput.value = '';
    addMessageToChat('user', userInput, room.peers[room.clientId]?.username || 'You');
    conversationHistory.push({ role: 'user', content: userInput });

    await getAiResponse();
}

async function getAiResponse() {
    toggleLoading(true);
    try {
        const completion = await websim.chat.completions.create({
            messages: conversationHistory,
        });
        let aiResponse = completion.content;
        
        if (appMode === 'composing' && aiResponse.includes('[READY_TO_TRANSMIT]')) {
            aiResponse = aiResponse.replace('[READY_TO_TRANSMIT]', '').trim();
            conversationHistory.push({ role: 'assistant', content: aiResponse });
            addMessageToChat('ai', aiResponse, 'MC');
            
            // Use a slight delay so the user can read the AI's final message
            // handleFinalizeAndTransmit will now manage the logic from here.
            setTimeout(() => {
                handleFinalizeAndTransmit();
            }, 1000);

        } else {
            conversationHistory.push(completion);
            const aiName = appMode === 'composing' ? 'MC' : 'MR';
            addMessageToChat('ai', aiResponse, aiName);
            toggleLoading(false); // Turn off loader on normal response
        }

    } catch (error) {
        console.error("Error getting AI response:", error);
        addMessageToChat('ai', "I seem to be having trouble connecting... please try again later.", "System");
        toggleLoading(false); // Turn off loader on error
    }
}


// --- UI Rendering ---

function renderPeers() {
    if (!room.peers || !room.clientId) return;
    
    peersList.innerHTML = '';
    
    // Use Object.keys to get peer IDs, as the peer object itself doesn't contain the ID.
    const peerIds = Object.keys(room.peers);

    // Sort peers to show the current user first, then alphabetically.
    peerIds.sort((a, b) => {
        if (a === room.clientId) return -1;
        if (b === room.clientId) return 1;
        return room.peers[a].username.localeCompare(room.peers[b].username);
    });
    
    peerIds.forEach(peerId => {
        const peer = room.peers[peerId];
        const li = document.createElement('li');
        li.dataset.peerId = peerId;
        
        const isMe = peerId === room.clientId;
        if (isMe) {
            li.className = 'peer-list-item-me';
            li.innerHTML = `<img src="${peer.avatarUrl}" class="peer-avatar"> ${peer.username} (You)`;
        } else {
            li.className = 'peer-list-item';
            li.innerHTML = `<img src="${peer.avatarUrl}" class="peer-avatar"> ${peer.username}`;
        }
        
        if (peerId === selectedRecipientId) {
            li.classList.add('selected');
        }
        
        // Add click listener to all peers, including self, to allow sending to anyone.
        li.addEventListener('click', () => selectRecipient(peerId, peer.username));
        peersList.appendChild(li);
    });
}

function selectRecipient(peerId, username) {
    if (appMode !== 'composing') {
        addSystemMessage("You must finish with the current received message before composing a new one. Type 'new message' to start over.");
        if (conversationHistory.slice(-1)[0].content.toLowerCase().includes('new message')) {
             resetConversation(AI_PROMPT_COMPOSER, "Let's compose a new message. Who is this one for?");
        }
        return;
    }
    selectedRecipientId = peerId;
    recipientNameSpan.textContent = username;
    finalizeButton.classList.remove('hidden');
    renderPeers();

    if (isMessageReadyToTransmit) {
        addSystemMessage(`Recipient ${username} selected. Initiating transmission...`);
        setTimeout(() => handleFinalizeAndTransmit(), 500);
    }
}

function addMessageToChat(sender, text, username) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${sender}`;

    const avatarUrl = sender === 'user'
        ? room.peers[room.clientId]?.avatarUrl
        : AI_AVATAR;

    messageEl.innerHTML = `
        <img src="${avatarUrl}" alt="${username} avatar" class="avatar">
        <div class="message-content">
            <div class="message-sender">${username}</div>
            <div class="message-text"></div>
        </div>
    `;
    messageEl.querySelector('.message-text').innerText = text;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
     const systemMessageEl = document.createElement('div');
    systemMessageEl.className = 'system-message';
    systemMessageEl.textContent = text;
    chatMessages.appendChild(systemMessageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


function toggleLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
        sendButton.disabled = true;
        chatInput.disabled = true;
    } else {
        loadingIndicator.classList.add('hidden');
        sendButton.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

function renderTransmissions() {
    const transmissions = room.roomState.transmissions || {};
    const transmissionValues = Object.values(transmissions);

    if (Object.keys(transmissionValues).length === 0) {
        transmissionsList.innerHTML = '<p class="no-transmissions">No active transmissions.</p>';
        return;
    }

    transmissionsList.innerHTML = '';

    for (const id in transmissions) {
        const tx = transmissions[id];
        if (!tx) continue;

        const isOutgoing = tx.from === room.clientId;
        const peerId = isOutgoing ? tx.to : tx.from;
        const peer = room.peers[peerId];
        const peerName = peer ? peer.username : 'Unknown';

        const chunksReceivedCount = Object.keys(tx.chunks || {}).length;
        const progress = tx.totalChunks > 0 ? (chunksReceivedCount / tx.totalChunks) * 100 : 0;
        
        const el = document.createElement('div');
        el.className = 'transmission-item';
        el.id = `tx-${id}`;
        
        el.innerHTML = `
            <p>${isOutgoing ? '⬆️ Outgoing to' : '⬇️ Incoming from'} <strong>${peerName}</strong></p>
            <p>Subject: <em>${tx.metadata.subject || '...'}</em></p>
            <p>Progress: ${chunksReceivedCount} / ${tx.totalChunks} packets</p>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progress}%"></div>
            </div>
        `;
        transmissionsList.appendChild(el);
    }
}


// --- Multiplayer Logic ---

function handlePresenceUpdate() {
    renderPeers();
    renderTransmissions(); // Rerender in case usernames appeared
}

function handleRoomStateUpdate() {
    renderTransmissions();
    checkForCompletedTransmissions();
}

async function handleFinalizeAndTransmit() {
    if (finalizeButton.disabled) return;

    if (!selectedRecipientId) {
        isMessageReadyToTransmit = true;
        addSystemMessage("Message is ready. Please select a recipient from the list on the left to begin transmission.");
        toggleLoading(false); // Turn off loading while we wait for user.
        return;
    }

    finalizeButton.disabled = true;
    finalizeButton.textContent = 'Generating Data Packet...';
    toggleLoading(true);

    try {
        const jsonPrompt = {
            role: 'user',
            content: `Here is the conversation history:\n\n${JSON.stringify(conversationHistory)}`
        };
        const completion = await websim.chat.completions.create({
            messages: [
                { role: 'system', content: AI_PROMPT_JSON_GENERATOR },
                jsonPrompt
            ],
            json: true,
        });

        const jsonPayload = JSON.parse(completion.content);
        addSystemMessage("Data packet generated. Beginning transmission...");
        startTransmission(JSON.stringify(jsonPayload), selectedRecipientId);
        
        // Reset for next message
        setTimeout(() => {
           resetConversation(AI_PROMPT_COMPOSER, "Transmission initiated! That will take a while. Ready to compose another message?");
        }, 2000);

    } catch (error) {
        console.error("Error generating JSON payload:", error);
        addSystemMessage("Error: Could not generate data packet. Please try again.");
        toggleLoading(false);
        finalizeButton.disabled = false;
        finalizeButton.textContent = `Finalize & Transmit to ${recipientNameSpan.textContent}`;
    }
}

function startTransmission(jsonString, recipientId) {
    const messageId = `tx_${room.clientId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
    const chunks = jsonString.match(/.{1,50}/g) || []; // Split into 50-char chunks
    const totalChunks = chunks.length;

    if (totalChunks === 0) return;

    const durationMinutes = Math.random() * (22 - 3) + 3; // 3 to 22 minutes
    const durationMs = durationMinutes * 60 * 1000;
    const delayPerChunk = durationMs / totalChunks;
    
    const tempParsedJsonForSubject = JSON.parse(jsonString);

    // Initial state update
    room.updateRoomState({
        transmissions: {
            [messageId]: {
                from: room.clientId,
                to: recipientId,
                totalChunks: totalChunks,
                chunks: {},
                metadata: {
                    subject: tempParsedJsonForSubject.subject || "Untitled Message"
                }
            }
        }
    });

    // Send chunks over time
    chunks.forEach((chunk, i) => {
        setTimeout(() => {
            room.updateRoomState({
                transmissions: {
                    [messageId]: {
                        chunks: {
                            [i]: chunk
                        }
                    }
                }
            });
        }, (i + 1) * delayPerChunk);
    });
}

function checkForCompletedTransmissions() {
    const transmissions = room.roomState.transmissions || {};
    for (const id in transmissions) {
        const tx = transmissions[id];
        if (!tx || tx.to !== room.clientId) continue;

        const chunksReceivedCount = Object.keys(tx.chunks || {}).length;
        if (chunksReceivedCount > 0 && chunksReceivedCount === tx.totalChunks) {
            
            // Reconstruct and process
            const chunkEntries = Object.entries(tx.chunks);
            // sort by key (which is the index '0', '1', '2' etc)
            chunkEntries.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
            const jsonString = chunkEntries.map(entry => entry[1]).join('');

            try {
                const messageData = JSON.parse(jsonString);
                messageData.from = tx.from; // Add sender info
                
                // Show confetti
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                
                // Start the receiving conversation
                startReceivingConversation(messageData);

                // Clean up the completed transmission
                room.updateRoomState({
                    transmissions: { [id]: null }
                });

            } catch(e) {
                console.error("Failed to parse received message", e);
                 room.updateRoomState({
                    transmissions: { [id]: null }
                });
            }
        }
    }
}


// --- Start the app ---
initialize();
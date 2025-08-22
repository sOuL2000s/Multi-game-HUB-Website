// This script handles the client-side WebSocket connection and message routing.
// It relies on a separate Node.js WebSocket server (`server/server.js`) to be running.
// This version integrates Firebase Authentication to send ID tokens to the backend.

let socket = null;
let myPlayerColor = null; // Assigned by the server (e.g., 'red', 'blue', 'white', 'black')
let currentGame = null;   // Stores the current game ('ludo', 'chess', 'uno', 'monopoly')
let currentUserUID = null; // Firebase User ID
let currentUserDisplayName = null; // Firebase User Display Name
const PING_INTERVAL = 30000; // Send a ping every 30 seconds
let pingTimeout;

// Function called by game-specific JS files (e.g., ludo.js, chess.js)
async function connectToPvPServer() {
    // Ensure Firebase Auth is initialized and user is logged in
    const user = firebase.auth().currentUser;
    if (!user) {
        alert("Please log in to play online PvP!");
        return;
    }

    currentUserUID = user.uid;
    currentUserDisplayName = user.displayName || user.email; // Fallback to email

    const authToken = await user.getIdToken(); // Get the Firebase ID token

    // Determine current game from URL
    const pathSegments = window.location.pathname.split('/');
    currentGame = pathSegments[pathSegments.length - 1].replace('.html', '');

    const wsUrl = 'ws://localhost:8080'; // Configure this to your backend server address

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Already connected to WebSocket.");
        // If already connected, just ensure we send a join_game for the current game
        if (currentGame) sendGameAction('join_game', { game: currentGame, authToken: authToken });
        return;
    }

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = (event) => {
            console.log('Connected to WebSocket server:', event);
            // First, authenticate with the server
            sendGameAction('authenticate', { authToken: authToken });
            // Start sending pings to keep the connection alive
            startHeartbeat();
        };

        socket.onmessage = (event) => {
            resetHeartbeat(); // Reset timeout on message received
            const message = JSON.parse(event.data);
            // console.log('Received message:', message); // Uncomment for verbose logging

            // Handle authentication confirmation
            if (message.type === 'authenticated') {
                console.log(`Authenticated as ${message.displayName} (${message.uid})`);
                // Once authenticated, join the game room
                if (currentGame) {
                    sendGameAction('join_game', { game: currentGame });
                }
                return; // Don't process other messages until 'join_game' response
            }

            // Forward game-specific messages to the relevant game logic
            if (message.game === 'ludo' && typeof window.handleLudoServerMessage === 'function') {
                window.handleLudoServerMessage(message);
            } else if (message.game === 'chess' && typeof window.handleChessServerMessage === 'function') {
                window.handleChessServerMessage(message);
            } else if (message.game === 'uno' && typeof window.handleUnoServerMessage === 'function') {
                window.handleUnoServerMessage(message);
            } else if (message.game === 'monopoly' && typeof window.handleMonopolyServerMessage === 'function') {
                window.handleMonopolyServerMessage(message);
            } else { // Handle common messages like chat, player assignment for all games
                const gameStatusDiv = document.getElementById('game-status');
                const chatMessagesDiv = document.getElementById('chat-messages');
                const playerTurnInfoDiv = document.getElementById('player-turn-info');

                switch (message.type) {
                    case 'player_assigned':
                        myPlayerColor = message.color;
                        if (gameStatusDiv) gameStatusDiv.textContent = `Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`;
                        if (playerTurnInfoDiv) playerTurnInfoDiv.textContent = `You are playing as ${myPlayerColor.toUpperCase()}.`;
                        break;
                    case 'game_start':
                        if (gameStatusDiv) gameStatusDiv.textContent = `Game started! ${message.startingPlayer.toUpperCase()} goes first!`;
                        break;
                    case 'waiting_for_opponent':
                        if (gameStatusDiv) gameStatusDiv.textContent = message.message;
                        break;
                    case 'chat_message':
                        if (chatMessagesDiv) {
                            chatMessagesDiv.innerHTML += `<div><strong>${message.sender}:</strong> ${message.text}</div>`;
                            chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom
                        }
                        break;
                    case 'error':
                        if (gameStatusDiv) {
                            gameStatusDiv.textContent = `Server Error: ${message.message}`;
                            gameStatusDiv.style.color = 'red';
                        }
                        break;
                    case 'opponent_left':
                        if (gameStatusDiv) {
                            gameStatusDiv.textContent = 'Your opponent disconnected! Game ended.';
                            gameStatusDiv.style.color = 'orange';
                        }
                        // Optionally disable game controls, offer rematch etc.
                        break;
                    case 'pong': // Server acknowledged ping
                        // console.log('Pong received');
                        break;
                    default:
                        console.log('Unhandled common message type:', message.type, 'for game:', message.game);
                }
            }
        };

        socket.onclose = (event) => {
            console.log('Disconnected from WebSocket server:', event);
            clearTimeout(pingTimeout); // Stop heartbeat on disconnect
            if (document.getElementById('game-status')) {
                document.getElementById('game-status').textContent = 'Disconnected from PvP server.';
                document.getElementById('game-status').style.color = 'red';
            }
            // Implement reconnection logic if desired
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            clearTimeout(pingTimeout); // Stop heartbeat on error
            if (document.getElementById('game-status')) {
                document.getElementById('game-status').textContent = 'WebSocket error. Check console or server status.';
                document.getElementById('game-status').style.color = 'red';
            }
        };
    } catch (e) {
        console.error("Failed to connect WebSocket:", e);
        if (document.getElementById('game-status')) {
            document.getElementById('game-status').textContent = 'Failed to connect to PvP server. Is the server running?';
            document.getElementById('game-status').style.color = 'red';
        }
    }
}

// Function to send moves/actions to the server
function sendGameAction(actionType, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: actionType,
            game: currentGame, // The game this action pertains to
            authToken: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null, // Send UID for server
            payload: payload
        }));
    } else {
        console.warn('WebSocket not connected. Cannot send action.');
        if (document.getElementById('game-status')) {
            document.getElementById('game-status').textContent = 'Not connected to PvP server for this action.';
            document.getElementById('game-status').style.color = 'red';
        }
    }
}

// Heartbeat functions to keep the WebSocket connection alive
function startHeartbeat() {
    clearTimeout(pingTimeout); // Clear any existing timeout
    pingTimeout = setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
            startHeartbeat(); // Schedule next ping
        }
    }, PING_INTERVAL);
}

function resetHeartbeat() {
    clearTimeout(pingTimeout);
    startHeartbeat();
}


// Event listener for chat sending
document.addEventListener('DOMContentLoaded', () => {
    const sendChatBtn = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');

    if (sendChatBtn && chatInput) {
        sendChatBtn.addEventListener('click', () => {
            const messageText = chatInput.value.trim();
            if (messageText) {
                sendGameAction('chat_message', { text: messageText }); // Server will get sender from authenticated user
                chatInput.value = '';
            }
        });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatBtn.click();
            }
        });
    }
});

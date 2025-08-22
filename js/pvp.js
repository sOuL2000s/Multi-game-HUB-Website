// This is conceptual. You'd need a server to run a WebSocket server.
// For real online multiplayer, you MUST have a backend server
// that manages game state, player connections, and message routing.

let socket = null;
let myPlayerColor = null; // Assigned by the server (e.g., 'red', 'blue', 'white', 'black')
let currentGame = null;   // To keep track of which game we are currently playing ('ludo', 'chess', 'uno', 'monopoly')

// Function called by game-specific JS files (e.g., ludo.js, chess.js)
function connectToPvPServer() {
    // IMPORTANT: Replace with your actual WebSocket server URL
    // For local testing, you might use 'ws://localhost:8080' or 'ws://127.0.0.1:8080'
    // For a deployed server, use 'wss://your-game-server.com/ws' (secure WebSocket)
    const wsUrl = 'ws://localhost:8080'; // Placeholder - CHANGE THIS FOR PRODUCTION!

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Already connected to WebSocket.");
        // If already connected, just ensure we send a join_game for the current game
        if (currentGame) sendGameAction('join_game', { game: currentGame });
        return;
    }

    // Determine current game from URL
    const pathSegments = window.location.pathname.split('/');
    currentGame = pathSegments[pathSegments.length - 1].replace('.html', '');

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = (event) => {
            console.log('Connected to WebSocket server:', event);
            // Send a message to join the specific game
            if (currentGame) {
                sendGameAction('join_game', { game: currentGame });
            }
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

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

                switch (message.type) {
                    case 'player_assigned':
                        myPlayerColor = message.color;
                        if (gameStatusDiv) gameStatusDiv.textContent = `Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`;
                        break;
                    case 'game_start':
                        if (gameStatusDiv) gameStatusDiv.textContent = `Game started! ${message.startingPlayer.toUpperCase()} goes first!`;
                        // A game-specific handler will then update its board based on initial state.
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
                            gameStatusDiv.textContent = 'Your opponent disconnected!';
                            gameStatusDiv.style.color = 'orange';
                        }
                        // Disable game controls, offer rematch etc.
                        break;
                    default:
                        console.log('Unhandled message type:', message.type);
                }
            }
        };

        socket.onclose = (event) => {
            console.log('Disconnected from WebSocket server:', event);
            if (document.getElementById('game-status')) {
                document.getElementById('game-status').textContent = 'Disconnected from PvP server.';
                document.getElementById('game-status').style.color = 'red';
            }
            // Implement reconnection logic if desired
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
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
            playerColor: myPlayerColor, // Send your assigned color
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

// Event listener for chat sending
document.addEventListener('DOMContentLoaded', () => {
    const sendChatBtn = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');

    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', () => {
            const messageText = chatInput.value.trim();
            if (messageText) {
                sendGameAction('chat_message', { text: messageText, sender: myPlayerColor || 'Guest' });
                chatInput.value = '';
            }
        });
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendChatBtn.click();
                }
            });
        }
    }
});

// Note: Each game's JavaScript (e.g., ludo.js, chess.js) must
// define a global function like `window.handleLudoServerMessage(message)`
// for pvp.js to dispatch server messages to it.

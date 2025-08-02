// This is conceptual. You'd need a server to run a WebSocket server.
let socket = null;
let myPlayerColor = null; // Assigned by the server (e.g., 'red', 'blue')

// Function called by ludo.js (and would be by other game's JS files)
function connectToPvPServer() {
    // IMPORTANT: Replace with your actual WebSocket server URL
    // For local testing, you might use 'ws://localhost:8080'
    const wsUrl = 'ws://your-game-server.com:8080';

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Already connected to WebSocket.");
        return;
    }

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = (event) => {
            console.log('Connected to WebSocket server:', event);
            // Example: Send a message to join a Ludo game
            sendGameAction('join_game', { game: 'ludo' });
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            // You would dispatch these messages to the relevant game logic (ludo.js, chess.js etc.)
            // Example: if (message.game === 'ludo') LudoGame.handleServerMessage(message);
            // For now, let's handle some common ones directly here or mock.

            if (document.getElementById('game-status')) { // Check if on a game page
                switch (message.type) {
                    case 'player_assigned':
                        myPlayerColor = message.color;
                        document.getElementById('game-status').textContent = `Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`;
                        // In a real game, you'd then update UI to show it's your turn etc.
                        break;
                    case 'game_start':
                        document.getElementById('game-status').textContent = `Game started! ${message.startingPlayer.toUpperCase()} goes first!`;
                        // This would trigger the actual game initialization/state update based on server data
                        // For Ludo: LudoGame.initializeOnlineGame(message.initialState);
                        break;
                    case 'game_state_update':
                        // This is the most crucial part for PvP.
                        // The server sends the new game state after a move.
                        // You need to update your local game board/pieces/dice based on message.gameState
                        // Example: LudoGame.updateGameState(message.gameState);
                        document.getElementById('game-status').textContent = `Game state updated. It's ${message.currentTurn.toUpperCase()}'s turn.`;
                        // If it's your turn, enable your controls.
                        break;
                    case 'chat_message':
                        const chatMessagesDiv = document.getElementById('chat-messages');
                        if (chatMessagesDiv) {
                            chatMessagesDiv.innerHTML += `<div><strong>${message.sender}:</strong> ${message.text}</div>`;
                            chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom
                        }
                        break;
                    case 'error':
                        document.getElementById('game-status').textContent = `Server Error: ${message.message}`;
                        document.getElementById('game-status').style.color = 'red';
                        break;
                    case 'opponent_left':
                        document.getElementById('game-status').textContent = 'Your opponent disconnected!';
                        document.getElementById('game-status').style.color = 'orange';
                        // Disable game controls, offer rematch etc.
                        break;
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
            game: 'ludo', // This would be dynamic based on the current game
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

// Event listener for chat sending (example)
document.addEventListener('DOMContentLoaded', () => {
    const sendChatBtn = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');

    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', () => {
            const messageText = chatInput.value.trim();
            if (messageText) {
                sendGameAction('chat_message', { text: messageText });
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

// To actually integrate with a game, you'd modify game logic
// to call `sendGameAction` when a player makes a move,
// and to react to `game_state_update` messages from the server.
// Example: In ludo.js, instead of `executeMove(selectedMove);`, you might call
// `sendGameAction('make_move', { tokenId: selectedMove.token.id, newPos: selectedMove.newPathIdx });`
// And `ludo.js` would have a function like `handleServerUpdate(gameState)` that renders the board.

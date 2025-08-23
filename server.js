// server.js - Multiplayer Game Hub Backend
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server started on port 8080');

// Global state for active games and connected clients
const games = {}; // Stores active game instances: { gameId: { type: 'ludo', players: {}, state: {}, ... } }
const clients = new Map(); // Stores WebSocket connections: { clientId: WebSocket }
let nextClientId = 1;
let nextGameId = 1;

/**
 * Game state structure example:
 * games = {
 *   'game1': {
 *     id: 'game1',
 *     type: 'ludo', // 'ludo', 'monopoly', 'uno', 'chess'
 *     players: {
 *       'clientId1': { name: 'Player1', color: 'red', ws: WebSocket },
 *       'clientId2': { name: 'Player2', color: 'blue', ws: WebSocket }
 *     },
 *     state: {
 *       // This is where the FULL game state (board, cards, turns, scores, etc.) for Ludo, Monopoly, etc.
 *       // would be stored, managed, and updated by the server's game logic.
 *       // Example for Ludo:
 *       ludo: {
 *          players: [ // Simplified version of frontend ludo.players
 *              { id: 'clientId1', name: 'Player1', color: 'red', tokens: [{id:0, position:-1, finished:false}, ...], finishedTokens: 0 },
 *              // ... other players
 *          ],
 *          currentPlayerIndex: 0,
 *          diceRoll: 0,
 *          selectedToken: null,
 *          consecutiveSixes: 0,
 *          // etc.
 *       }
 *     },
 *     turnOrder: ['clientId1', 'clientId2'], // Order of turns
 *     currentPlayerTurnId: 'clientId1',
 *     ownerId: 'clientId1', // Who created the game
 *     status: 'waiting', // 'waiting', 'playing', 'finished'
 *     maxPlayers: 4 // Max players for this game type
 *   }
 * }
 */


// --- Helper Functions for Broadcasting ---

/**
 * Sends a message to a specific client.
 * @param {string} clientId The ID of the client.
 * @param {object} message The message object to send.
 */
function sendToClient(clientId, message) {
    const clientWs = clients.get(clientId);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(message));
    }
}

/**
 * Sends a message to all players in a specific game.
 * @param {string} gameId The ID of the game.
 * @param {object} message The message object to send.
 * @param {string|null} excludeClientId An optional client ID to exclude from receiving the message.
 */
function broadcastToGame(gameId, message, excludeClientId = null) {
    const game = games[gameId];
    if (game && game.players) {
        for (const clientId in game.players) {
            if (clientId !== excludeClientId) {
                sendToClient(clientId, message);
            }
        }
    }
}

/**
 * Sends a lobby update to all currently connected clients.
 * This lets clients know which games are available.
 */
function sendLobbyUpdate() {
    const availableGames = Object.values(games)
        .filter(game => game.status === 'waiting')
        .map(game => ({
            id: game.id,
            type: game.type,
            owner: game.players[game.ownerId]?.name || 'Unknown',
            currentPlayers: Object.keys(game.players).length,
            maxPlayers: game.maxPlayers
        }));

    clients.forEach((ws, clientId) => {
        sendToClient(clientId, { type: 'LOBBY_UPDATE', games: availableGames });
    });
}


// --- Game Logic Placeholders (THIS IS WHERE YOU'D IMPLEMENT THE FULL GAME RULES) ---
// IMPORTANT: The complete game logic from your frontend HTML for Ludo, Monopoly, Uno, Chess
// needs to be adapted and moved here, to ensure server-side authority.
// This is a *major undertaking* for four complex games and cannot be provided in a single response.
// I'll provide a simplified Ludo example to illustrate the concept.

const SERVER_GAME_LOGIC = {
    // Ludo Game Logic (Simplified Example)
    ludo: {
        // Initial setup for server-side Ludo state
        initGameState: (playerClientIds, playerNames) => {
            // This structure should mirror your frontend `ludo` state, but simplified for the server
            const LUDO_SERVER_COLORS = ['red', 'blue', 'green', 'yellow'];
            const LUDO_SERVER_TOKENS_PER_PLAYER = 4;
            const players = playerClientIds.map((clientId, i) => ({
                id: clientId,
                name: playerNames[clientId],
                color: LUDO_SERVER_COLORS[i % LUDO_SERVER_COLORS.length],
                tokens: Array(LUDO_SERVER_TOKENS_PER_PLAYER).fill(0).map((_, tid) => ({
                    id: tid,
                    position: -1, // -1 means home
                    finished: false
                })),
                finishedTokens: 0,
                rollsWithoutMove: 0
            }));

            return {
                players: players,
                currentPlayerIndex: 0,
                diceRoll: 0,
                state: 'await_roll', // 'await_roll', 'await_move', 'game_over'
                selectedToken: null,
                consecutiveSixes: 0,
                turnOrder: playerClientIds,
                // ... any other ludo specific state
            };
        },

        // Validate a Ludo dice roll (server-side)
        validateRoll: (gameId, clientId) => {
            const game = games[gameId];
            if (!game || game.state.ludo.state !== 'await_roll') return false;
            if (game.state.ludo.players[game.state.ludo.currentPlayerIndex].id !== clientId) return false;
            return true;
        },

        // Apply a Ludo dice roll (server-side)
        applyRoll: (gameId) => {
            const game = games[gameId];
            const ludoState = game.state.ludo;
            const currentPlayer = ludoState.players[ludoState.currentPlayerIndex];

            ludoState.diceRoll = Math.floor(Math.random() * 6) + 1;

            if (ludoState.diceRoll === 6) {
                ludoState.consecutiveSixes++;
                if (ludoState.consecutiveSixes === 3) {
                    // Three 6s rule: skip turn
                    ludoState.consecutiveSixes = 0;
                    ludoState.state = 'await_roll';
                    SERVER_GAME_LOGIC.ludo.nextTurn(gameId); // Skip turn
                    return { message: `${currentPlayer.name} rolled three 6s! Turn skipped.`, newRoll: ludoState.diceRoll, turnSkipped: true };
                }
            } else {
                ludoState.consecutiveSixes = 0;
            }

            // Implement `getLudoPossibleMoves` from your frontend Ludo game here (adapted for server state)
            const possibleMoves = SERVER_GAME_LOGIC.ludo.getPossibleMoves(currentPlayer, ludoState.diceRoll); // Placeholder

            if (possibleMoves.length === 0) {
                currentPlayer.rollsWithoutMove++;
                if (ludoState.diceRoll !== 6 || currentPlayer.rollsWithoutMove >= 3) {
                    // No moves, and not a 6 (or 3 rolls with no moves) -> skip turn
                    ludoState.state = 'await_roll';
                    SERVER_GAME_LOGIC.ludo.nextTurn(gameId);
                    return { message: `${currentPlayer.name} rolled ${ludoState.diceRoll}, but has no moves. Turn skipped.`, newRoll: ludoState.diceRoll, turnSkipped: true };
                } else if (ludoState.diceRoll === 6) {
                    // Rolled 6 but no moves, gets another roll
                    ludoState.state = 'await_roll'; // Player can roll again
                    return { message: `${currentPlayer.name} rolled a 6 but has no moves. Roll again!`, newRoll: ludoState.diceRoll, anotherRoll: true };
                }
            } else {
                currentPlayer.rollsWithoutMove = 0;
                ludoState.state = 'await_move'; // Awaiting player to select token
            }
            return { message: `${currentPlayer.name} rolled ${ludoState.diceRoll}.`, newRoll: ludoState.diceRoll, needsMove: true };
        },

        // Validate a Ludo token move (server-side)
        validateMove: (gameId, clientId, payload) => {
            const game = games[gameId];
            if (!game || game.state.ludo.state !== 'await_move') return false;
            const ludoState = game.state.ludo;
            const currentPlayer = ludoState.players[ludoState.currentPlayerIndex];
            if (currentPlayer.id !== clientId) return false;

            const { tokenId } = payload;
            const token = currentPlayer.tokens.find(t => t.id === tokenId);
            if (!token) return false;

            // Re-calculate possible moves on server to validate client's chosen token
            const possibleMoves = SERVER_GAME_LOGIC.ludo.getPossibleMoves(currentPlayer, ludoState.diceRoll); // Placeholder
            const chosenMove = possibleMoves.find(move => move.tokenId === tokenId);
            if (!chosenMove) return false; // Token is not valid to move for this roll

            return { token, chosenMove }; // Return token and move object if valid
        },

        // Apply a Ludo token move (server-side)
        applyMove: (gameId, clientId, token, chosenMove) => {
            const game = games[gameId];
            const ludoState = game.state.ludo;
            const currentPlayer = ludoState.players[ludoState.currentPlayerIndex];
            let message = '';
            let hadCapture = false;
            let getsAnotherTurn = false;

            // Simplified: Implement actual Ludo board path, safe spots, and capture logic here
            // This is complex and needs to mirror frontend `getLudoVisualPosition` and `isLudoGlobalSafeSpot`
            // Example:
            // const globalTargetCoord = SERVER_GAME_LOGIC.ludo.getVisualPosition(currentPlayer.color, chosenMove.newPosition); // Placeholder
            // if (globalTargetCoord && !SERVER_GAME_LOGIC.ludo.isGlobalSafeSpot(globalTargetCoord.r, globalTargetCoord.c)) { // Placeholder
            //     // Check for and handle captures
            // }

            // For now, simple move:
            if (token.position === -1 && ludoState.diceRoll === 6) {
                token.position = 0; // Move to start
                message = `${currentPlayer.name}'s token ${token.id + 1} moved out of home!`;
                getsAnotherTurn = true; // Gets another turn for moving out of home
            } else if (token.position !== -1) {
                token.position = chosenMove.newPosition;
                message = `${currentPlayer.name}'s token ${token.id + 1} moved.`;
                // Check for win condition, captures, etc.
                if (chosenMove.finish) {
                    token.finished = true;
                    currentPlayer.finishedTokens++;
                    message += ` Token ${token.id + 1} finished!`;
                }
            }

            if (currentPlayer.finishedTokens === LUDO_SERVER_TOKENS_PER_PLAYER) { // Placeholder token count
                game.status = 'finished';
                ludoState.state = 'game_over';
                message += ` ${currentPlayer.name} wins the Ludo game!`;
            } else {
                if (ludoState.diceRoll === 6 || getsAnotherTurn || hadCapture) { // Simplified logic
                    ludoState.state = 'await_roll'; // Another turn
                } else {
                    SERVER_GAME_LOGIC.ludo.nextTurn(gameId);
                }
            }
            return { message, gameEnded: ludoState.state === 'game_over', anotherTurn: getsAnotherTurn };
        },

        // Placeholder for advancing turn
        nextTurn: (gameId) => {
            const game = games[gameId];
            const ludoState = game.state.ludo;
            ludoState.currentPlayerIndex = (ludoState.currentPlayerIndex + 1) % ludoState.players.length;
            ludoState.state = 'await_roll';
            ludoState.consecutiveSixes = 0; // Reset for new player
            ludoState.diceRoll = 0; // Reset dice display
            ludoState.selectedToken = null;
        },

        // --- Actual game logic from frontend would be here, e.g.: ---
        // getPossibleMoves: (player, roll) => { /* ... full logic ... */ },
        // getVisualPosition: (playerColor, position) => { /* ... full logic ... */ },
        // isGlobalSafeSpot: (r, c) => { /* ... full logic ... */ }
    },

    monopoly: {
        initGameState: (playerClientIds, playerNames) => { /* ... */ return {}; },
        validateRoll: (gameId, clientId) => true, // Placeholder
        applyRoll: (gameId) => { /* ... */ return {}; },
        validateMove: (gameId, clientId, payload) => true, // Placeholder (e.g. buy property)
        applyMove: (gameId, clientId, payload) => { /* ... */ return {}; },
        nextTurn: (gameId) => { /* ... */ }
    },

    uno: {
        initGameState: (playerClientIds, playerNames) => { /* ... */ return {}; },
        validatePlayCard: (gameId, clientId, payload) => true, // Placeholder
        applyPlayCard: (gameId, clientId, payload) => { /* ... */ return {}; },
        validateDrawCard: (gameId, clientId) => true, // Placeholder
        applyDrawCard: (gameId) => { /* ... */ return {}; },
        validateWildColorSelection: (gameId, clientId, payload) => true, // Placeholder
        applyWildColorSelection: (gameId, clientId, payload) => { /* ... */ return {}; },
        nextTurn: (gameId) => { /* ... */ }
    },

    chess: {
        initGameState: (playerClientIds, playerNames) => { /* ... */ return {}; },
        validateMove: (gameId, clientId, payload) => true, // Placeholder
        applyMove: (gameId, clientId, payload) => { /* ... */ return {}; },
        nextTurn: (gameId) => { /* ... */ }
    }
};


// --- WebSocket Connection Handling ---

wss.on('connection', ws => {
    const clientId = `client${nextClientId++}`;
    clients.set(clientId, ws);
    console.log(`Client ${clientId} connected.`);

    sendToClient(clientId, { type: 'CONNECTED', clientId: clientId });
    sendLobbyUpdate(); // Send initial lobby info to new client

    ws.on('message', message => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            console.log(`Received from ${clientId}:`, parsedMessage);

            switch (parsedMessage.type) {
                case 'CREATE_GAME': {
                    const { gameType, playerName, maxPlayers } = parsedMessage;
                    const gameId = `game${nextGameId++}`;
                    
                    const playerClientIds = [clientId];
                    const playerNames = { [clientId]: playerName };

                    games[gameId] = {
                        id: gameId,
                        type: gameType,
                        players: {
                            [clientId]: { name: playerName, ws: ws, clientId: clientId, isOwner: true }
                        },
                        state: SERVER_GAME_LOGIC[gameType]?.initGameState(playerClientIds, playerNames) || { message: 'Game state not initialized' },
                        turnOrder: [clientId], // Initial turn order
                        currentPlayerTurnId: clientId,
                        ownerId: clientId,
                        status: 'waiting',
                        maxPlayers: maxPlayers || 2 // Default max players if not provided
                    };
                    sendToClient(clientId, { type: 'GAME_CREATED', gameId: gameId, game: games[gameId] });
                    console.log(`Game ${gameId} (${gameType}) created by ${playerName}.`);
                    sendLobbyUpdate();
                    break;
                }

                case 'JOIN_GAME': {
                    const { gameId, playerName } = parsedMessage;
                    const game = games[gameId];

                    if (!game || game.status !== 'waiting' || Object.keys(game.players).length >= game.maxPlayers) {
                        sendToClient(clientId, { type: 'ERROR', message: 'Cannot join game: full or not found.' });
                        return;
                    }

                    game.players[clientId] = { name: playerName, ws: ws, clientId: clientId, isOwner: false };
                    game.turnOrder.push(clientId); // Add to turn order
                    
                    // Re-initialize game state with all players now.
                    const currentClientIds = Object.keys(game.players);
                    const currentClientNames = {};
                    currentClientIds.forEach(id => currentClientNames[id] = game.players[id].name);
                    game.state = SERVER_GAME_LOGIC[game.type]?.initGameState(currentClientIds, currentClientNames) || { message: 'Game state not initialized' };


                    broadcastToGame(gameId, { type: 'PLAYER_JOINED', game: game, newPlayerId: clientId });
                    sendToClient(clientId, { type: 'GAME_JOINED', game: game });
                    console.log(`Client ${clientId} (${playerName}) joined game ${gameId}.`);

                    if (Object.keys(game.players).length === game.maxPlayers) {
                        game.status = 'playing';
                        broadcastToGame(gameId, { type: 'GAME_STARTED', gameId: gameId, game: game });
                        console.log(`Game ${gameId} started with ${game.maxPlayers} players.`);
                    }
                    sendLobbyUpdate();
                    break;
                }

                case 'LEAVE_GAME': {
                    const { gameId } = parsedMessage;
                    const game = games[gameId];
                    if (game) {
                        delete game.players[clientId];
                        game.turnOrder = game.turnOrder.filter(id => id !== clientId);

                        if (Object.keys(game.players).length === 0) {
                            delete games[gameId];
                            console.log(`Game ${gameId} disbanded.`);
                        } else {
                            if (game.ownerId === clientId) { // If owner left, assign new owner (or disband)
                                const newOwnerId = Object.keys(game.players)[0];
                                if (newOwnerId) {
                                    game.ownerId = newOwnerId;
                                    game.players[newOwnerId].isOwner = true;
                                    broadcastToGame(gameId, { type: 'OWNER_CHANGED', newOwnerId: newOwnerId });
                                } else {
                                    delete games[gameId]; // No one left
                                    console.log(`Game ${gameId} disbanded due to owner leaving.`);
                                }
                            }
                            broadcastToGame(gameId, { type: 'PLAYER_LEFT', clientId: clientId, game: game });
                        }
                    }
                    sendLobbyUpdate();
                    break;
                }

                case 'MAKE_MOVE': {
                    const { gameId, gameType, payload } = parsedMessage;
                    const game = games[gameId];

                    if (!game || game.type !== gameType || game.currentPlayerTurnId !== clientId) {
                        sendToClient(clientId, { type: 'ERROR', message: 'It is not your turn or invalid game state.' });
                        return;
                    }

                    const gameLogic = SERVER_GAME_LOGIC[gameType];
                    if (!gameLogic) {
                        sendToClient(clientId, { type: 'ERROR', message: 'Game logic not found on server.' });
                        return;
                    }

                    let moveResult;
                    if (payload.action === 'rollDice') {
                        if (gameLogic.validateRoll && !gameLogic.validateRoll(gameId, clientId)) {
                             sendToClient(clientId, { type: 'ERROR', message: 'Invalid roll action.' });
                             return;
                        }
                        moveResult = gameLogic.applyRoll(gameId);
                        game.currentPlayerTurnId = game.state[gameType]?.players[game.state[gameType].currentPlayerIndex]?.id; // Update based on logic
                    } else if (payload.action === 'selectToken' || payload.action === 'playCard' || payload.action === 'movePiece') {
                        const validation = gameLogic.validateMove && gameLogic.validateMove(gameId, clientId, payload);
                        if (!validation) {
                             sendToClient(clientId, { type: 'ERROR', message: 'Invalid move selection.' });
                             return;
                        }
                        moveResult = gameLogic.applyMove(gameId, clientId, validation.token, validation.chosenMove || payload); // Pass specific validated objects
                        game.currentPlayerTurnId = game.state[gameType]?.players[game.state[gameType].currentPlayerIndex]?.id; // Update based on logic
                    } else if (payload.action === 'endTurn') {
                         gameLogic.nextTurn(gameId);
                         moveResult = { message: 'Turn ended.' };
                         game.currentPlayerTurnId = game.state[gameType]?.players[game.state[gameType].currentPlayerIndex]?.id;
                    } else {
                        sendToClient(clientId, { type: 'ERROR', message: 'Unknown move action.' });
                        return;
                    }

                    // Broadcast the updated game state to all players in the game
                    broadcastToGame(gameId, { 
                        type: 'GAME_STATE_UPDATE', 
                        gameId: gameId, 
                        state: game.state, 
                        moveResult: moveResult,
                        currentPlayerTurnId: game.currentPlayerTurnId,
                        gameStatus: game.status
                    });

                    if (game.status === 'finished') {
                        console.log(`Game ${gameId} finished.`);
                        // Optional: cleanup or move game to archive
                        // delete games[gameId];
                        sendLobbyUpdate();
                    }
                    break;
                }

                case 'CHAT_MESSAGE': {
                    const { gameId, message: chatMessage } = parsedMessage;
                    const game = games[gameId];
                    if (game) {
                        const sender = game.players[clientId]?.name || `Guest ${clientId}`;
                        broadcastToGame(gameId, { type: 'CHAT_MESSAGE', sender: sender, message: chatMessage });
                    }
                    break;
                }

                default:
                    sendToClient(clientId, { type: 'ERROR', message: 'Unknown message type.' });
                    break;
            }
        } catch (error) {
            console.error(`Error processing message from ${clientId}:`, error);
            sendToClient(clientId, { type: 'ERROR', message: `Server error: ${error.message}` });
        }
    });

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected.`);
        clients.delete(clientId);

        // Remove client from any games they were in
        for (const gameId in games) {
            const game = games[gameId];
            if (game.players[clientId]) {
                delete game.players[clientId];
                game.turnOrder = game.turnOrder.filter(id => id !== clientId);

                if (Object.keys(game.players).length === 0) {
                    delete games[gameId];
                    console.log(`Game ${gameId} disbanded due to all players leaving.`);
                } else if (game.ownerId === clientId) {
                    const newOwnerId = Object.keys(game.players)[0];
                    if (newOwnerId) {
                        game.ownerId = newOwnerId;
                        game.players[newOwnerId].isOwner = true;
                        broadcastToGame(gameId, { type: 'OWNER_CHANGED', newOwnerId: newOwnerId });
                    } else {
                        delete games[gameId];
                    }
                }
                broadcastToGame(gameId, { type: 'PLAYER_LEFT', clientId: clientId, game: game });
            }
        }
        sendLobbyUpdate();
    });

    ws.on('error', error => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});
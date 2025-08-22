const WebSocket = require('ws');
const admin = require('firebase-admin');

// --- Firebase Admin SDK Initialization ---
// IMPORTANT: Place your Firebase Admin SDK service account key file in the 'server/' directory
const serviceAccount = require('./chess-app-399e9-firebase-adminsdk-fbsvc-78562da4a9.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore instance
const auth = admin.auth();   // Firebase Authentication instance

// --- WebSocket Server Setup ---
const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket server started on ws://localhost:8080');

// --- Game State Management ---
// Game rooms will now primarily be managed in Firestore for persistence.
// We'll keep a local cache for active WebSocket connections to rooms.
const activeWsConnections = new Map(); // Map<WebSocket, { uid, displayName, roomId }>

// Firestore Collection References
const roomsCollection = db.collection('gameRooms');

// Helper to send messages to all players in a room
async function broadcastToRoom(roomId, message, excludeWs = null) {
    const roomSnap = await roomsCollection.doc(roomId).get();
    if (!roomSnap.exists) return;

    const roomData = roomSnap.data();
    roomData.players.forEach(player => {
        const playerWs = Array.from(activeWsConnections.keys()).find(
            ws => activeWsConnections.get(ws) && activeWsConnections.get(ws).uid === player.uid
        );
        if (playerWs && playerWs !== excludeWs && playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(JSON.stringify(message));
        }
    });
}

// --- WebSocket Connection Handling ---
wss.on('connection', function connection(ws) {
    console.log('Client connected. Awaiting authentication...');

    ws.on('message', async function incoming(message) {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
            // console.log('Received:', parsedMessage.type, 'from client');
        } catch (e) {
            console.error('Failed to parse message:', message.toString(), e);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        const { type, game, authToken, payload } = parsedMessage;

        // --- Authentication (First message for an unauthenticated WS) ---
        if (!activeWsConnections.has(ws) && type !== 'authenticate') {
            ws.send(JSON.stringify({ type: 'error', message: 'Please authenticate first.' }));
            return;
        }

        if (type === 'authenticate' && authToken) {
            try {
                const decodedToken = await auth.verifyIdToken(authToken);
                const uid = decodedToken.uid;
                const displayName = decodedToken.name || decodedToken.email; // Use name if available, else email
                activeWsConnections.set(ws, { uid, displayName });
                ws.uid = uid; // Store uid directly on ws object for convenience
                ws.displayName = displayName;

                ws.send(JSON.stringify({ type: 'authenticated', uid, displayName, message: 'Authentication successful.' }));
                console.log(`Client ${displayName} (${uid}) authenticated.`);
            } catch (error) {
                console.error('Firebase ID token verification failed:', error);
                ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed: Invalid token.' }));
                ws.close(1008, 'Authentication failed');
                return;
            }
        }

        const authenticatedUser = activeWsConnections.get(ws);
        if (!authenticatedUser) { // Should not happen if previous check works
            ws.send(JSON.stringify({ type: 'error', message: 'User not authenticated.' }));
            ws.close(1008, 'Not authenticated');
            return;
        }

        // --- Core PvP Logic (Authenticated Users Only) ---
        const { uid, displayName, roomId } = authenticatedUser; // Destructure authenticated info

        if (type === 'join_game') {
            let roomRef;
            let roomData;

            // Try to find an existing room that the user might be in or can join
            const querySnapshot = await roomsCollection
                .where('gameType', '==', game)
                .where('isStarted', '==', false) // Only join unstarted games
                .limit(1)
                .get();

            if (!querySnapshot.empty) {
                roomRef = querySnapshot.docs[0].ref;
                roomData = querySnapshot.docs[0].data();

                // Check if player is already in this room
                if (roomData.players.some(p => p.uid === uid)) {
                    ws.send(JSON.stringify({ type: 'error', message: `Already in room ${roomRef.id}.` }));
                    // If they reconnect, update their WS object.
                    activeWsConnections.set(ws, { ...authenticatedUser, roomId: roomRef.id });
                    ws.playerColor = roomData.players.find(p => p.uid === uid).color;
                    ws.roomId = roomRef.id;
                    ws.send(JSON.stringify({
                        type: 'game_state_update',
                        game: game,
                        gameState: roomData.gameState,
                        playerColor: ws.playerColor
                    }));
                    return;
                }

                // If room isn't full, join it
                if (roomData.players.length < roomData.maxPlayers) {
                    // Assign player color based on game type and existing players
                    const assignedColor = (game === 'ludo') ?
                        (roomData.players.length === 0 ? 'red' : 'green') :
                        (roomData.players.length === 0 ? 'white' : 'black');

                    roomData.players.push({ uid, displayName, color: assignedColor });
                    await roomRef.update({ players: roomData.players });

                    activeWsConnections.set(ws, { ...authenticatedUser, roomId: roomRef.id });
                    ws.playerColor = assignedColor; // Store playerColor on WS connection for convenience
                    ws.roomId = roomRef.id;

                    ws.send(JSON.stringify({ type: 'player_assigned', game: game, color: assignedColor }));
                    broadcastToRoom(roomRef.id, { type: 'chat_message', sender: 'System', text: `${displayName} (${assignedColor}) joined the room.` }, ws);
                    console.log(`${displayName} (${assignedColor}) joined room ${roomRef.id} for ${game}`);

                    // Check if room is now full and start game
                    if (roomData.players.length === roomData.maxPlayers) {
                        const startingPlayerColor = (game === 'ludo') ? 'red' : 'white';
                        const startingPlayerUID = roomData.players.find(p => p.color === startingPlayerColor)?.uid;

                        // Initialize game state based on game type
                        let initialGameState = {};
                        if (game === 'ludo') {
                            initialGameState = {
                                players: roomData.players.map(p => ({
                                    uid: p.uid,
                                    displayName: p.displayName,
                                    color: p.color,
                                    tokens: [ // Initial Ludo token state
                                        { id: `${p.color}1`, pos: 'base', pathIdx: -1, isFinished: false },
                                        { id: `${p.color}2`, pos: 'base', pathIdx: -1, isFinished: false },
                                        { id: `${p.color}3`, pos: 'base', pathIdx: -1, isFinished: false },
                                        { id: `${p.color}4`, pos: 'base', pathIdx: -1, isFinished: false }
                                    ],
                                    isAI: false
                                })),
                                currentPlayerUID: startingPlayerUID,
                                diceRolledValue: 0,
                                gameActive: true,
                                rolledSixesCount: 0,
                                finalMessage: null
                            };
                        } else if (game === 'chess') {
                            initialGameState = {
                                players: roomData.players.map(p => ({ uid: p.uid, displayName: p.displayName, color: p.color })),
                                board: [
                                    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
                                    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
                                    ['', '', '', '', '', '', '', ''],
                                    ['', '', '', '', '', '', '', ''],
                                    ['', '', '', '', '', '', '', ''],
                                    ['', '', '', '', '', '', '', ''],
                                    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
                                    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
                                ],
                                currentPlayerColor: startingPlayerColor,
                                gameActive: true,
                                finalMessage: null
                            };
                        }

                        await roomRef.update({
                            isStarted: true,
                            gameState: initialGameState
                        });

                        broadcastToRoom(roomRef.id, {
                            type: 'game_start',
                            game: game,
                            startingPlayer: startingPlayerColor,
                            gameState: initialGameState
                        });
                        console.log(`Game ${game} in room ${roomRef.id} started. Starting player: ${startingPlayerColor}`);
                    } else {
                        ws.send(JSON.stringify({ type: 'waiting_for_opponent', game: game, message: `Waiting for opponent in room ${roomRef.id}` }));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full, cannot join.' }));
                }
            } else {
                // No available room, create a new one
                const newRoomRef = roomsCollection.doc(); // Let Firestore generate ID
                const assignedColor = (game === 'ludo') ? 'red' : 'white';
                const newRoomData = {
                    gameType: game,
                    players: [{ uid, displayName, color: assignedColor }],
                    maxPlayers: 2,
                    isStarted: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    gameState: {} // Will be initialized when game starts
                };
                await newRoomRef.set(newRoomData);

                activeWsConnections.set(ws, { ...authenticatedUser, roomId: newRoomRef.id });
                ws.playerColor = assignedColor;
                ws.roomId = newRoomRef.id;

                ws.send(JSON.stringify({ type: 'player_assigned', game: game, color: assignedColor }));
                ws.send(JSON.stringify({ type: 'waiting_for_opponent', game: game, message: `Created room ${newRoomRef.id}. Waiting for opponent...` }));
                console.log(`${displayName} (${assignedColor}) created room ${newRoomRef.id} for ${game}`);
            }
        }

        // --- Game Action Handling (Relay & State Update via Firestore) ---
        else if (ws.roomId && type !== 'authenticate') {
            const roomRef = roomsCollection.doc(ws.roomId);
            const roomSnap = await roomRef.get();
            if (!roomSnap.exists || !roomSnap.data().isStarted) {
                ws.send(JSON.stringify({ type: 'error', message: 'Game not found or not started.' }));
                return;
            }
            let room = roomSnap.data(); // Current state from Firestore

            // Basic turn validation (server-side authoritative)
            let isCurrentPlayerTurn = false;
            if (game === 'ludo' && room.gameState.currentPlayerUID === uid) {
                isCurrentPlayerTurn = true;
            } else if (game === 'chess' && room.gameState.players.find(p => p.uid === uid)?.color === room.gameState.currentPlayerColor) {
                isCurrentPlayerTurn = true;
            }

            if (!isCurrentPlayerTurn && type !== 'chat_message' && type !== 'ping') {
                ws.send(JSON.stringify({ type: 'error', message: "It's not your turn!" }));
                return;
            }

            // --- Game Specific Logic ---
            switch (game) {
                case 'ludo':
                    switch (type) {
                        case 'ludo_roll_dice':
                            room.gameState.diceRolledValue = payload.roll;
                            // Update rolled sixes count for next turn determination on client
                            if (payload.roll === 6) {
                                room.gameState.rolledSixesCount++;
                                if (room.gameState.rolledSixesCount === 3) {
                                    // Three 6s, skip turn
                                    room.gameState.finalMessage = `${ws.playerColor.toUpperCase()} rolled three 6s! Turn skipped.`;
                                    room.gameState.diceRolledValue = 0;
                                    room.gameState.rolledSixesCount = 0;
                                    const currentPlayerIndex = room.gameState.players.findIndex(p => p.uid === uid);
                                    room.gameState.currentPlayerUID = room.gameState.players[(currentPlayerIndex + 1) % room.gameState.players.length].uid;
                                }
                            } else {
                                room.gameState.rolledSixesCount = 0; // Reset if not a 6
                            }
                            break;

                        case 'ludo_move_token':
                            const movingPlayer = room.gameState.players.find(p => p.uid === uid);
                            const movedToken = movingPlayer.tokens.find(t => t.id === payload.token.id);

                            if (movedToken) {
                                movedToken.pos = payload.newPosType;
                                movedToken.pathIdx = payload.newPathIdx;
                                movedToken.isFinished = payload.isFinished;

                                let killedOpponent = false;
                                if (payload.newPosType === 'main_path') {
                                    const currentPlayerPathIdx = payload.newPathIdx;
                                    room.gameState.players.forEach(otherPlayer => {
                                        if (otherPlayer.uid !== uid) {
                                            otherPlayer.tokens.forEach(otherToken => {
                                                if (otherToken.pos === 'main_path' && otherToken.pathIdx === currentPlayerPathIdx && !otherToken.isFinished) {
                                                    const tokensOnCell = otherPlayer.tokens.filter(t => t.pos === 'main_path' && t.pathIdx === currentPlayerPathIdx);
                                                    if (tokensOnCell.length === 1) { // Only kill if single opponent token
                                                        otherToken.pos = 'base';
                                                        otherToken.pathIdx = -1;
                                                        killedOpponent = true;
                                                    }
                                                }
                                            });
                                        }
                                    });
                                }

                                let anotherTurn = false;
                                if (payload.diceValue === 6 || movedToken.isFinished || killedOpponent) {
                                    anotherTurn = true;
                                    room.gameState.diceRolledValue = 0; // Reset for next roll by same player
                                } else {
                                    // Switch turn if no conditions for another turn met
                                    const currentPlayerIndex = room.gameState.players.findIndex(p => p.uid === uid);
                                    room.gameState.currentPlayerUID = room.gameState.players[(currentPlayerIndex + 1) % room.gameState.players.length].uid;
                                    room.gameState.diceRolledValue = 0; // Reset for next player's roll
                                    room.gameState.rolledSixesCount = 0; // Reset for next player
                                }

                                // Check for win condition
                                const finishedTokens = movingPlayer.tokens.filter(t => t.isFinished);
                                if (finishedTokens.length === 4) {
                                    room.gameState.gameActive = false;
                                    room.gameState.finalMessage = `${movingPlayer.color.toUpperCase()} wins!`;
                                }
                            }
                            break;
                    }
                    break; // End ludo game logic

                case 'chess':
                    switch (type) {
                        case 'chess_move':
                            const { from, to, piece } = payload;
                            // Basic server-side validation (can be expanded significantly)
                            // Here you'd re-validate the move against board rules using server-side logic
                            // For simplicity, we trust the client's move for now, but apply it to the server's state.
                            room.gameState.board[to.r][to.c] = piece;
                            room.gameState.board[from.r][from.c] = '';

                            // Check for king capture (basic win condition)
                            // A real chess engine would check for checkmate, not just king capture.
                            // If a king was captured, declare win
                            const capturedPiece = payload.capturedPiece; // Client *could* send this
                            if (capturedPiece && (capturedPiece.toLowerCase() === 'k')) { // Assuming 'k' for black king, 'K' for white king
                                room.gameState.gameActive = false;
                                room.gameState.finalMessage = `${ws.playerColor.toUpperCase()} wins! King captured!`;
                            } else {
                                // Switch turn
                                room.gameState.currentPlayerColor = (room.gameState.currentPlayerColor === 'white') ? 'black' : 'white';
                            }
                            break;
                    }
                    break; // End chess game logic

                case 'uno': // Placeholder
                case 'monopoly': // Placeholder
                    ws.send(JSON.stringify({ type: 'error', message: `${game} is coming soon and has no game logic implemented yet.` }));
                    return;

                case 'chat_message': // Handled outside game-specific logic, but within room context
                    // Only process if player is in a room.
                    if (ws.roomId) {
                        broadcastToRoom(ws.roomId, {
                            type: 'chat_message',
                            game: game,
                            sender: ws.displayName || 'Anonymous', // Use displayName from authenticated user
                            text: payload.text
                        });
                        return; // Don't save chat to Firestore gameState for now (could add a subcollection)
                    }
                    break;
                case 'ping': // Heartbeat, don't update game state
                    ws.send(JSON.stringify({ type: 'pong' }));
                    return;

                default:
                    console.log(`Unhandled action type ${type} for game ${game}.`);
                    ws.send(JSON.stringify({ type: 'error', message: 'Unhandled game action.' }));
                    return; // Do not update Firestore for unhandled actions
            }

            // Update Firestore with the new game state (only if a game action modified it)
            if (type !== 'chat_message' && type !== 'ping') {
                await roomRef.update({ gameState: room.gameState, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }

            // Broadcast updated state to all players in the room (including the one who made the move)
            broadcastToRoom(ws.roomId, {
                type: 'game_state_update',
                game: game,
                gameState: room.gameState
            });
        }
    });

    ws.on('close', async function close(code, reason) {
        console.log(`Client ${ws.displayName || ws.uid || 'Anonymous'} disconnected (Code: ${code}, Reason: ${reason})`);

        // Remove from active connections map
        activeWsConnections.delete(ws);

        if (ws.roomId) {
            const roomRef = roomsCollection.doc(ws.roomId);
            const roomSnap = await roomRef.get();

            if (roomSnap.exists) {
                const roomData = roomSnap.data();
                // Check if any other player from this UID is still connected (e.g., if multiple tabs open)
                const otherConnectionsFromThisUser = Array.from(activeWsConnections.values()).filter(
                    conn => conn.uid === ws.uid && conn.roomId === ws.roomId
                );

                if (otherConnectionsFromThisUser.length === 0) {
                    // This was the last connection for this user in this room.
                    // Notify other players
                    broadcastToRoom(ws.roomId, {
                        type: 'opponent_left',
                        game: roomData.gameType,
                        message: `${ws.displayName || 'An opponent'} left the game.`,
                        disconnectedPlayerUid: ws.uid
                    });
                    console.log(`Player ${ws.displayName || ws.uid} left room ${ws.roomId}.`);

                    // In a real app, you might pause the game, allow a rejoin, or end it.
                    // For now, if one player disconnects, the game cannot continue.
                    await roomRef.update({
                        isStarted: false, // Mark game as not started, or create a 'paused' state
                        'gameState.gameActive': false,
                        'gameState.finalMessage': `${ws.displayName || 'An opponent'} disconnected. Game ended.`
                    });
                    // Re-fetch and broadcast to ensure clients get the 'game ended' state
                    const updatedRoomSnap = await roomRef.get();
                    broadcastToRoom(ws.roomId, {
                        type: 'game_state_update',
                        game: roomData.gameType,
                        gameState: updatedRoomSnap.data().gameState
                    });
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Implement cleanup for old/stale rooms in Firestore (e.g., using Firebase Functions or a cron job)
// For development, manually delete rooms if needed.

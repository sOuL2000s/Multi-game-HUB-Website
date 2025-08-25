// server.js - Multiplayer Game Hub Backend
const WebSocket = require('ws');
const admin = require('firebase-admin'); // Import Firebase Admin SDK
const path = require('path'); // Node.js built-in path module

// --- Firebase Admin SDK Initialization ---
// IMPORTANT: Adjust the path to your service account key file.
// It's highly recommended to use environment variables for sensitive data like this in production.
// For local development, if your JSON key file is directly in the 'server' directory,
// the path below should work. If it's in the project root, you might need `../your-key-file.json`.
const serviceAccountPath = path.resolve(__dirname, 'chess-app-399e9-firebase-adminsdk-fbsvc-78562da4a9.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK. Check service account key path and file:', error.message);
  console.error('Expected path:', serviceAccountPath);
  process.exit(1); // Exit if Firebase cannot be initialized
}

const db = admin.firestore(); // Get a Firestore instance

const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server started on port 8080');

// Global state for active games and connected clients (in-memory, for active gameplay)
const games = {}; // Stores active game instances: { gameId: { type: 'ludo', players: {}, state: {}, ... } }
const clients = new Map(); // Stores WebSocket connections: { clientId: WebSocket }
let nextClientId = 1;

/**
 * Game state structure example: (will now be stored in Firestore and loaded into `games` object)
 * games = {
 *   'firestoreDocId1': {
 *     id: 'firestoreDocId1',
 *     type: 'uno',
 *     players: {
 *       'clientId1': { name: 'Player1', ws: WebSocket, firebaseId: 'firebaseUID1', isOwner: true, color: 'red' },
 *       'clientId2': { name: 'Player2', ws: WebSocket, firebaseId: 'firebaseUID2', isOwner: false, color: 'blue' }
 *     },
 *     state: {
 *       uno: {
 *          players: [ // Game-specific player data, referenced by clientId from game.players
 *              { id: 'clientId1', name: 'Player1', firebaseId: 'firebaseUID1', hand: [...], unoDeclared: false, color: 'red' },
 *              // ... other players
 *          ],
 *          currentPlayerIndex: 0,
 *          deck: [],
 *          discardPile: [],
 *          direction: 1,
 *          state: 'playing',
 *          pendingDraw: 0,
 *          lastPlayerToPlay: null,
 *          winner: null,
 *          // ... other Uno specific state
 *       }
 *     },
 *     turnOrder: ['clientId1', 'clientId2'], // Order of clientIds for turns
 *     currentPlayerTurnId: 'clientId1', // ClientId of player whose turn it is
 *     ownerId: 'clientId1', // ClientId of who created the game
 *     status: 'waiting', // 'waiting', 'playing', 'finished'
 *     maxPlayers: 4,
 *     firebaseGameDocRef: null // Reference to the Firestore document for this game
 *   }
 * }
 */


// --- Firestore Utility Functions ---

/**
 * Saves the current game state to Firestore.
 * @param {string} gameId The ID of the game to save.
 */
async function saveGameToFirestore(gameId) {
    const game = games[gameId];
    if (!game || !game.firebaseGameDocRef) {
        console.error(`Attempted to save non-existent or unlinked game ${gameId} to Firestore.`);
        return;
    }

    // Only save the serializable parts of the game state (exclude `ws` objects)
    const serializableGameData = { ...game };
    delete serializableGameData.players; // Players' WebSocket objects cannot be stored
    delete serializableGameData.firebaseGameDocRef; // Don't store the ref itself
    
    // Store players separately as a simplified array of clientIds and their details
    const serializablePlayersData = Object.entries(game.players).map(([clientId, playerInfo]) => ({
        clientId: clientId,
        name: playerInfo.name,
        firebaseId: playerInfo.firebaseId, // Store Firebase UID
        isOwner: playerInfo.isOwner,
        color: playerInfo.color // Store color for Ludo, Uno, etc.
    }));

    try {
        await game.firebaseGameDocRef.update({
            gameData: serializableGameData, // The core game data
            playersData: serializablePlayersData, // Player metadata
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        // console.log(`Game ${gameId} state saved to Firestore.`);
    } catch (error) {
        console.error(`Error saving game ${gameId} to Firestore:`, error);
    }
}

/**
 * Loads a game state from Firestore into the `games` in-memory object.
 * @param {string} gameId The ID of the game to load.
 * @returns {object|null} The loaded game object, or null if not found.
 */
async function loadGameFromFirestore(gameId) {
    try {
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            console.warn(`Game ${gameId} not found in Firestore.`);
            return null;
        }

        const data = gameDoc.data();
        const loadedGame = data.gameData;
        
        // Reconstruct players map for in-memory game state
        loadedGame.players = {};
        data.playersData.forEach(playerData => {
            loadedGame.players[playerData.clientId] = {
                name: playerData.name,
                firebaseId: playerData.firebaseId,
                isOwner: playerData.isOwner,
                color: playerData.color,
                ws: null // WebSocket will be attached upon client connection
            };
        });

        // Add Firestore document reference
        loadedGame.firebaseGameDocRef = gameDoc.ref;
        games[gameId] = loadedGame; // Add to in-memory cache
        console.log(`Game ${gameId} loaded from Firestore.`);
        return loadedGame;

    } catch (error) {
        console.error(`Error loading game ${gameId} from Firestore:`, error);
        return null;
    }
}

/**
 * Deletes a game from Firestore.
 * @param {string} gameId The ID of the game to delete.
 */
async function deleteGameFromFirestore(gameId) {
    try {
        await db.collection('games').doc(gameId).delete();
        console.log(`Game ${gameId} deleted from Firestore.`);
    } catch (error) {
        console.error(`Error deleting game ${gameId} from Firestore:`, error);
    }
}

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
async function sendLobbyUpdate() {
    try {
        const querySnapshot = await db.collection('games').where('gameData.status', '==', 'waiting').get();
        const availableGames = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.gameData.type,
                owner: data.playersData.find(p => p.clientId === data.gameData.ownerId)?.name || 'Unknown',
                currentPlayers: data.playersData.length,
                maxPlayers: data.gameData.maxPlayers
            };
        });

        clients.forEach((ws, clientId) => {
            sendToClient(clientId, { type: 'LOBBY_UPDATE', games: availableGames });
        });
    } catch (error) {
        console.error("Error fetching lobby update from Firestore:", error);
    }
}


// --- Game Logic Implementations (SERVER-SIDE AUTHORITY) ---
const SERVER_GAME_LOGIC = {
    // UNO Game Logic
    uno: {
        UNO_COLORS: ['red', 'blue', 'green', 'yellow'],
        UNO_NUMBERS: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        UNO_SPECIAL_CARDS: ['Skip', 'Reverse', 'Draw Two'],
        UNO_WILD_CARDS: ['Wild', 'Wild Draw Four'],
        UNO_INITIAL_HAND_SIZE: 7,

        // Helper to create a single card
        createUnoCard: (color, value) => {
            return { color, value, wildColor: null };
        },
        isUnoCardWild: (card) => card && card.color === 'wild',
        getUnoTopCard: (unoState) => unoState.discardPile[unoState.discardPile.length - 1],

        // Helper to create and shuffle a full deck
        createShuffledUnoDeck: () => {
            const newDeck = [];
            SERVER_GAME_LOGIC.uno.UNO_COLORS.forEach(color => {
                newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard(color, '0'));
                for (let i = 1; i <= 9; i++) {
                    newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard(color, String(i)));
                    newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard(color, String(i)));
                }
                SERVER_GAME_LOGIC.uno.UNO_SPECIAL_CARDS.forEach(value => {
                    newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard(color, value));
                    newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard(color, value));
                });
            });
            for (let i = 0; i < 4; i++) {
                newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard('wild', 'Wild'));
                newDeck.push(SERVER_GAME_LOGIC.uno.createUnoCard('wild', 'Wild Draw Four'));
            }
            // Shuffle the deck
            for (let i = newDeck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
            }
            return newDeck;
        },

        initGameState: (playerInfos) => {
            let deck = SERVER_GAME_LOGIC.uno.createShuffledUnoDeck();
            const discardPile = [];
            
            // Map playerInfos from game.players to game.state.uno.players structure
            // This ensures player data specific to UNO is stored here.
            const players = playerInfos.map((p, index) => ({
                id: p.clientId,
                name: p.name,
                firebaseId: p.firebaseId,
                hand: [],
                unoDeclared: false,
                color: SERVER_GAME_LOGIC.uno.UNO_COLORS[index % SERVER_GAME_LOGIC.uno.UNO_COLORS.length], // Assign initial color
                mode: p.mode // 'human' or 'bot' - derived from client's original request
            }));

            // Deal initial hands
            players.forEach(player => {
                for (let i = 0; i < SERVER_GAME_LOGIC.uno.UNO_INITIAL_HAND_SIZE; i++) {
                    player.hand.push(deck.pop());
                }
            });

            // Draw a starting card for the discard pile
            let startCard;
            let attempts = 0;
            const MAX_START_CARD_ATTEMPTS = 20; // Prevent infinite loop if deck is somehow only wild/action
            do {
                startCard = deck.pop();
                attempts++;
                if (!startCard || attempts >= MAX_START_CARD_ATTEMPTS) {
                    console.error("Failed to draw a valid non-action/non-wild starting card for Uno, using default number card.");
                    startCard = SERVER_GAME_LOGIC.uno.createUnoCard('red', '1'); // Fallback
                    break;
                }
                if (SERVER_GAME_LOGIC.uno.isUnoCardWild(startCard) || SERVER_GAME_LOGIC.uno.UNO_SPECIAL_CARDS.includes(startCard.value)) {
                    deck.unshift(startCard); // Put it back at the start of the deck
                    // A quick re-shuffle after putting back to avoid drawing it immediately again
                    for (let i = deck.length - 1; i > 0; i--) { 
                        const j = Math.floor(Math.random() * (i + 1));
                        [deck[i], deck[j]] = [deck[j], deck[i]];
                    }
                }
            } while (SERVER_GAME_LOGIC.uno.isUnoCardWild(startCard) || SERVER_GAME_LOGIC.uno.UNO_SPECIAL_CARDS.includes(startCard.value));

            if (startCard) {
                discardPile.push(startCard);
            } else {
                console.error("Critical error: No starting card determined for Uno.");
                return null;
            }

            return {
                players: players,
                currentPlayerIndex: 0,
                deck: deck,
                discardPile: discardPile,
                direction: 1, // 1 for clockwise, -1 for counter-clockwise
                state: 'playing', // 'playing', 'color_select', 'await_draw_decision', 'game_over'
                pendingDraw: 0, // Number of cards next player must draw
                lastPlayerToPlay: null, // clientId of the last player who played a card
                winner: null
            };
        },
        
        // Checks if a given card is valid to play on the current discard pile.
        isValidUnoPlay: (unoState, cardToPlay) => {
            const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);
            const matchColor = SERVER_GAME_LOGIC.uno.isUnoCardWild(topCard) && topCard.wildColor ? topCard.wildColor : topCard.color;

            if (SERVER_GAME_LOGIC.uno.isUnoCardWild(cardToPlay)) {
                return true;
            }
            return cardToPlay.color === matchColor || cardToPlay.value === topCard.value;
        },

        // Draws cards from the deck.
        drawUnoCardFromDeck: (unoState, player, count = 1) => {
            const drawnCards = [];
            for (let i = 0; i < count; i++) {
                if (unoState.deck.length === 0) {
                    if (unoState.discardPile.length <= 1) { // Need at least one card to keep on pile
                        console.warn("Uno: Not enough cards to draw. Game might be stuck, cannot reshuffle.");
                        break;
                    }
                    const topCard = unoState.discardPile.pop(); // Keep top card
                    unoState.deck = unoState.discardPile; // Discard pile becomes new deck
                    unoState.discardPile = [topCard]; // Top card becomes new discard
                    
                    // Shuffle the new deck
                    for (let j = unoState.deck.length - 1; j > 0; j--) {
                        const k = Math.floor(Math.random() * (j + 1));
                        [unoState.deck[j], unoState.deck[k]] = [unoState.deck[k], unoState.deck[j]];
                    }
                    console.log("Uno: Reshuffling discard pile into new deck.");
                }
                if (unoState.deck.length > 0) {
                    const card = unoState.deck.pop();
                    if (SERVER_GAME_LOGIC.uno.isUnoCardWild(card)) card.wildColor = null; // Reset wild color
                    drawnCards.push(card);
                }
            }
            if (player) {
                player.hand.push(...drawnCards);
            }
            return drawnCards;
        },

        // Advances to the next player's turn.
        nextTurn: (gameId, skip = false) => {
            const game = games[gameId];
            const unoState = game.state.uno;

            if (unoState.state === 'game_over') return;

            let playerIndex = unoState.currentPlayerIndex;
            playerIndex = (playerIndex + unoState.direction + unoState.players.length) % unoState.players.length;
            if (skip) {
                playerIndex = (playerIndex + unoState.direction + unoState.players.length) % unoState.players.length;
            }
            unoState.currentPlayerIndex = playerIndex;
            unoState.state = 'playing'; // Reset state after action/draw
            game.currentPlayerTurnId = unoState.players[unoState.currentPlayerIndex].id; // Update game's current turn ID
        },

        // --- SERVER-SIDE MOVE VALIDATION AND APPLICATION ---
        validatePlayCard: (gameId, clientId, payload) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer) return { error: 'Player not found in game.' };
            if (currentPlayer.id !== unoState.players[unoState.currentPlayerIndex].id) return { error: 'It is not your turn.' };
            if (unoState.state === 'color_select') return { error: 'Must select a wild card color first.' };

            const { card: clientCard, handIndex } = payload;
            if (handIndex === undefined || handIndex < 0 || handIndex >= currentPlayer.hand.length) return { error: 'Invalid hand index.' };
            
            const actualCardInHand = currentPlayer.hand[handIndex];
            // Deep comparison to ensure client isn't sending a fake card
            if (JSON.stringify(actualCardInHand) !== JSON.stringify(clientCard)) return { error: 'Card mismatch with hand.' };

            const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);

            // If there's a pending draw, only Draw Two or Wild Draw Four can be played
            if (unoState.pendingDraw > 0) {
                const canStackDrawTwo = (actualCardInHand.value === 'Draw Two' && topCard.value === 'Draw Two');
                const canStackWildDrawFour = (SERVER_GAME_LOGIC.uno.isUnoCardWild(actualCardInHand) && actualCardInHand.value === 'Wild Draw Four');
                if (!canStackDrawTwo && !canStackWildDrawFour) {
                    return { error: `Must draw ${unoState.pendingDraw} cards or play a matching Draw Two/Wild Draw Four.` };
                }
            } else {
                if (!SERVER_GAME_LOGIC.uno.isValidUnoPlay(unoState, actualCardInHand)) {
                    return { error: 'Invalid card to play. Must match color or value, or be a Wild card.' };
                }
            }
            
            return { isValid: true, card: actualCardInHand, handIndex: handIndex };
        },

        applyPlayCard: (gameId, clientId, validationResult) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);
            const { card: playedCard, handIndex } = validationResult;

            currentPlayer.hand.splice(handIndex, 1); // Remove card from hand
            
            // Clear previous wild color if the top card was a wild card
            if (unoState.discardPile.length > 0 && SERVER_GAME_LOGIC.uno.isUnoCardWild(SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState))) {
                SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState).wildColor = null;
            }

            unoState.discardPile.push(playedCard);
            unoState.lastPlayerToPlay = clientId; // Keep track for UNO call penalty
            let message = `${currentPlayer.name} played a ${playedCard.color === 'wild' ? '' : playedCard.color + ' '}${playedCard.value}.`;
            let needsColorSelect = false;
            let skipNextTurn = false;
            let reverseDirection = false;
            let forceNextDraw = 0; // For Draw Two/Wild Draw Four

            // Check for Uno declaration penalty
            if (currentPlayer.hand.length === 1 && !currentPlayer.unoDeclared) {
                const penaltyCards = SERVER_GAME_LOGIC.uno.drawUnoCardFromDeck(unoState, currentPlayer, 2);
                message += ` ${currentPlayer.name} did not declare UNO! Drew ${penaltyCards.length} cards as penalty.`;
            }
            currentPlayer.unoDeclared = false; // Reset for next turn

            // Apply card effects
            if (SERVER_GAME_LOGIC.uno.isUnoCardWild(playedCard)) {
                unoState.state = 'color_select';
                needsColorSelect = true;
                if (playedCard.value === 'Wild Draw Four') {
                    unoState.pendingDraw += 4;
                    forceNextDraw = 4;
                }
                // If it's a Wild, it will wait for color selection, then nextTurn will be called.
                // No need to call nextTurn here.
            } else if (playedCard.value === 'Skip') {
                message += " Next player is skipped.";
                skipNextTurn = true;
                SERVER_GAME_LOGIC.uno.nextTurn(gameId, skipNextTurn);
            } else if (playedCard.value === 'Reverse') {
                unoState.direction *= -1;
                message += " Direction changed.";
                reverseDirection = true;
                if (unoState.players.length === 2) { // In 2-player game, Reverse acts like Skip
                    skipNextTurn = true;
                    SERVER_GAME_LOGIC.uno.nextTurn(gameId, skipNextTurn);
                } else {
                    SERVER_GAME_LOGIC.uno.nextTurn(gameId);
                }
            } else if (playedCard.value === 'Draw Two') {
                unoState.pendingDraw += 2;
                forceNextDraw = 2;
                message += ` Next player must draw ${unoState.pendingDraw} cards.`;
                SERVER_GAME_LOGIC.uno.nextTurn(gameId); // Next player will draw cards
            } else {
                SERVER_GAME_LOGIC.uno.nextTurn(gameId);
            }

            // If it's a Draw Two, or Wild Draw Four where color was already selected (not possible here due to state 'color_select'),
            // immediately apply the draw to the next player.
            // This condition specifically handles 'Draw Two' (not Wild Draw Four, which needs color select).
            if ((forceNextDraw === 2) && !needsColorSelect) { // This only applies to Draw Two
                 const nextPlayerInTurn = unoState.players.find(p => p.id === game.currentPlayerTurnId);
                 const drawnCards = SERVER_GAME_LOGIC.uno.drawUnoCardFromDeck(unoState, nextPlayerInTurn, unoState.pendingDraw);
                 message += ` ${nextPlayerInTurn.name} drew ${drawnCards.length} cards.`;
                 unoState.pendingDraw = 0; // Reset pending draw after application
            }

            // Check for win condition
            if (currentPlayer.hand.length === 0) {
                unoState.state = 'game_over';
                unoState.winner = currentPlayer.id;
                message = `${currentPlayer.name} wins the Uno game!`;
                game.status = 'finished'; // Mark the game as finished
            }

            saveGameToFirestore(gameId);

            return { 
                message: message, 
                gameEnded: unoState.state === 'game_over',
                needsColorSelect: needsColorSelect,
                newTopCard: playedCard,
                skipNextTurn: skipNextTurn,
                reverseDirection: reverseDirection,
                forceNextDraw: forceNextDraw
            };
        },

        validateDrawCard: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer) return { error: 'Player not found in game.' };
            if (currentPlayer.id !== unoState.players[unoState.currentPlayerIndex].id) return { error: 'It is not your turn.' };
            if (unoState.state === 'color_select') return { error: 'Must select a wild card color first.' };

            const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);
            const canPlayAnyCard = currentPlayer.hand.some(card => SERVER_GAME_LOGIC.uno.isValidUnoPlay(unoState, card));

            if (unoState.state === 'await_draw_decision') {
                return { error: "Already drew a card. Either play it or end your turn." };
            } else if (unoState.pendingDraw > 0) {
                 // If there's a pending draw, player can only draw if they can't stack (or choose not to)
                const canStackDrawTwo = currentPlayer.hand.some(card => card.value === 'Draw Two' && topCard.value === 'Draw Two');
                const canStackWildDrawFour = currentPlayer.hand.some(card => SERVER_GAME_LOGIC.uno.isUnoCardWild(card) && card.value === 'Wild Draw Four');
                if (canStackDrawTwo || canStackWildDrawFour) {
                    // For a more lenient rule, allow drawing even if can stack. For strict, prevent.
                    // Let's go for strict: must stack if possible to avoid penalty.
                    // OR, allow drawing penalty if they choose not to stack. This depends on exact rule variant.
                    // For now, if there's a pending draw, we'll allow a draw action to accept the penalty.
                    // The client-side UI will guide them more.
                }
                return { isValid: true, isPenaltyDraw: true };
            } else if (unoState.state === 'playing' && canPlayAnyCard) {
                // You can draw even if you have playable cards, but it ends your turn (unless drawn card is playable)
                return { isValid: true, voluntaryDraw: true };
            }
            return { isValid: true };
        },

        applyDrawCard: (gameId, clientId, validationResult) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);
            let message = '';

            const numCardsToDraw = unoState.pendingDraw > 0 ? unoState.pendingDraw : 1;
            const drawnCards = SERVER_GAME_LOGIC.uno.drawUnoCardFromDeck(unoState, currentPlayer, numCardsToDraw);
            message = `${currentPlayer.name} drew ${drawnCards.length} card(s).`;
            
            unoState.pendingDraw = 0; // Reset pending draw as it's now handled
            unoState.state = 'await_draw_decision'; // Player can now decide to play drawn card or end turn

            const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);
            const canPlayDrawnCard = drawnCards.some(card => SERVER_GAME_LOGIC.uno.isValidUnoPlay(unoState, card));

            if (drawnCards.length > 0 && canPlayDrawnCard) {
                message += " You can play one of them, or end your turn.";
            } else {
                 message += " No playable cards drawn. End your turn.";
                 SERVER_GAME_LOGIC.uno.nextTurn(gameId); // If no playable cards, immediately go to next turn
            }

            saveGameToFirestore(gameId);
            return { message: message, drawnCards: drawnCards, canPlayDrawnCard: canPlayDrawnCard };
        },

        validateWildColorSelection: (gameId, clientId, payload) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer) return { error: 'Player not found in game.' };
            if (currentPlayer.id !== unoState.players[unoState.currentPlayerIndex].id) return { error: 'It is not your turn.' };
            if (unoState.state !== 'color_select') return { error: 'Not in color selection state.' };
            if (!SERVER_GAME_LOGIC.uno.UNO_COLORS.includes(payload.color)) return { error: 'Invalid color selected.' };

            return { isValid: true };
        },

        applyWildColorSelection: (gameId, clientId, payload) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);
            const { color } = payload;
            let message = '';

            if (SERVER_GAME_LOGIC.uno.isUnoCardWild(topCard)) {
                topCard.wildColor = color;
                message = `Wild color changed to ${color}.`;
            }

            unoState.state = 'playing';

            // Apply pending draw if it was a Wild Draw Four
            if (unoState.pendingDraw > 0) {
                 const nextPlayerInTurn = unoState.players.find(p => p.id === game.currentPlayerTurnId); // The player whose turn it is AFTER the wild card was played
                 const drawnCards = SERVER_GAME_LOGIC.uno.drawUnoCardFromDeck(unoState, nextPlayerInTurn, unoState.pendingDraw);
                 message += ` ${nextPlayerInTurn.name} drew ${drawnCards.length} cards due to Wild Draw Four.`;
                 unoState.pendingDraw = 0; // Reset pending draw after application
                 SERVER_GAME_LOGIC.uno.nextTurn(gameId); // Advance turn after draw
            } else {
                SERVER_GAME_LOGIC.uno.nextTurn(gameId); // Normal turn progression
            }

            saveGameToFirestore(gameId);
            return { message: message };
        },

        validateDeclareUno: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer) return { error: 'Player not found in game.' };
            // A player can declare UNO even if it's not their turn,
            // but the last player to play the card is penalized if they didn't.
            // For simplicity, we'll allow calling UNO anytime, but only penalize the last player.

            if (unoState.lastPlayerToPlay === clientId) { // If I'm the one who just played the second-to-last card
                if (currentPlayer.hand.length !== 1) return { error: 'You can only declare UNO when you have one card left!' };
                if (currentPlayer.unoDeclared) return { error: 'You have already declared UNO!' };
            } else { // If I'm an opponent calling out the last player
                const lastPlayer = unoState.players.find(p => p.id === unoState.lastPlayerToPlay);
                if (!lastPlayer || lastPlayer.hand.length !== 1 || lastPlayer.unoDeclared) {
                    return { error: 'The last player did not have one card or already declared UNO.' };
                }
            }
            return { isValid: true };
        },

        applyDeclareUno: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            let message = '';

            if (unoState.lastPlayerToPlay === clientId) { // The current player declares UNO for themselves
                const currentPlayer = unoState.players.find(p => p.id === clientId);
                currentPlayer.unoDeclared = true;
                message = `${currentPlayer.name} declared UNO!`;
            } else { // An opponent is calling out the last player
                const lastPlayer = unoState.players.find(p => p.id === unoState.lastPlayerToPlay);
                if (lastPlayer && lastPlayer.hand.length === 1 && !lastPlayer.unoDeclared) {
                    const penaltyCards = SERVER_GAME_LOGIC.uno.drawUnoCardFromDeck(unoState, lastPlayer, 2);
                    message = `${clients.get(clientId)?.playerName || clientId} called out ${lastPlayer.name}! ${lastPlayer.name} drew ${penaltyCards.length} cards as penalty.`;
                    lastPlayer.unoDeclared = false; // Reset after penalty
                } else {
                    message = `${clients.get(clientId)?.playerName || clientId} attempted to call UNO, but no penalty applied.`;
                }
            }

            saveGameToFirestore(gameId);
            return { message: message };
        },

        validateEndTurn: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer) return { error: 'Player not found in game.' };
            if (currentPlayer.id !== unoState.players[unoState.currentPlayerIndex].id) return { error: 'It is not your turn.' };
            if (unoState.state !== 'await_draw_decision') {
                return { error: "You can only end turn after drawing a card and not playing it." };
            }
            // Check if player actually drew, didn't play, and now wants to end turn.
            return { isValid: true };
        },

        applyEndTurn: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            const message = `${currentPlayer.name} ended their turn.`;
            SERVER_GAME_LOGIC.uno.nextTurn(gameId); // Simply advance turn

            saveGameToFirestore(gameId);
            return { message: message };
        },

        // Bot Logic (for server to control bot players)
        botPlayUno: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            if (!currentPlayer || currentPlayer.id !== unoState.players[unoState.currentPlayerIndex].id) return null; // Not this bot's turn

            console.log(`Bot ${currentPlayer.name} (ID: ${clientId}) is playing...`);

            let result = null;

            // Step 1: Handle pending draw penalty
            if (unoState.pendingDraw > 0) {
                const topCard = SERVER_GAME_LOGIC.uno.getUnoTopCard(unoState);
                const playableDrawCards = currentPlayer.hand
                    .map((card, index) => ({ card, index }))
                    .filter(item => (item.card.value === 'Draw Two' && topCard.value === 'Draw Two') || (SERVER_GAME_LOGIC.uno.isUnoCardWild(item.card) && item.card.value === 'Wild Draw Four'));

                if (playableDrawCards.length > 0) {
                    const cardToPlayItem = playableDrawCards[0]; // Just pick the first
                    // Declare Uno if 2 cards left and not declared
                    if (currentPlayer.hand.length === 2 && !currentPlayer.unoDeclared) {
                        SERVER_GAME_LOGIC.uno.applyDeclareUno(gameId, clientId);
                    }
                    result = SERVER_GAME_LOGIC.uno.applyPlayCard(gameId, clientId, cardToPlayItem);
                    if (SERVER_GAME_LOGIC.uno.isUnoCardWild(cardToPlayItem.card) && unoState.state === 'color_select') {
                        SERVER_GAME_LOGIC.uno.botChooseUnoWildColor(gameId, clientId);
                    }
                } else {
                    // Cannot stack, so draw penalty cards
                    const drawResult = SERVER_GAME_LOGIC.uno.applyDrawCard(gameId, clientId); // This will handle drawing and potentially next turn
                    result = { message: `${currentPlayer.name} (Bot) drew ${drawResult.drawnCards.length} penalty cards.`, gameEnded: unoState.state === 'game_over' };
                    // If draw card didn't lead to a play, it might have already advanced turn
                    if (unoState.players[unoState.currentPlayerIndex].id === currentPlayer.id && !drawResult.canPlayDrawnCard) {
                        SERVER_GAME_LOGIC.uno.applyEndTurn(gameId, clientId); // Ensure turn ends if no playable card after draw
                    }
                }
                return result;
            }

            // Step 2: Normal Play - Find a playable card
            const playableCards = currentPlayer.hand
                .map((card, index) => ({ card, index }))
                .filter(item => SERVER_GAME_LOGIC.uno.isValidUnoPlay(unoState, item.card));

            let cardToPlayItem = null;

            if (playableCards.length > 0) {
                // Bot strategy (simple hierarchy):
                // 1. Prioritize matching special cards (Skip, Reverse, Draw Two).
                cardToPlayItem = playableCards.find(item => SERVER_GAME_LOGIC.uno.UNO_SPECIAL_CARDS.includes(item.card.value) && !SERVER_GAME_LOGIC.uno.isUnoCardWild(item.card));
                // 2. Otherwise, play a matching number card.
                if (!cardToPlayItem) {
                    cardToPlayItem = playableCards.find(item => SERVER_GAME_LOGIC.uno.UNO_NUMBERS.includes(item.card.value) && !SERVER_GAME_LOGIC.uno.isUnoCardWild(item.card));
                }
                // 3. If no matching color/number, play a regular Wild card.
                if (!cardToPlayItem) {
                    cardToPlayItem = playableCards.find(item => SERVER_GAME_LOGIC.uno.isUnoCardWild(item.card) && item.card.value === 'Wild');
                }
                 // 4. Last resort, play a Wild Draw Four.
                if (!cardToPlayItem) {
                    cardToPlayItem = playableCards.find(item => SERVER_GAME_LOGIC.uno.isUnoCardWild(item.card) && item.card.value === 'Wild Draw Four');
                }
            }

            if (cardToPlayItem) {
                // Declare Uno if 2 cards left and not declared
                if (currentPlayer.hand.length === 2 && !currentPlayer.unoDeclared) {
                    SERVER_GAME_LOGIC.uno.applyDeclareUno(gameId, clientId);
                }
                result = SERVER_GAME_LOGIC.uno.applyPlayCard(gameId, clientId, cardToPlayItem);

                // If a Wild card was played, bot needs to select a color
                if (SERVER_GAME_LOGIC.uno.isUnoCardWild(cardToPlayItem.card) && unoState.state === 'color_select') {
                    SERVER_GAME_LOGIC.uno.botChooseUnoWildColor(gameId, clientId);
                }
                return result;
            } else {
                // Step 3: No playable cards, draw one
                const drawResult = SERVER_GAME_LOGIC.uno.applyDrawCard(gameId, clientId);
                result = { message: `${currentPlayer.name} (Bot) drew a card.`, gameEnded: unoState.state === 'game_over' };
                
                // If drawn card is playable, play it
                if (drawResult.canPlayDrawnCard) {
                    const drawnCard = currentPlayer.hand[currentPlayer.hand.length - 1]; // The last card added to hand
                    const drawnCardIndex = currentPlayer.hand.length - 1; 

                    // Declare Uno if 2 cards left and not declared (after drawing, hand size could become 2)
                    if (currentPlayer.hand.length === 2 && !currentPlayer.unoDeclared) {
                        SERVER_GAME_LOGIC.uno.applyDeclareUno(gameId, clientId);
                    }
                    result = SERVER_GAME_LOGIC.uno.applyPlayCard(gameId, clientId, { card: drawnCard, handIndex: drawnCardIndex });
                    // If a Wild card was played, bot needs to select a color
                    if (SERVER_GAME_LOGIC.uno.isUnoCardWild(drawnCard) && unoState.state === 'color_select') {
                        SERVER_GAME_LOGIC.uno.botChooseUnoWildColor(gameId, clientId);
                    }
                    return result;
                } else {
                    // Cannot play drawn card, end turn (applyEndTurn would have been called by applyDrawCard if no playable cards drawn)
                    return { message: `${currentPlayer.name} (Bot) drew a card and ended turn.`, gameEnded: unoState.state === 'game_over' };
                }
            }
        },

        // Bot logic for choosing a wild card color.
        botChooseUnoWildColor: (gameId, clientId) => {
            const game = games[gameId];
            const unoState = game.state.uno;
            const currentPlayer = unoState.players.find(p => p.id === clientId);

            const colorCounts = { 'red': 0, 'blue': 0, 'green': 0, 'yellow': 0 };
            currentPlayer.hand.forEach(card => {
                if (SERVER_GAME_LOGIC.uno.UNO_COLORS.includes(card.color)) {
                    colorCounts[card.color]++;
                }
            });
            let chosenColor = SERVER_GAME_LOGIC.uno.UNO_COLORS[Math.floor(Math.random() * SERVER_GAME_LOGIC.uno.UNO_COLORS.length)]; // Default random
            let maxCount = -1;
            for (const color in colorCounts) {
                if (colorCounts[color] > maxCount) {
                    maxCount = colorCounts[color];
                    chosenColor = color;
                }
            }
            return SERVER_GAME_LOGIC.uno.applyWildColorSelection(gameId, clientId, { color: chosenColor });
        }
    },

    // Ludo, Monopoly, Chess logic will be added here in future steps
    ludo: { initGameState: (playerInfos) => ({ message: 'Ludo server logic not yet implemented' }) },
    monopoly: { initGameState: (playerInfos) => ({ message: 'Monopoly server logic not yet implemented' }) },
    chess: { initGameState: (playerInfos) => ({ message: 'Chess server logic not yet implemented' }) }
};


// --- WebSocket Connection Handling ---

wss.on('connection', ws => {
    const clientId = `client${nextClientId++}`;
    clients.set(clientId, ws);
    console.log(`Client ${clientId} connected.`);

    sendToClient(clientId, { type: 'CONNECTED', clientId: clientId });
    // Request a client to send its Firebase Auth ID when it connects
    sendToClient(clientId, { type: 'REQUEST_AUTH_ID' }); 

    ws.on('message', async message => { // Mark async for Firestore operations
        try {
            const parsedMessage = JSON.parse(message.toString());
            console.log(`Received from ${clientId}:`, parsedMessage);

            // Handle AUTH_ID_RECEIVED first, as it's critical for player identity
            if (parsedMessage.type === 'AUTH_ID_RECEIVED') {
                const { firebaseId, playerName } = parsedMessage;
                // Store Firebase ID with the client's WebSocket connection
                clients.get(clientId).firebaseId = firebaseId;
                clients.get(clientId).playerName = playerName;
                console.log(`Client ${clientId} associated with Firebase ID: ${firebaseId} and Name: ${playerName}`);
                // Now send lobby update after client is authenticated
                sendLobbyUpdate(); 
                return; // Don't process other messages until auth ID is received
            }
            
            // Handle GET_LOBBY_UPDATE requests for newly authenticated clients or refreshes
            if (parsedMessage.type === 'GET_LOBBY_UPDATE') {
                sendLobbyUpdate();
                return;
            }

            // Ensure client has authenticated with Firebase before proceeding with game actions
            const clientFirebaseId = clients.get(clientId)?.firebaseId;
            const clientPlayerName = clients.get(clientId)?.playerName;
            if (!clientFirebaseId || !clientPlayerName) {
                sendToClient(clientId, { type: 'ERROR', message: 'Authentication required before performing game actions. Please set your name and ensure Firebase is configured.' });
                return;
            }

            switch (parsedMessage.type) {
                case 'CREATE_GAME': {
                    const { gameType, maxPlayers } = parsedMessage; 
                    
                    const newGameRef = db.collection('games').doc(); // Let Firestore generate ID
                    const gameId = newGameRef.id;

                    // All players array for initGameState. For creation, just the owner.
                    const playersForInitState = [{ 
                        clientId: clientId, 
                        name: clientPlayerName, 
                        firebaseId: clientFirebaseId, 
                        isOwner: true,
                        mode: 'human' // Creator is always human
                    }];
                    
                    const game = {
                        id: gameId,
                        type: gameType,
                        players: { [clientId]: { ...playersForInitState[0], ws: ws } }, // Add WS object for in-memory
                        state: {}, // Initialized by game logic
                        turnOrder: [clientId], 
                        currentPlayerTurnId: clientId, // Initially, owner's turn
                        ownerId: clientId,
                        status: 'waiting',
                        maxPlayers: maxPlayers || 2,
                        firebaseGameDocRef: newGameRef
                    };
                    
                    // Initialize game-specific state
                    const gameStateForType = SERVER_GAME_LOGIC[gameType]?.initGameState(playersForInitState);
                    if (!gameStateForType) {
                         sendToClient(clientId, { type: 'ERROR', message: 'Failed to initialize game state for ' + gameType });
                         return;
                    }
                    game.state[gameType] = gameStateForType;

                    // Update in-memory player's color based on game state (e.g. Uno assigns red to p1)
                    if (game.state[gameType].players && game.state[gameType].players[0]) {
                         game.players[clientId].color = game.state[gameType].players[0].color;
                    }

                    // Save initial state to Firestore
                    await newGameRef.set({
                        gameData: { ...game, firebaseGameDocRef: null }, // Don't store ref
                        playersData: [ { ...playersForInitState[0], color: game.players[clientId].color } ], // Store initial player data with color
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    sendToClient(clientId, { type: 'GAME_CREATED', gameId: gameId, game: game });
                    console.log(`Game ${gameId} (${gameType}) created by ${clientPlayerName}.`);
                    sendLobbyUpdate();
                    break;
                }

                case 'JOIN_GAME': {
                    const { gameId } = parsedMessage;
                    let game = games[gameId]; // Try to get from in-memory cache

                    if (!game) { // If not in memory, load from Firestore
                        game = await loadGameFromFirestore(gameId);
                        if (!game) {
                            sendToClient(clientId, { type: 'ERROR', message: 'Cannot join game: game not found.' });
                            return;
                        }
                    }

                    if (game.status !== 'waiting' || Object.keys(game.players).length >= game.maxPlayers) {
                        sendToClient(clientId, { type: 'ERROR', message: 'Cannot join game: full or already started.' });
                        return;
                    }
                    
                    // Check if player is already in this game (reconnecting)
                    if (game.players[clientId]) {
                        game.players[clientId].ws = ws; // Re-attach WebSocket
                        sendToClient(clientId, { type: 'GAME_JOINED', game: game });
                        broadcastToGame(gameId, { type: 'PLAYER_RECONNECTED', clientId: clientId, game: game }, clientId); // Notify others
                        console.log(`Client ${clientId} (${clientPlayerName}) reconnected to game ${gameId}.`);
                        sendLobbyUpdate();
                        return;
                    }

                    // Add new player to in-memory game state
                    const newPlayerInfo = { 
                        clientId: clientId, 
                        name: clientPlayerName, 
                        firebaseId: clientFirebaseId, 
                        isOwner: false,
                        mode: 'human' // Joining players are human
                    };
                    game.players[clientId] = { ...newPlayerInfo, ws: ws };
                    game.turnOrder.push(clientId); 
                    
                    // Prepare player infos for game-specific state re-initialization
                    const allCurrentPlayerInfos = Object.values(game.players).map(p => ({
                        clientId: p.clientId,
                        name: p.name,
                        firebaseId: p.firebaseId,
                        isOwner: p.isOwner,
                        mode: p.mode
                    }));

                    // Re-initialize the game-specific state with all players now.
                    // This is crucial for games like Uno/Ludo where player order/colors are determined by join order.
                    const gameStateForType = SERVER_GAME_LOGIC[game.type]?.initGameState(allCurrentPlayerInfos);
                     if (!gameStateForType) {
                         sendToClient(clientId, { type: 'ERROR', message: 'Failed to re-initialize game state for ' + game.type });
                         // Rollback player addition
                         delete game.players[clientId];
                         game.turnOrder = game.turnOrder.filter(id => id !== clientId);
                         await saveGameToFirestore(gameId);
                         return;
                    }
                    game.state[game.type] = gameStateForType;
                    // Update in-memory player's color based on game state
                    game.state[game.type].players.forEach(pState => {
                        if (game.players[pState.id]) {
                            game.players[pState.id].color = pState.color;
                            game.players[pState.id].mode = pState.mode; // Also update mode here
                        }
                    });

                    game.currentPlayerTurnId = game.state[game.type].players[game.state[game.type].currentPlayerIndex].id;


                    // Update Firestore with the new player and re-initialized game state
                    await saveGameToFirestore(gameId);

                    broadcastToGame(gameId, { type: 'PLAYER_JOINED', game: game, newPlayerId: clientId });
                    sendToClient(clientId, { type: 'GAME_JOINED', game: game });
                    console.log(`Client ${clientId} (${clientPlayerName}) joined game ${gameId}.`);

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
                            await deleteGameFromFirestore(gameId); // Delete from Firestore if empty
                            console.log(`Game ${gameId} disbanded.`);
                        } else {
                            if (game.ownerId === clientId) { // If owner left, assign new owner (or disband)
                                const newOwnerClientId = Object.keys(game.players)[0];
                                if (newOwnerClientId) {
                                    game.ownerId = newOwnerClientId;
                                    game.players[newOwnerClientId].isOwner = true;
                                    broadcastToGame(gameId, { type: 'OWNER_CHANGED', newOwnerId: newOwnerClientId });
                                } else {
                                    delete games[gameId]; // No one left
                                    await deleteGameFromFirestore(gameId);
                                    console.log(`Game ${gameId} disbanded due to owner leaving.`);
                                }
                            }
                            // Re-initialize game-specific state for remaining players, if needed (e.g. player count affects rules)
                            // For Uno, player removal is handled by filtering out disconnected player in next turn.
                            // If a game heavily depends on fixed player slots, a full state re-init might be necessary.
                            broadcastToGame(gameId, { type: 'PLAYER_LEFT', clientId: clientId, game: game });
                            await saveGameToFirestore(gameId);
                        }
                    }
                    sendLobbyUpdate();
                    break;
                }

                case 'MAKE_MOVE': {
                    const { gameId, gameType, payload } = parsedMessage;
                    let game = games[gameId]; // Try to get from in-memory cache

                    if (!game) { // If not in memory, load from Firestore
                        game = await loadGameFromFirestore(gameId);
                        if (!game) {
                            sendToClient(clientId, { type: 'ERROR', message: 'Game not found or not loaded in memory.' });
                            return;
                        }
                    }

                    if (game.type !== gameType || game.state[gameType].state === 'game_over') {
                        sendToClient(clientId, { type: 'ERROR', message: 'Invalid game state for move.' });
                        return;
                    }

                    const gameLogic = SERVER_GAME_LOGIC[gameType];
                    if (!gameLogic) {
                        sendToClient(clientId, { type: 'ERROR', message: 'Game logic not found on server.' });
                        return;
                    }

                    // Check if it's currently a bot's turn, if so, the human cannot intervene with MAKE_MOVE
                    const currentPlayerInGameState = game.state[gameType].players[game.state[gameType].currentPlayerIndex];
                    if (currentPlayerInGameState && currentPlayerInGameState.mode === 'bot') {
                         // Human player cannot make a move when it's bot's turn
                         sendToClient(clientId, { type: 'ERROR', message: 'It is a bot\'s turn. Please wait.' });
                         return;
                    }

                    // For human players, strict turn check
                    if (currentPlayerInGameState && currentPlayerInGameState.id !== clientId) {
                        sendToClient(clientId, { type: 'ERROR', message: 'It is not your turn.' });
                        return;
                    }
                    
                    let moveResult = { message: 'Move processed.' };
                    let validation;
                    switch (payload.action) {
                        case 'playCard':
                            validation = gameLogic.validatePlayCard(gameId, clientId, payload);
                            if (validation.error) { sendToClient(clientId, { type: 'ERROR', message: validation.error }); return; }
                            moveResult = gameLogic.applyPlayCard(gameId, clientId, validation);
                            break;
                        case 'drawCard':
                            validation = gameLogic.validateDrawCard(gameId, clientId);
                            if (validation.error) { sendToClient(clientId, { type: 'ERROR', message: validation.error }); return; }
                            moveResult = gameLogic.applyDrawCard(gameId, clientId, validation);
                            break;
                        case 'selectWildColor':
                            validation = gameLogic.validateWildColorSelection(gameId, clientId, payload);
                            if (validation.error) { sendToClient(clientId, { type: 'ERROR', message: validation.error }); return; }
                            moveResult = gameLogic.applyWildColorSelection(gameId, clientId, payload);
                            break;
                        case 'declareUno':
                            validation = gameLogic.validateDeclareUno(gameId, clientId);
                            if (validation.error) { sendToClient(clientId, { type: 'ERROR', message: validation.error }); return; }
                            moveResult = gameLogic.applyDeclareUno(gameId, clientId);
                            break;
                        case 'endTurn':
                            validation = gameLogic.validateEndTurn(gameId, clientId);
                            if (validation.error) { sendToClient(clientId, { type: 'ERROR', message: validation.error }); return; }
                            moveResult = gameLogic.applyEndTurn(gameId, clientId);
                            break;
                        // Add cases for Ludo, Monopoly, Chess moves here
                        default:
                            sendToClient(clientId, { type: 'ERROR', message: 'Unknown move action.' });
                            return;
                    }

                    // After move, potentially check for bot turn
                    game.currentPlayerTurnId = game.state[gameType].players[game.state[gameType].currentPlayerIndex].id;
                    const newCurrentPlayer = game.state[gameType].players.find(p => p.id === game.currentPlayerTurnId);
                    
                    // Broadcast the updated game state to all players in the game
                    broadcastToGame(gameId, { 
                        type: 'GAME_STATE_UPDATE', 
                        gameId: gameId, 
                        state: game.state, 
                        moveResult: moveResult,
                        currentPlayerTurnId: game.currentPlayerTurnId,
                        gameStatus: game.status
                    });

                    // If it's now a bot's turn, trigger bot action after a small delay
                    if (newCurrentPlayer && newCurrentPlayer.mode === 'bot' && game.status === 'playing') {
                        // Small delay to allow clients to update UI first
                        setTimeout(async () => {
                            let botResult = null;
                            if (gameType === 'uno') {
                                botResult = gameLogic.botPlayUno(gameId, game.currentPlayerTurnId);
                            }
                            // Add other game types bot logic here
                            
                            if (botResult) {
                                // Re-broadcast state after bot move
                                game.currentPlayerTurnId = game.state[gameType].players[game.state[gameType].currentPlayerIndex].id;
                                broadcastToGame(gameId, { 
                                    type: 'GAME_STATE_UPDATE', 
                                    gameId: gameId, 
                                    state: game.state, 
                                    moveResult: botResult,
                                    currentPlayerTurnId: game.currentPlayerTurnId,
                                    gameStatus: game.status
                                });
                            }
                        }, 1500); // 1.5 seconds delay for bot
                    }

                    if (game.status === 'finished') {
                        console.log(`Game ${gameId} finished. Winner: ${game.state[gameType]?.winner}`);
                        // Optional: cleanup or move game to archive
                        // delete games[gameId]; // Keep in-memory for a bit so players can see final state
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

    ws.on('close', async () => { // Mark async for Firestore operations
        console.log(`Client ${clientId} disconnected.`);
        clients.delete(clientId);

        // Remove client from any games they were in
        for (const gameId in games) {
            const game = games[gameId];
            if (game.players[clientId]) {
                const disconnectedPlayer = game.players[clientId];
                delete game.players[clientId];
                game.turnOrder = game.turnOrder.filter(id => id !== clientId);

                // If it was their turn, advance the turn
                const currentPlayerInGameState = game.state[game.type].players.find(p => p.id === game.state[game.type].players[game.state[game.type].currentPlayerIndex].id);
                if (currentPlayerInGameState && currentPlayerInGameState.id === clientId) {
                     SERVER_GAME_LOGIC[game.type]?.nextTurn(gameId); // Advance turn
                }
                
                // Filter out disconnected player from game-specific state
                if (game.state[game.type] && game.state[game.type].players) {
                    game.state[game.type].players = game.state[game.type].players.filter(p => p.id !== clientId);
                    // Adjust currentPlayerIndex if necessary
                    if (game.state[game.type].currentPlayerIndex >= game.state[game.type].players.length) {
                        game.state[game.type].currentPlayerIndex = 0;
                    }
                }
                
                if (Object.keys(game.players).length === 0) {
                    delete games[gameId];
                    await deleteGameFromFirestore(gameId); // Delete from Firestore if empty
                    console.log(`Game ${gameId} disbanded due to all players leaving.`);
                } else if (game.ownerId === clientId) {
                    const newOwnerClientId = Object.keys(game.players)[0];
                    if (newOwnerClientId) {
                        game.ownerId = newOwnerClientId;
                        game.players[newOwnerClientId].isOwner = true;
                        broadcastToGame(gameId, { type: 'OWNER_CHANGED', newOwnerId: newOwnerClientId });
                    } else { // Should not happen if other players exist
                        delete games[gameId];
                        await deleteGameFromFirestore(gameId);
                    }
                }
                broadcastToGame(gameId, { type: 'PLAYER_LEFT', clientId: clientId, game: game });
                await saveGameToFirestore(gameId); // Save updated state after player leaves
            }
        }
        sendLobbyUpdate();
    });

    ws.on('error', error => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});
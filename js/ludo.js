document.addEventListener('DOMContentLoaded', () => {
    const gameContainer = document.getElementById('ludo-board');
    const rollDiceBtn = document.getElementById('roll-dice');
    const diceValueDisplay = document.getElementById('dice-value');
    const startAiGameBtn = document.getElementById('start-ai-game');
    const startLocalPvPBtn = document.getElementById('start-local-pvp');
    const startOnlinePvPBtn = document.getElementById('start-online-pvp');
    const resetGameBtn = document.getElementById('reset-game');
    const playerTurnInfo = document.getElementById('player-turn-info');
    const gameStatus = document.getElementById('game-status');
    const chatContainer = document.getElementById('chat-container');

    let gameMode = null; // 'ai', 'local-pvp', 'online-pvp'
    let players = []; // Array of player objects {color: 'red', isAI: false, tokens: [...]}
    let currentPlayerIndex = 0;
    let diceRolledValue = 0;
    let gameActive = false;
    let rolledSixesCount = 0; // For Ludo rule: three sixes in a row
    let myPlayerColor = null; // For online PvP, set by server

    // --- Ludo Board & Path Configuration ---
    const CELL_SIZE = 40; // px
    const BOARD_SIZE = 15; // 15x15 grid

    // Define the main path cells in order (r, c) coordinates (52 cells)
    // This traces the outer circuit clockwise, starting from Red's first step.
    const LUDO_MAIN_PATH_COORDINATES = [
        // Red's vertical path out of base (6,1) -> (6,5)
        { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
        // Corner turn to Green's region (5,6) -> (1,6)
        { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 },
        // Top horizontal path (0,6) -> (0,8)
        { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 0, c: 8 },
        // Green's vertical path (1,8) -> (5,8)
        { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
        // Corner turn to Yellow's region (6,9) -> (6,13)
        { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 },
        // Right vertical path (6,14) -> (8,14)
        { r: 6, c: 14 }, { r: 7, c: 14 }, { r: 8, c: 14 },
        // Yellow's horizontal path (8,13) -> (8,9)
        { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
        // Corner turn to Blue's region (9,8) -> (13,8)
        { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 },
        // Bottom horizontal path (14,8) -> (14,6)
        { r: 14, c: 8 }, { r: 14, c: 7 }, { r: 14, c: 6 },
        // Blue's vertical path (13,6) -> (9,6)
        { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
        // Corner turn back to Red's region (8,5) -> (8,1)
        { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 },
        // Left vertical path (8,0) -> (6,0)
        { r: 8, c: 0 }, { r: 7, c: 0 }, { r: 6, c: 0 }
    ]; // Total 52 cells in the main path

    // Player specific start positions (on main path, where token enters from base)
    const PLAYER_MAIN_START_INDEX = {
        red: 0,      // (6,1)
        green: 13,   // (1,8)
        yellow: 26,  // (8,13)
        blue: 39     // (13,6)
    };

    // Player specific home entry positions (on main path, before entering home path)
    const PLAYER_HOME_ENTRY_INDEX = {
        red: 51,     // (6,0) -- for red, it's the cell before its home column starts
        green: 12,   // (0,7) -- for green, it's the cell before its home row starts
        yellow: 25,  // (8,14) -- for yellow, it's the cell before its home column starts
        blue: 38     // (14,7) -- for blue, it's the cell before its home row starts
    };


    // Home path coordinates for each color (6 cells + 1 final home cell)
    const HOME_PATH_COORDINATES = {
        red: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }], // r:7, c:7 is the final home
        green: [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }], // r:7, c:7 is the final home
        yellow: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }], // r:7, c:7 is the final home
        blue: [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }] // r:7, c:7 is the final home
    };

    // Base positions for tokens when they are in home
    const BASE_POSITIONS = {
        red: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 2, c: 1 }, { r: 2, c: 2 }],
        green: [{ r: 1, c: 12 }, { r: 1, c: 13 }, { r: 2, c: 12 }, { r: 2, c: 13 }],
        blue: [{ r: 12, c: 1 }, { r: 12, c: 2 }, { r: 13, c: 1 }, { r: 13, c: 2 }],
        yellow: [{ r: 12, c: 12 }, { r: 12, c: 13 }, { r: 13, c: 12 }, { r: 13, c: 13 }]
    };

    // Safe zones (stars on real board) - these tokens cannot be cut
    const SAFE_ZONES = [
        LUDO_MAIN_PATH_COORDINATES[1], LUDO_MAIN_PATH_COORDINATES[8], LUDO_MAIN_PATH_COORDINATES[14], LUDO_MAIN_PATH_COORDINATES[21],
        LUDO_MAIN_PATH_COORDINATES[27], LUDO_MAIN_PATH_COORDINATES[34], LUDO_MAIN_PATH_COORDINATES[40], LUDO_MAIN_PATH_COORDINATES[47]
    ];
    // Also the player start positions are safe zones
    const ALL_SAFE_ZONES = [...SAFE_ZONES, ...Object.values(PLAYER_MAIN_START_INDEX).map(idx => LUDO_MAIN_PATH_COORDINATES[idx])];


    // --- Game Initialization & UI Setup ---
    function initializeGame(mode, numPlayers = 4) {
        gameMode = mode;
        gameActive = true;
        currentPlayerIndex = 0;
        diceRolledValue = 0;
        rolledSixesCount = 0;
        gameStatus.textContent = '';
        myPlayerColor = (mode === 'ai' || mode === 'local-pvp') ? 'red' : null; // Human always red locally, online assigned by server

        players = [];
        const colors = ['red', 'green', 'blue', 'yellow'];
        for (let i = 0; i < numPlayers; i++) {
            players.push({
                color: colors[i],
                isAI: (mode === 'ai' && i !== 0), // Only first player (red) is human in AI mode
                tokens: [
                    { id: `${colors[i]}1`, pos: 'base', pathIdx: -1, isFinished: false },
                    { id: `${colors[i]}2`, pos: 'base', pathIdx: -1, isFinished: false },
                    { id: `${colors[i]}3`, pos: `${colors[i]}`, pathIdx: -1, isFinished: false }, // Store player color as part of token for quick access
                    { id: `${colors[i]}4`, pos: `${colors[i]}`, pathIdx: -1, isFinished: false }
                ]
            });
        }

        renderBoard();
        renderTokens();
        updateTurnInfo();

        startAiGameBtn.style.display = 'none';
        startLocalPvPBtn.style.display = 'none';
        startOnlinePvPBtn.style.display = 'none';
        resetGameBtn.style.display = 'inline-block';
        rollDiceBtn.style.display = 'inline-block';
        diceValueDisplay.textContent = 'Roll!';
        rollDiceBtn.disabled = false;

        if (gameMode === 'online-pvp') {
            chatContainer.style.display = 'block';
            connectToPvPServer(); // Function from pvp.js
            updateGameStatus('Connecting to online PvP...');
            // In online PvP, the server dictates who starts and which color you are.
        } else {
            chatContainer.style.display = 'none';
            checkAIorHumanTurn();
        }
    }

    // This function will be called by pvp.js when a message comes from the server
    window.handleLudoServerMessage = function(message) {
        if (message.type === 'player_assigned') {
            myPlayerColor = message.color;
            updateGameStatus(`Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`);
            // Update players array based on server assignments (e.g., player1: myPlayerColor, player2: opponentColor)
            // For now, assume a 2-player game where you are 'red' or 'green'
            players = players.filter(p => p.color === myPlayerColor || p.color === (myPlayerColor === 'red' ? 'green' : 'red')); // Simplistic for 2 players
        } else if (message.type === 'game_state_update') {
            // Update game state based on server message
            // Assume message.gameState contains full `players` array, `currentPlayerIndex`, `diceRolledValue`, `gameActive` etc.
            players = message.gameState.players;
            currentPlayerIndex = message.gameState.currentPlayerIndex;
            diceRolledValue = message.gameState.diceRolledValue;
            gameActive = message.gameState.gameActive;
            rolledSixesCount = message.gameState.rolledSixesCount;

            renderBoard();
            renderTokens();
            updateTurnInfo();
            diceValueDisplay.textContent = diceRolledValue || 'Roll!';

            if (gameActive) {
                if (players[currentPlayerIndex].color === myPlayerColor) {
                    updateGameStatus("It's your turn!");
                    rollDiceBtn.disabled = false;
                } else {
                    updateGameStatus(`It's ${players[currentPlayerIndex].color.toUpperCase()}'s turn. Waiting for opponent...`);
                    rollDiceBtn.disabled = true;
                }
            } else {
                updateGameStatus(message.gameState.finalMessage || "Game Over!");
                rollDiceBtn.disabled = true;
            }
        } else if (message.type === 'chat_message') {
            // Chat is handled in pvp.js directly, but could be passed here.
        }
    };


    function renderBoard() {
        gameContainer.innerHTML = ''; // Clear previous board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('ludo-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;

                // Color home bases (larger areas)
                if (r < 6 && c < 6) cell.classList.add('red-base');
                if (r < 6 && c > 8) cell.classList.add('green-base');
                if (r > 8 && c < 6) cell.classList.add('blue-base');
                if (r > 8 && c > 8) cell.classList.add('yellow-base');

                // Inner 'houses' within bases where tokens start
                if ((r === 1 || r === 2) && (c === 1 || c === 2)) cell.classList.add('red-base', 'house');
                if ((r === 1 || r === 2) && (c === 12 || c === 13)) cell.classList.add('green-base', 'house');
                if ((r === 12 || r === 13) && (c === 1 || c === 2)) cell.classList.add('blue-base', 'house');
                if ((r === 12 || r === 13) && (c === 12 || c === 13)) cell.classList.add('yellow-base', 'house');

                // Center home area
                if (r >= 6 && r <= 8 && c >= 6 && c <= 8) cell.classList.add('center-home');
                if (r === 7 && c === 7) { // The final home cell
                    // Add a special class for the actual home cell, perhaps color it based on who "owns" it
                    cell.classList.add('final-home');
                    if (players.some(p => p.color === 'red' && p.tokens.every(t => t.isFinished))) cell.classList.add('red-center');
                    if (players.some(p => p.color === 'green' && p.tokens.every(t => t.isFinished))) cell.classList.add('green-center');
                    if (players.some(p => p.color === 'blue' && p.tokens.every(t => t.isFinished))) cell.classList.add('blue-center');
                    if (players.some(p => p.color === 'yellow' && p.tokens.every(t => t.isFinished))) cell.classList.add('yellow-center');
                }


                const pathCoord = { r: r, c: c };
                // Main path cells
                if (isCoordInList(pathCoord, LUDO_MAIN_PATH_COORDINATES)) {
                    // Start cells for each player
                    if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.red])) cell.classList.add('red-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.green])) cell.classList.add('green-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.yellow])) cell.classList.add('yellow-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.blue])) cell.classList.add('blue-start');

                    // Safe zones (stars on a physical board)
                    if (isCoordInList(pathCoord, ALL_SAFE_ZONES)) {
                         cell.classList.add('safe-cell');
                    }
                }
                // Home paths
                if (isCoordInList(pathCoord, HOME_PATH_COORDINATES.red)) cell.classList.add('red-home-path');
                if (isCoordInList(pathCoord, HOME_PATH_COORDINATES.green)) cell.classList.add('green-home-path');
                if (isCoordInList(pathCoord, HOME_PATH_COORDINATES.yellow)) cell.classList.add('yellow-home-path');
                if (isCoordInList(pathCoord, HOME_PATH_COORDINATES.blue)) cell.classList.add('blue-home-path');

                gameContainer.appendChild(cell);
            }
        }
    }

    function isCoordInList(coord, list) {
        return list.some(item => item.r === coord.r && item.c === coord.c);
    }

    function isCoordSame(coord1, coord2) {
        return coord1.r === coord2.r && coord1.c === coord2.c;
    }


    function renderTokens() {
        document.querySelectorAll('.ludo-token').forEach(token => token.remove()); // Clear old tokens

        players.forEach(player => {
            player.tokens.forEach((token, index) => {
                if (token.isFinished) return; // Don't render finished tokens

                const tokenElement = document.createElement('div');
                tokenElement.classList.add('ludo-token', player.color);
                tokenElement.id = token.id;
                tokenElement.textContent = index + 1; // Display token number
                tokenElement.dataset.playerColor = player.color;
                tokenElement.dataset.tokenId = token.id;
                tokenElement.dataset.tokenIndex = index;

                let targetCoord;
                if (token.pos === 'base') {
                    // Position within their base area
                    targetCoord = BASE_POSITIONS[player.color][index];
                } else if (token.pos === 'main_path') {
                    targetCoord = LUDO_MAIN_PATH_COORDINATES[token.pathIdx];
                } else if (token.pos === 'home_path') {
                    targetCoord = HOME_PATH_COORDINATES[player.color][token.pathIdx]; // pathIdx is now relative to home path start
                } else {
                    // Should not happen for active tokens
                    return;
                }

                // Set token position using CSS transform for smooth movement
                // Adjust for token size to center it in the cell
                const xOffset = targetCoord.c * CELL_SIZE + (CELL_SIZE / 2 - 15);
                const yOffset = targetCoord.r * CELL_SIZE + (CELL_SIZE / 2 - 15);
                tokenElement.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                gameContainer.appendChild(tokenElement);

                // Add event listener only if it's the current player's token and it's a human player
                const currentPlayerObj = players[currentPlayerIndex];
                if (!currentPlayerObj.isAI && currentPlayerObj.color === player.color) {
                    tokenElement.addEventListener('click', handleTokenClick);
                }
            });
        });
    }

    function updateTurnInfo() {
        const currentPlayerObj = players[currentPlayerIndex];
        let infoText = `Current Turn: ${currentPlayerObj.color.toUpperCase()}`;
        if (currentPlayerObj.isAI) infoText += ' (AI)';
        if (gameMode === 'online-pvp' && myPlayerColor === currentPlayerObj.color) infoText += ' (You)';
        else if (gameMode === 'online-pvp' && myPlayerColor !== currentPlayerObj.color) infoText += ' (Opponent)';
        playerTurnInfo.textContent = infoText;
    }

    function updateGameStatus(message, isError = false) {
        gameStatus.textContent = message;
        gameStatus.style.color = isError ? '#e74c3c' : '#27ae60';
    }

    function switchTurn() {
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
        updateTurnInfo();
        diceRolledValue = 0;
        diceValueDisplay.textContent = 'Roll!';
        rollDiceBtn.disabled = false;
        rolledSixesCount = 0; // Reset consecutive sixes count

        // Remove highlight from all tokens
        document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));

        if (gameMode === 'online-pvp') {
             // Do not directly call checkAIorHumanTurn, wait for server update
             updateGameStatus("Waiting for opponent's turn...");
             rollDiceBtn.disabled = true; // Disable until server confirms it's your turn
        } else {
            checkAIorHumanTurn();
        }
    }

    function checkAIorHumanTurn() {
        if (!gameActive) return;

        const currentPlayerObj = players[currentPlayerIndex];
        if (currentPlayerObj.isAI) {
            rollDiceBtn.disabled = true;
            updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) is thinking...`);
            setTimeout(makeAIMove, 1500); // AI's turn after a delay
        } else { // Human Player
            updateGameStatus(`It's your turn, ${currentPlayerObj.color.toUpperCase()}. Roll the dice!`);
            rollDiceBtn.disabled = false;
        }
    }


    // --- Game Logic: Dice Roll, Token Movement, Rules ---
    rollDiceBtn.addEventListener('click', () => {
        if (!gameActive) {
            updateGameStatus("Start a game first!", true);
            return;
        }
        const currentPlayerObj = players[currentPlayerIndex];
        if (currentPlayerObj.isAI) {
            updateGameStatus("It's AI's turn, please wait.", true);
            return;
        }
        if (gameMode === 'online-pvp' && currentPlayerObj.color !== myPlayerColor) {
             updateGameStatus("It's not your turn!", true);
             return;
        }
        if (diceRolledValue !== 0) {
            updateGameStatus("You've already rolled! Move a token or pass turn.", true);
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;

        if (gameMode === 'online-pvp') {
            sendGameAction('ludo_roll_dice', { roll: roll });
            rollDiceBtn.disabled = true; // Disable until server confirms roll
            updateGameStatus("Rolling dice, waiting for server...");
        } else {
            processDiceRoll(roll);
        }
    });

    function processDiceRoll(roll) {
        diceRolledValue = roll;
        diceValueDisplay.textContent = diceRolledValue;
        updateGameStatus(`You rolled a ${diceRolledValue}!`);
        rollDiceBtn.disabled = true;

        const currentPlayerObj = players[currentPlayerIndex];

        if (diceRolledValue === 6) {
            rolledSixesCount++;
            if (rolledSixesCount === 3) {
                updateGameStatus("Three 6s in a row! Your turn is skipped.", true);
                setTimeout(switchTurn, 1000);
                return;
            }
        } else {
            rolledSixesCount = 0; // Reset if not a 6
        }

        const possibleMoves = getPossibleMoves(currentPlayerObj, diceRolledValue);

        if (possibleMoves.length === 0) {
            updateGameStatus(`No moves possible for ${currentPlayerObj.color.toUpperCase()}.`);
            setTimeout(switchTurn, 1000); // No moves, switch turn after a delay
        } else {
            possibleMoves.forEach(move => {
                const tokenElement = document.getElementById(move.token.id);
                if (tokenElement) tokenElement.classList.add('movable');
            });
            updateGameStatus(`Select a ${currentPlayerObj.color.toUpperCase()} token to move.`);
        }
    }

    function getPossibleMoves(player, diceValue) {
        const moves = [];
        player.tokens.forEach((token, tokenIndex) => {
            if (token.isFinished) return;

            // Move from base (only on 6)
            if (token.pos === 'base') {
                if (diceValue === 6) {
                    // Check if the starting position is blocked by own tokens
                    const startPosMainPathIdx = PLAYER_MAIN_START_INDEX[player.color];
                    const startPosCoords = LUDO_MAIN_PATH_COORDINATES[startPosMainPathIdx];
                    const tokensOnStart = player.tokens.filter(t =>
                        t.pos === 'main_path' && t.pathIdx === startPosMainPathIdx
                    );
                    // A player can only have ONE token on their starting position.
                    // This rule varies; some allow stacking. Assuming no stacking on start for simplicity.
                    if (tokensOnStart.length === 0) {
                        moves.push({ token: token, newPosType: 'main_path', newPathIdx: startPosMainPathIdx, type: 'start' });
                    }
                }
            }
            // Move on main path or home path
            else {
                let currentAbsoluteMainPathIdx = -1; // Represents token's position relative to start of LUDO_MAIN_PATH_COORDINATES
                let currentHomePathIdx = -1; // Represents token's position relative to start of HOME_PATH_COORDINATES[player.color]

                if (token.pos === 'main_path') {
                    currentAbsoluteMainPathIdx = token.pathIdx;
                } else if (token.pos === 'home_path') {
                    currentHomePathIdx = token.pathIdx;
                }

                // Calculate potential end position for the token
                let newMainPathIdx = -1;
                let newHomePathIdx = -1;
                let newPosType = '';
                let isFinished = false;

                if (token.pos === 'main_path') {
                    const homeEntryMainPathIdx = PLAYER_HOME_ENTRY_INDEX[player.color];
                    const mainPathLength = LUDO_MAIN_PATH_COORDINATES.length;

                    // Steps needed to reach the home entry cell (inclusive)
                    let stepsToHomeEntry;
                    if (currentAbsoluteMainPathIdx <= homeEntryMainPathIdx) {
                        stepsToHomeEntry = homeEntryMainPathIdx - currentAbsoluteMainPathIdx;
                    } else { // Wrapped around the board
                        stepsToHomeEntry = (mainPathLength - currentAbsoluteMainPathIdx) + homeEntryMainPathIdx;
                    }

                    if (diceValue <= stepsToHomeEntry) { // Still on main path or landing exactly on home entry
                        newMainPathIdx = (currentAbsoluteMainPathIdx + diceValue) % mainPathLength;
                        newPosType = 'main_path';
                    } else { // Moving into home path
                        const stepsIntoHomePath = diceValue - stepsToHomeEntry;
                        if (stepsIntoHomePath <= HOME_PATH_COORDINATES[player.color].length) {
                            newHomePathIdx = stepsIntoHomePath - 1; // 0-indexed for home path array
                            newPosType = 'home_path';
                            if (newHomePathIdx === HOME_PATH_COORDINATES[player.color].length - 1) { // Exactly lands on last home path cell
                                isFinished = true;
                                newPosType = 'finished';
                                newHomePathIdx = -1; // No longer on a path index
                            }
                        } else {
                            // Overshot the home path, invalid move for this token
                            return;
                        }
                    }
                } else if (token.pos === 'home_path') {
                    newHomePathIdx = currentHomePathIdx + diceValue;
                    if (newHomePathIdx < HOME_PATH_COORDINATES[player.color].length) {
                        newPosType = 'home_path';
                    } else if (newHomePathIdx === HOME_PATH_COORDINATES[player.color].length) {
                        isFinished = true;
                        newPosType = 'finished';
                        newHomePathIdx = -1;
                    } else {
                        // Overshot home, invalid move
                        return;
                    }
                }

                // Check for blocking by own tokens on the target cell
                if (newPosType === 'main_path') {
                    const blockingTokens = player.tokens.filter(t =>
                        t.id !== token.id && t.pos === 'main_path' && t.pathIdx === newMainPathIdx
                    );
                    // Player can stack own tokens on main path (most Ludo rules allow this), so not blocked unless it's a specific cell type.
                    // Simplified: Assuming a player can stack on main path, so no blocking.
                } else if (newPosType === 'home_path') {
                    const blockingTokens = player.tokens.filter(t =>
                        t.id !== token.id && t.pos === 'home_path' && t.pathIdx === newHomePathIdx
                    );
                    if (blockingTokens.length > 0) { // Can't land on own token in home path
                        return; // Blocked
                    }
                }

                moves.push({ token: token, newPosType: newPosType, newPathIdx: newHomePathIdx !== -1 ? newHomePathIdx : newMainPathIdx, isFinished: isFinished, type: 'move' });
            }
        });
        return moves;
    }

    function handleTokenClick(event) {
        if (diceRolledValue === 0) {
            updateGameStatus("Roll the dice first!", true);
            return;
        }

        const clickedTokenId = event.target.dataset.tokenId;
        const clickedTokenPlayerColor = event.target.dataset.playerColor;
        const tokenIndex = parseInt(event.target.dataset.tokenIndex);

        const currentPlayerObj = players[currentPlayerIndex];
        if (clickedTokenPlayerColor !== currentPlayerObj.color) {
            updateGameStatus("That's not your token!", true);
            return;
        }
        if (gameMode === 'online-pvp' && currentPlayerObj.color !== myPlayerColor) {
             updateGameStatus("It's not your turn!", true);
             return;
        }

        const tokenToMove = currentPlayerObj.tokens[tokenIndex];
        const possibleMoves = getPossibleMoves(currentPlayerObj, diceRolledValue);
        const selectedMove = possibleMoves.find(move => move.token.id === clickedTokenId);

        if (selectedMove) {
            if (gameMode === 'online-pvp') {
                sendGameAction('ludo_move_token', {
                    token: { id: selectedMove.token.id, index: tokenIndex },
                    newPosType: selectedMove.newPosType,
                    newPathIdx: selectedMove.newPathIdx,
                    diceValue: diceRolledValue
                });
                // Disable tokens and dice until server confirms move
                document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));
                rollDiceBtn.disabled = true;
                updateGameStatus("Moving token, waiting for server confirmation...");
            } else {
                executeMove(tokenToMove, selectedMove.newPosType, selectedMove.newPathIdx, selectedMove.isFinished);
                // After move, clear highlights and determine next action (another roll or switch turn)
                document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));
            }
        } else {
            updateGameStatus("Invalid move for this token with the current dice roll.", true);
        }
    }

    function executeMove(token, newPosType, newPathIdx, isFinishedFlag, playerColorOverride = null) {
        const player = players.find(p => p.color === (playerColorOverride || token.dataset.playerColor || token.id.slice(0, token.id.length - 1)));
        if (!player) return; // Should not happen

        let playerGotAnotherTurn = false; // For 6, kill, or home entry

        // Update logical position
        token.pos = newPosType;
        token.pathIdx = newPathIdx;
        token.isFinished = isFinishedFlag;

        // Visual update
        renderTokens(); // Re-render all tokens to ensure correct positions and removal of finished tokens

        // Check for killing opponents (complex game rule)
        if (newPosType === 'main_path') {
            playerGotAnotherTurn = checkForKills(token, player.color);
        }

        if (isFinishedFlag) {
            updateGameStatus(`${player.color.toUpperCase()}'s token ${token.id.slice(-1)} reached home!`);
            playerGotAnotherTurn = true; // Gets another roll for taking a token home
        }

        // Check for game end
        if (checkGameEnd()) {
            gameActive = false;
            rollDiceBtn.disabled = true;
            updateGameStatus(`${player.color.toUpperCase()} wins!`);
            resetGameBtn.textContent = "Play Again";
            return;
        }

        // Determine next action for local games
        if (gameMode !== 'online-pvp') {
            if (diceRolledValue === 6 || playerGotAnotherTurn) {
                updateGameStatus(`${player.color.toUpperCase()} gets another roll!`);
                diceRolledValue = 0; // Reset dice value
                rollDiceBtn.disabled = false;
                if (player.isAI) {
                    setTimeout(makeAIMove, 1500); // AI rolls again
                }
            } else { // No extra turn conditions met
                setTimeout(switchTurn, 500);
            }
        }
    }

    function checkForKills(movingToken, playerColor) {
        const currentPlayerPathIdx = movingToken.pathIdx;
        const currentPlayerCoords = LUDO_MAIN_PATH_COORDINATES[currentPlayerPathIdx];
        let killedOpponent = false;

        // Check if the cell is a safe zone (can't kill here)
        if (isCoordInList(currentPlayerCoords, ALL_SAFE_ZONES)) {
            return false; // Cannot kill on safe zones
        }

        players.forEach(otherPlayer => {
            if (otherPlayer.color !== playerColor) {
                otherPlayer.tokens.forEach(otherToken => {
                    if (otherToken.pos === 'main_path' && otherToken.pathIdx === currentPlayerPathIdx && !otherToken.isFinished) {
                        // Check if there's only one token of the other player.
                        // Ludo rules usually state you can only kill a single opponent token.
                        // If multiple opponent tokens are on a cell, they are "safe" from being killed.
                        const tokensOnCell = otherPlayer.tokens.filter(t => t.pos === 'main_path' && t.pathIdx === currentPlayerPathIdx);
                        if (tokensOnCell.length === 1) { // Only kill if there's a single opponent token
                            updateGameStatus(`${playerColor.toUpperCase()} killed ${otherPlayer.color.toUpperCase()}'s token ${otherToken.id.slice(-1)}!`);
                            otherToken.pos = 'base'; // Send back to base
                            otherToken.pathIdx = -1;
                            renderTokens(); // Re-render to show token in base
                            killedOpponent = true;
                        }
                    }
                });
            }
        });
        return killedOpponent; // Return true if any opponent was killed
    }

    function checkGameEnd() {
        const currentPlayerObj = players[currentPlayerIndex];
        const finishedTokens = currentPlayerObj.tokens.filter(token => token.isFinished);
        return finishedTokens.length === 4;
    }

    // --- AI Logic (Basic for Ludo) ---
    function makeAIMove() {
        const currentPlayerObj = players[currentPlayerIndex];
        const aiDiceValue = Math.floor(Math.random() * 6) + 1;
        diceValueDisplay.textContent = aiDiceValue;
        updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) rolled a ${aiDiceValue}!`);

        setTimeout(() => {
            // Process the AI's roll as a human would
            diceRolledValue = aiDiceValue;
            const possibleMoves = getPossibleMoves(currentPlayerObj, aiDiceValue);

            if (possibleMoves.length > 0) {
                let chosenMove = null;

                // AI Strategy (prioritized):
                // 1. If 6, try to bring a token out of base.
                // 2. Prioritize moves that kill an opponent's token.
                // 3. Prioritize moves that send a token home.
                // 4. Otherwise, pick any valid move.

                // 1. Bring token out of base on 6
                if (aiDiceValue === 6) {
                    chosenMove = possibleMoves.find(m => m.token.pos === 'base');
                }

                // 2. Try to find a killing move
                if (!chosenMove) {
                    for (const move of possibleMoves) {
                        const originalToken = move.token;
                        const tempBoardState = JSON.parse(JSON.stringify(players)); // Deep copy to simulate

                        // Simulate the move
                        const tempToken = tempBoardState[currentPlayerIndex].tokens.find(t => t.id === originalToken.id);
                        tempToken.pos = move.newPosType;
                        tempToken.pathIdx = move.newPathIdx;

                        const killed = checkForKills(tempToken, currentPlayerObj.color);
                        if (killed) {
                            chosenMove = move;
                            break;
                        }
                    }
                }

                // 3. Try to find a move that sends a token home
                if (!chosenMove) {
                    chosenMove = possibleMoves.find(m => m.isFinished);
                }

                // 4. Otherwise, just pick the first valid move
                if (!chosenMove) {
                    chosenMove = possibleMoves[0];
                }

                executeMove(chosenMove.token, chosenMove.newPosType, chosenMove.newPathIdx, chosenMove.isFinished);

            } else {
                updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) has no moves.`);
                setTimeout(switchTurn, 1000);
            }
        }, 1500); // Wait for dice to "roll" and then decide
    }


    // --- Event Listeners for Game Modes ---
    startAiGameBtn.addEventListener('click', () => initializeGame('ai', 4)); // Human (red) vs 3 AIs
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp', 4)); // 4 human players
    startOnlinePvPBtn.addEventListener('click', () => {
        updateGameStatus('Attempting to connect for Online PvP...');
        initializeGame('online-pvp', 2); // Assuming 2 players for online PvP for simplicity
    });
    resetGameBtn.addEventListener('click', () => {
        location.reload(); // Simple way to reset game
    });

    // Initial state: show game mode buttons
    rollDiceBtn.style.display = 'none';
    resetGameBtn.style.display = 'none';
    playerTurnInfo.style.display = 'block'; // Make sure info is visible
    updateGameStatus('Choose a game mode to start!');
});

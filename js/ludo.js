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

    // --- Ludo Board & Path Configuration ---
    const CELL_SIZE = 40; // px
    const BOARD_SIZE = 15; // 15x15 grid

    // Define the path cells in order (row, col) coordinates
    // This is a simplified linear path mapping to grid positions.
    // Real Ludo boards have specific winding paths.
    // (row, col) mapping to board coordinates.
    // This requires careful manual mapping based on standard Ludo board layout.
    // Example: A clockwise path starting from Red's initial move square.
    const LUDO_PATH_COORDINATES = [
        // Red's vertical path out of base
        { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
        // Corner turn
        { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 },
        // Top horizontal path
        { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 0, c: 8 },
        // Green's path (continue from above)
        { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
        // Corner turn
        { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 },
        // Right vertical path
        { r: 6, c: 14 }, { r: 7, c: 14 }, { r: 8, c: 14 },
        // Yellow's path
        { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
        // Corner turn
        { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 },
        // Bottom horizontal path
        { r: 14, c: 8 }, { r: 14, c: 7 }, { r: 14, c: 6 },
        // Blue's path
        { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
        // Corner turn
        { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 },
        // Left vertical path
        { r: 8, c: 0 }, { r: 7, c: 0 }, { r: 6, c: 0 }
    ]; // Total 52 cells in the main path

    // Home path coordinates for each color (6 cells + 1 final home cell)
    const HOME_PATH_COORDINATES = {
        red: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }],
        green: [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }],
        yellow: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }],
        blue: [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }]
    };

    // Starting positions on the main path for each player
    const PLAYER_START_POSITIONS = {
        red: 0,
        green: 13, // 13 cells after red's start
        yellow: 26, // 26 cells after red's start
        blue: 39 // 39 cells after red's start
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
        LUDO_PATH_COORDINATES[1], LUDO_PATH_COORDINATES[8], LUDO_PATH_COORDINATES[14], LUDO_PATH_COORDINATES[21],
        LUDO_PATH_COORDINATES[27], LUDO_PATH_COORDINATES[34], LUDO_PATH_COORDINATES[40], LUDO_PATH_COORDINATES[47]
    ];
    // Also the start positions are safe zones (first cell after base)
    const START_POS_SAFE = [
        LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.red],
        LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.green],
        LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.yellow],
        LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.blue]
    ];


    // --- Game Initialization & UI Setup ---
    function initializeGame(mode, numPlayers = 4) { // numPlayers for local PvP/AI setup
        gameMode = mode;
        gameActive = true;
        currentPlayerIndex = 0;
        diceRolledValue = 0;
        rolledSixesCount = 0;
        gameStatus.textContent = '';

        players = [];
        const colors = ['red', 'green', 'blue', 'yellow'];
        for (let i = 0; i < numPlayers; i++) {
            players.push({
                color: colors[i],
                isAI: (mode === 'ai' && i !== 0), // Only first player (red) is human in AI mode
                tokens: [
                    { id: `${colors[i]}1`, pos: 'base', pathIdx: -1, isFinished: false },
                    { id: `${colors[i]}2`, pos: 'base', pathIdx: -1, isFinished: false },
                    { id: `${colors[i]}3`, pos: 'base', pathIdx: -1, isFinished: false },
                    { id: `${colors[i]}4`, pos: 'base', pathIdx: -1, isFinished: false }
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
            // In online PvP, the server dictates who starts. For now, assume player 0 starts.
        } else {
            chatContainer.style.display = 'none';
            checkAIorHumanTurn();
        }
    }

    function renderBoard() {
        gameContainer.innerHTML = ''; // Clear previous board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('ludo-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;

                // Color home bases
                if ((r < 6 && c < 6) && !(r > 0 && r < 5 && c > 0 && c < 5)) cell.classList.add('red-base'); // Top-left
                if ((r < 6 && c > 8) && !(r > 0 && r < 5 && c > 9 && c < 14)) cell.classList.add('green-base'); // Top-right
                if ((r > 8 && c < 6) && !(r > 9 && r < 14 && c > 0 && c < 5)) cell.classList.add('blue-base'); // Bottom-left (adjust for blue player)
                if ((r > 8 && c > 8) && !(r > 9 && r < 14 && c > 9 && c < 14)) cell.classList.add('yellow-base'); // Bottom-right

                // Center home area
                if (r >= 6 && r <= 8 && c >= 6 && c <= 8) cell.classList.add('center-home');

                // Path cells (simplified) and special cells
                const pathCoord = { r: r, c: c };
                if (isCoordInList(pathCoord, LUDO_PATH_COORDINATES)) {
                    // Check if it's a start cell
                    if (isCoordSame(pathCoord, LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.red])) cell.classList.add('red-start');
                    else if (isCoordSame(pathCoord, LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.green])) cell.classList.add('green-start');
                    else if (isCoordSame(pathCoord, LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.yellow])) cell.classList.add('yellow-start');
                    else if (isCoordSame(pathCoord, LUDO_PATH_COORDINATES[PLAYER_START_POSITIONS.blue])) cell.classList.add('blue-start');

                    // Check if it's a safe zone
                    if (isCoordInList(pathCoord, SAFE_ZONES) || isCoordInList(pathCoord, START_POS_SAFE)) {
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

                let targetCoord;
                if (token.pos === 'base') {
                    // Position within their base area
                    targetCoord = BASE_POSITIONS[player.color][index];
                } else if (token.pos === 'main_path') {
                    targetCoord = LUDO_PATH_COORDINATES[token.pathIdx];
                } else if (token.pos === 'home_path') {
                    targetCoord = HOME_PATH_COORDINATES[player.color][token.pathIdx - 52]; // Adjust index for home path
                }

                // Set token position using CSS transform for smooth movement
                const xOffset = targetCoord.c * CELL_SIZE + (CELL_SIZE / 2 - 15); // Center token in cell
                const yOffset = targetCoord.r * CELL_SIZE + (CELL_SIZE / 2 - 15);
                tokenElement.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                gameContainer.appendChild(tokenElement);

                // Add event listener only if it's the current player's token and it's a human player
                if (!players[currentPlayerIndex].isAI) {
                    tokenElement.addEventListener('click', handleTokenClick);
                }
            });
        });
    }

    function updateTurnInfo() {
        playerTurnInfo.textContent = `Current Turn: ${players[currentPlayerIndex].color.toUpperCase()}`;
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

        checkAIorHumanTurn();
    }

    function checkAIorHumanTurn() {
        if (gameActive && players[currentPlayerIndex].isAI) {
            rollDiceBtn.disabled = true;
            updateGameStatus(`${players[currentPlayerIndex].color.toUpperCase()} (AI) is thinking...`);
            setTimeout(makeAIMove, 1500); // AI's turn after a delay
        } else if (gameActive) {
            updateGameStatus(`It's your turn, ${players[currentPlayerIndex].color.toUpperCase()}. Roll the dice!`);
            rollDiceBtn.disabled = false;
        }
    }


    // --- Game Logic: Dice Roll, Token Movement, Rules ---
    rollDiceBtn.addEventListener('click', () => {
        if (!gameActive) {
            updateGameStatus("Start a game first!", true);
            return;
        }
        if (players[currentPlayerIndex].isAI) {
            updateGameStatus("It's AI's turn, please wait.", true);
            return;
        }
        if (diceRolledValue !== 0) {
            updateGameStatus("You've already rolled! Move a token or pass turn.", true);
            return;
        }

        diceRolledValue = Math.floor(Math.random() * 6) + 1;
        diceValueDisplay.textContent = diceRolledValue;
        updateGameStatus(`You rolled a ${diceRolledValue}!`);
        rollDiceBtn.disabled = true;

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

        const currentPlayer = players[currentPlayerIndex];
        const possibleMoves = getPossibleMoves(currentPlayer, diceRolledValue);

        if (possibleMoves.length === 0) {
            updateGameStatus(`No moves possible for ${currentPlayer.color.toUpperCase()}.`);
            setTimeout(switchTurn, 1000); // No moves, switch turn after a delay
        } else {
            possibleMoves.forEach(move => {
                const tokenElement = document.getElementById(move.token.id);
                if (tokenElement) tokenElement.classList.add('movable');
            });
            updateGameStatus(`Select a ${currentPlayer.color.toUpperCase()} token to move.`);
        }
    });

    function getPossibleMoves(player, diceValue) {
        const moves = [];
        player.tokens.forEach(token => {
            if (token.isFinished) return;

            // Move from base (only on 6)
            if (token.pos === 'base') {
                if (diceValue === 6) {
                    moves.push({ token: token, newPosType: 'main_path', newPathIdx: PLAYER_START_POSITIONS[player.color] });
                }
            }
            // Move on main path or home path
            else {
                let currentPathArray = (token.pos === 'main_path') ? LUDO_PATH_COORDINATES : HOME_PATH_COORDINATES[player.color];
                let currentPathStartIdx = (token.pos === 'main_path') ? 0 : 52; // 52 is the end of main path
                let effectivePathIdx = token.pathIdx;

                let newPathIdx = effectivePathIdx + diceValue;

                // Check if moving into home path
                if (token.pos === 'main_path') {
                    let endOfMainPathForPlayer = PLAYER_START_POSITIONS[player.color] - 1;
                    if (endOfMainPathForPlayer < 0) endOfMainPathForPlayer = LUDO_PATH_COORDINATES.length - 1; // Wrap around for red/blue

                    // Calculate "distance to home entry" for the current token
                    let distanceToHomeEntry;
                    if (token.pathIdx <= endOfMainPathForPlayer) {
                        distanceToHomeEntry = endOfMainPathForPlayer - token.pathIdx;
                    } else {
                        distanceToHomeEntry = (LUDO_PATH_COORDINATES.length - token.pathIdx) + endOfMainPathForPlayer;
                    }
                    distanceToHomeEntry += 1; // One more step to enter the home path itself

                    if (diceValue > distanceToHomeEntry) {
                        // Can't overshoot home entry or go beyond home path
                        const stepsIntoHomePath = diceValue - distanceToHomeEntry;
                        if (stepsIntoHomePath <= HOME_PATH_COORDINATES[player.color].length) {
                             moves.push({ token: token, newPosType: 'home_path', newPathIdx: 52 + stepsIntoHomePath -1}); // 52 + index in home path
                        }
                    } else {
                        // Still on main path
                        let finalMainPathIdx = (token.pathIdx + diceValue) % LUDO_PATH_COORDINATES.length;
                        moves.push({ token: token, newPosType: 'main_path', newPathIdx: finalMainPathIdx });
                    }
                }
                // Already in home path
                else if (token.pos === 'home_path') {
                    if (newPathIdx < HOME_PATH_COORDINATES[player.color].length) {
                         moves.push({ token: token, newPosType: 'home_path', newPathIdx: newPathIdx });
                    } else if (newPathIdx === HOME_PATH_COORDINATES[player.color].length) {
                        moves.push({ token: token, newPosType: 'finished', newPathIdx: -1 }); // Reached home
                    }
                }
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

        const currentPlayer = players[currentPlayerIndex];
        if (clickedTokenPlayerColor !== currentPlayer.color) {
            updateGameStatus("That's not your token!", true);
            return;
        }

        const possibleMoves = getPossibleMoves(currentPlayer, diceRolledValue);
        const selectedMove = possibleMoves.find(move => move.token.id === clickedTokenId);

        if (selectedMove) {
            executeMove(selectedMove);
            // After move, clear highlights and determine next action (another roll or switch turn)
            document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));

            if (checkGameEnd()) {
                gameActive = false;
                rollDiceBtn.disabled = true;
                updateGameStatus(`${currentPlayer.color.toUpperCase()} wins!`);
                resetGameBtn.textContent = "Play Again";
                return;
            }

            if (diceRolledValue !== 6 && selectedMove.newPosType !== 'base') { // No extra turn for cutting or getting out of base
                if (!checkIfPlayerHasMovesAfterCut()) { // Check if previous cut gave extra turn
                    setTimeout(switchTurn, 500);
                }
            } else { // It was a 6, or a cut happened. Allow another roll.
                updateGameStatus("You rolled a 6! Roll again.", false);
                diceRolledValue = 0; // Reset dice value
                rollDiceBtn.disabled = false;
            }
        } else {
            updateGameStatus("Invalid move for this token with the current dice roll.", true);
        }
    }

    function executeMove(move) {
        const { token, newPosType, newPathIdx } = move;
        const playerColor = token.dataset.playerColor || token.id.slice(0, token.id.length - 1); // Get color from ID if not dataset

        // Update logical position
        token.pos = newPosType;
        token.pathIdx = newPathIdx;
        if (newPosType === 'finished') {
            token.isFinished = true;
        }

        // Visual update
        renderTokens(); // Re-render all tokens to ensure correct positions and removal of finished tokens

        // Check for killing opponents (complex game rule)
        if (newPosType === 'main_path') {
            checkForKills(token, playerColor);
        }

        // Update game status
        updateGameStatus(`${playerColor.toUpperCase()} moved token ${token.id.slice(-1)}.`);
    }

    function checkForKills(movingToken, playerColor) {
        const currentPlayerPathIdx = movingToken.pathIdx;
        const currentPlayerCoords = LUDO_PATH_COORDINATES[currentPlayerPathIdx];

        // Check if the cell is a safe zone (can't kill here)
        if (isCoordInList(currentPlayerCoords, SAFE_ZONES) || isCoordInList(currentPlayerCoords, START_POS_SAFE)) {
            return; // Cannot kill on safe zones
        }

        players.forEach(otherPlayer => {
            if (otherPlayer.color !== playerColor) {
                otherPlayer.tokens.forEach(otherToken => {
                    if (otherToken.pos === 'main_path' && otherToken.pathIdx === currentPlayerPathIdx && !otherToken.isFinished) {
                        // Check if there's only one token of the other player
                        const tokensOnCell = otherPlayer.tokens.filter(t => t.pos === 'main_path' && t.pathIdx === currentPlayerPathIdx);
                        if (tokensOnCell.length === 1) { // Only kill if there's a single opponent token
                            updateGameStatus(`${playerColor.toUpperCase()} killed ${otherPlayer.color.toUpperCase()}'s token ${otherToken.id.slice(-1)}!`);
                            otherToken.pos = 'base'; // Send back to base
                            otherToken.pathIdx = -1;
                            renderTokens(); // Re-render to show token in base
                            diceRolledValue = 0; // Grant current player another roll
                            rollDiceBtn.disabled = false;
                        }
                    }
                });
            }
        });
    }

    function checkIfPlayerHasMovesAfterCut() {
        // If diceRolledValue is 0, it means a 6 was rolled or a kill occurred, allowing another roll.
        return diceRolledValue === 0;
    }


    function checkGameEnd() {
        const currentPlayer = players[currentPlayerIndex];
        const finishedTokens = currentPlayer.tokens.filter(token => token.isFinished);
        return finishedTokens.length === 4;
    }

    // --- AI Logic (Basic for Ludo) ---
    function makeAIMove() {
        const currentPlayer = players[currentPlayerIndex];
        const aiDiceValue = Math.floor(Math.random() * 6) + 1;
        diceValueDisplay.textContent = aiDiceValue;
        updateGameStatus(`${currentPlayer.color.toUpperCase()} (AI) rolled a ${aiDiceValue}!`);
        diceRolledValue = aiDiceValue; // Set dice value for AI's logic

        setTimeout(() => {
            const possibleMoves = getPossibleMoves(currentPlayer, aiDiceValue);

            if (possibleMoves.length > 0) {
                // AI Strategy:
                // 1. If 6, prioritize bringing a token out of base.
                // 2. Prioritize moves that kill an opponent's token.
                // 3. Prioritize moves that send a token home.
                // 4. Otherwise, pick the first valid move.
                let chosenMove = null;

                // Try to bring a token out of base on 6
                if (aiDiceValue === 6) {
                    chosenMove = possibleMoves.find(m => m.token.pos === 'base');
                }

                // If no base move or not a 6, try to find a killing move (simplified check)
                if (!chosenMove) {
                    for (const move of possibleMoves) {
                        // Simulate the move to check for kills - this would be complex
                        // For a simple AI, we'll just check if the destination is occupied by opponent
                        if (move.newPosType === 'main_path') {
                             const targetPathIdx = move.newPathIdx;
                             const targetCoords = LUDO_PATH_COORDINATES[targetPathIdx];
                             if (!isCoordInList(targetCoords, SAFE_ZONES) && !isCoordInList(targetCoords, START_POS_SAFE)) {
                                 for(const otherPlayer of players) {
                                     if (otherPlayer.color !== currentPlayer.color) {
                                         if (otherPlayer.tokens.some(ot => ot.pos === 'main_path' && ot.pathIdx === targetPathIdx)) {
                                             chosenMove = move;
                                             break;
                                         }
                                     }
                                 }
                             }
                        }
                        if (chosenMove) break;
                    }
                }

                // If no better move, just pick the first one
                if (!chosenMove) {
                    chosenMove = possibleMoves[0];
                }

                executeMove(chosenMove);

                if (checkGameEnd()) {
                    gameActive = false;
                    rollDiceBtn.disabled = true;
                    updateGameStatus(`${currentPlayer.color.toUpperCase()} (AI) wins!`);
                    resetGameBtn.textContent = "Play Again";
                    return;
                }

                if (aiDiceValue !== 6 && chosenMove.newPosType !== 'base') { // AI turn ends if not a 6 and not bringing token out of base
                    if (!checkIfPlayerHasMovesAfterCut()) {
                        setTimeout(switchTurn, 1000);
                    } else { // Another roll due to cut
                         updateGameStatus(`${currentPlayer.color.toUpperCase()} (AI) gets another roll!`);
                         diceRolledValue = 0; // Reset dice value
                         setTimeout(makeAIMove, 1500);
                    }
                } else { // AI rolled a 6, or made a cut, allow another roll
                    updateGameStatus(`${currentPlayer.color.toUpperCase()} (AI) rolled a 6! Rolling again...`);
                    diceRolledValue = 0; // Reset dice value
                    setTimeout(makeAIMove, 1500); // AI rolls again
                }

            } else {
                updateGameStatus(`${currentPlayer.color.toUpperCase()} (AI) has no moves.`);
                setTimeout(switchTurn, 1000);
            }
        }, 1500); // Wait for dice to "roll" and then decide
    }


    // --- Event Listeners for Game Modes ---
    startAiGameBtn.addEventListener('click', () => initializeGame('ai', 4)); // Human (red) vs 3 AIs
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp', 4)); // 4 human players
    startOnlinePvPBtn.addEventListener('click', () => {
        // This will connect to a WebSocket server that needs to be running.
        // The server would then handle player assignment and game start.
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
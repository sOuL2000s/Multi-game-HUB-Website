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
    let currentPlayerUID = null; // Firebase UID for online PvP
    let diceRolledValue = 0;
    let gameActive = false;
    let rolledSixesCount = 0; // For Ludo rule: three sixes in a row
    let myPlayerColor = null; // For online PvP, set by server (e.g., 'red', 'green')
    let myUID = null; // My own Firebase UID

    // --- Ludo Board & Path Configuration (Same as before) ---
    const CELL_SIZE = 40;
    const BOARD_SIZE = 15;

    const LUDO_MAIN_PATH_COORDINATES = [
        { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
        { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 },
        { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 0, c: 8 },
        { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
        { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 },
        { r: 6, c: 14 }, { r: 7, c: 14 }, { r: 8, c: 14 },
        { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
        { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 },
        { r: 14, c: 8 }, { r: 14, c: 7 }, { r: 14, c: 6 },
        { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
        { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 },
        { r: 8, c: 0 }, { r: 7, c: 0 }, { r: 6, c: 0 }
    ];

    const PLAYER_MAIN_START_INDEX = {
        red: 0, green: 13, yellow: 26, blue: 39
    };
    const PLAYER_HOME_ENTRY_INDEX = {
        red: 51, green: 12, yellow: 25, blue: 38
    };
    const HOME_PATH_COORDINATES = {
        red: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }],
        green: [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }],
        yellow: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }],
        blue: [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }]
    };
    const BASE_POSITIONS = {
        red: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 2, c: 1 }, { r: 2, c: 2 }],
        green: [{ r: 1, c: 12 }, { r: 1, c: 13 }, { r: 2, c: 12 }, { r: 2, c: 13 }],
        blue: [{ r: 12, c: 1 }, { r: 12, c: 2 }, { r: 13, c: 1 }, { r: 13, c: 2 }],
        yellow: [{ r: 12, c: 12 }, { r: 12, c: 13 }, { r: 13, c: 12 }, { r: 13, c: 13 }]
    };
    const SAFE_ZONE_MAIN_PATH_INDICES = [1, 8, 14, 21, 27, 34, 40, 47, 0, 13, 26, 39];
    const ALL_SAFE_ZONES = SAFE_ZONE_MAIN_PATH_INDICES.map(idx => LUDO_MAIN_PATH_COORDINATES[idx]);


    // --- Game Initialization & UI Setup ---
    function initializeGame(mode, numPlayers = 4) {
        gameMode = mode;
        gameActive = true;
        diceRolledValue = 0;
        rolledSixesCount = 0;
        gameStatus.textContent = '';

        if (mode === 'online-pvp') {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("You must be logged in to play online PvP!");
                location.reload(); // Reload to show login prompt
                return;
            }
            myUID = user.uid;
            // Players array will be set by the server in online mode
            // UI elements are shown/hidden, but actual game start is server-driven
        } else {
            myUID = null; // Not relevant for local games
            myPlayerColor = (mode === 'ai' || mode === 'local-pvp') ? 'red' : null; // Human always red locally
            players = [];
            const colors = ['red', 'green', 'blue', 'yellow'];
            for (let i = 0; i < numPlayers; i++) {
                players.push({
                    color: colors[i],
                    uid: `local_player_${colors[i]}`, // Dummy UID for local players
                    displayName: `Player ${colors[i].toUpperCase()}`,
                    isAI: (mode === 'ai' && i !== 0),
                    tokens: [
                        { id: `${colors[i]}1`, pos: 'base', pathIdx: -1, isFinished: false },
                        { id: `${colors[i]}2`, pos: 'base', pathIdx: -1, isFinished: false },
                        { id: `${colors[i]}3`, pos: 'base', pathIdx: -1, isFinished: false },
                        { id: `${colors[i]}4`, pos: 'base', pathIdx: -1, isFinished: false }
                    ]
                });
            }
            currentPlayerUID = players[0].uid; // First player starts
            renderBoard();
            renderTokens();
            updateTurnInfo();
            checkAIorHumanTurn();
        }

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
            rollDiceBtn.disabled = true; // Disable until server confirms turn
        } else {
            chatContainer.style.display = 'none';
        }
    }

    // This function will be called by pvp.js when a message comes from the server
    window.handleLudoServerMessage = function(message) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.warn("Received server message but not logged in.");
            return;
        }
        myUID = currentUser.uid;

        if (message.type === 'player_assigned') {
            myPlayerColor = message.color;
            updateGameStatus(`Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`);
            // In online, myUID is used to identify me
        } else if (message.type === 'game_start' || message.type === 'game_state_update') {
            // Update game state based on server message
            // Assume message.gameState contains full `players` array, `currentPlayerUID`, `diceRolledValue`, `gameActive`, `rolledSixesCount`
            players = message.gameState.players;
            currentPlayerUID = message.gameState.currentPlayerUID;
            diceRolledValue = message.gameState.diceRolledValue;
            gameActive = message.gameState.gameActive;
            rolledSixesCount = message.gameState.rolledSixesCount;

            // Find my player object and color
            const myPlayer = players.find(p => p.uid === myUID);
            if (myPlayer) myPlayerColor = myPlayer.color;

            renderBoard();
            renderTokens();
            updateTurnInfo();
            diceValueDisplay.textContent = diceRolledValue || 'Roll!';

            if (gameActive) {
                if (currentPlayerUID === myUID) {
                    updateGameStatus("It's your turn!");
                    rollDiceBtn.disabled = false;
                    if (diceRolledValue > 0) { // If dice was already rolled by server (e.g., after a kill), highlight moves
                        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
                        highlightMovableTokens(currentPlayerObj, diceRolledValue);
                    }
                } else {
                    const currentTurnPlayer = players.find(p => p.uid === currentPlayerUID);
                    updateGameStatus(`It's ${currentTurnPlayer.displayName.toUpperCase()}'s turn. Waiting for opponent...`);
                    rollDiceBtn.disabled = true;
                }
            } else {
                updateGameStatus(message.gameState.finalMessage || "Game Over!");
                rollDiceBtn.disabled = true;
                resetGameBtn.textContent = "Play Again";
            }
        } else if (message.type === 'error') {
            updateGameStatus(`Server Error: ${message.message}`, true);
        }
    };


    function renderBoard() {
        gameContainer.innerHTML = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('ludo-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;

                if (r < 6 && c < 6) cell.classList.add('red-base');
                if (r < 6 && c > 8) cell.classList.add('green-base');
                if (r > 8 && c < 6) cell.classList.add('blue-base');
                if (r > 8 && c > 8) cell.classList.add('yellow-base');

                if ((r === 1 || r === 2) && (c === 1 || c === 2)) cell.classList.add('red-base', 'house');
                if ((r === 1 || r === 2) && (c === 12 || c === 13)) cell.classList.add('green-base', 'house');
                if ((r === 12 || r === 13) && (c === 1 || c === 2)) cell.classList.add('blue-base', 'house');
                if ((r === 12 || r === 13) && (c === 12 || c === 13)) cell.classList.add('yellow-base', 'house');

                if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
                    cell.classList.add('center-home');
                    if (r === 7 && c === 7) {
                        cell.classList.add('final-home');
                        const finishedPlayer = players.find(p => p.tokens.every(t => t.isFinished));
                        if (finishedPlayer) {
                            cell.classList.add(`${finishedPlayer.color}-finished`);
                            cell.textContent = 'HOME';
                        } else {
                            cell.textContent = '';
                        }
                    }
                }

                const pathCoord = { r: r, c: c };
                if (isCoordInList(pathCoord, LUDO_MAIN_PATH_COORDINATES)) {
                    if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.red])) cell.classList.add('red-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.green])) cell.classList.add('green-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.yellow])) cell.classList.add('yellow-start');
                    else if (isCoordSame(pathCoord, LUDO_MAIN_PATH_COORDINATES[PLAYER_MAIN_START_INDEX.blue])) cell.classList.add('blue-start');

                    if (isCoordInList(pathCoord, ALL_SAFE_ZONES)) {
                         cell.classList.add('safe-cell');
                    }
                }
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
        document.querySelectorAll('.ludo-token').forEach(token => token.remove());

        players.forEach(player => {
            player.tokens.forEach((token, index) => {
                if (token.isFinished) return;

                const tokenElement = document.createElement('div');
                tokenElement.classList.add('ludo-token', player.color);
                tokenElement.id = token.id;
                tokenElement.textContent = index + 1;
                tokenElement.dataset.playerColor = player.color;
                tokenElement.dataset.tokenId = token.id;
                tokenElement.dataset.tokenIndex = index;

                let targetCoord;
                if (token.pos === 'base') {
                    targetCoord = BASE_POSITIONS[player.color][index];
                } else if (token.pos === 'main_path') {
                    targetCoord = LUDO_MAIN_PATH_COORDINATES[token.pathIdx];
                } else if (token.pos === 'home_path') {
                    targetCoord = HOME_PATH_COORDINATES[player.color][token.pathIdx];
                } else {
                    console.error("Invalid token position:", token);
                    return;
                }

                const xOffset = targetCoord.c * CELL_SIZE + (CELL_SIZE / 2 - 15);
                const yOffset = targetCoord.r * CELL_SIZE + (CELL_SIZE / 2 - 15);
                tokenElement.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                gameContainer.appendChild(tokenElement);

                // Add event listener only if it's the current player's token and it's a human player
                if (gameActive) {
                    const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
                    if (currentPlayerObj && !currentPlayerObj.isAI && (gameMode === 'local-pvp' || (gameMode === 'online-pvp' && currentPlayerUID === myUID))) {
                        if (player.uid === currentPlayerUID) { // Only add listener for current player's tokens
                            tokenElement.addEventListener('click', handleTokenClick);
                        }
                    }
                }
            });
        });
    }

    function updateTurnInfo() {
        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return; // Should not happen

        let infoText = `Current Turn: ${currentPlayerObj.color.toUpperCase()} (${currentPlayerObj.displayName})`;
        if (currentPlayerObj.isAI) infoText += ' (AI)';
        if (gameMode === 'online-pvp' && currentPlayerUID === myUID) infoText += ' (You)';
        else if (gameMode === 'online-pvp' && currentPlayerUID !== myUID) infoText += ' (Opponent)';
        playerTurnInfo.textContent = infoText;
    }

    function updateGameStatus(message, isError = false) {
        gameStatus.textContent = message;
        gameStatus.style.color = isError ? '#e74c3c' : '#27ae60';
    }

    // No local switchTurn for online games, server handles it
    function switchTurn() {
        if (gameMode === 'online-pvp') return;

        document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));

        const currentPlayerIndex = players.findIndex(p => p.uid === currentPlayerUID);
        const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
        currentPlayerUID = players[nextPlayerIndex].uid;

        updateTurnInfo();
        diceRolledValue = 0;
        diceValueDisplay.textContent = 'Roll!';
        rollDiceBtn.disabled = false;
        rolledSixesCount = 0;

        checkAIorHumanTurn();
    }

    function checkAIorHumanTurn() {
        if (!gameActive) return;

        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return;

        if (currentPlayerObj.isAI) {
            rollDiceBtn.disabled = true;
            updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) is thinking...`);
            setTimeout(makeAIMove, 1500);
        } else {
            updateGameStatus(`It's your turn, ${currentPlayerObj.color.toUpperCase()} (${currentPlayerObj.displayName}). Roll the dice!`);
            rollDiceBtn.disabled = false;
        }
    }


    // --- Game Logic: Dice Roll, Token Movement, Rules ---
    rollDiceBtn.addEventListener('click', () => {
        if (!gameActive) {
            updateGameStatus("Start a game first!", true);
            return;
        }
        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return;

        if (currentPlayerObj.isAI) {
            updateGameStatus("It's AI's turn, please wait.", true);
            return;
        }
        if (gameMode === 'online-pvp' && currentPlayerUID !== myUID) {
             updateGameStatus("It's not your turn!", true);
             return;
        }
        if (diceRolledValue !== 0) {
            updateGameStatus("You've already rolled! Move a token.", true);
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;

        if (gameMode === 'online-pvp') {
            sendGameAction('ludo_roll_dice', { roll: roll });
            rollDiceBtn.disabled = true;
            updateGameStatus("Rolling dice, waiting for server...");
        } else {
            processDiceRoll(roll);
        }
    });

    function processDiceRoll(roll) {
        diceRolledValue = roll;
        diceValueDisplay.textContent = diceRolledValue;
        rollDiceBtn.disabled = true;

        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return;

        if (diceRolledValue === 6) {
            rolledSixesCount++;
            if (rolledSixesCount === 3) {
                updateGameStatus("Three 6s in a row! Your turn is skipped.", true);
                diceRolledValue = 0;
                setTimeout(switchTurn, 1000);
                return;
            }
        } else {
            rolledSixesCount = 0;
        }

        highlightMovableTokens(currentPlayerObj, diceRolledValue);

        const possibleMoves = getPossibleMoves(currentPlayerObj, diceRolledValue);
        if (possibleMoves.length === 0) {
            updateGameStatus(`No moves possible for ${currentPlayerObj.color.toUpperCase()} with a ${diceRolledValue}.`);
            diceRolledValue = 0;
            setTimeout(switchTurn, 1000);
        } else {
            updateGameStatus(`You rolled a ${diceRolledValue}! Select a ${currentPlayerObj.color.toUpperCase()} token to move.`);
        }
    }

    function highlightMovableTokens(player, dice) {
        document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));

        const possibleMoves = getPossibleMoves(player, dice);
        possibleMoves.forEach(move => {
            const tokenElement = document.getElementById(move.token.id);
            if (tokenElement) tokenElement.classList.add('movable');
        });
    }

    function getPossibleMoves(player, diceValue) {
        const moves = [];
        player.tokens.forEach((token) => {
            if (token.isFinished) return;

            if (token.pos === 'base') {
                if (diceValue === 6) {
                    const startPosMainPathIdx = PLAYER_MAIN_START_INDEX[player.color];
                    const tokensOnStart = player.tokens.filter(t =>
                        t.id !== token.id && t.pos === 'main_path' && t.pathIdx === startPosMainPathIdx
                    );
                    const isStartCellSafe = ALL_SAFE_ZONES.some(coord => isCoordSame(coord, LUDO_MAIN_PATH_COORDINATES[startPosMainPathIdx]));
                    if (isStartCellSafe && tokensOnStart.length > 0) {
                         // Blocked by own token on a safe/start cell
                    } else {
                         moves.push({ token: token, newPosType: 'main_path', newPathIdx: startPosMainPathIdx, isFinished: false });
                    }
                }
            } else {
                let currentPathLength = LUDO_MAIN_PATH_COORDINATES.length;
                let currentIdxInOwnPath = token.pathIdx;

                if (token.pos === 'main_path') {
                    const homeEntryMainPathIdx = PLAYER_HOME_ENTRY_INDEX[player.color];

                    let stepsToEnterHomePath;
                    if (currentIdxInOwnPath <= homeEntryMainPathIdx) {
                        stepsToEnterHomePath = homeEntryMainPathIdx - currentIdxInOwnPath + 1;
                    } else {
                        stepsToEnterHomePath = (currentPathLength - currentIdxInOwnPath) + homeEntryMainPathIdx + 1;
                    }

                    if (diceValue < stepsToEnterHomePath) {
                        let newMainPathIdx = (currentIdxInOwnPath + diceValue) % currentPathLength;
                        moves.push({ token: token, newPosType: 'main_path', newPathIdx: newMainPathIdx, isFinished: false });
                    } else {
                        const stepsIntoHomePath = diceValue - stepsToEnterHomePath;
                        const homePathActualLength = HOME_PATH_COORDINATES[player.color].length;

                        if (stepsIntoHomePath < homePathActualLength) {
                            let newHomePathIdx = stepsIntoHomePath;
                            const blockingTokens = player.tokens.filter(t =>
                                t.id !== token.id && t.pos === 'home_path' && t.pathIdx === newHomePathIdx
                            );
                            if (blockingTokens.length === 0) {
                                moves.push({ token: token, newPosType: 'home_path', newPathIdx: newHomePathIdx, isFinished: false });
                            }
                        } else if (stepsIntoHomePath === homePathActualLength) {
                             moves.push({ token: token, newPosType: 'finished', newPathIdx: -1, isFinished: true });
                        }
                    }
                } else if (token.pos === 'home_path') {
                    const homePathActualLength = HOME_PATH_COORDINATES[player.color].length;
                    let newHomePathIdx = currentIdxInOwnPath + diceValue;

                    if (newHomePathIdx < homePathActualLength) {
                        const blockingTokens = player.tokens.filter(t =>
                            t.id !== token.id && t.pos === 'home_path' && t.pathIdx === newHomePathIdx
                        );
                        if (blockingTokens.length === 0) {
                            moves.push({ token: token, newPosType: 'home_path', newPathIdx: newHomePathIdx, isFinished: false });
                        }
                    } else if (newHomePathIdx === homePathActualLength) {
                        moves.push({ token: token, newPosType: 'finished', newPathIdx: -1, isFinished: true });
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
        const tokenIndex = parseInt(event.target.dataset.tokenIndex);

        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj || clickedTokenPlayerColor !== currentPlayerObj.color) {
            updateGameStatus("That's not your token!", true);
            return;
        }
        if (gameMode === 'online-pvp' && currentPlayerUID !== myUID) {
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
                    isFinished: selectedMove.isFinished,
                    diceValue: diceRolledValue
                });
                document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));
                rollDiceBtn.disabled = true;
                updateGameStatus("Moving token, waiting for server confirmation...");
            } else {
                executeMove(tokenToMove, selectedMove.newPosType, selectedMove.newPathIdx, selectedMove.isFinished);
                document.querySelectorAll('.ludo-token.movable').forEach(token => token.classList.remove('movable'));
            }
        } else {
            updateGameStatus("Invalid move for this token with the current dice roll.", true);
        }
    }

    // Local execution of move (online games receive state from server)
    function executeMove(token, newPosType, newPathIdx, isFinishedFlag) {
        if (gameMode === 'online-pvp') return; // Online games only receive state from server

        const player = players.find(p => p.uid === currentPlayerUID);
        if (!player) return;

        token.pos = newPosType;
        token.pathIdx = newPathIdx;
        token.isFinished = isFinishedFlag;

        renderTokens();
        renderBoard();

        let playerGotAnotherTurn = false;

        if (newPosType === 'main_path') {
            const killed = checkForKills(token, player.color);
            if (killed) playerGotAnotherTurn = true;
        }

        if (isFinishedFlag) {
            updateGameStatus(`${player.color.toUpperCase()}'s token ${token.id.slice(-1)} reached home!`);
            playerGotAnotherTurn = true;
        }

        if (checkGameEnd()) {
            gameActive = false;
            rollDiceBtn.disabled = true;
            updateGameStatus(`${player.color.toUpperCase()} wins!`);
            resetGameBtn.textContent = "Play Again";
            return;
        }

        if (diceRolledValue === 6 || playerGotAnotherTurn) {
            updateGameStatus(`${player.color.toUpperCase()} gets another roll!`);
            diceRolledValue = 0;
            rollDiceBtn.disabled = false;
            if (player.isAI) {
                setTimeout(makeAIMove, 1500);
            }
        } else {
            diceRolledValue = 0;
            setTimeout(switchTurn, 500);
        }
    }

    // Local kill check (online games server-side)
    function checkForKills(movingToken, playerColor) {
        if (gameMode === 'online-pvp') return false; // Server handles this

        const currentPlayerPathIdx = movingToken.pathIdx;
        const currentPlayerCoords = LUDO_MAIN_PATH_COORDINATES[currentPlayerPathIdx];
        let killedOpponent = false;

        if (isCoordInList(currentPlayerCoords, ALL_SAFE_ZONES)) {
            return false;
        }

        players.forEach(otherPlayer => {
            if (otherPlayer.color !== playerColor) {
                otherPlayer.tokens.forEach(otherToken => {
                    if (otherToken.pos === 'main_path' && otherToken.pathIdx === currentPlayerPathIdx && !otherToken.isFinished) {
                        const tokensOnCell = otherPlayer.tokens.filter(t => t.pos === 'main_path' && t.pathIdx === currentPlayerPathIdx);
                        if (tokensOnCell.length === 1) {
                            updateGameStatus(`${playerColor.toUpperCase()} killed ${otherPlayer.color.toUpperCase()}'s token ${otherToken.id.slice(-1)}!`);
                            otherToken.pos = 'base';
                            otherToken.pathIdx = -1;
                            renderTokens();
                            killedOpponent = true;
                        }
                    }
                });
            }
        });
        return killedOpponent;
    }

    // Local game end check (online games server-side)
    function checkGameEnd() {
        if (gameMode === 'online-pvp') return false; // Server handles this

        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return false;

        const finishedTokens = currentPlayerObj.tokens.filter(token => token.isFinished);
        return finishedTokens.length === 4;
    }

    // --- AI Logic (Basic for Ludo) ---
    function makeAIMove() {
        if (gameMode === 'online-pvp') return; // Online AI is not handled client-side

        const currentPlayerObj = players.find(p => p.uid === currentPlayerUID);
        if (!currentPlayerObj) return;

        const aiDiceValue = Math.floor(Math.random() * 6) + 1;
        diceValueDisplay.textContent = aiDiceValue;
        updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) rolled a ${aiDiceValue}!`);

        setTimeout(() => {
            diceRolledValue = aiDiceValue;
            const possibleMoves = getPossibleMoves(currentPlayerObj, aiDiceValue);

            if (possibleMoves.length > 0) {
                let chosenMove = null;

                if (aiDiceValue === 6) {
                    chosenMove = possibleMoves.find(m => m.token.pos === 'base');
                }

                if (!chosenMove) {
                    for (const move of possibleMoves) {
                        // Simulate the move for kill check
                        const tempPlayers = JSON.parse(JSON.stringify(players));
                        const tempMovingPlayer = tempPlayers.find(p => p.uid === currentPlayerUID);
                        const tempToken = tempMovingPlayer.tokens.find(t => t.id === move.token.id);
                        tempToken.pos = move.newPosType;
                        tempToken.pathIdx = move.newPathIdx;

                        const killed = checkForKills(tempToken, currentPlayerObj.color);
                        if (killed) {
                            chosenMove = move;
                            break;
                        }
                    }
                }

                if (!chosenMove) {
                    chosenMove = possibleMoves.find(m => m.isFinished);
                }

                if (!chosenMove) {
                    chosenMove = possibleMoves.reduce((bestMove, currentMove) => {
                        let currentMoveScore = -1;
                        if (currentMove.newPosType === 'main_path') {
                            currentMoveScore = currentMove.newPathIdx;
                        } else if (currentMove.newPosType === 'home_path') {
                            currentMoveScore = LUDO_MAIN_PATH_COORDINATES.length + currentMove.newPathIdx;
                        } else if (currentMove.newPosType === 'finished') {
                            currentMoveScore = LUDO_MAIN_PATH_COORDINATES.length + HOME_PATH_COORDINATES[currentPlayerObj.color].length;
                        }

                        if (!bestMove) return currentMove;

                        let bestMoveScore = -1;
                        if (bestMove.newPosType === 'main_path') {
                            bestMoveScore = bestMove.newPathIdx;
                        } else if (bestMove.newPosType === 'home_path') {
                            bestMoveScore = LUDO_MAIN_PATH_COORDINATES.length + bestMove.newPathIdx;
                        } else if (bestMove.newPosType === 'finished') {
                            bestMoveScore = LUDO_MAIN_PATH_COORDINATES.length + HOME_PATH_COORDINATES[currentPlayerObj.color].length;
                        }

                        return currentMoveScore > bestMoveScore ? currentMove : bestMove;
                    }, null);
                }

                if (!chosenMove) {
                    chosenMove = possibleMoves[0];
                }

                executeMove(chosenMove.token, chosenMove.newPosType, chosenMove.newPathIdx, chosenMove.isFinished);

            } else {
                updateGameStatus(`${currentPlayerObj.color.toUpperCase()} (AI) has no moves.`);
                diceRolledValue = 0;
                setTimeout(switchTurn, 1000);
            }
        }, 1500);
    }


    // --- Event Listeners for Game Modes ---
    startAiGameBtn.addEventListener('click', () => initializeGame('ai', 4));
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp', 4));
    startOnlinePvPBtn.addEventListener('click', () => {
        updateGameStatus('Attempting to connect for Online PvP...');
        initializeGame('online-pvp', 2);
    });
    resetGameBtn.addEventListener('click', () => {
        location.reload();
    });

    // Initial state: show game mode buttons
    rollDiceBtn.style.display = 'none';
    resetGameBtn.style.display = 'none';
    playerTurnInfo.style.display = 'block';
    updateGameStatus('Choose a game mode to start!');
});

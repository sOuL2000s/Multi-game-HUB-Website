document.addEventListener('DOMContentLoaded', () => {
    const gameContainer = document.getElementById('game-container');
    const startAiGameBtn = document.getElementById('start-ai-game');
    const startLocalPvPBtn = document.getElementById('start-local-pvp');
    const startOnlinePvPBtn = document.getElementById('start-online-pvp');
    const resetGameBtn = document.getElementById('reset-game');
    const playerTurnInfo = document.getElementById('player-turn-info');
    const gameStatus = document.getElementById('game-status');
    const chatContainer = document.getElementById('chat-container');

    let gameMode = null; // 'ai', 'local-pvp', 'online-pvp'
    let board = []; // 8x8 array representing the chessboard
    let currentPlayerColor = 'white'; // 'white' or 'black'
    let selectedPiece = null; // Stores {row, col, pieceChar, piece} of selected piece
    let gameActive = false;
    let myPlayerColor = null; // For online PvP, set by server
    let myUID = null; // My own Firebase UID
    let players = []; // For online PvP, stores players in the room with their UID and color

    const PIECES = {
        'r': { type: 'rook', color: 'black', char: '♜' },
        'n': { type: 'knight', color: 'black', char: '♞' },
        'b': { type: 'bishop', color: 'black', char: '♝' },
        'q': { type: 'queen', color: 'black', char: '♛' },
        'k': { type: 'king', color: 'black', char: '♚' },
        'p': { type: 'pawn', color: 'black', char: '♟︎' },
        'R': { type: 'rook', color: 'white', char: '♖' },
        'N': { type: 'knight', color: 'white', char: '♘' },
        'B': { type: 'bishop', color: 'white', char: '♗' },
        'Q': { type: 'queen', color: 'white', char: '♕' },
        'K': { type: 'king', color: 'white', char: '♔' },
        'P': { type: 'pawn', color: 'white', char: '♙' }
    };

    function initializeGame(mode) {
        gameMode = mode;
        gameActive = true;
        selectedPiece = null;
        gameStatus.textContent = '';

        if (mode === 'online-pvp') {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("You must be logged in to play online PvP!");
                location.reload();
                return;
            }
            myUID = user.uid;
            // Board and current player will be set by the server
        } else {
            myUID = null;
            myPlayerColor = 'white'; // Human always white locally
            currentPlayerColor = 'white';
            setupBoard();
            renderBoard();
            updateTurnInfo();
            if (gameMode === 'ai' && currentPlayerColor !== myPlayerColor) {
                setTimeout(makeAIMove, 1000);
            }
        }

        startAiGameBtn.style.display = 'none';
        startLocalPvPBtn.style.display = 'none';
        startOnlinePvPBtn.style.display = 'none';
        resetGameBtn.style.display = 'inline-block';

        if (gameMode === 'online-pvp') {
            chatContainer.style.display = 'block';
            connectToPvPServer();
            updateGameStatus('Connecting to online PvP...');
        } else {
            chatContainer.style.display = 'none';
        }
    }

    function setupBoard() {
        board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
    }

    function renderBoard() {
        gameContainer.innerHTML = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                cell.classList.add('chess-cell');
                cell.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
                cell.dataset.row = r;
                cell.dataset.col = c;

                const pieceChar = board[r][c];
                if (pieceChar) {
                    const piece = PIECES[pieceChar];
                    cell.innerHTML = `<span class="chess-piece ${piece.color}">${piece.char}</span>`;
                }

                cell.addEventListener('click', handleCellClick);
                gameContainer.appendChild(cell);
            }
        }
        highlightSelectedPiece();
        highlightValidMoves();
        checkAndHighlightKingInCheck();
    }

    function updateTurnInfo() {
        let infoText = `Current Turn: ${currentPlayerColor.toUpperCase()}`;
        if (gameMode === 'ai' && currentPlayerColor !== myPlayerColor) infoText += ' (AI)';
        if (gameMode === 'online-pvp' && currentPlayerColor === myPlayerColor) infoText += ' (You)';
        else if (gameMode === 'online-pvp' && currentPlayerColor !== myPlayerColor) infoText += ' (Opponent)';
        playerTurnInfo.textContent = infoText;
    }

    function updateGameStatus(message, isError = false) {
        gameStatus.textContent = message;
        gameStatus.style.color = isError ? '#e74c3c' : '#27ae60';
    }

    function switchTurn() {
        if (gameMode === 'online-pvp') return; // Server handles turn switching

        currentPlayerColor = (currentPlayerColor === 'white') ? 'black' : 'white';
        selectedPiece = null;
        updateTurnInfo();
        renderBoard();

        if (gameActive && gameMode === 'ai' && currentPlayerColor !== myPlayerColor) {
            setTimeout(makeAIMove, 1500);
        }
    }

    // --- Online PvP Integration ---
    window.handleChessServerMessage = function(message) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.warn("Received server message but not logged in.");
            return;
        }
        myUID = currentUser.uid;

        if (message.type === 'player_assigned') {
            myPlayerColor = message.color;
            updateGameStatus(`Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`);
            updateTurnInfo();
        } else if (message.type === 'game_start' || message.type === 'game_state_update') {
            board = message.gameState.board;
            currentPlayerColor = message.gameState.currentPlayerColor;
            gameActive = message.gameState.gameActive;
            players = message.gameState.players; // Store player info for context

            // Determine myPlayerColor from server's player list
            const myPlayer = players.find(p => p.uid === myUID);
            if (myPlayer) myPlayerColor = myPlayer.color;

            renderBoard();
            updateTurnInfo();

            if (gameActive) {
                if (currentPlayerColor === myPlayerColor) {
                    updateGameStatus("It's your turn!");
                } else {
                    updateGameStatus(`It's ${currentPlayerColor.toUpperCase()}'s turn. Waiting for opponent...`);
                }
            } else {
                updateGameStatus(message.gameState.finalMessage || "Game Over!");
                resetGameBtn.textContent = "Play Again";
            }
        } else if (message.type === 'error') {
            updateGameStatus(`Server Error: ${message.message}`, true);
        }
    };

    // --- Movement Logic ---
    function handleCellClick(event) {
        if (!gameActive) return;

        const row = parseInt(event.currentTarget.dataset.row);
        const col = parseInt(event.currentTarget.dataset.col);
        const clickedPieceChar = board[row][col];
        const clickedPiece = clickedPieceChar ? PIECES[clickedPieceChar] : null;

        if (gameMode === 'ai' && currentPlayerColor !== myPlayerColor) {
            updateGameStatus("It's AI's turn, please wait.", true);
            return;
        }
        if (gameMode === 'online-pvp' && currentPlayerColor !== myPlayerColor) {
            updateGameStatus("It's not your turn!", true);
            return;
        }

        if (selectedPiece) {
            const validMoves = getValidMoves(selectedPiece.pieceChar, selectedPiece.row, selectedPiece.col);
            const moveTarget = validMoves.find(move => move.row === row && move.col === col);

            if (moveTarget) {
                makeMove(selectedPiece.row, selectedPiece.col, row, col);
                selectedPiece = null;
            } else if (clickedPiece && clickedPiece.color === currentPlayerColor) {
                selectedPiece = { row, col, pieceChar: clickedPieceChar, piece: clickedPiece };
                renderBoard();
            } else {
                selectedPiece = null;
                renderBoard();
                updateGameStatus("Invalid move. Try again.", true);
            }
        } else {
            if (clickedPiece && clickedPiece.color === currentPlayerColor) {
                selectedPiece = { row, col, pieceChar: clickedPieceChar, piece: clickedPiece };
                renderBoard();
                updateGameStatus(`Selected ${currentPlayerColor} ${clickedPiece.type}.`);
            } else if (clickedPiece && clickedPiece.color !== currentPlayerColor) {
                updateGameStatus("That's not your piece!", true);
            } else {
                updateGameStatus("Select your piece first.", true);
            }
        }
    }

    function makeMove(fromR, fromC, toR, toC) {
        const movingPieceChar = board[fromR][fromC];
        const capturedPieceChar = board[toR][toC];

        if (gameMode === 'online-pvp') {
            sendGameAction('chess_move', {
                from: { r: fromR, c: fromC },
                to: { r: toR, c: toC },
                piece: movingPieceChar, // Send the piece that is moving
                capturedPiece: capturedPieceChar // Send if a piece was captured
            });
            updateGameStatus("Move sent, waiting for server confirmation...");
            gameActive = false; // Disable client interaction until server response
            return;
        }

        board[toR][toC] = movingPieceChar;
        board[fromR][fromC] = '';

        updateGameStatus(`${currentPlayerColor.toUpperCase()} moved ${PIECES[movingPieceChar].type}.`);

        // Basic Win Condition: King Capture (simplified, not true checkmate)
        if (capturedPieceChar && PIECES[capturedPieceChar].type === 'king') {
            updateGameStatus(`${currentPlayerColor.toUpperCase()} wins! King captured!`, false);
            gameActive = false;
        } else {
            switchTurn();
        }
    }

    function highlightSelectedPiece() {
        if (selectedPiece) {
            const cell = gameContainer.querySelector(`[data-row="${selectedPiece.row}"][data-col="${selectedPiece.col}"]`);
            if (cell) cell.classList.add('selected-piece');
        }
    }

    function highlightValidMoves() {
        if (selectedPiece) {
            const validMoves = getValidMoves(selectedPiece.pieceChar, selectedPiece.row, selectedPiece.col);
            validMoves.forEach(move => {
                const cell = gameContainer.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
                if (cell) cell.classList.add('highlight-move');
            });
        }
    }

    function checkAndHighlightKingInCheck() {
        let kingPosition = null;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const pieceChar = board[r][c];
                if (pieceChar && PIECES[pieceChar].type === 'king' && PIECES[pieceChar].color === currentPlayerColor) {
                    kingPosition = { r, c };
                    break;
                }
            }
            if (kingPosition) break;
        }

        if (kingPosition && isKingInCheck(kingPosition.r, kingPosition.c, currentPlayerColor)) {
            const kingCell = gameContainer.querySelector(`[data-row="${kingPosition.r}"][data-col="${kingPosition.c}"]`);
            if (kingCell) {
                kingCell.classList.add('king-in-check');
                updateGameStatus(`${currentPlayerColor.toUpperCase()} King is in check!`, true);
            }
        }
    }

    // --- Piece Specific Movement Rules ---
    function getValidMoves(pieceChar, r, c, currentBoard = board) {
        const piece = PIECES[pieceChar];
        if (!piece) return [];
        const moves = [];
        const opponentColor = (piece.color === 'white') ? 'black' : 'white';

        const wouldMoveBeLegal = (testFromR, testFromC, testToR, testToC) => {
            const tempBoard = JSON.parse(JSON.stringify(currentBoard));
            const tempPieceChar = tempBoard[testFromR][testFromC];
            tempBoard[testToR][testToC] = tempPieceChar;
            tempBoard[testFromR][testFromC] = '';

            let kingR, kingC;
            outer:
            for (let kr = 0; kr < 8; kr++) {
                for (let kc = 0; kc < 8; kc++) {
                    const kChar = tempBoard[kr][kc];
                    if (kChar && PIECES[kChar].type === 'king' && PIECES[kChar].color === piece.color) {
                        kingR = kr;
                        kingC = kc;
                        break outer;
                    }
                }
            }
            return !isKingInCheck(kingR, kingC, piece.color, tempBoard);
        };

        const checkPath = (dr, dc) => {
            for (let i = 1; i < 8; i++) {
                const newR = r + i * dr;
                const newC = c + i * dc;
                if (!isValidCell(newR, newC)) break;
                const targetPieceChar = currentBoard[newR][newC];
                const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

                if (!targetPiece) {
                    if (wouldMoveBeLegal(r, c, newR, newC)) moves.push({ row: newR, col: newC });
                } else {
                    if (targetPiece.color === opponentColor) {
                        if (wouldMoveBeLegal(r, c, newR, newC)) moves.push({ row: newR, col: newC });
                    }
                    break;
                }
            }
        };

        const checkSingleMove = (newR, newC) => {
            if (!isValidCell(newR, newC)) return;
            const targetPieceChar = currentBoard[newR][newC];
            const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

            if (!targetPiece || targetPiece.color === opponentColor) {
                if (wouldMoveBeLegal(r, c, newR, newC)) moves.push({ row: newR, col: newC });
            }
        };

        switch (piece.type) {
            case 'pawn':
                const direction = (piece.color === 'white') ? -1 : 1;
                const startRow = (piece.color === 'white') ? 6 : 1;

                if (isValidCell(r + direction, c) && !currentBoard[r + direction][c]) {
                    checkSingleMove(r + direction, c);
                }
                if (r === startRow && isValidCell(r + 2 * direction, c) && !currentBoard[r + 2 * direction][c] && !currentBoard[r + direction][c]) {
                    checkSingleMove(r + 2 * direction, c);
                }
                if (isValidCell(r + direction, c - 1)) {
                    const capturePieceChar = currentBoard[r + direction][c - 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        checkSingleMove(r + direction, c - 1);
                    }
                }
                if (isValidCell(r + direction, c + 1)) {
                    const capturePieceChar = currentBoard[r + direction][c + 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        checkSingleMove(r + direction, c + 1);
                    }
                }
                break;
            case 'rook':
                checkPath(1, 0); checkPath(-1, 0); checkPath(0, 1); checkPath(0, -1);
                break;
            case 'knight':
                const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                knightMoves.forEach(([dr, dc]) => checkSingleMove(r + dr, c + dc));
                break;
            case 'bishop':
                checkPath(1, 1); checkPath(1, -1); checkPath(-1, 1); checkPath(-1, -1);
                break;
            case 'queen':
                checkPath(1, 0); checkPath(-1, 0); checkPath(0, 1); checkPath(0, -1);
                checkPath(1, 1); checkPath(1, -1); checkPath(-1, 1); checkPath(-1, -1);
                break;
            case 'king':
                const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
                kingMoves.forEach(([dr, dc]) => checkSingleMove(r + dr, c + dc));
                break;
        }
        return moves;
    }

    function isValidCell(r, c) {
        return r >= 0 && r < 8 && c >= 0 && c < 8;
    }

    function isKingInCheck(kR, kC, kingColor, currentBoard = board) {
        const opponentColor = (kingColor === 'white') ? 'black' : 'white';

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const pieceChar = currentBoard[r][c];
                if (pieceChar) {
                    const piece = PIECES[pieceChar];
                    if (piece.color === opponentColor) {
                        const opponentMoves = getPseudoLegalMoves(pieceChar, r, c, currentBoard);
                        if (opponentMoves.some(move => move.row === kR && move.col === kC)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function getPseudoLegalMoves(pieceChar, r, c, currentBoard) {
        const piece = PIECES[pieceChar];
        if (!piece) return [];
        const pseudoMoves = [];
        const opponentColor = (piece.color === 'white') ? 'black' : 'white';

        const checkPath = (dr, dc) => {
            for (let i = 1; i < 8; i++) {
                const newR = r + i * dr;
                const newC = c + i * dc;
                if (!isValidCell(newR, newC)) break;
                const targetPieceChar = currentBoard[newR][newC];
                const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

                if (!targetPiece) {
                    pseudoMoves.push({ row: newR, col: newC });
                } else {
                    if (targetPiece.color === opponentColor) {
                        pseudoMoves.push({ row: newR, col: newC });
                    }
                    break;
                }
            }
        };

        const checkSingleMove = (newR, newC) => {
            if (!isValidCell(newR, newC)) return;
            const targetPieceChar = currentBoard[newR][newC];
            const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

            if (!targetPiece || targetPiece.color === opponentColor) {
                pseudoMoves.push({ row: newR, col: newC });
            }
        };

        switch (piece.type) {
            case 'pawn':
                const direction = (piece.color === 'white') ? -1 : 1;
                const startRow = (piece.color === 'white') ? 6 : 1;

                if (isValidCell(r + direction, c) && !currentBoard[r + direction][c]) {
                    pseudoMoves.push({ row: r + direction, col: c });
                }
                if (r === startRow && isValidCell(r + 2 * direction, c) && !currentBoard[r + 2 * direction][c] && !currentBoard[r + direction][c]) {
                    pseudoMoves.push({ row: r + 2 * direction, col: c });
                }
                if (isValidCell(r + direction, c - 1)) {
                    const capturePieceChar = currentBoard[r + direction][c - 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        pseudoMoves.push({ row: r + direction, col: c - 1 });
                    }
                }
                if (isValidCell(r + direction, c + 1)) {
                    const capturePieceChar = currentBoard[r + direction][c + 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        pseudoMoves.push({ row: r + direction, col: c + 1 });
                    }
                }
                break;
            case 'rook':
                checkPath(1, 0); checkPath(-1, 0); checkPath(0, 1); checkPath(0, -1);
                break;
            case 'knight':
                const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                knightMoves.forEach(([dr, dc]) => checkSingleMove(r + dr, c + dc));
                break;
            case 'bishop':
                checkPath(1, 1); checkPath(1, -1); checkPath(-1, 1); checkPath(-1, -1);
                break;
            case 'queen':
                checkPath(1, 0); checkPath(-1, 0); checkPath(0, 1); checkPath(0, -1);
                checkPath(1, 1); checkPath(1, -1); checkPath(-1, 1); checkPath(-1, -1);
                break;
            case 'king':
                const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
                kingMoves.forEach(([dr, dc]) => checkSingleMove(r + dr, c + dc));
                break;
        }
        return pseudoMoves;
    }


    // --- AI Logic (Basic for Chess) ---
    function makeAIMove() {
        if (gameMode === 'online-pvp') return; // Online AI is not handled client-side

        const aiPlayerColor = currentPlayerColor;
        updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) is thinking...`);

        const allValidAIMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const pieceChar = board[r][c];
                if (pieceChar && PIECES[pieceChar].color === aiPlayerColor) {
                    const movesForPiece = getValidMoves(pieceChar, r, c);
                    movesForPiece.forEach(move => {
                        allValidAIMoves.push({ fromR: r, fromC: c, toR: move.row, toC: move.col, piece: pieceChar });
                    });
                }
            }
        }

        if (allValidAIMoves.length > 0) {
            let chosenMove = null;
            const captureMoves = allValidAIMoves.filter(move => {
                const targetPieceChar = board[move.toR][move.toC];
                return targetPieceChar && PIECES[targetPieceChar].color !== aiPlayerColor;
            });

            if (captureMoves.length > 0) {
                chosenMove = captureMoves[Math.floor(Math.random() * captureMoves.length)];
            } else {
                chosenMove = allValidAIMoves[Math.floor(Math.random() * allValidAIMoves.length)];
            }

            setTimeout(() => {
                const capturedPiece = board[chosenMove.toR][chosenMove.toC];
                board[chosenMove.toR][chosenMove.toC] = chosenMove.piece;
                board[chosenMove.fromR][chosenMove.fromC] = '';
                updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) moved ${PIECES[chosenMove.piece].type}.`);

                if (capturedPiece && PIECES[capturedPiece].type === 'king') {
                    updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) wins! King captured!`, false);
                    gameActive = false;
                } else {
                    switchTurn();
                }
            }, 1000);
        } else {
            updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) has no valid moves. Game Over.`, true);
            gameActive = false;
        }
    }


    // --- Event Listeners for Game Modes ---
    startAiGameBtn.addEventListener('click', () => initializeGame('ai'));
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp'));
    startOnlinePvPBtn.addEventListener('click', () => {
        updateGameStatus('Attempting to connect for Online PvP...');
        initializeGame('online-pvp');
    });
    resetGameBtn.addEventListener('click', () => {
        location.reload();
    });

    // Initial state: show game mode buttons
    resetGameBtn.style.display = 'none';
    playerTurnInfo.style.display = 'block';
    updateGameStatus('Choose a game mode to start!');
});

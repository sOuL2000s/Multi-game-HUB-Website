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
    let currentPlayer = 'white'; // 'white' or 'black'
    let selectedPiece = null; // Stores {row, col, piece} of selected piece
    let gameActive = false;

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
        currentPlayer = 'white'; // White always starts
        selectedPiece = null;
        gameStatus.textContent = '';

        setupBoard();
        renderBoard();
        updateTurnInfo();

        startAiGameBtn.style.display = 'none';
        startLocalPvPBtn.style.display = 'none';
        startOnlinePvPBtn.style.display = 'none';
        resetGameBtn.style.display = 'inline-block';

        if (gameMode === 'online-pvp') {
            chatContainer.style.display = 'block';
            connectToPvPServer(); // Function from pvp.js
            updateGameStatus('Connecting to online PvP...');
            // Server will assign color and start game.
        } else {
            chatContainer.style.display = 'none';
            if (gameMode === 'ai' && currentPlayer !== (myPlayerColor || 'white')) { // Assuming human is always white for AI mode unless online sets it
                // If human is not white, AI makes first move
                setTimeout(makeAIMove, 1000);
            }
        }
        updateGameStatus(`Game started! ${currentPlayer.toUpperCase()}'s turn.`);
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
        gameContainer.innerHTML = ''; // Clear previous board
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
    }

    function updateTurnInfo() {
        playerTurnInfo.textContent = `Current Turn: ${currentPlayer.toUpperCase()}`;
    }

    function updateGameStatus(message, isError = false) {
        gameStatus.textContent = message;
        gameStatus.style.color = isError ? '#e74c3c' : '#27ae60';
    }

    function switchTurn() {
        currentPlayer = (currentPlayer === 'white') ? 'black' : 'white';
        selectedPiece = null;
        updateTurnInfo();
        renderBoard(); // Re-render to clear highlights

        if (gameMode === 'ai' && currentPlayer !== (myPlayerColor || 'white')) { // AI's turn (if it's not the human player's color)
            setTimeout(makeAIMove, 1500);
        }
    }

    // --- Movement Logic ---
    function handleCellClick(event) {
        if (!gameActive) return;

        const row = parseInt(event.currentTarget.dataset.row);
        const col = parseInt(event.currentTarget.dataset.col);
        const clickedPieceChar = board[row][col];
        const clickedPiece = clickedPieceChar ? PIECES[clickedPieceChar] : null;

        if (gameMode === 'ai' && currentPlayer !== (myPlayerColor || 'white')) {
            updateGameStatus("It's AI's turn, please wait.", true);
            return;
        }

        // If a piece is already selected
        if (selectedPiece) {
            const validMoves = getValidMoves(selectedPiece.pieceChar, selectedPiece.row, selectedPiece.col);
            const moveTarget = validMoves.find(move => move.row === row && move.col === col);

            if (moveTarget) {
                // Valid move to empty square or capture
                makeMove(selectedPiece.row, selectedPiece.col, row, col);
                selectedPiece = null;
                switchTurn();
            } else if (clickedPiece && clickedPiece.color === currentPlayer) {
                // Clicked on own piece again or another of own pieces
                selectedPiece = { row, col, pieceChar: clickedPieceChar, piece: clickedPiece };
                renderBoard(); // Re-render to update highlights
            } else {
                // Invalid move or clicked on opponent's piece (not a valid move target)
                selectedPiece = null; // Deselect
                renderBoard(); // Re-render to clear highlights
                updateGameStatus("Invalid move. Try again.", true);
            }
        } else {
            // No piece selected yet, try to select one
            if (clickedPiece && clickedPiece.color === currentPlayer) {
                selectedPiece = { row, col, pieceChar: clickedPieceChar, piece: clickedPiece };
                renderBoard(); // Re-render to highlight selected piece and its moves
                updateGameStatus(`Selected ${currentPlayer} ${clickedPiece.type}.`);
            } else {
                updateGameStatus("Select your piece first.", true);
            }
        }
    }

    function makeMove(fromR, fromC, toR, toC) {
        if (gameMode === 'online-pvp') {
            // Send move to server
            sendGameAction('chess_move', {
                from: { r: fromR, c: fromC },
                to: { r: toR, c: toC },
                piece: board[fromR][fromC],
                player: currentPlayer
            });
            updateGameStatus("Move sent, waiting for server confirmation...");
            // Local board update will happen when server sends game_state_update
            return;
        }

        const pieceChar = board[fromR][fromC];
        board[toR][toC] = pieceChar;
        board[fromR][fromC] = '';
        renderBoard(); // Update the visual board
        updateGameStatus(`${currentPlayer.toUpperCase()} moved ${PIECES[pieceChar].type}.`);
        // Check for win conditions (e.g., King capture - simplified, not real chess checkmate)
        if (PIECES[board[toR][toC]]?.type === 'king' && PIECES[board[toR][toC]]?.color !== currentPlayer) {
            updateGameStatus(`${currentPlayer.toUpperCase()} wins! King captured!`, false);
            gameActive = false;
        }
    }

    // This function will be called by pvp.js when a message comes from the server
    window.handleChessServerMessage = function(message) {
        // Assume message.gameState contains the full board state and current turn
        // Example: message = { type: 'game_state_update', gameState: { board: [...], currentPlayer: 'black' } }
        if (message.type === 'game_state_update' && gameMode === 'online-pvp') {
            board = message.gameState.board;
            currentPlayer = message.gameState.currentPlayer;
            renderBoard();
            updateTurnInfo();
            // Assuming myPlayerColor is set by the server in pvp.js
            if (currentPlayer === myPlayerColor) {
                updateGameStatus("It's your turn!");
            } else {
                updateGameStatus(`It's ${currentPlayer.toUpperCase()}'s turn.`);
            }
        } else if (message.type === 'player_assigned') {
            myPlayerColor = message.color; // Set the player's color for online mode
            playerTurnInfo.textContent = `You are playing as ${myPlayerColor.toUpperCase()}`;
        }
        // ... handle other message types (chat, opponent_left, etc.)
    };


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

    // --- Piece Specific Movement Rules (Simplified) ---
    function getValidMoves(pieceChar, r, c) {
        const piece = PIECES[pieceChar];
        if (!piece) return [];
        const moves = [];
        const opponentColor = (piece.color === 'white') ? 'black' : 'white';

        const checkPath = (dr, dc) => { // For Rook, Bishop, Queen
            for (let i = 1; i < 8; i++) {
                const newR = r + i * dr;
                const newC = c + i * dc;
                if (!isValidCell(newR, newC)) break;
                const targetPieceChar = board[newR][newC];
                const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

                if (!targetPiece) { // Empty cell
                    moves.push({ row: newR, col: newC });
                } else { // Occupied cell
                    if (targetPiece.color === opponentColor) { // Capture
                        moves.push({ row: newR, col: newC });
                    }
                    break; // Path blocked
                }
            }
        };

        const checkSingleMove = (newR, newC) => { // For King, Knight, Pawn captures
            if (!isValidCell(newR, newC)) return;
            const targetPieceChar = board[newR][newC];
            const targetPiece = targetPieceChar ? PIECES[targetPieceChar] : null;

            if (!targetPiece || targetPiece.color === opponentColor) {
                moves.push({ row: newR, col: newC });
            }
        };

        switch (piece.type) {
            case 'pawn':
                const direction = (piece.color === 'white') ? -1 : 1; // White moves up (-1 row), Black moves down (+1 row)
                const startRow = (piece.color === 'white') ? 6 : 1;

                // Forward 1
                if (isValidCell(r + direction, c) && !board[r + direction][c]) {
                    moves.push({ row: r + direction, col: c });
                }
                // Forward 2 (initial move)
                if (r === startRow && isValidCell(r + 2 * direction, c) && !board[r + 2 * direction][c] && !board[r + direction][c]) {
                    moves.push({ row: r + 2 * direction, col: c });
                }
                // Captures
                if (isValidCell(r + direction, c - 1)) {
                    const capturePieceChar = board[r + direction][c - 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        moves.push({ row: r + direction, col: c - 1 });
                    }
                }
                if (isValidCell(r + direction, c + 1)) {
                    const capturePieceChar = board[r + direction][c + 1];
                    const capturePiece = capturePieceChar ? PIECES[capturePieceChar] : null;
                    if (capturePiece && capturePiece.color === opponentColor) {
                        moves.push({ row: r + direction, col: c + 1 });
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
                checkPath(1, 0); checkPath(-1, 0); checkPath(0, 1); checkPath(0, -1); // Rook moves
                checkPath(1, 1); checkPath(1, -1); checkPath(-1, 1); checkPath(-1, -1); // Bishop moves
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

    // --- AI Logic (Dummy for Chess) ---
    function makeAIMove() {
        const aiPlayerColor = currentPlayer; // AI acts as the current player
        updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) is thinking...`);

        const allPossibleAIMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const pieceChar = board[r][c];
                if (pieceChar && PIECES[pieceChar].color === aiPlayerColor) {
                    const movesForPiece = getValidMoves(pieceChar, r, c);
                    movesForPiece.forEach(move => {
                        allPossibleAIMoves.push({ fromR: r, fromC: c, toR: move.row, toC: move.col, piece: pieceChar });
                    });
                }
            }
        }

        if (allPossibleAIMoves.length > 0) {
            // Simple AI: pick a random valid move
            const randomMove = allPossibleAIMoves[Math.floor(Math.random() * allPossibleAIMoves.length)];
            setTimeout(() => {
                board[randomMove.toR][randomMove.toC] = randomMove.piece;
                board[randomMove.fromR][randomMove.fromC] = '';
                updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) moved ${PIECES[randomMove.piece].type}.`);
                switchTurn(); // AI's turn ends
            }, 1000);
        } else {
            updateGameStatus(`${aiPlayerColor.toUpperCase()} (AI) has no valid moves. Stalemate or checkmate (not implemented)!`, true);
            gameActive = false; // Or declare stalemate
        }
    }


    // --- Event Listeners for Game Modes ---
    startAiGameBtn.addEventListener('click', () => initializeGame('ai'));
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp'));
    startOnlinePvPBtn.addEventListener('click', () => {
        updateGameStatus('Attempting to connect for Online PvP...');
        initializeGame('online-pvp');
        // The server will assign player color and initiate the game state
    });
    resetGameBtn.addEventListener('click', () => {
        location.reload(); // Simple way to reset game
    });

    // Initial state: show game mode buttons
    resetGameBtn.style.display = 'none';
    playerTurnInfo.style.display = 'block'; // Make sure info is visible
    updateGameStatus('Choose a game mode to start!');
});

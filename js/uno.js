document.addEventListener('DOMContentLoaded', () => {
    const startAiGameBtn = document.getElementById('start-ai-game');
    const startLocalPvPBtn = document.getElementById('start-local-pvp');
    const startOnlinePvPBtn = document.getElementById('start-online-pvp');
    const resetGameBtn = document.getElementById('reset-game');
    const playerTurnInfo = document.getElementById('player-turn-info');
    const gameStatus = document.getElementById('game-status');
    const chatContainer = document.getElementById('chat-container');

    let gameMode = null;
    let gameActive = false;
    let myPlayerColor = null;

    function initializeGame(mode) {
        gameMode = mode;
        gameActive = true;
        gameStatus.textContent = '';
        playerTurnInfo.textContent = `Uno: ${mode.toUpperCase()} Mode Initiated.`;

        startAiGameBtn.style.display = 'none';
        startLocalPvPBtn.style.display = 'none';
        startOnlinePvPBtn.style.display = 'none';
        resetGameBtn.style.display = 'inline-block';

        if (gameMode === 'online-pvp') {
            chatContainer.style.display = 'block';
            connectToPvPServer();
            updateGameStatus('Connecting to online PvP for Uno...');
        } else {
            chatContainer.style.display = 'none';
            updateGameStatus('Uno game logic is coming soon!');
        }
        console.log("Uno game started in", mode, "mode.");
    }

    // Placeholder for server messages in Uno (if online PvP)
    window.handleUnoServerMessage = function(message) {
        if (message.type === 'player_assigned') {
            myPlayerColor = message.color;
            updateGameStatus(`Connected! You are ${myPlayerColor.toUpperCase()}. Waiting for opponent...`);
        } else if (message.type === 'game_state_update') {
            updateGameStatus(`Uno game state updated. It's ${message.currentPlayer.toUpperCase()}'s turn.`);
            // Here you would parse message.gameState and update the Uno game display.
        } else if (message.type === 'chat_message') {
            // Chat is handled in pvp.js directly, but could be passed here.
        }
    };


    startAiGameBtn.addEventListener('click', () => initializeGame('ai'));
    startLocalPvPBtn.addEventListener('click', () => initializeGame('local-pvp'));
    startOnlinePvPBtn.addEventListener('click', () => initializeGame('online-pvp'));
    resetGameBtn.addEventListener('click', () => {
        location.reload();
    });

    // Initial state setup
    resetGameBtn.style.display = 'none';
    playerTurnInfo.textContent = '';
    updateGameStatus('Choose a game mode to play Uno (Coming Soon)!');
});

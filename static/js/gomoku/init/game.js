// ============================================================
// 主页初始化 - 游戏相关事件
// 负责：游戏模式、棋子颜色、AI难度、双人对战、操作按钮、棋盘点击
// ============================================================
(function() {
    var G = window.Gomoku;

    document.getElementById('logoutBtn').addEventListener('click', G.logout);

    document.getElementById('gameTab').addEventListener('click', function() { G.showTab('gameContent'); });
    document.getElementById('onlineTab').addEventListener('click', function() { G.showTab('onlineContent'); });
    document.getElementById('profileTab').addEventListener('click', function() { G.showTab('profileContent'); });
    document.getElementById('historyTab').addEventListener('click', function() { G.showTab('historyContent'); });
    document.getElementById('statsTab').addEventListener('click', function() { G.showTab('statsContent'); });
    document.getElementById('leaderboardTab').addEventListener('click', function() { G.showTab('leaderboardContent'); });

    document.getElementById('onlineCreateBtn').addEventListener('click', G.onlineCreateMatch);
    document.getElementById('onlineJoinBtn').addEventListener('click', G.onlineJoinMatch);
    document.getElementById('onlineLeaveBtn').addEventListener('click', G.onlineLeaveMatch);
    document.getElementById('onlineLeaveBtn').classList.add('hidden');

    G.attachCloseRoomHandler();

    document.getElementById('modeAI').addEventListener('click', function() {
        G.gameMode = 'ai';
        G.updateModeButtons();
        G.resetGame();
    });

    document.getElementById('modePVP').addEventListener('click', function() {
        G.gameMode = 'pvp';
        G.updateModeButtons();
        G.resetGame();
    });

    document.getElementById('modeOnline').addEventListener('click', function() {
        if (!G.currentUser) {
            alert('请先登录');
            G.showTab('loginContent');
            return;
        }
        G.showTab('onlineContent');
    });

    document.getElementById('playerColorBlack').addEventListener('click', function() {
        if (G.playerColor === 1) return;
        G.playerColor = 1;
        G.updateColorButtons();
        if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
            G.resetGame();
            G.showToast('已切换为黑棋，游戏重新开始');
        } else {
            G.showToast('您将执黑先行');
        }
    });

    document.getElementById('playerColorWhite').addEventListener('click', function() {
        if (G.playerColor === 2) return;
        G.playerColor = 2;
        G.updateColorButtons();
        if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
            G.resetGame();
            G.showToast('已切换为白棋，游戏重新开始');
        } else {
            G.showToast('您将执白后行');
        }
    });

    document.getElementById('aiEasy').addEventListener('click', function() {
        if (G.aiDifficulty === 'easy') return;
        G.aiDifficulty = 'easy';
        G.updateDifficultyButtons();
        if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
            G.resetGame();
            G.showToast('AI难度已设为简单，游戏重新开始');
        } else {
            G.showToast('AI难度已设置为简单');
        }
    });

    document.getElementById('aiMedium').addEventListener('click', function() {
        if (G.aiDifficulty === 'medium') return;
        G.aiDifficulty = 'medium';
        G.updateDifficultyButtons();
        if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
            G.resetGame();
            G.showToast('AI难度已设为中等，游戏重新开始');
        } else {
            G.showToast('AI难度已设置为中等');
        }
    });

    document.getElementById('aiHard').addEventListener('click', function() {
        if (G.aiDifficulty === 'hard') return;
        G.aiDifficulty = 'hard';
        G.updateDifficultyButtons();
        if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
            G.resetGame();
            G.showToast('AI难度已设为困难，游戏重新开始');
        } else {
            G.showToast('AI难度已设置为困难');
        }
    });

    document.getElementById('aiForbidden').addEventListener('change', function(e) {
        G.aiForbidden = e.target.checked;
        G.showToast(G.aiForbidden ? '已启用禁手规则' : '已禁用禁手规则');
        if (G.gameMode === 'ai') {
            G.resetGame();
            G.showToast('设置已更改，游戏重新开始');
        }
    });

    document.getElementById('pvpForbidden').addEventListener('change', function(e) {
        G.pvpForbidden = e.target.checked;
        G.showToast(G.pvpForbidden ? '已启用禁手规则' : '已禁用禁手规则');
        if (G.gameMode === 'pvp') {
            G.resetGame();
            G.showToast('设置已更改，游戏重新开始');
        }
    });

    var timeButtons = ['timeNone', 'time5min', 'time10min', 'time30min'];
    var timeLimits = [0, 300, 600, 1800];
    var timeLabels = ['无限制', '5分钟', '10分钟', '30分钟'];

    timeButtons.forEach(function(id, index) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            G.pvpTimeLimit = timeLimits[index];
            timeButtons.forEach(function(btnId) {
                var b = document.getElementById(btnId);
                if (b) {
                    b.classList.remove('bg-primary', 'text-white');
                }
            });
            btn.classList.add('bg-primary', 'text-white');
            var display = document.getElementById('pvpTimerDisplay');
            var text = document.getElementById('pvpTimeLimitText');
            if (G.pvpTimeLimit > 0) {
                if (display) display.classList.remove('hidden');
                if (text) text.textContent = timeLabels[index];
            } else {
                if (display) display.classList.add('hidden');
            }
            G.showToast('时间限制: ' + timeLabels[index]);
            if (G.gameMode === 'pvp' && G.gameActive) {
                G.stopPvpTurnTimer();
                G.resetGame();
            }
        });
    });

    document.getElementById('restartBtn').addEventListener('click', G.resetGame);
    document.getElementById('undoBtn').addEventListener('click', G.undoMove);
    if (document.getElementById('resignBtn')) {
        document.getElementById('resignBtn').addEventListener('click', G.confirmResign);
    }

    document.getElementById('gameCanvas').addEventListener('click', function(e) {
        if (!G.gameActive) return;
        if (G.gameMode === 'ai' && G.currentPlayer !== G.playerColor) return;
        if (G.gameMode === 'pvp' && G.pvpTimeLimit > 0) return;
        var rect = G.canvas.getBoundingClientRect();
        var displayWidth = rect.width;
        var displayHeight = rect.height;
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var cellSize = displayWidth / (G.BOARD_SIZE - 1);
        var col = Math.round(x / cellSize);
        var row = Math.round(y / cellSize);
        if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
            G.placePiece(row, col, G.currentPlayer);
        }
    });

})();
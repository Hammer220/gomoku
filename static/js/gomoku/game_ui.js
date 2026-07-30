// ============================================================
// 游戏界面更新与交互
// 负责：UI 状态更新、按钮选中状态、标签页切换、联机棋盘点击
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    // 更新游戏界面显示（状态文本、步数、悔棋次数、时间）
    G.updateUI = function() {
        if (!G.gameActive) return;
        var label = G.gameMode === 'ai' ? (G.currentPlayer === G.playerColor ? '你' : 'AI') : (G.currentPlayer === 1 ? '黑棋' : '白棋');
        var statusText = $('statusText');
        var moveCount = $('moveCount');
        var undoCountText = $('undoCountText');
        var gameTimeDisplay = $('gameTimeDisplay');
        if (statusText) statusText.textContent = '游戏进行中 - ' + label + ' (' + (G.currentPlayer === 1 ? '黑棋' : '白棋') + ') 回合';
        if (moveCount) moveCount.textContent = G.moveHistory.length;
        if (undoCountText) undoCountText.textContent = '悔棋次数: ' + G.undoCount + '/3';
        if (gameTimeDisplay) gameTimeDisplay.textContent = G.formatTime(G.gameTime);
    };

    // 更新 AI 难度按钮的选中状态
    G.updateDifficultyButtons = function() {
        ['easy', 'medium', 'hard'].forEach(function(d) {
            var btn = $('ai' + d.charAt(0).toUpperCase() + d.slice(1));
            if (!btn) return;
            btn.classList.toggle('bg-primary', G.aiDifficulty === d);
            btn.classList.toggle('text-white', G.aiDifficulty === d);
        });
    };

    // 更新游戏模式按钮的选中状态
    G.updateModeButtons = function() {
        var isAI = G.gameMode === 'ai';
        var isOnline = G.gameMode === 'online';
        var isPVP = G.gameMode === 'pvp';

        var modeAI = $('modeAI');
        var modePVP = $('modePVP');
        var modeOnline = $('modeOnline');
        var aiSettings = $('aiSettings');
        var pvpSettings = $('pvpSettings');
        var onlineSettingsHint = $('onlineSettingsHint');

        if (modeAI) {
            modeAI.classList.toggle('bg-primary', isAI);
            modeAI.classList.toggle('text-white', isAI);
            modeAI.classList.toggle('border-gray-300', !isAI);
            modeAI.classList.toggle('text-gray-700', !isAI);
        }
        if (modePVP) {
            modePVP.classList.toggle('bg-primary', isPVP);
            modePVP.classList.toggle('text-white', isPVP);
            modePVP.classList.toggle('border-gray-300', !isPVP);
            modePVP.classList.toggle('text-gray-700', !isPVP);
        }
        if (modeOnline) {
            modeOnline.classList.toggle('bg-primary', isOnline);
            modeOnline.classList.toggle('text-white', isOnline);
            modeOnline.classList.toggle('border-gray-300', !isOnline);
            modeOnline.classList.toggle('text-gray-700', !isOnline);
        }
        if (aiSettings) aiSettings.classList.toggle('hidden', !isAI);
        if (pvpSettings) pvpSettings.classList.toggle('hidden', !isPVP);
        if (onlineSettingsHint) onlineSettingsHint.classList.toggle('hidden', !isOnline);

        if (!isPVP) G.stopPvpTurnTimer();
    };

    // 更新棋子颜色按钮的选中状态
    G.updateColorButtons = function() {
        var black = $('playerColorBlack');
        var white = $('playerColorWhite');
        if (black) {
            black.classList.toggle('bg-primary', G.playerColor === 1);
            black.classList.toggle('text-white', G.playerColor === 1);
        }
        if (white) {
            white.classList.toggle('bg-primary', G.playerColor === 2);
            white.classList.toggle('text-white', G.playerColor === 2);
        }
    };

    // 切换标签页显示
    G.showTab = function(tabId) {
        // 访客模式不允许访问联机对战和消息中心
        if (G.isGuest && (tabId === 'onlineContent' || tabId === 'profileContent' || tabId === 'historyContent' || tabId === 'statsContent' || tabId === 'leaderboardContent' || tabId === 'adminContent' || tabId === 'boardColorContent')) {
            G.showToast('访客模式无法使用此功能，请注册账号', true);
            return;
        }
        ['gameContent', 'onlineContent', 'profileContent', 'historyContent', 'statsContent', 'leaderboardContent', 'adminContent', 'boardColorContent'].forEach(function(id) {
            var el = $(id);
            if (el) el.classList.add('hidden');
        });
        var targetEl = $(tabId);
        if (targetEl) targetEl.classList.remove('hidden');
        ['gameTab', 'onlineTab', 'profileTab', 'historyTab', 'statsTab', 'leaderboardTab', 'adminTab', 'boardColorTab'].forEach(function(id) {
            var el = $(id);
            if (el) el.classList.remove('tab-active');
        });
        var tabBtn = $(tabId.replace('Content', 'Tab'));
        if (tabBtn) tabBtn.classList.add('tab-active');

        if (tabId === 'adminContent' && G.loadAdminUsers) {
            G.loadAdminUsers();
            if (G.currentUser && G.currentUser.isSuperAdmin && G.loadAdminList) G.loadAdminList();
        }
        if (tabId === 'leaderboardContent' && G.loadLeaderboard) G.loadLeaderboard();
        if (tabId === 'historyContent') { G.historyCurrentPage = 1; if (G.loadHistory) G.loadHistory(); }
        if (tabId === 'statsContent' && G.loadStats) G.loadStats();
        if (tabId === 'onlineContent') {
            G.onlineCanvas = $('onlineCanvas');
            G.onlineCtx = G.onlineCanvas ? G.onlineCanvas.getContext('2d') : null;
            if (G.onlineCanvas) {
                G.onlineCanvas.onclick = null;
                G.onlineCanvas.addEventListener('click', G.handleOnlineClick);
            }
            if (G.calcOnlineCanvasSize) G.calcOnlineCanvasSize();
            if (!G.onlineBoard || !G.onlineBoard[0]) G.initOnlineBoard();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            if (G.loadOnlineAvailableMatches) G.loadOnlineAvailableMatches();
            if (G.checkExistingMatch) G.checkExistingMatch();
            if (G.startMatchListRefresh) G.startMatchListRefresh();
        } else {
            if (G.stopMatchListRefresh) G.stopMatchListRefresh();
        }
    };

    // 处理联机棋盘点击事件
    G.handleOnlineClick = function(e) {
        if (!G.onlineGameActive || !G.onlineMatchId) return;
        if (G.onlineMyColor === null || G.onlineMyColor === undefined) return;
        var currentPlayer = Number(G.onlineCurrentPlayer);
        var myColor = Number(G.onlineMyColor);
        if (currentPlayer !== myColor) return;

        var rect = G.onlineCanvas.getBoundingClientRect();
        var scaleX = G.onlineCanvas.width / rect.width;
        var scaleY = G.onlineCanvas.height / rect.height;
        var x = (e.clientX - rect.left) * scaleX;
        var y = (e.clientY - rect.top) * scaleY;
        var pieceSize = G.onlineCellSizeGlobal * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var col = Math.round((x - margin) / G.onlineCellSizeGlobal);
        var row = Math.round((y - margin) / G.onlineCellSizeGlobal);
        if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE && G.onlineBoard[row][col] === 0) {
            G.makeOnlineMove(row, col);
        }
    };
})();
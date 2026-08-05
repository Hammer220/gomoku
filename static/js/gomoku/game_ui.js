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

    G.hashToContent = {
        '/game': 'gameContent',
        '/online': 'onlineContent',
        '/profile': 'profileContent',
        '/history': 'historyContent',
        '/stats': 'statsContent',
        '/leaderboard': 'leaderboardContent',
        '/admin': 'adminContent',
        '/board': 'boardColorContent'
    };

    G.contentToHash = {
        'gameContent': '/game',
        'onlineContent': '/online',
        'profileContent': '/profile',
        'historyContent': '/history',
        'statsContent': '/stats',
        'leaderboardContent': '/leaderboard',
        'adminContent': '/admin',
        'boardColorContent': '/board'
    };

    G.handleRouteChange = function() {
        var path = window.location.pathname;
        // 处理带参数的路径 /online/<matchId> 和 /game/<matchId>
        if (path.startsWith('/online/')) {
            path = '/online';
        }
        if (path.startsWith('/game/')) {
            path = '/game';
        }
        var contentId = G.hashToContent[path];
        if (contentId && $(contentId)) {
            G.showTab(contentId, true);
        }
    };

    window.addEventListener('popstate', G.handleRouteChange);

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
        ['easy', 'medium', 'hard', 'master'].forEach(function(d) {
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
    G.showTab = function(tabId, skipHashUpdate) {
        if (G.isGuest && tabId === 'adminContent') {
            G.showToast('管理后台仅限管理员访问', true);
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

        var hash = G.contentToHash[tabId];
        if (hash && !skipHashUpdate) {
            history.replaceState(null, '', hash);
        }

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
                G.onlineCanvas.removeEventListener('click', G.handleOnlineClick);
                G.onlineCanvas.removeEventListener('mousemove', G.handleOnlineHover);
                G.onlineCanvas.removeEventListener('mouseleave', G.handleOnlineHoverLeave);
                G.onlineCanvas.addEventListener('click', G.handleOnlineClick);
                G.onlineCanvas.addEventListener('mousemove', G.handleOnlineHover);
                G.onlineCanvas.addEventListener('mouseleave', G.handleOnlineHoverLeave);
            }
            if (G.calcOnlineCanvasSize) G.calcOnlineCanvasSize();
            if (!G.onlineBoard || !G.onlineBoard[0]) G.initOnlineBoard();
            var boardContainer = $('onlineBoardContainer');
            if (G.onlineMatchId && G.onlineGameActive) {
                if (boardContainer) boardContainer.classList.remove('hidden');
                if (G.hideOnlineLobby) G.hideOnlineLobby();
                if (G.drawOnlineBoard) G.drawOnlineBoard();
            } else {
                if (boardContainer) boardContainer.classList.add('hidden');
                if (G.showOnlineLobby) G.showOnlineLobby();
            }
            if (G.isGuest) {
                var guestOverlay = $('guestOnlineOverlay');
                if (guestOverlay) guestOverlay.classList.remove('hidden');
            } else {
                var guestOverlay = $('guestOnlineOverlay');
                if (guestOverlay) guestOverlay.classList.add('hidden');
                if (G.loadOnlineAvailableMatches) G.loadOnlineAvailableMatches();
                if (G.checkExistingMatch) G.checkExistingMatch();
                if (G.startMatchListRefresh) G.startMatchListRefresh();
            }
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

    G.handleOnlineHover = function(e) {
        if (!G.onlineGameActive || !G.onlineMatchId) return;
        if (G.onlineMyColor === null || G.onlineMyColor === undefined) return;
        var currentPlayer = Number(G.onlineCurrentPlayer);
        var myColor = Number(G.onlineMyColor);
        if (currentPlayer !== myColor) {
            G.onlineHoverEnabled = false;
            G.onlineHoverRow = -1;
            G.onlineHoverCol = -1;
            G.drawOnlineBoard();
            return;
        }

        var rect = G.onlineCanvas.getBoundingClientRect();
        var scaleX = G.onlineCanvas.width / rect.width;
        var scaleY = G.onlineCanvas.height / rect.height;
        var x = (e.clientX - rect.left) * scaleX;
        var y = (e.clientY - rect.top) * scaleY;
        var pieceSize = G.onlineCellSizeGlobal * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var col = Math.round((x - margin) / G.onlineCellSizeGlobal);
        var row = Math.round((y - margin) / G.onlineCellSizeGlobal);
        if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
            if (G.onlineHoverRow !== row || G.onlineHoverCol !== col) {
                G.onlineHoverRow = row;
                G.onlineHoverCol = col;
                G.onlineHoverEnabled = true;
                G.drawOnlineBoard();
            }
        } else {
            if (G.onlineHoverRow !== -1 || G.onlineHoverCol !== -1) {
                G.onlineHoverRow = -1;
                G.onlineHoverCol = -1;
                G.drawOnlineBoard();
            }
        }
    };

    G.handleOnlineHoverLeave = function() {
        G.onlineHoverEnabled = false;
        G.onlineHoverRow = -1;
        G.onlineHoverCol = -1;
        G.drawOnlineBoard();
    };
})();
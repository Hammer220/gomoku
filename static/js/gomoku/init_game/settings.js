// ============================================================
// 游戏大厅初始化 - 设置与系统事件
// 负责：密码修改、棋盘颜色设置、背景图片、积分排行榜、
//       游戏记录筛选/翻页、退出登录、窗口resize、自动登录恢复
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    // ==================== Canvas 初始化 ====================

    G.canvas = $('gameCanvas');
    G.ctx = G.canvas ? G.canvas.getContext('2d') : null;
    G.onlineCanvas = $('onlineCanvas');
    G.onlineCtx = G.onlineCanvas ? G.onlineCanvas.getContext('2d') : null;

    // ==================== 标签页切换 ====================

    var gameTab = $('gameTab');
    if (gameTab) gameTab.addEventListener('click', function() { G.showTab('gameContent'); });
    var onlineTab = $('onlineTab');
    if (onlineTab) onlineTab.addEventListener('click', function() { G.showTab('onlineContent'); });
    var profileTab = $('profileTab');
    if (profileTab) profileTab.addEventListener('click', function() { G.showTab('profileContent'); });
    var historyTab = $('historyTab');
    if (historyTab) historyTab.addEventListener('click', function() { G.showTab('historyContent'); });
    var statsTab = $('statsTab');
    if (statsTab) statsTab.addEventListener('click', function() { G.showTab('statsContent'); });
    var leaderboardTab = $('leaderboardTab');
    if (leaderboardTab) leaderboardTab.addEventListener('click', function() { G.showTab('leaderboardContent'); });

    // ==================== 密码修改 ====================

    var changePasswordBtn = $('changePasswordBtn');
    if (changePasswordBtn) changePasswordBtn.addEventListener('click', G.changePassword);

    // ==================== 棋盘颜色设置 ====================

    // 棋盘线条颜色
    var boardLineColor = $('boardLineColor');
    var boardLineColorText = $('boardLineColorText');
    if (boardLineColor) {
        boardLineColor.addEventListener('input', function() {
            if (boardLineColorText) boardLineColorText.value = boardLineColor.value;
        });
    }
    if (boardLineColorText) {
        boardLineColorText.addEventListener('input', function() {
            var color = boardLineColorText.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                if (boardLineColor) boardLineColor.value = color;
            }
        });
    }

    // 星位点颜色
    var boardDotColor = $('boardDotColor');
    var boardDotColorText = $('boardDotColorText');
    if (boardDotColor) {
        boardDotColor.addEventListener('input', function() {
            if (boardDotColorText) boardDotColorText.value = boardDotColor.value;
        });
    }
    if (boardDotColorText) {
        boardDotColorText.addEventListener('input', function() {
            var color = boardDotColorText.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                if (boardDotColor) boardDotColor.value = color;
            }
        });
    }

    // 保存棋盘颜色设置
    var saveBoardColorBtn = $('saveBoardColorBtn');
    if (saveBoardColorBtn) saveBoardColorBtn.addEventListener('click', G.saveBoardColorSettings);

    // 重置棋盘颜色设置
    var resetBoardColorBtn = $('resetBoardColorBtn');
    if (resetBoardColorBtn) {
        resetBoardColorBtn.addEventListener('click', function() {
            G.boardLineColor = '#8B5A2B';
            G.boardDotColor = '#8B5A2B';
            G.selectedBackground = '';
            var blc = $('boardLineColor');
            var blct = $('boardLineColorText');
            var bdc = $('boardDotColor');
            var bdct = $('boardDotColorText');
            if (blc) blc.value = G.boardLineColor;
            if (blct) blct.value = G.boardLineColor;
            if (bdc) bdc.value = G.boardDotColor;
            if (bdct) bdct.value = G.boardDotColor;
            G.drawBoard();
            G.drawOnlineBoard();
            if (G.applyBackground) G.applyBackground('');
            if (G.renderBackgroundGrid) G.renderBackgroundGrid();
            if (G.saveBoardColorSettings) G.saveBoardColorSettings();
        });
    }

    // 加载背景图片列表
    var loadBackgroundsBtn = $('loadBackgroundsBtn');
    if (loadBackgroundsBtn) loadBackgroundsBtn.addEventListener('click', G.loadBackgrounds);

    // ==================== 积分排行榜 ====================

    var refreshLeaderboardBtn = $('refreshLeaderboardBtn');
    if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', G.loadLeaderboard);

    // ==================== 游戏记录 ====================

    // 模式筛选
    var historyModeFilter = $('historyModeFilter');
    if (historyModeFilter) {
        historyModeFilter.addEventListener('change', function() {
            G.historyCurrentPage = 1;
            G.renderHistory();
        });
    }

    // 结果筛选
    var historyResultFilter = $('historyResultFilter');
    if (historyResultFilter) {
        historyResultFilter.addEventListener('change', function() {
            G.historyCurrentPage = 1;
            G.renderHistory();
        });
    }

    // 刷新记录
    var refreshHistoryBtn = $('refreshHistoryBtn');
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', function() {
            G.historyCurrentPage = 1;
            G.loadHistory();
        });
    }

    // 翻页：上一页
    var historyPrevPage = $('historyPrevPage');
    if (historyPrevPage) {
        historyPrevPage.addEventListener('click', function() {
            if (G.historyCurrentPage > 1) {
                G.historyCurrentPage--;
                G.renderHistory();
            }
        });
    }

    // 翻页：下一页
    var historyNextPage = $('historyNextPage');
    if (historyNextPage) {
        historyNextPage.addEventListener('click', function() {
            G.historyCurrentPage++;
            G.renderHistory();
        });
    }

    // ==================== 退出登录 ====================

    var logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', G.logout);

    // ==================== 窗口尺寸变化 ====================

    window.addEventListener('resize', function() {
        G.drawBoard();
        G.drawOnlineBoard();
    });

    // 初始化容器尺寸监听器
    if (G.initCanvasObserver) G.initCanvasObserver();

    // ==================== 自动登录恢复 ====================

    if (G.token) {
        (async function() {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                if (G.updateUserDisplay) G.updateUserDisplay();
                if (G.loadBoardColorSettings) await G.loadBoardColorSettings();
                if (G.showGameUI) G.showGameUI();
                G.calcCanvasSize();
                G.resetGame();
                if (G.startStatusCheck) G.startStatusCheck();
                if (G.updateUnreadBadge) G.updateUnreadBadge();
                if (G.recoverOnlineMatch) await G.recoverOnlineMatch();
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
                window.location.href = '/login';
                return;
            }
        })();
    }

    // ==================== 页面关闭处理 ====================

    window.addEventListener('beforeunload', function(event) {
        if (G.stopStatusCheck) G.stopStatusCheck();
        if (G.stopBannedCountdown) G.stopBannedCountdown();
    });

    // 初始化复盘事件
    if (G.initReplayEvents) G.initReplayEvents();
})();
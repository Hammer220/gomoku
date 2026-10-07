// ============================================================
// 主页初始化 - 设置与系统事件
// 负责：密码修改、棋盘颜色、排行榜、游戏记录、窗口事件、自动登录
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    var changePasswordBtn = $('changePasswordBtn');
    if (changePasswordBtn) changePasswordBtn.addEventListener('click', G.changePassword);

    var createAdminBtn = $('createAdminBtn');
    if (createAdminBtn) createAdminBtn.addEventListener('click', G.createAdminAccount);
    var refreshAdminsBtn = $('refreshAdminsBtn');
    if (refreshAdminsBtn) refreshAdminsBtn.addEventListener('click', G.loadAdminList);

    var viewAllRecordsBtn = $('viewAllRecordsBtn');
    if (viewAllRecordsBtn) viewAllRecordsBtn.addEventListener('click', G.viewAllRecords);
    var closeAllRecordsBtn = $('closeAllRecordsBtn');
    if (closeAllRecordsBtn) closeAllRecordsBtn.addEventListener('click', G.closeAllRecordsModal);
    var exportRecordsBtn = $('exportRecordsBtn');
    if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', G.exportRecords);
    var recordsUserFilter = $('recordsUserFilter');
    if (recordsUserFilter) {
        recordsUserFilter.addEventListener('change', function() {
            if (G.allRecordsData) {
                G.renderRecords(G.allRecordsData, recordsUserFilter.value);
            }
        });
    }

    var boardLineColor = $('boardLineColor');
    var boardLineColorText = $('boardLineColorText');
    if (boardLineColor) {
        boardLineColor.addEventListener('input', function() {
            if (boardLineColorText) boardLineColorText.value = this.value;
        });
    }
    if (boardLineColorText) {
        boardLineColorText.addEventListener('input', function() {
            var color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                if (boardLineColor) boardLineColor.value = color;
            }
        });
    }

    var boardDotColor = $('boardDotColor');
    var boardDotColorText = $('boardDotColorText');
    if (boardDotColor) {
        boardDotColor.addEventListener('input', function() {
            if (boardDotColorText) boardDotColorText.value = this.value;
        });
    }
    if (boardDotColorText) {
        boardDotColorText.addEventListener('input', function() {
            var color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                if (boardDotColor) boardDotColor.value = color;
            }
        });
    }

    var saveBoardColorBtn = $('saveBoardColorBtn');
    if (saveBoardColorBtn) saveBoardColorBtn.addEventListener('click', G.saveBoardColorSettings);

    var resetBoardColorBtn = $('resetBoardColorBtn');
    if (resetBoardColorBtn) {
        resetBoardColorBtn.addEventListener('click', function() {
            G.boardLineColor = '#8B5A2B';
            G.boardDotColor = '#8B5A2B';
            G.selectedBackground = '';
            if (boardLineColor) boardLineColor.value = G.boardLineColor;
            if (boardLineColorText) boardLineColorText.value = G.boardLineColor;
            if (boardDotColor) boardDotColor.value = G.boardDotColor;
            if (boardDotColorText) boardDotColorText.value = G.boardDotColor;
            G.drawBoard();
            G.drawOnlineBoard();
            if (G.applyBackground) G.applyBackground('');
            if (G.renderBackgroundGrid) G.renderBackgroundGrid();
            if (G.saveBoardColorSettings) G.saveBoardColorSettings();
        });
    }

    var loadBackgroundsBtn = $('loadBackgroundsBtn');
    if (loadBackgroundsBtn) loadBackgroundsBtn.addEventListener('click', G.loadBackgrounds);

    var refreshLeaderboardBtn = $('refreshLeaderboardBtn');
    if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', G.loadLeaderboard);

    var historyModeFilter = $('historyModeFilter');
    if (historyModeFilter) historyModeFilter.addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    var historyResultFilter = $('historyResultFilter');
    if (historyResultFilter) historyResultFilter.addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    var historyUserFilter = $('historyUserFilter');
    if (historyUserFilter) historyUserFilter.addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    var refreshHistoryBtn = $('refreshHistoryBtn');
    if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', function() {
        G.historyCurrentPage = 1;
        G.loadHistory();
    });
    var historyPrevPage = $('historyPrevPage');
    if (historyPrevPage) historyPrevPage.addEventListener('click', function() {
        if (G.historyCurrentPage > 1) { G.historyCurrentPage--; G.renderHistory(); }
    });
    var historyNextPage = $('historyNextPage');
    if (historyNextPage) historyNextPage.addEventListener('click', function() {
        G.historyCurrentPage++;
        G.renderHistory();
    });

    if (G.initCanvasObserver) G.initCanvasObserver();

    window.addEventListener('resize', function() {
        G.drawBoard();
        G.drawOnlineBoard();
    });

    window.addEventListener('beforeunload', function(event) {
        if (G.stopStatusCheck) G.stopStatusCheck();
        if (G.stopBannedCountdown) G.stopBannedCountdown();
    });

})();

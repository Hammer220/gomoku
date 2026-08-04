// ============================================================
// 主页初始化 - 设置与系统事件
// 负责：密码修改、棋盘颜色、排行榜、游戏记录、窗口事件、自动登录
// ============================================================
(function() {
    var G = window.Gomoku;

    document.getElementById('changePasswordBtn').addEventListener('click', G.changePassword);

    document.getElementById('createAdminBtn').addEventListener('click', G.createAdminAccount);
    document.getElementById('refreshAdminsBtn').addEventListener('click', G.loadAdminList);

    document.getElementById('viewAllRecordsBtn').addEventListener('click', G.viewAllRecords);
    document.getElementById('closeAllRecordsBtn').addEventListener('click', G.closeAllRecordsModal);
    document.getElementById('exportRecordsBtn').addEventListener('click', G.exportRecords);
    document.getElementById('recordsUserFilter').addEventListener('change', function() {
        if (G.allRecordsData) {
            G.renderRecords(G.allRecordsData, this.value);
        }
    });

    document.getElementById('boardLineColor').addEventListener('input', function() {
        document.getElementById('boardLineColorText').value = this.value;
    });
    document.getElementById('boardLineColorText').addEventListener('input', function() {
        var color = this.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            document.getElementById('boardLineColor').value = color;
        }
    });

    document.getElementById('boardDotColor').addEventListener('input', function() {
        document.getElementById('boardDotColorText').value = this.value;
    });
    document.getElementById('boardDotColorText').addEventListener('input', function() {
        var color = this.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            document.getElementById('boardDotColor').value = color;
        }
    });

    document.getElementById('saveBoardColorBtn').addEventListener('click', G.saveBoardColorSettings);

    document.getElementById('resetBoardColorBtn').addEventListener('click', function() {
        G.boardLineColor = '#8B5A2B';
        G.boardDotColor = '#8B5A2B';
        G.selectedBackground = '';
        document.getElementById('boardLineColor').value = G.boardLineColor;
        document.getElementById('boardLineColorText').value = G.boardLineColor;
        document.getElementById('boardDotColor').value = G.boardDotColor;
        document.getElementById('boardDotColorText').value = G.boardDotColor;
        G.drawBoard();
        G.drawOnlineBoard();
        G.applyBackground('');
        G.renderBackgroundGrid();
        G.saveBoardColorSettings();
    });

    document.getElementById('loadBackgroundsBtn').addEventListener('click', G.loadBackgrounds);

    document.getElementById('refreshLeaderboardBtn').addEventListener('click', G.loadLeaderboard);

    document.getElementById('historyModeFilter') && document.getElementById('historyModeFilter').addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    document.getElementById('historyResultFilter') && document.getElementById('historyResultFilter').addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    document.getElementById('historyUserFilter') && document.getElementById('historyUserFilter').addEventListener('change', function() {
        G.historyCurrentPage = 1;
        G.renderHistory();
    });
    document.getElementById('refreshHistoryBtn') && document.getElementById('refreshHistoryBtn').addEventListener('click', function() {
        G.historyCurrentPage = 1;
        G.loadHistory();
    });
    document.getElementById('historyPrevPage') && document.getElementById('historyPrevPage').addEventListener('click', function() {
        if (G.historyCurrentPage > 1) { G.historyCurrentPage--; G.renderHistory(); }
    });
    document.getElementById('historyNextPage') && document.getElementById('historyNextPage').addEventListener('click', function() {
        G.historyCurrentPage++;
        G.renderHistory();
    });

    G.initCanvasObserver();

    window.addEventListener('resize', function() {
        G.drawBoard();
        G.drawOnlineBoard();
    });

    window.addEventListener('beforeunload', function(event) {
        G.stopStatusCheck();
        G.stopBannedCountdown();
    });

})();
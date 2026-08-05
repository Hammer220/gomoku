// ============================================================
// 游戏大厅初始化 - 操作与交互绑定
// 负责：游戏操作按钮（重启/悔棋/保存）、棋盘点击落子、
//       联机对战事件（创建/加入/离开房间）、观战功能
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    // 重新开始
    var restartBtn = $('restartBtn');
    if (restartBtn) restartBtn.addEventListener('click', G.resetGame);

    // 悔棋
    var undoBtn = $('undoBtn');
    if (undoBtn) undoBtn.addEventListener('click', G.undoMove);

    // 保存棋局
    var saveGameBtn = $('saveGameBtn');
    if (saveGameBtn) saveGameBtn.addEventListener('click', G.saveGame);

    // 导出当前棋局
    var exportGameBtn = $('exportGameBtn');
    if (exportGameBtn) exportGameBtn.addEventListener('click', G.exportCurrentGame);

    // 导入棋局文件选择处理
    var importFileInput = $('importFileInput');
    var importAction = 'frontend';
    if (importFileInput) {
        importFileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) {
                if (importAction === 'server') {
                    G.importGameToServer(file);
                } else {
                    G.importGameFromFile(file);
                }
                e.target.value = '';
            }
        });
    }

    // 导入棋局（加载到前端）
    var importGameBtn = $('importGameBtn');
    if (importGameBtn) {
        importGameBtn.addEventListener('click', function() {
            importAction = 'frontend';
            var fileInput = $('importFileInput');
            if (fileInput) fileInput.click();
        });
    }

    // 导入存档（保存到服务器）
    var importSaveBtn = $('importSaveBtn');
    if (importSaveBtn) {
        importSaveBtn.addEventListener('click', function() {
            importAction = 'server';
            var fileInput = $('importFileInput');
            if (fileInput) fileInput.click();
        });
    }

    // 新游戏
    var newGameBtn = $('newGameBtn');
    if (newGameBtn) newGameBtn.addEventListener('click', G.resetGame);

    // 本地棋盘点击落子
    if (G.canvas) {
        G.canvas.addEventListener('click', function(e) {
            if (!G.gameActive) return;
            if (G.gameMode === 'ai' && G.currentPlayer !== G.playerColor) return;
            if (G.gameMode === 'online' && G.currentPlayer !== G.onlineMyColor) return;
            var rect = G.canvas.getBoundingClientRect();
            var scaleX = G.canvas.width / rect.width;
            var scaleY = G.canvas.height / rect.height;
            var x = (e.clientX - rect.left) * scaleX;
            var y = (e.clientY - rect.top) * scaleY;
            var margin = G.PIECE_SIZE / 2 + 4;
            var col = Math.round((x - margin) / G.CELL_SIZE);
            var row = Math.round((y - margin) / G.CELL_SIZE);
            if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE && G.gameBoard[row][col] === 0) {
                G.placePiece(row, col, G.currentPlayer);
                if (G.gameMode === 'online') G.makeOnlineMove(row, col);
            }
        });
    }

    // 创建联机房间
    var onlineCreateBtn = $('onlineCreateBtn');
    if (onlineCreateBtn) onlineCreateBtn.addEventListener('click', G.onlineCreateMatch);

    // 加入联机房间
    var onlineJoinBtn = $('onlineJoinBtn');
    if (onlineJoinBtn) onlineJoinBtn.addEventListener('click', G.onlineJoinMatch);

    // 离开联机房间
    var onlineLeaveBtn = $('onlineLeaveBtn');
    if (onlineLeaveBtn) {
        onlineLeaveBtn.addEventListener('click', G.leaveOnlineRoom);
        onlineLeaveBtn.classList.add('hidden');
    }

    // 退出观战
    var spectateLeaveBtn = $('spectateLeaveBtn');
    if (spectateLeaveBtn) {
        spectateLeaveBtn.addEventListener('click', G.leaveSpectate);
        spectateLeaveBtn.classList.add('hidden');
    }

    // 刷新观战列表
    var refreshSpectateBtn = $('refreshSpectateBtn');
    if (refreshSpectateBtn) {
        refreshSpectateBtn.addEventListener('click', G.loadSpectatableMatches);
    }

    // 刷新可用房间列表
    var refreshAvailableBtn = $('refreshAvailableBtn');
    if (refreshAvailableBtn) {
        refreshAvailableBtn.addEventListener('click', G.loadAvailableMatches);
    }

    // 关闭房间处理
    if (G.attachCloseRoomHandler) G.attachCloseRoomHandler();

    // 观战链接分享
    if (G.attachShareSpectateHandler) G.attachShareSpectateHandler();

    // 联机房间：悔棋按钮
    var requestUndoBtn = $('requestUndoBtn');
    if (requestUndoBtn) requestUndoBtn.addEventListener('click', G.requestOnlineUndo);

    // 联机房间：求和按钮
    var requestDrawBtn = $('requestDrawBtn');
    if (requestDrawBtn) requestDrawBtn.addEventListener('click', G.requestOnlineDraw);

    // 联机房间：认输按钮
    var resignBtn = $('resignBtn');
    if (resignBtn) resignBtn.addEventListener('click', G.resignOnline);

    // 监控画布强制落子（超级管理员）
    var monitorCanvas = $('monitorCanvas');
    if (monitorCanvas) {
        monitorCanvas.addEventListener('click', function(e) {
            if (!G.monitorMatchId) return;
            var canvas = monitorCanvas;
            var rect = canvas.getBoundingClientRect();
            var displayWidth = rect.width;
            var displayHeight = rect.height;
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var cellSize = displayWidth / (G.BOARD_SIZE - 1);
            var col = Math.round(x / cellSize);
            var row = Math.round(y / cellSize);
            if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
                var player = parseInt($('monitorPlayerSelect').value);
                G.forceMove(row, col, player);
            }
        });
    }
})();
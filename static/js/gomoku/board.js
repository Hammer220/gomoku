// ============================================================
// 棋盘渲染与规则检查模块
// 负责：棋盘初始化、Canvas 尺寸计算、棋盘绘制（网格线+星位点+棋子）、
//       禁手规则检查、胜负判定、走法历史管理、复盘棋盘绘制
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 棋盘初始化 ====================

    // 初始化本地游戏棋盘（15×15 全零数组，0 表示空位）
    G.initBoard = function() {
        G.gameBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
        G.winningCells = [];
    };

    // 初始化联机棋盘
    G.initOnlineBoard = function() {
        G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
    };

    // 根据容器大小计算本地 Canvas 尺寸和格子大小
    G.calcCanvasSize = function() {
        var container = document.querySelector('.aspect-square');
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var size = Math.min(rect.width, rect.height);
        G.CELL_SIZE = Math.max(15, size / (G.BOARD_SIZE - 1));
        G.PIECE_SIZE = G.CELL_SIZE * G.PIECE_SIZE_RATIO;
        var margin = G.PIECE_SIZE / 2 + 4;
        G.canvas.width = G.CELL_SIZE * (G.BOARD_SIZE - 1) + margin * 2;
        G.canvas.height = G.CELL_SIZE * (G.BOARD_SIZE - 1) + margin * 2;
    };

    // 根据容器大小计算联机 Canvas 尺寸和格子大小
    G.calcOnlineCanvasSize = function() {
        var container = document.querySelector('#onlineContent .aspect-square');
        if (!container || !G.onlineCanvas) return;
        var rect = container.getBoundingClientRect();
        var size = Math.min(rect.width, rect.height);
        var onlineCellSize = Math.max(15, size / (G.BOARD_SIZE - 1));
        var onlinePieceSize = onlineCellSize * G.PIECE_SIZE_RATIO;
        var margin = onlinePieceSize / 2 + 4;
        G.onlineCanvas.width = onlineCellSize * (G.BOARD_SIZE - 1) + margin * 2;
        G.onlineCanvas.height = onlineCellSize * (G.BOARD_SIZE - 1) + margin * 2;
        G.onlineCellSizeGlobal = onlineCellSize;
        G.onlinePieceSizeGlobal = onlinePieceSize;
    };

    // 初始化容器尺寸监听器，当容器大小变化时自动重绘棋盘
    G.initCanvasObserver = function() {
        var gameContainer = document.querySelector('.aspect-square');
        var onlineContainer = document.querySelector('#onlineContent .aspect-square');
        var monitorContainer = document.querySelector('#onlineMatchMonitor .aspect-square');

        if (gameContainer) {
            new ResizeObserver(function() {
                G.calcCanvasSize();
                G.drawBoard();
            }).observe(gameContainer);
        }

        if (onlineContainer) {
            new ResizeObserver(function() {
                G.calcOnlineCanvasSize();
                G.drawOnlineBoard();
            }).observe(onlineContainer);
        }

        if (monitorContainer) {
            new ResizeObserver(function() {
                G.drawMonitorBoard();
            }).observe(monitorContainer);
        }
    };

    // 绘制本地游戏棋盘（网格线 + 星位点 + 棋子）
    G.drawBoard = function() {
        if (!G.ctx) return;
        if (!G.gameBoard || !G.gameBoard[0]) return;
        G.ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);
        // 绘制网格线
        G.ctx.strokeStyle = G.boardLineColor;
        G.ctx.lineWidth = 2;
        var margin = G.PIECE_SIZE / 2 + 4;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            G.ctx.beginPath();
            G.ctx.moveTo(margin, i * G.CELL_SIZE + margin);
            G.ctx.lineTo(G.canvas.width - margin, i * G.CELL_SIZE + margin);
            G.ctx.stroke();
            G.ctx.beginPath();
            G.ctx.moveTo(i * G.CELL_SIZE + margin, margin);
            G.ctx.lineTo(i * G.CELL_SIZE + margin, G.canvas.height - margin);
            G.ctx.stroke();
        }
        // 绘制五个星位点
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(pos) {
            G.ctx.beginPath();
            G.ctx.arc(pos[0] * G.CELL_SIZE + margin, pos[1] * G.CELL_SIZE + margin, 6, 0, 2 * Math.PI);
            G.ctx.fillStyle = G.boardDotColor;
            G.ctx.fill();
        });
        // 绘制所有棋子
        for (var r = 0; r < G.BOARD_SIZE; r++) {
            for (var c = 0; c < G.BOARD_SIZE; c++) {
                if (G.gameBoard[r][c] !== 0) {
                    G.drawPiece(r, c, G.gameBoard[r][c], G.winningCells.some(function(p) { return p.row === r && p.col === c; }));
                }
            }
        }
    };

    // 绘制单个棋子（带渐变和阴影效果，胜利棋子额外高亮）
    G.drawPiece = function(row, col, player, isWin) {
        isWin = isWin || false;
        var margin = G.PIECE_SIZE / 2 + 4;
        var x = col * G.CELL_SIZE + margin;
        var y = row * G.CELL_SIZE + margin;
        // 胜利棋子高亮圈
        if (isWin) {
            G.ctx.beginPath();
            G.ctx.arc(x, y, G.PIECE_SIZE / 2 + 6, 0, 2 * Math.PI);
            G.ctx.fillStyle = '#FFD70040';
            G.ctx.fill();
            G.ctx.strokeStyle = '#FFD700';
            G.ctx.lineWidth = 2;
            G.ctx.setLineDash([5, 3]);
            G.ctx.stroke();
            G.ctx.setLineDash([]);
        }
        // 棋子阴影
        G.ctx.beginPath();
        G.ctx.arc(x, y, G.PIECE_SIZE / 2 + 2, 0, 2 * Math.PI);
        G.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        G.ctx.fill();
        // 棋子本体（径向渐变）
        G.ctx.beginPath();
        G.ctx.arc(x, y, G.PIECE_SIZE / 2, 0, 2 * Math.PI);
        var grad = G.ctx.createRadialGradient(x - G.PIECE_SIZE / 6, y - G.PIECE_SIZE / 6, G.PIECE_SIZE / 10, x, y, G.PIECE_SIZE / 2);
        if (player === 1) {
            grad.addColorStop(0, '#555');   // 黑棋高光
            grad.addColorStop(1, '#000');   // 黑棋暗部
        } else {
            grad.addColorStop(0, '#fff');   // 白棋高光
            grad.addColorStop(1, '#ddd');   // 白棋暗部
        }
        G.ctx.fillStyle = grad;
        G.ctx.fill();
        G.ctx.strokeStyle = player === 1 ? '#333' : '#ccc';
        G.ctx.lineWidth = 1;
        G.ctx.stroke();
    };

    // 绘制联机棋盘（网格线 + 星位点 + 棋子）
    G.drawOnlineBoard = function() {
        if (!G.onlineCtx || !G.onlineCanvas) return;
        if (!G.onlineBoard || !G.onlineBoard[0]) {
            G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
        }
        var cellSize = G.onlineCellSizeGlobal || 30;
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var boardWidth = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        var boardHeight = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        if (G.onlineCanvas.width !== boardWidth || G.onlineCanvas.height !== boardHeight) {
            G.onlineCanvas.width = boardWidth;
            G.onlineCanvas.height = boardHeight;
        }
        G.onlineCtx.clearRect(0, 0, G.onlineCanvas.width, G.onlineCanvas.height);
        // 绘制网格线
        G.onlineCtx.strokeStyle = G.boardLineColor;
        G.onlineCtx.lineWidth = 2;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            G.onlineCtx.beginPath();
            G.onlineCtx.moveTo(margin, i * cellSize + margin);
            G.onlineCtx.lineTo(G.onlineCanvas.width - margin, i * cellSize + margin);
            G.onlineCtx.stroke();
            G.onlineCtx.beginPath();
            G.onlineCtx.moveTo(i * cellSize + margin, margin);
            G.onlineCtx.lineTo(i * cellSize + margin, G.onlineCanvas.height - margin);
            G.onlineCtx.stroke();
        }
        // 绘制星位点
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(pos) {
            G.onlineCtx.beginPath();
            G.onlineCtx.arc(pos[0] * cellSize + margin, pos[1] * cellSize + margin, 6, 0, 2 * Math.PI);
            G.onlineCtx.fillStyle = G.boardDotColor;
            G.onlineCtx.fill();
        });
        // 绘制所有棋子
        for (var r = 0; r < G.BOARD_SIZE; r++) {
            for (var c = 0; c < G.BOARD_SIZE; c++) {
                if (G.onlineBoard[r][c] !== 0) G.drawOnlinePiece(r, c, G.onlineBoard[r][c], cellSize);
            }
        }
    };

    // 绘制联机棋盘上的单个棋子
    G.drawOnlinePiece = function(row, col, player, cellSize) {
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var x = col * cellSize + margin;
        var y = row * cellSize + margin;
        // 阴影
        G.onlineCtx.beginPath();
        G.onlineCtx.arc(x, y, pieceSize / 2 + 2, 0, 2 * Math.PI);
        G.onlineCtx.fillStyle = 'rgba(0,0,0,0.2)';
        G.onlineCtx.fill();
        // 棋子本体
        G.onlineCtx.beginPath();
        G.onlineCtx.arc(x, y, pieceSize / 2, 0, 2 * Math.PI);
        var grad = G.onlineCtx.createRadialGradient(x - pieceSize / 6, y - pieceSize / 6, pieceSize / 10, x, y, pieceSize / 2);
        if (player === 1) {
            grad.addColorStop(0, '#555');
            grad.addColorStop(1, '#000');
        } else {
            grad.addColorStop(0, '#fff');
            grad.addColorStop(1, '#ddd');
        }
        G.onlineCtx.fillStyle = grad;
        G.onlineCtx.fill();
        G.onlineCtx.strokeStyle = player === 1 ? '#333' : '#ccc';
        G.onlineCtx.lineWidth = 1;
        G.onlineCtx.stroke();
    };

    // 管理员监控棋盘绘制（支持高 DPI 显示）
    G.drawMonitorBoard = function() {
        var canvas = document.getElementById('monitorCanvas');
        if (!canvas) return;
        var container = canvas.parentElement;
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var size = Math.min(rect.width, rect.height);
        if (size <= 0) return;
        // 高 DPI 适配
        var dpr = window.devicePixelRatio || 1;
        var cellSize = Math.max(15, size / (G.BOARD_SIZE - 1));
        var pieceRadius = cellSize * G.PIECE_SIZE_RATIO / 2;
        var margin = pieceRadius + 4;
        var boardWidth = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        var boardHeight = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        canvas.width = boardWidth * dpr;
        canvas.height = boardHeight * dpr;
        canvas.style.width = boardWidth + 'px';
        canvas.style.height = boardHeight + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        // 棋盘底色
        ctx.fillStyle = '#DEB887';
        ctx.fillRect(0, 0, boardWidth, boardHeight);
        // 网格线
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            var pos = i * cellSize + margin;
            ctx.beginPath();
            ctx.moveTo(pos, margin);
            ctx.lineTo(pos, boardHeight - margin);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(margin, pos);
            ctx.lineTo(boardWidth - margin, pos);
            ctx.stroke();
        }
        // 星位点
        var dotSize = Math.max(2, cellSize * 0.08);
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(p) {
            ctx.beginPath();
            ctx.arc(p[0] * cellSize + margin, p[1] * cellSize + margin, dotSize, 0, Math.PI * 2);
            ctx.fillStyle = '#8B5A2B';
            ctx.fill();
        });
        // 棋子
        if (!G.monitorBoard || !G.monitorBoard.length) return;
        for (var row = 0; row < G.BOARD_SIZE; row++) {
            if (!G.monitorBoard[row]) continue;
            for (var col = 0; col < G.BOARD_SIZE; col++) {
                if (G.monitorBoard[row][col] !== 0) {
                    var x = col * cellSize + margin;
                    var y = row * cellSize + margin;
                    // 阴影
                    ctx.beginPath();
                    ctx.arc(x + 1, y + 1, pieceRadius, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.fill();
                    // 棋子本体
                    ctx.beginPath();
                    ctx.arc(x, y, pieceRadius, 0, Math.PI * 2);
                    var grad = ctx.createRadialGradient(x - pieceRadius * 0.3, y - pieceRadius * 0.3, pieceRadius * 0.1, x, y, pieceRadius);
                    if (G.monitorBoard[row][col] === 1) {
                        grad.addColorStop(0, '#555');
                        grad.addColorStop(1, '#000');
                    } else {
                        grad.addColorStop(0, '#fff');
                        grad.addColorStop(1, '#ddd');
                    }
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.strokeStyle = G.monitorBoard[row][col] === 1 ? '#333' : '#ccc';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    };

    // 检查指定位置是否形成五连（胜利判定）
    // 在四个方向上统计连子数，达到5即胜利
    G.checkWin = function(row, col, player) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1, cells = [{ row: row, col: col }];
            // 正方向统计
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE || G.gameBoard[nr][nc] !== player) break;
                count++;
                cells.push({ row: nr, col: nc });
            }
            // 反方向统计
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE || G.gameBoard[nr][nc] !== player) break;
                count++;
                cells.push({ row: nr, col: nc });
            }
            if (count >= 5) { G.winningCells = cells; return true; }
        }
        return false;
    };

    // 检查是否平局（棋盘已满）
    G.checkDraw = function() {
        return G.gameBoard.every(function(row) { return row.every(function(v) { return v !== 0; }); });
    };

    // 检查长连禁手（六子及以上连子，仅对黑棋生效）
    G.checkOverline = function(row, col, board) {
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var dx = directions[d][0], dy = directions[d][1];
            var count = 1;
            for (var i = 1; i < 6; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            for (var i = 1; i < 6; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            if (count >= 6) return true;
        }
        return false;
    };

    // 分析某个方向上的棋型（活三、冲四等）
    // 取以 (row, col) 为中心、前后各4格的线段进行分析
    G.analyzeLine = function(row, col, dx, dy, board) {
        var result = { liveThree: false, four: false };
        var line = [];
        var centerIndex = 0;
        // 构建以落子点为中心的9格线段
        for (var i = -4; i <= 4; i++) {
            var nr = row + i * dy, nc = col + i * dx;
            if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) {
                line.push(-1);  // 边界视为墙
            } else {
                line.push(board[nr][nc]);
            }
            if (i === 0) centerIndex = line.length - 1;
        }
        // 从中心向两侧统计连子和空位
        var count = 1;
        var leftEmpty = 0, rightEmpty = 0;
        var leftBlocked = false, rightBlocked = false;
        for (var i = centerIndex - 1; i >= 0; i--) {
            if (line[i] === 1) { count++; }
            else if (line[i] === 0) { leftEmpty++; break; }
            else { leftBlocked = true; break; }
        }
        for (var i = centerIndex + 1; i < line.length; i++) {
            if (line[i] === 1) { count++; }
            else if (line[i] === 0) { rightEmpty++; break; }
            else { rightBlocked = true; break; }
        }
        // 判断棋型
        if (count === 4 && leftEmpty > 0 && rightEmpty > 0) result.four = true;     // 活四
        else if (count === 4 && (leftEmpty > 0 || rightEmpty > 0)) result.four = true;  // 冲四
        else if (count === 3 && leftEmpty > 0 && rightEmpty > 0) result.liveThree = true; // 活三
        return result;
    };

    // 禁手规则综合检查（仅对黑棋/玩家1生效）
    // 包括：长连禁手、三三禁手、四四禁手
    G.checkForbidden = function(row, col, board) {
        if (board[row][col] !== 1) return { forbidden: false, reason: '' };
        // 长连禁手
        if (G.checkOverline(row, col, board)) {
            return { forbidden: true, reason: '长连禁手（六子及以上）' };
        }
        // 统计各方向棋型
        var liveThrees = 0;
        var fours = 0;
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var lineInfo = G.analyzeLine(row, col, directions[d][0], directions[d][1], board);
            if (lineInfo.liveThree) liveThrees++;
            if (lineInfo.four) fours++;
        }
        // 三三禁手
        if (liveThrees >= 2) return { forbidden: true, reason: '三三禁手（同时形成两个活三）' };
        // 四四禁手
        if (fours >= 2) return { forbidden: true, reason: '四四禁手（同时形成两个四）' };
        return { forbidden: false, reason: '' };
    };

    // 判断当前模式是否需要检查禁手
    G.shouldCheckForbidden = function() {
        if (G.gameMode === 'ai') return true;
        if (G.gameMode === 'online') return true;
        if (G.gameMode === 'pvp') return G.pvpForbidden;
        return false;
    };

})();
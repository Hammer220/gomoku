// ============================================================
// 棋盘渲染模块
// 负责：棋盘初始化、Canvas 尺寸计算、本地/联机/监控棋盘绘制、
//       棋子绘制、容器尺寸监听
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 初始化本地游戏棋盘（15×15 全零数组）
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
        var container = document.querySelector('#gameContent .aspect-square');
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

    // 初始化容器尺寸监听器
    G.initCanvasObserver = function() {
        var gameContainer = document.querySelector('#gameContent .aspect-square');
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
        if (!G.ctx || !G.canvas) return;
        if (!G.gameBoard || !G.gameBoard[0]) return;
        var cellSize = G.CELL_SIZE || 30;
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var boardWidth = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        var boardHeight = cellSize * (G.BOARD_SIZE - 1) + margin * 2;
        if (G.canvas.width !== boardWidth || G.canvas.height !== boardHeight) {
            G.canvas.width = boardWidth;
            G.canvas.height = boardHeight;
        }
        G.ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);
        G.ctx.fillStyle = '#E6C8A0';
        G.ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);
        G.ctx.strokeStyle = G.boardLineColor;
        G.ctx.lineWidth = 2;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            G.ctx.beginPath();
            G.ctx.moveTo(margin, i * cellSize + margin);
            G.ctx.lineTo(G.canvas.width - margin, i * cellSize + margin);
            G.ctx.stroke();
            G.ctx.beginPath();
            G.ctx.moveTo(i * cellSize + margin, margin);
            G.ctx.lineTo(i * cellSize + margin, G.canvas.height - margin);
            G.ctx.stroke();
        }
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(pos) {
            G.ctx.beginPath();
            G.ctx.arc(pos[0] * cellSize + margin, pos[1] * cellSize + margin, 6, 0, 2 * Math.PI);
            G.ctx.fillStyle = G.boardDotColor;
            G.ctx.fill();
        });
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
        G.ctx.beginPath();
        G.ctx.arc(x, y, G.PIECE_SIZE / 2 + 2, 0, 2 * Math.PI);
        G.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        G.ctx.fill();
        G.ctx.beginPath();
        G.ctx.arc(x, y, G.PIECE_SIZE / 2, 0, 2 * Math.PI);
        var grad = G.ctx.createRadialGradient(x - G.PIECE_SIZE / 6, y - G.PIECE_SIZE / 6, G.PIECE_SIZE / 10, x, y, G.PIECE_SIZE / 2);
        if (player === 1) {
            grad.addColorStop(0, '#555');
            grad.addColorStop(1, '#000');
        } else {
            grad.addColorStop(0, '#fff');
            grad.addColorStop(1, '#ddd');
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
        G.onlineCtx.fillStyle = '#E6C8A0';
        G.onlineCtx.fillRect(0, 0, G.onlineCanvas.width, G.onlineCanvas.height);
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
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(pos) {
            G.onlineCtx.beginPath();
            G.onlineCtx.arc(pos[0] * cellSize + margin, pos[1] * cellSize + margin, 6, 0, 2 * Math.PI);
            G.onlineCtx.fillStyle = G.boardDotColor;
            G.onlineCtx.fill();
        });
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
        G.onlineCtx.beginPath();
        G.onlineCtx.arc(x, y, pieceSize / 2 + 2, 0, 2 * Math.PI);
        G.onlineCtx.fillStyle = 'rgba(0,0,0,0.2)';
        G.onlineCtx.fill();
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
        ctx.fillStyle = '#E6C8A0';
        ctx.fillRect(0, 0, boardWidth, boardHeight);
        ctx.strokeStyle = G.boardLineColor;
        ctx.lineWidth = 2;
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
        var dotSize = Math.max(2, cellSize * 0.08);
        [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].forEach(function(p) {
            ctx.beginPath();
            ctx.arc(p[0] * cellSize + margin, p[1] * cellSize + margin, dotSize, 0, Math.PI * 2);
            ctx.fillStyle = G.boardDotColor;
            ctx.fill();
        });
        if (!G.monitorBoard || !G.monitorBoard.length) return;
        for (var row = 0; row < G.BOARD_SIZE; row++) {
            if (!G.monitorBoard[row]) continue;
            for (var col = 0; col < G.BOARD_SIZE; col++) {
                if (G.monitorBoard[row][col] !== 0) {
                    var x = col * cellSize + margin;
                    var y = row * cellSize + margin;
                    ctx.beginPath();
                    ctx.arc(x + 1, y + 1, pieceRadius, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.fill();
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
})();
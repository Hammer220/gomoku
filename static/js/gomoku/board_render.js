// ============================================================
// 棋盘渲染模块
// 负责：棋盘初始化、Canvas 尺寸计算、本地/联机/监控棋盘绘制、
//       棋子绘制、容器尺寸监听、悬停预览、最后一手标记
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 悬停预览状态
    G.hoverRow = -1;
    G.hoverCol = -1;
    G.hoverEnabled = true;

    // 联机悬停预览状态
    G.onlineHoverRow = -1;
    G.onlineHoverCol = -1;
    G.onlineHoverEnabled = true;

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

    // 获取最后一手的位置
    G.getLastMove = function() {
        if (G.moveHistory && G.moveHistory.length > 0) {
            return G.moveHistory[G.moveHistory.length - 1];
        }
        return null;
    };

    // 获取联机最后一手的位置
    G.getOnlineLastMove = function() {
        if (G.onlineMoveHistory && G.onlineMoveHistory.length > 0) {
            return G.onlineMoveHistory[G.onlineMoveHistory.length - 1];
        }
        return null;
    };

    // 绘制本地游戏棋盘（网格线 + 星位点 + 棋子 + 悬停预览 + 最后一手标记）
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
        if (!G.selectedBackground || G.selectedBackground === 'none') {
            G.ctx.fillStyle = '#E6C8A0';
            G.ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);
        }
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
        var lastMove = G.getLastMove();
        for (var r = 0; r < G.BOARD_SIZE; r++) {
            for (var c = 0; c < G.BOARD_SIZE; c++) {
                if (G.gameBoard[r][c] !== 0) {
                    var moveNum = G.getMoveNumber(r, c);
                    var isLast = lastMove && lastMove.row === r && lastMove.col === c;
                    G.drawPiece(r, c, G.gameBoard[r][c], G.winningCells.some(function(p) { return p.row === r && p.col === c; }), moveNum, isLast);
                }
            }
        }
        G.drawWinningLine();
        if (G.hoverEnabled && G.hoverRow >= 0 && G.hoverCol >= 0 && G.gameBoard[G.hoverRow] && G.gameBoard[G.hoverRow][G.hoverCol] === 0) {
            G.drawHoverPreview(G.hoverRow, G.hoverCol, G.currentPlayer);
        }
        if (G.shouldCheckForbidden() && G.currentPlayer === 1 && G.gameActive) {
            var forbiddenPositions = G.findForbiddenPositions(G.gameBoard);
            G.drawForbiddenMarks(G.ctx, forbiddenPositions, cellSize, pieceSize, margin);
        }
    };

    G.drawWinningLine = function() {
        if (G.gameActive) return;
        if (!G.winningCells || G.winningCells.length < 5) return;
        var cells = G.winningCells.slice();
        cells.sort(function(a, b) {
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });
        var margin = G.PIECE_SIZE / 2 + 4;
        var cellSize = G.CELL_SIZE || 30;
        var first = cells[0];
        var last = cells[cells.length - 1];
        var x1 = first.col * cellSize + margin;
        var y1 = first.row * cellSize + margin;
        var x2 = last.col * cellSize + margin;
        var y2 = last.row * cellSize + margin;
        G.ctx.save();
        G.ctx.strokeStyle = '#FF0000';
        G.ctx.lineWidth = 4;
        G.ctx.lineCap = 'round';
        G.ctx.shadowColor = '#FF0000';
        G.ctx.shadowBlur = 8;
        G.ctx.beginPath();
        G.ctx.moveTo(x1, y1);
        G.ctx.lineTo(x2, y2);
        G.ctx.stroke();
        G.ctx.restore();
    };

    // 获取指定位置的手数
    G.getMoveNumber = function(row, col) {
        if (!G.moveHistory) return 0;
        for (var i = 0; i < G.moveHistory.length; i++) {
            if (G.moveHistory[i].row === row && G.moveHistory[i].col === col) {
                return i + 1;
            }
        }
        return 0;
    };

    // 获取联机指定位置的手数
    G.getOnlineMoveNumber = function(row, col) {
        if (!G.onlineMoveHistory) return 0;
        for (var i = 0; i < G.onlineMoveHistory.length; i++) {
            if (G.onlineMoveHistory[i].row === row && G.onlineMoveHistory[i].col === col) {
                return i + 1;
            }
        }
        return 0;
    };

    // 绘制禁手标记（小叉 ×）
    G.drawForbiddenMarks = function(ctx, positions, cellSize, pieceSize, margin) {
        if (!positions || positions.length === 0) return;
        var crossSize = Math.max(4, pieceSize * 0.3);
        ctx.save();
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = Math.max(1.5, cellSize * 0.06);
        ctx.lineCap = 'round';
        for (var i = 0; i < positions.length; i++) {
            var x = positions[i].col * cellSize + margin;
            var y = positions[i].row * cellSize + margin;
            ctx.beginPath();
            ctx.moveTo(x - crossSize, y - crossSize);
            ctx.lineTo(x + crossSize, y + crossSize);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + crossSize, y - crossSize);
            ctx.lineTo(x - crossSize, y + crossSize);
            ctx.stroke();
        }
        ctx.restore();
    };

    // 绘制悬停预览棋子
    G.drawHoverPreview = function(row, col, player) {
        var margin = G.PIECE_SIZE / 2 + 4;
        var x = col * G.CELL_SIZE + margin;
        var y = row * G.CELL_SIZE + margin;
        G.ctx.globalAlpha = 0.5;
        G.ctx.beginPath();
        G.ctx.arc(x, y, G.PIECE_SIZE / 2 + 2, 0, 2 * Math.PI);
        G.ctx.fillStyle = 'rgba(0,0,0,0.15)';
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
        G.ctx.globalAlpha = 1;
    };

    // 绘制单个棋子（带渐变和阴影效果，胜利棋子额外高亮，显示手数和最后一手标记）
    G.drawPiece = function(row, col, player, isWin, moveNum, isLast) {
        isWin = isWin || false;
        moveNum = moveNum || 0;
        isLast = isLast || false;
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
        if (isLast && !isWin) {
            G.ctx.save();
            G.ctx.beginPath();
            G.ctx.arc(x, y, G.PIECE_SIZE / 2 + 4, 0, 2 * Math.PI);
            G.ctx.strokeStyle = '#FF3366';
            G.ctx.lineWidth = 3;
            G.ctx.shadowColor = '#FF3366';
            G.ctx.shadowBlur = 10;
            G.ctx.stroke();
            G.ctx.restore();
            var dotColor = player === 1 ? '#FF6B6B' : '#FF3366';
            var dotRadius = Math.max(3, G.PIECE_SIZE / 6);
            G.ctx.beginPath();
            G.ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
            G.ctx.fillStyle = dotColor;
            G.ctx.fill();
            G.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            G.ctx.lineWidth = 0.5;
            G.ctx.stroke();
        }
        };

    // 绘制联机棋盘（网格线 + 星位点 + 棋子）
    G.drawOnlineBoard = function() {
        if (!G.onlineCtx || !G.onlineCanvas) return;
        if (!G.onlineBoard || !G.onlineBoard[0]) {
            if (G.initOnlineBoard) G.initOnlineBoard();
            else G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
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
        if (!G.selectedBackground || G.selectedBackground === 'none') {
            G.onlineCtx.fillStyle = '#E6C8A0';
            G.onlineCtx.fillRect(0, 0, G.onlineCanvas.width, G.onlineCanvas.height);
        }
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
        var onlineLastMove = G.getOnlineLastMove();
        for (var r = 0; r < G.BOARD_SIZE; r++) {
            for (var c = 0; c < G.BOARD_SIZE; c++) {
                if (G.onlineBoard[r][c] !== 0) {
                    var onlineMoveNum = G.getOnlineMoveNumber(r, c);
                    var isOnlineLast = onlineLastMove && onlineLastMove.row === r && onlineLastMove.col === c;
                    G.drawOnlinePiece(r, c, G.onlineBoard[r][c], cellSize, onlineMoveNum, isOnlineLast);
                }
            }
        }
        G.drawOnlineWinningLine(cellSize);
        if (G.onlineHoverEnabled && G.onlineHoverRow >= 0 && G.onlineHoverCol >= 0 && G.onlineBoard[G.onlineHoverRow] && G.onlineBoard[G.onlineHoverRow][G.onlineHoverCol] === 0) {
            G.drawOnlineHoverPreview(G.onlineHoverRow, G.onlineHoverCol, G.onlineCurrentPlayer, cellSize);
        }
        if (G.onlineGameActive && G.onlineCurrentPlayer === 1) {
            var onlineForbiddenPositions = G.findForbiddenPositions(G.onlineBoard);
            G.drawForbiddenMarks(G.onlineCtx, onlineForbiddenPositions, cellSize, pieceSize, margin);
        }
    };

    // 绘制联机悬停预览棋子
    G.drawOnlineHoverPreview = function(row, col, player, cellSize) {
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var x = col * cellSize + margin;
        var y = row * cellSize + margin;
        G.onlineCtx.globalAlpha = 0.5;
        G.onlineCtx.beginPath();
        G.onlineCtx.arc(x, y, pieceSize / 2 + 2, 0, 2 * Math.PI);
        G.onlineCtx.fillStyle = 'rgba(0,0,0,0.15)';
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
        G.onlineCtx.globalAlpha = 1;
    };

    G.drawOnlineWinningLine = function(cellSize) {
        if (G.onlineGameActive) return;
        if (!G.winningCells || G.winningCells.length < 5) return;
        var cells = G.winningCells.slice();
        cells.sort(function(a, b) {
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var first = cells[0];
        var last = cells[cells.length - 1];
        var x1 = first.col * cellSize + margin;
        var y1 = first.row * cellSize + margin;
        var x2 = last.col * cellSize + margin;
        var y2 = last.row * cellSize + margin;
        G.onlineCtx.save();
        G.onlineCtx.strokeStyle = '#FF0000';
        G.onlineCtx.lineWidth = 4;
        G.onlineCtx.lineCap = 'round';
        G.onlineCtx.shadowColor = '#FF0000';
        G.onlineCtx.shadowBlur = 8;
        G.onlineCtx.beginPath();
        G.onlineCtx.moveTo(x1, y1);
        G.onlineCtx.lineTo(x2, y2);
        G.onlineCtx.stroke();
        G.onlineCtx.restore();
    };

    // 绘制联机棋盘上的单个棋子（带手数和最后一手标记）
    G.drawOnlinePiece = function(row, col, player, cellSize, moveNum, isLast) {
        var pieceSize = cellSize * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var x = col * cellSize + margin;
        var y = row * cellSize + margin;
        moveNum = moveNum || 0;
        isLast = isLast || false;
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
        if (isLast) {
            G.onlineCtx.save();
            G.onlineCtx.beginPath();
            G.onlineCtx.arc(x, y, pieceSize / 2 + 4, 0, 2 * Math.PI);
            G.onlineCtx.strokeStyle = '#FF3366';
            G.onlineCtx.lineWidth = 3;
            G.onlineCtx.shadowColor = '#FF3366';
            G.onlineCtx.shadowBlur = 10;
            G.onlineCtx.stroke();
            G.onlineCtx.restore();
            var dotColor = player === 1 ? '#FF6B6B' : '#FF3366';
            var dotRadius = Math.max(3, pieceSize / 6);
            G.onlineCtx.beginPath();
            G.onlineCtx.arc(x, y, dotRadius, 0, 2 * Math.PI);
            G.onlineCtx.fillStyle = dotColor;
            G.onlineCtx.fill();
            G.onlineCtx.strokeStyle = 'rgba(255,255,255,0.6)';
            G.onlineCtx.lineWidth = 0.5;
            G.onlineCtx.stroke();
        }
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
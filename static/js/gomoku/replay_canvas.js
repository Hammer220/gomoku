// ============================================================
// 复盘功能 - Canvas 初始化与绘制
// 负责：复盘 Canvas 初始化、复盘棋盘绘制（网格线+星位+棋子+连线高亮）、
//       棋盘状态获取、连线查找
// ============================================================
(function() {
    var G = window.Gomoku;

    // 初始化复盘 Canvas（根据容器大小动态计算画布尺寸，适配不同屏幕）
    G.initReplayCanvas = function() {
        const canvas = document.getElementById('replayCanvas');
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size <= 0) return;
        const boardSize = G.replayRecord.boardSize || 15;
        const cellSize = Math.max(15, size / (boardSize - 1));
        const pieceSize = cellSize * 0.8;
        const margin = pieceSize / 2 + 4;
        const boardWidth = cellSize * (boardSize - 1) + margin * 2;
        const boardHeight = cellSize * (boardSize - 1) + margin * 2;
        canvas.width = boardWidth;
        canvas.height = boardHeight;
    }

    // 绘制复盘棋盘（网格线 + 棋子 + 当前步标记 + 连线高亮）
    G.drawReplayBoard = function() {
        const canvas = document.getElementById('replayCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        const boardSize = G.replayRecord ? (G.replayRecord.boardSize || 15) : 15;
        let cellSize, pieceSize, margin, boardWidth, boardHeight;
        if (container) {
            const rect = container.getBoundingClientRect();
            const size = Math.min(rect.width, rect.height);
            cellSize = size > 0 ? Math.max(15, size / (boardSize - 1)) : 30;
        } else {
            cellSize = 30;
        }
        pieceSize = cellSize * 0.8;
        margin = pieceSize / 2 + 4;
        boardWidth = cellSize * (boardSize - 1) + margin * 2;
        boardHeight = cellSize * (boardSize - 1) + margin * 2;

        if (canvas.width !== boardWidth || canvas.height !== boardHeight) {
            canvas.width = boardWidth;
            canvas.height = boardHeight;
        }

        ctx.clearRect(0, 0, boardWidth, boardHeight);

        ctx.fillStyle = '#E6C8A0';
        ctx.fillRect(0, 0, boardWidth, boardHeight);

        var boardLineColor = getComputedStyle(document.documentElement).getPropertyValue('--board-line-color') || '#8B5A2B';
        ctx.strokeStyle = boardLineColor;
        ctx.lineWidth = 2;
        for (let i = 0; i < boardSize; i++) {
            ctx.beginPath();
            ctx.moveTo(margin, i * cellSize + margin);
            ctx.lineTo(boardWidth - margin, i * cellSize + margin);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(i * cellSize + margin, margin);
            ctx.lineTo(i * cellSize + margin, boardHeight - margin);
            ctx.stroke();
        }

        var starPoints;
        if (boardSize === 15) {
            starPoints = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        } else if (boardSize === 19) {
            starPoints = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
        } else {
            var center = Math.floor(boardSize / 2);
            starPoints = [[3, 3], [3, center], [3, boardSize - 4], [center, 3], [center, center], [center, boardSize - 4], [boardSize - 4, 3], [boardSize - 4, center], [boardSize - 4, boardSize - 4]];
        }
        starPoints.forEach(function(pos) {
            if (pos[0] < boardSize && pos[1] < boardSize) {
                ctx.beginPath();
                ctx.arc(pos[0] * cellSize + margin, pos[1] * cellSize + margin, 4, 0, 2 * Math.PI);
                ctx.fillStyle = boardLineColor;
                ctx.fill();
            }
        });

        const moves = G.replayRecord ? G.replayRecord.moves || [] : [];
        for (let i = 0; i < G.replayStep && i < moves.length; i++) {
            const m = moves[i];
            const x = m.col * cellSize + margin;
            const y = m.row * cellSize + margin;
            const r = pieceSize / 2;

            ctx.beginPath();
            ctx.arc(x, y, r + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            var grad = ctx.createRadialGradient(x - pieceSize / 6, y - pieceSize / 6, pieceSize / 10, x, y, r);
            if (m.player === 1) {
                grad.addColorStop(0, '#555');
                grad.addColorStop(1, '#000');
            } else {
                grad.addColorStop(0, '#fff');
                grad.addColorStop(1, '#ddd');
            }
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = m.player === 1 ? '#333' : '#ccc';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.closePath();

            if (i === G.replayStep - 1 && G.replayStep > 0) {
                ctx.beginPath();
                ctx.arc(x, y - 1, r * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ff6b6b';
                ctx.fill();
                ctx.closePath();
            }
        }

        if (G.replayLineIndex >= 0 && G.replayLines.length > 0 && G.replayLineIndex < G.replayLines.length) {
            const line = G.replayLines[G.replayLineIndex];
            if (line.cells.length >= 2) {
                const first = line.cells[0];
                const last = line.cells[line.cells.length - 1];
                const x1 = first.col * cellSize + margin;
                const y1 = first.row * cellSize + margin;
                const x2 = last.col * cellSize + margin;
                const y2 = last.row * cellSize + margin;

                const lineColor = line.count >= 5 ? '#FF4444' : '#FF8C00';
                const lineWidth = line.count >= 5 ? 5 : 4;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = lineColor + '40';
                ctx.lineWidth = lineWidth + 6;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                ctx.stroke();
                ctx.restore();

                [first, last].forEach(function(pt) {
                    ctx.beginPath();
                    ctx.arc(pt.col * cellSize + margin, pt.row * cellSize + margin, 5, 0, 2 * Math.PI);
                    ctx.fillStyle = lineColor;
                    ctx.fill();
                });
            }
        }
    }

    // 获取当前复盘步骤的棋盘状态
    G.getReplayBoardState = function() {
        const boardSize = G.replayRecord ? (G.replayRecord.boardSize || 15) : 15;
        const board = Array(boardSize).fill().map(function() { return Array(boardSize).fill(0); });
        const moves = G.replayRecord ? (G.replayRecord.moves || []) : [];
        for (let i = 0; i < G.replayStep && i < moves.length; i++) {
            const m = moves[i];
            board[m.row][m.col] = m.player;
        }
        return board;
    };

    // 查找当前复盘棋盘上所有4子及以上的连线
    G.findReplayLines = function() {
        const board = G.getReplayBoardState();
        const boardSize = board.length;
        const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        const lines = [];
        const visited = {};

        for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
                if (board[r][c] === 0) continue;
                const player = board[r][c];
                for (let d = 0; d < dirs.length; d++) {
                    const key = r + ',' + c + ',' + d;
                    if (visited[key]) continue;
                    visited[key] = true;

                    const dx = dirs[d][0], dy = dirs[d][1];
                    let count = 1;
                    const cells = [{ row: r, col: c }];

                    for (let i = 1; i < boardSize; i++) {
                        const nr = r + i * dy, nc = c + i * dx;
                        if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || board[nr][nc] !== player) break;
                        count++;
                        cells.push({ row: nr, col: nc });
                        visited[nr + ',' + nc + ',' + d] = true;
                    }
                    for (let i = 1; i < boardSize; i++) {
                        const nr = r - i * dy, nc = c - i * dx;
                        if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || board[nr][nc] !== player) break;
                        count++;
                        cells.unshift({ row: nr, col: nc });
                        visited[nr + ',' + nc + ',' + d] = true;
                    }

                    if (count >= 4) {
                        lines.push({ cells: cells, player: player, count: count });
                    }
                }
            }
        }
        return lines;
    };
})();
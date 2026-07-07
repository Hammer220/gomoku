// ============================================================
// 复盘功能模块
// 负责：对局复盘、棋谱查看、自动播放、连线高亮等功能
// ============================================================
(function() {
    var G = window.Gomoku;

    // ==================== 复盘功能 ====================

    // 开始复盘指定对局记录
    G.startReplay = async function(recordId) {
        try {
            const data = await G.apiCall('/api/records/' + recordId, 'GET');
            G.replayRecord = data.record;
            if (!G.replayRecord) {
                G.showToast('记录不存在', true);
                return;
            }
            if (!G.replayRecord.moveHistory || G.replayRecord.moveHistory.length === 0) {
                G.showToast('该记录没有棋谱数据', true);
                return;
            }
            G.replayStep = 0;
            G.stopReplayAuto();
            G.clearReplayLineHighlight();
            var modal = document.getElementById('replayModal');
            if (modal) modal.classList.remove('hidden');
            var speedSlider = document.getElementById('replaySpeedSlider');
            if (speedSlider) speedSlider.value = 5;
            G.replaySpeed = 500;
            var speedLabel = document.getElementById('replaySpeedLabel');
            if (speedLabel) speedLabel.textContent = '0.5s';
            // 先显示弹窗，等布局完成后再初始化 Canvas（确保容器有正确的尺寸）
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    G.initReplayCanvas();
                    G.drawReplayBoard();
                    G.updateReplayUI();
                    G.renderReplayMoveList();
                });
            });
        } catch (err) {
            G.showToast('加载复盘失败: ' + (err.message || err), true);
        }
    }

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

    // 绘制复盘棋盘（网格线 + 棋子 + 当前步标记）
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

        // 确保 canvas 尺寸与计算结果一致
        if (canvas.width !== boardWidth || canvas.height !== boardHeight) {
            canvas.width = boardWidth;
            canvas.height = boardHeight;
        }

        ctx.clearRect(0, 0, boardWidth, boardHeight);

        // 绘制棋盘底色
        ctx.fillStyle = '#E6C8A0';
        ctx.fillRect(0, 0, boardWidth, boardHeight);

        // 绘制网格线
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

        // 绘制星位点（天元和角星位）
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

        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        for (let i = 0; i < G.replayStep && i < moves.length; i++) {
            const m = moves[i];
            const x = m.col * cellSize + margin;
            const y = m.row * cellSize + margin;
            const r = pieceSize / 2;

            // 棋子阴影
            ctx.beginPath();
            ctx.arc(x, y, r + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();

            // 棋子本体（径向渐变）
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

            // 当前步标记
            if (i === G.replayStep - 1 && G.replayStep > 0) {
                ctx.beginPath();
                ctx.arc(x, y - 1, r * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ff6b6b';
                ctx.fill();
                ctx.closePath();
            }
        }

        // 绘制连线高亮（4子或5子连线）
        if (G.replayLineIndex >= 0 && G.replayLines.length > 0 && G.replayLineIndex < G.replayLines.length) {
            const line = G.replayLines[G.replayLineIndex];
            if (line.cells.length >= 2) {
                const first = line.cells[0];
                const last = line.cells[line.cells.length - 1];
                const x1 = first.col * cellSize + margin;
                const y1 = first.row * cellSize + margin;
                const x2 = last.col * cellSize + margin;
                const y2 = last.row * cellSize + margin;

                // 连线颜色：4子用橙色，5子及以上用红色
                const lineColor = line.count >= 5 ? '#FF4444' : '#FF8C00';
                const lineWidth = line.count >= 5 ? 5 : 4;

                // 绘制连线（半透明底层 + 实线顶层）
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

                // 连线两端加圆形标记
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
        const moves = G.replayRecord ? (G.replayRecord.moveHistory || []) : [];
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

                    // 正方向扫描
                    for (let i = 1; i < boardSize; i++) {
                        const nr = r + i * dy, nc = c + i * dx;
                        if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize || board[nr][nc] !== player) break;
                        count++;
                        cells.push({ row: nr, col: nc });
                        visited[nr + ',' + nc + ',' + d] = true;
                    }
                    // 反方向扫描
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

    // 切换连线显示（点击一次显示，再次点击隐藏）
    G.showNextReplayLine = function() {
        // 如果当前已经显示了连线，则隐藏
        if (G.replayLineIndex >= 0 && G.replayLines.length > 0) {
            G.replayLineIndex = -1;
            G.drawReplayBoard();
            G.updateReplayLineUI();
            return;
        }
        // 否则重新查找并显示第一条连线
        G.replayLines = G.findReplayLines();
        if (G.replayLines.length === 0) {
            G.replayLineIndex = -1;
            G.showToast('当前棋盘没有4子及以上连线');
            G.drawReplayBoard();
            G.updateReplayLineUI();
            return;
        }
        G.replayLineIndex = 0;
        G.drawReplayBoard();
        G.updateReplayLineUI();
    };

    // 清除连线高亮
    G.clearReplayLineHighlight = function() {
        G.replayLines = [];
        G.replayLineIndex = -1;
        G.updateReplayLineUI();
    };

    // 更新连线按钮 UI
    G.updateReplayLineUI = function() {
        var lineBtn = document.getElementById('replayLineBtn');
        var lineInfo = document.getElementById('replayLineInfo');
        if (!lineBtn) return;

        if (G.replayLineIndex >= 0 && G.replayLines.length > 0 && G.replayLineIndex < G.replayLines.length) {
            const line = G.replayLines[G.replayLineIndex];
            const label = line.count >= 5 ? '五连' : '四连';
            const color = line.player === 1 ? '黑棋' : '白棋';
            if (lineInfo) lineInfo.textContent = color + ' ' + label + ' (' + line.count + '子)';
            lineBtn.innerHTML = '<i class="fa-solid fa-eye-slash mr-1"></i>隐藏连线';
            lineBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            lineBtn.classList.add('bg-red-500', 'hover:bg-red-600');
        } else {
            if (lineInfo) lineInfo.textContent = '';
            lineBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i>显示连线';
            lineBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
            lineBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
        }
    };

    // 更新复盘 UI（步数信息、按钮状态、对局信息）
    G.updateReplayUI = function() {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        var stepInfo = document.getElementById('replayStepInfo');
        var prevBtn = document.getElementById('replayPrevBtn');
        var nextBtn = document.getElementById('replayNextBtn');
        if (stepInfo) stepInfo.textContent = '第 ' + G.replayStep + '/' + moves.length + ' 步';
        if (prevBtn) prevBtn.disabled = G.replayStep <= 0;
        if (nextBtn) nextBtn.disabled = G.replayStep >= moves.length;

        const info = document.getElementById('replayInfo');
        if (info && G.replayRecord) {
            const modeLabel = G.replayRecord.modeLabel || G.replayRecord.mode || '未知';
            const result = G.replayRecord.result || '未知';
            const player = G.replayRecord.player || '未知';
            const opponent = G.replayRecord.opponent || '未知';
            info.innerHTML = '<span class="font-medium">' + G.escapeHtml(player) + '</span> vs <span class="font-medium">' + G.escapeHtml(opponent) + '</span> · ' + modeLabel + ' · <span class="font-medium">' + result + '</span>';
        }
        G.scrollReplayMoveList();
    }

    // 渲染复盘走法列表（显示每一步的棋子颜色和坐标）
    G.renderReplayMoveList = function() {
        const container = document.getElementById('replayMoveList');
        if (!container) return;
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        if (moves.length === 0) {
            container.innerHTML = '<div class="text-gray-400 text-center py-4">无棋谱数据</div>';
            return;
        }
        const colLabel = function(col) { return String.fromCharCode(65 + col); };
        let html = '';
        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            const color = m.player === 1 ? '⚫' : '⚪';
            const coord = colLabel(m.col) + (m.row + 1);
            const active = i === G.replayStep - 1 ? ' replay-step-active' : '';
            const past = i < G.replayStep ? ' opacity-100' : ' opacity-40';
            html += '<div class="replay-move-item flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-200' + active + past + '" data-step="' + i + '">';
            html += '<span class="text-xs text-gray-400 w-6 text-right">' + (i + 1) + '.</span>';
            html += '<span class="text-sm">' + color + '</span>';
            html += '<span class="text-xs font-mono">' + coord + '</span>';
            html += '</div>';
        }
        container.innerHTML = html;

        container.addEventListener('click', function(e) {
            const item = e.target.closest('.replay-move-item');
            if (item) {
                const step = parseInt(item.getAttribute('data-step'));
                G.goToStep(step + 1);
            }
        });
    }

    // 滚动复盘走法列表到当前步并高亮
    G.scrollReplayMoveList = function() {
        const container = document.getElementById('replayMoveList');
        if (!container) return;
        const items = container.querySelectorAll('.replay-move-item');
        items.forEach(function(item, i) {
            if (i === G.replayStep - 1) {
                item.classList.add('replay-step-active');
                item.classList.remove('opacity-40');
                item.classList.add('opacity-100');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (i < G.replayStep) {
                item.classList.remove('replay-step-active');
                item.classList.remove('opacity-40');
                item.classList.add('opacity-100');
            } else {
                item.classList.remove('replay-step-active');
                item.classList.add('opacity-40');
                item.classList.remove('opacity-100');
            }
        });
    }

    // 跳转到复盘指定步数
    G.goToStep = function(step) {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        step = Math.max(0, Math.min(step, moves.length));
        G.replayStep = step;
        G.clearReplayLineHighlight();
        G.drawReplayBoard();
        G.updateReplayUI();
    }

    // 复盘下一步
    G.replayNext = function() {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        if (G.replayStep < moves.length) {
            G.replayStep++;
            G.clearReplayLineHighlight();
            G.drawReplayBoard();
            G.updateReplayUI();
        }
    }

    // 复盘上一步
    G.replayPrev = function() {
        if (G.replayStep > 0) {
            G.replayStep--;
            G.clearReplayLineHighlight();
            G.drawReplayBoard();
            G.updateReplayUI();
        }
    }

    // 复盘重置（回到第一步）
    G.replayReset = function() {
        G.stopReplayAuto();
        G.replayStep = 0;
        G.clearReplayLineHighlight();
        G.drawReplayBoard();
        G.updateReplayUI();
    }

    // 复盘自动播放（点击开始/暂停切换）
    G.replayAutoPlay = function() {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        if (G.replayStep >= moves.length) {
            G.replayStep = 0;
            G.clearReplayLineHighlight();
            G.drawReplayBoard();
            G.updateReplayUI();
        }
        if (G.replayAutoTimer) {
            G.stopReplayAuto();
            return;
        }
        var autoBtn = document.getElementById('replayAutoBtn');
        if (autoBtn) autoBtn.innerHTML = '<i class="fa-solid fa-pause mr-1"></i>暂停';
        G.replayAutoTimer = setInterval(function() {
            if (G.replayStep >= moves.length) {
                G.stopReplayAuto();
                return;
            }
            G.replayStep++;
            G.clearReplayLineHighlight();
            G.drawReplayBoard();
            G.updateReplayUI();
        }, G.replaySpeed);
    }

    // 停止复盘自动播放
    G.stopReplayAuto = function() {
        if (G.replayAutoTimer) {
            clearInterval(G.replayAutoTimer);
            G.replayAutoTimer = null;
        }
        var autoBtn = document.getElementById('replayAutoBtn');
        if (autoBtn) autoBtn.innerHTML = '<i class="fa-solid fa-play mr-1"></i>自动播放';
    }

    // 关闭复盘弹窗
    G.closeReplayModal = function() {
        G.stopReplayAuto();
        var modal = document.getElementById('replayModal');
        if (modal) modal.classList.add('hidden');
        document.removeEventListener('keydown', G.replayKeyHandler);
        G.replayRecord = null;
        G.replayStep = 0;
        G.clearReplayLineHighlight();
    }

    // 复盘键盘快捷键处理（左右箭头）
    G.replayKeyHandler = function(e) {
        var modal = document.getElementById('replayModal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            G.replayPrev();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            G.replayNext();
        }
    }

    // ==================== 复盘事件绑定 ====================

    // 初始化复盘事件监听器
    G.initReplayEvents = function() {
        var $r = function(id) { return document.getElementById(id); };
        var closeBtn = $r('closeReplayBtn');
        var prevBtn = $r('replayPrevBtn');
        var nextBtn = $r('replayNextBtn');
        var resetBtn = $r('replayResetBtn');
        var autoBtn = $r('replayAutoBtn');
        var speedSlider = $r('replaySpeedSlider');
        var replayModal = $r('replayModal');
        var lineBtn = $r('replayLineBtn');
        if (closeBtn) closeBtn.addEventListener('click', G.closeReplayModal);
        if (prevBtn) prevBtn.addEventListener('click', G.replayPrev);
        if (nextBtn) nextBtn.addEventListener('click', G.replayNext);
        if (resetBtn) resetBtn.addEventListener('click', G.replayReset);
        if (autoBtn) autoBtn.addEventListener('click', G.replayAutoPlay);
        if (lineBtn) lineBtn.addEventListener('click', G.showNextReplayLine);
        if (speedSlider) speedSlider.addEventListener('input', function() {
            var val = parseInt(this.value);
            G.replaySpeed = val * 100;
            var speedLabel = $r('replaySpeedLabel');
            if (speedLabel) speedLabel.textContent = (val / 10).toFixed(1) + 's';
            if (G.replayAutoTimer) {
                G.stopReplayAuto();
                G.replayAutoPlay();
            }
        });
        if (replayModal) replayModal.addEventListener('click', function(e) {
            if (e.target === this) G.closeReplayModal();
        });
        document.addEventListener('keydown', G.replayKeyHandler);

        var historyTableBody = $r('historyTableBody');
        if (historyTableBody) historyTableBody.addEventListener('click', function(e) {
            var btn = e.target.closest('.replay-btn');
            if (btn) {
                G.startReplay(btn.getAttribute('data-id'));
            }
        });
    }

})();
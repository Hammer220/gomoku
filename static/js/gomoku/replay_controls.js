// ============================================================
// 复盘功能 - 控制与交互
// 负责：复盘启动/关闭、步进控制、自动播放、连线切换、
//       UI 更新、走法列表渲染、键盘快捷键、事件绑定
// ============================================================
(function() {
    var G = window.Gomoku;

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

    // 渲染复盘走法列表
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

    // 复盘重置
    G.replayReset = function() {
        G.stopReplayAuto();
        G.replayStep = 0;
        G.clearReplayLineHighlight();
        G.drawReplayBoard();
        G.updateReplayUI();
    }

    // 复盘自动播放
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

    // 切换连线显示
    G.showNextReplayLine = function() {
        if (G.replayLineIndex >= 0 && G.replayLines.length > 0) {
            G.replayLineIndex = -1;
            G.drawReplayBoard();
            G.updateReplayLineUI();
            return;
        }
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

    // 复盘键盘快捷键处理
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
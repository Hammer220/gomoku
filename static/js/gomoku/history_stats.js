// ============================================================
// 游戏历史记录与统计模块
// 负责：游戏历史记录、统计数据图表、游戏存档等功能
// ============================================================
(function() {
    var G = window.Gomoku;

    // ==================== 游戏历史记录 ====================

    // 加载游戏历史记录
    G.loadHistory = async function(){
        if (G.isGuest) {
            var tbody = document.getElementById('historyTableBody');
            var emptyDiv = document.getElementById('historyEmpty');
            var paginationDiv = document.getElementById('historyPagination');
            if (tbody) tbody.innerHTML = '';
            if (emptyDiv) {
                emptyDiv.classList.remove('hidden');
                emptyDiv.innerHTML = '<i class="fa-solid fa-info-circle mr-2"></i>访客模式无法查看游戏记录，请注册账号';
            }
            if (paginationDiv) paginationDiv.classList.add('hidden');
            return;
        }
        try {
            const data = await G.apiCall('/api/statistics');
            G.historyAllRecords = data.records || [];

            const isBuiltinUser = (username) => {
                if (!username) return true;
                if (username.startsWith('AI')) return true;
                if (username === '玩家对战') return true;
                return false;
            };

            const userFilterEl = document.getElementById('historyUserFilter');
            if (userFilterEl) {
                const usernames = new Set();
                G.historyAllRecords.forEach(r => {
                    if (r.player1 && !isBuiltinUser(r.player1)) usernames.add(r.player1);
                    if (r.player2 && !isBuiltinUser(r.player2)) usernames.add(r.player2);
                });
                const sortedUsernames = Array.from(usernames).sort();
                userFilterEl.innerHTML = '<option value="self">自己</option><option value="all">所有人</option>';
                sortedUsernames.forEach(u => {
                    if (u !== G.currentUser.username) {
                        userFilterEl.innerHTML += `<option value="${G.escapeHtml(u)}">${G.escapeHtml(u)}</option>`;
                    }
                });
            }

            G.renderHistory();
        } catch(e) {
            console.error('加载游戏记录失败', e);
        }
    }

    // 渲染历史记录列表（支持筛选和分页）
    G.renderHistory = function(){
        const modeFilter = document.getElementById('historyModeFilter').value;
        const resultFilter = document.getElementById('historyResultFilter').value;
        const userFilter = document.getElementById('historyUserFilter') ? document.getElementById('historyUserFilter').value : 'self';
        let filtered = G.historyAllRecords;

        if (userFilter === 'self') {
            filtered = filtered.filter(r => r.player1 === G.currentUser.username || r.player2 === G.currentUser.username);
        } else if (userFilter !== 'all') {
            filtered = filtered.filter(r => r.player1 === userFilter || r.player2 === userFilter);
        }

        if (modeFilter !== 'all') {
            filtered = filtered.filter(r => r.mode === modeFilter);
        }
        if (resultFilter !== 'all') {
            filtered = filtered.filter(r => {
                var winner = r.winner || '';
                var isWin = winner === G.currentUser.username;
                var isLose = winner && winner !== G.currentUser.username && (r.player1 === G.currentUser.username || r.player2 === G.currentUser.username);
                var isDraw = !winner;
                if (resultFilter === 'win') return isWin;
                if (resultFilter === 'lose') return isLose;
                if (resultFilter === 'draw') return isDraw;
                return false;
            });
        }
        const totalPages = Math.max(1, Math.ceil(filtered.length / G.historyPageSize));
        if (G.historyCurrentPage > totalPages) G.historyCurrentPage = totalPages;
        const start = (G.historyCurrentPage - 1) * G.historyPageSize;
        const end = start + G.historyPageSize;
        const pageRecords = filtered.slice(start, end);

        const tbody = document.getElementById('historyTableBody');
        const emptyDiv = document.getElementById('historyEmpty');
        const paginationDiv = document.getElementById('historyPagination');

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyDiv.classList.remove('hidden');
            paginationDiv.classList.add('hidden');
            return;
        }
        emptyDiv.classList.add('hidden');
        if (totalPages > 1) {
            paginationDiv.classList.remove('hidden');
            document.getElementById('historyPageInfo').textContent = `第 ${G.historyCurrentPage}/${totalPages} 页 (共 ${filtered.length} 条)`;
            document.getElementById('historyPrevPage').disabled = G.historyCurrentPage <= 1;
            document.getElementById('historyNextPage').disabled = G.historyCurrentPage >= totalPages;
        } else {
            paginationDiv.classList.add('hidden');
        }

        tbody.innerHTML = pageRecords.map(r => {
            const modeLabel = r.mode || '未知';
            var winner = r.winner || '';
            var isWin = winner === G.currentUser.username;
            var isLose = winner && winner !== G.currentUser.username;
            var resultLabel = winner ? (isWin ? '胜利' : '失败') : '平局';
            const resultClass = isWin ? 'text-green-600' : (isLose ? 'text-red-600' : 'text-yellow-600');
            const opponent = (r.player1 === G.currentUser.username) ? (r.player2 || '-') : (r.player1 || '-');
            const timeStr = r.endTime || r.startTime;
            const dateStr = timeStr ? new Date(timeStr * 1000).toLocaleDateString() : '-';
            var scoreChange = '0';
            var scoreClass = 'text-gray-500';
            if (r.mode === 'ai') {
                const scoreConfig = { easy: { win: '+10', lose: '-50' }, medium: { win: '+50', lose: '-25' }, hard: { win: '+100', lose: '-5' }, master: { win: '+500', lose: '-5' } };
                const diff = (r.aiDifficulty || 'medium');
                const diffConfig = scoreConfig[diff] || scoreConfig.medium;
                scoreChange = isWin ? diffConfig.win : (isLose ? diffConfig.lose : '0');
            } else if (r.mode === 'online') {
                scoreChange = isWin ? '+30' : (isLose ? '-30' : '0');
            }
            scoreClass = isWin ? 'text-green-600' : (isLose ? 'text-red-600' : 'text-gray-500');
            const hasMoves = r.moves && r.moves.length > 0;
            return `<tr class="border-b hover:bg-gray-50">
                <td class="border px-4 py-2.5 text-sm">${dateStr}</td>
                <td class="border px-4 py-2.5 text-sm">${modeLabel}</td>
                <td class="border px-4 py-2.5 text-sm">${opponent}</td>
                <td class="border px-4 py-2.5 text-sm font-medium ${resultClass}">${resultLabel}</td>
                <td class="border px-4 py-2.5 text-sm font-medium ${scoreClass}">${scoreChange}</td>
                <td class="border px-4 py-2.5 text-sm">${hasMoves ? `<button class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs replay-btn" data-id="${r.id}"><i class="fa-solid fa-play mr-1"></i>复盘</button>` : '<span class="text-gray-400 text-xs">无棋谱</span>'}</td>
            </tr>`;
        }).join('');
    }

    // ==================== 统计数据 ====================

    // 统计数据图表实例引用
    G._statPieChart = null;
    G._statModeChart = null;

    // 加载统计数据
    G.loadStats = async function(){
        if (G.isGuest) {
            document.getElementById('statTotalGames').textContent = '-';
            document.getElementById('statWins').textContent = '-';
            document.getElementById('statLosses').textContent = '-';
            document.getElementById('statDraws').textContent = '-';
            document.getElementById('statWinRate').textContent = '-';
            G.showToast('访客模式无法查看统计数据，请注册账号', true);
            return;
        }
        try {
            const data = await G.apiCall('/api/statistics');
            document.getElementById('statTotalGames').textContent = data.total;
            document.getElementById('statWins').textContent = data.wins;
            document.getElementById('statLosses').textContent = data.losses;
            document.getElementById('statDraws').textContent = data.draws;
            document.getElementById('statWinRate').textContent = data.winRate + '%';
            G.renderStatCharts(data);
        } catch(e) {
            console.error('加载统计数据失败', e);
        }
    }

    // 渲染统计图表
    G.renderStatCharts = function(data) {
        if (typeof Chart === 'undefined') return;

        // 销毁旧图表
        if (G._statPieChart) { G._statPieChart.destroy(); G._statPieChart = null; }
        if (G._statModeChart) { G._statModeChart.destroy(); G._statModeChart = null; }

        // 饼图/环形图：胜负分布
        var pieCtx = document.getElementById('statPieChart');
        if (pieCtx) {
            G._statPieChart = new Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: ['胜利', '失败', '平局'],
                    datasets: [{
                        data: [data.wins, data.losses, data.draws],
                        backgroundColor: ['#16a34a', '#dc2626', '#eab308'],
                        borderColor: ['#ffffff', '#ffffff', '#ffffff'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { padding: 20, usePointStyle: true, font: { size: 13 } }
                        }
                    }
                }
            });
        }

        // 柱状图：各模式统计
        var modeCtx = document.getElementById('statModeChart');
        if (modeCtx) {
            var records = data.records || [];
            var modeStats = { ai: { wins: 0, losses: 0, draws: 0, total: 0 }, pvp: { wins: 0, losses: 0, draws: 0, total: 0 }, online: { wins: 0, losses: 0, draws: 0, total: 0 } };
            records.forEach(function(r) {
                var mode = r.mode || 'ai';
                if (!modeStats[mode]) modeStats[mode] = { wins: 0, losses: 0, draws: 0, total: 0 };
                modeStats[mode].total++;
                var winner = r.winner || '';
                var isWin = winner === G.currentUser.username;
                var isLose = winner && winner !== G.currentUser.username;
                if (isWin) modeStats[mode].wins++;
                else if (isLose) modeStats[mode].losses++;
                else modeStats[mode].draws++;
            });
            var modeLabels = { ai: '人机对战', pvp: '双人对战', online: '联机对战' };
            var modes = ['ai', 'pvp', 'online'].filter(function(m) { return modeStats[m].total > 0; });
            if (modes.length === 0) modes = ['ai', 'pvp', 'online'];

            G._statModeChart = new Chart(modeCtx, {
                type: 'bar',
                data: {
                    labels: modes.map(function(m) { return modeLabels[m] || m; }),
                    datasets: [
                        {
                            label: '胜利',
                            data: modes.map(function(m) { return modeStats[m].wins; }),
                            backgroundColor: '#16a34a'
                        },
                        {
                            label: '失败',
                            data: modes.map(function(m) { return modeStats[m].losses; }),
                            backgroundColor: '#dc2626'
                        },
                        {
                            label: '平局',
                            data: modes.map(function(m) { return modeStats[m].draws; }),
                            backgroundColor: '#eab308'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { padding: 20, usePointStyle: true, font: { size: 13 } }
                        }
                    },
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }
    }

    // ==================== 游戏存档 ====================

    // 加载已保存的游戏存档列表
    G.loadSavedGames = async function(){
        const saves = await G.apiCall('/api/saves');
        const listDiv = document.getElementById('savedGamesList');
        listDiv.innerHTML = saves.length ? '' : '<p class="text-gray-500 text-center py-2">暂无存档</p>';
        saves.slice(0,5).forEach(s=>{
            const el = document.createElement('div');
            el.className = 'bg-white p-2 rounded border flex justify-between items-center saved-game-card cursor-pointer';
            el.innerHTML = `<div class="flex-1 min-w-0"><span class="font-medium truncate block">${s.name || s.date || '未命名'}</span><span class="text-xs text-gray-500">${s.difficulty} · ${G.formatTime(s.gameTime)}</span></div><div class="flex gap-1 ml-2"><button class="text-blue-500 export-save px-1" data-id="${s.id}" title="导出"><i class="fa-solid fa-download"></i></button><button class="text-red-500 delete-save px-1" data-id="${s.id}" title="删除"><i class="fa-solid fa-times"></i></button></div>`;
            el.addEventListener('click', (e)=>{ if(!e.target.closest('.delete-save') && !e.target.closest('.export-save')) G.loadGame(s.id); });
            el.querySelector('.delete-save').addEventListener('click', async (e)=>{ e.stopPropagation(); await G.apiCall(`/api/saves/${s.id}`,'DELETE'); G.loadSavedGames(); });
            el.querySelector('.export-save').addEventListener('click', async (e)=>{ e.stopPropagation(); G.exportSave(s.id); });
            listDiv.appendChild(el);
        });
    }

    // 导出存档到本地文件
    G.exportSave = async function(saveId) {
        try {
            const saves = await G.apiCall('/api/saves');
            const save = saves.find(function(s) { return s.id === saveId; });
            if (!save) {
                G.showToast('存档不存在', true);
                return;
            }
            const exportData = {
                version: 1,
                type: 'gomoku_save',
                username: save.username,
                name: save.name || save.date || '未命名',
                timestamp: save.timestamp || Math.floor(Date.now() / 1000),
                board: save.board,
                moves: save.moveHistory || save.moves || [],
                currentPlayer: save.currentPlayer,
                mode: save.difficulty || 'ai',
                timeMode: 'untimed',
                blackTime: 600,
                whiteTime: 600
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gomoku_save_${saveId}_${(save.name || '未命名').replace(/[\s\/]/g, '_')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            G.showToast('存档已导出');
        } catch(e) {
            G.showToast('导出失败', true);
        }
    }

})();
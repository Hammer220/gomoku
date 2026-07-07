// ============================================================
// 游戏历史记录与统计模块
// 负责：游戏历史记录、统计数据图表、游戏存档等功能
// ============================================================
(function() {
    var G = window.Gomoku;

    // ==================== 游戏历史记录 ====================

    // 加载游戏历史记录
    G.loadHistory = async function(){
        try {
            const data = await G.apiCall('/api/statistics');
            G.historyAllRecords = data.records || [];
            G.renderHistory();
        } catch(e) {
            console.error('加载游戏记录失败', e);
        }
    }

    // 渲染历史记录列表（支持筛选和分页）
    G.renderHistory = function(){
        const modeFilter = document.getElementById('historyModeFilter').value;
        const resultFilter = document.getElementById('historyResultFilter').value;
        let filtered = G.historyAllRecords;
        if (modeFilter !== 'all') {
            filtered = filtered.filter(r => r.mode === modeFilter);
        }
        if (resultFilter !== 'all') {
            filtered = filtered.filter(r => r.resultKey === resultFilter || 
                (resultFilter === 'win' && r.result === '胜利') ||
                (resultFilter === 'lose' && r.result === '失败') ||
                (resultFilter === 'draw' && r.result === '平局'));
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
            const modeLabel = r.modeLabel || r.mode || '未知';
            const resultLabel = r.result || '未知';
            const resultClass = resultLabel === '胜利' ? 'text-green-600' : (resultLabel === '失败' ? 'text-red-600' : 'text-yellow-600');
            const opponent = r.opponent || '-';
            const scoreConfig = { easy: { win: '+10', lose: '-50' }, medium: { win: '+50', lose: '-25' }, hard: { win: '+100', lose: '-5' } };
            const diff = (r.aiDifficulty || 'medium');
            const diffConfig = scoreConfig[diff] || scoreConfig.medium;
            const scoreChange = resultLabel === '胜利' ? diffConfig.win : (resultLabel === '失败' ? diffConfig.lose : '0');
            const scoreClass = resultLabel === '胜利' ? 'text-green-600' : (resultLabel === '失败' ? 'text-red-600' : 'text-gray-500');
            const hasMoves = r.moveHistory && r.moveHistory.length > 0;
            return `<tr class="border-b hover:bg-gray-50">
                <td class="border px-4 py-2.5 text-sm">${r.date || '-'}</td>
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
                if (r.result === 'win' || r.result === '胜利') modeStats[mode].wins++;
                else if (r.result === 'lose' || r.result === '失败') modeStats[mode].losses++;
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
            el.innerHTML = `<div><span class="font-medium">${s.date}</span><br><span class="text-xs">${s.difficulty} · ${G.formatTime(s.gameTime)}</span></div><button class="text-red-500 delete-save" data-id="${s.id}"><i class="fa-solid fa-times"></i></button>`;
            el.addEventListener('click', (e)=>{ if(!e.target.closest('.delete-save')) G.loadGame(s.id); });
            el.querySelector('.delete-save').addEventListener('click', async (e)=>{ e.stopPropagation(); await G.apiCall(`/api/saves/${s.id}`,'DELETE'); G.loadSavedGames(); });
            listDiv.appendChild(el);
        });
    }

})();
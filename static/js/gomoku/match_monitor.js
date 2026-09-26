// ============================================================
// 联机对局监控模块
// 负责：管理员监控联机对局、强制操作房间等功能
// ============================================================
(function() {
    var G = window.Gomoku;

    // ==================== 联机对局监控 ====================

    // ==================== 实时推送（WS 优先，轮询兜底） ====================

    var MONITOR_POLL_CONNECTED = 15000;
    var MONITOR_POLL_DISCONNECTED = 5000;
    var monitorListDebounce = null;

    // 绑定监控页的 WebSocket 事件（只需一次）
    G.initMonitorRealtime = function() {
        if (!G.WebSocketManager || G._monitorRealtimeBound) return;
        G._monitorRealtimeBound = true;

        // 房间创建/关闭/加入/离开 → 刷新列表
        G.WebSocketManager.on('match_list_changed', function() {
            clearTimeout(monitorListDebounce);
            monitorListDebounce = setTimeout(function() {
                if (document.getElementById('matchListContainer')) {
                    G.loadMatchList();
                }
            }, 300);
        });

        // 对局内有动作（落子等）→ 立即刷新正在监控的棋盘
        G.WebSocketManager.on('match_activity', function(data) {
            if (data && data.match_id && data.match_id === G.monitorMatchId) {
                G.updateMonitor();
            }
        });

        // 连接状态变化时调整轮询频率
        G.WebSocketManager.on('connected', function() {
            if (G.monitorInterval) G.startMonitor();
        });
        G.WebSocketManager.on('disconnected', function() {
            if (G.monitorInterval) G.startMonitor();
        });
    };

    // 加载联机对局列表（管理员监控用）
    G.loadMatchList = async function() {
        G.initMonitorRealtime();
        try {
            const res = await G.apiCall('/api/admin/matches', 'GET');
            const container = document.getElementById('matchListContainer');
            if (!container) return;

            if (res.matches.length === 0) {
                container.innerHTML = '<div class="text-gray-500 text-center py-4">暂无对局</div>';
                return;
            }

            const statusMap = {
                'waiting': '等待中',
                'playing': '进行中',
                'finished': '已结束',
                'closed': '已关闭'
            };
            const statusClass = {
                'waiting': 'text-amber-600',
                'playing': 'text-green-600',
                'finished': 'text-blue-600',
                'closed': 'text-red-600'
            };

            container.innerHTML = res.matches.map(m => `
                <div class="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 ${G.monitorMatchId === m.id ? 'ring-2 ring-primary' : ''}" data-match-id="${m.id}">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${m.id}</span>
                        <span class="text-sm ${statusClass[m.status]}">${statusMap[m.status]}</span>
                    </div>
                    <div class="text-sm text-gray-600">
                        <span>创建者: ${m.creator}</span>
                        ${m.opponent ? `<span class="ml-2">对手: ${m.opponent}</span>` : ''}
                    </div>
                    <div class="text-sm text-gray-500 mt-1">
                        <span>步数: ${m.moveCount}</span>
                        <span class="ml-2">当前: ${m.currentPlayer === 1 ? '黑棋' : '白棋'}</span>
                    </div>
                </div>
            `).join('');

            // 绑定点击事件
            container.querySelectorAll('[data-match-id]').forEach(el => {
                el.addEventListener('click', () => G.selectMatchToMonitor(el.dataset.matchId));
            });
        } catch (err) {
            G.showToast('加载对局列表失败: ' + err.message, true);
        }
    }

    // 选择对局进行监控
    G.selectMatchToMonitor = async function(matchId) {
        G.monitorMatchId = matchId;
        document.getElementById('monitorMatchId').textContent = matchId;
        document.getElementById('monitorControls').classList.remove('hidden');

        // 重新加载列表以更新选中状态
        await G.loadMatchList();

        // 开始监控
        G.startMonitor();

        // 强制重绘棋盘（延迟以确保DOM渲染完成）
        setTimeout(() => {
            G.drawMonitorBoard();
            setTimeout(() => G.drawMonitorBoard(), 100);
        }, 50);
    }

    // 启动对局监控（WS 活动事件即时刷新；另保留定时轮询兜底，断线时提高频率）
    G.startMonitor = async function() {
        G.initMonitorRealtime();
        G.stopMonitor();
        if (!G.monitorMatchId) return;

        await G.updateMonitor();
        var wsConnected = !!(G.WebSocketManager && G.WebSocketManager.isConnected());
        var interval = wsConnected ? MONITOR_POLL_CONNECTED : MONITOR_POLL_DISCONNECTED;
        G.monitorInterval = setInterval(G.updateMonitor, interval);
    }

    // 停止对局监控
    G.stopMonitor = function() {
        if (G.monitorInterval) {
            clearInterval(G.monitorInterval);
            G.monitorInterval = null;
        }
    }

    // 更新监控数据（获取最新棋盘和房间信息）
    G.updateMonitor = async function() {
        if (!G.monitorMatchId) return;
        try {
            const res = await G.apiCall(`/api/admin/match/${G.monitorMatchId}`, 'GET');
            G.monitorBoard = res.board;
            G.drawMonitorBoard();

            // 更新房间信息
            const statusMap = {
                'waiting': '等待中',
                'playing': '进行中',
                'finished': '已结束',
                'closed': '已关闭'
            };
            document.getElementById('monitorMatchId').textContent = `${G.monitorMatchId} - ${statusMap[res.status]}`;

            // 如果房间已关闭，停止监控并清空棋盘
            if (res.status === 'closed') {
                G.stopMonitor();
                G.showToast('房间已关闭', true);
                // 清空监控棋盘显示
                G.monitorBoard = [];
                G.drawMonitorBoard();
                document.getElementById('monitorControls').classList.add('hidden');
            }
        } catch (err) {
            console.error('监控更新失败:', err);
        }
    }

    // 强制关闭选中的对局房间
    G.forceCloseMatch = async function() {
        if (!G.monitorMatchId) return;
        try {
            G.stopMonitor();
            await G.apiCall('/api/admin/match/' + G.monitorMatchId + '/close', 'POST', {});
            G.showToast('房间已强制关闭');
            G.monitorMatchId = null;
            document.getElementById('monitorMatchId').textContent = '未选择房间';
            document.getElementById('monitorControls').classList.add('hidden');
            await G.loadMatchList();
        } catch (err) {
            G.showToast('强制关闭失败: ' + err.message, true);
            if (G.monitorMatchId) {
                G.startMonitor();
            }
        }
    }

    // 强制关闭所有联机房间
    G.forceCloseAllRooms = async function() {
        try {
            G.stopMonitor();
            const data = await G.apiCall('/api/admin/matches/close-all', 'POST', {});
            G.showToast(`已关闭 ${data.closed_count} 个房间`);
            G.monitorMatchId = null;
            document.getElementById('monitorMatchId').textContent = '未选择房间';
            document.getElementById('monitorControls').classList.add('hidden');
            await G.loadMatchList();
        } catch (err) {
            G.showToast('关闭所有房间失败: ' + err.message, true);
        }
    }

    // 强制重新开始选中的对局
    G.forceRestartMatch = async function() {
        if (!G.monitorMatchId) return;
        try {
            G.stopMonitor();
            await G.apiCall('/api/admin/match/' + G.monitorMatchId + '/restart', 'POST', {});
            G.showToast('对局已强制重新开始');
            await G.updateMonitor();
            G.startMonitor();
        } catch (err) {
            G.showToast('强制重新开始失败: ' + err.message, true);
            if (G.monitorMatchId) {
                G.startMonitor();
            }
        }
    }

    // 强制落子（管理员在监控棋盘上代为落子）
    G.forceMove = async function(row, col, player) {
        if (!G.monitorMatchId) return;
        try {
            G.stopMonitor();

            const res = await G.apiCall('/api/admin/match/' + G.monitorMatchId + '/force-move', 'POST', {
                matchId: G.monitorMatchId,
                row, col, player
            });

            if (res.win) {
                G.showToast(`强制落子成功，${player === 1 ? '黑棋' : '白棋'}获胜！`);
            } else {
                G.showToast('强制落子成功');
            }

            await G.updateMonitor();

            if (G.monitorMatchId) {
                G.startMonitor();
            }
        } catch (err) {
            G.showToast('强制落子失败: ' + err.message, true);
            if (G.monitorMatchId) {
                G.startMonitor();
            }
        }
    }

})();
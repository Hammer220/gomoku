// ============================================================
// 管理员功能模块
// 负责：联机对局监控、用户管理、排行榜、复盘、棋盘颜色设置、
//       背景图片管理等，被多个页面（admin、user、game）共用
// 注意：此文件包含管理功能和通用功能，非管理员页面也可能依赖
// ============================================================
(function() {
    var G = window.Gomoku;

    // ==================== 联机对局监控 ====================

    // 加载联机对局列表（管理员监控用）
    G.loadMatchList = async function() {
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
    
    // 启动对局监控（定时刷新棋盘数据）
    G.startMonitor = async function() {
        G.stopMonitor();
        if (!G.monitorMatchId) return;
        
        await G.updateMonitor();
        G.monitorInterval = setInterval(G.updateMonitor, 5000);
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
    
    // 新增：完整的联机状态清理函数

    // 以下函数已在 online.js 中定义，此处不再重复
    // clickOnlineMatch -> G.clickOnlineMatch
    // loadAvailableMatches -> G.loadOnlineAvailableMatches
    // joinMatchById -> G.onlineJoinMatch

    // 以下状态变量已在 core.js 中通过 G.* 全局命名空间定义，此处不再重复声明
    // G.heartbeatFailures, G.maxHeartbeatFailures
    // G.loginGeetestToken, G.registerGeetestToken
    // G.loginFormInteracted, G.registerFormInteracted
    // G.loginTurnstileToken, G.registerTurnstileToken
    // G.turnstileSiteKey
    // G.postLoginTurnstileToken, G.turnstileSDKLoaded
    // G.historyPageSize, G.historyCurrentPage, G.historyAllRecords
    // G.adminAllUsers, G.adminCurrentPage, G.adminPageSize, G.adminSearchFilter
    // G.searchTimer
    // G.replayRecord, G.replayStep, G.replayAutoTimer, G.replaySpeed

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
            const scoreChange = resultLabel === '胜利' ? '+50' : (resultLabel === '失败' ? '-20' : '0');
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

    // 加载统计数据
    G.loadStats = async function(){
        try {
            const data = await G.apiCall('/api/statistics');
            document.getElementById('statTotalGames').textContent = data.total;
            document.getElementById('statWins').textContent = data.wins;
            document.getElementById('statLosses').textContent = data.losses;
            document.getElementById('statDraws').textContent = data.draws;
            document.getElementById('statWinRate').textContent = data.winRate + '%';
        } catch(e) {
            console.error('加载统计数据失败', e);
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

    // ==================== 分页控件 ====================

    // 渲染管理员分页控件
    G.renderPagination = function(totalFiltered) {
        const pagination = document.getElementById('adminPagination');
        const totalPages = Math.max(1, Math.ceil(totalFiltered / G.adminPageSize));
        if (G.adminCurrentPage > totalPages) G.adminCurrentPage = totalPages;

        if (totalFiltered <= G.adminPageSize) {
            pagination.classList.add('hidden');
            return;
        }
        pagination.classList.remove('hidden');

        document.getElementById('paginationInfo').textContent =
            `共 ${totalFiltered} 条，第 ${G.adminCurrentPage}/${totalPages} 页`;

        document.getElementById('pagePrev').disabled = G.adminCurrentPage <= 1;
        document.getElementById('pageNext').disabled = G.adminCurrentPage >= totalPages;

        // 生成页码按钮
        const container = document.getElementById('pageNumbers');
        container.innerHTML = '';
        const maxVisible = 7;
        let startPage = Math.max(1, G.adminCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            container.appendChild(G.createPageBtn(1));
            if (startPage > 2) container.appendChild(G.createEllipsis());
        }
        for (let i = startPage; i <= endPage; i++) {
            container.appendChild(G.createPageBtn(i));
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) container.appendChild(G.createEllipsis());
            container.appendChild(G.createPageBtn(totalPages));
        }
    }

    // 创建页码按钮
    G.createPageBtn = function(page) {
        const btn = document.createElement('button');
        btn.textContent = page;
        btn.className = `px-3 py-1.5 text-sm border rounded-lg ${page === G.adminCurrentPage ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'}`;
        btn.addEventListener('click', () => {
            G.adminCurrentPage = page;
            G.loadAdminUsers();
        });
        return btn;
    }

    // 创建省略号元素
    G.createEllipsis = function() {
        const span = document.createElement('span');
        span.textContent = '…';
        span.className = 'px-2 text-gray-400';
        return span;
    }

    // 根据当前搜索过滤词筛选用户列表
    G.getFilteredUsers = function() {
        if (!G.adminSearchFilter) return G.adminAllUsers;
        return G.adminAllUsers.filter(u => u.username.toLowerCase().includes(G.adminSearchFilter));
    }

    // ==================== 批量操作工具函数 ====================

    // 获取所有选中的用户名列表
    G.getSelectedUsers = function() {
        var users = [];
        var checkboxes = document.querySelectorAll('.user-checkbox:checked');
        checkboxes.forEach(function(cb) { users.push(cb.value); });
        return users;
    };

    // 更新选中用户计数显示
    G.updateSelectedCount = function() {
        var count = G.getSelectedUsers().length;
        var el = document.getElementById('selectedCount');
        if (el) el.textContent = count;
        var batchBanBtn = document.getElementById('batchBanBtn');
        var batchUnbanBtn = document.getElementById('batchUnbanBtn');
        var batchKickBtn = document.getElementById('batchKickBtn');
        var batchDeleteBtn = document.getElementById('batchDeleteBtn');
        if (batchBanBtn) batchBanBtn.disabled = count === 0;
        if (batchUnbanBtn) batchUnbanBtn.disabled = count === 0;
        if (batchKickBtn) batchKickBtn.disabled = count === 0;
        if (batchDeleteBtn) batchDeleteBtn.disabled = count === 0;
    };

    // ==================== 用户管理 ====================

    // 加载管理员用户列表
    G.loadAdminUsers = async function(){
        // 重置全选复选框
        const selectAllCb = document.getElementById('selectAllUsers');
        if (selectAllCb) selectAllCb.checked = false;

        // 保存当前选中的用户
        const checkedUsers = new Set();
        document.querySelectorAll('.user-checkbox:checked').forEach(cb => {
            checkedUsers.add(cb.value);
        });

        // 获取搜索关键词
        const searchInput = document.getElementById('adminUserSearch');
        if (searchInput) G.adminSearchFilter = searchInput.value.trim().toLowerCase();

        // 首次加载或刷新时重新获取数据
        const data = await G.apiCall('/api/admin/users');
        G.adminAllUsers = data.users || [];

        const filteredUsers = G.getFilteredUsers();

        // 更新用户计数
        const countEl = document.getElementById('adminUserCount');
        if (countEl) {
            countEl.textContent = G.adminSearchFilter
                ? `共 ${G.adminAllUsers.length} 个用户，筛选出 ${filteredUsers.length} 个`
                : `共 ${G.adminAllUsers.length} 个用户`;
        }

        // 分页
        const totalPages = Math.max(1, Math.ceil(filteredUsers.length / G.adminPageSize));
        if (G.adminCurrentPage > totalPages) G.adminCurrentPage = totalPages;
        const startIdx = (G.adminCurrentPage - 1) * G.adminPageSize;
        const pageUsers = filteredUsers.slice(startIdx, startIdx + G.adminPageSize);

        const tbody = document.getElementById('adminUserTable');
        const isSuperAdmin = G.currentUser && G.currentUser.isSuperAdmin;

        tbody.innerHTML = pageUsers.map(u => {
            const isBanned = u.isBanned;
            const remainingMinutes = u.remainingMinutes;
            const isOnline = u.isOnline;
            const isTargetSuperAdmin = u.isSuperAdmin;
            const canOperate = !isTargetSuperAdmin && (isSuperAdmin || (G.currentUser && G.currentUser.canManage !== false)); // 是否可以操作
            
            // 恢复复选框选中状态
            const isChecked = checkedUsers.has(u.username) ? 'checked' : '';
            
            let roleTag = '';
            if (u.isSuperAdmin) {
                roleTag = '<span class="text-xs px-2 py-1 rounded bg-red-100 text-red-800">超级</span>';
            } else if (u.isAdmin) {
                const canManage = u.canManage !== false;
                roleTag = `<span class="text-xs px-2 py-1 rounded ${canManage ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${canManage ? '管理员' : '已禁用'}</span>`;
            }
            
            // 其他字段显示
            const scoreDisplay = canOperate || isSuperAdmin ? u.score : '<span class="text-gray-400">权限不足</span>';
            const winsDisplay = canOperate || isSuperAdmin ? u.wins : '<span class="text-gray-400">权限不足</span>';
            const gamesDisplay = canOperate || isSuperAdmin ? u.games : '<span class="text-gray-400">权限不足</span>';
            let bannedDisplay = '正常';
            if (canOperate || isSuperAdmin) {
                if (isBanned) {
                    bannedDisplay = `<span class="text-red-600">封禁中 (${remainingMinutes}分钟)</span>`;
                }
            } else {
                bannedDisplay = '<span class="text-gray-400">权限不足</span>';
            }
            
            const onlineDisplay = isOnline ? '<span class="text-green-600">在线</span>' : '<span class="text-gray-400">离线</span>';

            // 免密登录状态显示
            let passwordFreeDisplay = '';
            if (u.passwordFree === true) {
                const maxAttempts = u.passwordFreeMaxAttempts || 0;
                const remainingAttempts = u.passwordFreeRemainingAttempts !== undefined ? u.passwordFreeRemainingAttempts : '-';
                if (maxAttempts > 0) {
                    passwordFreeDisplay = `<span class="text-green-600">启用</span><br><span class="text-xs text-gray-500">剩余 ${remainingAttempts}/${maxAttempts} 次</span>`;
                } else {
                    passwordFreeDisplay = '<span class="text-green-600">启用</span><br><span class="text-xs text-gray-500">无次数限制</span>';
                }
            } else {
                passwordFreeDisplay = '<span class="text-gray-400">禁用</span>';
            }
            
            const checkboxDisabled = !canOperate && !isSuperAdmin ? 'disabled' : '';
            
            return `<tr class="admin-user-row cursor-pointer hover:bg-gray-50" data-username="${u.username}">
                <td class="border px-2 py-2"><input type="checkbox" class="user-checkbox w-4 h-4" value="${u.username}" ${checkboxDisabled} ${isChecked}></td>
                <td class="border px-4 py-2">${u.username} ${roleTag}</td>
                <td class="border px-4 py-2">${scoreDisplay}</td>
                <td class="border px-4 py-2">${winsDisplay}</td>
                <td class="border px-4 py-2">${gamesDisplay}</td>
                <td class="border px-4 py-2">${bannedDisplay}</td>
                <td class="border px-4 py-2">${onlineDisplay}</td>
                <td class="border px-2 py-2 text-center">${passwordFreeDisplay}</td>
            </tr>`;
        }).join('');
        
        // 点击表格行选择用户
        tbody.querySelectorAll('.admin-user-row').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.type === 'checkbox') return;
                G.selectAdminUser(this.dataset.username);
            });
        });
        
        // 更新分页控件
        G.renderPagination(filteredUsers.length);
        
        G.startBannedCountdown();
    }

    // 搜索输入防抖（使用 G.searchTimer 全局变量）
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'adminUserSearch') {
            clearTimeout(G.searchTimer);
            G.searchTimer = setTimeout(() => {
                G.adminCurrentPage = 1;
                G.loadAdminUsers();
            }, 300);
        }
    });

    // 每页条数切换
    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'pageSizeSelect') {
            G.adminPageSize = parseInt(e.target.value);
            G.adminCurrentPage = 1;
            G.loadAdminUsers();
        }
    });

    // 上一页 / 下一页
    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target.id === 'pagePrev' || target.closest('#pagePrev')) {
            if (G.adminCurrentPage > 1) {
                G.adminCurrentPage--;
                G.loadAdminUsers();
            }
        }
        if (target.id === 'pageNext' || target.closest('#pageNext')) {
            const filtered = G.getFilteredUsers();
            const totalPages = Math.max(1, Math.ceil(filtered.length / G.adminPageSize));
            if (G.adminCurrentPage < totalPages) {
                G.adminCurrentPage++;
                G.loadAdminUsers();
            }
        }
    });

    // 选择用户
    G.selectAdminUser = function(username) {
        document.getElementById('adminBanUsername').value = username;
        const user = G.adminAllUsers.find(u => u.username === username);
        const infoEl = document.getElementById('selectedUserInfo');
        const pfToggle = document.getElementById('adminPasswordFreeToggle');
        const pfAttempts = document.getElementById('adminPasswordFreeAttempts');
        const scoreBtn = document.getElementById('adminUpdateScoreBtn');
        
        if (!user) {
            infoEl.textContent = '';
            pfToggle.classList.add('hidden');
            pfAttempts.classList.add('hidden');
            return;
        }
        
        const isSuperAdmin = G.currentUser && G.currentUser.isSuperAdmin;
        const isTargetSuperAdmin = user.isSuperAdmin;
        const canOperate = !isTargetSuperAdmin && (isSuperAdmin || (G.currentUser && G.currentUser.canManage !== false));
        
        // 显示用户信息
        let info = `当前用户：${user.username}`;
        if (user.isSuperAdmin) info += ' | 超级管理员';
        else if (user.isAdmin) info += ' | 管理员';
        info += ` | 积分：${user.score} | 胜场：${user.wins} | 对局：${user.games}`;
        infoEl.textContent = info;
        
        // 改积分按钮（仅超级管理员）
        scoreBtn.classList.toggle('hidden', !isSuperAdmin);
        
        // 免密登录 toggle（仅超级管理员对非超级管理员）
        if (isSuperAdmin && !user.isSuperAdmin) {
            const pfEnabled = user.passwordFree === true;
            pfToggle.classList.remove('hidden');
            pfToggle.textContent = pfEnabled ? '禁用' : '启用';
            pfToggle.className = `px-3 py-1.5 text-sm border rounded-lg ${pfEnabled ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'}`;
            pfToggle.dataset.username = username;
            pfToggle.dataset.passwordfree = !pfEnabled;
            pfAttempts.classList.remove('hidden');
            pfAttempts.dataset.username = username;
        } else {
            pfToggle.classList.add('hidden');
            pfAttempts.classList.add('hidden');
        }
    }

    // 用户管理区按钮事件
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // 改密码
        if (target.id === 'adminChangePasswordBtn' || target.closest('#adminChangePasswordBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
            G.showChangePasswordModal(username);
        }
        
        // 改积分
        if (target.id === 'adminUpdateScoreBtn' || target.closest('#adminUpdateScoreBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
            G.showUpdateScoreModal(username);
        }
        
        // 免密登录 toggle
        if (target.id === 'adminPasswordFreeToggle') {
            const username = target.dataset.username;
            if (!username) return;
            const passwordFree = target.dataset.passwordfree === 'true';
            G.apiCall('/api/admin/set_password_free', 'POST', { username, passwordFree })
                .then(data => { G.showToast(data.message); G.loadAdminUsers(); })
                .catch(err => G.showToast('操作失败: ' + err.message, true));
        }
        
        // 设置免密登录次数
        if (target.id === 'adminPasswordFreeAttempts') {
            const username = target.dataset.username;
            if (!username) return;
            G.showPasswordFreeAttemptsModal(username);
        }
    });

    // 显示设置免密登录次数弹窗
    G.showPasswordFreeAttemptsModal = function(username) {
        const modalHtml = `
            <div id="passwordFreeAttemptsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">设置免密登录次数</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="pfAttemptsUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">最大免密登录次数</label>
                            <input type="number" id="pfMaxAttempts" min="0" value="0" class="w-full px-4 py-2 border rounded-lg">
                            <p class="text-xs text-gray-500 mt-1">设置为 0 表示无次数限制</p>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmPfAttemptsBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认设置</button>
                        <button id="cancelPfAttemptsBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('passwordFreeAttemptsModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('cancelPfAttemptsBtn').addEventListener('click', () => {
            document.getElementById('passwordFreeAttemptsModal').remove();
        });
        
        document.getElementById('confirmPfAttemptsBtn').addEventListener('click', async () => {
            const maxAttempts = parseInt(document.getElementById('pfMaxAttempts').value);
            if (isNaN(maxAttempts) || maxAttempts < 0) {
                G.showToast('次数必须为非负整数', true);
                return;
            }
            
            try {
                const data = await G.apiCall('/api/admin/set_password_free', 'POST', {
                    username: username,
                    passwordFree: true,
                    maxAttempts: maxAttempts
                });
                G.showToast(data.message);
                document.getElementById('passwordFreeAttemptsModal').remove();
                G.loadAdminUsers();
            } catch (error) {
                G.showToast('设置免密登录次数失败: ' + error.message, true);
            }
        });
    }
    
    // 显示修改积分弹窗
    G.showUpdateScoreModal = function(username) {
        const modalHtml = `
            <div id="updateScoreModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">修改用户积分</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="updateScoreUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">新积分</label>
                            <input type="number" id="updateScoreValue" min="0" value="0" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmUpdateScoreBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认修改</button>
                        <button id="cancelUpdateScoreBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('updateScoreModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('cancelUpdateScoreBtn').addEventListener('click', () => {
            document.getElementById('updateScoreModal').remove();
        });
        
        document.getElementById('confirmUpdateScoreBtn').addEventListener('click', async () => {
            const newScore = parseInt(document.getElementById('updateScoreValue').value);
            if (isNaN(newScore) || newScore < 0) {
                G.showToast('积分必须为非负整数', true);
                return;
            }
            
            try {
                const data = await G.apiCall('/api/admin/user/' + username + '/score', 'POST', { score: newScore });
                G.showToast(data.message);
                document.getElementById('updateScoreModal').remove();
                G.loadAdminUsers();
            } catch (error) {
                G.showToast('修改积分失败: ' + error.message, true);
            }
        });
    }
    
    // 显示修改密码弹窗
    G.showChangePasswordModal = function(username) {
        const modalHtml = `
            <div id="changePwdModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">修改用户密码</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="changePwdUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                            <input type="password" id="changePwdNew" placeholder="请输入新密码（至少6位）" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmChangePwdBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认修改</button>
                        <button id="cancelChangePwdBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的弹窗
        const existingModal = document.getElementById('changePwdModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 绑定事件
        document.getElementById('cancelChangePwdBtn').addEventListener('click', () => {
            document.getElementById('changePwdModal').remove();
        });
        
        document.getElementById('confirmChangePwdBtn').addEventListener('click', async () => {
            const newPwd = document.getElementById('changePwdNew').value;
            if (!newPwd || newPwd.length < 6) {
                G.showToast('新密码至少需要6个字符', true);
                return;
            }
            
            try {
                const data = await G.apiCall('/api/admin/change_password', 'POST', {
                    username: username,
                    new_password: newPwd
                });
                G.showToast('密码修改成功');
                document.getElementById('changePwdModal').remove();
                G.loadAdminUsers();
                G.loadAdminList();
            } catch (error) {
                G.showToast('修改密码失败: ' + error.message, true);
            }
        });
    }

    // ==================== 排行榜 ====================

    // 加载积分排行榜
    G.loadLeaderboard = async function() {
        try {
            const res = await G.apiCall('/api/leaderboard');
            const data = res.leaderboard || [];
            const tbody = document.getElementById('leaderboardTable');
            
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">暂无数据</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.map((u, index) => {
                const rank = index + 1;
                let rankDisplay = '';
                if (rank === 1) {
                    rankDisplay = '<span class="text-xl">🥇</span>';
                } else if (rank === 2) {
                    rankDisplay = '<span class="text-xl">🥈</span>';
                } else if (rank === 3) {
                    rankDisplay = '<span class="text-xl">🥉</span>';
                } else {
                    rankDisplay = `<span class="font-medium text-gray-600">${rank}</span>`;
                }
                
                const isCurrentUser = G.currentUser && G.currentUser.username === u.username;
                const rowClass = isCurrentUser ? 'bg-yellow-50 font-semibold' : '';
                
                return `<tr class="${rowClass}">
                    <td class="border px-4 py-3 text-center">${rankDisplay}</td>
                    <td class="border px-4 py-3">${u.username} ${isCurrentUser ? '<span class="text-xs text-primary">(我)</span>' : ''}</td>
                    <td class="border px-4 py-3 font-bold text-primary">${u.score}</td>
                    <td class="border px-4 py-3">${u.wins}</td>
                    <td class="border px-4 py-3">${u.games}</td>
                    <td class="border px-4 py-3 text-gray-500 text-sm">${u.joinDate || '-'}</td>
                </tr>`;
            }).join('');
        } catch (error) {
            document.getElementById('leaderboardTable').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">加载失败: ' + error.message + '</td></tr>';
        }
    }

    // 密码修改功能

    // ==================== 管理员账号管理 ====================

    // 创建管理员账号
    G.createAdminAccount = async function() {
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value;
        
        if (!username || !password) {
            G.showToast('用户名和密码不能为空', true);
            return;
        }
        
        if (password.length < 6) {
            G.showToast('密码至少6个字符', true);
            return;
        }
        
        try {
            const data = await G.apiCall('/api/admin/create_admin', 'POST', {
                username: username,
                password: password
            });
            
            G.showToast('管理员账号创建成功');
            document.getElementById('newAdminUsername').value = '';
            document.getElementById('newAdminPassword').value = '';
            G.loadAdminList();
        } catch (error) {
            G.showToast('创建管理员账号失败: ' + error.message, true);
        }
    }

    // ==================== 全部游戏记录 ====================

    // 查看全部游戏记录
    G.viewAllRecords = async function() {
        try {
            const data = await G.apiCall('/api/admin/records', 'GET');
            const records = data.records || [];
            const content = document.getElementById('allRecordsContent');
            const userFilter = document.getElementById('recordsUserFilter');
            
            G.allRecordsData = records;
            
            const usernames = [...new Set(records.map(r => r.player || '未知'))];
            userFilter.innerHTML = '<option value="">所有用户</option>';
            for (const username of usernames) {
                userFilter.innerHTML += `<option value="${G.escapeHtml(username)}">${G.escapeHtml(username)}</option>`;
            }
            
            G.renderRecords(records, userFilter.value);
            document.getElementById('allRecordsModal').classList.remove('hidden');
        } catch (error) {
            G.showToast('获取游戏记录失败: ' + error.message, true);
        }
    }

    // 渲染全部游戏记录列表（支持按用户筛选）
    G.renderRecords = function(records, selectedUser = '') {
        const content = document.getElementById('allRecordsContent');
        
        if (!records || records.length === 0) {
            content.innerHTML = '<div class="text-gray-500 text-center py-4">暂无游戏记录</div>';
            return;
        }
        
        let filtered = selectedUser ? records.filter(r => r.player === selectedUser) : records;
        let totalRecords = filtered.length;
        
        let html = '';
        html += `<div class="space-y-2">`;
        filtered.forEach((record, index) => {
            const time = record.date || record.timestamp ? new Date((record.timestamp || 0) * 1000).toLocaleString() : '未知时间';
            const mode = record.modeLabel || record.mode || '未知模式';
            const result = record.result || '未知结果';
            const resultClass = result === 'win' || result === '胜利' ? 'text-green-600' : 
                               result === 'lose' || result === '失败' ? 'text-red-600' : 'text-yellow-600';
            const player = record.player || '未知';
            const hasMoves = record.moveHistory && record.moveHistory.length > 0;
            
            html += `
                <div class="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                    <span class="font-medium text-gray-700">${G.escapeHtml(player)}</span>
                    <span>${mode}</span>
                    <span class="${resultClass}">${result}</span>
                    <span class="text-gray-400">${time}</span>
                    ${hasMoves ? `<button class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs admin-replay-btn" data-id="${record.id}"><i class="fa-solid fa-play mr-1"></i>复盘</button>` : '<span class="text-gray-400 text-xs">无棋谱</span>'}
                </div>
            `;
        });
        html += `</div>`;
        
        if (totalRecords === 0) {
            content.innerHTML = '<div class="text-gray-500 text-center py-4">暂无游戏记录</div>';
        } else {
            content.innerHTML = html;
            document.querySelectorAll('.admin-replay-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    G.startReplay(this.getAttribute('data-id'));
                });
            });
        }
    }

    // 关闭全部记录弹窗
    G.closeAllRecordsModal = function() {
        document.getElementById('allRecordsModal').classList.add('hidden');
    }

    // 导出游戏记录为 JSON 文件
    G.exportRecords = async function() {
        try {
            const data = await G.apiCall('/api/admin/records', 'GET');
            const records = data.records || G.allRecordsData || [];
            const dataStr = JSON.stringify(records, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `all_records_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            G.showToast('记录导出成功');
        } catch (error) {
            G.showToast('导出记录失败: ' + error.message, true);
        }
    }

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
            G.initReplayCanvas();
            G.drawReplayBoard();
            G.updateReplayUI();
            G.renderReplayMoveList();
            var modal = document.getElementById('replayModal');
            if (modal) modal.classList.remove('hidden');
            var speedSlider = document.getElementById('replaySpeedSlider');
            if (speedSlider) speedSlider.value = 5;
            G.replaySpeed = 500;
            var speedLabel = document.getElementById('replaySpeedLabel');
            if (speedLabel) speedLabel.textContent = '0.5s';
        } catch (err) {
            G.showToast('加载复盘失败: ' + (err.message || err), true);
        }
    }

    // 初始化复盘 Canvas（根据记录中的棋盘大小设置画布尺寸）
    G.initReplayCanvas = function() {
        const canvas = document.getElementById('replayCanvas');
        if (!canvas) return;
        const cellSize = 30;
        const pieceSize = cellSize * 0.8;
        const margin = pieceSize / 2 + 4;
        const boardSize = G.replayRecord.boardSize || 15;
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
        const boardSize = G.replayRecord.boardSize || 15;
        const cellSize = 30;
        const pieceSize = cellSize * 0.8;
        const margin = pieceSize / 2 + 4;
        const boardWidth = cellSize * (boardSize - 1) + margin * 2;
        const boardHeight = cellSize * (boardSize - 1) + margin * 2;

        ctx.clearRect(0, 0, boardWidth, boardHeight);

        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-line-color') || '#333';
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

        const moves = G.replayRecord.moveHistory || [];
        for (let i = 0; i < G.replayStep && i < moves.length; i++) {
            const m = moves[i];
            const x = m.col * cellSize + margin;
            const y = m.row * cellSize + margin;
            const r = pieceSize / 2;

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            if (m.player === 1) {
                ctx.fillStyle = '#1a1a1a';
                ctx.fill();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.fillStyle = '#f5f5f5';
                ctx.fill();
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.closePath();

            if (i === G.replayStep - 1 && G.replayStep > 0) {
                ctx.beginPath();
                ctx.arc(x, y - 1, r * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = m.player === 1 ? '#ff6b6b' : '#ff6b6b';
                ctx.fill();
                ctx.closePath();
            }
        }
    }

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
        G.drawReplayBoard();
        G.updateReplayUI();
    }

    // 复盘下一步
    G.replayNext = function() {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        if (G.replayStep < moves.length) {
            G.replayStep++;
            G.drawReplayBoard();
            G.updateReplayUI();
        }
    }

    // 复盘上一步
    G.replayPrev = function() {
        if (G.replayStep > 0) {
            G.replayStep--;
            G.drawReplayBoard();
            G.updateReplayUI();
        }
    }

    // 复盘重置（回到第一步）
    G.replayReset = function() {
        G.stopReplayAuto();
        G.replayStep = 0;
        G.drawReplayBoard();
        G.updateReplayUI();
    }

    // 复盘自动播放（点击开始/暂停切换）
    G.replayAutoPlay = function() {
        const moves = G.replayRecord ? G.replayRecord.moveHistory || [] : [];
        if (G.replayStep >= moves.length) {
            G.replayStep = 0;
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
        if (closeBtn) closeBtn.addEventListener('click', G.closeReplayModal);
        if (prevBtn) prevBtn.addEventListener('click', G.replayPrev);
        if (nextBtn) nextBtn.addEventListener('click', G.replayNext);
        if (resetBtn) resetBtn.addEventListener('click', G.replayReset);
        if (autoBtn) autoBtn.addEventListener('click', G.replayAutoPlay);
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

    // ==================== 管理员列表管理 ====================

    // 加载管理员列表（超级管理员可见）
    G.loadAdminList = async function() {
        if (!G.currentUser || !G.currentUser.isSuperAdmin) return;
        try {
            const data = await G.apiCall('/api/admin/users', 'GET');
            const adminListDiv = document.getElementById('adminList');
            const isSuperAdmin = G.currentUser && G.currentUser.isSuperAdmin;
            
            const admins = (data.users || []).filter(function(u) { return u.isAdmin || u.isSuperAdmin; });
            
            if (admins.length === 0) {
                adminListDiv.innerHTML = '<div class="text-gray-500 text-sm">暂无管理员账号</div>';
                return;
            }
            
            adminListDiv.innerHTML = '';
            admins.forEach(function(admin) {
                const adminDiv = document.createElement('div');
                adminDiv.className = 'flex justify-between items-center p-2 bg-white rounded border';
                
                // 密码显示（已隐藏，出于安全考虑）
                let passwordDisplay = '';
                
                // 权限状态显示
                let permissionStatus = '';
                let actionButtons = '';
                
                if (admin.isSuperAdmin) {
                    permissionStatus = `<span class="text-xs ml-2 px-2 py-1 rounded bg-red-100 text-red-800">超级管理员</span>`;
                } else {
                    const canManage = admin.canManage !== false; // 默认true
                    permissionStatus = `<span class="text-xs ml-2 px-2 py-1 rounded ${canManage ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${canManage ? '可管理' : '已禁用'}
                    </span>`;
                    
                    // 只有超级管理员可以设置权限
                    if (isSuperAdmin) {
                        actionButtons = `<button onclick="G.toggleAdminPermission('${admin.username}', ${!canManage})" class="text-xs ml-2 px-2 py-1 rounded ${canManage ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'}">
                            ${canManage ? '禁用' : '启用'}
                        </button>`;
                    }
                }
                
                adminDiv.innerHTML = `
                    <div class="flex-1">
                        <div class="flex items-center flex-wrap">
                            <span class="font-medium">${admin.username}</span>
                            ${permissionStatus}
                            ${passwordDisplay}
                            ${actionButtons}
                        </div>
                        ${admin.created_by ? `<div class="text-xs text-gray-500 mt-1">由 ${admin.created_by} 创建</div>` : ''}
                    </div>
                    <div class="text-xs text-gray-500">
                        积分: ${admin.score} | 胜场: ${admin.wins} | 对局: ${admin.games}
                    </div>
                `;
                adminListDiv.appendChild(adminDiv);
        });
        } catch (error) {
            console.error('加载管理员列表失败:', error);
            document.getElementById('adminList').innerHTML = '<div class="text-red-500 text-sm">加载失败</div>';
        }
    }

    // 切换管理员权限
    G.toggleAdminPermission = async function(username, canManage) {
        try {
            const data = await G.apiCall('/api/admin/set_permission', 'POST', {
                username: username,
                canManage: canManage
            });
            G.showToast(data.message);
            G.loadAdminList();
        } catch (error) {
            G.showToast('设置权限失败: ' + error.message, true);
        }
    }

    // 跳转到游戏大厅页面（如果已在游戏大厅则不需要跳转）
    G.showGameUI = function(){
        if (window.location.pathname === '/game') return;
        window.location.href = '/game';
    }
    
    // 初始化棋盘背景（清除背景并重新渲染网格）
    G.initBoardBackground = function() {
        G.applyBackground('');
        G.renderBackgroundGrid();
    };

    // 加载棋盘颜色设置（从服务器读取用户保存的设置）
    G.loadBoardColorSettings = async function() {
        try {
            const response = await G.apiCall('/api/settings', 'GET', null, true);
            const settings = response.settings || {};
            if (settings.boardLineColor) {
                G.boardLineColor = settings.boardLineColor;
                var boardLineColorEl = document.getElementById('boardLineColor');
                var boardLineColorTextEl = document.getElementById('boardLineColorText');
                if (boardLineColorEl) boardLineColorEl.value = G.boardLineColor;
                if (boardLineColorTextEl) boardLineColorTextEl.value = G.boardLineColor;
            }
            if (settings.boardDotColor) {
                G.boardDotColor = settings.boardDotColor;
                var boardDotColorEl = document.getElementById('boardDotColor');
                var boardDotColorTextEl = document.getElementById('boardDotColorText');
                if (boardDotColorEl) boardDotColorEl.value = G.boardDotColor;
                if (boardDotColorTextEl) boardDotColorTextEl.value = G.boardDotColor;
            }
            if (settings.boardBackground !== undefined) {
                G.selectedBackground = settings.boardBackground;
                G.applyBackground(G.selectedBackground);
            }
            G.drawBoard();
            // 加载背景图片列表
            G.loadBackgrounds();
            G.boardColorSettingsLoaded = true;
        } catch (err) {
            // 加载失败，使用默认颜色
        }
    }
    
    // 保存棋盘颜色设置到服务器
    G.saveBoardColorSettings = async function() {
        try {
            // 从UI获取当前值并应用到变量
            G.boardLineColor = document.getElementById('boardLineColor').value;
            G.boardDotColor = document.getElementById('boardDotColor').value;
            
            await G.apiCall('/api/settings', 'POST', {
                boardLineColor: G.boardLineColor,
                boardDotColor: G.boardDotColor,
                boardBackground: G.selectedBackground
            });
            G.drawBoard();
            G.drawOnlineBoard();
            G.boardColorSettingsLoaded = false;  // 重置加载标志，下次打开面板时重新加载
            G.showToast('设置已保存');
        } catch (err) {
            G.showToast('保存失败：' + err.message, true);
        }
    }

    // ==================== 棋盘背景图片功能 ====================

    // 加载可用背景图片列表
    G.loadBackgrounds = async function() {
        try {
            var data = await G.apiCall('/api/backgrounds', 'GET', null, true);
            G.availableBackgrounds = data.backgrounds || [];
        } catch (err) {
            // 使用本地存储的背景图片
            var localBg = localStorage.getItem('gomoku_backgrounds');
            if (localBg) {
                try {
                    G.availableBackgrounds = JSON.parse(localBg);
                } catch (e) {
                    G.availableBackgrounds = [];
                }
            }
        }
        G.renderBackgroundGrid();
    };

    // 应用选中的棋盘背景到 Canvas
    G.applyBackground = function(bg) {
        G.selectedBackground = bg || '';
        var canvas = document.getElementById('gameCanvas');
        var onlineCanvas = document.getElementById('onlineCanvas');
        if (canvas) {
            if (G.selectedBackground && G.selectedBackground !== 'none') {
                canvas.style.backgroundImage = 'url(' + G.selectedBackground + ')';
                canvas.style.backgroundSize = '100% 100%';
                canvas.style.backgroundRepeat = 'no-repeat';
                canvas.style.backgroundPosition = 'center';
            } else {
                canvas.style.backgroundImage = '';
                canvas.style.backgroundSize = '';
                canvas.style.backgroundRepeat = '';
                canvas.style.backgroundPosition = '';
            }
        }
        if (onlineCanvas) {
            if (G.selectedBackground && G.selectedBackground !== 'none') {
                onlineCanvas.style.backgroundImage = 'url(' + G.selectedBackground + ')';
                onlineCanvas.style.backgroundSize = '100% 100%';
                onlineCanvas.style.backgroundRepeat = 'no-repeat';
                onlineCanvas.style.backgroundPosition = 'center';
            } else {
                onlineCanvas.style.backgroundImage = '';
                onlineCanvas.style.backgroundSize = '';
                onlineCanvas.style.backgroundRepeat = '';
                onlineCanvas.style.backgroundPosition = '';
            }
        }
    };

    // 渲染背景图片缩略图网格
    G.renderBackgroundGrid = function() {
        var grid = document.getElementById('backgroundImageGrid');
        if (!grid) return;
        grid.innerHTML = '';
        // 无背景选项
        var noneDiv = document.createElement('div');
        noneDiv.className = 'border-2 rounded cursor-pointer hover:border-primary p-2 text-center text-xs flex items-center justify-center h-16 ' + 
            (G.selectedBackground === '' || G.selectedBackground === 'none' ? 'border-primary bg-primary/10' : 'border-gray-300');
        noneDiv.textContent = '无背景';
        noneDiv.addEventListener('click', function() {
            G.applyBackground('');
            G.drawBoard();
            G.drawOnlineBoard();
            G.renderBackgroundGrid();
        });
        grid.appendChild(noneDiv);
        // 背景图片缩略图
        if (G.availableBackgrounds && G.availableBackgrounds.length > 0) {
            G.availableBackgrounds.forEach(function(bg) {
                var div = document.createElement('div');
                div.className = 'border-2 rounded cursor-pointer hover:border-primary overflow-hidden h-16 ' + 
                    (G.selectedBackground === bg ? 'border-primary' : 'border-gray-300');
                var img = document.createElement('img');
                img.src = bg;
                img.className = 'w-full h-full object-cover';
                img.alt = '背景';
                img.onerror = function() {
                    div.innerHTML = '<span class="text-xs text-gray-400">加载失败</span>';
                };
                div.appendChild(img);
                div.addEventListener('click', function() {
                    G.applyBackground(bg);
                    G.drawBoard();
                    G.drawOnlineBoard();
                    G.renderBackgroundGrid();
                });
                grid.appendChild(div);
            });
        }
        if (G.availableBackgrounds.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-gray-500 text-sm text-center py-4 col-span-4';
            emptyDiv.textContent = '暂无背景图片，可上传自定义背景';
            grid.appendChild(emptyDiv);
        }
    };

    // 处理背景图片上传（读取本地文件并显示为 Canvas 背景）
    window.handleBackgroundUpload = function(input) {
        var file = input.files[0];
        if (!file) return;
        var uploadProgress = document.getElementById('uploadProgress');
        var saveToServer = document.getElementById('saveUploadToServer');
        if (uploadProgress) uploadProgress.classList.remove('hidden');
        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            // 添加本地背景到列表
            G.availableBackgrounds.push(dataUrl);
            // 保存到本地存储
            localStorage.setItem('gomoku_backgrounds', JSON.stringify(G.availableBackgrounds));
            G.renderBackgroundGrid();
            // 自动应用新上传的背景
            G.applyBackground(dataUrl);
            G.drawBoard();
            G.drawOnlineBoard();
            if (uploadProgress) uploadProgress.classList.add('hidden');
            G.showToast('背景图片已上传');
            // 如果勾选保存到服务器，则上传到服务器
            if (saveToServer && saveToServer.checked) {
                G.uploadBackgroundToServer(dataUrl, file.name);
            }
        };
        reader.onerror = function() {
            if (uploadProgress) uploadProgress.classList.add('hidden');
            G.showToast('图片读取失败', true);
        };
        reader.readAsDataURL(file);
    };

    // 上传背景图片到服务器
    G.uploadBackgroundToServer = async function(dataUrl, filename) {
        try {
            await G.apiCall('/api/backgrounds/upload', 'POST', {
                data: dataUrl,
                filename: filename
            });
            G.showToast('背景已保存到服务器');
        } catch (err) {
            // 服务器保存失败，仅本地存储
        }
    };

    // 初始化
})();
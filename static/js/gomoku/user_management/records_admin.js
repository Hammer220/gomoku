// ============================================================
// 用户管理模块 - 记录与排行
// 负责：排行榜、全部游戏记录、管理员列表管理
// ============================================================
(function() {
    var G = window.Gomoku;

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
                    <td class="border px-4 py-2">${u.username} ${isCurrentUser ? '<span class="text-xs text-primary">(我)</span>' : ''}</td>
                    <td class="border px-4 py-2 font-bold text-primary">${u.score}</td>
                    <td class="border px-4 py-2">${u.wins}</td>
                    <td class="border px-4 py-2">${u.games}</td>
                    <td class="border px-4 py-3 text-gray-500 text-sm">${u.joinDate || '-'}</td>
                </tr>`;
            }).join('');
        } catch (error) {
            document.getElementById('leaderboardTable').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">加载失败: ' + error.message + '</td></tr>';
        }
    };

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
    };

    G.viewAllRecords = async function() {
        try {
            const data = await G.apiCall('/api/admin/records', 'GET');
            const records = data.records || [];
            const content = document.getElementById('allRecordsContent');
            const userFilter = document.getElementById('recordsUserFilter');

            G.allRecordsData = records;

            const isBuiltinUser = (username) => {
                if (!username) return true;
                if (username.startsWith('AI')) return true;
                if (username === '玩家对战') return true;
                return false;
            };

            const usernames = new Set();
            records.forEach(r => {
                if (r.player && !isBuiltinUser(r.player)) usernames.add(r.player);
                if (r.opponent && !isBuiltinUser(r.opponent)) usernames.add(r.opponent);
            });
            const sortedUsernames = Array.from(usernames).sort();
            userFilter.innerHTML = '<option value="">所有用户</option>';
            for (const username of sortedUsernames) {
                userFilter.innerHTML += `<option value="${G.escapeHtml(username)}">${G.escapeHtml(username)}</option>`;
            }

            G.renderRecords(records, userFilter.value);
            document.getElementById('allRecordsModal').classList.remove('hidden');
        } catch (error) {
            G.showToast('获取游戏记录失败: ' + error.message, true);
        }
    };

    G.renderRecords = function(records, selectedUser = '') {
        const content = document.getElementById('allRecordsContent');

        if (!records || records.length === 0) {
            content.innerHTML = '<div class="text-gray-500 text-center py-4">暂无游戏记录</div>';
            return;
        }

        let filtered = selectedUser ? records.filter(r => r.player === selectedUser || r.opponent === selectedUser) : records;
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
    };

    G.closeAllRecordsModal = function() {
        document.getElementById('allRecordsModal').classList.add('hidden');
    };

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
    };

    G.loadAdminList = async function() {
        if (!G.currentUser || !G.currentUser.isSuperAdmin) return;
        try {
            const data = await G.apiCall('/api/admin/users', 'GET');
            const adminListDiv = document.getElementById('adminList');

            const admins = (data.users || []).filter(function(u) { return u.isAdmin || u.isSuperAdmin; }).sort(function(a, b) { return a.username.localeCompare(b.username); });

            if (admins.length === 0) {
                adminListDiv.innerHTML = '<div class="text-gray-500 text-sm">暂无管理员账号</div>';
                document.getElementById('adminPermissionsTable').classList.add('hidden');
                return;
            }

            adminListDiv.innerHTML = '';
            admins.forEach(function(admin) {
                const adminDiv = document.createElement('div');
                adminDiv.className = 'flex justify-between items-center p-2 bg-white rounded border';

                let permissionStatus = '';
                const perms = admin.permissions || {};
                const hasAnyPerm = Object.values(perms).some(v => v === true);
                if (admin.isSuperAdmin) {
                    permissionStatus = '<span class="text-xs text-red-600">超级管理员（所有权限）</span>';
                } else if (!hasAnyPerm) {
                    permissionStatus = '<span class="text-xs text-yellow-600">无权限</span>';
                } else {
                    permissionStatus = '<span class="text-xs text-green-600">部分权限</span>';
                }

                adminDiv.innerHTML = `
                    <div>
                        <span class="font-medium">${admin.username}</span>
                        ${permissionStatus}
                    </div>
                `;
                adminListDiv.appendChild(adminDiv);
            });

            const permKeys = [
                'canBanUser', 'canKickUser', 'canDeleteUser',
                'canChangePassword', 'canModifyScore', 'canSetPasswordFree',
                'canMonitorMatches', 'canManageMatches'
            ];

            const tbody = document.getElementById('adminPermissionsBody');
            tbody.innerHTML = '';

            admins.forEach(function(admin) {
                const perms = admin.permissions || {};
                const tr = document.createElement('tr');
                const isAdminUser = admin.username.toLowerCase() === 'admin';

                const nameTd = document.createElement('td');
                nameTd.className = 'border px-3 py-2 font-medium';
                if (admin.isSuperAdmin) {
                    nameTd.innerHTML = G.escapeHtml(admin.username) + ' <span class="text-xs text-red-500">(超管)</span>';
                } else if (isAdminUser) {
                    nameTd.innerHTML = G.escapeHtml(admin.username) + ' <span class="text-xs text-red-500">(内置管理员)</span>';
                } else {
                    nameTd.textContent = admin.username;
                }
                tr.appendChild(nameTd);

                permKeys.forEach(function(key) {
                    const td = document.createElement('td');
                    td.className = 'border px-3 py-2 text-center';

                    if (admin.isSuperAdmin) {
                        td.innerHTML = '<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">启用</span>';
                    } else if (isAdminUser) {
                        td.innerHTML = '<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 cursor-not-allowed" title="权限不足，无法进行任何操作">-</span>';
                    } else {
                        const enabled = !!perms[key];
                        const badge = document.createElement('span');
                        badge.className = 'inline-block px-2 py-0.5 rounded text-xs font-medium cursor-pointer select-none perm-toggle-badge';
                        badge.dataset.username = admin.username;
                        badge.dataset.perm = key;

                        if (enabled) {
                            badge.className += ' bg-green-100 text-green-700';
                            badge.textContent = '启用';
                        } else {
                            badge.className += ' bg-red-100 text-red-700';
                            badge.textContent = '禁用';
                        }

                        td.appendChild(badge);
                    }

                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });

            document.getElementById('adminPermissionsTable').classList.remove('hidden');

            const selectEl = document.getElementById('selectAdminForBatchPerm');
            selectEl.innerHTML = '<option value="">选择管理员...</option>';
            admins.forEach(function(admin) {
                if (!admin.isSuperAdmin && admin.username.toLowerCase() !== 'admin') {
                    const opt = document.createElement('option');
                    opt.value = admin.username;
                    opt.textContent = admin.username;
                    selectEl.appendChild(opt);
                }
            });
        } catch (error) {
            console.error('加载管理员列表失败', error);
        }
    };

    G.toggleAdminPermission = async function(username, permKey) {
        if (!G.currentUser || !G.currentUser.isSuperAdmin) return;

        if (username.toLowerCase() === 'admin') {
            G.showToast('权限不足，无法对管理员账号进行任何操作', true);
            return;
        }

        const user = G.adminAllUsers.find(u => u.username === username);
        if (!user) return;

        const perms = user.permissions || {};
        const newValue = !perms[permKey];

        try {
            const data = await G.apiCall('/api/admin/set_permissions', 'POST', {
                username: username,
                permissions: { [permKey]: newValue }
            });

            if (user.permissions) {
                user.permissions[permKey] = newValue;
            }

            G.loadAdminList();
        } catch (error) {
            G.showToast('权限修改失败: ' + error.message, true);
        }
    };

    G.enableAllAdminPermissions = async function() {
        const username = document.getElementById('selectAdminForBatchPerm').value;
        if (!username) {
            G.showToast('请先选择管理员', true);
            return;
        }

        if (username.toLowerCase() === 'admin') {
            G.showToast('权限不足，无法对管理员账号进行任何操作', true);
            return;
        }

        try {
            await G.apiCall('/api/admin/set_all_permissions', 'POST', {
                username: username,
                enable: true
            });
            G.showToast('已启用所有权限');
            G.loadAdminList();
        } catch (error) {
            G.showToast('操作失败: ' + error.message, true);
        }
    };

    G.disableAllAdminPermissions = async function() {
        const username = document.getElementById('selectAdminForBatchPerm').value;
        if (!username) {
            G.showToast('请先选择管理员', true);
            return;
        }

        if (username.toLowerCase() === 'admin') {
            G.showToast('权限不足，无法对管理员账号进行任何操作', true);
            return;
        }

        try {
            await G.apiCall('/api/admin/set_all_permissions', 'POST', {
                username: username,
                enable: false
            });
            G.showToast('已关闭所有权限');
            G.loadAdminList();
        } catch (error) {
            G.showToast('操作失败: ' + error.message, true);
        }
    };

    document.addEventListener('click', function(e) {
        const target = e.target;

        if (target.id === 'createAdminBtn' || target.closest('#createAdminBtn')) {
            G.createAdminAccount();
        }
        if (target.id === 'viewAllRecordsBtn' || target.closest('#viewAllRecordsBtn')) {
            G.viewAllRecords();
        }
        if (target.id === 'closeAllRecordsBtn' || target.closest('#closeAllRecordsBtn')) {
            G.closeAllRecordsModal();
        }
        if (target.id === 'exportRecordsBtn' || target.closest('#exportRecordsBtn')) {
            G.exportRecords();
        }
        if (target.id === 'refreshLeaderboardBtn' || target.closest('#refreshLeaderboardBtn')) {
            G.loadLeaderboard();
        }
        if (target.classList.contains('perm-toggle-badge')) {
            G.toggleAdminPermission(target.dataset.username, target.dataset.perm);
        }
        if (target.id === 'enableAllPermsBtn' || target.closest('#enableAllPermsBtn')) {
            G.enableAllAdminPermissions();
        }
        if (target.id === 'disableAllPermsBtn' || target.closest('#disableAllPermsBtn')) {
            G.disableAllAdminPermissions();
        }
    });

    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'recordsUserFilter') {
            const value = e.target.value;
            G.renderRecords(G.allRecordsData || [], value);
        }
    });

})();
// ============================================================
// 用户管理模块 - 用户列表与操作
// 负责：加载用户列表、搜索、选择用户、封禁/解封/积分/密码修改弹窗
// ============================================================
(function() {
    var G = window.Gomoku;

    G.loadAdminUsers = async function(){
        const selectAllCb = document.getElementById('selectAllUsers');
        if (selectAllCb) selectAllCb.checked = false;

        const checkedUsers = new Set();
        document.querySelectorAll('.user-checkbox:checked').forEach(cb => {
            checkedUsers.add(cb.value);
        });

        const searchInput = document.getElementById('adminUserSearch');
        if (searchInput) G.adminSearchFilter = searchInput.value.trim().toLowerCase();

        const data = await G.apiCall('/api/admin/users');
        G.adminAllUsers = data.users || [];

        const filteredUsers = G.getFilteredUsers();

        const countEl = document.getElementById('adminUserCount');
        if (countEl) {
            countEl.textContent = G.adminSearchFilter
                ? `共 ${G.adminAllUsers.length} 个用户，筛选出 ${filteredUsers.length} 个`
                : `共 ${G.adminAllUsers.length} 个用户`;
        }

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

            var currentPerms = {};
            if (isSuperAdmin) {
                currentPerms = { canBanUser: true, canKickUser: true, canDeleteUser: true, canChangePassword: true, canModifyScore: true, canSetPasswordFree: true, canMonitorMatches: true, canManageMatches: true };
            } else if (G.currentUser && G.currentUser.isAdmin) {
                var currentUserData = G.adminAllUsers.find(function(cu) { return cu.username === G.currentUser.username; });
                if (currentUserData && currentUserData.permissions) {
                    currentPerms = currentUserData.permissions;
                } else {
                    currentPerms = { canBanUser: true, canKickUser: true, canDeleteUser: true, canChangePassword: true, canModifyScore: true, canSetPasswordFree: true, canMonitorMatches: true, canManageMatches: true };
                }
            }
            var hasAnyPermission = Object.values(currentPerms).some(function(v) { return v === true; });
            var canOperate = !isTargetSuperAdmin && (isSuperAdmin || hasAnyPermission);

            const isChecked = checkedUsers.has(u.username) ? 'checked' : '';

            let roleTag = '';
            if (u.isGuest) {
                roleTag = '<span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">访客</span>';
            } else if (u.isSuperAdmin) {
                roleTag = '<span class="text-xs px-2 py-1 rounded bg-red-100 text-red-800">超级</span>';
            } else if (u.isAdmin) {
                const canManage = u.canManage !== false;
                roleTag = `<span class="text-xs px-2 py-1 rounded ${canManage ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${canManage ? '管理员' : '已禁用'}</span>`;
            }

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

        tbody.querySelectorAll('.admin-user-row').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.type === 'checkbox') return;
                G.selectAdminUser(this.dataset.username);
            });
        });

        G.renderPagination(filteredUsers.length);
        G.startBannedCountdown();
        G.updateBatchButtonsVisibility();
    };

    G.selectAdminUser = function(username) {
        document.getElementById('adminBanUsername').value = username;
        const user = G.adminAllUsers.find(u => u.username === username);
        const infoEl = document.getElementById('selectedUserInfo');
        const pfToggle = document.getElementById('adminPasswordFreeToggle');
        const pfAttempts = document.getElementById('adminPasswordFreeAttempts');
        const scoreBtn = document.getElementById('adminUpdateScoreBtn');
        const changePwdBtn = document.getElementById('adminChangePasswordBtn');
        const banBtn = document.getElementById('adminBanBtn');
        const unbanBtn = document.getElementById('adminUnbanBtn');
        const kickBtn = document.getElementById('adminKickBtn');
        const deleteBtn = document.getElementById('adminDeleteBtn');

        if (!user) {
            infoEl.textContent = '';
            pfToggle.textContent = '请选择用户';
            pfToggle.className = 'px-3 py-1.5 text-sm border rounded-lg text-gray-400';
            pfToggle.classList.remove('hidden');
            pfAttempts.classList.add('hidden');
            return;
        }

        const isSuperAdmin = G.currentUser && G.currentUser.isSuperAdmin;
        const isTargetSuperAdmin = user.isSuperAdmin;

        var currentPerms = {};
        if (isSuperAdmin) {
            currentPerms = {
                canBanUser: true, canKickUser: true, canDeleteUser: true,
                canChangePassword: true, canModifyScore: true, canSetPasswordFree: true,
                canMonitorMatches: true, canManageMatches: true
            };
        } else if (G.currentUser && G.currentUser.isAdmin) {
            var currentUserData = G.adminAllUsers.find(function(u) { return u.username === G.currentUser.username; });
            if (currentUserData && currentUserData.permissions) {
                currentPerms = currentUserData.permissions;
            } else {
                currentPerms = {
                    canBanUser: true, canKickUser: true, canDeleteUser: true,
                    canChangePassword: true, canModifyScore: true, canSetPasswordFree: true,
                    canMonitorMatches: true, canManageMatches: true
                };
            }
        }

        var canOperate = !isTargetSuperAdmin;

        var info = '当前用户：' + user.username;
        if (user.isGuest) info += ' | 访客';
        else if (user.isSuperAdmin) info += ' | 超级管理员';
        else if (user.isAdmin) info += ' | 管理员';
        info += ' | 积分：' + user.score + ' | 胜场：' + user.wins + ' | 对局：' + user.games;
        infoEl.textContent = info;

        if (banBtn) banBtn.classList.toggle('hidden', !(canOperate && currentPerms.canBanUser));
        if (unbanBtn) unbanBtn.classList.toggle('hidden', !(canOperate && currentPerms.canBanUser));
        if (kickBtn) kickBtn.classList.toggle('hidden', !(canOperate && currentPerms.canKickUser));
        if (deleteBtn) deleteBtn.classList.toggle('hidden', !(canOperate && currentPerms.canDeleteUser));
        if (changePwdBtn) changePwdBtn.classList.toggle('hidden', !(canOperate && currentPerms.canChangePassword));
        if (scoreBtn) scoreBtn.classList.toggle('hidden', !(canOperate && currentPerms.canModifyScore));

        if (canOperate && currentPerms.canSetPasswordFree) {
            const pfEnabled = user.passwordFree === true;
            pfToggle.classList.remove('hidden');
            pfToggle.textContent = pfEnabled ? '禁用免密' : '启用免密';
            pfToggle.className = 'px-3 py-1.5 text-sm border rounded-lg ' + (pfEnabled ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100');
            pfAttempts.classList.remove('hidden');
        } else {
            pfToggle.classList.add('hidden');
            pfAttempts.classList.add('hidden');
        }
    };

    // 封禁倒计时
    G.startBannedCountdown = function() {
        if (G.bannedCountdownTimer) clearInterval(G.bannedCountdownTimer);
        G.bannedCountdownTimer = setInterval(function() {
            var hasBanned = false;
            if (G.adminAllUsers) {
                G.adminAllUsers.forEach(function(u) {
                    if (u.isBanned && u.remainingMinutes > 0) { hasBanned = true; }
                });
            }
            if (hasBanned || (document.getElementById('adminContent') && !document.getElementById('adminContent').classList.contains('hidden'))) {
                G.loadAdminUsers();
            }
        }, 60000);
    };

    // ==================== 搜索/分页事件 ====================

    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'adminUserSearch') {
            clearTimeout(G.searchTimer);
            G.searchTimer = setTimeout(() => {
                G.adminCurrentPage = 1;
                G.loadAdminUsers();
            }, 300);
        }
    });

    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'pageSizeSelect') {
            G.adminPageSize = parseInt(e.target.value);
            G.adminCurrentPage = 1;
            G.loadAdminUsers();
        }
    });

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

})();
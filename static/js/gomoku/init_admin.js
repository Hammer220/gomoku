// ============================================================
// 管理后台页面初始化脚本
// 负责：用户管理（封禁/解封/强制登出/注销）、批量操作、
//       联机对局监控、强制落子、游戏记录管理、管理员账号管理、
//       自动登录权限检查等
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    // 安全获取 DOM 元素（防御性：元素不存在时返回 null）
    var $ = function(id) { return document.getElementById(id); };

    // ==================== 初始化入口 ====================

    // 管理后台页面初始化
    G.init = async function() {
        // ==================== 用户管理 ====================

        // 封禁用户
        var adminBanBtn = $('adminBanBtn');
        if (adminBanBtn) {
            adminBanBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                var m = parseInt($('adminBanMinutes').value);
                if (!u || m < 1) return G.showToast('请输入用户名和分钟', true);
                if (G.currentUser && u === G.currentUser.username) return G.showToast('不能封禁自己', true);
                var btn = adminBanBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    await G.apiCall('/api/admin/ban', 'POST', { username: u, minutes: m });
                    G.showToast('已封禁 ' + u + ' ' + m + ' 分钟');
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-ban mr-1"></i>封禁';
                }
            });
        }

        // 解封用户
        var adminUnbanBtn = $('adminUnbanBtn');
        if (adminUnbanBtn) {
            adminUnbanBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u) return;
                var btn = adminUnbanBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    await G.apiCall('/api/admin/unban', 'POST', { username: u });
                    G.showToast('已解封 ' + u);
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-unlock mr-1"></i>解封';
                }
            });
        }

        // 强制登出
        var adminKickBtn = $('adminKickBtn');
        if (adminKickBtn) {
            adminKickBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u) return;
                var btn = adminKickBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    await G.apiCall('/api/admin/kick', 'POST', { username: u });
                    G.showToast('已强制登出 ' + u);
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>强制登出';
                }
            });
        }

        // 注销用户
        var adminDeleteBtn = $('adminDeleteBtn');
        if (adminDeleteBtn) {
            adminDeleteBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u || u === 'admin') return G.showToast('不能删除admin', true);
                if (!confirm('确定注销用户 ' + u + ' ？')) return;
                var btn = adminDeleteBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    await G.apiCall('/api/admin/user/' + u, 'DELETE');
                    G.showToast('已注销 ' + u);
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>注销';
                }
            });
        }

        // ==================== 批量操作 ====================

        // 全选复选框
        var selectAllUsers = $('selectAllUsers');
        if (selectAllUsers) {
            selectAllUsers.addEventListener('change', function() {
                var checkboxes = document.querySelectorAll('.user-checkbox:not(:disabled)');
                checkboxes.forEach(function(cb) { cb.checked = selectAllUsers.checked; });
                if (G.updateSelectedCount) G.updateSelectedCount();
            });
        }

        // 批量封禁
        var batchBanBtn = $('batchBanBtn');
        if (batchBanBtn) {
            batchBanBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                var minutes = prompt('请输入封禁时长（分钟）:', '10');
                if (!minutes || parseInt(minutes) <= 0) return;
                var btn = batchBanBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    var result = await G.apiCall('/api/admin/batch_ban', 'POST', { usernames: users, minutes: parseInt(minutes) });
                    G.showToast('批量封禁完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-users mr-1"></i>批量封禁';
                }
            });
        }

        // 批量解封
        var batchUnbanBtn = $('batchUnbanBtn');
        if (batchUnbanBtn) {
            batchUnbanBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                var btn = batchUnbanBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    var result = await G.apiCall('/api/admin/batch_unban', 'POST', { usernames: users });
                    G.showToast('批量解封完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-unlock-alt mr-1"></i>批量解封';
                }
            });
        }

        // 批量强制登出
        var batchKickBtn = $('batchKickBtn');
        if (batchKickBtn) {
            batchKickBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                if (!confirm('确定强制登出选中的 ' + users.length + ' 个用户？')) return;
                var btn = batchKickBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    var result = await G.apiCall('/api/admin/batch_kick', 'POST', { usernames: users });
                    G.showToast('批量强制登出完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>批量登出';
                }
            });
        }

        // 批量注销
        var batchDeleteBtn = $('batchDeleteBtn');
        if (batchDeleteBtn) {
            batchDeleteBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                if (!confirm('确定注销选中的 ' + users.length + ' 个用户？此操作不可恢复！')) return;
                var btn = batchDeleteBtn;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
                try {
                    var result = await G.apiCall('/api/admin/batch_delete', 'POST', { usernames: users });
                    G.showToast('批量注销完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                    await G.loadAdminUsers();
                } catch (e) {
                    G.showToast('操作失败: ' + e.message, true);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>批量注销';
                }
            });
        }

        // ==================== 联机对局监控 ====================

        // 监控画布强制落子
        var monitorCanvas = $('monitorCanvas');
        if (monitorCanvas) {
            monitorCanvas.addEventListener('click', function(e) {
                if (!G.monitorMatchId) return;
                var rect = monitorCanvas.getBoundingClientRect();
                var displayWidth = rect.width;
                var displayHeight = rect.height;
                var x = e.clientX - rect.left;
                var y = e.clientY - rect.top;
                var cellSize = displayWidth / (G.BOARD_SIZE - 1);
                var col = Math.round(x / cellSize);
                var row = Math.round(y / cellSize);
                if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
                    var player = parseInt($('monitorPlayerSelect').value);
                    G.forceMove(row, col, player);
                }
            });
        }

        // 刷新对局列表
        var refreshMatchListBtn = $('refreshMatchListBtn');
        if (refreshMatchListBtn) refreshMatchListBtn.addEventListener('click', G.loadMatchList);

        // 强制关闭对局
        var forceCloseMatchBtn = $('forceCloseMatchBtn');
        if (forceCloseMatchBtn) forceCloseMatchBtn.addEventListener('click', G.forceCloseMatch);

        // 强制重启对局
        var forceRestartMatchBtn = $('forceRestartMatchBtn');
        if (forceRestartMatchBtn) forceRestartMatchBtn.addEventListener('click', G.forceRestartMatch);

        // 强制关闭所有房间
        var forceCloseAllRoomsBtn = $('forceCloseAllRoomsBtn');
        if (forceCloseAllRoomsBtn) forceCloseAllRoomsBtn.addEventListener('click', G.forceCloseAllRooms);

        // ==================== 游戏记录管理 ====================

        // 查看所有记录
        var viewAllRecordsBtn = $('viewAllRecordsBtn');
        if (viewAllRecordsBtn) viewAllRecordsBtn.addEventListener('click', G.viewAllRecords);

        // 关闭记录弹窗
        var closeAllRecordsBtn = $('closeAllRecordsBtn');
        if (closeAllRecordsBtn) closeAllRecordsBtn.addEventListener('click', G.closeAllRecordsModal);

        // 导出记录
        var exportRecordsBtn = $('exportRecordsBtn');
        if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', G.exportRecords);

        // 记录用户筛选
        var recordsUserFilter = $('recordsUserFilter');
        if (recordsUserFilter) {
            recordsUserFilter.addEventListener('change', function() {
                if (G.allRecordsData) {
                    G.renderRecords(G.allRecordsData, recordsUserFilter.value);
                }
            });
        }

        // ==================== 管理员账号管理 ====================

        // 创建管理员
        var createAdminBtn = $('createAdminBtn');
        if (createAdminBtn) createAdminBtn.addEventListener('click', G.createAdminAccount);

        // 刷新管理员列表
        var refreshAdminsBtn = $('refreshAdminsBtn');
        if (refreshAdminsBtn) refreshAdminsBtn.addEventListener('click', G.loadAdminList);

        // ==================== 退出按钮 ====================

        var logoutBtn = $('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', G.logout);

        // ==================== 自动登录 ====================

        // 如果已有 token，尝试自动登录并验证管理员权限
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                // 更新用户信息显示
                if (G.updateUserDisplay) G.updateUserDisplay();
                // 额外确保用户名显示（专门处理管理员页面）
                var userNameDisplay = document.getElementById('userNameDisplay');
                if (userNameDisplay && G.currentUser && G.currentUser.username) {
                    userNameDisplay.textContent = G.currentUser.username;
                }
                // 检查是否为管理员，非管理员跳转到游戏大厅
                if (!G.currentUser.isAdmin && !G.currentUser.isSuperAdmin) {
                    window.location.href = '/game';
                    return;
                }
                // 加载管理数据
                if (G.loadAdminUsers) G.loadAdminUsers();
                if (G.loadAdminList) G.loadAdminList();
                if (G.loadMatchList) G.loadMatchList();
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
                // 自动登录失败，跳转到登录页
                window.location.href = '/login';
                return;
            }
        } else {
            // 未登录，跳转到登录页
            window.location.href = '/login';
            return;
        }

        // ==================== 显示管理面板 ====================

        // 显示管理后台内容
        var adminContent = $('adminContent');
        if (adminContent) adminContent.classList.remove('hidden');

        // 超级管理员可见：管理员账号管理模块
        if (G.currentUser && G.currentUser.isSuperAdmin) {
            var adminMgmt = $('adminAccountManagement');
            if (adminMgmt) adminMgmt.classList.remove('hidden');
        }

        // 根据权限显示对局监控模块
        var canMonitor = G.currentUser && (G.currentUser.isSuperAdmin || (G.currentUser.permissions && G.currentUser.permissions.canMonitorMatches !== false));
        var canManage = G.currentUser && (G.currentUser.isSuperAdmin || (G.currentUser.permissions && G.currentUser.permissions.canManageMatches !== false));
        if (canMonitor && canManage) {
            var matchMonitor = $('onlineMatchMonitor');
            if (matchMonitor) matchMonitor.classList.remove('hidden');
            if (G.loadMatchList) G.loadMatchList();
            // 初始化空棋盘（显示网格线）
            setTimeout(function() {
                if (G.drawMonitorBoard) G.drawMonitorBoard();
            }, 200);
        }

        // 开始状态检查
        if (G.startStatusCheck) G.startStatusCheck();
        // 更新未读消息数
        if (G.updateUnreadBadge) G.updateUnreadBadge();

        // ==================== 页面关闭处理 ====================

        // 页面关闭时停止检查
        window.addEventListener('beforeunload', function(event) {
            if (G.stopStatusCheck) G.stopStatusCheck();
            if (G.stopBannedCountdown) G.stopBannedCountdown();
        });

        // 初始化复盘事件
        if (G.initReplayEvents) G.initReplayEvents();
    };

    // 启动初始化
    G.init();
})();
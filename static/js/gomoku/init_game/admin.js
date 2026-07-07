// ============================================================
// 游戏大厅初始化 - 管理后台用户操作
// 负责：封禁/解封/强制登出/注销用户、批量操作（封禁/解封/登出/注销）
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    // 封禁用户
    var adminBanBtn = $('adminBanBtn');
    if (adminBanBtn) {
        adminBanBtn.addEventListener('click', async function() {
            var u = $('adminBanUsername').value;
            var m = parseInt($('adminBanMinutes').value);
            if (!u || m < 1) return G.showToast('请输入用户名和分钟', true);
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

    // 强制登出用户
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
})();
// ============================================================
// 主页初始化 - 管理后台事件
// 负责：监控画布、用户管理、批量操作、对局监控、记录管理
// ============================================================
(function() {
    var G = window.Gomoku;

    document.getElementById('monitorCanvas') && document.getElementById('monitorCanvas').addEventListener('click', function(e) {
        if (!G.monitorMatchId) return;
        var canvas = document.getElementById('monitorCanvas');
        var rect = canvas.getBoundingClientRect();
        var displayWidth = rect.width;
        var displayHeight = rect.height;
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var cellSize = displayWidth / (G.BOARD_SIZE - 1);
        var col = Math.round(x / cellSize);
        var row = Math.round(y / cellSize);
        if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
            var player = parseInt(document.getElementById('monitorPlayerSelect').value);
            G.forceMove(row, col, player);
        }
    });

    document.getElementById('adminBanBtn').addEventListener('click', async function() {
        var u = document.getElementById('adminBanUsername').value;
        var m = parseInt(document.getElementById('adminBanMinutes').value);
        if (!u || m < 1) return G.showToast('请输入用户名和分钟', true);
        if (G.currentUser && u === G.currentUser.username) return G.showToast('不能封禁自己', true);
        var btn = document.getElementById('adminBanBtn');
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

    document.getElementById('adminUnbanBtn').addEventListener('click', async function() {
        var u = document.getElementById('adminBanUsername').value;
        if (!u) return;
        var btn = document.getElementById('adminUnbanBtn');
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

    document.getElementById('adminKickBtn').addEventListener('click', async function() {
        var u = document.getElementById('adminBanUsername').value;
        if (!u) return;
        var btn = document.getElementById('adminKickBtn');
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

    document.getElementById('adminDeleteBtn').addEventListener('click', async function() {
        var u = document.getElementById('adminBanUsername').value;
        if (!u || u === 'admin') return G.showToast('不能删除admin', true);
        if (!confirm('确定注销用户 ' + u + ' ？')) return;
        var btn = document.getElementById('adminDeleteBtn');
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

    document.getElementById('selectAllUsers').addEventListener('change', function() {
        var checkboxes = document.querySelectorAll('.user-checkbox:not(:disabled)');
        checkboxes.forEach(function(cb) { cb.checked = this.checked; });
        G.updateSelectedCount();
    });

    document.getElementById('batchBanBtn').addEventListener('click', async function() {
        var users = G.getSelectedUsers();
        if (users.length === 0) return G.showToast('请先选择用户', true);
        var minutes = prompt('请输入封禁时长（分钟）:', '10');
        if (!minutes || parseInt(minutes) <= 0) return;
        var btn = document.getElementById('batchBanBtn');
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

    document.getElementById('batchUnbanBtn').addEventListener('click', async function() {
        var users = G.getSelectedUsers();
        if (users.length === 0) return G.showToast('请先选择用户', true);
        var btn = document.getElementById('batchUnbanBtn');
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
            btn.innerHTML = '<i class="fa-solid fa-users mr-1"></i>批量解封';
        }
    });

    document.getElementById('batchKickBtn').addEventListener('click', async function() {
        var users = G.getSelectedUsers();
        if (users.length === 0) return G.showToast('请先选择用户', true);
        if (!confirm('确定强制登出选中的 ' + users.length + ' 个用户？')) return;
        var btn = document.getElementById('batchKickBtn');
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
            btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>批量下线';
        }
    });

    document.getElementById('batchDeleteBtn').addEventListener('click', async function() {
        var users = G.getSelectedUsers();
        if (users.length === 0) return G.showToast('请先选择用户', true);
        if (users.indexOf('admin') !== -1) return G.showToast('不能删除admin', true);
        if (!confirm('确定注销选中的 ' + users.length + ' 个用户？此操作不可撤销！')) return;
        var btn = document.getElementById('batchDeleteBtn');
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

    document.getElementById('refreshMatchListBtn') && document.getElementById('refreshMatchListBtn').addEventListener('click', G.loadMatchList);
    document.getElementById('forceCloseMatchBtn') && document.getElementById('forceCloseMatchBtn').addEventListener('click', G.forceCloseMatch);
    document.getElementById('forceRestartMatchBtn') && document.getElementById('forceRestartMatchBtn').addEventListener('click', G.forceRestartMatch);
    document.getElementById('forceCloseAllRoomsBtn') && document.getElementById('forceCloseAllRoomsBtn').addEventListener('click', G.forceCloseAllRooms);

})();
// ============================================================
// 用户管理模块 - 分页与批量操作
// 负责：分页控件、批量操作工具函数
// ============================================================
(function() {
    var G = window.Gomoku;

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
    };

    G.createPageBtn = function(page) {
        const btn = document.createElement('button');
        btn.textContent = page;
        btn.className = `px-3 py-1.5 text-sm border rounded-lg ${page === G.adminCurrentPage ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'}`;
        btn.addEventListener('click', () => {
            G.adminCurrentPage = page;
            G.loadAdminUsers();
        });
        return btn;
    };

    G.createEllipsis = function() {
        const span = document.createElement('span');
        span.textContent = '…';
        span.className = 'px-2 text-gray-400';
        return span;
    };

    G.getFilteredUsers = function() {
        if (!G.adminSearchFilter) return G.adminAllUsers;
        return G.adminAllUsers.filter(u => u.username.toLowerCase().includes(G.adminSearchFilter));
    };

    G.getSelectedUsers = function() {
        var users = [];
        var checkboxes = document.querySelectorAll('.user-checkbox:checked');
        checkboxes.forEach(function(cb) { users.push(cb.value); });
        return users;
    };

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

    G.updateBatchButtonsVisibility = function() {
        var isSuperAdmin = G.currentUser && G.currentUser.isSuperAdmin;
        var perms = {};
        if (isSuperAdmin) {
            perms = { canBanUser: true, canKickUser: true, canDeleteUser: true };
        } else if (G.currentUser && G.currentUser.isAdmin) {
            var currentUserData = G.adminAllUsers.find(function(u) { return u.username === G.currentUser.username; });
            if (currentUserData && currentUserData.permissions) {
                perms = currentUserData.permissions;
            } else {
                perms = { canBanUser: true, canKickUser: true, canDeleteUser: true };
            }
        }

        var batchBanBtn = document.getElementById('batchBanBtn');
        var batchUnbanBtn = document.getElementById('batchUnbanBtn');
        var batchKickBtn = document.getElementById('batchKickBtn');
        var batchDeleteBtn = document.getElementById('batchDeleteBtn');

        if (batchBanBtn) batchBanBtn.classList.toggle('hidden', !perms.canBanUser);
        if (batchUnbanBtn) batchUnbanBtn.classList.toggle('hidden', !perms.canBanUser);
        if (batchKickBtn) batchKickBtn.classList.toggle('hidden', !perms.canKickUser);
        if (batchDeleteBtn) batchDeleteBtn.classList.toggle('hidden', !perms.canDeleteUser);
    };

})();
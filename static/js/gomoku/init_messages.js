// ============================================================
// 消息页面初始化脚本
// 负责：自动登录、消息事件绑定、页面初始化
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    var $ = function(id) { return document.getElementById(id); };

    G.init = async function() {
        G.bindMessageEvents();

        var logoutBtn = $('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', G.logout);

        await G.autoLogin();
        if (!G.isLoggedIn) return;

        G.isAdminUser = G.currentUser && G.currentUser.isAdmin;

        if (G.currentUser && G.currentUser.isAdmin) {
            var adminNavLink = $('adminNavLink');
            if (adminNavLink) adminNavLink.classList.remove('hidden');
        }

        G.startStatusCheck();
        G.showMessageTab('inbox');
        G.updateUnreadBadge();
    };

    G.autoLogin = async function() {
        if (!G.token) {
            window.location.href = '/login';
            return;
        }
        try {
            var userData = await G.apiCall('/api/current_user', 'GET', null, true);
            G.currentUser = userData;
            G.isLoggedIn = true;
            G.updateUserDisplay();
        } catch (err) {
            G.isLoggedIn = false;
            G.token = '';
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
    };

})();

Gomoku.init();
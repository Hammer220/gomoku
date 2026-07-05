// 用户模块（登录、注册、认证、个人资料、密码管理）
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 强制登出 ====================

    // 强制登出用户（多页面版本：跳转到登录页）
    G.handleForceLogout = function(message) {
        message = message || '您已被强制登出';
        if (!G.isLoggedIn) return;
        G.isLoggedIn = false;
        // 停止所有定时器和检查
        G.stopStatusCheck();
        G.stopTimer();
        if (G.cleanupOnlineState) G.cleanupOnlineState();
        if (G.stopMatchListRefresh) G.stopMatchListRefresh();
        if (G.stopBannedCountdown) G.stopBannedCountdown();
        // 清除登录状态
        G.token = '';
        localStorage.removeItem('token');
        G.currentUser = null;
        G.showToast(message, true);
        // 延迟跳转到登录页
        setTimeout(function() { window.location.href = '/login'; }, 1500);
    };

    // ==================== 用户状态检查 ====================

    // 定期检查用户状态（封禁、权限变更等）
    G.checkUserStatus = async function() {
        if (!G.isLoggedIn || !G.token) return;
        try {
            var userData = await G.apiCall('/api/current_user', 'GET', null, true);
            // 检查是否被封禁
            if (userData.bannedUntil) {
                var bannedUntil = new Date(userData.bannedUntil * 1000);
                var now = new Date();
                if (now < bannedUntil) {
                    var remainMinutes = Math.ceil((bannedUntil - now) / 60000);
                    G.handleForceLogout('您的账号已被封禁，剩余 ' + remainMinutes + ' 分钟');
                    return;
                }
            }
            G.currentUser = userData;
            G.updateUserDisplay();
            // 管理员权限展示
            if (G.currentUser && G.currentUser.isAdmin) {
                var adminNavLink = document.getElementById('adminNavLink');
                if (adminNavLink) adminNavLink.classList.remove('hidden');
                var adminPanel = document.getElementById('adminContent');
                if (adminPanel && !adminPanel.classList.contains('hidden')) {
                    if (G.loadAdminUsers) await G.loadAdminUsers();
                }
                var adminMgmt = document.getElementById('adminAccountManagement');
                if (adminMgmt) {
                    adminMgmt.classList.toggle('hidden', !G.currentUser.isSuperAdmin);
                }
                var matchMonitor = document.getElementById('onlineMatchMonitor');
                if (matchMonitor && G.currentUser.isSuperAdmin) {
                    matchMonitor.classList.remove('hidden');
                    if (G.loadMatchList) G.loadMatchList();
                }
            }
        } catch (err) {
            var errorStr = err.message || '';
            if (err.status === 403 && (errorStr.includes('封禁') || errorStr.includes('banned'))) {
                G.handleForceLogout('您的账号已被封禁');
                return;
            }
            if (errorStr.includes('401') || errorStr.includes('Unauthorized') || errorStr.includes('未授权')) {
                G.handleForceLogout('登录状态已失效');
            }
        }
    };

    // 启动定期状态检查
    G.startStatusCheck = function() {
        G.stopStatusCheck();
        G.statusCheckInterval = setInterval(G.checkUserStatus, 1000);
    };

    // 停止定期状态检查
    G.stopStatusCheck = function() {
        if (G.statusCheckInterval) {
            clearInterval(G.statusCheckInterval);
            G.statusCheckInterval = null;
        }
    };

    // ==================== 封禁倒计时 ====================

    // 启动封禁倒计时显示
    G.startBannedCountdown = function() {
        G.stopBannedCountdown();
        G.bannedCountdownInterval = setInterval(G.updateBannedCountdown, 1000);
    };

    // 停止封禁倒计时显示
    G.stopBannedCountdown = function() {
        if (G.bannedCountdownInterval) {
            clearInterval(G.bannedCountdownInterval);
            G.bannedCountdownInterval = null;
        }
    };

    // 更新封禁倒计时显示
    G.updateBannedCountdown = function() {
        var countdownElements = document.querySelectorAll('.banned-countdown');
        var needRefresh = false;
        countdownElements.forEach(function(el) {
            var bannedUntil = parseInt(el.dataset.until);
            var now = new Date().getTime();
            var remaining = bannedUntil - now;
            if (remaining <= 0) {
                el.textContent = '已解封';
                el.classList.remove('text-red-600');
                el.classList.add('text-green-600');
                needRefresh = true;
            } else {
                el.textContent = G.formatRemainingTime(bannedUntil);
            }
        });
        if (needRefresh && G.loadAdminUsers) G.loadAdminUsers();
    };

    // ==================== 用户显示更新 ====================

    // 更新页面上所有用户信息显示（防御性：仅更新存在的元素）
    G.updateUserDisplay = function() {
        if (!G.currentUser) return;
        var setText = function(id, text) {
            var el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setText('userNameDisplay', G.currentUser.username);
        setText('userScoreDisplay', G.currentUser.score || 0);
        setText('userWinsDisplay', G.currentUser.wins || 0);
        setText('profileUsername', G.currentUser.username);
        setText('profileScore', G.currentUser.score || 0);
        setText('profileWins', G.currentUser.wins || 0);
        setText('profileGames', G.currentUser.games || 0);
        setText('profileJoinDate', G.currentUser.joinDate || '未知');
        setText('profileLastLogin', G.currentUser.lastLogin || '从未登录');

        // 显示/隐藏管理员导航链接
        var adminNavLink = document.getElementById('adminNavLink');
        if (adminNavLink) {
            if (G.currentUser.isAdmin || G.currentUser.isSuperAdmin) {
                adminNavLink.classList.remove('hidden');
            } else {
                adminNavLink.classList.add('hidden');
            }
        }
    };

    // ==================== 登录 ====================

    // 密码登录
    G.login = async function(username, password, captchaToken) {
        var parts = JSON.parse(captchaToken);
        var res = await G.apiCall('/api/login', 'POST', {
            username: username,
            password: password,
            geetestLot: parts[0],
            geetestCaptchaOutput: parts[1],
            geetestPassToken: parts[2],
            geetestGenTime: parts[3]
        }, true);
        G.token = res.token;
        localStorage.setItem('token', G.token);
        G.currentUser = res.user;
        G.isLoggedIn = true;
        G.showToast('欢迎回来，' + G.currentUser.username + '！');
        window.location.href = '/game';
    };

    // 免密登录
    G.loginPasswordFree = async function(username) {
        var res = await G.apiCall('/api/login/password_free', 'POST', { username: username }, true);
        G.token = res.token;
        localStorage.setItem('token', G.token);
        G.currentUser = res.user;
        G.isLoggedIn = true;
        G.showToast('欢迎回来，' + G.currentUser.username + '！');
        window.location.href = '/game';
    };

    // 检查免密登录剩余次数
    G.checkPasswordFreeAttempts = async function(username) {
        var infoEl = document.getElementById('passwordFreeAttemptsInfo');
        var textEl = document.getElementById('passwordFreeAttemptsText');
        if (!infoEl || !textEl) return;
        if (!username.trim()) {
            infoEl.classList.add('hidden');
            return;
        }
        try {
            var res = await G.apiCall('/api/user/password_free_info', 'POST', { username: username }, true);
            if (res.passwordFree) {
                if (res.maxAttempts > 0) {
                    if (res.remainingAttempts <= 0) {
                        textEl.textContent = '免密登录次数已用尽（' + res.remainingAttempts + '/' + res.maxAttempts + '），请联系管理员';
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-red-600 bg-red-100 rounded-lg p-2';
                    } else {
                        textEl.textContent = '免密登录剩余 ' + res.remainingAttempts + '/' + res.maxAttempts + ' 次';
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2';
                    }
                } else {
                    textEl.textContent = '免密登录无次数限制';
                    infoEl.classList.remove('hidden');
                    infoEl.className = 'text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2';
                }
            } else {
                infoEl.classList.add('hidden');
            }
        } catch (err) {
            infoEl.classList.add('hidden');
        }
    };

    // ==================== 注册 ====================

    // 用户注册
    G.register = async function(username, password, captchaToken) {
        var parts = JSON.parse(captchaToken);
        await G.apiCall('/api/register', 'POST', {
            username: username,
            password: password,
            geetestLot: parts[0],
            geetestCaptchaOutput: parts[1],
            geetestPassToken: parts[2],
            geetestGenTime: parts[3]
        }, true);
        G.showToast('注册成功，请登录');
        var registerModal = document.getElementById('registerModal');
        var loginModal = document.getElementById('loginModal');
        if (registerModal) registerModal.classList.add('hidden');
        if (loginModal) loginModal.classList.remove('hidden');
        sessionStorage.removeItem('registerFormInteracted');
    };

    // ==================== 登出 ====================

    // 用户登出
    G.logout = async function() {
        // 离开联机对局
        if (G.onlineMatchId) {
            await G.apiCall('/api/match/leave', 'POST', { matchId: G.onlineMatchId }).catch(function() {});
        }
        // 发送登出请求
        await G.apiCall('/api/logout', 'POST').catch(function() {});
        // 清除本地状态
        G.token = '';
        localStorage.removeItem('token');
        G.currentUser = null;
        G.isLoggedIn = false;
        // 停止所有定时器
        G.stopStatusCheck();
        G.stopTimer();
        if (G.stopOnlinePolling) G.stopOnlinePolling();
        if (G.stopOnlineTimer) G.stopOnlineTimer();
        if (G.stopHeartbeat) G.stopHeartbeat();
        if (G.cleanupOnlineState) G.cleanupOnlineState();
        if (G.stopMatchListRefresh) G.stopMatchListRefresh();
        G.stopBannedCountdown();
        // 重置联机状态
        G.onlineMatchId = null;
        G.onlineMyColor = null;
        G.onlineOpponent = null;
        G.gameMode = 'ai';
        G.showToast('已退出登录');
        setTimeout(function() { window.location.href = '/login'; }, 1500);
    };

    // ==================== 用户数据加载 ====================

    // 加载用户数据并更新显示
    G.loadUserData = async function() {
        try {
            var userData = await G.apiCall('/api/current_user', 'GET', null, true);
            G.currentUser = userData;
            G.updateUserDisplay();
            // 管理员界面元素显示
            if (G.currentUser && G.currentUser.isAdmin) {
                var adminTab = document.getElementById('adminTab');
                if (adminTab) adminTab.classList.remove('hidden');
                var adminMgmt = document.getElementById('adminAccountManagement');
                if (adminMgmt) {
                    adminMgmt.classList.toggle('hidden', !G.currentUser.isSuperAdmin);
                }
                if (G.currentUser.isSuperAdmin) {
                    var matchMonitor = document.getElementById('onlineMatchMonitor');
                    if (matchMonitor) matchMonitor.classList.remove('hidden');
                }
            }
        } catch (err) {
            console.error('加载用户数据失败:', err);
        }
    };

    // ==================== 密码修改 ====================

    // 修改密码
    G.changePassword = async function() {
        var oldPasswordEl = document.getElementById('changeOldPassword');
        var newPasswordEl = document.getElementById('changeNewPassword');
        var confirmPasswordEl = document.getElementById('changeConfirmPassword');
        if (!oldPasswordEl || !newPasswordEl || !confirmPasswordEl) return;

        var oldPassword = oldPasswordEl.value;
        var newPassword = newPasswordEl.value;
        var confirmPassword = confirmPasswordEl.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            G.showToast('请填写所有密码字段', true);
            return;
        }
        if (newPassword !== confirmPassword) {
            G.showToast('两次输入的新密码不一致', true);
            return;
        }
        try {
            await G.apiCall('/api/profile/update', 'POST', {
                oldPassword: oldPassword,
                newPassword: newPassword
            });
            G.showToast('密码修改成功');
            oldPasswordEl.value = '';
            newPasswordEl.value = '';
            confirmPasswordEl.value = '';
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

})();
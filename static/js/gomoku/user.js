// 用户模块（登录、注册、认证、个人资料、密码管理）
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 强制登出 ====================

    // 强制登出用户（多页面版本：跳转到登录页）
    G.handleForceLogout = function(message) {
        message = message || G.i18n.t('forceLoggedOut');
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

    G._lastUnreadCount = -1;

    // 定期检查用户状态（封禁、权限变更、未读消息等）
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
                    G.handleForceLogout(G.i18n.t('accountBanned') + ', ' + G.i18n.t('remaining') + ' ' + remainMinutes + ' ' + G.i18n.t('minutes'));
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
            // 更新未读消息数
            if (G.updateUnreadBadge) G.updateUnreadBadge();
        } catch (err) {
            var errorStr = err.message || '';
            if (err.status === 403 && (errorStr.includes(G.i18n.t('banned')) || errorStr.includes('banned'))) {
                G.handleForceLogout(G.i18n.t('accountBanned'));
                return;
            }
            if (errorStr.includes('401') || errorStr.includes('Unauthorized') || errorStr.includes(G.i18n.t('unauthorized'))) {
                G.handleForceLogout(G.i18n.t('sessionExpired'));
            }
        }
    };

    // 启动定期状态检查
    G.startStatusCheck = function() {
        G.stopStatusCheck();
        G.statusCheckInterval = setInterval(G.checkUserStatus, 10000);
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
                el.textContent = G.i18n.t('unbanned');
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
        setText('userRankDisplay', G.currentUser.rank || '无段位');
        setText('userWinsDisplay', G.currentUser.wins || 0);
        setText('profileUsername', G.currentUser.username);
        setText('profileScore', G.currentUser.score || 0);
        setText('profileRank', G.currentUser.rank || '无段位');
        setText('profileWins', G.currentUser.wins || 0);
        setText('profileGames', G.currentUser.games || 0);
        setText('profileJoinDate', G.currentUser.joinDate || G.i18n.t('unknown'));
        setText('profileLastLogin', G.currentUser.lastLogin || G.i18n.t('neverLoggedIn'));

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

    // ==================== 消息通知 ====================

    G.showMessageNotification = function(newCount) {
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'toast px-4 py-2 rounded-lg shadow-lg mb-2 bg-blue-100 text-blue-800';
        toast.innerHTML = '<i class="fa-solid fa-envelope mr-2"></i>' + G.i18n.t('youHave') + ' ' + newCount + ' ' + G.i18n.t('newMessages') + ', <a href="/messages" class="underline font-medium">' + G.i18n.t('clickToView') + '</a>';
        container.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 5000);
    };

    G.updateUnreadBadge = function(count) {
        if (count !== undefined && count !== null) {
            var cnt = count || 0;

            if (cnt > G._lastUnreadCount && G._lastUnreadCount >= 0) {
                var newMsgs = cnt - G._lastUnreadCount;
                G.showMessageNotification(newMsgs);
            }
            G._lastUnreadCount = cnt;

            var badge = document.getElementById('unreadBadge');
            if (badge) {
                if (cnt > 0) {
                    badge.textContent = cnt;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            return;
        }

        G.apiCall('/api/messages/unread-count').then(function(data) {
            var count = data.unreadCount || 0;

            if (count > G._lastUnreadCount && G._lastUnreadCount >= 0) {
                var newMsgs = count - G._lastUnreadCount;
                G.showMessageNotification(newMsgs);
            }
            G._lastUnreadCount = count;

            var badge = document.getElementById('unreadBadge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }).catch(function(err) {
            console.error(G.i18n.t('fetchUnreadFailed') + ':', err);
        });
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
        await G.resetGuestData();
        G.showToast(G.i18n.t('welcomeBack') + ', ' + G.currentUser.username + '!');
        window.location.href = '/game';
    };

    // 免密登录
    G.loginPasswordFree = async function(username) {
        var res = await G.apiCall('/api/login/password_free', 'POST', { username: username }, true);
        G.token = res.token;
        localStorage.setItem('token', G.token);
        G.currentUser = res.user;
        G.isLoggedIn = true;
        await G.resetGuestData();
        G.showToast(G.i18n.t('welcomeBack') + ', ' + G.currentUser.username + '!');
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
                        textEl.textContent = G.i18n.t('passwordFreeExhausted') + ' (' + res.remainingAttempts + '/' + res.maxAttempts + '), ' + G.i18n.t('contactAdmin');
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-red-600 bg-red-100 rounded-lg p-2';
                    } else {
                        textEl.textContent = G.i18n.t('passwordFreeRemaining') + ' ' + res.remainingAttempts + '/' + res.maxAttempts + ' ' + G.i18n.t('modelTimes');
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2';
                    }
                } else {
                    textEl.textContent = G.i18n.t('noLimitStatus');
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
        await G.resetGuestData();
        G.showToast(G.i18n.t('registerSuccess'));
        var registerModal = document.getElementById('registerModal');
        var loginModal = document.getElementById('loginModal');
        if (registerModal) registerModal.classList.add('hidden');
        if (loginModal) loginModal.classList.remove('hidden');
        sessionStorage.removeItem('registerFormInteracted');
    };

    // ==================== 访客登录 ====================

    // 生成随机访客账号名（英文、下划线、数字）
    G.generateGuestUsername = function() {
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
        var result = 'guest_';
        for (var i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    // 获取或创建访客账号名
    G.getGuestUsername = function() {
        return localStorage.getItem('guestUsername') || G.generateGuestUsername();
    };

    // 保存访客账号名
    G.saveGuestUsername = function(username) {
        localStorage.setItem('guestUsername', username);
    };

    // 删除访客账号（服务器端）
    G.deleteGuestAccount = async function() {
        var guestUsername = localStorage.getItem('guestUsername');
        if (guestUsername) {
            try {
                await G.apiCall('/api/guest/delete', 'POST', { username: guestUsername }, true);
            } catch (e) {
                console.log(G.i18n.t('deleteGuestFailed') + ':', e);
            }
        }
    };

    // 清除访客本地数据
    G.clearGuestData = function() {
        G.isGuest = false;
        G.guestRemainingGames = 5;
        localStorage.removeItem('isGuest');
        localStorage.removeItem('guestRemainingGames');
        localStorage.removeItem('guestUsername');
    };

    // 访客登录
    G.loginAsGuest = async function() {
        if (G.guestRemainingGames <= 0) {
            G.showToast(G.i18n.t('guestLimitReached'), true);
            return;
        }
        var guestUsername = G.getGuestUsername();
        G.saveGuestUsername(guestUsername);

        // 如果启用了验证码，调用服务端接口验证验证码并创建访客会话
        if (G.captchaEnabled && G.guestGeetestToken && G.guestGeetestToken !== 'disabled') {
            try {
                var parts = JSON.parse(G.guestGeetestToken);
                var res = await G.apiCall('/api/guest/login', 'POST', {
                    username: guestUsername,
                    geetestLot: parts[0],
                    geetestCaptchaOutput: parts[1],
                    geetestPassToken: parts[2],
                    geetestGenTime: parts[3]
                }, true);
                G.token = res.token;
                localStorage.setItem('token', G.token);
                G.currentUser = res.user;
            } catch (err) {
                G.showToast(err.message, true);
                if (G.captchaEnabled) {
                    G.guestGeetestToken = '';
                    G.initGeetestWidget('geetestGuestWidget', function() {});
                }
                return;
            }
        }

        G.isGuest = true;
        G.isLoggedIn = true;
        G.currentUser = G.currentUser || { username: guestUsername, isGuest: true };
        localStorage.setItem('isGuest', 'true');
        localStorage.setItem('guestRemainingGames', G.guestRemainingGames.toString());
        G.showToast(G.i18n.t('welcomeGuest') + ' ' + G.guestRemainingGames + ' ' + G.i18n.t('modelTimes'));
        window.location.href = '/game';
    };

    // 访客使用一次游戏机会
    G.useGuestGame = function() {
        if (!G.isGuest) return;
        G.guestRemainingGames--;
        localStorage.setItem('guestRemainingGames', G.guestRemainingGames.toString());
        if (G.guestRemainingGames <= 0) {
            G.showToast(G.i18n.t('guestLimitReachedGame'), true);
        }
    };

    // 重置访客次数（当用户注册并登录后调用）
    G.resetGuestData = async function() {
        await G.deleteGuestAccount();
        G.clearGuestData();
    };

    // 访客登出
    G.guestLogout = async function() {
        await G.deleteGuestAccount();
        G.clearGuestData();
        G.isLoggedIn = false;
        G.currentUser = null;
        G.token = '';
        localStorage.removeItem('token');
        G.gameMode = 'ai';
        G.showToast(G.i18n.t('guestModeExited'));
        setTimeout(function() { window.location.href = '/login'; }, 1500);
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
        G.showToast(G.i18n.t('loggedOut'));
        setTimeout(function() { window.location.href = '/login'; }, 1500);
    };

    // ==================== 用户数据加载 ====================

    // 加载用户数据并更新显示
    G.loadUserData = async function() {
        try {
            var userData = await G.apiCall('/api/current_user', 'GET', null, true);
            G.currentUser = userData;
            G.updateUserDisplay();

            if (G.WebSocketManager && G.WebSocketManager.usingWebSocket && G.currentUser) {
                G.WebSocketManager.registerUser(G.currentUser.username);
            }

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
            console.error(G.i18n.t('loadUserDataFailed') + ':', err);
        }
    };

    // ==================== 密码修改 ====================

    // 修改密码
    G.changePassword = async function() {
        if (G.isGuest) {
            G.showToast(G.i18n.t('guestCannotChangePassword'), true);
            return;
        }
        var oldPasswordEl = document.getElementById('changeOldPassword');
        var newPasswordEl = document.getElementById('changeNewPassword');
        var confirmPasswordEl = document.getElementById('changeConfirmPassword');
        if (!oldPasswordEl || !newPasswordEl || !confirmPasswordEl) return;

        var oldPassword = oldPasswordEl.value;
        var newPassword = newPasswordEl.value;
        var confirmPassword = confirmPasswordEl.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            G.showToast(G.i18n.t('fillAllPasswordFields'), true);
            return;
        }
        if (newPassword !== confirmPassword) {
            G.showToast(G.i18n.t('passwordMismatch'), true);
            return;
        }
        try {
            await G.apiCall('/api/profile/update', 'POST', {
                oldPassword: oldPassword,
                newPassword: newPassword
            });
            G.showToast(G.i18n.t('passwordChanged'));
            oldPasswordEl.value = '';
            newPasswordEl.value = '';
            confirmPasswordEl.value = '';
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    // ==================== WebSocket 推送事件处理 ====================

    if (G.WebSocketManager) {
        G.WebSocketManager.on('user_status_update', function(data) {
            if (!G.currentUser) return;
            if (data.bannedUntil !== undefined) {
                G.currentUser.bannedUntil = data.bannedUntil;
            }
            if (data.score !== undefined) {
                G.currentUser.score = data.score;
            }
            if (data.rank !== undefined) {
                G.currentUser.rank = data.rank;
            }
            G.updateUserDisplay();
        });

        G.WebSocketManager.on('unread_count_update', function(data) {
            if (G.updateUnreadBadge) {
                G.updateUnreadBadge(data.unreadCount);
            }
        });

        G.WebSocketManager.on('banned_notification', function(data) {
            if (data && data.bannedUntil) {
                var bannedUntil = new Date(data.bannedUntil * 1000);
                var now = new Date();
                if (now < bannedUntil) {
                    var remainMinutes = Math.ceil((bannedUntil - now) / 60000);
                    G.handleForceLogout(G.i18n.t('accountBanned') + ', ' + G.i18n.t('remaining') + ' ' + remainMinutes + ' ' + G.i18n.t('minutes'));
                }
            } else {
                G.currentUser.bannedUntil = null;
            }
        });
    }

})();
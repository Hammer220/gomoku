// ============================================================
// 登录页面初始化脚本
// 负责：验证码加载、登录/注册/免密登录表单事件绑定、自动登录跳转
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    // ==================== 初始化入口 ====================

    // 更新访客剩余次数显示
    G.updateGuestRemainingDisplay = function() {
        var display = document.getElementById('guestRemainingDisplay');
        if (display) {
            display.textContent = G.guestRemainingGames;
        }
        var randomUsername = document.getElementById('guestRandomUsername');
        if (randomUsername) {
            var username = G.getGuestUsername();
            randomUsername.textContent = username;
        }
    };

    // 登录页面初始化
    G.init = async function() {
        // 获取 Canvas 引用（登录页可能没有 Canvas，防御性获取）
        var gameCanvas = document.getElementById('gameCanvas');
        var onlineCanvas = document.getElementById('onlineCanvas');
        if (gameCanvas) {
            G.canvas = gameCanvas;
            G.ctx = gameCanvas.getContext('2d');
        }
        if (onlineCanvas) {
            G.onlineCanvas = onlineCanvas;
            G.onlineCtx = onlineCanvas.getContext('2d');
        }

        // 初始化WebSocket管理器
        if (G.WebSocketManager) {
            G.WebSocketManager.init();
        }

        // ==================== 自动登录 ====================

        // 如果已有 token，先尝试自动登录，成功则跳转到游戏大厅，不显示登录界面
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                var pendingMatchId = sessionStorage.getItem('pendingMatchId');
                if (pendingMatchId) {
                    sessionStorage.removeItem('pendingMatchId');
                    window.location.href = '/game/' + pendingMatchId;
                } else {
                    window.location.href = '/game';
                }
                return;
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
            }
        }

        // 自动登录失败或无 token，显示登录界面
        document.getElementById('loginModal').classList.remove('hidden');

        // 访客登录按钮点击事件
        var guestLoginBtn = document.getElementById('guestLoginBtn');
        if (guestLoginBtn) {
            guestLoginBtn.addEventListener('click', async function() {
                if (!G.captchaEnabled || G.guestGeetestToken) {
                    G.loginAsGuest();
                } else {
                    var captchaInstance = window['gt4Instance_geetestGuestWidget'];
                    if (captchaInstance && captchaInstance.showCaptcha) {
                        captchaInstance.showCaptcha();
                    }
                }
            });
        }
        G.updateGuestRemainingDisplay();

        // 获取前端配置
        var config = await G.apiCall('/api/config', 'GET');
        G.captchaEnabled = config.captchaEnabled !== false;
        G.powEnabled = !!config.powEnabled;
        G.captchaId = config.captchaId || '';
        G.loginCaptchaId = config.loginCaptchaId || '';

        // ==================== Cerberus PoW 首页守卫 ====================

        /** PoW 通过后才初始化极验（省资源）。极验原样保留。*/
        function initGeetests() {
            if (!G.captchaEnabled) {
                var guestBox = document.getElementById('geetestGuestWidget');
                if (guestBox) guestBox.classList.add('hidden');
                G.loginGeetestToken = 'disabled';
                G.guestGeetestToken = 'disabled';
                G.registerGeetestToken = 'disabled';
                return;
            }
            // 极验容器默认可见（恢复原样）
            var geetestLogin = document.getElementById('geetestLoginWidget');
            var geetestGuest = document.getElementById('geetestGuestWidget');
            var geetestRegister = document.getElementById('geetestRegisterWidget');
            if (geetestLogin) geetestLogin.classList.remove('hidden');
            if (geetestRegister) geetestRegister.classList.remove('hidden');
            // guest 容器默认隐藏（访客登录按钮点到时才 show）
            if (geetestGuest) geetestGuest.classList.add('hidden');

            // 初始化极验
            if (geetestLogin) {
                G.initGeetestWidget('geetestLoginWidget', function(){});
            }
            if (geetestGuest) {
                G.initGeetestWidget('geetestGuestWidget', function(){});
            }
        }

        var existingPow = null;
        try { existingPow = sessionStorage.getItem('powSession'); } catch(e) {}

        if (G.powEnabled && !existingPow) {
            // 开启了 PoW 且没有缓存的 session —— 先过守卫
            G.initCerberusPow('powGuard', {
                onPass: function() {
                    // 守卫层隐藏了，露出登录表单，然后才初始化极验
                    var loginModal = document.getElementById('loginModal');
                    if (loginModal) loginModal.classList.remove('hidden');
                    initGeetests();
                },
                onError: function(err) {
                    G.showToast ? G.showToast('PoW 守卫初始化失败', true) : console.error(err);
                    // 失败时仍露出登录表单
                    var loginModal = document.getElementById('loginModal');
                    if (loginModal) loginModal.classList.remove('hidden');
                    setTimeout(initGeetests, 1200);
                },
            });
            // 守卫未过期间先隐藏登录表单，避免露馅
            var loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.add('hidden');
        } else {
            // 跳过守卫：PoW 没开，或 sessionStorage 里已有有效 session（刷新页面）
            if (existingPow) {
                G.powSession_guard = existingPow;
            }
            // 隐藏守卫层
            var pg = document.getElementById('powGuard');
            if (pg) { pg.classList.add('hidden'); pg.style.pointerEvents = 'none'; }
            initGeetests();
        }

        // ==================== 显示注册弹窗 ====================

        // 点击"立即注册"切换到注册表单
        document.getElementById('showRegister').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('registerModal').classList.remove('hidden');
            if (G.captchaEnabled) {
                // 恢复注册极验容器（如果 initGeetests 里没 show 出来）
                var regContainer = document.getElementById('geetestRegisterWidget');
                if (regContainer) regContainer.classList.remove('hidden');
                if (regContainer && !regContainer.hasAttribute('data-initialized')) {
                    regContainer.setAttribute('data-initialized', 'true');
                    G.initGeetestWidget('geetestRegisterWidget', function() {});
                }
            } else {
                G.registerGeetestToken = 'disabled';
            }
        });

        // 点击"立即登录"从注册页切换回登录页
        document.getElementById('showLogin').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('registerModal').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('hidden');
        });

        // ==================== 免密登录 ====================

        // 点击"免密登录"切换到免密登录页面
        document.getElementById('showPasswordFreeLogin').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('passwordFreeLoginPage').classList.remove('hidden');
        });

        // 从免密登录页返回普通登录
        document.getElementById('showLoginFromFree').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('passwordFreeLoginPage').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('hidden');
        });

        // 从免密登录页跳转到注册
        document.getElementById('showRegisterFromFree').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('passwordFreeLoginPage').classList.add('hidden');
            document.getElementById('registerModal').classList.remove('hidden');
        });

        // 免密登录表单提交
        document.getElementById('passwordFreeLoginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            var u = document.getElementById('passwordFreeUsername').value;
            try {
                await G.loginPasswordFree(u);
            } catch (err) {
                G.showToast(err.message, true);
            }
        });

        // 输入用户名时检查免密登录剩余次数
        document.getElementById('passwordFreeUsername').addEventListener('input', function() {
            G.checkPasswordFreeAttempts(this.value);
        });

        // ==================== 登录表单 ====================

        // 登录表单提交
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            var u = document.getElementById('username').value;
            var p = document.getElementById('password').value;
            if (G.powEnabled && !G.powSession_guard) {
                // 守卫已过但 session 被后端判定过期 → 重刷守卫
                G.reopenPowGuard();
                return;
            }
            if (G.captchaEnabled && !G.loginGeetestToken) {
                G.showToast('请完成验证码验证', true);
                return;
            }
            sessionStorage.removeItem('loginFormInteracted');
            try {
                await G.login(u, p, G.loginGeetestToken);
            } catch (err) {
                G.showToast(err.message, true);
                if (G.captchaEnabled) G.refreshGeetestCaptcha(true);
                if (err.message && err.message.indexOf('PoW') >= 0) G.reopenPowGuard();
            }
        });

        // 跟踪登录表单输入（用于判断用户是否已交互）
        document.getElementById('username').addEventListener('input', function() {
            G.loginFormInteracted = true;
            sessionStorage.setItem('loginFormInteracted', 'true');
        });
        document.getElementById('password').addEventListener('input', function() {
            G.loginFormInteracted = true;
            sessionStorage.setItem('loginFormInteracted', 'true');
        });

        // ==================== 注册表单 ====================

        // 注册表单提交
        document.getElementById('registerForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            var u = document.getElementById('regUsername').value;
            var p = document.getElementById('regPassword').value;
            var cp = document.getElementById('confirmPassword').value;
            if (!/^[a-zA-Z0-9_]+$/.test(u)) { G.showToast('用户名只能包含英文、数字和下划线', true); return; }
            if (p !== cp) { G.showToast('密码不一致', true); return; }
            if (p.length < 6) { G.showToast('密码至少6位', true); return; }
            if (G.powEnabled && !G.powSession_guard) { G.reopenPowGuard(); return; }
            if (G.captchaEnabled && !G.registerGeetestToken) { G.showToast('请完成验证码验证', true); return; }
            sessionStorage.removeItem('registerFormInteracted');
            try {
                await G.register(u, p, G.registerGeetestToken);
            } catch (err) {
                G.showToast(err.message, true);
                if (G.captchaEnabled) G.refreshGeetestCaptcha(false);
                if (err.message && err.message.indexOf('PoW') >= 0) G.reopenPowGuard();
            }
        });

        // 跟踪注册表单输入
        document.getElementById('regUsername').addEventListener('input', function() {
            G.registerFormInteracted = true;
            sessionStorage.setItem('registerFormInteracted', 'true');
        });
        document.getElementById('regPassword').addEventListener('input', function() {
            G.registerFormInteracted = true;
            sessionStorage.setItem('registerFormInteracted', 'true');
        });
        document.getElementById('confirmPassword').addEventListener('input', function() {
            G.registerFormInteracted = true;
            sessionStorage.setItem('registerFormInteracted', 'true');
        });
    };

    // 启动初始化
    G.init();
})();
// ============================================================
// 登录页面初始化脚本
// 负责：验证码加载、登录/注册/免密登录表单事件绑定、自动登录跳转
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    // ==================== 初始化入口 ====================

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

        // 初始化极验登录验证码
        await new Promise(function(resolve) {
            G.initGeetestWidget('geetestLoginWidget', function() {
                resolve();
            });
        });

        // ==================== 显示注册弹窗 ====================

        // 点击"立即注册"切换到注册表单
        document.getElementById('showRegister').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('registerModal').classList.remove('hidden');
            // 延迟初始化注册验证码，确保容器可见后再渲染
            setTimeout(function() {
                var regContainer = document.getElementById('geetestRegisterWidget');
                if (regContainer && !regContainer.hasAttribute('data-initialized')) {
                    regContainer.setAttribute('data-initialized', 'true');
                    G.initGeetestWidget('geetestRegisterWidget', function() {
                        // 注册验证码初始化完成
                    });
                }
            }, 300);
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
            if (!G.loginGeetestToken) {
                G.showToast('请完成验证码验证', true);
                return;
            }
            sessionStorage.removeItem('loginFormInteracted');
            try {
                await G.login(u, p, G.loginGeetestToken);
            } catch (err) {
                G.showToast(err.message, true);
                G.refreshGeetestCaptcha(true);
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
            if (p !== cp) { G.showToast('密码不一致', true); return; }
            if (p.length < 6) { G.showToast('密码至少6位', true); return; }
            if (!G.registerGeetestToken) { G.showToast('请完成验证码验证', true); return; }
            sessionStorage.removeItem('registerFormInteracted');
            try {
                await G.register(u, p, G.registerGeetestToken);
            } catch (err) {
                G.showToast(err.message, true);
                G.refreshGeetestCaptcha(false);
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

        // ==================== 自动登录 ====================

        // 如果已有 token，尝试自动登录，成功则跳转到游戏大厅
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                // 登录页面没有游戏 UI，直接跳转到游戏大厅
                window.location.href = '/game';
            } catch (e) {
                // token 无效，清除并停留在登录页
                G.token = '';
                localStorage.removeItem('token');
            }
        }
    };

    // 启动初始化
    G.init();
})();
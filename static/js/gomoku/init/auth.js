// ============================================================
// 主页初始化 - 认证部分
// 负责：登录/注册、免密登录、验证码事件绑定
// ============================================================
(function() {
    var G = window.Gomoku;

    document.getElementById('showRegister').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('registerModal').classList.remove('hidden');
        setTimeout(function() {
            var regContainer = document.getElementById('geetestRegisterWidget');
            if (regContainer && !regContainer.hasAttribute('data-initialized')) {
                regContainer.setAttribute('data-initialized', 'true');
                G.initGeetestWidget('geetestRegisterWidget', function() {
                });
            }
        }, 300);
    });

    document.getElementById('showLogin').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('registerModal').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('hidden');
    });

    document.getElementById('showPasswordFreeLogin').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('passwordFreeLoginPage').classList.remove('hidden');
    });

    document.getElementById('showLoginFromFree').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('passwordFreeLoginPage').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('hidden');
    });

    document.getElementById('showRegisterFromFree').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('passwordFreeLoginPage').classList.add('hidden');
        document.getElementById('registerModal').classList.remove('hidden');
    });

    document.getElementById('passwordFreeLoginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        var u = document.getElementById('passwordFreeUsername').value;
        try {
            await G.loginPasswordFree(u);
        } catch (err) {
            G.showToast(err.message, true);
        }
    });

    document.getElementById('passwordFreeUsername').addEventListener('input', function() {
        G.checkPasswordFreeAttempts(this.value);
    });

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

    document.getElementById('username').addEventListener('input', function() {
        G.loginFormInteracted = true;
        sessionStorage.setItem('loginFormInteracted', 'true');
    });
    document.getElementById('password').addEventListener('input', function() {
        G.loginFormInteracted = true;
        sessionStorage.setItem('loginFormInteracted', 'true');
    });

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

})();
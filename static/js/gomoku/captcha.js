// 验证码模块（极验四代验证码）
// Cloudflare Turnstile 验证码已注释保留，当前使用极验
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== Cloudflare Turnstile（已注释保留） ====================
    // 以下为 Turnstile 验证码的实现代码，已注释保留供后续启用

    //     // 获取 Turnstile Site Key
//     G.getTurnstileSiteKey = async function() {
//         try {
//             var res = await fetch('/api/captcha/turnstile/sitekey');
//             var data = await res.json();
//             if (data.code === 0) {
//                 G.turnstileSiteKey = data.sitekey;
//             }
//         } catch (error) {
//             console.error('Failed to get Turnstile site key:', error);
//         }
//     };
// 
//     // 初始化 Turnstile 验证码
//     G.initTurnstileWidget = function(containerId) { ... };
// 
//     // 刷新 Turnstile 验证码
//     G.refreshTurnstileCaptcha = function(isLogin) { ... };

    // ==================== 极验四代验证码 ====================

    // 初始化极验四代验证码
    // containerId: 验证码容器 DOM ID（'geetestLoginWidget' 或 'geetestRegisterWidget'）
    // callback: 验证码初始化完成后的回调函数（可选）
    G.initGeetestWidget = function(containerId, callback) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        function doInitGeetest() {
            // 检查极验 SDK 是否已加载
            if (typeof initGeetest4 !== 'function') {
                G.showToast('验证组件加载失败，请刷新页面重试', true);
                if (callback) callback();
                return;
            }

            // 根据容器 ID 选择不同的 captchaId（登录/注册使用不同的验证码）
            var captchaId = containerId === 'geetestLoginWidget'
                ? '4f9d3983ec3e3f57df82b0ccad9e273a'
                : 'a02cc5f652aa762b93710d33448f70b5';

            // 初始化极验四代验证码（滑动验证）
            initGeetest4({
                captchaId: captchaId,
                product: 'float',      // 浮动模式
                riskType: 'slide',     // 滑动验证
                language: 'zh',        // 中文
                onError: function(err) {
                    G.showToast('验证初始化失败，请重试', true);
                    if (callback) callback();
                }
            }, function(captchaObj) {
                if (callback) callback();
                // 保存验证码实例到全局，供后续重置使用
                window['gt4Instance_' + containerId] = captchaObj;
                var targetContainer = document.getElementById(containerId);
                if (targetContainer) targetContainer.innerHTML = '';
                captchaObj.appendTo('#' + containerId);

                // 验证成功回调：提取验证参数并生成令牌
                captchaObj.onSuccess(function() {
                    var result = captchaObj.getValidate();
                    var validateData = result;
                    if (result && result.detail) validateData = result.detail;
                    if (!validateData) {
                        G.showToast('验证码验证失败，请重试', true);
                        captchaObj.reset();
                        return;
                    }
                    // 提取极验四代验证参数
                    var lotNumber = validateData.lot_number;
                    var captchaOutput = validateData.captcha_output;
                    var passToken = validateData.pass_token;
                    var genTime = validateData.gen_time;
                    if (!lotNumber || !captchaOutput || !passToken || !genTime) {
                        G.showToast('验证码参数缺失，请重试', true);
                        captchaObj.reset();
                        return;
                    }
                    // 将验证参数序列化为令牌
                    var token = JSON.stringify([lotNumber, captchaOutput, passToken, genTime]);
                    if (containerId === 'geetestLoginWidget') {
                        G.loginGeetestToken = token;
                        sessionStorage.removeItem('loginFormInteracted');
                    } else {
                        G.registerGeetestToken = token;
                        sessionStorage.removeItem('registerFormInteracted');
                    }
                    // 显示验证成功状态
                    container.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-green-500 text-white"><i class="fa-solid fa-check"></i></div>';
                    G.showToast('验证成功');
                });

                // 验证失败回调
                captchaObj.onFail(function(err) {
                    if (containerId === 'geetestLoginWidget') {
                        G.loginGeetestToken = '';
                    } else {
                        G.registerGeetestToken = '';
                    }
                    G.showToast('验证失败，请重试', true);
                });

                // 验证组件错误回调
                captchaObj.onError(function(err) {
                    G.showToast('验证组件加载异常，请重试', true);
                });
            });
        }

        // 如果极验 SDK 已加载，直接初始化
        if (typeof initGeetest4 === 'function') {
            doInitGeetest();
            return;
        }

        // 动态加载极验 SDK
        var script = document.createElement('script');
        script.src = 'https://static.geetest.com/v4/gt4.js';
        script.async = true;
        script.crossOrigin = 'anonymous';

        // 加载超时处理（3秒）
        var loadTimeout = setTimeout(function() {
            G.showToast('验证组件加载超时，请刷新页面重试', true);
            if (callback) callback();
        }, 3000);

        script.onload = function() {
            clearTimeout(loadTimeout);
            setTimeout(doInitGeetest, 50);
        };

        script.onerror = function(e) {
            clearTimeout(loadTimeout);
            G.showToast('加载验证组件失败，请检查网络连接', true);
            if (callback) callback();
        };

        document.head.appendChild(script);
    };

    // 刷新极验验证码（重新初始化）
    // isLogin: true=登录验证码, false=注册验证码
    G.refreshGeetestCaptcha = function(isLogin) {
        var containerId = isLogin ? 'geetestLoginWidget' : 'geetestRegisterWidget';
        var container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<span class="text-xs text-gray-500">点击刷新</span>';
            setTimeout(function() { G.initGeetestWidget(containerId); }, 100);
        }
    };

    // ==================== Turnstile SDK 预加载（已注释保留） ====================

    //     // 预加载 Turnstile SDK
//     G.loadTurnstileSDK = function() { ... };

    // ==================== 登录后 Turnstile 二次验证（已注释保留） ====================
    // 以下为登录后的第二层人机认证实现，已注释保留供后续启用

    /*
    G.initPostLoginTurnstile = function() { ... };
    G.renderPostLoginTurnstile = function() { ... };
    G.completePostLoginVerification = async function() { ... };
    */

})();
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
                // 容灾模式：SDK 未加载，生成绕过令牌，保证业务不中断
                var bypassToken = JSON.stringify(['', '', '', '']);
                if (containerId === 'geetestLoginWidget') {
                    G.loginGeetestToken = bypassToken;
                } else if (containerId === 'geetestGuestWidget') {
                    G.guestGeetestToken = bypassToken;
                } else {
                    G.registerGeetestToken = bypassToken;
                }
                G.showToast('验证组件加载失败，已启用容灾模式', true);
                if (callback) callback();
                return;
            }

            // 根据容器 ID 选择不同的 captchaId（登录/注册/访客使用不同的验证码）
            var captchaId;
            if (containerId === 'geetestLoginWidget') {
                captchaId = '4f9d3983ec3e3f57df82b0ccad9e273a';
            } else if (containerId === 'geetestGuestWidget') {
                captchaId = '4f9d3983ec3e3f57df82b0ccad9e273a';
            } else {
                captchaId = 'a02cc5f652aa762b93710d33448f70b5';
            }

            var langMap = {
                'zh-CN': 'zho',
                'zh-TW': 'zho-tw',
                'en': 'eng'
            };
            var captchaLang = langMap[G.i18n.currentLang] || 'zho';

            // 访客登录使用 bind 模式（隐藏按钮式），其他使用 float 模式
            var isBindMode = containerId === 'geetestGuestWidget';
            // 初始化极验四代验证码（滑动验证）
            var geetestConfig = {
                captchaId: captchaId,
                product: isBindMode ? 'bind' : 'float',
                riskType: 'slide',     // 滑动验证
                width: '100%',
                language: captchaLang,
                onError: function(err) {
                    G.showToast('验证初始化失败，请重试', true);
                    if (callback) callback();
                }
            };
            if (!isBindMode) {
                geetestConfig.nativeButton = {
                    width: '100%',
                    height: '56px'
                };
            }
            initGeetest4(geetestConfig, function(captchaObj) {
                if (callback) callback();
                // 保存验证码实例到全局，供后续重置使用
                window['gt4Instance_' + containerId] = captchaObj;
                if (isBindMode) {
                    // bind 模式不需要 appendTo，通过 showCaptcha() 触发
                    var targetContainer = document.getElementById(containerId);
                    if (targetContainer) targetContainer.innerHTML = '';
                } else {
                    var targetContainer = document.getElementById(containerId);
                    if (targetContainer) targetContainer.innerHTML = '';
                    captchaObj.appendTo('#' + containerId);
                }

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
                    } else if (containerId === 'geetestGuestWidget') {
                        G.guestGeetestToken = token;
                        G.loginAsGuest();
                    } else {
                        G.registerGeetestToken = token;
                        sessionStorage.removeItem('registerFormInteracted');
                    }
                    // 验证成功，token 已保存，让验证码组件显示默认通过样式
                    G.showToast('验证成功');
                });

                // 验证失败回调
                captchaObj.onFail(function(err) {
                    if (containerId === 'geetestLoginWidget') {
                        G.loginGeetestToken = '';
                    } else if (containerId === 'geetestGuestWidget') {
                        G.guestGeetestToken = '';
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

        // 加载超时处理（3秒），触发容灾模式
        var loadTimeout = setTimeout(function() {
            var bypassToken = JSON.stringify(['', '', '', '']);
            if (containerId === 'geetestLoginWidget') {
                G.loginGeetestToken = bypassToken;
            } else if (containerId === 'geetestGuestWidget') {
                G.guestGeetestToken = bypassToken;
            } else {
                G.registerGeetestToken = bypassToken;
            }
            G.showToast('验证组件加载超时，已启用容灾模式', true);
            if (callback) callback();
        }, 3000);

        script.onload = function() {
            clearTimeout(loadTimeout);
            setTimeout(doInitGeetest, 50);
        };

        script.onerror = function(e) {
            clearTimeout(loadTimeout);
            // 容灾模式：SDK 脚本加载失败，生成绕过令牌
            var bypassToken = JSON.stringify(['', '', '', '']);
            if (containerId === 'geetestLoginWidget') {
                G.loginGeetestToken = bypassToken;
            } else if (containerId === 'geetestGuestWidget') {
                G.guestGeetestToken = bypassToken;
            } else {
                G.registerGeetestToken = bypassToken;
            }
            G.showToast('加载验证组件失败，已启用容灾模式', true);
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
// ============================================================
// 主页（index.html）初始化脚本 - 主入口
// 已拆分为 init/ 下的多个子模块：
//   init/auth.js       - 登录/注册、验证码、免密登录
//   init/game.js       - 游戏模式、棋子颜色、AI难度、双人对战、棋盘点击
//   init/admin.js      - 管理后台监控、用户封禁、批量操作、对局监控
//   init/settings.js   - 密码修改、棋盘颜色设置、排行榜、游戏记录、窗口事件
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = window.Gomoku;

    G.init = async function() {
        G.canvas = document.getElementById('gameCanvas');
        G.ctx = G.canvas.getContext('2d');
        G.onlineCanvas = document.getElementById('onlineCanvas');
        G.onlineCtx = G.onlineCanvas.getContext('2d');

        if (G.WebSocketManager) {
            G.WebSocketManager.init();
            if (G.initWebSocketPollingIntegration) {
                G.initWebSocketPollingIntegration();
            }
        }

        var autoLoginSuccess = false;
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                autoLoginSuccess = true;
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
            }
        }

        if (autoLoginSuccess) {
            if (G.loadBoardColorSettings) await G.loadBoardColorSettings();
            G.showGameUI();
            G.calcCanvasSize();
            G.resetGame();
            G.startStatusCheck();
            await G.recoverOnlineMatch();
            if (G.handleRouteChange) G.handleRouteChange();
        } else {
            document.getElementById('loginModal').classList.remove('hidden');
            var config = await G.apiCall('/api/config', 'GET');
            G.captchaEnabled = config.captchaEnabled !== false;
            // 保存后端返回的 captchaId，保证与 config.ini 一致
            G.captchaId = config.captchaId || '';
            G.loginCaptchaId = config.loginCaptchaId || '';
            if (G.captchaEnabled) {
                await new Promise(function(resolve) {
                    G.initGeetestWidget('geetestLoginWidget', function() {
                        resolve();
                    });
                });
            } else {
                G.loginGeetestToken = 'disabled';
            }
        }
    };

    G.init();

    G.initReplayEvents();

    if (G.handleRouteChange) G.handleRouteChange();

})();
// ============================================================
// 个人中心页面初始化脚本
// 负责：个人资料、游戏记录、数据统计、积分排行榜、密码修改、
//       棋盘颜色设置、自动登录等
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    // 安全获取 DOM 元素（防御性：元素不存在时返回 null）
    var $ = function(id) { return document.getElementById(id); };

    // ==================== 初始化入口 ====================

    // 个人中心页面初始化
    G.init = async function() {
        // ==================== 标签页切换 ====================

        // 个人中心子标签页切换
        var tabMappings = {
            'profileTab': 'profileContent',
            'historyTab': 'historyContent',
            'statsTab': 'statsContent',
            'leaderboardTab': 'leaderboardContent'
        };

        Object.keys(tabMappings).forEach(function(tabId) {
            var tab = $(tabId);
            if (tab) {
                tab.addEventListener('click', function() { G.showTab(tabMappings[tabId]); });
            }
        });

        // ==================== 退出按钮 ====================

        var logoutBtn = $('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                if (G.isGuest) {
                    G.guestLogout();
                } else {
                    G.logout();
                }
            });
        }

        // ==================== 密码修改 ====================

        var changePasswordBtn = $('changePasswordBtn');
        if (changePasswordBtn) changePasswordBtn.addEventListener('click', G.changePassword);

        // ==================== 棋盘颜色设置 ====================

        // 棋盘线条颜色
        var boardLineColor = $('boardLineColor');
        var boardLineColorText = $('boardLineColorText');
        if (boardLineColor) {
            boardLineColor.addEventListener('input', function() {
                if (boardLineColorText) boardLineColorText.value = boardLineColor.value;
            });
        }
        if (boardLineColorText) {
            boardLineColorText.addEventListener('input', function() {
                var color = boardLineColorText.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(color) && boardLineColor) {
                    boardLineColor.value = color;
                }
            });
        }

        // 星位点颜色
        var boardDotColor = $('boardDotColor');
        var boardDotColorText = $('boardDotColorText');
        if (boardDotColor) {
            boardDotColor.addEventListener('input', function() {
                if (boardDotColorText) boardDotColorText.value = boardDotColor.value;
            });
        }
        if (boardDotColorText) {
            boardDotColorText.addEventListener('input', function() {
                var color = boardDotColorText.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(color) && boardDotColor) {
                    boardDotColor.value = color;
                }
            });
        }

        // 保存棋盘颜色设置
        var saveBoardColorBtn = $('saveBoardColorBtn');
        if (saveBoardColorBtn) saveBoardColorBtn.addEventListener('click', G.saveBoardColorSettings);

        // 重置棋盘颜色设置
        var resetBoardColorBtn = $('resetBoardColorBtn');
        if (resetBoardColorBtn) {
            resetBoardColorBtn.addEventListener('click', function() {
                G.boardLineColor = '#8B5A2B';
                G.boardDotColor = '#8B5A2B';
                G.selectedBackground = '';
                var blc = $('boardLineColor');
                var blct = $('boardLineColorText');
                var bdc = $('boardDotColor');
                var bdct = $('boardDotColorText');
                if (blc) blc.value = G.boardLineColor;
                if (blct) blct.value = G.boardLineColor;
                if (bdc) bdc.value = G.boardDotColor;
                if (bdct) bdct.value = G.boardDotColor;
                if (G.drawBoard) G.drawBoard();
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                if (G.applyBackground) G.applyBackground('');
                if (G.renderBackgroundGrid) G.renderBackgroundGrid();
                if (G.saveBoardColorSettings) G.saveBoardColorSettings();
            });
        }

        // 加载背景图片列表
        var loadBackgroundsBtn = $('loadBackgroundsBtn');
        if (loadBackgroundsBtn) loadBackgroundsBtn.addEventListener('click', G.loadBackgrounds);

        // ==================== 积分排行榜 ====================

        // 刷新排行榜
        var refreshLeaderboardBtn = $('refreshLeaderboardBtn');
        if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', G.loadLeaderboard);

        // ==================== 游戏记录事件 ====================

        // 模式筛选
        var historyModeFilter = $('historyModeFilter');
        if (historyModeFilter) {
            historyModeFilter.addEventListener('change', function() {
                G.historyCurrentPage = 1;
                G.renderHistory();
            });
        }

        // 结果筛选
        var historyResultFilter = $('historyResultFilter');
        if (historyResultFilter) {
            historyResultFilter.addEventListener('change', function() {
                G.historyCurrentPage = 1;
                G.renderHistory();
            });
        }

        // 刷新记录
        var refreshHistoryBtn = $('refreshHistoryBtn');
        if (refreshHistoryBtn) {
            refreshHistoryBtn.addEventListener('click', function() {
                G.historyCurrentPage = 1;
                G.loadHistory();
            });
        }

        // 翻页按钮
        var historyPrevPage = $('historyPrevPage');
        if (historyPrevPage) {
            historyPrevPage.addEventListener('click', function() {
                if (G.historyCurrentPage > 1) {
                    G.historyCurrentPage--;
                    G.renderHistory();
                }
            });
        }

        var historyNextPage = $('historyNextPage');
        if (historyNextPage) {
            historyNextPage.addEventListener('click', function() {
                G.historyCurrentPage++;
                G.renderHistory();
            });
        }

        // ==================== 棋盘尺寸监听 ====================

        // 窗口大小变化时重绘棋盘
        window.addEventListener('resize', function() {
            if (G.drawBoard) G.drawBoard();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
        });

        // 初始化容器尺寸监听器
        if (G.initCanvasObserver) G.initCanvasObserver();

        // ==================== 自动登录 ====================

        // 访客模式不允许访问个人中心，跳转到游戏大厅
        if (G.isGuest) {
            window.location.href = '/game';
            return;
        }

        // 如果已有 token，尝试自动登录
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                // 更新用户信息显示
                if (G.updateUserDisplay) G.updateUserDisplay();
                // 加载用户数据
                if (G.loadHistory) G.loadHistory();
                if (G.loadLeaderboard) G.loadLeaderboard();
                if (G.loadBoardColorSettings) G.loadBoardColorSettings();
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
                // 自动登录失败，跳转到登录页
                window.location.href = '/login';
                return;
            }
        } else {
            // 未登录，跳转到登录页
            window.location.href = '/login';
            return;
        }

        // ==================== 显示默认标签页 ====================

        // 显示默认的个人资料标签页
        if (G.showTab) G.showTab('profileContent');

        // 开始状态检查
        if (G.startStatusCheck) G.startStatusCheck();
        // 更新未读消息数
        if (G.updateUnreadBadge) G.updateUnreadBadge();

        // ==================== 页面关闭处理 ====================

        // 页面关闭时停止检查
        window.addEventListener('beforeunload', function(event) {
            if (G.stopStatusCheck) G.stopStatusCheck();
            if (G.stopBannedCountdown) G.stopBannedCountdown();
        });

        // 初始化复盘事件
        if (G.initReplayEvents) G.initReplayEvents();

        // 初始化WebSocket管理器
        if (G.WebSocketManager) {
            G.WebSocketManager.init();
        }
    };

    // 启动初始化
    G.init();
})();
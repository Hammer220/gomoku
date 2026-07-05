// ============================================================
// 主页（index.html）初始化脚本
// 包含：登录/注册验证码、标签页切换、游戏模式选择、AI 对战、
//        双人对战设置、联机对战、管理后台、棋盘颜色设置、
//        自动登录恢复、批量操作等所有功能的事件绑定
// 注意：此文件为旧版整合初始化脚本，新版页面已拆分为
//        init_game.js / init_login.js / init_admin.js / init_user.js
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = window.Gomoku;

    // ==================== 初始化入口 ====================

    // 主页初始化：绑定所有事件和处理自动登录
    G.init = async function() {
        // 获取 Canvas 引用
        G.canvas = document.getElementById('gameCanvas');
        G.ctx = G.canvas.getContext('2d');
        G.onlineCanvas = document.getElementById('onlineCanvas');
        G.onlineCtx = G.onlineCanvas.getContext('2d');

        // 显示登录弹窗
        document.getElementById('loginModal').classList.remove('hidden');

        // 初始化极验登录验证码（异步等待完成）
        await new Promise(function(resolve) {
            G.initGeetestWidget('geetestLoginWidget', function() {
                resolve();
            });
        });

        // ==================== 登录/注册弹窗切换 ====================

        // 切换到注册弹窗（延迟初始化注册验证码，确保容器可见）
        document.getElementById('showRegister').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('registerModal').classList.remove('hidden');
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

        // 切换回登录弹窗
        document.getElementById('showLogin').addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('registerModal').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('hidden');
        });

        // ==================== 免密登录 ====================

        // 切换到免密登录页面
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

        // ==================== 退出与标签页切换 ====================

        // 退出登录
        document.getElementById('logoutBtn').addEventListener('click', G.logout);

        // 主标签页切换（游戏大厅 / 个人中心 / 管理后台等）
        document.getElementById('gameTab').addEventListener('click', function() { G.showTab('gameContent'); });
        document.getElementById('onlineTab').addEventListener('click', function() { G.showTab('onlineContent'); });
        document.getElementById('profileTab').addEventListener('click', function() { G.showTab('profileContent'); });
        document.getElementById('historyTab').addEventListener('click', function() { G.showTab('historyContent'); });
        document.getElementById('statsTab').addEventListener('click', function() { G.showTab('statsContent'); });
        document.getElementById('leaderboardTab').addEventListener('click', function() { G.showTab('leaderboardContent'); });
        document.getElementById('adminTab').addEventListener('click', function() { G.showTab('adminContent'); });

        // ==================== 联机对战事件 ====================

        // 创建联机房间
        document.getElementById('onlineCreateBtn').addEventListener('click', G.onlineCreateMatch);
        // 加入联机房间
        document.getElementById('onlineJoinBtn').addEventListener('click', G.onlineJoinMatch);
        // 离开联机房间
        document.getElementById('onlineLeaveBtn').addEventListener('click', G.onlineLeaveMatch);
        document.getElementById('onlineLeaveBtn').classList.add('hidden');

        // 绑定关闭房间处理
        G.attachCloseRoomHandler();

        // ==================== 管理后台：监控画布点击事件 ====================

        // 超级管理员在监控画布上强制落子
        document.getElementById('monitorCanvas') && document.getElementById('monitorCanvas').addEventListener('click', function(e) {
            if (!G.monitorMatchId) return;
            var canvas = document.getElementById('monitorCanvas');
            var rect = canvas.getBoundingClientRect();
            var displayWidth = rect.width;
            var displayHeight = rect.height;
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var cellSize = displayWidth / (G.BOARD_SIZE - 1);
            var col = Math.round(x / cellSize);
            var row = Math.round(y / cellSize);
            if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
                var player = parseInt(document.getElementById('monitorPlayerSelect').value);
                G.forceMove(row, col, player);
            }
        });

        // ==================== 密码修改 ====================

        document.getElementById('changePasswordBtn').addEventListener('click', G.changePassword);

        // ==================== 管理后台：管理员账号管理 ====================

        // 创建管理员账号
        document.getElementById('createAdminBtn').addEventListener('click', G.createAdminAccount);
        // 刷新管理员列表
        document.getElementById('refreshAdminsBtn').addEventListener('click', G.loadAdminList);

        // ==================== 管理后台：游戏记录管理 ====================

        // 查看所有记录
        document.getElementById('viewAllRecordsBtn').addEventListener('click', G.viewAllRecords);
        // 关闭记录弹窗
        document.getElementById('closeAllRecordsBtn').addEventListener('click', G.closeAllRecordsModal);
        // 导出记录
        document.getElementById('exportRecordsBtn').addEventListener('click', G.exportRecords);
        // 用户筛选
        document.getElementById('recordsUserFilter').addEventListener('change', function() {
            if (G.allRecordsData) {
                G.renderRecords(G.allRecordsData, this.value);
            }
        });

        // ==================== 棋盘颜色设置 ====================

        // 棋盘线条颜色输入（color picker 同步到文本输入框）
        document.getElementById('boardLineColor').addEventListener('input', function() {
            document.getElementById('boardLineColorText').value = this.value;
        });
        // 棋盘线条颜色文本输入（手动输入 HEX 颜色值）
        document.getElementById('boardLineColorText').addEventListener('input', function() {
            var color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('boardLineColor').value = color;
            }
        });

        // 星位点颜色输入（color picker 同步到文本输入框）
        document.getElementById('boardDotColor').addEventListener('input', function() {
            document.getElementById('boardDotColorText').value = this.value;
        });
        // 星位点颜色文本输入（手动输入 HEX 颜色值）
        document.getElementById('boardDotColorText').addEventListener('input', function() {
            var color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('boardDotColor').value = color;
            }
        });

        // 保存棋盘颜色设置到服务器
        document.getElementById('saveBoardColorBtn').addEventListener('click', G.saveBoardColorSettings);

        // 重置棋盘颜色为默认值（棕色 #8B5A2B）
        document.getElementById('resetBoardColorBtn').addEventListener('click', function() {
            G.boardLineColor = '#8B5A2B';
            G.boardDotColor = '#8B5A2B';
            G.selectedBackground = '';
            document.getElementById('boardLineColor').value = G.boardLineColor;
            document.getElementById('boardLineColorText').value = G.boardLineColor;
            document.getElementById('boardDotColor').value = G.boardDotColor;
            document.getElementById('boardDotColorText').value = G.boardDotColor;
            G.drawBoard();
            G.drawOnlineBoard();
            G.applyBackground('');
            G.renderBackgroundGrid();
            G.saveBoardColorSettings();
        });

        // 加载背景图片列表
        document.getElementById('loadBackgroundsBtn').addEventListener('click', G.loadBackgrounds);

        // ==================== 积分排行榜 ====================

        // 刷新排行榜
        document.getElementById('refreshLeaderboardBtn').addEventListener('click', G.loadLeaderboard);

        // ==================== 游戏记录事件 ====================

        // 模式筛选变化时重新渲染（重置到第一页）
        document.getElementById('historyModeFilter') && document.getElementById('historyModeFilter').addEventListener('change', function() {
            G.historyCurrentPage = 1;
            G.renderHistory();
        });
        // 结果筛选变化时重新渲染（重置到第一页）
        document.getElementById('historyResultFilter') && document.getElementById('historyResultFilter').addEventListener('change', function() {
            G.historyCurrentPage = 1;
            G.renderHistory();
        });
        // 刷新记录
        document.getElementById('refreshHistoryBtn') && document.getElementById('refreshHistoryBtn').addEventListener('click', function() {
            G.historyCurrentPage = 1;
            G.loadHistory();
        });
        // 上一页
        document.getElementById('historyPrevPage') && document.getElementById('historyPrevPage').addEventListener('click', function() {
            if (G.historyCurrentPage > 1) { G.historyCurrentPage--; G.renderHistory(); }
        });
        // 下一页
        document.getElementById('historyNextPage') && document.getElementById('historyNextPage').addEventListener('click', function() {
            G.historyCurrentPage++;
            G.renderHistory();
        });

        // ==================== 联机对局监控事件 ====================

        // 刷新对局列表
        document.getElementById('refreshMatchListBtn') && document.getElementById('refreshMatchListBtn').addEventListener('click', G.loadMatchList);
        // 强制关闭对局
        document.getElementById('forceCloseMatchBtn') && document.getElementById('forceCloseMatchBtn').addEventListener('click', G.forceCloseMatch);
        // 强制重启对局
        document.getElementById('forceRestartMatchBtn') && document.getElementById('forceRestartMatchBtn').addEventListener('click', G.forceRestartMatch);
        // 强制关闭所有房间
        document.getElementById('forceCloseAllRoomsBtn') && document.getElementById('forceCloseAllRoomsBtn').addEventListener('click', G.forceCloseAllRooms);

        // ==================== 游戏模式按钮 ====================

        // AI 对战模式
        document.getElementById('modeAI').addEventListener('click', function() {
            G.gameMode = 'ai';
            G.updateModeButtons();
            G.resetGame();
        });
        // 双人对战模式
        document.getElementById('modePVP').addEventListener('click', function() {
            G.gameMode = 'pvp';
            G.updateModeButtons();
            G.resetGame();
        });
        // 联机对战模式（需要登录）
        document.getElementById('modeOnline').addEventListener('click', function() {
            if (!G.currentUser) {
                alert('请先登录');
                G.showTab('loginContent');
                return;
            }
            G.showTab('onlineContent');
        });

        // ==================== 玩家棋子颜色按钮 ====================

        // 选择黑棋（先手）
        document.getElementById('playerColorBlack').addEventListener('click', function() {
            if (G.playerColor === 1) return;
            G.playerColor = 1;
            G.updateColorButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('已切换为黑棋，游戏重新开始');
            } else {
                G.showToast('您将执黑先行');
            }
        });
        // 选择白棋（后手）
        document.getElementById('playerColorWhite').addEventListener('click', function() {
            if (G.playerColor === 2) return;
            G.playerColor = 2;
            G.updateColorButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('已切换为白棋，游戏重新开始');
            } else {
                G.showToast('您将执白后行');
            }
        });

        // ==================== AI 难度按钮 ====================

        // 简单难度
        document.getElementById('aiEasy').addEventListener('click', function() {
            if (G.aiDifficulty === 'easy') return;
            G.aiDifficulty = 'easy';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为简单，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为简单');
            }
        });
        // 中等难度
        document.getElementById('aiMedium').addEventListener('click', function() {
            if (G.aiDifficulty === 'medium') return;
            G.aiDifficulty = 'medium';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为中等，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为中等');
            }
        });
        // 困难难度
        document.getElementById('aiHard').addEventListener('click', function() {
            if (G.aiDifficulty === 'hard') return;
            G.aiDifficulty = 'hard';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为困难，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为困难');
            }
        });

        // ==================== 双人对战设置 ====================

        // 禁手规则开关（仅黑棋生效）
        document.getElementById('pvpForbidden').addEventListener('change', function(e) {
            G.pvpForbidden = e.target.checked;
            G.showToast(G.pvpForbidden ? '已启用禁手规则' : '已禁用禁手规则');
            if (G.gameMode === 'pvp' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('设置已更改，游戏重新开始');
            }
        });

        // 时间限制按钮（无限制 / 5分钟 / 10分钟 / 30分钟）
        var timeButtons = ['timeNone', 'time5min', 'time10min', 'time30min'];
        var timeLimits = [0, 300, 600, 1800];
        var timeLabels = ['无限制', '5分钟', '10分钟', '30分钟'];

        timeButtons.forEach(function(id, index) {
            document.getElementById(id).addEventListener('click', function() {
                G.pvpTimeLimit = timeLimits[index];
                // 更新按钮样式：高亮当前选中，取消其他
                timeButtons.forEach(function(btnId) {
                    var btn = document.getElementById(btnId);
                    btn.classList.remove('bg-primary', 'text-white');
                });
                document.getElementById(id).classList.add('bg-primary', 'text-white');
                // 显示时间限制提示
                var display = document.getElementById('pvpTimerDisplay');
                var text = document.getElementById('pvpTimeLimitText');
                if (G.pvpTimeLimit > 0) {
                    display.classList.remove('hidden');
                    text.textContent = timeLabels[index];
                } else {
                    display.classList.add('hidden');
                }
                G.showToast('时间限制: ' + timeLabels[index]);
                if (G.gameMode === 'pvp' && G.gameActive) {
                    G.stopPvpTurnTimer();
                    G.resetGame();
                }
            });
        });

        // ==================== 游戏操作按钮 ====================

        // 重新开始 / 新游戏
        document.getElementById('restartBtn').addEventListener('click', G.resetGame);
        // 悔棋
        document.getElementById('undoBtn').addEventListener('click', G.undoMove);
        // 保存棋局
        document.getElementById('saveGameBtn').addEventListener('click', G.saveGame);
        // 新游戏
        document.getElementById('newGameBtn').addEventListener('click', G.resetGame);

        // ==================== 棋盘点击事件 ====================

        // 本地棋盘 Canvas 点击落子
        G.canvas.addEventListener('click', function(e) {
            if (!G.gameActive) return;
            // AI 模式下，非玩家回合不可落子
            if (G.gameMode === 'ai' && G.currentPlayer !== G.playerColor) return;
            // 联机模式下，非自己回合不可落子
            if (G.gameMode === 'online' && G.currentPlayer !== G.onlineMyColor) return;
            var rect = G.canvas.getBoundingClientRect();
            var scaleX = G.canvas.width / rect.width;
            var scaleY = G.canvas.height / rect.height;
            var x = (e.clientX - rect.left) * scaleX;
            var y = (e.clientY - rect.top) * scaleY;
            var margin = G.PIECE_SIZE / 2 + 4;
            var col = Math.round((x - margin) / G.CELL_SIZE);
            var row = Math.round((y - margin) / G.CELL_SIZE);
            if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE && G.gameBoard[row][col] === 0) {
                G.placePiece(row, col, G.currentPlayer);
                if (G.gameMode === 'online') G.makeOnlineMove(row, col);
            }
        });

        // ==================== 管理后台：用户管理 ====================

        // 封禁用户
        document.getElementById('adminBanBtn').addEventListener('click', async function() {
            var u = document.getElementById('adminBanUsername').value;
            var m = parseInt(document.getElementById('adminBanMinutes').value);
            if (!u || m < 1) return G.showToast('请输入用户名和分钟', true);
            if (G.currentUser && u === G.currentUser.username) return G.showToast('不能封禁自己', true);
            var btn = document.getElementById('adminBanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await G.apiCall('/api/admin/ban', 'POST', { username: u, minutes: m });
                G.showToast('已封禁 ' + u + ' ' + m + ' 分钟');
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-ban mr-1"></i>封禁';
            }
        });

        // 解封用户
        document.getElementById('adminUnbanBtn').addEventListener('click', async function() {
            var u = document.getElementById('adminBanUsername').value;
            if (!u) return;
            var btn = document.getElementById('adminUnbanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await G.apiCall('/api/admin/unban', 'POST', { username: u });
                G.showToast('已解封 ' + u);
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-unlock mr-1"></i>解封';
            }
        });

        // 强制登出用户
        document.getElementById('adminKickBtn').addEventListener('click', async function() {
            var u = document.getElementById('adminBanUsername').value;
            if (!u) return;
            var btn = document.getElementById('adminKickBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await G.apiCall('/api/admin/kick', 'POST', { username: u });
                G.showToast('已强制登出 ' + u);
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>强制登出';
            }
        });

        // 注销用户
        document.getElementById('adminDeleteBtn').addEventListener('click', async function() {
            var u = document.getElementById('adminBanUsername').value;
            if (!u || u === 'admin') return G.showToast('不能删除admin', true);
            if (!confirm('确定注销用户 ' + u + ' ？')) return;
            var btn = document.getElementById('adminDeleteBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await G.apiCall('/api/admin/user/' + u, 'DELETE');
                G.showToast('已注销 ' + u);
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>注销';
            }
        });

        // ==================== 管理后台：批量操作 ====================

        // 全选复选框：选中/取消所有未禁用的用户复选框
        document.getElementById('selectAllUsers').addEventListener('change', function() {
            var checkboxes = document.querySelectorAll('.user-checkbox:not(:disabled)');
            checkboxes.forEach(function(cb) { cb.checked = this.checked; });
            G.updateSelectedCount();
        });

        // 批量封禁
        document.getElementById('batchBanBtn').addEventListener('click', async function() {
            var users = G.getSelectedUsers();
            if (users.length === 0) return G.showToast('请先选择用户', true);
            var minutes = prompt('请输入封禁时长（分钟）:', '10');
            if (!minutes || parseInt(minutes) <= 0) return;
            var btn = document.getElementById('batchBanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                var result = await G.apiCall('/api/admin/batch_ban', 'POST', { usernames: users, minutes: parseInt(minutes) });
                G.showToast('批量封禁完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-users mr-1"></i>批量封禁';
            }
        });

        // 批量解封
        document.getElementById('batchUnbanBtn').addEventListener('click', async function() {
            var users = G.getSelectedUsers();
            if (users.length === 0) return G.showToast('请先选择用户', true);
            var btn = document.getElementById('batchUnbanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                var result = await G.apiCall('/api/admin/batch_unban', 'POST', { usernames: users });
                G.showToast('批量解封完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-unlock-alt mr-1"></i>批量解封';
            }
        });

        // 批量强制登出
        document.getElementById('batchKickBtn').addEventListener('click', async function() {
            var users = G.getSelectedUsers();
            if (users.length === 0) return G.showToast('请先选择用户', true);
            if (!confirm('确定强制登出选中的 ' + users.length + ' 个用户？')) return;
            var btn = document.getElementById('batchKickBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                var result = await G.apiCall('/api/admin/batch_kick', 'POST', { usernames: users });
                G.showToast('批量强制登出完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>批量登出';
            }
        });

        // 批量注销
        document.getElementById('batchDeleteBtn').addEventListener('click', async function() {
            var users = G.getSelectedUsers();
            if (users.length === 0) return G.showToast('请先选择用户', true);
            if (!confirm('确定注销选中的 ' + users.length + ' 个用户？此操作不可恢复！')) return;
            var btn = document.getElementById('batchDeleteBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                var result = await G.apiCall('/api/admin/batch_delete', 'POST', { usernames: users });
                G.showToast('批量注销完成：成功 ' + result.success_count + ' 个，失败 ' + result.failed_count + ' 个');
                await G.loadAdminUsers();
            } catch (e) {
                G.showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>批量注销';
            }
        });

        // ==================== 窗口大小监听 ====================

        // 窗口大小变化时重绘棋盘
        window.addEventListener('resize', function() {
            G.drawBoard();
            G.drawOnlineBoard();
        });
        // 初始化容器尺寸监听器（ResizeObserver）
        G.initCanvasObserver();

        // ==================== 自动登录 ====================

        // 如果保存了 token，尝试自动登录恢复会话
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                // 加载棋盘颜色设置
                if (G.loadBoardColorSettings) await G.loadBoardColorSettings();
                // 显示游戏大厅 UI
                G.showGameUI();
                // 初始化棋盘
                G.calcCanvasSize();
                G.resetGame();
                // 开始状态检查（心跳）
                G.startStatusCheck();
                // 恢复之前未完成的联机对局
                await G.recoverOnlineMatch();
            } catch (e) {
                // token 无效，清除并停留在登录页
                G.token = '';
                localStorage.removeItem('token');
            }
        }

        // ==================== 页面关闭处理 ====================

        // 页面关闭时停止状态检查和封禁倒计时
        window.addEventListener('beforeunload', function(event) {
            G.stopStatusCheck();
            G.stopBannedCountdown();
        });

        // 初始化复盘事件
        G.initReplayEvents();
    };

    // 启动初始化
    G.init();
})();
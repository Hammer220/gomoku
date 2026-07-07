// ============================================================
// 游戏大厅页面初始化脚本
// 负责：游戏模式选择、AI对战、双人对战、联机对战、棋盘交互、
//       管理后台功能、棋盘颜色设置、自动登录恢复等
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";
    var G = Gomoku;

    // 安全获取 DOM 元素（防御性：元素不存在时返回 null）
    var $ = function(id) { return document.getElementById(id); };

    // ==================== 初始化入口 ====================

    // 游戏大厅页面初始化
    G.init = async function() {
        // 获取 Canvas 引用
        G.canvas = $('gameCanvas');
        G.ctx = G.canvas ? G.canvas.getContext('2d') : null;
        G.onlineCanvas = $('onlineCanvas');
        G.onlineCtx = G.onlineCanvas ? G.onlineCanvas.getContext('2d') : null;

        // ==================== 标签页切换 ====================

        // 游戏大厅子标签页切换（本地对局 / 联机对战）
        var gameTabEl = $('gameTab');
        var onlineTabEl = $('onlineTab');
        if (gameTabEl) {
            gameTabEl.addEventListener('click', function() { G.showTab('gameContent'); });
        }
        if (onlineTabEl) {
            onlineTabEl.addEventListener('click', function() { G.showTab('onlineContent'); });
        }

        // ==================== 游戏模式按钮 ====================

        // AI 对战模式
        var modeAI = $('modeAI');
        if (modeAI) {
            modeAI.addEventListener('click', function() {
                G.gameMode = 'ai';
                G.updateModeButtons();
                G.resetGame();
            });
        }

        // 双人对战模式
        var modePVP = $('modePVP');
        if (modePVP) {
            modePVP.addEventListener('click', function() {
                G.gameMode = 'pvp';
                G.updateModeButtons();
                G.resetGame();
            });
        }

        // 联机对战模式
        var modeOnline = $('modeOnline');
        if (modeOnline) {
            modeOnline.addEventListener('click', function() {
                if (!G.currentUser) {
                    alert('请先登录');
                    G.showTab('loginContent');
                    return;
                }
                G.showTab('onlineContent');
            });
        }

        // ==================== 玩家棋子颜色按钮 ====================

        // 选择黑棋
        var playerColorBlack = $('playerColorBlack');
        if (playerColorBlack) {
            playerColorBlack.addEventListener('click', function() {
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
        }

        // 选择白棋
        var playerColorWhite = $('playerColorWhite');
        if (playerColorWhite) {
            playerColorWhite.addEventListener('click', function() {
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
        }

        // ==================== AI 难度按钮 ====================

        // 简单难度
        var aiEasy = $('aiEasy');
        if (aiEasy) {
            aiEasy.addEventListener('click', function() {
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
        }

        // 中等难度
        var aiMedium = $('aiMedium');
        if (aiMedium) {
            aiMedium.addEventListener('click', function() {
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
        }

        // 困难难度
        var aiHard = $('aiHard');
        if (aiHard) {
            aiHard.addEventListener('click', function() {
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
        }

        // ==================== 双人对战设置 ====================

        // 禁手规则开关
        var pvpForbidden = $('pvpForbidden');
        if (pvpForbidden) {
            pvpForbidden.addEventListener('change', function(e) {
                G.pvpForbidden = e.target.checked;
                G.showToast(G.pvpForbidden ? '已启用禁手规则' : '已禁用禁手规则');
                if (G.gameMode === 'pvp' && G.gameActive && G.moveHistory.length > 0) {
                    G.resetGame();
                    G.showToast('设置已更改，游戏重新开始');
                }
            });
        }

        // 时间限制按钮
        var timeButtons = ['timeNone', 'time5min', 'time10min', 'time30min'];
        var timeLimits = [0, 300, 600, 1800];
        var timeLabels = ['无限制', '5分钟', '10分钟', '30分钟'];

        timeButtons.forEach(function(id, index) {
            var btn = $(id);
            if (!btn) return;
            btn.addEventListener('click', function() {
                G.pvpTimeLimit = timeLimits[index];
                // 更新按钮样式
                timeButtons.forEach(function(btnId) {
                    var b = $(btnId);
                    if (b) {
                        b.classList.remove('bg-primary', 'text-white');
                    }
                });
                btn.classList.add('bg-primary', 'text-white');
                // 显示时间限制提示
                var display = $('pvpTimerDisplay');
                var text = $('pvpTimeLimitText');
                if (G.pvpTimeLimit > 0) {
                    if (display) display.classList.remove('hidden');
                    if (text) text.textContent = timeLabels[index];
                } else {
                    if (display) display.classList.add('hidden');
                }
                G.showToast('时间限制: ' + timeLabels[index]);
                if (G.gameMode === 'pvp' && G.gameActive) {
                    G.stopPvpTurnTimer();
                    G.resetGame();
                }
            });
        });

        // ==================== 游戏操作按钮 ====================

        // 重新开始
        var restartBtn = $('restartBtn');
        if (restartBtn) restartBtn.addEventListener('click', G.resetGame);

        // 悔棋
        var undoBtn = $('undoBtn');
        if (undoBtn) undoBtn.addEventListener('click', G.undoMove);

        // 保存棋局
        var saveGameBtn = $('saveGameBtn');
        if (saveGameBtn) saveGameBtn.addEventListener('click', G.saveGame);

        // 新游戏
        var newGameBtn = $('newGameBtn');
        if (newGameBtn) newGameBtn.addEventListener('click', G.resetGame);

        // ==================== 棋盘点击事件 ====================

        // 本地棋盘点击落子
        if (G.canvas) {
            G.canvas.addEventListener('click', function(e) {
                if (!G.gameActive) return;
                if (G.gameMode === 'ai' && G.currentPlayer !== G.playerColor) return;
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
        }

        // ==================== 联机对战事件 ====================

        // 创建联机房间
        var onlineCreateBtn = $('onlineCreateBtn');
        if (onlineCreateBtn) onlineCreateBtn.addEventListener('click', G.onlineCreateMatch);

        // 加入联机房间
        var onlineJoinBtn = $('onlineJoinBtn');
        if (onlineJoinBtn) onlineJoinBtn.addEventListener('click', G.onlineJoinMatch);

        // 离开联机房间
        var onlineLeaveBtn = $('onlineLeaveBtn');
        if (onlineLeaveBtn) {
            onlineLeaveBtn.addEventListener('click', G.onlineLeaveMatch);
            onlineLeaveBtn.classList.add('hidden');
        }

        // 退出观战
        var spectateLeaveBtn = $('spectateLeaveBtn');
        if (spectateLeaveBtn) {
            spectateLeaveBtn.addEventListener('click', G.leaveSpectate);
            spectateLeaveBtn.classList.add('hidden');
        }

        // 刷新观战列表
        var refreshSpectateBtn = $('refreshSpectateBtn');
        if (refreshSpectateBtn) {
            refreshSpectateBtn.addEventListener('click', G.loadSpectatableMatches);
        }

        // 关闭房间处理
        if (G.attachCloseRoomHandler) G.attachCloseRoomHandler();

        // ==================== 管理后台：监控画布点击事件 ====================

        // 超级管理员监控画布强制落子
        var monitorCanvas = $('monitorCanvas');
        if (monitorCanvas) {
            monitorCanvas.addEventListener('click', function(e) {
                if (!G.monitorMatchId) return;
                var canvas = monitorCanvas;
                var rect = canvas.getBoundingClientRect();
                var displayWidth = rect.width;
                var displayHeight = rect.height;
                var x = e.clientX - rect.left;
                var y = e.clientY - rect.top;
                var cellSize = displayWidth / (G.BOARD_SIZE - 1);
                var col = Math.round(x / cellSize);
                var row = Math.round(y / cellSize);
                if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE) {
                    var player = parseInt($('monitorPlayerSelect').value);
                    G.forceMove(row, col, player);
                }
            });
        }

        // ==================== 管理后台：用户管理 ====================

        // 封禁用户
        var adminBanBtn = $('adminBanBtn');
        if (adminBanBtn) {
            adminBanBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                var m = parseInt($('adminBanMinutes').value);
                if (!u || m < 1) return G.showToast('请输入用户名和分钟', true);
                var btn = adminBanBtn;
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
        }

        // 解封用户
        var adminUnbanBtn = $('adminUnbanBtn');
        if (adminUnbanBtn) {
            adminUnbanBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u) return;
                var btn = adminUnbanBtn;
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
        }

        // 强制登出用户
        var adminKickBtn = $('adminKickBtn');
        if (adminKickBtn) {
            adminKickBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u) return;
                var btn = adminKickBtn;
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
        }

        // 注销用户
        var adminDeleteBtn = $('adminDeleteBtn');
        if (adminDeleteBtn) {
            adminDeleteBtn.addEventListener('click', async function() {
                var u = $('adminBanUsername').value;
                if (!u || u === 'admin') return G.showToast('不能删除admin', true);
                if (!confirm('确定注销用户 ' + u + ' ？')) return;
                var btn = adminDeleteBtn;
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
        }

        // ==================== 管理后台：批量操作 ====================

        // 全选复选框
        var selectAllUsers = $('selectAllUsers');
        if (selectAllUsers) {
            selectAllUsers.addEventListener('change', function() {
                var checkboxes = document.querySelectorAll('.user-checkbox:not(:disabled)');
                checkboxes.forEach(function(cb) { cb.checked = selectAllUsers.checked; });
                if (G.updateSelectedCount) G.updateSelectedCount();
            });
        }

        // 批量封禁
        var batchBanBtn = $('batchBanBtn');
        if (batchBanBtn) {
            batchBanBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                var minutes = prompt('请输入封禁时长（分钟）:', '10');
                if (!minutes || parseInt(minutes) <= 0) return;
                var btn = batchBanBtn;
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
        }

        // 批量解封
        var batchUnbanBtn = $('batchUnbanBtn');
        if (batchUnbanBtn) {
            batchUnbanBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                var btn = batchUnbanBtn;
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
        }

        // 批量强制登出
        var batchKickBtn = $('batchKickBtn');
        if (batchKickBtn) {
            batchKickBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                if (!confirm('确定强制登出选中的 ' + users.length + ' 个用户？')) return;
                var btn = batchKickBtn;
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
        }

        // 批量注销
        var batchDeleteBtn = $('batchDeleteBtn');
        if (batchDeleteBtn) {
            batchDeleteBtn.addEventListener('click', async function() {
                var users = G.getSelectedUsers ? G.getSelectedUsers() : [];
                if (users.length === 0) return G.showToast('请先选择用户', true);
                if (!confirm('确定注销选中的 ' + users.length + ' 个用户？此操作不可恢复！')) return;
                var btn = batchDeleteBtn;
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
        }

        // ==================== 管理后台：联机对局监控 ====================

        // 刷新对局列表
        var refreshMatchListBtn = $('refreshMatchListBtn');
        if (refreshMatchListBtn) refreshMatchListBtn.addEventListener('click', G.loadMatchList);

        // 强制关闭对局
        var forceCloseMatchBtn = $('forceCloseMatchBtn');
        if (forceCloseMatchBtn) forceCloseMatchBtn.addEventListener('click', G.forceCloseMatch);

        // 强制重启对局
        var forceRestartMatchBtn = $('forceRestartMatchBtn');
        if (forceRestartMatchBtn) forceRestartMatchBtn.addEventListener('click', G.forceRestartMatch);

        // 强制关闭所有房间
        var forceCloseAllRoomsBtn = $('forceCloseAllRoomsBtn');
        if (forceCloseAllRoomsBtn) forceCloseAllRoomsBtn.addEventListener('click', G.forceCloseAllRooms);

        // ==================== 管理后台：查看所有记录 ====================

        var viewAllRecordsBtn = $('viewAllRecordsBtn');
        if (viewAllRecordsBtn) viewAllRecordsBtn.addEventListener('click', G.viewAllRecords);

        var closeAllRecordsBtn = $('closeAllRecordsBtn');
        if (closeAllRecordsBtn) closeAllRecordsBtn.addEventListener('click', G.closeAllRecordsModal);

        var exportRecordsBtn = $('exportRecordsBtn');
        if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', G.exportRecords);

        var recordsUserFilter = $('recordsUserFilter');
        if (recordsUserFilter) {
            recordsUserFilter.addEventListener('change', function() {
                if (G.allRecordsData) {
                    G.renderRecords(G.allRecordsData, recordsUserFilter.value);
                }
            });
        }

        // ==================== 管理后台：创建管理员账号 ====================

        var createAdminBtn = $('createAdminBtn');
        if (createAdminBtn) createAdminBtn.addEventListener('click', G.createAdminAccount);

        var refreshAdminsBtn = $('refreshAdminsBtn');
        if (refreshAdminsBtn) refreshAdminsBtn.addEventListener('click', G.loadAdminList);

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
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    if (boardLineColor) boardLineColor.value = color;
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
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    if (boardDotColor) boardDotColor.value = color;
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
                G.drawBoard();
                G.drawOnlineBoard();
                if (G.applyBackground) G.applyBackground('');
                if (G.renderBackgroundGrid) G.renderBackgroundGrid();
                if (G.saveBoardColorSettings) G.saveBoardColorSettings();
            });
        }

        // 加载背景图片列表
        var loadBackgroundsBtn = $('loadBackgroundsBtn');
        if (loadBackgroundsBtn) loadBackgroundsBtn.addEventListener('click', G.loadBackgrounds);

        // ==================== 积分排行榜 ====================

        var refreshLeaderboardBtn = $('refreshLeaderboardBtn');
        if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', G.loadLeaderboard);

        // ==================== 游戏记录 ====================

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

        // 翻页
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

        // ==================== 退出按钮 ====================

        var logoutBtn = $('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', G.logout);

        // ==================== 窗口尺寸变化 ====================

        // 窗口大小变化时重绘棋盘
        window.addEventListener('resize', function() {
            G.drawBoard();
            G.drawOnlineBoard();
        });

        // 初始化容器尺寸监听器
        if (G.initCanvasObserver) G.initCanvasObserver();

        // ==================== 自动登录恢复 ====================

        // 如果已有 token，尝试自动登录并恢复游戏状态
        if (G.token) {
            try {
                G.currentUser = await G.apiCall('/api/current_user', 'GET', null, true);
                G.isLoggedIn = true;
                // 立即更新用户信息显示（包括管理员导航链接）
                if (G.updateUserDisplay) G.updateUserDisplay();
                // 加载棋盘颜色设置
                if (G.loadBoardColorSettings) await G.loadBoardColorSettings();
                // 显示游戏界面
                if (G.showGameUI) G.showGameUI();
                // 初始化棋盘
                G.calcCanvasSize();
                G.resetGame();
                // 开始状态检查
                if (G.startStatusCheck) G.startStatusCheck();
                // 更新未读消息数
                if (G.updateUnreadBadge) G.updateUnreadBadge();
                // 恢复联机对局
                if (G.recoverOnlineMatch) await G.recoverOnlineMatch();
            } catch (e) {
                G.token = '';
                localStorage.removeItem('token');
                // 自动登录失败，跳转到登录页
                window.location.href = '/login';
                return;
            }
        }

        // ==================== 页面关闭处理 ====================

        // 页面关闭时停止检查
        window.addEventListener('beforeunload', function(event) {
            if (G.stopStatusCheck) G.stopStatusCheck();
            if (G.stopBannedCountdown) G.stopBannedCountdown();
        });

        // 初始化复盘事件
        if (G.initReplayEvents) G.initReplayEvents();
    };

    // 启动初始化
    G.init();
})();
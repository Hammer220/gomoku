// ============================================================
// 游戏流程控制模块
// 负责：落子、胜负判定、计时器、悔棋、存档加载、游戏模式切换、
//       AI 对战、双人对战等游戏流程和 UI 交互
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 安全 DOM 获取 ====================

    // 安全获取 DOM 元素（document.getElementById 的简写）
    var $ = function(id) {
        return document.getElementById(id);
    };

    // ==================== 落子与游戏流程 ====================

    // 在本地棋盘上落子
    // 返回 true 表示落子成功，false 表示落子失败
    G.placePiece = function(row, col, player) {
        if (!G.gameActive || row < 0 || row >= G.BOARD_SIZE || col < 0 || col >= G.BOARD_SIZE || G.gameBoard[row][col] !== 0) return false;

        // 禁手检查（仅黑棋且启用了禁手规则时检查）
        if (G.shouldCheckForbidden() && player === 1) {
            var tempBoard = G.gameBoard.map(function(r) { return r.slice(); });
            tempBoard[row][col] = 1;
            var forbiddenCheck = G.checkForbidden(row, col, tempBoard);
            if (forbiddenCheck.forbidden) {
                G.showToast('禁手: ' + forbiddenCheck.reason, true);
                return false;
            }
        }

        // 落子并记录
        G.gameBoard[row][col] = player;
        G.moveHistory.push({ row: row, col: col, player: player });
        G.drawBoard();

        // 检查胜负
        if (G.checkWin(row, col, player)) { G.handleGameOver(player); return true; }
        // 检查平局
        if (G.checkDraw()) { G.handleGameOver(0); return true; }

        // 切换回合
        G.currentPlayer = (player === 1 ? 2 : 1);
        G.updateUI();

        // 双人对战单步计时
        if (G.gameMode === 'pvp' && G.pvpTimeLimit > 0) {
            G.startPvpTurnTimer();
        }

        // AI 回合（延迟200ms让玩家看到自己的落子）
        if (G.gameMode === 'ai' && G.gameActive && G.currentPlayer === G.getAIColor()) setTimeout(G.aiMove, 200);
        return true;
    };

    // ==================== 双人对战计时 ====================

    // 启动双人对战单步计时（超时判负）
    G.startPvpTurnTimer = function() {
        G.stopPvpTurnTimer();
        G.pvpTurnStartTime = Date.now();
        G.pvpTurnTimer = setInterval(function() {
            var elapsed = Math.floor((Date.now() - G.pvpTurnStartTime) / 1000);
            var remaining = G.pvpTimeLimit - elapsed;
            if (remaining <= 0) {
                // 超时判负
                G.stopPvpTurnTimer();
                var loser = G.currentPlayer;
                var winner = loser === 1 ? 2 : 1;
                G.showToast('超时！' + (loser === 1 ? '黑棋' : '白棋') + '判负', true);
                G.handleGameOver(winner);
            } else if (remaining <= 10) {
                // 剩余10秒内提示
                G.showToast('剩余 ' + remaining + ' 秒！', remaining <= 5);
            }
        }, 1000);
    };

    // 停止双人对战单步计时
    G.stopPvpTurnTimer = function() {
        if (G.pvpTurnTimer) {
            clearInterval(G.pvpTurnTimer);
            G.pvpTurnTimer = null;
        }
    };

    // ==================== 游戏结束处理 ====================

    // 处理游戏结束（winner: 1=黑棋胜, 2=白棋胜, 0=平局）
    G.handleGameOver = function(winner) {
        G.gameActive = false;
        G.stopTimer();
        if (G.stopOnlinePolling) G.stopOnlinePolling();
        // 联机模式自动离开房间
        if (G.gameMode === 'online' && G.onlineMatchId) {
            G.apiCall('/api/match/leave', 'POST', { matchId: G.onlineMatchId }).catch(function() {});
            G.onlineMatchId = null;
            G.onlineMyColor = null;
            G.onlineOpponent = null;
        }
        var isPlayerWin = (winner === G.playerColor);
        // 更新胜利弹窗
        var winnerText = $('winnerText');
        var winMessage = $('winMessage');
        var winModal = $('winModal');
        if (winnerText) {
            winnerText.textContent = winner === 0 ? '平局' : (winner === 1 ? '黑棋' : '白棋') + ' 胜利';
        }
        if (winMessage) {
            winMessage.textContent = isPlayerWin ? '恭喜获胜！' : (winner === 0 ? '势均力敌' : '继续努力');
        }
        if (winModal) winModal.classList.remove('hidden');

        // 保存游戏记录到服务器
        if (G.currentUser) {
            if (G.gameMode === 'ai') {
                if (winner === 0) {
                    G.saveGameRecord('draw', 'ai');
                } else {
                    var result = winner === G.playerColor ? 'win' : 'lose';
                    G.saveGameRecord(result, 'ai');
                }
            } else if (G.gameMode === 'pvp') {
                G.saveGameRecord(winner === 0 ? 'draw' : (winner === 1 ? 'win' : 'lose'), 'pvp');
            }
        }
    };

    // ==================== UI 更新 ====================

    // 更新游戏界面显示（状态文本、步数、悔棋次数、时间）
    G.updateUI = function() {
        if (!G.gameActive) return;
        var label = G.gameMode === 'ai' ? (G.currentPlayer === G.playerColor ? '你' : 'AI') : (G.currentPlayer === 1 ? '黑棋' : '白棋');
        var statusText = $('statusText');
        var moveCount = $('moveCount');
        var undoCountText = $('undoCountText');
        var gameTimeDisplay = $('gameTimeDisplay');
        if (statusText) statusText.textContent = '游戏进行中 - ' + label + ' (' + (G.currentPlayer === 1 ? '黑棋' : '白棋') + ') 回合';
        if (moveCount) moveCount.textContent = G.moveHistory.length;
        if (undoCountText) undoCountText.textContent = '悔棋次数: ' + G.undoCount + '/3';
        if (gameTimeDisplay) gameTimeDisplay.textContent = G.formatTime(G.gameTime);
    };

    // ==================== 计时器 ====================

    // 启动游戏计时器（每秒更新）
    G.startTimer = function() {
        if (G.timerInterval) clearInterval(G.timerInterval);
        G.timerInterval = setInterval(function() {
            if (G.gameActive) {
                G.gameTime++;
                var dt = $('gameTimeDisplay');
                if (dt) dt.textContent = G.formatTime(G.gameTime);
            }
        }, 1000);
    };

    // 停止游戏计时器
    G.stopTimer = function() {
        clearInterval(G.timerInterval);
        G.timerInterval = null;
    };

    // ==================== 游戏重置 ====================

    // 重置游戏状态（清空棋盘、重置计时和悔棋次数）
    G.resetGame = function() {
        G.stopTimer();
        G.stopPvpTurnTimer();
        G.initBoard();
        G.currentPlayer = 1;
        G.gameActive = true;
        G.moveHistory = [];
        G.gameTime = 0;
        G.undoCount = 0;
        G.winningCells = [];
        G.drawBoard();
        G.updateUI();
        var winModal = $('winModal');
        if (winModal) winModal.classList.add('hidden');
        // 根据模式启动计时和 AI
        if (G.gameMode === 'ai' && G.playerColor === 2) { G.startTimer(); setTimeout(function() { G.aiMove(); }, 300); }
        else if (G.gameMode === 'online') { G.startTimer(); if (G.startOnlinePolling) G.startOnlinePolling(); }
        else { G.startTimer(); }
    };

    // ==================== 悔棋 ====================

    // 悔棋操作（AI 模式下悔两步，PVP 模式下悔一步，最多3次）
    G.undoMove = function() {
        if (!G.gameActive || G.moveHistory.length === 0) { G.showToast('没有可悔棋的操作', true); return; }
        if (G.undoCount >= 3) { G.showToast('悔棋次数已用完', true); return; }

        // AI 模式下需要悔两步（自己+AI），PVP 模式下悔一步
        var stepsToUndo = 1;
        if (G.gameMode === 'ai') {
            stepsToUndo = (G.currentPlayer === G.playerColor) ? 2 : 1;
        }

        if (G.moveHistory.length < stepsToUndo) {
            G.showToast('无法悔棋', true);
            return;
        }

        // 逐步撤销
        for (var i = 0; i < stepsToUndo; i++) {
            var m = G.moveHistory.pop();
            if (m) G.gameBoard[m.row][m.col] = 0;
        }

        G.undoCount++;
        // 恢复当前回合
        if (G.gameMode === 'ai') {
            G.currentPlayer = G.playerColor;
        } else {
            G.currentPlayer = (G.currentPlayer === 1 ? 2 : 1);
        }
        G.winningCells = [];
        G.drawBoard();
        G.updateUI();
        G.showToast('已悔' + stepsToUndo + '步');
    };

    // ==================== 游戏记录保存 ====================

    // 保存游戏记录到服务器，并更新玩家积分
    // result: 'win' | 'lose' | 'draw'
    // mode: 'ai' | 'pvp' | 'online'
    G.saveGameRecord = async function(result, mode, opponent) {
        mode = mode || G.gameMode || 'ai';
        var modeLabels = { ai: '人机对战', pvp: '双人对战', online: '联机对战' };
        var modeLabel = modeLabels[mode] || mode;
        var opponentLabel = opponent || '';
        // 生成对手标签
        if (mode === 'ai' && !opponent) {
            var difficultyText = G.aiDifficulty === 'easy' ? '简单' : (G.aiDifficulty === 'medium' ? '中等' : '困难');
            opponentLabel = 'AI (' + difficultyText + ')';
        } else if (mode === 'pvp' && !opponent) {
            opponentLabel = '玩家对战';
        }
        var resultLabel = result === 'win' ? '胜利' : (result === 'lose' ? '失败' : '平局');
        var record = {
            date: new Date().toLocaleString(),
            result: resultLabel,
            resultKey: result,
            mode: mode,
            modeLabel: modeLabel,
            opponent: opponentLabel,
            aiDifficulty: G.aiDifficulty,
            timestamp: Math.floor(Date.now() / 1000),
            moveHistory: G.moveHistory.map(function(m) { return { row: m.row, col: m.col, player: m.player }; }),
            moves: G.moveHistory.length,
            playerColor: G.playerColor,
            boardSize: G.BOARD_SIZE
        };
        await G.apiCall('/api/records/add', 'POST', record);
        // 更新玩家积分（不同难度得分和扣分不同）
        if (result !== 'draw') {
            var scoreConfig = {
                easy: { win: 10, lose: -50 },
                medium: { win: 50, lose: -25 },
                hard: { win: 100, lose: -5 }
            };
            var diff = G.aiDifficulty || 'medium';
            var diffConfig = scoreConfig[diff] || scoreConfig.medium;
            var scoreChange = result === 'win' ? diffConfig.win : diffConfig.lose;
            G.currentUser.score = (G.currentUser.score || 0) + scoreChange;
            if (result === 'win') G.currentUser.wins = (G.currentUser.wins || 0) + 1;
            G.currentUser.games = (G.currentUser.games || 0) + 1;
            G.updateUserDisplay();
        }
    };

    // ==================== 游戏存档 ====================

    // 保存当前游戏进度到服务器
    G.saveGame = async function() {
        var saveData = {
            id: Date.now().toString(),
            date: new Date().toLocaleString(),
            board: G.gameBoard,
            currentPlayer: G.currentPlayer,
            playerColor: G.playerColor,
            moveHistory: G.moveHistory,
            gameTime: G.gameTime,
            difficulty: G.aiDifficulty,
            undoCount: G.undoCount
        };
        await G.apiCall('/api/saves/save', 'POST', saveData);
        G.showToast('游戏已保存');
        if (G.loadSavedGames) G.loadSavedGames();
    };

    // 从服务器加载存档游戏
    G.loadGame = async function(saveId) {
        var saves = await G.apiCall('/api/saves');
        var save = saves.find(function(s) { return s.id === saveId; });
        if (!save) return;
        // 恢复游戏状态
        G.gameBoard = save.board;
        G.currentPlayer = save.currentPlayer;
        G.playerColor = save.playerColor;
        G.moveHistory = save.moveHistory;
        G.gameTime = save.gameTime;
        G.aiDifficulty = save.difficulty;
        G.undoCount = save.undoCount || 0;
        G.gameActive = true;
        G.winningCells = [];
        G.updateDifficultyButtons();
        G.updateColorButtons();
        G.drawBoard();
        G.updateUI();
        G.startTimer();
        // 切换到游戏标签页
        var gameTab = $('gameTab');
        if (gameTab) gameTab.click();
    };

    // ==================== 按钮状态更新 ====================

    // 更新 AI 难度按钮的选中状态
    G.updateDifficultyButtons = function() {
        ['easy', 'medium', 'hard'].forEach(function(d) {
            var btn = $('ai' + d.charAt(0).toUpperCase() + d.slice(1));
            if (!btn) return;
            btn.classList.toggle('bg-primary', G.aiDifficulty === d);
            btn.classList.toggle('text-white', G.aiDifficulty === d);
        });
    };

    // 更新游戏模式按钮的选中状态
    G.updateModeButtons = function() {
        var isAI = G.gameMode === 'ai';
        var isOnline = G.gameMode === 'online';
        var isPVP = G.gameMode === 'pvp';

        var modeAI = $('modeAI');
        var modePVP = $('modePVP');
        var modeOnline = $('modeOnline');
        var aiSettings = $('aiSettings');
        var pvpSettings = $('pvpSettings');
        var onlineSettingsHint = $('onlineSettingsHint');

        // 切换按钮高亮
        if (modeAI) {
            modeAI.classList.toggle('bg-primary', isAI);
            modeAI.classList.toggle('text-white', isAI);
            modeAI.classList.toggle('border-gray-300', !isAI);
            modeAI.classList.toggle('text-gray-700', !isAI);
        }
        if (modePVP) {
            modePVP.classList.toggle('bg-primary', isPVP);
            modePVP.classList.toggle('text-white', isPVP);
            modePVP.classList.toggle('border-gray-300', !isPVP);
            modePVP.classList.toggle('text-gray-700', !isPVP);
        }
        if (modeOnline) {
            modeOnline.classList.toggle('bg-primary', isOnline);
            modeOnline.classList.toggle('text-white', isOnline);
            modeOnline.classList.toggle('border-gray-300', !isOnline);
            modeOnline.classList.toggle('text-gray-700', !isOnline);
        }
        // 切换设置面板显示
        if (aiSettings) aiSettings.classList.toggle('hidden', !isAI);
        if (pvpSettings) pvpSettings.classList.toggle('hidden', !isPVP);
        if (onlineSettingsHint) onlineSettingsHint.classList.toggle('hidden', !isOnline);

        // 非 PVP 模式停止单步计时
        if (!isPVP) G.stopPvpTurnTimer();
    };

    // 更新棋子颜色按钮的选中状态
    G.updateColorButtons = function() {
        var black = $('playerColorBlack');
        var white = $('playerColorWhite');
        if (black) {
            black.classList.toggle('bg-primary', G.playerColor === 1);
            black.classList.toggle('text-white', G.playerColor === 1);
        }
        if (white) {
            white.classList.toggle('bg-primary', G.playerColor === 2);
            white.classList.toggle('text-white', G.playerColor === 2);
        }
    };

    // ==================== 标签页切换 ====================

    // 切换标签页显示（游戏、联机、个人资料、历史记录、统计、排行榜、管理）
    G.showTab = function(tabId) {
        // 隐藏所有内容区域
        ['gameContent', 'onlineContent', 'profileContent', 'historyContent', 'statsContent', 'leaderboardContent', 'adminContent', 'boardColorContent'].forEach(function(id) {
            var el = $(id);
            if (el) el.classList.add('hidden');
        });
        // 显示选中内容区域
        var targetEl = $(tabId);
        if (targetEl) targetEl.classList.remove('hidden');
        // 更新标签按钮状态
        ['gameTab', 'onlineTab', 'profileTab', 'historyTab', 'statsTab', 'leaderboardTab', 'adminTab', 'boardColorTab'].forEach(function(id) {
            var el = $(id);
            if (el) el.classList.remove('tab-active');
        });
        var tabBtn = $(tabId.replace('Content', 'Tab'));
        if (tabBtn) tabBtn.classList.add('tab-active');

        // 各标签页的初始化逻辑
        if (tabId === 'adminContent' && G.loadAdminUsers) {
            G.loadAdminUsers();
            if (G.currentUser && G.currentUser.isSuperAdmin && G.loadAdminList) G.loadAdminList();
        }
        if (tabId === 'leaderboardContent' && G.loadLeaderboard) G.loadLeaderboard();
        if (tabId === 'historyContent') { G.historyCurrentPage = 1; if (G.loadHistory) G.loadHistory(); }
        if (tabId === 'statsContent' && G.loadStats) G.loadStats();
        if (tabId === 'onlineContent') {
            // 初始化联机 Canvas 和事件
            G.onlineCanvas = $('onlineCanvas');
            G.onlineCtx = G.onlineCanvas ? G.onlineCanvas.getContext('2d') : null;
            if (G.onlineCanvas) {
                G.onlineCanvas.onclick = null;
                G.onlineCanvas.addEventListener('click', G.handleOnlineClick);
            }
            if (G.calcOnlineCanvasSize) G.calcOnlineCanvasSize();
            if (!G.onlineBoard || !G.onlineBoard[0]) G.initOnlineBoard();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            if (G.loadOnlineAvailableMatches) G.loadOnlineAvailableMatches();
            if (G.checkExistingMatch) G.checkExistingMatch();
            if (G.startMatchListRefresh) G.startMatchListRefresh();
        } else {
            // 离开联机标签页时停止列表刷新
            if (G.stopMatchListRefresh) G.stopMatchListRefresh();
        }
    };

    // ==================== 联机棋盘点击 ====================

    // 处理联机棋盘点击事件（将像素坐标转换为棋盘坐标，然后发送落子请求）
    G.handleOnlineClick = function(e) {
        if (!G.onlineGameActive || !G.onlineMatchId) return;
        if (G.onlineMyColor === null || G.onlineMyColor === undefined) return;
        var currentPlayer = Number(G.onlineCurrentPlayer);
        var myColor = Number(G.onlineMyColor);
        // 只有轮到自己时才能落子
        if (currentPlayer !== myColor) return;

        // 像素坐标转棋盘坐标
        var rect = G.onlineCanvas.getBoundingClientRect();
        var scaleX = G.onlineCanvas.width / rect.width;
        var scaleY = G.onlineCanvas.height / rect.height;
        var x = (e.clientX - rect.left) * scaleX;
        var y = (e.clientY - rect.top) * scaleY;
        var pieceSize = G.onlineCellSizeGlobal * G.PIECE_SIZE_RATIO;
        var margin = pieceSize / 2 + 4;
        var col = Math.round((x - margin) / G.onlineCellSizeGlobal);
        var row = Math.round((y - margin) / G.onlineCellSizeGlobal);
        // 检查坐标有效性和位置是否为空
        if (row >= 0 && row < G.BOARD_SIZE && col >= 0 && col < G.BOARD_SIZE && G.onlineBoard[row][col] === 0) {
            G.makeOnlineMove(row, col);
        }
    };

})();
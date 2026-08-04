// ============================================================
// 游戏流程核心控制
// 负责：落子、胜负判定、游戏结束处理、计时器、悔棋、
//       存档加载、游戏记录保存
//
// 主要功能：
// - placePiece: 本地棋盘落子（含禁手检查）
// - handleGameOver: 游戏结束处理（显示弹窗、保存记录、访客次数）
// - startTimer/stopTimer: 游戏总计时
// - startPvpTurnTimer: 双人对战单步超时计时
// - resetGame: 重置游戏状态
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    /**
     * 在本地棋盘上落子
     * 检查落子合法性、禁手规则、胜负判定、切换回合
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {number} player - 玩家标识（1=黑棋，2=白棋）
     * @return {boolean} 落子是否成功
     */
    G.placePiece = function(row, col, player) {
        if (!G.gameActive || row < 0 || row >= G.BOARD_SIZE || col < 0 || col >= G.BOARD_SIZE || G.gameBoard[row][col] !== 0) return false;

        if (G.shouldCheckForbidden() && player === 1) {
            var tempBoard = G.gameBoard.map(function(r) { return r.slice(); });
            tempBoard[row][col] = 1;
            var ruleMode = G.gameMode === 'ai' ? G.aiRuleMode : G.ruleMode;
            var forbiddenCheck = G.checkForbidden(row, col, tempBoard, ruleMode);
            if (forbiddenCheck.forbidden) {
                G.showToast('禁手: ' + forbiddenCheck.reason, true);
                return false;
            }
        }

        G.gameBoard[row][col] = player;
        G.moveHistory.push({ row: row, col: col, player: player });
        G.drawBoard();

        if (G.checkWin(row, col, player)) { G.handleGameOver(player); return true; }
        if (G.checkDraw()) { G.handleGameOver(0); return true; }

        G.currentPlayer = (player === 1 ? 2 : 1);
        G.updateUI();

        if (G.gameMode === 'pvp' && G.pvpTimeLimit > 0) {
            G.startPvpTurnTimer();
        }

        if (G.gameMode === 'ai' && G.gameActive && G.currentPlayer === G.getAIColor()) setTimeout(G.aiMove, 200);
        return true;
    };

    /**
     * 启动双人对战单步计时（超时判负）
     * 每步棋有固定时间限制（G.pvpTimeLimit 秒），剩余 10 秒开始警告
     */
    G.startPvpTurnTimer = function() {
        G.stopPvpTurnTimer();
        G.pvpTurnStartTime = Date.now();
        G.pvpTurnTimer = setInterval(function() {
            var elapsed = Math.floor((Date.now() - G.pvpTurnStartTime) / 1000);
            var remaining = G.pvpTimeLimit - elapsed;
            if (remaining <= 0) {
                G.stopPvpTurnTimer();
                var loser = G.currentPlayer;
                var winner = loser === 1 ? 2 : 1;
                G.showToast('超时！' + (loser === 1 ? '黑棋' : '白棋') + '判负', true);
                G.handleGameOver(winner);
            } else if (remaining <= 10) {
                G.showToast('剩余 ' + remaining + ' 秒！', remaining <= 5);
            }
        }, 1000);
    };

    /** 停止双人对战单步计时 */
    G.stopPvpTurnTimer = function() {
        if (G.pvpTurnTimer) {
            clearInterval(G.pvpTurnTimer);
            G.pvpTurnTimer = null;
        }
    };

    /**
     * 处理游戏结束
     * @param {number} winner - 获胜方（1=黑棋胜，2=白棋胜，0=平局）
     * 流程：
     * 1. 停止计时器和轮询
     * 2. 离开联机房间（如果是联机模式）
     * 3. 显示胜利弹窗
     * 4. 保存游戏记录
     * 5. 处理访客模式剩余次数
     */
    G.handleGameOver = function(winner) {
        G.gameActive = false;
        G.stopTimer();
        if (G.stopOnlinePolling) G.stopOnlinePolling();
        if (G.gameMode === 'online' && G.onlineMatchId) {
            G.apiCall('/api/match/leave', 'POST', { matchId: G.onlineMatchId }).catch(function() {});
            G.onlineMatchId = null;
            G.onlineMyColor = null;
            G.onlineOpponent = null;
        }
        var isPlayerWin = (winner === G.playerColor);
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

        // 访客模式：游戏结束后减少剩余次数
        if (G.isGuest && (G.gameMode === 'ai' || G.gameMode === 'pvp')) {
            G.useGuestGame();
            var guestRemainingDisplay = $('guestRemainingGames');
            if (guestRemainingDisplay) guestRemainingDisplay.textContent = G.guestRemainingGames;
            if (G.guestRemainingGames <= 0) {
                G.showToast('访客游戏次数已用完，请注册账号', true);
            }
        }
    };

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

    // 重置游戏状态
    G.resetGame = function() {
        // 访客模式检查剩余游戏次数
        if (G.isGuest && G.guestRemainingGames <= 0) {
            G.showToast('访客游戏次数已用完，请注册账号', true);
            return;
        }
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
        if (G.gameMode === 'ai' && G.playerColor === 2) { G.startTimer(); setTimeout(function() { G.aiMove(); }, 300); }
        else if (G.gameMode === 'online') { G.startTimer(); if (G.startOnlinePolling) G.startOnlinePolling(); }
        else { G.startTimer(); }
    };

    // 悔棋操作（AI 模式下悔两步，PVP 模式下悔一步，最多3次）
    G.undoMove = function() {
        if (!G.gameActive || G.moveHistory.length === 0) { G.showToast('没有可悔棋的操作', true); return; }
        if (G.undoCount >= 3) { G.showToast('悔棋次数已用完', true); return; }

        var stepsToUndo = 1;
        if (G.gameMode === 'ai') {
            stepsToUndo = (G.currentPlayer === G.playerColor) ? 2 : 1;
        }

        if (G.moveHistory.length < stepsToUndo) {
            G.showToast('无法悔棋', true);
            return;
        }

        for (var i = 0; i < stepsToUndo; i++) {
            var m = G.moveHistory.pop();
            if (m) G.gameBoard[m.row][m.col] = 0;
        }

        G.undoCount++;
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

    // 保存游戏记录到服务器
    G.saveGameRecord = async function(result, mode, opponent) {
        mode = mode || G.gameMode || 'ai';
        var modeLabels = { ai: '人机对战', pvp: '双人对战', online: '联机对战' };
        var modeLabel = modeLabels[mode] || mode;
        var opponentLabel = opponent || '';
        if (mode === 'ai' && !opponent) {
            var difficultyText = G.aiDifficulty === 'easy' ? '简单' : (G.aiDifficulty === 'medium' ? '中等' : (G.aiDifficulty === 'hard' ? '困难' : '大师'));
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
        var gameTab = $('gameTab');
        if (gameTab) gameTab.click();
    };

    // 导出当前游戏到本地文件
    G.exportCurrentGame = function() {
        if (!G.gameBoard || G.moveHistory.length === 0) {
            G.showToast('没有可导出的棋局', true);
            return;
        }
        var exportData = {
            version: 1,
            type: 'gomoku_save',
            name: '棋局_' + new Date().toLocaleString().replace(/[\/\s:]/g, '-'),
            timestamp: Math.floor(Date.now() / 1000),
            board: G.gameBoard,
            moves: G.moveHistory.map(function(m) { return { row: m.row, col: m.col, player: m.player }; }),
            currentPlayer: G.currentPlayer,
            mode: G.gameMode || 'ai',
            difficulty: G.aiDifficulty || 'medium',
            playerColor: G.playerColor,
            gameTime: G.gameTime || 0,
            boardSize: G.BOARD_SIZE || 15,
            blackTime: G.blackTime || 600,
            whiteTime: G.whiteTime || 600
        };
        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'gomoku_game_' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        G.showToast('棋局已导出');
    };

    // 从本地文件导入游戏（仅加载到前端）
    G.importGameFromFile = function(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (data.type !== 'gomoku_save') {
                    G.showToast('无效的文件格式', true);
                    return;
                }
                G.gameBoard = data.board;
                G.moveHistory = data.moves || [];
                G.currentPlayer = data.currentPlayer || 1;
                G.aiDifficulty = data.difficulty || 'medium';
                G.playerColor = data.playerColor || 1;
                G.gameTime = data.gameTime || 0;
                G.BOARD_SIZE = data.boardSize || 15;
                G.gameActive = true;
                G.winningCells = [];
                G.undoCount = 0;
                G.updateDifficultyButtons();
                G.updateColorButtons();
                G.drawBoard();
                G.updateUI();
                G.startTimer();
                G.showToast('棋局已导入');
                if (callback) callback(true);
                var gameTab = $('gameTab');
                if (gameTab) gameTab.click();
            } catch (err) {
                G.showToast('文件解析失败', true);
                if (callback) callback(false);
            }
        };
        reader.onerror = function() {
            G.showToast('文件读取失败', true);
            if (callback) callback(false);
        };
        reader.readAsText(file);
    };

    // 从本地文件导入游戏并保存到服务器
    G.importGameToServer = function(file) {
        var reader = new FileReader();
        reader.onload = async function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (data.type !== 'gomoku_save') {
                    G.showToast('无效的文件格式', true);
                    return;
                }
                var importData = {
                    type: 'gomoku_save',
                    name: data.name || '导入棋局',
                    board: data.board,
                    moves: data.moves || data.moveHistory || [],
                    currentPlayer: data.currentPlayer || 1,
                    mode: data.mode || 'ai',
                    difficulty: data.difficulty || 'medium',
                    playerColor: data.playerColor || 1,
                    gameTime: data.gameTime || 0,
                    boardSize: data.boardSize || 15,
                    blackTime: data.blackTime || 600,
                    whiteTime: data.whiteTime || 600,
                    timestamp: Math.floor(Date.now() / 1000)
                };
                await G.apiCall('/api/saves/import', 'POST', importData);
                G.showToast('棋局已导入并保存');
                if (G.loadSavedGames) G.loadSavedGames();
            } catch (err) {
                G.showToast('文件解析失败', true);
            }
        };
        reader.onerror = function() {
            G.showToast('文件读取失败', true);
        };
        reader.readAsText(file);
    };
})();
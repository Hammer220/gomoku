// ============================================================
// 联机对战模块
// 负责：创建房间、加入房间、离开房间、落子、轮询、重连、
//       心跳保活、重开对局等联机对战核心功能
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 安全获取 DOM 元素（document.getElementById 的简写）
    var $ = function(id) {
        return document.getElementById(id);
    };

    // ==================== 恢复联机房间 ====================

    // 恢复之前未完成的联机对局（页面刷新后自动调用）
    // 根据服务器返回的对局状态恢复棋盘、UI 和轮询
    G.recoverOnlineMatch = async function() {
        try {
            var res = await G.apiCall('/api/match/my', 'GET');
            if (!res.match) return;
            var match = res.match;
            G.onlineMatchId = match.id;
            G.onlineMyColor = match.myColor;
            G.onlineOpponent = match.opponent;
            G.gameMode = 'online';
            G.onlineBoard = match.board || Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
            G.onlineMoveHistory = match.moves || [];
            G.onlineCurrentPlayer = match.currentPlayer || 1;
            G.onlineGameActive = match.status === 'playing' || match.status === 'waiting' || match.status === 'waiting_for_reconnect';
            G.lastRestartVersion = 0;
            G.reconnectAttempts = 0;
            G.currentPollingInterval = G.basePollingInterval;

            // 更新房间信息显示
            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = match.id;
            if (roomInfo) {
                roomInfo.innerHTML =
                    '<p>房间号: <span class="font-mono font-bold text-lg">' + match.id + '</span></p>' +
                    '<p>你的棋子: <span class="font-bold">' + (match.myColor === 1 ? '黑棋' : '白棋') + '</span></p>' +
                    '<p>对手: <span class="font-bold">' + (match.opponent || '等待对手...') + '</span></p>';
            }
            if (onlineCreateBtn) onlineCreateBtn.classList.add('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.add('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.remove('hidden');

            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startOnlinePolling();

            if (match.status === 'waiting') {
                G.showToast('已恢复到之前的房间，等待对手...');
            } else if (match.status === 'playing') {
                G.showToast('已恢复到房间 ' + match.id + '，对手: ' + match.opponent);
            } else if (match.status === 'waiting_for_reconnect') {
                G.showToast('已恢复到房间，对手暂时离开，等待重连...', true);
            } else if (match.status === 'closed') {
                G.onlineMatchId = null;
                G.onlineMyColor = null;
                G.onlineOpponent = null;
                G.gameMode = 'ai';
                G.initOnlineBoard();
                if (matchIdDisplay) matchIdDisplay.textContent = '-';
                if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房间</p>';
                if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
                if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');
                if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
                G.showToast('房间已被关闭', true);
            } else if (match.status === 'finished') {
                var myWin = match.winner === match.myColor;
                var statusText = $('onlineStatusText');
                if (statusText) {
                    statusText.textContent = myWin ? '你赢了' : '你输了';
                    statusText.className = myWin
                        ? 'text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse'
                        : 'text-xl font-semibold text-gray-400';
                }
                G.showToast('游戏已结束：' + (myWin ? '你赢了' : '你输了') + '，对手: ' + match.opponent);
            } else {
                G.showToast('已恢复到房间，状态: ' + match.status);
            }
        } catch (e) {
            console.error('恢复联机房间失败:', e);
        }
    };

    // ==================== 创建房间 ====================

    // 创建联机对战房间，创建者自动分配棋子颜色并开始轮询和心跳
    G.onlineCreateMatch = async function() {
        try {
            var res = await G.apiCall('/api/match/create', 'POST', {});
            G.onlineMatchId = res.matchId;
            G.onlineMyColor = res.creatorColor;
            G.gameMode = 'online';
            G.initOnlineBoard();
            G.onlineMoveHistory = [];
            G.onlineGameActive = true;
            G.onlineGameTime = 0;
            G.onlineCurrentPlayer = res.creatorColor;
            G.lastRestartVersion = 0;
            G.reconnectAttempts = 0;
            G.currentPollingInterval = G.basePollingInterval;
            G.stopMatchListRefresh();

            // 更新 UI
            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = res.matchId;
            if (roomInfo) {
                roomInfo.innerHTML =
                    '<p>房间号: <span class="font-mono font-bold text-lg">' + res.matchId + '</span></p>' +
                    '<p>你的棋子: <span class="font-bold">' + (res.creatorColor === 1 ? '黑棋' : '白棋') + '</span></p>' +
                    '<p>状态: <span class="text-amber-600">等待对手加入...</span></p>' +
                    '<p class="text-sm text-gray-500">你是房间创建者</p>';
            }
            if (roomActions) roomActions.classList.remove('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.remove('hidden');
            if (onlineCreateBtn) onlineCreateBtn.classList.add('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.add('hidden');
            G.showToast('房间已创建: ' + res.matchId);
            if (G.calcOnlineCanvasSize) G.calcOnlineCanvasSize();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startOnlinePolling();
            G.startOnlineTimer();
            G.startHeartbeat();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    // ==================== 加入房间 ====================

    // 通过房间号加入联机对战房间，加入者自动分配与创建者相反的棋子颜色
    G.onlineJoinMatch = async function() {
        var matchIdInput = $('onlineMatchIdInput');
        var matchId = matchIdInput ? matchIdInput.value.trim() : '';
        if (!matchId) {
            G.showToast('请输入房间号', true);
            return;
        }
        try {
            var res = await G.apiCall('/api/match/join', 'POST', { matchId: matchId });
            G.onlineMatchId = matchId;
            G.onlineMyColor = res.yourColor;
            G.onlineOpponent = res.opponent;
            G.gameMode = 'online';
            G.initOnlineBoard();
            G.onlineMoveHistory = [];
            G.onlineGameActive = true;
            G.onlineGameTime = 0;
            G.onlineCurrentPlayer = 1;
            G.lastRestartVersion = 0;
            G.reconnectAttempts = 0;
            G.currentPollingInterval = G.basePollingInterval;
            G.stopMatchListRefresh();

            // 更新 UI
            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = matchId;
            if (roomInfo) {
                roomInfo.innerHTML =
                    '<p>房间号: <span class="font-mono font-bold text-lg">' + matchId + '</span></p>' +
                    '<p>你的棋子: <span class="font-bold">' + (res.yourColor === 1 ? '黑棋' : '白棋') + '</span></p>' +
                    '<p>对手: <span class="font-bold">' + res.opponent + '</span></p>';
            }
            if (roomActions) roomActions.classList.add('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.remove('hidden');
            if (onlineCreateBtn) onlineCreateBtn.classList.add('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.add('hidden');
            if (matchIdInput) matchIdInput.value = '';
            G.showToast('已加入房间，对手: ' + res.opponent);
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startOnlinePolling();
            G.startOnlineTimer();
            G.startHeartbeat();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    // ==================== 关闭房间 ====================
    // 注意：实际关闭房间逻辑由 G.closeOnlineRoom 实现（文件末尾），
    // G.attachCloseRoomHandler 会将关闭房间按钮绑定到 G.closeOnlineRoom

    // ==================== 重开倒计时 ====================

    // 停止重开倒计时
    G.stopRestartCountdown = function() {
        if (G.restartCountdownTimer) {
            clearInterval(G.restartCountdownTimer);
            G.restartCountdownTimer = null;
        }
        G.restartCountdownSeconds = 0;
    };

    // ==================== 关闭房间按钮 ====================

    // 绑定关闭房间按钮事件
    G.attachCloseRoomHandler = function() {
        var btn = $('closeRoomBtn');
        if (!btn) return;
        if (G.closeRoomBtnHandler) btn.removeEventListener('click', G.closeRoomBtnHandler);
        G.closeRoomBtnHandler = G.closeOnlineRoom;
        btn.addEventListener('click', G.closeRoomBtnHandler);
    };

    // ==================== 重开请求 UI ====================

    // 显示重开请求 UI（游戏结束后）
    G.showRestartRequestUI = function() {
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<button id="requestRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">重新开始</button>' +
            '<button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">关闭房间</button>';
        var requestRestartBtn = $('requestRestartBtn');
        if (requestRestartBtn) requestRestartBtn.addEventListener('click', G.requestRestart);
        G.attachCloseRoomHandler();
    };

    // 显示房间操作按钮（对战中）
    G.showOnlineRoomActions = function() {
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<button id="requestRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">重新开始</button>' +
            '<button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">关闭房间</button>';
        var requestRestartBtn = $('requestRestartBtn');
        if (requestRestartBtn) requestRestartBtn.addEventListener('click', G.requestRestart);
        G.attachCloseRoomHandler();
    };

    // 显示等待重开确认 UI（我方已请求）
    G.showOnlineWaitingForRestartUI = function() {
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<div class="text-center mb-2"><span class="text-sm text-amber-600">等待对手确认重新开始...</span></div>' +
            '<button id="cancelRestartBtn" class="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg text-sm mb-2 transition-all">取消请求</button>' +
            '<button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">关闭房间</button>';
        var cancelRestartBtn = $('cancelRestartBtn');
        if (cancelRestartBtn) cancelRestartBtn.addEventListener('click', G.requestRestart);
        G.attachCloseRoomHandler();
    };

    // 显示重开请求 UI（对手请求重开）
    G.showOnlineRestartRequestedUI = function(requesterName) {
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<div class="text-center mb-2"><span class="text-sm text-blue-600">对手 <strong>' + requesterName + '</strong> 请求重新开始</span></div>' +
            '<button id="acceptRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">接受重新开始</button>' +
            '<button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">关闭房间</button>';
        var acceptRestartBtn = $('acceptRestartBtn');
        if (acceptRestartBtn) acceptRestartBtn.addEventListener('click', G.requestRestart);
        G.attachCloseRoomHandler();
    };

    // ==================== 重开请求 ====================

    // 请求/取消重新开始游戏（双方都同意后才会重开）
    G.requestRestart = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/restart', 'POST', { matchId: G.onlineMatchId });
            if (res.restartInitiated) {
                var newCreatorColor = res.creatorColor;
                if (G.currentUser && G.currentUser.username === G.onlineOpponent) {
                    G.onlineMyColor = newCreatorColor === 1 ? 2 : 1;
                } else {
                    G.onlineMyColor = newCreatorColor;
                }
                G.initOnlineBoard();
                G.onlineMoveHistory = [];
                G.onlineGameActive = true;
                G.onlineGameTime = 0;
                G.onlineCurrentPlayer = res.currentPlayer || 1;
                G.lastMoveCount = 0;
                G.lastRestartVersion = res.restartVersion || 0;
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
                G.showOnlineRoomActions();
                G.startOnlinePolling();
                G.startOnlineTimer();
                G.showToast('游戏已重新开始');
            } else if (res.restartRequested) {
                G.showToast('已请求重新开始，等待对手确认');
                G.showOnlineWaitingForRestartUI();
            } else if (res.restartCancelled) {
                G.showToast('已取消重新开始请求');
                G.showOnlineRoomActions();
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    // ==================== 重开倒计时 UI ====================

    // 启动重开倒计时（10秒后自动请求重开）
    G.startRestartCountdown = function() {
        G.stopRestartCountdown();
        G.restartCountdownSeconds = 10;
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<div class="text-center mb-2"><span class="text-sm text-gray-600">重新开始倒计时: </span><span id="countdownSeconds" class="font-bold text-primary">' + G.restartCountdownSeconds + '</span></div>' +
            '<button id="requestRestartBtn" class="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-sm mb-2">重新开始</button>' +
            '<button id="closeRoomBtn" class="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm">关闭房间</button>';
        var requestRestartBtn = $('requestRestartBtn');
        if (requestRestartBtn) requestRestartBtn.addEventListener('click', G.requestRestart);
        G.attachCloseRoomHandler();
        G.restartCountdownTimer = setInterval(function() {
            G.restartCountdownSeconds--;
            var countdownEl = $('countdownSeconds');
            if (countdownEl) countdownEl.textContent = G.restartCountdownSeconds;
            if (G.restartCountdownSeconds <= 0) {
                G.stopRestartCountdown();
                G.requestRestart();
            }
        }, 1000);
    };

    // ==================== 联机计时器 ====================

    // 启动联机游戏计时器
    G.startOnlineTimer = function() {
        G.stopOnlineTimer();
        G.onlineTimerInterval = setInterval(function() {
            G.onlineGameTime++;
            var dt = $('onlineGameTimeDisplay');
            if (dt) dt.textContent = G.formatTime(G.onlineGameTime);
        }, 1000);
    };

    // 停止联机游戏计时器
    G.stopOnlineTimer = function() {
        if (G.onlineTimerInterval) {
            clearInterval(G.onlineTimerInterval);
            G.onlineTimerInterval = null;
        }
    };

    // ==================== 联机 UI 更新 ====================

    // 更新联机界面显示
    G.updateOnlineUI = function() {
        if (!G.onlineGameActive) return;
        var isMyTurn = G.onlineCurrentPlayer === G.onlineMyColor;
        var label = isMyTurn ? '你' : '对手';
        var playerColor = G.onlineCurrentPlayer === 1 ? '黑棋' : '白棋';
        var statusText = $('onlineStatusText');
        var moveCount = $('onlineMoveCount');
        if (statusText) statusText.textContent = '游戏进行中 - ' + label + ' (' + playerColor + ') 回合';
        if (moveCount) moveCount.textContent = G.onlineMoveHistory.length;
    };

    // ==================== 可用房间列表 ====================

    // 加载可用联机房间列表
    G.loadOnlineAvailableMatches = async function() {
        try {
            var res = await G.apiCall('/api/match/list', 'GET');
            var container = $('onlineAvailableMatches');
            if (!container) return;
            if (res.matches.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">暂无可用房间</p>';
                return;
            }
            container.innerHTML = res.matches.map(function(m) {
                return '<div class="flex justify-between items-center p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 text-sm" data-match-id="' + m.id + '"><span class="font-medium">' + m.creator + '</span><span class="text-gray-500">房间: ' + m.id + '</span></div>';
            }).join('');
            container.querySelectorAll('[data-match-id]').forEach(function(el) {
                el.addEventListener('click', function() { G.clickOnlineMatch(el.dataset.matchId); });
            });
        } catch (err) {
            console.error(err);
        }
    };

    // ==================== 检查现有对局 ====================

    // 检查是否有正在进行的联机对局
    G.checkExistingMatch = async function() {
        try {
            var res = await G.apiCall('/api/match/my', 'GET');
            if (res.match) {
                var match = res.match;
                G.onlineMatchId = match.id;
                G.onlineMyColor = match.myColor;
                G.onlineOpponent = match.opponent;
                G.onlineGameActive = true;
                G.onlineBoard = match.board || Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
                G.onlineMoveHistory = match.moves || [];
                G.onlineCurrentPlayer = match.currentPlayer;
                G.onlineGameTime = Math.floor(Date.now() / 1000) - (match.startTime || 0);

                var matchIdDisplay = $('onlineMatchIdDisplay');
                var roomInfo = $('roomInfo');
                var onlineLeaveBtn = $('onlineLeaveBtn');
                var onlineCreateBtn = $('onlineCreateBtn');
                var onlineJoinBtn = $('onlineJoinBtn');
                if (matchIdDisplay) matchIdDisplay.textContent = match.id;
                if (roomInfo) {
                    roomInfo.innerHTML =
                        '<p>房间号: <span class="font-mono font-bold text-lg">' + match.id + '</span></p>' +
                        '<p>你的棋子: <span class="font-bold">' + (match.myColor === 1 ? '黑棋' : '白棋') + '</span></p>' +
                        '<p>对手: <span class="font-bold">' + (match.opponent || '未知') + '</span></p>' +
                        '<p>状态: <span class="text-green-600">对战进行中</span></p>';
                }
                if (onlineLeaveBtn) onlineLeaveBtn.classList.remove('hidden');
                if (onlineCreateBtn) onlineCreateBtn.classList.add('hidden');
                if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.add('hidden');
                if (G.calcOnlineCanvasSize) G.calcOnlineCanvasSize();
                G.reconnectAttempts = 0;
                G.currentPollingInterval = G.basePollingInterval;
                G.startOnlinePolling();
                G.startOnlineTimer();
                G.startHeartbeat();
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
            } else {
                if (G.onlineMatchId) G.cleanupOnlineState();
            }
        } catch (err) {
            console.error('检查现有游戏时出错:', err);
            if (G.onlineMatchId) G.cleanupOnlineState();
        }
    };

    // ==================== 点击房间 ====================

    // 点击可用房间列表项
    G.clickOnlineMatch = function(matchId) {
        var input = $('onlineMatchIdInput');
        if (input) input.value = matchId;
        G.onlineJoinMatch();
    };

    // ==================== 房间列表刷新 ====================

    // 启动可用房间列表定时刷新
    G.startMatchListRefresh = function() {
        G.stopMatchListRefresh();
        G.loadOnlineAvailableMatches();
        G.matchListInterval = setInterval(G.loadOnlineAvailableMatches, 3000);
    };

    // 停止可用房间列表定时刷新
    G.stopMatchListRefresh = function() {
        if (G.matchListInterval) {
            clearInterval(G.matchListInterval);
            G.matchListInterval = null;
        }
    };

    // ==================== 联机轮询 ====================

    // 启动联机状态轮询（重置重连计数和轮询间隔）
    G.startOnlinePolling = function() {
        G.stopOnlinePolling();
        G.reconnectAttempts = 0;
        G.currentPollingInterval = G.basePollingInterval;
        G.lastSuccessfulPoll = Date.now();
        G.scheduleOnlinePoll();
    };

    // 定时轮询联机状态（自适应间隔，断线时指数退避重连）
    // 处理游戏状态更新、重开请求、对手操作、房间关闭等
    G.scheduleOnlinePoll = function() {
        if (!G.onlineMatchId) return;
        G.onlinePollingInterval = setTimeout(async function() {
            if (!G.onlineMatchId) return;
            try {
                var res = await G.apiCall('/api/match/status/' + G.onlineMatchId, 'GET');
                G.reconnectAttempts = 0;
                G.currentPollingInterval = G.basePollingInterval;
                G.lastSuccessfulPoll = Date.now();
                G.isReconnecting = false;

                var serverRestartVersion = res.restartVersion || 0;
                var isRestartByVersion = serverRestartVersion > G.lastRestartVersion;

                if (isRestartByVersion) {
                    G.lastRestartVersion = serverRestartVersion;
                    G.showToast('游戏重新开始！');
                    G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
                    G.onlineMoveHistory = [];
                    G.onlineGameActive = true;
                    G.onlineGameTime = 0;
                    G.onlineCurrentPlayer = res.currentPlayer || 1;
                    G.onlineMyColor = res.myColor;
                    G.lastMoveCount = 0;
                    var statusEl = $('onlineStatusText');
                    if (statusEl) {
                        statusEl.textContent = '游戏进行中';
                        statusEl.className = 'text-lg font-semibold text-green-600';
                    }
                    if (G.drawOnlineBoard) G.drawOnlineBoard();
                    G.updateOnlineUI();
                    G.showOnlineRoomActions();
                    if (G.onlineCurrentPlayer === 1) G.showToast('黑棋先走！', false);
                }

                if (!isRestartByVersion) {
                    if (res.restartRequested && res.restartRequestedBy !== G.currentUser && G.currentUser && res.restartRequestedBy !== G.currentUser.username) {
                        G.showOnlineRestartRequestedUI(res.restartRequestedBy);
                    } else if (res.restartRequested && G.currentUser && res.restartRequestedBy === G.currentUser.username) {
                        G.showOnlineWaitingForRestartUI();
                    } else if (res.status === 'playing') {
                        G.showOnlineRoomActions();
                    }
                }

                if (res.status === 'finished') {
                    G.onlineGameActive = false;
                    G.stopOnlineTimer();
                    if (res.board) { G.onlineBoard = res.board; if (G.drawOnlineBoard) G.drawOnlineBoard(); }
                    var myWin = res.winner === G.onlineMyColor;
                    var statusEl = $('onlineStatusText');
                    if (statusEl) {
                        statusEl.textContent = myWin ? '你赢了！' : '你输了！';
                        statusEl.className = myWin
                            ? 'text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse'
                            : 'text-xl font-semibold text-gray-400';
                    }
                    G.showToast(myWin ? '恭喜你赢了！' : '很遗憾，你输了！', !myWin);
                    G.saveGameRecord(myWin ? 'win' : 'lose', 'online', G.onlineOpponent);
                    if (res.restartRequested) {
                        if (G.currentUser && res.restartRequestedBy !== G.currentUser.username) {
                            G.showOnlineRestartRequestedUI(res.restartRequestedBy);
                        } else {
                            G.showOnlineWaitingForRestartUI();
                        }
                    } else {
                        G.showRestartRequestUI();
                    }
                    return;
                }

                if (res.status === 'closed') {
                    G.onlineGameActive = false;
                    G.stopOnlinePolling();
                    G.stopOnlineTimer();
                    G.stopHeartbeat();
                    var statusEl = $('onlineStatusText');
                    if (statusEl) statusEl.textContent = '房间已被关闭';
                    G.showToast('房间已被创建者关闭', true);
                    G.onlineMatchId = null;
                    G.onlineMyColor = null;
                    G.onlineOpponent = null;
                    G.initOnlineBoard();
                    var matchIdDisplay = $('onlineMatchIdDisplay');
                    var roomInfo = $('roomInfo');
                    if (matchIdDisplay) matchIdDisplay.textContent = '-';
                    if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房间</p>';
                    var roomActions = $('roomActions');
                    var onlineLeaveBtn = $('onlineLeaveBtn');
                    var onlineCreateBtn = $('onlineCreateBtn');
                    var onlineJoinBtn = $('onlineJoinBtn');
                    if (roomActions) roomActions.classList.add('hidden');
                    if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
                    if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
                    if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');
                    if (G.drawOnlineBoard) G.drawOnlineBoard();
                    G.updateOnlineUI();
                    return;
                }

                if (res.status === 'waiting_for_reconnect') {
                    G.showToast('对手暂时离开，等待重连...', true);
                }

                // 更新棋盘
                if (res.board && res.moves) {
                    var newMoves = res.moves.length - G.lastMoveCount;
                    if (newMoves > 0 && res.moves.length > G.lastMoveCount) {
                        G.onlineBoard = res.board;
                        G.onlineMoveHistory = res.moves;
                        G.lastMoveCount = res.moves.length;
                        G.onlineCurrentPlayer = res.currentPlayer;
                        if (G.drawOnlineBoard) G.drawOnlineBoard();
                        G.updateOnlineUI();
                    }
                }
            } catch (err) {
                console.error('轮询出错:', err);
                G.reconnectAttempts++;
                if (G.reconnectAttempts >= G.maxReconnectAttempts) {
                    G.showToast('连接断开，请重新连接', true);
                    G.stopOnlinePolling();
                    G.stopOnlineTimer();
                    G.cleanupOnlineState();
                    return;
                }
                G.currentPollingInterval = Math.min(G.currentPollingInterval * 1.5, G.maxPollingInterval);
                G.isReconnecting = true;
            }
            G.scheduleOnlinePoll();
        }, G.currentPollingInterval);
    };

    // ==================== 心跳 ====================

    // 启动心跳（每5秒发送一次，连续失败3次则提示断线）
    G.startHeartbeat = function() {
        G.stopHeartbeat();
        G.heartbeatFailures = 0;
        G.heartbeatInterval = setInterval(async function() {
            if (!G.onlineMatchId) return;
            try {
                await G.apiCall('/api/match/heartbeat', 'POST', { matchId: G.onlineMatchId });
                G.heartbeatFailures = 0;
            } catch (err) {
                G.heartbeatFailures++;
                if (G.heartbeatFailures >= G.maxHeartbeatFailures) {
                    G.showToast('连接断开', true);
                    G.stopHeartbeat();
                }
            }
        }, 5000);
    };

    // 停止心跳
    G.stopHeartbeat = function() {
        if (G.heartbeatInterval) {
            clearInterval(G.heartbeatInterval);
            G.heartbeatInterval = null;
        }
    };

    // ==================== 停止轮询 ====================

    // 停止联机状态轮询
    G.stopOnlinePolling = function() {
        if (G.onlinePollingInterval) {
            clearTimeout(G.onlinePollingInterval);
            G.onlinePollingInterval = null;
        }
    };

    // ==================== 联机落子 ====================

    // 在联机棋盘上落子（先乐观更新本地棋盘，再发送到服务器，失败则回滚）
    G.makeOnlineMove = async function(row, col) {
        if (!G.onlineMatchId || G.gameMode !== 'online') return;
        var originalClickHandler = G.onlineCanvas ? G.onlineCanvas.onclick : null;
        if (G.onlineCanvas) G.onlineCanvas.onclick = null;
        try {
            G.onlineBoard[row][col] = G.onlineMyColor;
            G.onlineMoveHistory.push({ row: row, col: col, player: G.onlineMyColor });
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            var res = await G.apiCall('/api/match/move', 'POST', { matchId: G.onlineMatchId, row: row, col: col });
            G.onlineCurrentPlayer = G.onlineMyColor === 1 ? 2 : 1;
            G.updateOnlineUI();
            if (res.win) {
                G.onlineGameActive = false;
                G.stopOnlinePolling();
                G.stopOnlineTimer();
                var myWin = res.winner === G.onlineMyColor;
                var statusText = $('onlineStatusText');
                if (statusText) statusText.textContent = myWin ? '你赢了！' : '你输了！';
                G.showToast(myWin ? '你赢了！' : '你输了！', !myWin);
                G.saveGameRecord(myWin ? 'win' : 'lose', 'online', G.onlineOpponent);
                G.startRestartCountdown();
            }
        } catch (err) {
            console.error('落子失败:', err);
            G.onlineBoard[row][col] = 0;
            G.onlineMoveHistory.pop();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.showToast(err.message || err.error || '落子失败', true);
        } finally {
            if (G.onlineCanvas) G.onlineCanvas.onclick = originalClickHandler;
        }
    };

    // ==================== 离开房间 ====================

    // 离开联机房间（通知服务器后清理本地状态）
    G.onlineLeaveMatch = async function() {
        if (!G.onlineMatchId) return;
        try {
            await G.apiCall('/api/match/leave', 'POST', { matchId: G.onlineMatchId });
        } catch (err) {
            console.warn('离开房间时出错:', err);
        }
        G.cleanupOnlineState();
        G.showToast('已离开房间');
    };

    // 清理联机状态（重置所有联机相关变量和 UI）
    G.cleanupOnlineState = function() {
        G.stopRestartCountdown();
        G.stopOnlinePolling();
        G.stopOnlineTimer();
        G.stopHeartbeat();
        G.onlineMatchId = null;
        G.onlineMyColor = null;
        G.onlineOpponent = null;
        G.onlineGameActive = false;
        G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
        G.onlineMoveHistory = [];
        G.onlineCurrentPlayer = 1;
        G.reconnectAttempts = 0;
        G.currentPollingInterval = G.basePollingInterval;
        G.isReconnecting = false;
        G.lastMoveCount = 0;
        var matchIdDisplay = $('onlineMatchIdDisplay');
        var roomInfo = $('roomInfo');
        var roomActions = $('roomActions');
        var onlineLeaveBtn = $('onlineLeaveBtn');
        var onlineCreateBtn = $('onlineCreateBtn');
        var onlineJoinBtn = $('onlineJoinBtn');
        var onlineStatusText = $('onlineStatusText');
        var onlineMoveCount = $('onlineMoveCount');
        if (matchIdDisplay) matchIdDisplay.textContent = '-';
        if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房间</p>';
        if (roomActions) roomActions.classList.add('hidden');
        if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
        if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
        if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');
        if (onlineStatusText) onlineStatusText.textContent = '等待加入房间...';
        if (onlineMoveCount) onlineMoveCount.textContent = '0';
        if (G.drawOnlineBoard) G.drawOnlineBoard();
        G.updateOnlineUI();
    };

    // ==================== 关闭房间（新版） ====================

    // 关闭联机房间（仅创建者可操作，需确认后关闭）
    G.closeOnlineRoom = async function() {
        if (!G.onlineMatchId) return;
        if (!confirm('确定要关闭房间吗？')) return;
        var btn = $('closeRoomBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '处理中'; }
        try {
            var res = await G.apiCall('/api/match/close', 'POST', { matchId: G.onlineMatchId });
            if (res.message) G.showToast(res.message);
        } catch (err) {
            G.showToast('关闭房间失败: ' + err.message, true);
            if (btn) { btn.disabled = false; btn.innerHTML = '关闭房间'; }
            return;
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '关闭房间'; }
        }
        G.cleanupOnlineState();
        G.showToast('房间已关闭');
    };

    // ==================== 断线重连提示 ====================

    // 隐藏断线提示浮层
    G.hideDisconnectOverlay = function() {
        // 如果有断线提示元素则隐藏
        var overlay = $('disconnectOverlay');
        if (overlay) overlay.classList.add('hidden');
    };

})();
// ============================================================
// 联机对战模块 - 房间操作
// 负责：恢复房间、创建房间、加入房间、关闭房间、重开请求
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

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
            G.lastRestartVersion = 0;
            G.reconnectAttempts = 0;
            G.currentPollingInterval = G.basePollingInterval;

            // 恢复WebSocket房间连接
            if (G.WebSocketManager) {
                G.WebSocketManager.joinRoom(match.id);
            }

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
            } else if (match.status === 'closed' || match.status === 'finished') {
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
                var message = match.status === 'closed' ? '房间已被关闭' : '对局已结束，已自动关闭';
                G.showToast(message, true);
            } else {
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
                G.showToast('未知房间状态 "' + match.status + '"，已自动关闭', true);
            }
        } catch (e) {
            console.error('恢复联机房间失败:', e);
        }
    };

    G.onlineCreateMatch = async function() {
        try {
            var config = G.getTimeModeConfig();
            var allowSpectate = $('allowSpectateCheck');
            var roomPassword = $('roomPasswordInput');
            config.allowSpectate = allowSpectate ? allowSpectate.checked : true;
            var pwd = roomPassword ? roomPassword.value.trim() : '';
            if (pwd) {
                config.password = pwd;
            }
            var res = await G.apiCall('/api/match/create', 'POST', config);
            G.onlineMatchId = res.matchId;
            G.onlineMyColor = res.creatorColor;
            G.gameMode = 'online';
            G.onlineTimeMode = config.timeMode;
            G.onlineMoveTime = config.moveTime;
            G.onlineTotalTime = config.totalTime;
            G.onlineBlackTime = G.onlineTotalTime;
            G.onlineWhiteTime = G.onlineTotalTime;
            G.onlineLastMoveTime = Date.now() / 1000;
            G.initOnlineBoard();
            G.onlineMoveHistory = [];
            G.onlineGameActive = true;
            G.onlineGameTime = 0;
            G.onlineCurrentPlayer = res.creatorColor;
            G.lastRestartVersion = 0;
            G.reconnectAttempts = 0;
            G.currentPollingInterval = G.basePollingInterval;
            G.stopMatchListRefresh();

            // 加入WebSocket房间，接收实时更新
            if (G.WebSocketManager) {
                G.WebSocketManager.joinRoom(res.matchId);
            }

            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = res.matchId;
            if (roomInfo) {
                var modeNames = {untimed: '无计时', move: '每步限时', total: '总时间', both: '每步+总时间'};
                roomInfo.innerHTML =
                    '<p>房间号: <span class="font-mono font-bold text-lg">' + res.matchId + '</span></p>' +
                    '<p>你的棋子: <span class="font-bold">' + (res.creatorColor === 1 ? '黑棋' : '白棋') + '</span></p>' +
                    '<p>计时模式: <span class="text-amber-600">' + (modeNames[config.timeMode] || '无计时') + '</span></p>' +
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
            G.startTimedCountdown();
            G.startHeartbeat();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.onlineJoinMatch = async function() {
        var matchIdInput = $('onlineMatchIdInput');
        var matchId = matchIdInput ? matchIdInput.value.trim() : '';
        if (!matchId) {
            G.showToast('请输入房间号', true);
            return;
        }
        try {
            var joinPwdInput = $('joinPasswordInput');
            var payload = { matchId: matchId };
            var pwd = joinPwdInput ? joinPwdInput.value.trim() : '';
            if (pwd) {
                payload.password = pwd;
            }
            var res = await G.apiCall('/api/match/join', 'POST', payload);
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

            // 加入WebSocket房间，接收实时更新
            if (G.WebSocketManager) {
                G.WebSocketManager.joinRoom(matchId);
            }

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
            G.startTimedCountdown();
            G.startHeartbeat();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.stopRestartCountdown = function() {
        if (G.restartCountdownTimer) {
            clearInterval(G.restartCountdownTimer);
            G.restartCountdownTimer = null;
        }
        G.restartCountdownSeconds = 0;
    };

    G.attachCloseRoomHandler = function() {
        var btn = $('closeRoomBtn');
        if (!btn) return;
        if (G.closeRoomBtnHandler) btn.removeEventListener('click', G.closeRoomBtnHandler);
        G.closeRoomBtnHandler = G.closeOnlineRoom;
        btn.addEventListener('click', G.closeRoomBtnHandler);
    };

    G.showRestartRequestUI = function() {
        var roomActions = $('roomActions');
        if (!roomActions) return;
        roomActions.classList.remove('hidden');
        roomActions.innerHTML =
            '<button id="requestRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">重新开始</button>' +
            '<button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">关闭房间</button>';
        var requestRestartBtn = $('requestRestartBtn');
        requestRestartBtn.addEventListener('click', G.requestOnlineRestart);
        G.attachCloseRoomHandler();
    };

    G.requestOnlineRestart = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/restart', 'POST', { matchId: G.onlineMatchId });
            if (res.restartInitiated) {
                G.initOnlineBoard();
                G.onlineMoveHistory = [];
                G.onlineGameActive = true;
                G.onlineGameTime = 0;
                G.onlineCurrentPlayer = res.currentPlayer;
                G.lastRestartVersion = res.restartVersion;
                G.onlineBoard = Array(G.BOARD_SIZE).fill().map(function() { return Array(G.BOARD_SIZE).fill(0); });
                G.onlineCurrentPlayer = res.creatorColor;
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.stopRestartCountdown();
                G.updateOnlineUI();
                G.startOnlineTimer();
                G.startTimedCountdown();
                G.showToast('对局已重新开始！');
            } else if (res.restartCancelled) {
                G.hideRestartCountdown();
                G.showToast('已取消重新开始请求');
            } else if (res.restartRequested) {
                G.showRestartCountdown(15);
                G.showToast('已请求重新开始，等待对手确认...');
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.declineOnlineRestart = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/restart/decline', 'POST', { matchId: G.onlineMatchId });
            G.hideRestartCountdown();
            G.showToast('已拒绝重新开始请求');
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.showRestartCountdown = function(seconds) {
        var overlay = $('restartCountdownOverlay');
        var countdownText = $('restartCountdownText');
        if (!overlay || !countdownText) return;
        overlay.classList.remove('hidden');
        G.restartCountdownSeconds = seconds;
        countdownText.textContent = seconds;
        G.restartCountdownTimer = setInterval(function() {
            G.restartCountdownSeconds--;
            countdownText.textContent = G.restartCountdownSeconds;
            if (G.restartCountdownSeconds <= 0) {
                G.stopRestartCountdown();
                G.hideRestartCountdown();
                G.declineOnlineRestart();
            }
        }, 1000);
    };

    G.hideRestartCountdown = function() {
        var overlay = $('restartCountdownOverlay');
        if (overlay) overlay.classList.add('hidden');
        G.stopRestartCountdown();
    };

    G.closeOnlineRoom = async function() {
        if (!G.onlineMatchId) return;
        try {
            await G.apiCall('/api/match/close', 'POST', { matchId: G.onlineMatchId });
            G.stopOnlinePolling();
            G.stopHeartbeat();
            G.stopOnlineTimer();
            G.stopTimedCountdown();

            // 离开WebSocket房间
            if (G.WebSocketManager) {
                G.WebSocketManager.leaveRoom(G.onlineMatchId);
            }

            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = '-';
            if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房间</p>';
            if (roomActions) roomActions.classList.add('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
            if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');

            G.onlineMatchId = null;
            G.onlineMyColor = null;
            G.onlineOpponent = null;
            G.gameMode = 'ai';
            G.initOnlineBoard();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startMatchListRefresh();
            G.showToast('房间已关闭');
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.leaveOnlineRoom = async function() {
        if (!G.onlineMatchId) return;
        try {
            await G.apiCall('/api/match/leave', 'POST', { matchId: G.onlineMatchId });
            G.stopOnlinePolling();
            G.stopHeartbeat();
            G.stopOnlineTimer();
            G.stopTimedCountdown();

            // 离开WebSocket房间
            if (G.WebSocketManager) {
                G.WebSocketManager.leaveRoom(G.onlineMatchId);
            }

            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = '-';
            if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房间</p>';
            if (roomActions) roomActions.classList.add('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
            if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');

            G.onlineMatchId = null;
            G.onlineMyColor = null;
            G.onlineOpponent = null;
            G.gameMode = 'ai';
            G.initOnlineBoard();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startMatchListRefresh();
            G.showToast('已离开房间');
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.showReconnectPrompt = function() {
        var overlay = $('reconnectOverlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    overlay.classList.add('hidden');
                }
            });
        }
    };

})();
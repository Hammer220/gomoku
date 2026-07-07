// ============================================================
// 联机对战模块 - 轮询
// 负责：后台轮询更新对局状态、自动重连、心跳
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    G.basePollingInterval = 2000;
    G.maxPollingInterval = 10000;

    G.startOnlinePolling = function() {
        if (G.onlinePollingTimer) return;
        G.onlinePollingTimer = setInterval(G.pollOnlineMatch, G.currentPollingInterval);
    };

    G.stopOnlinePolling = function() {
        if (G.onlinePollingTimer) {
            clearInterval(G.onlinePollingTimer);
            G.onlinePollingTimer = null;
        }
    };

    G.startHeartbeat = function() {
        if (G.heartbeatTimer) return;
        G.heartbeatTimer = setInterval(G.sendHeartbeat, 30000);
    };

    G.stopHeartbeat = function() {
        if (G.heartbeatTimer) {
            clearInterval(G.heartbeatTimer);
            G.heartbeatTimer = null;
        }
    };

    G.sendHeartbeat = async function() {
        try {
            await G.apiCall('/api/match/heartbeat', 'POST', {});
        } catch (e) {
            console.error('心跳发送失败:', e);
        }
    };

    G.pollOnlineMatch = async function() {
        if (!G.onlineMatchId || !G.onlineGameActive) return;
        try {
            var res = await G.apiCall('/api/match/' + G.onlineMatchId + '/status', 'GET');
            if (res.error) {
                console.warn('轮询错误:', res.error);
                return;
            }

            if (res.status === 'closed' || res.status === 'finished') {
                G.onlineGameActive = false;
                G.stopOnlinePolling();
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                G.stopHeartbeat();
                var message = res.status === 'closed' ? '房间已被关闭，已自动返回大厅' : '对局已结束，已自动关闭';
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
                G.showToast(message, true);
                return;
            }

            if (res.status === 'waiting_for_reconnect') {
                G.showReconnectPrompt();
                return;
            }

            if (res.restartRequested && !res.restartAccepted && !res.restartDeclinedBy) {
                if (!G.restartCountdownTimer && G.onlineGameActive && res.winner) {
                    G.showRestartCountdown(30);
                }
            }

            if (res.restartRequested && res.restartDeclinedBy && !res.restartAccepted) {
                G.hideRestartCountdown();
                if (res.restartDeclinedBy !== G.username) {
                    G.showToast('对手拒绝了重新开始请求');
                }
                res.restartRequested = false;
                res.restartDeclinedBy = null;
            }

            if (res.restartInitiated && res.restartVersion && res.restartVersion > G.lastRestartVersion) {
                G.lastRestartVersion = res.restartVersion;
                G.initOnlineBoard();
                G.onlineMoveHistory = [];
                G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                G.onlineCurrentPlayer = res.currentPlayer;
                G.onlineMyColor = res.creatorColor === (G.onlineMyColor === 1 ? 1 : 2) ? 1 : 2;
                G.onlineOpponent = G.onlineOpponent;
                G.onlineGameActive = true;
                G.lastRestartVersion = res.restartVersion;
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
                G.startOnlineTimer();
                G.startTimedCountdown();
                G.stopRestartCountdown();
                G.hideRestartCountdown();
                G.showToast('对局已重新开始！');
                return;
            }

            var boardChanged = false;
            if (res.board && res.moves && res.moves.length !== (G.onlineMoveHistory || []).length) {
                G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                G.onlineMoveHistory = res.moves.slice();
                G.onlineCurrentPlayer = res.currentPlayer;
                if (res.timeMode !== 'untimed') {
                    G.onlineBlackTime = res.blackTime;
                    G.onlineWhiteTime = res.whiteTime;
                    G.onlineLastMoveTime = Date.now() / 1000;
                    G.updateTimedCountdown();
                }
                boardChanged = true;
                if (G.drawOnlineBoard) G.drawOnlineBoard();
            }

            if (res.winner !== undefined && res.winner !== null) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                var myWin = res.winner === G.onlineMyColor;
                var statusText = $('onlineStatusText');
                if (statusText) {
                    statusText.textContent = myWin ? '你赢了！' : '你输了';
                    statusText.className = myWin
                        ? 'text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse'
                        : 'text-xl font-semibold text-gray-400';
                }
                G.showRestartRequestUI();
                if (G.onlineTimeMode && G.onlineTimeMode !== 'untimed') {
                    if (res.timeout && res.winner !== G.onlineMyColor) {
                        G.showToast('超时认输，对手获胜', true);
                    } else {
                        G.showToast(myWin ? '你赢了！' : '你输了');
                    }
                } else {
                    G.showToast(myWin ? '你赢了！' : '你输了');
                }
                return;
            }

            if (boardChanged) {
                G.updateOnlineUI();
                G.reconnectAttempts = 0;
                G.currentPollingInterval = G.basePollingInterval;
            }

            G.updateOnlineTimers();

            if (res.undoRequested && res.undoRequestedBy && res.undoRequestedBy !== G.username) {
                G.showUndoRequestPrompt();
            } else if (!res.undoRequested) {
                G.hideUndoRequestPrompt();
            }

            if (res.drawRequested && res.drawRequestedBy && res.drawRequestedBy !== G.username) {
                G.showDrawRequestPrompt();
            } else if (!res.drawRequested) {
                G.hideDrawRequestPrompt();
            }

            if (res.drawAccepted && res.winner === 0) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                var statusText = $('onlineStatusText');
                if (statusText) {
                    statusText.textContent = '和棋';
                    statusText.className = 'text-xl font-semibold text-gray-400';
                }
                G.showRestartRequestUI();
                G.showToast('双方同意和棋');
            }

            if (res.undoAccepted && res.board && res.moves !== undefined) {
                G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                G.onlineMoveHistory = res.moves.slice();
                G.onlineCurrentPlayer = res.currentPlayer;
                G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                G.onlineMoveHistory = res.moves.slice();
                G.onlineCurrentPlayer = res.currentPlayer;
                if (res.timeMode !== 'untimed') {
                    G.onlineBlackTime = res.blackTime;
                    G.onlineWhiteTime = res.whiteTime;
                    G.onlineLastMoveTime = Date.now() / 1000;
                    G.updateTimedCountdown();
                }
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
                G.showToast('悔棋生效');
                G.undoRequested = false;
            }

            if (res.undoDeclined && res.undoDeclinedBy === res.undoDeclinedBy && !res.undoRequested) {
                G.hideUndoRequestPrompt();
                if (res.undoDeclinedBy !== G.username) {
                    G.showToast('对手拒绝了悔棋请求');
                }
            }

            if (res.drawDeclined && res.drawDeclinedBy === res.drawDeclinedBy && !res.drawRequested) {
                G.hideDrawRequestPrompt();
                if (res.drawDeclinedBy !== G.username) {
                    G.showToast('对手拒绝了和棋请求');
                }
            }

        } catch (e) {
            console.error('轮询错误:', e);
            G.reconnectAttempts = (G.reconnectAttempts || 0) + 1;
            if (G.reconnectAttempts > 5) {
                G.currentPollingInterval = Math.min(G.currentPollingInterval + 1000, G.maxPollingInterval);
                G.stopOnlinePolling();
                G.startOnlinePolling();
            }
        }
    };

})();
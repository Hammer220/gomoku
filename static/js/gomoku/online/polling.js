// ============================================================
// 联机对战模块 - 轮询
// 负责：后台轮询更新对局状态、自动重连、心跳
// WebSocket优先：WebSocket连接时自动停止轮询，断开时恢复轮询
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
        if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) return;
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
            if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) {
                G.WebSocketManager.sendHeartbeat();
            } else {
                await G.apiCall('/api/match/heartbeat', 'POST', {});
            }
        } catch (e) {
            console.error('心跳发送失败:', e);
        }
    };

    G.pollOnlineMatch = async function() {
        if (!G.onlineMatchId || !G.onlineGameActive) return;
        if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) return;
        try {
            var res = await G.apiCall('/api/match/' + G.onlineMatchId + '/status', 'GET');
            if (res.error) {
                console.warn('轮询错误:', res.error);
                return;
            }
            G.processMatchData(res);
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

    G.processMatchData = function(res) {
        if (!res || !G.onlineMatchId) return;

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

            if (G.WebSocketManager && G.onlineMatchId) {
                G.WebSocketManager.leaveRoom(G.onlineMatchId);
            }

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
        }

        if (res.restartInitiated && res.restartVersion && res.restartVersion > (G.lastRestartVersion || 0)) {
            G.lastRestartVersion = res.restartVersion;
            G.initOnlineBoard();
            G.onlineMoveHistory = [];
            G.onlineBoard = res.board.map(function(r) { return r.slice(); });
            G.onlineCurrentPlayer = res.currentPlayer;
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

            var message = '';
            if (res.winReason === 'opponent_left') {
                message = '对手已离开';
            } else if (res.winReason === 'resign') {
                message = myWin ? '对手认输' : '你已认输';
            } else if (res.timeout) {
                message = myWin ? '对手超时' : '你超时了';
            } else {
                message = myWin ? '五子连珠！' : '对手五子连珠';
            }

            G.showGameEndDialog(myWin, message);
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

        if (res.undoDeclined && !res.undoRequested) {
            G.hideUndoRequestPrompt();
            if (res.undoDeclinedBy !== G.username) {
                G.showToast('对手拒绝了悔棋请求');
            }
        }

        if (res.drawDeclined && !res.drawRequested) {
            G.hideDrawRequestPrompt();
            if (res.drawDeclinedBy !== G.username) {
                G.showToast('对手拒绝了和棋请求');
            }
        }
    };

    G.initWebSocketPollingIntegration = function() {
        if (!G.WebSocketManager) return;

        G.WebSocketManager.on('match_updated', function(data) {
            console.log('WebSocket收到游戏更新:', data);
            G.processMatchData(data);
        });

        G.WebSocketManager.on('move_made', function(data) {
            console.log('WebSocket收到落子:', data);
            if (data.board && data.moves) {
                G.onlineBoard = data.board.map(function(r) { return r.slice(); });
                G.onlineMoveHistory = data.moves.slice();
                G.onlineCurrentPlayer = data.currentPlayer;
                if (data.timeMode !== 'untimed') {
                    G.onlineBlackTime = data.blackTime;
                    G.onlineWhiteTime = data.whiteTime;
                    G.onlineLastMoveTime = Date.now() / 1000;
                    G.updateTimedCountdown();
                }
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
            }
        });

        G.WebSocketManager.on('undo_requested', function(data) {
            console.log('WebSocket收到悔棋请求:', data);
            if (data.requestedBy !== G.username) {
                G.showUndoRequestPrompt();
            }
        });

        G.WebSocketManager.on('draw_requested', function(data) {
            console.log('WebSocket收到和棋请求:', data);
            if (data.requestedBy !== G.username) {
                G.showDrawRequestPrompt();
            }
        });

        G.WebSocketManager.on('joined', function(data) {
            console.log('WebSocket加入房间成功:', data);
        });

        G.WebSocketManager.on('left', function(data) {
            console.log('WebSocket离开房间:', data);
        });

        G.WebSocketManager.on('opponent_disconnected', function(data) {
            console.log('对手WebSocket断开:', data);
            if (data.match_id === G.onlineMatchId) {
                G.showToast('对手连接断开，等待重连...', true);
            }
        });

        G.WebSocketManager.on('connected', function() {
            console.log('WebSocket已连接，停止HTTP轮询');
            G.stopOnlinePolling();
        });

        G.WebSocketManager.on('disconnected', function() {
            console.log('WebSocket连接断开，恢复HTTP轮询');
            G.showToast('WebSocket连接断开，切换到轮询模式', true);
            if (G.onlineMatchId && G.onlineGameActive) {
                G.startOnlinePolling();
            }
        });

        G.WebSocketManager.on('polling_started', function() {
            console.log('已切换到轮询模式');
            if (G.onlineMatchId && G.onlineGameActive) {
                G.startOnlinePolling();
            }
        });
    };

    G.handleMatchUpdate = function(data) {
        G.processMatchData(data);
    };

    G.handleMoveMade = function(data) {
        if (!data || !data.match_id) return;
        if (data.match_id !== G.onlineMatchId) return;

        if (data.board && data.moves) {
            G.onlineBoard = data.board.map(function(r) { return r.slice(); });
            G.onlineMoveHistory = data.moves.slice();
            G.onlineCurrentPlayer = data.currentPlayer;
            if (data.timeMode !== 'untimed') {
                G.onlineBlackTime = data.blackTime;
                G.onlineWhiteTime = data.whiteTime;
                G.onlineLastMoveTime = Date.now() / 1000;
                G.updateTimedCountdown();
            }
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
        }
    };

    G.returnToLobby = function() {
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
    };

    G.sendWebSocketMove = function(row, col) {
        if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) {
            G.WebSocketManager.sendMove({
                match_id: G.onlineMatchId,
                row: row,
                col: col
            });
        }
    };

    G.sendWebSocketUndoRequest = function() {
        if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) {
            G.WebSocketManager.sendUndoRequest({
                match_id: G.onlineMatchId,
                requestedBy: G.username
            });
        }
    };

    G.sendWebSocketDrawRequest = function() {
        if (G.WebSocketManager && G.WebSocketManager.usingWebSocket) {
            G.WebSocketManager.sendDrawRequest({
                match_id: G.onlineMatchId,
                requestedBy: G.username
            });
        }
    };

})();
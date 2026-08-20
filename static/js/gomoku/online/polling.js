// ============================================================
// 联机对战模块 - WebSocket实时同步
// 负责：通过WebSocket实时更新对局状态、心�?
// 所有状态更新通过WebSocket推�?
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    G.startOnlinePolling = function() {
        // WebSocket模式下不需要轮�?
    };

    G.stopOnlinePolling = function() {
        // WebSocket模式下不需要轮�?
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
            console.error('心跳发送失�?', e);
        }
    };

    G.pollOnlineMatch = async function() {
        // WebSocket模式下不需要轮�?
    };

    G.processMatchData = function(res) {
        if (!res || !G.onlineMatchId) return;

        if (res.status === 'closed' || res.status === 'finished') {
            G.onlineGameActive = false;
            G.stopOnlinePolling();
            G.stopOnlineTimer();
            G.stopTimedCountdown();
            G.stopHeartbeat();
            var message = '对局已结�?;
            if (res.winner === 0) {
                var drawMsg1 = res.draw ? '棋盘已满，平局�? : '双方同意和棋';
                G.showGameEndDialog(null, drawMsg1);
                return;
            }
            if (res.finishedReason === 'opponent_left') {
                message = '对手已离开�? + (res.winner === G.onlineMyColor ? '你获胜了�? : '你输�?);
            } else if (res.status === 'closed') {
                message = '房间已被关闭，已自动返回大厅';
            } else if (res.winner) {
                message = '游戏结束�? + (res.winner === G.onlineMyColor ? '你获胜了�? : '你输�?);
            }
            var matchIdDisplay = $('onlineMatchIdDisplay');
            var roomInfo = $('roomInfo');
            var roomActions = $('roomActions');
            var onlineLeaveBtn = $('onlineLeaveBtn');
            var onlineCreateBtn = $('onlineCreateBtn');
            var onlineJoinBtn = $('onlineJoinBtn');
            if (matchIdDisplay) matchIdDisplay.textContent = '-';
            if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房�?/p>';
            if (roomActions) roomActions.classList.add('hidden');
            if (onlineLeaveBtn) onlineLeaveBtn.classList.add('hidden');
            if (onlineCreateBtn) onlineCreateBtn.classList.remove('hidden');
            if (onlineJoinBtn) onlineJoinBtn.parentElement.classList.remove('hidden');

            var boardContainer = $('onlineBoardContainer');
            if (boardContainer) boardContainer.classList.add('hidden');

            if (G.WebSocketManager && G.onlineMatchId) {
                G.WebSocketManager.leaveRoom(G.onlineMatchId);
            }

            G.onlineMatchId = null;
            G.onlineMyColor = null;
            G.onlineOpponent = null;
            G.gameMode = 'ai';
            G.initOnlineBoard();
            G.showOnlineLobby();
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.updateOnlineUI();
            G.startMatchListRefresh();
            G.showToast(message, true);
            history.replaceState(null, '', '/online');
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
                G.showToast('对手拒绝了重新开始请�?);
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

            if (res.winner === 0) {
                var drawMsg2 = res.draw ? '棋盘已满，平局�? : '双方同意和棋';
                G.showGameEndDialog(null, drawMsg2);
                return;
            }

            if (res.winner !== 0) {
                G.winningCells = G.findWinningCells(G.onlineBoard, res.winner);
                if (G.drawOnlineBoard && res.winReason !== 'resign' && res.winReason !== 'opponent_left' && !res.timeout) {
                    G.drawOnlineBoard();
                }
            }

            var message = '';
            if (res.winReason === 'opponent_left') {
                message = '对手已离开';
            } else if (res.winReason === 'resign') {
                message = myWin ? '对手认输' : '你已认输';
            } else if (res.timeout) {
                message = myWin ? '对手超时' : '你超时了';
            } else {
                message = myWin ? '五子连珠�? : '对手五子连珠';
            }

            G.showGameEndDialog(myWin, message);
            return;
        }

        if (boardChanged) {
            G.updateOnlineUI();
        }

        G.updateOnlineTimers();

        if (res.spectatorCount !== undefined) {
            G.updateSpectatorCount(res.spectatorCount);
        }

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
            var statusLabel = $('onlineStatusLabel');
            if (statusLabel) {
                statusLabel.textContent = '和棋';
            }
            var statusLight = $('onlineStatusLight');
            if (statusLight) {
                statusLight.className = 'inline-block w-3 h-3 bg-gray-400 rounded-full mr-2';
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
                G.showToast('对手拒绝了悔棋请�?);
            }
        }

        if (res.drawDeclined && !res.drawRequested) {
            G.hideDrawRequestPrompt();
            if (res.drawDeclinedBy !== G.username) {
                G.showToast('对手拒绝了和棋请�?);
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

        G.WebSocketManager.on('connected', function() {
            console.log('WebSocket已连�?);
        });

        G.WebSocketManager.on('not_authenticated', function() {
            console.log('WebSocket认证失败，请重新登录');
            G.showToast('认证失败，请重新登录', true);
        });

        G.WebSocketManager.on('ws_error', function(data) {
            console.error('WebSocket错误:', data);
            if (data && data.message) {
                G.showToast(data.message, true);
            }
        });

        G.WebSocketManager.on('game_over', function(data) {
            console.log('WebSocket收到游戏结束:', data);
            if (data.match_id === G.onlineMatchId) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                var myWin = data.winner === G.onlineMyColor;
                var message = data.reason || '游戏结束';
                if (data.winner && data.winner !== 0) {
                    G.winningCells = G.findWinningCells(G.onlineBoard, data.winner);
                    if (G.drawOnlineBoard) G.drawOnlineBoard();
                }
                G.showGameEndDialog(myWin, message);
            }
        });

        G.WebSocketManager.on('match_started', function(data) {
            console.log('WebSocket收到对局开�?', data);
            if (data.match_id === G.onlineMatchId) {
                G.onlineGameActive = true;
                G.onlineBoard = data.board.map(function(r) { return r.slice(); });
                G.onlineCurrentPlayer = data.currentPlayer;
                G.onlineMoveHistory = [];
                G.winningCells = [];
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.updateOnlineUI();
                G.startOnlineTimer();
                G.startTimedCountdown();
                G.showToast('对局开始！');
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
        if (roomInfo) roomInfo.innerHTML = '<p class="text-gray-500">未加入房�?/p>';
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










// ============================================================
// 联机对战模块 - 实时同步与降级轮询
// 负责：
//   1. 优先消费 WebSocket 推送的对局状态（match_updated）
//   2. WebSocket 断开/降级期间自动使用 HTTP 轮询 /api/match/status
//   3. WebSocket 恢复后自动停止轮询
//   4. 对局心跳（WS/HTTP 自动分流）
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    /** 降级轮询间隔（毫秒） */
    var ONLINE_POLL_INTERVAL = 2000;

    /** 当前登录用户名（兼容旧代码中 G.username 的引用） */
    function getUsername() {
        if (G.currentUser && G.currentUser.username) return G.currentUser.username;
        return G.username || '';
    }

    // ============================================================
    // 降级轮询：仅在房间内且 Socket.IO 未连接时运行
    // ============================================================

    /** 进入房间后轮询的意图（离开/对局结束时关闭） */
    G.onlinePollingActive = false;

    /** 根据 Socket.IO 连接状态决定是否真正启动定时器 */
    function syncOnlinePolling() {
        var wsConnected = !!(G.WebSocketManager && G.WebSocketManager.isConnected());

        if (G.onlinePollingActive && !wsConnected && G.onlineMatchId) {
            if (!G.onlinePollingTimer) {
                console.log('[Online] 实时连接不可用，启动 HTTP 轮询');
                G.pollOnlineMatch();
                G.onlinePollingTimer = setInterval(G.pollOnlineMatch, ONLINE_POLL_INTERVAL);
            }
        } else {
            if (G.onlinePollingTimer) {
                console.log('[Online] 实时连接已恢复，停止 HTTP 轮询');
                clearInterval(G.onlinePollingTimer);
                G.onlinePollingTimer = null;
            }
        }
    }

    G.startOnlinePolling = function() {
        G.onlinePollingActive = true;
        syncOnlinePolling();
    };

    G.stopOnlinePolling = function() {
        G.onlinePollingActive = false;
        if (G.onlinePollingTimer) {
            clearInterval(G.onlinePollingTimer);
            G.onlinePollingTimer = null;
        }
    };

    /**
     * 重新渲染"房间信息"卡片：对手加入、状态切换时调用。
     * 会读取 G.onlineMyColor / G.onlineMatchId / res.opponent / res.status / res.timeMode 等，
     * 保持与 room_actions.js 里 onlineCreateMatch / onlineJoinMatch 初始化时一致的文案。
     */
    G.refreshRoomInfo = function(res) {
        var roomInfo = $('roomInfo');
        if (!roomInfo || !G.onlineMatchId) return;

        var myColor = G.onlineMyColor;
        var colorLabel = (myColor === 1 ? '黑棋' : (myColor === 2 ? '白棋' : '-'));
        var opponent = (res && res.opponent) || G.onlineOpponent || null;
        var status = (res && res.status) || (opponent ? 'playing' : 'waiting');
        var statusLabel, statusCls;
        if (status === 'playing') {
            statusLabel = opponent ? '对弈中' : '等待对手加入...';
            statusCls = 'text-green-600';
        } else if (status === 'waiting') {
            statusLabel = '等待对手加入...';
            statusCls = 'text-amber-600';
        } else {
            statusLabel = '对局已结束';
            statusCls = 'text-gray-500';
        }
        var modeNames = {untimed: '无计时', move: '每步限时', total: '总计时', both: '每步+总计时'};
        var modeLabel = modeNames[(res && res.timeMode) || 'untimed'] || '无计时';
        var opponentLine = opponent
            ? '<p>对手: <span class="font-bold">' + opponent + '</span></p>'
            : '<p class="text-sm text-gray-500">等待对手加入...</p>';

        roomInfo.innerHTML =
            '<p>房间 <span class="font-mono font-bold text-lg">' + G.onlineMatchId + '</span></p>' +
            '<p>你的棋子: <span class="font-bold">' + colorLabel + '</span></p>' +
            '<p>计时模式: <span class="text-amber-600">' + modeLabel + '</span></p>' +
            opponentLine +
            '<p>状态: <span class="' + statusCls + '">' + statusLabel + '</span></p>';
    };

    G.pollOnlineMatch = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/status?matchId=' + encodeURIComponent(G.onlineMatchId), 'GET');
            if (res && G.onlineMatchId) {
                G.processMatchData(res);
            }
        } catch (e) {
            // 404/403 或网络错误：不打扰用户，等待下次轮询或离开流程显式停止
            console.warn('[Online] 轮询对局状态失败:', e && e.message ? e.message : e);
        }
    };

    // ============================================================
    // 心跳
    // ============================================================

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
            if (G.WebSocketManager && G.WebSocketManager.isConnected()) {
                G.WebSocketManager.sendHeartbeat();
            } else {
                await G.apiCall('/api/match/heartbeat', 'POST', {});
            }
        } catch (e) {
            console.error('心跳发送失败', e);
        }
    };

    // ============================================================
    // 对局状态渲染（WS 推送与轮询共用同一入口）
    // ============================================================

    G.processMatchData = function(res) {
        if (!res || !G.onlineMatchId) return;

        if (res.status === 'closed' || res.status === 'finished') {
            G.onlineGameActive = false;
            G.stopOnlinePolling();
            G.stopOnlineTimer();
            G.stopTimedCountdown();
            G.stopHeartbeat();
            var message = '对局已结束';
            if (res.winner === 0) {
                var drawMsg1 = res.draw ? '棋盘已满，平局' : '双方同意和棋';
                G.showGameEndDialog(null, drawMsg1);
                return;
            }
            if (res.finishedReason === 'opponent_left' || res.winReason === 'opponent_left') {
                message = '对手已离开，' + (res.winner === G.onlineMyColor ? '你获胜了' : '你输了');
            } else if (res.status === 'closed') {
                message = '房间已被关闭，已自动返回大厅';
            } else if (res.winner) {
                message = '游戏结束，' + (res.winner === G.onlineMyColor ? '你获胜了' : '你输了');
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
            if (res.restartDeclinedBy !== getUsername()) {
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

        // 对手加入 / 状态切换：即使棋盘没动也要刷新房间信息 UI
        var opponentChanged = (G.onlineOpponent || null) !== (res.opponent || null);
        var playingStarted = G.onlineGameActive !== (res.status === 'playing');
        if (opponentChanged && res.opponent) {
            G.onlineOpponent = res.opponent;
            if (res.status === 'playing') {
                G.onlineGameActive = true;
            }
            G.refreshRoomInfo(res);
            // 仅在真正从 waiting → playing 时弹"对局开始"提示
            if (playingStarted) {
                if (G.drawOnlineBoard) G.drawOnlineBoard();
                G.startOnlineTimer();
                G.startTimedCountdown();
                G.showToast('对手 ' + res.opponent + ' 已加入，对局开始！');
            } else {
                G.showToast('对手 ' + res.opponent + ' 已加入房间');
            }
            G.updateOnlineUI();
        } else if (playingStarted && res.status === 'playing') {
            // 状态被外部推到 playing（比如重建页面后 recoverOnlineMatch 刚结束 waiting）
            G.onlineGameActive = true;
            if (res.opponent) G.onlineOpponent = res.opponent;
            G.refreshRoomInfo(res);
            G.updateOnlineUI();
        } else if (opponentChanged && !res.opponent && G.onlineOpponent) {
            // 对手离开
            G.onlineOpponent = null;
            G.showToast('对手已离开');
            G.refreshRoomInfo(res);
            G.updateOnlineUI();
        }

        if (res.winner !== undefined && res.winner !== null) {
            G.onlineGameActive = false;
            G.stopOnlineTimer();
            G.stopTimedCountdown();
            var myWin = res.winner === G.onlineMyColor;

            if (res.winner === 0) {
                var drawMsg2 = res.draw ? '棋盘已满，平局' : '双方同意和棋';
                G.showGameEndDialog(null, drawMsg2);
                return;
            }

            if (res.winner !== 0) {
                G.winningCells = G.findWinningCells(G.onlineBoard, res.winner);
                if (G.drawOnlineBoard && res.winReason !== 'resign' && res.winReason !== 'opponent_left'
                    && !res.timeout && !res.timeoutLoser) {
                    G.drawOnlineBoard();
                }
            }

            var endMessage = '';
            if (res.winReason === 'opponent_left') {
                endMessage = '对手已离开';
            } else if (res.winReason === 'resign') {
                endMessage = myWin ? '对手认输' : '你已认输';
            } else if (res.timeout || res.timeoutLoser) {
                endMessage = myWin ? '对手超时' : '你超时了';
            } else {
                endMessage = myWin ? '五子连珠' : '对手五子连珠';
            }

            G.showGameEndDialog(myWin, endMessage);
            return;
        }

        if (boardChanged) {
            G.updateOnlineUI();
        }

        G.updateOnlineTimers();

        if (res.spectatorCount !== undefined) {
            G.updateSpectatorCount(res.spectatorCount);
        }

        if (res.undoRequested && res.undoRequestedBy && res.undoRequestedBy !== getUsername()) {
            G.showUndoRequestPrompt();
        } else if (!res.undoRequested) {
            G.hideUndoRequestPrompt();
        }

        if (res.drawRequested && res.drawRequestedBy && res.drawRequestedBy !== getUsername()) {
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
            if (res.undoDeclinedBy !== getUsername()) {
                G.showToast('对手拒绝了悔棋请求');
            }
        }

        if (res.drawDeclined && !res.drawRequested) {
            G.hideDrawRequestPrompt();
            if (res.drawDeclinedBy !== getUsername()) {
                G.showToast('对手拒绝了和棋请求');
            }
        }
    };

    // ============================================================
    // WebSocket 事件集成
    // ============================================================

    /** 防止降级/恢复提示刷屏 */
    var lastDowngradeNotice = 0;

    G.initWebSocketPollingIntegration = function() {
        if (!G.WebSocketManager) return;

        G.WebSocketManager.on('match_updated', function(data) {
            if (!data) return;
            // 忽略其他房间的广播
            if (data.match_id && G.onlineMatchId && data.match_id !== G.onlineMatchId) return;
            G.processMatchData(data);
        });

        G.WebSocketManager.on('move_made', function(data) {
            G.handleMoveMade(data);
        });

        G.WebSocketManager.on('undo_requested', function(data) {
            if (data && data.requestedBy && data.requestedBy !== getUsername()) {
                G.showUndoRequestPrompt();
            }
        });

        G.WebSocketManager.on('draw_requested', function(data) {
            if (data && data.requestedBy && data.requestedBy !== getUsername()) {
                G.showDrawRequestPrompt();
            }
        });

        G.WebSocketManager.on('connected', function() {
            console.log('[Online] 实时连接已建立');
            // 实时通道恢复：停止轮询，并立即拉取一次补齐断线期间的状态
            syncOnlinePolling();
            if (G.onlinePollingActive && G.onlineMatchId) {
                G.pollOnlineMatch();
            }
            if (Date.now() - lastDowngradeNotice < 60000) {
                lastDowngradeNotice = 0;
                if (G.onlineMatchId) {
                    G.showToast('实时连接已恢复');
                }
            }
        });

        G.WebSocketManager.on('disconnected', function() {
            // 进入房间期间断线：启动 HTTP 轮询兜底
            if (G.onlinePollingActive && G.onlineMatchId) {
                syncOnlinePolling();
            }
        });

        G.WebSocketManager.on('transport_downgraded', function() {
            // WebSocket 不通，已降级为 Socket.IO 长轮询（仍是实时推送，无需业务轮询）
            console.warn('[Online] WebSocket 不可用，已降级为长轮询');
            lastDowngradeNotice = Date.now();
            if (G.onlineMatchId) {
                G.showToast('实时连接降级，正在使用轮询同步');
            }
            syncOnlinePolling();
        });

        G.WebSocketManager.on('not_authenticated', function() {
            G.showToast('认证失败，请重新登录', true);
        });

        G.WebSocketManager.on('ws_error', function(data) {
            console.error('WebSocket错误:', data);
            if (data && data.message) {
                G.showToast(data.message, true);
            }
        });

        G.WebSocketManager.on('game_over', function(data) {
            if (!data || data.match_id !== G.onlineMatchId) return;
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
        });

        G.WebSocketManager.on('match_started', function(data) {
            if (!data || data.match_id !== G.onlineMatchId) return;
            G.onlineGameActive = true;
            if (data.board) {
                G.onlineBoard = data.board.map(function(r) { return r.slice(); });
            }
            G.onlineCurrentPlayer = data.currentPlayer;
            G.onlineMoveHistory = [];
            G.winningCells = [];
            if (G.drawOnlineBoard) G.drawOnlineBoard();
            G.refreshRoomInfo(data);
            G.updateOnlineUI();
            G.startOnlineTimer();
            G.startTimedCountdown();
            G.showToast('对局开始！');
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
        if (G.WebSocketManager && G.WebSocketManager.isConnected()) {
            G.WebSocketManager.sendMove({
                match_id: G.onlineMatchId,
                row: row,
                col: col
            });
        }
    };

    G.sendWebSocketUndoRequest = function() {
        if (G.WebSocketManager && G.WebSocketManager.isConnected()) {
            G.WebSocketManager.sendUndoRequest({
                match_id: G.onlineMatchId,
                requestedBy: getUsername()
            });
        }
    };

    G.sendWebSocketDrawRequest = function() {
        if (G.WebSocketManager && G.WebSocketManager.isConnected()) {
            G.WebSocketManager.sendDrawRequest({
                match_id: G.onlineMatchId,
                requestedBy: getUsername()
            });
        }
    };

})();

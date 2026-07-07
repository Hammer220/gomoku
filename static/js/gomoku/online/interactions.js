// ============================================================
// 联机对战模块 - 交互操作
// 负责：悔棋、和棋、观战、落子等交互操作
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    // ==================== 悔棋 ====================

    G.requestOnlineUndo = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/undo/request', 'POST', { matchId: G.onlineMatchId });
            if (res.undoRequested) {
                G.showToast('已请求悔棋，等待对手确认...');
            } else if (res.undoCancelled) {
                G.showToast('已取消悔棋请求');
            } else if (res.undoAccepted) {
                if (res.board) {
                    G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                    G.onlineMoveHistory = res.moves.slice();
                    G.onlineCurrentPlayer = res.currentPlayer;
                    if (G.drawOnlineBoard) G.drawOnlineBoard();
                    G.updateOnlineUI();
                    G.showToast('悔棋成功');
                }
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.acceptOnlineUndo = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/undo/accept', 'POST', { matchId: G.onlineMatchId });
            if (res.undoAccepted) {
                if (res.board) {
                    G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                    G.onlineMoveHistory = res.moves.slice();
                    G.onlineCurrentPlayer = res.currentPlayer;
                    if (G.drawOnlineBoard) G.drawOnlineBoard();
                    G.updateOnlineUI();
                    G.showToast('悔棋已同意');
                }
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.declineOnlineUndo = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/undo/decline', 'POST', { matchId: G.onlineMatchId });
            G.hideUndoRequestPrompt();
            G.showToast('已拒绝悔棋请求');
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.showUndoRequestPrompt = function() {
        var overlay = $('undoRequestOverlay');
        if (overlay) overlay.classList.remove('hidden');
    };

    G.hideUndoRequestPrompt = function() {
        var overlay = $('undoRequestOverlay');
        if (overlay) overlay.classList.add('hidden');
    };

    // ==================== 和棋 ====================

    G.requestOnlineDraw = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/draw/request', 'POST', { matchId: G.onlineMatchId });
            if (res.drawRequested) {
                G.showToast('已请求和棋，等待对手确认...');
            } else if (res.drawCancelled) {
                G.showToast('已取消和棋请求');
            } else if (res.drawAccepted) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                G.showRestartRequestUI();
                G.showToast('双方同意和棋');
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.acceptOnlineDraw = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/draw/accept', 'POST', { matchId: G.onlineMatchId });
            if (res.drawAccepted) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                var statusText = $('onlineStatusText');
                if (statusText) {
                    statusText.textContent = '和棋';
                    statusText.className = 'text-xl font-semibold text-gray-400';
                }
                G.showRestartRequestUI();
                G.showToast('和棋！');
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.declineOnlineDraw = async function() {
        if (!G.onlineMatchId) return;
        try {
            var res = await G.apiCall('/api/match/draw/decline', 'POST', { matchId: G.onlineMatchId });
            G.hideDrawRequestPrompt();
            G.showToast('已拒绝和棋请求');
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.showDrawRequestPrompt = function() {
        var overlay = $('drawRequestOverlay');
        if (overlay) overlay.classList.remove('hidden');
    };

    G.hideDrawRequestPrompt = function() {
        var overlay = $('drawRequestOverlay');
        if (overlay) overlay.classList.add('hidden');
    };

    // ==================== 观战 ====================

    G.loadSpectatableMatches = async function() {
        try {
            var res = await G.apiCall('/api/match/spectate/list', 'GET');
            var container = $('spectatableMatchesContainer');
            if (!container) return;
            var matches = res.matches || [];
            if (matches.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">暂无可观看的对局</div>';
                return;
            }
            var html = '';
            matches.forEach(function(match) {
                var lockIcon = match.hasPassword ? ' 🔒' : '';
                html += '\
                    <div class="border border-gray-200 rounded-lg p-3 hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-colors mb-2"\
                         onclick="Gomoku.spectateMatch(\'' + match.id + '\', ' + (match.hasPassword ? 'true' : 'false') + ')">\
                        <div class="flex justify-between items-center">\
                            <span class="font-mono font-bold text-gray-800">' + match.id + lockIcon + '</span>\
                            <span class="text-xs text-gray-500">' + match.moveCount + ' 手</span>\
                        </div>\
                        <div class="text-sm text-gray-600 mt-1">\
                            ' + match.creator + ' vs ' + (match.opponent || '等待中') + '\
                            <span class="text-xs text-gray-400 ml-2">' + match.spectatorCount + ' 人观看</span>\
                        </div>\
                    </div>\
                ';
            });
            container.innerHTML = html;
        } catch (e) {
            console.error('加载观战列表错误:', e);
        }
    };

    G.spectateMatch = async function(matchId, hasPassword) {
        try {
            var payload = {};
            var pwd = '';
            if (hasPassword) {
                pwd = prompt('该房间需要密码，请输入密码：');
                if (pwd === null) return;
                payload.password = pwd;
            }
            var res = await G.apiCall('/api/match/spectate/join', 'POST', Object.assign({matchId: matchId}, payload));
            if (res.error) {
                G.showToast(res.error, true);
                return;
            }
            G.spectateMatchId = matchId;
            G.spectateBoard = res.board.map(function(r) { return r.slice(); });
            G.spectateMoveHistory = res.moves.slice();
            G.spectateCurrentPlayer = res.currentPlayer;
            G.spectateGameActive = true;
            G.spectateCreator = res.creator;
            G.spectateOpponent = res.opponent;
            G.spectateTimeMode = res.timeMode;
            G.spectateBlackTime = res.blackTime;
            G.spectateWhiteTime = res.whiteTime;

            var spectatePanel = $('spectatePanel');
            if (spectatePanel) spectatePanel.classList.remove('hidden');

            G.updateSpectateUI();
            G.startSpectatePolling();
            G.showToast('正在观看 ' + matchId);
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.startSpectatePolling = function() {
        if (G.spectatePollingTimer) return;
        G.spectatePollingTimer = setInterval(G.pollSpectateMatch, 2000);
    };

    G.stopSpectatePolling = function() {
        if (G.spectatePollingTimer) {
            clearInterval(G.spectatePollingTimer);
            G.spectatePollingTimer = null;
        }
    };

    G.pollSpectateMatch = async function() {
        if (!G.spectateMatchId) return;
        try {
            var res = await G.apiCall('/api/match/spectate/status?matchId=' + G.spectateMatchId, 'GET');
            if (res.error) {
                G.stopSpectatePolling();
                return;
            }
            if (res.board && res.moves) {
                G.spectateBoard = res.board.map(function(r) { return r.slice(); });
                G.spectateMoveHistory = res.moves.slice();
                G.spectateCurrentPlayer = res.currentPlayer;
                G.spectateBlackTime = res.blackTime;
                G.spectateWhiteTime = res.whiteTime;
                G.updateSpectateUI();
                if (G.drawSpectateBoard) G.drawSpectateBoard();
            }
            if (res.winner !== undefined && res.winner !== null) {
                G.spectateGameActive = false;
                G.updateSpectateUI();
            }
            if (res.restartVersion && res.restartVersion > (G.spectateRestartVersion || 0)) {
                G.spectateRestartVersion = res.restartVersion;
                G.spectateBoard = res.board.map(function(r) { return r.slice(); });
                G.spectateMoveHistory = res.moves.slice();
                G.spectateCurrentPlayer = res.currentPlayer;
                G.spectateGameActive = true;
                if (G.drawSpectateBoard) G.drawSpectateBoard();
                G.updateSpectateUI();
            }
        } catch (e) {
            console.error('观战轮询错误:', e);
        }
    };

    G.updateSpectateUI = function() {
        var spectateInfo = $('spectateInfo');
        if (!spectateInfo) return;
        spectateInfo.innerHTML =
            '<p><span class="font-bold">' + G.spectateCreator + '</span> vs <span class="font-bold">' + (G.spectateOpponent || '等待中') + '</span></p>' +
            '<p class="text-sm text-gray-500">当前回合: ' + (G.spectateCurrentPlayer === 1 ? '黑棋' : '白棋') + '</p>' +
            '<p class="text-sm text-gray-500">' + (G.spectateMoveHistory ? G.spectateMoveHistory.length : 0) + ' 手</p>';
    };

    G.leaveSpectate = async function() {
        if (!G.spectateMatchId) return;
        try {
            await G.apiCall('/api/match/spectate/leave', 'POST', { matchId: G.spectateMatchId });
        } catch (e) {
            console.error('离开观战错误:', e);
        }
        G.stopSpectatePolling();
        G.spectateMatchId = null;
        G.spectateBoard = null;
        G.spectateMoveHistory = null;
        var spectatePanel = $('spectatePanel');
        if (spectatePanel) spectatePanel.classList.add('hidden');
    };

    // ==================== 联机落子 ====================

    G.placeOnlinePiece = async function(row, col) {
        if (!G.onlineMatchId || !G.onlineGameActive) return;
        if (G.onlineCurrentPlayer !== G.onlineMyColor) {
            G.showToast('还没轮到你，请等待对手', true);
            return;
        }
        try {
            var res = await G.apiCall('/api/match/move', 'POST', { matchId: G.onlineMatchId, row: row, col: col });
            if (res.error) {
                G.showToast(res.error, true);
                return;
            }
            if (res.board) {
                G.onlineBoard = res.board.map(function(r) { return r.slice(); });
                if (G.drawOnlineBoard) G.drawOnlineBoard();
            }
            if (res.win) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                var myWin = res.winner === G.onlineMyColor;
                G.showToast(myWin ? '你赢了！' : '你输了');
                G.showRestartRequestUI();
            }
            G.updateOnlineUI();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

})();
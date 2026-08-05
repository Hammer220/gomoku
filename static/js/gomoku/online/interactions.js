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
                G.hideDrawRequestPrompt();
                G.showGameEndDialog(null, '双方同意和棋');
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

    // ==================== 认输 ====================

    G.resignOnline = async function() {
        if (!G.onlineMatchId) return;
        if (!confirm('确定要认输吗？')) return;

        try {
            var res = await G.apiCall('/api/match/resign', 'POST', { matchId: G.onlineMatchId });
            if (res.resigned) {
                G.onlineGameActive = false;
                G.stopOnlineTimer();
                G.stopTimedCountdown();
                G.showGameEndDialog(false, '你已认输');
            }
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    // ==================== 游戏结束对话框 ====================

    G.showGameEndDialog = function(isWin, message) {
        var existingDialog = document.getElementById('gameEndDialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        var resultIcon, resultText, resultColor, bgGradient;

        if (isWin === null) {
            resultIcon = '🤝';
            resultText = '和棋';
            resultColor = 'text-blue-600';
            bgGradient = 'from-blue-50 to-gray-50';
        } else if (isWin) {
            resultIcon = '🎉';
            resultText = '恭喜你赢了！';
            resultColor = 'text-green-600';
            bgGradient = 'from-green-50 to-blue-50';
        } else {
            resultIcon = '😔';
            resultText = '很遗憾，你输了';
            resultColor = 'text-red-600';
            bgGradient = 'from-red-50 to-gray-50';
        }

        var dialog = document.createElement('div');
        dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        dialog.id = 'gameEndDialog';
        dialog.innerHTML = '\
            <div class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl bg-gradient-to-b ' + bgGradient + '">\
                <div class="text-center">\
                    <div class="text-6xl mb-4">' + resultIcon + '</div>\
                    <h2 class="text-2xl font-bold ' + resultColor + ' mb-2">' + resultText + '</h2>\
                    <p class="text-gray-600 mb-6">' + (message || '') + '</p>\
                    <div class="flex gap-3">\
                        <button id="playAgainBtn" class="flex-1 bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-medium transition-colors">\
                            <i class="fa-solid fa-redo mr-2"></i>再玩一次\
                        </button>\
                        <button id="backToLobbyBtn" class="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors">\
                            <i class="fa-solid fa-home mr-2"></i>返回大厅\
                        </button>\
                    </div>\
                </div>\
            </div>\
        ';
        document.body.appendChild(dialog);

        var playAgainBtn = dialog.querySelector('#playAgainBtn');
        var backToLobbyBtn = dialog.querySelector('#backToLobbyBtn');

        playAgainBtn.addEventListener('click', function() {
            document.body.removeChild(dialog);
            G.requestOnlineRestart();
        });

        backToLobbyBtn.addEventListener('click', function() {
            document.body.removeChild(dialog);
            G.leaveOnlineRoom();
        });
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
                var lockIcon = match.hasPassword ? '<i class="fa-solid fa-lock text-amber-500 mr-1"></i>' : '';
                var statusBadge = match.hasPassword ? 
                    '<span class="text-xs px-2 py-1 bg-amber-200 text-amber-800 rounded-full">私人</span>' :
                    '<span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">公共</span>';
                
                html += '\
                    <div class="border border-gray-200 rounded-lg p-3 hover:border-purple-400 hover:bg-purple-50 transition-colors mb-2">\
                        <div class="flex justify-between items-center">\
                            <div class="flex items-center">\
                                ' + lockIcon + '<span class="font-mono font-bold text-gray-800">' + match.id + '</span>\
                            </div>\
                            <div class="flex items-center gap-2">\
                                <button onclick="Gomoku.spectateMatch(\'' + match.id + '\', ' + (match.hasPassword ? 'true' : 'false') + ')" class="text-blue-500 hover:text-blue-700 transition-colors">\
                                    <i class="fa-solid fa-eye text-lg"></i>\
                                </button>\
                                ' + statusBadge + '\
                            </div>\
                        </div>\
                        <div class="text-sm text-gray-600 mt-1">\
                            ' + match.creator + ' vs ' + (match.opponent || '等待中') + '\
                            <span class="text-xs text-gray-400 ml-2">' + match.moveCount + ' 手</span>\
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
        if (hasPassword) {
            G.showSpectatePasswordDialog(matchId);
            return;
        }

        try {
            var res = await G.apiCall('/api/match/spectate/join', 'POST', {matchId: matchId});
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

    G.showSpectatePasswordDialog = function(matchId) {
        var existingDialog = document.getElementById('spectatePasswordDialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        var dialog = document.createElement('div');
        dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        dialog.id = 'spectatePasswordDialog';
        dialog.innerHTML = '\
            <div class="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">\
                <h3 class="text-lg font-bold text-gray-800 mb-2">私人房间观战</h3>\
                <p class="text-gray-600 mb-4">房间号: <span class="font-mono font-bold">' + matchId + '</span></p>\
                <input type="password" id="spectatePasswordInput" placeholder="请输入房间密码" class="w-full px-3 py-2 border rounded-lg mb-4">\
                <div class="flex gap-3">\
                    <button id="cancelSpectatePassword" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">取消</button>\
                    <button id="confirmSpectatePassword" class="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">确认</button>\
                </div>\
            </div>\
        ';
        document.body.appendChild(dialog);

        var cancelBtn = dialog.querySelector('#cancelSpectatePassword');
        var confirmBtn = dialog.querySelector('#confirmSpectatePassword');
        var passwordInput = dialog.querySelector('#spectatePasswordInput');

        cancelBtn.addEventListener('click', function() {
            document.body.removeChild(dialog);
        });

        confirmBtn.addEventListener('click', async function() {
            var password = passwordInput.value.trim();
            if (!password) {
                G.showToast('请输入密码', true);
                return;
            }

            try {
                var res = await G.apiCall('/api/match/spectate/join', 'POST', {matchId: matchId, password: password});
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
                document.body.removeChild(dialog);
            } catch (err) {
                G.showToast(err.message, true);
            }
        });

        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });

        passwordInput.focus();
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
                G.showGameEndDialog(myWin, myWin ? '五子连珠！' : '对手五子连珠');
            }
            G.updateOnlineUI();
        } catch (err) {
            G.showToast(err.message, true);
        }
    };

    G.makeOnlineMove = G.placeOnlinePiece;

})();
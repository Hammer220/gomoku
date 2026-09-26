// ============================================================
// 联机对战模块 - 房间列表
// 负责：可用房间列表、自动刷新、点击加载
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    G.checkExistingOnlineMatch = async function() {
        try {
            var res = await G.apiCall('/api/match/my', 'GET');
            if (res.match) {
                var match = res.match;
                if (match.status === 'waiting' || match.status === 'playing') {
                    var dialog = document.createElement('div');
                    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                    dialog.id = 'existingMatchDialog';
                    dialog.innerHTML = '\
                        <div class="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">\
                            <h3 class="text-lg font-bold text-gray-800 mb-2">发现未完成对局</h3>\
                            <p class="text-gray-600 mb-4">你已有一个未完成的联机对局，是否继续？</p>\
                            <p class="text-sm text-gray-500 mb-6">房间号: ' + match.id + '</p>\
                            <div class="flex gap-3">\
                                <button id="cancelExistingMatch" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">忽略</button>\
                                <button id="continueExistingMatch" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">继续对局</button>\
                            </div>\
                        </div>\
                    ';
                    document.body.appendChild(dialog);

                    var cancelBtn = dialog.querySelector('#cancelExistingMatch');
                    var continueBtn = dialog.querySelector('#continueExistingMatch');

                    cancelBtn.addEventListener('click', function() {
                        document.body.removeChild(dialog);
                        G.loadAvailableMatches();
                        G.startMatchListRefresh();
                    });

                    continueBtn.addEventListener('click', async function() {
                        document.body.removeChild(dialog);
                        await G.recoverOnlineMatch();
                        G.loadAvailableMatches();
                    });

                    return;
                }
            }
            G.loadAvailableMatches();
            G.startMatchListRefresh();
        } catch (e) {
            console.error('检查现有对局错误:', e);
            G.loadAvailableMatches();
            G.startMatchListRefresh();
        }
    };

    G.clickAvailableMatch = function(matchId, hasPassword) {
        G.onlineMatchIdInput = G.onlineMatchIdInput || $('onlineMatchIdInput');
        if (G.onlineMatchIdInput) {
            G.onlineMatchIdInput.value = matchId;
        }
        var joinPwdInput = $('joinPasswordInput');
        if (joinPwdInput) {
            joinPwdInput.value = '';
            if (hasPassword) {
                joinPwdInput.focus();
            }
        }
        if (!hasPassword) {
            G.onlineJoinMatch();
        }
    };

    G.spectateFromList = function(matchId, spectateToken) {
        if (!spectateToken) {
            G.showToast('该房间不允许观战', true);
            return;
        }
        var url = window.location.origin + '/spectate?room=' + matchId + '&token=' + spectateToken;
        window.open(url, '_blank');
    };

    G.loadAvailableMatches = async function() {
        var container = $('availableMatchesContainer');
        var countEl = $('availableCount');
        if (!container) return;
        try {
            var res = await G.apiCall('/api/match/list', 'GET');
            var matches = res.matches || [];
            if (countEl) countEl.textContent = matches.length;
            if (matches.length === 0) {
                container.innerHTML =
                    '<div class="room-list-empty">' +
                        '<i class="fa-regular fa-face-frown"></i>' +
                        '<p>暂无可用房间，创建一个吧！</p>' +
                    '</div>';
                return;
            }
            var timeModeNames = {untimed: '无计时', move: '每步限时', total: '总计时', both: '每步+总计时'};
            var html = '';
            matches.forEach(function(match) {
                var timeModeLabel = timeModeNames[match.timeMode] || '无计时';
                var tagClass = match.hasPassword ? 'room-status-badge private' : 'room-status-badge public';
                var tagLabel = match.hasPassword ?
                    '<i class="fa-solid fa-lock"></i> 私人' :
                    '<i class="fa-solid fa-globe"></i> 公共';
                var spectateBtn = match.allowSpectate && match.spectateToken ?
                    '<button onclick="event.stopPropagation();Gomoku.spectateFromList(\'' + match.id + '\', \'' + match.spectateToken + '\')" class="room-list-item-spectate" title="观战"><i class="fa-solid fa-eye"></i></button>' : '';
                var action = match.hasPassword ?
                    'event.stopPropagation();Gomoku.clickAvailableMatch(\'' + match.id + '\', true)' :
                    'Gomoku.clickAvailableMatch(\'' + match.id + '\', false)';

                html +=
                    '<div class="room-list-item' + (match.hasPassword ? ' is-private' : '') + '"' +
                         ' onclick="' + action + '">' +
                        '<span class="room-list-item-accent"></span>' +
                        '<div class="room-list-item-main">' +
                            '<div class="room-list-item-head">' +
                                '<span class="room-list-item-id"><i class="fa-solid fa-hashtag"></i>' + match.id + '</span>' +
                                '<span class="' + tagClass + '">' + tagLabel + '</span>' +
                            '</div>' +
                            '<div class="room-list-item-meta">' +
                                '<span><i class="fa-solid fa-user"></i>' + match.creator + '</span>' +
                                '<span class="room-list-item-mode"><i class="fa-regular fa-clock"></i>' + timeModeLabel + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="room-list-item-side">' + spectateBtn + '</div>' +
                    '</div>';
            });
            container.innerHTML = html;
        } catch (e) {
            console.error('加载可用房间错误:', e);
            container.innerHTML =
                '<div class="room-list-empty error">' +
                    '<i class="fa-solid fa-triangle-exclamation"></i>' +
                    '<p>加载失败，请刷新重试</p>' +
                '</div>';
        }
    };

    /**
     * 大厅列表实时刷新：
     *   Socket.IO 已连接 —— match_list_changed 事件即时刷新 + 30s 兜底轮询
     *   Socket.IO 断开   —— 10s 轮询降级
     */
    var MATCH_LIST_POLL_CONNECTED = 30000;
    var MATCH_LIST_POLL_DISCONNECTED = 10000;
    var matchListEventDebounce = null;

    G.initMatchListRealtime = function() {
        if (!G.WebSocketManager || G._matchListRealtimeBound) return;
        G._matchListRealtimeBound = true;

        G.WebSocketManager.on('match_list_changed', function() {
            // 事件可能短时间内连续到达，合并为一次刷新
            clearTimeout(matchListEventDebounce);
            matchListEventDebounce = setTimeout(function() {
                G.loadAvailableMatches();
            }, 300);
        });

        G.WebSocketManager.on('connected', function() {
            if (G.matchListRefreshTimer) G.startMatchListRefresh();
        });
        G.WebSocketManager.on('disconnected', function() {
            if (G.matchListRefreshTimer) G.startMatchListRefresh();
        });
    };

    G.startMatchListRefresh = function() {
        G.initMatchListRealtime();
        if (G.matchListRefreshTimer) {
            clearInterval(G.matchListRefreshTimer);
            G.matchListRefreshTimer = null;
        }
        var wsConnected = !!(G.WebSocketManager && G.WebSocketManager.isConnected());
        var interval = wsConnected ? MATCH_LIST_POLL_CONNECTED : MATCH_LIST_POLL_DISCONNECTED;
        G.matchListRefreshTimer = setInterval(function() {
            G.loadAvailableMatches();
        }, interval);
    };

    G.stopMatchListRefresh = function() {
        if (G.matchListRefreshTimer) {
            clearInterval(G.matchListRefreshTimer);
            G.matchListRefreshTimer = null;
        }
        clearTimeout(matchListEventDebounce);
    };

    G.loadOnlineAvailableMatches = G.loadAvailableMatches;

})();
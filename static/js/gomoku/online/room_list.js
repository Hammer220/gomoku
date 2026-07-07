// ============================================================
// 联机对战模块 - 房间列表
// 负责：可用房间列表、自动刷新、点击加入
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
                if (match.status === 'waiting' || match.status === 'playing' || match.status === 'waiting_for_reconnect') {
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
        if (hasPassword) {
            var pwd = prompt('该房间需要密码，请输入密码：');
            if (pwd === null) return;
            if (joinPwdInput) joinPwdInput.value = pwd;
        } else {
            if (joinPwdInput) joinPwdInput.value = '';
        }
        G.onlineJoinMatch();
    };

    G.loadAvailableMatches = async function() {
        var container = $('availableMatchesContainer');
        if (!container) return;
        try {
            var res = await G.apiCall('/api/match/list', 'GET');
            var matches = res.matches || [];
            if (matches.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">暂无可用房间，请自己创建一个吧</div>';
                return;
            }
            var html = '<div class="space-y-2 max-h-48 overflow-y-auto">';
            matches.forEach(function(match) {
                var icons = '';
                if (match.hasPassword) icons += '<span class="text-xs text-amber-500" title="需要密码">🔒</span> ';
                if (!match.allowSpectate) icons += '<span class="text-xs text-gray-400" title="不允许观战">🚫</span>';
                html += '\
                    <div class="border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"\
                         onclick="Gomoku.clickAvailableMatch(\'' + match.id + '\', ' + (match.hasPassword ? 'true' : 'false') + ')">\
                        <div class="flex justify-between items-center">\
                            <span class="font-mono font-bold text-gray-800">' + match.id + ' ' + icons + '</span>\
                            <span class="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">等待加入</span>\
                        </div>\
                        <div class="text-sm text-gray-600 mt-1">创建者: ' + match.creator + '</div>\
                    </div>\
                ';
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('加载可用房间错误:', e);
            container.innerHTML = '<div class="text-center text-red-500 py-8 text-sm">加载失败，请刷新重试</div>';
        }
    };

    G.startMatchListRefresh = function() {
        if (G.matchListRefreshTimer) return;
        G.matchListRefreshTimer = setInterval(function() {
            G.loadAvailableMatches();
        }, 10000);
    };

    G.stopMatchListRefresh = function() {
        if (G.matchListRefreshTimer) {
            clearInterval(G.matchListRefreshTimer);
            G.matchListRefreshTimer = null;
        }
    };

})();
// ============================================================
// 联机对战模块 - 房间聊天
// 负责：房间内实时聊天、消息显示、发送消息
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) { return document.getElementById(id); };

    G.roomChatMessages = [];

    G.initRoomChat = function() {
        if (!G.WebSocketManager) return;

        G.WebSocketManager.on('room_chat_message', function(data) {
            G.handleRoomChatMessage(data);
        });

        G.WebSocketManager.on('opponent_disconnected', function(data) {
            if (data.message) {
                G.showToast(data.message, true);
                if (G.onlineMatchId && data.match_id === G.onlineMatchId) {
                    G.handleOpponentLeft();
                }
            }
        });
    };

    G.handleRoomChatMessage = function(data) {
        G.roomChatMessages.push(data);

        var container = $('roomChatMessages');
        if (!container) return;

        var time = new Date(data.timestamp * 1000).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        var isCurrentUser = G.currentUser && data.username === G.currentUser.username;

        var msgHtml = '<div class="flex flex-col ' + (isCurrentUser ? 'items-end' : 'items-start') + ' mb-2">' +
            '<div class="text-xs text-gray-500 mb-1">' + data.username + ' ' + time + '</div>' +
            '<div class="px-3 py-2 rounded-lg text-sm max-w-xs ' + (isCurrentUser ? 'bg-primary text-white' : 'bg-gray-100 text-gray-800') + '">' +
                G.escapeHtml(data.message) +
            '</div>' +
        '</div>';

        container.innerHTML += msgHtml;
        container.scrollTop = container.scrollHeight;
    };

    G.sendRoomChatMessage = function() {
        if (G.spectateMatchId) {
            G.showToast('观战模式下无法发送消息, true);
            return;
        }

        var input = $('roomChatInput');
        if (!input) return;

        var message = input.value.trim();
        if (!message) return;

        if (!G.onlineMatchId || !G.currentUser) {
            G.showToast('请先加入房间', true);
            return;
        }

        if (G.WebSocketManager) {
            G.WebSocketManager.sendRoomChat(G.onlineMatchId, G.currentUser.username, message);
            input.value = '';
        }
    };

    G.loadRoomChatHistory = async function() {
        if (!G.onlineMatchId) return;

        try {
            var res = await G.apiCall('/api/match/chat/' + G.onlineMatchId, 'GET');
            if (res.success && res.messages) {
                G.roomChatMessages = res.messages;
                var container = $('roomChatMessages');
                if (!container) return;

                container.innerHTML = '';
                res.messages.forEach(function(msg) {
                    G.handleRoomChatMessage(msg);
                });
            }
        } catch (err) {
            console.error('加载聊天历史失败:', err);
        }
    };

    G.clearRoomChatUI = function() {
        G.roomChatMessages = [];
        var container = $('roomChatMessages');
        if (container) {
            container.innerHTML = '';
        }
        var input = $('roomChatInput');
        if (input) {
            input.value = '';
        }
    };

    G.handleOpponentLeft = function() {
        G.onlineGameActive = false;
        G.stopOnlineTimer();
        G.stopTimedCountdown();

        var statusLabel = $('onlineStatusLabel');
        if (statusLabel) {
            statusLabel.textContent = '对手已离开，你获得胜利;
        }
        var statusLight = $('onlineStatusLight');
        if (statusLight) {
            statusLight.className = 'inline-block w-3 h-3 bg-green-500 rounded-full mr-2';
        }

        G.showRestartRequestUI();
    };

    G.escapeHtml = function(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    G.toggleRoomChat = function() {
        var panel = $('roomChatPanel');
        if (!panel) return;

        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    };
})();


// ============================================================
// WebSocket 通信管理器 (Socket.IO)
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    G.WebSocketManager = {
        // 连接状态
        connected: false,
        connecting: false,
        usingWebSocket: false,

        // Socket.IO 连接
        socket: null,

        // 重连配置
        reconnectAttempts: 0,
        maxReconnectAttempts: 20,
        reconnectDelay: 3000,

        // 当前加入的房间ID
        currentRoomId: null,

        // 事件回调
        eventHandlers: {},

        // 初始化
        init: function() {
            this.tryConnect();
        },

        // 尝试WebSocket连接
        tryConnect: function() {
            if (this.connecting) return;
            this.connecting = true;

            if (typeof io === 'undefined') {
                console.log('Socket.IO未加载');
                this.connecting = false;
                return;
            }

            var self = this;
            var serverUrl = window.location.origin;

            try {
                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionDelay: this.reconnectDelay,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    timeout: 10000
                });

                this.socket.on('connect', function() {
                    console.log('WebSocket连接成功');
                    self.connected = true;
                    self.usingWebSocket = true;
                    self.reconnectAttempts = 0;
                    self.emit('connected', {});

                    if (self.currentRoomId) {
                        console.log('重连后自动加入房间:', self.currentRoomId);
                        self.joinRoom(self.currentRoomId);
                    }

                    if (G && G.currentUser && G.currentUser.username) {
                        self.registerUser(G.currentUser.username);
                    }
                });

                this.socket.on('disconnect', function() {
                    console.log('WebSocket连接断开');
                    self.connected = false;
                    self.usingWebSocket = false;
                    self.emit('disconnected', {});
                });

                this.socket.on('connect_error', function(error) {
                    console.log('WebSocket连接错误:', error.message);
                    self.connecting = false;
                });

                // 注册服务端事件监听
                this.socket.on('connected', function(data) {
                    self.emit('server_connected', data);
                });

                this.socket.on('match_updated', function(data) {
                    self.emit('match_updated', data);
                });

                this.socket.on('move_made', function(data) {
                    self.emit('move_made', data);
                });

                this.socket.on('undo_requested', function(data) {
                    self.emit('undo_requested', data);
                });

                this.socket.on('draw_requested', function(data) {
                    self.emit('draw_requested', data);
                });

                this.socket.on('game_over', function(data) {
                    self.emit('game_over', data);
                });

                this.socket.on('match_started', function(data) {
                    self.emit('match_started', data);
                });

                this.socket.on('ws_response', function(data) {
                    self.emit('ws_success', data);
                });

                this.socket.on('ws_error', function(data) {
                    self.emit('ws_error', data);
                });

                this.socket.on('heartbeat_ack', function(data) {
                    self.emit('heartbeat_ack', data);
                });

                this.socket.on('joined', function(data) {
                    self.emit('joined', data);
                });

                this.socket.on('left', function(data) {
                    self.emit('left', data);
                });

                this.socket.on('opponent_disconnected', function(data) {
                    self.emit('opponent_disconnected', data);
                });

                this.socket.on('room_chat_message', function(data) {
                    self.emit('room_chat_message', data);
                });

                this.socket.on('user_status_update', function(data) {
                    self.emit('user_status_update', data);
                });

                this.socket.on('unread_count_update', function(data) {
                    self.emit('unread_count_update', data);
                });

                this.socket.on('message_read_update', function(data) {
                    self.emit('message_read_update', data);
                });

                this.socket.on('banned_notification', function(data) {
                    self.emit('banned_notification', data);
                });

                this.connecting = false;

            } catch (error) {
                console.log('WebSocket初始化失败:', error);
                this.connecting = false;
            }
        },

        // 加入房间
        joinRoom: function(matchId, username) {
            this.currentRoomId = matchId;
            if (this.socket && this.connected) {
                this.socket.emit('join', {match_id: matchId, username: username});
            }
        },

        // 离开房间
        leaveRoom: function(matchId, username) {
            if (this.currentRoomId === matchId) {
                this.currentRoomId = null;
            }
            if (this.socket && this.connected) {
                this.socket.emit('leave', {match_id: matchId, username: username});
            }
        },

        // 发送落子
        sendMove: function(data) {
            if (this.socket && this.connected) {
                this.socket.emit('ws_game_move', data);
            }
        },

        // 发送悔棋请求
        sendUndoRequest: function(data) {
            if (this.socket && this.connected) {
                this.socket.emit('ws_undo_request', data);
            }
        },

        // 发送和棋请求
        sendDrawRequest: function(data) {
            if (this.socket && this.connected) {
                this.socket.emit('ws_draw_request', data);
            }
        },

        // 发送心跳
        sendHeartbeat: function() {
            if (this.socket && this.connected) {
                this.socket.emit('ws_heartbeat', {timestamp: Date.now()});
            }
        },

        // 发送房间聊天消息
        sendRoomChat: function(matchId, username, message) {
            if (this.socket && this.connected) {
                this.socket.emit('room_chat', {
                    match_id: matchId,
                    username: username,
                    message: message
                });
            }
        },

        // 注册用户到WebSocket
        registerUser: function(username) {
            if (this.socket && this.connected) {
                this.socket.emit('register_user', {username: username});
                console.log('WebSocket用户注册:', username);
            }
        },

        // 注册事件处理器
        on: function(event, handler) {
            if (!this.eventHandlers[event]) {
                this.eventHandlers[event] = [];
            }
            this.eventHandlers[event].push(handler);
        },

        // 移除事件处理器
        off: function(event, handler) {
            if (!this.eventHandlers[event]) return;
            var index = this.eventHandlers[event].indexOf(handler);
            if (index > -1) {
                this.eventHandlers[event].splice(index, 1);
            }
        },

        // 触发事件
        emit: function(event, data) {
            if (!this.eventHandlers[event]) return;
            this.eventHandlers[event].forEach(function(handler) {
                try {
                    handler(data);
                } catch (err) {
                    console.error('事件处理器执行错误:', err);
                }
            });
        },

        // 获取连接状态
        getStatus: function() {
            return {
                connected: this.connected,
                usingWebSocket: this.usingWebSocket
            };
        },

        // 断开连接
        disconnect: function() {
            if (this.socket) {
                this.socket.disconnect();
            }
            this.connected = false;
            this.usingWebSocket = false;
        }
    };

})();
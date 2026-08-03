// ============================================================
// WebSocket 通信管理器
// 功能：统一通信层，优先使用WebSocket，失败时自动切换轮询
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
        usingPolling: false,

        // Socket.IO 连接
        socket: null,

        // 轮询配置
        pollingTimer: null,
        pollingInterval: 2000,
        basePollingInterval: 2000,
        maxPollingInterval: 10000,

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

            // 检查是否已加载socket.io.js
            if (typeof io === 'undefined') {
                console.log('Socket.IO未加载，切换到轮询模式');
                this.startPolling();
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
                    self.usingPolling = false;
                    self.stopPolling();
                    self.reconnectAttempts = 0;
                    self.emit('connected', {});

                    // 重连后自动重新加入之前的房间
                    if (self.currentRoomId) {
                        console.log('重连后自动加入房间:', self.currentRoomId);
                        self.joinRoom(self.currentRoomId);
                    }
                });

                this.socket.on('disconnect', function() {
                    console.log('WebSocket连接断开');
                    self.connected = false;
                    self.usingWebSocket = false;
                    self.emit('disconnected', {});

                    // 自动重连或切换到轮询
                    if (self.reconnectAttempts < self.maxReconnectAttempts) {
                        self.reconnectAttempts++;
                        console.log(`尝试WebSocket重连 (${self.reconnectAttempts}/${self.maxReconnectAttempts})`);
                    } else {
                        console.log('WebSocket重连失败，切换到轮询模式');
                        self.startPolling();
                    }
                });

                this.socket.on('connect_error', function(error) {
                    console.log('WebSocket连接错误:', error.message);
                    self.connecting = false;

                    if (self.reconnectAttempts >= self.maxReconnectAttempts) {
                        console.log('WebSocket连接失败，切换到轮询模式');
                        self.startPolling();
                    }
                });

                // 注册通用事件
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

                this.connecting = false;

            } catch (error) {
                console.log('WebSocket初始化失败:', error);
                this.connecting = false;
                this.startPolling();
            }
        },

        // 开始轮询模式
        startPolling: function() {
            if (this.usingPolling) return;

            this.usingPolling = true;
            this.usingWebSocket = false;
            this.connected = true;
            this.connecting = false;

            console.log('启动轮询模式');
            this.scheduleNextPoll();
            this.emit('polling_started', {});
        },

        // 停止轮询
        stopPolling: function() {
            if (this.pollingTimer) {
                clearTimeout(this.pollingTimer);
                this.pollingTimer = null;
            }
            this.usingPolling = false;
        },

        // 计划下次轮询
        scheduleNextPoll: function() {
            var self = this;
            this.pollingTimer = setTimeout(function() {
                self.poll();
            }, this.pollingInterval);
        },

        // 执行轮询
        poll: function() {
            var self = this;
            var events = ['match_updated', 'move_made', 'undo_requested', 'draw_requested', 'heartbeat_ack'];

            events.forEach(function(event) {
                if (self.eventHandlers[event] && self.eventHandlers[event].length > 0) {
                    G.apiCall('/api/poll/events', 'POST', {events: events})
                        .then(function(data) {
                            if (data && data.events) {
                                data.events.forEach(function(evt) {
                                    self.emit(evt.type, evt.data);
                                });
                            }
                            // 成功，重置间隔
                            self.pollingInterval = self.basePollingInterval;
                        })
                        .catch(function(err) {
                            console.log('轮询请求失败:', err);
                            // 失败，增加间隔
                            self.pollingInterval = Math.min(self.pollingInterval * 1.5, self.maxPollingInterval);
                        });
                }
            });

            this.scheduleNextPoll();
        },

        // 加入房间
        joinRoom: function(matchId, username) {
            this.currentRoomId = matchId;
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('join', {match_id: matchId, username: username});
            } else {
                console.log('轮询模式：标记加入房间', matchId);
            }
        },

        // 离开房间
        leaveRoom: function(matchId, username) {
            if (this.currentRoomId === matchId) {
                this.currentRoomId = null;
            }
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('leave', {match_id: matchId, username: username});
            } else {
                console.log('轮询模式：标记离开房间', matchId);
            }
        },

        // 发送游戏更新
        sendMatchUpdate: function(data) {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('match_update', data);
            } else {
                console.log('轮询模式：游戏更新通过API发送');
                G.apiCall('/api/match/update', 'POST', data).catch(function(err) {
                    console.error('发送游戏更新失败:', err);
                });
            }
        },

        // 发送落子
        sendMove: function(data) {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('game_move', data);
            } else {
                console.log('轮询模式：落子通过API发送');
                G.apiCall('/api/match/move', 'POST', data).catch(function(err) {
                    console.error('发送落子失败:', err);
                });
            }
        },

        // 发送悔棋请求
        sendUndoRequest: function(data) {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('request_undo', data);
            } else {
                console.log('轮询模式：悔棋请求通过API发送');
                G.apiCall('/api/match/undo', 'POST', data).catch(function(err) {
                    console.error('发送悔棋请求失败:', err);
                });
            }
        },

        // 发送和棋请求
        sendDrawRequest: function(data) {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('request_draw', data);
            } else {
                console.log('轮询模式：和棋请求通过API发送');
                G.apiCall('/api/match/draw', 'POST', data).catch(function(err) {
                    console.error('发送和棋请求失败:', err);
                });
            }
        },

        // 发送心跳
        sendHeartbeat: function() {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('heartbeat', {timestamp: Date.now()});
            } else {
                G.apiCall('/api/match/heartbeat', 'POST', {}).catch(function(err) {
                    console.error('心跳发送失败:', err);
                });
            }
        },

        // 发送房间聊天消息
        sendRoomChat: function(matchId, username, message) {
            if (this.usingWebSocket && this.socket) {
                this.socket.emit('room_chat', {
                    match_id: matchId,
                    username: username,
                    message: message
                });
            } else {
                console.log('轮询模式：房间聊天消息暂不支持');
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
                usingWebSocket: this.usingWebSocket,
                usingPolling: this.usingPolling
            };
        },

        // 断开连接
        disconnect: function() {
            if (this.socket) {
                this.socket.disconnect();
            }
            this.stopPolling();
            this.connected = false;
            this.usingWebSocket = false;
            this.usingPolling = false;
        }
    };

})();
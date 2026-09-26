// ============================================================
// WebSocket 通信管理 (Socket.IO)
//
// 通道策略（优先使用 WebSocket，逐级降级）：
//   1. WebSocket 直连（transports: ['websocket']）——首选
//   2. Socket.IO HTTP 长轮询（transports: ['polling','websocket']，
//      可正常使用后再自动 upgrade 回 WebSocket）——WS 连不上时降级
//   3. 业务层 HTTP 短轮询——Socket.IO 整体断开期间由各业务模块自行兜底
//
// 对外状态：
//   connected / usingWebSocket —— Socket.IO 是否已连接（无论底层传输）
//   transport                  —— 实际引擎传输名 ('websocket' | 'polling')
//   transportMode              —— 当前连接策略 ('websocket' | 'fallback')
//
// 对外事件（on/emit 观察者机制）：
//   connected / disconnected / reconnecting / transport_change
//   以及所有服务端推送事件（match_updated、room_chat_message 等）
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    G.WebSocketManager = {
        // ==================== 连接状态 ====================

        /** Socket.IO 是否已连接（WebSocket 或长轮询均可） */
        connected: false,
        /** 兼容旧代码：等价于 connected */
        usingWebSocket: false,
        /** 是否正在建立连接 */
        connecting: false,
        /** 是否已执行过 init（保证幂等） */
        initialized: false,

        /** 当前连接策略：'websocket'（仅WS） | 'fallback'（长轮询优先，可升级回WS） */
        transportMode: 'websocket',
        /** 连接成功后实际使用的引擎传输名 */
        transport: null,

        // Socket.IO 连接实例
        socket: null,

        // 重连后需要恢复的上下文
        currentRoomId: null,
        currentUsername: null,
        currentToken: null,

        // 事件回调
        eventHandlers: {},

        // ==================== 降级/恢复参数 ====================

        /** WS 模式下连接失败后多久降级到长轮询（毫秒） */
        DOWNGRADE_DELAY: 6000,
        /** 降级到长轮询后，多久尝试重新直连 WebSocket（毫秒） */
        PROMOTE_INTERVAL: 30000,

        _downgradeTimer: null,
        _promoteTimer: null,

        // ==================== 初始化 ====================

        init: function() {
            if (this.initialized) {
                // 已初始化但连接被主动关闭过，则重新建立连接
                if (!this.socket) {
                    this.transportMode = 'websocket';
                    this._createSocket();
                }
                return;
            }
            this.initialized = true;

            if (typeof io === 'undefined') {
                console.warn('[WS] Socket.IO 客户端未加载，业务将使用 HTTP 轮询');
                this.emit('unavailable', {});
                return;
            }

            this._createSocket();
        },

        /**
         * 创建 Socket.IO 连接
         * @param {string} [mode] 'websocket' | 'fallback'，默认取当前 transportMode
         */
        _createSocket: function(mode) {
            var self = this;
            if (mode) {
                this.transportMode = mode;
            }

            clearTimeout(this._downgradeTimer);
            this.connecting = true;
            this.connected = false;
            this.usingWebSocket = false;
            this.transport = null;

            var transports = this.transportMode === 'fallback'
                ? ['polling', 'websocket']
                : ['websocket'];

            try {
                this.socket = io(window.location.origin, {
                    transports: transports,
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 8000,
                    forceNew: true
                });
            } catch (error) {
                console.warn('[WS] 初始化失败，业务将使用 HTTP 轮询', error);
                this.connecting = false;
                this.emit('unavailable', {error: error});
                return;
            }

            this._bindLifecycle();
            this._bindServerEvents();
        },

        /** 销毁当前 socket（停止其自动重连），再按新模式建立连接 */
        _recreateSocket: function(mode) {
            var oldSocket = this.socket;
            if (oldSocket) {
                try {
                    oldSocket.io && oldSocket.io.reconnection(false);
                    oldSocket.removeAllListeners();
                    oldSocket.disconnect();
                    if (oldSocket.io && oldSocket.io.destroy) {
                        oldSocket.io.destroy();
                    }
                } catch (e) {
                    console.warn('[WS] 关闭旧连接失败', e);
                }
            }
            this.socket = null;
            this._createSocket(mode);
        },

        // ==================== 生命周期事件 ====================

        _bindLifecycle: function() {
            var self = this;
            var socket = this.socket;
            var everConnected = false;

            socket.on('connect', function() {
                everConnected = true;
                clearTimeout(self._downgradeTimer);
                clearTimeout(self._promoteTimer);

                self.connecting = false;
                self.connected = true;
                self.usingWebSocket = true;

                var engine = socket.io && socket.io.engine;
                if (engine) {
                    self.transport = engine.transport ? engine.transport.name : null;
                    // Socket.IO 长轮询升级到 WebSocket 时同步状态（绑定 this）
                    if (!self._boundEngineUpgrade) {
                        self._boundEngineUpgrade = function(transport) {
                            self._onEngineUpgrade(transport);
                        };
                    }
                    engine.off('upgrade', self._boundEngineUpgrade);
                    engine.on('upgrade', self._boundEngineUpgrade);
                }

                var modeDesc = self.transportMode === 'fallback' ? '长轮询(可升级)' : 'WebSocket';
                console.log('[WS] 已连接，模式: ' + modeDesc + '，传输: ' + self.transport);

                // 重连后恢复用户注册与房间订阅
                self._restoreSession();

                self.emit('connected', {
                    transport: self.transport,
                    transportMode: self.transportMode
                });
                self.emit('connection_change', {connected: true, transport: self.transport});

                // 降级模式下若仍跑在长轮询上，定期尝试重新直连 WebSocket
                if (self.transportMode === 'fallback' && self.transport !== 'websocket') {
                    self._schedulePromote();
                }
            });

            socket.on('disconnect', function(reason) {
                console.warn('[WS] 连接断开:', reason);
                self.connected = false;
                self.usingWebSocket = false;
                self.transport = null;
                clearTimeout(self._promoteTimer);

                self.emit('disconnected', {reason: reason});
                self.emit('connection_change', {connected: false, reason: reason});

                // WS 直连模式下断开，短时间内连不回来则降级到长轮询
                if (self.transportMode === 'websocket') {
                    self._scheduleDowngrade();
                }
            });

            socket.on('connect_error', function(error) {
                self.connecting = false;
                console.warn('[WS] 连接错误 (' + self.transportMode + '):',
                    error && error.message ? error.message : error);

                if (self.transportMode === 'websocket') {
                    // 一直没连上或重连失败：到达时限后降级
                    if (!everConnected || !self.connected) {
                        self._scheduleDowngrade();
                    }
                }
            });

            // Manager 级别的重连事件
            if (socket.io) {
                socket.io.on('reconnect_attempt', function(attempt) {
                    self.emit('reconnecting', {
                        attempt: attempt,
                        transportMode: self.transportMode
                    });
                    if (self.transportMode === 'websocket' && attempt >= 3) {
                        // 连续 3 次重连失败，提前降级（约 5~8 秒）
                        self._downgradeToPolling();
                    }
                });
            }
        },

        _onEngineUpgrade: function(transport) {
            var newTransport = transport && transport.name ? transport.name : 'websocket';
            if (this.transport === newTransport) return;
            this.transport = newTransport;
            console.log('[WS] 传输已升级为: ' + newTransport);
            clearTimeout(this._promoteTimer);
            this.emit('transport_change', {transport: newTransport});
        },

        /** WS 连不上/频繁重连失败 → 降级到 Socket.IO 长轮询 */
        _scheduleDowngrade: function() {
            var self = this;
            clearTimeout(this._downgradeTimer);
            this._downgradeTimer = setTimeout(function() {
                self._downgradeToPolling();
            }, this.DOWNGRADE_DELAY);
        },

        _downgradeToPolling: function() {
            clearTimeout(this._downgradeTimer);
            if (this.transportMode === 'fallback') return;
            if (this.connected && this.transport === 'websocket') return;

            console.warn('[WS] WebSocket 不可用，降级为 HTTP 长轮询');
            this.emit('transport_downgraded', {});
            this._recreateSocket('fallback');
        },

        /** 长轮询稳定一段时间后，尝试重新直连 WebSocket；失败则回到长轮询 */
        _schedulePromote: function() {
            var self = this;
            clearTimeout(this._promoteTimer);
            this._promoteTimer = setTimeout(function() {
                if (self.transportMode !== 'fallback') return;
                if (self.transport === 'websocket') return;
                console.log('[WS] 尝试恢复 WebSocket 直连');
                self.emit('transport_promoting', {});

                var reverted = false;
                var revertTimer = setTimeout(function() {
                    if (reverted || self.connected) return;
                    reverted = true;
                    console.warn('[WS] WebSocket 恢复失败，回退到长轮询');
                    self._recreateSocket('fallback');
                }, self.DOWNGRADE_DELAY);

                self._recreateSocket('websocket');

                var unregister = function() {};
                var onConnected = function() {
                    clearTimeout(revertTimer);
                    unregister();
                };
                unregister = function() {
                    self.off('connected', onConnected);
                };
                self.on('connected', onConnected);
            }, this.PROMOTE_INTERVAL);
        },

        /** 连接成功后恢复注册与房间订阅 */
        _restoreSession: function() {
            if (!this.socket) return;
            if (this.currentUsername) {
                this.socket.emit('register_user', {username: this.currentUsername, token: this.currentToken || ''});
            }
            if (this.currentRoomId) {
                this.socket.emit('join', {
                    match_id: this.currentRoomId,
                    username: this.currentUsername || undefined
                });
            }
        },

        // ==================== 服务端事件转发 ====================

        _bindServerEvents: function() {
            var self = this;
            var socket = this.socket;

            // 服务端若主动推送 connected 事件，与客户端连接事件区分
            socket.on('connected', function(data) {
                self.emit('server_connected', data);
            });

            var forwardedEvents = [
                'match_updated', 'move_made', 'undo_requested', 'draw_requested',
                'game_over', 'match_started', 'ws_response', 'ws_error',
                'heartbeat_ack', 'joined', 'left', 'room_chat_message',
                'user_status_update', 'unread_count_update', 'message_read_update',
                'banned_notification', 'opponent_disconnected',
                'match_list_changed', 'match_activity',
                'spectate_joined', 'spectate_join_failed'
            ];

            forwardedEvents.forEach(function(eventName) {
                socket.on(eventName, function(data) {
                    self.emit(eventName, data);
                });
            });
        },

        // ==================== 业务动作 ====================

        /** 注册用户（断线重连后会自动重新注册） */
        registerUser: function(username, token) {
            if (!username) return;
            this.currentUsername = username;
            if (token) this.currentToken = token;
            if (this.socket && this.connected) {
                this.socket.emit('register_user', {username: username, token: token || this.currentToken || ''});
            }
        },

        /** 加入房间（未连接时仅记录，连接/重连后自动加入） */
        joinRoom: function(matchId, username) {
            if (!matchId) return;
            this.currentRoomId = matchId;
            if (username) {
                this.currentUsername = username;
            }
            if (this.socket && this.connected) {
                this.socket.emit('join', {
                    match_id: matchId,
                    username: username || this.currentUsername || undefined
                });
            }
        },

        /** 离开房间 */
        leaveRoom: function(matchId, username) {
            if (this.currentRoomId === matchId) {
                this.currentRoomId = null;
            }
            if (this.socket && this.connected) {
                this.socket.emit('leave', {
                    match_id: matchId,
                    username: username || this.currentUsername || undefined
                });
            }
        },

        /** 通用发送：已连接返回 true，否则返回 false 由调用方走 HTTP */
        send: function(eventName, data) {
            if (this.socket && this.connected) {
                this.socket.emit(eventName, data);
                return true;
            }
            return false;
        },

        sendMove: function(data) {
            return this.send('ws_game_move', data);
        },

        sendUndoRequest: function(data) {
            return this.send('ws_undo_request', data);
        },

        sendDrawRequest: function(data) {
            return this.send('ws_draw_request', data);
        },

        sendHeartbeat: function(data) {
            return this.send('ws_heartbeat', data || {timestamp: Date.now()});
        },

        sendRoomChat: function(matchId, username, message) {
            return this.send('room_chat', {
                match_id: matchId,
                username: username,
                message: message
            });
        },

        // ==================== 观察者机制 ====================

        on: function(event, handler) {
            if (!this.eventHandlers[event]) {
                this.eventHandlers[event] = [];
            }
            this.eventHandlers[event].push(handler);
        },

        off: function(event, handler) {
            if (!this.eventHandlers[event]) return;
            var index = this.eventHandlers[event].indexOf(handler);
            if (index > -1) {
                this.eventHandlers[event].splice(index, 1);
            }
        },

        emit: function(event, data) {
            var handlers = this.eventHandlers[event];
            if (!handlers) return;
            // 拷贝一份，避免回调中 off/on 影响遍历
            handlers.slice().forEach(function(handler) {
                try {
                    handler(data);
                } catch (err) {
                    console.error('[WS] 事件处理器执行异常 (' + event + ')', err);
                }
            });
        },

        // ==================== 状态查询/关闭 ====================

        isConnected: function() {
            return !!(this.socket && this.connected);
        },

        getStatus: function() {
            return {
                connected: this.connected,
                usingWebSocket: this.usingWebSocket,
                transport: this.transport,
                transportMode: this.transportMode
            };
        },

        /** 主动断开（如登出），并清除重连上下文 */
        disconnect: function() {
            clearTimeout(this._downgradeTimer);
            clearTimeout(this._promoteTimer);
            if (this.socket) {
                try {
                    this.socket.io && this.socket.io.reconnection(false);
                    this.socket.removeAllListeners();
                    this.socket.disconnect();
                    if (this.socket.io && this.socket.io.destroy) {
                        this.socket.io.destroy();
                    }
                } catch (e) {
                    console.warn('[WS] 断开连接失败', e);
                }
            }
            this.socket = null;
            this.connected = false;
            this.usingWebSocket = false;
            this.transport = null;
            this.currentRoomId = null;
        }
    };

})();

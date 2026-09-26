// ============================================================
// 观战页面模块
// 独立的观战页面，通过 /spectate?room=XXX&token=XXX 访问
// 无需登录即可观看对局
//
// 实时策略：WebSocket（spectate_join 加入房间接收 match_updated）
//           优先；Socket.IO 断开或加入失败时自动使用 2s HTTP 轮询
// ============================================================

(function() {
    "use strict";

    var BOARD_SIZE = 15;
    var CELL_SIZE = 0;
    var PADDING = 0;
    var canvas, ctx;
    var board = [];
    var moves = [];
    var currentPlayer = 1;
    var creatorColor = 1;
    var creator = '';
    var opponent = '';
    var gameActive = false;
    var pollingTimer = null;
    var lastRestartVersion = 0;
    var roomId = '';
    var token = '';
    /** WS 观战房间是否已加入成功（每次连接/重连后需重新加入） */
    var spectateJoined = false;

    var $ = function(id) { return document.getElementById(id); };

    // 解析URL参数
    function getUrlParams() {
        var params = {};
        var search = window.location.search.substring(1);
        if (search) {
            var pairs = search.split('&');
            for (var i = 0; i < pairs.length; i++) {
                var kv = pairs[i].split('=');
                params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
            }
        }
        return params;
    }

    // 初始化空棋盘
    function initBoard() {
        board = [];
        for (var i = 0; i < BOARD_SIZE; i++) {
            board[i] = [];
            for (var j = 0; j < BOARD_SIZE; j++) {
                board[i][j] = 0;
            }
        }
    }

    // 计算画布尺寸
    function calcCanvasSize() {
        canvas = $('spectateCanvas');
        if (!canvas) return;
        var container = canvas.parentElement;
        var size = Math.min(container.clientWidth, container.clientHeight);
        if (size < 100) size = 400;
        canvas.width = size;
        canvas.height = size;
        CELL_SIZE = size / (BOARD_SIZE + 1);
        PADDING = CELL_SIZE;
        ctx = canvas.getContext('2d');
    }

    // 绘制棋盘
    function drawBoard() {
        if (!ctx) return;
        var w = canvas.width;
        var h = canvas.height;

        // 背景
        ctx.fillStyle = '#C4955A';
        ctx.fillRect(0, 0, w, h);

        // 网格线
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 1;
        for (var i = 0; i < BOARD_SIZE; i++) {
            var pos = PADDING + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(PADDING, pos);
            ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, pos);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pos, PADDING);
            ctx.lineTo(pos, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
            ctx.stroke();
        }

        // 星位点
        var starPoints = [3, 7, 11];
        for (var si = 0; si < starPoints.length; si++) {
            for (var sj = 0; sj < starPoints.length; sj++) {
                var sx = PADDING + starPoints[si] * CELL_SIZE;
                var sy = PADDING + starPoints[sj] * CELL_SIZE;
                ctx.fillStyle = '#8B6914';
                ctx.beginPath();
                ctx.arc(sx, sy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 棋子
        var radius = CELL_SIZE * 0.42;
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) continue;
                var cx = PADDING + c * CELL_SIZE;
                var cy = PADDING + r * CELL_SIZE;

                if (board[r][c] === 1) {
                    // 黑棋
                    var grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
                    grad.addColorStop(0, '#555');
                    grad.addColorStop(1, '#111');
                    ctx.fillStyle = grad;
                } else {
                    // 白棋
                    var grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
                    grad.addColorStop(0, '#fff');
                    grad.addColorStop(1, '#ccc');
                    ctx.fillStyle = grad;
                }

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#999';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }

        // 最后一手标记
        if (moves.length > 0) {
            var lastMove = moves[moves.length - 1];
            var lx = PADDING + lastMove.col * CELL_SIZE;
            var ly = PADDING + lastMove.row * CELL_SIZE;
            ctx.fillStyle = lastMove.player === 1 ? '#fff' : '#000';
            ctx.beginPath();
            ctx.arc(lx, ly, radius * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 更新UI信息
    function updateUI() {
        $('moveCount').textContent = moves.length;
        $('roomId').textContent = roomId || '-';

        var blackPlayer = creatorColor === 1 ? creator : opponent;
        var whitePlayer = creatorColor === 1 ? opponent : creator;

        // 侧边栏：观战对局
        var header = $('spectateHeader');
        if (header) {
            header.innerHTML =
                '<p><i class="fa-solid fa-door-open mr-1"></i>房间号: <span class="font-mono font-bold text-lg">' + (roomId || '-') + '</span></p>' +
                '<p><i class="fa-solid fa-list-numbered mr-1"></i>当前步数: <strong>' + moves.length + '</strong></p>' +
                '<p><i class="fa-solid fa-circle mr-1 text-gray-900"></i>黑棋: <span class="font-bold">' + (blackPlayer || '?') + '</span></p>' +
                '<p><i class="fa-solid fa-circle mr-1 text-gray-300"></i>白棋: <span class="font-bold">' + (whitePlayer || '?') + '</span></p>';
        }

        // 侧边栏：对阵双方
        var playersEl = $('spectatePlayers');
        if (playersEl) {
            var currentText = currentPlayer === 1 ? '黑棋' : '白棋';
            var currentName = currentPlayer === 1 ? blackPlayer : whitePlayer;
            playersEl.innerHTML =
                '<div class="flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50">' +
                    '<span><i class="fa-solid fa-circle text-gray-900 mr-2"></i><span class="font-semibold">' + (blackPlayer || '?') + '</span></span>' +
                    (currentPlayer === 1 ? '<span class="text-xs text-green-600 font-medium"><i class="fa-solid fa-play mr-1"></i>行棋中</span>' : '<span class="text-xs text-gray-400">等待</span>') +
                '</div>' +
                '<div class="flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50">' +
                    '<span><i class="fa-solid fa-circle text-gray-300 mr-2"></i><span class="font-semibold">' + (whitePlayer || '?') + '</span></span>' +
                    (currentPlayer === 2 ? '<span class="text-xs text-green-600 font-medium"><i class="fa-solid fa-play mr-1"></i>行棋中</span>' : '<span class="text-xs text-gray-400">等待</span>') +
                '</div>' +
                '<p class="text-gray-500 text-xs pt-1 border-t"><i class="fa-solid fa-info-circle mr-1"></i>当前: <strong>' + currentText + '</strong> (' + (currentName || '?') + ')</p>';
        }

        // 状态栏：状态灯 + 文字
        var statusLight = $('spectateStatusLight');
        var statusEl = $('gameStatus');
        if (statusEl) {
            if (!gameActive) {
                statusEl.textContent = '对局已结束';
                if (statusLight) statusLight.className = 'inline-block w-3 h-3 bg-red-500 rounded-full shadow-sm';
            } else {
                statusEl.textContent = '观战中 · ' + (moves.length || 0) + ' 步';
                if (statusLight) statusLight.className = 'inline-block w-3 h-3 bg-green-500 rounded-full shadow-sm';
            }
        }
    }

    /**
     * 应用一次对局状态（首次 HTTP 加载、WS match_updated、轮询共用）
     */
    function applyState(data) {
        // 检测重开
        if (data.restartVersion && data.restartVersion > lastRestartVersion) {
            lastRestartVersion = data.restartVersion;
            board = data.board.map(function(r) { return r.slice(); });
            moves = data.moves.slice();
            currentPlayer = data.currentPlayer;
            creatorColor = data.creatorColor;
            creator = data.creator;
            opponent = data.opponent;
            gameActive = true;
            drawBoard();
            updateUI();
            return;
        }

        if (lastRestartVersion === 0) {
            lastRestartVersion = data.restartVersion || 0;
        }

        if (data.creatorColor !== undefined) creatorColor = data.creatorColor;
        if (data.creator !== undefined) creator = data.creator;
        if (data.opponent !== undefined) opponent = data.opponent;
        if (data.currentPlayer !== undefined) currentPlayer = data.currentPlayer;

        // 更新棋盘
        if (data.moves && data.moves.length !== moves.length) {
            board = data.board.map(function(r) { return r.slice(); });
            moves = data.moves.slice();
            gameActive = data.status === 'playing';
            drawBoard();
        } else {
            gameActive = data.status === 'playing';
        }

        // 检查结束
        if (data.winner !== undefined && data.winner !== null) {
            gameActive = false;
        }

        updateUI();
    }

    // 首次加载对局状态（HTTP，同时承担凭证校验）
    async function loadGameState() {
        if (!roomId || !token) return;
        try {
            var res = await fetch('/api/spectate/public?room=' + encodeURIComponent(roomId) + '&token=' + encodeURIComponent(token));
            if (!res.ok) {
                var errData = await res.json().catch(function() { return {}; });
                showError(errData.error || '加载失败');
                return;
            }
            var data = await res.json();
            if (data.error) {
                showError(data.error);
                return;
            }

            applyState(data);
            initRealtime();
            syncPolling();
        } catch (e) {
            // 首次加载网络异常：仍初始化实时通道，并重试轮询
            initRealtime();
            syncPolling();
        }
    }

    // ==================== WebSocket 实时通道 ====================

    var realtimeInited = false;

    function initRealtime() {
        var manager = window.Gomoku && window.Gomoku.WebSocketManager;
        if (!manager || realtimeInited) return;
        realtimeInited = true;

        manager.init();

        // 每次连接（含断线重连）都要重新加入观战房间
        manager.on('connected', function() {
            spectateJoined = false;
            manager.send('spectate_join', {match_id: roomId, token: token});
            syncPolling();
        });

        manager.on('spectate_joined', function(data) {
            if (!data || data.match_id !== roomId) return;
            spectateJoined = true;
            console.log('[观战] 已通过实时通道加入房间');
            syncPolling();
        });

        manager.on('spectate_join_failed', function(data) {
            // 加入失败（如对局已结束）：回退到 HTTP 轮询，由接口返回决定停止
            spectateJoined = false;
            console.warn('[观战] 实时观战加入失败:', data && data.error);
            syncPolling();
        });

        manager.on('match_updated', function(data) {
            if (!data || data.match_id !== roomId) return;
            applyState(data);
        });

        manager.on('disconnected', function() {
            spectateJoined = false;
            syncPolling();
        });
    }

    // ==================== HTTP 轮询（降级兜底） ====================

    /** WS 已连接且已加入观战房间时无需轮询，否则保持 2s 轮询 */
    function syncPolling() {
        var manager = window.Gomoku && window.Gomoku.WebSocketManager;
        var realtimeReady = !!(manager && manager.isConnected() && spectateJoined);

        if (!realtimeReady) {
            if (!pollingTimer) {
                pollingTimer = setInterval(pollGameState, 2000);
            }
        } else if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
    }

    async function pollGameState() {
        if (!roomId || !token) return;
        try {
            var res = await fetch('/api/spectate/public?room=' + encodeURIComponent(roomId) + '&token=' + encodeURIComponent(token));
            if (!res.ok) {
                stopPolling();
                return;
            }
            var data = await res.json();
            if (data.error) {
                stopPolling();
                return;
            }
            applyState(data);
        } catch (e) {
            // 忽略轮询错误，等待下次重试
        }
    }

    function showError(msg) {
        stopPolling();
        var errorDiv = $('spectateError');
        var errorMsg = $('spectateErrorMsg');
        if (errorDiv) errorDiv.classList.remove('hidden');
        if (errorMsg) errorMsg.textContent = msg;
    }

    // 初始化
    function init() {
        var params = getUrlParams();
        roomId = params.room || '';
        token = params.token || '';

        if (!roomId || !token) {
            showError('缺少房间号或观战凭证');
            return;
        }

        initBoard();
        calcCanvasSize();
        loadGameState();

        window.addEventListener('resize', function() {
            calcCanvasSize();
            drawBoard();
        });
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

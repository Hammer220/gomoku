// ============================================================
// 观战页面模块
// 独立的观战页面，通过 /spectate?room=XXX&token=XXX 访问
// 无需登录即可观看对局
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
        $('roomId').textContent = roomId;

        var header = $('spectateHeader');
        if (header) {
            var blackPlayer = creatorColor === 1 ? creator : opponent;
            var whitePlayer = creatorColor === 1 ? opponent : creator;
            var currentText = currentPlayer === 1 ? '● 黑棋' : '○ 白棋';
            var currentName = currentPlayer === 1 ? blackPlayer : whitePlayer;
            header.innerHTML =
                '<p class="font-bold text-lg">' +
                '<span class="text-gray-800">' + (blackPlayer || '?') + '</span>' +
                ' <span class="text-gray-400">vs</span> ' +
                '<span class="text-gray-800">' + (whitePlayer || '?') + '</span>' +
                '</p>' +
                '<p class="text-gray-500">当前: ' + currentText + ' (' + (currentName || '?') + ')</p>';
        }

        var statusEl = $('gameStatus');
        if (statusEl) {
            if (!gameActive) {
                statusEl.textContent = '已结束';
                statusEl.className = 'text-red-500 font-bold';
            } else {
                statusEl.textContent = '观战中...';
                statusEl.className = 'text-green-500';
            }
        }
    }

    // 加载对局状态
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

            board = data.board.map(function(r) { return r.slice(); });
            moves = data.moves.slice();
            currentPlayer = data.currentPlayer;
            creatorColor = data.creatorColor;
            creator = data.creator;
            opponent = data.opponent;
            gameActive = data.status === 'playing' || data.status === 'waiting_for_reconnect';
            lastRestartVersion = data.restartVersion || 0;

            drawBoard();
            updateUI();
            startPolling();
        } catch (e) {
            showError('网络错误，请刷新重试');
        }
    }

    // 轮询更新
    function startPolling() {
        if (pollingTimer) return;
        pollingTimer = setInterval(pollGameState, 2000);
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
            if (!res.ok) return;
            var data = await res.json();
            if (data.error) return;

            // 检测重开
            if (data.restartVersion && data.restartVersion > lastRestartVersion) {
                lastRestartVersion = data.restartVersion;
                board = data.board.map(function(r) { return r.slice(); });
                moves = data.moves.slice();
                gameActive = true;
                drawBoard();
                updateUI();
                return;
            }

            // 更新棋盘
            if (data.moves && data.moves.length !== moves.length) {
                board = data.board.map(function(r) { return r.slice(); });
                moves = data.moves.slice();
                currentPlayer = data.currentPlayer;
                gameActive = data.status === 'playing' || data.status === 'waiting_for_reconnect';
                drawBoard();
                updateUI();
            }

            // 检查结束
            if (data.winner !== undefined && data.winner !== null) {
                gameActive = false;
                updateUI();
            }
        } catch (e) {
            // 忽略轮询错误
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
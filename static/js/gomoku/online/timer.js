// ============================================================
// 联机对战模块 - 计时器
// 负责：联机计时、倒计时、UI更新
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) {
        return document.getElementById(id);
    };

    G.startOnlineTimer = function() {
        if (G.onlineTimer) return;
        G.onlineTimer = setInterval(function() {
            if (G.onlineGameActive && G.onlineTimeMode && G.onlineTimeMode !== 'untimed') {
                G.updateOnlineTimers();
            }
        }, 1000);
    };

    G.stopOnlineTimer = function() {
        if (G.onlineTimer) {
            clearInterval(G.onlineTimer);
            G.onlineTimer = null;
        }
    };

    G.startTimedCountdown = function() {
        if (G.timedCountdownTimer) return;
        if (!G.onlineTimeMode || G.onlineTimeMode === 'untimed') return;
        G.timedCountdownTimer = setInterval(G.updateTimedCountdown, 1000);
    };

    G.stopTimedCountdown = function() {
        if (G.timedCountdownTimer) {
            clearInterval(G.timedCountdownTimer);
            G.timedCountdownTimer = null;
        }
    };

    G.updateTimedCountdown = function() {
        if (!G.onlineTimeMode || G.onlineTimeMode === 'untimed' || !G.onlineGameActive) return;
        var now = Date.now() / 1000;
        var elapsed = now - (G.onlineLastMoveTime || now);
        G.onlineBlackTime = Math.max(0, (G.onlineBlackTime || 0) - elapsed);
        G.onlineWhiteTime = Math.max(0, (G.onlineWhiteTime || 0) - elapsed);
        G.onlineLastMoveTime = now;
    };

    G.updateOnlineTimers = function() {
        if (!G.onlineTimeMode || G.onlineTimeMode === 'untimed') return;
        var blackDisplay = $('onlineBlackTime');
        var whiteDisplay = $('onlineWhiteTime');
        var blackSection = $('onlineBlackSection');
        var whiteSection = $('onlineWhiteSection');

        var blackTime = Math.max(0, G.onlineBlackTime || 0);
        var whiteTime = Math.max(0, G.onlineWhiteTime || 0);

        if (blackDisplay) {
            blackDisplay.textContent = G.formatTime(blackTime);
            if (blackTime <= 10 && G.onlineCurrentPlayer === 1) {
                blackDisplay.classList.add('text-red-600', 'animate-pulse');
            } else {
                blackDisplay.classList.remove('text-red-600', 'animate-pulse');
            }
        }
        if (whiteDisplay) {
            whiteDisplay.textContent = G.formatTime(whiteTime);
            if (whiteTime <= 10 && G.onlineCurrentPlayer === 2) {
                whiteDisplay.classList.add('text-red-600', 'animate-pulse');
            } else {
                whiteDisplay.classList.remove('text-red-600', 'animate-pulse');
            }
        }

        if (blackSection && whiteSection) {
            blackSection.classList.remove('ring-2', 'ring-blue-400');
            whiteSection.classList.remove('ring-2', 'ring-blue-400');
            if (G.onlineCurrentPlayer === 1) {
                blackSection.classList.add('ring-2', 'ring-blue-400');
            } else {
                whiteSection.classList.add('ring-2', 'ring-blue-400');
            }
        }
    };

    G.formatTime = function(seconds) {
        var s = Math.max(0, Math.floor(seconds));
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    };

    G.getTimeModeConfig = function() {
        var timeMode = document.querySelector('input[name="onlineTimeMode"]:checked');
        var mode = timeMode ? timeMode.value : 'untimed';
        var config = { timeMode: mode, moveTime: 30, totalTime: 600 };
        if (mode === 'move' || mode === 'both') {
            var moveTimeInput = $('onlineMoveTime');
            config.moveTime = moveTimeInput ? parseInt(moveTimeInput.value) || 30 : 30;
        }
        if (mode === 'total' || mode === 'both') {
            var totalTimeInput = $('onlineTotalTime');
            config.totalTime = totalTimeInput ? parseInt(totalTimeInput.value) * 60 || 600 : 600;
        }
        return config;
    };

    G.updateOnlineUI = function() {
        var statusLabel = $('onlineStatusLabel');
        var statusLight = $('onlineStatusLight');
        if (!statusLabel) return;

        var undoDrawActions = $('undoDrawActions');

        if (!G.onlineMatchId || !G.onlineGameActive) {
            statusLabel.textContent = '未在对局中';
            if (statusLight) statusLight.className = 'inline-block w-3 h-3 bg-gray-400 rounded-full mr-2';
            if (undoDrawActions) undoDrawActions.classList.add('hidden');
            G.updateSpectatorCount(0, true);
            return;
        }

        if (undoDrawActions) undoDrawActions.classList.remove('hidden');

        if (G.onlineCurrentPlayer === G.onlineMyColor) {
            statusLabel.textContent = '你的回合';
            if (statusLight) statusLight.className = 'inline-block w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse';
        } else {
            statusLabel.textContent = '等待对手';
            if (statusLight) statusLight.className = 'inline-block w-3 h-3 bg-yellow-500 rounded-full mr-2';
        }
    };

    G.updateSpectatorCount = function(count, forceHide) {
        var spectatorEl = $('onlineSpectatorCount');
        var spectatorNum = $('onlineSpectatorNum');
        if (!spectatorEl || !spectatorNum) return;
        if (forceHide || count === undefined || count === null || count <= 0) {
            spectatorEl.classList.add('hidden');
        } else {
            spectatorEl.classList.remove('hidden');
            spectatorNum.textContent = count;
        }
    };

})();
// ============================================================
// 联机对战模块 - 主入�?
// 已拆分为 online/ 下的多个子模块：
//   online/room_list.js    - 房间列表、可用房�?
//   online/room_actions.js - 创建、加入、离开、关闭、重开
//   online/polling.js      - 轮询、心�?
//   online/timer.js        - 计时器、UI更新
//   online/interactions.js - 悔棋、和棋、观战、落�?
// ============================================================

var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 初始化联机模块的全局变量
    G.onlineMatchId = null;
    G.onlineMyColor = null;
    G.onlineOpponent = null;
    G.onlineBoard = null;
    G.onlineMoveHistory = [];
    G.onlineCurrentPlayer = null;
    G.onlineGameActive = false;
    G.onlineTimeMode = 'untimed';
    G.onlineMoveTime = 30;
    G.onlineTotalTime = 600;
    G.onlineBlackTime = 600;
    G.onlineWhiteTime = 600;
    G.onlineLastMoveTime = null;
    G.lastRestartVersion = 0;
    G.spectateMatchId = null;
    G.spectateRestartVersion = 0;

    G.initOnlineBoard = function() {
        G.onlineBoard = [];
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            G.onlineBoard[i] = [];
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                G.onlineBoard[i][j] = 0;
            }
        }
    };

})();


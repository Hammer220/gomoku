// ============================================================
// 棋盘规则检查模块
// 负责：胜负判定（五连）、平局判定、禁手规则（长连/三三/四四）、
//       棋型分析（活三/冲四）、是否检查禁手的判断
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 检查指定位置是否形成五连（胜利判定）
    G.checkWin = function(row, col, player) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1, cells = [{ row: row, col: col }];
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE || G.gameBoard[nr][nc] !== player) break;
                count++;
                cells.push({ row: nr, col: nc });
            }
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE || G.gameBoard[nr][nc] !== player) break;
                count++;
                cells.push({ row: nr, col: nc });
            }
            if (count >= 5) { G.winningCells = cells; return true; }
        }
        return false;
    };

    // 检查是否平局（棋盘已满）
    G.checkDraw = function() {
        return G.gameBoard.every(function(row) { return row.every(function(v) { return v !== 0; }); });
    };

    // 检查长连禁手（六子及以上连子，仅对黑棋生效）
    G.checkOverline = function(row, col, board) {
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var dx = directions[d][0], dy = directions[d][1];
            var count = 1;
            for (var i = 1; i < 6; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            for (var i = 1; i < 6; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            if (count >= 6) return true;
        }
        return false;
    };

    // 分析某个方向上的棋型（活三、冲四等）
    G.analyzeLine = function(row, col, dx, dy, board) {
        var result = { liveThree: false, four: false };
        var line = [];
        var centerIndex = 0;
        for (var i = -4; i <= 4; i++) {
            var nr = row + i * dy, nc = col + i * dx;
            if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) {
                line.push(-1);
            } else {
                line.push(board[nr][nc]);
            }
            if (i === 0) centerIndex = line.length - 1;
        }
        var count = 1;
        var leftEmpty = 0, rightEmpty = 0;
        var leftBlocked = false, rightBlocked = false;
        for (var i = centerIndex - 1; i >= 0; i--) {
            if (line[i] === 1) { count++; }
            else if (line[i] === 0) { leftEmpty++; break; }
            else { leftBlocked = true; break; }
        }
        for (var i = centerIndex + 1; i < line.length; i++) {
            if (line[i] === 1) { count++; }
            else if (line[i] === 0) { rightEmpty++; break; }
            else { rightBlocked = true; break; }
        }
        if (count === 4 && leftEmpty > 0 && rightEmpty > 0) result.four = true;
        else if (count === 4 && (leftEmpty > 0 || rightEmpty > 0)) result.four = true;
        else if (count === 3 && leftEmpty > 0 && rightEmpty > 0) result.liveThree = true;
        return result;
    };

    // 禁手规则综合检查（仅对黑棋/玩家1生效）
    G.checkForbidden = function(row, col, board) {
        if (board[row][col] !== 1) return { forbidden: false, reason: '' };
        if (G.checkOverline(row, col, board)) {
            return { forbidden: true, reason: '长连禁手（六子及以上）' };
        }
        var liveThrees = 0;
        var fours = 0;
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var lineInfo = G.analyzeLine(row, col, directions[d][0], directions[d][1], board);
            if (lineInfo.liveThree) liveThrees++;
            if (lineInfo.four) fours++;
        }
        if (liveThrees >= 2) return { forbidden: true, reason: '三三禁手（同时形成两个活三）' };
        if (fours >= 2) return { forbidden: true, reason: '四四禁手（同时形成两个四）' };
        return { forbidden: false, reason: '' };
    };

    // 判断当前模式是否需要检查禁手
    G.shouldCheckForbidden = function() {
        if (G.gameMode === 'ai') return G.aiForbidden;
        if (G.gameMode === 'online') return true;
        if (G.gameMode === 'pvp') return G.pvpForbidden;
        return false;
    };
})();
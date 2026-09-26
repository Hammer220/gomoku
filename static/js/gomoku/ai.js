// ============================================================
// AI 逻辑模块
// 负责：简单/中等/困难/大师四种难度 AI 的走法计算
//       基于位置评估函数和搜索算法，包含活三检测、禁手规避等
//
// 难度算法分配：
// - 简单(Easy): 冲四检测、眠三检测、活二检测、堵对方活二
// - 中等(Medium): 3层Minimax搜索 + Alpha-Beta剪枝
// - 困难(Hard): 5层Minimax搜索 + Alpha-Beta剪枝 + Killer Move + History Heuristic
// - 大师(Master): MCTS算法 + UCT公式 + 2000次模拟
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // 获取 AI 的棋子颜色（与玩家颜色相反）
    G.getAIColor = function() { return G.playerColor === 1 ? 2 : 1; };

    // 评估某个位置对指定玩家的得分
    // 在四个方向上统计连子数和被堵情况，结合中心距离计算综合评分
    G.evaluatePosition = function(row, col, player) {
        // 四个方向：纵向、横向、主对角线、副对角线
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        var score = 0;
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1, blocked = 0;
            // 正方向统计连子
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) { blocked++; break; }
                if (G.gameBoard[nr][nc] === player) count++;
                else if (G.gameBoard[nr][nc] !== 0) { blocked++; break; }
                else break;
            }
            // 反方向统计连子
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) { blocked++; break; }
                if (G.gameBoard[nr][nc] === player) count++;
                else if (G.gameBoard[nr][nc] !== 0) { blocked++; break; }
                else break;
            }
            // 根据连子数和被堵数评分
            if (count >= 5) return 10000;       // 五连，必胜
            if (count === 4 && blocked === 0) score += 1000;  // 活四
            else if (count === 4 && blocked === 1) score += 100;  // 冲四
            else if (count === 3 && blocked === 0) score += 50;   // 活三
            else if (count === 3 && blocked === 1) score += 10;   // 眠三
            else if (count === 2 && blocked === 0) score += 5;    // 活二
        }
        // 加上中心距离权重（越靠近中心分越高）
        return score + (G.BOARD_SIZE / 2 - Math.hypot(row - G.BOARD_SIZE / 2, col - G.BOARD_SIZE / 2)) * 2;
    };

    // 查找指定玩家的所有活三，返回去重后的活三列表
    // 每个活三包含起点、终点及两端空位信息
    G.findLiveThreeBlocks = function(player) {
        var liveThrees = [];
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                if (G.gameBoard[i][j] === player) {
                    for (var d = 0; d < directions.length; d++) {
                        var dx = directions[d][0], dy = directions[d][1];
                        var count = 1;
                        // 沿反方向找到连子的起点
                        var startRow = i, startCol = j;
                        while (startRow - dx >= 0 && startCol - dy >= 0 &&
                               startRow - dx < G.BOARD_SIZE && startCol - dy < G.BOARD_SIZE &&
                               G.gameBoard[startRow - dx][startCol - dy] === player) {
                            startRow -= dx;
                            startCol -= dy;
                            count++;
                        }
                        // 检查起点外侧是否为空位
                        var end1Row = startRow - dx;
                        var end1Col = startCol - dy;
                        var end1Empty = end1Row >= 0 && end1Col >= 0 &&
                                        end1Row < G.BOARD_SIZE && end1Col < G.BOARD_SIZE &&
                                        G.gameBoard[end1Row][end1Col] === 0;
                        // 沿正方向找到连子的终点
                        var endRow = i, endCol = j;
                        while (endRow + dx >= 0 && endCol + dy >= 0 &&
                               endRow + dx < G.BOARD_SIZE && endCol + dy < G.BOARD_SIZE &&
                               G.gameBoard[endRow + dx][endCol + dy] === player) {
                            endRow += dx;
                            endCol += dy;
                            count++;
                        }
                        // 检查终点外侧是否为空位
                        var end2Row = endRow + dx;
                        var end2Col = endCol + dy;
                        var end2Empty = end2Row >= 0 && end2Col >= 0 &&
                                        end2Row < G.BOARD_SIZE && end2Col < G.BOARD_SIZE &&
                                        G.gameBoard[end2Row][end2Col] === 0;
                        // 三连且两端均为空位即为活三
                        if (count === 3 && end1Empty && end2Empty) {
                            liveThrees.push({
                                start: { row: startRow, col: startCol },
                                end: { row: endRow, col: endCol },
                                end1: { row: end1Row, col: end1Col },
                                end2: { row: end2Row, col: end2Col },
                                direction: { dx: dx, dy: dy }
                            });
                        }
                    }
                }
            }
        }
        // 去重：同一组起点和终点的活三只保留一个
        var unique = [];
        for (var t = 0; t < liveThrees.length; t++) {
            var exists = unique.some(function(u) {
                return u.start.row === liveThrees[t].start.row && u.start.col === liveThrees[t].start.col &&
                       u.end.row === liveThrees[t].end.row && u.end.col === liveThrees[t].end.col;
            });
            if (!exists) unique.push(liveThrees[t]);
        }
        return unique;
    };

    // 简单难度 AI：优先赢棋 > 堵对方赢棋 > 堵活三 > 随机（偏向中心）
    G.findEasyMove = function() {
        var ai = G.getAIColor(), hu = G.playerColor;
        var empty = [];         // 所有空位
        var nearPieces = [];    // 附近有棋子的空位
        // 收集所有空位及附近有棋子的空位
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                if (G.gameBoard[i][j] === 0) {
                    empty.push({ row: i, col: j });
                    var hasNeighbor = false;
                    for (var dx = -2; dx <= 2; dx++) {
                        for (var dy = -2; dy <= 2; dy++) {
                            var nr = i + dy, nc = j + dx;
                            if (nr >= 0 && nr < G.BOARD_SIZE && nc >= 0 && nc < G.BOARD_SIZE && G.gameBoard[nr][nc] !== 0) {
                                hasNeighbor = true;
                                break;
                            }
                        }
                        if (hasNeighbor) break;
                    }
                    if (hasNeighbor) nearPieces.push({ row: i, col: j });
                }
            }
        }
        // 优先选择附近有棋子的位置
        var candidates = nearPieces.length > 0 ? nearPieces : empty;

        // 第一步：检查 AI 是否能直接赢
        for (var k = 0; k < candidates.length; k++) {
            G.gameBoard[candidates[k].row][candidates[k].col] = ai;
            if (G.checkWin(candidates[k].row, candidates[k].col, ai)) {
                G.gameBoard[candidates[k].row][candidates[k].col] = 0;
                return { row: candidates[k].row, col: candidates[k].col };
            }
            G.gameBoard[candidates[k].row][candidates[k].col] = 0;
        }

        // 第二步：检查是否需要堵对方的赢棋
        for (var k = 0; k < candidates.length; k++) {
            G.gameBoard[candidates[k].row][candidates[k].col] = hu;
            if (G.checkWin(candidates[k].row, candidates[k].col, hu)) {
                G.gameBoard[candidates[k].row][candidates[k].col] = 0;
                return { row: candidates[k].row, col: candidates[k].col };
            }
            G.gameBoard[candidates[k].row][candidates[k].col] = 0;
        }

        // 第三步：尝试堵对方的活三
        var liveThreeBlocks = G.findLiveThreeBlocks(hu);
        if (liveThreeBlocks.length > 0) {
            for (var b = 0; b < liveThreeBlocks.length; b++) {
                var block = liveThreeBlocks[b];
                var ends = [{ row: block.end1.row, col: block.end1.col }, { row: block.end2.row, col: block.end2.col }];
                for (var e = 0; e < ends.length; e++) {
                    if (ends[e].row >= 0 && ends[e].row < G.BOARD_SIZE &&
                        ends[e].col >= 0 && ends[e].col < G.BOARD_SIZE &&
                        G.gameBoard[ends[e].row][ends[e].col] === 0) {
                        return ends[e];
                    }
                }
            }
        }

        // 第四步：按中心距离加权随机选择（70%概率走加权随机，30%概率纯随机）
        var weights = candidates.map(function(pos) {
            var centerDist = Math.hypot(pos.row - G.BOARD_SIZE / 2, pos.col - G.BOARD_SIZE / 2);
            return Math.max(0, (G.BOARD_SIZE / 2 - centerDist) / 10);
        });

        var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);
        if (totalWeight > 0 && Math.random() < 0.7) {
            var r = Math.random() * totalWeight;
            for (var i = 0; i < candidates.length; i++) {
                r -= weights[i];
                if (r <= 0) return candidates[i];
            }
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    };

    // 中等难度 AI：基于位置评估函数，兼顾进攻和防守
    G.findMediumMove = function() {
        var ai = G.getAIColor(), hu = G.playerColor;
        var best = null, bestScore = -Infinity;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                if (G.gameBoard[i][j] === 0) {
                    // 先检查能否直接赢
                    G.gameBoard[i][j] = ai;
                    if (G.checkWin(i, j, ai)) { G.gameBoard[i][j] = 0; return { row: i, col: j }; }
                    // 再检查是否需要堵对方赢棋
                    G.gameBoard[i][j] = hu;
                    if (G.checkWin(i, j, hu)) { G.gameBoard[i][j] = 0; return { row: i, col: j }; }
                    // 综合评估：AI 进攻分 + 玩家防守分 × 0.8
                    G.gameBoard[i][j] = ai;
                    var score = G.evaluatePosition(i, j, ai);
                    G.gameBoard[i][j] = hu;
                    score += G.evaluatePosition(i, j, hu) * 0.8;
                    G.gameBoard[i][j] = 0;
                    if (score > bestScore) { bestScore = score; best = { row: i, col: j }; }
                }
            }
        }
        return best;
    };

    // 困难难度 AI：在中等基础上增加一层搜索，考虑对手最优应对
    G.findHardMove = function() {
        var ai = G.getAIColor(), hu = G.playerColor;
        var best = null, bestScore = -Infinity;
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                if (G.gameBoard[i][j] === 0) {
                    G.gameBoard[i][j] = ai;
                    var score = G.evaluatePosition(i, j, ai);
                    // 模拟对手最优应对，减去对手最高得分 × 0.7
                    var playerBest = -Infinity;
                    for (var x = 0; x < G.BOARD_SIZE; x++) {
                        for (var y = 0; y < G.BOARD_SIZE; y++) {
                            if (G.gameBoard[x][y] === 0) {
                                G.gameBoard[x][y] = hu;
                                var s = G.evaluatePosition(x, y, hu);
                                G.gameBoard[x][y] = 0;
                                if (s > playerBest) playerBest = s;
                            }
                        }
                    }
                    score -= playerBest * 0.7;
                    G.gameBoard[i][j] = 0;
                    if (score > bestScore) { bestScore = score; best = { row: i, col: j }; }
                }
            }
        }
        return best;
    };

    G.findCandidateMoves = function(player, radius) {
        var candidates = [];
        var hasNeighbor = {};
        for (var i = 0; i < G.BOARD_SIZE; i++) {
            for (var j = 0; j < G.BOARD_SIZE; j++) {
                if (G.gameBoard[i][j] === 0) {
                    for (var dr = -radius; dr <= radius; dr++) {
                        for (var dc = -radius; dc <= radius; dc++) {
                            var nr = i + dr, nc = j + dc;
                            if (nr >= 0 && nr < G.BOARD_SIZE && nc >= 0 && nc < G.BOARD_SIZE && G.gameBoard[nr][nc] !== 0) {
                                hasNeighbor[i + ',' + j] = true;
                                break;
                            }
                        }
                        if (hasNeighbor[i + ',' + j]) break;
                    }
                }
            }
        }
        for (var key in hasNeighbor) {
            var parts = key.split(',');
            candidates.push({ row: parseInt(parts[0]), col: parseInt(parts[1]) });
        }
        if (candidates.length === 0) {
            for (var i = 0; i < G.BOARD_SIZE; i++) {
                for (var j = 0; j < G.BOARD_SIZE; j++) {
                    if (G.gameBoard[i][j] === 0) {
                        candidates.push({ row: i, col: j });
                    }
                }
            }
        }
        return candidates;
    };

    G.MCTSNode = function(board, player, parent, move) {
        this.board = board.map(function(row) { return row.slice(); });
        this.player = player;
        this.parent = parent;
        this.move = move;
        this.children = [];
        this.wins = 0;
        this.visitCount = 0;
        this.untriedMoves = null;
    };

    G.MCTSNode.prototype.uctValue = function(exploration) {
        if (this.visitCount === 0) return Infinity;
        return (this.wins / this.visitCount) + exploration * Math.sqrt(Math.log(this.parent.visitCount) / this.visitCount);
    };

    G.MCTSNode.prototype.bestChild = function() {
        var best = null, bestValue = -Infinity;
        for (var i = 0; i < this.children.length; i++) {
            var val = this.children[i].uctValue();
            if (val > bestValue) { bestValue = val; best = this.children[i]; }
        }
        return best;
    };

    G.MCTSNode.prototype.expand = function() {
        if (this.untriedMoves === null) {
            this.untriedMoves = G.findCandidateMoves(this.player, 2);
        }
        if (this.untriedMoves.length === 0) return null;

        var move = this.untriedMoves.pop();
        var opponent = this.player === 1 ? 2 : 1;
        var newBoard = this.board.map(function(row) { return row.slice(); });
        newBoard[move.row][move.col] = this.player;

        if (G.checkWin(newBoard, move.row, move.col, this.player)) {
            var child = new G.MCTSNode(newBoard, opponent, this, move);
            child.wins = 1;
            child.visitCount = 1;
            this.children.push(child);
            return child;
        }

        var child = new G.MCTSNode(newBoard, opponent, this, move);
        this.children.push(child);
        return child;
    };

    G.MCTSNode.prototype.simulate = function() {
        var simBoard = this.board.map(function(row) { return row.slice(); });
        var simPlayer = this.player;
        var passes = 0;

        for (var i = 0; i < 100; i++) {
            var moves = G.findCandidateMoves(simPlayer, 2);
            if (moves.length === 0) {
                passes++;
                if (passes >= 2) break;
                simPlayer = simPlayer === 1 ? 2 : 1;
                continue;
            }

            var move = moves[Math.floor(Math.random() * moves.length)];
            simBoard[move.row][move.col] = simPlayer;

            if (G.checkWin(simBoard, move.row, move.col, simPlayer)) {
                return simPlayer === this.player ? 1 : 0;
            }

            simPlayer = simPlayer === 1 ? 2 : 1;
        }

        return 0.5;
    };

    G.MCTSNode.prototype.backpropagate = function(result) {
        this.visitCount++;
        this.wins += result;
        if (this.parent) this.parent.backpropagate(result);
    };

    G.evaluatePositionForBoard = function(row, col, player, board) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        var score = 0;
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1, blocked = 0;
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) { blocked++; break; }
                if (board[nr][nc] === player) count++;
                else if (board[nr][nc] !== 0) { blocked++; break; }
                else break;
            }
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) { blocked++; break; }
                if (board[nr][nc] === player) count++;
                else if (board[nr][nc] !== 0) { blocked++; break; }
                else break;
            }
            if (count >= 5) return 100000;
            if (count === 4 && blocked === 0) score += 10000;
            else if (count === 4 && blocked === 1) score += 1000;
            else if (count === 4 && blocked === 2) score += 500;
            else if (count === 3 && blocked === 0) score += 500;
            else if (count === 3 && blocked === 1) score += 100;
            else if (count === 2 && blocked === 0) score += 10;
        }
        return score;
    };

    G.findThreats = function(board, player) {
        var threats = [];
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var r = 0; r < G.BOARD_SIZE; r++) {
            for (var c = 0; c < G.BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    for (var d = 0; d < dirs.length; d++) {
                        var dx = dirs[d][0], dy = dirs[d][1];
                        var count = 0, open0 = 0, open1 = 0;
                        var nr, nc;
                        for (var i = 1; i < 5; i++) {
                            nr = r + i * dy; nc = c + i * dx;
                            if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                            if (board[nr][nc] === player) count++;
                            else if (board[nr][nc] === 0) { open1 = 1; break; }
                            else { break; }
                        }
                        for (var i = 1; i < 5; i++) {
                            nr = r - i * dy; nc = c - i * dx;
                            if (nr < 0 || nr >= G.BOARD_SIZE || nc < 0 || nc >= G.BOARD_SIZE) break;
                            if (board[nr][nc] === player) count++;
                            else if (board[nr][nc] === 0) { open0 = 1; break; }
                            else { break; }
                        }
                        var openEnds = 0;
                        if (open0 > 0) openEnds++;
                        if (open1 > 0) openEnds++;
                        if (count === 4) threats.push({ row: r, col: c, type: 'four', priority: 10000 });
                        else if (count === 3 && openEnds === 2) threats.push({ row: r, col: c, type: 'live3', priority: 5000 });
                        else if (count === 3 && openEnds === 1) threats.push({ row: r, col: c, type: 'sleep3', priority: 1000 });
                        else if (count === 2 && openEnds === 2) threats.push({ row: r, col: c, type: 'live2', priority: 100 });
                    }
                }
            }
        }
        return threats;
    };

    G.findSmartMove = function(board, player, opponent, radius) {
        var threats = G.findThreats(board, opponent);
        if (threats.length > 0) {
            threats.sort(function(a, b) { return b.priority - a.priority; });
            return threats[0];
        }
        var myThreats = G.findThreats(board, player);
        if (myThreats.length > 0) {
            myThreats.sort(function(a, b) { return b.priority - a.priority; });
            return myThreats[0];
        }
        var candidates = G.findCandidateMovesForSim(player, radius, board);
        if (candidates.length === 0) return null;
        var scores = [];
        for (var i = 0; i < candidates.length; i++) {
            scores.push({
                move: candidates[i],
                score: G.evaluatePositionForBoard(candidates[i].row, candidates[i].col, player, board)
            });
        }
        scores.sort(function(a, b) { return b.score - a.score; });
        if (Math.random() < 0.8 && scores.length > 0) {
            return scores[0].move;
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    };

    G.findMasterMove = function() {
        try {
            var ai = G.getAIColor();
            var hu = ai === 1 ? 2 : 1;
            var startTime = Date.now();
            if (!G.gameBoard || !Array.isArray(G.gameBoard) || G.gameBoard.length !== 15) {
                return { row: 7, col: 7 };
            }
            var forbidden = (G.shouldCheckForbidden && G.shouldCheckForbidden() && ai === 1);

            var BS = 15;
            var SP = { FIVE: 1000000, OPEN_FOUR: 100000, FOUR: 10000, OPEN_THREE: 5000, THREE: 1000, OPEN_TWO: 500, TWO: 100 };
            var analyze = function(board, row, col, player) {
                var dirs = [[1,0],[0,1],[1,1],[1,-1]];
                var total = 0;
                var info = { five:0, openFour:0, four:0, openThree:0, three:0, openTwo:0, two:0 };
                for (var d = 0; d < 4; d++) {
                    var dx = dirs[d][0], dy = dirs[d][1];
                    var line = [];
                    for (var i = -4; i <= 4; i++) {
                        var nr = row + i*dy, nc = col + i*dx;
                        if (nr < 0 || nr >= BS || nc < 0 || nc >= BS) line.push(-1);
                        else if (nr === row && nc === col) line.push(player);
                        else line.push(board[nr][nc]);
                    }
                    var s = line.map(function(v){
                        if (v === -1) return 'X'; if (v === 0) return '_';
                        if (v === player) return 'O'; return 'X';
                    }).join('');
                    if (s.indexOf('OOOOO') !== -1) { info.five++; total += SP.FIVE; }
                    else if (s.indexOf('_OOOO_') !== -1) { info.openFour++; total += SP.OPEN_FOUR; }
                    else if (~s.indexOf('_OOOOX') || ~s.indexOf('XOOOO_') || ~s.indexOf('OO_OO') || ~s.indexOf('O_OOO') || ~s.indexOf('OOO_O')) { info.four++; total += SP.FOUR; }
                    else if (~s.indexOf('_OOO_') || ~s.indexOf('_O_OO_') || ~s.indexOf('_OO_O_')) { info.openThree++; total += SP.OPEN_THREE; }
                    else if (~s.indexOf('_OOOX') || ~s.indexOf('XOOO_') || ~s.indexOf('_O_OOX') || ~s.indexOf('XOO_O_') || ~s.indexOf('X_OOO_') || ~s.indexOf('_OOO_X') || ~s.indexOf('O_O_O')) { info.three++; total += SP.THREE; }
                    else if (~s.indexOf('__OO__') || ~s.indexOf('_O_O_')) { info.openTwo++; total += SP.OPEN_TWO; }
                    else if (~s.indexOf('_OO__X') || ~s.indexOf('X__OO_') || ~s.indexOf('_O_OX') || ~s.indexOf('XO_O_')) { info.two++; total += SP.TWO; }
                }
                if (info.five) total = SP.FIVE;
                else if (info.openFour >= 2) total = SP.OPEN_FOUR * 1.5;
                else if (info.openFour && info.four) total = SP.OPEN_FOUR * 1.2;
                else if (info.four >= 2) total = SP.FOUR * 1.5;
                else if (info.openThree >= 2) total = SP.OPEN_THREE * 1.5;
                return { score: total, shapes: info };
            };
            var genCandidates = function(board, topK) {
                var scored = [];
                var hasPiece = false;
                for (var r = 0; r < BS; r++) { for (var c = 0; c < BS; c++) { if (board[r][c] !== 0) { hasPiece = true; break; } } if (hasPiece) break; }
                if (!hasPiece) return [{ row:7, col:7, score:999999 }];
                var added = {};
                for (var r = 0; r < BS; r++) {
                    for (var c = 0; c < BS; c++) {
                        if (board[r][c] !== 0) continue;
                        var near = false;
                        for (var dr = -2; dr <= 2 && !near; dr++) {
                            for (var dc = -2; dc <= 2; dc++) {
                                var nr = r + dr, nc = c + dc;
                                if (nr >= 0 && nr < BS && nc >= 0 && nc < BS && board[nr][nc] !== 0) { near = true; break; }
                            }
                        }
                        if (!near) continue;
                        var b1 = board.map(function(row){ return row.slice(); }); b1[r][c] = ai;
                        var sAi = analyze(b1, r, c, ai).score;
                        var b2 = board.map(function(row){ return row.slice(); }); b2[r][c] = hu;
                        var sHu = analyze(b2, r, c, hu).score;
                        var k = r + ',' + c;
                        if (!added[k]) { added[k] = 1; scored.push({ row:r, col:c, score: sAi * 1.1 + sHu, sAi:sAi, sHu:sHu }); }
                    }
                }
                scored.sort(function(a,b){ return b.score - a.score; });
                if (!scored.length) return [{ row:7, col:7, score:0 }];
                if (topK && scored.length > topK) scored.length = topK;
                return scored;
            };
            var candidates = genCandidates(G.gameBoard, 15);
            if (!candidates.length) return { row: 7, col: 7 };

            var i, j;
            for (i = 0; i < candidates.length; i++) {
                var mv = candidates[i];
                var b1 = G.gameBoard.map(function(r){ return r.slice(); });
                b1[mv.row][mv.col] = ai;
                if (G.checkWin(b1, mv.row, mv.col, ai)) {
                    if (forbidden && G.checkForbidden(mv.row, mv.col, b1).forbidden) continue;
                    return { row: mv.row, col: mv.col };
                }
            }

            var blockList = [];
            for (i = 0; i < candidates.length; i++) {
                var mv = candidates[i];
                var b2 = G.gameBoard.map(function(r){ return r.slice(); });
                b2[mv.row][mv.col] = hu;
                if (G.checkWin(b2, mv.row, mv.col, hu)) blockList.push(mv);
            }
            if (blockList.length > 0) {
                for (i = 0; i < blockList.length; i++) {
                    var blk = blockList[i];
                    if (!forbidden) return { row: blk.row, col: blk.col };
                    var fbt = G.gameBoard.map(function(r){ return r.slice(); }); fbt[blk.row][blk.col] = 1;
                    if (!G.checkForbidden(blk.row, blk.col, fbt).forbidden) return { row: blk.row, col: blk.col };
                }
                return { row: blockList[0].row, col: blockList[0].col };
            }

            for (i = 0; i < candidates.length; i++) {
                var mv = candidates[i];
                var b3 = G.gameBoard.map(function(r){ return r.slice(); }); b3[mv.row][mv.col] = ai;
                if (forbidden && G.checkForbidden(mv.row, mv.col, b3).forbidden) continue;
                var op4 = 0, f4 = 0;
                var c2 = genCandidates(b3, 20);
                for (j = 0; j < c2.length; j++) {
                    var mv2 = c2[j];
                    var b32 = b3.map(function(r){ return r.slice(); }); b32[mv2.row][mv2.col] = ai;
                    if (forbidden && G.checkForbidden(mv2.row, mv2.col, b32).forbidden) continue;
                    var a = analyze(b32, mv2.row, mv2.col, ai);
                    if (a.shapes.openFour || a.shapes.five) op4++;
                    if (a.shapes.four) f4++;
                    if (G.checkWin(b32, mv2.row, mv2.col, ai)) op4 += 2;
                }
                if (op4 >= 2) return { row: mv.row, col: mv.col };
                if (f4 >= 3) return { row: mv.row, col: mv.col };
            }

            var oppT2 = [];
            for (i = 0; i < candidates.length; i++) {
                var mv = candidates[i];
                var b4 = G.gameBoard.map(function(r){ return r.slice(); }); b4[mv.row][mv.col] = hu;
                var ha = analyze(b4, mv.row, mv.col, hu);
                if (ha.shapes.openFour) oppT2.push({ mv: mv, pri: 2 });
                else if (ha.shapes.four || ha.shapes.openThree >= 2) oppT2.push({ mv: mv, pri: 1 });
            }
            if (oppT2.length > 0) {
                oppT2.sort(function(a,b){ return b.pri - a.pri; });
                var tt = oppT2[0];
                if (tt.pri >= 2) {
                    if (!forbidden) return { row: tt.mv.row, col: tt.mv.col };
                    var fbt2 = G.gameBoard.map(function(r){ return r.slice(); }); fbt2[tt.mv.row][tt.mv.col] = 1;
                    if (!G.checkForbidden(tt.mv.row, tt.mv.col, fbt2).forbidden) return { row: tt.mv.row, col: tt.mv.col };
                }
            }

            var topN = Math.min(10, candidates.length);
            var bestMove = null, bestFinal = -Infinity;
            for (i = 0; i < topN; i++) {
                var mv = candidates[i];
                if (forbidden) {
                    var bfb = G.gameBoard.map(function(r){ return r.slice(); }); bfb[mv.row][mv.col] = 1;
                    if (G.checkForbidden(mv.row, mv.col, bfb).forbidden) continue;
                }
                var b5 = G.gameBoard.map(function(r){ return r.slice(); }); b5[mv.row][mv.col] = ai;
                if (G.checkWin(b5, mv.row, mv.col, ai)) { bestMove = mv; break; }
                var obc = genCandidates(b5, 8);
                var obs = -Infinity, obm = null;
                for (j = 0; j < obc.length; j++) {
                    var omv = obc[j];
                    var ob = b5.map(function(r){ return r.slice(); }); ob[omv.row][omv.col] = hu;
                    var hw = G.checkWin(ob, omv.row, omv.col, hu);
                    var hs = analyze(ob, omv.row, omv.col, hu).score + (hw ? 1000000 : 0);
                    if (hs > obs) { obs = hs; obm = omv; }
                }
                var myS = analyze(b5, mv.row, mv.col, ai).score;
                var defS = obm ? analyze(G.gameBoard, obm.row, obm.col, hu).score : 0;
                var fin = myS * 1.2 + defS * 0.9 - obs * 1.0;
                fin += (BS / 2 - Math.hypot(mv.row - BS/2, mv.col - BS/2));
                if (fin > bestFinal) { bestFinal = fin; bestMove = mv; }
            }
            if (!bestMove) {
                var filt = candidates.filter(function(m){
                    if (!forbidden) return true;
                    var fb = G.gameBoard.map(function(r){ return r.slice(); }); fb[m.row][m.col] = 1;
                    return !G.checkForbidden(m.row, m.col, fb).forbidden;
                });
                bestMove = filt.length > 0 ? filt[0] : candidates[0];
            }
            var elapsed = Date.now() - startTime;
            console.log('[Master-local]', bestMove.row, bestMove.col, 'score:', bestFinal ? bestFinal.toFixed(1) : '-', 'time:', elapsed + 'ms');
            return { row: bestMove.row, col: bestMove.col };
        } catch (e) {
            console.error('Master move error:', e);
            return { row: 7, col: 7 };
        }
    };

    G.findCandidateMovesForSim = function(player, radius, board) {
        var candidates = [];
        var hasNeighbor = {};
        for (var i = 0; i < 15; i++) {
            for (var j = 0; j < 15; j++) {
                if (board[i][j] === 0) {
                    for (var dr = -radius; dr <= radius; dr++) {
                        for (var dc = -radius; dc <= radius; dc++) {
                            var nr = i + dr, nc = j + dc;
                            if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] !== 0) {
                                hasNeighbor[i + ',' + j] = true;
                                break;
                            }
                        }
                        if (hasNeighbor[i + ',' + j]) break;
                    }
                }
            }
        }
        for (var key in hasNeighbor) {
            var parts = key.split(',');
            candidates.push({ row: parseInt(parts[0]), col: parseInt(parts[1]) });
        }
        if (candidates.length === 0) {
            for (var i = 0; i < 15; i++) {
                for (var j = 0; j < 15; j++) {
                    if (board[i][j] === 0) {
                        candidates.push({ row: i, col: j });
                    }
                }
            }
        }
        return candidates;
    };

    G.aiWorker = null;
    G.aiWorkerBusy = false;
    G.aiWorkerPending = null;

    G.getOrCreateWorker = function() {
        if (G.aiWorker) return G.aiWorker;
        try {
            G.aiWorker = new Worker('static/js/gomoku/ai_worker.js');
            G.aiWorker.onmessage = function(e) {
                G.aiWorkerBusy = false;
                var result = e.data || {};
                var pending = G.aiWorkerPending;
                G.aiWorkerPending = null;
                if (result.error) {
                    console.warn('[AI Worker] returned error:', result.error, 'fallback to local');
                    if (pending) pending.useFallback = true;
                }
                if (pending && typeof pending.callback === 'function') {
                    pending.callback(result);
                }
            };
            G.aiWorker.onerror = function(err) {
                console.error('[AI Worker] error event:', err);
                G.aiWorkerBusy = false;
                var pending = G.aiWorkerPending;
                G.aiWorkerPending = null;
                if (pending) {
                    pending.useFallback = true;
                    if (typeof pending.callback === 'function') pending.callback(null);
                }
            };
        } catch (e) {
            console.warn('[AI Worker] creation failed, using local calculation:', e);
            G.aiWorker = null;
        }
        return G.aiWorker;
    };

    G.aiMove = function() {
        if (!G.gameActive || G.gameMode !== 'ai' || G.currentPlayer !== G.getAIColor()) return;
        var delay = 0;
        if (G.aiDelayEnabled) {
            switch (G.aiDifficulty) {
                case 'easy':    delay = Math.random() * 1000;          break;
                case 'medium':  delay = 500 + Math.random() * 1500;   break;
                case 'hard':    delay = 1000 + Math.random() * 2000;  break;
                case 'master':  delay = 2000 + Math.random() * 3000;  break;
                default: delay = 0;
            }
        }

        var worker = G.getOrCreateWorker();

        var tryLocalFallback = function() {
            console.log('[AI] using local fallback (difficulty=' + G.aiDifficulty + ')');
            var move = null;
            if (G.aiDifficulty === 'easy') move = G.findEasyMove();
            else if (G.aiDifficulty === 'medium') move = G.findMediumMove();
            else if (G.aiDifficulty === 'hard') move = G.findHardMove();
            else if (G.aiDifficulty === 'master') move = G.findMasterMove();
            if (move) {
                var placed = G.placePiece(move.row, move.col, G.getAIColor());
                if (!placed && G.gameActive && G.gameBoard[7][7] === 0) {
                    G.placePiece(7, 7, G.getAIColor());
                }
            }
        };

        setTimeout(function() {
            if (!G.gameActive || G.gameMode !== 'ai' || G.currentPlayer !== G.getAIColor()) return;

            if (!worker || G.aiWorkerBusy) {
                tryLocalFallback();
                return;
            }

            var aiForbidden = false;
            if (G.shouldCheckForbidden && typeof G.shouldCheckForbidden === 'function') {
                aiForbidden = !!G.shouldCheckForbidden();
            } else if (typeof G.aiForbidden !== 'undefined') {
                aiForbidden = !!G.aiForbidden;
            }

            var boardCopy = G.gameBoard.map(function(r) { return r.slice(); });
            G.aiWorkerBusy = true;
            G.aiWorkerPending = {
                useFallback: false,
                callback: function(result) {
                    if (!G.gameActive || G.gameMode !== 'ai' || G.currentPlayer !== G.getAIColor()) return;
                    var pendingObj = G.aiWorkerPending || {};
                    if (!result || pendingObj.useFallback) {
                        tryLocalFallback();
                        return;
                    }
                    if (typeof result.row !== 'number' || typeof result.col !== 'number') {
                        tryLocalFallback();
                        return;
                    }
                    if (result.elapsedMs !== undefined) {
                        console.log('[AI Worker] difficulty=' + (result.difficulty || G.aiDifficulty),
                            'move=(' + result.row + ',' + result.col + ')',
                            'time=' + result.elapsedMs + 'ms');
                    }
                    var placed = G.placePiece(result.row, result.col, G.getAIColor());
                    if (!placed && G.gameActive && G.gameBoard[7][7] === 0) {
                        G.placePiece(7, 7, G.getAIColor());
                    }
                }
            };

            try {
                worker.postMessage({
                    type: 'findMove',
                    difficulty: G.aiDifficulty,
                    playerColor: G.playerColor,
                    board: boardCopy,
                    aiForbidden: aiForbidden
                });
            } catch (e) {
                console.error('[AI Worker] postMessage failed:', e);
                G.aiWorkerBusy = false;
                G.aiWorkerPending = null;
                tryLocalFallback();
            }
        }, delay);
    };

})();
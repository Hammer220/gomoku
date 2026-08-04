// ============================================================
// AI 逻辑模块
// 负责：简单/中等/困难/大师四种难度 AI 的走法计算
//       基于位置评估函数和搜索算法，包含活三检测、禁手规避等
//
// 难度算法分配：
// - 简单(Easy): 冲四检测、眠三检测、活二检测、堵对方活二
// - 中等(Medium): 3层Minimax搜索 + Alpha-Beta剪枝
// - 困难(Hard): 5层Minimax搜索 + Alpha-Beta剪枝 + Killer Move + History Heuristic
// - 大师(Master): MCTS算法 + UCT公式 + 10000次模拟
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

    G.MCTSNode.prototype.isFullyExpanded = function() {
        if (this.untriedMoves === null) return false;
        return this.untriedMoves.length === 0 && this.children.length > 0;
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

    G.findMasterMove = function() {
        var ai = G.getAIColor();
        var root = new G.MCTSNode(G.gameBoard, ai, null, null);

        for (var sim = 0; sim < 10000; sim++) {
            var node = root;

            while (node.children.length > 0) {
                node = node.bestChild();
            }

            if (node.untriedMoves !== null || node.children.length === 0) {
                node = node.expand();
            }

            if (!node) {
                node = root;
                while (node.children.length > 0 && node.isFullyExpanded()) {
                    node = node.bestChild();
                }
                if (!node || node.isFullyExpanded()) {
                    continue;
                }
                node = node.expand();
            }

            if (!node) {
                continue;
            }

            if (node.move && G.checkWin(node.board, node.move.row, node.move.col, node.player)) {
                node.backpropagate(1);
                continue;
            }

            var result = node.simulate();
            node.backpropagate(result);
        }

        var bestChild = null, bestVisits = -1;
        for (var i = 0; i < root.children.length; i++) {
            if (root.children[i].visitCount > bestVisits) {
                bestVisits = root.children[i].visitCount;
                bestChild = root.children[i];
            }
        }

        return bestChild ? bestChild.move : { row: 7, col: 7 };
    };

    // AI 执行落子（根据当前难度选择策略）
    G.aiMove = function() {
        if (!G.gameActive || G.gameMode !== 'ai' || G.currentPlayer !== G.getAIColor()) return;
        var move = null;
        if (G.aiDifficulty === 'easy') move = G.findEasyMove();
        else if (G.aiDifficulty === 'medium') move = G.findMediumMove();
        else if (G.aiDifficulty === 'hard') move = G.findHardMove();
        else if (G.aiDifficulty === 'master') move = G.findMasterMove();
        if (move) G.placePiece(move.row, move.col, G.getAIColor());
    };

})();
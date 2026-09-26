// ============================================================
// AI Worker - 后台线程执行 AI 计算，不阻塞主线程 UI
// 接收消息：{ type:'findMove', difficulty, playerColor, board, aiForbidden }
// 返回消息：{ row, col, difficulty, elapsedMs }
// ============================================================
(function() {
    "use strict";

    var BOARD_SIZE = 15;
    var G = {};

    G.BOARD_SIZE = BOARD_SIZE;

    G.checkWin = function(board, row, col, player) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1;
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || board[nr][nc] !== player) break;
                count++;
            }
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || board[nr][nc] !== player) break;
                count++;
            }
            if (count >= 5) return true;
        }
        return false;
    };

    G.checkOverline = function(row, col, board) {
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var dx = directions[d][0], dy = directions[d][1];
            var count = 1;
            for (var i = 1; i < 6; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            for (var i = 1; i < 6; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            if (count >= 6) return true;
        }
        return false;
    };

    G.analyzeLine = function(row, col, dx, dy, board) {
        var result = { liveThree: false, four: false };
        var line = [];
        var centerIndex = 0;
        for (var i = -4; i <= 4; i++) {
            var nr = row + i * dy, nc = col + i * dx;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
                line.push(-1);
            } else {
                line.push(board[nr][nc]);
            }
            if (i === 0) centerIndex = line.length - 1;
        }
        var count = 1;
        var leftEmpty = 0, rightEmpty = 0;
        for (var i = centerIndex - 1; i >= 0; i--) {
            if (line[i] === 1) count++;
            else if (line[i] === 0) { leftEmpty++; break; }
            else break;
        }
        for (var i = centerIndex + 1; i < line.length; i++) {
            if (line[i] === 1) count++;
            else if (line[i] === 0) { rightEmpty++; break; }
            else break;
        }
        if (count === 4 && leftEmpty > 0 && rightEmpty > 0) result.four = true;
        else if (count === 4 && (leftEmpty > 0 || rightEmpty > 0)) result.four = true;
        else if (count === 3 && leftEmpty > 0 && rightEmpty > 0) result.liveThree = true;
        return result;
    };

    G.checkForbidden = function(row, col, board) {
        if (board[row][col] !== 1) return { forbidden: false, reason: '' };
        if (G.checkOverline(row, col, board)) return { forbidden: true, reason: '长连禁手' };
        var liveThrees = 0, fours = 0;
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < directions.length; d++) {
            var info = G.analyzeLine(row, col, directions[d][0], directions[d][1], board);
            if (info.liveThree) liveThrees++;
            if (info.four) fours++;
        }
        if (liveThrees >= 2) return { forbidden: true, reason: '三三禁手' };
        if (fours >= 2) return { forbidden: true, reason: '四四禁手' };
        return { forbidden: false, reason: '' };
    };

    G.evaluatePositionForBoard = function(row, col, player, board) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        var score = 0;
        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var count = 1, blocked = 0;
            for (var i = 1; i < 5; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { blocked++; break; }
                if (board[nr][nc] === player) count++;
                else if (board[nr][nc] !== 0) { blocked++; break; }
                else break;
            }
            for (var i = 1; i < 5; i++) {
                var nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) { blocked++; break; }
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

    G.findCandidateMovesForSim = function(radius, board) {
        var candidates = [];
        var hasNeighbor = {};
        for (var i = 0; i < BOARD_SIZE; i++) {
            for (var j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    for (var dr = -radius; dr <= radius; dr++) {
                        for (var dc = -radius; dc <= radius; dc++) {
                            var nr = i + dr, nc = j + dc;
                            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== 0) {
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
            for (var i = 0; i < BOARD_SIZE; i++) {
                for (var j = 0; j < BOARD_SIZE; j++) {
                    if (board[i][j] === 0) candidates.push({ row: i, col: j });
                }
            }
        }
        return candidates;
    };

    G.findThreats = function(board, player) {
        var threats = [];
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    for (var d = 0; d < dirs.length; d++) {
                        var dx = dirs[d][0], dy = dirs[d][1];
                        var count = 0, open0 = 0, open1 = 0;
                        var nr, nc;
                        for (var i = 1; i < 5; i++) {
                            nr = r + i * dy; nc = c + i * dx;
                            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                            if (board[nr][nc] === player) count++;
                            else if (board[nr][nc] === 0) { open1 = 1; break; }
                            else break;
                        }
                        for (var i = 1; i < 5; i++) {
                            nr = r - i * dy; nc = c - i * dx;
                            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                            if (board[nr][nc] === player) count++;
                            else if (board[nr][nc] === 0) { open0 = 1; break; }
                            else break;
                        }
                        var openEnds = (open0 > 0 ? 1 : 0) + (open1 > 0 ? 1 : 0);
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
        var candidates = G.findCandidateMovesForSim(radius, board);
        if (candidates.length === 0) return null;
        var scores = [];
        for (var i = 0; i < candidates.length; i++) {
            scores.push({
                move: candidates[i],
                score: G.evaluatePositionForBoard(candidates[i].row, candidates[i].col, player, board)
            });
        }
        scores.sort(function(a, b) { return b.score - a.score; });
        if (Math.random() < 0.8 && scores.length > 0) return scores[0].move;
        return candidates[Math.floor(Math.random() * candidates.length)];
    };

    function findLiveThreeBlocks(board, player) {
        var liveThrees = [];
        var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var i = 0; i < BOARD_SIZE; i++) {
            for (var j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === player) {
                    for (var d = 0; d < directions.length; d++) {
                        var dx = directions[d][0], dy = directions[d][1];
                        var count = 1;
                        var startRow = i, startCol = j;
                        while (startRow - dx >= 0 && startCol - dy >= 0 &&
                               startRow - dx < BOARD_SIZE && startCol - dy < BOARD_SIZE &&
                               board[startRow - dx][startCol - dy] === player) {
                            startRow -= dx; startCol -= dy; count++;
                        }
                        var end1Row = startRow - dx, end1Col = startCol - dy;
                        var end1Empty = end1Row >= 0 && end1Col >= 0 &&
                                        end1Row < BOARD_SIZE && end1Col < BOARD_SIZE &&
                                        board[end1Row][end1Col] === 0;
                        var endRow = i, endCol = j;
                        while (endRow + dx >= 0 && endCol + dy >= 0 &&
                               endRow + dx < BOARD_SIZE && endCol + dy < BOARD_SIZE &&
                               board[endRow + dx][endCol + dy] === player) {
                            endRow += dx; endCol += dy; count++;
                        }
                        var end2Row = endRow + dx, end2Col = endCol + dy;
                        var end2Empty = end2Row >= 0 && end2Col >= 0 &&
                                        end2Row < BOARD_SIZE && end2Col < BOARD_SIZE &&
                                        board[end2Row][end2Col] === 0;
                        if (count === 3 && end1Empty && end2Empty) {
                            liveThrees.push({
                                start: { row: startRow, col: startCol },
                                end: { row: endRow, col: endCol },
                                end1: { row: end1Row, col: end1Col },
                                end2: { row: end2Row, col: end2Col }
                            });
                        }
                    }
                }
            }
        }
        var unique = [];
        for (var t = 0; t < liveThrees.length; t++) {
            var exists = unique.some(function(u) {
                return u.start.row === liveThrees[t].start.row && u.start.col === liveThrees[t].start.col &&
                       u.end.row === liveThrees[t].end.row && u.end.col === liveThrees[t].end.col;
            });
            if (!exists) unique.push(liveThrees[t]);
        }
        return unique;
    }

    function collectCandidates(board) {
        var empty = [];
        var nearPieces = [];
        for (var i = 0; i < BOARD_SIZE; i++) {
            for (var j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] === 0) {
                    empty.push({ row: i, col: j });
                    var hasNeighbor = false;
                    for (var dx = -2; dx <= 2; dx++) {
                        for (var dy = -2; dy <= 2; dy++) {
                            var nr = i + dy, nc = j + dx;
                            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== 0) {
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
        return nearPieces.length > 0 ? nearPieces : empty;
    }

    function findEasyMove(board, ai, hu, forbidden) {
        var candidates = collectCandidates(board);

        for (var k = 0; k < candidates.length; k++) {
            var b1 = board.map(function(r) { return r.slice(); });
            b1[candidates[k].row][candidates[k].col] = ai;
            if (G.checkWin(b1, candidates[k].row, candidates[k].col, ai)) {
                if (forbidden && ai === 1 && G.checkForbidden(candidates[k].row, candidates[k].col, b1).forbidden) continue;
                return candidates[k];
            }
        }

        for (var k = 0; k < candidates.length; k++) {
            var b2 = board.map(function(r) { return r.slice(); });
            b2[candidates[k].row][candidates[k].col] = hu;
            if (G.checkWin(b2, candidates[k].row, candidates[k].col, hu)) {
                if (forbidden && ai === 1) {
                    var fb = board.map(function(r) { return r.slice(); });
                    fb[candidates[k].row][candidates[k].col] = 1;
                    if (G.checkForbidden(candidates[k].row, candidates[k].col, fb).forbidden) continue;
                }
                return candidates[k];
            }
        }

        var liveThreeBlocks = findLiveThreeBlocks(board, hu);
        if (liveThreeBlocks.length > 0) {
            for (var b = 0; b < liveThreeBlocks.length; b++) {
                var block = liveThreeBlocks[b];
                var ends = [{ row: block.end1.row, col: block.end1.col }, { row: block.end2.row, col: block.end2.col }];
                for (var e = 0; e < ends.length; e++) {
                    if (ends[e].row >= 0 && ends[e].row < BOARD_SIZE &&
                        ends[e].col >= 0 && ends[e].col < BOARD_SIZE &&
                        board[ends[e].row][ends[e].col] === 0) {
                        if (!forbidden || ai !== 1) return ends[e];
                        var fbtest = board.map(function(r) { return r.slice(); });
                        fbtest[ends[e].row][ends[e].col] = 1;
                        if (!G.checkForbidden(ends[e].row, ends[e].col, fbtest).forbidden) return ends[e];
                    }
                }
            }
        }

        var weights = candidates.map(function(pos) {
            var centerDist = Math.hypot(pos.row - BOARD_SIZE / 2, pos.col - BOARD_SIZE / 2);
            return Math.max(0, (BOARD_SIZE / 2 - centerDist) / 10);
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
    }

    function findMediumMove(board, ai, hu, forbidden) {
        var best = null, bestScore = -Infinity;
        for (var i = 0; i < BOARD_SIZE; i++) {
            for (var j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] !== 0) continue;
                var b1 = board.map(function(r) { return r.slice(); });
                b1[i][j] = ai;
                if (G.checkWin(b1, i, j, ai)) {
                    if (forbidden && ai === 1 && G.checkForbidden(i, j, b1).forbidden) continue;
                    return { row: i, col: j };
                }
                var b2 = board.map(function(r) { return r.slice(); });
                b2[i][j] = hu;
                if (G.checkWin(b2, i, j, hu)) {
                    if (forbidden && ai === 1) {
                        var fb = board.map(function(r) { return r.slice(); });
                        fb[i][j] = 1;
                        if (G.checkForbidden(i, j, fb).forbidden) continue;
                    }
                    return { row: i, col: j };
                }
                var b3 = board.map(function(r) { return r.slice(); });
                b3[i][j] = ai;
                var score = G.evaluatePositionForBoard(i, j, ai, b3);
                var b4 = board.map(function(r) { return r.slice(); });
                b4[i][j] = hu;
                score += G.evaluatePositionForBoard(i, j, hu, b4) * 0.8;
                if (forbidden && ai === 1) {
                    var fb2 = board.map(function(r) { return r.slice(); });
                    fb2[i][j] = 1;
                    if (G.checkForbidden(i, j, fb2).forbidden) score = -Infinity;
                }
                if (score > bestScore) { bestScore = score; best = { row: i, col: j }; }
            }
        }
        return best;
    }

    function findHardMove(board, ai, hu, forbidden) {
        var best = null, bestScore = -Infinity;
        for (var i = 0; i < BOARD_SIZE; i++) {
            for (var j = 0; j < BOARD_SIZE; j++) {
                if (board[i][j] !== 0) continue;
                if (forbidden && ai === 1) {
                    var fb0 = board.map(function(r) { return r.slice(); });
                    fb0[i][j] = 1;
                    if (G.checkForbidden(i, j, fb0).forbidden) continue;
                }
                var b1 = board.map(function(r) { return r.slice(); });
                b1[i][j] = ai;
                if (G.checkWin(b1, i, j, ai)) return { row: i, col: j };
                var b2 = board.map(function(r) { return r.slice(); });
                b2[i][j] = hu;
                if (G.checkWin(b2, i, j, hu)) return { row: i, col: j };
                var score = G.evaluatePositionForBoard(i, j, ai, b1);
                var playerBest = -Infinity;
                for (var x = 0; x < BOARD_SIZE; x++) {
                    for (var y = 0; y < BOARD_SIZE; y++) {
                        if (b1[x][y] !== 0) continue;
                        var bh = b1.map(function(r) { return r.slice(); });
                        bh[x][y] = hu;
                        var s = G.evaluatePositionForBoard(x, y, hu, bh);
                        if (s > playerBest) playerBest = s;
                    }
                }
                score -= playerBest * 0.7;
                if (score > bestScore) { bestScore = score; best = { row: i, col: j }; }
            }
        }
        return best;
    }

    function SHAPE() {}
    SHAPE.FIVE = 1000000;
    SHAPE.OPEN_FOUR = 100000;
    SHAPE.FOUR = 10000;
    SHAPE.OPEN_THREE = 5000;
    SHAPE.THREE = 1000;
    SHAPE.OPEN_TWO = 500;
    SHAPE.TWO = 100;
    SHAPE.OPEN_ONE = 10;
    SHAPE.ONE = 1;

    G.analyzeLineShapes = function(board, row, col, player) {
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        var total = 0;
        var shapeInfo = { five: 0, openFour: 0, four: 0, openThree: 0, three: 0, openTwo: 0, two: 0 };

        for (var d = 0; d < dirs.length; d++) {
            var dx = dirs[d][0], dy = dirs[d][1];
            var line = new Array(9);
            var idx = 0;
            for (var i = -4; i <= 4; i++) {
                var nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
                    line[idx++] = -1;
                } else if (nr === row && nc === col) {
                    line[idx++] = player;
                } else {
                    line[idx++] = board[nr][nc];
                }
            }

            var lineStr = line.map(function(v) {
                if (v === -1) return 'X';
                if (v === 0) return '_';
                if (v === player) return 'O';
                return 'X';
            }).join('');

            var opp = 'X';
            var empty = '_';
            var me = 'O';
            var wall = 'X';

            var s = 0;

            if (lineStr.indexOf('OOOOO') !== -1) { shapeInfo.five++; s += SHAPE.FIVE; }
            else if (lineStr.indexOf('_OOOO_') !== -1) { shapeInfo.openFour++; s += SHAPE.OPEN_FOUR; }
            else if (lineStr.indexOf('_OOOOX') !== -1 || lineStr.indexOf('XOOOO_') !== -1 ||
                     lineStr.indexOf('OO_OO') !== -1 || lineStr.indexOf('O_OOO') !== -1 ||
                     lineStr.indexOf('OOO_O') !== -1) {
                shapeInfo.four++; s += SHAPE.FOUR;
            }
            else if (lineStr.indexOf('_OOO_') !== -1 || lineStr.indexOf('_O_OO_') !== -1 ||
                     lineStr.indexOf('_OO_O_') !== -1) {
                shapeInfo.openThree++; s += SHAPE.OPEN_THREE;
            }
            else if (lineStr.indexOf('_OOOX') !== -1 || lineStr.indexOf('XOOO_') !== -1 ||
                     lineStr.indexOf('_O_OOX') !== -1 || lineStr.indexOf('XOO_O_') !== -1 ||
                     lineStr.indexOf('X_OOO_') !== -1 || lineStr.indexOf('_OOO_X') !== -1 ||
                     lineStr.indexOf('O_O_O') !== -1) {
                shapeInfo.three++; s += SHAPE.THREE;
            }
            else if (lineStr.indexOf('__OO__') !== -1 || lineStr.indexOf('_O_O_') !== -1) {
                shapeInfo.openTwo++; s += SHAPE.OPEN_TWO;
            }
            else if (lineStr.indexOf('_OO__X') !== -1 || lineStr.indexOf('X__OO_') !== -1 ||
                     lineStr.indexOf('_O_OX') !== -1 || lineStr.indexOf('XO_O_') !== -1) {
                shapeInfo.two++; s += SHAPE.TWO;
            }
            total += s;
        }

        if (shapeInfo.five > 0) total = SHAPE.FIVE;
        else if (shapeInfo.openFour >= 2) total = SHAPE.OPEN_FOUR * 1.5;
        else if (shapeInfo.openFour >= 1 && shapeInfo.four >= 1) total = SHAPE.OPEN_FOUR * 1.2;
        else if (shapeInfo.four >= 2) total = SHAPE.FOUR * 1.5;
        else if (shapeInfo.openThree >= 2) total = SHAPE.OPEN_THREE * 1.5;

        return { score: total, shapes: shapeInfo };
    };

    G.boardScore = function(board, player) {
        var opponent = (player === 1) ? 2 : 1;
        var myScore = 0, oppScore = 0;
        var myFives = 0, oppFives = 0;
        var myOpenFours = 0, oppOpenFours = 0;
        var myFours = 0, oppFours = 0;
        var myOpenThrees = 0, oppOpenThrees = 0;

        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === player) {
                    var a = G.analyzeLineShapes(board, r, c, player);
                    myScore += a.score;
                    if (a.shapes.five) myFives += a.shapes.five;
                    if (a.shapes.openFour) myOpenFours += a.shapes.openFour;
                    if (a.shapes.four) myFours += a.shapes.four;
                    if (a.shapes.openThree) myOpenThrees += a.shapes.openThree;
                } else if (board[r][c] === opponent) {
                    var b = G.analyzeLineShapes(board, r, c, opponent);
                    oppScore += b.score;
                    if (b.shapes.five) oppFives += b.shapes.five;
                    if (b.shapes.openFour) oppOpenFours += b.shapes.openFour;
                    if (b.shapes.four) oppFours += b.shapes.four;
                    if (b.shapes.openThree) oppOpenThrees += b.shapes.openThree;
                }
            }
        }

        var finalScore = myScore - oppScore * 1.1;
        if (myFives > 0) finalScore = SHAPE.FIVE;
        else if (oppFives > 0) finalScore = -SHAPE.FIVE;
        else if (myOpenFours >= 1) finalScore = Math.max(finalScore, SHAPE.OPEN_FOUR);
        else if (oppOpenFours >= 1) finalScore = Math.min(finalScore, -SHAPE.OPEN_FOUR);
        else if (myFours >= 2) finalScore = Math.max(finalScore, SHAPE.FOUR * 2);
        else if (oppFours >= 2) finalScore = Math.min(finalScore, -SHAPE.FOUR * 2);
        else if (myOpenThrees >= 2) finalScore = Math.max(finalScore, SHAPE.OPEN_THREE * 2);
        else if (oppOpenThrees >= 2) finalScore = Math.min(finalScore, -SHAPE.OPEN_THREE * 2);

        return finalScore;
    };

    function generateCandidates(board, ai, hu, topK) {
        var scored = [];
        var hasPiece = false;
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== 0) { hasPiece = true; break; }
            }
            if (hasPiece) break;
        }
        if (!hasPiece) return [{ row: 7, col: 7, score: 999999 }];

        var added = {};
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== 0) continue;
                var near = false;
                for (var dr = -2; dr <= 2; dr++) {
                    for (var dc = -2; dc <= 2; dc++) {
                        var nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== 0) {
                            near = true;
                            break;
                        }
                    }
                    if (near) break;
                }
                if (!near) continue;
                var b_ai = board.map(function(row) { return row.slice(); });
                b_ai[r][c] = ai;
                var sAi = G.analyzeLineShapes(b_ai, r, c, ai).score;
                var b_hu = board.map(function(row) { return row.slice(); });
                b_hu[r][c] = hu;
                var sHu = G.analyzeLineShapes(b_hu, r, c, hu).score;
                var key = r + ',' + c;
                if (!added[key]) {
                    added[key] = true;
                    scored.push({
                        row: r,
                        col: c,
                        score: sAi * 1.1 + sHu,
                        sAi: sAi,
                        sHu: sHu
                    });
                }
            }
        }
        scored.sort(function(a, b) { return b.score - a.score; });
        if (scored.length === 0) return [{ row: 7, col: 7, score: 0 }];
        if (topK && scored.length > topK) scored.length = topK;
        return scored;
    }

    function findMasterMove(board, ai, hu, forbidden) {
        var startTime = Date.now();
        var candidates = generateCandidates(board, ai, hu, 15);
        if (candidates.length === 0) return { row: 7, col: 7 };

        var i, j;
        for (i = 0; i < candidates.length; i++) {
            var mv = candidates[i];
            var b1 = board.map(function(r) { return r.slice(); });
            b1[mv.row][mv.col] = ai;
            if (G.checkWin(b1, mv.row, mv.col, ai)) {
                if (forbidden && ai === 1 && G.checkForbidden(mv.row, mv.col, b1).forbidden) continue;
                console.log('[Master] AI FIVE at', mv.row, mv.col);
                return { row: mv.row, col: mv.col };
            }
        }

        var blockList = [];
        for (i = 0; i < candidates.length; i++) {
            var mv = candidates[i];
            var b2 = board.map(function(r) { return r.slice(); });
            b2[mv.row][mv.col] = hu;
            if (G.checkWin(b2, mv.row, mv.col, hu)) blockList.push(mv);
        }
        if (blockList.length > 0) {
            for (i = 0; i < blockList.length; i++) {
                var blk = blockList[i];
                if (!forbidden || ai !== 1) return { row: blk.row, col: blk.col };
                var fbtest = board.map(function(r) { return r.slice(); });
                fbtest[blk.row][blk.col] = 1;
                if (!G.checkForbidden(blk.row, blk.col, fbtest).forbidden) return { row: blk.row, col: blk.col };
            }
            console.log('[Master] WARNING: all 5-block forbidden, losing!');
            return { row: blockList[0].row, col: blockList[0].col };
        }

        for (i = 0; i < candidates.length; i++) {
            var mv = candidates[i];
            var b3 = board.map(function(r) { return r.slice(); });
            b3[mv.row][mv.col] = ai;
            if (forbidden && ai === 1 && G.checkForbidden(mv.row, mv.col, b3).forbidden) continue;
            var openFourAfter = 0;
            var foursAfter = 0;
            var cand2 = generateCandidates(b3, ai, hu, 20);
            for (j = 0; j < cand2.length; j++) {
                var mv2 = cand2[j];
                var b32 = b3.map(function(r) { return r.slice(); });
                b32[mv2.row][mv2.col] = ai;
                if (forbidden && ai === 1 && G.checkForbidden(mv2.row, mv2.col, b32).forbidden) continue;
                var a = G.analyzeLineShapes(b32, mv2.row, mv2.col, ai);
                if (a.shapes.openFour >= 1 || a.shapes.five >= 1) openFourAfter++;
                if (a.shapes.four >= 1) foursAfter++;
                if (G.checkWin(b32, mv2.row, mv2.col, ai)) openFourAfter += 2;
            }
            if (openFourAfter >= 2) {
                console.log('[Master] VCF move (create 2x open-four threats) at', mv.row, mv.col);
                return { row: mv.row, col: mv.col };
            }
            if (foursAfter >= 3) {
                console.log('[Master] 3x four threat at', mv.row, mv.col);
                return { row: mv.row, col: mv.col };
            }
        }

        var oppThreats2 = [];
        for (i = 0; i < candidates.length; i++) {
            var mv = candidates[i];
            var b4 = board.map(function(r) { return r.slice(); });
            b4[mv.row][mv.col] = hu;
            var huAn = G.analyzeLineShapes(b4, mv.row, mv.col, hu);
            if (huAn.shapes.openFour >= 1) oppThreats2.push({ mv: mv, pri: 2 });
            else if (huAn.shapes.four >= 1) oppThreats2.push({ mv: mv, pri: 1 });
            else if (huAn.shapes.openThree >= 2) oppThreats2.push({ mv: mv, pri: 1 });
        }
        if (oppThreats2.length > 0) {
            oppThreats2.sort(function(a, b) { return b.pri - a.pri; });
            var topThreat = oppThreats2[0];
            if (topThreat.pri >= 2) {
                console.log('[Master] Blocking open-four threat at', topThreat.mv.row, topThreat.mv.col);
                if (!forbidden || ai !== 1) return { row: topThreat.mv.row, col: topThreat.mv.col };
                var fbt = board.map(function(r) { return r.slice(); });
                fbt[topThreat.mv.row][topThreat.mv.col] = 1;
                if (!G.checkForbidden(topThreat.mv.row, topThreat.mv.col, fbt).forbidden) {
                    return { row: topThreat.mv.row, col: topThreat.mv.col };
                }
            }
        }

        var topN = Math.min(10, candidates.length);
        var bestMove = null;
        var bestFinal = -Infinity;
        for (i = 0; i < topN; i++) {
            var mv = candidates[i];
            if (forbidden && ai === 1) {
                var bfb = board.map(function(r) { return r.slice(); });
                bfb[mv.row][mv.col] = 1;
                if (G.checkForbidden(mv.row, mv.col, bfb).forbidden) continue;
            }
            var b5 = board.map(function(r) { return r.slice(); });
            b5[mv.row][mv.col] = ai;
            if (G.checkWin(b5, mv.row, mv.col, ai)) {
                bestMove = mv;
                break;
            }
            var oppBestCand = generateCandidates(b5, hu, ai, 8);
            var oppBestScore = -Infinity;
            var oppBestMove = null;
            for (j = 0; j < oppBestCand.length; j++) {
                var omv = oppBestCand[j];
                var ob = b5.map(function(r) { return r.slice(); });
                ob[omv.row][omv.col] = hu;
                var hWin = G.checkWin(ob, omv.row, omv.col, hu);
                var ha = G.analyzeLineShapes(ob, omv.row, omv.col, hu);
                var hScore = ha.score + (hWin ? 1000000 : 0);
                if (hScore > oppBestScore) { oppBestScore = hScore; oppBestMove = omv; }
            }
            var myScore = G.analyzeLineShapes(b5, mv.row, mv.col, ai).score;
            var defScore = (oppBestMove ? G.analyzeLineShapes(board, oppBestMove.row, oppBestMove.col, hu).score : 0);
            var finalScore = myScore * 1.2 + defScore * 0.9 - oppBestScore * 1.0;
            var center = (BOARD_SIZE / 2 - Math.hypot(mv.row - BOARD_SIZE / 2, mv.col - BOARD_SIZE / 2));
            finalScore += center;
            if (finalScore > bestFinal) { bestFinal = finalScore; bestMove = mv; }
        }

        if (!bestMove) {
            var filtered0 = candidates.filter(function(m) {
                if (!forbidden || ai !== 1) return true;
                var fb = board.map(function(r) { return r.slice(); });
                fb[m.row][m.col] = 1;
                return !G.checkForbidden(m.row, m.col, fb).forbidden;
            });
            bestMove = filtered0.length > 0 ? filtered0[0] : candidates[0];
        }

        var elapsed = Date.now() - startTime;
        console.log('[Master] final=', bestMove.row, bestMove.col,
            'baseScore=', (bestMove.score | 0),
            'searchScore=', bestFinal ? bestFinal.toFixed(1) : '-',
            'time=', elapsed + 'ms');
        return { row: bestMove.row, col: bestMove.col };
    }

    self.onmessage = function(e) {
        var msg = e.data || {};
        var t0 = Date.now();
        try {
            var board = msg.board || [];
            if (!board || board.length !== BOARD_SIZE) {
                self.postMessage({ row: 7, col: 7, difficulty: msg.difficulty, elapsedMs: Date.now() - t0 });
                return;
            }

            var playerColor = msg.playerColor || 1;
            var ai = (playerColor === 1) ? 2 : 1;
            var hu = playerColor;
            var forbidden = !!msg.aiForbidden;
            var difficulty = msg.difficulty || 'easy';

            var move = null;
            if (difficulty === 'easy') move = findEasyMove(board, ai, hu, forbidden);
            else if (difficulty === 'medium') move = findMediumMove(board, ai, hu, forbidden);
            else if (difficulty === 'hard') move = findHardMove(board, ai, hu, forbidden);
            else move = findMasterMove(board, ai, hu, forbidden);

            if (!move) move = { row: 7, col: 7 };

            self.postMessage({
                row: move.row,
                col: move.col,
                difficulty: difficulty,
                elapsedMs: Date.now() - t0
            });
        } catch (err) {
            console.error('AI Worker error:', err);
            self.postMessage({
                row: 7, col: 7,
                difficulty: msg.difficulty || 'easy',
                elapsedMs: Date.now() - t0,
                error: err && err.message ? err.message : String(err)
            });
        }
    };

})();
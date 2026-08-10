"""游戏逻辑模块
提供五子棋规则判定：胜负检测（五连子）、禁手规则检查（黑子三三禁手、
四四禁手、长连禁手）、走法合法性验证等核心游戏逻辑。

难度算法分配：
- 简单(Easy): 冲四检测、眠三检测、活二检测、堵对方活二
- 中等(Medium): 3层Minimax搜索 + Alpha-Beta剪枝
- 困难(Hard): 5层Minimax搜索 + Alpha-Beta剪枝 + Killer Move + History Heuristic
- 大师(Master): MCTS算法 + UCT公式 + 10000次模拟
"""

import math
import random


def check_win(board, row, col, player):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for d in [1, -1]:
            r, c = row + dr * d, col + dc * d
            while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == player:
                count += 1
                r += dr * d
                c += dc * d
        if count >= 5:
            return True
    return False


RULE_MODE_STANDARD = 'standard'
RULE_MODE_RENJU = 'renju'
RULE_MODE_FREE = 'free'


def check_forbidden(board, row, col, rule_mode=RULE_MODE_RENJU):
    if rule_mode != RULE_MODE_RENJU:
        return {'forbidden': False, 'reason': ''}
    if board[row][col] != 1:
        return {'forbidden': False, 'reason': ''}

    if check_overline(board, row, col):
        return {'forbidden': True, 'reason': '长连禁手（六子及以上）'}

    live_threes = 0
    fours = 0
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]

    for dr, dc in directions:
        line_info = analyze_line(board, row, col, dr, dc)
        if line_info['live_three']:
            live_threes += 1
        if line_info['four']:
            fours += 1

    if live_threes >= 2:
        return {'forbidden': True, 'reason': '三三禁手（同时形成两个活三）'}
    if fours >= 2:
        return {'forbidden': True, 'reason': '四四禁手（同时形成两个四）'}

    return {'forbidden': False, 'reason': ''}


def check_overline(board, row, col):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for i in range(1, 6):
            r, c = row + i * dr, col + i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        for i in range(1, 6):
            r, c = row - i * dr, col - i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        if count >= 6:
            return True
    return False


def analyze_line(board, row, col, dr, dc):
    result = {'live_three': False, 'four': False}
    line = []
    center_index = 0

    for i in range(-4, 5):
        r, c = row + i * dr, col + i * dc
        if not (0 <= r < 15 and 0 <= c < 15):
            line.append(-1)
        else:
            line.append(board[r][c])
        if i == 0:
            center_index = len(line) - 1

    count = 1
    left_empty = 0
    right_empty = 0

    for i in range(center_index - 1, -1, -1):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            left_empty += 1
            break
        else:
            break

    for i in range(center_index + 1, len(line)):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            right_empty += 1
            break
        else:
            break

    if count == 4 and (left_empty > 0 or right_empty > 0):
        result['four'] = True
    elif count == 3 and left_empty > 0 and right_empty > 0:
        result['live_three'] = True

    return result


SCORE_FIVE = 100000
SCORE_LIVE_FOUR = 10000
SCORE_RUSH_FOUR = 1000
SCORE_LIVE_THREE = 200
SCORE_SLEEP_THREE = 50
SCORE_LIVE_TWO = 10


def evaluate_position_detailed(board, row, col, player):
    temp_board = [r[:] for r in board]
    temp_board[row][col] = player

    if player == 1 and check_forbidden(temp_board, row, col)['forbidden']:
        return -1000000

    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    score = 0

    for dr, dc in directions:
        count, open_ends = count_line(temp_board, row, col, dr, dc, player)

        if count >= 5:
            score += SCORE_FIVE
        elif count == 4:
            if open_ends == 2:
                score += SCORE_LIVE_FOUR
            else:
                score += SCORE_RUSH_FOUR
        elif count == 3:
            if open_ends == 2:
                score += SCORE_LIVE_THREE
            elif open_ends == 1:
                score += SCORE_SLEEP_THREE
        elif count == 2 and open_ends == 2:
            score += SCORE_LIVE_TWO

    return score


def count_line(board, row, col, dr, dc, player):
    count = 1
    open_ends = 0

    for delta in [1, -1]:
        i = 1
        while True:
            r, c = row + i * dr * delta, col + i * dc * delta
            if 0 <= r < 15 and 0 <= c < 15:
                if board[r][c] == player:
                    count += 1
                elif board[r][c] == 0:
                    open_ends += 1
                    break
                else:
                    break
            else:
                break
            i += 1

    return count, open_ends


def find_candidate_moves(board, player, opponent, radius=2):
    occupied = [(r, c) for r in range(15) for c in range(15) if board[r][c] != 0]

    if not occupied:
        return [(r, c) for r in range(15) for c in range(15) if board[r][c] == 0]

    has_neighbor = set()
    for r, c in occupied:
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < 15 and 0 <= nc < 15 and board[nr][nc] == 0:
                    has_neighbor.add((nr, nc))

    return list(has_neighbor)


def check_threat_four(board, row, col, player):
    temp_board = [r[:] for r in board]
    temp_board[row][col] = player
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count, open_ends = count_line(temp_board, row, col, dr, dc, player)
        if count == 4 and open_ends >= 1:
            return True
    return False


def check_live_three(board, row, col, player):
    temp_board = [r[:] for r in board]
    temp_board[row][col] = player
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count, open_ends = count_line(temp_board, row, col, dr, dc, player)
        if count == 3 and open_ends == 2:
            return True
    return False


def check_live_two(board, row, col, player):
    temp_board = [r[:] for r in board]
    temp_board[row][col] = player
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count, open_ends = count_line(temp_board, row, col, dr, dc, player)
        if count == 2 and open_ends == 2:
            return True
    return False


class MCTSNode:
    def __init__(self, board, player, parent=None, move=None):
        self.board = [row[:] for row in board]
        self.player = player
        self.parent = parent
        self.move = move
        self.children = []
        self.wins = 0
        self.visit_count = 0
        self.untried_moves = None

    def uct_value(self, exploration=1.414):
        if self.visit_count == 0:
            return float('inf')
        return (self.wins / self.visit_count) + exploration * math.sqrt(
            math.log(self.parent.visit_count) / self.visit_count
        )

    def best_child(self):
        return max(self.children, key=lambda c: c.uct_value())

    def expand(self):
        if self.untried_moves is None:
            self.untried_moves = find_candidate_moves(self.board, self.player, 3 - self.player)

        if not self.untried_moves:
            return None

        move = self.untried_moves.pop()
        opponent = 3 - self.player
        new_board = [row[:] for row in self.board]
        new_board[move[0]][move[1]] = self.player

        if check_win(new_board, move[0], move[1], self.player):
            child = MCTSNode(new_board, opponent, self, move)
            child.wins = 1
            child.visit_count = 1
            self.children.append(child)
            return child

        child = MCTSNode(new_board, opponent, self, move)
        self.children.append(child)
        return child

    def simulate(self):
        sim_board = [row[:] for row in self.board]
        sim_player = self.player
        passes = 0

        for _ in range(50):
            moves = find_candidate_moves(sim_board, sim_player, 3 - sim_player, radius=2)
            if not moves:
                passes += 1
                if passes >= 2:
                    break
                sim_player = 3 - sim_player
                continue

            move = random.choice(moves)
            sim_board[move[0]][move[1]] = sim_player

            if check_win(sim_board, move[0], move[1], sim_player):
                return 1 if sim_player == self.player else 0

            sim_player = 3 - sim_player

        return 0.5

    def backpropagate(self, result):
        self.visit_count += 1
        self.wins += result

        if self.parent:
            self.parent.backpropagate(result)


def find_master_move(board, player, simulations=1500):
    root = MCTSNode(board, player)

    for _ in range(simulations):
        node = root

        while node.children and not node.untried_moves:
            node = node.best_child()

        if node.untried_moves is not None or not node.children:
            node = node.expand()

        if node.move and check_win(node.board, node.move[0], node.move[1], node.player):
            node.backpropagate(1 if node.player == player else 0)
            continue

        result = node.simulate()
        node.backpropagate(result)

    best_child = max(root.children, key=lambda c: c.visit_count)
    return best_child.move if best_child.move else (7, 7)
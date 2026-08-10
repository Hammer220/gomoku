"""游戏路由模块
处理游戏相关请求：保存/加载游戏存档、获取存档列表等。

AI难度算法分配：
- easy: 冲四检测、眠三检测、活二检测、堵对方活二
- medium: 3层Minimax + Alpha-Beta剪枝
- hard: 5层Minimax + Alpha-Beta剪枝 + Killer Move + History Heuristic
- master: MCTS算法 + UCT公式 + 10000次模拟
"""

import math
import random

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..logger import logger
from ..models import get_all_users_from_db
from .auth_routes import calculate_rank

game_bp = Blueprint('game', __name__)


@game_bp.route('/api/leaderboard', methods=['GET'])
@require_auth
def leaderboard(user):
    try:
        users = get_all_users_from_db()
        leaderboard_data = []
        for username, user_data in users.items():
            leaderboard_data.append(
                {
                    'username': username,
                    'score': user_data.get('score', 0),
                    'rank': calculate_rank(user_data.get('score', 0)),
                    'wins': user_data.get('wins', 0),
                    'games': user_data.get('games', 0),
                    'joinDate': user_data.get('joinDate', ''),
                }
            )

        leaderboard_data.sort(key=lambda x: x['score'], reverse=True)
        return jsonify({'leaderboard': leaderboard_data[:50]})
    except Exception as e:  # noqa: BLE001
        logger.error(f'排行榜错误: {e!s}')
        return jsonify({'leaderboard': []})


@game_bp.route('/api/stats', methods=['GET'])
@require_auth
def stats(user):
    try:
        return jsonify(
            {
                'score': user.get('score', 0),
                'rank': calculate_rank(user.get('score', 0)),
                'wins': user.get('wins', 0),
                'games': user.get('games', 0),
                'username': user.get('username', ''),
                'joinDate': user.get('joinDate', ''),
                'lastLogin': user.get('lastLogin', ''),
            }
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'统计错误: {e!s}')
        return jsonify({'error': '获取统计信息失败'}), 500


@game_bp.route('/api/ai/move', methods=['POST'])
@require_auth
def ai_move(user):
    try:
        data = request.get_json()
        board = data.get('board', [])
        current_player = data.get('currentPlayer', 1)
        difficulty = data.get('difficulty', 'medium')

        if not board or len(board) != 15:
            return jsonify({'error': '无效的棋盘数据'}), 400

        ai_move_result = get_ai_move(board, current_player, difficulty)
        return jsonify(ai_move_result)
    except Exception as e:  # noqa: BLE001
        logger.error(f'AI移动错误: {e!s}')
        return jsonify({'error': 'AI计算失败'}), 500


def get_ai_move(board, current_player, difficulty='medium'):
    from ..game_logic import (
        check_forbidden,
        check_win,
        find_master_move,
    )

    player = 2 if current_player == 1 else 1
    opponent = 1 if current_player == 1 else 2

    for r in range(15):
        for c in range(15):
            if board[r][c] == 0:
                temp_board = [row[:] for row in board]
                temp_board[r][c] = player
                if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                    continue
                if check_win(temp_board, r, c, player):
                    return {'row': r, 'col': c}

    for r in range(15):
        for c in range(15):
            if board[r][c] == 0:
                temp_board = [row[:] for row in board]
                temp_board[r][c] = opponent
                if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                    continue
                if check_win(temp_board, r, c, opponent):
                    return {'row': r, 'col': c}

    if difficulty == 'easy':
        return find_easy_move(board, player, opponent)
    elif difficulty == 'medium':
        return find_medium_move(board, player, opponent)
    elif difficulty == 'hard':
        return find_hard_move(board, player, opponent)
    elif difficulty == 'master':
        move = find_master_move(board, player, simulations=5000)
        return {'row': move[0], 'col': move[1]}

    return find_medium_move(board, player, opponent)


def find_easy_move(board, player, opponent):
    from ..game_logic import (
        check_forbidden,
        check_live_three,
        check_live_two,
        check_threat_four,
        find_candidate_moves,
    )

    candidates = find_candidate_moves(board, player, opponent, radius=2)

    for r, c in candidates:
        if board[r][c] == 0:
            temp_board = [row[:] for row in board]
            temp_board[r][c] = player
            if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_threat_four(board, r, c, player):
                return {'row': r, 'col': c}

    for r, c in candidates:
        if board[r][c] == 0:
            temp_board = [row[:] for row in board]
            temp_board[r][c] = opponent
            if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_threat_four(board, r, c, opponent):
                return {'row': r, 'col': c}

    for r, c in candidates:
        if board[r][c] == 0:
            temp_board = [row[:] for row in board]
            temp_board[r][c] = opponent
            if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_live_three(board, r, c, opponent):
                return {'row': r, 'col': c}

    for r, c in candidates:
        if board[r][c] == 0:
            temp_board = [row[:] for row in board]
            temp_board[r][c] = opponent
            if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_live_two(board, r, c, opponent):
                return {'row': r, 'col': c}

    weights = []
    for pos in candidates:
        center_dist = math.hypot(pos[0] - 7, pos[1] - 7)
        weights.append(max(0, (7 - center_dist) / 10))

    total = sum(weights)
    if total > 0 and random.random() < 0.7:
        r = random.random() * total
        for i, w in enumerate(weights):
            r -= w
            if r <= 0:
                return {'row': candidates[i][0], 'col': candidates[i][1]}

    if candidates:
        pos = random.choice(candidates)
        return {'row': pos[0], 'col': pos[1]}

    return {'row': 7, 'col': 7}


def find_medium_move(board, player, opponent):
    from ..game_logic import check_forbidden, find_candidate_moves

    best = None
    best_score = -float('inf')

    candidates = find_candidate_moves(board, player, opponent, radius=3)

    for r, c in candidates:
        if board[r][c] != 0:
            continue
        temp_board = [row[:] for row in board]
        temp_board[r][c] = player
        if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
            continue

        score = minimax(temp_board, 2, -float('inf'), float('inf'), False, player, opponent)
        if score > best_score:
            best_score = score
            best = (r, c)

    if best:
        return {'row': best[0], 'col': best[1]}

    candidates = [(r, c) for r in range(15) for c in range(15) if board[r][c] == 0]
    if candidates:
        pos = random.choice(candidates)
        return {'row': pos[0], 'col': pos[1]}

    return {'row': 7, 'col': 7}


def find_hard_move(board, player, opponent):
    from ..game_logic import check_forbidden, find_candidate_moves

    global killer_moves, history_heuristic
    killer_moves = {}
    history_heuristic = {}

    best = None
    best_score = -float('inf')

    candidates = find_candidate_moves(board, player, opponent, radius=4)

    candidates.sort(
        key=lambda pos: (
            pos in killer_moves.get((player, 0), []) and 1000 or 0,
            history_heuristic.get((pos[0], pos[1]), 0),
        ),
        reverse=True,
    )
    # 限制顶层搜索规模，避免空棋盘上候选过多导致搜索爆炸
    candidates = candidates[:20]

    for r, c in candidates:
        if board[r][c] != 0:
            continue
        temp_board = [row[:] for row in board]
        temp_board[r][c] = player
        if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
            continue

        score = minimax_with_heuristics(temp_board, 4, -float('inf'), float('inf'), False, player, opponent)
        if score > best_score:
            best_score = score
            best = (r, c)

    if best:
        return {'row': best[0], 'col': best[1]}

    candidates = [(r, c) for r in range(15) for c in range(15) if board[r][c] == 0]
    if candidates:
        pos = random.choice(candidates)
        return {'row': pos[0], 'col': pos[1]}

    return {'row': 7, 'col': 7}


killer_moves: dict = {}
history_heuristic: dict = {}


def minimax(board, depth, alpha, beta, maximizing, player, opponent):
    from ..game_logic import check_forbidden, check_win, find_candidate_moves

    if depth == 0:
        return evaluate_position_simple(board, player) - evaluate_position_simple(board, opponent) * 0.9

    candidates = find_candidate_moves(
        board, player if maximizing else opponent, opponent if maximizing else player, radius=2
    )

    if not candidates:
        return evaluate_position_simple(board, player)

    if maximizing:
        max_eval = -float('inf')
        for r, c in candidates:
            if board[r][c] != 0:
                continue
            temp_board = [row[:] for row in board]
            temp_board[r][c] = player
            if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_win(temp_board, r, c, player):
                return 1000000
            eval_score = minimax(temp_board, depth - 1, alpha, beta, False, player, opponent)
            max_eval = max(max_eval, eval_score)
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                break
        return max_eval
    else:
        min_eval = float('inf')
        for r, c in candidates:
            if board[r][c] != 0:
                continue
            temp_board = [row[:] for row in board]
            temp_board[r][c] = opponent
            if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_win(temp_board, r, c, opponent):
                return -1000000
            eval_score = minimax(temp_board, depth - 1, alpha, beta, True, player, opponent)
            min_eval = min(min_eval, eval_score)
            beta = min(beta, eval_score)
            if beta <= alpha:
                break
        return min_eval


def minimax_with_heuristics(board, depth, alpha, beta, maximizing, player, opponent):
    from ..game_logic import check_forbidden, check_win, find_candidate_moves

    if depth == 0:
        return evaluate_position_simple(board, player) - evaluate_position_simple(board, opponent) * 0.9

    candidates = find_candidate_moves(
        board, player if maximizing else opponent, opponent if maximizing else player, radius=3
    )

    if not candidates:
        return evaluate_position_simple(board, player)

    current_player = player if maximizing else opponent
    depth_key = (current_player, depth)

    killer_moves.setdefault(depth_key, [])

    candidates.sort(
        key=lambda pos: (
            pos in killer_moves.get(depth_key, []),
            history_heuristic.get((pos[0], pos[1], current_player), 0),
        ),
        reverse=True,
    )
    # 限制每层搜索宽度，保证 hard 难度响应时间
    candidates = candidates[:16]

    if maximizing:
        max_eval = -float('inf')
        for r, c in candidates:
            if board[r][c] != 0:
                continue
            temp_board = [row[:] for row in board]
            temp_board[r][c] = player
            if player == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_win(temp_board, r, c, player):
                killer_moves.setdefault(depth_key, []).insert(0, (r, c))
                history_heuristic[(r, c, player)] = history_heuristic.get((r, c, player), 0) + depth * depth
                return 1000000
            eval_score = minimax_with_heuristics(temp_board, depth - 1, alpha, beta, False, player, opponent)
            max_eval = max(max_eval, eval_score)
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                history_heuristic[(r, c, player)] = history_heuristic.get((r, c, player), 0) + depth * depth
                killer_moves.setdefault(depth_key, []).insert(0, (r, c))
                break
        return max_eval
    else:
        min_eval = float('inf')
        for r, c in candidates:
            if board[r][c] != 0:
                continue
            temp_board = [row[:] for row in board]
            temp_board[r][c] = opponent
            if opponent == 1 and check_forbidden(temp_board, r, c)['forbidden']:
                continue
            if check_win(temp_board, r, c, opponent):
                killer_moves.setdefault(depth_key, []).insert(0, (r, c))
                history_heuristic[(r, c, opponent)] = history_heuristic.get((r, c, opponent), 0) + depth * depth
                return -1000000
            eval_score = minimax_with_heuristics(temp_board, depth - 1, alpha, beta, True, player, opponent)
            min_eval = min(min_eval, eval_score)
            beta = min(beta, eval_score)
            if beta <= alpha:
                history_heuristic[(r, c, opponent)] = history_heuristic.get((r, c, opponent), 0) + depth * depth
                killer_moves.setdefault(depth_key, []).insert(0, (r, c))
                break
        return min_eval


def evaluate_position_simple(board, player):
    score = 0
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for r in range(15):
        for c in range(15):
            if board[r][c] == player:
                for dr, dc in directions:
                    count, open_ends = count_line_simple(board, r, c, dr, dc, player)
                    if count >= 5:
                        score += 100000
                    elif count == 4:
                        score += 10000 if open_ends == 2 else 1000
                    elif count == 3:
                        score += 200 if open_ends == 2 else 50
                    elif count == 2:
                        score += 10 if open_ends == 2 else 0
    return score


def count_line_simple(board, row, col, dr, dc, player):
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


def evaluate_position(board, row, col, player, opponent):
    from ..game_logic import (
        SCORE_FIVE,
        SCORE_LIVE_FOUR,
        SCORE_LIVE_THREE,
        SCORE_LIVE_TWO,
        SCORE_RUSH_FOUR,
        SCORE_SLEEP_THREE,
        count_line,
    )

    temp_board = [r[:] for r in board]
    temp_board[row][col] = player
    from ..game_logic import check_forbidden

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
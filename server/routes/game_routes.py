"""游戏路由模块
处理游戏相关请求：保存/加载游戏存档、获取存档列表等。
"""

import re
from flask import Blueprint, request, jsonify

from ..models import load_json_with_lock, USERS_FILE
from ..auth import require_auth
from ..logger import logger

game_bp = Blueprint('game', __name__)

@game_bp.route('/api/leaderboard', methods=['GET'])
@require_auth
def leaderboard(user):
    try:
        users = load_json_with_lock(USERS_FILE)
        leaderboard_data = []
        for username, user_data in users.items():
            leaderboard_data.append({
                'username': username,
                'score': user_data.get('score', 0),
                'wins': user_data.get('wins', 0),
                'games': user_data.get('games', 0),
                'joinDate': user_data.get('joinDate', '')
            })

        leaderboard_data.sort(key=lambda x: x['score'], reverse=True)
        return jsonify({'leaderboard': leaderboard_data[:50]})
    except Exception as e:
        logger.error(f'排行榜错误: {str(e)}')
        return jsonify({'leaderboard': []})

@game_bp.route('/api/stats', methods=['GET'])
@require_auth
def stats(user):
    try:
        return jsonify({
            'score': user.get('score', 0),
            'wins': user.get('wins', 0),
            'games': user.get('games', 0),
            'username': user.get('username', ''),
            'joinDate': user.get('joinDate', ''),
            'lastLogin': user.get('lastLogin', '')
        })
    except Exception as e:
        logger.error(f'统计错误: {str(e)}')
        return jsonify({'error': '获取统计信息失败'}), 500

@game_bp.route('/api/ai/move', methods=['POST'])
@require_auth
def ai_move(user):
    try:
        data = request.get_json()
        board = data.get('board', [])
        current_player = data.get('currentPlayer', 1)

        if not board or len(board) != 15:
            return jsonify({'error': '无效的棋盘数据'}), 400

        ai_move_result = get_ai_move(board, current_player)
        return jsonify(ai_move_result)
    except Exception as e:
        logger.error(f'AI移动错误: {str(e)}')
        return jsonify({'error': 'AI计算失败'}), 500

def get_ai_move(board, current_player):
    from ..game_logic import check_win, check_forbidden

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

    import random
    center = 7
    radius = 3

    for dist in range(radius + 1):
        for r in range(center - dist, center + dist + 1):
            for c in range(center - dist, center + dist + 1):
                if 0 <= r < 15 and 0 <= c < 15:
                    if board[r][c] == 0:
                        score = evaluate_position(board, r, c, player, opponent)
                        if score > 0:
                            return {'row': r, 'col': c}

    empty_cells = [(r, c) for r in range(15) for c in range(15) if board[r][c] == 0]
    if empty_cells:
        r, c = random.choice(empty_cells)
        return {'row': r, 'col': c}

    return {'row': 7, 'col': 7}

def evaluate_position(board, row, col, player, opponent):
    temp_board = [r[:] for r in board]
    temp_board[row][col] = player
    from ..game_logic import check_forbidden

    if player == 1 and check_forbidden(temp_board, row, col)['forbidden']:
        return -1

    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    score = 0

    for dr, dc in directions:
        count = 1
        open_ends = 0

        for delta in [1, -1]:
            i = 1
            while True:
                r, c = row + i * dr * delta, col + i * dc * delta
                if 0 <= r < 15 and 0 <= c < 15:
                    if temp_board[r][c] == player:
                        count += 1
                    elif temp_board[r][c] == 0:
                        open_ends += 1
                        break
                    else:
                        break
                else:
                    break
                i += 1

        if count >= 5:
            score += 1000
        elif count == 4 and open_ends >= 2:
            score += 500
        elif count == 4 and open_ends >= 1:
            score += 200
        elif count == 3 and open_ends >= 2:
            score += 100
        elif count == 3 and open_ends >= 1:
            score += 50
        elif count == 2 and open_ends >= 2:
            score += 20
        elif count == 2 and open_ends >= 1:
            score += 10

    return score
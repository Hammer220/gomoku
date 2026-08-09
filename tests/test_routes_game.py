"""游戏路由模块测试
测试范围：排行榜、统计、AI 移动、AI 算法辅助函数
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.game_routes import (
    count_line_simple,
    evaluate_position,
    evaluate_position_simple,
    game_bp,
    get_ai_move,
    minimax,
    minimax_with_heuristics,
)


class TestGameBlueprint:
    """game_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert game_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert game_bp.name == 'game'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(game_bp.deferred_functions)) > 0


class TestGameRoutesImport:
    """路由函数导入测试"""

    def test_leaderboard_exists(self):
        """leaderboard 函数存在"""
        from server.routes.game_routes import leaderboard
        assert callable(leaderboard)

    def test_stats_exists(self):
        """stats 函数存在"""
        from server.routes.game_routes import stats
        assert callable(stats)

    def test_ai_move_exists(self):
        """ai_move 函数存在"""
        from server.routes.game_routes import ai_move
        assert callable(ai_move)


class TestGameRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_leaderboard_requires_auth(self):
        """GET /api/leaderboard 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/leaderboard')
            assert response.status_code in (401, 302)

    def test_stats_requires_auth(self):
        """GET /api/stats 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/stats')
            assert response.status_code in (401, 302)

    def test_ai_move_requires_auth(self):
        """POST /api/ai/move 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/ai/move',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_ai_move_invalid_board(self):
        """POST /api/ai/move 无效棋盘返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/ai/move',
                data=json.dumps({'board': 'invalid'}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)


class TestCountLineSimple:
    """count_line_simple 函数测试"""

    def test_empty_board(self):
        """空棋盘计数"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        count, open_ends = count_line_simple(board, 7, 7, 1, 0, 1)
        assert count == 1

    def test_two_in_a_row(self):
        """两个连续棋子"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        board[7][8] = 1
        count, open_ends = count_line_simple(board, 7, 7, 0, 1, 1)
        assert count == 2

    def test_blocked_by_opponent(self):
        """被对手阻挡"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        board[7][8] = 2
        count, open_ends = count_line_simple(board, 7, 7, 0, 1, 1)
        assert count == 1

    def test_at_board_edge(self):
        """棋盘边缘"""
        board = [[0] * 15 for _ in range(15)]
        board[0][0] = 1
        board[0][1] = 1
        count, open_ends = count_line_simple(board, 0, 0, 0, 1, 1)
        assert count == 2

    def test_returns_tuple(self):
        """返回 (count, open_ends) 元组"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = count_line_simple(board, 7, 7, 1, 0, 1)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], int)
        assert isinstance(result[1], int)


class TestEvaluatePositionSimple:
    """evaluate_position_simple 函数测试"""

    def test_empty_board_score(self):
        """空棋盘分数"""
        board = [[0] * 15 for _ in range(15)]
        score = evaluate_position_simple(board, 1)
        assert score == 0

    def test_single_stone_score(self):
        """单个棋子分数"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        score = evaluate_position_simple(board, 1)
        assert score >= 0

    def test_five_in_a_row_score(self):
        """五连分数"""
        board = [[0] * 15 for _ in range(15)]
        for i in range(5):
            board[7][i] = 1
        score = evaluate_position_simple(board, 1)
        assert score >= 100000

    def test_returns_int(self):
        """返回整数"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        score = evaluate_position_simple(board, 1)
        assert isinstance(score, int)


class TestEvaluatePosition:
    """evaluate_position 函数测试"""

    def test_empty_placement(self):
        """空位落子评估"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        score = evaluate_position(board, 7, 8, 1, 2)
        assert isinstance(score, int)

    def test_winning_move(self):
        """获胜落子评估"""
        board = [[0] * 15 for _ in range(15)]
        for i in range(4):
            board[7][i] = 1
        score = evaluate_position(board, 7, 4, 1, 2)
        assert score >= 100000

    def test_returns_int(self):
        """返回整数"""
        board = [[0] * 15 for _ in range(15)]
        score = evaluate_position(board, 7, 7, 1, 2)
        assert isinstance(score, int)


class TestGetAIMove:
    """get_ai_move 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(get_ai_move)

    def test_returns_dict(self):
        """返回字典格式"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        board[7][8] = 2
        result = get_ai_move(board, 1, 'medium')
        assert isinstance(result, dict)
        assert 'row' in result
        assert 'col' in result

    def test_row_col_in_range(self):
        """row 和 col 在有效范围内"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = get_ai_move(board, 1, 'medium')
        assert 0 <= result['row'] < 15
        assert 0 <= result['col'] < 15

    def test_valid_move(self):
        """落子位置为空"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = get_ai_move(board, 1, 'medium')
        assert board[result['row']][result['col']] == 0

    def test_easy_difficulty(self):
        """easy 难度"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = get_ai_move(board, 1, 'easy')
        assert 'row' in result
        assert 'col' in result

    def test_hard_difficulty(self):
        """hard 难度"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = get_ai_move(board, 1, 'hard')
        assert 'row' in result
        assert 'col' in result

    def test_master_difficulty(self):
        """master 难度"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        result = get_ai_move(board, 1, 'master')
        assert 'row' in result
        assert 'col' in result

    def test_block_opponent_win(self):
        """阻挡对手获胜"""
        board = [[0] * 15 for _ in range(15)]
        for i in range(4):
            board[7][i] = 2
        result = get_ai_move(board, 1, 'medium')
        assert result['row'] == 7
        assert result['col'] == 4

    def test_take_winning_move(self):
        """优先获胜"""
        board = [[0] * 15 for _ in range(15)]
        for i in range(4):
            board[7][i] = 1
        result = get_ai_move(board, 1, 'medium')
        assert result['row'] == 7
        assert result['col'] == 4


class TestMinimax:
    """minimax 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(minimax)

    def test_returns_number(self):
        """返回数值"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        board[7][8] = 2
        score = minimax(board, 1, -float('inf'), float('inf'), True, 1, 2)
        assert isinstance(score, (int, float))

    def test_depth_zero(self):
        """深度为0时返回评估值"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        score = minimax(board, 0, -float('inf'), float('inf'), True, 1, 2)
        assert isinstance(score, (int, float))


class TestMinimaxWithHeuristics:
    """minimax_with_heuristics 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(minimax_with_heuristics)

    def test_returns_number(self):
        """返回数值"""
        board = [[0] * 15 for _ in range(15)]
        board[7][7] = 1
        board[7][8] = 2
        score = minimax_with_heuristics(board, 1, -float('inf'), float('inf'), True, 1, 2)
        assert isinstance(score, (int, float))


class TestAIHelperFunctions:
    """AI 辅助函数导入测试"""

    def test_find_easy_move_exists(self):
        """find_easy_move 存在"""
        from server.routes.game_routes import find_easy_move
        assert callable(find_easy_move)

    def test_find_medium_move_exists(self):
        """find_medium_move 存在"""
        from server.routes.game_routes import find_medium_move
        assert callable(find_medium_move)

    def test_find_hard_move_exists(self):
        """find_hard_move 存在"""
        from server.routes.game_routes import find_hard_move
        assert callable(find_hard_move)
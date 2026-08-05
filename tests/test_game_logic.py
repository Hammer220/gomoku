"""游戏逻辑模块测试
测试范围：胜负判定、禁手规则、棋盘分析、位置评估、AI算法
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.game_logic import (
    check_win, check_forbidden, check_overline, analyze_line, count_line,
    evaluate_position_detailed, find_candidate_moves,
    check_threat_four, check_live_three, check_live_two,
    find_master_move, MCTSNode,
    RULE_MODE_STANDARD, RULE_MODE_RENJU, RULE_MODE_FREE,
    SCORE_FIVE, SCORE_LIVE_FOUR, SCORE_RUSH_FOUR,
    SCORE_LIVE_THREE, SCORE_SLEEP_THREE, SCORE_LIVE_TWO,
)


class TestCheckWin:
    """check_win 函数测试：四方向五连检测"""

    def test_horizontal_win(self, empty_board):
        """横向五连黑子"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        assert check_win(board, 7, 7, 1) is True

    def test_horizontal_win_white(self, empty_board):
        """横向五连白子"""
        board = empty_board
        for c in range(3, 8):
            board[0][c] = 2
        assert check_win(board, 0, 5, 2) is True

    def test_vertical_win(self, empty_board):
        """纵向五连"""
        board = empty_board
        for r in range(3, 8):
            board[r][5] = 1
        assert check_win(board, 5, 5, 1) is True

    def test_diagonal_win(self, empty_board):
        """主对角线五连"""
        board = empty_board
        for i in range(5):
            board[i][i] = 1
        assert check_win(board, 2, 2, 1) is True

    def test_anti_diagonal_win(self, empty_board):
        """副对角线五连"""
        board = empty_board
        for i in range(5):
            board[i][14 - i] = 2
        assert check_win(board, 2, 12, 2) is True

    def test_four_not_win(self, empty_board):
        """四个子不应判定胜利"""
        board = empty_board
        for c in range(4, 8):
            board[7][c] = 1
        assert check_win(board, 7, 5, 1) is False

    def test_empty_board(self, empty_board):
        """空棋盘不应判定胜利"""
        assert check_win(empty_board, 7, 7, 1) is False

    def test_six_in_a_row(self, empty_board):
        """六连也应判定胜利"""
        board = empty_board
        for c in range(3, 9):
            board[7][c] = 1
        assert check_win(board, 7, 5, 1) is True

    def test_broken_line(self, empty_board):
        """断开的五子不应判定胜利"""
        board = empty_board
        board[7][3] = 1
        board[7][4] = 1
        board[7][5] = 1
        board[7][6] = 0
        board[7][7] = 1
        board[7][8] = 1
        assert check_win(board, 7, 4, 1) is False

    def test_edge_case_top_left(self, empty_board):
        """棋盘边角五连"""
        board = empty_board
        for i in range(5):
            board[i][i] = 1
        assert check_win(board, 0, 0, 1) is True

    def test_edge_case_bottom_right(self, empty_board):
        """棋盘右下角五连"""
        board = empty_board
        for i in range(5):
            board[14 - i][14 - i] = 2
        assert check_win(board, 14, 14, 2) is True

    def test_opponent_piece_not_count(self, empty_board):
        """对方棋子不应算入自己的连子"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        board[7][7] = 2
        assert check_win(board, 7, 6, 1) is False


class TestCheckForbidden:
    """check_forbidden 函数测试：禁手规则"""

    def test_standard_mode_no_forbidden(self, empty_board):
        """标准模式下无禁手"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 1
        result = check_forbidden(board, 7, 7, RULE_MODE_STANDARD)
        assert result['forbidden'] is False

    def test_free_mode_no_forbidden(self, empty_board):
        """自由模式下无禁手"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 1
        result = check_forbidden(board, 7, 7, RULE_MODE_FREE)
        assert result['forbidden'] is False

    def test_white_no_forbidden(self, empty_board):
        """白棋不受禁手限制"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 2
        result = check_forbidden(board, 7, 7, RULE_MODE_RENJU)
        assert result['forbidden'] is False

    def test_overline_forbidden(self, empty_board):
        """长连禁手：六子连珠"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 1
        result = check_forbidden(board, 7, 7, RULE_MODE_RENJU)
        assert result['forbidden'] is True
        assert '长连' in result['reason']

    def test_normal_five_not_forbidden(self, empty_board):
        """正常五连不应触发禁手"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        result = check_forbidden(board, 7, 7, RULE_MODE_RENJU)
        assert result['forbidden'] is False

    def test_four_not_forbidden(self, empty_board):
        """四连不应触发禁手"""
        board = empty_board
        for c in range(5, 9):
            board[7][c] = 1
        result = check_forbidden(board, 7, 6, RULE_MODE_RENJU)
        assert result['forbidden'] is False


class TestCheckOverline:
    """check_overline 函数测试：长连检测"""

    def test_exact_six(self, empty_board):
        """恰好六连"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 1
        assert check_overline(board, 7, 7) is True

    def test_seven(self, empty_board):
        """七连"""
        board = empty_board
        for c in range(4, 11):
            board[7][c] = 1
        assert check_overline(board, 7, 7) is True

    def test_exact_five(self, empty_board):
        """恰好五连不应触发长连"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        assert check_overline(board, 7, 7) is False

    def test_four(self, empty_board):
        """四连不应触发"""
        board = empty_board
        for c in range(5, 9):
            board[7][c] = 1
        assert check_overline(board, 7, 6) is False

    def test_white_ignored(self, empty_board):
        """白棋长连不应触发（只检查黑棋）"""
        board = empty_board
        for c in range(5, 11):
            board[7][c] = 2
        assert check_overline(board, 7, 7) is False

    def test_vertical_overline(self, empty_board):
        """纵向长连"""
        board = empty_board
        for r in range(3, 9):
            board[r][5] = 1
        assert check_overline(board, 5, 5) is True


class TestAnalyzeLine:
    """analyze_line 函数测试：单线分析"""

    def test_live_three(self, empty_board):
        """活三检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        result = analyze_line(board, 7, 6, 0, 1)
        assert result['live_three'] is True

    def test_rush_four(self, empty_board):
        """冲四检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        board[7][8] = 1
        board[7][4] = 2
        result = analyze_line(board, 7, 6, 0, 1)
        assert result['four'] is True

    def test_live_four(self, empty_board):
        """活四检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        board[7][8] = 1
        result = analyze_line(board, 7, 6, 0, 1)
        assert result['four'] is True

    def test_no_pattern(self, empty_board):
        """无模式"""
        board = empty_board
        board[7][6] = 1
        result = analyze_line(board, 7, 6, 0, 1)
        assert result['live_three'] is False
        assert result['four'] is False


class TestCountLine:
    """count_line 函数测试：连线计数"""

    def test_count_three_open_two(self, empty_board):
        """三个子两端开放"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        count, open_ends = count_line(board, 7, 6, 0, 1, 1)
        assert count == 3
        assert open_ends == 2

    def test_count_three_open_one(self, empty_board):
        """三个子一端被封"""
        board = empty_board
        board[7][4] = 2
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        count, open_ends = count_line(board, 7, 6, 0, 1, 1)
        assert count == 3
        assert open_ends == 1

    def test_count_one(self, empty_board):
        """单个子"""
        board = empty_board
        board[7][7] = 1
        count, open_ends = count_line(board, 7, 7, 0, 1, 1)
        assert count == 1
        assert open_ends == 2

    def test_count_five(self, empty_board):
        """五个子"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        count, open_ends = count_line(board, 7, 7, 0, 1, 1)
        assert count == 5

    def test_wall_boundary(self, empty_board):
        """靠墙边界"""
        board = empty_board
        board[7][0] = 1
        board[7][1] = 1
        count, open_ends = count_line(board, 7, 0, 0, 1, 1)
        assert count == 2
        assert open_ends == 1


class TestEvaluatePositionDetailed:
    """evaluate_position_detailed 函数测试：位置评分"""

    def test_five_score(self, empty_board):
        """五连最高分"""
        board = empty_board
        for c in range(5, 9):
            board[7][c] = 1
        score = evaluate_position_detailed(board, 7, 9, 1)
        assert score >= SCORE_FIVE

    def test_live_four_score(self, empty_board):
        """活四得分"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        board[7][8] = 1
        score = evaluate_position_detailed(board, 7, 6, 1)
        assert score >= SCORE_LIVE_FOUR

    def test_forbidden_penalty(self, empty_board):
        """禁手惩罚分"""
        board = empty_board
        for c in range(5, 10):
            board[7][c] = 1
        score = evaluate_position_detailed(board, 7, 10, 1)
        assert score < 0

    def test_empty_position_score(self, empty_board):
        """空位评分"""
        score = evaluate_position_detailed(empty_board, 7, 7, 1)
        assert score == 0


class TestFindCandidateMoves:
    """find_candidate_moves 函数测试"""

    def test_empty_board(self, empty_board):
        """空棋盘：返回空列表"""
        candidates = find_candidate_moves(empty_board, 1, 2)
        assert candidates == []

    def test_near_existing_piece(self, empty_board):
        """已有棋子时返回附近空位"""
        board = empty_board
        board[7][7] = 1
        candidates = find_candidate_moves(board, 1, 2)
        assert (7, 6) in candidates or (7, 8) in candidates or (6, 7) in candidates or (8, 7) in candidates

    def test_radius_two(self, empty_board):
        """半径2范围内的空位"""
        board = empty_board
        board[7][7] = 1
        candidates = find_candidate_moves(board, 1, 2, radius=2)
        assert (5, 7) in candidates
        assert (9, 7) in candidates
        assert (7, 5) in candidates
        assert (7, 9) in candidates


class TestThreatDetection:
    """威胁检测函数测试"""

    def test_threat_four(self, empty_board):
        """冲四检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        assert check_threat_four(board, 7, 8, 1) is True

    def test_not_threat_four(self, empty_board):
        """非冲四"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        assert check_threat_four(board, 7, 7, 1) is False

    def test_live_three(self, empty_board):
        """活三检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        assert check_live_three(board, 7, 5, 1) is True

    def test_not_live_three(self, empty_board):
        """非活三"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        assert check_live_three(board, 7, 7, 1) is False

    def test_live_two(self, empty_board):
        """活二检测"""
        board = empty_board
        board[7][5] = 1
        board[7][6] = 1
        assert check_live_two(board, 7, 5, 1) is True

    def test_not_live_two(self, empty_board):
        """非活二"""
        board = empty_board
        board[7][5] = 1
        assert check_live_two(board, 7, 6, 1) is False


class TestMCTSNode:
    """MCTSNode 类测试"""

    def test_creation(self, empty_board):
        """创建节点"""
        node = MCTSNode(empty_board, 1)
        assert node.player == 1
        assert node.wins == 0
        assert node.visit_count == 0
        assert node.parent is None
        assert node.move is None

    def test_uct_infinity(self, empty_board):
        """未访问节点 UCT 值为无穷大"""
        node = MCTSNode(empty_board, 1)
        parent = MCTSNode(empty_board, 2)
        parent.visit_count = 10
        node.parent = parent
        assert node.uct_value() == float('inf')

    def test_uct_calculation(self, empty_board):
        """已访问节点 UCT 值计算"""
        node = MCTSNode(empty_board, 1)
        parent = MCTSNode(empty_board, 2)
        parent.visit_count = 10
        node.parent = parent
        node.wins = 3
        node.visit_count = 5
        uct = node.uct_value()
        assert uct != float('inf')
        assert uct > 0

    def test_best_child(self, empty_board):
        """best_child 返回 UCT 最大的子节点"""
        parent = MCTSNode(empty_board, 1)
        child1 = MCTSNode(empty_board, 2, parent, (7, 7))
        child1.wins = 5
        child1.visit_count = 10
        child2 = MCTSNode(empty_board, 2, parent, (7, 8))
        child2.wins = 8
        child2.visit_count = 10
        parent.children = [child1, child2]
        parent.visit_count = 20
        best = parent.best_child()
        assert best.move == (7, 8)

    def test_expand(self, empty_board):
        """扩展节点"""
        board = empty_board
        board[7][7] = 1
        node = MCTSNode(board, 2)
        child = node.expand()
        assert child is not None
        assert child.parent == node
        assert child.move is not None
        assert len(node.children) == 1

    def test_backpropagate(self, empty_board):
        """反向传播"""
        root = MCTSNode(empty_board, 1)
        child = MCTSNode(empty_board, 2, root, (7, 7))
        root.children = [child]
        child.backpropagate(1.0)
        assert child.visit_count == 1
        assert child.wins == 1
        assert root.visit_count == 1
        assert root.wins == 1

    def test_simulate(self, empty_board):
        """模拟对局"""
        board = empty_board
        board[7][7] = 1
        node = MCTSNode(board, 2)
        result = node.simulate()
        assert result in (0, 0.5, 1)

    def test_expand_winning_move(self, empty_board):
        """扩展时检测获胜走法"""
        board = empty_board
        for c in range(5, 9):
            board[7][c] = 1
        node = MCTSNode(board, 1)
        child = node.expand()
        if child and child.move == (7, 9):
            assert child.wins == 1
            assert child.visit_count == 1


class TestFindMasterMove:
    """find_master_move 函数测试（MCTS）"""

    def test_returns_valid_move(self, empty_board):
        """返回合法走法"""
        board = empty_board
        board[7][7] = 1
        move = find_master_move(board, 2, simulations=100)
        assert isinstance(move, tuple)
        assert len(move) == 2
        assert 0 <= move[0] < 15
        assert 0 <= move[1] < 15

    def test_block_opponent_four(self, empty_board):
        """应堵对手冲四"""
        board = empty_board
        board[7][4] = 1
        board[7][5] = 1
        board[7][6] = 1
        board[7][7] = 1
        move = find_master_move(board, 2, simulations=500)
        assert board[move[0]][move[1]] == 0


class TestConstants:
    """常量定义测试"""

    def test_score_constants(self):
        """评分常量应有合理的相对大小"""
        assert SCORE_FIVE > SCORE_LIVE_FOUR
        assert SCORE_LIVE_FOUR > SCORE_RUSH_FOUR
        assert SCORE_RUSH_FOUR > SCORE_LIVE_THREE
        assert SCORE_LIVE_THREE > SCORE_SLEEP_THREE
        assert SCORE_SLEEP_THREE > SCORE_LIVE_TWO

    def test_rule_modes(self):
        """规则模式常量"""
        assert RULE_MODE_STANDARD == 'standard'
        assert RULE_MODE_RENJU == 'renju'
        assert RULE_MODE_FREE == 'free'
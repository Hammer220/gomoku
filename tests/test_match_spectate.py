"""观战模块测试
测试范围：获取可观看对局列表、开始观战、离开观战、观战状态轮询
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.match import (
    active_matches,
    active_matches_lock,
    create_match,
    get_spectatable_matches,
    get_spectate_status,
    join_match,
    leave_spectate,
    spectate_match,
)


@pytest.fixture(autouse=True)
def clean_matches():
    """每个测试前后清理全局对局状态"""
    with active_matches_lock:
        active_matches.clear()
    yield
    with active_matches_lock:
        active_matches.clear()


class TestGetSpectatableMatches:
    """get_spectatable_matches 函数测试"""

    def test_empty_list(self):
        """空列表：无对局时返回空列表"""
        result = get_spectatable_matches()
        assert 'matches' in result
        assert result['matches'] == []

    def test_no_playing_matches(self, sample_user):
        """无进行中对局：等待中的不返回"""
        match_id, _ = create_match(sample_user)
        result = get_spectatable_matches()
        assert len(result['matches']) == 0

    def test_playing_matches(self, sample_user, admin_user):
        """进行中的对局出现在列表中"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result = get_spectatable_matches()
        assert len(result['matches']) >= 1
        ids = [m['id'] for m in result['matches']]
        assert match_id in ids

    def test_no_spectate_allowed(self, sample_user, admin_user):
        """不允许观战的房间不出现在列表中"""
        match_id, _ = create_match(sample_user, allow_spectate=False)
        join_match(admin_user, match_id)

        result = get_spectatable_matches()
        ids = [m['id'] for m in result['matches']]
        assert match_id not in ids

    def test_spectate_fields(self, sample_user, admin_user):
        """观战列表包含必要字段"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result = get_spectatable_matches()
        match = result['matches'][0]

        required_keys = [
            'id', 'creator', 'opponent', 'status', 'creatorColor',
            'currentPlayer', 'startTime', 'moveCount', 'spectatorCount',
            'timeMode', 'hasPassword'
        ]
        for key in required_keys:
            assert key in match, f'缺少字段: {key}'

    def test_sorted_by_move_count(self, sample_user, admin_user):
        """按走子数降序排列"""
        match1, _ = create_match(sample_user)
        join_match(admin_user, match1)

        match2, _ = create_match(admin_user)
        join_match(sample_user, match2)

        result = get_spectatable_matches()
        move_counts = [m['moveCount'] for m in result['matches']]
        assert move_counts == sorted(move_counts, reverse=True)

    def test_spectator_count(self, sample_user, admin_user):
        """观战人数正确"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        spectate_match(spectator, match_id)

        result = get_spectatable_matches()
        match = [m for m in result['matches'] if m['id'] == match_id][0]
        assert match['spectatorCount'] == 1

    def test_password_field(self, sample_user, admin_user):
        """密码房间标记"""
        match_id, _ = create_match(sample_user, password='secret')
        join_match(admin_user, match_id)

        result = get_spectatable_matches()
        match = [m for m in result['matches'] if m['id'] == match_id][0]
        assert match['hasPassword'] is True

    def test_no_password_field(self, sample_user, admin_user):
        """无密码房间标记"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result = get_spectatable_matches()
        match = [m for m in result['matches'] if m['id'] == match_id][0]
        assert match['hasPassword'] is False


class TestSpectateMatch:
    """spectate_match 函数测试"""

    def _setup_playing_match(self, user1, user2):
        """辅助：创建并加入一个进行中的对局"""
        match_id, _ = create_match(user1)
        join_match(user2, match_id)
        return match_id

    def test_spectate_success(self, sample_user, admin_user):
        """成功观战"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id)
        assert code == 200
        assert result['success'] is True
        assert result['id'] == match_id
        assert result['creator'] == 'testuser'
        assert result['opponent'] == 'admin'

        with active_matches_lock:
            match = active_matches[match_id]
            assert 'spectator1' in match.get('spectators', [])

    def test_spectate_nonexistent(self):
        """观战不存在的房间"""
        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, 'nonexist')
        assert code == 404

    def test_spectate_own_game(self, sample_user, admin_user):
        """不能观战自己参与的对局"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        result, code = spectate_match(sample_user, match_id)
        assert code == 400
        assert '参与者' in result.get('error', '')

    def test_spectate_opponent_own_game(self, sample_user, admin_user):
        """对手也不能观战自己的对局"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        result, code = spectate_match(admin_user, match_id)
        assert code == 400
        assert '参与者' in result.get('error', '')

    def test_spectate_not_allowed(self, sample_user, admin_user):
        """不允许观战的房间"""
        match_id, _ = create_match(sample_user, allow_spectate=False)
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id)
        assert code == 403
        assert '不允许观战' in result.get('error', '')

    def test_spectate_waiting_room(self, sample_user):
        """等待中的房间不可观战"""
        match_id, _ = create_match(sample_user)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id)
        assert code == 400
        assert '不可观看' in result.get('error', '')

    def test_spectate_with_password(self, sample_user, admin_user):
        """带密码观战成功"""
        match_id, _ = create_match(sample_user, password='secret')
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id, password='secret')
        assert code == 200
        assert result['success'] is True

    def test_spectate_with_wrong_password(self, sample_user, admin_user):
        """密码错误"""
        match_id, _ = create_match(sample_user, password='secret')
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id, password='wrong')
        assert code == 403
        assert result.get('needPassword') is True

    def test_spectate_response_fields(self, sample_user, admin_user):
        """观战响应包含完整字段"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = spectate_match(spectator, match_id)

        required_keys = [
            'id', 'creator', 'opponent', 'status', 'board', 'currentPlayer',
            'moves', 'winner', 'creatorColor', 'startTime', 'moveCount',
            'spectatorCount', 'timeMode', 'blackTime', 'whiteTime', 'moveDeadline'
        ]
        for key in required_keys:
            assert key in result, f'缺少字段: {key}'

    def test_multiple_spectators(self, sample_user, admin_user):
        """多个观战者"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        spectator1 = {'username': 'spec1', 'score': 1000}
        spectator2 = {'username': 'spec2', 'score': 1000}
        spectator3 = {'username': 'spec3', 'score': 1000}

        spectate_match(spectator1, match_id)
        spectate_match(spectator2, match_id)
        result, code = spectate_match(spectator3, match_id)

        assert code == 200
        assert result['spectatorCount'] == 3

        with active_matches_lock:
            match = active_matches[match_id]
            assert 'spec1' in match['spectators']
            assert 'spec2' in match['spectators']
            assert 'spec3' in match['spectators']

    def test_duplicate_spectator(self, sample_user, admin_user):
        """重复观战不会重复添加"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        spectator = {'username': 'spectator1', 'score': 1000}
        spectate_match(spectator, match_id)
        result, code = spectate_match(spectator, match_id)

        assert code == 200
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['spectators'].count('spectator1') == 1


class TestLeaveSpectate:
    """leave_spectate 函数测试"""

    def test_leave_spectate(self, sample_user, admin_user):
        """离开观战"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        spectate_match(spectator, match_id)

        result, code = leave_spectate(spectator, match_id)
        assert result['success'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert 'spectator1' not in match.get('spectators', [])

    def test_leave_nonexistent(self):
        """离开不存在的房间"""
        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = leave_spectate(spectator, 'nonexist')
        assert result['success'] is True

    def test_leave_non_spectator(self, sample_user, admin_user):
        """非观战者离开"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        spectator = {'username': 'spectator1', 'score': 1000}
        result, code = leave_spectate(spectator, match_id)
        assert result['success'] is True


class TestGetSpectateStatus:
    """get_spectate_status 函数测试"""

    def _setup_with_spectator(self, creator, opponent, spectator_name='spectator1'):
        """辅助：创建对局并加入观战者"""
        match_id, _ = create_match(creator)
        join_match(opponent, match_id)

        spectator = {'username': spectator_name, 'score': 1000}
        spectate_match(spectator, match_id)
        return match_id

    def test_spectate_status(self, sample_user, admin_user):
        """获取观战状态"""
        match_id = self._setup_with_spectator(sample_user, admin_user)

        result, code = get_spectate_status({'username': 'spectator1'}, match_id)
        assert code == 200
        assert result['id'] == match_id
        assert result['creator'] == 'testuser'
        assert result['opponent'] == 'admin'
        assert result['status'] == 'playing'

    def test_nonexistent_room(self):
        """不存在的房间"""
        result, code = get_spectate_status({'username': 'user1'}, 'nonexist')
        assert code == 404

    def test_status_fields(self, sample_user, admin_user):
        """状态包含完整字段"""
        match_id = self._setup_with_spectator(sample_user, admin_user)

        result, code = get_spectate_status({'username': 'spectator1'}, match_id)

        required_keys = [
            'id', 'creator', 'opponent', 'status', 'board', 'currentPlayer',
            'moves', 'winner', 'creatorColor', 'startTime', 'moveCount',
            'spectatorCount', 'timeMode', 'blackTime', 'whiteTime',
            'moveDeadline', 'restartVersion'
        ]
        for key in required_keys:
            assert key in result, f'缺少字段: {key}'

    def test_spectator_count_in_status(self, sample_user, admin_user):
        """观战人数正确"""
        match_id = self._setup_with_spectator(sample_user, admin_user)

        result, code = get_spectate_status({'username': 'spectator1'}, match_id)
        assert result['spectatorCount'] == 1

    def test_any_user_can_poll(self, sample_user, admin_user):
        """任何用户都可以轮询观战状态"""
        match_id = self._setup_with_spectator(sample_user, admin_user)

        result, code = get_spectate_status({'username': 'random_user'}, match_id)
        assert code == 200
        assert result['id'] == match_id
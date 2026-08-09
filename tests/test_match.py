"""联机对局模块测试
测试范围：创建/加入/离开/关闭对局、落子、悔棋、和棋、查询、心跳、管理员操作
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.game_logic import RULE_MODE_RENJU
from server.match import (
    accept_draw,
    accept_undo,
    active_matches,
    active_matches_lock,
    close_match,
    create_match,
    decline_draw,
    decline_restart,
    decline_undo,
    force_close_all_matches,
    force_close_match,
    force_move,
    force_restart_match,
    get_all_matches,
    get_match_detail,
    get_my_match,
    get_user_current_match,
    heartbeat,
    join_match,
    leave_match,
    list_active_matches,
    list_available_matches,
    make_move,
    request_draw,
    request_undo,
    resign,
    restart_match,
    user_connections,
    user_connections_lock,
)


@pytest.fixture(autouse=True)
def clean_matches():
    """每个测试前后清理全局对局状态"""
    with active_matches_lock:
        active_matches.clear()
    with user_connections_lock:
        user_connections.clear()
    yield
    with active_matches_lock:
        active_matches.clear()
    with user_connections_lock:
        user_connections.clear()


class TestCreateMatch:
    """create_match 函数测试"""

    def test_create_basic(self, sample_user):
        """基本创建对局"""
        match_id, color = create_match(sample_user)
        assert isinstance(match_id, str)
        assert len(match_id) == 8
        assert color in (1, 2)

        with active_matches_lock:
            assert match_id in active_matches
            match = active_matches[match_id]
            assert match['creator'] == 'testuser'
            assert match['status'] == 'waiting'
            assert match['opponent'] is None
            assert match['currentPlayer'] == 1

    def test_create_with_time_mode(self, sample_user):
        """带计时模式创建"""
        match_id, _ = create_match(sample_user, time_mode='move', move_time=30)
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['timeMode'] == 'move'
            assert match['moveTime'] == 30

    def test_create_with_password(self, sample_user):
        """带密码创建"""
        match_id, _ = create_match(sample_user, password='secret')
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['password'] == 'secret'

    def test_create_with_rule_mode(self, sample_user):
        """带规则模式创建"""
        match_id, _ = create_match(sample_user, rule_mode=RULE_MODE_RENJU)
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['ruleMode'] == RULE_MODE_RENJU

    def test_create_no_spectate(self, sample_user):
        """不允许观战"""
        match_id, _ = create_match(sample_user, allow_spectate=False)
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['allowSpectate'] is False

    def test_create_invite_only(self, sample_user):
        """邀请制房间"""
        match_id, _ = create_match(sample_user, invite_only=True, invited_friends=['friend1', 'friend2'])
        with active_matches_lock:
            match = active_matches[match_id]
            assert match['inviteOnly'] is True
            assert 'friend1' in match['invitedFriends']
            assert 'friend2' in match['invitedFriends']

    def test_create_spectate_token_generated(self, sample_user):
        """观战 token 生成"""
        match_id, _ = create_match(sample_user)
        with active_matches_lock:
            match = active_matches[match_id]
            assert 'spectateToken' in match
            assert len(match['spectateToken']) > 0


class TestJoinMatch:
    """join_match 函数测试"""

    def test_join_success(self, sample_user, admin_user):
        """成功加入"""
        match_id, _ = create_match(sample_user)
        result, code = join_match(admin_user, match_id)
        assert code == 200
        assert result['success'] is True
        assert result['matchId'] == match_id

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'playing'
            assert match['opponent'] == 'admin'

    def test_join_nonexistent(self, sample_user):
        """加入不存在的房间"""
        result, code = join_match(sample_user, 'nonexist')
        assert code == 404
        assert 'error' in result

    def test_join_own_room(self, sample_user):
        """不能加入自己创建的房间"""
        match_id, _ = create_match(sample_user)
        result, code = join_match(sample_user, match_id)
        assert code == 400
        assert 'error' in result

    def test_join_with_password_success(self, sample_user, admin_user):
        """带密码加入成功"""
        match_id, _ = create_match(sample_user, password='secret')
        result, code = join_match(admin_user, match_id, password='secret')
        assert code == 200
        assert result['success'] is True

    def test_join_with_wrong_password(self, sample_user, admin_user):
        """密码错误"""
        match_id, _ = create_match(sample_user, password='secret')
        result, code = join_match(admin_user, match_id, password='wrong')
        assert code == 403
        assert result.get('needPassword') is True

    def test_join_finished_room(self, sample_user, admin_user):
        """不能加入已结束的房间"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        with active_matches_lock:
            active_matches[match_id]['status'] = 'finished'

        result, code = join_match(sample_user, match_id)
        assert code == 400

    def test_join_invite_only_not_invited(self, sample_user, admin_user):
        """邀请制房间未受邀"""
        match_id, _ = create_match(sample_user, invite_only=True, invited_friends=['friend1'])
        result, code = join_match(admin_user, match_id)
        assert code == 403
        assert '未被邀请' in result.get('error', '')

    def test_join_invite_only_invited(self, sample_user):
        """邀请制房间受邀加入"""
        match_id, _ = create_match(sample_user, invite_only=True, invited_friends=['testuser2'])
        invited_user = {'username': 'testuser2', 'score': 1000}
        result, code = join_match(invited_user, match_id)
        assert code == 200


class TestMakeMove:
    """make_move 函数测试"""

    def _setup_playing_match(self, user1, user2):
        """辅助：创建并加入一个进行中的对局"""
        match_id, _ = create_match(user1)
        join_match(user2, match_id)
        return match_id

    def test_first_move_black(self, sample_user, admin_user):
        """黑棋先手落子"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        with active_matches_lock:
            match = active_matches[match_id]
            black_player = match['creator'] if match['creatorColor'] == 1 else match['opponent']

        player = sample_user if black_player == 'testuser' else admin_user

        result, code = make_move(player, match_id, 7, 7)
        assert code == 200
        assert result['success'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['board'][7][7] == 1
            assert match['currentPlayer'] == 2

    def test_not_your_turn(self, sample_user, admin_user):
        """不是你的回合"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        with active_matches_lock:
            match = active_matches[match_id]
            white_player = match['opponent'] if match['creatorColor'] == 1 else match['creator']

        player = sample_user if white_player == 'testuser' else admin_user

        result, code = make_move(player, match_id, 7, 7)
        assert code == 400
        assert '不是您的回合' in result.get('error', '')

    def test_occupied_position(self, sample_user, admin_user):
        """已有棋子的位置"""
        match_id = self._setup_playing_match(sample_user, admin_user)

        with active_matches_lock:
            match = active_matches[match_id]
            black_player = match['creator'] if match['creatorColor'] == 1 else match['opponent']

        player = sample_user if black_player == 'testuser' else admin_user

        make_move(player, match_id, 7, 7)

        # 白棋落子
        with active_matches_lock:
            match = active_matches[match_id]
            white_player_name = match['creator'] if match['creatorColor'] == 2 else match['opponent']
        white_player = sample_user if white_player_name == 'testuser' else admin_user
        make_move(white_player, match_id, 8, 8)

        # 黑棋再落子到已占位置
        result, code = make_move(player, match_id, 7, 7)
        assert code == 400
        assert '已有棋子' in result.get('error', '')

    def test_nonexistent_room(self, sample_user):
        """不存在的房间"""
        result, code = make_move(sample_user, 'nonexist', 7, 7)
        assert code == 404

    def test_not_in_room(self, sample_user, admin_user):
        """不在房间中（房间状态为 waiting 时先触发 '游戏未在进行中' 返回 400）"""
        match_id, _ = create_match(sample_user)
        result, code = make_move(admin_user, match_id, 7, 7)
        assert code == 400


class TestLeaveMatch:
    """leave_match 函数测试"""

    def test_leave_waiting_room(self, sample_user):
        """离开等待中的房间（创建者）"""
        match_id, _ = create_match(sample_user)
        leave_match(sample_user, match_id)

        with active_matches_lock:
            assert match_id not in active_matches

    def test_leave_playing_room(self, sample_user, admin_user):
        """离开进行中的房间"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        leave_match(sample_user, match_id)

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'finished'
            assert match['winner'] is not None

    def test_leave_nonexistent(self, sample_user):
        """离开不存在的房间"""
        result, code = leave_match(sample_user, 'nonexist')
        assert result['success'] is True


class TestCloseMatch:
    """close_match 函数测试"""

    def test_close_room(self, sample_user, admin_user):
        """关闭房间（状态变为 closed，不从 active_matches 中删除）"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = close_match(sample_user, match_id)
        assert result['success'] is True

        with active_matches_lock:
            assert match_id in active_matches
            assert active_matches[match_id]['status'] == 'closed'


class TestRestartMatch:
    """restart_match 函数测试"""

    def test_request_restart(self, sample_user, admin_user):
        """请求重开"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = restart_match(sample_user, match_id)
        assert result['success'] is True
        assert result.get('restartRequested') is True

    def test_decline_restart(self, sample_user, admin_user):
        """拒绝重开"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        restart_match(sample_user, match_id)
        result, code = decline_restart(admin_user, match_id)
        assert result['success'] is True


class TestUndoOperations:
    """悔棋操作测试"""

    def _setup_played_match(self, user1, user2):
        """辅助：创建并完成几步的对局"""
        match_id, _ = create_match(user1)
        join_match(user2, match_id)

        with active_matches_lock:
            match = active_matches[match_id]
            black_name = match['creator'] if match['creatorColor'] == 1 else match['opponent']
            white_name = match['creator'] if match['creatorColor'] == 2 else match['opponent']

        black = user1 if black_name == user1['username'] else user2
        white = user1 if white_name == user1['username'] else user2

        make_move(black, match_id, 7, 7)
        make_move(white, match_id, 7, 8)
        return match_id, black, white

    def test_request_undo(self, sample_user, admin_user):
        """请求悔棋"""
        match_id, black, white = self._setup_played_match(sample_user, admin_user)

        result, code = request_undo(black, match_id)
        assert result['success'] is True
        assert result['undoRequested'] is True

    def test_accept_undo(self, sample_user, admin_user):
        """接受悔棋"""
        match_id, black, white = self._setup_played_match(sample_user, admin_user)

        request_undo(black, match_id)
        result, code = accept_undo(white, match_id)
        assert result['success'] is True
        assert result['undoAccepted'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert len(match['moves']) == 0

    def test_decline_undo(self, sample_user, admin_user):
        """拒绝悔棋"""
        match_id, black, white = self._setup_played_match(sample_user, admin_user)

        request_undo(black, match_id)
        result, code = decline_undo(white, match_id)
        assert result['success'] is True
        assert result['undoDeclined'] is True

    def test_cannot_accept_own_undo(self, sample_user, admin_user):
        """不能接受自己的悔棋请求"""
        match_id, black, white = self._setup_played_match(sample_user, admin_user)

        request_undo(black, match_id)
        result, code = accept_undo(black, match_id)
        assert code == 400


class TestDrawOperations:
    """和棋操作测试"""

    def _setup_playing_match(self, user1, user2):
        match_id, _ = create_match(user1)
        join_match(user2, match_id)
        return match_id

    def test_request_draw(self, sample_user, admin_user):
        """请求和棋"""
        match_id = self._setup_playing_match(sample_user, admin_user)
        result, code = request_draw(sample_user, match_id)
        assert result['success'] is True
        assert result['drawRequested'] is True

    def test_accept_draw(self, sample_user, admin_user):
        """接受和棋"""
        match_id = self._setup_playing_match(sample_user, admin_user)
        request_draw(sample_user, match_id)
        result, code = accept_draw(admin_user, match_id)
        assert result['success'] is True
        assert result['winner'] == 0

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'finished'

    def test_decline_draw(self, sample_user, admin_user):
        """拒绝和棋"""
        match_id = self._setup_playing_match(sample_user, admin_user)
        request_draw(sample_user, match_id)
        result, code = decline_draw(admin_user, match_id)
        assert result['success'] is True

    def test_mutual_draw(self, sample_user, admin_user):
        """双方同时请求和棋"""
        match_id = self._setup_playing_match(sample_user, admin_user)
        request_draw(sample_user, match_id)
        result, code = request_draw(admin_user, match_id)
        assert result['success'] is True
        assert result.get('drawAccepted') is True

    def test_cannot_accept_own_draw(self, sample_user, admin_user):
        """不能接受自己的和棋请求"""
        match_id = self._setup_playing_match(sample_user, admin_user)
        request_draw(sample_user, match_id)
        result, code = accept_draw(sample_user, match_id)
        assert code == 400


class TestResign:
    """认输功能测试"""

    def test_resign(self, sample_user, admin_user):
        """认输"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = resign(sample_user, match_id)
        assert result['success'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'finished'
            assert match['winner'] is not None


class TestQueryOperations:
    """查询操作测试"""

    def test_list_active_empty(self):
        """空列表"""
        result = list_active_matches()
        assert result == []

    def test_list_active_matches(self, sample_user, admin_user):
        """活跃对局列表"""
        match_id1, _ = create_match(sample_user)
        match_id2, _ = create_match(admin_user)

        result = list_active_matches()
        assert len(result) == 2
        ids = [m['id'] for m in result]
        assert match_id1 in ids
        assert match_id2 in ids

    def test_get_user_current_match(self, sample_user, admin_user):
        """获取用户当前对局"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        found = get_user_current_match('testuser')
        assert found == match_id

        found = get_user_current_match('admin')
        assert found == match_id

    def test_no_current_match(self, sample_user):
        """无当前对局"""
        result = get_user_current_match('nonexistent')
        assert result is None

    def test_heartbeat(self, sample_user):
        """心跳"""
        result = heartbeat(sample_user)
        assert result['success'] is True

    def test_get_my_match(self, sample_user, admin_user):
        """获取我的对局"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result = get_my_match('testuser')
        assert result['match'] is not None
        assert result['match']['id'] == match_id

    def test_list_available(self, sample_user, admin_user):
        """可用对局列表"""
        match_id, _ = create_match(sample_user)

        result = list_available_matches('admin')
        assert len(result['matches']) >= 1
        ids = [m['id'] for m in result['matches']]
        assert match_id in ids

    def test_get_all_matches(self, sample_user, admin_user):
        """获取所有对局（管理员）"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result = get_all_matches()
        assert len(result) >= 1

    def test_get_match_detail(self, sample_user, admin_user):
        """获取对局详情"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = get_match_detail(match_id)
        assert code == 200
        assert result['id'] == match_id


class TestAdminOperations:
    """管理员操作测试"""

    def test_force_close_match(self, sample_user, admin_user):
        """强制关闭对局"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = force_close_match(match_id)
        assert result['success'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'closed'

    def test_force_close_nonexistent(self):
        """强制关闭不存在房间"""
        result, code = force_close_match('nonexist')
        assert code == 404

    def test_force_close_all(self, sample_user, admin_user):
        """强制关闭所有对局"""
        create_match(sample_user)
        create_match(admin_user)

        result, code = force_close_all_matches()
        assert result['success'] is True
        assert result['closed_count'] >= 2

    def test_force_restart(self, sample_user, admin_user):
        """强制重新开始"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = force_restart_match(match_id)
        assert result['success'] is True
        assert result['restartInitiated'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'playing'
            assert len(match['moves']) == 0

    def test_force_move(self, sample_user, admin_user):
        """强制落子"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = force_move(match_id, 7, 7, 1)
        assert result['success'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['board'][7][7] == 1

    def test_force_move_out_of_bounds(self, sample_user, admin_user):
        """强制落子超出范围"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = force_move(match_id, 20, 20, 1)
        assert code == 400

    def test_force_move_occupied(self, sample_user, admin_user):
        """强制落子到已有棋子位置"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)
        force_move(match_id, 7, 7, 1)

        result, code = force_move(match_id, 7, 7, 2)
        assert code == 400


class TestMatchIntegration:
    """对局集成测试：完整流程"""

    def test_full_game_flow(self, sample_user, admin_user):
        """完整对局流程"""
        # 创建
        match_id, color = create_match(sample_user)
        assert match_id is not None

        # 加入
        result, code = join_match(admin_user, match_id)
        assert code == 200

        # 确定双方颜色
        with active_matches_lock:
            match = active_matches[match_id]
            black_name = match['creator'] if match['creatorColor'] == 1 else match['opponent']
            white_name = match['creator'] if match['creatorColor'] == 2 else match['opponent']

        black = sample_user if black_name == 'testuser' else admin_user
        white = sample_user if white_name == 'testuser' else admin_user

        # 模拟一局五连黑子获胜
        for i in range(5):
            result, code = make_move(black, match_id, 7, 5 + i)
            if i < 4:
                assert result['success'] is True
                assert result.get('win', False) is False
                make_move(white, match_id, 8, 5 + i)
            else:
                assert result['success'] is True
                assert result.get('win') is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'finished'
            assert match['winner'] == 1

    def test_undo_flow(self, sample_user, admin_user):
        """悔棋完整流程"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        with active_matches_lock:
            match = active_matches[match_id]
            black_name = match['creator'] if match['creatorColor'] == 1 else match['opponent']
            white_name = match['creator'] if match['creatorColor'] == 2 else match['opponent']

        black = sample_user if black_name == 'testuser' else admin_user
        white = sample_user if white_name == 'testuser' else admin_user

        make_move(black, match_id, 7, 7)
        make_move(white, match_id, 7, 8)

        result, code = request_undo(black, match_id)
        assert result['undoRequested'] is True

        result, code = accept_undo(white, match_id)
        assert result['undoAccepted'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert len(match['moves']) == 0
            assert match['board'][7][7] == 0
            assert match['board'][7][8] == 0

    def test_draw_flow(self, sample_user, admin_user):
        """和棋完整流程"""
        match_id, _ = create_match(sample_user)
        join_match(admin_user, match_id)

        result, code = request_draw(sample_user, match_id)
        assert result['drawRequested'] is True

        result, code = accept_draw(admin_user, match_id)
        assert result['drawAccepted'] is True

        with active_matches_lock:
            match = active_matches[match_id]
            assert match['status'] == 'finished'
            assert match['winner'] == 0
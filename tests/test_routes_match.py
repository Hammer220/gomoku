"""联机匹配路由模块测试
测试范围：创建/加入/离开/关闭房间、落子、悔棋、和棋、观战、心跳 API
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.match_routes import (
    _build_match_event,
    match_bp,
)


class TestMatchBlueprint:
    """match_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert match_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert match_bp.name == 'match'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(match_bp.deferred_functions)) > 0


class TestBuildMatchEvent:
    """_build_match_event 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(_build_match_event)

    def test_returns_dict(self):
        """返回字典"""
        match = {
            'id': 'test_match_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'creatorColor': 1,
            'creator': 'player1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': [],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        assert isinstance(event, dict)

    def test_required_keys(self):
        """包含所有必需的键"""
        match = {
            'id': 'test_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'creatorColor': 1,
            'creator': 'p1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': [],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        required_keys = [
            'match_id', 'id', 'status', 'board', 'currentPlayer', 'moves',
            'winner', 'creatorColor', 'creator', 'opponent', 'timeMode',
            'blackTime', 'whiteTime', 'spectatorCount', 'ruleMode', 'timestamp',
        ]
        for key in required_keys:
            assert key in event, f'缺少键: {key}'

    def test_board_is_copy(self):
        """board 是副本，修改不影响原数据"""
        match = {
            'id': 'test_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'creatorColor': 1,
            'creator': 'p1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': [],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        event['board'][0][0] = 99
        assert match['board'][0][0] == 0

    def test_moves_is_copy(self):
        """moves 是副本"""
        match = {
            'id': 'test_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [{'row': 0, 'col': 0}],
            'winner': None,
            'creatorColor': 1,
            'creator': 'p1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': [],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        event['moves'].append({'row': 99, 'col': 99})
        assert len(match['moves']) == 1

    def test_spectator_count(self):
        """spectatorCount 正确计算"""
        match = {
            'id': 'test_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'creatorColor': 1,
            'creator': 'p1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': ['s1', 's2', 's3'],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        assert event['spectatorCount'] == 3

    def test_timestamp_is_number(self):
        """timestamp 是数值"""
        match = {
            'id': 'test_1',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'creatorColor': 1,
            'creator': 'p1',
            'opponent': None,
            'timeMode': 'untimed',
            'blackTime': 600,
            'whiteTime': 600,
            'moveDeadline': 0,
            'totalTime': 600,
            'moveTime': 30,
            'spectators': [],
            'ruleMode': 'standard',
            'inviteOnly': False,
            'invitedFriends': [],
        }
        event = _build_match_event(match)
        assert isinstance(event['timestamp'], (int, float))
        assert event['timestamp'] > 0


class TestMatchRoutesImport:
    """路由函数导入测试"""

    def test_api_create_match_exists(self):
        """api_create_match 存在"""
        from server.routes.match_routes import api_create_match
        assert callable(api_create_match)

    def test_api_join_match_exists(self):
        """api_join_match 存在"""
        from server.routes.match_routes import api_join_match
        assert callable(api_join_match)

    def test_api_make_move_exists(self):
        """api_make_move 存在"""
        from server.routes.match_routes import api_make_move
        assert callable(api_make_move)

    def test_api_leave_match_exists(self):
        """api_leave_match 存在"""
        from server.routes.match_routes import api_leave_match
        assert callable(api_leave_match)

    def test_api_close_match_exists(self):
        """api_close_match 存在"""
        from server.routes.match_routes import api_close_match
        assert callable(api_close_match)

    def test_api_restart_match_exists(self):
        """api_restart_match 存在"""
        from server.routes.match_routes import api_restart_match
        assert callable(api_restart_match)

    def test_api_get_my_match_exists(self):
        """api_get_my_match 存在"""
        from server.routes.match_routes import api_get_my_match
        assert callable(api_get_my_match)

    def test_api_list_matches_exists(self):
        """api_list_matches 存在"""
        from server.routes.match_routes import api_list_matches
        assert callable(api_list_matches)

    def test_api_heartbeat_exists(self):
        """api_heartbeat 存在"""
        from server.routes.match_routes import api_heartbeat
        assert callable(api_heartbeat)

    def test_api_request_undo_exists(self):
        """api_request_undo 存在"""
        from server.routes.match_routes import api_request_undo
        assert callable(api_request_undo)

    def test_api_accept_undo_exists(self):
        """api_accept_undo 存在"""
        from server.routes.match_routes import api_accept_undo
        assert callable(api_accept_undo)

    def test_api_decline_undo_exists(self):
        """api_decline_undo 存在"""
        from server.routes.match_routes import api_decline_undo
        assert callable(api_decline_undo)

    def test_api_request_draw_exists(self):
        """api_request_draw 存在"""
        from server.routes.match_routes import api_request_draw
        assert callable(api_request_draw)

    def test_api_accept_draw_exists(self):
        """api_accept_draw 存在"""
        from server.routes.match_routes import api_accept_draw
        assert callable(api_accept_draw)

    def test_api_decline_draw_exists(self):
        """api_decline_draw 存在"""
        from server.routes.match_routes import api_decline_draw
        assert callable(api_decline_draw)

    def test_api_resign_exists(self):
        """api_resign 存在"""
        from server.routes.match_routes import api_resign
        assert callable(api_resign)

    def test_api_spectate_list_exists(self):
        """api_spectate_list 存在"""
        from server.routes.match_routes import api_spectate_list
        assert callable(api_spectate_list)

    def test_api_spectate_join_exists(self):
        """api_spectate_join 存在"""
        from server.routes.match_routes import api_spectate_join
        assert callable(api_spectate_join)

    def test_api_spectate_leave_exists(self):
        """api_spectate_leave 存在"""
        from server.routes.match_routes import api_spectate_leave
        assert callable(api_spectate_leave)

    def test_api_spectate_status_exists(self):
        """api_spectate_status 存在"""
        from server.routes.match_routes import api_spectate_status
        assert callable(api_spectate_status)

    def test_api_get_spectate_token_exists(self):
        """api_get_spectate_token 存在"""
        from server.routes.match_routes import api_get_spectate_token
        assert callable(api_get_spectate_token)

    def test_api_public_spectate_exists(self):
        """api_public_spectate 存在"""
        from server.routes.match_routes import api_public_spectate
        assert callable(api_public_spectate)

    def test_api_invite_friends_to_match_exists(self):
        """api_invite_friends_to_match 存在"""
        from server.routes.match_routes import api_invite_friends_to_match
        assert callable(api_invite_friends_to_match)

    def test_api_get_match_invites_exists(self):
        """api_get_match_invites 存在"""
        from server.routes.match_routes import api_get_match_invites
        assert callable(api_get_match_invites)


class TestMatchRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_create_match_requires_auth(self):
        """POST /api/match/create 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/create',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_join_match_requires_auth(self):
        """POST /api/match/join 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/join',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_make_move_requires_auth(self):
        """POST /api/match/move 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/move',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_leave_match_requires_auth(self):
        """POST /api/match/leave 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/leave',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_close_match_requires_auth(self):
        """POST /api/match/close 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/close',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_my_match_requires_auth(self):
        """GET /api/match/my 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/match/my')
            assert response.status_code in (401, 302)

    def test_list_matches_requires_auth(self):
        """GET /api/match/list 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/match/list')
            assert response.status_code in (401, 302)

    def test_heartbeat_requires_auth(self):
        """POST /api/match/heartbeat 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/heartbeat',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_spectate_list_requires_auth(self):
        """GET /api/match/spectate/list 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/match/spectate/list')
            assert response.status_code in (401, 302)

    def test_undo_request_requires_auth(self):
        """POST /api/match/undo/request 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/undo/request',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_draw_request_requires_auth(self):
        """POST /api/match/draw/request 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/draw/request',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_resign_requires_auth(self):
        """POST /api/match/resign 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/match/resign',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_public_spectate_no_params(self):
        """GET /api/spectate/public 缺少参数返回 404"""
        with self.app.app_context():
            response = self.client.get('/api/spectate/public')
            assert response.status_code in (404, 400)

    def test_match_status_requires_auth(self):
        """GET /api/match/status 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/match/status')
            assert response.status_code in (401, 302)
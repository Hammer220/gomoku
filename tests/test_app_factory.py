"""Flask 应用工厂模块测试
测试范围：创建应用、构建对局事件、Socket.IO 事件处理、蓝本注册
"""

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import create_app
from server.__init__ import _build_match_event, register_socket_events


class TestAppBasics:
    """应用基础属性测试（使用 conftest.py 的 app fixture）"""

    def test_is_flask_app(self, app):
        """返回 Flask 应用实例"""
        from flask import Flask
        assert isinstance(app, Flask)

    def test_testing_mode(self, app):
        """测试模式配置"""
        assert app.config['TESTING'] is True

    def test_secret_key(self, app):
        """密钥已设置"""
        assert app.secret_key is not None
        assert len(app.secret_key) > 0

    def test_static_folder(self, app):
        """静态文件夹配置"""
        assert app.static_folder is not None
        assert app.static_url_path == '/static'

    def test_template_folder(self, app):
        """模板文件夹配置"""
        assert app.template_folder is not None
        assert os.path.exists(app.template_folder)

    def test_url_map(self, app):
        """URL 映射存在"""
        assert app.url_map is not None

    def test_error_handlers(self, app):
        """错误处理器存在"""
        assert app.error_handler_spec is not None


class TestAppRoutes:
    """路由注册测试（使用 app fixture）"""

    def test_api_routes_exist(self, app):
        """API 路由存在"""
        with app.app_context():
            rules = [rule.rule for rule in app.url_map.iter_rules()]
            api_routes = [r for r in rules if r.startswith('/api/')]
            assert len(api_routes) > 0

    def test_static_routes_exist(self, app):
        """静态文件路由存在"""
        with app.app_context():
            rules = [rule.rule for rule in app.url_map.iter_rules()]
            static_routes = [r for r in rules if r.startswith('/static/')]
            assert len(static_routes) > 0

    def test_specific_routes(self, app):
        """关键路由已注册"""
        with app.app_context():
            rules = [rule.rule for rule in app.url_map.iter_rules()]
            assert '/api/auth/login' in rules
            assert '/api/game/ai-move' in rules
            assert '/api/match/create' in rules
            assert '/api/messages/send' in rules
            assert '/api/user/profile' in rules
            assert '/api/admin/users' in rules

    def test_get_root(self, app):
        """GET / 返回成功"""
        with app.test_client() as client:
            response = client.get('/')
            assert response.status_code in (200, 302, 404)


class TestCreateAppIsolation:
    """create_app 隔离测试（仅调用一次，避免重复初始化）"""

    def test_creates_distinct_apps(self):
        """多次创建返回不同实例"""
        with patch('server.db.init_db'), patch('server.db.migrate_from_json'), \
             patch('server.match_manager.init_matches'), patch('server.match_manager.start_cleanup_task'):
            app1 = create_app()
            app2 = create_app()
            assert app1 is not app2
            assert app1.secret_key != app2.secret_key


class TestBuildMatchEvent:
    """_build_match_event 函数测试"""

    def _make_match(self, **kwargs):
        """创建测试用对局数据"""
        match = {
            'id': 'test_001',
            'status': 'playing',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [{'row': 7, 'col': 7, 'player': 1}],
            'winner': None,
            'creatorColor': 1,
            'creator': 'player1',
            'opponent': 'player2',
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
        match.update(kwargs)
        return match

    def test_basic_event(self):
        """基本事件构建"""
        match = self._make_match()
        event = _build_match_event(match)

        assert event['match_id'] == 'test_001'
        assert event['id'] == 'test_001'
        assert event['status'] == 'playing'
        assert event['currentPlayer'] == 1
        assert event['creator'] == 'player1'
        assert event['opponent'] == 'player2'

    def test_all_required_keys(self):
        """包含所有必需的键"""
        match = self._make_match()
        event = _build_match_event(match)

        required_keys = [
            'match_id', 'id', 'status', 'board', 'currentPlayer', 'moves',
            'winner', 'creatorColor', 'creator', 'opponent', 'timeMode',
            'blackTime', 'whiteTime', 'spectatorCount', 'ruleMode', 'timestamp'
        ]
        for key in required_keys:
            assert key in event, f'缺少键: {key}'

    def test_board_copy(self):
        """棋盘是副本而非引用"""
        match = self._make_match()
        event = _build_match_event(match)
        event['board'][0][0] = 99
        assert match['board'][0][0] == 0

    def test_moves_copy(self):
        """走子列表是副本而非引用"""
        match = self._make_match()
        event = _build_match_event(match)
        event['moves'].append({'row': 0, 'col': 0, 'player': 1})
        assert len(match['moves']) == 1
        assert len(event['moves']) == 2

    def test_spectator_count(self):
        """观战人数计算正确"""
        match = self._make_match(spectators=['spec1', 'spec2', 'spec3'])
        event = _build_match_event(match)
        assert event['spectatorCount'] == 3

    def test_empty_spectators(self):
        """无观战者"""
        match = self._make_match(spectators=[])
        event = _build_match_event(match)
        assert event['spectatorCount'] == 0

    def test_none_spectators(self):
        """无 spectators 字段"""
        match = self._make_match()
        if 'spectators' in match:
            del match['spectators']
        event = _build_match_event(match)
        assert event['spectatorCount'] == 0

    def test_restart_fields(self):
        """重开相关字段"""
        match = self._make_match(
            restartRequested=True,
            restartRequestedBy='player1',
            restartDeclinedBy=None,
            restartAccepted=False,
            restartInitiated=False,
            restartVersion=2,
        )
        event = _build_match_event(match)
        assert event['restartRequested'] is True
        assert event['restartRequestedBy'] == 'player1'
        assert event['restartVersion'] == 2

    def test_undo_fields(self):
        """悔棋相关字段"""
        match = self._make_match(
            undoRequested=True,
            undoRequestedBy='player1',
            undoAccepted=False,
            undoDeclined=False,
            undoDeclinedBy=None,
        )
        event = _build_match_event(match)
        assert event['undoRequested'] is True
        assert event['undoRequestedBy'] == 'player1'

    def test_draw_fields(self):
        """和棋相关字段"""
        match = self._make_match(
            drawRequested=True,
            drawRequestedBy='player2',
            drawAccepted=False,
            drawDeclined=False,
            drawDeclinedBy=None,
        )
        event = _build_match_event(match)
        assert event['drawRequested'] is True
        assert event['drawRequestedBy'] == 'player2'

    def test_winner_field(self):
        """胜者字段"""
        match = self._make_match(winner=1)
        event = _build_match_event(match)
        assert event['winner'] == 1

        match = self._make_match(winner=0)
        event = _build_match_event(match)
        assert event['winner'] == 0

    def test_timestamp(self):
        """时间戳正确"""
        match = self._make_match()
        event = _build_match_event(match)
        assert isinstance(event['timestamp'], (int, float))
        assert event['timestamp'] > 0

    def test_rule_mode(self):
        """规则模式"""
        match = self._make_match(ruleMode='renju')
        event = _build_match_event(match)
        assert event['ruleMode'] == 'renju'

    def test_invite_fields(self):
        """邀请相关字段"""
        match = self._make_match(
            inviteOnly=True,
            invitedFriends=['friend1', 'friend2'],
        )
        event = _build_match_event(match)
        assert event['inviteOnly'] is True
        assert len(event['invitedFriends']) == 2

    def test_time_mode_fields(self):
        """计时模式字段"""
        match = self._make_match(
            timeMode='move',
            moveTime=30,
            totalTime=600,
            moveDeadline=1234567890,
        )
        event = _build_match_event(match)
        assert event['timeMode'] == 'move'
        assert event['moveTime'] == 30
        assert event['totalTime'] == 600
        assert event['moveDeadline'] == 1234567890

    def test_default_values(self):
        """缺失字段使用默认值"""
        match = {
            'id': 'minimal',
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'creatorColor': 1,
            'creator': 'player1',
            'opponent': None,
        }
        event = _build_match_event(match)
        assert event['timeMode'] == 'untimed'
        assert event['blackTime'] == 600
        assert event['whiteTime'] == 600
        assert event['ruleMode'] == 'standard'
        assert event['inviteOnly'] is False
        assert event['invitedFriends'] == []

    def test_finished_status(self):
        """已结束状态"""
        match = self._make_match(status='finished', winner=1)
        event = _build_match_event(match)
        assert event['status'] == 'finished'
        assert event['winner'] == 1

    def test_closed_status(self):
        """已关闭状态"""
        match = self._make_match(status='closed')
        event = _build_match_event(match)
        assert event['status'] == 'closed'

    def test_waiting_status(self):
        """等待中状态"""
        match = self._make_match(status='waiting', opponent=None)
        event = _build_match_event(match)
        assert event['status'] == 'waiting'
        assert event['opponent'] is None


class TestSocketEventRegistration:
    """register_socket_events 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(register_socket_events)
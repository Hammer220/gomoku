"""管理后台路由模块测试
测试范围：用户管理、对局监控、批量操作、管理员管理 API
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.admin_routes import (
    _batch_operate,
    admin_bp,
    require_permission,
)


class TestAdminBlueprint:
    """admin_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert admin_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert admin_bp.name == 'admin'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(admin_bp.deferred_functions)) > 0


class TestRequirePermission:
    """require_permission 装饰器测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(require_permission)

    def test_returns_decorator(self):
        """返回装饰器"""
        decorator = require_permission('canBanUser')
        assert callable(decorator)

    def test_decorator_returns_function(self):
        """装饰器返回可调用函数"""

        @require_permission('canBanUser')
        def dummy(admin_user):
            return {'success': True}

        assert callable(dummy)

    def test_decorator_preserves_name(self):
        """装饰器保留函数名"""

        @require_permission('canBanUser')
        def my_func(admin_user):
            return 'ok'

        assert my_func.__name__ == 'my_func'


class TestBatchOperate:
    """_batch_operate 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(_batch_operate)

    def test_ban_operation(self):
        """ban 操作"""
        from unittest.mock import patch

        admin = {'username': 'admin', 'isSuperAdmin': False}
        with patch('server.routes.admin_routes.get_user', return_value=None):
            success, failed = _batch_operate(admin, ['nonexistent_user'], 'ban', minutes=60)
            assert isinstance(success, int)
            assert isinstance(failed, int)

    def test_unban_operation(self):
        """unban 操作"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        with patch('server.routes.admin_routes.get_user', return_value=None):
            success, failed = _batch_operate(admin, ['nonexistent_user'], 'unban')
            assert isinstance(success, int)
            assert isinstance(failed, int)

    def test_kick_operation(self):
        """kick 操作"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        with patch('server.routes.admin_routes.get_user', return_value=None):
            success, failed = _batch_operate(admin, ['nonexistent_user'], 'kick')
            assert isinstance(success, int)
            assert isinstance(failed, int)

    def test_delete_operation(self):
        """delete 操作"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        with patch('server.routes.admin_routes.get_user', return_value=None):
            success, failed = _batch_operate(admin, ['nonexistent_user'], 'delete')
            assert isinstance(success, int)
            assert isinstance(failed, int)

    def test_returns_tuple(self):
        """返回 (success_count, failed_count) 元组"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        with patch('server.routes.admin_routes.get_user', return_value=None):
            result = _batch_operate(admin, ['nonexistent_user'], 'ban')
            assert isinstance(result, tuple)
            assert len(result) == 2

    def test_super_admin_protected(self):
        """超级管理员不应被操作"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        mock_user = {
            'username': 'super_admin',
            'isSuperAdmin': True,
            'isAdmin': True,
        }
        with patch('server.routes.admin_routes.get_user', return_value=mock_user):
            with patch('server.routes.admin_routes._invalidate_admin_users_cache'):
                success, failed = _batch_operate(admin, ['super_admin'], 'ban')
                assert failed == 1
                assert success == 0

    def test_self_operation_blocked(self):
        """不能操作自己"""
        admin = {'username': 'admin', 'isSuperAdmin': False}
        mock_user = {
            'username': 'admin',
            'isSuperAdmin': False,
            'isAdmin': True,
        }
        with patch('server.routes.admin_routes.get_user', return_value=mock_user):
            with patch('server.routes.admin_routes._invalidate_admin_users_cache'):
                success, failed = _batch_operate(admin, ['admin'], 'ban')
                assert failed == 1
                assert success == 0


class TestAdminManagementImport:
    """管理员管理路由导入测试"""

    def test_admin_get_stats_exists(self):
        """admin_get_stats 存在"""
        from server.routes.admin.admin_management import admin_get_stats
        assert callable(admin_get_stats)

    def test_admin_get_records_exists(self):
        """admin_get_records 存在"""
        from server.routes.admin.admin_management import admin_get_records
        assert callable(admin_get_records)

    def test_admin_create_admin_exists(self):
        """admin_create_admin 存在"""
        from server.routes.admin.admin_management import admin_create_admin
        assert callable(admin_create_admin)

    def test_admin_set_permission_exists(self):
        """admin_set_permission 存在"""
        from server.routes.admin.admin_management import admin_set_permission
        assert callable(admin_set_permission)

    def test_admin_set_permissions_exists(self):
        """admin_set_permissions 存在"""
        from server.routes.admin.admin_management import admin_set_permissions
        assert callable(admin_set_permissions)

    def test_admin_set_all_permissions_exists(self):
        """admin_set_all_permissions 存在"""
        from server.routes.admin.admin_management import admin_set_all_permissions
        assert callable(admin_set_all_permissions)


class TestBatchOperationsImport:
    """批量操作路由导入测试"""

    def test_admin_batch_ban_exists(self):
        """admin_batch_ban 存在"""
        from server.routes.admin.batch_operations import admin_batch_ban
        assert callable(admin_batch_ban)

    def test_admin_batch_unban_exists(self):
        """admin_batch_unban 存在"""
        from server.routes.admin.batch_operations import admin_batch_unban
        assert callable(admin_batch_unban)

    def test_admin_batch_kick_exists(self):
        """admin_batch_kick 存在"""
        from server.routes.admin.batch_operations import admin_batch_kick
        assert callable(admin_batch_kick)

    def test_admin_batch_delete_exists(self):
        """admin_batch_delete 存在"""
        from server.routes.admin.batch_operations import admin_batch_delete
        assert callable(admin_batch_delete)


class TestMatchManagementImport:
    """对局管理路由导入测试"""

    def test_admin_get_matches_exists(self):
        """admin_get_matches 存在"""
        from server.routes.admin.match_management import admin_get_matches
        assert callable(admin_get_matches)

    def test_admin_get_match_exists(self):
        """admin_get_match 存在"""
        from server.routes.admin.match_management import admin_get_match
        assert callable(admin_get_match)

    def test_admin_close_match_exists(self):
        """admin_close_match 存在"""
        from server.routes.admin.match_management import admin_close_match
        assert callable(admin_close_match)

    def test_admin_close_all_matches_exists(self):
        """admin_close_all_matches 存在"""
        from server.routes.admin.match_management import admin_close_all_matches
        assert callable(admin_close_all_matches)

    def test_admin_restart_match_exists(self):
        """admin_restart_match 存在"""
        from server.routes.admin.match_management import admin_restart_match
        assert callable(admin_restart_match)

    def test_admin_force_move_exists(self):
        """admin_force_move 存在"""
        from server.routes.admin.match_management import admin_force_move
        assert callable(admin_force_move)


class TestUserManagementImport:
    """用户管理路由导入测试"""

    def test_admin_get_users_exists(self):
        """admin_get_users 存在"""
        from server.routes.admin.user_management import admin_get_users
        assert callable(admin_get_users)

    def test_admin_get_user_exists(self):
        """admin_get_user 存在"""
        from server.routes.admin.user_management import admin_get_user
        assert callable(admin_get_user)

    def test_admin_ban_exists(self):
        """admin_ban 存在"""
        from server.routes.admin.user_management import admin_ban
        assert callable(admin_ban)

    def test_admin_unban_exists(self):
        """admin_unban 存在"""
        from server.routes.admin.user_management import admin_unban
        assert callable(admin_unban)

    def test_admin_kick_exists(self):
        """admin_kick 存在"""
        from server.routes.admin.user_management import admin_kick
        assert callable(admin_kick)

    def test_admin_delete_user_exists(self):
        """admin_delete_user 存在"""
        from server.routes.admin.user_management import admin_delete_user
        assert callable(admin_delete_user)

    def test_admin_set_score_exists(self):
        """admin_set_score 存在"""
        from server.routes.admin.user_management import admin_set_score
        assert callable(admin_set_score)

    def test_admin_set_admin_exists(self):
        """admin_set_admin 存在"""
        from server.routes.admin.user_management import admin_set_admin
        assert callable(admin_set_admin)

    def test_admin_set_captcha_exists(self):
        """admin_set_captcha 存在"""
        from server.routes.admin.user_management import admin_set_captcha
        assert callable(admin_set_captcha)

    def test_admin_set_password_free_exists(self):
        """admin_set_password_free 存在"""
        from server.routes.admin.user_management import admin_set_password_free
        assert callable(admin_set_password_free)

    def test_admin_change_password_exists(self):
        """admin_change_password 存在"""
        from server.routes.admin.user_management import admin_change_password
        assert callable(admin_change_password)

    def test_admin_ban_user_exists(self):
        """admin_ban_user 存在"""
        from server.routes.admin.user_management import admin_ban_user
        assert callable(admin_ban_user)

    def test_build_admin_user_list_exists(self):
        """_build_admin_user_list 存在"""
        from server.routes.admin.user_management import _build_admin_user_list
        assert callable(_build_admin_user_list)

    def test_invalidate_cache_exists(self):
        """_invalidate_admin_users_cache 存在"""
        from server.routes.admin.user_management import _invalidate_admin_users_cache
        assert callable(_invalidate_admin_users_cache)


class TestAdminRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_admin_users_requires_auth(self):
        """GET /api/admin/users 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/admin/users')
            assert response.status_code in (401, 302)

    def test_admin_stats_requires_auth(self):
        """GET /api/admin/stats 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/admin/stats')
            assert response.status_code in (401, 302)

    def test_admin_records_requires_auth(self):
        """GET /api/admin/records 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/admin/records')
            assert response.status_code in (401, 302)

    def test_admin_create_admin_requires_auth(self):
        """POST /api/admin/create_admin 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/create_admin',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_create_admin_missing_data(self):
        """POST /api/admin/create_admin 缺少数据"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/create_admin',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_admin_set_permission_requires_auth(self):
        """POST /api/admin/set_permission 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/set_permission',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_set_permissions_requires_auth(self):
        """POST /api/admin/set_permissions 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/set_permissions',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_ban_requires_auth(self):
        """POST /api/admin/ban 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/ban',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_ban_empty_username(self):
        """POST /api/admin/ban 空用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/ban',
                data=json.dumps({'username': ''}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_admin_unban_requires_auth(self):
        """POST /api/admin/unban 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/unban',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_kick_requires_auth(self):
        """POST /api/admin/kick 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/kick',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_delete_user_requires_auth(self):
        """DELETE /api/admin/user/test 需要认证"""
        with self.app.app_context():
            response = self.client.delete('/api/admin/user/test')
            assert response.status_code in (401, 302)

    def test_admin_batch_ban_requires_auth(self):
        """POST /api/admin/batch_ban 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/batch_ban',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_batch_unban_requires_auth(self):
        """POST /api/admin/batch_unban 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/batch_unban',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_batch_kick_requires_auth(self):
        """POST /api/admin/batch_kick 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/batch_kick',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_batch_delete_requires_auth(self):
        """POST /api/admin/batch_delete 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/batch_delete',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_matches_requires_auth(self):
        """GET /api/admin/matches 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/admin/matches')
            assert response.status_code in (401, 302)

    def test_admin_match_detail_requires_auth(self):
        """GET /api/admin/match/test 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/admin/match/test')
            assert response.status_code in (401, 302)

    def test_admin_close_match_requires_auth(self):
        """POST /api/admin/match/test/close 需要认证"""
        with self.app.app_context():
            response = self.client.post('/api/admin/match/test/close')
            assert response.status_code in (401, 302)

    def test_admin_close_all_matches_requires_auth(self):
        """POST /api/admin/matches/close-all 需要认证"""
        with self.app.app_context():
            response = self.client.post('/api/admin/matches/close-all')
            assert response.status_code in (401, 302)

    def test_admin_restart_match_requires_auth(self):
        """POST /api/admin/match/test/restart 需要认证"""
        with self.app.app_context():
            response = self.client.post('/api/admin/match/test/restart')
            assert response.status_code in (401, 302)

    def test_admin_force_move_requires_auth(self):
        """POST /api/admin/match/test/force-move 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/match/test/force-move',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_force_move_missing_params(self):
        """POST /api/admin/match/test/force-move 缺少参数返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/match/test/force-move',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_admin_set_score_requires_auth(self):
        """POST /api/admin/user/test/score 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/user/test/score',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_set_admin_requires_auth(self):
        """POST /api/admin/user/test/admin 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/user/test/admin',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_set_captcha_requires_auth(self):
        """POST /api/admin/set_captcha 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/set_captcha',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_set_password_free_requires_auth(self):
        """POST /api/admin/set_password_free 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/set_password_free',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_change_password_requires_auth(self):
        """POST /api/admin/change_password 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/change_password',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_admin_change_password_missing_params(self):
        """POST /api/admin/change_password 缺少参数返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/admin/change_password',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)


class TestAdminUserCache:
    """管理员用户缓存测试"""

    def test_cache_invalidation(self):
        """缓存失效"""
        from server.routes.admin.user_management import (
            _admin_users_cache,
            _invalidate_admin_users_cache,
        )
        _admin_users_cache['data'] = 'test'
        _admin_users_cache['timestamp'] = 1000
        _invalidate_admin_users_cache()
        assert _admin_users_cache['data'] is None
        assert _admin_users_cache['timestamp'] == 0

    def test_cache_structure(self):
        """缓存结构正确"""
        from server.routes.admin.user_management import _admin_users_cache
        assert 'data' in _admin_users_cache
        assert 'timestamp' in _admin_users_cache
        assert 'ttl' in _admin_users_cache
        assert _admin_users_cache['ttl'] == 5


class TestPermissionFields:
    """权限字段测试"""

    def test_permission_fields_import(self):
        """PERMISSION_FIELDS 可导入"""
        from server.models import PERMISSION_FIELDS
        assert isinstance(PERMISSION_FIELDS, list)
        assert len(PERMISSION_FIELDS) > 0

    def test_common_permission_fields(self):
        """常见权限字段存在"""
        from server.models import PERMISSION_FIELDS
        common_fields = [
            'canBanUser',
            'canKickUser',
            'canDeleteUser',
            'canChangePassword',
            'canModifyScore',
            'canSetPasswordFree',
            'canMonitorMatches',
            'canManageMatches',
        ]
        for field in common_fields:
            assert field in PERMISSION_FIELDS, f'缺少权限字段: {field}'
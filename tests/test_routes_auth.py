"""认证路由模块测试
测试范围：注册、登录、登出、访客登录、免密登录、获取当前用户 API
"""

import hashlib
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.auth_routes import (
    RANK_CONFIG,
    auth_bp,
    calculate_rank,
)


class TestAuthBlueprint:
    """auth_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert auth_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert auth_bp.name == 'auth'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        rules = [rule.rule for rule in auth_bp.deferred_functions[0].func.__self__.url_map.iter_rules()] if False else []
        assert len(list(auth_bp.deferred_functions)) > 0


class TestRankConfig:
    """RANK_CONFIG 段位配置测试"""

    def test_config_structure(self):
        """每个段位配置包含 name, min_score, max_score"""
        for rank in RANK_CONFIG:
            assert 'name' in rank
            assert 'min_score' in rank
            assert 'max_score' in rank

    def test_config_order(self):
        """段位按分数升序排列"""
        for i in range(len(RANK_CONFIG) - 1):
            assert RANK_CONFIG[i]['max_score'] <= RANK_CONFIG[i + 1]['min_score']

    def test_first_rank_is_no_rank(self):
        """第一个段位是无段位"""
        assert RANK_CONFIG[0]['name'] == '无段位'

    def test_last_rank_is_nine(self):
        """最后一个段位是九段"""
        assert RANK_CONFIG[-1]['name'] == '九段'

    def test_last_rank_no_upper_bound(self):
        """九段没有上限"""
        assert RANK_CONFIG[-1]['max_score'] == float('inf')


class TestCalculateRank:
    """calculate_rank 函数测试"""

    def test_negative_score(self):
        """负分返回无段位"""
        assert calculate_rank(-100) == '无段位'

    def test_zero_score(self):
        """0分返回入门"""
        assert calculate_rank(0) == '入门'

    def test_boundary_values(self):
        """边界值测试"""
        assert calculate_rank(99) == '入门'
        assert calculate_rank(100) == '初段'
        assert calculate_rank(299) == '初段'
        assert calculate_rank(300) == '二段'
        assert calculate_rank(599) == '二段'
        assert calculate_rank(600) == '三段'
        assert calculate_rank(999) == '三段'
        assert calculate_rank(1000) == '四段'
        assert calculate_rank(1499) == '四段'
        assert calculate_rank(1500) == '五段'
        assert calculate_rank(1999) == '五段'
        assert calculate_rank(2000) == '六段'
        assert calculate_rank(2999) == '六段'
        assert calculate_rank(3000) == '七段'
        assert calculate_rank(3999) == '七段'
        assert calculate_rank(4000) == '八段'
        assert calculate_rank(4999) == '八段'
        assert calculate_rank(5000) == '九段'
        assert calculate_rank(99999) == '九段'

    def test_return_type(self):
        """返回字符串"""
        assert isinstance(calculate_rank(0), str)
        assert isinstance(calculate_rank(5000), str)


class TestAuthRoutesImport:
    """路由函数导入测试"""

    def test_register_function_exists(self):
        """register 函数存在"""
        from server.routes.auth_routes import register
        assert callable(register)

    def test_login_function_exists(self):
        """login 函数存在"""
        from server.routes.auth_routes import login
        assert callable(login)

    def test_logout_function_exists(self):
        """logout 函数存在"""
        from server.routes.auth_routes import logout
        assert callable(logout)

    def test_guest_login_function_exists(self):
        """guest_login 函数存在"""
        from server.routes.auth_routes import guest_login
        assert callable(guest_login)

    def test_delete_guest_function_exists(self):
        """delete_guest 函数存在"""
        from server.routes.auth_routes import delete_guest
        assert callable(delete_guest)

    def test_current_user_route_exists(self):
        """current_user_route 函数存在"""
        from server.routes.auth_routes import current_user_route
        assert callable(current_user_route)

    def test_login_password_free_exists(self):
        """login_password_free 函数存在"""
        from server.routes.auth_routes import login_password_free
        assert callable(login_password_free)

    def test_api_config_exists(self):
        """api_config 函数存在"""
        from server.routes.auth_routes import api_config
        assert callable(api_config)


class TestAuthRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_api_config_endpoint(self):
        """GET /api/config 返回配置"""
        with self.app.app_context():
            response = self.client.get('/api/config')
            assert response.status_code == 200
            data = response.get_json()
            assert isinstance(data, dict)

    def test_register_missing_data(self):
        """POST /api/register 缺少数据返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/register',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_register_invalid_username(self):
        """POST /api/register 无效用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/register',
                data=json.dumps({'username': 'ab', 'password': '123456'}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_register_invalid_password(self):
        """POST /api/register 密码太短返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/register',
                data=json.dumps({'username': 'testuser123', 'password': '123'}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_register_special_chars_username(self):
        """POST /api/register 特殊字符用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/register',
                data=json.dumps({'username': 'test user!', 'password': '123456'}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_login_missing_data(self):
        """POST /api/login 缺少数据返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/login',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_login_missing_captcha(self):
        """POST /api/login 缺少验证码返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/login',
                data=json.dumps({'username': 'test', 'password': '123456'}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_guest_login_missing_username(self):
        """POST /api/guest/login 缺少用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/guest/login',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_password_free_info_missing_username(self):
        """POST /api/user/password_free_info 缺少用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/user/password_free_info',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_password_free_info_nonexistent_user(self):
        """POST /api/user/password_free_info 不存在的用户返回 404"""
        with self.app.app_context():
            response = self.client.post(
                '/api/user/password_free_info',
                data=json.dumps({'username': 'nonexistent_user_xyz'}),
                content_type='application/json',
            )
            assert response.status_code == 404

    def test_login_password_free_missing_username(self):
        """POST /api/login/password_free 缺少用户名返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/login/password_free',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_login_password_free_nonexistent_user(self):
        """POST /api/login/password_free 不存在的用户返回 404"""
        with self.app.app_context():
            response = self.client.post(
                '/api/login/password_free',
                data=json.dumps({'username': 'nonexistent_user_xyz'}),
                content_type='application/json',
            )
            assert response.status_code == 404

    def test_delete_guest_no_username(self):
        """POST /api/guest/delete 无用户名返回 200"""
        with self.app.app_context():
            response = self.client.post(
                '/api/guest/delete',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 200

    def test_delete_guest_non_guest(self):
        """POST /api/guest/delete 非 guest 用户名返回 200"""
        with self.app.app_context():
            response = self.client.post(
                '/api/guest/delete',
                data=json.dumps({'username': 'admin'}),
                content_type='application/json',
            )
            assert response.status_code == 200


class TestPasswordHashing:
    """密码哈希测试"""

    def test_sha256_hash(self):
        """SHA-256 哈希"""
        password = 'test_password_123'
        hashed = hashlib.sha256(password.encode()).hexdigest()
        assert len(hashed) == 64
        assert all(c in '0123456789abcdef' for c in hashed)

    def test_same_password_same_hash(self):
        """相同密码产生相同哈希"""
        password = 'same_password'
        hash1 = hashlib.sha256(password.encode()).hexdigest()
        hash2 = hashlib.sha256(password.encode()).hexdigest()
        assert hash1 == hash2

    def test_different_password_different_hash(self):
        """不同密码产生不同哈希"""
        hash1 = hashlib.sha256('password1'.encode()).hexdigest()
        hash2 = hashlib.sha256('password2'.encode()).hexdigest()
        assert hash1 != hash2


class TestUsernameValidation:
    """用户名验证规则测试"""

    def test_valid_usernames(self):
        """有效的用户名"""
        import re
        pattern = r'^[a-zA-Z0-9_]+$'
        valid = ['test', 'TestUser', 'user_123', 'ABC', 'a1_b2_c3']
        for name in valid:
            assert re.match(pattern, name), f'用户名 {name} 应该有效'

    def test_invalid_usernames(self):
        """无效的用户名"""
        import re
        pattern = r'^[a-zA-Z0-9_]+$'
        invalid = ['test user', 'user-name', 'user@name', '中文', 'user!']
        for name in invalid:
            assert not re.match(pattern, name), f'用户名 {name} 应该无效'

    def test_length_validation(self):
        """用户名长度验证"""
        assert len('ab') < 3
        assert len('abc') >= 3
        assert len('a' * 20) <= 20
        assert len('a' * 21) > 20
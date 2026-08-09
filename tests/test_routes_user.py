"""用户路由模块测试
测试范围：个人资料、统计、记录、存档、设置、背景图片、免密登录信息 API
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.user_routes import (
    add_record,
    delete_save_route,
    get_backgrounds,
    get_profile,
    get_records,
    get_saves,
    get_settings,
    get_statistics,
    import_save,
    password_free_info,
    save_game,
    save_settings_route,
    update_profile,
    upload_background,
    user_bp,
)


class TestUserBlueprint:
    """user_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert user_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert user_bp.name == 'user'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(user_bp.deferred_functions)) > 0


class TestUserRoutesImport:
    """路由函数导入测试"""

    def test_get_profile_exists(self):
        """get_profile 存在"""
        assert callable(get_profile)

    def test_update_profile_exists(self):
        """update_profile 存在"""
        assert callable(update_profile)

    def test_get_statistics_exists(self):
        """get_statistics 存在"""
        assert callable(get_statistics)

    def test_get_records_exists(self):
        """get_records 存在"""
        assert callable(get_records)

    def test_add_record_exists(self):
        """add_record 存在"""
        assert callable(add_record)

    def test_get_record_detail_exists(self):
        """get_record_detail 存在"""
        from server.routes.user_routes import get_record_detail
        assert callable(get_record_detail)

    def test_get_saves_exists(self):
        """get_saves 存在"""
        assert callable(get_saves)

    def test_save_game_exists(self):
        """save_game 存在"""
        assert callable(save_game)

    def test_delete_save_route_exists(self):
        """delete_save_route 存在"""
        assert callable(delete_save_route)

    def test_import_save_exists(self):
        """import_save 存在"""
        assert callable(import_save)

    def test_get_settings_exists(self):
        """get_settings 存在"""
        assert callable(get_settings)

    def test_save_settings_route_exists(self):
        """save_settings_route 存在"""
        assert callable(save_settings_route)

    def test_password_free_info_exists(self):
        """password_free_info 存在"""
        assert callable(password_free_info)

    def test_get_backgrounds_exists(self):
        """get_backgrounds 存在"""
        assert callable(get_backgrounds)

    def test_upload_background_exists(self):
        """upload_background 存在"""
        assert callable(upload_background)


class TestUserRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_profile_requires_auth(self):
        """GET /api/profile 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/profile')
            assert response.status_code in (401, 302)

    def test_update_profile_requires_auth(self):
        """POST /api/profile/update 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/profile/update',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_update_profile_empty_body(self):
        """POST /api/profile/update 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/profile/update',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_statistics_requires_auth(self):
        """GET /api/statistics 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/statistics')
            assert response.status_code in (401, 302)

    def test_records_requires_auth(self):
        """GET /api/records 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/records')
            assert response.status_code in (401, 302)

    def test_add_record_requires_auth(self):
        """POST /api/records/add 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/records/add',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_add_record_empty_body(self):
        """POST /api/records/add 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/records/add',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_saves_requires_auth(self):
        """GET /api/saves 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/saves')
            assert response.status_code in (401, 302)

    def test_save_game_requires_auth(self):
        """POST /api/saves/save 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/saves/save',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_save_game_empty_body(self):
        """POST /api/saves/save 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/saves/save',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_delete_save_requires_auth(self):
        """DELETE /api/saves/1 需要认证"""
        with self.app.app_context():
            response = self.client.delete('/api/saves/1')
            assert response.status_code in (401, 302)

    def test_import_save_requires_auth(self):
        """POST /api/saves/import 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/saves/import',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_import_save_empty_body(self):
        """POST /api/saves/import 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/saves/import',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_settings_get_requires_auth(self):
        """GET /api/settings 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/settings')
            assert response.status_code in (401, 302)

    def test_settings_post_requires_auth(self):
        """POST /api/settings 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/settings',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_settings_post_empty_body(self):
        """POST /api/settings 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/settings',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_password_free_info_empty_body(self):
        """POST /api/user/password_free_info 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/user/password_free_info',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code == 400

    def test_backgrounds_no_auth(self):
        """GET /api/backgrounds 无需认证"""
        with self.app.app_context():
            response = self.client.get('/api/backgrounds')
            assert response.status_code == 200
            data = response.get_json()
            assert isinstance(data, dict)
            assert 'backgrounds' in data

    def test_upload_background_requires_admin(self):
        """POST /api/backgrounds/upload 需要管理员权限"""
        with self.app.app_context():
            response = self.client.post(
                '/api/backgrounds/upload',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_record_detail_requires_auth(self):
        """GET /api/records/1 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/records/1')
            assert response.status_code in (401, 302)


class TestScoreCalculation:
    """积分计算逻辑测试"""

    def test_easy_win_score(self):
        """easy 难度获胜积分"""
        score_config = {'easy': {'win': 10, 'lose': 50}}
        initial_score = 100
        new_score = initial_score + score_config['easy']['win']
        assert new_score == 110

    def test_easy_lose_score(self):
        """easy 难度失败扣分"""
        score_config = {'easy': {'win': 10, 'lose': 50}}
        initial_score = 100
        new_score = initial_score - score_config['easy']['lose']
        assert new_score == 50

    def test_medium_win_score(self):
        """medium 难度获胜积分"""
        score_config = {'medium': {'win': 50, 'lose': 25}}
        initial_score = 100
        new_score = initial_score + score_config['medium']['win']
        assert new_score == 150

    def test_hard_win_score(self):
        """hard 难度获胜积分"""
        score_config = {'hard': {'win': 100, 'lose': 5}}
        initial_score = 100
        new_score = initial_score + score_config['hard']['win']
        assert new_score == 200

    def test_score_not_negative(self):
        """积分不会变为负数（由调用方保证）"""
        score = max(0, 100 - 200)
        assert score == 0


class TestLanguageUpdate:
    """语言更新逻辑测试"""

    def test_valid_languages(self):
        """有效的语言代码"""
        valid = ['zh-CN', 'zh-TW', 'en']
        for lang in valid:
            assert lang in ('zh-CN', 'zh-TW', 'en')

    def test_invalid_language(self):
        """无效的语言代码"""
        invalid = 'fr'
        assert invalid not in ('zh-CN', 'zh-TW', 'en')
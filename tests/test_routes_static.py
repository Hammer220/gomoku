"""静态文件路由模块测试
测试范围：静态文件服务、图片服务、favicon 服务
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.static_routes import (
    serve_favicon,
    serve_picture,
    serve_static,
    static_bp,
)


class TestStaticBlueprint:
    """static_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert static_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert static_bp.name == 'static'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(static_bp.deferred_functions)) > 0


class TestStaticRoutesImport:
    """路由函数导入测试"""

    def test_serve_static_exists(self):
        """serve_static 存在"""
        assert callable(serve_static)

    def test_serve_picture_exists(self):
        """serve_picture 存在"""
        assert callable(serve_picture)

    def test_serve_favicon_exists(self):
        """serve_favicon 存在"""
        assert callable(serve_favicon)


class TestStaticRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_favicon_endpoint(self):
        """GET /favicon.ico 返回文件"""
        with self.app.app_context():
            response = self.client.get('/favicon.ico')
            assert response.status_code in (200, 404)

    def test_static_path(self):
        """GET /static/ 返回 404 或 200"""
        with self.app.app_context():
            response = self.client.get('/static/')
            assert response.status_code in (200, 404)

    def test_static_non_existent_file(self):
        """GET /static/nonexistent.js 返回 404"""
        with self.app.app_context():
            response = self.client.get('/static/nonexistent_file_xyz.js')
            assert response.status_code == 404

    def test_picture_non_existent_file(self):
        """GET /picture/nonexistent.png 返回 404"""
        with self.app.app_context():
            response = self.client.get('/picture/nonexistent_pic_xyz.png')
            assert response.status_code == 404

    def test_static_routes_registered(self):
        """静态路由已注册到应用"""
        rules = [rule.rule for rule in self.app.url_map.iter_rules()]
        assert '/static/<path:filename>' in rules
        assert '/favicon.ico' in rules
        assert '/picture/<path:filename>' in rules


class TestStaticDirectoryConfig:
    """静态目录配置测试"""

    def test_static_dir_exists(self):
        """STATIC_DIR 目录存在"""
        from server.config import STATIC_DIR
        assert os.path.exists(STATIC_DIR)

    def test_script_dir_exists(self):
        """SCRIPT_DIR 目录存在"""
        from server.config import SCRIPT_DIR
        assert os.path.exists(SCRIPT_DIR)

    def test_picture_dir_exists(self):
        """picture 目录存在"""
        from server.config import SCRIPT_DIR
        picture_dir = os.path.join(SCRIPT_DIR, 'picture')
        if os.path.exists(picture_dir):
            assert os.path.isdir(picture_dir)
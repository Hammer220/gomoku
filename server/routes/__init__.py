"""路由注册模块
负责将所有蓝图（Blueprint）注册到 Flask 应用，并定义页面路由。
"""

import os
from flask import send_from_directory, render_template

from .auth_routes import auth_bp
from .user_routes import user_bp
from .admin_routes import admin_bp
from .match_routes import match_bp
from .game_routes import game_bp
from .static_routes import static_bp


def register_routes(app):
    """将所有蓝图注册到 Flask 应用"""
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(static_bp)

    # 登录页面
    @app.route('/')
    @app.route('/login')
    def login_page():
        return render_template('login.html')

    # 游戏大厅页面
    @app.route('/game')
    def game_page():
        return render_template('game.html')

    # 个人中心页面
    @app.route('/user')
    def user_page():
        return render_template('user.html')

    # 管理后台页面
    @app.route('/admin')
    def admin_page():
        return render_template('admin.html')

    # 404 错误处理：返回登录页面
    @app.errorhandler(404)
    def not_found(e):
        return render_template('login.html'), 200
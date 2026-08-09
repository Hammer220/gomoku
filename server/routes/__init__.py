"""路由注册模块
负责将所有蓝图（Blueprint）注册到 Flask 应用，并定义页面路由。
"""

from flask import render_template

from ..auth import login_required
from .admin_routes import admin_bp
from .auth_routes import auth_bp
from .game_routes import game_bp
from .match_routes import match_bp
from .message_routes import message_bp
from .static_routes import static_bp
from .user_routes import user_bp


def register_routes(app):
    """将所有蓝图注册到 Flask 应用"""
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(static_bp)
    app.register_blueprint(message_bp)

    # 登录页面
    @app.route('/')
    @app.route('/login')
    def login_page():
        return render_template('login.html')

    # 注册页面（复用登录页面模板，前端通过 URL 判断显示注册弹窗）
    @app.route('/register')
    def register_page():
        return render_template('login.html')

    # 游戏大厅页面
    @app.route('/game')
    @login_required
    def game_page():
        return render_template('game.html')

    # 游戏大厅页面（带房间号，直接访问链接进入房间）
    @app.route('/game/<match_id>')
    @login_required
    def game_page_with_match(match_id):
        return render_template('game.html', match_id=match_id)

    # 联机页面（无房间号）
    @app.route('/online')
    @login_required
    def online_page():
        return render_template('game.html')

    # 联机页面（带房间号，直接访问链接进入房间）
    @app.route('/online/<match_id>')
    @login_required
    def online_page_with_match(match_id):
        return render_template('game.html', match_id=match_id)

    # 个人中心页面
    @app.route('/user')
    @login_required
    def user_page():
        return render_template('user.html')

    # 管理后台页面
    @app.route('/admin')
    @login_required
    def admin_page():
        return render_template('admin.html')

    # 消息页面
    @app.route('/messages')
    @login_required
    def messages_page():
        return render_template('messages.html')

    # 设置页面
    @app.route('/settings')
    @login_required
    def settings_page():
        return render_template('settings.html')

    # 观战页面（公开访问，通过 room + token 验证）
    @app.route('/spectate')
    def spectate_page():
        return render_template('spectate.html')

    # 404 错误处理：返回登录页面
    @app.errorhandler(404)
    def not_found(e):
        return render_template('login.html'), 200
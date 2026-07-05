import os
from flask import send_from_directory, render_template

from .auth_routes import auth_bp
from .user_routes import user_bp
from .admin_routes import admin_bp
from .match_routes import match_bp
from .game_routes import game_bp
from .static_routes import static_bp

def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(game_bp)
    app.register_blueprint(static_bp)

    @app.route('/')
    @app.route('/gomoku.html')
    def index():
        return render_template('index.html')

    @app.errorhandler(404)
    def not_found(e):
        return render_template('index.html'), 200
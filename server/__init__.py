"""Flask 应用工厂模块
创建并配置 Flask 应用实例，注册路由蓝图，设置密钥和静态文件目录。
"""

import os
from flask import Flask, send_from_directory
import secrets

from .config import cfg, SCRIPT_DIR, STATIC_DIR, get_config
from .logger import setup_logging, logger

def create_app():
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static',
                template_folder=os.path.join(SCRIPT_DIR, 'templates'))
    app.secret_key = secrets.token_hex(32)

    setup_logging()

    from .routes import register_routes
    register_routes(app)

    from .match_manager import init_matches, start_cleanup_task
    init_matches()
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        start_cleanup_task()

    return app
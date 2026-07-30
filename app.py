"""应用入口模块
启动 Flask 应用服务器，初始化日志系统和管理员账号。
"""

import os
import sys
from flask import Flask

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from server.config import PORT
from server.models import init_admin
from server import create_app, socketio

if __name__ == '__main__':
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        app = create_app()
        init_admin()
        from server.logger import logger
        logger.info(f'五子棋服务启动在端口 {PORT}')
    else:
        app = Flask(__name__)
    socketio.run(app, host='0.0.0.0', port=PORT, debug=True)
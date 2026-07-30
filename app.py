"""应用入口模块
启动 Flask 应用服务器，初始化日志系统和管理员账号。
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

if __name__ == '__main__':
    from server.config import PORT
    from server import create_app, socketio

    app = create_app()
    from server.models import init_admin
    from server.logger import logger
    init_admin()
    logger.info(f'五子棋服务启动在端口 {PORT}')
    socketio.run(app, host='0.0.0.0', port=PORT)
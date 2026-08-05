"""应用入口模块
启动 Flask 应用服务器，初始化日志系统和管理员账号。
"""

import os
import socket
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == '__main__':
    from server.config import PORT
    from server import create_app, socketio

    app = create_app()
    from server.models import init_admin
    from server.logger import logger
    init_admin()
    local_ip = get_local_ip()
    logger.info(f'五子棋服务启动在端口 {PORT}')
    print(f'\n========================================')
    print(f'本机访问: http://localhost:{PORT} 或 http://127.0.0.1:{PORT}')
    print(f'局域网访问: http://{local_ip}:{PORT}')
    print(f'========================================\n')
    socketio.run(app, host='0.0.0.0', port=PORT,debug=True)
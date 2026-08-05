"""应用入口模块
启动 Flask 应用服务器，初始化日志系统和管理员账号。
"""

import atexit
import logging
import os
import signal
import socket
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

_shutting_down = False


def _cleanup_logging():
    """在进程退出前清理所有日志 handler，避免 gevent greenlet 销毁时的异常。"""
    for name in list(logging.root.manager.loggerDict):
        logger_obj = logging.getLogger(name)
        for handler in list(logger_obj.handlers):
            logger_obj.removeHandler(handler)
            try:
                handler.close()
            except Exception:
                pass
    for handler in list(logging.root.handlers):
        logging.root.removeHandler(handler)
        try:
            handler.close()
        except Exception:
            pass


def _signal_handler(signum, frame):
    global _shutting_down
    if _shutting_down:
        return
    _shutting_down = True
    print('\n正在关闭服务...')
    _cleanup_logging()
    sys.exit(0)


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
    signal.signal(signal.SIGINT, _signal_handler)
    atexit.register(_cleanup_logging)

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
    try:
        socketio.run(app, host='0.0.0.0', port=PORT, debug=True)
    except KeyboardInterrupt:
        pass
    finally:
        _cleanup_logging()
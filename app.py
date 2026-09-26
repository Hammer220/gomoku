"""应用入口模块
启动 Flask 应用服务器，初始化日志系统和管理员账号。
"""

import atexit
import logging
import os
import socket
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)


def _cleanup_logging():
    """进程退出前清理 root logger handlers。

    只处理 logging.root，不遍历 loggerDict 逐个 removeHandler：
    遍历 loggerDict 后调用 removeHandler 会让 handler 失去强引用，
    在 gevent greenlet 析构时触发 logging 模块 weakref 回调
    _removeHandlerRef → _acquireLock → gevent.thread.get_ident()，
    抛出 RuntimeError: greenlet is being finalized。
    仅对 root.handlers 做 flush+close 即可满足正常退出场景。
    """
    for handler in list(logging.root.handlers):
        logging.root.removeHandler(handler)
        try:
            handler.flush()
        except Exception:
            pass
        try:
            handler.close()
        except Exception:
            pass


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
    atexit.register(_cleanup_logging)

    from server.config import PORT
    from server import create_app, socketio

    app = create_app()
    from server.logger import logger

    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    local_ip = get_local_ip()
    logger.info(f'五子棋服务启动在端口 {PORT}' + (' (debug 模式)' if debug_mode else ''))
    print(f'\n========================================')
    print(f'本机访问: http://localhost:{PORT} 或 http://127.0.0.1:{PORT}')
    print(f'局域网访问: http://{local_ip}:{PORT}')
    if debug_mode:
        print(f'debug 模式已开启: 设置 FLASK_DEBUG=1 启用')
    print(f'========================================\n')
    socketio.run(app, host='0.0.0.0', port=PORT, debug=debug_mode)  # type: ignore[arg-type]

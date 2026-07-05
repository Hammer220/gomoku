#!/usr/bin/env python3
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from server.logger import setup_logging
from server.config import PORT
from server.models import init_admin
from server import create_app

logger, _ = setup_logging()

if __name__ == '__main__':
    init_admin()
    app = create_app()
    logger.info(f'五子棋服务启动在端口 {PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=True, threaded=True)
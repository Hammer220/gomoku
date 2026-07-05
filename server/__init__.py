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
    start_cleanup_task()

    @app.after_request
    def log_request(response):
        from flask import request
        from datetime import datetime
        import logging
        access_logger = logging.getLogger('access')
        remote_addr = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
        log_line = f'{remote_addr} - - [{datetime.now().strftime("%d/%b/%Y %H:%M:%S")}] "{request.method} {request.path} HTTP/1.1" {response.status_code}'
        access_logger.info(log_line)
        return response

    return app
import os
from flask import Blueprint, send_from_directory

from ..config import SCRIPT_DIR, STATIC_DIR

static_bp = Blueprint('static', __name__)

@static_bp.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@static_bp.route('/picture/<path:filename>')
def serve_picture(filename):
    picture_dir = os.path.join(SCRIPT_DIR, 'picture')
    return send_from_directory(picture_dir, filename)

@static_bp.route('/favicon.ico')
def serve_favicon():
    return send_from_directory(SCRIPT_DIR, 'favicon.ico')
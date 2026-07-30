"""Flask 应用工厂模块
创建并配置 Flask 应用实例，注册路由蓝图，设置密钥和静态文件目录。
"""

import os
from flask import Flask, send_from_directory, request as socket_request
import secrets
from flask_socketio import SocketIO, emit, join_room, leave_room

from .config import cfg, SCRIPT_DIR, STATIC_DIR, get_config
from .logger import setup_logging, logger

socketio = SocketIO()

def create_app():
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static',
                template_folder=os.path.join(SCRIPT_DIR, 'templates'))
    app.secret_key = secrets.token_hex(32)

    setup_logging()

    from .db import init_db, migrate_from_json
    init_db()
    migrate_from_json()

    from .routes import register_routes
    register_routes(app)

    from .match_manager import init_matches, start_cleanup_task
    init_matches()
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        start_cleanup_task()

    socketio.init_app(app, cors_allowed_origins="*", async_mode='gevent',
                      ping_timeout=30, ping_interval=25)

    register_socket_events(socketio)

    return app

def register_socket_events(sio):
    """注册Socket.IO事件处理器"""

    sid_to_match = {}

    @sio.on('connect')
    def handle_connect():
        logger.info(f'客户端已连接: {socket_request.sid}')

    @sio.on('disconnect')
    def handle_disconnect():
        sid = socket_request.sid
        logger.info(f'客户端已断开: {sid}')

        # 通知房间内其他用户该客户端已断开
        match_id = sid_to_match.pop(sid, None)
        if match_id:
            logger.info(f'断线客户端所在房间: {match_id}，通知房间内其他用户')
            emit('opponent_disconnected', {'match_id': match_id}, room=match_id)

    @sio.on('join')
    def handle_join(data):
        match_id = data.get('match_id')
        if match_id:
            join_room(match_id)
            sid_to_match[socket_request.sid] = match_id
            logger.info(f'客户端加入房间: {match_id}, sid: {socket_request.sid}')

    @sio.on('leave')
    def handle_leave(data):
        match_id = data.get('match_id')
        if match_id:
            leave_room(match_id)
            sid_to_match.pop(socket_request.sid, None)
            logger.info(f'客户端离开房间: {match_id}, sid: {socket_request.sid}')

    @sio.on('match_update')
    def handle_match_update(data):
        match_id = data.get('match_id')
        if match_id:
            emit('match_updated', data, room=match_id, include_self=False)

    @sio.on('game_move')
    def handle_game_move(data):
        match_id = data.get('match_id')
        if match_id:
            emit('move_made', data, room=match_id, include_self=False)

    @sio.on('request_undo')
    def handle_undo_request(data):
        match_id = data.get('match_id')
        if match_id:
            emit('undo_requested', data, room=match_id, include_self=False)

    @sio.on('request_draw')
    def handle_draw_request(data):
        match_id = data.get('match_id')
        if match_id:
            emit('draw_requested', data, room=match_id, include_self=False)

    @sio.on('heartbeat')
    def handle_heartbeat(data):
        emit('heartbeat_ack', data)
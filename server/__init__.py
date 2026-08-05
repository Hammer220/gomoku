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

    socketio.init_app(app, cors_allowed_origins="*",
                      ping_timeout=30, ping_interval=25)

    register_socket_events(socketio)

    return app

def register_socket_events(sio):
    """注册Socket.IO事件处理器"""

    sid_to_match = {}
    sid_to_user = {}
    username_to_sids = {}

    @sio.on('connect')
    def handle_connect():
        logger.info(f'客户端已连接: {socket_request.sid}')

    @sio.on('disconnect')
    def handle_disconnect():
        sid = socket_request.sid
        logger.info(f'客户端已断开: {sid}')

        match_id = sid_to_match.pop(sid, None)
        username = sid_to_user.pop(sid, None)

        if username and username in username_to_sids:
            username_to_sids[username].discard(sid)
            if not username_to_sids[username]:
                del username_to_sids[username]

        if match_id and username:
            logger.info(f'断线客户端所在房间: {match_id}，用户: {username}，通知房间内其他用户')
            emit('opponent_disconnected', {
                'match_id': match_id,
                'username': username,
                'message': f'{username} 已断开连接'
            }, room=match_id)

    @sio.on('register_user')
    def handle_register_user(data):
        username = data.get('username')
        if username:
            sid_to_user[socket_request.sid] = username
            if username not in username_to_sids:
                username_to_sids[username] = set()
            username_to_sids[username].add(socket_request.sid)
            logger.info(f'用户注册到WebSocket: {username}, sid: {socket_request.sid}')

    @sio.on('join')
    def handle_join(data):
        match_id = data.get('match_id')
        username = data.get('username')
        if match_id:
            join_room(match_id)
            sid_to_match[socket_request.sid] = match_id
            if username:
                sid_to_user[socket_request.sid] = username
            logger.info(f'客户端加入房间: {match_id}, sid: {socket_request.sid}, username: {username}')

    @sio.on('leave')
    def handle_leave(data):
        match_id = data.get('match_id')
        username = data.get('username')
        if match_id:
            leave_room(match_id)
            sid_to_match.pop(socket_request.sid, None)
            sid_to_user.pop(socket_request.sid, None)
            logger.info(f'客户端离开房间: {match_id}, sid: {socket_request.sid}, username: {username}')

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

    @sio.on('room_chat')
    def handle_room_chat(data):
        """处理房间聊天消息"""
        from .match.storage import add_room_chat_message

        match_id = data.get('match_id')
        username = data.get('username')
        message = data.get('message', '').strip()

        if not match_id or not username or not message:
            return

        chat_msg = add_room_chat_message(match_id, username, message)
        if chat_msg:
            emit('room_chat_message', chat_msg, room=match_id)

    def push_user_status_update(username, user_data):
        """向指定用户推送用户状态更新"""
        if username in username_to_sids:
            for sid in username_to_sids[username]:
                sio.emit('user_status_update', user_data, room=sid)

    def push_unread_count_update(username, unread_count):
        """向指定用户推送未读消息数更新"""
        if username in username_to_sids:
            for sid in username_to_sids[username]:
                sio.emit('unread_count_update', {'unreadCount': unread_count}, room=sid)

    def push_message_read_update(sender_username, message_id, read_by):
        """向消息发送者推送消息已读状态更新"""
        if sender_username in username_to_sids:
            for sid in username_to_sids[sender_username]:
                sio.emit('message_read_update', {
                    'messageId': message_id,
                    'readBy': read_by
                }, room=sid)

    def push_ban_notification(username, banned_until):
        """向指定用户推送封禁通知"""
        if username in username_to_sids:
            for sid in username_to_sids[username]:
                sio.emit('banned_notification', {'bannedUntil': banned_until}, room=sid)

    sio.push_user_status_update = push_user_status_update
    sio.push_unread_count_update = push_unread_count_update
    sio.push_message_read_update = push_message_read_update
    sio.push_ban_notification = push_ban_notification
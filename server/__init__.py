"""Flask 应用工厂模块
创建并配置Flask应用实例，注册路由蓝图，设置密钥和静态文件目录。
"""

import json
import os
import secrets

from flask import Flask
from flask import request as socket_request
from flask_socketio import SocketIO, emit, join_room, leave_room

from .config import SCRIPT_DIR, STATIC_DIR
from .logger import logger, setup_logging

socketio = SocketIO()


def create_app():
    app = Flask(
        __name__,
        static_folder=STATIC_DIR,
        static_url_path='/static',
        template_folder=os.path.join(SCRIPT_DIR, 'templates'),
    )
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

    socketio.init_app(app, cors_allowed_origins='*', ping_timeout=30, ping_interval=25)

    register_socket_events(socketio)

    return app


def _build_match_event(match):
    """构建用于 Socket.IO 广播的赛事数据"""
    return {
        'match_id': match['id'],
        'id': match['id'],
        'status': match['status'],
        'board': [row[:] for row in match['board']],
        'currentPlayer': match['currentPlayer'],
        'moves': match['moves'][:],
        'winner': match.get('winner'),
        'creatorColor': match.get('creatorColor'),
        'creator': match.get('creator'),
        'opponent': match.get('opponent'),
        'timeMode': match.get('timeMode', 'untimed'),
        'blackTime': match.get('blackTime', 600),
        'whiteTime': match.get('whiteTime', 600),
        'moveDeadline': match.get('moveDeadline', 0),
        'totalTime': match.get('totalTime', 600),
        'moveTime': match.get('moveTime', 30),
        'restartRequested': match.get('restartRequested', False),
        'restartRequestedBy': match.get('restartRequestedBy'),
        'restartDeclinedBy': match.get('restartDeclinedBy'),
        'restartAccepted': match.get('restartAccepted', False),
        'restartInitiated': match.get('restartInitiated', False),
        'restartVersion': match.get('restartVersion', 0),
        'undoRequested': match.get('undoRequested', False),
        'undoRequestedBy': match.get('undoRequestedBy'),
        'undoAccepted': match.get('undoAccepted', False),
        'undoDeclined': match.get('undoDeclined', False),
        'undoDeclinedBy': match.get('undoDeclinedBy'),
        'drawRequested': match.get('drawRequested', False),
        'drawRequestedBy': match.get('drawRequestedBy'),
        'drawAccepted': match.get('drawAccepted', False),
        'drawDeclined': match.get('drawDeclined', False),
        'drawDeclinedBy': match.get('drawDeclinedBy'),
        'spectatorCount': len(match.get('spectators', [])),
        'ruleMode': match.get('ruleMode', 'standard'),
        'inviteOnly': match.get('inviteOnly', False),
        'invitedFriends': match.get('invitedFriends', []),
        'timestamp': __import__('time').time(),
    }


def _emit_match_update(sio, match_id):
    """通过 Socket.IO 向房间广播赛事更新"""
    try:
        from .match.storage import active_matches, active_matches_lock

        with active_matches_lock:
            if match_id in active_matches:
                match = active_matches[match_id]
                event_data = _build_match_event(match)
        sio.emit('match_updated', event_data, room=match_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Socket.IO emit failed for match {match_id}: {e}')


def register_socket_events(sio):
    """注册Socket.IO事件处理器，包括游戏动作的WebSocket处理"""

    sid_to_match = {}
    sid_to_user = {}
    username_to_sids = {}

    def _get_user_from_sid(sid):
        """从sid获取用户对象"""
        username = sid_to_user.get(sid)
        if not username:
            return None
        from .models import get_user

        return get_user(username)

    def _ws_error_response(sid, error_msg):
        """向单个客户端发送错误响应"""
        sio.emit('ws_error', {'error': error_msg}, room=sid)

    def _ws_success_response(sid, data):
        """向单个客户端发送成功响应"""
        sio.emit('ws_response', data, room=sid)

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
            emit(
                'opponent_disconnected',
                {'match_id': match_id, 'username': username, 'message': f'{username} 已断开连接'},
                room=match_id,
            )

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

    # ==================== WebSocket 游戏动作处理 ====================

    @sio.on('ws_game_move')
    def handle_ws_game_move(data):
        """通过WebSocket处理落子操作"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        row = data.get('row')
        col = data.get('col')

        if match_id is None or row is None or col is None:
            return _ws_error_response(sid, '参数不完整')

        try:
            from .match_manager import make_move

            result = make_move(user, match_id, row, col)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            if isinstance(result_data, dict) and result_data.get('error'):
                return _ws_error_response(sid, result_data['error'])

            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'move', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket落子错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_undo_request')
    def handle_ws_undo_request(data):
        """通过WebSocket处理悔棋请求"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import request_undo

            result = request_undo(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'undo_request', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket悔棋请求错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_undo_accept')
    def handle_ws_undo_accept(data):
        """通过WebSocket处理接受悔棋"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import accept_undo

            result = accept_undo(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'undo_accept', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket接受悔棋错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_undo_decline')
    def handle_ws_undo_decline(data):
        """通过WebSocket处理拒绝悔棋"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import decline_undo

            result = decline_undo(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'undo_decline', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket拒绝悔棋错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_draw_request')
    def handle_ws_draw_request(data):
        """通过WebSocket处理和棋请求"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import request_draw

            result = request_draw(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'draw_request', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket和棋请求错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_draw_accept')
    def handle_ws_draw_accept(data):
        """通过WebSocket处理接受和棋"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import accept_draw

            result = accept_draw(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'draw_accept', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket接受和棋错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_draw_decline')
    def handle_ws_draw_decline(data):
        """通过WebSocket处理拒绝和棋"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import decline_draw

            result = decline_draw(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'draw_decline', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket拒绝和棋错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_resign')
    def handle_ws_resign(data):
        """通过WebSocket处理认输"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import resign

            result = resign(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'resign', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket认输错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_restart')
    def handle_ws_restart(data):
        """通过WebSocket处理重新开始请求"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import restart_match

            result = restart_match(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'restart', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket重开请求错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_restart_decline')
    def handle_ws_restart_decline(data):
        """通过WebSocket处理拒绝重开"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import decline_restart

            result = decline_restart(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _emit_match_update(sio, match_id)
            _ws_success_response(sid, {'action': 'restart_decline', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket拒绝重开错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_close_room')
    def handle_ws_close_room(data):
        """通过WebSocket处理关闭房间"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import close_match

            _emit_match_update(sio, match_id)
            result = close_match(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _ws_success_response(sid, {'action': 'close_room', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket关闭房间错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_leave_room')
    def handle_ws_leave_room(data):
        """通过WebSocket处理离开房间"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return _ws_error_response(sid, '未登录')

        match_id = data.get('matchId') or data.get('match_id')
        if not match_id:
            return _ws_error_response(sid, '缺少房间ID')

        try:
            from .match_manager import leave_match

            result = leave_match(user, match_id)
            _emit_match_update(sio, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _ws_success_response(sid, {'action': 'leave_room', 'result': result_data})
        except Exception as e:  # noqa: BLE001
            logger.error(f'WebSocket离开房间错误: {e}')
            _ws_error_response(sid, str(e))

    @sio.on('ws_heartbeat')
    def handle_ws_heartbeat(data):
        """通过WebSocket处理心跳"""
        sid = socket_request.sid
        user = _get_user_from_sid(sid)
        if not user:
            return

        data.get('matchId') or data.get('match_id')
        try:
            from .match_manager import heartbeat

            heartbeat(user)
            _ws_success_response(sid, {'action': 'heartbeat', 'result': {'success': True}})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'WebSocket心跳错误: {e}')

    # ==================== 兼容旧的简单事件（仅转发） ====================

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

    # ==================== 推送辅助函数 ====================

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
                sio.emit('message_read_update', {'messageId': message_id, 'readBy': read_by}, room=sid)

    def push_ban_notification(username, banned_until):
        """向指定用户推送封禁通知"""
        if username in username_to_sids:
            for sid in username_to_sids[username]:
                sio.emit('banned_notification', {'bannedUntil': banned_until}, room=sid)

    sio.push_user_status_update = push_user_status_update
    sio.push_unread_count_update = push_unread_count_update
    sio.push_message_read_update = push_message_read_update
    sio.push_ban_notification = push_ban_notification
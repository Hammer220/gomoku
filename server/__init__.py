"""Flask 应用工厂模块
创建并配置Flask应用实例，注册路由蓝图，设置密钥和静态文件目录。
"""

import json
import mimetypes
import os
import secrets
import time
from typing import TYPE_CHECKING, Any, Callable

from flask import Flask
from flask import request as socket_request
from flask_socketio import SocketIO, emit, join_room, leave_room

from .config import SCRIPT_DIR, STATIC_DIR
from .logger import logger, setup_logging


class _SocketIOWithHooks(SocketIO):  # type: ignore[misc]
    """flask_socketio.SocketIO 运行时被动态挂载的自定义方法桩（仅类型检查用）

    显式覆盖 emit / join_room / leave_room 签名，以补全 flask_socketio 类型桩
    中缺失或标记为 Unknown 的 kwargs（如 room=），消除 Pylance 误报。
    """

    def emit(
        self,
        event: str,
        *args: Any,
        namespace: str = '/',
        to: str | None = None,
        room: str | None = None,
        include_self: bool = True,
        skip_sid: str | list[str] | None = None,
        callback: Callable[..., Any] | None = None,
    ) -> None: ...

    def join_room(
        self,
        room: str,
        sid: str | None = None,
        namespace: str = '/',
    ) -> None: ...

    def leave_room(
        self,
        room: str,
        sid: str | None = None,
        namespace: str = '/',
    ) -> None: ...

    def push_user_status_update(self, username: str, status: str) -> None: ...
    def push_unread_count_update(self, username: str) -> None: ...
    def push_message_read_update(self, sender_username: str, reader_username: str, message_id: str) -> None: ...
    def push_ban_notification(self, username: str, banned_until: float) -> None: ...
    def push_match_list_changed(self) -> None: ...


if TYPE_CHECKING:
    socketio: _SocketIOWithHooks  # type: ignore[assignment]
else:
    socketio: SocketIO = SocketIO()


def create_app():
    app = Flask(
        __name__,
        static_folder=STATIC_DIR,
        static_url_path='/static',
        template_folder=os.path.join(SCRIPT_DIR, 'templates'),
    )
    app.secret_key = secrets.token_hex(32)

    # 常见字体 MIME type（Flask 自带不全，浏览器会拒绝或 abort）
    for _mime, _ext in [
        ('font/woff2', '.woff2'),
        ('font/woff',  '.woff'),
        ('font/ttf',   '.ttf'),
        ('font/otf',   '.otf'),
        ('application/font-woff2', '.woff2'),
        ('application/font-woff',   '.woff'),
    ]:
        mimetypes.add_type(_mime, _ext)

    setup_logging()

    from .db import init_db, migrate_from_json

    init_db()
    migrate_from_json()

    from .routes import register_routes

    register_routes(app)

    from .match_manager import init_matches, start_cleanup_task
    from .models import init_admin

    init_matches()
    init_admin()
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        start_cleanup_task()

    socketio.init_app(app, cors_allowed_origins='*', ping_timeout=30, ping_interval=25)

    register_socket_events(socketio)

    return app


def register_socket_events(sio):
    """注册Socket.IO事件处理器，包括游戏动作的WebSocket处理"""

    from .match.storage import broadcast_match_update

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

        # WebSocket 级断线：立即解析对局（判对手获胜），不等 5 分钟心跳超时
        if username:
            try:
                from .match.storage import handle_player_disconnect_from_match

                handle_player_disconnect_from_match(username)
            except Exception as e:  # noqa: BLE001
                logger.warning(f'处理玩家断线失败 {username}: {e}')

    @sio.on('register_user')
    def handle_register_user(data):
        username = data.get('username')
        client_token = data.get('token', '')

        # 优先使用客户端显式传入的 token，否则从当前 HTTP 请求的 cookie 中取
        effective_token = client_token or ''
        if not effective_token:
            try:
                effective_token = socket_request.cookies.get('token', '')
            except Exception:  # noqa: BLE001
                effective_token = ''

        if not username:
            _ws_error_response(socket_request.sid, '注册失败：缺少用户名')
            return

        # Fail-closed：无有效 token 一律拒绝注册（访客也走 cookie token）
        if not effective_token:
            _ws_error_response(socket_request.sid, '注册失败：需要登录凭证')
            logger.warning(f'WebSocket 注册失败（无 token）: sid={socket_request.sid}, username={username}')
            return

        from .models import get_user_from_token

        verified_user = get_user_from_token(effective_token)
        if not verified_user:
            _ws_error_response(socket_request.sid, '注册失败：登录凭证无效')
            logger.warning(f'WebSocket 注册失败（无效 token）: sid={socket_request.sid}, username={username}')
            return
        if verified_user.get('bannedUntil'):
            banned_until = verified_user['bannedUntil']
            if time.time() < banned_until:
                _ws_error_response(socket_request.sid, '注册失败：账号已被封禁')
                logger.warning(f'WebSocket 注册失败（账号封禁）: sid={socket_request.sid}, username={username}')
                return
        if verified_user.get('username') != username:
            _ws_error_response(socket_request.sid, '注册失败：用户名与登录凭证不匹配')
            logger.warning(
                f'WebSocket 注册失败（用户名篡改）: sid={socket_request.sid}, '
                f'claimed={username}, actual={verified_user.get("username")}'
            )
            return

        sid_to_user[socket_request.sid] = username
        if username not in username_to_sids:
            username_to_sids[username] = set()
        username_to_sids[username].add(socket_request.sid)
        logger.info(f'用户注册到WebSocket: {username}, sid: {socket_request.sid}')

    @sio.on('join')
    def handle_join(data):
        match_id = data.get('match_id')
        if not match_id:
            return
        sid = socket_request.sid
        # 只允许已通过 register_user 认证的 SID 绑定房间；不接受客户端声称的 username
        authenticated_username = sid_to_user.get(sid)

        # 创建者重连时清除断开宽限期 deadline
        if authenticated_username:
            try:
                from .match.storage import active_matches, active_matches_lock

                with active_matches_lock:
                    match = active_matches.get(match_id)
                    if match and match.get('creator') == authenticated_username:
                        cleared = match.pop('_owner_disconnect_deadline', None)
                        if cleared:
                            logger.info(f'房间 {match_id} 创建者 {authenticated_username} 重连，已清除断开宽限期')
            except Exception as e:  # noqa: BLE001
                logger.debug(f'清除断开 deadline 跳过: {e}')

        join_room(match_id)
        sid_to_match[sid] = match_id
        logger.info(
            f'客户端加入房间: {match_id}, sid: {sid}, '
            f'username: {authenticated_username or "(未注册，公共观战或匿名)"}'
        )

    @sio.on('leave')
    def handle_leave(data):
        match_id = data.get('match_id')
        if not match_id:
            return
        sid = socket_request.sid
        authenticated_username = sid_to_user.get(sid)
        leave_room(match_id)
        sid_to_match.pop(sid, None)
        logger.info(
            f'客户端离开房间: {match_id}, sid: {sid}, '
            f'username: {authenticated_username or "(未注册)"}'
        )

    @sio.on('spectate_join')
    def handle_spectate_join(data):
        """公开观战加入房间（无需登录，凭观战 token 校验）"""
        match_id = (data or {}).get('match_id')
        token = (data or {}).get('token')
        if not match_id or not token:
            emit('spectate_join_failed', {'error': '缺少房间号或观战凭证'})
            return
        try:
            from .match.storage import active_matches, active_matches_lock

            with active_matches_lock:
                match = active_matches.get(match_id)
                if not match:
                    emit('spectate_join_failed', {'error': '房间不存在'})
                    return
                if match.get('spectateToken') != token:
                    emit('spectate_join_failed', {'error': '无效的观战链接'})
                    return
                if match.get('status') != 'playing' or not match.get('allowSpectate', True):
                    emit('spectate_join_failed', {'error': '该对局当前不可观看'})
                    return
            join_room(match_id)
            logger.info(f'观战客户端加入房间: {match_id}, sid: {socket_request.sid}')
            emit('spectate_joined', {'match_id': match_id})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'观战加入房间失败: {e}')
            emit('spectate_join_failed', {'error': '加入观战失败'})

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

            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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
            broadcast_match_update(match_id)
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

            broadcast_match_update(match_id)
            result = close_match(user, match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _ws_success_response(sid, {'action': 'close_room', 'result': result_data})
            sio.push_match_list_changed()
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
            broadcast_match_update(match_id)
            result_data = json.loads(result.get_data(as_text=True)) if hasattr(result, 'get_data') else result
            _ws_success_response(sid, {'action': 'leave_room', 'result': result_data})
            sio.push_match_list_changed()
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
        """处理房间聊天消息。

        用户名一律从当前 SID 的注册记录反查，拒绝客户端自带的 username。
        这样即使 SID 没走 register_user（极少见），也不会出现用户名伪造。
        """
        from .match.storage import add_room_chat_message

        sid = socket_request.sid
        username = sid_to_user.get(sid)
        match_id = (data or {}).get('match_id')
        message = (data or {}).get('message', '').strip()

        if not username or not match_id or not message:
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

    def push_match_list_changed():
        """大厅房间列表发生变化时全局广播，客户端收到后按需拉取最新列表"""
        sio.emit('match_list_changed', {'timestamp': __import__('time').time()})

    sio.push_user_status_update = push_user_status_update
    sio.push_unread_count_update = push_unread_count_update
    sio.push_message_read_update = push_message_read_update
    sio.push_ban_notification = push_ban_notification
    sio.push_match_list_changed = push_match_list_changed
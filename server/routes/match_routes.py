"""联机匹配路由模块
处理联机对战相关请求：创建/加入/离开房间、获取房间列表、
执行落子操作、超时处理、悔棋、和棋、观战等。

主要功能：
- 房间管理：创建、加入、离开、关闭房间
- 游戏操作：落子、悔棋、和棋、重开
- 观战功能：获取观战列表、加入/离开观战
- Socket.IO 广播：通过 storage.broadcast_match_update 统一推送

所有对局变更的广播都走 storage.broadcast_match_update，避免
HTTP 路由层与 WS handler 各自维护一套广播逻辑。
"""

import secrets
import time

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..logger import logger
from ..match.storage import (
    active_matches,
    active_matches_lock,
    broadcast_match_update,
    get_room_chat_messages,
    save_matches,
)
from ..match_manager import (
    accept_draw,
    accept_undo,
    close_match,
    create_match,
    decline_draw,
    decline_restart,
    decline_undo,
    get_match_status,
    get_my_match,
    get_spectatable_matches,
    get_spectate_status,
    heartbeat,
    join_match,
    leave_match,
    leave_spectate,
    list_available_matches,
    make_move,
    request_draw,
    request_undo,
    resign,
    restart_match,
    spectate_match,
)

match_bp = Blueprint('match', __name__)


def _emit_match_list_changed():
    """大厅房间列表发生变化时通知所有在线客户端"""
    try:
        from .. import socketio

        if hasattr(socketio, 'push_match_list_changed'):
            socketio.push_match_list_changed()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Socket.IO emit match_list_changed failed: {e}')


@match_bp.route('/api/match/create', methods=['POST'])
@require_auth
def api_create_match(user):
    try:
        body = request.get_json() or {}
        time_mode = body.get('timeMode', 'untimed')
        move_time = int(body.get('moveTime', 30))
        total_time = int(body.get('totalTime', 600))
        allow_spectate = body.get('allowSpectate', True)
        password = body.get('password') or None
        rule_mode = body.get('ruleMode', 'standard')
        invite_only = body.get('inviteOnly', False)
        invited_friends = body.get('invitedFriends', [])
        match_id, creator_color = create_match(
            user, time_mode, move_time, total_time, allow_spectate, password, rule_mode, invite_only, invited_friends
        )
        _emit_match_list_changed()
        return jsonify(
            {
                'success': True,
                'matchId': match_id,
                'creatorColor': creator_color,
                'timeMode': time_mode,
                'allowSpectate': allow_spectate,
                'hasPassword': password is not None,
                'ruleMode': rule_mode,
                'inviteOnly': invite_only,
                'invitedFriends': invited_friends,
            }
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'Create match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/join', methods=['POST'])
@require_auth
def api_join_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        password = data.get('password') or None
        result = join_match(user, match_id, password)
        if isinstance(result, tuple):
            resp, code = result
            if code == 200:
                broadcast_match_update(match_id)
                _emit_match_list_changed()
            return resp, code
        broadcast_match_update(match_id)
        _emit_match_list_changed()
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Join match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/move', methods=['POST'])
@require_auth
def api_make_move(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        row = data.get('row')
        col = data.get('col')
        result = make_move(user, match_id, row, col)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Move error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/status', methods=['GET'])
@require_auth
def api_get_match_status(user):
    try:
        match_id = request.args.get('matchId', '')
        return get_match_status(user, match_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Status error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/status/<match_id>', methods=['GET'])
@require_auth
def api_get_match_status_by_id(user, match_id):
    try:
        return get_match_status(user, match_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Status error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/<match_id>/status', methods=['GET'])
@require_auth
def api_get_match_status_by_id_alt(user, match_id):
    try:
        return get_match_status(user, match_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Status error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/leave', methods=['POST'])
@require_auth
def api_leave_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = leave_match(user, match_id)
        broadcast_match_update(match_id)
        _emit_match_list_changed()
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Leave match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/close', methods=['POST'])
@require_auth
def api_close_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = close_match(user, match_id)
        broadcast_match_update(match_id)
        _emit_match_list_changed()
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Close match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/restart', methods=['POST'])
@require_auth
def api_restart_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = restart_match(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Restart match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/my', methods=['GET'])
@require_auth
def api_get_my_match(user):
    try:
        return jsonify(get_my_match(user['username']))
    except Exception as e:  # noqa: BLE001
        logger.error(f'My match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/list', methods=['GET'])
@require_auth
def api_list_matches(user):
    try:
        return jsonify(list_available_matches(user['username']))
    except Exception as e:  # noqa: BLE001
        logger.error(f'List matches error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/heartbeat', methods=['POST'])
@require_auth
def api_heartbeat(user):
    heartbeat(user)
    return jsonify({'success': True})


@match_bp.route('/api/match/restart/decline', methods=['POST'])
@require_auth
def api_decline_restart(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = decline_restart(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Decline restart error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


# ==================== 悔棋 ====================


@match_bp.route('/api/match/undo/request', methods=['POST'])
@require_auth
def api_request_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = request_undo(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Request undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/undo/accept', methods=['POST'])
@require_auth
def api_accept_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = accept_undo(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Accept undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/undo/decline', methods=['POST'])
@require_auth
def api_decline_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = decline_undo(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Decline undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


# ==================== 和棋 ====================


@match_bp.route('/api/match/draw/request', methods=['POST'])
@require_auth
def api_request_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = request_draw(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Request draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/draw/accept', methods=['POST'])
@require_auth
def api_accept_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = accept_draw(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Accept draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/draw/decline', methods=['POST'])
@require_auth
def api_decline_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = decline_draw(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Decline draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/resign', methods=['POST'])
@require_auth
def api_resign(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = resign(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Resign error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


# ==================== 观战 ====================


@match_bp.route('/api/match/spectate/list', methods=['GET'])
@require_auth
def api_spectate_list(user):
    try:
        return jsonify(get_spectatable_matches())
    except Exception as e:  # noqa: BLE001
        logger.error(f'Spectate list error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/spectate/join', methods=['POST'])
@require_auth
def api_spectate_join(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        password = data.get('password') or None
        result = spectate_match(user, match_id, password)
        if isinstance(result, tuple):
            resp, code = result
            if code == 200:
                broadcast_match_update(match_id)
            return resp, code
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Spectate join error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/spectate/leave', methods=['POST'])
@require_auth
def api_spectate_leave(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        result = leave_spectate(user, match_id)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'Spectate leave error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/spectate/status', methods=['GET'])
@require_auth
def api_spectate_status(user):
    try:
        match_id = request.args.get('matchId', '')
        return get_spectate_status(user, match_id)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Spectate status error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/spectate/token', methods=['GET'])
@require_auth
def api_get_spectate_token(user):
    """获取（并轮换）公开观战 token。

    每次调用都会生成新 token 并落库，使先前分享的链接在新 token 生效后
    自动失效，避免链接被长期扩散。
    """
    try:
        match_id = request.args.get('matchId', '')
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404
            match = active_matches[match_id]
            username = user['username']
            if match['creator'] != username and match.get('opponent') != username:
                return jsonify({'error': '您不在这个房间中'}), 403
            new_token = secrets.token_hex(20)
            match['spectateToken'] = new_token
        save_matches()
        return jsonify({'success': True, 'token': new_token, 'matchId': match_id})
    except Exception as e:  # noqa: BLE001
        logger.error(f'Get spectate token error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/chat/<match_id>', methods=['GET'])
@require_auth
def api_get_room_chat_history(user, match_id):
    """获取房间聊天历史。仅对局参与者可访问。"""
    try:
        username = user['username']
        with active_matches_lock:
            match = active_matches.get(match_id)
            if not match:
                return jsonify({'error': '房间不存在'}), 404
            if match['creator'] != username and match.get('opponent') != username:
                return jsonify({'error': '您不在这个房间中'}), 403
        messages = get_room_chat_messages(match_id, limit=100)
        return jsonify({'success': True, 'matchId': match_id, 'messages': messages})
    except Exception as e:  # noqa: BLE001
        logger.error(f'Get room chat history error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/spectate/public', methods=['GET'])
def api_public_spectate():
    try:
        match_id = request.args.get('room', '')
        token = request.args.get('token', '')
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404
            match = active_matches[match_id]
            if match.get('spectateToken') != token:
                return jsonify({'error': '无效的观战链接'}), 403
            if match['status'] not in ['playing', ]:
                return jsonify({'error': '该对局不可观看'}), 400
            if not match.get('allowSpectate', True):
                return jsonify({'error': '该房间不允许观战'}), 403
            spectators = match.setdefault('spectators', [])
            return {
                'id': match_id,
                'creator': match['creator'],
                'opponent': match.get('opponent'),
                'status': match['status'],
                'board': [row[:] for row in match['board']],
                'currentPlayer': match['currentPlayer'],
                'moves': match['moves'][:],
                'winner': match.get('winner'),
                'creatorColor': match['creatorColor'],
                'startTime': match['startTime'],
                'moveCount': len(match.get('moves', [])),
                'spectatorCount': len(spectators),
                'timeMode': match.get('timeMode', 'untimed'),
                'blackTime': match.get('blackTime', 600),
                'whiteTime': match.get('whiteTime', 600),
                'moveDeadline': match.get('moveDeadline', 0),
                'restartVersion': match.get('restartVersion', 0),
            }, 200
    except Exception as e:  # noqa: BLE001
        logger.error(f'Public spectate error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/<match_id>/invite-friends', methods=['POST'])
@require_auth
def api_invite_friends_to_match(user, match_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        friends_to_invite = data.get('friends', [])
        if not friends_to_invite:
            return jsonify({'error': '请选择要邀请的好友'}), 400

        from ..friend import is_friend, send_match_invitation

        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404

            match = active_matches[match_id]
            if match['creator'] != user['username']:
                return jsonify({'error': '只有房主可以邀请好友'}), 403
            if match['status'] != 'waiting':
                return jsonify({'error': '房间已开始或已结束，无法邀请'}), 400

            invited = []
            already_invited = []
            not_friends = []
            for friend in friends_to_invite:
                if not is_friend(user['username'], friend):
                    not_friends.append(friend)
                    continue
                if friend in match.get('invitedFriends', []):
                    already_invited.append(friend)
                    continue
                match.setdefault('invitedFriends', []).append(friend)
                invited.append(friend)

            save_matches()

        for friend in invited:
            try:
                send_match_invitation(user['username'], friend, match_id)
            except Exception as e:  # noqa: BLE001
                logger.warning(f'Failed to send match invitation from {user["username"]} to {friend}: {e}')

        return jsonify(
            {
                'success': True,
                'invited': invited,
                'alreadyInvited': already_invited,
                'notFriends': not_friends,
            }
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f'Invite friends error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
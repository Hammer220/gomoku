"""联机匹配路由模块
处理联机对战相关请求：创�?加入/离开房间、获取房间列表�?
执行落子操作、超时处理、悔棋、和棋、观战等�?

主要功能�?
- 房间管理：创建、加入、离开、关闭房�?
- 游戏操作：落子、悔棋、和棋、重开
- 观战功能：获取观战列表、加�?离开观战
- Socket.IO 广播：实时同步游戏状�?
"""

import time

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..logger import logger
from ..match.storage import active_matches, active_matches_lock, save_matches
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


def _build_match_event(match):
    """
    构建用于 Socket.IO 广播的赛事数�?
    包含对局的所有状态信息：棋盘、玩家、时间、交互状态等
    :param match: 对局数据字典
    :return: 包含对局事件的字�?
    """
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
        'timestamp': time.time(),
    }


def _emit_match_update(match_id):
    """
    通过 Socket.IO 向房间广播赛事更�?
    当对局状态发生变化时调用，通知房间内所有客户端
    :param match_id: 对局 ID
    """
    try:
        from .. import socketio

        with active_matches_lock:
            if match_id in active_matches:
                match = active_matches[match_id]
                event_data = _build_match_event(match)
        socketio.emit('match_updated', event_data, room=match_id)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Socket.IO emit failed for match {match_id}: {e}')


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
                _emit_match_update(match_id)
            return resp, code
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
        result = close_match(user, match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
                _emit_match_update(match_id)
            return resp, code
        _emit_match_update(match_id)
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
        _emit_match_update(match_id)
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
    try:
        match_id = request.args.get('matchId', '')
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存�?}), 404
            match = active_matches[match_id]
            username = user['username']
            if match['creator'] != username and match.get('opponent') != username:
                return jsonify({'error': '您不在这个房间中'}), 403
            token = match.get('spectateToken', '')
        return jsonify({'success': True, 'token': token, 'matchId': match_id})
    except Exception as e:  # noqa: BLE001
        logger.error(f'Get spectate token error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/spectate/public', methods=['GET'])
def api_public_spectate():
    try:
        match_id = request.args.get('room', '')
        token = request.args.get('token', '')
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存�?}), 404
            match = active_matches[match_id]
            if match.get('spectateToken') != token:
                return jsonify({'error': '无效的观战链�?}), 403
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
            return jsonify({'error': '无效的请求数�?}), 400

        friends_to_invite = data.get('friends', [])
        if not friends_to_invite:
            return jsonify({'error': '请选择要邀请的好友'}), 400

        from ..friend import is_friend, send_match_invitation

        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存�?}), 404

            match = active_matches[match_id]
            if match['creator'] != user['username']:
                return jsonify({'error': '只有房主可以邀请好�?}), 403
            if match['status'] != 'waiting':
                return jsonify({'error': '房间已开始或已结束，无法邀�?}), 400

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
                if 'invitedFriends' not in match:
                    match['invitedFriends'] = []
                match['invitedFriends'].append(friend)
                invited.append(friend)
                send_match_invitation(user['username'], friend, match_id)

            if not invited:
                return jsonify(
                    {
                        'success': False,
                        'error': '无可邀请的好友',
                        'notFriends': not_friends,
                        'alreadyInvited': already_invited,
                    }
                ), 400

            save_matches()
            _emit_match_update(match_id)

            return jsonify(
                {'success': True, 'invited': invited, 'alreadyInvited': already_invited, 'notFriends': not_friends}
            )
    except Exception as e:  # noqa: BLE001
        logger.error(f'Invite friends error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/<match_id>/invites', methods=['GET'])
@require_auth
def api_get_match_invites(user, match_id):
    try:
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存�?}), 404

            match = active_matches[match_id]
            return jsonify(
                {'inviteOnly': match.get('inviteOnly', False), 'invitedFriends': match.get('invitedFriends', [])}
            )
    except Exception as e:  # noqa: BLE001
        logger.error(f'Get match invites error: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/poll/events', methods=['POST'])
@require_auth
def api_poll_events(user):
    try:
        data = request.get_json() or {}
        requested_events = data.get('events', [])
        result_events = []
        username = user['username']

        with active_matches_lock:
            for match_id, match in active_matches.items():
                is_player = match.get('creator') == username or match.get('opponent') == username
                is_spectator = username in match.get('spectators', [])

                if not is_player and not is_spectator:
                    continue

                if 'match_updated' in requested_events:
                    result_events.append({'type': 'match_updated', 'data': _build_match_event(match)})

                if 'move_made' in requested_events and len(match['moves']) > 0:
                    last_move = match['moves'][-1]
                    result_events.append(
                        {
                            'type': 'move_made',
                            'data': {
                                'match_id': match_id,
                                'row': last_move['row'],
                                'col': last_move['col'],
                                'player': last_move['player'],
                                'currentPlayer': match['currentPlayer'],
                            },
                        }
                    )

                if (
                    'undo_requested' in requested_events
                    and match.get('undoRequested')
                    and match.get('undoRequestedBy') != username
                ):
                    result_events.append(
                        {
                            'type': 'undo_requested',
                            'data': {'match_id': match_id, 'undoRequestedBy': match.get('undoRequestedBy')},
                        }
                    )

                if (
                    'draw_requested' in requested_events
                    and match.get('drawRequested')
                    and match.get('drawRequestedBy') != username
                ):
                    result_events.append(
                        {
                            'type': 'draw_requested',
                            'data': {'match_id': match_id, 'drawRequestedBy': match.get('drawRequestedBy')},
                        }
                    )

        return jsonify({'events': result_events})
    except Exception as e:  # noqa: BLE001
        logger.error(f'Poll events error: {e}')
        return jsonify({'events': []})


@match_bp.route('/api/match/<match_id>/set-invite-only', methods=['POST'])
@require_auth
def api_set_invite_only(user, match_id):
    try:
        data = request.get_json() or {}
        invite_only = data.get('inviteOnly', False)

        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存�?}), 404

            match = active_matches[match_id]
            if match['creator'] != user['username']:
                return jsonify({'error': '只有房主可以设置房间模式'}), 403
            if match['status'] != 'waiting':
                return jsonify({'error': '房间已开始或已结束，无法修改'}), 400

            match['inviteOnly'] = invite_only
            save_matches()
            _emit_match_update(match_id)

            return jsonify({'success': True, 'inviteOnly': invite_only})
    except Exception as e:  # noqa: BLE001
        logger.error(f'Set invite only error: {e}')
        return jsonify({'error': 'Internal server error'}), 500



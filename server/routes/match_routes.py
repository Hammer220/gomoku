"""联机匹配路由模块
处理联机对战相关请求：创建/加入/离开房间、获取房间列表、
执行落子操作、超时处理、悔棋、和棋、观战等。
"""

from flask import Blueprint, request, jsonify

from ..auth import require_auth
from ..match_manager import (create_match, join_match, make_move,
                             get_match_status, leave_match, close_match,
                             restart_match, decline_restart, get_my_match, list_available_matches,
                             heartbeat, request_undo, accept_undo, decline_undo,
                             request_draw, accept_draw, decline_draw,
                             get_spectatable_matches, spectate_match, leave_spectate,
                             get_spectate_status)
from ..logger import logger

match_bp = Blueprint('match', __name__)

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
        match_id, creator_color = create_match(user, time_mode, move_time, total_time, allow_spectate, password)
        return jsonify({'success': True, 'matchId': match_id, 'creatorColor': creator_color,
                        'timeMode': time_mode, 'allowSpectate': allow_spectate,
                        'hasPassword': password is not None})
    except Exception as e:
        logger.error(f'Create match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/join', methods=['POST'])
@require_auth
def api_join_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        password = data.get('password') or None
        return join_match(user, match_id, password)
    except Exception as e:
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
        return make_move(user, match_id, row, col)
    except Exception as e:
        logger.error(f'Move error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/status', methods=['GET'])
@require_auth
def api_get_match_status(user):
    try:
        match_id = request.args.get('matchId', '')
        return get_match_status(user, match_id)
    except Exception as e:
        logger.error(f'Status error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500


@match_bp.route('/api/match/status/<match_id>', methods=['GET'])
@require_auth
def api_get_match_status_by_id(user, match_id):
    try:
        return get_match_status(user, match_id)
    except Exception as e:
        logger.error(f'Status error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/leave', methods=['POST'])
@require_auth
def api_leave_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return leave_match(user, match_id)
    except Exception as e:
        logger.error(f'Leave match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/close', methods=['POST'])
@require_auth
def api_close_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return close_match(user, match_id)
    except Exception as e:
        logger.error(f'Close match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/restart', methods=['POST'])
@require_auth
def api_restart_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return restart_match(user, match_id)
    except Exception as e:
        logger.error(f'Restart match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/my', methods=['GET'])
@require_auth
def api_get_my_match(user):
    try:
        return jsonify(get_my_match(user['username']))
    except Exception as e:
        logger.error(f'My match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/list', methods=['GET'])
@require_auth
def api_list_matches(user):
    try:
        return jsonify(list_available_matches(user['username']))
    except Exception as e:
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
        return decline_restart(user, match_id)
    except Exception as e:
        logger.error(f'Decline restart error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

# ==================== 悔棋 ====================

@match_bp.route('/api/match/undo/request', methods=['POST'])
@require_auth
def api_request_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return request_undo(user, match_id)
    except Exception as e:
        logger.error(f'Request undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/undo/accept', methods=['POST'])
@require_auth
def api_accept_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return accept_undo(user, match_id)
    except Exception as e:
        logger.error(f'Accept undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/undo/decline', methods=['POST'])
@require_auth
def api_decline_undo(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return decline_undo(user, match_id)
    except Exception as e:
        logger.error(f'Decline undo error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

# ==================== 和棋 ====================

@match_bp.route('/api/match/draw/request', methods=['POST'])
@require_auth
def api_request_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return request_draw(user, match_id)
    except Exception as e:
        logger.error(f'Request draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/draw/accept', methods=['POST'])
@require_auth
def api_accept_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return accept_draw(user, match_id)
    except Exception as e:
        logger.error(f'Accept draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/draw/decline', methods=['POST'])
@require_auth
def api_decline_draw(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return decline_draw(user, match_id)
    except Exception as e:
        logger.error(f'Decline draw error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

# ==================== 观战 ====================

@match_bp.route('/api/match/spectate/list', methods=['GET'])
@require_auth
def api_spectate_list(user):
    try:
        return jsonify(get_spectatable_matches())
    except Exception as e:
        logger.error(f'Spectate list error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/spectate/join', methods=['POST'])
@require_auth
def api_spectate_join(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        password = data.get('password') or None
        return spectate_match(user, match_id, password)
    except Exception as e:
        logger.error(f'Spectate join error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/spectate/leave', methods=['POST'])
@require_auth
def api_spectate_leave(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return leave_spectate(user, match_id)
    except Exception as e:
        logger.error(f'Spectate leave error: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/spectate/status', methods=['GET'])
@require_auth
def api_spectate_status(user):
    try:
        match_id = request.args.get('matchId', '')
        return get_spectate_status(user, match_id)
    except Exception as e:
        logger.error(f'Spectate status error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
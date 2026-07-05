from flask import Blueprint, request, jsonify

from ..auth import require_auth
from ..match_manager import (create_match, join_match, make_move,
                             get_match_status, leave_match, close_match,
                             restart_match, get_my_match, list_available_matches,
                             update_user_connection, remove_user_connection)
from ..logger import logger

match_bp = Blueprint('match', __name__)

@match_bp.route('/api/match/create', methods=['POST'])
@require_auth
def api_create_match(user):
    try:
        match_id, creator_color = create_match(user)
        return jsonify({'success': True, 'matchId': match_id, 'creatorColor': creator_color})
    except Exception as e:
        logger.error(f'Create match error for user {user.get("username", "unknown")}: {e}')
        return jsonify({'error': 'Internal server error'}), 500

@match_bp.route('/api/match/join', methods=['POST'])
@require_auth
def api_join_match(user):
    try:
        data = request.get_json()
        match_id = data.get('matchId', '')
        return join_match(user, match_id)
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
    update_user_connection(user['username'])
    return jsonify({'success': True})
import time
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..models import (load_json_with_lock, save_json_with_lock, get_user,
                      save_user, USERS_FILE, RECORDS_FILE, SAVES_FILE,
                      SETTINGS_FILE, TOKENS_FILE, MATCHES_FILE)
from ..auth import require_admin, require_super_admin, get_current_user
from ..match_manager import (get_all_matches, get_match_detail,
                             force_close_match, force_close_all_matches,
                             force_restart_match, force_move)
from ..logger import logger

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/api/admin/users', methods=['GET'])
@require_admin
def admin_get_users(admin_user):
    try:
        users = load_json_with_lock(USERS_FILE)
        user_list = []
        for username, user_data in users.items():
            user_list.append({
                'username': user_data.get('username', username),
                'score': user_data.get('score', 0),
                'wins': user_data.get('wins', 0),
                'games': user_data.get('games', 0),
                'joinDate': user_data.get('joinDate', ''),
                'lastLogin': user_data.get('lastLogin', ''),
                'isAdmin': user_data.get('isAdmin', False),
                'isSuperAdmin': user_data.get('isSuperAdmin', False),
                'bannedUntil': user_data.get('bannedUntil')
            })
        return jsonify({'users': user_list})
    except Exception as e:
        logger.error(f'获取用户列表错误: {str(e)}')
        return jsonify({'error': '获取用户列表失败'}), 500

@admin_bp.route('/api/admin/user/<username>', methods=['GET'])
@require_admin
def admin_get_user(admin_user, username):
    try:
        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        return jsonify({
            'username': username,
            'score': user.get('score', 0),
            'wins': user.get('wins', 0),
            'games': user.get('games', 0),
            'joinDate': user.get('joinDate', ''),
            'lastLogin': user.get('lastLogin', ''),
            'isAdmin': user.get('isAdmin', False),
            'isSuperAdmin': user.get('isSuperAdmin', False),
            'bannedUntil': user.get('bannedUntil')
        })
    except Exception as e:
        logger.error(f'获取用户详情错误: {str(e)}')
        return jsonify({'error': '获取用户详情失败'}), 500

@admin_bp.route('/api/admin/user/<username>/ban', methods=['POST'])
@require_admin
def admin_ban_user(admin_user, username):
    try:
        data = request.get_json()
        duration = data.get('duration', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403

        if duration > 0:
            user['bannedUntil'] = time.time() + duration
        else:
            user['bannedUntil'] = None

        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 封禁了 {username}，时长: {duration}秒')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'封禁用户错误: {str(e)}')
        return jsonify({'error': '封禁用户失败'}), 500

@admin_bp.route('/api/admin/user/<username>/score', methods=['POST'])
@require_admin
def admin_set_score(admin_user, username):
    try:
        data = request.get_json()
        score = data.get('score', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404

        user['score'] = int(score)
        save_user(username, user)
        return jsonify({'success': True, 'message': '积分修改成功'})
    except Exception as e:
        logger.error(f'修改积分错误: {str(e)}')
        return jsonify({'error': '修改积分失败'}), 500

@admin_bp.route('/api/admin/user/<username>/admin', methods=['POST'])
@require_super_admin
def admin_set_admin(admin_user, username):
    try:
        data = request.get_json()
        is_admin = data.get('isAdmin', False)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员权限'}), 403

        user['isAdmin'] = is_admin
        if not is_admin:
            user['isSuperAdmin'] = False
        save_user(username, user)
        return jsonify({'success': True, 'message': '权限修改成功'})
    except Exception as e:
        logger.error(f'修改管理员权限错误: {str(e)}')
        return jsonify({'error': '修改管理员权限失败'}), 500

@admin_bp.route('/api/admin/matches', methods=['GET'])
@require_admin
def admin_get_matches(admin_user):
    try:
        return jsonify(get_all_matches())
    except Exception as e:
        logger.error(f'获取匹配列表错误: {str(e)}')
        return jsonify({'error': '获取匹配列表失败'}), 500

@admin_bp.route('/api/admin/match/<match_id>', methods=['GET'])
@require_admin
def admin_get_match(admin_user, match_id):
    return get_match_detail(match_id)

@admin_bp.route('/api/admin/match/<match_id>/close', methods=['POST'])
@require_admin
def admin_close_match(admin_user, match_id):
    logger.info(f'管理员 {admin_user["username"]} 强制关闭房间 {match_id}')
    return force_close_match(match_id)

@admin_bp.route('/api/admin/matches/close-all', methods=['POST'])
@require_admin
def admin_close_all_matches(admin_user):
    logger.info(f'管理员 {admin_user["username"]} 强制关闭所有房间')
    return force_close_all_matches()

@admin_bp.route('/api/admin/match/<match_id>/restart', methods=['POST'])
@require_admin
def admin_restart_match(admin_user, match_id):
    logger.info(f'管理员 {admin_user["username"]} 强制重新开始房间 {match_id}')
    return force_restart_match(match_id)

@admin_bp.route('/api/admin/match/<match_id>/force-move', methods=['POST'])
@require_admin
def admin_force_move(admin_user, match_id):
    try:
        data = request.get_json()
        row = data.get('row')
        col = data.get('col')
        player = data.get('player')

        if row is None or col is None or player is None:
            return jsonify({'error': '缺少参数'}), 400
        if player not in [1, 2]:
            return jsonify({'error': '玩家编号必须为1或2'}), 400

        logger.info(f'管理员 {admin_user["username"]} 强制落子 房间 {match_id} ({row},{col}) player={player}')
        return force_move(match_id, row, col, player)
    except Exception as e:
        logger.error(f'强制落子错误: {str(e)}')
        return jsonify({'error': '强制落子失败'}), 500

@admin_bp.route('/api/admin/stats', methods=['GET'])
@require_admin
def admin_get_stats(admin_user):
    try:
        users = load_json_with_lock(USERS_FILE)
        records = load_json_with_lock(RECORDS_FILE)

        total_users = len(users) if isinstance(users, dict) else 0
        total_records = len(records) if isinstance(records, (dict, list)) else 0

        return jsonify({
            'totalUsers': total_users,
            'totalRecords': total_records
        })
    except Exception as e:
        logger.error(f'获取统计信息错误: {str(e)}')
        return jsonify({'error': '获取统计信息失败'}), 500

@admin_bp.route('/api/admin/records', methods=['GET'])
@require_admin
def admin_get_records(admin_user):
    try:
        records = load_json_with_lock(RECORDS_FILE)
        record_list = []
        if isinstance(records, dict):
            for record_id, record in records.items():
                record['id'] = record_id
                record_list.append(record)
        elif isinstance(records, list):
            record_list = records

        record_list.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        return jsonify({'records': record_list[:100]})
    except Exception as e:
        logger.error(f'获取所有记录错误: {str(e)}')
        return jsonify({'records': []})
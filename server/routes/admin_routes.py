"""管理后台路由模块
处理管理员操作：用户管理（封禁/解封/强制登出/注销）、批量操作、
联机对局监控、强制落子、管理员账号管理等。
"""

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
        tokens = load_json_with_lock(TOKENS_FILE)
        online_users = set()
        current_time = time.time()
        for token, token_data in tokens.items():
            if isinstance(token_data, dict) and current_time - token_data.get('createdAt', 0) < 3600:
                online_users.add(token_data.get('username'))

        user_list = []
        for username, user_data in users.items():
            is_banned = False
            remaining_minutes = 0
            banned_until = user_data.get('bannedUntil')
            if banned_until and current_time < banned_until:
                is_banned = True
                remaining_minutes = max(0, int((banned_until - current_time) / 60))

            user_list.append({
                'username': user_data.get('username', username),
                'score': user_data.get('score', 0),
                'wins': user_data.get('wins', 0),
                'games': user_data.get('games', 0),
                'joinDate': user_data.get('joinDate', ''),
                'lastLogin': user_data.get('lastLogin', ''),
                'isAdmin': user_data.get('isAdmin', False),
                'isSuperAdmin': user_data.get('isSuperAdmin', False),
                'canManage': user_data.get('canManage', True),
                'bannedUntil': banned_until,
                'isBanned': is_banned,
                'remainingMinutes': remaining_minutes,
                'isOnline': username in online_users,
                'useCaptcha': user_data.get('useCaptcha', True),
                'passwordFree': user_data.get('passwordFree', False),
                'passwordFreeMaxAttempts': user_data.get('passwordFreeMaxAttempts', 0),
                'passwordFreeRemainingAttempts': user_data.get('passwordFreeRemainingAttempts', 0)
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
        if username == admin_user['username']:
            return jsonify({'error': '不能封禁自己'}), 403

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
        return jsonify({'records': record_list})
    except Exception as e:
        logger.error(f'获取所有记录错误: {str(e)}')
        return jsonify({'records': []})


@admin_bp.route('/api/admin/set_captcha', methods=['POST'])
@require_admin
def admin_set_captcha(admin_user):
    """设置用户是否需要验证码"""
    try:
        data = request.get_json()
        username = data.get('username')
        use_captcha = data.get('useCaptcha', True)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员'}), 403

        user['useCaptcha'] = use_captcha
        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 设置 {username} 的验证码: {use_captcha}')
        return jsonify({'success': True, 'message': '验证码设置已更新'})
    except Exception as e:
        logger.error(f'设置验证码错误: {str(e)}')
        return jsonify({'error': '设置验证码失败'}), 500


@admin_bp.route('/api/admin/set_password_free', methods=['POST'])
@require_admin
def admin_set_password_free(admin_user):
    """设置用户免密登录权限"""
    try:
        data = request.get_json()
        username = data.get('username')
        password_free = data.get('passwordFree', False)
        max_attempts = data.get('maxAttempts', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员'}), 403

        user['passwordFree'] = password_free
        if password_free:
            user['passwordFreeMaxAttempts'] = max_attempts
            user['passwordFreeRemainingAttempts'] = max_attempts
        else:
            user['passwordFreeMaxAttempts'] = 0
            user['passwordFreeRemainingAttempts'] = 0

        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 设置 {username} 的免密登录: {password_free}')
        return jsonify({'success': True, 'message': '免密登录设置已更新'})
    except Exception as e:
        logger.error(f'设置免密登录错误: {str(e)}')
        return jsonify({'error': '设置免密登录失败'}), 500


@admin_bp.route('/api/admin/change_password', methods=['POST'])
@require_admin
def admin_change_password(admin_user):
    """管理员修改用户密码"""
    try:
        data = request.get_json()
        username = data.get('username')
        new_password = data.get('new_password')

        if not username or not new_password:
            return jsonify({'error': '缺少参数'}), 400
        if len(new_password) < 6:
            return jsonify({'error': '密码长度不能少于6位'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin') and not admin_user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员密码'}), 403

        import hashlib
        user['password'] = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 修改了 {username} 的密码')
        return jsonify({'success': True, 'message': '密码修改成功'})
    except Exception as e:
        logger.error(f'修改密码错误: {str(e)}')
        return jsonify({'error': '修改密码失败'}), 500


@admin_bp.route('/api/admin/create_admin', methods=['POST'])
@require_super_admin
def admin_create_admin(admin_user):
    """超级管理员创建新管理员账号"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400
        if len(username) < 3:
            return jsonify({'error': '用户名长度不能少于3位'}), 400
        if len(password) < 6:
            return jsonify({'error': '密码长度不能少于6位'}), 400

        existing_user = get_user(username)
        if existing_user:
            return jsonify({'error': '用户名已存在'}), 400

        import hashlib
        new_user = {
            'username': username,
            'password': hashlib.sha256(password.encode('utf-8')).hexdigest(),
            'score': 0,
            'wins': 0,
            'games': 0,
            'isAdmin': True,
            'isSuperAdmin': False,
            'joinDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'lastLogin': '',
            'bannedUntil': None
        }
        save_user(username, new_user)
        logger.info(f'超级管理员 {admin_user["username"]} 创建了管理员账号 {username}')
        return jsonify({'success': True, 'message': '管理员账号创建成功'})
    except Exception as e:
        logger.error(f'创建管理员错误: {str(e)}')
        return jsonify({'error': '创建管理员账号失败'}), 500


@admin_bp.route('/api/admin/set_permission', methods=['POST'])
@require_super_admin
def admin_set_permission(admin_user):
    """设置管理员权限"""
    try:
        data = request.get_json()
        username = data.get('username')
        can_manage = data.get('canManage', False)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员权限'}), 403

        user['canManage'] = can_manage
        save_user(username, user)
        logger.info(f'超级管理员 {admin_user["username"]} 设置 {username} 的管理权限: {can_manage}')
        return jsonify({'success': True, 'message': '权限设置已更新'})
    except Exception as e:
        logger.error(f'设置权限错误: {str(e)}')
        return jsonify({'error': '设置权限失败'}), 500


@admin_bp.route('/api/admin/ban', methods=['POST'])
@require_admin
def admin_ban(admin_user):
    """封禁用户（通过 username 和 minutes 参数）"""
    try:
        data = request.get_json()
        username = data.get('username')
        minutes = data.get('minutes', 0)

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403
        if username == admin_user['username']:
            return jsonify({'error': '不能封禁自己'}), 403

        if minutes > 0:
            user['bannedUntil'] = time.time() + minutes * 60
        else:
            user['bannedUntil'] = None

        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 封禁了 {username}，时长: {minutes}分钟')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'封禁用户错误: {str(e)}')
        return jsonify({'error': '封禁用户失败'}), 500


@admin_bp.route('/api/admin/unban', methods=['POST'])
@require_admin
def admin_unban(admin_user):
    """解封用户"""
    try:
        data = request.get_json()
        username = data.get('username')

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404

        user['bannedUntil'] = None
        save_user(username, user)
        logger.info(f'管理员 {admin_user["username"]} 解封了 {username}')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'解封用户错误: {str(e)}')
        return jsonify({'error': '解封用户失败'}), 500


@admin_bp.route('/api/admin/kick', methods=['POST'])
@require_admin
def admin_kick(admin_user):
    """强制登出用户（清除其所有 token）"""
    try:
        data = request.get_json()
        username = data.get('username')

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能强制登出超级管理员'}), 403

        tokens = load_json_with_lock(TOKENS_FILE)
        tokens_to_remove = []
        for token, token_data in tokens.items():
            token_username = token_data.get('username') if isinstance(token_data, dict) else token_data
            if token_username == username:
                tokens_to_remove.append(token)
        for token in tokens_to_remove:
            del tokens[token]
        save_json_with_lock(TOKENS_FILE, tokens)

        logger.info(f'管理员 {admin_user["username"]} 强制登出了 {username}，清除了 {len(tokens_to_remove)} 个token')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'强制登出错误: {str(e)}')
        return jsonify({'error': '强制登出失败'}), 500


@admin_bp.route('/api/admin/user/<username>', methods=['DELETE'])
@require_admin
def admin_delete_user(admin_user, username):
    """注销用户"""
    try:
        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能注销超级管理员'}), 403

        users = load_json_with_lock(USERS_FILE)
        if username in users:
            del users[username]
        save_json_with_lock(USERS_FILE, users)

        tokens = load_json_with_lock(TOKENS_FILE)
        tokens_to_remove = []
        for token, token_data in tokens.items():
            token_username = token_data.get('username') if isinstance(token_data, dict) else token_data
            if token_username == username:
                tokens_to_remove.append(token)
        for token in tokens_to_remove:
            del tokens[token]
        save_json_with_lock(TOKENS_FILE, tokens)

        logger.info(f'管理员 {admin_user["username"]} 注销了用户 {username}')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'注销用户错误: {str(e)}')
        return jsonify({'error': '注销用户失败'}), 500


def _batch_operate(admin_user, usernames, operation, **kwargs):
    """批量操作用户的通用辅助函数"""
    success_count = 0
    failed_count = 0

    for username in usernames:
        try:
            user = get_user(username)
            if not user:
                failed_count += 1
                continue
            if user.get('isSuperAdmin'):
                failed_count += 1
                continue
            if username == admin_user['username']:
                failed_count += 1
                continue

            if operation == 'ban':
                minutes = kwargs.get('minutes', 0)
                if minutes > 0:
                    user['bannedUntil'] = time.time() + minutes * 60
                else:
                    user['bannedUntil'] = None
                save_user(username, user)
                success_count += 1
            elif operation == 'unban':
                user['bannedUntil'] = None
                save_user(username, user)
                success_count += 1
            elif operation == 'kick':
                tokens = load_json_with_lock(TOKENS_FILE)
                tokens_to_remove = [t for t, td in tokens.items()
                                    if (td.get('username') if isinstance(td, dict) else td) == username]
                for t in tokens_to_remove:
                    del tokens[t]
                save_json_with_lock(TOKENS_FILE, tokens)
                success_count += 1
            elif operation == 'delete':
                users = load_json_with_lock(USERS_FILE)
                if username in users:
                    del users[username]
                save_json_with_lock(USERS_FILE, users)
                tokens = load_json_with_lock(TOKENS_FILE)
                tokens_to_remove = [t for t, td in tokens.items()
                                    if (td.get('username') if isinstance(td, dict) else td) == username]
                for t in tokens_to_remove:
                    del tokens[t]
                save_json_with_lock(TOKENS_FILE, tokens)
                success_count += 1
        except Exception:
            failed_count += 1

    return success_count, failed_count


@admin_bp.route('/api/admin/batch_ban', methods=['POST'])
@require_admin
def admin_batch_ban(admin_user):
    """批量封禁用户"""
    try:
        data = request.get_json()
        usernames = data.get('usernames', [])
        minutes = data.get('minutes', 0)

        if not usernames:
            return jsonify({'error': '请选择要封禁的用户'}), 400

        success_count, failed_count = _batch_operate(admin_user, usernames, 'ban', minutes=minutes)
        logger.info(f'管理员 {admin_user["username"]} 批量封禁：成功 {success_count}，失败 {failed_count}')
        return jsonify({'success_count': success_count, 'failed_count': failed_count})
    except Exception as e:
        logger.error(f'批量封禁错误: {str(e)}')
        return jsonify({'error': '批量封禁失败'}), 500


@admin_bp.route('/api/admin/batch_unban', methods=['POST'])
@require_admin
def admin_batch_unban(admin_user):
    """批量解封用户"""
    try:
        data = request.get_json()
        usernames = data.get('usernames', [])

        if not usernames:
            return jsonify({'error': '请选择要解封的用户'}), 400

        success_count, failed_count = _batch_operate(admin_user, usernames, 'unban')
        logger.info(f'管理员 {admin_user["username"]} 批量解封：成功 {success_count}，失败 {failed_count}')
        return jsonify({'success_count': success_count, 'failed_count': failed_count})
    except Exception as e:
        logger.error(f'批量解封错误: {str(e)}')
        return jsonify({'error': '批量解封失败'}), 500


@admin_bp.route('/api/admin/batch_kick', methods=['POST'])
@require_admin
def admin_batch_kick(admin_user):
    """批量强制登出用户"""
    try:
        data = request.get_json()
        usernames = data.get('usernames', [])

        if not usernames:
            return jsonify({'error': '请选择要强制登出的用户'}), 400

        success_count, failed_count = _batch_operate(admin_user, usernames, 'kick')
        logger.info(f'管理员 {admin_user["username"]} 批量强制登出：成功 {success_count}，失败 {failed_count}')
        return jsonify({'success_count': success_count, 'failed_count': failed_count})
    except Exception as e:
        logger.error(f'批量强制登出错误: {str(e)}')
        return jsonify({'error': '批量强制登出失败'}), 500


@admin_bp.route('/api/admin/batch_delete', methods=['POST'])
@require_admin
def admin_batch_delete(admin_user):
    """批量注销用户"""
    try:
        data = request.get_json()
        usernames = data.get('usernames', [])

        if not usernames:
            return jsonify({'error': '请选择要注销的用户'}), 400

        success_count, failed_count = _batch_operate(admin_user, usernames, 'delete')
        logger.info(f'管理员 {admin_user["username"]} 批量注销：成功 {success_count}，失败 {failed_count}')
        return jsonify({'success_count': success_count, 'failed_count': failed_count})
    except Exception as e:
        logger.error(f'批量注销错误: {str(e)}')
        return jsonify({'error': '批量注销失败'}), 500
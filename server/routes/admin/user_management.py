"""管理后台 - 用户管理路由
负责：用户列表查看、封禁、解封、积分修改、强制登出、注销、
验证码设置、免密登录设置、密码修改
"""

import hashlib
import time

from flask import jsonify, request

from ...auth import require_admin, require_super_admin
from ...logger import logger
from ...models import (
    delete_user,
    get_admin_permissions,
    get_all_tokens,
    get_all_users_from_db,
    get_user,
    remove_user_tokens,
    save_plain_password,
    save_user,
)
from ..admin_routes import admin_bp, require_permission

_admin_users_cache = {'data': None, 'timestamp': 0, 'ttl': 5}


def _invalidate_admin_users_cache():
    _admin_users_cache['data'] = None
    _admin_users_cache['timestamp'] = 0


def _build_admin_user_list():
    now = time.time()
    if _admin_users_cache['data'] is not None and now - _admin_users_cache['timestamp'] < _admin_users_cache['ttl']:
        return _admin_users_cache['data']

    users = get_all_users_from_db()
    tokens = get_all_tokens()
    online_users = set()
    for _token, token_data in tokens.items():
        if isinstance(token_data, dict) and now - token_data.get('createdAt', 0) < 3600:
            online_users.add(token_data.get('username'))

    user_list = []
    for username, user_data in users.items():
        is_banned = False
        remaining_minutes = 0
        banned_until = user_data.get('bannedUntil')
        if banned_until and now < banned_until:
            is_banned = True
            remaining_minutes = max(0, int((banned_until - now) / 60))

        user_entry = {
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
            'passwordFreeRemainingAttempts': user_data.get('passwordFreeRemainingAttempts', 0),
        }
        if user_data.get('isAdmin'):
            user_entry['permissions'] = get_admin_permissions(user_data)
        user_list.append(user_entry)

    _admin_users_cache['data'] = user_list
    _admin_users_cache['timestamp'] = now
    return user_list


@admin_bp.route('/api/admin/users', methods=['GET'])
@require_admin
def admin_get_users(admin_user):
    try:
        user_list = _build_admin_user_list()
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
        return jsonify(
            {
                'username': username,
                'score': user.get('score', 0),
                'wins': user.get('wins', 0),
                'games': user.get('games', 0),
                'joinDate': user.get('joinDate', ''),
                'lastLogin': user.get('lastLogin', ''),
                'isAdmin': user.get('isAdmin', False),
                'isSuperAdmin': user.get('isSuperAdmin', False),
                'bannedUntil': user.get('bannedUntil'),
            }
        )
    except Exception as e:
        logger.error(f'获取用户详情错误: {str(e)}')
        return jsonify({'error': '获取用户详情失败'}), 500


@admin_bp.route('/api/admin/user/<username>/ban', methods=['POST'])
@require_admin
@require_permission('canBanUser')
def admin_ban_user(admin_user, username):
    try:
        data = request.get_json()
        duration = data.get('duration', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能封禁自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403

        if duration > 0:
            user['bannedUntil'] = time.time() + duration
        else:
            user['bannedUntil'] = None

        save_user(username, user)
        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 封禁了 {username}，时长: {duration}秒')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'封禁用户错误: {str(e)}')
        return jsonify({'error': '封禁用户失败'}), 500


@admin_bp.route('/api/admin/user/<username>/score', methods=['POST'])
@require_admin
@require_permission('canModifyScore')
def admin_set_score(admin_user, username):
    try:
        data = request.get_json()
        score_input = data.get('score', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404

        if isinstance(score_input, str) and score_input and score_input[0] in ('+', '-'):
            delta = int(score_input)
            user['score'] = user['score'] + delta
        else:
            user['score'] = int(score_input)
        save_user(username, user)
        _invalidate_admin_users_cache()
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
        _invalidate_admin_users_cache()
        return jsonify({'success': True, 'message': '权限修改成功'})
    except Exception as e:
        logger.error(f'修改管理员权限错误: {str(e)}')
        return jsonify({'error': '修改管理员权限失败'}), 500


@admin_bp.route('/api/admin/set_captcha', methods=['POST'])
@require_admin
@require_permission('canBanUser')
def admin_set_captcha(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        use_captcha = data.get('useCaptcha', True)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能修改自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员'}), 403

        user['useCaptcha'] = use_captcha
        save_user(username, user)
        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 设置 {username} 的验证码: {use_captcha}')
        return jsonify({'success': True, 'message': '验证码设置已更新'})
    except Exception as e:
        logger.error(f'设置验证码错误: {str(e)}')
        return jsonify({'error': '设置验证码失败'}), 500


@admin_bp.route('/api/admin/set_password_free', methods=['POST'])
@require_admin
@require_permission('canSetPasswordFree')
def admin_set_password_free(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        password_free = data.get('passwordFree', False)
        max_attempts = data.get('maxAttempts', 0)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能修改自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员'}), 403

        user['passwordFree'] = password_free
        if password_free:
            old_max = user.get('passwordFreeMaxAttempts', 0)
            old_remaining = user.get('passwordFreeRemainingAttempts', 0)
            if max_attempts > 0:
                user['passwordFreeMaxAttempts'] = max_attempts
                if max_attempts != old_max and old_max > 0:
                    diff = max_attempts - old_max
                    new_remaining = old_remaining + diff
                    user['passwordFreeRemainingAttempts'] = max(0, min(new_remaining, max_attempts))
                else:
                    user['passwordFreeRemainingAttempts'] = max_attempts
            else:
                user['passwordFreeMaxAttempts'] = old_max
                user['passwordFreeRemainingAttempts'] = old_remaining
        else:
            pass

        save_user(username, user)
        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 设置 {username} 的免密登录: {password_free}')
        return jsonify({'success': True, 'message': '免密登录设置已更新'})
    except Exception as e:
        logger.error(f'设置免密登录错误: {str(e)}')
        return jsonify({'error': '设置免密登录失败'}), 500


@admin_bp.route('/api/admin/change_password', methods=['POST'])
@require_admin
@require_permission('canChangePassword')
def admin_change_password(admin_user):
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

        user['password'] = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
        save_user(username, user)
        save_plain_password(username, new_password)
        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 修改了 {username} 的密码')
        return jsonify({'success': True, 'message': '密码修改成功'})
    except Exception as e:
        logger.error(f'修改密码错误: {str(e)}')
        return jsonify({'error': '修改密码失败'}), 500


@admin_bp.route('/api/admin/ban', methods=['POST'])
@require_admin
@require_permission('canBanUser')
def admin_ban(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        minutes = data.get('minutes', 0)

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能封禁自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403

        if minutes > 0:
            user['bannedUntil'] = time.time() + minutes * 60
        else:
            user['bannedUntil'] = None

        save_user(username, user)

        from ... import socketio

        if minutes > 0:
            socketio.push_ban_notification(username, user['bannedUntil'])
            socketio.push_user_status_update(username, {'bannedUntil': user['bannedUntil']})

        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 封禁了 {username}，时长: {minutes}分钟')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'封禁用户错误: {str(e)}')
        return jsonify({'error': '封禁用户失败'}), 500


@admin_bp.route('/api/admin/unban', methods=['POST'])
@require_admin
@require_permission('canBanUser')
def admin_unban(admin_user):
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

        from ... import socketio

        socketio.push_ban_notification(username, None)
        socketio.push_user_status_update(username, {'bannedUntil': None})

        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 解封了 {username}')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'解封用户错误: {str(e)}')
        return jsonify({'error': '解封用户失败'}), 500


@admin_bp.route('/api/admin/kick', methods=['POST'])
@require_admin
@require_permission('canKickUser')
def admin_kick(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能强制登出自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能强制登出超级管理员'}), 403

        remove_user_tokens(username)

        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 强制登出了 {username}')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'强制登出错误: {str(e)}')
        return jsonify({'error': '强制登出失败'}), 500


@admin_bp.route('/api/admin/user/<username>', methods=['DELETE'])
@require_admin
@require_permission('canDeleteUser')
def admin_delete_user(admin_user, username):
    try:
        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username == admin_user['username']:
            return jsonify({'error': '不能注销自己'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能注销超级管理员'}), 403

        delete_user(username)

        _invalidate_admin_users_cache()
        logger.info(f'管理员 {admin_user["username"]} 注销了用户 {username}')
        return jsonify({'success': True, 'message': '操作成功'})
    except Exception as e:
        logger.error(f'注销用户错误: {str(e)}')
        return jsonify({'error': '注销用户失败'}), 500
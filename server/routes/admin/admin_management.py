"""管理后台 - 管理员管理路由
负责：创建管理员、设置管理员权限、统计信息、查看记录
"""

import hashlib
from datetime import datetime

from flask import jsonify, request

from ...auth import require_admin, require_super_admin
from ...logger import logger
from ...models import (
    PERMISSION_FIELDS,
    get_admin_permissions,
    get_all_users_from_db,
    get_user,
    load_records,
    save_plain_password,
    save_user,
)
from ..admin_routes import admin_bp


@admin_bp.route('/api/admin/stats', methods=['GET'])
@require_admin
def admin_get_stats(admin_user):
    try:
        users = get_all_users_from_db()
        records = load_records()

        total_users = len(users) if isinstance(users, dict) else 0
        total_records = len(records) if isinstance(records, (dict, list)) else 0

        return jsonify({'totalUsers': total_users, 'totalRecords': total_records})
    except Exception as e:
        logger.error(f'获取统计信息错误: {str(e)}')
        return jsonify({'error': '获取统计信息失败'}), 500


@admin_bp.route('/api/admin/records', methods=['GET'])
@require_admin
def admin_get_records(admin_user):
    try:
        records = load_records()
        record_list = []
        if isinstance(records, dict):
            for record_id, record in records.items():
                record['id'] = record_id
                record_list.append(record)
        elif isinstance(records, list):
            record_list = records

        record_list.sort(key=lambda x: x.get('endTime', 0), reverse=True)
        return jsonify({'records': record_list})
    except Exception as e:
        logger.error(f'获取所有记录错误: {str(e)}')
        return jsonify({'records': []})


@admin_bp.route('/api/admin/create_admin', methods=['POST'])
@require_super_admin
def admin_create_admin(admin_user):
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
            'bannedUntil': None,
            'canBanUser': True,
            'canKickUser': True,
            'canDeleteUser': True,
            'canChangePassword': True,
            'canModifyScore': True,
            'canSetPasswordFree': True,
            'canMonitorMatches': True,
            'canManageMatches': True,
        }
        save_user(username, new_user)
        save_plain_password(username, password)
        from .user_management import _invalidate_admin_users_cache

        _invalidate_admin_users_cache()
        logger.info(f'超级管理员 {admin_user["username"]} 创建了管理员账号 {username}')
        return jsonify({'success': True, 'message': '管理员账号创建成功'})
    except Exception as e:
        logger.error(f'创建管理员错误: {str(e)}')
        return jsonify({'error': '创建管理员账号失败'}), 500


@admin_bp.route('/api/admin/set_permission', methods=['POST'])
@require_super_admin
def admin_set_permission(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        can_manage = data.get('canManage', False)

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username.lower() == 'admin':
            return jsonify({'error': '权限不足，无法对管理员账号进行任何操作'}), 403
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员权限'}), 403

        user['canManage'] = can_manage
        save_user(username, user)
        from .user_management import _invalidate_admin_users_cache

        _invalidate_admin_users_cache()
        logger.info(f'超级管理员 {admin_user["username"]} 设置 {username} 的管理权限: {can_manage}')
        return jsonify({'success': True, 'message': '权限设置已更新'})
    except Exception as e:
        logger.error(f'设置权限错误: {str(e)}')
        return jsonify({'error': '设置权限失败'}), 500


@admin_bp.route('/api/admin/set_permissions', methods=['POST'])
@require_super_admin
def admin_set_permissions(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        permissions = data.get('permissions', {})

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username.lower() == 'admin':
            return jsonify({'error': '权限不足，无法对管理员账号进行任何操作'}), 403
        if not user.get('isAdmin'):
            return jsonify({'error': '该用户不是管理员'}), 400
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员权限'}), 403

        for field in PERMISSION_FIELDS:
            if field in permissions:
                user[field] = bool(permissions[field])

        save_user(username, user)
        from .user_management import _invalidate_admin_users_cache

        _invalidate_admin_users_cache()
        logger.info(f'超级管理员 {admin_user["username"]} 设置了 {username} 的细粒度权限')
        return jsonify({'success': True, 'message': '权限设置已更新', 'permissions': get_admin_permissions(user)})
    except Exception as e:
        logger.error(f'设置细粒度权限错误: {str(e)}')
        return jsonify({'error': '设置权限失败'}), 500


@admin_bp.route('/api/admin/set_all_permissions', methods=['POST'])
@require_super_admin
def admin_set_all_permissions(admin_user):
    try:
        data = request.get_json()
        username = data.get('username')
        enable = data.get('enable', True)

        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        if username.lower() == 'admin':
            return jsonify({'error': '权限不足，无法对管理员账号进行任何操作'}), 403
        if not user.get('isAdmin'):
            return jsonify({'error': '该用户不是管理员'}), 400
        if user.get('isSuperAdmin'):
            return jsonify({'error': '不能修改超级管理员权限'}), 403

        for field in PERMISSION_FIELDS:
            user[field] = enable
        user['canManage'] = enable

        save_user(username, user)
        action = '启用' if enable else '禁用'
        from .user_management import _invalidate_admin_users_cache

        _invalidate_admin_users_cache()
        logger.info(f'超级管理员 {admin_user["username"]} {action}了 {username} 的所有权限')
        return jsonify({'success': True, 'message': f'已{action}所有权限', 'permissions': get_admin_permissions(user)})
    except Exception as e:
        logger.error(f'设置所有权限错误: {str(e)}')
        return jsonify({'error': '设置权限失败'}), 500

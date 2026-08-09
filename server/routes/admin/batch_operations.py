"""管理后台 - 批量操作路由
负责：批量封禁、批量解封、批量强制登出、批量注销用户
"""

from flask import jsonify, request

from ...auth import require_admin
from ...logger import logger
from ..admin_routes import _batch_operate, admin_bp, require_permission


@admin_bp.route('/api/admin/batch_ban', methods=['POST'])
@require_admin
@require_permission('canBanUser')
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
@require_permission('canBanUser')
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
@require_permission('canKickUser')
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
@require_permission('canDeleteUser')
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

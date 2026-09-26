"""管理后台 - 对局监控路由
负责：对局列表查看、详情、强制关闭、全部关闭、强制重启、强制落子
"""

from flask import jsonify, request

from ...auth import require_admin
from ...logger import logger
from ...match_manager import (
    force_close_all_matches,
    force_close_match,
    force_move,
    force_restart_match,
    get_all_matches,
    get_match_detail,
)
from ...match.storage import broadcast_match_update
from ..admin_routes import admin_bp, require_permission
from ..match_routes import _emit_match_list_changed


@admin_bp.route('/api/admin/matches', methods=['GET'])
@require_admin
@require_permission('canMonitorMatches')
def admin_get_matches(admin_user):
    try:
        return jsonify(get_all_matches())
    except Exception as e:  # noqa: BLE001
        logger.error(f'获取匹配列表错误: {e!s}')
        return jsonify({'error': '获取匹配列表失败'}), 500


@admin_bp.route('/api/admin/match/<match_id>', methods=['GET'])
@require_admin
@require_permission('canMonitorMatches')
def admin_get_match(admin_user, match_id):
    return get_match_detail(match_id)


@admin_bp.route('/api/admin/match/<match_id>/close', methods=['POST'])
@require_admin
@require_permission('canManageMatches')
def admin_close_match(admin_user, match_id):
    logger.info(f'管理员 {admin_user["username"]} 强制关闭房间 {match_id}')
    result = force_close_match(match_id)
    broadcast_match_update(match_id)
    _emit_match_list_changed()
    return result


@admin_bp.route('/api/admin/matches/close-all', methods=['POST'])
@require_admin
@require_permission('canManageMatches')
def admin_close_all_matches(admin_user):
    logger.info(f'管理员 {admin_user["username"]} 强制关闭所有房间')
    result = force_close_all_matches()
    _emit_match_list_changed()
    return result


@admin_bp.route('/api/admin/match/<match_id>/restart', methods=['POST'])
@require_admin
@require_permission('canManageMatches')
def admin_restart_match(admin_user, match_id):
    logger.info(f'管理员 {admin_user["username"]} 强制重新开始房间 {match_id}')
    result = force_restart_match(match_id)
    broadcast_match_update(match_id)
    return result


@admin_bp.route('/api/admin/match/<match_id>/force-move', methods=['POST'])
@require_admin
@require_permission('canManageMatches')
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
        result = force_move(match_id, row, col, player)
        broadcast_match_update(match_id)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error(f'强制落子错误: {e!s}')
        return jsonify({'error': '强制落子失败'}), 500

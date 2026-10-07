"""管理员对局操作模块
负责：强制关闭、强制重启、强制落子等管理员操作
"""

import time

from ..game_logic import check_win
from ..logger import logger
from .storage import active_matches, active_matches_lock, save_matches


def force_close_match(match_id):
    """强制关闭对局（管理员用）
    直接关闭指定对局，标记为已关闭
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        match['status'] = 'closed'
        match['closed_at'] = int(time.time())
        match['closed_by'] = 'admin'
        match['opponent_left'] = True
        save_matches()
    logger.info(f'管理员强制关闭房间: {match_id}')
    return {'success': True, 'message': '房间已关闭'}, 200


def force_close_all_matches():
    """强制关闭所有对局（管理员用）
    关闭所有活跃对局，返回被关闭的 match_id 列表，让路由层广播通知玩家/观战者
    """
    closed_count = 0
    closed_ids = []
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_reconnect']:
                match['status'] = 'closed'
                match['closed_at'] = int(time.time())
                match['closed_by'] = 'admin'
                closed_count += 1
                closed_ids.append(match_id)
        save_matches()
    logger.info(f'管理员强制关闭所有房间，共关闭{closed_count} 个')
    return {
        'success': True,
        'message': f'已关闭{closed_count} 个房间',
        'closed_count': closed_count,
        'closed_ids': closed_ids,
    }, 200


def force_restart_match(match_id):
    """强制重新开始对局（管理员用）
    重置棋盘和状态，交换颜色。返回值在锁内捕获避免竞态。
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        original_creator_color = match['creatorColor']
        match['creatorColor'] = 1 if original_creator_color == 2 else 2
        match['board'] = [[0] * 15 for _ in range(15)]
        match['currentPlayer'] = 1
        match['moves'] = []
        match['winner'] = None
        match['status'] = 'playing'
        match['startTime'] = time.time()
        match['creatorLeft'] = False
        match['opponentLeft'] = False
        match['restartRequested'] = False
        match['restartRequestedBy'] = None
        match['restartAcceptedBy'] = None
        match['restartDeclinedBy'] = None
        match['restartInitiated'] = True
        match['restartVersion'] = match.get('restartVersion', 0) + 1
        match['lastMoveTime'] = None
        match['moveDeadline'] = 0
        match['undoRequested'] = False
        match['undoRequestedBy'] = None
        match['undoAccepted'] = False
        match['undoDeclined'] = False
        match['undoDeclinedBy'] = None
        match['drawRequested'] = False
        match['drawRequestedBy'] = None
        match['drawAccepted'] = False
        match['drawDeclined'] = False
        match['drawDeclinedBy'] = None
        match['lastActivity'] = time.time()

        # 重置计时字段
        if match.get('timeMode', 'untimed') != 'untimed':
            match['blackTime'] = match.get('totalTime', 600)
            match['whiteTime'] = match.get('totalTime', 600)

        save_matches()

        # 在锁内捕获返回值，避免竞态
        restart_version = match['restartVersion']
        creator_color = match['creatorColor']
        current_player = match['currentPlayer']

    logger.info(f'管理员强制重新开始房间: {match_id}')
    return {
        'success': True,
        'restartInitiated': True,
        'restartVersion': restart_version,
        'creatorColor': creator_color,
        'currentPlayer': current_player,
        'message': '对局已强制重新开始',
    }, 200


def force_move(match_id, row, col, player):
    """强制落子（管理员用）
    在指定位置放置指定玩家的棋子，不检查回合和禁手，但会正确推进计时器。
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        if match['status'] not in ['playing']:
            return {'error': '游戏未在进行中'}, 400
        if row < 0 or row >= 15 or col < 0 or col >= 15:
            return {'error': '坐标超出棋盘范围'}, 400
        if match['board'][row][col] != 0:
            return {'error': '该位置已有棋子'}, 400

        now = time.time()
        time_mode = match.get('timeMode', 'untimed')

        # 计时推进（与 make_move 保持一致）
        if time_mode != 'untimed':
            if time_mode in ('total', 'both'):
                my_time_key = 'blackTime' if player == 1 else 'whiteTime'
                elapsed = now - match.get('lastMoveTime', match['startTime'])
                match[my_time_key] = max(0, match.get(my_time_key, 0) - elapsed)
            match['lastMoveTime'] = now
            if time_mode in ('move', 'both'):
                match['moveDeadline'] = now + match.get('moveTime', 30)

        match['board'][row][col] = player
        match['moves'].append({'row': row, 'col': col, 'player': player})
        match['lastActivity'] = now

        if check_win(match['board'], row, col, player):
            match['winner'] = player
            match['status'] = 'finished'
            save_matches()
            logger.info(f'管理员强制落子，游戏结束: {match_id}, winner: {player}')
            return {'success': True, 'win': True, 'winner': player, 'board': [r[:] for r in match['board']]}, 200

        match['currentPlayer'] = 2 if player == 1 else 1
        save_matches()
    logger.info(f'管理员强制落子: {match_id}, ({row},{col}), player={player}')
    return {'success': True, 'win': False, 'board': [r[:] for r in match['board']]}, 200
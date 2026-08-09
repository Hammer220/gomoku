"""对局交互功能模块
负责：悔棋、和棋、观战等交互功能
"""

import time

from ..logger import logger
from .storage import active_matches, active_matches_lock, save_matches

# ==================== 悔棋功能 ====================


def request_undo(user, match_id):
    """请求悔棋
    对局中一方发起悔棋请求，等待对手确认
    只能请求悔最后一步，且是当前轮到的玩家（即请求悔对方刚走的一步）
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if match['status'] != 'playing':
            return {'error': '游戏未在进行中'}, 400
        if len(match['moves']) < 2:
            return {'error': '对局刚开始，无法悔棋'}, 400

        if match.get('undoRequested'):
            if match.get('undoRequestedBy') == username:
                # 取消悔棋请求
                match['undoRequested'] = False
                match['undoRequestedBy'] = None
                match['lastActivity'] = time.time()
                save_matches()
                return {'success': True, 'undoCancelled': True, 'message': '已取消悔棋请求'}, 200
            else:
                return {'error': '已有待处理的悔棋请求'}, 400

        match['undoRequested'] = True
        match['undoRequestedBy'] = username
        match['lastActivity'] = time.time()
        save_matches()
        return {'success': True, 'undoRequested': True, 'undoRequestedBy': username, 'message': '已请求悔棋'}, 200


def accept_undo(user, match_id):
    """接受悔棋请求
    对手同意悔棋后，回退最后两步（双方各一步）
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if not match.get('undoRequested'):
            return {'error': '没有待处理的悔棋请求'}, 400
        if match.get('undoRequestedBy') == username:
            return {'error': '不能接受自己的悔棋请求'}, 400

        # 回退两步
        moves = match['moves']
        if len(moves) >= 2:
            # 移除最后两步
            move1 = moves.pop()
            move2 = moves.pop()
            match['board'][move1['row']][move1['col']] = 0
            match['board'][move2['row']][move2['col']] = 0
            # 恢复轮次到两步之前
            match['currentPlayer'] = move2['player']

        match['undoRequested'] = False
        match['undoRequestedBy'] = None
        match['undoAccepted'] = True
        match['undoDeclined'] = False
        match['undoDeclinedBy'] = None
        match['lastActivity'] = time.time()
        board_copy = [row[:] for row in match['board']]
        save_matches()
        logger.info(f'悔棋已执行: match={match_id}')
        return {
            'success': True,
            'undoAccepted': True,
            'board': board_copy,
            'currentPlayer': match['currentPlayer'],
            'message': '悔棋成功',
        }, 200


def decline_undo(user, match_id):
    """拒绝悔棋请求"""
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if not match.get('undoRequested'):
            return {'error': '没有待处理的悔棋请求'}, 400

        match['undoRequested'] = False
        match['undoRequestedBy'] = None
        match['undoDeclined'] = True
        match['undoAccepted'] = False
        match['undoDeclinedBy'] = username
        match['lastActivity'] = time.time()
        save_matches()
        return {'success': True, 'undoDeclined': True, 'message': '已拒绝悔棋请求'}, 200


# ==================== 和棋功能 ====================


def request_draw(user, match_id):
    """请求和棋"""
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if match['status'] != 'playing':
            return {'error': '游戏未在进行中'}, 400

        if match.get('drawRequested'):
            if match.get('drawRequestedBy') == username:
                match['drawRequested'] = False
                match['drawRequestedBy'] = None
                match['lastActivity'] = time.time()
                save_matches()
                return {'success': True, 'drawCancelled': True, 'message': '已取消和棋请求'}, 200
            else:
                # 对方也请求和棋，直接同意
                match['winner'] = 0  # 0=平局
                match['status'] = 'finished'
                match['drawRequested'] = False
                match['drawRequestedBy'] = None
                match['drawAccepted'] = True
                match['drawDeclined'] = False
                match['drawDeclinedBy'] = None
                match['lastActivity'] = time.time()
                save_matches()
                return {'success': True, 'drawAccepted': True, 'winner': 0, 'message': '双方同意和棋！'}, 200

        match['drawRequested'] = True
        match['drawRequestedBy'] = username
        match['lastActivity'] = time.time()
        save_matches()
        return {'success': True, 'drawRequested': True, 'drawRequestedBy': username, 'message': '已请求和棋'}, 200


def accept_draw(user, match_id):
    """接受和棋请求"""
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if not match.get('drawRequested'):
            return {'error': '没有待处理的和棋请求'}, 400
        if match.get('drawRequestedBy') == username:
            return {'error': '不能接受自己的和棋请求'}, 400

        match['winner'] = 0  # 0=平局
        match['status'] = 'finished'
        match['drawRequested'] = False
        match['drawRequestedBy'] = None
        match['drawAccepted'] = True
        match['drawDeclined'] = False
        match['drawDeclinedBy'] = None
        match['lastActivity'] = time.time()
        save_matches()
        return {'success': True, 'drawAccepted': True, 'winner': 0, 'message': '和棋！'}, 200


def decline_draw(user, match_id):
    """拒绝和棋请求"""
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if not match.get('drawRequested'):
            return {'error': '没有待处理的和棋请求'}, 400

        match['drawRequested'] = False
        match['drawRequestedBy'] = None
        match['drawDeclined'] = True
        match['drawAccepted'] = False
        match['drawDeclinedBy'] = username
        match['lastActivity'] = time.time()
        save_matches()
        return {'success': True, 'drawDeclined': True, 'message': '已拒绝和棋请求'}, 200


# ==================== 认输功能 ====================


def resign(user, match_id):
    """认输 - 直接判负"""
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403
        if match['status'] != 'playing':
            return {'error': '游戏未在进行中'}, 400

        my_color = match['creatorColor'] if match['creator'] == username else (2 if match['creatorColor'] == 1 else 1)

        winner_color = 2 if my_color == 1 else 1
        match['winner'] = winner_color
        match['status'] = 'finished'
        match['winReason'] = 'resign'
        match['loser'] = username
        match['lastActivity'] = time.time()

        save_matches()

        return {
            'success': True,
            'resigned': True,
            'winner': winner_color,
            'winReason': 'resign',
            'message': '你已认输',
        }, 200


# ==================== 观战功能 ====================


def get_spectatable_matches():
    """获取所有可观看的对局列表（过滤掉不允许观战的房间）"""
    with active_matches_lock:
        spec_list = []
        for match_id, match in active_matches.items():
            if match['status'] in ['playing', 'waiting_for_reconnect']:
                if not match.get('allowSpectate', True):
                    continue
                spec_list.append(
                    {
                        'id': match_id,
                        'creator': match['creator'],
                        'opponent': match.get('opponent'),
                        'status': match['status'],
                        'creatorColor': match['creatorColor'],
                        'currentPlayer': match['currentPlayer'],
                        'startTime': match['startTime'],
                        'moveCount': len(match.get('moves', [])),
                        'spectatorCount': len(match.get('spectators', [])),
                        'timeMode': match.get('timeMode', 'untimed'),
                        'hasPassword': match.get('password') is not None,
                    }
                )
        spec_list.sort(key=lambda x: x['moveCount'], reverse=True)
    return {'matches': spec_list}


def spectate_match(user, match_id, password=None):
    """开始观战
    检查房间是否允许观战，以及密码（如果设置）
    返回对局完整信息，将用户加入观战者列表
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['status'] not in ['playing', 'waiting_for_reconnect']:
            return {'error': '该对局不可观看'}, 400

        # 不能观战自己参与的对局
        if match['creator'] == username or match.get('opponent') == username:
            return {'error': '您是参与者，请直接进入对局'}, 400

        # 检查是否允许观战
        if not match.get('allowSpectate', True):
            return {'error': '该房间不允许观战'}, 403

        # 密码验证
        room_password = match.get('password')
        if room_password is not None and room_password != password:
            return {'error': '密码错误', 'needPassword': True}, 403

        # 加入观战者列表
        spectators = match.setdefault('spectators', [])
        if username not in spectators:
            spectators.append(username)

        return {
            'success': True,
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
        }, 200


def leave_spectate(user, match_id):
    """离开观战"""
    with active_matches_lock:
        if match_id in active_matches:
            match = active_matches[match_id]
            spectators = match.get('spectators', [])
            if user['username'] in spectators:
                spectators.remove(user['username'])
    return {'success': True}, 200


def get_spectate_status(user, match_id):
    """获取观战对局状态（轮询用）"""
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        spectators = match.get('spectators', [])

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
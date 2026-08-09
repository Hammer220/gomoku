"""对局核心操作模块
负责：创建、加入、落子、离开、关闭、重开等核心对局操作
"""

import random
import secrets
import time
import uuid

from ..game_logic import RULE_MODE_STANDARD, check_forbidden, check_win
from ..logger import logger
from .storage import active_matches, active_matches_lock, save_matches


def create_match(
    user,
    time_mode='untimed',
    move_time=30,
    total_time=600,
    allow_spectate=True,
    password=None,
    rule_mode=RULE_MODE_STANDARD,
    invite_only=False,
    invited_friends=None,
):
    """创建新对局
    生成一个8位随机ID作为房间号，随机分配创建者颜色（黑/白），初始状态为等待中
    time_mode: 'untimed' | 'move' | 'total' | 'both'
    move_time: 每步限时（秒），默认30秒
    total_time: 总时间（秒），默认600秒=10分钟
    allow_spectate: 是否允许观战，默认True
    password: 房间密码，None表示无密码
    rule_mode: 规则模式 ('standard' | 'renju' | 'free')
    invite_only: 是否为邀请制房间（仅好友可加入），默认False
    invited_friends: 邀请的好友用户名列表
    返回房间号和创建者颜色
    """
    match_id = str(uuid.uuid4())[:8]
    creator_color = random.choice([1, 2])  # 1=黑棋, 2=白棋

    with active_matches_lock:
        active_matches[match_id] = {
            'id': match_id,
            'creator': user['username'],
            'opponent': None,
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],  # 15x15空棋盘
            'currentPlayer': 1,  # 黑棋先手
            'moves': [],  # 落子历史
            'winner': None,
            'startTime': time.time(),
            'creatorColor': creator_color,
            'lastActivity': time.time(),
            # 计时模式
            'timeMode': time_mode,
            'moveTime': move_time,
            'totalTime': total_time,
            'blackTime': total_time,  # 黑棋剩余时间
            'whiteTime': total_time,  # 白棋剩余时间
            'moveDeadline': 0,  # 走棋截止时间戳
            # 悔棋
            'undoRequested': False,
            'undoRequestedBy': None,
            # 和棋
            'drawRequested': False,
            'drawRequestedBy': None,
            # 观战者
            'spectators': [],
            # 房间设置
            'allowSpectate': allow_spectate,
            'password': password,  # None表示无密码
            # 规则模式
            'ruleMode': rule_mode,
            # 邀请制
            'inviteOnly': invite_only,
            'invitedFriends': invited_friends or [],
            # 观战token（用于分享观战链接）
            'spectateToken': secrets.token_hex(20),
        }
    save_matches()
    logger.info(
        f'Match created: {match_id} by {user["username"]}, time_mode={time_mode}, rule_mode={rule_mode}, allow_spectate={allow_spectate}, password={"yes" if password else "no"}'
    )
    return match_id, creator_color


def join_match(user, match_id, password=None):
    """加入对局
    检查房间是否存在、是否可加入、是否为创建者本人
    如果房间设置了密码，需要验证密码
    如果房间是邀请制房间，检查用户是否在邀请列表中
    加入后对局状态变为"playing"，并返回玩家颜色
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        if match['status'] != 'waiting':
            return {'error': '房间已开始或已结束'}, 400
        if match['creator'] == user['username']:
            return {'error': '不能加入自己创建的房间'}, 400

        # 邀请制检查
        if match.get('inviteOnly', False):
            invited_friends = match.get('invitedFriends', [])
            if user['username'] not in invited_friends:
                return {'error': '该房间为邀请制房间，您未被邀请'}, 403

        # 密码验证
        room_password = match.get('password')
        if room_password is not None and room_password != password:
            return {'error': '密码错误', 'needPassword': True}, 403

        creator_color = match['creatorColor']
        match['opponent'] = user['username']
        match['status'] = 'playing'
        match['currentPlayer'] = 1
        match['lastActivity'] = time.time()

    save_matches()
    logger.info(f'User {user["username"]} joined match {match_id}')

    return {
        'success': True,
        'matchId': match_id,
        'yourColor': 2 if creator_color == 1 else 1,  # 加入者与创建者颜色相反
        'opponent': match['creator'],
        'currentPlayer': 1,
    }, 200


def _handle_timeout(match, loser_color, reason):
    """处理超时，判定另一方获胜"""
    winner_color = 2 if loser_color == 1 else 1
    match['winner'] = winner_color
    match['status'] = 'finished'
    match['timeoutLoser'] = loser_color
    match['timeoutReason'] = reason
    logger.info(f'Timeout in match {match["id"]}, loser: {loser_color}, reason: {reason}')
    return {
        'success': True,
        'win': True,
        'winner': winner_color,
        'timeout': True,
        'timeoutReason': reason,
        'board': [row[:] for row in match['board']],
    }, 200


def make_move(user, match_id, row, col):
    """处理落子操作
    包含完整的校验流程：
    1. 检查房间是否存在
    2. 检查玩家是否在房间中
    3. 检查是否为当前玩家的回合
    4. 检查目标位置是否为空
    5. 如果是黑棋，检查是否触发禁手规则
    6. 如果计时模式，检查是否超时
    7. 执行落子，检查是否获胜
    8. 切换当前玩家，更新计时
    """
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['status'] != 'playing':
            return {'error': '游戏未在进行中', 'status': match['status']}, 400
        if match['creator'] != username and match['opponent'] != username:
            return {'error': '您不在这个房间中'}, 403

        # 确定当前用户的棋子颜色
        my_color = match['creatorColor'] if match['creator'] == username else (2 if match['creatorColor'] == 1 else 1)

        if match['currentPlayer'] != my_color:
            return {'error': '不是您的回合', 'currentPlayer': match['currentPlayer'], 'myColor': my_color}, 400
        if match['board'][row][col] != 0:
            return {'error': '该位置已有棋子'}, 400

        # 计时模式：检查超时
        time_mode = match.get('timeMode', 'untimed')
        now = time.time()
        time_out_result = None
        if time_mode != 'untimed':
            if time_mode in ('move', 'both') and match.get('moveDeadline', 0) > 0 and now > match['moveDeadline']:
                time_out_result = _handle_timeout(match, my_color, '走棋超时')
            if not time_out_result and time_mode in ('total', 'both'):
                my_time_key = 'blackTime' if my_color == 1 else 'whiteTime'
                remaining = match.get(my_time_key, 0)
                if remaining <= 0:
                    time_out_result = _handle_timeout(match, my_color, '总时间耗尽')

        if time_out_result:
            save_matches()
            return time_out_result

        # 黑棋需要检查禁手规则
        if my_color == 1:
            temp_board = [r[:] for r in match['board']]
            temp_board[row][col] = 1
            rule_mode = match.get('ruleMode', RULE_MODE_STANDARD)
            forbidden_check = check_forbidden(temp_board, row, col, rule_mode)
            if forbidden_check['forbidden']:
                return {
                    'error': f'禁手: {forbidden_check["reason"]}',
                    'forbidden': True,
                    'reason': forbidden_check['reason'],
                }, 400

        # 计时模式：更新剩余时间
        if time_mode != 'untimed':
            if time_mode in ('total', 'both'):
                my_time_key = 'blackTime' if my_color == 1 else 'whiteTime'
                elapsed = now - match.get('lastMoveTime', match['startTime'])
                match[my_time_key] = max(0, match.get(my_time_key, 0) - elapsed)
            match['lastMoveTime'] = now
            if time_mode in ('move', 'both'):
                match['moveDeadline'] = now + match.get('moveTime', 30)

        # 执行落子
        match['board'][row][col] = my_color
        match['moves'].append({'row': row, 'col': col, 'player': my_color})
        match['lastActivity'] = time.time()

        # 检查是否获胜
        if check_win(match['board'], row, col, my_color):
            match['winner'] = my_color
            match['status'] = 'finished'
            board_copy = [row[:] for row in match['board']]
            save_matches()
            logger.info(f'Game finished in match {match_id}, winner: {my_color}')
            return {'success': True, 'win': True, 'winner': my_color, 'board': board_copy}, 200

        # 切换回合
        match['currentPlayer'] = 2 if my_color == 1 else 1
        board_copy = [row[:] for row in match['board']]

    save_matches()
    return {'success': True, 'win': False, 'board': board_copy}, 200


def get_match_status(user, match_id):
    """获取对局状态
    返回完整的对局信息，包括棋盘状态、当前玩家、落子历史、重开状态等
    用于前端轮询更新
    """
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match['opponent'] != username:
            return {'error': '您不在这个房间中'}, 403

        match['lastActivity'] = time.time()

        # 确定请求者的颜色和对手名称
        my_color = None
        opponent_name = None
        if match['creator'] == username:
            my_color = match['creatorColor']
            opponent_name = match['opponent']
        else:
            my_color = 2 if match['creatorColor'] == 1 else 1
            opponent_name = match['creator']

        match_data = {
            'id': match_id,
            'status': match['status'],  # waiting/playing/finished/closed/waiting_for_reconnect
            'board': [row[:] for row in match['board']],  # 深拷贝棋盘
            'currentPlayer': match['currentPlayer'],  # 1=黑棋, 2=白棋
            'moves': match['moves'][:],  # 落子历史列表
            'winner': match['winner'],
            'myColor': my_color,  # 请求者的颜色
            'creatorColor': match['creatorColor'],
            'opponent': opponent_name,
            # 重开相关状态
            'restartRequested': match.get('restartRequested', False),
            'restartRequestedBy': match.get('restartRequestedBy'),
            'restartDeclinedBy': match.get('restartDeclinedBy'),
            'restartAccepted': match.get('restartAccepted', False),
            'restartInitiated': match.get('restartInitiated', False),
            'restartVersion': match.get('restartVersion', 0),
            # 计时相关
            'timeMode': match.get('timeMode', 'untimed'),
            'moveTime': match.get('moveTime', 30),
            'totalTime': match.get('totalTime', 600),
            'blackTime': match.get('blackTime', 600),
            'whiteTime': match.get('whiteTime', 600),
            'moveDeadline': match.get('moveDeadline', 0),
            # 悔棋
            'undoRequested': match.get('undoRequested', False),
            'undoRequestedBy': match.get('undoRequestedBy'),
            # 和棋
            'drawRequested': match.get('drawRequested', False),
            'drawRequestedBy': match.get('drawRequestedBy'),
            # 观战者
            'spectatorCount': len(match.get('spectators', [])),
            # 规则模式
            'ruleMode': match.get('ruleMode', RULE_MODE_STANDARD),
        }

    return match_data, 200


def leave_match(user, match_id):
    """离开对局
    处理逻辑：
    - 等待中的房间：创建者离开则直接删除房间
    - 进行中的房间：一房离开直接通知对手并关闭房间
    - 标记对手获胜
    """
    with active_matches_lock:
        if match_id not in active_matches:
            return {'success': True}, 200

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'success': True}, 200

        # 标记离开状态
        if match['creator'] == username:
            match['creatorLeft'] = True
        elif match.get('opponent') == username:
            match['opponentLeft'] = True

        creator_left = match.get('creatorLeft', False)
        opponent_left = match.get('opponentLeft', False)

        if match['status'] == 'waiting' and match['creator'] == username:
            # 等待中的房间，创建者离开则删除
            del active_matches[match_id]
            save_matches()
        elif creator_left and opponent_left:
            # 双方都离开，关闭房间
            match['status'] = 'closed'
            save_matches()
            del active_matches[match_id]
        else:
            # 一方离开，直接结束游戏，判对手获胜
            if match['status'] == 'playing':
                # 确定对手颜色（获胜方）
                winner = 2 if username == match['creator'] else 1
                match['winner'] = winner
                match['status'] = 'finished'
                match['finishedReason'] = 'opponent_left'
            elif match['status'] == 'waiting_for_reconnect':
                # 已经是等待重连状态，直接关闭
                match['status'] = 'closed'
            save_matches()

    return {'success': True}, 200


def close_match(user, match_id):
    """关闭对局
    只有创建者可以关闭房间，关闭后对手也会被标记为已离开
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username:
            return {'error': '只有房间创建者可以关闭房间'}, 403

        match['status'] = 'closed'
        match['closed_at'] = int(time.time())
        match['closed_by'] = username

        if 'opponent' in match and match['opponent']:
            match['opponent_left'] = True

        save_matches()
    return {'success': True, 'message': '房间已成功关闭'}, 200


def restart_match(user, match_id):
    """重新开始对局（双方确认机制）
    流程：
    1. 一方请求重新开始 -> 等待对手确认
    2. 同一方再次请求 -> 取消重新开始请求
    3. 对手确认 -> 重置棋盘，交换颜色，重新开始
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403

        if match['status'] not in ['finished', 'playing']:
            return {'error': '游戏无法重新开始'}, 400

        restart_requested = match.get('restartRequested', False)
        restart_requested_by = match.get('restartRequestedBy')

        if not restart_requested:
            # 首次请求重新开始
            match['restartRequested'] = True
            match['restartRequestedBy'] = username
            match['restartAcceptedBy'] = None
            match['restartDeclinedBy'] = None
            match['lastActivity'] = time.time()
            save_matches()
            return {
                'success': True,
                'restartRequested': True,
                'restartRequestedBy': username,
                'message': '已请求重新开始，等待对手确认',
            }, 200

        if restart_requested_by == username:
            # 同一方重复请求 => 取消请求
            match['restartRequested'] = False
            match['restartRequestedBy'] = None
            match['restartAcceptedBy'] = None
            match['lastActivity'] = time.time()
            save_matches()
            return {
                'success': True,
                'restartRequested': False,
                'restartCancelled': True,
                'message': '已取消重新开始请求',
            }, 200

        if restart_requested_by and restart_requested_by != username:
            # 对手接受重新开始 => 执行重开
            original_creator_color = match['creatorColor']
            match['creatorColor'] = 1 if original_creator_color == 2 else 2  # 交换颜色
            match['board'] = [[0] * 15 for _ in range(15)]  # 重置棋盘
            match['currentPlayer'] = 1  # 黑棋先手
            match['moves'] = []
            match['winner'] = None
            match['status'] = 'playing'
            match['startTime'] = time.time()
            match['creatorLeft'] = False
            match['opponentLeft'] = False
            match['restartRequested'] = False
            match['restartRequestedBy'] = None
            match['restartAcceptedBy'] = username
            match['restartDeclinedBy'] = None
            match['restartInitiated'] = True
            match['restartVersion'] = match.get('restartVersion', 0) + 1  # 版本号递增，用于前端检测
            match['lastActivity'] = time.time()
            save_matches()

            return {
                'success': True,
                'restartInitiated': True,
                'restartVersion': match['restartVersion'],
                'creatorColor': match['creatorColor'],
                'currentPlayer': match['currentPlayer'],
                'message': '对局已重新开始！',
            }, 200

    return {'error': '未知错误'}, 500


def decline_restart(user, match_id):
    """拒绝重新开始请求
    对手拒绝后，清除重新开始请求状态
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match.get('opponent') != username:
            return {'error': '您不在这个房间中'}, 403

        if not match.get('restartRequested'):
            return {'error': '没有待处理的重新开始请求'}, 400

        match['restartRequested'] = False
        match['restartRequestedBy'] = None
        match['restartAcceptedBy'] = None
        match['restartDeclinedBy'] = username
        match['lastActivity'] = time.time()
        save_matches()

    return {
        'success': True,
        'restartDeclined': True,
        'restartDeclinedBy': username,
        'message': '已拒绝重新开始请求',
    }, 200
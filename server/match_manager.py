"""联机对局管理模块
负责管理所有在线五子棋对局的创建、加入、落子、状态查询、重开等操作。
使用内存字典存储活跃对局，线程安全保护，定期持久化到 JSON 文件。
"""

import json
import os
import time
import threading
import uuid
import random
import traceback

from .config import SCRIPT_DIR
from .models import MATCHES_FILE, load_json_with_lock, save_json_with_lock
from .game_logic import check_win, check_forbidden
from .logger import logger

# 活跃对局字典，key为对局ID，value为对局数据
active_matches = {}
# 对局字典的线程锁，保证并发安全
active_matches_lock = threading.Lock()

# 用户连接状态字典，key为用户名，value为连接信息（心跳时间、在线状态）
user_connections = {}
# 用户连接字典的线程锁
user_connections_lock = threading.Lock()
# 连接超时时间（秒），超过此时间未心跳则视为离线
CONNECT_TIMEOUT = 600


def init_matches():
    """初始化对局管理器
    从磁盘加载上次保存的对局，将正在进行的对局标记为等待重连，并清理过期对局
    """
    global active_matches
    try:
        with open(MATCHES_FILE, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if content:
                active_matches = json.loads(content)
                # 服务器重启后，将所有"进行中"的对局标记为"等待重连"
                for match_id, match in active_matches.items():
                    if match['status'] == 'playing':
                        match['status'] = 'waiting_for_reconnect'
            else:
                active_matches = {}
    except FileNotFoundError:
        active_matches = {}
    cleanup_expired_matches()


def save_matches():
    """将对局数据持久化到磁盘
    写入失败时会尝试创建备份文件
    """
    try:
        with open(MATCHES_FILE, 'w', encoding='utf-8') as f:
            json.dump(active_matches, f, ensure_ascii=False, indent=2)
        logger.debug('Matches saved successfully')
    except Exception as e:
        logger.error(f'Error saving matches: {e}')
        try:
            # 写入失败时创建备份
            if os.path.exists(MATCHES_FILE):
                backup_file = MATCHES_FILE + '.bak'
                if os.path.exists(backup_file):
                    os.remove(backup_file)
                os.rename(MATCHES_FILE, backup_file)
                logger.info(f'Backup created at {backup_file}')
        except Exception as backup_error:
            logger.error(f'Failed to create backup: {backup_error}')


def update_user_connection(username):
    """更新用户连接状态记录
    每次心跳时调用，更新最后活跃时间
    """
    try:
        with user_connections_lock:
            user_connections[username] = {
                'lastHeartbeat': time.time(),
                'isOnline': True
            }
        logger.debug(f'User connection updated: {username}')
    except Exception as e:
        logger.error(f'Error updating user connection for {username}: {e}')


def get_user_connection(username):
    """获取用户连接状态
    返回包含最后心跳时间和在线状态的字典，如果用户不存在则返回None
    """
    try:
        with user_connections_lock:
            return user_connections.get(username)
    except Exception as e:
        logger.error(f'Error getting user connection for {username}: {e}')
        return None


def remove_user_connection(username):
    """移除用户连接记录
    用户主动退出或超时清理时调用
    """
    try:
        with user_connections_lock:
            if username in user_connections:
                del user_connections[username]
                logger.info(f'User connection removed: {username}')
    except Exception as e:
        logger.error(f'Error removing user connection for {username}: {e}')


def cleanup_expired_matches():
    """清理过期对局
    - 创建超过2小时的对局（无论状态）将被清理
    - 已结束/关闭超过1小时的对局将被清理
    """
    global active_matches
    expired_matches = []
    current_time = time.time()

    try:
        with active_matches_lock:
            for match_id, match in active_matches.items():
                try:
                    if 'startTime' in match and (current_time - match['startTime']) > 7200:
                        # 创建超过2小时，清理
                        expired_matches.append(match_id)
                        logger.info(f'清理过期房间: {match_id}')
                    elif match.get('status') in ['closed', 'finished'] and 'startTime' in match and (current_time - match['startTime']) > 3600:
                        # 已结束超过1小时，清理
                        expired_matches.append(match_id)
                        logger.info(f'清理已结束房间: {match_id}')
                except Exception as e:
                    logger.error(f'Error checking match {match_id}: {e}')

            for match_id in expired_matches:
                try:
                    del active_matches[match_id]
                except Exception as e:
                    logger.error(f'Error deleting match {match_id}: {e}')

        if expired_matches:
            save_matches()
            logger.info(f'Cleaned up {len(expired_matches)} expired matches')
    except Exception as e:
        logger.error(f'Error in cleanup_expired_matches: {e}')


def cleanup_inactive_connections():
    """清理超时的用户连接
    超过CONNECT_TIMEOUT秒未心跳的用户将被移除
    """
    current_time = time.time()
    inactive_users = []

    try:
        with user_connections_lock:
            for username, conn in list(user_connections.items()):
                try:
                    if current_time - conn['lastHeartbeat'] > CONNECT_TIMEOUT:
                        inactive_users.append(username)
                except Exception as e:
                    logger.error(f'Error checking connection for {username}: {e}')

            for username in inactive_users:
                try:
                    del user_connections[username]
                    logger.info(f'清理超时连接: {username}')
                except Exception as e:
                    logger.error(f'Error removing connection for {username}: {e}')
    except Exception as e:
        logger.error(f'Error in cleanup_inactive_connections: {e}')

    return inactive_users


def create_match(user):
    """创建新对局
    生成一个8位随机ID作为房间号，随机分配创建者颜色（黑/白），初始状态为等待中
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
            'lastActivity': time.time()
        }
    save_matches()
    logger.info(f'Match created: {match_id} by {user["username"]}')
    return match_id, creator_color


def join_match(user, match_id):
    """加入对局
    检查房间是否存在、是否可加入、是否为创建者本人
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

        creator_color = match['creatorColor']
        match['opponent'] = user['username']
        match['status'] = 'playing'
        match['currentPlayer'] = 1  # 黑棋先手
        match['lastActivity'] = time.time()

    save_matches()
    logger.info(f'User {user["username"]} joined match {match_id}')

    return {
        'success': True,
        'matchId': match_id,
        'yourColor': 2 if creator_color == 1 else 1,  # 加入者与创建者颜色相反
        'opponent': match['creator'],
        'currentPlayer': 1
    }, 200


def make_move(user, match_id, row, col):
    """处理落子操作
    包含完整的校验流程：
    1. 检查房间是否存在
    2. 检查玩家是否在房间中
    3. 检查是否为当前玩家的回合
    4. 检查目标位置是否为空
    5. 如果是黑棋，检查是否触发禁手规则
    6. 执行落子，检查是否获胜
    7. 切换当前玩家
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
        my_color = None
        if match['creator'] == username:
            my_color = match['creatorColor']
        else:
            my_color = 2 if match['creatorColor'] == 1 else 1

        if match['currentPlayer'] != my_color:
            return {'error': '不是您的回合', 'currentPlayer': match['currentPlayer'], 'myColor': my_color}, 400
        if match['board'][row][col] != 0:
            return {'error': '该位置已有棋子'}, 400

        # 黑棋需要检查禁手规则
        if my_color == 1:
            temp_board = [r[:] for r in match['board']]
            temp_board[row][col] = 1
            forbidden_check = check_forbidden(temp_board, row, col)
            if forbidden_check['forbidden']:
                return {'error': f"禁手: {forbidden_check['reason']}", 'forbidden': True, 'reason': forbidden_check['reason']}, 400

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
            'restartVersion': match.get('restartVersion', 0)
        }

    return match_data, 200


def leave_match(user, match_id):
    """离开对局
    处理逻辑：
    - 等待中的房间：创建者离开则直接删除房间
    - 进行中的房间：双方都离开或创建者离开且已结束则关闭房间
    - 否则标记为等待重连
    """
    with active_matches_lock:
        if match_id not in active_matches:
            return {'success': True}, 200

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match['opponent'] != username:
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
        elif (creator_left and opponent_left) or (creator_left and match['status'] == 'finished'):
            # 双方都离开 或 创建者离开且游戏已结束
            match['status'] = 'closed'
            save_matches()
            del active_matches[match_id]
        else:
            # 一方离开，标记为等待重连
            if match['status'] == 'playing':
                match['status'] = 'waiting_for_reconnect'
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
                'message': '已请求重新开始，等待对手确认'
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
                'message': '已取消重新开始请求'
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
                'message': '对局已重新开始！'
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
        'message': '已拒绝重新开始请求'
    }, 200


def list_active_matches():
    """列出所有活跃对局
    返回等待中和进行中的对局列表，按创建时间倒序排列
    """
    with active_matches_lock:
        active_list = []
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing']:
                active_list.append({
                    'id': match_id,
                    'creator': match['creator'],
                    'opponent': match.get('opponent'),
                    'status': match['status'],
                    'creatorColor': match['creatorColor'],
                    'currentPlayer': match['currentPlayer'],
                    'startTime': match['startTime'],
                    'moveCount': len(match.get('moves', []))
                })
        # 按创建时间倒序排列
        active_list.sort(key=lambda x: x['startTime'], reverse=True)
    return active_list


def get_user_current_match(username):
    """获取用户当前参与的对局
    查找用户作为创建者或对手的活跃对局
    """
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect']:
                if match['creator'] == username or match.get('opponent') == username:
                    return match_id
    return None


def heartbeat(user):
    """处理用户心跳
    更新用户的连接状态和最后活跃时间
    """
    username = user['username']
    update_user_connection(username)

    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect']:
                if match['creator'] == username or match.get('opponent') == username:
                    match['lastActivity'] = time.time()

    return {'success': True}


def get_my_match(username):
    """获取用户当前参与的对局信息
    返回用户作为创建者或对手的活跃对局详情
    """
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect']:
                if match['creator'] == username or match.get('opponent') == username:
                    my_color = None
                    opponent_name = None
                    if match['creator'] == username:
                        my_color = match['creatorColor']
                        opponent_name = match.get('opponent')
                    else:
                        my_color = 2 if match['creatorColor'] == 1 else 1
                        opponent_name = match['creator']

                    return {
                        'match': {
                            'id': match_id,
                            'status': match['status'],
                            'board': [row[:] for row in match['board']],
                            'currentPlayer': match['currentPlayer'],
                            'moves': match['moves'][:],
                            'winner': match.get('winner'),
                            'myColor': my_color,
                            'creatorColor': match['creatorColor'],
                            'opponent': opponent_name,
                            'creator': match['creator'],
                            'startTime': match.get('startTime'),
                            'restartRequested': match.get('restartRequested', False),
                            'restartRequestedBy': match.get('restartRequestedBy'),
                            'restartVersion': match.get('restartVersion', 0)
                        }
                    }
    return {'match': None}


def list_available_matches(username):
    """列出所有可加入的对局
    返回等待中的对局列表，按创建时间倒序排列
    """
    with active_matches_lock:
        available_list = []
        for match_id, match in active_matches.items():
            if match['status'] == 'waiting' and match['creator'] != username:
                available_list.append({
                    'id': match_id,
                    'creator': match['creator'],
                    'status': match['status'],
                    'creatorColor': match['creatorColor'],
                    'startTime': match['startTime']
                })
        available_list.sort(key=lambda x: x['startTime'], reverse=True)
    return {'matches': available_list}


def get_all_matches():
    """获取所有活跃对局列表（管理员用）
    返回所有对局的概览信息
    """
    with active_matches_lock:
        all_list = []
        for match_id, match in active_matches.items():
            all_list.append({
                'id': match_id,
                'creator': match['creator'],
                'opponent': match.get('opponent'),
                'status': match['status'],
                'creatorColor': match['creatorColor'],
                'currentPlayer': match['currentPlayer'],
                'startTime': match['startTime'],
                'moveCount': len(match.get('moves', [])),
                'winner': match.get('winner')
            })
        all_list.sort(key=lambda x: x['startTime'], reverse=True)
    return {'matches': all_list}


def get_match_detail(match_id):
    """获取对局详细信息（管理员用）
    返回对局的完整数据，包括棋盘状态和落子历史
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
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
            'lastActivity': match.get('lastActivity'),
            'restartRequested': match.get('restartRequested', False),
            'restartRequestedBy': match.get('restartRequestedBy'),
            'restartVersion': match.get('restartVersion', 0)
        }, 200


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
        save_matches()
    logger.info(f'管理员强制关闭房间: {match_id}')
    return {'success': True, 'message': '房间已关闭'}, 200


def force_close_all_matches():
    """强制关闭所有对局（管理员用）
    关闭所有活跃对局
    """
    closed_count = 0
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect']:
                match['status'] = 'closed'
                match['closed_at'] = int(time.time())
                match['closed_by'] = 'admin'
                closed_count += 1
        save_matches()
    logger.info(f'管理员强制关闭所有房间，共关闭 {closed_count} 个')
    return {'success': True, 'message': f'已关闭 {closed_count} 个房间', 'closed_count': closed_count}, 200


def force_restart_match(match_id):
    """强制重新开始对局（管理员用）
    重置棋盘和状态，交换颜色
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
        match['lastActivity'] = time.time()
        save_matches()
    logger.info(f'管理员强制重新开始房间: {match_id}')
    return {
        'success': True,
        'restartInitiated': True,
        'restartVersion': match['restartVersion'],
        'creatorColor': match['creatorColor'],
        'currentPlayer': match['currentPlayer'],
        'message': '对局已强制重新开始'
    }, 200


def force_move(match_id, row, col, player):
    """强制落子（管理员用）
    在指定位置放置指定玩家的棋子，不检查回合和禁手
    """
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        if match['status'] not in ['playing', 'waiting_for_reconnect']:
            return {'error': '游戏未在进行中'}, 400
        if row < 0 or row >= 15 or col < 0 or col >= 15:
            return {'error': '坐标超出棋盘范围'}, 400
        if match['board'][row][col] != 0:
            return {'error': '该位置已有棋子'}, 400

        match['board'][row][col] = player
        match['moves'].append({'row': row, 'col': col, 'player': player})
        match['lastActivity'] = time.time()

        if check_win(match['board'], row, col, player):
            match['winner'] = player
            match['status'] = 'finished'
            save_matches()
            logger.info(f'管理员强制落子，游戏结束: {match_id}, winner: {player}')
            return {
                'success': True,
                'win': True,
                'winner': player,
                'board': [r[:] for r in match['board']]
            }, 200

        match['currentPlayer'] = 2 if player == 1 else 1
        save_matches()
    logger.info(f'管理员强制落子: {match_id}, ({row},{col}), player={player}')
    return {
        'success': True,
        'win': False,
        'board': [r[:] for r in match['board']]
    }, 200


def start_cleanup_task():
    """启动后台清理定时任务
    定期清理过期对局和超时连接
    """
    def cleanup_loop():
        while True:
            time.sleep(300)
            try:
                cleanup_expired_matches()
                cleanup_inactive_connections()
            except Exception as e:
                logger.error(f'清理任务异常: {e}')

    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()
    logger.info('后台清理任务已启动')
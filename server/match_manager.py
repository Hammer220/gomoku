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

active_matches = {}
active_matches_lock = threading.Lock()

user_connections = {}
user_connections_lock = threading.Lock()
CONNECT_TIMEOUT = 600

def init_matches():
    global active_matches
    try:
        with open(MATCHES_FILE, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            if content:
                active_matches = json.loads(content)
                for match_id, match in active_matches.items():
                    if match['status'] == 'playing':
                        match['status'] = 'waiting_for_reconnect'
            else:
                active_matches = {}
    except FileNotFoundError:
        active_matches = {}
    cleanup_expired_matches()

def save_matches():
    try:
        with open(MATCHES_FILE, 'w', encoding='utf-8') as f:
            json.dump(active_matches, f, ensure_ascii=False, indent=2)
        logger.debug('Matches saved successfully')
    except Exception as e:
        logger.error(f'Error saving matches: {e}')
        try:
            if os.path.exists(MATCHES_FILE):
                backup_file = MATCHES_FILE + '.bak'
                if os.path.exists(backup_file):
                    os.remove(backup_file)
                os.rename(MATCHES_FILE, backup_file)
                logger.info(f'Backup created at {backup_file}')
        except Exception as backup_error:
            logger.error(f'Failed to create backup: {backup_error}')

def update_user_connection(username):
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
    try:
        with user_connections_lock:
            return user_connections.get(username)
    except Exception as e:
        logger.error(f'Error getting user connection for {username}: {e}')
        return None

def remove_user_connection(username):
    try:
        with user_connections_lock:
            if username in user_connections:
                del user_connections[username]
                logger.info(f'User connection removed: {username}')
    except Exception as e:
        logger.error(f'Error removing user connection for {username}: {e}')

def cleanup_expired_matches():
    global active_matches
    expired_matches = []
    current_time = time.time()

    try:
        with active_matches_lock:
            for match_id, match in active_matches.items():
                try:
                    if 'startTime' in match and (current_time - match['startTime']) > 7200:
                        expired_matches.append(match_id)
                        logger.info(f'清理过期房间: {match_id}')
                    elif match.get('status') in ['closed', 'finished'] and 'startTime' in match and (current_time - match['startTime']) > 3600:
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
    match_id = str(uuid.uuid4())[:8]
    creator_color = random.choice([1, 2])

    with active_matches_lock:
        active_matches[match_id] = {
            'id': match_id,
            'creator': user['username'],
            'opponent': None,
            'status': 'waiting',
            'board': [[0] * 15 for _ in range(15)],
            'currentPlayer': 1,
            'moves': [],
            'winner': None,
            'startTime': time.time(),
            'creatorColor': creator_color,
            'lastActivity': time.time()
        }
    save_matches()
    logger.info(f'Match created: {match_id} by {user["username"]}')
    return match_id, creator_color

def join_match(user, match_id):
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
        match['currentPlayer'] = 1
        match['lastActivity'] = time.time()

    save_matches()
    logger.info(f'User {user["username"]} joined match {match_id}')

    return {
        'success': True,
        'matchId': match_id,
        'yourColor': 2 if creator_color == 1 else 1,
        'opponent': match['creator'],
        'currentPlayer': 1
    }, 200

def make_move(user, match_id, row, col):
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['status'] != 'playing':
            return {'error': '游戏未在进行中', 'status': match['status']}, 400
        if match['creator'] != username and match['opponent'] != username:
            return {'error': '您不在这个房间中'}, 403

        my_color = None
        if match['creator'] == username:
            my_color = match['creatorColor']
        else:
            my_color = 2 if match['creatorColor'] == 1 else 1

        if match['currentPlayer'] != my_color:
            return {'error': '不是您的回合', 'currentPlayer': match['currentPlayer'], 'myColor': my_color}, 400
        if match['board'][row][col] != 0:
            return {'error': '该位置已有棋子'}, 400

        if my_color == 1:
            temp_board = [r[:] for r in match['board']]
            temp_board[row][col] = 1
            forbidden_check = check_forbidden(temp_board, row, col)
            if forbidden_check['forbidden']:
                return {'error': f"禁手: {forbidden_check['reason']}", 'forbidden': True, 'reason': forbidden_check['reason']}, 400

        match['board'][row][col] = my_color
        match['moves'].append({'row': row, 'col': col, 'player': my_color})
        match['lastActivity'] = time.time()

        if check_win(match['board'], row, col, my_color):
            match['winner'] = my_color
            match['status'] = 'finished'
            board_copy = [row[:] for row in match['board']]
            save_matches()
            logger.info(f'Game finished in match {match_id}, winner: {my_color}')
            return {'success': True, 'win': True, 'winner': my_color, 'board': board_copy}, 200

        match['currentPlayer'] = 2 if my_color == 1 else 1
        board_copy = [row[:] for row in match['board']]

    save_matches()
    return {'success': True, 'win': False, 'board': board_copy}, 200

def get_match_status(user, match_id):
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match['opponent'] != username:
            return {'error': '您不在这个房间中'}, 403

        match['lastActivity'] = time.time()

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
            'status': match['status'],
            'board': [row[:] for row in match['board']],
            'currentPlayer': match['currentPlayer'],
            'moves': match['moves'][:],
            'winner': match['winner'],
            'myColor': my_color,
            'creatorColor': match['creatorColor'],
            'opponent': opponent_name,
            'restartRequested': match.get('restartRequested', False),
            'restartRequestedBy': match.get('restartRequestedBy'),
            'restartDeclinedBy': match.get('restartDeclinedBy'),
            'restartAccepted': match.get('restartAccepted', False),
            'restartInitiated': match.get('restartInitiated', False),
            'restartVersion': match.get('restartVersion', 0)
        }

    return match_data, 200

def leave_match(user, match_id):
    with active_matches_lock:
        if match_id not in active_matches:
            return {'success': True}, 200

        match = active_matches[match_id]
        username = user['username']

        if match['creator'] != username and match['opponent'] != username:
            return {'success': True}, 200

        if match['creator'] == username:
            match['creatorLeft'] = True
        elif match.get('opponent') == username:
            match['opponentLeft'] = True

        creator_left = match.get('creatorLeft', False)
        opponent_left = match.get('opponentLeft', False)

        if match['status'] == 'waiting' and match['creator'] == username:
            del active_matches[match_id]
            save_matches()
        elif (creator_left and opponent_left) or (creator_left and match['status'] == 'finished'):
            match['status'] = 'closed'
            save_matches()
            del active_matches[match_id]
        else:
            if match['status'] == 'playing':
                match['status'] = 'waiting_for_reconnect'
            save_matches()

    return {'success': True}, 200

def close_match(user, match_id):
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
            match['restartAcceptedBy'] = username
            match['restartDeclinedBy'] = None
            match['restartInitiated'] = True
            match['restartVersion'] = match.get('restartVersion', 0) + 1
            match['lastActivity'] = time.time()
            save_matches()

            return {
                'success': True,
                'restartInitiated': True,
                'restartVersion': match['restartVersion'],
                'creatorColor': match['creatorColor'],
                'currentPlayer': match['currentPlayer'],
                'message': '游戏已重新开始'
            }, 200

    return {'error': '未知错误'}, 500

def get_my_match(username):
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['creator'] == username or match.get('opponent') == username:
                my_color = None
                opponent = None

                if match['creator'] == username:
                    my_color = match.get('creatorColor')
                    opponent = match.get('opponent')
                else:
                    my_color = 2 if match.get('creatorColor') == 1 else 1
                    opponent = match.get('creator')

                return {
                    'match': {
                        'id': match_id,
                        'status': match['status'],
                        'board': match['board'],
                        'currentPlayer': match['currentPlayer'],
                        'moves': match['moves'],
                        'winner': match['winner'],
                        'myColor': my_color,
                        'opponent': opponent,
                        'startTime': int(match.get('startTime', 0))
                    }
                }

    return {'match': None}

def list_available_matches(current_username):
    available = []
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] == 'waiting' and match['creator'] != current_username:
                available.append({
                    'id': match_id,
                    'creator': match['creator'],
                    'status': match['status']
                })
    return {'matches': available}

def get_all_matches():
    matches_list = []
    with active_matches_lock:
        for match_id, match in active_matches.items():
            matches_list.append({
                'id': match_id,
                'creator': match['creator'],
                'opponent': match.get('opponent'),
                'status': match['status'],
                'currentPlayer': match['currentPlayer'],
                'moveCount': len(match['moves']),
                'startTime': match['startTime']
            })
    return {'matches': matches_list}

def get_match_detail(match_id):
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404
        match = active_matches[match_id]

    return {
        'id': match_id,
        'creator': match['creator'],
        'opponent': match.get('opponent'),
        'status': match['status'],
        'board': match['board'],
        'currentPlayer': match['currentPlayer'],
        'moves': match['moves'],
        'winner': match['winner'],
        'startTime': match['startTime']
    }, 200

def force_close_match(match_id):
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404
        match = active_matches[match_id]
        match['status'] = 'closed'
        save_matches()
        del active_matches[match_id]
    return {'success': True}, 200

def force_close_all_matches():
    with active_matches_lock:
        closed_count = 0
        for match_id in list(active_matches.keys()):
            active_matches[match_id]['status'] = 'closed'
            del active_matches[match_id]
            closed_count += 1
        save_matches()
    return {'success': True, 'closed_count': closed_count}, 200

def force_restart_match(match_id):
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return {'error': '房间不存在'}, 404
        match = active_matches[match_id]
        if match['status'] not in ['playing', 'finished']:
            return {'error': '游戏未在进行中或已结束，无法重新开始'}, 400

        match['board'] = [[0] * 15 for _ in range(15)]
        match['currentPlayer'] = 1
        match['moves'] = []
        match['winner'] = None
        match['status'] = 'playing'
        match['startTime'] = time.time()
        match['creatorLeft'] = False
        match['opponentLeft'] = False
        match['restartRequestedBy'] = None
        match['restartRequested'] = False
        match['restartAccepted'] = False
        match['restartAcceptedBy'] = None
        match['restartDeclinedBy'] = None
        match['restartInitiated'] = True
        match['restartVersion'] = match.get('restartVersion', 0) + 1
        save_matches()
    return {'success': True, 'message': '游戏已强制重新开始'}, 200

def force_move(match_id, row, col, player):
    with active_matches_lock:
        if match_id not in active_matches:
            return {'error': '房间不存在'}, 404
        match = active_matches[match_id]

        if match['status'] != 'playing':
            if match['status'] == 'finished':
                return {'error': '游戏已结束，请重新开始后再操作'}, 400
            return {'error': '游戏尚未开始，无法强制落子'}, 400

        match['board'][row][col] = player
        match['moves'].append({'row': row, 'col': col, 'player': player, 'forced': True})

        if check_win(match['board'], row, col, player):
            match['winner'] = player
            match['status'] = 'finished'
            save_matches()
            return {'success': True, 'win': True, 'winner': player, 'board': match['board']}, 200

        match['currentPlayer'] = 2 if player == 1 else 1
        save_matches()
    return {'success': True, 'win': False, 'board': match['board']}, 200

_cleanup_started = False

def start_cleanup_task():
    global _cleanup_started
    if _cleanup_started:
        return
    def cleanup_loop():
        while True:
            time.sleep(60)
            try:
                if int(time.time()) % 3600 == 0:
                    cleanup_expired_matches()
                cleanup_inactive_connections()
            except Exception as e:
                logger.error(f'清理任务异常: {str(e)}')
                logger.error(traceback.format_exc())

    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()
    _cleanup_started = True
    logger.info('后台清理任务已启动')
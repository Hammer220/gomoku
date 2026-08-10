"""对局查询与心跳模块
负责：用户对局查询、可用对局列表、心跳保活、管理员对局查询
"""

import time

from .storage import active_matches, active_matches_lock, update_user_connection


def list_active_matches():
    """列出所有活跃对局
    返回等待中和进行中的对局列表，按创建时间倒序排列
    """
    with active_matches_lock:
        active_list = []
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing']:
                active_list.append(
                    {
                        'id': match_id,
                        'creator': match['creator'],
                        'opponent': match.get('opponent'),
                        'status': match['status'],
                        'creatorColor': match['creatorColor'],
                        'currentPlayer': match['currentPlayer'],
                        'startTime': match['startTime'],
                        'moveCount': len(match.get('moves', [])),
                    }
                )
        active_list.sort(key=lambda x: x['startTime'], reverse=True)
    return active_list


def get_user_current_match(username):
    """获取用户当前参与的对局
    查找用户作为创建者或对手的活跃对局
    """
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect'] and (
                match['creator'] == username or match.get('opponent') == username
            ):
                return match_id
    return None


def heartbeat(user):
    """处理用户心跳
    更新用户的连接状态和最后活跃时间
    """
    username = user['username']
    update_user_connection(username)

    with active_matches_lock:
        for match in active_matches.values():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect'] and (
                match['creator'] == username or match.get('opponent') == username
            ):
                match['lastActivity'] = time.time()

    return {'success': True}


def get_my_match(username):
    """获取用户当前参与的对局信息
    返回用户作为创建者或对手的活跃对局详情
    """
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] in ['waiting', 'playing', 'waiting_for_reconnect'] and (
                match['creator'] == username or match.get('opponent') == username
            ):
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
                item = {
                    'id': match_id,
                    'creator': match['creator'],
                    'status': match['status'],
                    'creatorColor': match['creatorColor'],
                    'startTime': match['startTime'],
                    'hasPassword': match.get('password') is not None,
                    'allowSpectate': match.get('allowSpectate', True),
                    'timeMode': match.get('timeMode', 'untimed'),
                    'moveTime': match.get('moveTime', 30),
                    'totalTime': match.get('totalTime', 600),
                }
                if match.get('allowSpectate', True):
                    item['spectateToken'] = match.get('spectateToken', '')
                available_list.append(item)
        available_list.sort(key=lambda x: x['startTime'], reverse=True)
    return {'matches': available_list}


def get_all_matches():
    """获取所有活跃对局列表（管理员用）
    返回所有对局的概览信息
    """
    with active_matches_lock:
        all_list = []
        for match_id, match in active_matches.items():
            all_list.append(
                {
                    'id': match_id,
                    'creator': match['creator'],
                    'opponent': match.get('opponent'),
                    'status': match['status'],
                    'creatorColor': match['creatorColor'],
                    'currentPlayer': match['currentPlayer'],
                    'startTime': match['startTime'],
                    'moveCount': len(match.get('moves', [])),
                    'winner': match.get('winner'),
                }
            )
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
            'restartVersion': match.get('restartVersion', 0),
        }, 200
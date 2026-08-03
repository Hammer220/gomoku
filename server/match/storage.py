"""对局存储模块
负责持久化存储、全局状态管理、连接状态管理和定期清理
"""

import json
import os
import time
import threading
import traceback

from ..config import SCRIPT_DIR
from ..logger import logger

active_matches = {}
active_matches_lock = threading.Lock()

user_connections = {}
user_connections_lock = threading.Lock()
CONNECT_TIMEOUT = 120

room_chats = {}
room_chats_lock = threading.Lock()


def init_matches():
    from ..db import get_connection
    conn = get_connection()
    c = conn.cursor()

    c.execute('SELECT id, data FROM matches WHERE status NOT IN ("closed")')
    rows = c.fetchall()

    if rows:
        for row in rows:
            try:
                match_data = json.loads(row['data'])
                active_matches[row['id']] = match_data
                if match_data['status'] == 'playing':
                    match_data['status'] = 'waiting_for_reconnect'
            except json.JSONDecodeError:
                logger.error(f'Failed to parse match data for id {row["id"]}')
    else:
        try:
            from ..models import MATCHES_FILE, load_json_with_lock
            content = load_json_with_lock(MATCHES_FILE, {})
            if content:
                for match_id, match in content.items():
                    active_matches[match_id] = match
                    if match.get('status') == 'playing':
                        match['status'] = 'waiting_for_reconnect'
        except Exception as e:
            logger.error(f'Error loading matches from JSON: {e}')

    cleanup_expired_matches()


def save_matches():
    from ..db import get_connection
    conn = get_connection()
    c = conn.cursor()

    try:
        for match_id, match in active_matches.items():
            c.execute('''
                INSERT OR REPLACE INTO matches (id, data, status, start_time, last_activity, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                match_id,
                json.dumps(match, ensure_ascii=False),
                match.get('status', 'waiting'),
                match.get('startTime', time.time()),
                match.get('lastActivity', time.time()),
                time.time()
            ))
        conn.commit()
        logger.debug('Matches saved successfully to SQLite')
    except Exception as e:
        logger.error(f'Error saving matches: {e}')


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
            from ..db import get_connection
            conn = get_connection()
            c = conn.cursor()
            c.execute('DELETE FROM matches WHERE id IN ({})'.format(','.join('?' * len(expired_matches))),
                      expired_matches)
            conn.commit()
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


def start_cleanup_task():
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


def get_active_matches_lock():
    return active_matches_lock


def get_active_matches():
    return active_matches


def add_room_chat_message(match_id, username, message):
    """添加房间聊天消息"""
    try:
        with room_chats_lock:
            if match_id not in room_chats:
                room_chats[match_id] = []

            chat_msg = {
                'id': len(room_chats[match_id]) + 1,
                'username': username,
                'message': message,
                'timestamp': int(time.time())
            }
            room_chats[match_id].append(chat_msg)

            if len(room_chats[match_id]) > 100:
                room_chats[match_id] = room_chats[match_id][-100:]

        return chat_msg
    except Exception as e:
        logger.error(f'Error adding room chat message: {e}')
        return None


def get_room_chat_messages(match_id, limit=50):
    """获取房间聊天消息"""
    try:
        with room_chats_lock:
            if match_id not in room_chats:
                return []

            messages = room_chats[match_id][-limit:]
            return messages[:]
    except Exception as e:
        logger.error(f'Error getting room chat messages: {e}')
        return []


def clear_room_chat(match_id):
    """清除房间聊天记录"""
    try:
        with room_chats_lock:
            if match_id in room_chats:
                del room_chats[match_id]
    except Exception as e:
        logger.error(f'Error clearing room chat: {e}')
"""对局存储模块
负责持久化存储、全局状态管理、连接状态管理和定期清理
"""

import json
import os
import time
import threading
import traceback

from ..config import SCRIPT_DIR
from ..models import MATCHES_FILE, load_json_with_lock, save_json_with_lock
from ..logger import logger

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


def get_active_matches_lock():
    """获取活跃对局锁"""
    return active_matches_lock


def get_active_matches():
    """获取活跃对局字典"""
    return active_matches
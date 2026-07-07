"""数据模型与持久化模块
提供 JSON 文件读写（带文件锁）、用户 CRUD 操作、密码管理、
数据文件路径常量定义等基础数据操作。
"""

import os
import json
import time
import threading
from datetime import datetime

from .config import SCRIPT_DIR

DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

USERS_FILE = os.path.join(DATA_DIR, 'users.json')
PASSWORD_FILE = os.path.join(DATA_DIR, 'password.json')
RECORDS_FILE = os.path.join(DATA_DIR, 'records.json')
SAVES_FILE = os.path.join(DATA_DIR, 'saves.json')
TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
MATCHES_FILE = os.path.join(DATA_DIR, 'matches.json')
MESSAGES_FILE = os.path.join(DATA_DIR, 'messages.json')

PERMISSION_FIELDS = {
    'canBanUser': '封禁/解封用户',
    'canKickUser': '强制登出用户',
    'canDeleteUser': '注销用户',
    'canChangePassword': '修改用户密码',
    'canModifyScore': '修改用户积分',
    'canSetPasswordFree': '设置免密登录',
    'canMonitorMatches': '查看对局监控',
    'canManageMatches': '管理对局',
}

def get_admin_permissions(user):
    """获取管理员的各项权限，超级管理员默认全部为 True"""
    if user.get('isSuperAdmin'):
        return {field: True for field in PERMISSION_FIELDS}
    if not user.get('isAdmin'):
        return {}
    perms = {}
    for field in PERMISSION_FIELDS:
        perms[field] = user.get(field, False)
    return perms

file_locks = {
    USERS_FILE: threading.Lock(),
    PASSWORD_FILE: threading.Lock(),
    RECORDS_FILE: threading.Lock(),
    SAVES_FILE: threading.Lock(),
    TOKENS_FILE: threading.Lock(),
    SETTINGS_FILE: threading.Lock(),
    MATCHES_FILE: threading.Lock(),
    MESSAGES_FILE: threading.Lock()
}

cache = {
    'tokens': {'data': None, 'timestamp': 0, 'ttl': 10},
    'user_info': {},
    'matches': {}
}

def get_file_lock(file_path):
    return file_locks.get(file_path, threading.Lock())

def load_json_with_lock(file_path, default=None):
    if default is None:
        default = {}
    lock = get_file_lock(file_path)
    with lock:
        if not os.path.exists(file_path):
            return default
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return default

def save_json_with_lock(file_path, data):
    lock = get_file_lock(file_path)
    with lock:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            if file_path == USERS_FILE:
                cache['user_info'].clear()
            elif file_path == TOKENS_FILE:
                cache['tokens']['data'] = None
            return True
        except IOError:
            return False

def get_cached_data(cache_key, ttl=30):
    now = time.time()
    cache_item = cache.get(cache_key)
    if cache_item and now - cache_item['timestamp'] < cache_item['ttl']:
        return cache_item['data']
    return None

def set_cached_data(cache_key, data, ttl=30):
    cache[cache_key] = {
        'data': data,
        'timestamp': time.time(),
        'ttl': ttl
    }

def clear_cache(cache_key=None):
    if cache_key:
        if cache_key in cache:
            if isinstance(cache[cache_key], dict):
                cache[cache_key].clear()
            else:
                cache[cache_key] = None
    else:
        for key in cache:
            if isinstance(cache[key], dict):
                cache[key].clear()
            else:
                cache[key] = None

def load_json(file_path, default=None):
    return load_json_with_lock(file_path, default)

def save_json(file_path, data):
    return save_json_with_lock(file_path, data)

def get_user(username):
    if username in cache['user_info']:
        cached_user = cache['user_info'][username]
        if time.time() - cached_user['timestamp'] < 30:
            user_data = cached_user['data']
            if user_data and user_data.get('bannedUntil') and time.time() >= user_data['bannedUntil']:
                user_data['bannedUntil'] = None
                save_user(username, user_data)
                cache['user_info'][username] = {
                    'data': user_data,
                    'timestamp': time.time()
                }
            return user_data

    users = load_json_with_lock(USERS_FILE)
    user_data = users.get(username)

    if user_data and user_data.get('bannedUntil') and time.time() >= user_data['bannedUntil']:
        user_data['bannedUntil'] = None
        save_user(username, user_data)

    if user_data:
        cache['user_info'][username] = {
            'data': user_data,
            'timestamp': time.time()
        }

    return user_data

def save_user(username, data):
    users = load_json_with_lock(USERS_FILE)
    users[username] = data
    save_json_with_lock(USERS_FILE, users)
    if username in cache['user_info']:
        del cache['user_info'][username]

def save_plain_password(username, password):
    password_data = load_json_with_lock(PASSWORD_FILE)
    password_data[username] = password
    save_json_with_lock(PASSWORD_FILE, password_data)

def get_plain_password(username):
    password_data = load_json_with_lock(PASSWORD_FILE)
    return password_data.get(username)

def get_current_user_from_request(request):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return None

    cached_tokens = get_cached_data('tokens')
    if cached_tokens and token in cached_tokens:
        token_data = cached_tokens[token]
        username = token_data.get('username') if isinstance(token_data, dict) else token_data
        user = get_user(username)
        if user:
            # user['_turnstile_verified'] = token_data.get('turnstile_verified', True) if isinstance(token_data, dict) else True  # 已注释 - 第二层人机认证（Turnstile）
            pass
        return user

    tokens = load_json_with_lock(TOKENS_FILE)
    token_data = tokens.get(token)
    if not token_data:
        return None

    if isinstance(token_data, dict):
        username = token_data.get('username')
        # turnstile_verified = token_data.get('turnstile_verified', True)  # 已注释 - 第二层人机认证（Turnstile）
    else:
        username = token_data
        # turnstile_verified = True  # 已注释 - 第二层人机认证（Turnstile）

    set_cached_data('tokens', tokens.copy(), ttl=10)

    user = get_user(username)
    if user:
        # user['_turnstile_verified'] = turnstile_verified  # 已注释 - 第二层人机认证（Turnstile）
        pass
    return user

def init_admin():
    from .logger import logger
    import hashlib
    users = load_json_with_lock(USERS_FILE)
    if 'admin' in users:
        logger.info('管理员账号已存在，跳过初始化')
        return

    import random
    import string
    admin_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    password_data = load_json_with_lock(PASSWORD_FILE)
    password_data['admin'] = admin_password
    save_json_with_lock(PASSWORD_FILE, password_data)

    print(f'管理员账号: admin')
    print(f'管理员密码: {admin_password}')
    print(f'密码已保存至: {PASSWORD_FILE}')

    admin = {
        'admin': {
            'username': 'admin',
            'password': hashlib.sha256(admin_password.encode()).hexdigest(),
            'score': 1000,
            'wins': 0,
            'games': 0,
            'joinDate': datetime.now().strftime('%Y-%m-%d'),
            'lastLogin': '',
            'isAdmin': True,
            'isSuperAdmin': True,
            'bannedUntil': None
        }
    }
    users['admin'] = admin['admin']
    save_json_with_lock(USERS_FILE, users)
    logger.info('管理员账户初始化完成')
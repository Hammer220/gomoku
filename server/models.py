"""数据模型与持久化模块
提供 SQLite 数据库操作、用户 CRUD 操作、密码管理等基础数据操作。
"""

import os
import json
import time
import threading

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


def _row_to_user(row):
    if row is None:
        return None
    return {
        'username': row['username'],
        'password': row['password'],
        'score': row['score'],
        'wins': row['wins'],
        'games': row['games'],
        'joinDate': row['join_date'],
        'lastLogin': row['last_login'],
        'isAdmin': bool(row['is_admin']),
        'isSuperAdmin': bool(row['is_super_admin']),
        'bannedUntil': row['banned_until'],
        'canBanUser': bool(row['can_ban_user']),
        'canKickUser': bool(row['can_kick_user']),
        'canDeleteUser': bool(row['can_delete_user']),
        'canChangePassword': bool(row['can_change_password']),
        'canModifyScore': bool(row['can_modify_score']),
        'canSetPasswordFree': bool(row['can_set_password_free']),
        'canMonitorMatches': bool(row['can_monitor_matches']),
        'canManageMatches': bool(row['can_manage_matches']),
    }


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

    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    user_data = _row_to_user(row)

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
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO users (
            username, password, score, wins, games, join_date, last_login,
            is_admin, is_super_admin, banned_until, can_ban_user,
            can_kick_user, can_delete_user, can_change_password,
            can_modify_score, can_set_password_free, can_monitor_matches,
            can_manage_matches, language, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        username,
        data.get('password', ''),
        data.get('score', 1000),
        data.get('wins', 0),
        data.get('games', 0),
        data.get('joinDate', ''),
        data.get('lastLogin', ''),
        1 if data.get('isAdmin') else 0,
        1 if data.get('isSuperAdmin') else 0,
        data.get('bannedUntil'),
        1 if data.get('canBanUser') else 0,
        1 if data.get('canKickUser') else 0,
        1 if data.get('canDeleteUser') else 0,
        1 if data.get('canChangePassword') else 0,
        1 if data.get('canModifyScore') else 0,
        1 if data.get('canSetPasswordFree') else 0,
        1 if data.get('canMonitorMatches') else 0,
        1 if data.get('canManageMatches') else 0,
        data.get('language', 'zh-CN'),
        time.time()
    ))
    conn.commit()
    if username in cache['user_info']:
        del cache['user_info'][username]


def save_plain_password(username, password):
    passwords = load_json_with_lock(PASSWORD_FILE, {})
    passwords[username] = password
    save_json_with_lock(PASSWORD_FILE, passwords)


def get_plain_password(username):
    passwords = load_json_with_lock(PASSWORD_FILE, {})
    return passwords.get(username)


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
            pass
        return user

    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT username, turnstile_verified FROM tokens WHERE token = ?', (token,))
    row = c.fetchone()

    if not row:
        return None

    username = row['username']
    turnstile_verified = bool(row['turnstile_verified'])

    tokens = {}
    c.execute('SELECT token, username, turnstile_verified FROM tokens')
    for r in c.fetchall():
        tokens[r['token']] = {
            'username': r['username'],
            'turnstile_verified': bool(r['turnstile_verified'])
        }

    set_cached_data('tokens', tokens.copy(), ttl=10)

    user = get_user(username)
    if user:
        pass
    return user


def init_admin():
    from .logger import logger
    import hashlib
    from .db import get_connection

    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM users WHERE username = ?', ('admin',))
    if c.fetchone()[0] > 0:
        logger.info('管理员账号已存在，跳过初始化')
        return

    import random
    import string
    admin_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))

    save_plain_password('admin', admin_password)

    c.execute('''
        INSERT INTO users (
            username, password, score, wins, games, join_date, last_login,
            is_admin, is_super_admin, banned_until
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        'admin',
        hashlib.sha256(admin_password.encode()).hexdigest(),
        1000,
        0,
        0,
        time.strftime('%Y-%m-%d'),
        '',
        1,
        1,
        None
    ))
    conn.commit()
    logger.info('管理员账户初始化完成')


def add_token(token, username):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('INSERT OR REPLACE INTO tokens (token, username, created_at) VALUES (?, ?, ?)',
              (token, username, time.time()))
    conn.commit()
    clear_cache('tokens')


def remove_token(token):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('DELETE FROM tokens WHERE token = ?', (token,))
    conn.commit()
    clear_cache('tokens')


def remove_user_tokens(username):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('DELETE FROM tokens WHERE username = ?', (username,))
    conn.commit()
    clear_cache('tokens')


def get_all_tokens():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT token, username, created_at FROM tokens')
    rows = c.fetchall()
    return {row['token']: {'username': row['username'], 'createdAt': row['created_at']} for row in rows}


def get_users():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM users ORDER BY username')
    rows = c.fetchall()
    return {row['username']: _row_to_user(row) for row in rows}


def delete_user(username):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('DELETE FROM users WHERE username = ?', (username,))
    c.execute('DELETE FROM passwords WHERE username = ?', (username,))
    c.execute('DELETE FROM tokens WHERE username = ?', (username,))
    conn.commit()
    passwords = load_json_with_lock(PASSWORD_FILE, {})
    if username in passwords:
        del passwords[username]
        save_json_with_lock(PASSWORD_FILE, passwords)
    if username in cache['user_info']:
        del cache['user_info'][username]


def load_records():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM records ORDER BY end_time DESC')
    rows = c.fetchall()
    records = {}
    for row in rows:
        records[str(row['id'])] = {
            'id': row['id'],
            'player1': row['player1'],
            'player2': row['player2'],
            'winner': row['winner'],
            'moves': json.loads(row['moves']),
            'board': json.loads(row['board']),
            'timeMode': row['time_mode'],
            'moveTime': row['move_time'],
            'totalTime': row['total_time'],
            'startTime': row['start_time'],
            'endTime': row['end_time'],
        }
    return records


def save_record(record):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO records (player1, player2, winner, moves, board,
            time_mode, move_time, total_time, start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        record.get('player1', ''),
        record.get('player2', ''),
        record.get('winner'),
        json.dumps(record.get('moves', []), ensure_ascii=False),
        json.dumps(record.get('board', []), ensure_ascii=False),
        record.get('timeMode', 'untimed'),
        record.get('moveTime', 30),
        record.get('totalTime', 600),
        record.get('startTime', time.time()),
        record.get('endTime', time.time())
    ))
    conn.commit()


def load_saves():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM saves ORDER BY saved_at DESC')
    rows = c.fetchall()
    saves = {}
    for row in rows:
        saves[str(row['id'])] = {
            'id': row['id'],
            'username': row['username'],
            'matchId': row['match_id'],
            'board': json.loads(row['board']),
            'moves': json.loads(row['moves']),
            'currentPlayer': row['current_player'],
            'timeMode': row['time_mode'],
            'blackTime': row['black_time'],
            'whiteTime': row['white_time'],
            'savedAt': row['saved_at'],
        }
    return saves


def save_save(save_data):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO saves (username, match_id, board, moves, current_player,
            time_mode, black_time, white_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        save_data.get('username', ''),
        save_data.get('matchId'),
        json.dumps(save_data.get('board', []), ensure_ascii=False),
        json.dumps(save_data.get('moves', []), ensure_ascii=False),
        save_data.get('currentPlayer', 1),
        save_data.get('timeMode', 'untimed'),
        save_data.get('blackTime', 600),
        save_data.get('whiteTime', 600)
    ))
    conn.commit()


def load_settings():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT key, value FROM settings')
    rows = c.fetchall()
    settings = {}
    for row in rows:
        try:
            settings[row['key']] = json.loads(row['value'])
        except json.JSONDecodeError:
            settings[row['key']] = row['value']
    return settings


def save_settings(settings):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    for key, value in settings.items():
        c.execute('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
                  (key, json.dumps(value, ensure_ascii=False), time.time()))
    conn.commit()


def load_messages():
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM messages ORDER BY timestamp DESC')
    rows = c.fetchall()
    messages = {}
    for row in rows:
        messages[str(row['id'])] = {
            'id': row['id'],
            'from': row['from_user'],
            'to': row['to_user'],
            'content': row['content'],
            'timestamp': row['timestamp'],
            'read': bool(row['read']),
        }
    return messages


def save_message(message):
    from .db import get_connection
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO messages (from_user, to_user, content, timestamp, read)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        message.get('from', ''),
        message.get('to', ''),
        message.get('content', ''),
        message.get('timestamp', time.time()),
        1 if message.get('read') else 0
    ))
    conn.commit()
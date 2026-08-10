"""SQLite 数据库模块
负责 SQLite 连接管理、表结构定义、数据迁移和基础 CRUD 操作

主要功能：
- 数据库连接池管理（使用 WAL 模式优化并发性能）
- 表结构定义和初始化（用户、密码、令牌、对局、记录、存档、设置、消息）
- 从 JSON 文件迁移数据到 SQLite 数据库
- 数据库模式升级（动态添加新列）
"""

import contextlib
import json
import os
import sqlite3
import time

from .config import SCRIPT_DIR
from .logger import logger

# 数据库目录和路径配置
DB_DIR = os.path.join(SCRIPT_DIR, 'data')
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, 'gomoku.db')

# 全局数据库连接对象
conn = None
cursor = None


def get_connection():
    """
    获取数据库连接（单例模式）
    如果连接不存在则创建新连接，并配置以下优化：
    - WAL 模式：支持并发读写
    - NORMAL 同步模式：平衡性能和安全性
    - 增大缓存：提升查询性能
    - Row factory：允许通过列名访问数据
    """
    global conn
    if conn is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')
        conn.execute('PRAGMA cache_size=-50000')
        conn.row_factory = sqlite3.Row
    return conn


def init_db():
    connection = get_connection()
    c = connection.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            score INTEGER DEFAULT 1000,
            wins INTEGER DEFAULT 0,
            games INTEGER DEFAULT 0,
            join_date TEXT NOT NULL,
            last_login TEXT DEFAULT '',
            is_admin INTEGER DEFAULT 0,
            is_super_admin INTEGER DEFAULT 0,
            banned_until REAL DEFAULT NULL,
            can_ban_user INTEGER DEFAULT 0,
            can_kick_user INTEGER DEFAULT 0,
            can_delete_user INTEGER DEFAULT 0,
            can_change_password INTEGER DEFAULT 0,
            can_modify_score INTEGER DEFAULT 0,
            can_set_password_free INTEGER DEFAULT 0,
            can_monitor_matches INTEGER DEFAULT 0,
            can_manage_matches INTEGER DEFAULT 0,
            password_free INTEGER DEFAULT 0,
            password_free_max_attempts INTEGER DEFAULT 0,
            password_free_remaining_attempts INTEGER DEFAULT 0,
            created_at REAL DEFAULT (strftime('%s', 'now')),
            updated_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS passwords (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            created_at REAL DEFAULT (strftime('%s', 'now')),
            updated_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            turnstile_verified INTEGER DEFAULT 1,
            created_at REAL DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (username) REFERENCES users(username)
        )
    """)

    with contextlib.suppress(Exception):
        c.execute('ALTER TABLE users ADD COLUMN password_free INTEGER DEFAULT 0')
    with contextlib.suppress(Exception):
        c.execute('ALTER TABLE users ADD COLUMN password_free_max_attempts INTEGER DEFAULT 0')
    with contextlib.suppress(Exception):
        c.execute('ALTER TABLE users ADD COLUMN password_free_remaining_attempts INTEGER DEFAULT 0')

    c.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            status TEXT NOT NULL,
            start_time REAL NOT NULL,
            last_activity REAL DEFAULT (strftime('%s', 'now')),
            created_at REAL DEFAULT (strftime('%s', 'now')),
            updated_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1 TEXT NOT NULL,
            player2 TEXT NOT NULL,
            winner TEXT,
            moves TEXT NOT NULL,
            board TEXT NOT NULL,
            time_mode TEXT DEFAULT 'untimed',
            move_time INTEGER DEFAULT 30,
            total_time INTEGER DEFAULT 600,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            created_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            match_id TEXT,
            board TEXT NOT NULL,
            moves TEXT NOT NULL,
            current_player INTEGER DEFAULT 1,
            time_mode TEXT DEFAULT 'untimed',
            black_time INTEGER DEFAULT 600,
            white_time INTEGER DEFAULT 600,
            saved_at REAL DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (username) REFERENCES users(username)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at REAL DEFAULT (strftime('%s', 'now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user TEXT NOT NULL,
            to_user TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp REAL DEFAULT (strftime('%s', 'now')),
            read INTEGER DEFAULT 0,
            FOREIGN KEY (from_user) REFERENCES users(username),
            FOREIGN KEY (to_user) REFERENCES users(username)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1 TEXT NOT NULL,
            user2 TEXT NOT NULL,
            created_at REAL DEFAULT (strftime('%s', 'now')),
            UNIQUE(user1, user2),
            CHECK(user1 < user2)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS friend_invitations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user TEXT NOT NULL,
            to_user TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at REAL DEFAULT (strftime('%s', 'now')),
            updated_at REAL DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (from_user) REFERENCES users(username),
            FOREIGN KEY (to_user) REFERENCES users(username)
        )
    """)

    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_tokens_username ON tokens(username)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_records_player1 ON records(player1)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_records_player2 ON records(player2)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user)
    """)

    try:
        c.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'zh-CN'")
        logger.info('添加 language 列到 users 表')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
        else:
            raise

    try:
        c.execute("ALTER TABLE records ADD COLUMN mode TEXT DEFAULT 'ai'")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute("ALTER TABLE records ADD COLUMN ai_difficulty TEXT DEFAULT 'medium'")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute('ALTER TABLE records ADD COLUMN duration INTEGER DEFAULT 0')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute('ALTER TABLE records ADD COLUMN board_size INTEGER DEFAULT 15')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute('ALTER TABLE records ADD COLUMN player_color INTEGER DEFAULT 1')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute('ALTER TABLE records ADD COLUMN move_count INTEGER DEFAULT 0')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass

    try:
        c.execute("ALTER TABLE saves ADD COLUMN mode TEXT DEFAULT 'ai'")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute("ALTER TABLE saves ADD COLUMN name TEXT DEFAULT ''")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass
    try:
        c.execute('ALTER TABLE saves ADD COLUMN timestamp REAL DEFAULT 0')
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass

    try:
        c.execute("ALTER TABLE messages ADD COLUMN read_by TEXT DEFAULT '[]'")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass

    try:
        c.execute("ALTER TABLE messages ADD COLUMN image TEXT DEFAULT ''")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass

    try:
        c.execute("ALTER TABLE messages ADD COLUMN red_packet TEXT DEFAULT ''")
    except sqlite3.OperationalError as e:
        if 'duplicate column' in str(e).lower():
            pass

    connection.commit()
    logger.info('SQLite 数据库初始化完成')


def migrate_from_json():
    from .models import (
        MESSAGES_FILE,
        PASSWORD_FILE,
        RECORDS_FILE,
        SAVES_FILE,
        SETTINGS_FILE,
        TOKENS_FILE,
        USERS_FILE,
        load_json_with_lock,
    )

    connection = get_connection()
    c = connection.cursor()

    c.execute('SELECT COUNT(*) FROM users')
    if c.fetchone()[0] == 0:
        users = load_json_with_lock(USERS_FILE, {})
        for username, user in users.items():
            c.execute(
                """
                INSERT OR IGNORE INTO users (
                    username, password, score, wins, games, join_date, last_login,
                    is_admin, is_super_admin, banned_until, can_ban_user,
                    can_kick_user, can_delete_user, can_change_password,
                    can_modify_score, can_set_password_free, can_monitor_matches,
                    can_manage_matches
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    username,
                    user.get('password', ''),
                    user.get('score', 1000),
                    user.get('wins', 0),
                    user.get('games', 0),
                    user.get('joinDate', ''),
                    user.get('lastLogin', ''),
                    1 if user.get('isAdmin') else 0,
                    1 if user.get('isSuperAdmin') else 0,
                    user.get('bannedUntil'),
                    1 if user.get('canBanUser') else 0,
                    1 if user.get('canKickUser') else 0,
                    1 if user.get('canDeleteUser') else 0,
                    1 if user.get('canChangePassword') else 0,
                    1 if user.get('canModifyScore') else 0,
                    1 if user.get('canSetPasswordFree') else 0,
                    1 if user.get('canMonitorMatches') else 0,
                    1 if user.get('canManageMatches') else 0,
                ),
            )
        if users:
            logger.info(f'迁移 {len(users)} 个用户到数据库')

    c.execute('SELECT COUNT(*) FROM passwords')
    if c.fetchone()[0] == 0:
        passwords = load_json_with_lock(PASSWORD_FILE, {})
        for username, password in passwords.items():
            c.execute('INSERT OR IGNORE INTO passwords (username, password) VALUES (?, ?)', (username, password))
        if passwords:
            logger.info(f'迁移 {len(passwords)} 个密码到数据库')

    c.execute('SELECT COUNT(*) FROM tokens')
    if c.fetchone()[0] == 0:
        tokens = load_json_with_lock(TOKENS_FILE, {})
        for token, token_data in tokens.items():
            if isinstance(token_data, dict):
                username = token_data.get('username', '')
                turnstile_verified = 1 if token_data.get('turnstile_verified', True) else 0
            else:
                username = token_data
                turnstile_verified = 1
            c.execute(
                'INSERT OR IGNORE INTO tokens (token, username, turnstile_verified) VALUES (?, ?, ?)',
                (token, username, turnstile_verified),
            )
        if tokens:
            logger.info(f'迁移 {len(tokens)} 个 Token 到数据库')

    c.execute('SELECT COUNT(*) FROM records')
    if c.fetchone()[0] == 0:
        records = load_json_with_lock(RECORDS_FILE, {})
        for record in records.values():
            c.execute(
                """
                INSERT INTO records (player1, player2, winner, moves, board,
                    time_mode, move_time, total_time, start_time, end_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    record.get('player1', ''),
                    record.get('player2', ''),
                    record.get('winner'),
                    json.dumps(record.get('moves', []), ensure_ascii=False),
                    json.dumps(record.get('board', []), ensure_ascii=False),
                    record.get('timeMode', 'untimed'),
                    record.get('moveTime', 30),
                    record.get('totalTime', 600),
                    record.get('startTime', time.time()),
                    record.get('endTime', time.time()),
                ),
            )
        if records:
            logger.info(f'迁移 {len(records)} 条记录到数据库')

    c.execute('SELECT COUNT(*) FROM saves')
    if c.fetchone()[0] == 0:
        saves = load_json_with_lock(SAVES_FILE, {})
        for save in saves.values():
            c.execute(
                """
                INSERT INTO saves (username, match_id, board, moves, current_player,
                    time_mode, black_time, white_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    save.get('username', ''),
                    save.get('matchId'),
                    json.dumps(save.get('board', []), ensure_ascii=False),
                    json.dumps(save.get('moves', []), ensure_ascii=False),
                    save.get('currentPlayer', 1),
                    save.get('timeMode', 'untimed'),
                    save.get('blackTime', 600),
                    save.get('whiteTime', 600),
                ),
            )
        if saves:
            logger.info(f'迁移 {len(saves)} 个存档到数据库')

    c.execute('SELECT COUNT(*) FROM settings')
    if c.fetchone()[0] == 0:
        settings = load_json_with_lock(SETTINGS_FILE, {})
        for key, value in settings.items():
            c.execute(
                'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                (key, json.dumps(value, ensure_ascii=False)),
            )
        if settings:
            logger.info(f'迁移 {len(settings)} 个设置到数据库')

    c.execute('SELECT COUNT(*) FROM messages')
    if c.fetchone()[0] == 0:
        messages = load_json_with_lock(MESSAGES_FILE, {})
        for msg in messages.values():
            c.execute(
                """
                INSERT INTO messages (from_user, to_user, content, timestamp, read)
                VALUES (?, ?, ?, ?, ?)
            """,
                (
                    msg.get('from', ''),
                    msg.get('to', ''),
                    msg.get('content', ''),
                    msg.get('timestamp', time.time()),
                    1 if msg.get('read') else 0,
                ),
            )
        if messages:
            logger.info(f'迁移 {len(messages)} 条消息到数据库')

    connection.commit()
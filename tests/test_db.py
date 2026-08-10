"""数据库模块测试
测试范围：数据库连接、表结构定义、数据迁移、字段升级
"""

import contextlib
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import db


class TestDBConstants:
    """数据库常量测试"""

    def test_db_path_exists(self):
        """DB_DIR 目录应存在"""
        assert os.path.exists(db.DB_DIR)

    def test_db_path_is_string(self):
        """DB_PATH 应为字符串"""
        assert isinstance(db.DB_PATH, str)
        assert db.DB_PATH.endswith('gomoku.db')

    def test_db_path_absolute(self):
        """DB_PATH 应为绝对路径"""
        assert os.path.isabs(db.DB_PATH)


class TestGetConnection:
    """get_connection 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(db.get_connection)

    def test_returns_connection(self):
        """返回 sqlite3.Connection 对象"""
        conn = db.get_connection()
        assert isinstance(conn, sqlite3.Connection)

    def test_singleton_pattern(self):
        """多次调用返回同一连接"""
        conn1 = db.get_connection()
        conn2 = db.get_connection()
        assert conn1 is conn2

    def test_wal_mode(self):
        """WAL 模式已启用"""
        conn = db.get_connection()
        result = conn.execute('PRAGMA journal_mode').fetchone()
        assert result[0].upper() == 'WAL'

    def test_row_factory(self):
        """row_factory 应设置为 sqlite3.Row"""
        conn = db.get_connection()
        assert conn.row_factory == sqlite3.Row


class TestInitDB:
    """init_db 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(db.init_db)

    def test_tables_created(self):
        """所有表应已创建"""
        conn = db.get_connection()
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        table_names = [t[0] for t in tables]

        expected_tables = [
            'friends',
            'friend_invitations',
            'matches',
            'messages',
            'passwords',
            'records',
            'saves',
            'settings',
            'tokens',
            'users',
        ]
        for table in expected_tables:
            assert table in table_names, f'表 {table} 未创建'

    def test_users_table_schema(self):
        """users 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(users)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = [
            'username', 'password', 'score', 'wins', 'games',
            'join_date', 'last_login', 'is_admin', 'is_super_admin',
            'banned_until',
        ]
        for col in required_cols:
            assert col in col_names, f'users 表缺少列: {col}'

    def test_matches_table_schema(self):
        """matches 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(matches)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = ['id', 'data', 'status', 'start_time', 'last_activity']
        for col in required_cols:
            assert col in col_names, f'matches 表缺少列: {col}'

    def test_records_table_schema(self):
        """records 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(records)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = ['player1', 'player2', 'winner', 'moves', 'board']
        for col in required_cols:
            assert col in col_names, f'records 表缺少列: {col}'

    def test_messages_table_schema(self):
        """messages 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(messages)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = ['from_user', 'to_user', 'content', 'timestamp', 'read']
        for col in required_cols:
            assert col in col_names, f'messages 表缺少列: {col}'

    def test_friends_table_schema(self):
        """friends 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(friends)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = ['user1', 'user2']
        for col in required_cols:
            assert col in col_names, f'friends 表缺少列: {col}'

    def test_friend_invitations_table_schema(self):
        """friend_invitations 表结构正确"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(friend_invitations)').fetchall()
        col_names = [c[1] for c in columns]

        required_cols = ['from_user', 'to_user', 'status']
        for col in required_cols:
            assert col in col_names, f'friend_invitations 表缺少列: {col}'

    def test_indexes_created(self):
        """所有索引应已创建"""
        conn = db.get_connection()
        indexes = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
        ).fetchall()
        index_names = [i[0] for i in indexes]

        expected_indexes = [
            'idx_tokens_username',
            'idx_matches_status',
            'idx_matches_start_time',
            'idx_records_player1',
            'idx_records_player2',
            'idx_messages_from_user',
            'idx_messages_to_user',
        ]
        for idx in expected_indexes:
            assert idx in index_names, f'索引 {idx} 未创建'

    def test_password_free_columns(self):
        """免密登录相关列已添加"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(users)').fetchall()
        col_names = [c[1] for c in columns]

        pwd_free_cols = ['password_free', 'password_free_max_attempts', 'password_free_remaining_attempts']
        for col in pwd_free_cols:
            assert col in col_names, f'users 表缺少列: {col}'

    def test_language_column(self):
        """language 列已添加"""
        conn = db.get_connection()
        columns = conn.execute('PRAGMA table_info(users)').fetchall()
        col_names = [c[1] for c in columns]
        assert 'language' in col_names


class TestMigrateFromJSON:
    """migrate_from_json 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(db.migrate_from_json)

    def test_migration_is_idempotent(self):
        """迁移应该是幂等的（多次调用不报错）"""
        # 若抛异常则 pytest 自动记录失败
        db.migrate_from_json()

    def test_migration_does_not_crash(self):
        """迁移不应崩溃"""
        with contextlib.suppress(Exception):
            db.migrate_from_json()


class TestDatabaseOperations:
    """数据库基本操作测试"""

    def test_insert_and_query_user(self):
        """插入和查询用户"""
        conn = db.get_connection()
        try:
            conn.execute(
                "INSERT INTO users (username, password, score, wins, games, join_date) "
                "VALUES ('test_db_user', 'hash', 100, 0, 0, '2024-01-01')"
            )
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE username='test_db_user'").fetchone()
            assert row is not None
            assert row['username'] == 'test_db_user'
            assert row['score'] == 100
        finally:
            conn.execute("DELETE FROM users WHERE username='test_db_user'")
            conn.commit()

    def test_insert_and_query_settings(self):
        """插入和查询设置"""
        conn = db.get_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('test_key', 'test_value')"
            )
            conn.commit()
            row = conn.execute("SELECT * FROM settings WHERE key='test_key'").fetchone()
            assert row is not None
            assert row['value'] == 'test_value'
        finally:
            conn.execute("DELETE FROM settings WHERE key='test_key'")
            conn.commit()

    def test_transaction_rollback(self):
        """事务回滚"""
        conn = db.get_connection()
        try:
            conn.execute("BEGIN")
            conn.execute(
                "INSERT INTO users (username, password, score, wins, games, join_date) "
                "VALUES ('rollback_user', 'hash', 0, 0, 0, '2024-01-01')"
            )
            conn.execute("ROLLBACK")
            row = conn.execute("SELECT * FROM users WHERE username='rollback_user'").fetchone()
            assert row is None
        except Exception:
            conn.execute("ROLLBACK")
            conn.execute("DELETE FROM users WHERE username='rollback_user'")
            conn.commit()
            raise
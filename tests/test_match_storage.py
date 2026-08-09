"""对局存储模块测试
测试范围：连接状态管理、过期清理、持久化存储
"""

import os
import sys
import time
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.match.storage import (
    CONNECT_TIMEOUT,
    active_matches,
    active_matches_lock,
    cleanup_expired_matches,
    cleanup_inactive_connections,
    get_user_connection,
    remove_user_connection,
    update_user_connection,
    user_connections,
    user_connections_lock,
)


@pytest.fixture(autouse=True)
def clean_state():
    """每个测试前后清理全局状态"""
    with active_matches_lock:
        active_matches.clear()
    with user_connections_lock:
        user_connections.clear()
    yield
    with active_matches_lock:
        active_matches.clear()
    with user_connections_lock:
        user_connections.clear()


class TestConstants:
    """常量定义测试"""

    def test_connect_timeout(self):
        """CONNECT_TIMEOUT 应为合理值"""
        assert CONNECT_TIMEOUT > 0
        assert CONNECT_TIMEOUT == 120

    def test_locks_exist(self):
        """锁对象存在"""
        assert active_matches_lock is not None
        assert user_connections_lock is not None

    def test_globals_are_dicts(self):
        """全局变量类型正确"""
        assert isinstance(active_matches, dict)
        assert isinstance(user_connections, dict)


class TestUserConnection:
    """用户连接管理测试"""

    def test_update_connection(self):
        """更新用户连接"""
        update_user_connection('testuser')

        with user_connections_lock:
            assert 'testuser' in user_connections
            conn = user_connections['testuser']
            assert conn['isOnline'] is True
            assert 'lastHeartbeat' in conn
            assert conn['lastHeartbeat'] > 0

    def test_update_connection_timestamp(self):
        """更新后时间戳更新"""
        update_user_connection('testuser')

        with user_connections_lock:
            first_time = user_connections['testuser']['lastHeartbeat']

        time.sleep(0.01)
        update_user_connection('testuser')

        with user_connections_lock:
            second_time = user_connections['testuser']['lastHeartbeat']
            assert second_time >= first_time

    def test_get_connection_exists(self):
        """获取存在的连接"""
        update_user_connection('testuser')
        conn = get_user_connection('testuser')
        assert conn is not None
        assert conn['isOnline'] is True

    def test_get_connection_not_exists(self):
        """获取不存在的连接"""
        conn = get_user_connection('nonexistent')
        assert conn is None

    def test_remove_connection(self):
        """移除连接"""
        update_user_connection('testuser')
        remove_user_connection('testuser')

        with user_connections_lock:
            assert 'testuser' not in user_connections

    def test_remove_nonexistent_connection(self):
        """移除不存在的连接不应报错"""
        remove_user_connection('nonexistent')

    def test_multiple_users(self):
        """多个用户连接"""
        update_user_connection('user1')
        update_user_connection('user2')
        update_user_connection('user3')

        with user_connections_lock:
            assert len(user_connections) == 3
            assert 'user1' in user_connections
            assert 'user2' in user_connections
            assert 'user3' in user_connections

    def test_duplicate_update(self):
        """重复更新同一用户"""
        update_user_connection('testuser')
        update_user_connection('testuser')
        update_user_connection('testuser')

        with user_connections_lock:
            assert len(user_connections) == 1


class TestCleanupExpiredMatches:
    """cleanup_expired_matches 函数测试"""

    def test_no_matches(self):
        """无对局时不应报错"""
        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()
        with active_matches_lock:
            assert len(active_matches) == 0

    def test_fresh_matches_not_cleaned(self):
        """新创建的对局不应被清理"""
        with active_matches_lock:
            active_matches['test_1'] = {
                'id': 'test_1',
                'status': 'playing',
                'startTime': time.time() - 100,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'test_1' in active_matches

    def test_very_old_playing_cleaned(self):
        """超过2小时的进行中对局应被清理"""
        with active_matches_lock:
            active_matches['old_match'] = {
                'id': 'old_match',
                'status': 'playing',
                'startTime': time.time() - 7201,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'old_match' not in active_matches

    def test_old_finished_cleaned(self):
        """超过1小时的已结束对局应被清理"""
        with active_matches_lock:
            active_matches['finished_old'] = {
                'id': 'finished_old',
                'status': 'finished',
                'startTime': time.time() - 3601,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'finished_old' not in active_matches

    def test_recent_finished_not_cleaned(self):
        """最近结束的对局不应被清理"""
        with active_matches_lock:
            active_matches['recent_finished'] = {
                'id': 'recent_finished',
                'status': 'finished',
                'startTime': time.time() - 100,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'recent_finished' in active_matches

    def test_closed_cleaned(self):
        """超过1小时的已关闭对局应被清理"""
        with active_matches_lock:
            active_matches['closed_old'] = {
                'id': 'closed_old',
                'status': 'closed',
                'startTime': time.time() - 3601,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'closed_old' not in active_matches

    def test_recent_closed_not_cleaned(self):
        """最近关闭的对局不应被清理"""
        with active_matches_lock:
            active_matches['recent_closed'] = {
                'id': 'recent_closed',
                'status': 'closed',
                'startTime': time.time() - 100,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'recent_closed' in active_matches

    def test_mixed_matches(self):
        """混合对局清理"""
        with active_matches_lock:
            active_matches['fresh'] = {
                'id': 'fresh',
                'status': 'playing',
                'startTime': time.time() - 100,
            }
            active_matches['old_playing'] = {
                'id': 'old_playing',
                'status': 'playing',
                'startTime': time.time() - 7201,
            }
            active_matches['old_finished'] = {
                'id': 'old_finished',
                'status': 'finished',
                'startTime': time.time() - 3601,
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'fresh' in active_matches
            assert 'old_playing' not in active_matches
            assert 'old_finished' not in active_matches

    def test_match_without_starttime(self):
        """无 startTime 的对局不应被清理"""
        with active_matches_lock:
            active_matches['no_time'] = {
                'id': 'no_time',
                'status': 'playing',
            }

        with patch('server.match.storage.save_matches'):
            cleanup_expired_matches()

        with active_matches_lock:
            assert 'no_time' in active_matches


class TestCleanupInactiveConnections:
    """cleanup_inactive_connections 函数测试"""

    def test_no_connections(self):
        """无连接时不应报错"""
        inactive = cleanup_inactive_connections()
        assert inactive == []

    def test_active_connections_not_cleaned(self):
        """活跃连接不应被清理"""
        with user_connections_lock:
            user_connections['active_user'] = {
                'lastHeartbeat': time.time(),
                'isOnline': True,
            }

        inactive = cleanup_inactive_connections()
        assert 'active_user' not in inactive

    def test_inactive_connections_cleaned(self):
        """超时连接应被清理"""
        with user_connections_lock:
            user_connections['inactive_user'] = {
                'lastHeartbeat': time.time() - CONNECT_TIMEOUT - 1,
                'isOnline': True,
            }

        inactive = cleanup_inactive_connections()
        assert 'inactive_user' in inactive

        with user_connections_lock:
            assert 'inactive_user' not in user_connections

    def test_barely_active_connections(self):
        """刚好在超时边界内的连接不应被清理"""
        with user_connections_lock:
            user_connections['borderline'] = {
                'lastHeartbeat': time.time() - CONNECT_TIMEOUT + 10,
                'isOnline': True,
            }

        inactive = cleanup_inactive_connections()
        assert 'borderline' not in inactive

    def test_mixed_connections(self):
        """混合连接清理"""
        with user_connections_lock:
            user_connections['active'] = {
                'lastHeartbeat': time.time(),
                'isOnline': True,
            }
            user_connections['inactive'] = {
                'lastHeartbeat': time.time() - CONNECT_TIMEOUT - 1,
                'isOnline': True,
            }

        inactive = cleanup_inactive_connections()
        assert 'active' not in inactive
        assert 'inactive' in inactive
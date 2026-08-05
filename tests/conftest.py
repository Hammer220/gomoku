"""pytest 配置文件
提供测试夹具（fixtures）：内存数据库、Flask 测试客户端、测试用户等
"""

import os
import sys
import json
import sqlite3
import pytest

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SCRIPT_DIR)

from server import create_app


@pytest.fixture
def app():
    """创建 Flask 测试应用实例"""
    os.environ['NO_COLOR'] = '1'
    os.environ['TERM'] = 'dumb'

    app = create_app()
    app.config['TESTING'] = True
    app.config['SERVER_NAME'] = 'localhost'

    return app


@pytest.fixture
def client(app):
    """创建 Flask 测试客户端"""
    return app.test_client()


@pytest.fixture
def empty_board():
    """返回一个空的 15x15 棋盘"""
    return [[0] * 15 for _ in range(15)]


@pytest.fixture
def sample_user():
    """返回一个示例用户字典"""
    return {
        'username': 'testuser',
        'password': 'hashed_password',
        'score': 1000,
        'wins': 10,
        'games': 20,
        'joinDate': '2024-01-01',
        'lastLogin': '2024-06-01 12:00:00',
        'isAdmin': False,
        'isSuperAdmin': False,
        'bannedUntil': None,
        'canBanUser': False,
        'canKickUser': False,
        'canDeleteUser': False,
        'canChangePassword': False,
        'canModifyScore': False,
        'canSetPasswordFree': False,
        'canMonitorMatches': False,
        'canManageMatches': False,
        'passwordFree': False,
        'passwordFreeMaxAttempts': 0,
        'passwordFreeRemainingAttempts': 0,
        'isGuest': False,
        'language': 'zh-CN',
    }


@pytest.fixture
def admin_user():
    """返回一个示例管理员用户字典"""
    return {
        'username': 'admin',
        'password': 'hashed_password',
        'score': 2000,
        'wins': 50,
        'games': 80,
        'joinDate': '2024-01-01',
        'lastLogin': '2024-06-01 12:00:00',
        'isAdmin': True,
        'isSuperAdmin': False,
        'bannedUntil': None,
        'canBanUser': True,
        'canKickUser': True,
        'canDeleteUser': True,
        'canChangePassword': True,
        'canModifyScore': True,
        'canSetPasswordFree': True,
        'canMonitorMatches': True,
        'canManageMatches': True,
        'passwordFree': False,
        'passwordFreeMaxAttempts': 0,
        'passwordFreeRemainingAttempts': 0,
        'isGuest': False,
        'language': 'zh-CN',
    }


@pytest.fixture
def super_admin_user():
    """返回一个示例超级管理员用户字典"""
    return {
        'username': 'superadmin',
        'password': 'hashed_password',
        'score': 5000,
        'wins': 100,
        'games': 120,
        'joinDate': '2024-01-01',
        'lastLogin': '2024-06-01 12:00:00',
        'isAdmin': True,
        'isSuperAdmin': True,
        'bannedUntil': None,
        'canBanUser': True,
        'canKickUser': True,
        'canDeleteUser': True,
        'canChangePassword': True,
        'canModifyScore': True,
        'canSetPasswordFree': True,
        'canMonitorMatches': True,
        'canManageMatches': True,
        'passwordFree': False,
        'passwordFreeMaxAttempts': 0,
        'passwordFreeRemainingAttempts': 0,
        'isGuest': False,
        'language': 'zh-CN',
    }


@pytest.fixture
def banned_user():
    """返回一个被封禁的用户字典"""
    import time
    return {
        'username': 'banneduser',
        'password': 'hashed_password',
        'score': 500,
        'wins': 2,
        'games': 10,
        'joinDate': '2024-01-01',
        'lastLogin': '2024-06-01 12:00:00',
        'isAdmin': False,
        'isSuperAdmin': False,
        'bannedUntil': time.time() + 86400,
        'canBanUser': False,
        'canKickUser': False,
        'canDeleteUser': False,
        'canChangePassword': False,
        'canModifyScore': False,
        'canSetPasswordFree': False,
        'canMonitorMatches': False,
        'canManageMatches': False,
        'passwordFree': False,
        'passwordFreeMaxAttempts': 0,
        'passwordFreeRemainingAttempts': 0,
        'isGuest': False,
        'language': 'zh-CN',
    }
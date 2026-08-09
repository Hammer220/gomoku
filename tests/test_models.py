"""数据模型与路由测试
测试范围：段位计算、用户数据转换、权限管理、积分计算
"""

import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.models import (
    PERMISSION_FIELDS,
    _row_to_user,
    clear_cache,
    get_admin_permissions,
    get_cached_data,
    get_file_lock,
    load_json_with_lock,
    save_json_with_lock,
    set_cached_data,
)
from server.routes.auth_routes import RANK_CONFIG, calculate_rank


class TestCalculateRank:
    """calculate_rank 函数测试：段位计算"""

    def test_no_rank(self):
        """无段位"""
        assert calculate_rank(-100) == '无段位'
        assert calculate_rank(-1) == '无段位'
        assert calculate_rank(0) == '入门'

    def test_entry_level(self):
        """入门"""
        assert calculate_rank(0) == '入门'
        assert calculate_rank(50) == '入门'
        assert calculate_rank(99) == '入门'

    def test_level_1(self):
        """初段"""
        assert calculate_rank(100) == '初段'
        assert calculate_rank(200) == '初段'
        assert calculate_rank(299) == '初段'

    def test_level_2(self):
        """二段"""
        assert calculate_rank(300) == '二段'
        assert calculate_rank(450) == '二段'
        assert calculate_rank(599) == '二段'

    def test_level_3(self):
        """三段"""
        assert calculate_rank(600) == '三段'
        assert calculate_rank(800) == '三段'
        assert calculate_rank(999) == '三段'

    def test_level_4(self):
        """四段"""
        assert calculate_rank(1000) == '四段'
        assert calculate_rank(1250) == '四段'
        assert calculate_rank(1499) == '四段'

    def test_level_5(self):
        """五段"""
        assert calculate_rank(1500) == '五段'
        assert calculate_rank(1750) == '五段'
        assert calculate_rank(1999) == '五段'

    def test_level_6(self):
        """六段"""
        assert calculate_rank(2000) == '六段'
        assert calculate_rank(2500) == '六段'
        assert calculate_rank(2999) == '六段'

    def test_level_7(self):
        """七段"""
        assert calculate_rank(3000) == '七段'
        assert calculate_rank(3500) == '七段'
        assert calculate_rank(3999) == '七段'

    def test_level_8(self):
        """八段"""
        assert calculate_rank(4000) == '八段'
        assert calculate_rank(4500) == '八段'
        assert calculate_rank(4999) == '八段'

    def test_level_9(self):
        """九段"""
        assert calculate_rank(5000) == '九段'
        assert calculate_rank(10000) == '九段'
        assert calculate_rank(99999) == '九段'


class TestRankConfig:
    """RANK_CONFIG 配置测试"""

    def test_config_length(self):
        """段位配置应有11个段位"""
        assert len(RANK_CONFIG) == 11

    def test_config_order(self):
        """段位应按分数升序排列"""
        for i in range(len(RANK_CONFIG) - 1):
            assert RANK_CONFIG[i]['max_score'] <= RANK_CONFIG[i + 1]['min_score']

    def test_config_continuity(self):
        """段位分数区间应连续"""
        for i in range(len(RANK_CONFIG) - 1):
            assert RANK_CONFIG[i]['max_score'] == RANK_CONFIG[i + 1]['min_score']

    def test_config_names(self):
        """段位名称检查"""
        names = [r['name'] for r in RANK_CONFIG]
        assert '无段位' in names
        assert '入门' in names
        assert '九段' in names


class TestRowToUser:
    """_row_to_user 函数测试"""

    def test_basic_conversion(self):
        """基本转换"""

        class FakeRow:
            def __init__(self, d):
                self._d = d

            def __getitem__(self, key):
                return self._d.get(key)

        row = FakeRow(
            {
                'username': 'test',
                'password': 'hashed',
                'score': 1000,
                'wins': 5,
                'games': 10,
                'join_date': '2024-01-01',
                'last_login': '2024-06-01',
                'is_admin': 0,
                'is_super_admin': 0,
                'banned_until': None,
                'can_ban_user': 0,
                'can_kick_user': 0,
                'can_delete_user': 0,
                'can_change_password': 0,
                'can_modify_score': 0,
                'can_set_password_free': 0,
                'can_monitor_matches': 0,
                'can_manage_matches': 0,
                'password_free': 0,
                'password_free_max_attempts': 0,
                'password_free_remaining_attempts': 0,
                'is_guest': 0,
                'language': 'zh-CN',
            }
        )

        user = _row_to_user(row)
        assert user['username'] == 'test'
        assert user['score'] == 1000
        assert user['wins'] == 5
        assert user['games'] == 10
        assert user['isAdmin'] is False
        assert user['isSuperAdmin'] is False

    def test_admin_conversion(self):
        """管理员转换"""

        class FakeRow:
            def __init__(self, d):
                self._d = d

            def __getitem__(self, key):
                return self._d.get(key)

        row = FakeRow(
            {
                'username': 'admin',
                'password': 'hashed',
                'score': 2000,
                'wins': 50,
                'games': 80,
                'join_date': '2024-01-01',
                'last_login': '2024-06-01',
                'is_admin': 1,
                'is_super_admin': 0,
                'banned_until': None,
                'can_ban_user': 1,
                'can_kick_user': 1,
                'can_delete_user': 1,
                'can_change_password': 1,
                'can_modify_score': 1,
                'can_set_password_free': 1,
                'can_monitor_matches': 1,
                'can_manage_matches': 1,
                'password_free': 0,
                'password_free_max_attempts': 0,
                'password_free_remaining_attempts': 0,
                'is_guest': 0,
                'language': 'zh-CN',
            }
        )

        user = _row_to_user(row)
        assert user['isAdmin'] is True
        assert user['isSuperAdmin'] is False
        assert user['canBanUser'] is True

    def test_none_row(self):
        """None 行返回值"""
        assert _row_to_user(None) is None


class TestAdminPermissions:
    """get_admin_permissions 函数测试"""

    def test_super_admin_all_permissions(self, super_admin_user):
        """超级管理员拥有所有权限"""
        perms = get_admin_permissions(super_admin_user)
        for field in PERMISSION_FIELDS:
            assert perms[field] is True, f'{field} 应为 True'

    def test_admin_specific_permissions(self, admin_user):
        """普通管理员拥有指定权限"""
        perms = get_admin_permissions(admin_user)
        assert perms['canBanUser'] is True
        assert perms['canKickUser'] is True

    def test_normal_user_no_permissions(self, sample_user):
        """普通用户无权限"""
        perms = get_admin_permissions(sample_user)
        assert perms == {}

    def test_permission_fields_complete(self):
        """PERMISSION_FIELDS 包含所有权限字段"""
        expected_fields = [
            'canBanUser',
            'canKickUser',
            'canDeleteUser',
            'canChangePassword',
            'canModifyScore',
            'canSetPasswordFree',
            'canMonitorMatches',
            'canManageMatches',
        ]
        for field in expected_fields:
            assert field in PERMISSION_FIELDS


class TestPasswordHashing:
    """密码哈希测试"""

    def test_sha256_consistency(self):
        """SHA256 哈希一致性"""
        password = 'test_password_123'
        hash1 = hashlib.sha256(password.encode()).hexdigest()
        hash2 = hashlib.sha256(password.encode()).hexdigest()
        assert hash1 == hash2

    def test_sha256_different_passwords(self):
        """不同密码产生不同哈希"""
        hash1 = hashlib.sha256(b'password1').hexdigest()
        hash2 = hashlib.sha256(b'password2').hexdigest()
        assert hash1 != hash2

    def test_hash_length(self):
        """SHA256 哈希长度应为64"""
        h = hashlib.sha256(b'test').hexdigest()
        assert len(h) == 64


class TestCache:
    """缓存功能测试"""

    def test_set_and_get(self):
        """设置和获取缓存"""
        clear_cache()
        set_cached_data('test_key', 'test_value', ttl=60)
        result = get_cached_data('test_key')
        assert result == 'test_value'

    def test_cache_expiry(self):
        """缓存过期"""
        clear_cache()
        set_cached_data('test_key', 'test_value', ttl=0)
        import time

        time.sleep(0.01)
        result = get_cached_data('test_key')
        assert result is None

    def test_clear_specific_cache(self):
        """清除特定缓存"""
        set_cached_data('key1', 'value1', ttl=60)
        set_cached_data('key2', 'value2', ttl=60)
        clear_cache('key1')
        assert get_cached_data('key1') is None
        assert get_cached_data('key2') == 'value2'

    def test_clear_all_cache(self):
        """清除所有缓存"""
        set_cached_data('key1', 'value1', ttl=60)
        set_cached_data('key2', 'value2', ttl=60)
        clear_cache()
        assert get_cached_data('key1') is None
        assert get_cached_data('key2') is None


class TestJSONOperations:
    """JSON 文件操作测试"""

    def test_load_nonexistent_file(self, tmp_path):
        """加载不存在的文件返回默认值"""
        file_path = str(tmp_path / 'nonexistent.json')
        result = load_json_with_lock(file_path, {'default': True})
        assert result == {'default': True}

    def test_save_and_load(self, tmp_path):
        """保存和加载 JSON"""
        file_path = str(tmp_path / 'test.json')
        data = {'key': 'value', 'number': 42}
        save_json_with_lock(file_path, data)
        loaded = load_json_with_lock(file_path)
        assert loaded == data

    def test_save_overwrite(self, tmp_path):
        """覆盖保存"""
        file_path = str(tmp_path / 'test.json')
        save_json_with_lock(file_path, {'old': 'data'})
        save_json_with_lock(file_path, {'new': 'data'})
        loaded = load_json_with_lock(file_path)
        assert loaded == {'new': 'data'}

    def test_file_lock_exists(self, tmp_path):
        """文件锁存在"""
        file_path = str(tmp_path / 'test.json')
        lock = get_file_lock(file_path)
        assert lock is not None

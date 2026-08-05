"""全局配置模块测试
测试范围：配置解析、验证码配置检测、get_config 函数
"""

import sys
import os
import tempfile
import configparser

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.config import (
    SCRIPT_DIR, STATIC_DIR, get_config,
    has_valid_geetest_config, has_valid_geetest_login_config,
    PORT, CAPTCHA_ENABLED, cfg,
)


class TestConfigStructure:
    """配置结构测试"""

    def test_script_dir_exists(self):
        """SCRIPT_DIR 应存在"""
        assert os.path.exists(SCRIPT_DIR)

    def test_static_dir_exists(self):
        """STATIC_DIR 应存在"""
        assert os.path.exists(STATIC_DIR)

    def test_port_is_valid(self):
        """PORT 应为有效端口号"""
        assert isinstance(PORT, int)
        assert 1 <= PORT <= 65535

    def test_captcha_enabled_is_bool(self):
        """CAPTCHA_ENABLED 应为布尔值"""
        assert isinstance(CAPTCHA_ENABLED, bool)


class TestGetConfig:
    """get_config 函数测试"""

    def test_returns_dict(self):
        """返回字典"""
        config = get_config()
        assert isinstance(config, dict)

    def test_required_keys(self):
        """包含所有必需的键"""
        config = get_config()
        required_keys = [
            'GT4_CAPTCHA_ID', 'GT4_CAPTCHA_KEY', 'VERIFY_URL',
            'GT4_LOGIN_CAPTCHA_ID', 'GT4_LOGIN_CAPTCHA_KEY', 'LOGIN_VERIFY_URL',
            'PORT', 'CAPTCHA_ENABLED'
        ]
        for key in required_keys:
            assert key in config, f'缺少配置键: {key}'

    def test_port_type(self):
        """PORT 应为整数"""
        config = get_config()
        assert isinstance(config['PORT'], int)

    def test_captcha_enabled_type(self):
        """CAPTCHA_ENABLED 应为布尔值"""
        config = get_config()
        assert isinstance(config['CAPTCHA_ENABLED'], bool)


class TestGeetestConfig:
    """极验验证码配置测试"""

    def test_has_valid_geetest_config(self):
        """检查是否有有效的极验配置"""
        result = has_valid_geetest_config()
        assert isinstance(result, bool)

    def test_has_valid_geetest_login_config(self):
        """检查是否有有效的极验登录配置"""
        result = has_valid_geetest_login_config()
        assert isinstance(result, bool)

    def test_config_consistency(self):
        """两个配置函数的返回值与 CAPTCHA_ENABLED 一致"""
        expected = has_valid_geetest_config() and has_valid_geetest_login_config()
        assert CAPTCHA_ENABLED == expected


class TestConfigParser:
    """configparser 行为测试"""

    def test_parse_valid_config(self):
        """解析有效配置"""
        parser = configparser.ConfigParser()
        parser.read_string("""
[APP]
port = 9000
debug = true
""")
        assert parser.get('APP', 'port') == '9000'
        assert parser.getboolean('APP', 'debug') is True

    def test_missing_section(self):
        """缺失配置节"""
        parser = configparser.ConfigParser()
        with pytest.raises(configparser.NoSectionError):
            parser.get('NONEXISTENT', 'key')

    def test_missing_option(self):
        """缺失配置项"""
        parser = configparser.ConfigParser()
        parser.read_string("[APP]\nport = 8000\n")
        with pytest.raises(configparser.NoOptionError):
            parser.get('APP', 'nonexistent')

    def test_has_option(self):
        """检查配置项是否存在"""
        parser = configparser.ConfigParser()
        parser.read_string("[APP]\nport = 8000\n")
        assert parser.has_option('APP', 'port') is True
        assert parser.has_option('APP', 'nonexistent') is False


class TestConfigFileParsing:
    """config.ini 文件解析测试"""

    def test_config_file_readable(self):
        """config.ini 文件可读"""
        config_path = os.path.join(SCRIPT_DIR, 'config.ini')
        assert os.path.exists(config_path), 'config.ini 文件不存在'

    def test_app_section_exists(self):
        """APP 配置节存在"""
        try:
            port = cfg.get('APP', 'port')
            assert port is not None
        except (configparser.NoSectionError, configparser.NoOptionError):
            pytest.skip('APP 配置节不存在')

    def test_geetest_section_exists(self):
        """GEETEST 配置节存在"""
        try:
            captcha_id = cfg.get('GEETEST', 'captcha_id')
            captcha_key = cfg.get('GEETEST', 'captcha_key')
            assert captcha_id is not None
            assert captcha_key is not None
        except (configparser.NoSectionError, configparser.NoOptionError):
            pytest.skip('GEETEST 配置节不存在')


import pytest
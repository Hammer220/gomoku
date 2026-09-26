"""全局配置模块
定义应用路径、数据文件路径、极验验证码参数、默认配置文件等。
"""

import configparser
import os

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(SCRIPT_DIR, 'static')
os.makedirs(STATIC_DIR, exist_ok=True)

cfg = configparser.ConfigParser()
config_path = os.path.join(SCRIPT_DIR, 'config.ini')
try:
    cfg.read(config_path, encoding='utf-8')
except UnicodeDecodeError:
    try:
        cfg.read(config_path, encoding='gbk')
    except UnicodeDecodeError:
        cfg.read(config_path, encoding='latin-1')


def has_valid_geetest_config():
    """检查是否存在有效的极验验证码配置"""
    try:
        return bool(cfg.get('GEETEST', 'captcha_id')) and bool(cfg.get('GEETEST', 'captcha_key'))
    except (configparser.NoSectionError, configparser.NoOptionError):
        return False


def has_valid_geetest_login_config():
    """检查是否存在有效的极验登录验证码配置"""
    try:
        return bool(cfg.get('GEETEST_LOGIN', 'captcha_id')) and bool(cfg.get('GEETEST_LOGIN', 'captcha_key'))
    except (configparser.NoSectionError, configparser.NoOptionError):
        return False


def get_config():
    captcha_enabled = has_valid_geetest_config() and has_valid_geetest_login_config()
    return {
        'GT4_CAPTCHA_ID': cfg.get('GEETEST', 'captcha_id') if has_valid_geetest_config() else '',
        'GT4_CAPTCHA_KEY': cfg.get('GEETEST', 'captcha_key') if has_valid_geetest_config() else '',
        'VERIFY_URL': cfg.get('GEETEST', 'verify_url') if has_valid_geetest_config() else '',
        'GT4_LOGIN_CAPTCHA_ID': cfg.get('GEETEST_LOGIN', 'captcha_id') if has_valid_geetest_login_config() else '',
        'GT4_LOGIN_CAPTCHA_KEY': cfg.get('GEETEST_LOGIN', 'captcha_key') if has_valid_geetest_login_config() else '',
        'LOGIN_VERIFY_URL': cfg.get('GEETEST_LOGIN', 'verify_url') if has_valid_geetest_login_config() else '',
        'PORT': int(cfg.get('APP', 'port')) if cfg.has_option('APP', 'port') else 8000,
        'CAPTCHA_ENABLED': captcha_enabled,
    }


GT4_CAPTCHA_ID = cfg.get('GEETEST', 'captcha_id') if has_valid_geetest_config() else ''
GT4_CAPTCHA_KEY = cfg.get('GEETEST', 'captcha_key') if has_valid_geetest_config() else ''
VERIFY_URL = cfg.get('GEETEST', 'verify_url') if has_valid_geetest_config() else ''
GT4_LOGIN_CAPTCHA_ID = cfg.get('GEETEST_LOGIN', 'captcha_id') if has_valid_geetest_login_config() else ''
GT4_LOGIN_CAPTCHA_KEY = cfg.get('GEETEST_LOGIN', 'captcha_key') if has_valid_geetest_login_config() else ''
LOGIN_VERIFY_URL = cfg.get('GEETEST_LOGIN', 'verify_url') if has_valid_geetest_login_config() else ''
PORT = int(cfg.get('APP', 'port')) if cfg.has_option('APP', 'port') else 8000
CAPTCHA_ENABLED = has_valid_geetest_config() and has_valid_geetest_login_config()
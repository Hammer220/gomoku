import os
import configparser

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(SCRIPT_DIR, 'static')
os.makedirs(STATIC_DIR, exist_ok=True)

cfg = configparser.ConfigParser()
cfg.read(os.path.join(SCRIPT_DIR, 'config.ini'), encoding='utf-8')

def get_config():
    return {
        'GT4_CAPTCHA_ID': cfg.get('GEETEST', 'captcha_id'),
        'GT4_CAPTCHA_KEY': cfg.get('GEETEST', 'captcha_key'),
        'VERIFY_URL': cfg.get('GEETEST', 'verify_url'),
        'GT4_LOGIN_CAPTCHA_ID': cfg.get('GEETEST_LOGIN', 'captcha_id'),
        'GT4_LOGIN_CAPTCHA_KEY': cfg.get('GEETEST_LOGIN', 'captcha_key'),
        'LOGIN_VERIFY_URL': cfg.get('GEETEST_LOGIN', 'verify_url'),
        'PORT': int(cfg.get('APP', 'port')),
        'TURNSTILE_SITE_KEY': cfg.get('TURNSTILE', 'site_key'),
        'TURNSTILE_SECRET_KEY': cfg.get('TURNSTILE', 'secret_key'),
        'TURNSTILE_VERIFY_URL': cfg.get('TURNSTILE', 'verify_url'),
    }

GT4_CAPTCHA_ID = cfg.get('GEETEST', 'captcha_id')
GT4_CAPTCHA_KEY = cfg.get('GEETEST', 'captcha_key')
VERIFY_URL = cfg.get('GEETEST', 'verify_url')
GT4_LOGIN_CAPTCHA_ID = cfg.get('GEETEST_LOGIN', 'captcha_id')
GT4_LOGIN_CAPTCHA_KEY = cfg.get('GEETEST_LOGIN', 'captcha_key')
LOGIN_VERIFY_URL = cfg.get('GEETEST_LOGIN', 'verify_url')
PORT = int(cfg.get('APP', 'port'))
TURNSTILE_SITE_KEY = cfg.get('TURNSTILE', 'site_key')
TURNSTILE_SECRET_KEY = cfg.get('TURNSTILE', 'secret_key')
TURNSTILE_VERIFY_URL = cfg.get('TURNSTILE', 'verify_url')
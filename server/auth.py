import hashlib
import hmac
import time
import requests
from datetime import datetime
from flask import request, jsonify
from functools import wraps

from .config import (GT4_CAPTCHA_ID, GT4_CAPTCHA_KEY, VERIFY_URL,
                     GT4_LOGIN_CAPTCHA_ID, GT4_LOGIN_CAPTCHA_KEY, LOGIN_VERIFY_URL,
                     TURNSTILE_SECRET_KEY, TURNSTILE_VERIFY_URL)
from .models import get_current_user_from_request
from .logger import logger

def turnstile_verify(response_token):
    if not response_token:
        logger.warning('Turnstile token为空')
        return False, '验证码参数缺失'

    params = {
        'secret': TURNSTILE_SECRET_KEY,
        'response': response_token,
        'remoteip': request.remote_addr if request else None
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}

    try:
        resp = requests.post(TURNSTILE_VERIFY_URL, data=params, headers=headers, timeout=10)
        logger.info(f'Turnstile请求状态码: {resp.status_code}, 原始返回: {repr(resp.text)}')
        if resp.status_code != 200:
            return False, f'接口请求异常，状态码：{resp.status_code}'
        data = resp.json()
        if data.get('success'):
            return True, '验证码验证通过'
        else:
            return False, f"验证失败：{data.get('error-codes', ['未知原因'])[0]}"
    except requests.exceptions.RequestException as e:
        logger.error(f'Turnstile网络请求异常: {str(e)}')
        return False, '网络请求超时/连接失败'
    except Exception as e:
        logger.error(f'Turnstile校验全局异常: {str(e)}')
        return False, f'系统异常：{str(e)}'

def geetest_verify(lot_number, captcha_output, pass_token, gen_time,
                   captcha_id=None, captcha_key=None, verify_url=None):
    use_captcha_id = captcha_id if captcha_id else GT4_CAPTCHA_ID
    use_captcha_key = captcha_key if captcha_key else GT4_CAPTCHA_KEY
    use_verify_url = verify_url if verify_url else VERIFY_URL

    if not all([lot_number, captcha_output, pass_token, gen_time]):
        logger.warning('极验参数不完整')
        return False, '验证码参数缺失'

    hmac_obj = hmac.new(
        use_captcha_key.encode('utf-8'),
        lot_number.encode('utf-8'),
        hashlib.sha256
    )
    sign_token = hmac_obj.hexdigest()

    params = {
        'lot_number': lot_number,
        'captcha_output': captcha_output,
        'pass_token': pass_token,
        'gen_time': gen_time,
        'captcha_id': use_captcha_id,
        'sign_token': sign_token
    }
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        resp = requests.post(use_verify_url, data=params, headers=headers, timeout=10)
        logger.info(f'极验请求状态码: {resp.status_code}, 原始返回: {repr(resp.text)}')
        if resp.status_code != 200:
            return False, f'接口请求异常，状态码：{resp.status_code}'
        resp_text = resp.text.strip()
        if not resp_text:
            return False, '极验接口返回空数据'
        if not resp_text.startswith('{'):
            return False, '接口返回非JSON（域名未授权/请求非法）'
        data = resp.json()
        if data.get('result') == 'success':
            return True, '验证码验证通过'
        else:
            return False, f"验证失败：{data.get('reason', '未知原因')}"
    except requests.exceptions.RequestException as e:
        logger.error(f'极验网络请求异常: {str(e)}')
        return False, '网络请求超时/连接失败'
    except Exception as e:
        logger.error(f'极验校验全局异常: {str(e)}')
        return False, f'系统异常：{str(e)}'

def get_current_user():
    return get_current_user_from_request(request)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': '未授权'}), 401
        if user.get('bannedUntil'):
            banned_until = user['bannedUntil']
            if banned_until and time.time() < banned_until:
                return jsonify({'error': f"账号已被封禁至 {datetime.fromtimestamp(banned_until).strftime('%Y-%m-%d %H:%M:%S')}"}), 403
        return f(user, *args, **kwargs)
    return decorated

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user or not user.get('isAdmin'):
            return jsonify({'error': '需要管理员权限'}), 403
        return f(user, *args, **kwargs)
    return decorated

def require_super_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user or not user.get('isAdmin') or not user.get('isSuperAdmin'):
            return jsonify({'error': '需要超级管理员权限'}), 403
        return f(user, *args, **kwargs)
    return decorated
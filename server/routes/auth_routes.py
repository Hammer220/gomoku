import hashlib
import time
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..config import (GT4_CAPTCHA_ID, GT4_LOGIN_CAPTCHA_ID,
                      TURNSTILE_SITE_KEY, get_config)
from ..models import (load_json_with_lock, save_json_with_lock, get_user,
                      save_user, save_plain_password, get_plain_password,
                      TOKENS_FILE, USERS_FILE, PASSWORD_FILE)
from ..auth import (geetest_verify, turnstile_verify, get_current_user,
                    require_auth)
from ..logger import logger

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/config', methods=['GET'])
def api_config():
    return jsonify({
        'captchaId': GT4_CAPTCHA_ID,
        'loginCaptchaId': GT4_LOGIN_CAPTCHA_ID,
        'turnstileSiteKey': TURNSTILE_SITE_KEY
    })

@auth_bp.route('/api/config/full', methods=['GET'])
def get_full_config():
    config = get_config()
    return jsonify({
        'captchaId': GT4_CAPTCHA_ID,
        'captchaKey': config['GT4_CAPTCHA_KEY'],
        'verifyUrl': config['VERIFY_URL'],
        'loginCaptchaId': GT4_LOGIN_CAPTCHA_ID,
        'loginCaptchaKey': config['GT4_LOGIN_CAPTCHA_KEY'],
        'loginVerifyUrl': config['LOGIN_VERIFY_URL'],
        'turnstileSiteKey': TURNSTILE_SITE_KEY,
        'turnstileSecretKey': config['TURNSTILE_SECRET_KEY'],
        'turnstileVerifyUrl': config['TURNSTILE_VERIFY_URL']
    })

@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        turnstile_token = data.get('turnstileToken', '')
        geetest_lot = data.get('geetestLot', '')
        geetest_output = data.get('geetestCaptchaOutput', '')
        geetest_pass = data.get('geetestPassToken', '')
        geetest_gen_time = data.get('geetestGenTime', '')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400
        if len(username) < 3 or len(username) > 20:
            return jsonify({'error': '用户名长度应为3-20个字符'}), 400
        if len(password) < 6:
            return jsonify({'error': '密码长度至少为6个字符'}), 400

        if not turnstile_token and not geetest_lot:
            return jsonify({'error': '请完成验证码验证'}), 400

        if turnstile_token:
            turnstile_success, turnstile_msg = turnstile_verify(turnstile_token)
            if not turnstile_success:
                return jsonify({'error': turnstile_msg}), 400
            logger.info(f'Turnstile验证通过，用户名: {username}')
        else:
            geetest_success, geetest_msg = geetest_verify(geetest_lot, geetest_output, geetest_pass, geetest_gen_time)
            if not geetest_success:
                return jsonify({'error': geetest_msg}), 400
            logger.info(f'极验验证通过，用户名: {username}')

        users = load_json_with_lock(USERS_FILE)
        if not isinstance(users, dict):
            users = {}
        if username in users:
            return jsonify({'error': '用户名已存在'}), 400

        hashed_password = hashlib.sha256(password.encode()).hexdigest()

        users[username] = {
            'username': username,
            'password': hashed_password,
            'score': 0,
            'wins': 0,
            'games': 0,
            'joinDate': datetime.now().strftime('%Y-%m-%d'),
            'lastLogin': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'isAdmin': False,
            'isSuperAdmin': False,
            'bannedUntil': None
        }
        save_json_with_lock(USERS_FILE, users)
        save_plain_password(username, password)

        token = str(uuid.uuid4())
        tokens = load_json_with_lock(TOKENS_FILE)
        tokens[token] = {
            'username': username,
            'createdAt': time.time(),
            'turnstile_verified': bool(turnstile_token)
        }
        save_json_with_lock(TOKENS_FILE, tokens)

        logger.info(f'用户注册成功: {username}')
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'username': username,
                'score': 0,
                'wins': 0,
                'games': 0,
                'isAdmin': False,
                'isSuperAdmin': False
            }
        })
    except Exception as e:
        logger.error(f'注册错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        turnstile_token = data.get('turnstileToken', '')
        geetest_lot = data.get('geetestLot', '')
        geetest_output = data.get('geetestCaptchaOutput', '')
        geetest_pass = data.get('geetestPassToken', '')
        geetest_gen_time = data.get('geetestGenTime', '')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400

        if not turnstile_token and not geetest_lot:
            return jsonify({'error': '请完成验证码验证'}), 400

        if turnstile_token:
            turnstile_success, turnstile_msg = turnstile_verify(turnstile_token)
            if not turnstile_success:
                return jsonify({'error': turnstile_msg}), 400
            logger.info(f'Turnstile登录验证通过，用户名: {username}')
        else:
            geetest_success, geetest_msg = geetest_verify(
                geetest_lot, geetest_output, geetest_pass, geetest_gen_time,
                captcha_id=GT4_LOGIN_CAPTCHA_ID,
                captcha_key=None, verify_url=None
            )
            if not geetest_success:
                return jsonify({'error': geetest_msg}), 400
            logger.info(f'极验登录验证通过，用户名: {username}')

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户名或密码错误'}), 401

        if user.get('bannedUntil'):
            banned_until = user['bannedUntil']
            if banned_until and time.time() < banned_until:
                return jsonify({'error': f"账号已被封禁至 {datetime.fromtimestamp(banned_until).strftime('%Y-%m-%d %H:%M:%S')}"}), 403

        if 'password' in user:
            hashed_password = hashlib.sha256(password.encode()).hexdigest()
            if user['password'] != hashed_password:
                return jsonify({'error': '用户名或密码错误'}), 401
        else:
            plain_pwd = get_plain_password(username)
            if not plain_pwd or plain_pwd != password:
                return jsonify({'error': '用户名或密码错误'}), 401

        user['lastLogin'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        save_user(username, user)

        token = str(uuid.uuid4())
        tokens = load_json_with_lock(TOKENS_FILE)
        tokens[token] = {
            'username': username,
            'createdAt': time.time(),
            'turnstile_verified': bool(turnstile_token)
        }
        save_json_with_lock(TOKENS_FILE, tokens)

        logger.info(f'用户登录成功: {username}')
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'username': username,
                'score': user.get('score', 0),
                'wins': user.get('wins', 0),
                'games': user.get('games', 0),
                'isAdmin': user.get('isAdmin', False),
                'isSuperAdmin': user.get('isSuperAdmin', False)
            }
        })
    except Exception as e:
        logger.error(f'登录错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@auth_bp.route('/api/logout', methods=['POST'])
@require_auth
def logout(user):
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        tokens = load_json_with_lock(TOKENS_FILE)
        if token in tokens:
            del tokens[token]
            save_json_with_lock(TOKENS_FILE, tokens)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'退出错误: {str(e)}')
        return jsonify({'success': True})

@auth_bp.route('/api/current_user', methods=['GET'])
@require_auth
def current_user_route(user):
    return jsonify({
        'username': user['username'],
        'score': user.get('score', 0),
        'wins': user.get('wins', 0),
        'games': user.get('games', 0),
        'isAdmin': user.get('isAdmin', False),
        'isSuperAdmin': user.get('isSuperAdmin', False)
    })

@auth_bp.route('/api/verify-turnstile', methods=['POST'])
def verify_turnstile():
    data = request.get_json()
    token = data.get('token', '')
    if not token:
        return jsonify({'success': False, 'error': 'Token不能为空'}), 400

    success, msg = turnstile_verify(token)
    if success:
        return jsonify({'success': True, 'message': msg})
    else:
        return jsonify({'success': False, 'error': msg}), 400
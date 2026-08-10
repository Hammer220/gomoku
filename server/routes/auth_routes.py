"""认证路由模块
处理用户注册、登录、登出、获取当前用户信息等认证相关请求。
集成极验（GeeTest）验证码进行人机验证。
"""

import hashlib
import re
import time
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, make_response, request

from ..auth import geetest_verify, require_auth
from ..config import (
    GT4_CAPTCHA_ID,
    GT4_LOGIN_CAPTCHA_ID,
    GT4_LOGIN_CAPTCHA_KEY,
    LOGIN_VERIFY_URL,
)
from ..logger import logger

# TURNSTILE_SITE_KEY
from ..models import (
    add_token,
    delete_user,
    get_admin_permissions,
    get_plain_password,
    get_user,
    remove_token,
    save_plain_password,
    save_user,
)

# turnstile_verify

auth_bp = Blueprint('auth', __name__)

RANK_CONFIG = [
    {'name': '无段位', 'min_score': float('-inf'), 'max_score': 0},
    {'name': '入门', 'min_score': 0, 'max_score': 100},
    {'name': '初段', 'min_score': 100, 'max_score': 300},
    {'name': '二段', 'min_score': 300, 'max_score': 600},
    {'name': '三段', 'min_score': 600, 'max_score': 1000},
    {'name': '四段', 'min_score': 1000, 'max_score': 1500},
    {'name': '五段', 'min_score': 1500, 'max_score': 2000},
    {'name': '六段', 'min_score': 2000, 'max_score': 3000},
    {'name': '七段', 'min_score': 3000, 'max_score': 4000},
    {'name': '八段', 'min_score': 4000, 'max_score': 5000},
    {'name': '九段', 'min_score': 5000, 'max_score': float('inf')},
]


def calculate_rank(score):
    for rank in RANK_CONFIG:
        if rank['min_score'] <= score < rank['max_score']:
            return rank['name']
    return RANK_CONFIG[-1]['name']


@auth_bp.route('/api/config', methods=['GET'])
def api_config():
    """获取前端配置（验证码 ID 等）"""
    return jsonify(
        {
            'captchaId': GT4_CAPTCHA_ID,
            'loginCaptchaId': GT4_LOGIN_CAPTCHA_ID,
            # 'turnstileSiteKey': TURNSTILE_SITE_KEY
        }
    )


@auth_bp.route('/api/register', methods=['POST'])
def register():
    """用户注册：验证验证码，创建新用户，设置密码，返回 token"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        # turnstile_token = data.get('turnstileToken', '')
        geetest_lot = data.get('geetestLot', '')
        geetest_output = data.get('geetestCaptchaOutput', '')
        geetest_pass = data.get('geetestPassToken', '')
        geetest_gen_time = data.get('geetestGenTime', '')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400
        if len(username) < 3 or len(username) > 20:
            return jsonify({'error': '用户名长度应为3-20个字符'}), 400
        if not re.match(r'^[a-zA-Z0-9_]+$', username):
            return jsonify({'error': '用户名只能包含英文、数字和下划线'}), 400
        if len(password) < 6:
            return jsonify({'error': '密码长度至少为6个字符'}), 400

        if not geetest_lot:
            return jsonify({'error': '请完成验证码验证'}), 400

        # if turnstile_token:
        #     turnstile_success, turnstile_msg = turnstile_verify(turnstile_token)
        #     if not turnstile_success:
        #         return jsonify({'error': turnstile_msg}), 400
        #     logger.info(f'Turnstile验证通过，用户名: {username}')
        # else:
        geetest_success, geetest_msg = geetest_verify(geetest_lot, geetest_output, geetest_pass, geetest_gen_time)
        if not geetest_success:
            return jsonify({'error': geetest_msg}), 400
        logger.info(f'极验验证通过，用户名: {username}')

        existing_user = get_user(username)
        if existing_user:
            return jsonify({'error': '用户名已存在'}), 400

        hashed_password = hashlib.sha256(password.encode()).hexdigest()

        user_data = {
            'username': username,
            'password': hashed_password,
            'score': 0,
            'wins': 0,
            'games': 0,
            'joinDate': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            'lastLogin': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'),
            'isAdmin': False,
            'isSuperAdmin': False,
            'bannedUntil': None,
        }
        save_user(username, user_data)
        save_plain_password(username, password)

        token = str(uuid.uuid4())
        add_token(token, username)

        logger.info(f'用户注册成功: {username}')
        resp = make_response(
            jsonify(
                {
                    'success': True,
                    'token': token,
                    'user': {
                        'username': username,
                        'score': 0,
                        'rank': calculate_rank(0),
                        'wins': 0,
                        'games': 0,
                        'isAdmin': False,
                        'isSuperAdmin': False,
                    },
                }
            )
        )
        resp.set_cookie('token', token, max_age=30 * 24 * 3600, httponly=False, samesite='Lax', path='/')
        return resp
    except Exception as e:  # noqa: BLE001
        logger.error(f'注册错误: {e!s}')
        return jsonify({'error': '服务器内部错误'}), 500


@auth_bp.route('/api/login', methods=['POST'])
def login():
    """用户登录：验证用户名密码与验证码，返回 token"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        # turnstile_token = data.get('turnstileToken', '')
        geetest_lot = data.get('geetestLot', '')
        geetest_output = data.get('geetestCaptchaOutput', '')
        geetest_pass = data.get('geetestPassToken', '')
        geetest_gen_time = data.get('geetestGenTime', '')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400

        if not geetest_lot:
            return jsonify({'error': '请完成验证码验证'}), 400

        # if turnstile_token:
        #     turnstile_success, turnstile_msg = turnstile_verify(turnstile_token)
        #     if not turnstile_success:
        #         return jsonify({'error': turnstile_msg}), 400
        #     logger.info(f'Turnstile登录验证通过，用户名: {username}')
        # else:
        geetest_success, geetest_msg = geetest_verify(
            geetest_lot,
            geetest_output,
            geetest_pass,
            geetest_gen_time,
            captcha_id=GT4_LOGIN_CAPTCHA_ID,
            captcha_key=GT4_LOGIN_CAPTCHA_KEY,
            verify_url=LOGIN_VERIFY_URL,
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
                return jsonify(
                    {'error': f'账号已被封禁至 {datetime.fromtimestamp(banned_until, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")}'}
                ), 403

        if 'password' in user:
            hashed_password = hashlib.sha256(password.encode()).hexdigest()
            if user['password'] != hashed_password:
                return jsonify({'error': '用户名或密码错误'}), 401
        else:
            plain_pwd = get_plain_password(username)
            if not plain_pwd or plain_pwd != password:
                return jsonify({'error': '用户名或密码错误'}), 401

        user['lastLogin'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        save_user(username, user)

        token = str(uuid.uuid4())
        add_token(token, username)

        logger.info(f'用户登录成功: {username}')
        resp = make_response(
            jsonify(
                {
                    'success': True,
                    'token': token,
                    'user': {
                        'username': username,
                        'score': user.get('score', 0),
                        'rank': calculate_rank(user.get('score', 0)),
                        'wins': user.get('wins', 0),
                        'games': user.get('games', 0),
                        'isAdmin': user.get('isAdmin', False),
                        'isSuperAdmin': user.get('isSuperAdmin', False),
                    },
                }
            )
        )
        resp.set_cookie('token', token, max_age=30 * 24 * 3600, httponly=False, samesite='Lax', path='/')
        return resp
    except Exception as e:  # noqa: BLE001
        logger.error(f'登录错误: {e!s}')
        return jsonify({'error': '服务器内部错误'}), 500


@auth_bp.route('/api/logout', methods=['POST'])
@require_auth
def logout(user):
    """用户登出：删除服务端 token"""
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            token = request.cookies.get('token', '')
        remove_token(token)
        resp = make_response(jsonify({'success': True}))
        resp.set_cookie('token', '', max_age=0, path='/')
        return resp
    except Exception as e:  # noqa: BLE001
        logger.error(f'退出错误: {e!s}')
        return jsonify({'success': True})


@auth_bp.route('/api/guest/delete', methods=['POST'])
def delete_guest():
    """删除访客账号"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': True})

        username = data.get('username', '').strip()
        if not username or not username.startswith('guest_'):
            return jsonify({'success': True})

        delete_user(username)

        return jsonify({'success': True})
    except Exception as e:  # noqa: BLE001
        logger.error(f'删除访客账号错误: {e!s}')
        return jsonify({'success': True})


@auth_bp.route('/api/guest/login', methods=['POST'])
def guest_login():
    """访客登录：验证极验验证码，创建访客账号，返回 token"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        geetest_lot = data.get('geetestLot', '')
        geetest_output = data.get('geetestCaptchaOutput', '')
        geetest_pass = data.get('geetestPassToken', '')
        geetest_gen_time = data.get('geetestGenTime', '')

        if not username:
            return jsonify({'error': '访客用户名不能为空'}), 400

        if not geetest_lot:
            return jsonify({'error': '请完成验证码验证'}), 400

        geetest_success, geetest_msg = geetest_verify(
            geetest_lot,
            geetest_output,
            geetest_pass,
            geetest_gen_time,
            captcha_id=GT4_LOGIN_CAPTCHA_ID,
            captcha_key=GT4_LOGIN_CAPTCHA_KEY,
            verify_url=LOGIN_VERIFY_URL,
        )
        if not geetest_success:
            return jsonify({'error': geetest_msg}), 400
        logger.info(f'极验访客登录验证通过，用户名: {username}')

        existing_user = get_user(username)
        if existing_user:
            if existing_user.get('bannedUntil'):
                banned_until = existing_user['bannedUntil']
                if banned_until and time.time() < banned_until:
                    return jsonify(
                        {
                            'error': f'账号已被封禁至 {datetime.fromtimestamp(banned_until, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")}'
                        }
                    ), 403
            token = str(uuid.uuid4())
            add_token(token, username)
            existing_user['lastLogin'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            save_user(username, existing_user)
        else:
            user_data = {
                'username': username,
                'password': '',
                'score': 0,
                'wins': 0,
                'games': 0,
                'joinDate': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                'lastLogin': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'),
                'isAdmin': False,
                'isSuperAdmin': False,
                'bannedUntil': None,
                'isGuest': True,
            }
            save_user(username, user_data)
            token = str(uuid.uuid4())
            add_token(token, username)

        logger.info(f'访客登录成功: {username}')
        resp = make_response(
            jsonify(
                {
                    'success': True,
                    'token': token,
                    'user': {
                        'username': username,
                        'score': 0,
                        'rank': calculate_rank(0),
                        'wins': 0,
                        'games': 0,
                        'isAdmin': False,
                        'isSuperAdmin': False,
                        'isGuest': True,
                    },
                }
            )
        )
        resp.set_cookie('token', token, max_age=30 * 24 * 3600, httponly=False, samesite='Lax', path='/')
        return resp
    except Exception as e:  # noqa: BLE001
        logger.error(f'访客登录错误: {e!s}')
        return jsonify({'error': '服务器内部错误'}), 500


@auth_bp.route('/api/current_user', methods=['GET'])
@require_auth
def current_user_route(user):
    """获取当前登录用户信息"""
    result = {
        'username': user['username'],
        'score': user.get('score', 0),
        'rank': calculate_rank(user.get('score', 0)),
        'wins': user.get('wins', 0),
        'games': user.get('games', 0),
        'joinDate': user.get('joinDate', ''),
        'lastLogin': user.get('lastLogin', ''),
        'isAdmin': user.get('isAdmin', False),
        'isSuperAdmin': user.get('isSuperAdmin', False),
        'bannedUntil': user.get('bannedUntil'),
    }
    if user.get('isAdmin'):
        result['permissions'] = get_admin_permissions(user)
    return jsonify(result)


@auth_bp.route('/api/login/password_free', methods=['POST'])
def login_password_free():
    """免密登录：检查用户是否开启了免密登录，验证剩余次数"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        username = data.get('username', '').strip()
        if not username:
            return jsonify({'error': '用户名不能为空'}), 400

        user = get_user(username)
        if not user:
            return jsonify({'error': '用户不存在'}), 404

        if not user.get('passwordFree'):
            return jsonify({'error': '该用户未开启免密登录'}), 403

        max_attempts = user.get('passwordFreeMaxAttempts', 0)
        remaining = user.get('passwordFreeRemainingAttempts', 0)

        if max_attempts > 0 and remaining <= 0:
            return jsonify({'error': '免密登录次数已用尽，请联系管理员'}), 403

        if user.get('bannedUntil'):
            banned_until = user['bannedUntil']
            if banned_until and time.time() < banned_until:
                return jsonify(
                    {'error': f'账号已被封禁至 {datetime.fromtimestamp(banned_until, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")}'}
                ), 403

        if max_attempts > 0:
            user['passwordFreeRemainingAttempts'] = remaining - 1

        user['lastLogin'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        save_user(username, user)

        token = str(uuid.uuid4())
        add_token(token, username)

        logger.info(f'免密登录成功: {username}')
        resp = make_response(
            jsonify(
                {
                    'success': True,
                    'token': token,
                    'user': {
                        'username': username,
                        'score': user.get('score', 0),
                        'rank': calculate_rank(user.get('score', 0)),
                        'wins': user.get('wins', 0),
                        'games': user.get('games', 0),
                        'isAdmin': user.get('isAdmin', False),
                        'isSuperAdmin': user.get('isSuperAdmin', False),
                    },
                }
            )
        )
        resp.set_cookie('token', token, max_age=30 * 24 * 3600, httponly=False, samesite='Lax', path='/')
        return resp
    except Exception as e:  # noqa: BLE001
        logger.error(f'免密登录错误: {e!s}')
        return jsonify({'error': '服务器内部错误'}), 500

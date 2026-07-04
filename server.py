import os
import json
import uuid
import time
import hashlib
import hmac
import threading
import configparser
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
import logging
import secrets
import traceback
import requests

# 获取脚本所在目录（绝对路径）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 定义静态文件目录
STATIC_DIR = os.path.join(SCRIPT_DIR, 'static')

# 确保静态目录存在（防止部署时遗漏）
os.makedirs(STATIC_DIR, exist_ok=True)

# 初始化Flask应用
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static')
app.secret_key = secrets.token_hex(32)

# 初始化配置解析器
cfg = configparser.ConfigParser()
# 读取同目录下的 config.ini
cfg.read(os.path.join(SCRIPT_DIR, "config.ini"), encoding="utf-8")

# 从配置文件读取极验参数（注册用）
GT4_CAPTCHA_ID = cfg.get("GEETEST", "captcha_id")
GT4_CAPTCHA_KEY = cfg.get("GEETEST", "captcha_key")
VERIFY_URL = cfg.get("GEETEST", "verify_url")

# 从配置文件读取登录专用极验参数
GT4_LOGIN_CAPTCHA_ID = cfg.get("GEETEST_LOGIN", "captcha_id")
GT4_LOGIN_CAPTCHA_KEY = cfg.get("GEETEST_LOGIN", "captcha_key")
LOGIN_VERIFY_URL = cfg.get("GEETEST_LOGIN", "verify_url")

# 从配置读取端口（兼容原有逻辑）
port = int(cfg.get("APP", "port"))

# 从配置文件读取 Cloudflare Turnstile 参数
TURNSTILE_SITE_KEY = cfg.get("TURNSTILE", "site_key")
TURNSTILE_SECRET_KEY = cfg.get("TURNSTILE", "secret_key")
TURNSTILE_VERIFY_URL = cfg.get("TURNSTILE", "verify_url")

def turnstile_verify(response_token):
    """Cloudflare Turnstile 服务端验证"""
    if not response_token:
        logger.warning('Turnstile token为空')
        return False, '验证码参数缺失'
    
    params = {
        "secret": TURNSTILE_SECRET_KEY,
        "response": response_token,
        "remoteip": request.remote_addr if request else None
    }
    
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    try:
        resp = requests.post(TURNSTILE_VERIFY_URL, data=params, headers=headers, timeout=10)
        logger.info(f"Turnstile请求状态码: {resp.status_code}, 原始返回: {repr(resp.text)}")
        
        if resp.status_code != 200:
            return False, f"接口请求异常，状态码：{resp.status_code}"
        
        data = resp.json()
        if data.get("success"):
            return True, "验证码验证通过"
        else:
            return False, f"验证失败：{data.get('error-codes', ['未知原因'])[0]}"
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Turnstile网络请求异常: {str(e)}")
        return False, "网络请求超时/连接失败"
    except Exception as e:
        logger.error(f"Turnstile校验全局异常: {str(e)}")
        return False, f"系统异常：{str(e)}"

def geetest_verify(lot_number, captcha_output, pass_token, gen_time, captcha_id=None, captcha_key=None, verify_url=None):
    """极验GT4 官方标准二次校验（修复签名+异常处理）"""
    # 使用传入的参数或默认值
    use_captcha_id = captcha_id if captcha_id else GT4_CAPTCHA_ID
    use_captcha_key = captcha_key if captcha_key else GT4_CAPTCHA_KEY
    use_verify_url = verify_url if verify_url else VERIFY_URL
    
    # 基础参数校验
    if not all([lot_number, captcha_output, pass_token, gen_time]):
        logger.warning('极验参数不完整')
        return False, '验证码参数缺失'

    # ========== 核心：生成官方要求的 sign_token ==========
    hmac_obj = hmac.new(
        use_captcha_key.encode("utf-8"),
        lot_number.encode("utf-8"),
        hashlib.sha256
    )
    sign_token = hmac_obj.hexdigest()
    # ====================================================

    # 组装完整请求参数（包含6个必填项）
    params = {
        "lot_number": lot_number,
        "captcha_output": captcha_output,
        "pass_token": pass_token,
        "gen_time": gen_time,
        "captcha_id": use_captcha_id,
        "sign_token": sign_token  # 动态生成签名，不再填空
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    try:
        resp = requests.post(use_verify_url, data=params, headers=headers, timeout=10)
        logger.info(f"极验请求状态码: {resp.status_code}, 原始返回: {repr(resp.text)}")

        # 精细化状态码判断
        if resp.status_code != 200:
            return False, f"接口请求异常，状态码：{resp.status_code}"

        resp_text = resp.text.strip()
        # 拦截空内容、非JSON内容（解决你核心报错）
        if not resp_text:
            return False, "极验接口返回空数据"
        if not resp_text.startswith("{"):
            return False, "接口返回非JSON（域名未授权/请求非法）"

        # 正常解析JSON
        data = resp.json()
        if data.get("result") == "success":
            return True, "验证码验证通过"
        else:
            # 返回极验原生错误原因，方便排查
            return False, f"验证失败：{data.get('reason', '未知原因')}"

    except requests.exceptions.RequestException as e:
        logger.error(f"极验网络请求异常: {str(e)}")
        return False, "网络请求超时/连接失败"
    except Exception as e:
        logger.error(f"极验校验全局异常: {str(e)}")
        return False, f"系统异常：{str(e)}"

@app.route('/api/captcha/verify', methods=['POST'])
def captcha_check():
    """极验四代验证码校验接口"""
    # GT4正确参数：lot_number, captcha_output, pass_token, gen_time
    lot_number = request.form.get("lot_number", "")
    captcha_output = request.form.get("captcha_output", "")
    pass_token = request.form.get("pass_token", "")
    gen_time = request.form.get("gen_time", "")
    
    if not (lot_number and captcha_output and pass_token):
        return jsonify({"code": 1, "msg": "验证码参数缺失"})
    
    success, message = geetest_verify(lot_number, captcha_output, pass_token, gen_time)
    if success:
        return jsonify({"code": 0, "msg": "验证通过"})
    else:
        return jsonify({"code": 1, "msg": message})

@app.route('/api/captcha/turnstile/verify', methods=['POST'])
def turnstile_check():
    """Cloudflare Turnstile 验证码校验接口"""
    response_token = request.form.get("response", "") or request.json.get("response", "")
    
    if not response_token:
        return jsonify({"code": 1, "msg": "验证码参数缺失"})
    
    success, message = turnstile_verify(response_token)
    if success:
        return jsonify({"code": 0, "msg": "验证通过"})
    else:
        return jsonify({"code": 1, "msg": message})

@app.route('/api/captcha/turnstile/sitekey', methods=['GET'])
def get_turnstile_sitekey():
    """获取 Turnstile Site Key"""
    return jsonify({"code": 0, "sitekey": TURNSTILE_SITE_KEY})

# 配置日志记录 - 只输出到控制台，不保存到文件
def setup_logging():
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    
    # 只添加控制台输出，不保存到文件
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)
    
    # 创建access logger用于访问日志（也只输出到控制台）
    access_logger = logging.getLogger('access')
    access_logger.setLevel(logging.INFO)
    access_logger.addHandler(stream_handler)
    access_logger.propagate = False
    
    return logging.getLogger('gomoku'), access_logger

logger, access_logger = setup_logging()

# 配置校验：确保极验参数不为空（日志初始化之后再做校验）
if not GT4_CAPTCHA_ID or not GT4_CAPTCHA_KEY:
    logger.critical("错误：请在 config.ini 中配置极验 captcha_id 和 captcha_key")
    raise SystemExit("缺少极验配置项")

# 连接管理配置
CONNECT_TIMEOUT = 600  # 10分钟连接超时（延长时间减少频繁断线）
HEARTBEAT_INTERVAL = 30  # 心跳间隔30秒
MAX_RECONNECT_ATTEMPTS = 3  # 最大重连尝试次数
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

USERS_FILE = os.path.join(DATA_DIR, 'users.json')
PASSWORD_FILE = os.path.join(DATA_DIR, 'password.json')
RECORDS_FILE = os.path.join(DATA_DIR, 'records.json')
SAVES_FILE = os.path.join(DATA_DIR, 'saves.json')
TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
MATCHES_FILE = os.path.join(DATA_DIR, 'matches.json')

file_locks = {
    USERS_FILE: threading.Lock(),
    PASSWORD_FILE: threading.Lock(),
    RECORDS_FILE: threading.Lock(),
    SAVES_FILE: threading.Lock(),
    TOKENS_FILE: threading.Lock(),
    SETTINGS_FILE: threading.Lock(),
    MATCHES_FILE: threading.Lock()
}

# 内存缓存
cache = {
    'tokens': {'data': None, 'timestamp': 0, 'ttl': 10},
    'user_info': {},
    'matches': {}
}

active_matches_lock = threading.Lock()

# 用户连接状态跟踪
user_connections = {}
user_connections_lock = threading.Lock()

def update_user_connection(username):
    """更新用户连接时间戳"""
    try:
        with user_connections_lock:
            user_connections[username] = {
                'lastHeartbeat': time.time(),
                'isOnline': True
            }
        logger.debug(f"User connection updated: {username}")
    except Exception as e:
        logger.error(f"Error updating user connection for {username}: {e}")

def get_user_connection(username):
    """获取用户连接状态"""
    try:
        with user_connections_lock:
            return user_connections.get(username)
    except Exception as e:
        logger.error(f"Error getting user connection for {username}: {e}")
        return None

def remove_user_connection(username):
    """移除用户连接状态"""
    try:
        with user_connections_lock:
            if username in user_connections:
                del user_connections[username]
                logger.info(f"User connection removed: {username}")
    except Exception as e:
        logger.error(f"Error removing user connection for {username}: {e}")

# 读取现有匹配信息
try:
    with open(MATCHES_FILE, 'r', encoding='utf-8') as f:
        content = f.read().strip()
        if content:
            active_matches = json.loads(content)
            for match_id, match in active_matches.items():
                if match['status'] == 'playing':
                    match['status'] = 'waiting_for_reconnect'
        else:
            active_matches = {}
except FileNotFoundError:
    active_matches = {}


def cleanup_expired_matches():
    """清理超过一定时间的过期匹配"""
    global active_matches
    expired_matches = []
    current_time = time.time()
    
    try:
        with active_matches_lock:
            for match_id, match in active_matches.items():
                try:
                    # 检查是否超过2小时无活动，或者状态为closed/finished且超过1小时
                    if 'startTime' in match and (current_time - match['startTime']) > 7200:
                        expired_matches.append(match_id)
                        logger.info(f"清理过期房间: {match_id}")
                    elif match.get('status') in ['closed', 'finished'] and 'startTime' in match and (current_time - match['startTime']) > 3600:
                        expired_matches.append(match_id)
                        logger.info(f"清理已结束房间: {match_id}")
                except Exception as e:
                    logger.error(f"Error checking match {match_id}: {e}")
            
            for match_id in expired_matches:
                try:
                    del active_matches[match_id]
                except Exception as e:
                    logger.error(f"Error deleting match {match_id}: {e}")
        
        if expired_matches:
            save_matches()
            logger.info(f"Cleaned up {len(expired_matches)} expired matches")
    except Exception as e:
        logger.error(f"Error in cleanup_expired_matches: {e}")

def cleanup_inactive_connections():
    """清理长时间未活动的连接"""
    current_time = time.time()
    inactive_users = []
    
    try:
        with user_connections_lock:
            for username, conn in list(user_connections.items()):
                try:
                    if current_time - conn['lastHeartbeat'] > CONNECT_TIMEOUT:
                        inactive_users.append(username)
                except Exception as e:
                    logger.error(f"Error checking connection for {username}: {e}")
            
            for username in inactive_users:
                try:
                    del user_connections[username]
                    logger.info(f"清理超时连接: {username}")
                except Exception as e:
                    logger.error(f"Error removing connection for {username}: {e}")
    except Exception as e:
        logger.error(f"Error in cleanup_inactive_connections: {e}")
    
    return inactive_users


def save_matches():
    try:
        with open(MATCHES_FILE, 'w', encoding='utf-8') as f:
            json.dump(active_matches, f, ensure_ascii=False, indent=2)
        logger.debug("Matches saved successfully")
    except Exception as e:
        logger.error(f"Error saving matches: {e}")
        # 尝试备份现有文件
        try:
            if os.path.exists(MATCHES_FILE):
                backup_file = MATCHES_FILE + '.bak'
                if os.path.exists(backup_file):
                    os.remove(backup_file)
                os.rename(MATCHES_FILE, backup_file)
                logger.info(f"Backup created at {backup_file}")
        except Exception as backup_error:
            logger.error(f"Failed to create backup: {backup_error}")


# 启动时清理过期匹配
cleanup_expired_matches()

def get_file_lock(file_path):
    """获取文件锁"""
    return file_locks.get(file_path, threading.Lock())

def load_json_with_lock(file_path, default=None):
    """带锁的JSON文件读取"""
    if default is None:
        default = {}
    
    lock = get_file_lock(file_path)
    with lock:
        if not os.path.exists(file_path):
            return default
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return default

def save_json_with_lock(file_path, data):
    """带锁的JSON文件保存"""
    lock = get_file_lock(file_path)
    with lock:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            # 清除相关缓存
            if file_path == USERS_FILE:
                cache['user_info'].clear()
            elif file_path == TOKENS_FILE:
                cache['tokens']['data'] = None
            return True
        except IOError:
            return False

def get_cached_data(cache_key, ttl=30):
    """获取缓存数据"""
    now = time.time()
    cache_item = cache.get(cache_key)
    
    if cache_item and now - cache_item['timestamp'] < cache_item['ttl']:
        return cache_item['data']
    return None

def set_cached_data(cache_key, data, ttl=30):
    """设置缓存数据"""
    cache[cache_key] = {
        'data': data,
        'timestamp': time.time(),
        'ttl': ttl
    }

def clear_cache(cache_key=None):
    """清除缓存"""
    if cache_key:
        if cache_key in cache:
            if isinstance(cache[cache_key], dict):
                cache[cache_key].clear()
            else:
                cache[cache_key] = None
    else:
        for key in cache:
            if isinstance(cache[key], dict):
                cache[key].clear()
            else:
                cache[key] = None

# 初始化内置管理员
def init_admin():
    users = load_json_with_lock(USERS_FILE)
    # 管理员已存在，直接跳过
    if 'admin' in users:
        logger.info("管理员账号已存在，跳过初始化")
        return
        
    # 生成随机管理员密码
    import random
    import string
    
    # 生成8位随机密码
    admin_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    
    # 保存明文密码到password.json
    password_data = load_json_with_lock(PASSWORD_FILE)
    password_data['admin'] = admin_password
    save_json_with_lock(PASSWORD_FILE, password_data)
    
    print(f"管理员账号: admin")
    print(f"管理员密码: {admin_password}")
    print(f"密码已保存至: {PASSWORD_FILE}")
    
    admin = {
        'admin': {
            'username': 'admin',
            'password': hashlib.sha256(admin_password.encode()).hexdigest(),
            'score': 1000,
            'wins': 0,
            'games': 0,
            'joinDate': datetime.now().strftime('%Y-%m-%d'),
            'lastLogin': '',
            'isAdmin': True,
            'isSuperAdmin': True,
            'bannedUntil': None
        }
    }
    users['admin'] = admin['admin']
    save_json_with_lock(USERS_FILE, users)

    logger.info('管理员账户初始化完成')

init_admin()

# 辅助函数
def load_json(file_path, default=None):
    """兼容旧代码的加载函数"""
    return load_json_with_lock(file_path, default)

def save_json(file_path, data):
    """兼容旧代码的保存函数"""
    return save_json_with_lock(file_path, data)

def get_user(username):
    """获取用户信息（带缓存优化）"""
    # 先检查缓存
    if username in cache['user_info']:
        cached_user = cache['user_info'][username]
        if time.time() - cached_user['timestamp'] < 30:  # 30秒缓存
            user_data = cached_user['data']
            # 检查缓存中的用户是否被封禁且已过期
            if user_data and user_data.get('bannedUntil') and time.time() >= user_data['bannedUntil']:
                user_data['bannedUntil'] = None
                save_user(username, user_data)
                # 更新缓存中的封禁状态
                cache['user_info'][username] = {
                    'data': user_data,
                    'timestamp': time.time()
                }
            return user_data
    
    # 从文件读取
    users = load_json_with_lock(USERS_FILE)
    user_data = users.get(username)
    
    # 检查用户是否被封禁且已过期
    if user_data and user_data.get('bannedUntil') and time.time() >= user_data['bannedUntil']:
        user_data['bannedUntil'] = None
        save_user(username, user_data)
    
    # 更新缓存
    if user_data:
        cache['user_info'][username] = {
            'data': user_data,
            'timestamp': time.time()
        }
    
    return user_data

def save_user(username, data):
    """保存用户信息（带缓存清除）"""
    users = load_json_with_lock(USERS_FILE)
    users[username] = data
    save_json_with_lock(USERS_FILE, users)
    
    # 清除该用户的缓存
    if username in cache['user_info']:
        del cache['user_info'][username]

def save_plain_password(username, password):
    """保存明文密码到password.json"""
    password_data = load_json_with_lock(PASSWORD_FILE)
    password_data[username] = password
    save_json_with_lock(PASSWORD_FILE, password_data)

def get_plain_password(username):
    """获取明文密码"""
    password_data = load_json_with_lock(PASSWORD_FILE)
    return password_data.get(username)

def is_local_admin_login():
    """检查是否为管理员本机登录"""
    remote_addr = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
    return remote_addr in ['127.0.0.1', 'localhost', '::1']

def get_current_user():
    """获取当前用户（带token缓存优化）"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return None
    
    # 检查token缓存
    cached_tokens = get_cached_data('tokens')
    if cached_tokens and token in cached_tokens:
        username = cached_tokens[token]
        return get_user(username)
    
    # 从文件读取
    tokens = load_json_with_lock(TOKENS_FILE)
    username = tokens.get(token)
    if not username:
        return None
    
    # 更新token缓存
    set_cached_data('tokens', tokens.copy(), ttl=10)
    
    return get_user(username)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': '未授权'}), 401
        # 检查封禁状态
        if user.get('bannedUntil'):
            banned_until = user['bannedUntil']
            if banned_until and time.time() < banned_until:
                return jsonify({'error': f'账号已被封禁至 {datetime.fromtimestamp(banned_until).strftime("%Y-%m-%d %H:%M:%S")}'}), 403
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

# 路由
@app.route('/')
def index():
    return send_from_directory(SCRIPT_DIR, 'gomoku.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    captcha_token = data.get('captchaToken', '')
    
    # 验证极验验证码（双重验证第二层）
    if not captcha_token or len(captcha_token) < 5:
        logger.info(f"极验验证码token为空或过短: {captcha_token}")
        return jsonify({'error': '请先完成验证码验证'}), 400
    
    # 尝试调用极验API进行二次验证
    # GT4 token格式: JSON数组 [lot_number, captcha_output, pass_token, gen_time]
    try:
        parts = json.loads(captcha_token)
        if not isinstance(parts, list) or len(parts) != 4:
            raise ValueError("Token must be a list of 4 elements")
        lot_number, captcha_output, pass_token, gen_time = parts
    except Exception as e:
        logger.info(f"验证码token格式错误: {e}, token: {captcha_token}")
        return jsonify({'error': '验证码数据格式错误'}), 400
    
    # 调用极验API进行二次验证
    success, msg = geetest_verify(lot_number, captcha_output, pass_token, gen_time)
    if not success:
        logger.warning(f"极验验证失败: {msg}")
        return jsonify({'error': f'验证码验证失败: {msg}'}), 400

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码至少6个字符'}), 400
        
    users = load_json_with_lock(USERS_FILE)
    if username in users:
        return jsonify({'error': '用户名已存在'}), 400
        
    new_user = {
        'username': username,
        'password': hashlib.sha256(password.encode()).hexdigest(),
        'score': 1000,
        'wins': 0,
        'games': 0,
        'joinDate': datetime.now().strftime('%Y-%m-%d'),
        'lastLogin': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'isAdmin': False,
        'isSuperAdmin': False,
        'bannedUntil': None,
        'useCaptcha': True,
        'passwordFree': False
    }
    users[username] = new_user
    save_json_with_lock(USERS_FILE, users)
    
    # 保存明文密码
    save_plain_password(username, password)
    
    # 初始化记录和存档
    records = load_json_with_lock(RECORDS_FILE)
    records[username] = []
    save_json_with_lock(RECORDS_FILE, records)
    
    saves = load_json_with_lock(SAVES_FILE)
    saves[username] = []
    save_json_with_lock(SAVES_FILE, saves)
    
    return jsonify({'success': True, 'user': {k: v for k, v in new_user.items() if k != 'password'}})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    captcha_token = data.get('captchaToken', '')
    
    user = get_user(username)
    if not user:
        return jsonify({'error': '用户名或密码错误'}), 401
    
    # 检查是否是免登录用户（仅需用户名，无需密码和验证码）
    password_free = user.get('passwordFree', False)
    
    # 验证极验验证码（除非用户被禁用验证码或是免登录用户）
    if not password_free:
        skip_captcha = not user.get('useCaptcha', True)
        if not skip_captcha:
            if not captcha_token or len(captcha_token) < 5:
                logger.info(f"极验验证码token为空或过短: {captcha_token}")
                return jsonify({'error': '请先完成验证码验证'}), 400
            
            # 尝试调用极验API进行二次验证
            # GT4 token格式: JSON数组 [lot_number, captcha_output, pass_token, gen_time]
            try:
                parts = json.loads(captcha_token)
                if not isinstance(parts, list) or len(parts) != 4:
                    raise ValueError("Token must be a list of 4 elements")
                lot_number, captcha_output, pass_token, gen_time = parts
            except Exception as e:
                logger.info(f"验证码token格式错误: {e}, token: {captcha_token}")
                return jsonify({'error': '验证码数据格式错误'}), 400
            
            # 调用极验API进行二次验证（使用登录专用配置）
            success, msg = geetest_verify(lot_number, captcha_output, pass_token, gen_time, 
                                           GT4_LOGIN_CAPTCHA_ID, GT4_LOGIN_CAPTCHA_KEY, LOGIN_VERIFY_URL)
            if not success:
                logger.warning(f"极验验证失败: {msg}")
                return jsonify({'error': f'验证码验证失败: {msg}'}), 400
        
        # 验证密码（除非是免登录用户）
        if hashlib.sha256(password.encode()).hexdigest() != user['password']:
            return jsonify({'error': '用户名或密码错误'}), 401
        
    # 检查封禁
    if user.get('bannedUntil'):
        if time.time() < user['bannedUntil']:
            remain = int(user['bannedUntil'] - time.time())
            return jsonify({'error': f'账号已被封禁，剩余 {remain // 60} 分钟'}), 403
        else:
            user['bannedUntil'] = None
            save_user(username, user)
    
    # 更新最后登录
    user['lastLogin'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    save_user(username, user)
    
    # 生成token
    token = str(uuid.uuid4())
    tokens = load_json_with_lock(TOKENS_FILE)
    tokens[token] = username
    save_json_with_lock(TOKENS_FILE, tokens)
    
    # 清除token缓存
    cache['tokens']['data'] = None
    
    # 更新用户连接状态
    update_user_connection(username)
    logger.info(f"用户登录: {username}")
    
    return jsonify({
        'success': True,
        'token': token,
        'user': {k: v for k, v in user.items() if k != 'password'}
    })

@app.route('/api/login/password_free', methods=['POST'])
def password_free_login():
    """免密登录（仅限已授权用户，支持次数限制）"""
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({'error': '用户名不能为空'}), 400
    
    user = get_user(username)
    if not user:
        return jsonify({'error': '用户不存在'}), 401
    
    # 检查是否是免密登录用户
    if not user.get('passwordFree', False):
        return jsonify({'error': '该用户未启用免密登录'}), 403
    
    # 检查免密登录剩余次数
    max_attempts = user.get('passwordFreeMaxAttempts', 0)
    remaining_attempts = user.get('passwordFreeRemainingAttempts', 0)
    if max_attempts > 0:
        if remaining_attempts <= 0:
            return jsonify({'error': '免密登录次数已用尽，请联系管理员'}), 403
        # 扣减剩余次数
        user['passwordFreeRemainingAttempts'] = remaining_attempts - 1
        save_user(username, user)
    
    # 检查封禁
    if user.get('bannedUntil'):
        if time.time() < user['bannedUntil']:
            remain = int(user['bannedUntil'] - time.time())
            return jsonify({'error': f'账号已被封禁，剩余 {remain // 60} 分钟'}), 403
        else:
            user['bannedUntil'] = None
            save_user(username, user)
    
    # 更新最后登录
    user['lastLogin'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    save_user(username, user)
    
    # 生成token
    token = str(uuid.uuid4())
    tokens = load_json_with_lock(TOKENS_FILE)
    tokens[token] = username
    save_json_with_lock(TOKENS_FILE, tokens)
    
    # 清除token缓存
    cache['tokens']['data'] = None
    
    # 更新用户连接状态
    update_user_connection(username)
    logger.info(f"用户免密登录: {username}")
    
    return jsonify({
        'success': True,
        'token': token,
        'user': {k: v for k, v in user.items() if k != 'password'}
    })

@app.route('/api/user/password_free_info', methods=['POST'])
def get_password_free_info():
    """获取用户的免密登录信息（剩余次数等）"""
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({'error': '用户名不能为空'}), 400
    
    user = get_user(username)
    if not user:
        return jsonify({'passwordFree': False, 'maxAttempts': 0, 'remainingAttempts': 0})
    
    return jsonify({
        'passwordFree': user.get('passwordFree', False),
        'maxAttempts': user.get('passwordFreeMaxAttempts', 0),
        'remainingAttempts': user.get('passwordFreeRemainingAttempts', 0)
    })


@app.route('/api/change_password', methods=['POST'])
@require_auth
def change_password(user):
    """用户修改自己的密码"""
    data = request.json
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    
    if not old_password or not new_password:
        return jsonify({'error': '原密码和新密码不能为空'}), 400
    
    if len(new_password) < 6:
        return jsonify({'error': '新密码至少6个字符'}), 400
    
    # 验证原密码
    if hashlib.sha256(old_password.encode()).hexdigest() != user['password']:
        return jsonify({'error': '原密码错误'}), 401
    
    # 更新密码
    username = user['username']
    users = load_json_with_lock(USERS_FILE)
    users[username]['password'] = hashlib.sha256(new_password.encode()).hexdigest()
    save_json_with_lock(USERS_FILE, users)
    
    # 更新明文密码文件
    save_plain_password(username, new_password)
    
    # 清除用户缓存
    if username in cache['user_info']:
        del cache['user_info'][username]
    
    return jsonify({'success': True, 'message': '密码修改成功'})

@app.route('/api/admin/change_password', methods=['POST'])
@require_admin
def admin_change_password(admin_user):
    """管理员修改任意用户密码"""
    data = request.json
    target_username = data.get('username', '').strip()
    new_password = data.get('new_password', '')
    
    if not target_username or not new_password:
        return jsonify({'error': '用户名和新密码不能为空'}), 400
    
    if len(new_password) < 6:
        return jsonify({'error': '新密码至少6个字符'}), 400
    
    users = load_json_with_lock(USERS_FILE)
    if target_username not in users:
        return jsonify({'error': '用户不存在'}), 404
    
    # 权限检查 - 从数据库重新获取当前用户权限
    target_user = users[target_username]
    current_user_data = users.get(admin_user.get('username'))
    
    # 立即检查当前管理员是否有管理权限
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    # 超级管理员：可以修改任何用户密码，包括其他超级管理员
    if current_user_data and current_user_data.get('isSuperAdmin'):
        pass  # 允许操作
    # 普通管理员：只能修改普通用户和普通管理员的密码，不能修改超级管理员
    elif target_user.get('isSuperAdmin'):
        return jsonify({'error': '没有权限修改超级管理员的密码'}), 403
    # 普通管理员：如果目标也是管理员，检查canManage权限
    elif target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
        if not current_user_data or not current_user_data.get('canManage', True):
            return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    # 更新密码
    users[target_username]['password'] = hashlib.sha256(new_password.encode()).hexdigest()
    save_json_with_lock(USERS_FILE, users)
    
    # 更新明文密码文件
    save_plain_password(target_username, new_password)
    
    # 清除用户缓存
    if target_username in cache['user_info']:
        del cache['user_info'][target_username]
    
    return jsonify({'success': True, 'message': f'用户 {target_username} 密码修改成功'})

@app.route('/api/admin/create_admin', methods=['POST'])
@require_super_admin
def create_admin_account(super_admin):
    """创建普通管理员账号"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码至少6个字符'}), 400
        
    users = load_json_with_lock(USERS_FILE)
    if username in users:
        return jsonify({'error': '用户名已存在'}), 400
    
    if username == 'admin':
        return jsonify({'error': '不能创建内置管理员账号'}), 400
    
    # 创建普通管理员账号
    new_admin = {
        'username': username,
        'password': hashlib.sha256(password.encode()).hexdigest(),
        'score': 1000,
        'wins': 0,
        'games': 0,
        'joinDate': datetime.now().strftime('%Y-%m-%d'),
        'lastLogin': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'isAdmin': True,
        'isSuperAdmin': False,
        'canManage': True,  # 默认允许管理
        'bannedUntil': None,
        'created_by': super_admin['username']
    }
    users[username] = new_admin
    save_json_with_lock(USERS_FILE, users)
    
    # 保存明文密码
    save_plain_password(username, password)
    
    # 初始化记录和存档
    records = load_json_with_lock(RECORDS_FILE)
    records[username] = []
    save_json_with_lock(RECORDS_FILE, records)
    
    saves = load_json_with_lock(SAVES_FILE)
    saves[username] = []
    save_json_with_lock(SAVES_FILE, saves)
    
    return jsonify({'success': True, 'message': f'普通管理员账号 {username} 创建成功', 'user': {k: v for k, v in new_admin.items() if k != 'password'}})

@app.route('/api/logout', methods=['POST'])
@require_auth
def logout(user):
    """用户登出（清除缓存）"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    tokens = load_json_with_lock(TOKENS_FILE)
    if token in tokens:
        del tokens[token]
        save_json_with_lock(TOKENS_FILE, tokens)
        
        # 清除token缓存
        cache['tokens']['data'] = None
    
    return jsonify({'success': True})

@app.route('/api/user', methods=['GET'])
@require_auth
def get_user_info(user):
    """获取用户信息（优化接口）"""
    # 更新连接状态
    update_user_connection(user['username'])
    # 返回用户信息，排除密码字段
    user_info = {k: v for k, v in user.items() if k != 'password'}
    return jsonify(user_info)

@app.route('/api/heartbeat', methods=['POST'])
@require_auth
def heartbeat(user):
    """心跳检测接口"""
    try:
        username = user['username']
        update_user_connection(username)
        
        # 检查用户是否在某个房间中
        match_info = None
        try:
            with active_matches_lock:
                for match_id, match in active_matches.items():
                    if match['creator'] == username or match.get('opponent') == username:
                        match_info = {
                            'matchId': match_id,
                            'status': match['status'],
                            'opponent': match.get('opponent') if match['creator'] == username else match['creator']
                        }
                        break
        except Exception as e:
            logger.error(f"Error checking match for user {username} in heartbeat: {e}")
        
        return jsonify({
            'success': True,
            'timestamp': int(time.time()),
            'match': match_info
        })
    except Exception as e:
        logger.error(f"Heartbeat error for user {user.get('username', 'unknown')}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/user/update', methods=['POST'])
@require_auth
def update_user(user):
    """更新用户信息"""
    data = request.json
    username = user['username']
    
    if 'score' in data:
        user['score'] = data['score']
    if 'wins' in data:
        user['wins'] = data['wins']
    if 'games' in data:
        user['games'] = data['games']
    
    save_user(username, user)
    
    return jsonify({'success': True})

@app.route('/api/records', methods=['GET'])
@require_auth
def get_records(user):
    records = load_json_with_lock(RECORDS_FILE)
    return jsonify(records.get(user['username'], []))

@app.route('/api/records', methods=['POST'])
@require_auth
def add_record(user):
    record = request.json
    records = load_json_with_lock(RECORDS_FILE)
    if user['username'] not in records:
        records[user['username']] = []
    records[user['username']].append(record)
    save_json_with_lock(RECORDS_FILE, records)
    return jsonify({'success': True})

@app.route('/api/statistics', methods=['GET'])
@require_auth
def get_statistics(user):
    records = load_json_with_lock(RECORDS_FILE)
    user_records = records.get(user['username'], [])
    username = user['username']
    users = load_json_with_lock(USERS_FILE)
    user_info = users.get(username, {})

    total = len(user_records)
    wins = sum(1 for r in user_records if r.get('result') in ('win', '胜利'))
    losses = sum(1 for r in user_records if r.get('result') in ('lose', '失败'))
    draws = sum(1 for r in user_records if r.get('result') == 'draw' or r.get('result') == '平局')
    win_rate = round(wins / total * 100, 1) if total > 0 else 0

    mode_distribution = {}
    for r in user_records:
        mode = r.get('mode', 'unknown')
        mode_distribution[mode] = mode_distribution.get(mode, 0) + 1

    score = user_info.get('score', 0)

    return jsonify({
        'total': total,
        'wins': wins,
        'losses': losses,
        'draws': draws,
        'winRate': win_rate,
        'score': score,
        'modeDistribution': mode_distribution,
        'records': user_records
    })

@app.route('/api/saves', methods=['GET'])
@require_auth
def get_saves(user):
    saves = load_json_with_lock(SAVES_FILE)
    return jsonify(saves.get(user['username'], []))

@app.route('/api/saves', methods=['POST'])
@require_auth
def add_save(user):
    save_data = request.json
    saves = load_json_with_lock(SAVES_FILE)
    if user['username'] not in saves:
        saves[user['username']] = []
    saves[user['username']].append(save_data)
    save_json_with_lock(SAVES_FILE, saves)
    return jsonify({'success': True})

@app.route('/api/saves/<save_id>', methods=['DELETE'])
@require_auth
def delete_save(user, save_id):
    saves = load_json_with_lock(SAVES_FILE)
    if user['username'] in saves:
        saves[user['username']] = [s for s in saves[user['username']] if s.get('id') != save_id]
        save_json_with_lock(SAVES_FILE, saves)
    return jsonify({'success': True})

@app.route('/api/admin/all_records', methods=['GET'])
@require_super_admin
def admin_get_all_records(super_admin):
    """超级管理员获取所有用户的游戏记录"""
    records = load_json_with_lock(RECORDS_FILE)
    return jsonify(records)

@app.route('/api/admin/users', methods=['GET'])
@require_admin
def admin_get_users(admin_user):
    """管理员获取所有用户信息"""
    users = load_json_with_lock(USERS_FILE)
    tokens = load_json_with_lock(TOKENS_FILE)
    online_usernames = set(tokens.values())
    is_super = admin_user.get('isSuperAdmin', False)
    
    user_list = []
    for username, user_data in users.items():
        # 检查是否在线
        is_online = username in online_usernames
        # 检查封禁状态和剩余时间
        banned_until = user_data.get('bannedUntil')
        is_banned = banned_until and banned_until > time.time()
        remaining_minutes = round((banned_until - time.time()) / 60) if is_banned else None
        
        # 普通管理员不能查看超级管理员的信息
        if user_data.get('isSuperAdmin') and not is_super:
            user_info = {
                'username': user_data['username'],
                'score': 0,
                'wins': 0,
                'games': 0,
                'joinDate': '',
                'lastLogin': '',
                'isAdmin': True,
                'isSuperAdmin': True,
                'canManage': True,
                'bannedUntil': None,
                'isOnline': False,
                'isBanned': False,
                'remainingMinutes': None,
                'useCaptcha': True,
                'passwordFree': False,
                'passwordFreeMaxAttempts': 0,
                'passwordFreeRemainingAttempts': 0
            }
        else:
            user_info = {
                'username': user_data['username'],
                'score': user_data.get('score', 0),
                'wins': user_data.get('wins', 0),
                'games': user_data.get('games', 0),
                'joinDate': user_data.get('joinDate', ''),
                'lastLogin': user_data.get('lastLogin', ''),
                'isAdmin': user_data.get('isAdmin', False),
                'isSuperAdmin': user_data.get('isSuperAdmin', False),
                'canManage': user_data.get('canManage', True),
                'bannedUntil': banned_until,
                'isOnline': is_online,
                'isBanned': is_banned,
                'remainingMinutes': remaining_minutes,
                'useCaptcha': user_data.get('useCaptcha', True),
                'passwordFree': user_data.get('passwordFree', False),
                'passwordFreeMaxAttempts': user_data.get('passwordFreeMaxAttempts', 0),
                'passwordFreeRemainingAttempts': user_data.get('passwordFreeRemainingAttempts', 0)
            }
        user_list.append(user_info)
    
    return jsonify(user_list)

@app.route('/api/admin/kick', methods=['POST'])
@require_admin
def admin_kick(admin_user):
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    data = request.json
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    username = data.get('username')
    if not username:
        return jsonify({'error': '缺少用户名'}), 400
    
    # 检查目标用户权限
    target_user = get_user(username)
    if target_user:
        # 超级管理员：不能被任何操作
        if target_user.get('isSuperAdmin'):
            return jsonify({'error': '不能对超级管理员执行此操作'}), 403
        # 普通管理员：检查canManage权限
        if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
            if not current_user_data or not current_user_data.get('canManage', True):
                return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    # 删除该用户的所有token
    tokens = load_json_with_lock(TOKENS_FILE)
    to_delete = [t for t, u in tokens.items() if u == username]
    for t in to_delete:
        del tokens[t]
    save_json_with_lock(TOKENS_FILE, tokens)
    
    # 清除token缓存
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'message': f'已强制登出用户 {username}'})

@app.route('/api/admin/user/<username>', methods=['DELETE'])
@require_admin
def admin_delete_user(admin_user, username):
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    # 立即检查当前管理员是否有管理权限
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    # 检查目标用户权限
    target_user = get_user(username)
    if target_user:
        # 超级管理员：不能被删除
        if target_user.get('isSuperAdmin'):
            return jsonify({'error': '不能删除超级管理员'}), 403
        # 普通管理员：检查权限
        if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
            if not current_user_data or not current_user_data.get('canManage', True):
                return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    if username == 'admin':
        return jsonify({'error': '不能删除内置管理员'}), 400
    
    users = load_json_with_lock(USERS_FILE)
    if username not in users:
        return jsonify({'error': '用户不存在'}), 404
    
    del users[username]
    save_json_with_lock(USERS_FILE, users)
    
    # 清理相关数据
    records = load_json_with_lock(RECORDS_FILE)
    if username in records:
        del records[username]
        save_json_with_lock(RECORDS_FILE, records)
    
    saves = load_json_with_lock(SAVES_FILE)
    if username in saves:
        del saves[username]
        save_json_with_lock(SAVES_FILE, saves)
    
    tokens = load_json_with_lock(TOKENS_FILE)
    to_delete = [t for t, u in tokens.items() if u == username]
    for t in to_delete:
        del tokens[t]
    save_json_with_lock(TOKENS_FILE, tokens)
    
    # 清除缓存
    if username in cache['user_info']:
        del cache['user_info'][username]
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'message': f'已注销用户 {username}'})

@app.route('/api/admin/ban', methods=['POST'])
@require_admin
def admin_ban(admin_user):
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    data = request.json
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    username = data.get('username')
    minutes = data.get('minutes', 0)
    if not username or minutes <= 0:
        return jsonify({'error': '参数错误'}), 400
    
    # 检查目标用户权限
    target_user = get_user(username)
    if target_user:
        # 超级管理员：不能被封禁也不登出
        if target_user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403
        
    user = get_user(username)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
        
    banned_until = time.time() + minutes * 60
    user['bannedUntil'] = banned_until
    
    # 清除该用户的缓存，确保立即生效
    if username in cache['user_info']:
        del cache['user_info'][username]
    
    save_user(username, user)
    
    # 强制登出
    tokens = load_json_with_lock(TOKENS_FILE)
    to_delete = [t for t, u in tokens.items() if u == username]
    for t in to_delete:
        del tokens[t]
    save_json_with_lock(TOKENS_FILE, tokens)
    
    # 清除缓存
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'message': f'已封禁用户 {username} {minutes} 分钟'})

@app.route('/api/admin/unban', methods=['POST'])
@require_admin
def admin_unban(admin_user):
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    # 立即检查当前管理员是否有管理权限
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    data = request.json
    username = data.get('username')
    if not username:
        return jsonify({'error': '缺少用户名'}), 400
    
    # 检查目标用户权限
    target_user = get_user(username)
    if target_user:
        # 超级管理员：不需要解封
        if target_user.get('isSuperAdmin'):
            return jsonify({'error': '超级管理员不需要解封'}), 400
        # 普通管理员：检查权限
        if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
            if not current_user_data or not current_user_data.get('canManage', True):
                return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    user = get_user(username)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    user['bannedUntil'] = None
    
    # 清除该用户的缓存，确保立即生效
    if username in cache['user_info']:
        del cache['user_info'][username]
    
    save_user(username, user)
    return jsonify({'success': True, 'message': f'已解除封禁 {username}'})

@app.route('/api/admin/batch_ban', methods=['POST'])
@require_admin
def admin_batch_ban(admin_user):
    """批量封禁用户"""
    data = request.json
    usernames = data.get('usernames', [])
    minutes = data.get('minutes', 0)
    
    if not usernames or minutes <= 0:
        return jsonify({'error': '参数错误'}), 400
    
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    success = []
    failed = []
    
    for username in usernames:
        # 检查目标用户权限
        target_user = get_user(username)
        if target_user:
            if target_user.get('isSuperAdmin'):
                failed.append(f'{username}: 不能封禁超级管理员')
                continue
            if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
                if not current_user_data or not current_user_data.get('canManage', True):
                    failed.append(f'{username}: 您的管理权限已被禁用')
                    continue
        
        if username == 'admin':
            failed.append(f'{username}: 不能封禁管理员')
            continue
            
        user = get_user(username)
        if not user:
            failed.append(f'{username}: 用户不存在')
            continue
            
        banned_until = time.time() + minutes * 60
        user['bannedUntil'] = banned_until
        save_user(username, user)
        
        # 强制登出
        tokens = load_json_with_lock(TOKENS_FILE)
        to_delete = [t for t, u in tokens.items() if u == username]
        for t in to_delete:
            del tokens[t]
        save_json_with_lock(TOKENS_FILE, tokens)
        
        success.append(username)
    
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'success_count': len(success), 'failed_count': len(failed), 'success': success, 'failed': failed})

@app.route('/api/admin/batch_unban', methods=['POST'])
@require_admin
def admin_batch_unban(admin_user):
    """批量解封用户"""
    data = request.json
    usernames = data.get('usernames', [])
    
    if not usernames:
        return jsonify({'error': '缺少用户名列表'}), 400
    
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    success = []
    failed = []
    
    for username in usernames:
        target_user = get_user(username)
        if target_user:
            if target_user.get('isSuperAdmin'):
                failed.append(f'{username}: 超级管理员不需要解封')
                continue
            if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
                if not current_user_data or not current_user_data.get('canManage', True):
                    failed.append(f'{username}: 您的管理权限已被禁用')
                    continue
        
        user = get_user(username)
        if not user:
            failed.append(f'{username}: 用户不存在')
            continue
        user['bannedUntil'] = None
        save_user(username, user)
        success.append(username)
    
    return jsonify({'success': True, 'success_count': len(success), 'failed_count': len(failed), 'success': success, 'failed': failed})

@app.route('/api/admin/set_captcha', methods=['POST'])
@require_admin
def admin_set_captcha(admin_user):
    """设置用户是否需要使用验证码"""
    data = request.json
    username = data.get('username')
    use_captcha = data.get('useCaptcha', True)
    
    if not username:
        return jsonify({'error': '缺少用户名'}), 400
    
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    if current_user_data and not current_user_data.get('canManage', True):
        return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    target_user = get_user(username)
    if not target_user:
        return jsonify({'error': '用户不存在'}), 404
    
    # 不能修改超级管理员的设置
    if target_user.get('isSuperAdmin'):
        return jsonify({'error': '不能修改超级管理员的设置'}), 403
    
    target_user['useCaptcha'] = use_captcha
    save_user(username, target_user)
    
    action = '启用' if use_captcha else '禁用'
    return jsonify({'success': True, 'message': f'{action}了用户 {username} 的验证码'})

@app.route('/api/admin/set_password_free', methods=['POST'])
@require_super_admin
def admin_set_password_free(admin_user):
    """设置用户是否启用免密登录（仅限超级管理员，支持次数限制）"""
    data = request.json
    username = data.get('username')
    password_free = data.get('passwordFree', False)
    max_attempts = data.get('maxAttempts', 0)  # 0 表示无限制
    
    if not username:
        return jsonify({'error': '缺少用户名'}), 400
    
    target_user = get_user(username)
    if not target_user:
        return jsonify({'error': '用户不存在'}), 404
    
    # 不能修改超级管理员的设置
    if target_user.get('isSuperAdmin'):
        return jsonify({'error': '不能修改超级管理员的设置'}), 403
    
    # 验证 max_attempts 必须是 >= 0 的整数
    try:
        max_attempts = int(max_attempts)
        if max_attempts < 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'error': '免密登录次数必须为非负整数'}), 400
    
    target_user['passwordFree'] = password_free
    
    if password_free:
        # 启用免密登录时设置次数限制
        target_user['passwordFreeMaxAttempts'] = max_attempts
        # 如果重新设置次数，重置剩余次数
        target_user['passwordFreeRemainingAttempts'] = max_attempts
    else:
        # 禁用时清除次数相关字段
        target_user.pop('passwordFreeMaxAttempts', None)
        target_user.pop('passwordFreeRemainingAttempts', None)
    
    save_user(username, target_user)
    
    if password_free and max_attempts > 0:
        action = f'启用（最多免密登录 {max_attempts} 次）'
    elif password_free:
        action = '启用（无次数限制）'
    else:
        action = '禁用'
    return jsonify({'success': True, 'message': f'{action}了用户 {username} 的免密登录'})

@app.route('/api/admin/batch_kick', methods=['POST'])
@require_admin
def admin_batch_kick(admin_user):
    """批量强制登出用户"""
    data = request.json
    usernames = data.get('usernames', [])
    
    if not usernames:
        return jsonify({'error': '缺少用户名列表'}), 400
    
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    success = []
    failed = []
    
    for username in usernames:
        target_user = get_user(username)
        if target_user:
            if target_user.get('isSuperAdmin'):
                failed.append(f'{username}: 不能对超级管理员执行此操作')
                continue
            if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
                if not current_user_data or not current_user_data.get('canManage', True):
                    failed.append(f'{username}: 您的管理权限已被禁用')
                    continue
        
        tokens = load_json_with_lock(TOKENS_FILE)
        to_delete = [t for t, u in tokens.items() if u == username]
        for t in to_delete:
            del tokens[t]
        save_json_with_lock(TOKENS_FILE, tokens)
        success.append(username)
    
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'success_count': len(success), 'failed_count': len(failed), 'success': success, 'failed': failed})

@app.route('/api/admin/batch_delete', methods=['POST'])
@require_admin
def admin_batch_delete(admin_user):
    """批量删除用户"""
    data = request.json
    usernames = data.get('usernames', [])
    
    if not usernames:
        return jsonify({'error': '缺少用户名列表'}), 400
    
    # 从数据库重新获取当前用户权限
    users = load_json_with_lock(USERS_FILE)
    current_user_data = users.get(admin_user.get('username'))
    
    success = []
    failed = []
    
    for username in usernames:
        target_user = get_user(username)
        if target_user:
            if target_user.get('isSuperAdmin'):
                failed.append(f'{username}: 不能删除超级管理员')
                continue
            if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
                if not current_user_data or not current_user_data.get('canManage', True):
                    failed.append(f'{username}: 您的管理权限已被禁用')
                    continue
        
        if username == 'admin':
            failed.append(f'{username}: 不能删除内置管理员')
            continue
        
        users = load_json_with_lock(USERS_FILE)
        if username not in users:
            failed.append(f'{username}: 用户不存在')
            continue
        
        del users[username]
        save_json_with_lock(USERS_FILE, users)
        
        # 清理相关数据
        records = load_json_with_lock(RECORDS_FILE)
        if username in records:
            del records[username]
            save_json_with_lock(RECORDS_FILE, records)
        
        saves = load_json_with_lock(SAVES_FILE)
        if username in saves:
            del saves[username]
            save_json_with_lock(SAVES_FILE, saves)
        
        tokens = load_json_with_lock(TOKENS_FILE)
        to_delete = [t for t, u in tokens.items() if u == username]
        for t in to_delete:
            del tokens[t]
        save_json_with_lock(TOKENS_FILE, tokens)
        
        if username in cache['user_info']:
            del cache['user_info'][username]
        
        success.append(username)
    
    cache['tokens']['data'] = None
    
    return jsonify({'success': True, 'success_count': len(success), 'failed_count': len(failed), 'success': success, 'failed': failed})

@app.route('/api/admin/set_permission', methods=['POST'])
@require_super_admin
def set_admin_permission(super_admin):
    """超级管理员设置普通管理员的管理权限"""
    data = request.json
    target_username = data.get('username', '').strip()
    can_manage = data.get('canManage', True)
    
    if not target_username:
        return jsonify({'error': '用户名不能为空'}), 400
    
    users = load_json_with_lock(USERS_FILE)
    if target_username not in users:
        return jsonify({'error': '用户不存在'}), 404
    
    target_user = users[target_username]
    
    # 只能是普通管理员，不能修改超级管理员
    if target_user.get('isSuperAdmin'):
        return jsonify({'error': '不能修改超级管理员的权限'}), 400
    
    if not target_user.get('isAdmin'):
        return jsonify({'error': '目标用户不是管理员'}), 400
    
    # 设置权限
    users[target_username]['canManage'] = can_manage
    save_json_with_lock(USERS_FILE, users)
    
    # 清除缓存
    if target_username in cache['user_info']:
        del cache['user_info'][target_username]
    
    status = '开启' if can_manage else '禁用'
    return jsonify({'success': True, 'message': f'已{status}管理员 {target_username} 的管理权限'})

@app.route('/api/admin/list_admins', methods=['GET'])
@require_super_admin
def list_admins(super_admin):
    """获取所有管理员账号列表"""
    users = load_json_with_lock(USERS_FILE)
    
    admins = []
    for username, user_data in users.items():
        if user_data.get('isAdmin'):
            admin_info = {
                'username': user_data['username'],
                'score': user_data.get('score', 0),
                'wins': user_data.get('wins', 0),
                'games': user_data.get('games', 0),
                'joinDate': user_data.get('joinDate', ''),
                'lastLogin': user_data.get('lastLogin', ''),
                'isAdmin': user_data.get('isAdmin', False),
                'isSuperAdmin': user_data.get('isSuperAdmin', False),
                'canManage': user_data.get('canManage', True),
                'bannedUntil': user_data.get('bannedUntil'),
                'created_by': user_data.get('created_by', '')
            }
            admins.append(admin_info)
    
    return jsonify({'admins': admins})

@app.route('/api/admin/update_score', methods=['POST'])
@require_super_admin
def admin_update_score(super_admin):
    """超级管理员修改用户积分"""
    data = request.json
    target_username = data.get('username', '').strip()
    new_score = data.get('score')

    if not target_username:
        return jsonify({'error': '用户名不能为空'}), 400

    if new_score is None or not isinstance(new_score, (int, float)) or new_score < 0:
        return jsonify({'error': '积分必须为非负数字'}), 400

    new_score = int(new_score)
    users = load_json_with_lock(USERS_FILE)
    if target_username not in users:
        return jsonify({'error': '用户不存在'}), 404

    users[target_username]['score'] = new_score
    save_json_with_lock(USERS_FILE, users)

    if target_username in cache['user_info']:
        del cache['user_info'][target_username]

    return jsonify({'success': True, 'message': f'已修改用户 {target_username} 的积分为 {new_score}'})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """获取积分排行榜（公开接口）"""
    users = load_json_with_lock(USERS_FILE)

    leaderboard = []
    for username, user_data in users.items():
        leaderboard.append({
            'username': username,
            'score': user_data.get('score', 0),
            'wins': user_data.get('wins', 0),
            'games': user_data.get('games', 0),
            'joinDate': user_data.get('joinDate', '')
        })

    leaderboard.sort(key=lambda x: x['score'], reverse=True)

    limit = request.args.get('limit', 100, type=int)
    if limit > 0:
        leaderboard = leaderboard[:limit]

    return jsonify(leaderboard)

@app.route('/api/user/settings', methods=['GET'])
@require_auth
def get_user_settings(user):
    """获取用户个人设置"""
    username = user['username']
    users = load_json_with_lock(USERS_FILE)
    user_data = users.get(username, {})
    settings = user_data.get('settings', {})
    
    return jsonify(settings)

@app.route('/api/user/settings', methods=['POST'])
@require_auth
def save_user_settings(user):
    """保存用户个人设置"""
    data = request.json
    username = user['username']
    users = load_json_with_lock(USERS_FILE)
    
    if username not in users:
        return jsonify({'error': '用户不存在'}), 404
    
    if 'settings' not in users[username]:
        users[username]['settings'] = {}
    
    settings = users[username]['settings']
    
    if 'boardLineColor' in data:
        settings['boardLineColor'] = data['boardLineColor']
    if 'boardDotColor' in data:
        settings['boardDotColor'] = data['boardDotColor']
    if 'boardBackground' in data:
        settings['boardBackground'] = data['boardBackground']
    
    save_json_with_lock(USERS_FILE, users)
    
    # 清除该用户的缓存
    if username in cache['user_info']:
        del cache['user_info'][username]
    
    return jsonify({'success': True, 'message': '设置保存成功'})

@app.route('/api/backgrounds', methods=['GET'])
@require_auth
def get_background_images(user):
    """获取可用的背景图片列表"""
    picture_dir = os.path.join(SCRIPT_DIR, 'picture')
    supported_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
    
    if not os.path.exists(picture_dir):
        return jsonify({'backgrounds': []})
    
    backgrounds = []
    try:
        for filename in os.listdir(picture_dir):
            file_path = os.path.join(picture_dir, filename)
            if os.path.isfile(file_path):
                ext = os.path.splitext(filename)[1].lower()
                if ext in supported_extensions:
                    backgrounds.append({
                        'name': filename,
                        'path': f'picture/{filename}'
                    })
    except OSError as e:
        print(f"[WARN] 读取背景图片目录失败: {e}")
    
    # 按文件名排序
    backgrounds.sort(key=lambda x: x['name'])
    
    return jsonify({'backgrounds': backgrounds})

@app.route('/api/backgrounds/upload', methods=['POST'])
@require_auth
def upload_background_image(user):
    """上传背景图片"""
    if 'file' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400
    
    save_to_server = request.form.get('saveToServer', 'false').lower() == 'true'
    
    supported_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in supported_extensions:
        return jsonify({'error': f'不支持的文件格式。支持：{", ".join(supported_extensions)}'}), 400
    
    import uuid
    
    if save_to_server:
        picture_dir = os.path.join(SCRIPT_DIR, 'picture')
        os.makedirs(picture_dir, exist_ok=True)
        
        name_without_ext = os.path.splitext(file.filename)[0]
        ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{name_without_ext}({user['username']}){ext}"
        file_path = os.path.join(picture_dir, unique_filename)
        file.save(file_path)
        
        return jsonify({
            'success': True,
            'savedToServer': True,
            'path': f'picture/{unique_filename}',
            'name': unique_filename,
            'message': '图片已保存到服务器'
        })
    else:
        import base64
        import io
        
        img_bytes = file.read()
        
        if len(img_bytes) > 2 * 1024 * 1024:
            return jsonify({'error': '图片大小不能超过2MB（不保存到服务器时）'}), 400
        
        img_base64 = base64.b64encode(img_bytes).decode('utf-8')
        
        mime_type = 'image/jpeg' if file_ext in ['.jpg', '.jpeg'] else f'image/{file_ext[1:]}'
        data_url = f'data:{mime_type};base64,{img_base64}'
        
        return jsonify({
            'success': True,
            'savedToServer': False,
            'dataUrl': data_url,
            'name': file.filename,
            'message': '图片已转换为Base64，仅当前会话可用'
        })

@app.route('/api/match/my', methods=['GET'])
@require_auth
def get_my_match(user):
    """获取用户参与的匹配"""
    username = user['username']
    
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['creator'] == username or match.get('opponent') == username:
                my_color = None
                opponent = None
                
                if match['creator'] == username:
                    my_color = match.get('creatorColor')
                    opponent = match.get('opponent')
                else:
                    my_color = 2 if match.get('creatorColor') == 1 else 1
                    opponent = match.get('creator')
                
                return jsonify({
                    'match': {
                        'id': match_id,
                        'status': match['status'],
                        'board': match['board'],
                        'currentPlayer': match['currentPlayer'],
                        'moves': match['moves'],
                        'winner': match['winner'],
                        'myColor': my_color,
                        'opponent': opponent,
                        'startTime': int(match.get('startTime', 0))
                    }
                })
    
    return jsonify({'match': None})

@app.route('/api/match/create', methods=['POST'])
@require_auth
def create_match(user):
    """创建联机对战房间"""
    try:
        match_id = str(uuid.uuid4())[:8]
        # 创建房间时就确定创建者颜色（随机选择）
        import random
        creator_color = random.choice([1, 2])
        
        try:
            with active_matches_lock:
                active_matches[match_id] = {
                    'id': match_id,
                    'creator': user['username'],
                    'opponent': None,
                    'status': 'waiting',
                    'board': [[0] * 15 for _ in range(15)],
                    'currentPlayer': 1,  # 始终黑棋先走
                    'moves': [],
                    'winner': None,
                    'startTime': time.time(),
                    'creatorColor': creator_color,
                    'lastActivity': time.time()
                }
            save_matches()
            logger.info(f"Match created: {match_id} by {user['username']}")
            return jsonify({'success': True, 'matchId': match_id, 'creatorColor': creator_color})
        except Exception as e:
            logger.error(f"Error creating match: {e}")
            return jsonify({'error': 'Failed to create match'}), 500
    except Exception as e:
        logger.error(f"Create match error for user {user.get('username', 'unknown')}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/match/join', methods=['POST'])
@require_auth
def join_match(user):
    """加入联机对战房间"""
    try:
        data = request.json
        match_id = data.get('matchId', '').strip()
        
        with active_matches_lock:
            if not match_id or match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404
            
            match = active_matches[match_id]
            
            if match['status'] != 'waiting':
                return jsonify({'error': '房间已开始或已结束'}), 400
            
            if match['creator'] == user['username']:
                return jsonify({'error': '不能加入自己创建的房间'}), 400
            
            # 使用创建房间时已确定的颜色
            creator_color = match['creatorColor']
            
            match['opponent'] = user['username']
            match['status'] = 'playing'
            match['currentPlayer'] = 1  # 始终黑棋先走
            match['lastActivity'] = time.time()
        
        save_matches()
        logger.info(f"User {user['username']} joined match {match_id}")
        
        return jsonify({
            'success': True,
            'matchId': match_id,
            'yourColor': 2 if creator_color == 1 else 1,
            'opponent': match['creator'],
            'currentPlayer': 1  # 始终黑棋先走
        })
    except Exception as e:
        logger.error(f"Join match error for user {user.get('username', 'unknown')}: {e}")
        return jsonify({'error': 'Failed to join match'}), 500

@app.route('/api/match/list', methods=['GET'])
@require_auth
def list_matches(user):
    """获取可加入的房间列表"""
    available = []
    with active_matches_lock:
        for match_id, match in active_matches.items():
            if match['status'] == 'waiting' and match['creator'] != user['username']:
                available.append({
                    'id': match_id,
                    'creator': match['creator'],
                    'status': match['status']
                })
    return jsonify({'matches': available})

@app.route('/api/match/status/<match_id>', methods=['GET'])
@require_auth
def get_match_status(user, match_id):
    """获取比赛状态（轮询）"""
    try:
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404
            
            match = active_matches[match_id]
            username = user['username']
            
            if match['creator'] != username and match['opponent'] != username:
                return jsonify({'error': '您不在这个房间中'}), 403
            
            # 更新活动时间
            match['lastActivity'] = time.time()
            
            my_color = None
            opponent_name = None
            if match['creator'] == username:
                my_color = match['creatorColor']
                opponent_name = match['opponent']
            else:
                my_color = 2 if match['creatorColor'] == 1 else 1
                opponent_name = match['creator']
            
            # 复制匹配数据，避免锁竞争
            match_data = {
                'id': match_id,
                'status': match['status'],
                'board': [row[:] for row in match['board']],
                'currentPlayer': match['currentPlayer'],
                'moves': match['moves'][:],
                'winner': match['winner'],
                'myColor': my_color,
                'creatorColor': match['creatorColor'],
                'opponent': opponent_name,
                'restartRequested': match.get('restartRequested', False),
                'restartRequestedBy': match.get('restartRequestedBy'),
                'restartDeclinedBy': match.get('restartDeclinedBy'),
                'restartAccepted': match.get('restartAccepted', False),
                'restartInitiated': match.get('restartInitiated', False),
                'restartVersion': match.get('restartVersion', 0)
            }
        
        return jsonify(match_data)
    except Exception as e:
        logger.error(f"Get match status error for match {match_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/match/move', methods=['POST'])
@require_auth
def make_move(user):
    """落子"""
    try:
        data = request.json
        match_id = data.get('matchId')
        row = data.get('row')
        col = data.get('col')
        
        if not all([match_id, row is not None, col is not None]):
            return jsonify({'error': '参数无效'}), 400
        
        # 验证 row 和 col 在有效范围内
        if not (0 <= row < 15 and 0 <= col < 15):
            return jsonify({'error': '无效的棋盘位置'}), 400
        
        with active_matches_lock:
            if match_id not in active_matches:
                return jsonify({'error': '房间不存在'}), 404
            
            match = active_matches[match_id]
            username = user['username']
            
            if match['status'] != 'playing':
                return jsonify({'error': '游戏未在进行中', 'status': match['status']}), 400
            
            if match['creator'] != username and match['opponent'] != username:
                return jsonify({'error': '您不在这个房间中'}), 403
            
            my_color = None
            if match['creator'] == username:
                my_color = match['creatorColor']
            else:
                my_color = 2 if match['creatorColor'] == 1 else 1
            
            if match['currentPlayer'] != my_color:
                return jsonify({'error': '不是您的回合', 'currentPlayer': match['currentPlayer'], 'myColor': my_color}), 400
            
            if match['board'][row][col] != 0:
                return jsonify({'error': '该位置已有棋子'}), 400
            
            # 禁手规则检查（联机对战强制启用，仅对黑棋有效）
            if my_color == 1:
                # 临时放置棋子检查禁手
                temp_board = [r[:] for r in match['board']]
                temp_board[row][col] = 1
                forbidden_check = check_forbidden(temp_board, row, col)
                if forbidden_check['forbidden']:
                    return jsonify({'error': f'禁手: {forbidden_check["reason"]}', 'forbidden': True, 'reason': forbidden_check['reason']}), 400
            
            # 落子
            match['board'][row][col] = my_color
            match['moves'].append({'row': row, 'col': col, 'player': my_color})
            match['lastActivity'] = time.time()
            
            # 检查胜利
            if check_win(match['board'], row, col, my_color):
                match['winner'] = my_color
                match['status'] = 'finished'
                board_copy = [row[:] for row in match['board']]
                save_matches()
                logger.info(f"Game finished in match {match_id}, winner: {my_color}")
                return jsonify({'success': True, 'win': True, 'winner': my_color, 'board': board_copy})
            
            # 切换回合
            match['currentPlayer'] = 2 if my_color == 1 else 1
            board_copy = [row[:] for row in match['board']]
        
        save_matches()
        
        return jsonify({'success': True, 'win': False, 'board': board_copy})
    except Exception as e:
        logger.error(f"Make move error for user {user.get('username', 'unknown')}: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500

def check_win(board, row, col, player):
    """检查是否五子连珠"""
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for d in [1, -1]:
            r, c = row + dr * d, col + dc * d
            while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == player:
                count += 1
                r += dr * d
                c += dc * d
        if count >= 5:
            return True
    return False

def check_forbidden(board, row, col):
    """检查禁手规则（仅对黑棋有效）
    三三禁手：同时形成两个或以上的活三
    四四禁手：同时形成两个或以上的四
    长连禁手：形成六子或以上的连珠
    """
    # 禁手规则只对黑棋(1)有效
    if board[row][col] != 1:
        return {'forbidden': False, 'reason': ''}
    
    # 检查长连禁手
    if check_overline(board, row, col):
        return {'forbidden': True, 'reason': '长连禁手（六子及以上）'}
    
    # 统计活三和四的数量
    live_threes = 0
    fours = 0
    
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    
    for dr, dc in directions:
        line_info = analyze_line(board, row, col, dr, dc)
        if line_info['live_three']:
            live_threes += 1
        if line_info['four']:
            fours += 1
    
    # 三三禁手
    if live_threes >= 2:
        return {'forbidden': True, 'reason': '三三禁手（同时形成两个活三）'}
    
    # 四四禁手
    if fours >= 2:
        return {'forbidden': True, 'reason': '四四禁手（同时形成两个四）'}
    
    return {'forbidden': False, 'reason': ''}

def check_overline(board, row, col):
    """检查长连禁手（六子及以上）"""
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        # 正方向
        for i in range(1, 6):
            r, c = row + i * dr, col + i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        # 反方向
        for i in range(1, 6):
            r, c = row - i * dr, col - i * dc
            if not (0 <= r < 15 and 0 <= c < 15) or board[r][c] != 1:
                break
            count += 1
        if count >= 6:
            return True
    return False

def analyze_line(board, row, col, dr, dc):
    """分析一条线上的棋型"""
    result = {'live_three': False, 'four': False}
    
    # 获取这条线上的棋子分布
    line = []
    center_index = 0
    
    # 向两端延伸最多4格
    for i in range(-4, 5):
        r, c = row + i * dr, col + i * dc
        if not (0 <= r < 15 and 0 <= c < 15):
            line.append(-1)  # 边界
        else:
            line.append(board[r][c])
        if i == 0:
            center_index = len(line) - 1
    
    # 从中心点向两端扩展，计算连续黑子数量和空点情况
    count = 1  # 中心点本身
    left_empty = 0
    right_empty = 0
    
    # 向左（负方向）
    for i in range(center_index - 1, -1, -1):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            left_empty += 1
            break
        else:
            break
    
    # 向右（正方向）
    for i in range(center_index + 1, len(line)):
        if line[i] == 1:
            count += 1
        elif line[i] == 0:
            right_empty += 1
            break
        else:
            break
    
    # 判断棋型
    # 活四：4个连续黑子，两端都空
    if count == 4 and left_empty > 0 and right_empty > 0:
        result['four'] = True
    # 冲四：4个连续黑子，只有一端空
    elif count == 4 and (left_empty > 0 or right_empty > 0):
        result['four'] = True
    # 活三：3个连续黑子，两端都空
    elif count == 3 and left_empty > 0 and right_empty > 0:
        result['live_three'] = True
    
    return result

@app.route('/api/match/leave', methods=['POST'])
@require_auth
def leave_match(user):
    """离开比赛"""
    data = request.json
    match_id = data.get('matchId')
    
    with active_matches_lock:
        if match_id not in active_matches:
            return jsonify({'success': True})
        
        match = active_matches[match_id]
        username = user['username']
        
        if match['creator'] != username and match['opponent'] != username:
            return jsonify({'success': True})
        
        if match['creator'] == username:
            match['creatorLeft'] = True
        elif match.get('opponent') == username:
            match['opponentLeft'] = True
        
        creator_left = match.get('creatorLeft', False)
        opponent_left = match.get('opponentLeft', False)
        
        if match['status'] == 'waiting' and match['creator'] == username:
            del active_matches[match_id]
            save_matches()
        elif (creator_left and opponent_left) or (creator_left and match['status'] == 'finished'):
            match['status'] = 'closed'
            save_matches()
            del active_matches[match_id]
        else:
            if match['status'] == 'playing':
                match['status'] = 'waiting_for_reconnect'
            save_matches()
    
    return jsonify({'success': True})


@app.route('/api/match/close', methods=['POST'])
@require_auth
def close_match(user):
    """关闭房间（仅限创建者）"""
    data = request.json
    match_id = data.get('matchId')
    
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
        username = user['username']
        
        if match['creator'] != username:
            return jsonify({'error': '只有房间创建者可以关闭房间'}), 403
        
        match['status'] = 'closed'
        match['closed_at'] = int(time.time())
        match['closed_by'] = username
        
        if 'opponent' in match and match['opponent']:
            match['opponent_left'] = True
        
        save_matches()
    return jsonify({'success': True, 'message': '房间已成功关闭'})


@app.route('/api/match/restart', methods=['POST'])
@require_auth
def restart_match(user):
    """重新开始游戏 - 双方确认机制"""
    data = request.json
    match_id = data.get('matchId')
    
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
        username = user['username']
        
        if match['creator'] != username and match.get('opponent') != username:
            return jsonify({'error': '您不在这个房间中'}), 403
        
        if match['status'] not in ['finished', 'playing']:
            return jsonify({'error': '游戏无法重新开始'}), 400
        
        restart_requested = match.get('restartRequested', False)
        restart_requested_by = match.get('restartRequestedBy')
        
        # 情况1: 没有待处理的重新开始请求 - 发起请求
        if not restart_requested:
            match['restartRequested'] = True
            match['restartRequestedBy'] = username
            match['restartAcceptedBy'] = None
            match['restartDeclinedBy'] = None
            match['lastActivity'] = time.time()
            save_matches()
            return jsonify({
                'success': True, 
                'restartRequested': True,
                'restartRequestedBy': username,
                'message': '已请求重新开始，等待对手确认'
            })
        
        # 情况2: 同一玩家再次点击 - 取消请求
        if restart_requested_by == username:
            match['restartRequested'] = False
            match['restartRequestedBy'] = None
            match['restartAcceptedBy'] = None
            match['lastActivity'] = time.time()
            save_matches()
            return jsonify({
                'success': True,
                'restartRequested': False,
                'restartCancelled': True,
                'message': '已取消重新开始请求'
            })
        
        # 情况3: 对手确认 - 执行重新开始
        if restart_requested_by and restart_requested_by != username:
            # 执行重新开始
            original_creator_color = match['creatorColor']
            match['creatorColor'] = 1 if original_creator_color == 2 else 2
            match['board'] = [[0] * 15 for _ in range(15)]
            match['currentPlayer'] = 1
            match['moves'] = []
            match['winner'] = None
            match['status'] = 'playing'
            match['startTime'] = time.time()
            match['creatorLeft'] = False
            match['opponentLeft'] = False
            match['restartRequested'] = False
            match['restartRequestedBy'] = None
            match['restartAcceptedBy'] = username
            match['restartDeclinedBy'] = None
            # 增加重新开始版本号，客户端可通过此字段可靠检测重新开始
            match['restartInitiated'] = True
            match['restartVersion'] = match.get('restartVersion', 0) + 1
            match['lastActivity'] = time.time()
            save_matches()
            
            return jsonify({
                'success': True,
                'restartInitiated': True,
                'restartVersion': match['restartVersion'],
                'creatorColor': match['creatorColor'],
                'currentPlayer': match['currentPlayer'],
                'message': '游戏已重新开始'
            })
    
    return jsonify({'error': '未知错误'}), 500


@app.route('/api/admin/matches', methods=['GET'])
@require_super_admin
def get_all_matches(user):
    """获取所有房间（仅限超级管理员）"""
    
    matches_list = []
    with active_matches_lock:
        for match_id, match in active_matches.items():
            matches_list.append({
                'id': match_id,
                'creator': match['creator'],
                'opponent': match.get('opponent'),
                'status': match['status'],
                'currentPlayer': match['currentPlayer'],
                'moveCount': len(match['moves']),
                'startTime': match['startTime']
            })
    
    return jsonify({'matches': matches_list})


@app.route('/api/admin/match/<match_id>', methods=['GET'])
@require_super_admin
def get_match_detail(user, match_id):
    """获取房间详情（仅限超级管理员）"""
    
    with active_matches_lock:
        if match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
    
    return jsonify({
        'id': match_id,
        'creator': match['creator'],
        'opponent': match.get('opponent'),
        'status': match['status'],
        'board': match['board'],
        'currentPlayer': match['currentPlayer'],
        'moves': match['moves'],
        'winner': match['winner'],
        'startTime': match['startTime']
    })


@app.route('/api/admin/match/force_close', methods=['POST'])
@require_super_admin
def force_close_match(user):
    """强制关闭房间（仅限超级管理员）"""
    data = request.json
    match_id = data.get('matchId')
    
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
        match['status'] = 'closed'
        save_matches()
        del active_matches[match_id]
    
    return jsonify({'success': True})


@app.route('/api/admin/match/force_close_all', methods=['POST'])
@require_super_admin
def force_close_all_matches(user):
    """关闭所有房间（仅限超级管理员）"""
    with active_matches_lock:
        closed_count = 0
        for match_id in list(active_matches.keys()):
            active_matches[match_id]['status'] = 'closed'
            del active_matches[match_id]
            closed_count += 1
        save_matches()
    
    return jsonify({'success': True, 'closed_count': closed_count})


@app.route('/api/admin/match/force_restart', methods=['POST'])
@require_super_admin
def force_restart_match(user):
    """强制重新开始游戏（仅限超级管理员）"""
    data = request.json
    match_id = data.get('matchId')
    
    with active_matches_lock:
        if not match_id or match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
        
        if match['status'] not in ['playing', 'finished']:
            return jsonify({'error': '游戏未在进行中或已结束，无法重新开始'}), 400
        
        match['board'] = [[0] * 15 for _ in range(15)]
        # 重新开始时始终黑棋先走（符合五子棋规则）
        match['currentPlayer'] = 1
        match['moves'] = []
        match['winner'] = None
        match['status'] = 'playing'
        match['startTime'] = time.time()
        match['creatorLeft'] = False
        match['opponentLeft'] = False
        match['restartRequestedBy'] = None
        match['restartRequested'] = False
        match['restartAccepted'] = False
        match['restartAcceptedBy'] = None
        match['restartDeclinedBy'] = None
        match['restartInitiated'] = True
        match['restartVersion'] = match.get('restartVersion', 0) + 1
        save_matches()
    
    return jsonify({'success': True, 'message': '游戏已强制重新开始'})


@app.route('/api/admin/match/force_move', methods=['POST'])
@require_super_admin
def force_move(user):
    """强制落子（仅限超级管理员，无视规则）"""
    data = request.json
    match_id = data.get('matchId')
    row = data.get('row')
    col = data.get('col')
    player = data.get('player', 1)
    
    if not all([match_id, row is not None, col is not None]):
        return jsonify({'error': '参数无效'}), 400
    
    with active_matches_lock:
        if match_id not in active_matches:
            return jsonify({'error': '房间不存在'}), 404
        
        match = active_matches[match_id]
        
        if match['status'] != 'playing':
            if match['status'] == 'finished':
                return jsonify({'error': '游戏已结束，请重新开始后再操作'}), 400
            return jsonify({'error': '游戏尚未开始，无法强制落子'}), 400
        
        match['board'][row][col] = player
        match['moves'].append({'row': row, 'col': col, 'player': player, 'forced': True})
        
        if check_win(match['board'], row, col, player):
            match['winner'] = player
            match['status'] = 'finished'
            save_matches()
            return jsonify({'success': True, 'win': True, 'winner': player, 'board': match['board']})
        
        match['currentPlayer'] = 2 if player == 1 else 1
        save_matches()
    
    return jsonify({'success': True, 'win': False, 'board': match['board']})


# 启动后台清理任务
@app.route("/picture/<filename>")
def serve_picture(filename):
    return send_from_directory(os.path.join(SCRIPT_DIR, "picture"), filename)

def start_cleanup_task():
    def cleanup_loop():
        while True:
            time.sleep(60)  # 每分钟检查一次
            try:
                # 清理过期匹配（每小时一次）
                if int(time.time()) % 3600 == 0:
                    cleanup_expired_matches()
                
                # 清理超时连接
                cleanup_inactive_connections()
            except Exception as e:
                logger.error(f"清理任务异常: {str(e)}")
                logger.error(traceback.format_exc())
    
    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()
    logger.info("后台清理任务已启动")

start_cleanup_task()

@app.after_request
def log_request(response):
    remote_addr = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
    log_line = f'{remote_addr} - - [{datetime.now().strftime("%d/%b/%Y %H:%M:%S")}] "{request.method} {request.path} HTTP/1.1" {response.status_code}'
    access_logger.info(log_line)
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)
# server.py
import os
import json
import uuid
import time
import hashlib
import threading
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
import logging

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'your-secret-key-change-in-production'

# Configure logging - console for network address, file for other logs
log = logging.getLogger('werkzeug')
log.setLevel(logging.INFO)

class RequestFilter(logging.Filter):
    def filter(self, record):
        return not ('HTTP/1.1' in record.getMessage() or 'GET ' in record.getMessage() or 'POST ' in record.getMessage())

log.addFilter(RequestFilter())

# File handler for logs
DATA_DIR = 'data'
os.makedirs(DATA_DIR, exist_ok=True)

USERS_FILE = os.path.join(DATA_DIR, 'users.json')
RECORDS_FILE = os.path.join(DATA_DIR, 'records.json')
SAVES_FILE = os.path.join(DATA_DIR, 'saves.json')
TOKENS_FILE = os.path.join(DATA_DIR, 'tokens.json')
PASSWORD_FILE = os.path.join(DATA_DIR, 'password.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
MATCHES_FILE = os.path.join(DATA_DIR, 'matches.json')

# 文件锁
file_locks = {
    USERS_FILE: threading.Lock(),
    RECORDS_FILE: threading.Lock(),
    SAVES_FILE: threading.Lock(),
    TOKENS_FILE: threading.Lock(),
    PASSWORD_FILE: threading.Lock(),
    SETTINGS_FILE: threading.Lock(),
    MATCHES_FILE: threading.Lock()
}

# 内存缓存
cache = {
    'users': {'data': None, 'timestamp': 0, 'ttl': 30},
    'tokens': {'data': None, 'timestamp': 0, 'ttl': 10},
    'user_info': {},
    'matches': {}
}

def save_matches():
    with open(MATCHES_FILE, 'w', encoding='utf-8') as f:
        json.dump(active_matches, f, ensure_ascii=False, indent=2)

# 活跃匹配（持久化存储）
MATCHES_FILE = os.path.join(DATA_DIR, 'matches.json')

# 读取现有匹配信息
try:
    with open(MATCHES_FILE, 'r', encoding='utf-8') as f:
        content = f.read().strip()
        if content:
            active_matches = json.loads(content)
            # 确保所有匹配处于合适的状态（例如，等待玩家重新连接）
            for match_id, match in active_matches.items():
                if match['status'] == 'playing':
                    # 如果匹配在进行中，将其设为等待状态直到玩家重新连接
                    match['status'] = 'waiting_for_reconnect'
        else:
            active_matches = {}
except FileNotFoundError:
    active_matches = {}
match_locks = {}


def cleanup_expired_matches():
    """清理超过一定时间的过期匹配"""
    global active_matches
    expired_matches = []
    current_time = time.time()
    
    for match_id, match in active_matches.items():
        # 如果匹配超过1小时没有活动，则视为过期
        if 'startTime' in match and (current_time - match['startTime']) > 3600:
            expired_matches.append(match_id)
    
    for match_id in expired_matches:
        del active_matches[match_id]
        print(f"清理过期匹配: {match_id}")
    
    if expired_matches:
        save_matches()


def save_matches():
    with open(MATCHES_FILE, 'w', encoding='utf-8') as f:
        json.dump(active_matches, f, ensure_ascii=False, indent=2)


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
                cache['users']['data'] = None
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
    
    users = load_json_with_lock(USERS_FILE)
    if not users:
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
        save_json_with_lock(USERS_FILE, admin)
    else:
        # 确保admin存在且密码正确
        if 'admin' not in users:
            users['admin'] = {
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
            save_json_with_lock(USERS_FILE, users)
        else:
            # 更新管理员密码
            users['admin']['password'] = hashlib.sha256(admin_password.encode()).hexdigest()
            users['admin']['isSuperAdmin'] = True
            save_json_with_lock(USERS_FILE, users)

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
    return send_from_directory('.', '五子棋.html')

@app.route('/api/register', methods=['POST'])
def register():
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
        'bannedUntil': None
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
    
    user = get_user(username)
    if not user:
        return jsonify({'error': '用户名或密码错误'}), 401
    
    # 超级管理员本机登录验证
    #if user.get('isSuperAdmin') and not is_local_admin_login():
        #return jsonify({'error': '超级管理员必须在服务器本机登录'}), 403
        
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
    
    return jsonify({
        'success': True,
        'token': token,
        'user': {k: v for k, v in user.items() if k != 'password'}
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
    # 返回用户信息，排除密码字段
    user_info = {k: v for k, v in user.items() if k != 'password'}
    return jsonify(user_info)

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

# 管理员API
@app.route('/api/admin/users', methods=['GET'])
@require_admin
def admin_get_users(admin_user):
    """管理员获取所有用户信息（包括明文密码）"""
    users = load_json_with_lock(USERS_FILE)
    password_data = load_json_with_lock(PASSWORD_FILE)
    is_super = admin_user.get('isSuperAdmin', False)
    
    user_list = []
    for username, user_data in users.items():
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
                'plain_password': ''
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
                'bannedUntil': user_data.get('bannedUntil'),
                'plain_password': password_data.get(username, '')
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
        # 超级管理员：不能被封禁
        if target_user.get('isSuperAdmin'):
            return jsonify({'error': '不能封禁超级管理员'}), 403
        # 普通管理员：检查权限
        if target_user.get('isAdmin') and not target_user.get('isSuperAdmin'):
            if not current_user_data or not current_user_data.get('canManage', True):
                return jsonify({'error': '您的管理权限已被禁用'}), 403
    
    if username == 'admin':
        return jsonify({'error': '不能封禁管理员'}), 400
        
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
@require_admin
def list_admins(admin_user):
    """获取所有管理员账号列表"""
    users = load_json_with_lock(USERS_FILE)
    password_data = load_json_with_lock(PASSWORD_FILE)
    
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
                'plain_password': password_data.get(username, ''),  # 包含明文密码
                'created_by': user_data.get('created_by', '')
            }
            admins.append(admin_info)
    
    return jsonify({'admins': admins})

@app.route('/api/admin/settings', methods=['GET'])
@require_super_admin
def get_settings(super_admin):
    """获取系统设置"""
    settings = load_json_with_lock(SETTINGS_FILE, {})
    return jsonify(settings)

@app.route('/api/admin/settings', methods=['POST'])
@require_super_admin
def save_settings(super_admin):
    """保存系统设置"""
    data = request.json
    settings = load_json_with_lock(SETTINGS_FILE, {})
    
    if 'boardLineColor' in data:
        settings['boardLineColor'] = data['boardLineColor']
    if 'boardDotColor' in data:
        settings['boardDotColor'] = data['boardDotColor']
    
    save_json_with_lock(SETTINGS_FILE, settings)
    return jsonify({'success': True, 'message': '设置保存成功'})

@app.route('/api/match/my', methods=['GET'])
@require_auth
def get_my_match(user):
    """获取用户参与的匹配"""
    username = user['username']
    
    for match_id, match in active_matches.items():
        if match['creator'] == username or match.get('opponent') == username:
            # 返回用户参与的比赛信息
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
    match_id = str(uuid.uuid4())[:8]
    active_matches[match_id] = {
        'id': match_id,
        'creator': user['username'],
        'opponent': None,
        'status': 'waiting',
        'board': [[0] * 15 for _ in range(15)],
        'currentPlayer': 1,
        'moves': [],
        'winner': None,
        'startTime': time.time(),
        'creatorColor': None
    }
    save_matches()  # 保存匹配信息到文件
    return jsonify({'success': True, 'matchId': match_id})

@app.route('/api/match/join', methods=['POST'])
@require_auth
def join_match(user):
    """加入联机对战房间"""
    data = request.json
    match_id = data.get('matchId', '').strip()
    
    if not match_id or match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    
    if match['status'] != 'waiting':
        return jsonify({'error': 'Match already started or ended'}), 400
    
    if match['creator'] == user['username']:
        return jsonify({'error': 'Cannot join your own match'}), 400
    
    import random
    creator_color = random.choice([1, 2])
    
    match['opponent'] = user['username']
    match['status'] = 'playing'
    match['creatorColor'] = creator_color
    
    opponent_color = 2 if creator_color == 1 else 1
    
    save_matches()  # 保存匹配信息到文件
    
    return jsonify({
        'success': True,
        'matchId': match_id,
        'yourColor': opponent_color,
        'opponent': match['creator'],
        'currentPlayer': 1
    })

@app.route('/api/match/list', methods=['GET'])
@require_auth
def list_matches(user):
    """获取可加入的房间列表"""
    available = []
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
    if match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    username = user['username']
    
    if match['creator'] != username and match['opponent'] != username:
        return jsonify({'error': 'Not in this match'}), 403
    
    my_color = None
    opponent_name = None
    if match['creator'] == username:
        my_color = match['creatorColor']
        opponent_name = match['opponent']
    else:
        my_color = 2 if match['creatorColor'] == 1 else 1
        opponent_name = match['creator']
    
    return jsonify({
        'id': match_id,
        'status': match['status'],
        'board': match['board'],
        'currentPlayer': match['currentPlayer'],
        'moves': match['moves'],
        'winner': match['winner'],
        'myColor': my_color,
        'opponent': opponent_name
    })

@app.route('/api/match/move', methods=['POST'])
@require_auth
def make_move(user):
    """落子"""
    data = request.json
    match_id = data.get('matchId')
    row = data.get('row')
    col = data.get('col')
    
    if not all([match_id, row is not None, col is not None]):
        return jsonify({'error': 'Invalid parameters'}), 400
    
    if match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    username = user['username']
    
    if match['status'] != 'playing':
        return jsonify({'error': 'Match not playing', 'status': match['status']}), 400
    
    if match['creator'] != username and match['opponent'] != username:
        return jsonify({'error': 'Not in this match'}), 403
    
    my_color = None
    if match['creator'] == username:
        my_color = match['creatorColor']
    else:
        my_color = 2 if match['creatorColor'] == 1 else 1
    
    print(f"[落子] 用户: {username}, 我的颜色: {my_color}, 当前玩家: {match['currentPlayer']}")
    
    if match['currentPlayer'] != my_color:
        return jsonify({'error': 'Not your turn', 'currentPlayer': match['currentPlayer'], 'myColor': my_color}), 400
    
    if match['board'][row][col] != 0:
        return jsonify({'error': 'Position occupied'}), 400
    
    match['board'][row][col] = my_color
    match['moves'].append({'row': row, 'col': col, 'player': my_color})
    
    if check_win(match['board'], row, col, my_color):
        match['winner'] = my_color
        match['status'] = 'finished'
        save_matches()
        return jsonify({'success': True, 'win': True, 'winner': my_color, 'board': match['board']})
    
    match['currentPlayer'] = 2 if my_color == 1 else 1
    
    save_matches()
    
    return jsonify({'success': True, 'win': False, 'board': match['board']})

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

@app.route('/api/match/leave', methods=['POST'])
@require_auth
def leave_match(user):
    """离开比赛"""
    data = request.json
    match_id = data.get('matchId')
    
    if match_id not in active_matches:
        return jsonify({'success': True})
    
    match = active_matches[match_id]
    username = user['username']
    
    if match['creator'] != username and match['opponent'] != username:
        return jsonify({'success': True})
    
    # 如果游戏正在进行，标记为结束并关闭房间
    if match['status'] == 'playing':
        match['status'] = 'closed'
        save_matches()  # 保存匹配信息到文件
        del active_matches[match_id]
    elif match['status'] == 'waiting' and match['creator'] == username:
        # 等待中且创建者离开，删除房间
        del active_matches[match_id]
    elif match['status'] == 'finished':
        # 游戏已结束，直接删除房间
        del active_matches[match_id]
    
    return jsonify({'success': True})


@app.route('/api/match/close', methods=['POST'])
@require_auth
def close_match(user):
    """关闭房间（仅限创建者）"""
    data = request.json
    match_id = data.get('matchId')
    
    if not match_id or match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    username = user['username']
    
    # 只有房间创建者可以关闭房间
    if match['creator'] != username:
        return jsonify({'error': 'Only room creator can close the room'}), 403
    
    # 标记房间为已关闭
    match['status'] = 'closed'
    
    save_matches()  # 保存匹配信息到文件
    
    # 不立即删除匹配，让其他玩家通过轮询检测到房间关闭
    return jsonify({'success': True})


@app.route('/api/match/restart', methods=['POST'])
@require_auth
def restart_match(user):
    """重新开始游戏（仅限房间创建者）"""
    data = request.json
    match_id = data.get('matchId')
    
    if not match_id or match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    username = user['username']
    
    # 只有房间创建者可以重新开始游戏
    if match['creator'] != username:
        return jsonify({'error': 'Only room creator can restart game'}), 403
    
    # 允许对已结束或进行中的游戏进行重启
    if match['status'] not in ['finished', 'playing']:
        return jsonify({'error': 'Game cannot be restarted'}), 400
    
    # 重置游戏状态
    match['board'] = [[0] * 15 for _ in range(15)]
    match['currentPlayer'] = 1
    match['moves'] = []
    match['winner'] = None
    match['status'] = 'playing'
    match['startTime'] = time.time()
    
    save_matches()  # 保存匹配信息到文件
    
    return jsonify({'success': True})


@app.route('/api/admin/matches', methods=['GET'])
@require_auth
def get_all_matches(user):
    """获取所有房间（仅限超级管理员）"""
    if not user.get('isSuperAdmin'):
        return jsonify({'error': '需要超级管理员权限'}), 403
    
    matches_list = []
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
@require_auth
def get_match_detail(user, match_id):
    """获取房间详情（仅限超级管理员）"""
    if not user.get('isSuperAdmin'):
        return jsonify({'error': '需要超级管理员权限'}), 403
    
    if match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
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
    
    if not match_id or match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    match['status'] = 'closed'
    save_matches()
    del active_matches[match_id]
    
    return jsonify({'success': True})


@app.route('/api/admin/match/force_move', methods=['POST'])
@require_super_admin
def force_move(user):
    """强制落子（仅限超级管理员，无视规则）"""
    data = request.json
    match_id = data.get('matchId')
    row = data.get('row')
    col = data.get('col')
    player = data.get('player', 1)  # 1=黑棋, 2=白棋
    
    if not all([match_id, row is not None, col is not None]):
        return jsonify({'error': 'Invalid parameters'}), 400
    
    if match_id not in active_matches:
        return jsonify({'error': 'Match not found'}), 404
    
    match = active_matches[match_id]
    
    # 超级管理员可以无视规则在任何位置落子
    match['board'][row][col] = player
    match['moves'].append({'row': row, 'col': col, 'player': player, 'forced': True})
    
    # 检查是否获胜
    if check_win(match['board'], row, col, player):
        match['winner'] = player
        match['status'] = 'finished'
        save_matches()
        return jsonify({'success': True, 'win': True, 'winner': player, 'board': match['board']})
    
    # 切换当前玩家
    match['currentPlayer'] = 2 if player == 1 else 1
    save_matches()
    
    return jsonify({'success': True, 'win': False, 'board': match['board']})


cleanup_expired_matches()

# 启动后台清理任务
def start_cleanup_task():
    def cleanup_loop():
        while True:
            time.sleep(3600)  # 每小时清理一次
            cleanup_expired_matches()
    
    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()

start_cleanup_task()

if __name__ == '__main__':
    # 启动服务器，保留网络地址输出
    # 跨平台启动服务器
    import platform
    import socket
    
    # 检查端口是否可用
    def is_port_available(port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return True
            except OSError:
                return False
    
    port = 8000
    if not is_port_available(port):
        print(f"端口 {port} 已被占用，尝试其他端口...")
        for try_port in range(8001, 8010):
            if is_port_available(try_port):
                port = try_port
                print(f"使用端口 {port}")
                break
    
    print(f"服务器启动: http://localhost:{port}")
    
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)
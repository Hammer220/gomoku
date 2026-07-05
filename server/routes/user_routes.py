import hashlib
import time
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..models import (load_json_with_lock, save_json_with_lock, get_user,
                      save_user, save_plain_password, get_plain_password,
                      RECORDS_FILE, SAVES_FILE, SETTINGS_FILE, USERS_FILE)
from ..auth import require_auth
from ..logger import logger

user_bp = Blueprint('user', __name__)

@user_bp.route('/api/profile', methods=['GET'])
@require_auth
def get_profile(user):
    return jsonify({
        'username': user['username'],
        'score': user.get('score', 0),
        'wins': user.get('wins', 0),
        'games': user.get('games', 0),
        'joinDate': user.get('joinDate', ''),
        'lastLogin': user.get('lastLogin', ''),
        'isAdmin': user.get('isAdmin', False),
        'isSuperAdmin': user.get('isSuperAdmin', False),
        'bannedUntil': user.get('bannedUntil')
    })

@user_bp.route('/api/profile/update', methods=['POST'])
@require_auth
def update_profile(user):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        # 更新密码
        old_password = data.get('oldPassword', '').strip()
        new_password = data.get('newPassword', '').strip()

        if old_password and new_password:
            if len(new_password) < 6:
                return jsonify({'error': '新密码长度至少为6个字符'}), 400

            if 'password' in user:
                old_hashed = hashlib.sha256(old_password.encode()).hexdigest()
                if user['password'] != old_hashed:
                    return jsonify({'error': '原密码错误'}), 400
            else:
                plain_pwd = get_plain_password(user['username'])
                if not plain_pwd or plain_pwd != old_password:
                    return jsonify({'error': '原密码错误'}), 400

            user['password'] = hashlib.sha256(new_password.encode()).hexdigest()
            save_user(user['username'], user)
            save_plain_password(user['username'], new_password)
            return jsonify({'success': True, 'message': '密码修改成功'})

        return jsonify({'error': '请提供原密码和新密码'}), 400
    except Exception as e:
        logger.error(f'更新资料错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@user_bp.route('/api/records', methods=['GET'])
@require_auth
def get_records(user):
    try:
        records = load_json_with_lock(RECORDS_FILE)
        user_records = []
        if isinstance(records, dict):
            for record_id, record in records.items():
                if record.get('player') == user['username'] or record.get('opponent') == user['username']:
                    record['id'] = record_id
                    user_records.append(record)
        elif isinstance(records, list):
            for record in records:
                if record.get('player') == user['username'] or record.get('opponent') == user['username']:
                    user_records.append(record)

        user_records.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        return jsonify({'records': user_records[:50]})
    except Exception as e:
        logger.error(f'获取记录错误: {str(e)}')
        return jsonify({'records': []})

@user_bp.route('/api/records/add', methods=['POST'])
@require_auth
def add_record(user):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        records = load_json_with_lock(RECORDS_FILE)
        if not isinstance(records, dict):
            records = {}

        record_id = str(int(time.time() * 1000))
        record = {
            'id': record_id,
            'player': user['username'],
            'opponent': data.get('opponent', 'AI'),
            'result': data.get('result', ''),
            'mode': data.get('mode', 'ai'),
            'timestamp': data.get('timestamp', int(time.time())),
            'duration': data.get('duration', 0),
            'moves': data.get('moves', 0)
        }
        records[record_id] = record
        save_json_with_lock(RECORDS_FILE, records)

        if data.get('result') == 'win':
            user['wins'] = user.get('wins', 0) + 1
        user['games'] = user.get('games', 0) + 1
        if data.get('result') == 'win':
            user['score'] = user.get('score', 0) + 10
        elif data.get('result') == 'lose':
            user['score'] = max(0, user.get('score', 0) - 5)
        save_user(user['username'], user)

        return jsonify({'success': True, 'record': record})
    except Exception as e:
        logger.error(f'添加记录错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@user_bp.route('/api/saves', methods=['GET'])
@require_auth
def get_saves(user):
    try:
        saves = load_json_with_lock(SAVES_FILE)
        user_saves = []
        if isinstance(saves, dict):
            for save_id in sorted(saves.keys(), reverse=True):
                save = saves[save_id]
                if save.get('player') == user['username']:
                    save['id'] = save_id
                    user_saves.append(save)
        elif isinstance(saves, list):
            for save in saves:
                if save.get('player') == user['username']:
                    user_saves.append(save)
        return jsonify({'saves': user_saves[:20]})
    except Exception as e:
        logger.error(f'获取存档错误: {str(e)}')
        return jsonify({'saves': []})

@user_bp.route('/api/saves/save', methods=['POST'])
@require_auth
def save_game(user):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        saves = load_json_with_lock(SAVES_FILE)
        if not isinstance(saves, dict):
            saves = {}

        save_id = str(int(time.time() * 1000))
        save_data = {
            'id': save_id,
            'player': user['username'],
            'board': data.get('board', []),
            'currentPlayer': data.get('currentPlayer', 1),
            'mode': data.get('mode', 'ai'),
            'timestamp': int(time.time()),
            'name': data.get('name', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        }
        saves[save_id] = save_data
        save_json_with_lock(SAVES_FILE, saves)

        return jsonify({'success': True, 'save': save_data})
    except Exception as e:
        logger.error(f'保存游戏错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@user_bp.route('/api/saves/<save_id>', methods=['DELETE'])
@require_auth
def delete_save(user, save_id):
    try:
        saves = load_json_with_lock(SAVES_FILE)
        if save_id in saves:
            save = saves[save_id]
            if save.get('player') != user['username']:
                return jsonify({'error': '无权删除此存档'}), 403
            del saves[save_id]
            save_json_with_lock(SAVES_FILE, saves)
            return jsonify({'success': True})
        return jsonify({'error': '存档不存在'}), 404
    except Exception as e:
        logger.error(f'删除存档错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500

@user_bp.route('/api/settings', methods=['GET'])
@require_auth
def get_settings(user):
    try:
        settings = load_json_with_lock(SETTINGS_FILE)
        user_settings = settings.get(user['username'], {})
        return jsonify({'settings': user_settings})
    except Exception as e:
        logger.error(f'获取设置错误: {str(e)}')
        return jsonify({'settings': {}})

@user_bp.route('/api/settings', methods=['POST'])
@require_auth
def save_settings(user):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        settings = load_json_with_lock(SETTINGS_FILE)
        settings[user['username']] = data.get('settings', data)
        save_json_with_lock(SETTINGS_FILE, settings)

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'保存设置错误: {str(e)}')
        return jsonify({'error': '服务器内部错误'}), 500
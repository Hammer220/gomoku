"""消息路由模块
处理用户间的消息发送、接收、标记已读等操作。
"""

import time
import uuid
from flask import Blueprint, request, jsonify

from ..models import (load_json_with_lock, save_json_with_lock,
                      MESSAGES_FILE, USERS_FILE)
from ..auth import require_auth, require_admin
from ..logger import logger

message_bp = Blueprint('message', __name__)


def _get_messages():
    data = load_json_with_lock(MESSAGES_FILE)
    if not isinstance(data, dict):
        data = {}
    if 'messages' not in data:
        data['messages'] = []
    return data


def _save_messages(data):
    save_json_with_lock(MESSAGES_FILE, data)


@message_bp.route('/api/messages/received', methods=['GET'])
@require_auth
def get_received_messages(user):
    try:
        data = _get_messages()
        username = user['username']
        received = [m for m in data['messages'] if username in m.get('to', [])]
        received.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        for msg in received:
            msg['isRead'] = username in msg.get('read_by', [])
        return jsonify({'messages': received})
    except Exception as e:
        logger.error(f'获取收件箱消息错误: {str(e)}')
        return jsonify({'error': '获取消息失败'}), 500


@message_bp.route('/api/messages/sent', methods=['GET'])
@require_auth
def get_sent_messages(user):
    try:
        data = _get_messages()
        username = user['username']
        sent = [m for m in data['messages'] if m.get('from') == username]
        sent.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        return jsonify({'messages': sent})
    except Exception as e:
        logger.error(f'获取已发送消息错误: {str(e)}')
        return jsonify({'error': '获取消息失败'}), 500


@message_bp.route('/api/messages/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user):
    try:
        data = _get_messages()
        username = user['username']
        count = 0
        for m in data['messages']:
            if username in m.get('to', []) and username not in m.get('read_by', []):
                count += 1
        return jsonify({'unreadCount': count})
    except Exception as e:
        logger.error(f'获取未读消息数错误: {str(e)}')
        return jsonify({'error': '获取失败'}), 500


@message_bp.route('/api/messages/send', methods=['POST'])
@require_auth
def send_message(user):
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': '无效的请求数据'}), 400

        recipients = body.get('to', [])
        content = body.get('content', '').strip()

        if not content:
            return jsonify({'error': '消息内容不能为空'}), 400
        if not recipients:
            return jsonify({'error': '请选择收件人'}), 400

        if not isinstance(recipients, list):
            recipients = [recipients]

        from_username = user['username']

        users_data = load_json_with_lock(USERS_FILE)
        valid_recipients = []
        for r in recipients:
            r = r.strip()
            if r and r in users_data:
                valid_recipients.append(r)

        if not valid_recipients:
            return jsonify({'error': '没有有效的收件人'}), 400

        if user.get('isAdmin'):
            if len(valid_recipients) > 100:
                return jsonify({'error': '单次最多发送给100个用户'}), 400
        else:
            if len(valid_recipients) > 1:
                return jsonify({'error': '普通用户每次只能发送给一个用户'}), 400

        data = _get_messages()
        msg = {
            'id': str(uuid.uuid4())[:8],
            'from': from_username,
            'to': valid_recipients,
            'content': content,
            'timestamp': int(time.time()),
            'read_by': []
        }
        data['messages'].append(msg)
        _save_messages(data)

        logger.info(f'用户 {from_username} 发送消息给 {valid_recipients}')
        return jsonify({'success': True, 'message': '消息发送成功', 'data': msg})
    except Exception as e:
        logger.error(f'发送消息错误: {str(e)}')
        return jsonify({'error': '发送消息失败'}), 500


@message_bp.route('/api/messages/read', methods=['POST'])
@require_auth
def mark_as_read(user):
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': '无效的请求数据'}), 400

        message_ids = body.get('ids', [])
        if not isinstance(message_ids, list):
            message_ids = [message_ids]

        username = user['username']
        data = _get_messages()

        for msg in data['messages']:
            if msg['id'] in message_ids and username in msg.get('to', []):
                if username not in msg.get('read_by', []):
                    msg['read_by'].append(username)

        _save_messages(data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'标记已读错误: {str(e)}')
        return jsonify({'error': '操作失败'}), 500


@message_bp.route('/api/messages/<message_id>', methods=['DELETE'])
@require_auth
def delete_message(user, message_id):
    try:
        username = user['username']
        data = _get_messages()

        found = False
        for msg in data['messages']:
            if msg['id'] == message_id:
                if msg.get('from') == username or username in msg.get('to', []):
                    if username in msg.get('to', []):
                        msg['to'].remove(username)
                        if not msg['to'] and msg.get('from') == username:
                            data['messages'].remove(msg)
                    elif msg.get('from') == username:
                        data['messages'].remove(msg)
                    found = True
                break

        if not found:
            return jsonify({'error': '消息不存在'}), 404

        _save_messages(data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'删除消息错误: {str(e)}')
        return jsonify({'error': '删除失败'}), 500


@message_bp.route('/api/users/list', methods=['GET'])
@require_auth
def get_user_list(user):
    try:
        users = load_json_with_lock(USERS_FILE)
        current_username = user['username']
        is_admin = user.get('isAdmin', False)
        user_list = []
        for username in users:
            if username != current_username:
                user_list.append({
                    'username': username,
                    'isAdmin': users[username].get('isAdmin', False),
                    'isSuperAdmin': users[username].get('isSuperAdmin', False)
                })
        user_list.sort(key=lambda x: x['username'])
        return jsonify({'users': user_list})
    except Exception as e:
        logger.error(f'获取用户列表错误: {str(e)}')
        return jsonify({'error': '获取用户列表失败'}), 500
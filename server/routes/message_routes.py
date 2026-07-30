"""消息路由模块
处理用户间的消息发送、接收、标记已读等操作。
"""

import time
from flask import Blueprint, request, jsonify

from ..models import (load_messages, save_message, update_message, delete_message_by_id,
                      get_user, get_all_users_from_db)
from ..auth import require_auth
from ..logger import logger
from ..i18n import get_text, get_user_language

message_bp = Blueprint('message', __name__)


def _get_messages():
    data = load_messages()
    if not isinstance(data, dict):
        data = {}
    return list(data.values())


@message_bp.route('/api/messages/received', methods=['GET'])
@require_auth
def get_received_messages(user):
    lang = get_user_language(user)
    try:
        all_msgs = _get_messages()
        username = user['username']
        received = [m for m in all_msgs if username in m.get('to', [])]
        received.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        for msg in received:
            msg['isRead'] = username in msg.get('read_by', [])
        return jsonify({'messages': received})
    except Exception as e:
        logger.error(f'获取收件箱消息错误: {str(e)}')
        return jsonify({'error': get_text('get_messages_error', lang)}), 500


@message_bp.route('/api/messages/sent', methods=['GET'])
@require_auth
def get_sent_messages(user):
    lang = get_user_language(user)
    try:
        all_msgs = _get_messages()
        username = user['username']
        sent = [m for m in all_msgs if m.get('from') == username]
        sent.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        return jsonify({'messages': sent})
    except Exception as e:
        logger.error(f'获取已发送消息错误: {str(e)}')
        return jsonify({'error': get_text('get_messages_error', lang)}), 500


@message_bp.route('/api/messages/unread-count', methods=['GET'])
@require_auth
def get_unread_count(user):
    lang = get_user_language(user)
    try:
        all_msgs = _get_messages()
        username = user['username']
        count = 0
        for m in all_msgs:
            if username in m.get('to', []) and username not in m.get('read_by', []):
                count += 1
        return jsonify({'unreadCount': count})
    except Exception as e:
        logger.error(f'获取未读消息数错误: {str(e)}')
        return jsonify({'error': get_text('get_unread_count_error', lang)}), 500


@message_bp.route('/api/messages/send', methods=['POST'])
@require_auth
def send_message(user):
    lang = get_user_language(user)
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': get_text('invalid_request_data', lang)}), 400

        recipients = body.get('to', [])
        content = body.get('content', '').strip()

        if not content:
            return jsonify({'error': get_text('message_content_empty', lang)}), 400
        if not recipients:
            return jsonify({'error': get_text('please_select_recipient', lang)}), 400

        if not isinstance(recipients, list):
            recipients = [recipients]

        from_username = user['username']

        valid_recipients = []
        for r in recipients:
            r = r.strip()
            if r and get_user(r):
                valid_recipients.append(r)

        if not valid_recipients:
            return jsonify({'error': get_text('no_valid_recipient', lang)}), 400

        if user.get('isAdmin'):
            if len(valid_recipients) > 100:
                return jsonify({'error': get_text('max_100_recipients', lang)}), 400
        else:
            if len(valid_recipients) > 1:
                return jsonify({'error': get_text('normal_user_one_recipient', lang)}), 400

        msg = {
            'from': from_username,
            'to': valid_recipients,
            'content': content,
            'timestamp': int(time.time()),
            'read_by': []
        }
        save_message(msg)

        logger.info(f'用户 {from_username} 发送消息给 {valid_recipients}')
        return jsonify({
            'success': True,
            'message': get_text('message_sent_success', lang),
            'data': msg
        })
    except Exception as e:
        logger.error(f'发送消息错误: {str(e)}')
        return jsonify({'error': get_text('send_message_error', lang)}), 500


@message_bp.route('/api/messages/read', methods=['POST'])
@require_auth
def mark_as_read(user):
    lang = get_user_language(user)
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': get_text('invalid_request_data', lang)}), 400

        message_ids = body.get('ids', [])
        if not isinstance(message_ids, list):
            message_ids = [message_ids]

        username = user['username']
        all_msgs = _get_messages()

        for msg in all_msgs:
            if str(msg['id']) in [str(mid) for mid in message_ids] and username in msg.get('to', []):
                if username not in msg.get('read_by', []):
                    msg['read_by'].append(username)
                    update_message(msg['id'], msg)

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'标记已读错误: {str(e)}')
        return jsonify({'error': get_text('mark_read_error', lang)}), 500


@message_bp.route('/api/messages/read-all', methods=['POST'])
@require_auth
def mark_all_as_read(user):
    lang = get_user_language(user)
    try:
        username = user['username']
        all_msgs = _get_messages()

        for msg in all_msgs:
            if username in msg.get('to', []) and username not in msg.get('read_by', []):
                msg['read_by'].append(username)
                update_message(msg['id'], msg)

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'全部标记已读错误: {str(e)}')
        return jsonify({'error': get_text('mark_read_error', lang)}), 500


@message_bp.route('/api/messages/<message_id>', methods=['DELETE'])
@require_auth
def delete_message(user, message_id):
    lang = get_user_language(user)
    try:
        username = user['username']
        all_msgs = _get_messages()

        found = False
        for msg in all_msgs:
            if str(msg['id']) == str(message_id):
                if msg.get('from') == username or username in msg.get('to', []):
                    if username in msg.get('to', []):
                        msg['to'].remove(username)
                        if not msg['to'] and msg.get('from') == username:
                            delete_message_by_id(msg['id'])
                            found = True
                            break
                        else:
                            update_message(msg['id'], msg)
                    elif msg.get('from') == username:
                        delete_message_by_id(msg['id'])
                    found = True
                break

        if not found:
            return jsonify({'error': get_text('message_not_found', lang)}), 404

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'删除消息错误: {str(e)}')
        return jsonify({'error': get_text('delete_message_error', lang)}), 500


@message_bp.route('/api/users/list', methods=['GET'])
@require_auth
def get_user_list(user):
    lang = get_user_language(user)
    try:
        users = get_all_users_from_db()
        current_username = user['username']
        user_list = []
        for username, user_data in users.items():
            if username != current_username:
                user_list.append({
                    'username': username,
                    'isAdmin': user_data.get('isAdmin', False),
                    'isSuperAdmin': user_data.get('isSuperAdmin', False)
                })
        user_list.sort(key=lambda x: x['username'])
        return jsonify({'users': user_list})
    except Exception as e:
        logger.error(f'获取用户列表错误: {str(e)}')
        return jsonify({'error': get_text('get_user_list_error', lang)}), 500
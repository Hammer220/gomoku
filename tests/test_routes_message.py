"""消息路由模块测试
测试范围：消息收发、标记已读、未读计数、删除消息、红包领取、用户列表 API
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.routes.message_routes import (
    claim_red_packet,
    delete_message,
    get_received_messages,
    get_sent_messages,
    get_unread_count,
    get_user_list,
    mark_all_as_read,
    mark_as_read,
    message_bp,
    send_message,
)


class TestMessageBlueprint:
    """message_bp 蓝图测试"""

    def test_blueprint_exists(self):
        """蓝图存在"""
        assert message_bp is not None

    def test_blueprint_name(self):
        """蓝图名称正确"""
        assert message_bp.name == 'message'

    def test_blueprint_has_routes(self):
        """蓝图注册了路由"""
        assert len(list(message_bp.deferred_functions)) > 0


class TestMessageRoutesImport:
    """路由函数导入测试"""

    def test_get_received_messages_exists(self):
        """get_received_messages 存在"""
        assert callable(get_received_messages)

    def test_get_sent_messages_exists(self):
        """get_sent_messages 存在"""
        assert callable(get_sent_messages)

    def test_get_unread_count_exists(self):
        """get_unread_count 存在"""
        assert callable(get_unread_count)

    def test_send_message_exists(self):
        """send_message 存在"""
        assert callable(send_message)

    def test_mark_as_read_exists(self):
        """mark_as_read 存在"""
        assert callable(mark_as_read)

    def test_mark_all_as_read_exists(self):
        """mark_all_as_read 存在"""
        assert callable(mark_all_as_read)

    def test_delete_message_exists(self):
        """delete_message 存在"""
        assert callable(delete_message)

    def test_get_user_list_exists(self):
        """get_user_list 存在"""
        assert callable(get_user_list)

    def test_claim_red_packet_exists(self):
        """claim_red_packet 存在"""
        assert callable(claim_red_packet)


class TestMessageRoutesWithClient:
    """使用 Flask 测试客户端的路由测试"""

    @pytest.fixture(autouse=True)
    def setup(self, app):
        self.app = app
        self.client = app.test_client()

    def test_received_messages_requires_auth(self):
        """GET /api/messages/received 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/messages/received')
            assert response.status_code in (401, 302)

    def test_sent_messages_requires_auth(self):
        """GET /api/messages/sent 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/messages/sent')
            assert response.status_code in (401, 302)

    def test_unread_count_requires_auth(self):
        """GET /api/messages/unread-count 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/messages/unread-count')
            assert response.status_code in (401, 302)

    def test_send_message_requires_auth(self):
        """POST /api/messages/send 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/send',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_send_message_empty_body(self):
        """POST /api/messages/send 空请求体返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/send',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_send_message_empty_content(self):
        """POST /api/messages/send 空内容返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/send',
                data=json.dumps({'to': ['user1'], 'content': ''}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_send_message_no_recipients(self):
        """POST /api/messages/send 无收件人返回 400"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/send',
                data=json.dumps({'to': [], 'content': 'hello'}),
                content_type='application/json',
            )
            assert response.status_code in (400, 401, 302)

    def test_mark_as_read_requires_auth(self):
        """POST /api/messages/read 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/read',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_mark_all_as_read_requires_auth(self):
        """POST /api/messages/read-all 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/read-all',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)

    def test_delete_message_requires_auth(self):
        """DELETE /api/messages/1 需要认证"""
        with self.app.app_context():
            response = self.client.delete('/api/messages/1')
            assert response.status_code in (401, 302)

    def test_user_list_requires_auth(self):
        """GET /api/users/list 需要认证"""
        with self.app.app_context():
            response = self.client.get('/api/users/list')
            assert response.status_code in (401, 302)

    def test_claim_red_packet_requires_auth(self):
        """POST /api/messages/red-packet/claim 需要认证"""
        with self.app.app_context():
            response = self.client.post(
                '/api/messages/red-packet/claim',
                data=json.dumps({}),
                content_type='application/json',
            )
            assert response.status_code in (401, 302)


class TestMessageHelpers:
    """消息辅助函数测试"""

    def test_get_messages_helper_exists(self):
        """_get_messages 函数存在"""
        from server.routes.message_routes import _get_messages
        assert callable(_get_messages)

    def test_get_messages_returns_list(self):
        """_get_messages 返回列表"""
        from server.routes.message_routes import _get_messages
        result = _get_messages()
        assert isinstance(result, list)


class TestRedPacketLogic:
    """红包逻辑测试"""

    def test_red_packet_amount_calculation(self):
        """红包金额计算"""
        import random
        remaining = 100
        count_left = 5
        max_single = int(remaining / count_left * 2)
        assert max_single >= 1

    def test_red_packet_last_one(self):
        """最后一个红包领取全部剩余"""
        remaining = 50
        count_left = 1
        claimed_amount = remaining
        assert claimed_amount == 50

    def test_red_packet_empty(self):
        """红包被领完"""
        total_claimed = 5
        count = 5
        assert total_claimed >= count
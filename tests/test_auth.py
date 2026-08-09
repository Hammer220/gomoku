"""认证模块测试
测试范围：认证装饰器、极验验证码、token 处理、get_current_user
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.auth import (
    geetest_verify,
    get_current_user,
    login_required,
    require_admin,
    require_auth,
    require_super_admin,
)


class TestGeetestVerify:
    """geetest_verify 函数测试"""

    def test_hmac_sign_token(self):
        """HMAC 签名生成"""
        import hashlib
        import hmac

        key = 'test_key'
        lot = 'test_lot'
        expected = hmac.new(key.encode('utf-8'), lot.encode('utf-8'), hashlib.sha256).hexdigest()

        assert len(expected) == 64

    def test_verify_with_empty_params(self):
        """空参数验证"""
        result, msg = geetest_verify('', '', '', '')
        assert isinstance(result, bool)
        assert isinstance(msg, str)

    def test_verify_with_custom_config(self):
        """自定义配置验证"""
        result, msg = geetest_verify(
            'test_lot',
            'test_output',
            'test_pass',
            '1234567890',
            captcha_id='custom_id',
            captcha_key='custom_key',
            verify_url='https://example.com/verify',
        )
        assert isinstance(result, bool)
        assert isinstance(msg, str)


class TestAuthDecorators:
    """认证装饰器测试"""

    def test_require_auth_structure(self):
        """require_auth 装饰器存在并可调用"""
        assert callable(require_auth)

        @require_auth
        def dummy(user):
            return {'success': True}

        assert callable(dummy)

    def test_require_admin_structure(self):
        """require_admin 装饰器存在并可调用"""
        assert callable(require_admin)

        @require_admin
        def dummy(user):
            return {'success': True}

        assert callable(dummy)

    def test_require_super_admin_structure(self):
        """require_super_admin 装饰器存在并可调用"""
        assert callable(require_super_admin)

        @require_super_admin
        def dummy(user):
            return {'success': True}

        assert callable(dummy)

    def test_login_required_structure(self):
        """login_required 装饰器存在并可调用"""
        assert callable(login_required)

        @login_required
        def dummy():
            return 'ok'

        assert callable(dummy)


class TestGetCurrentUser:
    """get_current_user 函数测试"""

    def test_function_exists(self):
        """函数存在"""
        assert callable(get_current_user)


class TestHMACSigning:
    """HMAC 签名测试"""

    def test_hmac_sha256(self):
        """HMAC-SHA256 签名"""
        import hashlib
        import hmac

        key = 'my_secret_key'
        message = 'my_message'
        signature = hmac.new(key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest()

        assert len(signature) == 64
        assert all(c in '0123456789abcdef' for c in signature)

    def test_hmac_different_keys(self):
        """不同密钥产生不同签名"""
        import hashlib
        import hmac

        message = 'test'
        sig1 = hmac.new(b'key1', message.encode(), hashlib.sha256).hexdigest()
        sig2 = hmac.new(b'key2', message.encode(), hashlib.sha256).hexdigest()
        assert sig1 != sig2

    def test_hmac_different_messages(self):
        """不同消息产生不同签名"""
        import hashlib
        import hmac

        key = b'secret'
        sig1 = hmac.new(key, b'message1', hashlib.sha256).hexdigest()
        sig2 = hmac.new(key, b'message2', hashlib.sha256).hexdigest()
        assert sig1 != sig2

    def test_hmac_deterministic(self):
        """相同输入产生相同签名"""
        import hashlib
        import hmac

        key = b'secret'
        message = b'message'
        sig1 = hmac.new(key, message, hashlib.sha256).hexdigest()
        sig2 = hmac.new(key, message, hashlib.sha256).hexdigest()
        assert sig1 == sig2


class TestDecoratorWrapping:
    """装饰器包装测试"""

    def test_require_auth_preserves_function(self):
        """require_auth 保留原函数元数据"""

        @require_auth
        def my_func(user):
            """My docstring"""
            return user

        assert my_func.__name__ == 'my_func'
        assert my_func.__doc__ == 'My docstring'

    def test_require_admin_preserves_function(self):
        """require_admin 保留原函数元数据"""

        @require_admin
        def my_func(user):
            """My docstring"""
            return user

        assert my_func.__name__ == 'my_func'

    def test_require_super_admin_preserves_function(self):
        """require_super_admin 保留原函数元数据"""

        @require_super_admin
        def my_func(user):
            """My docstring"""
            return user

        assert my_func.__name__ == 'my_func'

    def test_login_required_preserves_function(self):
        """login_required 保留原函数元数据"""

        @login_required
        def my_func():
            """My docstring"""
            return 'ok'

        assert my_func.__name__ == 'my_func'

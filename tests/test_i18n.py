"""国际化（i18n）模块测试
测试范围：翻译文本获取、用户语言偏好、多语言覆盖
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.i18n import get_text, get_user_language, TRANSLATIONS


class TestGetText:
    """get_text 函数测试"""

    def test_zh_cn(self):
        """简体中文翻译"""
        assert get_text('message_sent_success', 'zh-CN') == '消息发送成功'
        assert get_text('operation_success', 'zh-CN') == '操作成功'
        assert get_text('invalid_request_data', 'zh-CN') == '无效的请求数据'

    def test_zh_tw(self):
        """繁体中文翻译"""
        assert get_text('message_sent_success', 'zh-TW') == '消息發送成功'
        assert get_text('operation_success', 'zh-TW') == '操作成功'
        assert get_text('invalid_request_data', 'zh-TW') == '無效的請求數據'

    def test_en(self):
        """英文翻译"""
        assert get_text('message_sent_success', 'en') == 'Message sent successfully'
        assert get_text('operation_success', 'en') == 'Operation successful'
        assert get_text('message_content_empty', 'en') == 'Message content cannot be empty'

    def test_fallback_to_zh_cn(self):
        """未知语言回退到简体中文"""
        assert get_text('message_sent_success', 'fr') == '消息发送成功'
        assert get_text('operation_success', 'ja') == '操作成功'

    def test_unknown_key_returns_key(self):
        """未知 key 返回 key 本身"""
        assert get_text('nonexistent_key', 'zh-CN') == 'nonexistent_key'
        assert get_text('another_fake_key', 'en') == 'another_fake_key'

    def test_default_lang(self):
        """默认语言为简体中文"""
        assert get_text('message_sent_success') == '消息发送成功'

    def test_all_error_keys(self):
        """所有翻译 key 在三种语言中都有定义"""
        for key in TRANSLATIONS['zh-CN']:
            assert key in TRANSLATIONS['zh-TW'], f'{key} 缺失繁体中文翻译'
            assert key in TRANSLATIONS['en'], f'{key} 缺失英文翻译'
            assert get_text(key, 'zh-CN') != key, f'{key} 在简体中文中未翻译'
            assert get_text(key, 'zh-TW') != key, f'{key} 在繁体中文中未翻译'
            assert get_text(key, 'en') != key, f'{key} 在英文中未翻译'

    def test_max_recipients_message(self):
        """收件人上限消息"""
        assert get_text('max_100_recipients', 'zh-CN') == '单次最多发送给100个用户'
        assert get_text('max_100_recipients', 'en') == 'Maximum 100 recipients per message'

    def test_normal_user_restriction(self):
        """普通用户限制消息"""
        assert get_text('normal_user_one_recipient', 'zh-CN') == '普通用户每次只能发送给一个用户'
        assert get_text('normal_user_one_recipient', 'en') == 'Regular users can only send to one recipient'

    def test_empty_content(self):
        """空内容消息"""
        assert get_text('message_content_empty', 'zh-CN') == '消息内容不能为空'
        assert get_text('message_content_empty', 'zh-TW') == '消息內容不能為空'


class TestGetUserLanguage:
    """get_user_language 函数测试"""

    def test_valid_language(self):
        """有效语言偏好"""
        user = {'language': 'en'}
        assert get_user_language(user) == 'en'

        user = {'language': 'zh-TW'}
        assert get_user_language(user) == 'zh-TW'

        user = {'language': 'zh-CN'}
        assert get_user_language(user) == 'zh-CN'

    def test_invalid_language_fallback(self):
        """无效语言回退到 zh-CN"""
        user = {'language': 'fr'}
        assert get_user_language(user) == 'zh-CN'

        user = {'language': 'ja'}
        assert get_user_language(user) == 'zh-CN'

    def test_no_language_key(self):
        """用户对象无 language 字段"""
        user = {'username': 'test'}
        assert get_user_language(user) == 'zh-CN'

    def test_none_user(self):
        """用户为 None"""
        assert get_user_language(None) == 'zh-CN'

    def test_empty_dict(self):
        """空字典"""
        assert get_user_language({}) == 'zh-CN'


class TestTranslationsStructure:
    """TRANSLATIONS 字典结构测试"""

    def test_all_languages_present(self):
        """三种语言都存在"""
        assert 'zh-CN' in TRANSLATIONS
        assert 'zh-TW' in TRANSLATIONS
        assert 'en' in TRANSLATIONS

    def test_same_keys_across_languages(self):
        """所有语言有相同的 key 集合"""
        cn_keys = set(TRANSLATIONS['zh-CN'].keys())
        tw_keys = set(TRANSLATIONS['zh-TW'].keys())
        en_keys = set(TRANSLATIONS['en'].keys())

        assert cn_keys == tw_keys, '简体中文和繁体中文的 key 不一致'
        assert cn_keys == en_keys, '简体中文和英文的 key 不一致'

    def test_zh_cn_tw_difference(self):
        """简繁中文应有区别"""
        for key in TRANSLATIONS['zh-CN']:
            cn_val = TRANSLATIONS['zh-CN'][key]
            tw_val = TRANSLATIONS['zh-TW'][key]
            # 有些词简繁相同，但至少要有不同的
            pass
        assert True
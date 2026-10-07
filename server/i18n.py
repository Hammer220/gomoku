"""国际化（i18n）模块
提供多语言支持，根据用户语言偏好返回对应翻译文本。
支持的语言：简体中文 (zh-CN)、繁体中文 (zh-TW)、英文 (en)
"""

TRANSLATIONS = {
    'zh-CN': {
        'get_messages_error': '获取消息失败',
        'send_message_error': '发送消息失败',
        'mark_read_error': '操作失败',
        'delete_message_error': '删除失败',
        'get_unread_count_error': '获取失败',
        'get_user_list_error': '获取用户列表失败',
        'invalid_request_data': '无效的请求数据',
        'message_content_empty': '消息内容不能为空',
        'please_select_recipient': '请选择收件人',
        'no_valid_recipient': '没有有效的收件人',
        'max_100_recipients': '单次最多发送给100个用户',
        'normal_user_one_recipient': '普通用户每次只能发送给一个用户',
        'message_sent_success': '消息发送成功',
        'message_not_found': '消息不存在',
        'operation_success': '操作成功',
    },
    'zh-TW': {
        'get_messages_error': '獲取消息失敗',
        'send_message_error': '發送消息失敗',
        'mark_read_error': '操作失敗',
        'delete_message_error': '刪除失敗',
        'get_unread_count_error': '獲取失敗',
        'get_user_list_error': '獲取用戶列表失敗',
        'invalid_request_data': '無效的請求數據',
        'message_content_empty': '消息內容不能為空',
        'please_select_recipient': '請選擇收件人',
        'no_valid_recipient': '沒有有效的收件人',
        'max_100_recipients': '單次最多發送給100個用戶',
        'normal_user_one_recipient': '普通用戶每次只能發送給一個用戶',
        'message_sent_success': '消息發送成功',
        'message_not_found': '消息不存在',
        'operation_success': '操作成功',
    },
    'en': {
        'get_messages_error': 'Failed to get messages',
        'send_message_error': 'Failed to send message',
        'mark_read_error': 'Operation failed',
        'delete_message_error': 'Deletion failed',
        'get_unread_count_error': 'Failed to get count',
        'get_user_list_error': 'Failed to get user list',
        'invalid_request_data': 'Invalid request data',
        'message_content_empty': 'Message content cannot be empty',
        'please_select_recipient': 'Please select a recipient',
        'no_valid_recipient': 'No valid recipient',
        'max_100_recipients': 'Maximum 100 recipients per message',
        'normal_user_one_recipient': 'Regular users can only send to one recipient',
        'message_sent_success': 'Message sent successfully',
        'message_not_found': 'Message not found',
        'operation_success': 'Operation successful',
    },
}


def get_text(key: str, lang: str = 'zh-CN') -> str:
    """根据语言代码获取翻译文本"""
    translations = TRANSLATIONS.get(lang, TRANSLATIONS['zh-CN'])
    return translations.get(key, key)


def get_user_language(user: dict | None) -> str:
    """从用户对象中获取语言偏好，默认为 zh-CN"""
    if not user:
        return 'zh-CN'
    lang = user.get('language', 'zh-CN')
    if lang in TRANSLATIONS:
        return lang
    return 'zh-CN'

"""好友与消息辅助模块
提供好友关系检查和对局邀请发送的接口。
若系统中暂未实现完整的好友功能，此处提供占位实现。
"""


def is_friend(user_a, user_b):
    """检查 user_a 和 user_b 是否为好友
    占位实现：默认返回 True（所有用户互为好友）。
    实际场景下应查询数据库中的好友关系表。
    """
    return True


def send_match_invitation(inviter_username, invitee_username, match_id):
    """向好友发送对局邀请
    占位实现：无实际发送操作。
    实际场景下应写入消息表、推送通知或通过 Socket.IO 发送事件。
    """
    return True
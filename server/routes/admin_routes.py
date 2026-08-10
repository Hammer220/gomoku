"""管理后台路由模块
路由按功能拆分为子模块：
- user_management.py: 用户管理（查看、封禁、解封、积分、强制登出、注销、验证码、免密登录、密码修改）
- match_management.py: 对局监控（查看、关闭、重启、强制落子）
- batch_operations.py: 批量操作（批量封禁、解封、强制登出、注销）
- admin_management.py: 管理员管理（创建、权限设置、统计、记录）

统一注册到 admin_bp 蓝图
"""

from functools import wraps

from flask import Blueprint, jsonify

from ..models import remove_user_tokens

admin_bp = Blueprint('admin', __name__)


def require_permission(permission_field):
    """检查当前管理员是否有指定权限的装饰器"""

    def decorator(f):
        @wraps(f)
        def decorated(admin_user, *args, **kwargs):
            if not admin_user.get('isSuperAdmin') and not admin_user.get(permission_field, False):
                return jsonify({'error': '权限不足，请联系超级管理员'}), 403
            return f(admin_user, *args, **kwargs)

        return decorated

    return decorator


def _batch_operate(admin_user, usernames, operation, **kwargs):
    """批量操作用户的通用辅助函数"""
    import time

    from ..models import delete_user, get_user, save_user

    success_count = 0
    failed_count = 0

    for username in usernames:
        try:
            user = get_user(username)
            if not user:
                failed_count += 1
                continue
            if user.get('isSuperAdmin'):
                failed_count += 1
                continue
            if username == admin_user['username']:
                failed_count += 1
                continue

            if operation == 'ban':
                minutes = kwargs.get('minutes', 0)
                if minutes > 0:
                    user['bannedUntil'] = time.time() + minutes * 60
                else:
                    user['bannedUntil'] = None
                save_user(username, user)
                success_count += 1
            elif operation == 'unban':
                user['bannedUntil'] = None
                save_user(username, user)
                success_count += 1
            elif operation == 'kick':
                remove_user_tokens(username)
                success_count += 1
            elif operation == 'delete':
                delete_user(username)
                success_count += 1
        except Exception:  # noqa: BLE001
            failed_count += 1

    from .admin.user_management import _invalidate_admin_users_cache

    _invalidate_admin_users_cache()
    return success_count, failed_count


# 导入子模块路由
from .admin import (
    admin_management,  # noqa: F401
    batch_operations,  # noqa: F401
    match_management,  # noqa: F401
    user_management,  # noqa: F401
)
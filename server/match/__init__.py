"""对局管理模块
统一的对外接口，从各个子模块导入所有函数
"""

__all__ = [
    # 存储模块
    "CONNECT_TIMEOUT", "active_matches", "active_matches_lock",
    "cleanup_expired_matches", "cleanup_inactive_connections",
    "get_user_connection", "init_matches", "remove_user_connection",
    "save_matches", "start_cleanup_task", "update_user_connection",
    "user_connections", "user_connections_lock",
    # 管理员操作模块
    "force_close_all_matches", "force_close_match", "force_move", "force_restart_match",
    # 交互功能模块
    "accept_draw", "accept_undo", "decline_draw", "decline_undo",
    "get_spectatable_matches", "get_spectate_status", "leave_spectate",
    "request_draw", "request_undo", "resign", "spectate_match",
    # 核心操作模块
    "close_match", "create_match", "decline_restart", "get_match_status",
    "join_match", "leave_match", "make_move", "restart_match",
    # 查询与心跳模块
    "get_all_matches", "get_match_detail", "get_my_match",
    "get_user_current_match", "heartbeat", "list_active_matches",
    "list_available_matches",
]

# 存储模块
# 管理员操作模块
from .admin_ops import force_close_all_matches, force_close_match, force_move, force_restart_match

# 交互功能模块
from .interactions import (
    accept_draw,
    accept_undo,
    decline_draw,
    decline_undo,
    get_spectatable_matches,
    get_spectate_status,
    leave_spectate,
    request_draw,
    request_undo,
    resign,
    spectate_match,
)

# 核心操作模块
from .operations import (
    close_match,
    create_match,
    decline_restart,
    get_match_status,
    join_match,
    leave_match,
    make_move,
    restart_match,
)

# 查询与心跳模块
from .query import (
    get_all_matches,
    get_match_detail,
    get_my_match,
    get_user_current_match,
    heartbeat,
    list_active_matches,
    list_available_matches,
)
from .storage import (
    CONNECT_TIMEOUT,
    active_matches,
    active_matches_lock,
    cleanup_expired_matches,
    cleanup_inactive_connections,
    get_user_connection,
    init_matches,
    remove_user_connection,
    save_matches,
    start_cleanup_task,
    update_user_connection,
    user_connections,
    user_connections_lock,
)
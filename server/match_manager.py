"""联机对局管理模块
已拆分重构为 server/match/ 包下的多个模块：
- storage.py: 存储、持久化、连接管理、定期清理
- operations.py: 核心操作（创建、加入、落子、离开、关闭、重开）
- query.py: 查询、列表、心跳
- admin_ops.py: 管理员操作（强制关闭、强制重启、强制落子）
- interactions.py: 交互功能（悔棋、和棋、观战）

本文件保留兼容性导入，现有导入方式无需修改。
"""

from .match import (
    # 存储
    active_matches, active_matches_lock, user_connections, user_connections_lock,
    CONNECT_TIMEOUT, init_matches, save_matches,
    update_user_connection, get_user_connection, remove_user_connection,
    cleanup_expired_matches, cleanup_inactive_connections, start_cleanup_task,
    # 核心操作
    create_match, join_match, make_move, get_match_status,
    leave_match, close_match, restart_match, decline_restart,
    # 查询
    list_active_matches, get_user_current_match, heartbeat,
    get_my_match, list_available_matches, get_all_matches, get_match_detail,
    # 管理员操作
    force_close_match, force_close_all_matches, force_restart_match, force_move,
    # 交互
    request_undo, accept_undo, decline_undo,
    request_draw, accept_draw, decline_draw,
    get_spectatable_matches, spectate_match, leave_spectate, get_spectate_status
)
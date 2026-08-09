"""联机对局管理模块
已拆分重构为 server/match/ 包下的多个模块：
- storage.py: 存储、持久化、连接管理、定期清理
- operations.py: 核心操作（创建、加入、落子、离开、关闭、重开）
- query.py: 查询、列表、心跳
- admin_ops.py: 管理员操作（强制关闭、强制重启、强制落子）
- interactions.py: 交互功能（悔棋、和棋、观战）

本文件保留兼容性导入，现有导入方式无需修改。
"""

from .match import (  # noqa: F401
    CONNECT_TIMEOUT,
    accept_draw,
    accept_undo,
    active_matches,
    active_matches_lock,
    cleanup_expired_matches,
    cleanup_inactive_connections,
    close_match,
    create_match,
    decline_draw,
    decline_restart,
    decline_undo,
    force_close_all_matches,
    force_close_match,
    force_move,
    force_restart_match,
    get_all_matches,
    get_match_detail,
    get_match_status,
    get_my_match,
    get_spectatable_matches,
    get_spectate_status,
    get_user_connection,
    get_user_current_match,
    heartbeat,
    init_matches,
    join_match,
    leave_match,
    leave_spectate,
    list_active_matches,
    list_available_matches,
    make_move,
    remove_user_connection,
    request_draw,
    request_undo,
    resign,
    restart_match,
    save_matches,
    spectate_match,
    start_cleanup_task,
    update_user_connection,
    user_connections,
    user_connections_lock,
)
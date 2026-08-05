"""对局管理模块
统一的对外接口，从各个子模块导入所有函数
"""

# 存储模块
from .storage import (
    active_matches, active_matches_lock, user_connections, user_connections_lock,
    CONNECT_TIMEOUT, init_matches, save_matches,
    update_user_connection, get_user_connection, remove_user_connection,
    cleanup_expired_matches, cleanup_inactive_connections, start_cleanup_task
)

# 核心操作模块
from .operations import (
    create_match, join_match, make_move, get_match_status,
    leave_match, close_match, restart_match, decline_restart
)

# 查询与心跳模块
from .query import (
    list_active_matches, get_user_current_match, heartbeat,
    get_my_match, list_available_matches, get_all_matches, get_match_detail
)

# 管理员操作模块
from .admin_ops import (
    force_close_match, force_close_all_matches, force_restart_match, force_move
)

# 交互功能模块
from .interactions import (
    request_undo, accept_undo, decline_undo,
    request_draw, accept_draw, decline_draw,
    resign,
    get_spectatable_matches, spectate_match, leave_spectate, get_spectate_status
)
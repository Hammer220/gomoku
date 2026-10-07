"""对局存储模块
负责持久化存储、全局状态管理、连接状态管理和定期清理
"""

import json
import threading
import time
from typing import Any

from ..logger import logger

# RLock 允许同一线程多次进入 —— save_matches 自己也要持锁拷贝，而多数
# 业务调用方（operations.py / admin_ops.py 等）已经在外层持锁，避免死锁。
active_matches: dict[str, dict[str, Any]] = {}
active_matches_lock = threading.RLock()

user_connections: dict[str, dict[str, Any]] = {}
user_connections_lock = threading.Lock()
CONNECT_TIMEOUT = 120

room_chats: dict[str, list[dict[str, Any]]] = {}
room_chats_lock = threading.Lock()


def _notify_list_changed() -> None:
    """房间因清理/断线被移除后，通知所有客户端刷新大厅列表"""
    try:
        from .. import socketio

        socketio.push_match_list_changed()
    except Exception as e:  # noqa: BLE001
        logger.debug(f'notify list changed skipped: {e}')


def _build_match_event(match: dict[str, Any]) -> dict[str, Any]:
    """构建 Socket.IO 广播用的完整赛事数据（完整状态 + 轻量 match_activity）"""
    return {
        'match_id': match['id'],
        'id': match['id'],
        'status': match['status'],
        'board': [row[:] for row in match['board']],
        'currentPlayer': match['currentPlayer'],
        'moves': match['moves'][:],
        'winner': match.get('winner'),
        'creatorColor': match.get('creatorColor'),
        'creator': match.get('creator'),
        'opponent': match.get('opponent'),
        'timeMode': match.get('timeMode', 'untimed'),
        'blackTime': match.get('blackTime', 600),
        'whiteTime': match.get('whiteTime', 600),
        'moveDeadline': match.get('moveDeadline', 0),
        'totalTime': match.get('totalTime', 600),
        'moveTime': match.get('moveTime', 30),
        'restartRequested': match.get('restartRequested', False),
        'restartRequestedBy': match.get('restartRequestedBy'),
        'restartDeclinedBy': match.get('restartDeclinedBy'),
        'restartAccepted': match.get('restartAccepted', False),
        'restartInitiated': match.get('restartInitiated', False),
        'restartVersion': match.get('restartVersion', 0),
        'undoRequested': match.get('undoRequested', False),
        'undoRequestedBy': match.get('undoRequestedBy'),
        'undoAccepted': match.get('undoAccepted', False),
        'undoDeclined': match.get('undoDeclined', False),
        'undoDeclinedBy': match.get('undoDeclinedBy'),
        'drawRequested': match.get('drawRequested', False),
        'drawRequestedBy': match.get('drawRequestedBy'),
        'drawAccepted': match.get('drawAccepted', False),
        'drawDeclined': match.get('drawDeclined', False),
        'drawDeclinedBy': match.get('drawDeclinedBy'),
        'spectatorCount': len(match.get('spectators', [])),
        'ruleMode': match.get('ruleMode', 'standard'),
        'inviteOnly': match.get('inviteOnly', False),
        'invitedFriends': match.get('invitedFriends', []),
        'timestamp': time.time(),
    }


def broadcast_match_update(match_id: str) -> None:
    """统一的对局变更广播入口。

    向房间内玩家推送完整 match_updated，同时向全局广播轻量 match_activity
    （管理员监控面板等场景按需感知对局变化）。HTTP 路由层和 WebSocket handler
    都应调用本函数，避免出现管理员面板漏事件。
    """
    try:
        from .. import socketio

        with active_matches_lock:
            match = active_matches.get(match_id)
            event_data = _build_match_event(match) if match else None
        if event_data is not None:
            socketio.emit('match_updated', event_data, room=match_id)
        socketio.emit('match_activity', {'match_id': match_id})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'broadcast_match_update failed for match {match_id}: {e}')


def init_matches() -> None:
    from ..db import get_connection

    conn = get_connection()
    c = conn.cursor()

    c.execute('SELECT id, data FROM matches WHERE status NOT IN ("closed")')
    rows = c.fetchall()

    if rows:
        for row in rows:
            try:
                match_data: dict[str, Any] = json.loads(row['data'])
                active_matches[row['id']] = match_data
                if match_data['status'] == 'playing':
                    match_data['status'] = 'waiting'
            except json.JSONDecodeError:
                logger.error(f'Failed to parse match data for id {row["id"]}')
    else:
        try:
            from ..models import MATCHES_FILE, load_json_with_lock

            content: dict[str, dict[str, Any]] = load_json_with_lock(MATCHES_FILE, {})
            if content:
                for m_id, match in content.items():
                    active_matches[m_id] = match
                    if match.get('status') == 'playing':
                        match['status'] = 'waiting'
        except Exception as e:  # noqa: BLE001
            logger.error(f'Error loading matches from JSON: {e}')

    cleanup_expired_matches()


def save_matches() -> None:
    """持久化所有活跃对局。

    内部自行获取 active_matches_lock 并拷贝一次，与调用方是否持锁无关。
    使用 RLock 避免与外层持锁的调用方互相锁死。
    """
    from ..db import get_connection

    # 在锁内拷贝一份，避免遍历时被其他线程修改
    with active_matches_lock:
        snapshot = {mid: dict(m) for mid, m in active_matches.items()}

    if not snapshot:
        return

    try:
        conn = get_connection()
        c = conn.cursor()
        now = time.time()
        for match_id, match in snapshot.items():
            c.execute(
                """
                INSERT OR REPLACE INTO matches (id, data, status, start_time, last_activity, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    match_id,
                    json.dumps(match, ensure_ascii=False),
                    match.get('status', 'waiting'),
                    match.get('startTime', now),
                    match.get('lastActivity', now),
                    now,
                ),
            )
        conn.commit()
        logger.debug('Matches saved successfully to SQLite')
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error saving matches: {e}')


def update_user_connection(username: str) -> None:
    try:
        with user_connections_lock:
            user_connections[username] = {'lastHeartbeat': time.time(), 'isOnline': True}
        logger.debug(f'User connection updated: {username}')
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error updating user connection for {username}: {e}')


def get_user_connection(username: str) -> dict[str, Any] | None:
    try:
        with user_connections_lock:
            return user_connections.get(username)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error getting user connection for {username}: {e}')
        return None


def remove_user_connection(username: str) -> None:
    try:
        with user_connections_lock:
            if username in user_connections:
                del user_connections[username]
                logger.info(f'User connection removed: {username}')
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error removing user connection for {username}: {e}')


def cleanup_expired_matches() -> None:
    expired_matches: list[str] = []
    current_time = time.time()

    try:
        with active_matches_lock:
            for match_id, match in active_matches.items():
                try:
                    if 'startTime' in match and (current_time - match['startTime']) > 7200:
                        expired_matches.append(match_id)
                        logger.info(f'清理过期房间: {match_id}')
                    elif (
                        match.get('status') in ['closed', 'finished']
                        and 'startTime' in match
                        and (current_time - match['startTime']) > 3600
                    ):
                        expired_matches.append(match_id)
                        logger.info(f'清理已结束房间: {match_id}')
                except Exception as e:  # noqa: BLE001
                    logger.error(f'Error checking match {match_id}: {e}')

            for match_id in expired_matches:
                try:
                    del active_matches[match_id]
                    clear_room_chat(match_id)
                except Exception as e:  # noqa: BLE001
                    logger.error(f'Error deleting match {match_id}: {e}')

        if expired_matches:
            save_matches()
            from ..db import get_connection

            conn = get_connection()
            c = conn.cursor()
            c.execute(
                'DELETE FROM matches WHERE id IN ({})'.format(','.join('?' * len(expired_matches))), expired_matches
            )
            conn.commit()
            logger.info(f'Cleaned up {len(expired_matches)} expired matches')
            _notify_list_changed()
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error in cleanup_expired_matches: {e}')


def cleanup_inactive_connections() -> list[str]:
    current_time = time.time()
    inactive_users: list[str] = []

    try:
        with user_connections_lock:
            for username, conn in list(user_connections.items()):
                try:
                    if current_time - conn['lastHeartbeat'] > CONNECT_TIMEOUT:
                        inactive_users.append(username)
                except Exception as e:  # noqa: BLE001
                    logger.error(f'Error checking connection for {username}: {e}')

            for username in inactive_users:
                try:
                    del user_connections[username]
                    logger.info(f'清理超时连接: {username}')
                except Exception as e:  # noqa: BLE001
                    logger.error(f'Error removing connection for {username}: {e}')
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error in cleanup_inactive_connections: {e}')

    for username in inactive_users:
        handle_player_disconnect_from_match(username)

    return inactive_users


# 创建者断开连接时的宽限期（秒）—— 给页面刷新/导航时的 WebSocket 重连留时间
OWNER_DISCONNECT_GRACE_SECONDS = 8


def handle_player_disconnect_from_match(username: str) -> None:
    """处理玩家断开连接时的房间状态
    - waiting + 创建者断开 → 标记宽限期，不立即删除（等待重连）
    - waiting + 对手断开 → 直接删除房间
    - playing + 一方断开 → 立即判对手获胜（与 leave_match 逻辑一致）
    """
    try:
        with active_matches_lock:
            affected: list[str] = []
            grace_deadline = time.time() + OWNER_DISCONNECT_GRACE_SECONDS
            for match_id, match in list(active_matches.items()):
                status = match.get('status')
                if status not in ('waiting', 'playing'):
                    continue

                is_creator = match['creator'] == username
                is_opponent = match.get('opponent') == username

                if not is_creator and not is_opponent:
                    continue

                if status == 'waiting':
                    if is_creator:
                        # 宽限期：不立即删除，等重连
                        match['_owner_disconnect_deadline'] = grace_deadline
                        logger.info(
                            f'房间 {match_id} 创建者断开连接，宽限期 {OWNER_DISCONNECT_GRACE_SECONDS}s 后若无重连将删除'
                        )
                    else:
                        # 对手在 waiting 状态断开（极少发生），直接删除
                        del active_matches[match_id]
                        clear_room_chat(match_id)
                        affected.append(match_id)
                        logger.info(f'房间 {match_id} 对手断开连接，房间已删除')
                    continue

                # playing —— 直接判对手获胜
                opponent_wins = 2 if is_creator else 1
                match['winner'] = opponent_wins
                match['status'] = 'finished'
                match['finishedReason'] = 'opponent_left'
                match['lastActivity'] = time.time()
                match.pop('_owner_disconnect_deadline', None)
                affected.append(match_id)
                logger.info(f'玩家 {username} 断开连接，房间 {match_id} 判对手获胜')

            if affected:
                save_matches()

        for match_id in affected:
            broadcast_match_update(match_id)
            _notify_list_changed()
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error handling player disconnect from match: {e}')


def _check_owner_disconnect_deadlines() -> None:
    """检查创建者断开宽限期到期的 waiting 房间，执行删除。

    每 10 秒由 cleanup_loop 调用。到期前创建者成功重连（通过 join 或心跳）
    时 deadline 会被清除。
    """
    now = time.time()
    expired: list[str] = []

    with active_matches_lock:
        for match_id, match in list(active_matches.items()):
            deadline = match.get('_owner_disconnect_deadline', 0)
            if deadline > 0 and now > deadline and match.get('status') == 'waiting':
                del active_matches[match_id]
                clear_room_chat(match_id)
                expired.append(match_id)
                logger.info(f'宽限期到期，删除房间 {match_id}（创建者未重连）')

        if expired:
            save_matches()

    if expired:
        for match_id in expired:
            _notify_list_changed()


def _check_timeouts() -> None:
    """后台周期性扫描，对所有 playing 对局强制执行超时判负。

    之所以放在后台线程里，是因为原来的超时检测只在玩家主动落子时触发：
    如果对手一直挂起不走棋，moveDeadline 和总时间不会被检测到，对局会无限卡死。
    本函数每 ~10 秒跑一次，解决该问题。
    """
    now = time.time()
    timed_out: list[str] = []

    with active_matches_lock:
        for match_id, match in list(active_matches.items()):
            if match.get('status') != 'playing':
                continue
            time_mode = match.get('timeMode', 'untimed')
            if time_mode == 'untimed':
                continue

            current_player = match.get('currentPlayer', 1)

            # 每步限时
            if time_mode in ('move', 'both'):
                deadline = match.get('moveDeadline', 0)
                if deadline > 0 and now > deadline:
                    loser = current_player
                    winner = 2 if loser == 1 else 1
                    match['winner'] = winner
                    match['status'] = 'finished'
                    match['timeoutLoser'] = loser
                    match['timeoutReason'] = '走棋超时'
                    match['lastActivity'] = now
                    timed_out.append(match_id)
                    logger.info(f'后台超时（走棋）: match={match_id}, loser={loser}')
                    continue

            # 总时间耗尽
            if time_mode in ('total', 'both'):
                my_key = 'blackTime' if current_player == 1 else 'whiteTime'
                if match.get(my_key, 0) <= 0:
                    loser = current_player
                    winner = 2 if loser == 1 else 1
                    match['winner'] = winner
                    match['status'] = 'finished'
                    match['timeoutLoser'] = loser
                    match['timeoutReason'] = '总时间耗尽'
                    match['lastActivity'] = now
                    timed_out.append(match_id)
                    logger.info(f'后台超时（总时间）: match={match_id}, loser={loser}')

    if timed_out:
        save_matches()
        for match_id in timed_out:
            broadcast_match_update(match_id)


def start_cleanup_task() -> None:
    def cleanup_loop() -> None:
        last_expired_run = 0.0
        while True:
            time.sleep(10)
            try:
                _check_timeouts()
                _check_owner_disconnect_deadlines()
                # 每 300s 跑一次房间过期 + 连接清理
                now = time.time()
                if now - last_expired_run >= 300:
                    cleanup_expired_matches()
                    cleanup_inactive_connections()
                    last_expired_run = now
            except Exception as e:  # noqa: BLE001
                logger.error(f'清理任务异常: {e}')

    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()
    logger.info('后台清理任务已启动')


def get_active_matches_lock() -> threading.RLock:
    return active_matches_lock


def get_active_matches() -> dict[str, dict[str, Any]]:
    return active_matches


def add_room_chat_message(match_id: str, username: str, message: str) -> dict[str, Any] | None:
    """添加房间聊天消息"""
    try:
        with room_chats_lock:
            if match_id not in room_chats:
                room_chats[match_id] = []

            chat_msg: dict[str, Any] = {
                'id': len(room_chats[match_id]) + 1,
                'username': username,
                'message': message,
                'timestamp': int(time.time()),
            }
            room_chats[match_id].append(chat_msg)

            if len(room_chats[match_id]) > 100:
                room_chats[match_id] = room_chats[match_id][-100:]

        return chat_msg
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error adding room chat message: {e}')
        return None


def get_room_chat_messages(match_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """获取房间聊天消息"""
    try:
        with room_chats_lock:
            if match_id not in room_chats:
                return []

            messages = room_chats[match_id][-limit:]
            return messages[:]
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error getting room chat messages: {e}')
        return []


def clear_room_chat(match_id: str) -> None:
    """清除房间聊天记录"""
    try:
        with room_chats_lock:
            room_chats.pop(match_id, None)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Error clearing room chat: {e}')

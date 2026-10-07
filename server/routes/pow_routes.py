"""Cerberus 风格的 PoW（Proof-of-Work）验证码路由

协议：SHA-256 PoW
1. /api/pow/challenge 返回 challenge（随机 hex）和 difficulty（bit 难度）
2. 客户端对 challenge + nonce 连做 SHA-256，找到 hash 前 N bit 为 0 的 nonce
3. /api/pow/verify 用相同 challenge 重算并校验，返回一次性 session token
4. session token 有短 TTL，随登录/注册请求一起提交

设计目标：把 SJTUG/cerberus 风格的 "making sure you're not a bot" 验证页嵌进
现有登录流程，前端纯 JS 实现（Web Crypto API），无额外第三方依赖。
"""

import hashlib
import secrets
import threading
import time
from collections import OrderedDict

from flask import Blueprint, jsonify, request

from ..logger import logger

pow_bp = Blueprint('pow', __name__)

# ----------------------------- 配置 -----------------------------

# PoW 难度：前 DIFFICULTY 位必须为 0
# 本地开发可以降到 14；生产建议 16 ~ 18（每 +1，计算量 ×2）
from ..config import POW_DIFFICULTY
DIFFICULTY = POW_DIFFICULTY

# challenge / session token 的 TTL（秒）
CHALLENGE_TTL = 300   # 5 分钟
SESSION_TTL   = 600   # 10 分钟

# 内存存储（LRU，防止刷爆）
# 两个独立池，分别控 challenge 和已验证的 session
_MAX_CHALLENGES = 1024
_MAX_SESSIONS   = 4096

_challenges: "OrderedDict[str, tuple[str, float]]" = OrderedDict()  # token -> (challenge, expire_at)
_sessions:   "OrderedDict[str, float]"               = OrderedDict()  # token -> expire_at
_lock = threading.Lock()


def _now() -> float:
    return time.time()


def _lru_put(d: OrderedDict, key, value, max_size):
    if key in d:
        d.move_to_end(key)
    d[key] = value
    while len(d) > max_size:
        d.popitem(last=False)


def _expire_poll():
    """惰性清理过期条目（每次 API 调用触发）。"""
    now = _now()
    for d in (_challenges, _sessions):
        for k in list(d.keys()):
            try:
                exp = d[k] if isinstance(d[k], float) else d[k][1]
                if exp <= now:
                    d.pop(k, None)
                else:
                    break  # OrderedDict 保证按插入序，第一个未过期后面的都新鲜
            except KeyError:
                pass


# ----------------------------- PoW 校验核心 -----------------------------

def _hash_bits_zero(hex_hash: str, difficulty: int) -> bool:
    """检查十六进制 hash 字符串的前 `difficulty` 位是否为 0。"""
    # 把 hex 当成连续的 bit 串来切
    # 每 hex 字符 = 4 bit
    need_chars, need_bits = divmod(difficulty, 4)
    for i in range(need_chars):
        if i >= len(hex_hash):
            return False
        if hex_hash[i] != '0':
            return False
    if need_bits:
        if need_chars >= len(hex_hash):
            return False
        top = int(hex_hash[need_chars], 16)
        mask = (0xF << (4 - need_bits)) & 0xF
        if top & mask:
            return False
    return True


def verify_pow(challenge_hex: str, nonce: str, difficulty: int = DIFFICULTY) -> bool:
    """给定 challenge 和客户端发来的 nonce，校验 PoW。"""
    if not challenge_hex or not nonce:
        return False
    try:
        nonce_int = int(nonce)
    except (TypeError, ValueError):
        return False
    data = f"{challenge_hex}:{nonce_int}".encode()
    h = hashlib.sha256(data).hexdigest()
    return _hash_bits_zero(h, difficulty)


# ----------------------------- 路由 -----------------------------

@pow_bp.route('/api/pow/challenge', methods=['GET'])
def pow_challenge():
    """生成一次性 PoW challenge。

    返回：
        token     - 服务端跟踪用的会话标识（客户端后续 verify 时带回来）
        challenge - 随机 hex 字符串，客户端用来做哈希
        difficulty - bit 难度
        ttl       - 剩余有效秒数
    """
    with _lock:
        _expire_poll()
        token = secrets.token_hex(16)
        challenge = secrets.token_hex(32)
        expire = _now() + CHALLENGE_TTL
        _lru_put(_challenges, token, (challenge, expire), _MAX_CHALLENGES)
    return jsonify({
        'token': token,
        'challenge': challenge,
        'difficulty': DIFFICULTY,
        'ttl': CHALLENGE_TTL,
    })


@pow_bp.route('/api/pow/verify', methods=['POST'])
def pow_verify():
    """校验客户端 PoW 解。

    body: { token, challenge, nonce, difficulty }
    返回: { success, session }
        session  - 验证通过后返回的一次性短 token，后续登录/注册请求带它
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'error': 'invalid body'}), 400

    token = (data.get('token') or '').strip()
    challenge = (data.get('challenge') or '').strip()
    nonce = str(data.get('nonce') or '').strip()
    difficulty = int(data.get('difficulty') or DIFFICULTY)

    with _lock:
        _expire_poll()
        rec = _challenges.pop(token, None)

    if not rec:
        logger.warning('PoW verify: token missing or expired')
        return jsonify({'success': False, 'error': 'challenge expired'}), 400

    server_challenge, expire_at = rec
    if challenge != server_challenge:
        logger.warning('PoW verify: challenge mismatch')
        return jsonify({'success': False, 'error': 'challenge mismatch'}), 400

    if expire_at <= _now():
        return jsonify({'success': False, 'error': 'challenge expired'}), 400

    if difficulty > 24 or difficulty < 8:
        return jsonify({'success': False, 'error': 'difficulty out of range'}), 400

    if not verify_pow(server_challenge, nonce, difficulty):
        logger.warning(f'PoW verify: invalid nonce (token={token[:8]})')
        return jsonify({'success': False, 'error': 'invalid proof'}), 400

    # 验证通过 → 生成一次性 session token，后续登录/注册用它来"证明已经过 PoW"
    with _lock:
        _expire_poll()
        session = secrets.token_hex(16)
        _lru_put(_sessions, session, _now() + SESSION_TTL, _MAX_SESSIONS)

    logger.info(f'PoW verify: OK session={session[:8]}')
    return jsonify({'success': True, 'session': session, 'ttl': SESSION_TTL})


def consume_pow_session(session: str) -> bool:
    """业务层调用：一次性消耗 PoW session token。"""
    if not session:
        return False
    with _lock:
        _expire_poll()
        exp = _sessions.pop(session, None)
    if not exp:
        return False
    if exp <= _now():
        return False
    return True

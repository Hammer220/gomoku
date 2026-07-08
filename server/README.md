# 🖥️ 后端模块

Flask 后端服务，提供 REST API 和游戏逻辑处理。

## 📁 目录结构

```
server/
├── __init__.py              # Flask 应用工厂
├── config.py                # 配置管理（读取 config.ini）
├── models.py                # 数据模型（用户、记录、存档等）
├── auth.py                  # 认证与鉴权（Token、密码哈希）
├── game_logic.py            # 五子棋游戏规则（禁手、胜负判定）
├── match_manager.py         # 联机对局管理（房间创建、状态同步）
├── logger.py                # 日志模块（关键操作记录）
├── routes/                  # API 路由模块
│   ├── __init__.py          # 路由注册中心
│   ├── auth_routes.py       # 认证相关路由
│   ├── user_routes.py       # 用户相关路由
│   ├── admin_routes.py      # 管理员路由
│   ├── match_routes.py      # 联机对局路由
│   ├── game_routes.py       # 游戏逻辑路由
│   ├── static_routes.py     # 静态资源路由
│   └── message_routes.py    # 消息路由
└── match/                   # 联机匹配子模块
    ├── __init__.py
    ├── admin_ops.py         # 管理员对局操作
    ├── interactions.py      # 对局交互逻辑
    ├── operations.py        # 对局基础操作
    ├── query.py             # 对局查询
    └── storage.py           # 对局数据存储
```

## 🔧 核心模块说明

### config.py
- 读取 `config.ini` 配置文件
- 管理极验验证码配置、端口设置等

### models.py
- 定义用户、对战记录、存档、对局状态等数据结构
- 提供 JSON 文件读写操作封装

### auth.py
- Bearer Token 生成与验证
- SHA256 密码哈希处理
- 用户权限校验（普通用户/管理员/超级管理员）

### game_logic.py
- 标准 15×15 棋盘胜负判定（四方向五连检测）
- 黑棋禁手规则（三三禁手、四四禁手、长连禁手）
- 平局检测

### match_manager.py
- 联机房间创建、加入、关闭
- 实时状态同步与轮询管理
- 心跳保活与超时清理机制

### logger.py
- 关键操作日志记录（登录、注册、管理员操作等）
- 日志文件轮转与大小限制

## 📡 API 完整接口

所有需鉴权的接口均使用 **Bearer Token** 鉴权，在请求头中携带 `Authorization: Bearer <token>`。

### 🔐 认证模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/config` | GET | 无 | 获取前端验证码配置（极验 ID） |
| `/api/register` | POST | 无 | 注册新用户，需极验验证码 |
| `/api/login` | POST | 无 | 登录，返回 token，需极验验证码 |
| `/api/logout` | POST | Token | 退出登录，销毁当前 token |
| `/api/current_user` | GET | Token | 获取当前登录用户基本信息 |

### 👤 用户模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/profile` | GET | Token | 获取个人详细资料（积分、胜场、加入日期等） |
| `/api/profile/update` | POST | Token | 修改密码（需提供旧密码） |
| `/api/records` | GET | Token | 获取个人对战记录（最近 50 条） |
| `/api/records/add` | POST | Token | 添加一条对战记录，并自动更新积分/胜场 |
| `/api/records/<record_id>` | GET | Token | 获取指定对局记录详情（含棋谱，用于复盘） |
| `/api/saves` | GET | Token | 获取个人游戏存档列表（最近 20 条） |
| `/api/saves/save` | POST | Token | 保存当前棋局到服务器 |
| `/api/saves/<save_id>` | DELETE | Token | 删除指定存档 |
| `/api/settings` | GET | Token | 获取个人设置（棋盘颜色等） |
| `/api/settings` | POST | Token | 保存个人设置 |

### 🎮 游戏模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/leaderboard` | GET | Token | 获取全服排行榜（前 50 名，按积分降序） |
| `/api/statistics` | GET | Token | 获取个人统计数据（积分、胜场、对局数、胜率） |

### 🌐 联机对战模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/match/create` | POST | Token | 创建联机房间，返回房间号和创建者棋色 |
| `/api/match/join` | POST | Token | 加入指定房间，自动分配棋色 |
| `/api/match/move` | POST | Token | 在房间中落子 |
| `/api/match/status` | GET | Token | 获取房间状态（轮询，`?matchId=xxx`） |
| `/api/match/leave` | POST | Token | 离开房间 |
| `/api/match/close` | POST | Token | 关闭房间（仅创建者） |
| `/api/match/restart` | POST | Token | 请求重新开局（双方确认后重开） |
| `/api/match/my` | GET | Token | 获取当前所在的房间信息 |
| `/api/match/list` | GET | Token | 获取可加入的房间大厅列表 |
| `/api/match/heartbeat` | POST | Token | 心跳保活，维持在线状态 |

### 🛡️ 管理员模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/admin/users` | GET | 管理员 | 获取所有用户列表（含积分、胜场、封禁状态等） |
| `/api/admin/user/<username>` | GET | 管理员 | 获取指定用户详细信息 |
| `/api/admin/user/<username>/ban` | POST | 管理员 | 封禁/解封用户（`duration` 秒，0 为解封） |
| `/api/admin/user/<username>/score` | POST | 管理员 | 修改用户积分 |
| `/api/admin/user/<username>/admin` | POST | 超级管理员 | 设置/取消普通管理员权限 |
| `/api/admin/change_password` | POST | 管理员 | 管理员修改用户密码 |
| `/api/admin/set_captcha` | POST | 管理员 | 设置用户是否需要验证码 |
| `/api/admin/set_password_free` | POST | 管理员 | 设置用户免密登录权限和次数 |
| `/api/admin/create_admin` | POST | 超级管理员 | 创建新管理员账号 |
| `/api/admin/set_permission` | POST | 超级管理员 | 设置管理员管理权限（启用/禁用） |
| `/api/admin/matches` | GET | 管理员 | 获取所有联机房间列表 |
| `/api/admin/match/<match_id>` | GET | 管理员 | 获取指定房间详情（含实时棋盘） |
| `/api/admin/match/<match_id>/close` | POST | 管理员 | 强制关闭指定房间 |
| `/api/admin/matches/close-all` | POST | 管理员 | 强制关闭所有房间 |
| `/api/admin/match/<match_id>/restart` | POST | 管理员 | 强制重新开始指定房间 |
| `/api/admin/match/<match_id>/force-move` | POST | 管理员 | 强制落子（无视回合，需传 `row`/`col`/`player`） |
| `/api/admin/stats` | GET | 管理员 | 获取平台统计（总用户数、总对局数） |
| `/api/admin/records` | GET | 管理员 | 获取所有对战记录 |

### 🔑 鉴权说明

- **Token**：普通用户登录后获取的 Bearer Token，可访问个人和游戏相关接口
- **管理员**：需 `isAdmin=True` 或 `isSuperAdmin=True`，可管理普通用户和对局
- **超级管理员**：仅 `isSuperAdmin=True`，可管理管理员权限，无法被普通管理员操作

## 💾 数据存储

所有数据以 JSON 文件存储在 `data/` 目录：

| 文件 | 内容 |
| --- | --- |
| `users.json` | 用户信息（积分、战绩、权限） |
| `password.json` | 明文密码（方便管理） |
| `tokens.json` | 登录 token |
| `records.json` | 每局对战记录 |
| `saves.json` | 存档数据 |
| `matches.json` | 联机对局实时状态 |
| `settings.json` | 棋盘颜色设置 |

### 数据安全

- 文件锁保护：读写 JSON 文件时加线程锁，防止并发数据损坏
- 内存缓存：用户信息、token 30 秒缓存，大幅减少磁盘 IO
- 备份机制：数据写入失败时自动创建备份文件
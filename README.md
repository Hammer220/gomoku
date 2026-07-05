# 🎯 五子棋 · 全能联机对战平台

<sub>注：本项目部分为 AI 生成</sub>

> **仓库**：[Gitee](https://gitee.com/Guoguo220/gomoku) | [GitHub](https://github.com/Hammer220/gomoku)

> 现代 Web 五子棋 —— AI 对战 · 好友联机 · 全功能管理后台\
> **一台服务器，你和你的朋友随时开战！**

[![Python](https://img.shields.io/badge/Python-3.7+-3776AB.svg?style=flat\&logo=python\&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-000000.svg?style=flat\&logo=flask)](https://flask.palletsprojects.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E.svg?style=flat\&logo=javascript\&logoColor=black)](https://developer.mozilla.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Hammer220/gomoku?style=social)](https://github.com/Hammer220/gomoku)

## 🎮 完整在线试玩：<https://hammer2026.eu.pythonanywhere.com>

> **📝 示例账号**：
>
> - 普通管理员：`test1` / `123456`
> - 普通用户：`test2` / `123456`
> - 也可以自己创建账号登录
> - 超级管理员账号暂时不公开

## 🌐 静态版在线体验（GitHub Pages）

您可以直接访问 **<https://hammer220.github.io/gomoku/>** 体验本项目的静态版。
> - 无需登录直接体验
> - 国内访问较慢且不稳定，建议在海外访问

***

## ✨ 核心亮点

- 🎮 **三种对战模式**：人机 AI（三档难度）、双人同机、**全网联机对战**
- 🤖 **聪明 AI**：简单/中等/困难，后发制人也会主动进攻
- 🏆 **积分系统 + 战绩统计**：胜场、积分、对局次数，激励每一场胜利
- 👥 **完整的用户系统**：注册 / 登录 / 修改密码 / 封禁 / 权限分级
- 🔐 **管理员后台**：
  - 查看所有用户的**明文密码**（方便找回）
  - 封禁 / 解封 / 强制登出 / 注销用户
  - **批量操作**（批量封禁、批量删除…）
  - 创建普通管理员，并可**单独禁用其管理权限**
  - 实时监控所有联机对局，**强制落子、强制关闭房间**
- 🌍 **联机对战全功能**：
  - 创建房间 / 加入房间 / 房间大厅
  - 实时状态轮询，**断线自动重连**
  - 房间创建者可**关闭房间 / 重新开局**
- 🖼️ **自动轮换棋盘背景**：见"picture/"文件夹的README.md文件
- 🎨 **超级管理员可自定义棋盘颜色**（线条色 / 星位色），保存到服务器
- 💾 **存档系统**：随时保存对局，下次继续挑战
- 📊 **个人数据看板**：积分变化、胜率统计、历史对局记录
- ⚡ **高性能缓存 + 文件锁**：高并发下数据不损坏，实时同步玩家状态

***

***

## 🚀 快速开始（三步跑起来）

### 1️⃣ 克隆仓库

```bash
git clone https://github.com/Hammer220/gomoku.git
cd gomoku
```

### 2️⃣ 安装依赖

```bash
pip install flask
```

> 仅需 Flask，无需数据库，所有数据存储在 `data/` 文件夹（JSON 格式）

### 3️⃣ 启动服务器

```bash
python3 app.py
```

终端会输出：

```
管理员账号: admin
管理员密码: “随机生成”
服务器启动: http://localhost:8000
```

> 超级管理员 `admin` 的**随机密码**保存在 `data/password.json`，第一次启动自动生成。

打开浏览器访问 `http://localhost:8000`，开始你的棋局！

***

## 🎯 核心玩法介绍

### 🧠 人机对战

- **简单**：随机落子，适合新手
- **中等**：防守 + 进攻，会堵你活四
- **困难**：深度评估局面，攻守兼备

### 👥 双人对战

- 同一台设备两人轮流落子，适合面对面切磋

### 🌐 联机对战（重点）

1. 点击「联机对战」→「创建房间」→ 把房间号发给朋友
2. 朋友在「输入房间号」加入，系统随机分配黑白棋
3. **实时轮询同步**：每一步、对局状态、胜利 / 平局实时更新
4. 创建者可「重新开始」或「关闭房间」
5. 离开房间后可随时查看大厅其他可加入房间

### 🧑‍💼 管理员能力（登录 admin）

#### 基础管理操作

- 查看所有用户**积分、胜场、明文密码**
- 封禁用户（指定分钟）、解封、强制登出、注销账号
- 修改任意用户的密码（普通管理员不可修改超级管理员）

#### 批量管理（省时利器）

- 勾选多个用户 → 批量封禁 / 解封 / 登出 / 注销
- 适合清理机器人或活动处罚

#### 管理员账号体系

- 超级管理员 `admin` 可创建**普通管理员**
- 普通管理员可管理普通用户，但**无法管理超级管理员**
- 超级管理员可随时**禁用某普通管理员的管理权限**（保留登录但不可操作后台）

#### 联机对局监控（仅超级管理员）

- 查看当前所有房间（房间号、创建者、对手、步数、状态）
- **点击房间**，右侧显示实时棋盘
- **强制落子**（无视回合，黑/白任意落）
- **强制关闭房间**，立即解散对局

#### 棋盘外观定制

- 修改棋盘线条颜色、星位点颜色
- 设置保存至服务器，下次登录自动加载

***

## 🗂️ 项目结构

```
gomoku/
├── app.py                  # 应用入口文件
├── config.ini              # 配置文件（极验、Turnstile、端口等）
├── requirements.txt        # Python 依赖
├── server/                 # 后端模块
│   ├── __init__.py         # Flask 应用工厂
│   ├── config.py           # 配置管理
│   ├── models.py           # 数据模型（用户、记录、存档等）
│   ├── auth.py             # 认证与鉴权
│   ├── game_logic.py       # 五子棋游戏规则（禁手、胜负判定）
│   ├── match_manager.py    # 联机对局管理
│   ├── logger.py           # 日志模块
│   └── routes/             # API 路由模块
│       ├── __init__.py     # 路由注册中心
│       ├── auth_routes.py  # 认证相关路由
│       ├── user_routes.py  # 用户相关路由
│       ├── admin_routes.py # 管理员路由
│       ├── match_routes.py # 联机对局路由
│       ├── game_routes.py  # 游戏逻辑路由
│       └── static_routes.py# 静态资源路由
├── templates/              # 前端模板
│   ├── index.html          # 主页面
│   └── includes/           # 模板组件
│       ├── modals.html     # 模态框（登录/注册/验证）
│       ├── game.html       # 主游戏容器
│       ├── game_content.html# 本地对战界面
│       ├── online.html     # 联机对战界面
│       ├── profile.html    # 个人资料
│       ├── history.html    # 历史记录
│       ├── stats.html      # 数据统计
│       ├── leaderboard.html# 排行榜
│       ├── admin.html      # 管理后台
│       └── components.html # 可复用组件
├── static/                 # 静态资源
│   ├── js/
│   │   ├── gomoku.js       # 前端核心逻辑
│   │   └── tailwind.min.js # Tailwind CSS
│   ├── css/
│   │   └── font-awesome.min.css
│   └── webfonts/           # Font Awesome 字体
├── data/                   # 运行时自动生成
│   ├── users.json          # 用户信息（积分、战绩、权限）
│   ├── password.json       # 明文密码（方便管理）
│   ├── tokens.json         # 登录 token
│   ├── records.json        # 每局对战记录
│   ├── saves.json          # 存档数据
│   ├── matches.json        # 联机对局实时状态
│   └── settings.json       # 棋盘颜色设置
├── picture/                # 棋盘背景图文件夹（可选）
│   ├── 布纹.jpg
│   ├── 木纹.jpg
│   └── ...                 # 支持自定义背景图片
└── README.md               # 就是这个文件
```

***

## 🔧 技术栈 & 亮点

| 技术                | 用途                              |
| ----------------- | ------------------------------- |
| **Flask**         | 轻量级后端，提供 REST API               |
| **原生 JavaScript** | 前端无框架，性能优越                      |
| **Canvas 绘制**     | 棋盘 / 棋子 / 动画效果                  |
| **文件系统 + 锁**      | 无数据库，JSON 存储 + 线程锁保证数据安全        |
| **内存缓存**          | 用户信息、token 30 秒缓存，大幅减少磁盘 IO     |
| **轮询机制**          | 联机状态 1 秒刷新，保证实时性且简单可靠           |
| **哈希存储密码**        | SHA256 加密，明文密码仅管理员可见            |
| **响应式布局**         | TailwindCSS + 自适应画布，手机 / PC 都完美 |

***

## 📡 API 完整接口

> 所有需鉴权的接口均使用 **Bearer Token** 鉴权，在请求头中携带 `Authorization: Bearer <token>`。

### 🔐 认证模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/config` | GET | 无 | 获取前端验证码配置（极验 ID、Turnstile Key） |
| `/api/config/full` | GET | 无 | 获取完整配置（含密钥，仅调试用） |
| `/api/register` | POST | 无 | 注册新用户，需 Turnstile 或极验验证码 |
| `/api/login` | POST | 无 | 登录，返回 token，需验证码 |
| `/api/logout` | POST | Token | 退出登录，销毁当前 token |
| `/api/current_user` | GET | Token | 获取当前登录用户基本信息 |
| `/api/verify-turnstile` | POST | 无 | 单独验证 Turnstile 令牌 |

### 👤 用户模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/profile` | GET | Token | 获取个人详细资料（积分、胜场、加入日期等） |
| `/api/profile/update` | POST | Token | 修改密码（需提供旧密码） |
| `/api/records` | GET | Token | 获取个人对战记录（最近 50 条） |
| `/api/records/add` | POST | Token | 添加一条对战记录，并自动更新积分/胜场 |
| `/api/saves` | GET | Token | 获取个人游戏存档列表（最近 20 条） |
| `/api/saves/save` | POST | Token | 保存当前棋局到服务器 |
| `/api/saves/<save_id>` | DELETE | Token | 删除指定存档 |
| `/api/settings` | GET | Token | 获取个人设置（棋盘颜色等） |
| `/api/settings` | POST | Token | 保存个人设置 |

### 🎮 游戏模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/leaderboard` | GET | Token | 获取全服排行榜（前 50 名，按积分降序） |
| `/api/stats` | GET | Token | 获取个人统计数据（积分、胜场、对局数） |
| `/api/ai/move` | POST | Token | AI 计算落子（传入棋盘和当前玩家） |

### 🌐 联机对战模块

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/match/create` | POST | Token | 创建联机房间，返回房间号和创建者棋色 |
| `/api/match/join` | POST | Token | 加入指定房间，自动分配棋色 |
| `/api/match/move` | POST | Token | 在房间中落子 |
| `/api/match/status` | GET | Token | 获取房间状态（轮询，`?matchId=xxx`） |
| `/api/match/leave` | POST | Token | 离开房间 |
| `/api/match/close` | POST | Token | 关闭房间（仅创建者） |
| `/api/match/restart` | POST | Token | 请求重新开局（仅创建者） |
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
| `/api/admin/matches` | GET | 管理员 | 获取所有联机房间列表 |
| `/api/admin/match/<match_id>` | GET | 管理员 | 获取指定房间详情（含实时棋盘） |
| `/api/admin/match/<match_id>/close` | POST | 管理员 | 强制关闭指定房间 |
| `/api/admin/matches/close-all` | POST | 管理员 | 强制关闭所有房间 |
| `/api/admin/match/<match_id>/restart` | POST | 管理员 | 强制重新开始指定房间 |
| `/api/admin/match/<match_id>/force-move` | POST | 管理员 | 强制落子（无视回合，需传 `row`/`col`/`player`） |
| `/api/admin/stats` | GET | 管理员 | 获取平台统计（总用户数、总对局数） |
| `/api/admin/records` | GET | 管理员 | 获取所有对战记录（最近 100 条） |

### 🔑 鉴权说明

- **Token**：普通用户登录后获取的 Bearer Token，可访问个人和游戏相关接口
- **管理员**：需 `isAdmin=True` 或 `isSuperAdmin=True`，可管理普通用户和对局
- **超级管理员**：仅 `isSuperAdmin=True`，可管理管理员权限，无法被普通管理员操作

***

## 💡 一些你可能不知道的细腻设计

- **悔棋限制**：每局最多 3 次，避免滥用
- **胜利高亮**：连成五子时，那五颗棋子会闪烁高亮
- **超时清理**：联机房间 1 小时无活动自动关闭并清理
- **自动端口切换**：8000 被占用时自动尝试 8001\~8010
- **跨平台**：Windows / macOS / Linux 均测试通过
- **离线存储**：登录 token 保存在 localStorage，刷新页面不用重新登录

***

## 📦 如何为项目贡献代码？

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交修改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

**建议改进方向**：

- WebSocket 替代轮询（提升实时性）
- 提供 Docker 镜像
- 增加棋谱回放功能
- 排行榜系统

***

## ❓ 常见问题

**Q：忘记 admin 密码怎么办？**\
A：删除 `data/` 文件夹，重启 `app.py` 会自动重新生成随机密码，并打印在终端。

**Q：普通管理员被封禁权限后还能做什么？**\
A：可以正常游戏、修改自己的资料，但无法打开管理后台，也无法进行任何管理操作。

**Q：联机对战有房间列表上限吗？**\
A：无上限，创建的房间会一直保存直到手动关闭或超时清理。

**Q：棋盘背景图怎么换？**\
A：在 `picture/` 目录下放入 `picture1.png` \~ `picture99.png`，系统自动识别并随机轮换。若文件夹为空，则使用纯色木质背景。

**Q：数据会丢失吗？**\
A：所有数据以 JSON 形式持久化到硬盘，正常关闭服务器不丢失。建议定期备份 `data/` 文件夹。

***

## 🏆 致谢 & 开源协议

本项目基于 **MIT 许可证** 开源，你可以自由使用、修改、商用，但请保留原始版权声明。

如果这个项目让你觉得有趣或者有用，\
**请点右上角 ⭐ Star**，支持作者持续更新 💪\
也欢迎分享给更多棋友！

***

## 📬 联系方式

- 作者：Hammer
- Issue / PR：随时欢迎！

***

**现在就去下一盘吧 —— 无论是挑战 AI，还是邀请好友来一场痛快的联机！**\
🎲 **祝您棋开得胜，五子连珠！** 🎲
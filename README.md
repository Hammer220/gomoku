# 🎯 五子棋 · 全能联机对战平台

> 现代 Web 五子棋 —— AI 对战 · 好友联机 · 全功能管理后台\
> **一台服务器，你和你的朋友随时开战！**

[![Python](https://img.shields.io/badge/Python-3.7+-3776AB.svg?style=flat\&logo=python\&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-000000.svg?style=flat\&logo=flask)](https://flask.palletsprojects.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E.svg?style=flat\&logo=javascript\&logoColor=black)](https://developer.mozilla.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Hammer220/gomoku?style=social)](https://github.com/Hammer220/gomoku)

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
- 🖼️ **自动轮换棋盘背景**：`picture/` 文件夹放任意 `picture1.png ~ picture99.png`，自动识别并轮播
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
python server.py
```

终端会输出：

```
管理员账号: admin
管理员密码: xK9mP2qL
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
├── server.py           # Flask 后端，提供完整 API
├── gomoku.html         # 单页面前端（所有界面、逻辑）
├── data/               # 运行时自动生成
│   ├── users.json      # 用户信息（积分、战绩、权限）
│   ├── password.json   # 明文密码（方便管理）
│   ├── tokens.json     # 登录 token
│   ├── records.json    # 每局对战记录
│   ├── saves.json      # 存档数据
│   ├── matches.json    # 联机对局实时状态
│   └── settings.json   # 棋盘颜色设置
├── picture/            # 棋盘背景图文件夹（可选）
│   ├── picture1.png
│   ├── picture2.png
│   └── ...             # 支持到 picture99.png，自动轮换
└── README.md           # 就是这个文件
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

## 📡 API 简要（部分）

| 端点                          | 方法   | 说明                |
| --------------------------- | ---- | ----------------- |
| `/api/register`             | POST | 注册新用户             |
| `/api/login`                | POST | 登录，返回 token       |
| `/api/user`                 | GET  | 获取当前用户信息（需 token） |
| `/api/match/create`         | POST | 创建联机房间            |
| `/api/match/join`           | POST | 加入房间              |
| `/api/match/move`           | POST | 落子                |
| `/api/match/status/<id>`    | GET  | 获取房间状态（轮询）        |
| `/api/admin/users`          | GET  | 管理员获取所有用户（含明文密码）  |
| `/api/admin/ban`            | POST | 封禁用户              |
| `/api/admin/batch_ban`      | POST | 批量封禁              |
| `/api/admin/set_permission` | POST | 超级管理员禁用/启用普通管理员权限 |

> 完整 API 见代码，所有接口均支持 Bearer Token 鉴权。

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
A：删除 `data/` 文件夹，重启 `server.py` 会自动重新生成随机密码，并打印在终端。

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

- 作者：Hammer220
- 项目地址：<https://github.com/Hammer220/gomoku>
- Issue / PR：随时欢迎！

***

**现在就去下一盘吧 —— 无论是挑战 AI，还是邀请好友来一场痛快的联机！**\
🎲 **祝您棋开得胜，五子连珠！** 🎲

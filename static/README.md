# 🎨 前端静态资源

前端 JavaScript、CSS 和字体资源，采用命名空间模块化设计。

## 📁 目录结构

```
static/
├── js/
│   ├── gomoku/               # 前端核心模块（命名空间模式）
│   │   ├── core.js           # 核心常量与全局状态
│   │   ├── utils.js          # 工具函数（Toast、API 调用）
│   │   ├── board.js          # 棋盘渲染与胜负判定
│   │   ├── board_render.js   # 棋盘渲染细节
│   │   ├── board_rules.js    # 棋盘规则判定
│   │   ├── ai.js             # AI 对手逻辑
│   │   ├── captcha.js        # 验证码（极验）
│   │   ├── game.js           # 游戏流程控制
│   │   ├── game_core.js      # 游戏核心逻辑
│   │   ├── game_ui.js        # 游戏界面控制
│   │   ├── online.js         # 联机对战
│   │   ├── user.js           # 用户认证与资料管理
│   │   ├── admin.js          # 管理功能（含复盘、背景管理）
│   │   ├── replay.js         # 棋谱复盘
│   │   ├── replay_canvas.js  # 复盘画布渲染
│   │   ├── replay_controls.js# 复盘控制按钮
│   │   ├── messages.js       # 消息功能
│   │   ├── background_settings.js # 背景设置
│   │   ├── history_stats.js  # 历史记录与统计
│   │   ├── init.js           # 初始化入口与事件绑定
│   │   ├── init_game.js      # 游戏页初始化
│   │   ├── init_login.js     # 登录页初始化
│   │   ├── init_user.js      # 用户页初始化
│   │   ├── init_admin.js     # 管理页初始化
│   │   ├── init/             # 初始化子模块
│   │   │   ├── admin.js      # 管理后台初始化
│   │   │   ├── auth.js       # 认证初始化
│   │   │   ├── game.js       # 游戏初始化
│   │   │   └── settings.js   # 设置初始化
│   │   ├── init_game/        # 游戏初始化子模块
│   │   │   ├── actions.js    # 游戏动作处理
│   │   │   ├── admin.js      # 游戏管理功能
│   │   │   ├── admin_match.js# 对局管理
│   │   │   ├── modes.js      # 游戏模式切换
│   │   │   └── settings.js   # 游戏设置
│   │   ├── online/           # 联机对战子模块
│   │   │   ├── interactions.js # 交互逻辑
│   │   │   ├── polling.js    # 轮询机制
│   │   │   ├── room_actions.js # 房间操作
│   │   │   ├── room_list.js  # 房间列表
│   │   │   └── timer.js      # 计时功能
│   │   └── user_management/  # 用户管理子模块
│   │       ├── modals.js     # 模态框管理
│   │       ├── pagination.js # 分页功能
│   │       ├── records_admin.js # 记录管理
│   │       └── users.js      # 用户管理
│   ├── chart.min.js          # 图表库
│   └── tailwind.min.js       # Tailwind CSS
├── css/
│   └── font-awesome.min.css  # Font Awesome 图标样式
└── webfonts/                 # Font Awesome 字体文件
    ├── fa-brands-400.ttf/woff/woff2
    ├── fa-regular-400.ttf/woff/woff2
    ├── fa-solid-900.ttf/woff/woff2
    └── fa-v4compatibility.ttf/woff2
```

## 🧩 核心模块说明

### core.js
- 定义游戏核心常量（棋盘大小、棋子颜色等）
- 维护全局状态（当前模式、用户信息、游戏状态）

### utils.js
- Toast 提示组件
- API 调用封装（统一处理 Token、错误处理）
- 工具函数（日期格式化、数组操作等）

### board.js / board_render.js / board_rules.js
- 棋盘 Canvas 绘制（网格线、星位点、棋子渲染）
- 棋子渐变效果（黑棋高光/白棋高光，带阴影）
- 胜负判定（四方向五连检测、平局检测）
- 禁手规则判定（三三禁手、四四禁手、长连禁手）
- 响应式棋盘（自适应容器、窗口缩放自动重绘）

### ai.js
- AI 对手逻辑
- 三种难度：简单（优先赢棋+堵活三+随机）、中等（位置评估+攻守平衡）、困难（深度搜索+模拟对手最优应对）
- 活三检测与禁手规避

### game.js / game_core.js / game_ui.js
- 游戏流程控制（落子、悔棋、重新开始）
- 游戏模式管理（人机对战、双人对战、联机对战）
- 界面交互与状态更新

### online.js
- 联机对战逻辑（创建房间、加入房间、状态同步）
- 实时轮询同步（0.8 秒轮询间隔）
- 断线重连机制（指数退避重试）

### admin.js
- 管理后台功能（用户管理、对局监控）
- 棋谱复盘（逐步播放、自动播放、速度调节）
- 棋盘外观定制（背景切换、颜色设置）

### replay.js / replay_canvas.js / replay_controls.js
- 棋谱复盘功能
- 逐步播放（上一步/下一步）
- 自动播放与速度调节
- 步数显示与坐标标签

## 🏗️ 架构设计

### 命名空间模式
前端使用 `window.Gomoku` 全局命名空间，各模块通过 IIFE 封装，避免全局变量污染。

### 模块依赖关系

```
core.js (基础常量)
    ├── utils.js (工具函数)
    ├── board.js (棋盘逻辑)
    │   ├── board_render.js (渲染)
    │   └── board_rules.js (规则)
    ├── game_core.js (游戏核心)
    │   ├── ai.js (AI 对手)
    │   ├── game.js (游戏流程)
    │   └── game_ui.js (界面)
    ├── online.js (联机对战)
    │   └── online/ (子模块)
    ├── admin.js (管理功能)
    │   └── user_management/ (子模块)
    ├── replay.js (复盘)
    └── init.js (初始化)
        ├── init_game.js
        ├── init_login.js
        ├── init_user.js
        └── init_admin.js
```

### 初始化流程

1. `init.js` 作为入口，绑定全局事件
2. 根据当前页面调用对应的初始化模块：
   - 登录页 → `init_login.js`
   - 游戏页 → `init_game.js`
   - 用户页 → `init_user.js`
   - 管理页 → `init_admin.js`

## 🎨 技术特性

- **响应式布局**：TailwindCSS + ResizeObserver 自适应画布
- **Canvas 高 DPI 适配**：支持 Retina 显示屏，像素比自动适配
- **模块化设计**：IIFE 封装，命名空间隔离
- **事件驱动**：基于事件的状态管理，模块间低耦合

## 📊 第三方依赖

| 库 | 用途 | 版本 |
| --- | --- | --- |
| **Tailwind CSS** | 响应式样式框架 | 最新 |
| **Font Awesome** | 图标库 | 4.x |
| **Chart.js** | 数据可视化图表 | 最新 |
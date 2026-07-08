# 📄 前端模板

Flask Jinja2 模板文件，用于渲染 HTML 页面。

## 📁 目录结构

```
templates/
├── index.html               # 主页面（整合所有功能）
├── login.html               # 登录/注册页面
├── game.html                # 游戏页面
├── user.html                # 用户页面
├── admin.html               # 管理页面
├── messages.html            # 消息页面
└── includes/                # 模板组件（供主模板引用）
    ├── admin.html           # 管理后台组件
    ├── board_color.html     # 棋盘颜色设置组件
    ├── components.html      # 可复用组件
    ├── game.html            # 主游戏容器
    ├── game_content.html    # 本地对战界面
    ├── history.html         # 历史记录组件
    ├── leaderboard.html     # 排行榜组件
    ├── modals.html          # 模态框（登录/注册/验证）
    ├── online.html          # 联机对战界面
    ├── profile.html         # 个人资料组件
    └── stats.html           # 数据统计组件
```

## 📋 模板说明

### 主模板文件

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `index.html` | 主页面 | 整合游戏、联机、个人资料等所有功能的单页应用 |
| `login.html` | 登录/注册 | 用户登录和注册页面，包含极验验证码 |
| `game.html` | 游戏页面 | 独立游戏页面，支持人机对战、双人对战 |
| `user.html` | 用户页面 | 用户个人中心，包含资料、历史记录、统计 |
| `admin.html` | 管理页面 | 管理员后台，包含用户管理、对局监控 |
| `messages.html` | 消息页面 | 消息通知页面 |

### 组件模板（includes/）

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `components.html` | 通用组件 | 可复用的 UI 组件（按钮、卡片、表单等） |
| `modals.html` | 模态框 | 登录/注册/验证等模态框组件 |
| `game.html` | 游戏容器 | 主游戏区域，包含棋盘和控制按钮 |
| `game_content.html` | 本地对战 | 人机对战和双人对战的界面内容 |
| `online.html` | 联机对战 | 联机对战界面（房间列表、创建/加入房间） |
| `profile.html` | 个人资料 | 用户个人信息展示（积分、胜场、加入日期等） |
| `history.html` | 历史记录 | 对战记录列表，支持筛选和分页 |
| `stats.html` | 数据统计 | 个人统计数据（胜率、对局数等） |
| `leaderboard.html` | 排行榜 | 全服积分排行榜 |
| `admin.html` | 管理后台 | 管理员功能界面（用户管理、权限控制） |
| `board_color.html` | 棋盘设置 | 棋盘颜色和外观设置面板 |

## 🏗️ 模板架构

### 模板继承关系

```
index.html (主页面)
├── includes/components.html (通用组件)
├── includes/modals.html (模态框)
├── includes/game.html (游戏区域)
│   └── includes/game_content.html (本地对战)
├── includes/online.html (联机对战)
├── includes/profile.html (个人资料)
├── includes/history.html (历史记录)
├── includes/stats.html (统计数据)
├── includes/leaderboard.html (排行榜)
└── includes/admin.html (管理后台)
    └── includes/board_color.html (棋盘设置)
```

### 主要页面结构

#### index.html（主页面）

```
┌─────────────────────────────────────┐
│          导航栏（标签页切换）          │
│  游戏 │ 联机 │ 个人资料 │ 历史记录 │ 统计 │ 排行榜 │ 管理 │
├─────────────────────────────────────┤
│                                     │
│          主内容区域（动态切换）        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │         棋盘/内容区          │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│          底部状态栏                  │
│  当前用户 | 积分 | 在线状态          │
└─────────────────────────────────────┘
```

#### login.html（登录页面）

```
┌─────────────────────────────────────┐
│                                     │
│           登录/注册表单              │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   用户名输入框               │    │
│  │   密码输入框                 │    │
│  │   极验验证码                 │    │
│  │   登录/注册按钮              │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 模板变量

#### 全局变量

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `current_user` | dict | 当前登录用户信息 |
| `is_admin` | bool | 是否为管理员 |
| `is_super_admin` | bool | 是否为超级管理员 |
| `captcha_id` | string | 极验验证码 ID |

#### 页面特定变量

**game.html**
| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `game_mode` | string | 游戏模式（ai/pvp/online） |
| `difficulty` | string | AI 难度（easy/medium/hard） |

**user.html**
| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `profile` | dict | 用户详细资料 |
| `statistics` | dict | 用户统计数据 |
| `records` | list | 用户对战记录 |

**admin.html**
| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `users` | list | 所有用户列表 |
| `matches` | list | 所有联机房间 |
| `platform_stats` | dict | 平台统计数据 |

## 🎨 样式框架

模板使用 TailwindCSS 进行样式设计，通过 `tailwind.min.js` 动态生成样式类。

### 常用 Tailwind 类

| 类别 | 常用类 |
| --- | --- |
| 布局 | `flex`, `grid`, `container`, `mx-auto` |
| 间距 | `p-4`, `m-4`, `gap-4`, `space-y-4` |
| 颜色 | `bg-gray-900`, `text-white`, `border-gray-700` |
| 字体 | `text-lg`, `font-bold`, `font-mono` |
| 响应式 | `md:flex`, `lg:p-8` |
| 状态 | `hover:bg-gray-800`, `focus:outline-none` |

## 🔧 模板语法

使用 Jinja2 模板语法：

```html
<!-- 变量输出 -->
{{ variable }}

<!-- 条件判断 -->
{% if condition %}
    content
{% endif %}

<!-- 循环 -->
{% for item in list %}
    {{ item }}
{% endfor %}

<!-- 模板继承 -->
{% extends "base.html" %}

<!-- 块定义 -->
{% block content %}
    content
{% endblock %}

<!-- 组件引用 -->
{% include "includes/component.html" %}

<!-- URL 生成 -->
{{ url_for('route_name', param=value) }}
```
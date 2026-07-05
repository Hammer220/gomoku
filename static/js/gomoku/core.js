// 核心命名空间、常量和全局状态定义
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 常量 ====================

    // API 基础路径
    G.API_BASE = '';
    // 棋盘大小（15x15标准五子棋棋盘）
    G.BOARD_SIZE = 15;
    // 每个格子的像素大小（默认值，实际会根据容器大小计算）
    G.CELL_SIZE = 30;
    // 棋子大小相对于格子的比例
    G.PIECE_SIZE_RATIO = 0.8;
    // 棋子默认像素大小
    G.PIECE_SIZE = 24;

    // ==================== 认证状态 ====================

    // 用户令牌（从 localStorage 读取）
    G.token = localStorage.getItem('token') || '';
    // 当前登录用户信息
    G.currentUser = null;
    // 是否已登录
    G.isLoggedIn = false;

    // ==================== 游戏模式 ====================

    // 当前游戏模式：'ai' | 'pvp' | 'online'
    G.gameMode = 'ai';

    // ==================== 联机对战状态 ====================

    // 联机房间 ID
    G.onlineMatchId = null;
    // 联机中我的棋子颜色（1=黑棋, 2=白棋）
    G.onlineMyColor = null;
    // 联机对手用户名
    G.onlineOpponent = null;
    // 联机棋盘数据
    G.onlineBoard = [];
    // 联机走棋历史
    G.onlineMoveHistory = [];
    // 联机游戏是否进行中
    G.onlineGameActive = false;
    // 联机游戏时间
    G.onlineGameTime = 0;
    // 联机计时器
    G.onlineTimerInterval = null;
    // 联机当前回合玩家
    G.onlineCurrentPlayer = 1;
    // 联机轮询定时器
    G.onlinePollingInterval = null;
    // 对局列表刷新定时器
    G.matchListInterval = null;
    // 上次走棋数量
    G.lastMoveCount = 0;
    // 上次重开版本号
    G.lastRestartVersion = 0;
    // 联机棋盘格子大小
    G.onlineCellSizeGlobal = 30;
    // 联机棋子大小
    G.onlinePieceSizeGlobal = 24;
    // 重开倒计时定时器
    G.restartCountdownTimer = null;
    // 重开倒计时秒数
    G.restartCountdownSeconds = 0;
    // 关闭房间按钮处理器引用
    G.closeRoomBtnHandler = null;

    // ==================== 连接管理 ====================

    // 心跳定时器
    G.heartbeatInterval = null;
    // 心跳失败次数
    G.heartbeatFailures = 0;
    // 最大心跳失败次数
    G.maxHeartbeatFailures = 3;
    // 重连尝试次数
    G.reconnectAttempts = 0;
    // 最大重连尝试次数
    G.maxReconnectAttempts = 20;
    // 基础轮询间隔（毫秒）
    G.basePollingInterval = 800;
    // 当前轮询间隔
    G.currentPollingInterval = 800;
    // 最大轮询间隔
    G.maxPollingInterval = 15000;
    // 是否正在重连
    G.isReconnecting = false;
    // 上次成功轮询时间
    G.lastSuccessfulPoll = Date.now();
    // 轮询超时定时器
    G.pollTimeout = null;

    // ==================== 监控状态（管理员用） ====================

    // 当前监控的对局 ID
    G.monitorMatchId = null;
    // 监控刷新定时器
    G.monitorInterval = null;
    // 监控棋盘数据
    G.monitorBoard = [];

    // ==================== 游戏状态 ====================

    // 本地游戏棋盘数据
    G.gameBoard = [];
    // 当前回合玩家（1=黑棋, 2=白棋）
    G.currentPlayer = 1;
    // 游戏是否进行中
    G.gameActive = false;
    // 走棋历史
    G.moveHistory = [];
    // 游戏累计时间
    G.gameTime = 0;
    // 游戏计时器
    G.timerInterval = null;
    // 玩家所选棋子颜色
    G.playerColor = 1;
    // AI 难度：'easy' | 'medium' | 'hard'
    G.aiDifficulty = 'medium';
    // 获胜棋子位置（用于高亮）
    G.winningCells = [];
    // 悔棋次数
    G.undoCount = 0;

    // ==================== 双人对战设置 ====================

    // 是否启用禁手规则
    G.pvpForbidden = true;
    // 双人对战单步时间限制（秒，0=无限制）
    G.pvpTimeLimit = 0;
    // 双人对战当前回合开始时间
    G.pvpTurnStartTime = 0;
    // 双人对战回合计时器
    G.pvpTurnTimer = null;

    // ==================== Canvas 引用 ====================

    // 本地游戏 Canvas
    G.canvas = null;
    G.ctx = null;
    // 联机游戏 Canvas
    G.onlineCanvas = null;
    G.onlineCtx = null;

    // ==================== 棋盘颜色设置 ====================

    // 棋盘线条颜色
    G.boardLineColor = '#8B5A2B';
    // 棋盘星位点颜色
    G.boardDotColor = '#8B5A2B';
    // 棋盘颜色设置是否已加载
    G.boardColorSettingsLoaded = false;
    // 可用背景列表
    G.availableBackgrounds = [];
    // 当前选中的背景
    G.selectedBackground = '';

    // ==================== 游戏记录数据 ====================

    // 所有游戏记录（管理员查看用）
    G.allRecordsData = null;

    // ==================== 定时器 ====================

    // 用户状态检查定时器
    G.statusCheckInterval = null;
    // 封禁倒计时定时器
    G.bannedCountdownInterval = null;

    // ==================== 验证码相关 ====================

    // 极验验证码令牌
    G.loginGeetestToken = '';
    G.registerGeetestToken = '';
    // 登录表单是否已交互
    G.loginFormInteracted = sessionStorage.getItem('loginFormInteracted') === 'true';
    G.registerFormInteracted = sessionStorage.getItem('registerFormInteracted') === 'true';
    // Turnstile 验证码令牌
    // G.loginTurnstileToken = '';
    // G.registerTurnstileToken = '';
    // // Turnstile Site Key
    // G.turnstileSiteKey = '';
    // // 登录后 Turnstile 令牌
    // G.postLoginTurnstileToken = '';
    // // Turnstile SDK 是否已加载
    // G.turnstileSDKLoaded = false;

    // ==================== 历史记录分页 ====================

    // 每页显示记录数
    G.historyPageSize = 10;
    // 当前页码
    G.historyCurrentPage = 1;
    // 所有历史记录
    G.historyAllRecords = [];

    // ==================== 管理员状态 ====================

    // 所有用户列表
    G.adminAllUsers = [];
    // 管理员当前页码
    G.adminCurrentPage = 1;
    // 管理员每页显示数
    G.adminPageSize = 5;
    // 管理员搜索过滤词
    G.adminSearchFilter = '';
    // 搜索防抖定时器
    G.searchTimer = null;

    // ==================== 回放相关 ====================

    // 回放记录
    G.replayRecord = null;
    // 回放当前步数
    G.replayStep = 0;
    // 回放自动播放定时器
    G.replayAutoTimer = null;
    // 回放速度（毫秒/步）
    G.replaySpeed = 500;

})();
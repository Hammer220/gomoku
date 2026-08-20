// 核心命名空间、常量和全局状态定�?
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    // ==================== 常量 ====================

    // API 基础路径
    G.API_BASE = '';
    // 棋盘大小�?5x15标准五子棋棋盘）
    G.BOARD_SIZE = 15;
    // 每个格子的像素大小（默认值，实际会根据容器大小计算）
    G.CELL_SIZE = 30;
    // 棋子大小相对于格子的比例
    G.PIECE_SIZE_RATIO = 0.8;
    // 棋子默认像素大小
    G.PIECE_SIZE = 24;

    // ==================== 认证状�?====================

    // 用户令牌（从 localStorage 读取�?
    G.token = localStorage.getItem('token') || '';
    // 当前登录用户信息
    G.currentUser = null;
    // 是否已登�?
    G.isLoggedIn = false;

    // ==================== 访客模式状�?====================

    // 是否为访客模�?
    G.isGuest = localStorage.getItem('isGuest') === 'true';
    // 访客剩余游戏次数
    G.guestRemainingGames = parseInt(localStorage.getItem('guestRemainingGames')) || 5;
    // 访客用户�?
    G.guestUsername = localStorage.getItem('guestUsername') || '';

    // ==================== 游戏模式 ====================

    // 当前游戏模式�?ai' | 'pvp' | 'online'
    G.gameMode = 'ai';

    // ==================== 联机对战状�?====================

    // 联机房间 ID
    G.onlineMatchId = null;
    // 联机中我的棋子颜色（1=黑棋, 2=白棋�?
    G.onlineMyColor = null;
    // 联机对手用户�?
    G.onlineOpponent = null;
    // 联机棋盘数据
    G.onlineBoard = [];
    // 联机走棋历史
    G.onlineMoveHistory = [];
    // 联机游戏是否进行�?
    G.onlineGameActive = false;
    // 联机游戏时间
    G.onlineGameTime = 0;
    // 联机计时�?
    G.onlineTimerInterval = null;
    // 联机当前回合玩家
    G.onlineCurrentPlayer = 1;
    // 联机轮询定时�?
    G.onlinePollingInterval = null;
    // 对局列表刷新定时�?
    G.matchListInterval = null;
    // 上次走棋数量
    G.lastMoveCount = 0;
    // 上次重开版本�?
    G.lastRestartVersion = 0;
    // 联机棋盘格子大小
    G.onlineCellSizeGlobal = 30;
    // 联机棋子大小
    G.onlinePieceSizeGlobal = 24;
    // 重开倒计时定时器
    G.restartCountdownTimer = null;
    // 重开倒计时秒�?
    G.restartCountdownSeconds = 0;
    // 关闭房间按钮处理器引�?
    G.closeRoomBtnHandler = null;

    // ==================== 连接管理 ====================

    // 心跳定时�?
    G.heartbeatInterval = null;
    // 心跳失败次数
    G.heartbeatFailures = 0;
    // 最大心跳失败次�?
    G.maxHeartbeatFailures = 3;

    // ==================== 监控状态（管理员用�?====================

    // 当前监控的对局 ID
    G.monitorMatchId = null;
    // 监控刷新定时�?
    G.monitorInterval = null;
    // 监控棋盘数据
    G.monitorBoard = [];

    // ==================== 游戏状�?====================

    // 本地游戏棋盘数据
    G.gameBoard = [];
    // 当前回合玩家�?=黑棋, 2=白棋�?
    G.currentPlayer = 1;
    // 游戏是否进行�?
    G.gameActive = false;
    // 走棋历史
    G.moveHistory = [];
    // 游戏累计时间
    G.gameTime = 0;
    // 游戏计时�?
    G.timerInterval = null;
    // 玩家所选棋子颜�?
    G.playerColor = 1;
    // AI 难度�?easy' | 'medium' | 'hard' | 'master'
    G.aiDifficulty = 'medium';
    // AI 落子延迟开关（难度越高延迟越大，最�?秒）
    G.aiDelayEnabled = true;
    // 获胜棋子位置（用于高亮）
    G.winningCells = [];
    // 悔棋次数
    G.undoCount = 0;

    // ==================== 双人对战设置 ====================

    // 人机对战是否启用禁手规则
    G.aiForbidden = true;
    // 双人对战是否启用禁手规则
    G.pvpForbidden = true;
    // 双人对战单步时间限制（秒�?=无限制）
    G.pvpTimeLimit = 0;
    // 双人对战当前回合开始时�?
    G.pvpTurnStartTime = 0;
    // 双人对战回合计时�?
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
    // 棋盘星位点颜�?
    G.boardDotColor = '#8B5A2B';
    // 棋盘颜色设置是否已加�?
    G.boardColorSettingsLoaded = false;
    // 可用背景列表
    G.availableBackgrounds = [];
    // 当前选中的背�?
    G.selectedBackground = '';

    // ==================== 游戏记录数据 ====================

    // 所有游戏记录（管理员查看用�?
    G.allRecordsData = null;

    // ==================== 定时�?====================

    // 用户状态检查定时器
    G.statusCheckInterval = null;
    // 封禁倒计时定时器
    G.bannedCountdownInterval = null;

    // ==================== 验证码相�?====================

    // 极验验证码令�?
    G.loginGeetestToken = '';
    G.registerGeetestToken = '';
    // 登录表单是否已交�?
    G.loginFormInteracted = sessionStorage.getItem('loginFormInteracted') === 'true';
    G.registerFormInteracted = sessionStorage.getItem('registerFormInteracted') === 'true';
    // Turnstile 验证码令�?
    // G.loginTurnstileToken = '';
    // G.registerTurnstileToken = '';
    // // Turnstile Site Key
    // G.turnstileSiteKey = '';
    // // 登录�?Turnstile 令牌
    // G.postLoginTurnstileToken = '';
    // // Turnstile SDK 是否已加�?
    // G.turnstileSDKLoaded = false;

    // ==================== 历史记录分页 ====================

    // 每页显示记录�?
    G.historyPageSize = 10;
    // 当前页码
    G.historyCurrentPage = 1;
    // 所有历史记�?
    G.historyAllRecords = [];

    // ==================== 管理员状�?====================

    // 所有用户列�?
    G.adminAllUsers = [];
    // 管理员当前页�?
    G.adminCurrentPage = 1;
    // 管理员每页显示数
    G.adminPageSize = 5;
    // 管理员搜索过滤词
    G.adminSearchFilter = '';
    // 搜索防抖定时�?
    G.searchTimer = null;

    // ==================== 回放相关 ====================

    // 回放记录
    G.replayRecord = null;
    // 回放当前步数
    G.replayStep = 0;
    // 回放自动播放定时�?
    G.replayAutoTimer = null;
    // 回放速度（毫�?步）
    G.replaySpeed = 500;
    // 回放中找到的连线列表�?子及以上�?
    G.replayLines = [];
    // 回放当前显示的连线索引（-1 表示不显示）
    G.replayLineIndex = -1;

})();


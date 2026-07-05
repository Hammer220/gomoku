(function(){
    "use strict";

    const API_BASE = '';
    const BOARD_SIZE = 15;
    let CELL_SIZE = 30, PIECE_SIZE_RATIO = 0.8, PIECE_SIZE = 24;
    
    let token = localStorage.getItem('token') || '';
    let currentUser = null;
    let gameMode = 'ai';
    let onlineMatchId = null, onlineMyColor = null, onlineOpponent = null;
    let monitorMatchId = null;  // 当前监控的房间ID
    let monitorInterval = null;  // 监控定时器
    let monitorBoard = [];  // 监控的棋盘状态
    let gameBoard = [], currentPlayer = 1, onlineCurrentPlayer = 1, gameActive = false, moveHistory = [], gameTime = 0, timerInterval = null;
    let playerColor = 1, aiDifficulty = 'medium', winningCells = [], undoCount = 0;
    let pvpForbidden = true;  // 双人对战禁手规则开关
    let pvpTimeLimit = 0;     // 双人对战时间限制（秒），0表示无限制
    let pvpTurnStartTime = 0; // 当前回合开始时间
    let pvpTurnTimer = null;  // 回合计时器
    let canvas, ctx, onlineCanvas, onlineCtx;
    let onlineBoard = [], onlineMoveHistory = [], onlineGameActive = false;
    let onlineGameTime = 0, onlineTimerInterval = null;
    let restartCountdownTimer = null;
    let restartCountdownSeconds = 0;
    let lastRestartVersion = 0;  // 跟踪重新开始版本号，用于可靠检测重新开始
    let onlineCellSizeGlobal = 30, onlinePieceSizeGlobal = 24;
    let allRecordsData = null;  // 保存所有游戏记录数据用于筛选
    
    function initOnlineBoard() { 
        onlineBoard = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0)); 
    }
    
    function drawOnlineBoard() {
        if(!onlineCtx || !onlineCanvas) return;
        if(!onlineBoard || !onlineBoard[0]) {
            // 初始化空棋盘
            onlineBoard = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
        }
        
        // 使用 calcOnlineCanvasSize 设置的全局尺寸
        const cellSize = onlineCellSizeGlobal || 30;
        const pieceSize = cellSize * PIECE_SIZE_RATIO;
        const margin = pieceSize / 2 + 4; // 棋子半径 + 额外边距
        
        // 确保画布尺寸正确
        const boardWidth = cellSize * (BOARD_SIZE - 1) + margin * 2;
        const boardHeight = cellSize * (BOARD_SIZE - 1) + margin * 2;
        if (onlineCanvas.width !== boardWidth || onlineCanvas.height !== boardHeight) {
            onlineCanvas.width = boardWidth;
            onlineCanvas.height = boardHeight;
        }
        
        onlineCtx.clearRect(0,0,onlineCanvas.width,onlineCanvas.height);
        onlineCtx.strokeStyle = boardLineColor; onlineCtx.lineWidth = 2;
        for(let i=0;i<BOARD_SIZE;i++){
            onlineCtx.beginPath(); onlineCtx.moveTo(margin,i*cellSize+margin); onlineCtx.lineTo(onlineCanvas.width-margin,i*cellSize+margin); onlineCtx.stroke();
            onlineCtx.beginPath(); onlineCtx.moveTo(i*cellSize+margin,margin); onlineCtx.lineTo(i*cellSize+margin,onlineCanvas.height-margin); onlineCtx.stroke();
        }
        [[3,3],[3,11],[7,7],[11,3],[11,11]].forEach(([x,y])=>{
            onlineCtx.beginPath(); onlineCtx.arc(x*cellSize+margin,y*cellSize+margin,6,0,2*Math.PI); onlineCtx.fillStyle=boardDotColor; onlineCtx.fill();
        });
        for(let r=0;r<BOARD_SIZE;r++) for(let c=0;c<BOARD_SIZE;c++) if(onlineBoard[r][c]!==0) drawOnlinePiece(r,c,onlineBoard[r][c],cellSize);
    }
    
    function drawOnlinePiece(row,col,player,cellSize){
        const pieceSize = cellSize * PIECE_SIZE_RATIO;
        const margin = pieceSize / 2 + 4; // 棋子半径 + 额外边距
        const x=col*cellSize+margin, y=row*cellSize+margin;
        onlineCtx.beginPath(); onlineCtx.arc(x,y,pieceSize/2+2,0,2*Math.PI); onlineCtx.fillStyle='rgba(0,0,0,0.2)'; onlineCtx.fill();
        onlineCtx.beginPath(); onlineCtx.arc(x,y,pieceSize/2,0,2*Math.PI);
        const grad=onlineCtx.createRadialGradient(x-pieceSize/6,y-pieceSize/6,pieceSize/10,x,y,pieceSize/2);
        if(player===1){ grad.addColorStop(0,'#555'); grad.addColorStop(1,'#000'); }
        else{ grad.addColorStop(0,'#fff'); grad.addColorStop(1,'#ddd'); }
        onlineCtx.fillStyle=grad; onlineCtx.fill(); onlineCtx.strokeStyle=player===1?'#333':'#ccc'; onlineCtx.lineWidth=1; onlineCtx.stroke();
    }
    
    let boardLineColor = '#8B5A2B', boardDotColor = '#8B5A2B';
    let boardColorSettingsLoaded = false;  // 棋盘颜色设置是否已加载
    let availableBackgrounds = [];  // 可用的背景图片列表
    let selectedBackground = '';  // 当前选择的背景图片
    
    // 从服务器获取背景图片列表
    async function loadBackgrounds() {
        if (!token) return;
        try {
            const data = await apiCall('/api/backgrounds');
            availableBackgrounds = data.backgrounds || [];
            renderBackgroundGrid();
        } catch (err) {
            console.error('加载背景图片失败:', err);
        }
    }
    
    // 渲染背景图片选择网格
    function renderBackgroundGrid() {
        const grid = document.getElementById('backgroundImageGrid');
        if (!grid) return;
        
        if (availableBackgrounds.length === 0) {
            grid.innerHTML = '<div class="text-gray-500 text-sm text-center py-4 col-span-4">暂无背景图片</div>';
            return;
        }
        
        grid.innerHTML = availableBackgrounds.map(bg => `
            <div class="relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                selectedBackground === bg.path 
                    ? 'border-primary shadow-md scale-105' 
                    : 'border-transparent hover:border-gray-300'
            }" data-path="${bg.path}" onclick="window.selectBackground('${bg.path}')">
                <img src="${bg.path}" alt="${bg.name}" class="w-full aspect-square object-cover">
                <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">${bg.name}</div>
            </div>
        `).join('');
    }
    
    // 选择背景图片 - 暴露到全局作用域以便HTML调用
    window.selectBackground = function(path) {
        selectedBackground = path;
        renderBackgroundGrid();
        applyBackground(path);
    }
    
    // 应用背景图片
    function applyBackground(path) {
        const boardElements = document.querySelectorAll('.bg-board');
        boardElements.forEach(el => {
            if (path) {
                el.style.backgroundImage = `url('${path}')`;
            } else {
                el.style.backgroundImage = 'none';
            }
        });
    }
    
    // 初始化棋盘背景
    function initBoardBackground() {
        const boardElement = document.querySelector('.bg-board');
        if (boardElement) {
            boardElement.style.backgroundImage = 'none';
        }
        // 登录后加载用户的背景设置
        loadUserBackgroundSetting();
    }
    
    // 加载用户保存的背景图片设置
    async function loadUserBackgroundSetting() {
        if (!token) return;
        try {
            const settings = await apiCall('/api/user/settings');
            if (settings && settings.boardBackground !== undefined) {
                selectedBackground = settings.boardBackground;
                applyBackground(selectedBackground);
                renderBackgroundGrid();
            }
        } catch (err) {
            console.error('加载背景设置失败:', err);
        }
    }

    // 处理背景图片上传
    async function handleBackgroundUpload(input) {
        if (!token) {
            showToast('请先登录', true);
            return;
        }

        const file = input.files[0];
        if (!file) return;

        const saveToServer = document.getElementById('saveUploadToServer').checked;
        const progress = document.getElementById('uploadProgress');

        progress.classList.remove('hidden');
        input.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('saveToServer', saveToServer);

            const response = await fetch('/api/backgrounds/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '上传失败');
            }

            if (data.success) {
                showToast(data.message);

                if (data.savedToServer) {
                    await loadBackgrounds();
                    window.selectBackground(data.path);
                } else {
                    window.selectBackground(data.dataUrl);
                }
            }
        } catch (err) {
            showToast(err.message, true);
            console.error('上传失败:', err);
        } finally {
            progress.classList.add('hidden');
            input.disabled = false;
            input.value = '';
        }
    }
    window.handleBackgroundUpload = handleBackgroundUpload;
    
    // 关键：状态检查定时器
    let statusCheckInterval = null;
    let isLoggedIn = false;

    // 辅助函数
    function showToast(msg, isError=false) {
        const toast = document.createElement('div');
        toast.className = `toast px-4 py-2 rounded-lg shadow-lg mb-2 ${isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
        toast.textContent = msg;
        document.getElementById('toastContainer').appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    async function apiCall(url, method='GET', body=null, skipAuthCheck=false) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(API_BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
            
            // 先检查状态码
            if (res.status === 401 && !skipAuthCheck && isLoggedIn) {
                handleForceLogout('登录已过期，请重新登录');
                throw new Error('登录已过期，请重新登录');
            }
            
            // 获取响应文本检查内容
            const responseText = await res.text();
            
            // 检查是否返回了 HTML（通常是登录页面）
            if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
                throw new Error('登录已过期，请重新登录');
            }
            
            // 尝试解析为 JSON
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error('服务器返回了无效的响应格式');
            }
            
            if (!res.ok) {
                // 检测封禁错误（只有"被封禁"才强制登出，而不是所有包含"封禁"的错误）
                if (res.status === 403 && data.error && (data.error.includes('已被封禁') || data.error.includes('账号已被封禁'))) {
                    handleForceLogout(data.error);
                    throw new Error(data.error);
                }
                throw new Error(data.error || '请求失败');
            }
            return data;
        } catch (err) {
            if (err.message.includes('Failed to fetch')) {
                throw new Error('网络连接失败，请检查服务器');
            }
            throw err;
        }
    }

    let onlinePollingInterval = null;
    let matchListInterval = null;  // 房间列表刷新定时器
    let bannedCountdownInterval = null;  // 封禁倒计时定时器
    let lastMoveCount = 0;  // 跟踪之前的步数，用于检测重新开始
    
    // 连接管理变量
    let heartbeatInterval = null;  // 心跳定时器
    let reconnectAttempts = 0;  // 重连尝试次数
    let maxReconnectAttempts = 20;  // 最大重连尝试次数
    let basePollingInterval = 800;  // 基础轮询间隔（毫秒）
    let currentPollingInterval = 800;  // 当前轮询间隔
    let maxPollingInterval = 15000;  // 最大轮询间隔
    let isReconnecting = false;  // 是否正在重连
    let lastSuccessfulPoll = Date.now();  // 最后成功轮询时间
    let pollTimeout = null;  // 轮询超时计时器

    // 恢复联机对战房间状态
    async function recoverOnlineMatch() {
        try {
            const res = await apiCall('/api/match/my', 'GET');
            if (res.match) {
                const match = res.match;
                onlineMatchId = match.id;
                onlineMyColor = match.myColor;
                onlineOpponent = match.opponent;
                gameMode = 'online';
                onlineBoard = match.board || Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
                onlineMoveHistory = match.moves || [];
                onlineCurrentPlayer = match.currentPlayer || 1;
                onlineGameActive = match.status === 'playing' || match.status === 'waiting' || match.status === 'waiting_for_reconnect';
                lastRestartVersion = 0;
                
                // 重置重连计数器
                reconnectAttempts = 0;
                currentPollingInterval = basePollingInterval;
                
                // 更新UI
                document.getElementById('onlineMatchIdDisplay').textContent = match.id;
                document.getElementById('roomInfo').innerHTML = `
                    <p>房间号: <span class="font-mono font-bold text-lg">${match.id}</span></p>
                    <p>你的棋子: <span class="font-bold">${match.myColor === 1 ? '黑棋' : '白棋'}</span></p>
                    <p>对手: <span class="font-bold">${match.opponent || '等待对手...'}</span></p>
                `;
                document.getElementById('onlineCreateBtn').classList.add('hidden');
                document.getElementById('onlineJoinBtn').parentElement.classList.add('hidden');
                document.getElementById('onlineLeaveBtn').classList.remove('hidden');
                
                drawOnlineBoard();
                updateOnlineUI();
                startOnlinePolling();
                
                // 根据房间状态更新UI
                if (match.status === 'waiting') {
                    showToast('已恢复到之前的房间，等待对手...');
                } else if (match.status === 'playing') {
                    showToast(`已恢复到房间 ${match.id}，对手: ${match.opponent}`);
                } else if (match.status === 'waiting_for_reconnect') {
                    showToast('已恢复到房间，对手暂时离开，等待重连...', true);
                } else if (match.status === 'closed') {
                    // 房间已关闭，清除所有状态和UI
                    onlineMatchId = null;
                    onlineMyColor = null;
                    onlineOpponent = null;
                    gameMode = 'ai';
                    initOnlineBoard();
                    document.getElementById('onlineMatchIdDisplay').textContent = '-';
                    document.getElementById('roomInfo').innerHTML = '<p class="text-gray-500">未加入房间</p>';
                    document.getElementById('onlineCreateBtn').classList.remove('hidden');
                    document.getElementById('onlineJoinBtn').parentElement.classList.remove('hidden');
                    document.getElementById('onlineLeaveBtn').classList.add('hidden');
                    drawOnlineBoard();
                    updateOnlineUI();
                    showToast('房间已被关闭', true);
                } else if (match.status === 'finished') {
                    // 游戏已结束，显示最终状态
                    const myWin = match.winner === match.myColor;
                    document.getElementById('onlineStatusText').textContent = myWin ? '🎉 你赢了！' : '😢 你输了！';
                    document.getElementById('onlineStatusText').className = myWin 
                        ? 'text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse' 
                        : 'text-xl font-semibold text-gray-400';
                    showToast(`游戏已结束：${myWin ? '你赢了' : '你输了'}，对手: ${match.opponent}`);
                } else {
                    showToast(`已恢复到房间，状态: ${match.status}`);
                }
            }
        } catch (e) {
            console.error('恢复联机房间失败:', e);
        }
    }

    async function onlineCreateMatch() {
        try {
            const res = await apiCall('/api/match/create', 'POST', {});
            onlineMatchId = res.matchId;
            onlineMyColor = res.creatorColor;  // 保存创建者颜色
            gameMode = 'online';
            initOnlineBoard();
            onlineMoveHistory = [];
            onlineGameActive = true;
            onlineGameTime = 0;
            onlineCurrentPlayer = res.creatorColor;  // 使用服务器返回的当前玩家
            lastRestartVersion = 0;
            
            // 重置重连计数器
            reconnectAttempts = 0;
            currentPollingInterval = basePollingInterval;
            
            stopMatchListRefresh();
            
            document.getElementById('onlineMatchIdDisplay').textContent = res.matchId;
            document.getElementById('roomInfo').innerHTML = `
                <p>房间号: <span class="font-mono font-bold text-lg">${res.matchId}</span></p>
                <p>你的棋子: <span class="font-bold">${res.creatorColor === 1 ? '黑棋' : '白棋'}</span></p>
                <p>状态: <span class="text-amber-600">等待对手加入...</span></p>
                <p class="text-sm text-gray-500">你是房间创建者</p>
            `;
            document.getElementById('roomActions').classList.remove('hidden');
            document.getElementById('onlineLeaveBtn').classList.remove('hidden');
            document.getElementById('onlineCreateBtn').classList.add('hidden');
            document.getElementById('onlineJoinBtn').parentElement.classList.add('hidden');
            showToast(`房间已创建: ${res.matchId}`);
            // 确保画布尺寸已计算
            calcOnlineCanvasSize();
            drawOnlineBoard();
            updateOnlineUI();
            startOnlinePolling();
            startOnlineTimer();
            startHeartbeat();
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function onlineJoinMatch() {
        const matchId = document.getElementById('onlineMatchIdInput').value.trim();
        if (!matchId) { showToast('请输入房间号', true); return; }
        try {
            const res = await apiCall('/api/match/join', 'POST', { matchId });
            onlineMatchId = matchId;
            onlineMyColor = res.yourColor;
            onlineOpponent = res.opponent;
            gameMode = 'online';
            initOnlineBoard();
            onlineMoveHistory = [];
            onlineGameActive = true;
            onlineGameTime = 0;
            onlineCurrentPlayer = 1;
            lastRestartVersion = 0;
            
            // 重置重连计数器
            reconnectAttempts = 0;
            currentPollingInterval = basePollingInterval;
            
            // 停止房间列表刷新
            stopMatchListRefresh();
            
            document.getElementById('onlineMatchIdDisplay').textContent = matchId;
            document.getElementById('roomInfo').innerHTML = `
                <p>房间号: <span class="font-mono font-bold text-lg">${matchId}</span></p>
                <p>你的棋子: <span class="font-bold">${res.yourColor === 1 ? '黑棋' : '白棋'}</span></p>
                <p>对手: <span class="font-bold">${res.opponent}</span></p>
            `;
            document.getElementById('roomActions').classList.add('hidden');
            document.getElementById('onlineLeaveBtn').classList.remove('hidden');
            document.getElementById('onlineCreateBtn').classList.add('hidden');
            document.getElementById('onlineJoinBtn').parentElement.classList.add('hidden');
            document.getElementById('onlineMatchIdInput').value = '';
            showToast(`已加入房间，对手: ${res.opponent}`);
            drawOnlineBoard();
            updateOnlineUI();
            startOnlinePolling();
            startOnlineTimer();
            startHeartbeat();
        } catch (err) {
            showToast(err.message, true);
        }
    }

    async function closeRoom() {
        if (!onlineMatchId) return;
        if (!confirm('确定要关闭房间吗？这将结束当前游戏，所有玩家将被踢出。')) return;
        
        try {
            await apiCall('/api/match/close', 'POST', { matchId: onlineMatchId });
            showToast('房间已关闭');
            
            // 重置本地状态
            onlineMatchId = null;
            onlineMyColor = null;
            onlineOpponent = null;
            onlineGameActive = false;
            stopOnlinePolling();
            stopOnlineTimer();
            initOnlineBoard();
            
            // 更新UI
            document.getElementById('onlineMatchIdDisplay').textContent = '-';
            document.getElementById('roomInfo').innerHTML = '<p class="text-gray-500">未加入房间</p>';
            document.getElementById('roomActions').classList.add('hidden');
            document.getElementById('onlineLeaveBtn').classList.add('hidden');
            document.getElementById('onlineCreateBtn').classList.remove('hidden');
            document.getElementById('onlineJoinBtn').parentElement.classList.remove('hidden');
            document.getElementById('onlineStatusText').textContent = '等待加入房间...';
            
            drawOnlineBoard();
            updateOnlineUI();
        } catch (err) {
            showToast(err.message, true);
        }
    }
    
    function stopRestartCountdown() {
        if (restartCountdownTimer) {
            clearInterval(restartCountdownTimer);
            restartCountdownTimer = null;
        }
        restartCountdownSeconds = 0;
    }
    
    let closeRoomBtnHandler = null;
    
    function attachCloseRoomHandler() {
        const btn = document.getElementById('closeRoomBtn');
        if (!btn) return;
        if (closeRoomBtnHandler) {
            btn.removeEventListener('click', closeRoomBtnHandler);
        }
        closeRoomBtnHandler = closeOnlineRoom;
        btn.addEventListener('click', closeRoomBtnHandler);
    }
    
    function showRestartRequestUI() {
        // 游戏结束后显示重新开始按钮（使用新API）
        const roomActions = document.getElementById('roomActions');
        roomActions.classList.remove('hidden');
        roomActions.innerHTML = `
            <button id="requestRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">
                <i class="fa-solid fa-rotate-right mr-1"></i> 重新开始
            </button>
            <button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">
                <i class="fa-solid fa-xmark mr-1"></i> 关闭房间
            </button>
        `;
        
        document.getElementById('requestRestartBtn').addEventListener('click', requestRestart);
        attachCloseRoomHandler();
    }

    function showOnlineRoomActions() {
        // 游戏进行中显示重新开始和关闭房间按钮
        const roomActions = document.getElementById('roomActions');
        roomActions.classList.remove('hidden');
        roomActions.innerHTML = `
            <button id="requestRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">
                <i class="fa-solid fa-rotate-right mr-1"></i> 重新开始
            </button>
            <button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">
                <i class="fa-solid fa-xmark mr-1"></i> 关闭房间
            </button>
        `;
        
        document.getElementById('requestRestartBtn').addEventListener('click', requestRestart);
        attachCloseRoomHandler();
    }

    function showOnlineWaitingForRestartUI() {
        // 已请求重新开始，等待对手确认
        const roomActions = document.getElementById('roomActions');
        roomActions.classList.remove('hidden');
        roomActions.innerHTML = `
            <div class="text-center mb-2">
                <span class="text-sm text-amber-600"><i class="fa-solid fa-hourglass-half mr-1"></i>等待对手确认重新开始...</span>
            </div>
            <button id="cancelRestartBtn" class="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg text-sm mb-2 transition-all">
                <i class="fa-solid fa-times mr-1"></i> 取消请求
            </button>
            <button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">
                <i class="fa-solid fa-xmark mr-1"></i> 关闭房间
            </button>
        `;
        
        document.getElementById('cancelRestartBtn').addEventListener('click', requestRestart);
        attachCloseRoomHandler();
    }

    function showOnlineRestartRequestedUI(requesterName) {
        // 对手请求了重新开始，显示接受按钮
        const roomActions = document.getElementById('roomActions');
        roomActions.classList.remove('hidden');
        roomActions.innerHTML = `
            <div class="text-center mb-2">
                <span class="text-sm text-blue-600"><i class="fa-solid fa-info-circle mr-1"></i>对手 <strong>${requesterName}</strong> 请求重新开始</span>
            </div>
            <button id="acceptRestartBtn" class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg text-sm mb-2 font-medium shadow-md transition-all">
                <i class="fa-solid fa-check mr-1"></i> 接受重新开始
            </button>
            <button id="closeRoomBtn" class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 rounded-lg text-sm font-medium shadow-md transition-all">
                <i class="fa-solid fa-xmark mr-1"></i> 关闭房间
            </button>
        `;
        
        document.getElementById('acceptRestartBtn').addEventListener('click', requestRestart);
        attachCloseRoomHandler();
    }

    async function requestRestart() {
        if (!onlineMatchId) return;
        
        try {
            const res = await apiCall('/api/match/restart', 'POST', { matchId: onlineMatchId });
            
            if (res.restartInitiated) {
                // 重新开始已执行，更新本地状态
                const newCreatorColor = res.creatorColor;
                // 计算自己的新颜色
                if (currentUser) {
                    if (currentUser.username === onlineOpponent) {
                        // 自己是加入者
                        onlineMyColor = newCreatorColor === 1 ? 2 : 1;
                    } else {
                        // 自己是创建者
                        onlineMyColor = newCreatorColor;
                    }
                }
                
                initOnlineBoard();
                onlineMoveHistory = [];
                onlineGameActive = true;
                onlineGameTime = 0;
                onlineCurrentPlayer = res.currentPlayer || 1;
                lastMoveCount = 0;
                lastRestartVersion = res.restartVersion || 0;
                drawOnlineBoard();
                updateOnlineUI();
                showOnlineRoomActions();
                startOnlinePolling();
                startOnlineTimer();
                showToast('游戏已重新开始');
            } else if (res.restartRequested) {
                // 已发起请求，等待对手确认
                showToast('已请求重新开始，等待对手确认');
                showOnlineWaitingForRestartUI();
            } else if (res.restartCancelled) {
                // 已取消请求
                showToast('已取消重新开始请求');
                showOnlineRoomActions();
            }
        } catch (err) {
            showToast(err.message, true);
        }
    }

    function startRestartCountdown() {
        stopRestartCountdown();
        restartCountdownSeconds = 10;
        
        const roomActions = document.getElementById('roomActions');
        roomActions.classList.remove('hidden');
        roomActions.innerHTML = `
            <div class="text-center mb-2">
                <span class="text-sm text-gray-600">重新开始倒计时: </span>
                <span id="countdownSeconds" class="font-bold text-primary">${restartCountdownSeconds}</span>
            </div>
            <button id="requestRestartBtn" class="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-sm mb-2">重新开始</button>
            <button id="closeRoomBtn" class="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm">关闭房间</button>
        `;
        
        document.getElementById('requestRestartBtn').addEventListener('click', requestRestart);
        attachCloseRoomHandler();
        
        restartCountdownTimer = setInterval(() => {
            restartCountdownSeconds--;
            const countdownEl = document.getElementById('countdownSeconds');
            if (countdownEl) countdownEl.textContent = restartCountdownSeconds;
            
            if (restartCountdownSeconds <= 0) {
                stopRestartCountdown();
                requestRestart();
            }
        }, 1000);
    }
    
    // 联机对局监控相关函数
    async function loadMatchList() {
        try {
            const res = await apiCall('/api/admin/matches', 'GET');
            const container = document.getElementById('matchListContainer');
            if (!container) return;
            
            if (res.matches.length === 0) {
                container.innerHTML = '<div class="text-gray-500 text-center py-4">暂无对局</div>';
                return;
            }
            
            const statusMap = {
                'waiting': '等待中',
                'playing': '进行中',
                'finished': '已结束',
                'closed': '已关闭'
            };
            const statusClass = {
                'waiting': 'text-amber-600',
                'playing': 'text-green-600',
                'finished': 'text-blue-600',
                'closed': 'text-red-600'
            };
            
            container.innerHTML = res.matches.map(m => `
                <div class="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 ${monitorMatchId === m.id ? 'ring-2 ring-primary' : ''}" data-match-id="${m.id}">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${m.id}</span>
                        <span class="text-sm ${statusClass[m.status]}">${statusMap[m.status]}</span>
                    </div>
                    <div class="text-sm text-gray-600">
                        <span>创建者: ${m.creator}</span>
                        ${m.opponent ? `<span class="ml-2">对手: ${m.opponent}</span>` : ''}
                    </div>
                    <div class="text-sm text-gray-500 mt-1">
                        <span>步数: ${m.moveCount}</span>
                        <span class="ml-2">当前: ${m.currentPlayer === 1 ? '黑棋' : '白棋'}</span>
                    </div>
                </div>
            `).join('');
            
            // 绑定点击事件
            container.querySelectorAll('[data-match-id]').forEach(el => {
                el.addEventListener('click', () => selectMatchToMonitor(el.dataset.matchId));
            });
        } catch (err) {
            showToast('加载对局列表失败: ' + err.message, true);
        }
    }
    
    async function selectMatchToMonitor(matchId) {
        monitorMatchId = matchId;
        document.getElementById('monitorMatchId').textContent = matchId;
        document.getElementById('monitorControls').classList.remove('hidden');
        
        // 重新加载列表以更新选中状态
        await loadMatchList();
        
        // 开始监控
        startMonitor();
        
        // 强制重绘棋盘（延迟以确保DOM渲染完成）
        setTimeout(() => {
            drawMonitorBoard();
            setTimeout(() => drawMonitorBoard(), 100);
        }, 50);
    }
    
    async function startMonitor() {
        stopMonitor();
        if (!monitorMatchId) return;
        
        await updateMonitor();
        monitorInterval = setInterval(updateMonitor, 5000);
    }
    
    function stopMonitor() {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
    }
    
    async function updateMonitor() {
        if (!monitorMatchId) return;
        try {
            const res = await apiCall(`/api/admin/match/${monitorMatchId}`, 'GET');
            monitorBoard = res.board;
            drawMonitorBoard();
            
            // 更新房间信息
            const statusMap = {
                'waiting': '等待中',
                'playing': '进行中',
                'finished': '已结束',
                'closed': '已关闭'
            };
            document.getElementById('monitorMatchId').textContent = `${monitorMatchId} - ${statusMap[res.status]}`;
            
            // 如果房间已关闭，停止监控并清空棋盘
            if (res.status === 'closed') {
                stopMonitor();
                showToast('房间已关闭', true);
                // 清空监控棋盘显示
                monitorBoard = [];
                drawMonitorBoard();
                document.getElementById('monitorControls').classList.add('hidden');
            }
        } catch (err) {
            console.error('监控更新失败:', err);
        }
    }
    
    function drawMonitorBoard() {
        const canvas = document.getElementById('monitorCanvas');
        if (!canvas) return;
        
        const container = canvas.parentElement;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size <= 0) return;
        
        const dpr = window.devicePixelRatio || 1;
        const cellSize = Math.max(15, size / (BOARD_SIZE - 1));
        const pieceRadius = cellSize * PIECE_SIZE_RATIO / 2;
        const margin = pieceRadius + 4; // 棋子半径 + 额外边距
        
        const boardWidth = cellSize * (BOARD_SIZE - 1) + margin * 2;
        const boardHeight = cellSize * (BOARD_SIZE - 1) + margin * 2;
        
        canvas.width = boardWidth * dpr;
        canvas.height = boardHeight * dpr;
        canvas.style.width = boardWidth + 'px';
        canvas.style.height = boardHeight + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        // 绘制背景
        ctx.fillStyle = '#DEB887';
        ctx.fillRect(0, 0, boardWidth, boardHeight);
        
        // 绘制网格线
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
        for (let i = 0; i < BOARD_SIZE; i++) {
            const pos = i * cellSize + margin;
            ctx.beginPath();
            ctx.moveTo(pos, margin);
            ctx.lineTo(pos, boardHeight - margin);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(margin, pos);
            ctx.lineTo(boardWidth - margin, pos);
            ctx.stroke();
        }
        
        // 绘制星位点
        const dotSize = Math.max(2, cellSize * 0.08);
        [[3,3],[3,11],[7,7],[11,3],[11,11]].forEach(([x,y]) => {
            ctx.beginPath();
            ctx.arc(x * cellSize + margin, y * cellSize + margin, dotSize, 0, Math.PI * 2);
            ctx.fillStyle = '#8B5A2B';
            ctx.fill();
        });
        
        // 绘制棋子
        if (!monitorBoard || !monitorBoard.length) return;
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (!monitorBoard[row]) continue;
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (monitorBoard[row][col] !== 0) {
                    const x = col * cellSize + margin;
                    const y = row * cellSize + margin;
                    
                    // 阴影
                    ctx.beginPath();
                    ctx.arc(x + 1, y + 1, pieceRadius, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.fill();
                    
                    // 棋子
                    ctx.beginPath();
                    ctx.arc(x, y, pieceRadius, 0, Math.PI * 2);
                    const grad = ctx.createRadialGradient(x - pieceRadius * 0.3, y - pieceRadius * 0.3, pieceRadius * 0.1, x, y, pieceRadius);
                    if (monitorBoard[row][col] === 1) {
                        grad.addColorStop(0, '#555');
                        grad.addColorStop(1, '#000');
                    } else {
                        grad.addColorStop(0, '#fff');
                        grad.addColorStop(1, '#ddd');
                    }
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.strokeStyle = monitorBoard[row][col] === 1 ? '#333' : '#ccc';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }
    
    async function forceCloseMatch() {
        if (!monitorMatchId) return;
        try {
            stopMonitor();
            await apiCall('/api/admin/match/force_close', 'POST', { matchId: monitorMatchId });
            showToast('房间已强制关闭');
            monitorMatchId = null;
            document.getElementById('monitorMatchId').textContent = '未选择房间';
            document.getElementById('monitorControls').classList.add('hidden');
            await loadMatchList();
        } catch (err) {
            showToast('强制关闭失败: ' + err.message, true);
            if (monitorMatchId) {
                startMonitor();
            }
        }
    }

    async function forceCloseAllRooms() {
        try {
            stopMonitor();
            const data = await apiCall('/api/admin/match/force_close_all', 'POST', {});
            showToast(`已关闭 ${data.closed_count} 个房间`);
            monitorMatchId = null;
            document.getElementById('monitorMatchId').textContent = '未选择房间';
            document.getElementById('monitorControls').classList.add('hidden');
            await loadMatchList();
        } catch (err) {
            showToast('关闭所有房间失败: ' + err.message, true);
        }
    }
    
    async function forceRestartMatch() {
        if (!monitorMatchId) return;
        try {
            stopMonitor();
            await apiCall('/api/admin/match/force_restart', 'POST', { matchId: monitorMatchId });
            showToast('对局已强制重新开始');
            await updateMonitor();
            startMonitor();
        } catch (err) {
            showToast('强制重新开始失败: ' + err.message, true);
            if (monitorMatchId) {
                startMonitor();
            }
        }
    }
    
    async function forceMove(row, col, player) {
        if (!monitorMatchId) return;
        try {
            stopMonitor();
            
            const res = await apiCall('/api/admin/match/force_move', 'POST', {
                matchId: monitorMatchId,
                row, col, player
            });
            
            if (res.win) {
                showToast(`强制落子成功，${player === 1 ? '黑棋' : '白棋'}获胜！`);
            } else {
                showToast('强制落子成功');
            }
            
            await updateMonitor();
            
            if (monitorMatchId) {
                startMonitor();
            }
        } catch (err) {
            showToast('强制落子失败: ' + err.message, true);
            if (monitorMatchId) {
                startMonitor();
            }
        }
    }

    async function onlineLeaveMatch() {
        if (!onlineMatchId) return;
        try {
            await apiCall('/api/match/leave', 'POST', { matchId: onlineMatchId });
        } catch (err) {
            console.warn('离开房间时出错:', err);
        }
        // 完整清理联机状态
        cleanupOnlineState();
        showToast('已离开房间');
    }
    
    // 新增：完整的联机状态清理函数
    function cleanupOnlineState() {
        stopRestartCountdown();
        stopOnlinePolling();
        stopOnlineTimer();
        stopHeartbeat();
        
        onlineMatchId = null;
        onlineMyColor = null;
        onlineOpponent = null;
        onlineGameActive = false;
        onlineBoard = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
        onlineMoveHistory = [];
        onlineCurrentPlayer = 1;
        reconnectAttempts = 0;
        currentPollingInterval = basePollingInterval;
        isReconnecting = false;
        lastMoveCount = 0;
        
        // 更新UI
        document.getElementById('onlineMatchIdDisplay').textContent = '-';
        document.getElementById('roomInfo').innerHTML = '<p class="text-gray-500">未加入房间</p>';
        document.getElementById('roomActions').classList.add('hidden');
        document.getElementById('onlineLeaveBtn').classList.add('hidden');
        document.getElementById('onlineCreateBtn').classList.remove('hidden');
        document.getElementById('onlineJoinBtn').parentElement.classList.remove('hidden');
        document.getElementById('onlineStatusText').textContent = '等待加入房间...';
        document.getElementById('onlineMoveCount').textContent = '0';
        
        drawOnlineBoard();
        updateOnlineUI();
    }
    
    async function closeOnlineRoom() {
        if (!onlineMatchId) return;
        
        if (!confirm('确定要关闭房间吗？')) return;
        
        const btn = document.getElementById('closeRoomBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
        }
        
        try {
            const res = await apiCall('/api/match/close', 'POST', { matchId: onlineMatchId });
            if (res.message) {
                showToast(res.message);
            }
        } catch (err) {
            showToast('关闭房间失败: ' + err.message, true);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '关闭房间';
            }
            return;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '关闭房间';
            }
        }
        
        // 使用统一的清理函数
        cleanupOnlineState();
        showToast('房间已关闭');
    }

    function startOnlineTimer() {
        stopOnlineTimer();
        onlineTimerInterval = setInterval(() => {
            onlineGameTime++;
            document.getElementById('onlineGameTimeDisplay').textContent = formatTime(onlineGameTime);
        }, 1000);
    }

    function stopOnlineTimer() {
        if (onlineTimerInterval) {
            clearInterval(onlineTimerInterval);
            onlineTimerInterval = null;
        }
    }

    function updateOnlineUI() {
        if (!onlineGameActive) return;
        const isMyTurn = onlineCurrentPlayer === onlineMyColor;
        const label = isMyTurn ? '你' : '对手';
        const playerColor = onlineCurrentPlayer === 1 ? '黑棋' : '白棋';
        document.getElementById('onlineStatusText').textContent = `游戏进行中 - ${label} (${playerColor}) 回合`;
        document.getElementById('onlineMoveCount').textContent = onlineMoveHistory.length;
    }

    async function loadOnlineAvailableMatches() {
        try {
            const res = await apiCall('/api/match/list', 'GET');
            const container = document.getElementById('onlineAvailableMatches');
            if (res.matches.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">暂无可用房间</p>';
                return;
            }
            container.innerHTML = res.matches.map(m => `
                <div class="flex justify-between items-center p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 text-sm" data-match-id="${m.id}">
                    <span class="font-medium">${m.creator}</span>
                    <span class="text-gray-500">房间: ${m.id}</span>
                </div>
            `).join('');
            
            // 绑定点击事件
            container.querySelectorAll('[data-match-id]').forEach(el => {
                el.addEventListener('click', () => clickOnlineMatch(el.dataset.matchId));
            });
        } catch (err) {
            console.error(err);
        }
    }
    
    async function checkExistingMatch() {
        try {
            const res = await apiCall('/api/match/my', 'GET');
            if (res.match) {
                const match = res.match;
                onlineMatchId = match.id;
                onlineMyColor = match.myColor;
                onlineOpponent = match.opponent;
                onlineGameActive = true;
                onlineBoard = match.board || Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
                onlineMoveHistory = match.moves || [];
                onlineCurrentPlayer = match.currentPlayer;
                onlineGameTime = Math.floor(Date.now() / 1000) - (match.startTime || 0);
                
                document.getElementById('onlineMatchIdDisplay').textContent = match.id;
                document.getElementById('roomInfo').innerHTML = `
                    <p>房间号: <span class="font-mono font-bold text-lg">${match.id}</span></p>
                    <p>你的棋子: <span class="font-bold">${match.myColor === 1 ? '黑棋' : '白棋'}</span></p>
                    <p>对手: <span class="font-bold">${match.opponent || '未知'}</span></p>
                    <p>状态: <span class="text-green-600">对战进行中</span></p>
                `;
                document.getElementById('onlineLeaveBtn').classList.remove('hidden');
                document.getElementById('onlineCreateBtn').classList.add('hidden');
                document.getElementById('onlineJoinBtn').parentElement.classList.add('hidden');
                
                // 确保画布尺寸已计算
                calcOnlineCanvasSize();
                
                // 重置重连计数器
                reconnectAttempts = 0;
                currentPollingInterval = basePollingInterval;
                
                startOnlinePolling();
                startOnlineTimer();
                startHeartbeat();
                
                drawOnlineBoard();
                updateOnlineUI();
            } else {
                // 服务器上没有匹配，清理本地状态
                if (onlineMatchId) {
                    console.log('服务器上没有找到匹配，清理本地状态');
                    cleanupOnlineState();
                }
            }
        } catch (err) {
            console.error('检查现有游戏时出错:', err);
            // 即使出错，也清理状态以避免不一致
            if (onlineMatchId) {
                cleanupOnlineState();
            }
        }
    }

    window.clickOnlineMatch = function(matchId) {
        document.getElementById('onlineMatchIdInput').value = matchId;
        onlineJoinMatch();
    };

    async function loadAvailableMatches() {
        try {
            const res = await apiCall('/api/match/list', 'GET');
            const container = document.getElementById('onlineAvailableMatches');
            if (!container) return;
            
            if (res.matches.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center py-4">暂无可用房间</p>';
                return;
            }
            container.innerHTML = res.matches.map(m => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100" onclick="window.joinMatchById('${m.id}')">
                    <span class="font-medium">${m.creator}</span>
                    <span class="text-sm text-gray-500">房间: ${m.id}</span>
                </div>
            `).join('');
        } catch (err) {
            console.error(err);
        }
    }
    
    function startMatchListRefresh() {
        stopMatchListRefresh();
        loadOnlineAvailableMatches();
        matchListInterval = setInterval(loadOnlineAvailableMatches, 3000);
    }
    
    function stopMatchListRefresh() {
        if (matchListInterval) {
            clearInterval(matchListInterval);
            matchListInterval = null;
        }
    }

    async function joinMatchById(matchId) {
        try {
            const res = await apiCall('/api/match/join', 'POST', { matchId });
            onlineMatchId = matchId;
            onlineMyColor = res.yourColor;
            onlineOpponent = res.opponent;
            gameMode = 'online';
            currentPlayer = 1;
            updateModeButtons();
            updateColorButtons();
            document.getElementById('onlineModal').classList.add('hidden');
            showToast(`已加入房间，对手: ${res.opponent}`);
            resetGame();
            startOnlinePolling();
        } catch (err) {
            showToast(err.message, true);
        }
    }

    function startOnlinePolling() {
        stopOnlinePolling();
        reconnectAttempts = 0;
        currentPollingInterval = basePollingInterval;
        lastSuccessfulPoll = Date.now();
        scheduleOnlinePoll();
    }

    function scheduleOnlinePoll() {
        if (!onlineMatchId) return;
        
        onlinePollingInterval = setTimeout(async () => {
            if (!onlineMatchId) return;
            
            let pollSuccess = false;
            try {
                const res = await apiCall(`/api/match/status/${onlineMatchId}`, 'GET');
                pollSuccess = true;
                
                // 重置重连计数器和轮询间隔（连接成功）
                reconnectAttempts = 0;
                currentPollingInterval = basePollingInterval;
                lastSuccessfulPoll = Date.now();
                isReconnecting = false;
                
                // 检测游戏重新开始：服务器棋盘已重置，但本地棋盘还有棋子
                // 或者服务器moveCount从大于0变为0（表示重新开始）
                const hasLocalPieces = onlineBoard && onlineBoard.some(row => row && row.some(cell => cell !== 0));
                const hasServerPieces = res.board && res.board.some(row => row && row.some(cell => cell !== 0));
                const serverMoveCount = res.moves ? res.moves.length : 0;
                
                // 检测重新开始：通过 restartVersion 可靠检测
                const serverRestartVersion = res.restartVersion || 0;
                const isRestartByVersion = serverRestartVersion > lastRestartVersion;
                
                if (isRestartByVersion) {
                    lastRestartVersion = serverRestartVersion;
                    showToast('游戏重新开始！');
                    // 清空本地棋盘
                    onlineBoard = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
                    onlineMoveHistory = [];
                    onlineGameActive = true;
                    onlineGameTime = 0;
                    // 从服务器获取最新的当前玩家和颜色
                    onlineCurrentPlayer = res.currentPlayer || 1;
                    onlineMyColor = res.myColor;
                    lastMoveCount = 0;
                    // 更新在线状态文本并重置样式
                    const statusElement = document.getElementById('onlineStatusText');
                    statusElement.textContent = '游戏进行中';
                    statusElement.className = 'text-lg font-semibold text-green-600';
                    // 重新绘制棋盘和UI
                    drawOnlineBoard();
                    updateOnlineUI();
                    // 更新房间操作按钮
                    showOnlineRoomActions();
                    // 重新开始后黑棋先走，确保正确显示
                    if (onlineCurrentPlayer === 1) {
                        showToast('黑棋先走！', false);
                    }
                    // 已有重新开始，跳过后续处理
                }
                
                // 处理重新开始请求状态变化（无论游戏状态如何）
                if (!isRestartByVersion) {
                    if (res.restartRequested && res.restartRequestedBy !== currentUser?.username) {
                        // 对手请求了重新开始
                        showOnlineRestartRequestedUI(res.restartRequestedBy);
                    } else if (res.restartRequested && res.restartRequestedBy === currentUser?.username) {
                        // 自己请求了重新开始，等待对手确认
                        showOnlineWaitingForRestartUI();
                    } else if (res.status === 'playing') {
                        // 没有重新开始请求且游戏进行中，显示正常操作按钮
                        showOnlineRoomActions();
                    }
                }
                
                if (res.status === 'finished') {
                    onlineGameActive = false;
                    stopOnlineTimer();
                    if (res.board) {
                        onlineBoard = res.board;
                        drawOnlineBoard();
                    }
                    const myWin = res.winner === onlineMyColor;
                    const statusElement = document.getElementById('onlineStatusText');
                    statusElement.textContent = myWin ? '🎉 你赢了！' : '😢 你输了！';
                    statusElement.className = myWin 
                        ? 'text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse' 
                        : 'text-xl font-semibold text-gray-400';
                    showToast(myWin ? '🎉 恭喜你赢了！' : '😢 很遗憾，你输了！', !myWin);
                    saveGameRecord(myWin ? 'win' : 'lose', 'online', onlineOpponent);
                    // 如果已有重新开始请求，显示相应的UI，否则显示默认的重新开始按钮
                    if (res.restartRequested) {
                        if (res.restartRequestedBy !== currentUser?.username) {
                            showOnlineRestartRequestedUI(res.restartRequestedBy);
                        } else {
                            showOnlineWaitingForRestartUI();
                        }
                    } else {
                        showRestartRequestUI();
                    }
                    return;
                }
                if (res.status === 'closed') {
                    // 房间被关闭
                    onlineGameActive = false;
                    stopOnlinePolling();
                    stopOnlineTimer();
                    stopHeartbeat();
                    document.getElementById('onlineStatusText').textContent = '房间已被关闭';
                    showToast('房间已被创建者关闭', true);
                    
                    // 重置本地状态
                    onlineMatchId = null;
                    onlineMyColor = null;
                    onlineOpponent = null;
                    initOnlineBoard();
                    
                    // 更新UI
                    document.getElementById('onlineMatchIdDisplay').textContent = '-';
                    document.getElementById('roomInfo').innerHTML = '<p class="text-gray-500">未加入房间</p>';
                    document.getElementById('roomActions').classList.add('hidden');
                    document.getElementById('onlineLeaveBtn').classList.add('hidden');
                    document.getElementById('onlineCreateBtn').classList.remove('hidden');
                    document.getElementById('onlineJoinBtn').parentElement.classList.remove('hidden');
                    
                    drawOnlineBoard();
                    updateOnlineUI();
                    return;
                }
                if (res.status === 'waiting_for_reconnect') {
                    // 对手暂时离开，等待重新连接
                    onlineGameActive = true;  // 游戏仍然活跃，只是等待重连
                    if (res.board) {
                        onlineBoard = res.board;
                        drawOnlineBoard();
                    }
                    const statusElement = document.getElementById('onlineStatusText');
                    statusElement.textContent = '对手暂时离开，等待重连...';
                    statusElement.className = 'text-lg font-semibold text-amber-600';
                    document.getElementById('roomInfo').innerHTML = `
                        <p>房间号: <span class="font-mono font-bold text-lg">${onlineMatchId}</span></p>
                        <p>你的棋子: <span class="font-bold">${onlineMyColor === 1 ? '黑棋' : '白棋'}</span></p>
                        <p>对手: <span class="font-bold">${onlineOpponent || '未知'}</span></p>
                        <p>状态: <span class="text-amber-600">等待对手重连...</span></p>
                    `;
                    updateOnlineUI();
                    showToast('对手暂时离开，等待重新连接', true);
                    return;
                }
                if (res.status === 'waiting' && res.opponent) {
                    // 房间已被加入，状态更新为 playing
                    res.status = 'playing';
                }
                if (res.board) {
                    const oldHasPieces = onlineBoard && onlineBoard.some(row => row && row.some(cell => cell !== 0));
                    const newHasPieces = res.board.some(row => row.some(cell => cell !== 0));
                    
                    if (oldHasPieces && !newHasPieces) {
                        showToast('游戏重新开始！');
                    }
                    
                    onlineBoard = res.board;
                    onlineMoveHistory = res.moves.map(m => ({ row: m.row, col: m.col }));
                    onlineCurrentPlayer = res.currentPlayer;
                    
                    if (res.myColor !== undefined && res.myColor !== null) {
                        onlineMyColor = res.myColor;
                    } else if (res.creatorColor && !onlineMyColor) {
                        onlineMyColor = currentUser?.username === res.opponent ? (res.creatorColor === 1 ? 2 : 1) : res.creatorColor;
                    }
                    
                    onlineGameActive = res.status === 'playing' || res.status === 'waiting';
                    if (onlineGameActive) {
                        startOnlineTimer();
                    }
                    
                    drawOnlineBoard();
                    updateOnlineUI();
                    document.getElementById('onlineMoveCount').textContent = res.moves.length;
                    lastMoveCount = res.moves.length;
                }
                // 更新房间状态
                const currentMyColor = onlineMyColor;
                const currentOpponent = res.opponent || onlineOpponent;
                if (currentMyColor !== null && currentMyColor !== undefined) {
                    let statusText = res.status === 'waiting' ? '等待对手加入' : '对战进行中';
                    let statusColor = res.status === 'waiting' ? 'text-amber-600' : 'text-green-600';
                    document.getElementById('roomInfo').innerHTML = `
                        <p>房间号: <span class="font-mono font-bold text-lg">${onlineMatchId}</span></p>
                        <p>你的棋子: <span class="font-bold">${currentMyColor === 1 ? '黑棋' : '白棋'}</span></p>
                        <p>对手: <span class="font-bold">${currentOpponent || '等待对手'}</span></p>
                        <p>状态: <span class="${statusColor}">${statusText}</span></p>
                    `;
                }
            } catch (err) {
                console.error('轮询失败:', err);
                
                // 实现指数退避策略
                reconnectAttempts++;
                currentPollingInterval = Math.min(
                    basePollingInterval * Math.pow(1.5, Math.min(reconnectAttempts, 10)),
                    maxPollingInterval
                );
                
                // 显示重连提示
                if (reconnectAttempts === 1 || (reconnectAttempts % 5 === 0 && reconnectAttempts <= maxReconnectAttempts)) {
                    showToast(`网络连接不稳定，正在尝试重连... (${reconnectAttempts}/${maxReconnectAttempts})`, true);
                    document.getElementById('onlineStatusText').textContent = `连接中... (${reconnectAttempts})`;
                    isReconnecting = true;
                }
                
                // 检查是否超过最大重连次数
                if (reconnectAttempts >= maxReconnectAttempts) {
                    showToast('网络连接失败，请检查网络或尝试重新加入房间', true);
                    document.getElementById('onlineStatusText').textContent = '连接失败';
                    // 清理本地状态
                    cleanupOnlineState();
                    return;
                }
            }
            
            // 继续轮询
            if (onlineMatchId) {
                scheduleOnlinePoll();
            }
        }, currentPollingInterval);
    }
    
    let heartbeatFailures = 0; // 心跳失败计数
    let maxHeartbeatFailures = 3; // 最大心跳失败次数
    
    function showDisconnectOverlay() {
        const overlay = document.getElementById('disconnectOverlay');
        if (overlay) overlay.classList.remove('hidden');
    }
    
    function hideDisconnectOverlay() {
        const overlay = document.getElementById('disconnectOverlay');
        if (overlay) overlay.classList.add('hidden');
    }
    
    function startHeartbeat() {
        stopHeartbeat();
        heartbeatFailures = 0;
        hideDisconnectOverlay();
        heartbeatInterval = setInterval(async () => {
            if (!token || !isLoggedIn) return;
            try {
                await apiCall('/api/heartbeat', 'POST', {});
                heartbeatFailures = 0; // 成功后重置失败计数
                hideDisconnectOverlay();
            } catch (err) {
                console.error('心跳失败:', err);
                heartbeatFailures++;
                // 如果心跳连续失败多次，显示断开连接遮罩层
                if (heartbeatFailures >= maxHeartbeatFailures) {
                    console.warn('心跳连续失败多次，服务器可能已关闭');
                    showDisconnectOverlay();
                    heartbeatFailures = 0; // 重置计数，避免重复触发
                }
            }
        }, 5000); // 每5秒发送一次心跳，更快检测服务器断开

    }
    
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        hideDisconnectOverlay();
    }

    function stopOnlinePolling() {
        if (onlinePollingInterval) {
            clearTimeout(onlinePollingInterval);
            onlinePollingInterval = null;
        }
    }

    async function makeOnlineMove(row, col) {
        if (!onlineMatchId || gameMode !== 'online') { return; }
        
        // 立即禁用点击，防止重复提交
        const originalClickHandler = onlineCanvas.onclick;
        onlineCanvas.onclick = null;
        
        try {
            // 先更新本地棋盘状态
            onlineBoard[row][col] = onlineMyColor;
            onlineMoveHistory.push({ row, col, player: onlineMyColor });
            drawOnlineBoard();
            
            // 发送移动请求到服务器
            const res = await apiCall('/api/match/move', 'POST', { matchId: onlineMatchId, row, col });
            
            // 服务器确认后更新当前玩家状态
            onlineCurrentPlayer = onlineMyColor === 1 ? 2 : 1;
            updateOnlineUI();
            
            // 如果收到胜负信息，更新游戏状态
            if (res.win) {
                onlineGameActive = false;
                stopOnlinePolling();
                stopOnlineTimer();
                const myWin = res.winner === onlineMyColor;
                document.getElementById('onlineStatusText').textContent = myWin ? '你赢了！' : '你输了！';
                showToast(myWin ? '你赢了！' : '你输了！', !myWin);
                saveGameRecord(myWin ? 'win' : 'lose', 'online', onlineOpponent);
                startRestartCountdown();
            }
        } catch (err) {
            // 如果请求失败，回滚本地状态
            console.error('落子失败:', err);
            onlineBoard[row][col] = 0;
            onlineMoveHistory.pop();
            drawOnlineBoard();
            showToast(err.message || err.error || '落子失败', true);
        } finally {
            // 恢复点击事件
            onlineCanvas.onclick = originalClickHandler;
        }
    }

    // 强制登出处理
    function handleForceLogout(message = '您已被强制登出') {
        if (!isLoggedIn) return;
        isLoggedIn = false;
        stopStatusCheck();
        stopTimer();
        
        // 清理所有联机状态
        cleanupOnlineState();
        stopMatchListRefresh();
        stopBannedCountdown();
        
        token = '';
        localStorage.removeItem('token');
        currentUser = null;
        document.getElementById('gameContainer').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('hidden');
        // 隐藏管理员标签页
        document.getElementById('adminTab').classList.add('hidden');
        // 隐藏管理员内容区域
        document.getElementById('adminContent').classList.add('hidden');
        showToast(message, true);
    }

    // 状态检查（核心：实时检测封禁和登出，以及管理员操作同步）
    
    async function checkUserStatus() {
        if (!isLoggedIn || !token) return;
        try {
            const userData = await apiCall('/api/user', 'GET', null, true);
            // 检查是否被封禁
            if (userData.bannedUntil) {
                const bannedUntil = new Date(userData.bannedUntil * 1000);
                const now = new Date();
                if (now < bannedUntil) {
                    const remainMinutes = Math.ceil((bannedUntil - now) / 60000);
                    handleForceLogout(`您的账号已被封禁，剩余 ${remainMinutes} 分钟`);
                    return;
                }
            }
            // 更新本地用户数据
            currentUser = userData;
            updateUserDisplay();
            
            // 如果是管理员且在管理员面板，每次都刷新用户列表
            if (currentUser && currentUser.isAdmin) {
                const adminPanel = document.getElementById('adminContent');
                if (adminPanel && !adminPanel.classList.contains('hidden')) {
                    await loadAdminUsers();
                }
                
                // 更新管理员账号管理区域可见性
                const adminMgmt = document.getElementById('adminAccountManagement');
                if (adminMgmt) {
                    adminMgmt.classList.toggle('hidden', !currentUser.isSuperAdmin);
                }
                
                // 如果是超级管理员，显示联机对局监控
                if (currentUser.isSuperAdmin) {
                    document.getElementById('onlineMatchMonitor').classList.remove('hidden');
                    // 加载房间列表
                    loadMatchList();
                }
            }
        } catch (err) {
            // 检查是否是封禁错误（403）
            const errorStr = err.message || '';
            if (err.status === 403 && (errorStr.includes('封禁') || errorStr.includes('banned'))) {
                handleForceLogout('您的账号已被封禁');
                return;
            }
            if (errorStr.includes('401') || errorStr.includes('Unauthorized') || errorStr.includes('未授权')) {
                handleForceLogout('登录状态已失效');
            }
        }
    }

    function startStatusCheck() {
        stopStatusCheck();
        statusCheckInterval = setInterval(checkUserStatus, 1000); // 每1秒检查一次
    }

    function stopStatusCheck() {
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }
    
    function startBannedCountdown() {
        stopBannedCountdown();
        bannedCountdownInterval = setInterval(updateBannedCountdown, 1000);
    }
    
    function stopBannedCountdown() {
        if (bannedCountdownInterval) {
            clearInterval(bannedCountdownInterval);
            bannedCountdownInterval = null;
        }
    }
    
    function updateBannedCountdown() {
        const countdownElements = document.querySelectorAll('.banned-countdown');
        let needRefresh = false;
        
        countdownElements.forEach(el => {
            const bannedUntil = parseInt(el.dataset.until);
            const now = new Date().getTime();
            const remaining = bannedUntil - now;
            
            if (remaining <= 0) {
                el.textContent = '已解封';
                el.classList.remove('text-red-600');
                el.classList.add('text-green-600');
                needRefresh = true;
            } else {
                el.textContent = formatRemainingTime(bannedUntil);
            }
        });
        
        if (needRefresh) {
            loadAdminUsers();
        }
    }

    function updateUserDisplay(){
        if(!currentUser) return;
        document.getElementById('userNameDisplay').textContent = currentUser.username;
        document.getElementById('userScoreDisplay').textContent = currentUser.score || 0;
        document.getElementById('userWinsDisplay').textContent = currentUser.wins || 0;
        
        // 更新个人资料页面
        document.getElementById('profileUsername').textContent = currentUser.username;
        document.getElementById('profileScore').textContent = currentUser.score || 0;
        document.getElementById('profileWins').textContent = currentUser.wins || 0;
        document.getElementById('profileGames').textContent = currentUser.games || 0;
        document.getElementById('profileJoinDate').textContent = currentUser.joinDate || '未知';
        document.getElementById('profileLastLogin').textContent = currentUser.lastLogin || '从未登录';
    }

    // 极验四代验证码
    let loginGeetestToken = '';
    let registerGeetestToken = '';
    let loginFormInteracted = sessionStorage.getItem('loginFormInteracted') === 'true';  // 标记用户是否与登录表单有交互
    let registerFormInteracted = sessionStorage.getItem('registerFormInteracted') === 'true';  // 标记用户是否与注册表单有交互
    
    // Cloudflare Turnstile 验证码
    let loginTurnstileToken = '';
    let registerTurnstileToken = '';
    let turnstileSiteKey = '';
    
    // 获取 Turnstile Site Key
    async function getTurnstileSiteKey() {
        try {
            const res = await fetch('/api/captcha/turnstile/sitekey');
            const data = await res.json();
            if (data.code === 0) {
                turnstileSiteKey = data.sitekey;
                console.log('Turnstile Site Key loaded:', turnstileSiteKey);
            }
        } catch (error) {
            console.error('Failed to get Turnstile site key:', error);
        }
    }
    
    // 初始化 Turnstile 验证码
    function initTurnstileWidget(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // 等待 Site Key 加载
        function doInit() {
            if (!turnstileSiteKey) {
                setTimeout(doInit, 100);
                return;
            }
            
            // 检查 Turnstile SDK 是否已加载
            if (typeof window.turnstile === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
                script.async = true;
                script.onload = function() {
                    renderTurnstile();
                };
                script.onerror = function() {
                    console.error('Failed to load Turnstile script');
                    container.innerHTML = '<div class="w-full h-full flex items-center justify-center text-red-500 text-sm">安全验证加载失败</div>';
                };
                document.head.appendChild(script);
            } else {
                renderTurnstile();
            }
        }
        
        function renderTurnstile() {
            window.turnstile.render('#' + containerId, {
                sitekey: turnstileSiteKey,
                theme: 'light',
                size: 'normal',
                callback: function(token) {
                    console.log('Turnstile verified for ' + containerId + ': ', token);
                    if (containerId === 'turnstileLoginWidget') {
                        loginTurnstileToken = token;
                    } else {
                        registerTurnstileToken = token;
                    }
                    showToast('安全验证通过');
                },
                'error-callback': function(error) {
                    console.error('Turnstile error:', error);
                    if (containerId === 'turnstileLoginWidget') {
                        loginTurnstileToken = '';
                    } else {
                        registerTurnstileToken = '';
                    }
                    showToast('安全验证失败，请重试', true);
                }
            });
        }
        
        doInit();
    }
    
    // 刷新 Turnstile 验证码
    function refreshTurnstileCaptcha(isLogin) {
        const containerId = isLogin ? 'turnstileLoginWidget' : 'turnstileRegisterWidget';
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
            if (typeof window.turnstile !== 'undefined') {
                window.turnstile.reset('#' + containerId);
            } else {
                initTurnstileWidget(containerId);
            }
        }
    }
    
    // 初始化极验四代验证码
    function initGeetestWidget(containerId, callback) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // 先清空容器内容（极验appendTo是追加操作，不自动清空）
        container.innerHTML = '';
        
        // 尝试初始化SDK
        function doInitGeetest() {
            if (typeof initGeetest4 !== 'function') {
                console.error('极验SDK初始化失败：initGeetest4未定义');
                showToast('验证组件加载失败，请刷新页面重试', true);
                if (callback) callback(); // 确保Promise能resolve，不阻塞后续流程
                return;
            }
            
            console.log('初始化极验SDK...');
            // 根据场景使用不同的验证码配置
            var captchaId = containerId === 'geetestLoginWidget' 
                ? '4f9d3983ec3e3f57df82b0ccad9e273a'  // 登录专用
                : 'a02cc5f652aa762b93710d33448f70b5'; // 注册使用原配置
            
            initGeetest4({
                captchaId: captchaId,
                product: 'float',
                riskType: 'slide',
                language: 'zh',
                onError: function(err) {
                    console.error('极验SDK初始化错误:', err);
                    showToast('验证初始化失败，请重试', true);
                    if (callback) callback(); // 初始化失败也要解阻塞，让页面继续加载
                }
            }, function(captchaObj) {
                console.log('验证码实例创建成功');
                // 验证码实例已创建完成，立即回调解除阻塞，不等待用户操作
                if (callback) callback();
                window['gt4Instance_' + containerId] = captchaObj;
                // 追加前清空容器，防止残留旧内容
                const targetContainer = document.getElementById(containerId);
                if (targetContainer) targetContainer.innerHTML = '';
                captchaObj.appendTo("#" + containerId);
                
                // 验证成功回调
                // 注意：GT4官方API规定，onSuccess回调不通过参数传递结果，
                // 必须调用 captchaObj.getValidate() 获取验证数据
                captchaObj.onSuccess(function() {
                    // 1. 通过 getValidate() 获取验证结果
                    const result = captchaObj.getValidate();
                    console.log('极验返回原始数据：', result);

                    // 2. 兼容两种数据结构：直接返回 或 嵌套在 detail 中
                    let validateData = result;
                    if (result && result.detail) {
                        validateData = result.detail;
                    }

                    // 3. 校验 validateData 是否存在
                    if (!validateData) {
                        console.error('极验返回数据为空');
                        showToast('验证码验证失败，请重试', true);
                        captchaObj.reset();
                        return;
                    }

                    // 4. 取出4个必填参数
                    const lotNumber = validateData.lot_number;
                    const captchaOutput = validateData.captcha_output;
                    const passToken = validateData.pass_token;
                    const genTime = validateData.gen_time;

                    // 5. 校验参数是否完整
                    if (!lotNumber || !captchaOutput || !passToken || !genTime) {
                        console.error('极验返回数据不完整', validateData);
                        showToast('验证码参数缺失，请重试', true);
                        captchaObj.reset();
                        return;
                    }

                    // 6. 拼接成 captcha_token（使用JSON序列化避免captcha_output含_导致分割错乱）
                    const token = JSON.stringify([lotNumber, captchaOutput, passToken, genTime]);
                    if (containerId === 'geetestLoginWidget') {
                        loginGeetestToken = token;
                        sessionStorage.removeItem('loginFormInteracted');
                    } else {
                        registerGeetestToken = token;
                        sessionStorage.removeItem('registerFormInteracted');
                    }
                    console.log('生成的captcha_token：', token);
                    
                    // 7. 更新UI显示验证通过
                    container.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-green-500 text-white"><i class="fa-solid fa-check"></i></div>';
                    showToast('验证成功');
                });
                
                // 验证失败回调
                captchaObj.onFail(function(err) {
                    console.error('极验验证失败:', err);
                    showToast('验证失败，请重试', true);
                    // 重置token
                    if (containerId === 'geetestLoginWidget') {
                        loginGeetestToken = '';
                    } else {
                        registerGeetestToken = '';
                    }
                });
                
                // 组件加载异常回调
                captchaObj.onError(function(err) {
                    console.error('极验组件加载异常:', err);
                    showToast('验证组件加载异常，请重试', true);
                });
            });
        }
        
        // 检查SDK是否已加载
        if (typeof initGeetest4 === 'function') {
            doInitGeetest();
            return;
        }
        
        // 加载极验四代SDK - 设置明确的超时处理
        const script = document.createElement('script');
        script.src = 'https://static.geetest.com/v4/gt4.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        
        // 超时处理 - 3秒后未加载完成则显示错误
        const loadTimeout = setTimeout(() => {
            console.error('极验SDK加载超时(3秒)');
            showToast('验证组件加载超时，请刷新页面重试', true);
            if (callback) callback(); // 超时也要解阻塞
        }, 3000);
        
        script.onload = function() {
            clearTimeout(loadTimeout);
            console.log('极验SDK脚本加载完成');
            // 立即尝试初始化
            setTimeout(doInitGeetest, 50);
        };
        
        script.onerror = function(e) {
            clearTimeout(loadTimeout);
            console.error('加载极验SDK失败:', e);
            showToast('加载验证组件失败，请检查网络连接', true);
            if (callback) callback(); // 加载失败也要解阻塞
        };
        
        // 添加脚本到页面
        document.head.appendChild(script);
        console.log('已添加极验SDK脚本到页面');
    }
    

    
    function refreshGeetestCaptcha(isLogin) {
        const containerId = isLogin ? 'geetestLoginWidget' : 'geetestRegisterWidget';
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<span class="text-xs text-gray-500">点击刷新</span>';
            setTimeout(() => initGeetestWidget(containerId), 100);
        }
    }

    // 棋盘相关函数（保持原版）
    function calcCanvasSize() {
        const container = document.querySelector('.aspect-square');
        if(!container) return;
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        CELL_SIZE = Math.max(15, size / (BOARD_SIZE - 1));
        PIECE_SIZE = CELL_SIZE * PIECE_SIZE_RATIO;
        const margin = PIECE_SIZE / 2 + 4; // 棋子半径 + 额外边距
        canvas.width = CELL_SIZE * (BOARD_SIZE - 1) + margin * 2;
        canvas.height = CELL_SIZE * (BOARD_SIZE - 1) + margin * 2;
    }

    function calcOnlineCanvasSize() {
        const container = document.querySelector('#onlineContent .aspect-square');
        if(!container || !onlineCanvas) return;
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        const onlineCellSize = Math.max(15, size / (BOARD_SIZE - 1));
        const onlinePieceSize = onlineCellSize * PIECE_SIZE_RATIO;
        const margin = onlinePieceSize / 2 + 4;
        
        onlineCanvas.width = onlineCellSize * (BOARD_SIZE - 1) + margin * 2;
        onlineCanvas.height = onlineCellSize * (BOARD_SIZE - 1) + margin * 2;
        
        onlineCellSizeGlobal = onlineCellSize;
        onlinePieceSizeGlobal = onlinePieceSize;
    }

    function initBoard() { gameBoard = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0)); winningCells = []; }

    function initCanvasObserver() {
        const gameContainer = document.querySelector('.aspect-square');
        const onlineContainer = document.querySelector('#onlineContent .aspect-square');
        const monitorContainer = document.querySelector('#onlineMatchMonitor .aspect-square');
        
        if (gameContainer) {
            new ResizeObserver(() => {
                calcCanvasSize();
                drawBoard();
            }).observe(gameContainer);
        }
        
        if (onlineContainer) {
            new ResizeObserver(() => {
                calcOnlineCanvasSize();
                drawOnlineBoard();
            }).observe(onlineContainer);
        }
        
        if (monitorContainer) {
            new ResizeObserver(() => {
                drawMonitorBoard();
            }).observe(monitorContainer);
        }
    }

    function drawBoard() {
        if(!ctx) return;
        if(!gameBoard || !gameBoard[0]) return;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = boardLineColor; ctx.lineWidth = 2;
        const margin = PIECE_SIZE / 2 + 4; // 棋子半径 + 额外边距
        // 绘制棋盘线
        for(let i=0;i<BOARD_SIZE;i++){
            ctx.beginPath(); ctx.moveTo(margin,i*CELL_SIZE+margin); ctx.lineTo(canvas.width-margin,i*CELL_SIZE+margin); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i*CELL_SIZE+margin,margin); ctx.lineTo(i*CELL_SIZE+margin,canvas.height-margin); ctx.stroke();
        }
        // 绘制5个大点（天元、四星）
        [[3,3],[3,11],[7,7],[11,3],[11,11]].forEach(([x,y])=>{
            ctx.beginPath(); ctx.arc(x*CELL_SIZE+margin,y*CELL_SIZE+margin,6,0,2*Math.PI); ctx.fillStyle=boardDotColor; ctx.fill();
        });
        for(let r=0;r<BOARD_SIZE;r++) for(let c=0;c<BOARD_SIZE;c++) if(gameBoard[r][c]!==0) drawPiece(r,c,gameBoard[r][c], winningCells.some(p=>p.row===r&&p.col===c));
    }

    function drawPiece(row,col,player,isWin=false){
        const margin = PIECE_SIZE / 2 + 4; // 棋子半径 + 额外边距
        const x=col*CELL_SIZE+margin, y=row*CELL_SIZE+margin;
        if(isWin){ ctx.beginPath(); ctx.arc(x,y,PIECE_SIZE/2+6,0,2*Math.PI); ctx.fillStyle='#FFD70040'; ctx.fill(); ctx.strokeStyle='#FFD700'; ctx.lineWidth=2; ctx.setLineDash([5,3]); ctx.stroke(); ctx.setLineDash([]); }
        ctx.beginPath(); ctx.arc(x,y,PIECE_SIZE/2+2,0,2*Math.PI); ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x,y,PIECE_SIZE/2,0,2*Math.PI);
        const grad=ctx.createRadialGradient(x-PIECE_SIZE/6,y-PIECE_SIZE/6,PIECE_SIZE/10,x,y,PIECE_SIZE/2);
        if(player===1){ grad.addColorStop(0,'#555'); grad.addColorStop(1,'#000'); }
        else{ grad.addColorStop(0,'#fff'); grad.addColorStop(1,'#ddd'); }
        ctx.fillStyle=grad; ctx.fill(); ctx.strokeStyle=player===1?'#333':'#ccc'; ctx.lineWidth=1; ctx.stroke();
    }

    function checkWin(row,col,player){
        const dirs=[[1,0],[0,1],[1,1],[1,-1]];
        for(let [dx,dy] of dirs){
            let count=1, cells=[{row,col}];
            for(let i=1;i<5;i++){ const nr=row+i*dy, nc=col+i*dx; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE||gameBoard[nr][nc]!==player) break; count++; cells.push({row:nr,col:nc}); }
            for(let i=1;i<5;i++){ const nr=row-i*dy, nc=col-i*dx; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE||gameBoard[nr][nc]!==player) break; count++; cells.push({row:nr,col:nc}); }
            if(count>=5){ winningCells=cells; return true; }
        }
        return false;
    }

    function checkDraw(){ return gameBoard.every(row=>row.every(v=>v!==0)); }

    // 禁手规则检查（仅对黑棋有效）
    // 三三禁手：同时形成两个或以上的活三
    // 四四禁手：同时形成两个或以上的四（包括活四和冲四）
    // 长连禁手：形成六子或以上的连珠

    function checkForbidden(row, col, board) {
        // 禁手规则只对黑棋(1)有效，白棋不受限制
        if (board[row][col] !== 1) return { forbidden: false, reason: '' };
        
        // 检查长连禁手（六子及以上）
        if (checkOverline(row, col, board)) {
            return { forbidden: true, reason: '长连禁手（六子及以上）' };
        }
        
        // 统计活三和四的数量
        let liveThrees = 0;
        let fours = 0;
        
        const directions = [[1,0], [0,1], [1,1], [1,-1]];
        
        for (const [dx, dy] of directions) {
            const lineInfo = analyzeLine(row, col, dx, dy, board);
            
            // 活三：两端都空的连续三子
            if (lineInfo.liveThree) liveThrees++;
            
            // 四：包括活四（两端空）和冲四（一端空）
            if (lineInfo.four) fours++;
        }
        
        // 三三禁手
        if (liveThrees >= 2) {
            return { forbidden: true, reason: '三三禁手（同时形成两个活三）' };
        }
        
        // 四四禁手
        if (fours >= 2) {
            return { forbidden: true, reason: '四四禁手（同时形成两个四）' };
        }
        
        return { forbidden: false, reason: '' };
    }

    // 检查长连禁手
    function checkOverline(row, col, board) {
        const directions = [[1,0], [0,1], [1,1], [1,-1]];
        for (const [dx, dy] of directions) {
            let count = 1;
            // 正方向
            for (let i = 1; i < 6; i++) {
                const nr = row + i * dy, nc = col + i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            // 反方向
            for (let i = 1; i < 6; i++) {
                const nr = row - i * dy, nc = col - i * dx;
                if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
                if (board[nr][nc] !== 1) break;
                count++;
            }
            if (count >= 6) return true;
        }
        return false;
    }

    // 分析一条线上的棋型
    function analyzeLine(row, col, dx, dy, board) {
        let result = { liveThree: false, four: false };
        
        // 获取这条线上的棋子分布
        let line = [];
        let centerIndex = 0;
        
        // 向负方向延伸最多4格
        for (let i = -4; i <= 4; i++) {
            const nr = row + i * dy, nc = col + i * dx;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
                line.push(-1); // 边界
            } else {
                line.push(board[nr][nc]);
            }
            if (i === 0) centerIndex = line.length - 1;
        }
        
        // 从中心点向两端扩展，计算连续黑子数量和空点情况
        let count = 1; // 中心点本身
        let leftEmpty = 0, rightEmpty = 0;
        let leftBlocked = false, rightBlocked = false;
        
        // 向左（负方向）
        for (let i = centerIndex - 1; i >= 0; i--) {
            if (line[i] === 1) {
                count++;
            } else if (line[i] === 0) {
                leftEmpty++;
                break;
            } else {
                leftBlocked = true;
                break;
            }
        }
        
        // 向右（正方向）
        for (let i = centerIndex + 1; i < line.length; i++) {
            if (line[i] === 1) {
                count++;
            } else if (line[i] === 0) {
                rightEmpty++;
                break;
            } else {
                rightBlocked = true;
                break;
            }
        }
        
        // 判断棋型
        // 活四：4个连续黑子，两端都空
        if (count === 4 && leftEmpty > 0 && rightEmpty > 0) {
            result.four = true;
        }
        // 冲四：4个连续黑子，只有一端空
        else if (count === 4 && (leftEmpty > 0 || rightEmpty > 0)) {
            result.four = true;
        }
        // 活三：3个连续黑子，两端都空（且至少一端有两个空位）
        else if (count === 3 && leftEmpty > 0 && rightEmpty > 0) {
            // 需要进一步检查是否是真正的活三（两端都有延伸空间）
            result.liveThree = true;
        }
        
        return result;
    }

    // 判断是否应该启用禁手规则
    function shouldCheckForbidden() {
        if (gameMode === 'ai') return true;  // 人机对战一律禁手
        if (gameMode === 'online') return true;  // 联机对战必须禁手
        if (gameMode === 'pvp') return pvpForbidden;  // 双人对战根据设置
        return false;
    }

    // AI逻辑（保持原版）
    function getAIColor(){ return playerColor===1?2:1; }
    function evaluatePosition(row,col,player){
        const dirs=[[1,0],[0,1],[1,1],[1,-1]]; let score=0;
        for(let [dx,dy] of dirs){
            let count=1, blocked=0;
            for(let i=1;i<5;i++){ const nr=row+i*dy,nc=col+i*dx; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE){blocked++;break;} if(gameBoard[nr][nc]===player) count++; else if(gameBoard[nr][nc]!==0){blocked++;break;} else break; }
            for(let i=1;i<5;i++){ const nr=row-i*dy,nc=col-i*dx; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE){blocked++;break;} if(gameBoard[nr][nc]===player) count++; else if(gameBoard[nr][nc]!==0){blocked++;break;} else break; }
            if(count>=5) return 10000;
            if(count===4 && blocked===0) score+=1000; else if(count===4 && blocked===1) score+=100;
            else if(count===3 && blocked===0) score+=50; else if(count===3 && blocked===1) score+=10;
            else if(count===2 && blocked===0) score+=5;
        }
        return score + (BOARD_SIZE/2 - Math.hypot(row-BOARD_SIZE/2, col-BOARD_SIZE/2))*2;
    }

    function findEasyMove(){
        const ai=getAIColor(), hu=playerColor;
        const empty=[]; let nearPieces=[];
        
        for(let i=0;i<BOARD_SIZE;i++){
            for(let j=0;j<BOARD_SIZE;j++){
                if(gameBoard[i][j]===0){
                    empty.push({row:i,col:j});
                    
                    let hasNeighbor=false;
                    for(let dx=-2;dx<=2;dx++){
                        for(let dy=-2;dy<=2;dy++){
                            const nr=i+dy, nc=j+dx;
                            if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&gameBoard[nr][nc]!==0){
                                hasNeighbor=true;
                                break;
                            }
                        }
                        if(hasNeighbor) break;
                    }
                    if(hasNeighbor) nearPieces.push({row:i,col:j});
                }
            }
        }
        
        let candidates = nearPieces.length > 0 ? nearPieces : empty;

        // 检查己方是否可以直接获胜（5连）
        for (const {row:i, col:j} of candidates) {
            gameBoard[i][j] = ai;
            if (checkWin(i, j, ai)) {
                gameBoard[i][j] = 0;
                return {row:i, col:j};
            }
            gameBoard[i][j] = 0;
        }

        // 检查对方是否可以直接获胜（防守5连）
        for (const {row:i, col:j} of candidates) {
            gameBoard[i][j] = hu;
            if (checkWin(i, j, hu)) {
                gameBoard[i][j] = 0;
                return {row:i, col:j};
            }
            gameBoard[i][j] = 0;
        }

        // 检测活3并防守
        // 活3：连续3个同色棋子，两端都空，对方下一步可形成活4
        const liveThreeBlocks = findLiveThreeBlocks(hu);
        if (liveThreeBlocks.length > 0) {
            // 优先防守活3的延伸点
            for (const block of liveThreeBlocks) {
                // 检查两端是否在候选位置中
                const end1 = {row: block.end1.row, col: block.end1.col};
                const end2 = {row: block.end2.row, col: block.end2.col};
                
                // 找到可以防守的位置
                for (const end of [end1, end2]) {
                    if (end.row >= 0 && end.row < BOARD_SIZE && 
                        end.col >= 0 && end.col < BOARD_SIZE && 
                        gameBoard[end.row][end.col] === 0) {
                        return end;
                    }
                }
            }
        }

        const weights = candidates.map(pos=>{
            const centerDist=Math.hypot(pos.row-BOARD_SIZE/2, pos.col-BOARD_SIZE/2);
            return Math.max(0, (BOARD_SIZE/2-centerDist)/10);
        });
        
        const totalWeight=weights.reduce((a,b)=>a+b,0);
        if(totalWeight>0 && Math.random()<0.7){
            let r=Math.random()*totalWeight;
            for(let i=0;i<candidates.length;i++){
                r-=weights[i];
                if(r<=0) return candidates[i];
            }
        }
        
        return candidates[Math.floor(Math.random()*candidates.length)];
    }
    
    // 检测活3函数
    function findLiveThreeBlocks(player) {
        const liveThrees = [];
        const directions = [[1,0], [0,1], [1,1], [1,-1]]; // 垂直、水平、两条对角线
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (gameBoard[i][j] === player) {
                    for (const [dx, dy] of directions) {
                        // 检查是否是连续3个
                        let count = 1;
                        let startRow = i, startCol = j;
                        
                        // 向前找起点
                        while (startRow - dx >= 0 && startCol - dy >= 0 && 
                               startRow - dx < BOARD_SIZE && startCol - dy < BOARD_SIZE &&
                               gameBoard[startRow - dx][startCol - dy] === player) {
                            startRow -= dx;
                            startCol -= dy;
                            count++;
                        }
                        
                        // 检查起点前面是否为空（活3的一端）
                        const end1Row = startRow - dx;
                        const end1Col = startCol - dy;
                        const end1Empty = end1Row >= 0 && end1Col >= 0 && 
                                          end1Row < BOARD_SIZE && end1Col < BOARD_SIZE &&
                                          gameBoard[end1Row][end1Col] === 0;
                        
                        // 向后找终点
                        let endRow = i, endCol = j;
                        while (endRow + dx >= 0 && endCol + dy >= 0 && 
                               endRow + dx < BOARD_SIZE && endCol + dy < BOARD_SIZE &&
                               gameBoard[endRow + dx][endCol + dy] === player) {
                            endRow += dx;
                            endCol += dy;
                            count++;
                        }
                        
                        // 检查终点后面是否为空（活3的另一端）
                        const end2Row = endRow + dx;
                        const end2Col = endCol + dy;
                        const end2Empty = end2Row >= 0 && end2Col >= 0 && 
                                          end2Row < BOARD_SIZE && end2Col < BOARD_SIZE &&
                                          gameBoard[end2Row][end2Col] === 0;
                        
                        // 只有恰好3个且两端都空才是活3
                        if (count === 3 && end1Empty && end2Empty) {
                            liveThrees.push({
                                start: {row: startRow, col: startCol},
                                end: {row: endRow, col: endCol},
                                end1: {row: end1Row, col: end1Col},
                                end2: {row: end2Row, col: end2Col},
                                direction: {dx, dy}
                            });
                        }
                    }
                }
            }
        }
        
        // 去重（同一个活3可能被多次检测）
        const unique = [];
        for (const t of liveThrees) {
            const exists = unique.some(u => 
                u.start.row === t.start.row && u.start.col === t.start.col &&
                u.end.row === t.end.row && u.end.col === t.end.col
            );
            if (!exists) unique.push(t);
        }
        
        return unique;
    }
    
    function findMediumMove(){
        const ai=getAIColor(), hu=playerColor; let best=null, bestScore=-Infinity;
        for(let i=0;i<BOARD_SIZE;i++) for(let j=0;j<BOARD_SIZE;j++) if(gameBoard[i][j]===0){
            gameBoard[i][j]=ai; if(checkWin(i,j,ai)){ gameBoard[i][j]=0; return {row:i,col:j}; }
            gameBoard[i][j]=hu; if(checkWin(i,j,hu)){ gameBoard[i][j]=0; return {row:i,col:j}; }
            gameBoard[i][j]=ai; let score = evaluatePosition(i,j,ai);
            gameBoard[i][j]=hu; score += evaluatePosition(i,j,hu)*0.8;
            gameBoard[i][j]=0;
            if(score>bestScore){ bestScore=score; best={row:i,col:j}; }
        }
        return best;
    }

    function findHardMove(){
        const ai=getAIColor(), hu=playerColor; let best=null, bestScore=-Infinity;
        for(let i=0;i<BOARD_SIZE;i++) for(let j=0;j<BOARD_SIZE;j++) if(gameBoard[i][j]===0){
            gameBoard[i][j]=ai; let score = evaluatePosition(i,j,ai);
            let playerBest=-Infinity;
            for(let x=0;x<BOARD_SIZE;x++) for(let y=0;y<BOARD_SIZE;y++) if(gameBoard[x][y]===0){ gameBoard[x][y]=hu; const s=evaluatePosition(x,y,hu); gameBoard[x][y]=0; if(s>playerBest) playerBest=s; }
            score -= playerBest*0.7; gameBoard[i][j]=0;
            if(score>bestScore){ bestScore=score; best={row:i,col:j}; }
        }
        return best;
    }

    function aiMove(){
        if(!gameActive || gameMode!=='ai' || currentPlayer !== getAIColor()) return;
        let move=null;
        if(aiDifficulty==='easy') move=findEasyMove();
        else if(aiDifficulty==='medium') move=findMediumMove();
        else move=findHardMove();
        if(move) placePiece(move.row, move.col, getAIColor());
    }

    // 游戏流程
    function placePiece(row, col, player){
        if(!gameActive || row<0||row>=BOARD_SIZE||col<0||col>=BOARD_SIZE||gameBoard[row][col]!==0) return false;
        
        // 禁手规则检查（仅对黑棋）
        if (shouldCheckForbidden() && player === 1) {
            // 临时放置棋子检查禁手
            const tempBoard = gameBoard.map(r => r.slice());
            tempBoard[row][col] = 1;
            const forbiddenCheck = checkForbidden(row, col, tempBoard);
            if (forbiddenCheck.forbidden) {
                showToast(`禁手: ${forbiddenCheck.reason}`, true);
                return false;
            }
        }
        
        gameBoard[row][col] = player;
        moveHistory.push({row,col,player});
        drawBoard();
        if(checkWin(row,col,player)){ handleGameOver(player); return true; }
        if(checkDraw()){ handleGameOver(0); return true; }
        currentPlayer = (player===1?2:1);
        updateUI();
        
        // 双人对战时间限制处理
        if (gameMode === 'pvp' && pvpTimeLimit > 0) {
            startPvpTurnTimer();
        }
        
        if(gameMode==='ai' && gameActive && currentPlayer === getAIColor()) setTimeout(aiMove, 200);
        return true;
    }
    
    // 双人对战回合计时器
    function startPvpTurnTimer() {
        stopPvpTurnTimer();
        pvpTurnStartTime = Date.now();
        pvpTurnTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - pvpTurnStartTime) / 1000);
            const remaining = pvpTimeLimit - elapsed;
            if (remaining <= 0) {
                stopPvpTurnTimer();
                // 超时判负
                const loser = currentPlayer;
                const winner = loser === 1 ? 2 : 1;
                showToast(`超时！${loser === 1 ? '黑棋' : '白棋'}判负`, true);
                handleGameOver(winner);
            } else if (remaining <= 10) {
                // 最后10秒提示
                showToast(`剩余 ${remaining} 秒！`, remaining <= 5);
            }
        }, 1000);
    }
    
    function stopPvpTurnTimer() {
        if (pvpTurnTimer) {
            clearInterval(pvpTurnTimer);
            pvpTurnTimer = null;
        }
    }

    function handleGameOver(winner){
        gameActive = false; stopTimer(); stopOnlinePolling();
        if(gameMode === 'online' && onlineMatchId) {
            apiCall('/api/match/leave', 'POST', { matchId: onlineMatchId }).catch(()=>{});
            onlineMatchId = null; onlineMyColor = null; onlineOpponent = null;
        }
        const isPlayerWin = (winner === playerColor);
        document.getElementById('winnerText').textContent = winner===0 ? '平局' : `${winner===1?'黑棋':'白棋'} 胜利`;
        document.getElementById('winMessage').textContent = isPlayerWin ? '恭喜获胜！' : (winner===0 ? '势均力敌' : '继续努力');
        document.getElementById('winModal').classList.remove('hidden');
        if(currentUser){
            if (gameMode === 'ai') {
                if (winner === 0) {
                    saveGameRecord('draw', 'ai');
                } else {
                    const result = winner===playerColor ? 'win' : 'lose';
                    saveGameRecord(result, 'ai');
                }
            } else if (gameMode === 'pvp') {
                saveGameRecord(winner === 0 ? 'draw' : (winner === 1 ? 'win' : 'lose'), 'pvp');
            }
        }
    }

    function updateUI(){
        if(!gameActive) return;
        let label = gameMode==='ai' ? (currentPlayer===playerColor?'你':'AI') : (currentPlayer===1?'黑棋':'白棋');
        document.getElementById('statusText').textContent = `游戏进行中 - ${label} (${currentPlayer===1?'黑棋':'白棋'}) 回合`;
        document.getElementById('moveCount').textContent = moveHistory.length;
        document.getElementById('undoCountText').textContent = `悔棋次数: ${undoCount}/3`;
        document.getElementById('gameTimeDisplay').textContent = formatTime(gameTime);
    }

    function formatTime(sec) { const m = Math.floor(sec/60).toString().padStart(2,'0'); const s = (sec%60).toString().padStart(2,'0'); return `${m}:${s}`; }
    
    function formatRemainingTime(timestampMs) {
        const now = new Date().getTime();
        const remaining = timestampMs - now;
        
        if (remaining <= 0) {
            return '已解封';
        }
        
        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        if (days > 0) {
            return `${days}天 ${hours}时 ${minutes}分`;
        } else if (hours > 0) {
            return `${hours}时 ${minutes}分 ${seconds}秒`;
        } else if (minutes > 0) {
            return `${minutes}分 ${seconds}秒`;
        } else {
            return `${seconds}秒`;
        }
    }

    function resetGame(){
        stopTimer(); stopPvpTurnTimer(); initBoard(); currentPlayer=1; gameActive=true; moveHistory=[]; gameTime=0; undoCount=0; winningCells=[];
        drawBoard(); updateUI();
        document.getElementById('winModal').classList.add('hidden');
        if(gameMode==='ai' && playerColor===2) { startTimer(); setTimeout(()=>aiMove(),300); }
        else if(gameMode==='online') { startTimer(); startOnlinePolling(); }
        else { startTimer(); }
    }

    function undoMove(){
        if(!gameActive || moveHistory.length===0) { showToast('没有可悔棋的操作',true); return; }
        if(undoCount>=3) { showToast('悔棋次数已用完',true); return; }
        
        let stepsToUndo = 1;
        if (gameMode === 'ai') {
            stepsToUndo = (currentPlayer === playerColor) ? 2 : 1;
        }
        
        if (moveHistory.length < stepsToUndo) {
            showToast('无法悔棋', true);
            return;
        }
        
        for (let i = 0; i < stepsToUndo; i++) {
            const m = moveHistory.pop();
            if (m) {
                gameBoard[m.row][m.col] = 0;
            }
        }
        
        undoCount++;
        if (gameMode === 'ai') {
            currentPlayer = playerColor;
        } else {
            currentPlayer = (currentPlayer === 1 ? 2 : 1);
        }
        winningCells=[];
        drawBoard(); updateUI(); showToast(`已悔${stepsToUndo}步`);
    }

    function startTimer(){ if(timerInterval) clearInterval(timerInterval); timerInterval = setInterval(()=>{ if(gameActive){ gameTime++; document.getElementById('gameTimeDisplay').textContent=formatTime(gameTime); } },1000); }
    function stopTimer(){ clearInterval(timerInterval); timerInterval=null; }

    let postLoginTurnstileToken = '';
    let turnstileSDKLoaded = false;

    // 预加载 Turnstile SDK（页面加载时立即调用）
    function loadTurnstileSDK() {
        if (turnstileSDKLoaded || typeof window.turnstile !== 'undefined') {
            turnstileSDKLoaded = true;
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.onload = function() {
            turnstileSDKLoaded = true;
            console.log('Turnstile SDK 加载完成');
        };
        script.onerror = function() {
            console.error('Turnstile SDK 加载失败');
        };
        document.head.appendChild(script);
        console.log('开始加载 Turnstile SDK...');
    }
    
    // 初始化登录后 Turnstile
    function initPostLoginTurnstile() {
        if (!turnstileSiteKey) {
            console.log('Turnstile sitekey not ready, waiting...');
            setTimeout(initPostLoginTurnstile, 100);
            return;
        }
        
        // 等待 SDK 加载完成
        function waitForSDK() {
            if (typeof window.turnstile === 'undefined') {
                console.log('Turnstile SDK not ready, waiting...');
                setTimeout(waitForSDK, 100);
                return;
            }
            console.log('Turnstile SDK ready, rendering...');
            renderPostLoginTurnstile();
        }
        
        waitForSDK();
    }
    
    function renderPostLoginTurnstile() {
        window.turnstile.render('#postLoginTurnstileWidget', {
            sitekey: turnstileSiteKey,
            theme: 'light',
            size: 'normal',
            callback: function(token) {
                postLoginTurnstileToken = token;
                showToast('安全验证通过');
                // 验证成功，自动进入游戏
                completePostLoginVerification();
            },
            'error-callback': function(error) {
                postLoginTurnstileToken = '';
                showToast('验证失败，请重试', true);
            }
        });
    }
    
    // 完成登录后验证，进入游戏
    async function completePostLoginVerification() {
        if (!postLoginTurnstileToken) {
            showToast('请先完成安全验证', true);
            return;
        }
        
        try {
            const res = await fetch('/api/captcha/turnstile/verify', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${token}`
                },
                body: `response=${encodeURIComponent(postLoginTurnstileToken)}`
            });
            const data = await res.json();
            
            if (data.code === 0) {
                document.getElementById('postLoginTurnstileModal').classList.add('hidden');
                isLoggedIn = true;
                showGameUI();
                startStatusCheck();
                showToast(`欢迎回来，${currentUser.username}！`);
            } else {
                showToast('验证失败: ' + data.msg, true);
                postLoginTurnstileToken = '';
                document.getElementById('postLoginVerifyBtn').disabled = true;
                if (typeof window.turnstile !== 'undefined') {
                    window.turnstile.reset('#postLoginTurnstileWidget');
                }
            }
        } catch (error) {
            showToast('验证请求失败', true);
        }
    }

    // API交互
    async function login(username, password, captchaToken){
        const res = await apiCall('/api/login','POST',{username,password,captchaToken}, true);
        token = res.token; localStorage.setItem('token', token);
        currentUser = res.user;
        
        // admin用户跳过Turnstile验证，直接进入游戏
        if (currentUser && currentUser.isAdmin) {
            isLoggedIn = true;
            showGameUI();
            startStatusCheck();
            showToast(`欢迎回来，${currentUser.username}！`);
            return;
        }
        
        // 显示登录后 Turnstile 验证界面
        document.getElementById('loginModal').classList.add('hidden');
        const modal = document.getElementById('postLoginTurnstileModal');
        modal.classList.remove('hidden');
        
        // 初始化 Turnstile（模态框显示后再渲染）
        postLoginTurnstileToken = '';
        
        // 等待 DOM 更新后再渲染
        requestAnimationFrame(() => {
            initPostLoginTurnstile();
        });
    }

    async function loginPasswordFree(username){
        const res = await apiCall('/api/login/password_free','POST',{username}, true);
        token = res.token; localStorage.setItem('token', token);
        currentUser = res.user;
        isLoggedIn = true;
        document.getElementById('passwordFreeLoginPage').classList.add('hidden');
        showGameUI();
        startStatusCheck();
        showToast(`欢迎回来，${currentUser.username}！`);
    }
    
    // 检查免密登录剩余次数并显示提示
    async function checkPasswordFreeAttempts(username) {
        const infoEl = document.getElementById('passwordFreeAttemptsInfo');
        const textEl = document.getElementById('passwordFreeAttemptsText');
        if (!username.trim()) {
            infoEl.classList.add('hidden');
            return;
        }
        try {
            const res = await apiCall('/api/user/password_free_info', 'POST', {username}, true);
            if (res.passwordFree) {
                if (res.maxAttempts > 0) {
                    if (res.remainingAttempts <= 0) {
                        textEl.textContent = `免密登录次数已用尽（${res.remainingAttempts}/${res.maxAttempts}），请联系管理员`;
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-red-600 bg-red-100 rounded-lg p-2';
                    } else {
                        textEl.textContent = `免密登录剩余 ${res.remainingAttempts}/${res.maxAttempts} 次`;
                        infoEl.classList.remove('hidden');
                        infoEl.className = 'text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2';
                    }
                } else {
                    textEl.textContent = '免密登录无次数限制';
                    infoEl.classList.remove('hidden');
                    infoEl.className = 'text-center text-sm text-gray-600 bg-gray-100 rounded-lg p-2';
                }
            } else {
                infoEl.classList.add('hidden');
            }
        } catch (err) {
            infoEl.classList.add('hidden');
        }
    }

    async function register(username, password, captchaToken){
        await apiCall('/api/register','POST',{username,password,captchaToken}, true);
        showToast('注册成功，请登录');
        document.getElementById('registerModal').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('hidden');
        sessionStorage.removeItem('registerFormInteracted');
    }

    async function logout(){
        if(onlineMatchId) await apiCall('/api/match/leave', 'POST', { matchId: onlineMatchId }).catch(()=>{});
        await apiCall('/api/logout','POST').catch(()=>{});
        
        // 自己点击退出时，清除输入框中的用户名、密码和验证码
        const loginUsername = document.getElementById('username');
        const loginPassword = document.getElementById('password');
        const regUsername = document.getElementById('regUsername');
        const regPassword = document.getElementById('regPassword');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (loginUsername) loginUsername.value = '';
        if (loginPassword) loginPassword.value = '';
        if (regUsername) regUsername.value = '';
        if (regPassword) regPassword.value = '';
        if (confirmPassword) confirmPassword.value = '';
        
        // 重置验证码状态
        refreshGeetestCaptcha(true);  // 刷新登录验证码
        refreshGeetestCaptcha(false); // 刷新注册验证码
        
        handleForceLogout('已安全退出');
    }

    async function loadUserData(){
        const data = await apiCall('/api/user');
        currentUser = data;
        updateUserDisplay();
        if(currentUser.isAdmin) {
            document.getElementById('adminTab').classList.remove('hidden');
            // 普通管理员不显示管理员账号管理功能
            const adminMgmt = document.getElementById('adminAccountManagement');
            if (adminMgmt) {
                adminMgmt.classList.toggle('hidden', !currentUser.isSuperAdmin);
            }
        }
    }

    async function saveGameRecord(result, mode, opponent){
        mode = mode || gameMode || 'ai';
        const modeLabels = { ai: '人机对战', pvp: '双人对战', online: '联机对战' };
        const modeLabel = modeLabels[mode] || mode;
        let opponentLabel = opponent || '';
        if (mode === 'ai' && !opponent) {
            const difficultyText = aiDifficulty==='easy'?'简单':(aiDifficulty==='medium'?'中等':'困难');
            opponentLabel = 'AI (' + difficultyText + ')';
        } else if (mode === 'pvp' && !opponent) {
            opponentLabel = '玩家对战';
        }
        const resultLabel = result === 'win' ? '胜利' : (result === 'lose' ? '失败' : '平局');
        const record = { 
            date: new Date().toLocaleString(), 
            result: resultLabel,
            resultKey: result,
            mode: mode,
            modeLabel: modeLabel,
            opponent: opponentLabel,
            timestamp: Math.floor(Date.now() / 1000)
        };
        await apiCall('/api/records','POST',record);
        if (result !== 'draw') {
            let scoreChange = result==='win'?50:-20;
            currentUser.score = Math.max(0, (currentUser.score||0)+scoreChange);
            if(result==='win') currentUser.wins = (currentUser.wins||0)+1;
            currentUser.games = (currentUser.games||0)+1;
            await apiCall('/api/user/update','POST',{score:currentUser.score, wins:currentUser.wins, games:currentUser.games});
            updateUserDisplay();
        }
    }

    let historyPageSize = 10;
    let historyCurrentPage = 1;
    let historyAllRecords = [];

    async function loadHistory(){
        try {
            const data = await apiCall('/api/statistics');
            historyAllRecords = data.records || [];
            renderHistory();
        } catch(e) {
            console.error('加载游戏记录失败', e);
        }
    }

    function renderHistory(){
        const modeFilter = document.getElementById('historyModeFilter').value;
        const resultFilter = document.getElementById('historyResultFilter').value;
        let filtered = historyAllRecords;
        if (modeFilter !== 'all') {
            filtered = filtered.filter(r => r.mode === modeFilter);
        }
        if (resultFilter !== 'all') {
            filtered = filtered.filter(r => r.resultKey === resultFilter || 
                (resultFilter === 'win' && r.result === '胜利') ||
                (resultFilter === 'lose' && r.result === '失败') ||
                (resultFilter === 'draw' && r.result === '平局'));
        }
        const totalPages = Math.max(1, Math.ceil(filtered.length / historyPageSize));
        if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
        const start = (historyCurrentPage - 1) * historyPageSize;
        const end = start + historyPageSize;
        const pageRecords = filtered.slice(start, end);

        const tbody = document.getElementById('historyTableBody');
        const emptyDiv = document.getElementById('historyEmpty');
        const paginationDiv = document.getElementById('historyPagination');

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyDiv.classList.remove('hidden');
            paginationDiv.classList.add('hidden');
            return;
        }
        emptyDiv.classList.add('hidden');
        if (totalPages > 1) {
            paginationDiv.classList.remove('hidden');
            document.getElementById('historyPageInfo').textContent = `第 ${historyCurrentPage}/${totalPages} 页 (共 ${filtered.length} 条)`;
            document.getElementById('historyPrevPage').disabled = historyCurrentPage <= 1;
            document.getElementById('historyNextPage').disabled = historyCurrentPage >= totalPages;
        } else {
            paginationDiv.classList.add('hidden');
        }

        tbody.innerHTML = pageRecords.map(r => {
            const modeLabel = r.modeLabel || r.mode || '未知';
            const resultLabel = r.result || '未知';
            const resultClass = resultLabel === '胜利' ? 'text-green-600' : (resultLabel === '失败' ? 'text-red-600' : 'text-yellow-600');
            const opponent = r.opponent || '-';
            const scoreChange = resultLabel === '胜利' ? '+50' : (resultLabel === '失败' ? '-20' : '0');
            const scoreClass = resultLabel === '胜利' ? 'text-green-600' : (resultLabel === '失败' ? 'text-red-600' : 'text-gray-500');
            return `<tr class="border-b hover:bg-gray-50">
                <td class="border px-4 py-2.5 text-sm">${r.date || '-'}</td>
                <td class="border px-4 py-2.5 text-sm">${modeLabel}</td>
                <td class="border px-4 py-2.5 text-sm">${opponent}</td>
                <td class="border px-4 py-2.5 text-sm font-medium ${resultClass}">${resultLabel}</td>
                <td class="border px-4 py-2.5 text-sm font-medium ${scoreClass}">${scoreChange}</td>
            </tr>`;
        }).join('');
    }

    async function loadStats(){
        try {
            const data = await apiCall('/api/statistics');
            document.getElementById('statTotalGames').textContent = data.total;
            document.getElementById('statWins').textContent = data.wins;
            document.getElementById('statLosses').textContent = data.losses;
            document.getElementById('statDraws').textContent = data.draws;
            document.getElementById('statWinRate').textContent = data.winRate + '%';
        } catch(e) {
            console.error('加载统计数据失败', e);
        }
    }

    async function loadSavedGames(){
        const saves = await apiCall('/api/saves');
        const listDiv = document.getElementById('savedGamesList');
        listDiv.innerHTML = saves.length ? '' : '<p class="text-gray-500 text-center py-2">暂无存档</p>';
        saves.slice(0,5).forEach(s=>{
            const el = document.createElement('div');
            el.className = 'bg-white p-2 rounded border flex justify-between items-center saved-game-card cursor-pointer';
            el.innerHTML = `<div><span class="font-medium">${s.date}</span><br><span class="text-xs">${s.difficulty} · ${formatTime(s.gameTime)}</span></div><button class="text-red-500 delete-save" data-id="${s.id}"><i class="fa-solid fa-times"></i></button>`;
            el.addEventListener('click', (e)=>{ if(!e.target.closest('.delete-save')) loadGame(s.id); });
            el.querySelector('.delete-save').addEventListener('click', async (e)=>{ e.stopPropagation(); await apiCall(`/api/saves/${s.id}`,'DELETE'); loadSavedGames(); });
            listDiv.appendChild(el);
        });
    }

    async function saveGame(){
        const saveData = { id: Date.now().toString(), date: new Date().toLocaleString(), board: gameBoard, currentPlayer, playerColor, moveHistory, gameTime, difficulty: aiDifficulty, undoCount };
        await apiCall('/api/saves','POST',saveData);
        showToast('游戏已保存'); loadSavedGames();
    }

    async function loadGame(saveId){
        const saves = await apiCall('/api/saves');
        const save = saves.find(s=>s.id===saveId);
        if(!save) return;
        gameBoard = save.board; currentPlayer = save.currentPlayer; playerColor = save.playerColor;
        moveHistory = save.moveHistory; gameTime = save.gameTime; aiDifficulty = save.difficulty; undoCount = save.undoCount||0;
        gameActive = true; winningCells = [];
        updateDifficultyButtons(); updateColorButtons();
        drawBoard(); updateUI(); startTimer();
        document.getElementById('gameTab').click();
    }

    // 分页与搜索状态
    let adminAllUsers = [];
    let adminCurrentPage = 1;
    let adminPageSize = 5;
    let adminSearchFilter = '';

    function renderPagination(totalFiltered) {
        const pagination = document.getElementById('adminPagination');
        const totalPages = Math.max(1, Math.ceil(totalFiltered / adminPageSize));
        if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;

        if (totalFiltered <= adminPageSize) {
            pagination.classList.add('hidden');
            return;
        }
        pagination.classList.remove('hidden');

        document.getElementById('paginationInfo').textContent =
            `共 ${totalFiltered} 条，第 ${adminCurrentPage}/${totalPages} 页`;

        document.getElementById('pagePrev').disabled = adminCurrentPage <= 1;
        document.getElementById('pageNext').disabled = adminCurrentPage >= totalPages;

        // 生成页码按钮
        const container = document.getElementById('pageNumbers');
        container.innerHTML = '';
        const maxVisible = 7;
        let startPage = Math.max(1, adminCurrentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            container.appendChild(createPageBtn(1));
            if (startPage > 2) container.appendChild(createEllipsis());
        }
        for (let i = startPage; i <= endPage; i++) {
            container.appendChild(createPageBtn(i));
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) container.appendChild(createEllipsis());
            container.appendChild(createPageBtn(totalPages));
        }
    }

    function createPageBtn(page) {
        const btn = document.createElement('button');
        btn.textContent = page;
        btn.className = `px-3 py-1.5 text-sm border rounded-lg ${page === adminCurrentPage ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'}`;
        btn.addEventListener('click', () => {
            adminCurrentPage = page;
            loadAdminUsers();
        });
        return btn;
    }

    function createEllipsis() {
        const span = document.createElement('span');
        span.textContent = '…';
        span.className = 'px-2 text-gray-400';
        return span;
    }

    function getFilteredUsers() {
        if (!adminSearchFilter) return adminAllUsers;
        return adminAllUsers.filter(u => u.username.toLowerCase().includes(adminSearchFilter));
    }

    async function loadAdminUsers(){
        // 重置全选复选框
        const selectAllCb = document.getElementById('selectAllUsers');
        if (selectAllCb) selectAllCb.checked = false;

        // 保存当前选中的用户
        const checkedUsers = new Set();
        document.querySelectorAll('.user-checkbox:checked').forEach(cb => {
            checkedUsers.add(cb.value);
        });

        // 获取搜索关键词
        const searchInput = document.getElementById('adminUserSearch');
        if (searchInput) adminSearchFilter = searchInput.value.trim().toLowerCase();

        // 首次加载或刷新时重新获取数据
        const users = await apiCall('/api/admin/users');
        adminAllUsers = users;

        const filteredUsers = getFilteredUsers();

        // 更新用户计数
        const countEl = document.getElementById('adminUserCount');
        if (countEl) {
            countEl.textContent = adminSearchFilter
                ? `共 ${users.length} 个用户，筛选出 ${filteredUsers.length} 个`
                : `共 ${users.length} 个用户`;
        }

        // 分页
        const totalPages = Math.max(1, Math.ceil(filteredUsers.length / adminPageSize));
        if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
        const startIdx = (adminCurrentPage - 1) * adminPageSize;
        const pageUsers = filteredUsers.slice(startIdx, startIdx + adminPageSize);

        const tbody = document.getElementById('adminUserTable');
        const isSuperAdmin = currentUser && currentUser.isSuperAdmin;

        tbody.innerHTML = pageUsers.map(u => {
            const isBanned = u.isBanned;
            const remainingMinutes = u.remainingMinutes;
            const isOnline = u.isOnline;
            const isTargetSuperAdmin = u.isSuperAdmin;
            const canOperate = !isTargetSuperAdmin && (isSuperAdmin || (currentUser && currentUser.canManage !== false)); // 是否可以操作
            
            // 恢复复选框选中状态
            const isChecked = checkedUsers.has(u.username) ? 'checked' : '';
            
            let roleTag = '';
            if (u.isSuperAdmin) {
                roleTag = '<span class="text-xs px-2 py-1 rounded bg-red-100 text-red-800">超级</span>';
            } else if (u.isAdmin) {
                const canManage = u.canManage !== false;
                roleTag = `<span class="text-xs px-2 py-1 rounded ${canManage ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${canManage ? '管理员' : '已禁用'}</span>`;
            }
            
            // 其他字段显示
            const scoreDisplay = canOperate || isSuperAdmin ? u.score : '<span class="text-gray-400">权限不足</span>';
            const winsDisplay = canOperate || isSuperAdmin ? u.wins : '<span class="text-gray-400">权限不足</span>';
            const gamesDisplay = canOperate || isSuperAdmin ? u.games : '<span class="text-gray-400">权限不足</span>';
            let bannedDisplay = '正常';
            if (canOperate || isSuperAdmin) {
                if (isBanned) {
                    bannedDisplay = `<span class="text-red-600">封禁中 (${remainingMinutes}分钟)</span>`;
                }
            } else {
                bannedDisplay = '<span class="text-gray-400">权限不足</span>';
            }
            
            const onlineDisplay = isOnline ? '<span class="text-green-600">在线</span>' : '<span class="text-gray-400">离线</span>';
            
            // 验证码状态显示
            let captchaDisplay = '';
            if (canOperate || isSuperAdmin) {
                const captchaEnabled = u.useCaptcha !== false;
                captchaDisplay = captchaEnabled ? '<span class="text-green-600">启用</span>' : '<span class="text-red-600">禁用</span>';
            } else {
                captchaDisplay = '<span class="text-gray-400">权限不足</span>';
            }
            
            // 免密登录状态显示
            let passwordFreeDisplay = '';
            if (u.passwordFree === true) {
                const maxAttempts = u.passwordFreeMaxAttempts || 0;
                const remainingAttempts = u.passwordFreeRemainingAttempts !== undefined ? u.passwordFreeRemainingAttempts : '-';
                if (maxAttempts > 0) {
                    passwordFreeDisplay = `<span class="text-green-600">启用</span><br><span class="text-xs text-gray-500">剩余 ${remainingAttempts}/${maxAttempts} 次</span>`;
                } else {
                    passwordFreeDisplay = '<span class="text-green-600">启用</span><br><span class="text-xs text-gray-500">无次数限制</span>';
                }
            } else {
                passwordFreeDisplay = '<span class="text-gray-400">禁用</span>';
            }
            
            const checkboxDisabled = !canOperate && !isSuperAdmin ? 'disabled' : '';
            
            return `<tr class="admin-user-row cursor-pointer hover:bg-gray-50" data-username="${u.username}">
                <td class="border px-2 py-2"><input type="checkbox" class="user-checkbox w-4 h-4" value="${u.username}" ${checkboxDisabled} ${isChecked}></td>
                <td class="border px-4 py-2">${u.username} ${roleTag}</td>
                <td class="border px-4 py-2">${scoreDisplay}</td>
                <td class="border px-4 py-2">${winsDisplay}</td>
                <td class="border px-4 py-2">${gamesDisplay}</td>
                <td class="border px-4 py-2">${bannedDisplay}</td>
                <td class="border px-4 py-2">${onlineDisplay}</td>
                <td class="border px-2 py-2 text-center">${captchaDisplay}</td>
                <td class="border px-2 py-2 text-center">${passwordFreeDisplay}</td>
            </tr>`;
        }).join('');
        
        // 点击表格行选择用户
        tbody.querySelectorAll('.admin-user-row').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.type === 'checkbox') return;
                selectAdminUser(this.dataset.username);
            });
        });
        
        // 更新分页控件
        renderPagination(filteredUsers.length);
        
        startBannedCountdown();
    }

    // 搜索输入防抖
    let searchTimer = null;
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'adminUserSearch') {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                adminCurrentPage = 1;
                loadAdminUsers();
            }, 300);
        }
    });

    // 每页条数切换
    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'pageSizeSelect') {
            adminPageSize = parseInt(e.target.value);
            adminCurrentPage = 1;
            loadAdminUsers();
        }
    });

    // 上一页 / 下一页
    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target.id === 'pagePrev' || target.closest('#pagePrev')) {
            if (adminCurrentPage > 1) {
                adminCurrentPage--;
                loadAdminUsers();
            }
        }
        if (target.id === 'pageNext' || target.closest('#pageNext')) {
            const filtered = getFilteredUsers();
            const totalPages = Math.max(1, Math.ceil(filtered.length / adminPageSize));
            if (adminCurrentPage < totalPages) {
                adminCurrentPage++;
                loadAdminUsers();
            }
        }
    });

    // 选择用户
    function selectAdminUser(username) {
        document.getElementById('adminBanUsername').value = username;
        const user = adminAllUsers.find(u => u.username === username);
        const infoEl = document.getElementById('selectedUserInfo');
        const captchaBtn = document.getElementById('adminCaptchaToggle');
        const pfToggle = document.getElementById('adminPasswordFreeToggle');
        const pfAttempts = document.getElementById('adminPasswordFreeAttempts');
        const scoreBtn = document.getElementById('adminUpdateScoreBtn');
        
        if (!user) {
            infoEl.textContent = '';
            captchaBtn.classList.add('hidden');
            pfToggle.classList.add('hidden');
            pfAttempts.classList.add('hidden');
            return;
        }
        
        const isSuperAdmin = currentUser && currentUser.isSuperAdmin;
        const isTargetSuperAdmin = user.isSuperAdmin;
        const canOperate = !isTargetSuperAdmin && (isSuperAdmin || (currentUser && currentUser.canManage !== false));
        
        // 显示用户信息
        let info = `当前用户：${user.username}`;
        if (user.isSuperAdmin) info += ' | 超级管理员';
        else if (user.isAdmin) info += ' | 管理员';
        info += ` | 积分：${user.score} | 胜场：${user.wins} | 对局：${user.games}`;
        infoEl.textContent = info;
        
        // 改积分按钮（仅超级管理员）
        scoreBtn.classList.toggle('hidden', !isSuperAdmin);
        
        // 验证码 toggle
        if (canOperate || isSuperAdmin) {
            const captchaEnabled = user.useCaptcha !== false;
            captchaBtn.classList.remove('hidden');
            captchaBtn.textContent = captchaEnabled ? '禁用' : '启用';
            captchaBtn.className = `px-3 py-1.5 text-sm border rounded-lg ${captchaEnabled ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'}`;
            captchaBtn.dataset.username = username;
            captchaBtn.dataset.usecaptcha = !captchaEnabled;
        } else {
            captchaBtn.classList.add('hidden');
        }
        
        // 免密登录 toggle（仅超级管理员对非超级管理员）
        if (isSuperAdmin && !user.isSuperAdmin) {
            const pfEnabled = user.passwordFree === true;
            pfToggle.classList.remove('hidden');
            pfToggle.textContent = pfEnabled ? '禁用' : '启用';
            pfToggle.className = `px-3 py-1.5 text-sm border rounded-lg ${pfEnabled ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'}`;
            pfToggle.dataset.username = username;
            pfToggle.dataset.passwordfree = !pfEnabled;
            pfAttempts.classList.remove('hidden');
            pfAttempts.dataset.username = username;
        } else {
            pfToggle.classList.add('hidden');
            pfAttempts.classList.add('hidden');
        }
    }

    // 用户管理区按钮事件
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // 改密码
        if (target.id === 'adminChangePasswordBtn' || target.closest('#adminChangePasswordBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return showToast('请先选择用户', true);
            showChangePasswordModal(username);
        }
        
        // 改积分
        if (target.id === 'adminUpdateScoreBtn' || target.closest('#adminUpdateScoreBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return showToast('请先选择用户', true);
            showUpdateScoreModal(username);
        }
        
        // 验证码 toggle
        if (target.id === 'adminCaptchaToggle') {
            const username = target.dataset.username;
            if (!username) return;
            const useCaptcha = target.dataset.usecaptcha === 'true';
            apiCall('/api/admin/set_captcha', 'POST', { username, useCaptcha })
                .then(data => { showToast(data.message); loadAdminUsers(); })
                .catch(err => showToast('操作失败: ' + err.message, true));
        }
        
        // 免密登录 toggle
        if (target.id === 'adminPasswordFreeToggle') {
            const username = target.dataset.username;
            if (!username) return;
            const passwordFree = target.dataset.passwordfree === 'true';
            apiCall('/api/admin/set_password_free', 'POST', { username, passwordFree })
                .then(data => { showToast(data.message); loadAdminUsers(); })
                .catch(err => showToast('操作失败: ' + err.message, true));
        }
        
        // 设置免密登录次数
        if (target.id === 'adminPasswordFreeAttempts') {
            const username = target.dataset.username;
            if (!username) return;
            showPasswordFreeAttemptsModal(username);
        }
    });

    // 显示设置免密登录次数弹窗
    function showPasswordFreeAttemptsModal(username) {
        const modalHtml = `
            <div id="passwordFreeAttemptsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">设置免密登录次数</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="pfAttemptsUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">最大免密登录次数</label>
                            <input type="number" id="pfMaxAttempts" min="0" value="0" class="w-full px-4 py-2 border rounded-lg">
                            <p class="text-xs text-gray-500 mt-1">设置为 0 表示无次数限制</p>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmPfAttemptsBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认设置</button>
                        <button id="cancelPfAttemptsBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('passwordFreeAttemptsModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('cancelPfAttemptsBtn').addEventListener('click', () => {
            document.getElementById('passwordFreeAttemptsModal').remove();
        });
        
        document.getElementById('confirmPfAttemptsBtn').addEventListener('click', async () => {
            const maxAttempts = parseInt(document.getElementById('pfMaxAttempts').value);
            if (isNaN(maxAttempts) || maxAttempts < 0) {
                showToast('次数必须为非负整数', true);
                return;
            }
            
            try {
                const data = await apiCall('/api/admin/set_password_free', 'POST', {
                    username: username,
                    passwordFree: true,
                    maxAttempts: maxAttempts
                });
                showToast(data.message);
                document.getElementById('passwordFreeAttemptsModal').remove();
                loadAdminUsers();
            } catch (error) {
                showToast('设置免密登录次数失败: ' + error.message, true);
            }
        });
    }
    
    // 显示修改积分弹窗
    function showUpdateScoreModal(username) {
        const modalHtml = `
            <div id="updateScoreModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">修改用户积分</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="updateScoreUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">新积分</label>
                            <input type="number" id="updateScoreValue" min="0" value="0" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmUpdateScoreBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认修改</button>
                        <button id="cancelUpdateScoreBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('updateScoreModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('cancelUpdateScoreBtn').addEventListener('click', () => {
            document.getElementById('updateScoreModal').remove();
        });
        
        document.getElementById('confirmUpdateScoreBtn').addEventListener('click', async () => {
            const newScore = parseInt(document.getElementById('updateScoreValue').value);
            if (isNaN(newScore) || newScore < 0) {
                showToast('积分必须为非负整数', true);
                return;
            }
            
            try {
                const data = await apiCall('/api/admin/update_score', 'POST', {
                    username: username,
                    score: newScore
                });
                showToast(data.message);
                document.getElementById('updateScoreModal').remove();
                loadAdminUsers();
            } catch (error) {
                showToast('修改积分失败: ' + error.message, true);
            }
        });
    }
    
    // 显示修改密码弹窗
    function showChangePasswordModal(username) {
        const modalHtml = `
            <div id="changePwdModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">修改用户密码</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="changePwdUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                            <input type="password" id="changePwdNew" placeholder="请输入新密码（至少6位）" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmChangePwdBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">确认修改</button>
                        <button id="cancelChangePwdBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的弹窗
        const existingModal = document.getElementById('changePwdModal');
        if (existingModal) existingModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 绑定事件
        document.getElementById('cancelChangePwdBtn').addEventListener('click', () => {
            document.getElementById('changePwdModal').remove();
        });
        
        document.getElementById('confirmChangePwdBtn').addEventListener('click', async () => {
            const newPwd = document.getElementById('changePwdNew').value;
            if (!newPwd || newPwd.length < 6) {
                showToast('新密码至少需要6个字符', true);
                return;
            }
            
            try {
                const data = await apiCall('/api/admin/change_password', 'POST', {
                    username: username,
                    new_password: newPwd
                });
                showToast('密码修改成功');
                document.getElementById('changePwdModal').remove();
                loadAdminUsers();
                loadAdminList();
            } catch (error) {
                showToast('修改密码失败: ' + error.message, true);
            }
        });
    }

    // 加载积分排行榜
    async function loadLeaderboard() {
        try {
            const data = await apiCall('/api/leaderboard');
            const tbody = document.getElementById('leaderboardTable');
            
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">暂无数据</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.map((u, index) => {
                const rank = index + 1;
                let rankDisplay = '';
                if (rank === 1) {
                    rankDisplay = '<span class="text-xl">🥇</span>';
                } else if (rank === 2) {
                    rankDisplay = '<span class="text-xl">🥈</span>';
                } else if (rank === 3) {
                    rankDisplay = '<span class="text-xl">🥉</span>';
                } else {
                    rankDisplay = `<span class="font-medium text-gray-600">${rank}</span>`;
                }
                
                const isCurrentUser = currentUser && currentUser.username === u.username;
                const rowClass = isCurrentUser ? 'bg-yellow-50 font-semibold' : '';
                
                return `<tr class="${rowClass}">
                    <td class="border px-4 py-3 text-center">${rankDisplay}</td>
                    <td class="border px-4 py-3">${u.username} ${isCurrentUser ? '<span class="text-xs text-primary">(我)</span>' : ''}</td>
                    <td class="border px-4 py-3 font-bold text-primary">${u.score}</td>
                    <td class="border px-4 py-3">${u.wins}</td>
                    <td class="border px-4 py-3">${u.games}</td>
                    <td class="border px-4 py-3 text-gray-500 text-sm">${u.joinDate || '-'}</td>
                </tr>`;
            }).join('');
        } catch (error) {
            document.getElementById('leaderboardTable').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">加载失败: ' + error.message + '</td></tr>';
        }
    }

    // 密码修改功能
    async function changePassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;
        
        if (!newPassword || !confirmNewPassword) {
            showToast('请填写所有密码字段', true);
            return;
        }
        
        if (newPassword.length < 6) {
            showToast('新密码至少需要6个字符', true);
            return;
        }
        
        if (newPassword !== confirmNewPassword) {
            showToast('新密码和确认密码不一致', true);
            return;
        }
        
        try {
            const data = await apiCall('/api/change_password', 'POST', {
                new_password: newPassword
            });
            
            showToast('密码修改成功');
            
            // 清空输入框
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
            
        } catch (error) {
            showToast('密码修改失败: ' + error.message, true);
        }
    }

    // 管理员账号管理功能
    async function createAdminAccount() {
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value;
        
        if (!username || !password) {
            showToast('用户名和密码不能为空', true);
            return;
        }
        
        if (password.length < 6) {
            showToast('密码至少6个字符', true);
            return;
        }
        
        try {
            const data = await apiCall('/api/admin/create_admin', 'POST', {
                username: username,
                password: password
            });
            
            showToast('管理员账号创建成功');
            document.getElementById('newAdminUsername').value = '';
            document.getElementById('newAdminPassword').value = '';
            loadAdminList();
        } catch (error) {
            showToast('创建管理员账号失败: ' + error.message, true);
        }
    }

    async function viewAllRecords() {
        try {
            const records = await apiCall('/api/admin/all_records');
            const content = document.getElementById('allRecordsContent');
            const userFilter = document.getElementById('recordsUserFilter');
            
            // 保存数据到全局变量供筛选使用
            allRecordsData = records;
            
            // 填充用户下拉框
            userFilter.innerHTML = '<option value="">所有用户</option>';
            for (const username of Object.keys(records)) {
                userFilter.innerHTML += `<option value="${escapeHtml(username)}">${escapeHtml(username)}</option>`;
            }
            
            renderRecords(records, userFilter.value);
            document.getElementById('allRecordsModal').classList.remove('hidden');
        } catch (error) {
            showToast('获取游戏记录失败: ' + error.message, true);
        }
    }

    function renderRecords(records, selectedUser = '') {
        const content = document.getElementById('allRecordsContent');
        
        if (!records || Object.keys(records).length === 0) {
            content.innerHTML = '<div class="text-gray-500 text-center py-4">暂无游戏记录</div>';
            return;
        }
        
        let html = '';
        let totalRecords = 0;
        
        const usersToShow = selectedUser ? { [selectedUser]: records[selectedUser] } : records;
        
        for (const [username, userRecords] of Object.entries(usersToShow)) {
            if (!userRecords || userRecords.length === 0) continue;
            
            html += `
                <div class="border-b border-gray-200 pb-4 mb-4 last:border-0">
                    <h3 class="font-semibold text-primary mb-2">${escapeHtml(username)}</h3>
                    <div class="space-y-2">
            `;
            
            userRecords.forEach((record, index) => {
                totalRecords++;
                const time = record.time || '未知时间';
                const mode = record.mode || '未知模式';
                const result = record.result || '未知结果';
                const resultClass = result === 'win' || result === '胜利' ? 'text-green-600' : 
                                   result === 'lose' || result === '失败' ? 'text-red-600' : 'text-yellow-600';
                
                html += `
                    <div class="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                        <span>#${index + 1}</span>
                        <span>${mode}</span>
                        <span class="${resultClass}">${result}</span>
                        <span class="text-gray-400">${time}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        if (totalRecords === 0) {
            html = '<div class="text-gray-500 text-center py-4">暂无游戏记录</div>';
        }
        
        content.innerHTML = html;
    }

    function closeAllRecordsModal() {
        document.getElementById('allRecordsModal').classList.add('hidden');
    }

    async function exportRecords() {
        try {
            const records = await apiCall('/api/admin/all_records');
            const dataStr = JSON.stringify(records, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `all_records_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('记录导出成功');
        } catch (error) {
            showToast('导出记录失败: ' + error.message, true);
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function loadAdminList() {
        if (!currentUser || !currentUser.isSuperAdmin) return;
        try {
            const data = await apiCall('/api/admin/list_admins');
            const adminListDiv = document.getElementById('adminList');
            const isSuperAdmin = currentUser && currentUser.isSuperAdmin;
            
            if (data.admins && data.admins.length === 0) {
                adminListDiv.innerHTML = '<div class="text-gray-500 text-sm">暂无管理员账号</div>';
                return;
            }
            
            adminListDiv.innerHTML = '';
            data.admins.forEach(admin => {
                const adminDiv = document.createElement('div');
                adminDiv.className = 'flex justify-between items-center p-2 bg-white rounded border';
                
                // 密码显示（已隐藏，出于安全考虑）
                let passwordDisplay = '';
                
                // 权限状态显示
                let permissionStatus = '';
                let actionButtons = '';
                
                if (admin.isSuperAdmin) {
                    permissionStatus = `<span class="text-xs ml-2 px-2 py-1 rounded bg-red-100 text-red-800">超级管理员</span>`;
                } else {
                    const canManage = admin.canManage !== false; // 默认true
                    permissionStatus = `<span class="text-xs ml-2 px-2 py-1 rounded ${canManage ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${canManage ? '可管理' : '已禁用'}
                    </span>`;
                    
                    // 只有超级管理员可以设置权限
                    if (isSuperAdmin) {
                        actionButtons = `<button onclick="toggleAdminPermission('${admin.username}', ${!canManage})" class="text-xs ml-2 px-2 py-1 rounded ${canManage ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'}">
                            ${canManage ? '禁用' : '启用'}
                        </button>`;
                    }
                }
                
                adminDiv.innerHTML = `
                    <div class="flex-1">
                        <div class="flex items-center flex-wrap">
                            <span class="font-medium">${admin.username}</span>
                            ${permissionStatus}
                            ${passwordDisplay}
                            ${actionButtons}
                        </div>
                        ${admin.created_by ? `<div class="text-xs text-gray-500 mt-1">由 ${admin.created_by} 创建</div>` : ''}
                    </div>
                    <div class="text-xs text-gray-500">
                        积分: ${admin.score} | 胜场: ${admin.wins} | 对局: ${admin.games}
                    </div>
                `;
                adminListDiv.appendChild(adminDiv);
        });
        } catch (error) {
            console.error('加载管理员列表失败:', error);
            document.getElementById('adminList').innerHTML = '<div class="text-red-500 text-sm">加载失败</div>';
        }
    }

    // 切换管理员权限
    async function toggleAdminPermission(username, canManage) {
        try {
            const data = await apiCall('/api/admin/set_permission', 'POST', {
                username: username,
                canManage: canManage
            });
            showToast(data.message);
            loadAdminList();
        } catch (error) {
            showToast('设置权限失败: ' + error.message, true);
        }
    }

    function showGameUI(){
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('registerModal').classList.add('hidden');
        document.getElementById('gameContainer').classList.remove('hidden');
        calcCanvasSize();
        loadUserData(); loadSavedGames(); resetGame();
        initBoardBackground();
        loadBoardColorSettings();
    }
    
    async function loadBoardColorSettings() {
        try {
            const settings = await apiCall('/api/user/settings', 'GET', null, true);
            if (settings.boardLineColor) {
                boardLineColor = settings.boardLineColor;
                document.getElementById('boardLineColor').value = boardLineColor;
                document.getElementById('boardLineColorText').value = boardLineColor;
            }
            if (settings.boardDotColor) {
                boardDotColor = settings.boardDotColor;
                document.getElementById('boardDotColor').value = boardDotColor;
                document.getElementById('boardDotColorText').value = boardDotColor;
            }
            if (settings.boardBackground !== undefined) {
                selectedBackground = settings.boardBackground;
                applyBackground(selectedBackground);
            }
            drawBoard();
            // 加载背景图片列表
            await loadBackgrounds();
            boardColorSettingsLoaded = true;
        } catch (err) {
            // 加载失败，使用默认颜色
        }
    }
    
    async function saveBoardColorSettings() {
        try {
            // 从UI获取当前值并应用到变量
            boardLineColor = document.getElementById('boardLineColor').value;
            boardDotColor = document.getElementById('boardDotColor').value;
            
            await apiCall('/api/user/settings', 'POST', {
                boardLineColor: boardLineColor,
                boardDotColor: boardDotColor,
                boardBackground: selectedBackground
            });
            drawBoard();
            drawOnlineBoard();
            boardColorSettingsLoaded = false;  // 重置加载标志，下次打开面板时重新加载
            showToast('设置已保存');
        } catch (err) {
            showToast('保存失败：' + err.message, true);
        }
    }

    function updateDifficultyButtons(){
        ['easy','medium','hard'].forEach(d=>{ const btn=document.getElementById(`ai${d.charAt(0).toUpperCase()+d.slice(1)}`); btn.classList.toggle('bg-primary', aiDifficulty===d); btn.classList.toggle('text-white', aiDifficulty===d); });
    }

    function updateModeButtons(){
        const isAI = gameMode === 'ai';
        const isOnline = gameMode === 'online';
        const isPVP = gameMode === 'pvp';
        
        document.getElementById('modeAI').classList.toggle('bg-primary', isAI);
        document.getElementById('modeAI').classList.toggle('text-white', isAI);
        document.getElementById('modeAI').classList.toggle('border-gray-300', !isAI);
        document.getElementById('modeAI').classList.toggle('text-gray-700', !isAI);
        
        document.getElementById('modePVP').classList.toggle('bg-primary', isPVP);
        document.getElementById('modePVP').classList.toggle('text-white', isPVP);
        document.getElementById('modePVP').classList.toggle('border-gray-300', !isPVP);
        document.getElementById('modePVP').classList.toggle('text-gray-700', !isPVP);
        
        document.getElementById('modeOnline').classList.toggle('bg-primary', isOnline);
        document.getElementById('modeOnline').classList.toggle('text-white', isOnline);
        document.getElementById('modeOnline').classList.toggle('border-gray-300', !isOnline);
        document.getElementById('modeOnline').classList.toggle('text-gray-700', !isOnline);
        
        // 设置面板显示/隐藏
        document.getElementById('aiSettings').classList.toggle('hidden', !isAI);
        document.getElementById('pvpSettings').classList.toggle('hidden', !isPVP);
        document.getElementById('onlineSettingsHint').classList.toggle('hidden', !isOnline);
        
        // 停止双人对战计时器（切换模式时）
        if (!isPVP) stopPvpTurnTimer();
    }

    function updateColorButtons(){
        const black=document.getElementById('playerColorBlack'), white=document.getElementById('playerColorWhite');
        black.classList.toggle('bg-primary', playerColor===1); black.classList.toggle('text-white', playerColor===1);
        white.classList.toggle('bg-primary', playerColor===2); white.classList.toggle('text-white', playerColor===2);
    }

    function showTab(tabId){
        ['gameContent','onlineContent','profileContent','historyContent','statsContent','leaderboardContent','adminContent'].forEach(id=>document.getElementById(id).classList.add('hidden'));
        document.getElementById(tabId).classList.remove('hidden');
        ['gameTab','onlineTab','profileTab','historyTab','statsTab','leaderboardTab','adminTab'].forEach(id=>document.getElementById(id).classList.remove('tab-active'));
        document.getElementById(tabId.replace('Content','Tab')).classList.add('tab-active');
        if(tabId==='adminContent') {
            loadAdminUsers();
            if (currentUser && currentUser.isSuperAdmin) {
                loadAdminList();
            }
        }
        if(tabId==='leaderboardContent') {
            loadLeaderboard();
        }
        if(tabId==='historyContent') {
            historyCurrentPage = 1;
            loadHistory();
        }
        if(tabId==='statsContent') {
            loadStats();
        }
        if(tabId==='onlineContent'){
            onlineCanvas = document.getElementById('onlineCanvas');
            onlineCtx = onlineCanvas?.getContext('2d');
            if(onlineCanvas) {
                onlineCanvas.onclick = null;
                onlineCanvas.addEventListener('click', handleOnlineClick);
            }
            // 先计算画布尺寸，确保渲染有正确的尺寸
            calcOnlineCanvasSize();
            // 初始化棋盘（如果尚未初始化）
            if(!onlineBoard || !onlineBoard[0]) {
                initOnlineBoard();
            }
            // 先绘制棋盘
            drawOnlineBoard();
            // 然后加载房间列表和检查现有游戏
            loadOnlineAvailableMatches();
            checkExistingMatch();
            // 始终自动刷新可用房间列表
            startMatchListRefresh();
        } else {
            stopMatchListRefresh();
        }
    }
    
    function handleOnlineClick(e) {
        
        // 检查游戏状态
        if(!onlineGameActive || !onlineMatchId) { 
            return; 
        }
        
        // 检查颜色是否已设置
        if(onlineMyColor === null || onlineMyColor === undefined) {
            return;
        }
        
        const currentPlayer = Number(onlineCurrentPlayer);
        const myColor = Number(onlineMyColor);
        
        if(currentPlayer !== myColor) {
            return;
        }
        
        const rect = onlineCanvas.getBoundingClientRect();
        const scaleX = onlineCanvas.width / rect.width;
        const scaleY = onlineCanvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const pieceSize = onlineCellSizeGlobal * PIECE_SIZE_RATIO;
        const margin = pieceSize / 2 + 4; // 棋子半径 + 额外边距
        const col = Math.round((x - margin) / onlineCellSizeGlobal);
        const row = Math.round((y - margin) / onlineCellSizeGlobal);
        
        if(row>=0&&row<BOARD_SIZE&&col>=0&&col<BOARD_SIZE&&onlineBoard[row][col]===0){
            makeOnlineMove(row,col);
        }
    }

    // 初始化
    async function init(){
        canvas = document.getElementById('gameCanvas'); ctx = canvas.getContext('2d');
        onlineCanvas = document.getElementById('onlineCanvas'); onlineCtx = onlineCanvas.getContext('2d');
        
        // 立即预加载 Cloudflare Turnstile SDK（页面加载时就加载）
        loadTurnstileSDK();
        
        // 并行执行：获取 sitekey 和初始化极验验证码
        await Promise.all([
            getTurnstileSiteKey(),
            new Promise(resolve => {
                initGeetestWidget('geetestLoginWidget', function() {
                    resolve();
                });
            })
        ]);
        
        console.log('初始化完成，Turnstile SDK状态:', typeof window.turnstile !== 'undefined' ? '已加载' : '未加载');
        console.log('Turnstile Site Key:', turnstileSiteKey || '未获取');

        document.getElementById('showRegister').addEventListener('click', e=>{ 
            e.preventDefault(); 
            document.getElementById('loginModal').classList.add('hidden'); 
            document.getElementById('registerModal').classList.remove('hidden');
            // 延迟初始化注册验证码，确保容器可见
            setTimeout(() => {
                const regContainer = document.getElementById('geetestRegisterWidget');
                if (regContainer && !regContainer.hasAttribute('data-initialized')) {
                    regContainer.setAttribute('data-initialized', 'true');
                    initGeetestWidget('geetestRegisterWidget', function() {
                        // 注册验证码初始化完成
                    });
                }
                // 初始化注册 Turnstile
                initTurnstileWidget('turnstileRegisterWidget');
            }, 300);
        });
        document.getElementById('showLogin').addEventListener('click', e=>{ e.preventDefault(); document.getElementById('registerModal').classList.add('hidden'); document.getElementById('loginModal').classList.remove('hidden'); });

        // 免密登录
        document.getElementById('showPasswordFreeLogin').addEventListener('click', e=>{ 
            e.preventDefault(); 
            document.getElementById('loginModal').classList.add('hidden'); 
            document.getElementById('passwordFreeLoginPage').classList.remove('hidden'); 
        });
        document.getElementById('showLoginFromFree').addEventListener('click', e=>{ 
            e.preventDefault(); 
            document.getElementById('passwordFreeLoginPage').classList.add('hidden'); 
            document.getElementById('loginModal').classList.remove('hidden'); 
        });
        document.getElementById('showRegisterFromFree').addEventListener('click', e=>{ 
            e.preventDefault(); 
            document.getElementById('passwordFreeLoginPage').classList.add('hidden'); 
            document.getElementById('registerModal').classList.remove('hidden'); 
        });
        document.getElementById('passwordFreeLoginForm').addEventListener('submit', async e=>{ 
            e.preventDefault(); 
            const u=document.getElementById('passwordFreeUsername').value;
            try{ await loginPasswordFree(u); }catch(err){ showToast(err.message,true); }
        });
        
        // 输入用户名时检查免密登录剩余次数
        document.getElementById('passwordFreeUsername').addEventListener('input', function() {
            checkPasswordFreeAttempts(this.value);
        });

        // 登录表单交互跟踪
        document.getElementById('loginForm').addEventListener('submit', async e=>{ e.preventDefault(); 
            const u=document.getElementById('username').value, p=document.getElementById('password').value;
            if(!loginGeetestToken){ showToast('请完成验证码验证',true); return; }
            sessionStorage.removeItem('loginFormInteracted');
            try{ await login(u,p, loginGeetestToken); }catch(err){ showToast(err.message,true); refreshGeetestCaptcha(true); }
        });
        
        // 跟踪登录表单输入
        document.getElementById('username').addEventListener('input', () => { 
            loginFormInteracted = true; 
            sessionStorage.setItem('loginFormInteracted', 'true');
        });
        document.getElementById('password').addEventListener('input', () => { 
            loginFormInteracted = true; 
            sessionStorage.setItem('loginFormInteracted', 'true');
        });

        // 注册表单交互跟踪
        document.getElementById('registerForm').addEventListener('submit', async e=>{ e.preventDefault();
            const u=document.getElementById('regUsername').value, p=document.getElementById('regPassword').value, cp=document.getElementById('confirmPassword').value;
            if(p!==cp){ showToast('密码不一致',true); return; } 
            if(p.length<6){ showToast('密码至少6位',true); return; } 
            if(!registerGeetestToken){ showToast('请完成验证码验证',true); return; }
            sessionStorage.removeItem('registerFormInteracted');
            try{ await register(u,p, registerGeetestToken); }catch(err){ showToast(err.message,true); refreshGeetestCaptcha(false); }
        });
        
        // 跟踪注册表单输入
        document.getElementById('regUsername').addEventListener('input', () => { 
            registerFormInteracted = true; 
            sessionStorage.setItem('registerFormInteracted', 'true');
        });
        document.getElementById('regPassword').addEventListener('input', () => { 
            registerFormInteracted = true; 
            sessionStorage.setItem('registerFormInteracted', 'true');
        });
        document.getElementById('confirmPassword').addEventListener('input', () => { 
            registerFormInteracted = true; 
            sessionStorage.setItem('registerFormInteracted', 'true');
        });

        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.getElementById('gameTab').addEventListener('click', ()=>showTab('gameContent'));
        document.getElementById('onlineTab').addEventListener('click', ()=>showTab('onlineContent'));
        document.getElementById('profileTab').addEventListener('click', ()=>showTab('profileContent'));
        document.getElementById('historyTab').addEventListener('click', ()=>showTab('historyContent'));
        document.getElementById('statsTab').addEventListener('click', ()=>showTab('statsContent'));
        document.getElementById('leaderboardTab').addEventListener('click', ()=>showTab('leaderboardContent'));
        document.getElementById('adminTab').addEventListener('click', ()=>showTab('adminContent'));
        
        // 联机对战事件监听器
        document.getElementById('onlineCreateBtn').addEventListener('click', onlineCreateMatch);
        document.getElementById('onlineJoinBtn').addEventListener('click', onlineJoinMatch);
        document.getElementById('onlineLeaveBtn').addEventListener('click', onlineLeaveMatch);
        document.getElementById('onlineLeaveBtn').classList.add('hidden');
        
        attachCloseRoomHandler();
        
        // 监控画布点击事件（超级管理员强制落子）
        document.getElementById('monitorCanvas')?.addEventListener('click', e=>{
            if(!monitorMatchId) return;
            const canvas = document.getElementById('monitorCanvas');
            const rect = canvas.getBoundingClientRect();
            
            const displayWidth = rect.width;
            const displayHeight = rect.height;
            
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const cellSize = displayWidth / (BOARD_SIZE - 1);
            const col = Math.round(x / cellSize);
            const row = Math.round(y / cellSize);
            
            if(row>=0&&row<BOARD_SIZE&&col>=0&&col<BOARD_SIZE){
                const player = parseInt(document.getElementById('monitorPlayerSelect').value);
                forceMove(row, col, player);
            }
        });
        
        // 密码修改功能
        document.getElementById('changePasswordBtn').addEventListener('click', changePassword);
        
        // 管理员账号管理相关事件
        document.getElementById('createAdminBtn').addEventListener('click', createAdminAccount);
        document.getElementById('refreshAdminsBtn').addEventListener('click', loadAdminList);
        document.getElementById('viewAllRecordsBtn').addEventListener('click', viewAllRecords);
        document.getElementById('closeAllRecordsBtn').addEventListener('click', closeAllRecordsModal);
        document.getElementById('exportRecordsBtn').addEventListener('click', exportRecords);
        document.getElementById('recordsUserFilter').addEventListener('change', function() {
            if (allRecordsData) {
                renderRecords(allRecordsData, this.value);
            }
        });
        
        // 棋盘颜色设置事件（只更新UI显示，不立即应用）
        document.getElementById('boardLineColor').addEventListener('input', function() {
            document.getElementById('boardLineColorText').value = this.value;
        });
        document.getElementById('boardLineColorText').addEventListener('input', function() {
            const color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('boardLineColor').value = color;
            }
        });
        document.getElementById('boardDotColor').addEventListener('input', function() {
            document.getElementById('boardDotColorText').value = this.value;
        });
        document.getElementById('boardDotColorText').addEventListener('input', function() {
            const color = this.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('boardDotColor').value = color;
            }
        });
        document.getElementById('saveBoardColorBtn').addEventListener('click', saveBoardColorSettings);
        document.getElementById('resetBoardColorBtn').addEventListener('click', function() {
            boardLineColor = '#8B5A2B';
            boardDotColor = '#8B5A2B';
            selectedBackground = '';
            document.getElementById('boardLineColor').value = boardLineColor;
            document.getElementById('boardLineColorText').value = boardLineColor;
            document.getElementById('boardDotColor').value = boardDotColor;
            document.getElementById('boardDotColorText').value = boardDotColor;
            drawBoard();
            drawOnlineBoard();
            applyBackground('');
            renderBackgroundGrid();
            saveBoardColorSettings();
        });
        document.getElementById('loadBackgroundsBtn').addEventListener('click', loadBackgrounds);
        
        // 积分排行榜刷新
        document.getElementById('refreshLeaderboardBtn').addEventListener('click', loadLeaderboard);
        
        // 游戏记录事件
        document.getElementById('historyModeFilter')?.addEventListener('change', () => { historyCurrentPage = 1; renderHistory(); });
        document.getElementById('historyResultFilter')?.addEventListener('change', () => { historyCurrentPage = 1; renderHistory(); });
        document.getElementById('refreshHistoryBtn')?.addEventListener('click', () => { historyCurrentPage = 1; loadHistory(); });
        document.getElementById('historyPrevPage')?.addEventListener('click', () => { if (historyCurrentPage > 1) { historyCurrentPage--; renderHistory(); } });
        document.getElementById('historyNextPage')?.addEventListener('click', () => { historyCurrentPage++; renderHistory(); });
        
        // 联机对局监控事件
        document.getElementById('refreshMatchListBtn')?.addEventListener('click', loadMatchList);
        document.getElementById('forceCloseMatchBtn')?.addEventListener('click', forceCloseMatch);
        document.getElementById('forceRestartMatchBtn')?.addEventListener('click', forceRestartMatch);
        document.getElementById('forceCloseAllRoomsBtn')?.addEventListener('click', forceCloseAllRooms);

        document.getElementById('modeAI').addEventListener('click', ()=>{ gameMode='ai'; updateModeButtons(); resetGame(); });
        document.getElementById('modePVP').addEventListener('click', ()=>{ gameMode='pvp'; updateModeButtons(); resetGame(); });
        document.getElementById('modeOnline').addEventListener('click', ()=>{ 
            if(!currentUser){
                alert('请先登录');
                showTab('loginContent');
                return;
            }
            showTab('onlineContent');
        });
        document.getElementById('playerColorBlack').addEventListener('click', ()=>{
            if(playerColor===1) return;
            playerColor=1; updateColorButtons();
            if(gameMode==='ai' && gameActive && moveHistory.length>0){ resetGame(); showToast('已切换为黑棋，游戏重新开始'); }
            else showToast('您将执黑先行');
        });
        document.getElementById('playerColorWhite').addEventListener('click', ()=>{
            if(playerColor===2) return;
            playerColor=2; updateColorButtons();
            if(gameMode==='ai' && gameActive && moveHistory.length>0){ resetGame(); showToast('已切换为白棋，游戏重新开始'); }
            else showToast('您将执白后行');
        });
        document.getElementById('aiEasy').addEventListener('click', ()=>{
            if(aiDifficulty==='easy') return;
            aiDifficulty='easy'; updateDifficultyButtons();
            if(gameMode==='ai' && gameActive && moveHistory.length>0){ resetGame(); showToast('AI难度已设为简单，游戏重新开始'); }
            else showToast('AI难度已设置为简单');
        });
        document.getElementById('aiMedium').addEventListener('click', ()=>{
            if(aiDifficulty==='medium') return;
            aiDifficulty='medium'; updateDifficultyButtons();
            if(gameMode==='ai' && gameActive && moveHistory.length>0){ resetGame(); showToast('AI难度已设为中等，游戏重新开始'); }
            else showToast('AI难度已设置为中等');
        });
        document.getElementById('aiHard').addEventListener('click', ()=>{
            if(aiDifficulty==='hard') return;
            aiDifficulty='hard'; updateDifficultyButtons();
            if(gameMode==='ai' && gameActive && moveHistory.length>0){ resetGame(); showToast('AI难度已设为困难，游戏重新开始'); }
            else showToast('AI难度已设置为困难');
        });
        
        // 双人对战设置事件
        document.getElementById('pvpForbidden').addEventListener('change', (e)=>{
            pvpForbidden = e.target.checked;
            showToast(pvpForbidden ? '已启用禁手规则' : '已禁用禁手规则');
            if(gameMode==='pvp' && gameActive && moveHistory.length>0) {
                resetGame();
                showToast('设置已更改，游戏重新开始');
            }
        });
        
        // 时间限制按钮
        const timeButtons = ['timeNone', 'time5min', 'time10min', 'time30min'];
        const timeLimits = [0, 300, 600, 1800];
        const timeLabels = ['无限制', '5分钟', '10分钟', '30分钟'];
        
        timeButtons.forEach((id, index) => {
            document.getElementById(id).addEventListener('click', ()=>{
                pvpTimeLimit = timeLimits[index];
                // 更新按钮样式
                timeButtons.forEach(btnId => {
                    const btn = document.getElementById(btnId);
                    btn.classList.remove('bg-primary', 'text-white');
                });
                document.getElementById(id).classList.add('bg-primary', 'text-white');
                // 显示时间限制提示
                const display = document.getElementById('pvpTimerDisplay');
                const text = document.getElementById('pvpTimeLimitText');
                if (pvpTimeLimit > 0) {
                    display.classList.remove('hidden');
                    text.textContent = timeLabels[index];
                } else {
                    display.classList.add('hidden');
                }
                showToast(`时间限制: ${timeLabels[index]}`);
                if(gameMode==='pvp' && gameActive) {
                    stopPvpTurnTimer();
                    resetGame();
                }
            });
        });
        
        document.getElementById('restartBtn').addEventListener('click', resetGame);
        document.getElementById('undoBtn').addEventListener('click', undoMove);
        document.getElementById('saveGameBtn').addEventListener('click', saveGame);
        document.getElementById('newGameBtn').addEventListener('click', resetGame);

        canvas.addEventListener('click', e=>{
            if(!gameActive) return;
            if(gameMode==='ai' && currentPlayer!==playerColor) return;
            if(gameMode==='online' && currentPlayer!==onlineMyColor) return;
            const rect=canvas.getBoundingClientRect();
            const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
            const x=(e.clientX-rect.left)*scaleX, y=(e.clientY-rect.top)*scaleY;
            const margin = PIECE_SIZE / 2 + 4; // 棋子半径 + 额外边距
            const col=Math.round((x-margin)/CELL_SIZE), row=Math.round((y-margin)/CELL_SIZE);
            if(row>=0&&row<BOARD_SIZE&&col>=0&&col<BOARD_SIZE&&gameBoard[row][col]===0){
                placePiece(row,col,currentPlayer);
                if(gameMode==='online') makeOnlineMove(row,col);
            }
        });

        // 管理操作（操作后立即刷新列表）
        document.getElementById('adminBanBtn').addEventListener('click', async ()=>{
            const u=document.getElementById('adminBanUsername').value, m=parseInt(document.getElementById('adminBanMinutes').value);
            if(!u||m<1) return showToast('请输入用户名和分钟',true);
            const btn = document.getElementById('adminBanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await apiCall('/api/admin/ban','POST',{username:u, minutes:m}); 
                showToast(`已封禁 ${u} ${m} 分钟`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-ban mr-1"></i>封禁';
            }
        });
        document.getElementById('adminUnbanBtn').addEventListener('click', async ()=>{
            const u=document.getElementById('adminBanUsername').value; if(!u) return;
            const btn = document.getElementById('adminUnbanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await apiCall('/api/admin/unban','POST',{username:u}); 
                showToast(`已解封 ${u}`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-unlock mr-1"></i>解封';
            }
        });
        document.getElementById('adminKickBtn').addEventListener('click', async ()=>{
            const u=document.getElementById('adminBanUsername').value; if(!u) return;
            const btn = document.getElementById('adminKickBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await apiCall('/api/admin/kick','POST',{username:u}); 
                showToast(`已强制登出 ${u}`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>强制登出';
            }
        });
        document.getElementById('adminDeleteBtn').addEventListener('click', async ()=>{
            const u=document.getElementById('adminBanUsername').value; if(!u || u==='admin') return showToast('不能删除admin',true);
            if(!confirm(`确定注销用户 ${u} ？`)) return;
            const btn = document.getElementById('adminDeleteBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                await apiCall(`/api/admin/user/${u}`,'DELETE'); 
                showToast(`已注销 ${u}`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>注销';
            }
        });
        
        // 批量操作功能
        // 全选复选框
        document.getElementById('selectAllUsers').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.user-checkbox:not(:disabled)');
            checkboxes.forEach(cb => cb.checked = this.checked);
            updateSelectedCount();
        });
        
        // 更新已选择数量
        function updateSelectedCount() {
            const checked = document.querySelectorAll('.user-checkbox:checked');
            document.getElementById('selectedCount').textContent = `已选择: ${checked.length}`;
        }
        
        // 获取选中的用户列表
        function getSelectedUsers() {
            const checkboxes = document.querySelectorAll('.user-checkbox:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }
        
        // 绑定复选框事件
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('user-checkbox')) {
                updateSelectedCount();
            }
        });
        
        // 批量封禁
        document.getElementById('batchBanBtn').addEventListener('click', async () => {
            const users = getSelectedUsers();
            if (users.length === 0) return showToast('请先选择用户', true);
            const minutes = prompt('请输入封禁时长（分钟）:', '10');
            if (!minutes || parseInt(minutes) <= 0) return;
            const btn = document.getElementById('batchBanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                const result = await apiCall('/api/admin/batch_ban', 'POST', { usernames: users, minutes: parseInt(minutes) });
                showToast(`批量封禁完成：成功 ${result.success_count} 个，失败 ${result.failed_count} 个`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-users mr-1"></i>批量封禁';
            }
        });
        
        // 批量解封
        document.getElementById('batchUnbanBtn').addEventListener('click', async () => {
            const users = getSelectedUsers();
            if (users.length === 0) return showToast('请先选择用户', true);
            const btn = document.getElementById('batchUnbanBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                const result = await apiCall('/api/admin/batch_unban', 'POST', { usernames: users });
                showToast(`批量解封完成：成功 ${result.success_count} 个，失败 ${result.failed_count} 个`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-unlock-alt mr-1"></i>批量解封';
            }
        });
        
        // 批量强制登出
        document.getElementById('batchKickBtn').addEventListener('click', async () => {
            const users = getSelectedUsers();
            if (users.length === 0) return showToast('请先选择用户', true);
            if (!confirm(`确定强制登出选中的 ${users.length} 个用户？`)) return;
            const btn = document.getElementById('batchKickBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                const result = await apiCall('/api/admin/batch_kick', 'POST', { usernames: users });
                showToast(`批量强制登出完成：成功 ${result.success_count} 个，失败 ${result.failed_count} 个`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-sign-out-alt mr-1"></i>批量登出';
            }
        });
        
        // 批量注销
        document.getElementById('batchDeleteBtn').addEventListener('click', async () => {
            const users = getSelectedUsers();
            if (users.length === 0) return showToast('请先选择用户', true);
            if (!confirm(`确定注销选中的 ${users.length} 个用户？此操作不可恢复！`)) return;
            const btn = document.getElementById('batchDeleteBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
            try {
                const result = await apiCall('/api/admin/batch_delete', 'POST', { usernames: users });
                showToast(`批量注销完成：成功 ${result.success_count} 个，失败 ${result.failed_count} 个`);
                await loadAdminUsers();
            } catch(e) {
                showToast('操作失败: ' + e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash mr-1"></i>批量注销';
            }
        });

        window.addEventListener('resize', ()=>{ drawBoard(); drawOnlineBoard(); });
        initCanvasObserver();
        
        // 自动登录：正常刷新页面时保持登录状态
        // 服务端重启后 token 会被清除，自动登录失败则跳转到登录页
        if(token){
            try{ 
                currentUser = await apiCall('/api/user', 'GET', null, true);
                isLoggedIn = true;
                
                // 检查是否未完成第二层人机认证（Turnstile验证）
                if (currentUser.turnstileVerified === false) {
                    document.getElementById('loginModal').classList.add('hidden');
                    const modal = document.getElementById('postLoginTurnstileModal');
                    modal.classList.remove('hidden');
                    postLoginTurnstileToken = '';
                    requestAnimationFrame(() => {
                        initPostLoginTurnstile();
                    });
                } else {
                    showGameUI(); 
                    startStatusCheck();
                    await recoverOnlineMatch();
                }
            }catch(e){ 
                token=''; localStorage.removeItem('token'); 
            }
        }

        // 页面关闭时停止检查
        window.addEventListener('beforeunload', function(event) {
            stopStatusCheck();
            stopBannedCountdown();
        });
        
        // 检测未完成验证并显示提示（已移除，不再显示黄条提示）
    }

    init();
})();

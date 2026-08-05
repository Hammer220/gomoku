// ============================================================
// 棋盘背景与颜色设置模块
// 负责：棋盘背景图片管理、颜色设置、棋盘初始化等功能
// ============================================================
(function() {
    var G = window.Gomoku;

    // 跳转到游戏大厅页面（如果已在游戏大厅则不需要跳转）
    G.showGameUI = function(){
        var path = window.location.pathname;
        if (path === '/game' || path === '/online' || path.startsWith('/game/') || path.startsWith('/online/')) return;
        window.location.href = '/game';
    }

    // 初始化棋盘背景（清除背景并重新渲染网格）
    G.initBoardBackground = function() {
        G.applyBackground('');
        G.renderBackgroundGrid();
    };

    // 加载棋盘颜色设置（从服务器读取用户保存的设置）
    G.loadBoardColorSettings = async function() {
        try {
            const response = await G.apiCall('/api/settings', 'GET', null, true);
            const settings = response.settings || {};
            if (settings.boardLineColor) {
                G.boardLineColor = settings.boardLineColor;
                var boardLineColorEl = document.getElementById('boardLineColor');
                var boardLineColorTextEl = document.getElementById('boardLineColorText');
                if (boardLineColorEl) boardLineColorEl.value = G.boardLineColor;
                if (boardLineColorTextEl) boardLineColorTextEl.value = G.boardLineColor;
            }
            if (settings.boardDotColor) {
                G.boardDotColor = settings.boardDotColor;
                var boardDotColorEl = document.getElementById('boardDotColor');
                var boardDotColorTextEl = document.getElementById('boardDotColorText');
                if (boardDotColorEl) boardDotColorEl.value = G.boardDotColor;
                if (boardDotColorTextEl) boardDotColorTextEl.value = G.boardDotColor;
            }
            if (settings.boardBackground !== undefined) {
                G.selectedBackground = settings.boardBackground;
                G.applyBackground(G.selectedBackground);
            }
            G.drawBoard();
            // 加载背景图片列表
            G.loadBackgrounds();
            G.boardColorSettingsLoaded = true;
        } catch (err) {
            // 加载失败，使用默认颜色
        }
    }

    // 保存棋盘颜色设置到服务器
    G.saveBoardColorSettings = async function() {
        try {
            // 从UI获取当前值并应用到变量
            G.boardLineColor = document.getElementById('boardLineColor').value;
            G.boardDotColor = document.getElementById('boardDotColor').value;

            await G.apiCall('/api/settings', 'POST', {
                boardLineColor: G.boardLineColor,
                boardDotColor: G.boardDotColor,
                boardBackground: G.selectedBackground
            });
            G.drawBoard();
            G.drawOnlineBoard();
            G.boardColorSettingsLoaded = false;  // 重置加载标志，下次打开面板时重新加载
            G.showToast('设置已保存');
        } catch (err) {
            G.showToast('保存失败：' + err.message, true);
        }
    }

    // ==================== 棋盘背景图片功能 ====================

    // 加载可用背景图片列表
    G.loadBackgrounds = async function() {
        try {
            var data = await G.apiCall('/api/backgrounds', 'GET', null, true);
            G.availableBackgrounds = data.backgrounds || [];
        } catch (err) {
            // 使用本地存储的背景图片
            var localBg = localStorage.getItem('gomoku_backgrounds');
            if (localBg) {
                try {
                    G.availableBackgrounds = JSON.parse(localBg);
                } catch (e) {
                    G.availableBackgrounds = [];
                }
            }
        }
        G.renderBackgroundGrid();
    };

    // 应用选中的棋盘背景到 Canvas
    G.applyBackground = function(bg) {
        G.selectedBackground = bg || '';
        var canvas = document.getElementById('gameCanvas');
        var onlineCanvas = document.getElementById('onlineCanvas');
        var bgPath = G.selectedBackground;
        if (bgPath && !bgPath.startsWith('data:') && !bgPath.startsWith('/')) {
            bgPath = '/' + bgPath;
        }
        if (canvas) {
            if (bgPath && bgPath !== 'none') {
                canvas.style.backgroundImage = 'url(' + bgPath + ')';
                canvas.style.backgroundSize = '100% 100%';
                canvas.style.backgroundRepeat = 'no-repeat';
                canvas.style.backgroundPosition = 'center';
            } else {
                canvas.style.backgroundImage = '';
                canvas.style.backgroundSize = '';
                canvas.style.backgroundRepeat = '';
                canvas.style.backgroundPosition = '';
            }
        }
        if (onlineCanvas) {
            if (bgPath && bgPath !== 'none') {
                onlineCanvas.style.backgroundImage = 'url(' + bgPath + ')';
                onlineCanvas.style.backgroundSize = '100% 100%';
                onlineCanvas.style.backgroundRepeat = 'no-repeat';
                onlineCanvas.style.backgroundPosition = 'center';
            } else {
                onlineCanvas.style.backgroundImage = '';
                onlineCanvas.style.backgroundSize = '';
                onlineCanvas.style.backgroundRepeat = '';
                onlineCanvas.style.backgroundPosition = '';
            }
        }
    };

    // 渲染背景图片缩略图网格
    G.renderBackgroundGrid = function() {
        var grid = document.getElementById('backgroundImageGrid');
        if (!grid) return;
        grid.innerHTML = '';
        var normalizedSelected = G.selectedBackground;
        if (normalizedSelected && normalizedSelected.startsWith('/')) {
            normalizedSelected = normalizedSelected.substring(1);
        }
        // 无背景选项
        var noneDiv = document.createElement('div');
        noneDiv.className = 'border-2 rounded cursor-pointer hover:border-primary p-2 text-center text-xs flex items-center justify-center h-24 ' +
            (G.selectedBackground === '' || G.selectedBackground === 'none' ? 'border-primary bg-primary/10' : 'border-gray-300');
        noneDiv.textContent = '无背景';
        noneDiv.addEventListener('click', function() {
            G.applyBackground('');
            G.drawBoard();
            G.drawOnlineBoard();
            G.renderBackgroundGrid();
        });
        grid.appendChild(noneDiv);
        // 背景图片缩略图
        if (G.availableBackgrounds && G.availableBackgrounds.length > 0) {
            G.availableBackgrounds.forEach(function(bg) {
                var normalizedBg = bg.startsWith('/') ? bg.substring(1) : bg;
                var div = document.createElement('div');
                div.className = 'border-2 rounded cursor-pointer hover:border-primary overflow-hidden h-24 ' +
                    (normalizedSelected === normalizedBg ? 'border-primary' : 'border-gray-300');
                var img = document.createElement('img');
                img.src = bg.startsWith('/') ? bg : '/' + bg;
                img.className = 'w-full h-full object-cover';
                img.alt = '背景';
                img.onerror = function() {
                    div.innerHTML = '<span class="text-xs text-gray-400">加载失败</span>';
                };
                div.appendChild(img);
                div.addEventListener('click', function() {
                    G.applyBackground(bg);
                    G.drawBoard();
                    G.drawOnlineBoard();
                    G.renderBackgroundGrid();
                });
                grid.appendChild(div);
            });
        }
        if (G.availableBackgrounds.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-gray-500 text-sm text-center py-4 col-span-4';
            emptyDiv.textContent = '暂无背景图片';
            grid.appendChild(emptyDiv);
        }
        // 仅管理员显示上传控件
        var uploadInput = document.getElementById('uploadBackgroundInput');
        var saveToServer = document.getElementById('saveUploadToServer');
        if (uploadInput && uploadInput.parentElement) {
            uploadInput.parentElement.style.display = (G.currentUser && G.currentUser.isAdmin) ? '' : 'none';
        }
        if (saveToServer && saveToServer.parentElement) {
            saveToServer.parentElement.style.display = (G.currentUser && G.currentUser.isAdmin) ? '' : 'none';
        }
    };

    // 处理背景图片上传（读取本地文件并显示为 Canvas 背景）
    window.handleBackgroundUpload = function(input) {
        var file = input.files[0];
        if (!file) return;
        // 仅管理员可上传到服务器
        var isAdmin = G.currentUser && G.currentUser.isAdmin;
        var uploadProgress = document.getElementById('uploadProgress');
        var saveToServer = document.getElementById('saveUploadToServer');
        if (uploadProgress) uploadProgress.classList.remove('hidden');
        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            // 添加本地背景到列表
            G.availableBackgrounds.push(dataUrl);
            // 保存到本地存储
            localStorage.setItem('gomoku_backgrounds', JSON.stringify(G.availableBackgrounds));
            G.renderBackgroundGrid();
            // 自动应用新上传的背景
            G.applyBackground(dataUrl);
            G.drawBoard();
            G.drawOnlineBoard();
            if (uploadProgress) uploadProgress.classList.add('hidden');
            G.showToast('背景图片已上传');
            // 仅管理员可上传到服务器
            if (isAdmin && saveToServer && saveToServer.checked) {
                G.uploadBackgroundToServer(dataUrl, file.name);
            }
        };
        reader.onerror = function() {
            if (uploadProgress) uploadProgress.classList.add('hidden');
            G.showToast('图片读取失败', true);
        };
        reader.readAsDataURL(file);
    };

    // 上传背景图片到服务器（仅管理员可调用）
    G.uploadBackgroundToServer = async function(dataUrl, filename) {
        try {
            await G.apiCall('/api/backgrounds/upload', 'POST', {
                data: dataUrl,
                filename: filename
            });
            G.showToast('背景已保存到服务器');
        } catch (err) {
            G.showToast('背景保存到服务器失败：需要管理员权限', true);
        }
    };

})();
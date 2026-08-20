// ============================================================
// 游戏大厅初始化 - 模式与设置绑定
// 负责：游戏模式选择、AI对战、双人对战、联机对战、
//       玩家棋子颜色、AI 难度、双人对战设置（禁手/时间限制）
// ============================================================
(function() {
    var G = window.Gomoku;
    var $ = function(id) { return document.getElementById(id); };

    // AI 对战模式
    var modeAI = $('modeAI');
    if (modeAI) {
        modeAI.addEventListener('click', function() {
            G.gameMode = 'ai';
            G.updateModeButtons();
            G.resetGame();
        });
    }

    // 双人对战模式
    var modePVP = $('modePVP');
    if (modePVP) {
        modePVP.addEventListener('click', function() {
            G.gameMode = 'pvp';
            G.updateModeButtons();
            G.resetGame();
        });
    }

    // 联机对战模式
    var modeOnline = $('modeOnline');
    if (modeOnline) {
        modeOnline.addEventListener('click', function() {
            if (!G.currentUser && !G.isGuest) {
                alert('请先登录');
                G.showTab('loginContent');
                return;
            }
            if (G.isGuest) {
                G.showToast('访客模式无法使用联机对战功能，请注册账号', true);
                return;
            }
            G.showTab('onlineContent');
        });
    }

    // 选择黑棋
    var playerColorBlack = $('playerColorBlack');
    if (playerColorBlack) {
        playerColorBlack.addEventListener('click', function() {
            if (G.playerColor === 1) return;
            G.playerColor = 1;
            G.updateColorButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('已切换为黑棋，游戏重新开始');
            } else {
                G.showToast('您将执黑先行');
            }
        });
    }

    // 选择白棋
    var playerColorWhite = $('playerColorWhite');
    if (playerColorWhite) {
        playerColorWhite.addEventListener('click', function() {
            if (G.playerColor === 2) return;
            G.playerColor = 2;
            G.updateColorButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('已切换为白棋，游戏重新开始');
            } else {
                G.showToast('您将执白后行');
            }
        });
    }

    // AI 难度：简单
    var aiEasy = $('aiEasy');
    if (aiEasy) {
        aiEasy.addEventListener('click', function() {
            if (G.aiDifficulty === 'easy') return;
            G.aiDifficulty = 'easy';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为简单，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为简单');
            }
        });
    }

    // AI 难度：中等
    var aiMedium = $('aiMedium');
    if (aiMedium) {
        aiMedium.addEventListener('click', function() {
            if (G.aiDifficulty === 'medium') return;
            G.aiDifficulty = 'medium';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为中等，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为中等');
            }
        });
    }

    // AI 难度：困难
    var aiHard = $('aiHard');
    if (aiHard) {
        aiHard.addEventListener('click', function() {
            if (G.aiDifficulty === 'hard') return;
            G.aiDifficulty = 'hard';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为困难，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为困难');
            }
        });
    }

    // AI 难度：大师
    var aiMaster = $('aiMaster');
    if (aiMaster) {
        aiMaster.addEventListener('click', function() {
            if (G.aiDifficulty === 'master') return;
            G.aiDifficulty = 'master';
            G.updateDifficultyButtons();
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('AI难度已设为大师，游戏重新开始');
            } else {
                G.showToast('AI难度已设置为大师');
            }
        });
    }

    // AI 落子延迟开关
    var aiDelay = $('aiDelay');
    if (aiDelay) {
        aiDelay.addEventListener('change', function(e) {
            G.aiDelayEnabled = e.target.checked;
            G.showToast(G.aiDelayEnabled ? '已启用AI思考延迟' : '已关闭AI思考延迟');
        });
    }

    // 禁手规则开关
    var pvpForbidden = $('pvpForbidden');
    if (pvpForbidden) {
        pvpForbidden.addEventListener('change', function(e) {
            G.pvpForbidden = e.target.checked;
            G.showToast(G.pvpForbidden ? '已启用禁手规则' : '已禁用禁手规则');
            if (G.gameMode === 'pvp' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
                G.showToast('设置已更改，游戏重新开始');
            }
        });
    }

    // 时间限制按钮组
    var timeButtons = ['timeNone', 'time5min', 'time10min', 'time30min'];
    var timeLimits = [0, 300, 600, 1800];
    var timeLabels = ['无限制', '5分钟', '10分钟', '30分钟'];

    timeButtons.forEach(function(id, index) {
        var btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            G.pvpTimeLimit = timeLimits[index];
            timeButtons.forEach(function(btnId) {
                var b = $(btnId);
                if (b) b.classList.remove('active');
            });
            btn.classList.add('active');
            var display = $('pvpTimerDisplay');
            var text = $('pvpTimeLimitText');
            if (G.pvpTimeLimit > 0) {
                if (display) display.classList.remove('hidden');
                if (text) text.textContent = timeLabels[index];
            } else {
                if (display) display.classList.add('hidden');
            }
            G.showToast('时间限制: ' + timeLabels[index]);
            if (G.gameMode === 'pvp' && G.gameActive) {
                G.stopPvpTurnTimer();
                G.resetGame();
            }
        });
    });

    // 规则模式按钮组 - PVP
    var pvpRuleButtons = ['ruleStandard', 'ruleRenju', 'ruleFree'];
    pvpRuleButtons.forEach(function(id) {
        var btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            var mode = id === 'ruleStandard' ? 'standard' : (id === 'ruleRenju' ? 'renju' : 'free');
            if (G.ruleMode === mode) return;
            G.ruleMode = mode;
            G.updateRuleModeButtons && G.updateRuleModeButtons();
            G.showToast('规则模式: ' + G.getRuleModeName(mode));
            if (G.gameMode === 'pvp' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
            }
        });
    });

    // 规则模式按钮组 - AI
    var aiRuleButtons = ['aiRuleStandard', 'aiRuleRenju', 'aiRuleFree'];
    aiRuleButtons.forEach(function(id) {
        var btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', function() {
            var mode = id === 'aiRuleStandard' ? 'standard' : (id === 'aiRuleRenju' ? 'renju' : 'free');
            if (G.aiRuleMode === mode) return;
            G.aiRuleMode = mode;
            G.updateAiRuleModeButtons && G.updateAiRuleModeButtons();
            G.showToast('AI规则模式: ' + G.getRuleModeName(mode));
            if (G.gameMode === 'ai' && G.gameActive && G.moveHistory.length > 0) {
                G.resetGame();
            }
        });
    });

    // 更新规则模式按钮状态
    G.updateRuleModeButtons = function() {
        var buttons = ['ruleStandard', 'ruleRenju', 'ruleFree'];
        var modes = ['standard', 'renju', 'free'];
        buttons.forEach(function(id, index) {
            var btn = $(id);
            if (btn) {
                if (modes[index] === G.ruleMode) {
                    btn.classList.add('bg-primary', 'text-white');
                } else {
                    btn.classList.remove('bg-primary', 'text-white');
                }
            }
        });
    };

    G.updateAiRuleModeButtons = function() {
        var buttons = ['aiRuleStandard', 'aiRuleRenju', 'aiRuleFree'];
        var modes = ['standard', 'renju', 'free'];
        buttons.forEach(function(id, index) {
            var btn = $(id);
            if (btn) {
                if (modes[index] === G.aiRuleMode) {
                    btn.classList.add('bg-primary', 'text-white');
                } else {
                    btn.classList.remove('bg-primary', 'text-white');
                }
            }
        });
    };
})();
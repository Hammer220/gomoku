// ============================================================
// 用户管理模块 - 弹窗操作
// 负责：修改密码、修改积分、免密设置弹窗、免密登录
// ============================================================
(function() {
    var G = window.Gomoku;

    document.addEventListener('click', function(e) {
        const target = e.target;

        // 免密登录相关事件
        if (target.id === 'showPasswordFreeLogin') {
            e.preventDefault();
            var loginModal = document.getElementById('loginModal');
            var passwordFreeLoginPage = document.getElementById('passwordFreeLoginPage');
            if (loginModal) loginModal.classList.add('hidden');
            if (passwordFreeLoginPage) passwordFreeLoginPage.classList.remove('hidden');
            return;
        }

        if (target.id === 'showLoginFromFree') {
            e.preventDefault();
            var loginModal = document.getElementById('loginModal');
            var passwordFreeLoginPage = document.getElementById('passwordFreeLoginPage');
            if (passwordFreeLoginPage) passwordFreeLoginPage.classList.add('hidden');
            if (loginModal) loginModal.classList.remove('hidden');
            return;
        }

        if (target.id === 'showRegisterFromFree') {
            e.preventDefault();
            var registerModal = document.getElementById('registerModal');
            var passwordFreeLoginPage = document.getElementById('passwordFreeLoginPage');
            if (passwordFreeLoginPage) passwordFreeLoginPage.classList.add('hidden');
            if (registerModal) registerModal.classList.remove('hidden');
            return;
        }

        if (target.id === 'adminChangePasswordBtn' || target.closest('#adminChangePasswordBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast(G.i18n.t('selectUserFirst'), true);
            G.showChangePasswordModal(username);
        }

        if (target.id === 'adminUpdateScoreBtn' || target.closest('#adminUpdateScoreBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast(G.i18n.t('selectUserFirst'), true);
            G.showUpdateScoreModal(username);
        }

        if (target.id === 'adminPasswordFreeToggle') {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast(G.i18n.t('selectUserFirst'), true);
            const user = G.adminAllUsers.find(u => u.username === username);
            if (!user) return G.showToast(G.i18n.t('userNotFound'), true);
            const passwordFree = !(user.passwordFree === true);
            const maxAttempts = user.passwordFreeMaxAttempts || 0;
            G.apiCall('/api/admin/set_password_free', 'POST', { username, passwordFree, maxAttempts: maxAttempts })
                .then(data => { G.showToast(data.message); return G.loadAdminUsers(); })
                .then(() => { G.selectAdminUser(username); })
                .catch(err => G.showToast(G.i18n.t('operationFailed') + ': ' + err.message, true));
        }

        if (target.id === 'adminPasswordFreeAttempts') {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast(G.i18n.t('selectUserFirst'), true);
            G.showPasswordFreeAttemptsModal(username);
        }
    });

    G.showPasswordFreeAttemptsModal = function(username) {
        const user = G.adminAllUsers.find(u => u.username === username);
        const currentMax = user ? (user.passwordFreeMaxAttempts || 0) : 0;
        const currentRemaining = user ? (user.passwordFreeRemainingAttempts !== undefined ? user.passwordFreeRemainingAttempts : 0) : 0;

        const modalHtml = `
            <div id="passwordFreeAttemptsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">${G.i18n.t('setPasswordFreeAttempts')}</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('username')}</label>
                            <input type="text" id="pfAttemptsUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('maxAttemptsLabel')}</label>
                            <input type="number" id="pfMaxAttempts" min="0" value="${currentMax}" class="w-full px-4 py-2 border rounded-lg">
                            <p class="text-xs text-gray-500 mt-1">${G.i18n.t('setToZeroHint')}</p>
                        </div>
                        <div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                            <p>${G.i18n.t('currentStatus')}：${currentMax > 0 ? G.i18n.t('remainingStatus') + ' ' + currentRemaining + '/' + currentMax + ' ' + G.i18n.t('modelTimes') : G.i18n.t('noLimitStatus')}</p>
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmPfAttemptsBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">${G.i18n.t('confirmSet')}</button>
                        <button id="cancelPfAttemptsBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">${G.i18n.t('cancel')}</button>
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
                G.showToast(G.i18n.t('invalidAttempts'), true);
                return;
            }

            try {
                const data = await G.apiCall('/api/admin/set_password_free', 'POST', {
                    username: username,
                    passwordFree: true,
                    maxAttempts: maxAttempts
                });
                G.showToast(data.message);
                document.getElementById('passwordFreeAttemptsModal').remove();
                G.loadAdminUsers();
                G.selectAdminUser(username);
            } catch (error) {
                G.showToast(G.i18n.t('passwordFreeAttemptsFailed') + ': ' + error.message, true);
            }
        });
    };

    G.showUpdateScoreModal = function(username) {
        const modalHtml = `
            <div id="updateScoreModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">${G.i18n.t('updateUserScore')}</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('username')}</label>
                            <input type="text" id="updateScoreUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('newScore')}</label>
                            <input type="number" id="updateScoreValue" value="0" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmUpdateScoreBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">${G.i18n.t('confirmModify')}</button>
                        <button id="cancelUpdateScoreBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">${G.i18n.t('cancel')}</button>
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
            if (isNaN(newScore)) {
                G.showToast(G.i18n.t('scoreMustBeInteger'), true);
                return;
            }

            try {
                const data = await G.apiCall('/api/admin/user/' + username + '/score', 'POST', { score: newScore });
                G.showToast(data.message);
                document.getElementById('updateScoreModal').remove();
                G.loadAdminUsers();
            } catch (error) {
                G.showToast(G.i18n.t('updateScoreFailed') + ': ' + error.message, true);
            }
        });
    };

    G.showChangePasswordModal = function(username) {
        const modalHtml = `
            <div id="changePwdModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                    <h3 class="text-xl font-bold mb-4">${G.i18n.t('updateUserPassword')}</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('username')}</label>
                            <input type="text" id="changePwdUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${G.i18n.t('newPassword')}</label>
                            <input type="password" id="changePwdNew" placeholder="${G.i18n.t('newPasswordPlaceholder')}" class="w-full px-4 py-2 border rounded-lg">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button id="confirmChangePwdBtn" class="flex-1 bg-primary hover:bg-primary/90 text-white py-2 rounded-lg">${G.i18n.t('confirmModify')}</button>
                        <button id="cancelChangePwdBtn" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 rounded-lg">${G.i18n.t('cancel')}</button>
                    </div>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('changePwdModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('cancelChangePwdBtn').addEventListener('click', () => {
            document.getElementById('changePwdModal').remove();
        });

        document.getElementById('confirmChangePwdBtn').addEventListener('click', async () => {
            const newPwd = document.getElementById('changePwdNew').value;
            if (!newPwd || newPwd.length < 6) {
                G.showToast(G.i18n.t('newPasswordMinLength'), true);
                return;
            }

            try {
                const data = await G.apiCall('/api/admin/change_password', 'POST', {
                    username: username,
                    new_password: newPwd
                });
                G.showToast(G.i18n.t('passwordChanged'));
                document.getElementById('changePwdModal').remove();
                G.loadAdminUsers();
                G.loadAdminList();
            } catch (error) {
                G.showToast(G.i18n.t('passwordChangeFailed') + ': ' + error.message, true);
            }
        });
    };

    // 免密登录表单提交
    var passwordFreeLoginForm = document.getElementById('passwordFreeLoginForm');
    if (passwordFreeLoginForm) {
        passwordFreeLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var u = document.getElementById('passwordFreeUsername').value;
            try {
                await G.loginPasswordFree(u);
            } catch (err) {
                G.showToast(err.message, true);
            }
        });
    }

    // 免密登录用户名输入检查
    var passwordFreeUsernameInput = document.getElementById('passwordFreeUsername');
    if (passwordFreeUsernameInput) {
        passwordFreeUsernameInput.addEventListener('input', function() {
            G.checkPasswordFreeAttempts(this.value);
        });
    }

})();
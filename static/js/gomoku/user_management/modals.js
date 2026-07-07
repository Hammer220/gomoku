// ============================================================
// 用户管理模块 - 弹窗操作
// 负责：修改密码、修改积分、免密设置弹窗
// ============================================================
(function() {
    var G = window.Gomoku;

    document.addEventListener('click', function(e) {
        const target = e.target;

        if (target.id === 'adminChangePasswordBtn' || target.closest('#adminChangePasswordBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
            G.showChangePasswordModal(username);
        }

        if (target.id === 'adminUpdateScoreBtn' || target.closest('#adminUpdateScoreBtn')) {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
            G.showUpdateScoreModal(username);
        }

        if (target.id === 'adminPasswordFreeToggle') {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
            const user = G.adminAllUsers.find(u => u.username === username);
            if (!user) return G.showToast('用户不存在', true);
            const passwordFree = !(user.passwordFree === true);
            const maxAttempts = user.passwordFreeMaxAttempts || 0;
            G.apiCall('/api/admin/set_password_free', 'POST', { username, passwordFree, maxAttempts: maxAttempts })
                .then(data => { G.showToast(data.message); G.loadAdminUsers(); G.selectAdminUser(username); })
                .catch(err => G.showToast('操作失败: ' + err.message, true));
        }

        if (target.id === 'adminPasswordFreeAttempts') {
            const username = document.getElementById('adminBanUsername').value.trim();
            if (!username) return G.showToast('请先选择用户', true);
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
                    <h3 class="text-xl font-bold mb-4">设置免密登录次数</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="pfAttemptsUsername" value="${username}" class="w-full px-4 py-2 border rounded-lg bg-gray-100" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">最大免密登录次数</label>
                            <input type="number" id="pfMaxAttempts" min="0" value="${currentMax}" class="w-full px-4 py-2 border rounded-lg">
                            <p class="text-xs text-gray-500 mt-1">设置为 0 表示无次数限制</p>
                        </div>
                        <div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                            <p>当前状态：${currentMax > 0 ? '剩余 ' + currentRemaining + '/' + currentMax + ' 次' : '无次数限制'}</p>
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
                G.showToast('次数必须为非负整数', true);
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
                G.showToast('设置免密登录次数失败: ' + error.message, true);
            }
        });
    };

    G.showUpdateScoreModal = function(username) {
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
                            <input type="number" id="updateScoreValue" value="0" class="w-full px-4 py-2 border rounded-lg">
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
            if (isNaN(newScore)) {
                G.showToast('积分必须为整数', true);
                return;
            }

            try {
                const data = await G.apiCall('/api/admin/user/' + username + '/score', 'POST', { score: newScore });
                G.showToast(data.message);
                document.getElementById('updateScoreModal').remove();
                G.loadAdminUsers();
            } catch (error) {
                G.showToast('修改积分失败: ' + error.message, true);
            }
        });
    };

    G.showChangePasswordModal = function(username) {
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

        const existingModal = document.getElementById('changePwdModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('cancelChangePwdBtn').addEventListener('click', () => {
            document.getElementById('changePwdModal').remove();
        });

        document.getElementById('confirmChangePwdBtn').addEventListener('click', async () => {
            const newPwd = document.getElementById('changePwdNew').value;
            if (!newPwd || newPwd.length < 6) {
                G.showToast('新密码至少需要6个字符', true);
                return;
            }

            try {
                const data = await G.apiCall('/api/admin/change_password', 'POST', {
                    username: username,
                    new_password: newPwd
                });
                G.showToast('密码修改成功');
                document.getElementById('changePwdModal').remove();
                G.loadAdminUsers();
                G.loadAdminList();
            } catch (error) {
                G.showToast('修改密码失败: ' + error.message, true);
            }
        });
    };

})();
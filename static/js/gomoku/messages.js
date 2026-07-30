// ============================================================
// 消息模块
// 负责：收件箱、已发送、写消息、消息详情、用户搜索等
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    var $ = function(id) { return document.getElementById(id); };

    G.selectedRecipients = [];
    G.currentMessageTab = 'inbox';
    G.allUsers = [];
    G.isAdminUser = false;

    G.messageHashToTab = {
        'inbox': 'inbox',
        'sent': 'sent',
        'compose': 'compose'
    };

    G.handleMessagesHashChange = function() {
        var hash = window.location.hash.replace('#', '');
        var tab = G.messageHashToTab[hash];
        if (tab) {
            G.showMessageTab(tab);
        }
    };

    window.addEventListener('hashchange', G.handleMessagesHashChange);

    if (window.location.hash) {
        G.handleMessagesHashChange();
    }

    // ==================== 标签页切换 ====================

    G.showMessageTab = function(tab, skipHashUpdate) {
        G.currentMessageTab = tab;
        var inboxTab = $('inboxTab');
        var sentTab = $('sentTab');
        var composeTab = $('composeTab');
        var inboxPanel = $('inboxPanel');
        var sentPanel = $('sentPanel');
        var composePanel = $('composePanel');
        var detailPanel = $('messageDetailPanel');

        if (inboxTab) inboxTab.className = tab === 'inbox' ? 'tab-active px-4 py-2 font-medium whitespace-nowrap' : 'px-4 py-2 font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap';
        if (sentTab) sentTab.className = tab === 'sent' ? 'tab-active px-4 py-2 font-medium whitespace-nowrap' : 'px-4 py-2 font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap';
        if (composeTab) composeTab.className = tab === 'compose' ? 'tab-active px-4 py-2 font-medium whitespace-nowrap' : 'px-4 py-2 font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap';

        if (inboxPanel) inboxPanel.classList.toggle('hidden', tab !== 'inbox');
        if (sentPanel) sentPanel.classList.toggle('hidden', tab !== 'sent');
        if (composePanel) composePanel.classList.toggle('hidden', tab !== 'compose');
        if (detailPanel) detailPanel.classList.add('hidden');

        if (!skipHashUpdate) {
            history.replaceState(null, '', '#' + tab);
        }

        if (tab === 'inbox') G.loadInbox();
        else if (tab === 'sent') G.loadSent();
        else if (tab === 'compose') G.loadUserList();
    };

    // ==================== 加载用户列表 ====================

    G.loadUserList = async function() {
        try {
            var data = await G.apiCall('/api/users/list');
            G.allUsers = data.users || [];
            G.isAdminUser = G.currentUser && G.currentUser.isAdmin;
            var hint = $('recipientHint');
            if (hint) {
                hint.textContent = '所有用户均可多选收件人';
            }
        } catch (err) {
            G.showToast('加载用户列表失败: ' + err.message, true);
        }
    };

    // ==================== 收件人搜索与选择 ====================

    G.searchRecipients = function(query) {
        var container = $('userSuggestions');
        if (!container) return;
        if (!query) {
            container.classList.add('hidden');
            return;
        }
        var q = query.toLowerCase();
        var filtered = G.allUsers.filter(function(u) {
            return u.username.toLowerCase().includes(q) && G.selectedRecipients.indexOf(u.username) === -1;
        });
        if (filtered.length === 0) {
            container.innerHTML = '<div class="px-4 py-2 text-sm text-gray-400">无匹配用户</div>';
            container.classList.remove('hidden');
            return;
        }
        container.innerHTML = filtered.slice(0, 10).map(function(u) {
            var badge = u.isSuperAdmin ? ' <span class="text-xs text-red-500">[超级管理员]</span>' : (u.isAdmin ? ' <span class="text-xs text-blue-500">[管理员]</span>' : '');
            return '<div class="px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer user-suggestion-item" data-username="' + u.username + '">' + u.username + badge + '</div>';
        }).join('');
        container.classList.remove('hidden');
    };

    G.addRecipient = function(username) {
        if (G.selectedRecipients.indexOf(username) === -1) {
            G.selectedRecipients.push(username);
            G.renderRecipientTags();
        }
        var searchInput = $('recipientSearch');
        if (searchInput) searchInput.value = '';
        var container = $('userSuggestions');
        if (container) container.classList.add('hidden');
    };

    G.removeRecipient = function(username) {
        G.selectedRecipients = G.selectedRecipients.filter(function(u) { return u !== username; });
        G.renderRecipientTags();
    };

    G.renderRecipientTags = function() {
        var container = $('recipientTags');
        if (!container) return;
        container.innerHTML = G.selectedRecipients.map(function(u) {
            return '<span class="recipient-tag">' + u + '<span class="remove-tag" data-username="' + u + '">&times;</span></span>';
        }).join('');
    };

    // ==================== 发送消息 ====================

    G.sendMessage = async function() {
        var content = ($('messageContent') || {}).value || '';
        content = content.trim();
        if (!content) {
            G.showToast('请输入消息内容', true);
            return;
        }
        if (G.selectedRecipients.length === 0) {
            G.showToast('请选择收件人', true);
            return;
        }
        var btn = $('sendMessageBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>发送中';
        }
        try {
            await G.apiCall('/api/messages/send', 'POST', {
                to: G.selectedRecipients.slice(),
                content: content
            });
            G.showToast('消息发送成功');
            if ($('messageContent')) $('messageContent').value = '';
            G.selectedRecipients = [];
            G.renderRecipientTags();
            G.showMessageTab('sent');
        } catch (err) {
            G.showToast('发送失败: ' + err.message, true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i>发送';
            }
        }
    };

    // ==================== 加载收件箱 ====================

    G.loadInbox = async function() {
        var container = $('inboxMessages');
        if (!container) return;
        container.innerHTML = '<div class="text-gray-500 text-center py-8">加载中...</div>';
        try {
            var data = await G.apiCall('/api/messages/received');
            var messages = data.messages || [];
            if (messages.length === 0) {
                container.innerHTML = '<div class="text-gray-400 text-center py-8"><i class="fa-solid fa-inbox text-4xl mb-2 block"></i>收件箱为空</div>';
                return;
            }
            container.innerHTML = messages.map(function(m) {
                var time = new Date(m.timestamp * 1000).toLocaleString('zh-CN');
                var cls = m.isRead ? 'message-read' : 'message-unread';
                var dot = m.isRead ? '' : '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-1"></span>';
                return '<div class="p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow ' + cls + ' message-item" data-id="' + m.id + '" data-type="inbox">' +
                    '<div class="flex justify-between items-start">' +
                        '<div class="flex items-center">' + dot + '<span class="font-medium">' + m.from + '</span></div>' +
                        '<span class="text-xs text-gray-400">' + time + '</span>' +
                    '</div>' +
                    '<div class="text-sm text-gray-600 mt-1 truncate">' + m.content + '</div>' +
                    '<div class="text-xs text-gray-400 mt-1">发送给: ' + m.to.join(', ') + '</div>' +
                '</div>';
            }).join('');
            G.updateUnreadBadge();
        } catch (err) {
            container.innerHTML = '<div class="text-red-500 text-center py-4">加载失败: ' + err.message + '</div>';
        }
    };

    // ==================== 加载已发送 ====================

    G.loadSent = async function() {
        var container = $('sentMessages');
        if (!container) return;
        container.innerHTML = '<div class="text-gray-500 text-center py-8">加载中...</div>';
        try {
            var data = await G.apiCall('/api/messages/sent');
            var messages = data.messages || [];
            if (messages.length === 0) {
                container.innerHTML = '<div class="text-gray-400 text-center py-8"><i class="fa-solid fa-paper-plane text-4xl mb-2 block"></i>暂无已发送消息</div>';
                return;
            }
            container.innerHTML = messages.map(function(m) {
                var time = new Date(m.timestamp * 1000).toLocaleString('zh-CN');
                return '<div class="p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow message-item" data-id="' + m.id + '" data-type="sent">' +
                    '<div class="flex justify-between items-start">' +
                        '<span class="font-medium">发送给: ' + m.to.join(', ') + '</span>' +
                        '<span class="text-xs text-gray-400">' + time + '</span>' +
                    '</div>' +
                    '<div class="text-sm text-gray-600 mt-1 truncate">' + m.content + '</div>' +
                '</div>';
            }).join('');
        } catch (err) {
            container.innerHTML = '<div class="text-red-500 text-center py-4">加载失败: ' + err.message + '</div>';
        }
    };

    // ==================== 消息详情 ====================

    G.showMessageDetail = async function(messageId, msgType) {
        var detailPanel = $('messageDetailPanel');
        var detailContent = $('messageDetailContent');
        var inboxPanel = $('inboxPanel');
        var sentPanel = $('sentPanel');
        if (!detailPanel || !detailContent) return;

        var messages = [];
        try {
            var data;
            if (msgType === 'inbox') {
                data = await G.apiCall('/api/messages/received');
                G.markAsRead([messageId]);
            } else {
                data = await G.apiCall('/api/messages/sent');
            }
            messages = data.messages || [];
        } catch (err) {
            G.showToast('加载消息失败: ' + err.message, true);
            return;
        }

        var msg = null;
        for (var i = 0; i < messages.length; i++) {
            if (messages[i].id === messageId) { msg = messages[i]; break; }
        }
        if (!msg) {
            G.showToast('消息不存在', true);
            return;
        }

        var time = new Date(msg.timestamp * 1000).toLocaleString('zh-CN');
        var readStatus = '';
        if (msgType === 'sent') {
            var readBy = msg.read_by || [];
            var unread = [];
            for (var j = 0; j < msg.to.length; j++) {
                if (readBy.indexOf(msg.to[j]) === -1) unread.push(msg.to[j]);
            }
            readStatus = '<div class="text-xs text-gray-400 mt-2">已读: ' + (readBy.length > 0 ? readBy.join(', ') : '无') + '</div>';
            if (unread.length > 0) {
                readStatus += '<div class="text-xs text-orange-500">未读: ' + unread.join(', ') + '</div>';
            }
        }

        detailContent.innerHTML =
            '<div class="mb-3"><span class="text-sm text-gray-500">' + (msgType === 'inbox' ? '发件人' : '收件人') + ':</span> ' +
            '<span class="font-medium">' + (msgType === 'inbox' ? msg.from : msg.to.join(', ')) + '</span>' +
            '<span class="text-xs text-gray-400 ml-4">' + time + '</span></div>' +
            '<div class="bg-white rounded-lg p-4 border whitespace-pre-wrap text-sm">' + msg.content + '</div>' +
            readStatus +
            '<div class="mt-4"><button class="text-red-500 hover:text-red-700 text-sm delete-msg-btn" data-id="' + msg.id + '" data-type="' + msgType + '"><i class="fa-solid fa-trash mr-1"></i>删除</button></div>';

        if (inboxPanel) inboxPanel.classList.add('hidden');
        if (sentPanel) sentPanel.classList.add('hidden');
        detailPanel.classList.remove('hidden');
    };

    // ==================== 标记已读 ====================

    G.markAsRead = async function(ids) {
        try {
            await G.apiCall('/api/messages/read', 'POST', { ids: ids });
            G.updateUnreadBadge();
        } catch (err) {
            console.error('标记已读失败:', err);
        }
    };

    // ==================== 删除消息 ====================

    G.deleteMessage = async function(messageId, msgType) {
        if (!confirm('确定删除这条消息吗？')) return;
        try {
            await G.apiCall('/api/messages/' + messageId, 'DELETE');
            G.showToast('消息已删除');
            var detailPanel = $('messageDetailPanel');
            if (detailPanel) detailPanel.classList.add('hidden');
            if (msgType === 'inbox') {
                G.showMessageTab('inbox');
            } else {
                G.showMessageTab('sent');
            }
        } catch (err) {
            G.showToast('删除失败: ' + err.message, true);
        }
    };

    // ==================== 全部标为已读 ====================

    G.markAllAsRead = async function() {
        var btn = $('markAllReadBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>处理中';
        }
        try {
            await G.apiCall('/api/messages/read-all', 'POST');
            G.showToast('已全部标记为已读');
            G.loadInbox();
            G.updateUnreadBadge();
        } catch (err) {
            G.showToast('操作失败: ' + err.message, true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check-double mr-1"></i>全部标为已读';
            }
        }
    };

    // ==================== 未读消息数 ====================

    G.updateUnreadBadge = async function() {
        try {
            var data = await G.apiCall('/api/messages/unread-count');
            var count = data.unreadCount || 0;
            var badge = $('unreadBadge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('获取未读消息数失败:', err);
        }
    };

    // ==================== 事件绑定（在 init_messages.js 中调用） ====================

    G.bindMessageEvents = function() {
        var inboxTab = $('inboxTab');
        var sentTab = $('sentTab');
        var composeTab = $('composeTab');
        var sendBtn = $('sendMessageBtn');
        var refreshBtn = $('refreshMessagesBtn');
        var markAllReadBtn = $('markAllReadBtn');
        var backBtn = $('backToListBtn');
        var searchInput = $('recipientSearch');

        if (inboxTab) inboxTab.addEventListener('click', function() { G.showMessageTab('inbox'); });
        if (sentTab) sentTab.addEventListener('click', function() { G.showMessageTab('sent'); });
        if (composeTab) composeTab.addEventListener('click', function() { G.showMessageTab('compose'); });
        if (sendBtn) sendBtn.addEventListener('click', G.sendMessage);
        if (markAllReadBtn) markAllReadBtn.addEventListener('click', G.markAllAsRead);
        if (refreshBtn) refreshBtn.addEventListener('click', function() {
            if (G.currentMessageTab === 'inbox') G.loadInbox();
            else if (G.currentMessageTab === 'sent') G.loadSent();
            G.updateUnreadBadge();
        });
        if (backBtn) backBtn.addEventListener('click', function() {
            var detailPanel = $('messageDetailPanel');
            if (detailPanel) detailPanel.classList.add('hidden');
            if (G.currentMessageTab === 'inbox') {
                if ($('inboxPanel')) $('inboxPanel').classList.remove('hidden');
            } else {
                if ($('sentPanel')) $('sentPanel').classList.remove('hidden');
            }
        });

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                G.searchRecipients(this.value);
            });
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var val = this.value.trim();
                    if (val) {
                        var found = null;
                        for (var i = 0; i < G.allUsers.length; i++) {
                            if (G.allUsers[i].username.toLowerCase() === val.toLowerCase()) {
                                found = G.allUsers[i].username;
                                break;
                            }
                        }
                        if (found) {
                            G.addRecipient(found);
                        } else {
                            G.showToast('用户不存在: ' + val, true);
                        }
                    }
                }
            });
        }

        document.addEventListener('click', function(e) {
            var target = e.target;
            if (target.classList.contains('user-suggestion-item')) {
                G.addRecipient(target.dataset.username);
            }
            if (target.classList.contains('remove-tag')) {
                G.removeRecipient(target.dataset.username);
            }
            if (target.classList.contains('message-item') || target.closest('.message-item')) {
                var el = target.classList.contains('message-item') ? target : target.closest('.message-item');
                G.showMessageDetail(el.dataset.id, el.dataset.type);
            }
            if (target.classList.contains('delete-msg-btn')) {
                G.deleteMessage(target.dataset.id, target.dataset.type);
            }
            var suggestions = $('userSuggestions');
            if (suggestions && !target.closest('#recipientSearch') && !target.closest('#userSuggestions')) {
                suggestions.classList.add('hidden');
            }
        });
    };

})();
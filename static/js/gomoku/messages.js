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
    G.selectedImage = null;
    G.selectedImageData = '';
    G.redPacketEnabled = false;

    G.messageHashToTab = {
        '/inbox': 'inbox',
        '/sent': 'sent',
        '/compose': 'compose'
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

        if (inboxTab) inboxTab.classList.toggle('active', tab === 'inbox');
        if (sentTab) sentTab.classList.toggle('active', tab === 'sent');
        if (composeTab) composeTab.classList.toggle('active', tab === 'compose');

        if (inboxPanel) inboxPanel.classList.toggle('hidden', tab !== 'inbox');
        if (sentPanel) sentPanel.classList.toggle('hidden', tab !== 'sent');
        if (composePanel) composePanel.classList.toggle('hidden', tab !== 'compose');
        if (detailPanel) detailPanel.classList.add('hidden');

        if (!skipHashUpdate) {
            history.replaceState(null, '', '#/' + tab);
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

    G.selectImage = function() {
        var input = $('imageFileInput');
        if (input) input.click();
    };

    G.handleImageSelected = function(event) {
        var file = event.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            G.showToast('图片大小不能超过10MB', true);
            return;
        }
        G._compressImage(file, function(compressedDataUrl) {
            G.selectedImageData = compressedDataUrl;
            G.selectedImage = file;
            var preview = $('imagePreview');
            var container = $('imagePreviewContainer');
            if (preview) preview.src = compressedDataUrl;
            if (container) container.classList.remove('hidden');
        });
    };

    G._compressImage = function(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var maxW = 800;
                var maxH = 800;
                var w = img.width;
                var h = img.height;
                if (w > maxW || h > maxH) {
                    var ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var compressed = canvas.toDataURL('image/jpeg', 0.7);
                callback(compressed);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    G.clearImageSelection = function() {
        G.selectedImage = null;
        G.selectedImageData = '';
        var preview = $('imagePreview');
        var container = $('imagePreviewContainer');
        var input = $('imageFileInput');
        if (preview) preview.src = '';
        if (container) container.classList.add('hidden');
        if (input) input.value = '';
    };

    G._renderMessageImage = function(imageData) {
        if (!imageData) return '';
        return '<div class="mt-2"><img src="' + imageData + '" alt="图片" class="max-w-[200px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 transition-opacity message-image" onclick="var w=window.open(\'\');w.document.write(\'<img src=\\\'\' + this.src + \'\\\' style=\\\'max-width:100%;max-height:100vh;\\\'/>\');"></div>';
    };

    G.toggleRedPacket = function() {
        G.redPacketEnabled = !G.redPacketEnabled;
        var config = $('redPacketConfig');
        if (config) config.classList.toggle('hidden', !G.redPacketEnabled);
        if (G.redPacketEnabled) {
            G.clearImageSelection();
        }
    };

    G.cancelRedPacket = function() {
        G.redPacketEnabled = false;
        var config = $('redPacketConfig');
        if (config) config.classList.add('hidden');
    };

    G._renderRedPacket = function(rp, messageId, isSent) {
        if (!rp) return '';
        var claimed = rp.total_claimed || 0;
        var count = rp.count || 1;
        var isFinished = claimed >= count;
        var isCurrentUserSender = G.currentUser && G.currentUser.username === rp._sender;
        var hasClaimed = rp.claimed_by && G.currentUser && rp.claimed_by.indexOf(G.currentUser.username) !== -1;

        var html = '<div class="mt-2 p-3 bg-gradient-to-r from-red-500 to-orange-400 rounded-lg text-white cursor-pointer red-packet-item" data-message-id="' + messageId + '">';
        html += '<div class="flex items-center gap-2">';
        html += '<i class="fa-solid fa-gift text-2xl"></i>';
        html += '<div>';
        html += '<div class="font-bold text-lg">积分红包</div>';
        html += '<div class="text-xs opacity-90">总金额: ' + rp.amount + ' 积分 · ' + claimed + '/' + count + ' 已领取</div>';
        html += '</div>';
        html += '</div>';

        if (isFinished) {
            html += '<div class="mt-2 text-xs text-center opacity-80">红包已被领完</div>';
            if (rp.claimed && rp.claimed.length > 0) {
                html += '<div class="mt-1 text-xs opacity-70">';
                for (var i = 0; i < rp.claimed_by.length; i++) {
                    html += rp.claimed_by[i] + ': ' + rp.claimed[i] + '积分 ';
                }
                html += '</div>';
            }
        } else if (!isSent && !hasClaimed) {
            html += '<div class="mt-2 text-center"><span class="inline-block bg-white text-red-500 px-4 py-1 rounded-full text-sm font-bold cursor-pointer hover:bg-red-50 transition-colors claim-red-packet-btn" data-message-id="' + messageId + '">开</span></div>';
        } else if (hasClaimed) {
            html += '<div class="mt-2 text-xs text-center opacity-80">已领取</div>';
        }

        html += '</div>';
        return html;
    };

    G.claimRedPacket = async function(messageId) {
        var btn = document.querySelector('.claim-red-packet-btn[data-message-id="' + messageId + '"]');
        if (btn) {
            btn.textContent = '...';
            btn.style.pointerEvents = 'none';
        }
        try {
            var data = await G.apiCall('/api/messages/red-packet/claim', 'POST', { message_id: parseInt(messageId) });
            G.showToast('恭喜！领取了 ' + data.claimed_amount + ' 积分！');
            if (G.currentUser) {
                G.currentUser.score = (G.currentUser.score || 0) + data.claimed_amount;
                G.updateUserDisplay();
            }
            G.loadInbox();
        } catch (err) {
            G.showToast('领取失败: ' + err.message, true);
            if (btn) {
                btn.textContent = '开';
                btn.style.pointerEvents = 'auto';
            }
        }
    };

    // ==================== 发送消息 ====================

    G.sendMessage = async function() {
        var content = ($('messageContent') || {}).value || '';
        content = content.trim();
        var image = G.selectedImageData || '';
        var redPacket = null;
        if (G.redPacketEnabled) {
            var amount = parseInt(($('redPacketAmount') || {}).value) || 0;
            var count = parseInt(($('redPacketCount') || {}).value) || 1;
            if (amount <= 0) {
                G.showToast('请输入有效的红包积分数量', true);
                return;
            }
            redPacket = { amount: amount, count: count };
        }
        if (!content && !image && !redPacket) {
            G.showToast('请输入消息内容、选择图片或发红包', true);
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
            var payload = {
                to: G.selectedRecipients.slice(),
                content: content
            };
            if (image) {
                payload.image = image;
            }
            if (redPacket) {
                payload.red_packet = redPacket;
            }
            await G.apiCall('/api/messages/send', 'POST', payload);
            G.showToast('消息发送成功');
            if ($('messageContent')) $('messageContent').value = '';
            G.selectedRecipients = [];
            G.renderRecipientTags();
            G.clearImageSelection();
            G.cancelRedPacket();
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
                var imageHtml = G._renderMessageImage(m.image);
                var redPacketHtml = G._renderRedPacket(m.red_packet, m.id, false);
                var contentPreview = m.content ? m.content.substring(0, 50) + (m.content.length > 50 ? '...' : '') : (m.image ? '[图片]' : (m.red_packet ? '[积分红包]' : ''));
                return '<div class="p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow ' + cls + ' message-item" data-id="' + m.id + '" data-type="inbox">' +
                    '<div class="flex justify-between items-start">' +
                        '<div class="flex items-center">' + dot + '<span class="font-medium">' + m.from + '</span></div>' +
                        '<span class="text-xs text-gray-400">' + time + '</span>' +
                    '</div>' +
                    '<div class="text-sm text-gray-600 mt-1 truncate">' + contentPreview + '</div>' +
                    imageHtml +
                    redPacketHtml +
                    '<div class="text-xs text-gray-400 mt-1">发送给: ' + m.to.join(', ') + '</div>' +
                '</div>';
            }).join('');
            G.updateUnreadBadge();
        } catch (err) {
            container.innerHTML = '<div class="text-red-500 text-center py-4">加载失败: ' + err.message + '</div>';
        }
    };

    // ==================== 加载已发送 ====================

    G._buildReadStatusHtml = function(readBy, recipients) {
        readBy = readBy || [];
        var readList = [];
        var unreadList = [];
        for (var j = 0; j < recipients.length; j++) {
            if (readBy.indexOf(recipients[j]) !== -1) {
                readList.push(recipients[j]);
            } else {
                unreadList.push(recipients[j]);
            }
        }
        var html = '';
        if (readList.length > 0) {
            html += '<div class="text-green-600 text-xs"><i class="fa-solid fa-check-circle mr-1"></i>已读: ' + readList.join(', ') + '</div>';
        }
        if (unreadList.length > 0) {
            html += '<div class="text-orange-500 text-xs"><i class="fa-solid fa-clock mr-1"></i>未读: ' + unreadList.join(', ') + '</div>';
        }
        if (readList.length === 0 && unreadList.length === 0) {
            html = '<span class="text-gray-400 text-xs"><i class="fa-solid fa-clock mr-1"></i>未读</span>';
        }
        return html;
    };

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
                var readStatusHtml = G._buildReadStatusHtml(m.read_by, m.to);
                var imageHtml = G._renderMessageImage(m.image);
                var redPacketHtml = G._renderRedPacket(m.red_packet, m.id, true);
                var contentPreview = m.content ? m.content.substring(0, 50) + (m.content.length > 50 ? '...' : '') : (m.image ? '[图片]' : (m.red_packet ? '[积分红包]' : ''));
                return '<div class="p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow message-item" data-id="' + m.id + '" data-type="sent">' +
                    '<div class="flex justify-between items-start">' +
                        '<span class="font-medium">发送给: ' + m.to.join(', ') + '</span>' +
                        '<span class="text-xs text-gray-400">' + time + '</span>' +
                    '</div>' +
                    '<div class="text-sm text-gray-600 mt-1 truncate">' + contentPreview + '</div>' +
                    imageHtml +
                    redPacketHtml +
                    '<div class="mt-1 message-read-status">' + readStatusHtml + '</div>' +
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
            if (String(messages[i].id) === String(messageId)) { msg = messages[i]; break; }
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
            G._renderMessageImage(msg.image) +
            G._renderRedPacket(msg.red_packet, msg.id, msgType === 'sent') +
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

    G.updateUnreadBadge = function(count) {
        if (count !== undefined && count !== null) {
            var cnt = count || 0;
            var badge = $('unreadBadge');
            if (badge) {
                if (cnt > 0) {
                    badge.textContent = cnt;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            return;
        }

        G.apiCall('/api/messages/unread-count').then(function(data) {
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
        }).catch(function(err) {
            console.error('获取未读消息数失败:', err);
        });
    };

    // ==================== 实时消息已读状态更新 ====================

    G.handleMessageReadUpdate = function(data) {
        var messageId = data.messageId;
        var readBy = data.readBy || [];
        if (G.currentMessageTab === 'sent') {
            G.updateSentMessageReadStatus(messageId, readBy);
        }
    };

    G.updateSentMessageReadStatus = function(messageId, readBy) {
        var container = $('sentMessages');
        if (!container) return;
        var items = container.querySelectorAll('.message-item');
        for (var i = 0; i < items.length; i++) {
            if (String(items[i].dataset.id) === String(messageId)) {
                var readStatusEl = items[i].querySelector('.message-read-status');
                if (!readStatusEl) return;
                var toText = items[i].querySelector('.font-medium');
                var recipients = [];
                if (toText) {
                    var match = toText.textContent.match(/发送给:\s*(.+)/);
                    if (match) recipients = match[1].split(',').map(function(s) { return s.trim(); });
                }
                readStatusEl.innerHTML = G._buildReadStatusHtml(readBy, recipients);
                break;
            }
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
        var selectImageBtn = $('selectImageBtn');
        var imageFileInput = $('imageFileInput');
        var removeImageBtn = $('removeImageBtn');

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

        if (selectImageBtn) selectImageBtn.addEventListener('click', G.selectImage);
        if (imageFileInput) imageFileInput.addEventListener('change', G.handleImageSelected);
        if (removeImageBtn) removeImageBtn.addEventListener('click', G.clearImageSelection);

        var toggleRedPacketBtn = $('toggleRedPacketBtn');
        var cancelRedPacketBtn = $('cancelRedPacketBtn');
        if (toggleRedPacketBtn) toggleRedPacketBtn.addEventListener('click', G.toggleRedPacket);
        if (cancelRedPacketBtn) cancelRedPacketBtn.addEventListener('click', G.cancelRedPacket);

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
            if (target.classList.contains('claim-red-packet-btn')) {
                e.stopPropagation();
                G.claimRedPacket(target.dataset.messageId);
            }
            var suggestions = $('userSuggestions');
            if (suggestions && !target.closest('#recipientSearch') && !target.closest('#userSuggestions')) {
                suggestions.classList.add('hidden');
            }
        });
    };

})();
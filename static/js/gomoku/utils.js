// ============================================================
// 工具函数模块
// 负责：API 调用封装（自动附加 token）、Toast 消息提示、
//       数据格式化、标签页切换等全局通用工具函数
// ============================================================
var Gomoku = window.Gomoku || {};

(function() {
    "use strict";

    var G = Gomoku;

    /**
     * 显示Toast提示消息
     * @param {string} msg - 提示消息内容
     * @param {boolean} [isError=false] - 是否为错误提示，错误用红色，成功用绿色
     */
    G.showToast = function(msg, isError) {
        isError = isError || false;
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        // 根据类型选择不同的样式类
        toast.className = 'toast px-4 py-2 rounded-lg shadow-lg mb-2 ' + (isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800');
        toast.textContent = msg;
        container.appendChild(toast);
        // 3秒后自动移除
        setTimeout(function() { toast.remove(); }, 3000);
    };

    /**
     * 统一的API调用函数
     * 封装了fetch请求，处理认证、错误、HTML响应等通用逻辑
     * @param {string} url - API路径（相对于API_BASE）
     * @param {string} [method='GET'] - HTTP方法
     * @param {object} [body=null] - 请求体对象
     * @param {boolean} [skipAuthCheck=false] - 是否跳过401认证过期检查
     * @returns {Promise<object>} - 解析后的JSON响应数据
     */
    G.apiCall = async function(url, method, body, skipAuthCheck) {
        method = method || 'GET';
        body = body || null;
        skipAuthCheck = skipAuthCheck || false;
        var headers = { 'Content-Type': 'application/json' };
        // 如果已登录，携带JWT令牌
        if (G.token) headers['Authorization'] = 'Bearer ' + G.token;
        try {
            var res = await fetch(G.API_BASE + url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });

            // 处理401未授权：登录过期，强制退出
            if (res.status === 401 && !skipAuthCheck && G.isLoggedIn) {
                if (G.handleForceLogout) G.handleForceLogout('登录已过期，请重新登录');
                throw new Error('登录已过期，请重新登录');
            }

            var responseText = await res.text();

            // 检测返回的是HTML页面而非JSON（通常是登录过期被重定向到登录页）
            if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
                if (!skipAuthCheck && G.isLoggedIn && G.handleForceLogout) G.handleForceLogout('登录已过期，请重新登录');
                throw new Error('登录已过期，请重新登录');
            }

            var data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                // 响应不是有效的JSON格式
                throw new Error('服务器返回了无效的响应格式');
            }

            if (!res.ok) {
                // 处理账号被封禁的情况
                if (res.status === 403 && data.error && (data.error.includes('已被封禁') || data.error.includes('账号已被封禁'))) {
                    if (G.handleForceLogout) G.handleForceLogout(data.error);
                    throw new Error(data.error);
                }
                throw new Error(data.error || '请求失败');
            }
            return data;
        } catch (err) {
            // 处理网络连接失败
            if (err.message.includes('Failed to fetch')) {
                throw new Error('网络连接失败，请检查服务器');
            }
            throw err;
        }
    };

    /**
     * 格式化时间（秒 -> mm:ss格式）
     * @param {number} sec - 秒数
     * @returns {string} - 格式化后的时间字符串，如"03:25"
     */
    G.formatTime = function(sec) {
        var m = Math.floor(sec / 60).toString().padStart(2, '0');
        var s = (sec % 60).toString().padStart(2, '0');
        return m + ':' + s;
    };

    /**
     * 格式化剩余封禁时间
     * 将毫秒时间戳转换为友好的中文时间描述
     * @param {number} timestampMs - 封禁结束的毫秒时间戳
     * @returns {string} - 格式化后的时间描述，如"2天 3时 15分"或"已解封"
     */
    G.formatRemainingTime = function(timestampMs) {
        var now = new Date().getTime();
        var remaining = timestampMs - now;
        if (remaining <= 0) return '已解封';
        var days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        var hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        if (days > 0) return days + '天 ' + hours + '时 ' + minutes + '分';
        if (hours > 0) return hours + '时 ' + minutes + '分 ' + seconds + '秒';
        if (minutes > 0) return minutes + '分 ' + seconds + '秒';
        return seconds + '秒';
    };

    /**
     * HTML转义函数
     * 防止XSS攻击，将用户输入中的HTML特殊字符转义
     * @param {string} str - 需要转义的字符串
     * @returns {string} - 转义后的安全字符串
     */
    G.escapeHtml = function(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    /**
     * 复制分享链接到剪贴板
     * @param {string} link - 要复制的链接
     */
    G.copyShareLink = function(link) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(function() {
                G.showToast('链接已复制到剪贴板！');
            }).catch(function() {
                G.fallbackCopyShareLink(link);
            });
        } else {
            G.fallbackCopyShareLink(link);
        }
    };

    /**
     * 降级复制方案（兼容旧浏览器）
     * @param {string} link - 要复制的链接
     */
    G.fallbackCopyShareLink = function(link) {
        var textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            G.showToast('链接已复制到剪贴板！');
        } catch (e) {
            G.showToast('复制失败，请手动复制链接', true);
        }
        document.body.removeChild(textarea);
    };

})();
// Cerberus 风格 PoW 主模块
// 负责：请求 challenge → 多 worker 并行计算 → 提交 verify → 拿到 session
// 全局挂载 window.Gomoku.Pow
'use strict';
(function() {
  var G = window.Gomoku = window.Gomoku || {};

  G.Pow = {
    // 运行时状态
    token: null,        // challenge token
    challenge: null,
    difficulty: null,
    session: null,      // 验证通过后的一次性 session（登录/注册时带）
    progress: 0,        // 0-1
    speedKhs: 0,
    elapsedMs: 0,
    running: false,
    _workers: [],
    _startTs: 0,

    // ======== API ========

    /** 拉取新 challenge，重置状态。*/
    async newChallenge() {
      if (this.running) this.cancel();
      this.session = null;
      var res = await fetch('/api/pow/challenge', { credentials: 'same-origin' });
      var data = await res.json();
      if (!data.token || !data.challenge) {
        throw new Error('获取 PoW challenge 失败');
      }
      this.token = data.token;
      this.challenge = data.challenge;
      this.difficulty = data.difficulty;
      this.progress = 0;
      this.speedKhs = 0;
      return data;
    },

    /** 启动 PoW。options 支持 onProgress / onDone / onError / threads。*/
    solve(options) {
      options = options || {};
      if (!this.challenge) {
        return Promise.reject(new Error('未初始化 challenge'));
      }
      var self = this;
      return new Promise(function (resolve, reject) {
        if (self.running) self.cancel();
        self.running = true;
        self._startTs = Date.now();
        self.elapsedMs = 0;
        self.progress = 0;

        var threads = options.threads || Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 2)));
        var reportInterval = 500;   // 每 worker 每 500 次回调进度（让数字跳动更直观）
        var solved = false;
        var lastProgressBatch = 0;
        var progressCount = 0;

        self._workers = [];
        for (var i = 0; i < threads; i++) {
          var worker = new Worker('/static/js/gomoku/pow_worker.js');
          self._workers.push(worker);
          worker.onmessage = function (e) {
            if (solved) return;
            var payload = e.data;
            if (typeof payload === 'number') {
              progressCount += reportInterval;
              var elapsed = (Date.now() - self._startTs) / 1000;
              self.elapsedMs = elapsed * 1000;
              self.speedKhs = elapsed > 0 ? (progressCount / elapsed / 1000).toFixed(1) : 0;
              if (options.onProgress) options.onProgress({
                tried: progressCount,
                speedKhs: self.speedKhs,
                elapsedMs: self.elapsedMs,
              });
              return;
            }
            if (payload && payload.error) {
              return;  // 忽略单个 worker 耗尽的报错
            }
            if (payload && (payload.nonce || payload.hash)) {
              solved = true;
              self._killAll();
              self._verify(payload.nonce, options).then(resolve, reject);
            }
          };
          worker.onerror = function () { /* ignore */ };
          worker.postMessage({
            challenge: self.challenge,
            difficulty: self.difficulty,
            nonce: i,              // 起始 batch id（每个 worker 从不同起点开始）
            threads: threads,
            reportInterval: reportInterval,
          });
        }
      });
    },

    async _verify(nonce, options) {
      var self = this;
      var res = await fetch('/api/pow/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          challenge: this.challenge,
          nonce: nonce,
          difficulty: this.difficulty,
        }),
      });
      var data = await res.json();
      if (!data.success) throw new Error(data.error || 'PoW verify 失败');
      this.session = data.session;
      this.running = false;
      if (options && options.onDone) options.onDone({ session: data.session, elapsedMs: this.elapsedMs });
      return data.session;
    },

    cancel() {
      this._killAll();
      this.running = false;
    },

    _killAll() {
      for (var i = 0; i < this._workers.length; i++) {
        try { this._workers[i].terminate(); } catch (e) {}
      }
      this._workers = [];
    },

    /** 便捷：一步到位的 solve。返回 session 字符串。*/
    async solveOnce(ui) {
      ui = ui || {};
      await this.newChallenge();
      return await this.solve({
        threads: ui.threads,
        onProgress: ui.onProgress,
        onDone: ui.onDone,
        onError: ui.onError,
      });
    },
  };
})();

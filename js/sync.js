(function () {
  "use strict";
  var KEY = "gs_sync_v1";
  var API = "https://api.github.com";
  var FILE = "gaoshu-progress.json";
  var MAX_BYTES = 900000;
  var timer = null;
  var running = false;
  var pending = false;
  var cfg = loadConfig();

  function loadConfig() {
    var base = { token: "", gistId: "", lastSyncAt: 0, lastError: "" };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw === "object") Object.assign(base, raw);
    } catch (e) { /* ignore */ }
    return base;
  }
  function saveConfig() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function configured() { return !!(cfg.token && cfg.gistId); }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

  function friendly(status, message, action) {
    if (status === 401) return "令牌无效或已过期，请重新生成 classic token";
    if (status === 403) return "权限不足或请求过于频繁（" + message + "）";
    if (status === 404) {
      return action === "create"
        ? "创建失败：令牌缺少 gist 权限，请确认勾选了 gist"
        : "找不到这个 Gist，可能已被删除或令牌无权访问";
    }
    if (status === 422) return "GitHub 拒绝了本次写入：" + message;
    return message || ("请求失败（HTTP " + status + "）");
  }

  function api(path, options) {
    var opts = options || {};
    var headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + cfg.token
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error(friendly(res.status, (data && data.message) || "", opts.action));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function readRemote() {
    return api("/gists/" + cfg.gistId).then(function (gist) {
      var file = gist && gist.files && gist.files[FILE];
      if (!file) throw new Error("云端 Gist 中没有找到 " + FILE);
      if (file.truncated) throw new Error("云端进度文件过大，暂时无法读取");
      if (typeof file.content !== "string" || !file.content) throw new Error("云端进度文件为空");
      try { return JSON.parse(file.content); }
      catch (e) { throw new Error("云端进度数据已损坏，无法解析"); }
    });
  }

  function writeRemote() {
    var payload = window.Store.exportPayload();
    var content = JSON.stringify(payload);
    if (content.length > MAX_BYTES) throw new Error("进度数据超过 900 KB，无法写入 Gist");
    var files = {};
    files[FILE] = { content: content };
    return api("/gists/" + cfg.gistId, { method: "PATCH", body: { files: files } });
  }

  function notify(kind, message) {
    try {
      window.dispatchEvent(new CustomEvent("sync:status", { detail: { kind: kind, message: message } }));
    } catch (e) { /* ignore */ }
  }

  function createGist(token) {
    var t = String(token || "").trim();
    if (!t) return Promise.reject(new Error("请先填写 GitHub 令牌"));
    if (!window.Store) return Promise.reject(new Error("页面尚未初始化完成，请刷新后重试"));
    cfg.token = t;
    cfg.gistId = "";
    var payload = window.Store.exportPayload();
    var files = {};
    files[FILE] = { content: JSON.stringify(payload) };
    return api("/gists", {
      method: "POST",
      action: "create",
      body: {
        description: "高等数学复习站学习进度（私有）",
        public: false,
        files: files
      }
    }).then(function (gist) {
      cfg.gistId = gist.id;
      cfg.lastSyncAt = Date.now();
      cfg.lastError = "";
      saveConfig();
      window.Store.markClean();
      notify("ok", "云同步已开启");
      return gist;
    });
  }

  function importConfig(text) {
    var raw;
    try { raw = decodeURIComponent(escape(atob(String(text || "").trim()))); }
    catch (e) { return Promise.reject(new Error("配置串格式不正确")); }
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { return Promise.reject(new Error("配置串内容不完整")); }
    if (!data || !data.token || !data.gistId) {
      return Promise.reject(new Error("配置串缺少令牌或 Gist ID"));
    }
    var previous = { token: cfg.token, gistId: cfg.gistId };
    cfg.token = String(data.token);
    cfg.gistId = String(data.gistId);
    return syncNow().catch(function (err) {
      cfg.token = previous.token;
      cfg.gistId = previous.gistId;
      saveConfig();
      throw err;
    });
  }

  function packConfig() {
    var raw = JSON.stringify({ v: 1, token: cfg.token, gistId: cfg.gistId });
    return btoa(unescape(encodeURIComponent(raw)));
  }

  function disconnect() {
    cfg.token = "";
    cfg.gistId = "";
    cfg.lastSyncAt = 0;
    cfg.lastError = "";
    saveConfig();
    if (timer) { clearTimeout(timer); timer = null; }
    notify("off", "云同步已断开");
  }

  function syncNow() {
    if (!configured()) return Promise.reject(new Error("尚未启用云同步"));
    if (running) {
      pending = true;
      return Promise.resolve(false);
    }
    running = true;
    notify("busy", "正在同步");
    return readRemote()
      .then(function (remote) {
        window.Store.mergeRemote(remote);
        return readRemote();
      })
      .then(function (latest) {
        window.Store.mergeRemote(latest);
        return writeRemote();
      })
      .then(function () {
        cfg.lastSyncAt = Date.now();
        cfg.lastError = "";
        saveConfig();
        window.Store.markClean();
        running = false;
        notify("ok", "同步完成");
        if (pending) { pending = false; schedule(); }
        return true;
      })
      .catch(function (err) {
        running = false;
        pending = false;
        cfg.lastError = err && err.message ? err.message : String(err);
        saveConfig();
        notify("error", cfg.lastError);
        throw err;
      });
  }

  function schedule() {
    if (!configured()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      syncNow().catch(function () { /* 错误已记录，等下次触发再试 */ });
    }, 2000);
  }

  function flush() {
    if (!configured()) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (running) { pending = true; return; }
    if (!window.Store || !window.Store.isDirty()) return;
    syncNow().catch(function () { /* 静默失败，下次打开再试 */ });
  }

  function status() {
    return {
      configured: configured(),
      gistId: cfg.gistId,
      lastSyncAt: cfg.lastSyncAt,
      lastError: cfg.lastError,
      busy: running,
      deviceCount: window.Store ? Object.keys(window.Store.state.devices || {}).length : 0
    };
  }

  window.GistSync = {
    isConfigured: configured,
    createGist: createGist,
    importConfig: importConfig,
    packConfig: packConfig,
    disconnect: disconnect,
    syncNow: syncNow,
    schedule: schedule,
    flush: flush,
    status: status
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
  window.addEventListener("load", function () {
    if (configured()) {
      syncNow().catch(function () { /* 离线时静默，保留本地进度 */ });
    }
  });
})();
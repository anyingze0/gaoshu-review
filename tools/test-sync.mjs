import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const Merge = require("../js/merge.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}
function snap(updatedAt, patch) {
  return Merge.normalizeSnapshot(Object.assign({ updatedAt }, patch || {}), updatedAt);
}
function payload(devices, resetAt) {
  return { version: 2, resetAt: resetAt || 0, devices: devices || {} };
}
function aggregate(p) {
  return Merge.aggregate(p.devices, p.resetAt);
}

test("合并幂等：重复合并同一份远端数据结果不变", () => {
  const a = payload({ dev_aaaaaa1: snap(10, { stats: { answered: 3, correct: 2 } }) });
  const b = payload({
    dev_bbbbbb2: snap(20, {
      cards: { c1: { mastered: true, at: 20 } },
      stats: { answered: 5, correct: 4 }
    })
  });
  const once = Merge.merge(a, b);
  const twice = Merge.merge(once, b);
  assert.deepEqual(twice, once);
});

test("两台设备的答题数跨设备相加，不互相覆盖", () => {
  const a = payload({
    dev_aaaaaa1: snap(10, {
      stats: { answered: 3, correct: 2, bySection: { "1.1": { answered: 3, correct: 2 } } }
    })
  });
  const b = payload({
    dev_bbbbbb2: snap(20, {
      stats: { answered: 5, correct: 4, bySection: { "1.1": { answered: 5, correct: 4 } } }
    })
  });
  const result = aggregate(Merge.merge(a, b));
  assert.equal(result.stats.answered, 8);
  assert.equal(result.stats.correct, 6);
  assert.deepEqual(result.stats.bySection["1.1"], { answered: 8, correct: 6 });
});

test("同一设备只保留 updatedAt 最新的一份快照", () => {
  const old = payload({ dev_aaaaaa1: snap(10, { stats: { answered: 3, correct: 2 } }) });
  const newer = payload({ dev_aaaaaa1: snap(30, { stats: { answered: 9, correct: 8 } }) });
  const result = aggregate(Merge.merge(old, newer));
  assert.equal(result.stats.answered, 9);
  assert.equal(result.stats.correct, 8);
});

test("知识卡掌握状态取并集", () => {
  const a = payload({ dev_aaaaaa1: snap(10, { cards: { c1: { mastered: true, at: 10 } } }) });
  const b = payload({ dev_bbbbbb2: snap(20, { cards: { c2: { mastered: true, at: 20 } } }) });
  const result = aggregate(Merge.merge(a, b));
  assert.deepEqual(Object.keys(result.cards).sort(), ["c1", "c2"]);
});

test("错题次数相加，连对与移出状态取最近一次", () => {
  const a = payload({
    dev_aaaaaa1: snap(10, {
      wrong: { q1: { wrong: 1, streak: 0, removed: false, createdAt: 5, lastAt: 100 } }
    })
  });
  const b = payload({
    dev_bbbbbb2: snap(20, {
      wrong: { q1: { wrong: 2, streak: 2, removed: true, createdAt: 6, lastAt: 200 } }
    })
  });
  const result = aggregate(Merge.merge(a, b));
  assert.equal(result.wrong.q1.wrong, 3);
  assert.equal(result.wrong.q1.streak, 2);
  assert.equal(result.wrong.q1.removed, true);
});

test("清空错题本会通过 wrongClearedAt 生效", () => {
  const a = payload({
    dev_aaaaaa1: snap(10, {
      wrong: { q1: { wrong: 1, streak: 0, removed: false, createdAt: 5, lastAt: 100 } }
    })
  });
  const b = payload({
    dev_bbbbbb2: snap(200, { wrong: {}, wrongClearedAt: 200 })
  });
  const result = aggregate(Merge.merge(a, b));
  assert.deepEqual(result.wrong, {});

  const later = payload({
    dev_aaaaaa1: snap(300, {
      wrong: { q1: { wrong: 1, streak: 0, removed: false, createdAt: 250, lastAt: 300 } }
    })
  });
  const after = aggregate(Merge.merge(Merge.merge(a, b), later));
  assert.equal(after.wrong.q1.wrong, 1);
});

test("重置时间会丢弃旧设备快照", () => {
  const old = payload({ dev_aaaaaa1: snap(50, { stats: { answered: 30, correct: 20 } }) });
  const reset = payload({ dev_bbbbbb2: snap(100, {}) }, 100);
  const merged = Merge.merge(old, reset);
  assert.deepEqual(Object.keys(merged.devices), ["dev_bbbbbb2"]);
  const result = aggregate(merged);
  assert.equal(result.stats.answered, 0);
});

test("练习历史去重并按时间倒序保留最近 50 条", () => {
  const a = payload({
    dev_aaaaaa1: snap(10, {
      history: [
        { at: 100, mode: "practice", total: 10, correct: 8 },
        { at: 200, mode: "exam", total: 20, correct: 15 }
      ]
    })
  });
  const b = payload({
    dev_bbbbbb2: snap(20, {
      history: [
        { at: 200, mode: "exam", total: 20, correct: 15 },
        { at: 300, mode: "practice", total: 10, correct: 10 }
      ]
    })
  });
  const result = aggregate(Merge.merge(a, b));
  assert.equal(result.history.length, 3);
  assert.deepEqual(result.history.map((h) => h.at), [300, 200, 100]);
});

test("旧版 v1 数据迁移为当前设备的初始快照", () => {
  const v1 = {
    version: 1,
    cards: { c1: { mastered: true, at: 5 } },
    wrong: { q1: { wrong: 2, streak: 1, removed: false, createdAt: 6, lastAt: 7, mode: "practice" } },
    stats: { answered: 12, correct: 9, bySection: { "1.2": { answered: 4, correct: 3 } } },
    activity: { "2026-10-20": { answered: 4, correct: 3 } },
    history: [{ at: 100, mode: "practice", total: 10, correct: 8 }]
  };
  const migrated = Merge.migrateV1(v1, "dev_legacy01", 999);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.deviceId, "dev_legacy01");
  const result = aggregate(migrated);
  assert.equal(result.stats.answered, 12);
  assert.equal(result.cards.c1.mastered, true);
  assert.equal(result.wrong.q1.wrong, 2);
  assert.equal(result.activity["2026-10-20"].answered, 4);
  assert.equal(result.history[0].correct, 8);
});

test("非法设备 ID 与损坏字段会被安全忽略", () => {
  const dirty = payload({
    "../../evil": snap(10, { stats: { answered: 5 } }),
    dev_ok12345: { updatedAt: "bad", stats: { answered: "9", correct: -3 } }
  });
  const result = aggregate(Merge.merge(dirty, {}));
  assert.equal(result.stats.answered, 0);
  assert.equal(result.stats.correct, 0);
  assert.deepEqual(Object.keys(result.cards), []);
});

function createStoreSandbox(seed) {
  const storage = new Map();
  if (seed) storage.set("gs_review_v1", JSON.stringify(seed));
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    }
  };
  sandbox.window = sandbox;
  sandbox.SITE_DATA = { site: { wrongNeed: 3 } };
  sandbox.dispatchEvent = () => {};
  sandbox.Event = class Event {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("js/merge.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("js/store.js", "utf8"), sandbox);
  return { sandbox, storage };
}

test("Store：答题、掌握、历史与本机快照同步更新", () => {
  const { sandbox } = createStoreSandbox();
  const store = sandbox.Store;
  assert.equal(store.state.stats.answered, 0);
  store.recordAnswer({ id: "q1", section: "1.1" }, false, "practice");
  store.recordAnswer({ id: "q2", section: "1.1" }, true, "practice");
  assert.equal(store.state.stats.answered, 2);
  assert.equal(store.state.stats.correct, 1);
  assert.equal(store.state.wrong.q1.wrong, 1);
  assert.equal(store.state.wrong.q1.streak, 0);
  assert.equal(store.toggleCard("c1"), true);
  assert.equal(store.cardMastered("c1"), true);
  store.addHistory({ mode: "practice", total: 2, correct: 1 });
  assert.equal(store.state.history.length, 1);
  const payload = store.exportPayload();
  const current = payload.devices[store.state.deviceId];
  assert.equal(current.stats.answered, 2);
  assert.equal(current.cards.c1.mastered, true);
});

test("Store：合并远端设备数据后统计相加且保留本地会话", () => {
  const { sandbox } = createStoreSandbox();
  const store = sandbox.Store;
  store.recordAnswer({ id: "q1", section: "1.1" }, true, "practice");
  store.state.session = { mode: "practice", qids: ["q1"], idx: 0, answers: {} };
  store.mergeRemote({
    version: 2,
    resetAt: 0,
    devices: {
      dev_remote01: {
        updatedAt: 500,
        stats: { answered: 5, correct: 3, bySection: { "1.1": { answered: 5, correct: 3 } } },
        cards: { c9: { mastered: true, at: 400 } },
        wrong: {},
        activity: {},
        history: []
      }
    }
  });
  assert.equal(store.state.stats.answered, 6);
  assert.equal(store.state.stats.correct, 4);
  assert.equal(store.state.cards.c9.mastered, true);
  assert.equal(store.state.session.qids[0], "q1");
});

test("Store：移出错题与清空错题本会写进本机快照", () => {
  const { sandbox } = createStoreSandbox();
  const store = sandbox.Store;
  store.recordAnswer({ id: "q1", section: "1.1" }, false, "practice");
  store.recordAnswer({ id: "q2", section: "1.1" }, false, "practice");
  store.removeWrong("q1");
  assert.equal(store.state.wrong.q1.removed, true);
  store.clearWrong();
  assert.equal(Object.keys(store.state.wrong).length, 0);
  const snap = store.exportPayload().devices[store.state.deviceId];
  assert.equal(Object.keys(snap.wrong).length, 0);
  assert.equal(snap.wrongClearedAt > 0, true);
});

test("Store：重置会生成新的 resetAt 并清空聚合数据", () => {
  const { sandbox } = createStoreSandbox();
  const store = sandbox.Store;
  store.recordAnswer({ id: "q1", section: "1.1" }, true, "practice");
  store.toggleCard("c1");
  const before = store.state.resetAt;
  const next = store.reset();
  assert.equal(next.stats.answered, 0);
  assert.equal(Object.keys(next.cards).length, 0);
  assert.equal(next.resetAt > before, true);
  assert.equal(store.exportPayload().devices[store.state.deviceId].stats.answered, 0);
});

function jsonResponse(data, status) {
  const code = status || 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    text: async () => JSON.stringify(data)
  };
}

function createSyncSandbox(handler) {
  const storage = new Map();
  const calls = [];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent,
    escape,
    unescape,
    btoa,
    atob,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    document: { addEventListener: () => {}, visibilityState: "visible" },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return handler(url, options, calls);
    },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = sandbox;
  sandbox.SITE_DATA = { site: { wrongNeed: 3 } };
  sandbox.dispatchEvent = () => {};
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("js/merge.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("js/store.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("js/sync.js", "utf8"), sandbox);
  return { sandbox, storage, calls };
}

test("Sync：创建私有 Gist 并保存配置", async () => {
  const { sandbox, storage, calls } = createSyncSandbox((url, options) => {
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.public, false);
    assert.equal(body.files["gaoshu-progress.json"].content.length > 0, true);
    return jsonResponse({ id: "gist_abc123" }, 201);
  });
  await sandbox.GistSync.createGist("ghp_test_token");
  assert.equal(sandbox.GistSync.isConfigured(), true);
  assert.equal(sandbox.GistSync.status().gistId, "gist_abc123");
  assert.equal(calls.length, 1);
  assert.equal(storage.has("gs_sync_v1"), true);
  const saved = storage.get("gs_sync_v1");
  assert.equal(saved.includes("ghp_test_token"), true);
});

test("Sync：拉取远端、合并统计后再推送", async () => {
  const remote = {
    version: 2,
    resetAt: 0,
    devices: {
      dev_remote01: {
        updatedAt: 500,
        stats: { answered: 2, correct: 2, bySection: { "1.1": { answered: 2, correct: 2 } } },
        cards: {},
        wrong: {},
        activity: {},
        history: []
      }
    }
  };
  let patched = null;
  const { sandbox, calls } = createSyncSandbox((url, options) => {
    if (options.method === "POST") return jsonResponse({ id: "gist_abc123" }, 201);
    if (options.method === "GET") {
      return jsonResponse({ files: { "gaoshu-progress.json": { content: JSON.stringify(remote), truncated: false } } });
    }
    if (options.method === "PATCH") {
      patched = JSON.parse(options.body);
      return jsonResponse({ id: "gist_abc123" });
    }
    throw new Error("unexpected request " + options.method + " " + url);
  });
  await sandbox.GistSync.createGist("ghp_test_token");
  sandbox.Store.recordAnswer({ id: "q1", section: "1.1" }, true, "practice");
  const ok = await sandbox.GistSync.syncNow();
  assert.equal(ok, true);
  assert.equal(sandbox.Store.state.stats.answered, 3);
  assert.equal(sandbox.Store.state.stats.correct, 3);
  assert.equal(calls.filter((c) => c.options.method === "GET").length, 2);
  assert.equal(calls.filter((c) => c.options.method === "PATCH").length, 1);
  const payload = JSON.parse(patched.files["gaoshu-progress.json"].content);
  assert.equal(payload.devices.dev_remote01.stats.answered, 2);
  assert.equal(Object.keys(payload.devices).length, 2);
});

test("Sync：配置串可导出并在另一台设备导入", async () => {
  const remote = {
    version: 2,
    resetAt: 0,
    devices: {
      dev_remote01: {
        updatedAt: 500,
        stats: { answered: 7, correct: 5, bySection: {} },
        cards: {}, wrong: {}, activity: {}, history: []
      }
    }
  };
  const { sandbox } = createSyncSandbox((url, options) => {
    if (options.method === "POST") return jsonResponse({ id: "gist_abc123" }, 201);
    if (options.method === "GET") {
      return jsonResponse({ files: { "gaoshu-progress.json": { content: JSON.stringify(remote), truncated: false } } });
    }
    return jsonResponse({ id: "gist_abc123" });
  });
  await sandbox.GistSync.createGist("ghp_test_token");
  const packed = sandbox.GistSync.packConfig();
  sandbox.GistSync.disconnect();
  assert.equal(sandbox.GistSync.isConfigured(), false);
  await sandbox.GistSync.importConfig(packed);
  assert.equal(sandbox.GistSync.isConfigured(), true);
  assert.equal(sandbox.Store.state.stats.answered, 7);
});

test("Sync：令牌无效时给出可读错误", async () => {
  const { sandbox } = createSyncSandbox(() => jsonResponse({ message: "Bad credentials" }, 401));
  await assert.rejects(
    () => sandbox.GistSync.createGist("ghp_bad_token"),
    (err) => err.message.includes("令牌无效") || err.message.includes("已过期")
  );
  assert.equal(sandbox.GistSync.isConfigured(), false);
});

test("Store：旧版 localStorage 自动迁移为 v2 快照", () => {
  const { sandbox } = createStoreSandbox({
    version: 1,
    cards: { c1: { mastered: true, at: 5 } },
    wrong: { q1: { wrong: 2, streak: 1, removed: false, createdAt: 6, lastAt: 7, mode: "practice" } },
    stats: { answered: 12, correct: 9, bySection: { "1.2": { answered: 4, correct: 3 } } },
    activity: { "2026-10-20": { answered: 4, correct: 3 } },
    history: [{ at: 100, mode: "practice", total: 10, correct: 8 }]
  });
  const store = sandbox.Store;
  assert.equal(store.state.version, 2);
  assert.equal(store.state.stats.answered, 12);
  assert.equal(store.state.stats.correct, 9);
  assert.equal(store.state.cards.c1.mastered, true);
  assert.equal(store.state.wrong.q1.wrong, 2);
  const current = store.state.devices[store.state.deviceId];
  assert.equal(current.stats.answered, 12);
  assert.equal(current.cards.c1.mastered, true);
});

console.log("\n" + passed + " 个测试全部通过");
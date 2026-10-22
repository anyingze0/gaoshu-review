(function () {
  "use strict";
  var KEY = "gs_review_v1";
  var Merge = window.Merge;
  var WRONG_NEED = (window.SITE_DATA && SITE_DATA.site && SITE_DATA.site.wrongNeed) || 3;
  var dirty = false;

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function uid() {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "dev_";
    for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function blankStats() { return { answered: 0, correct: 0, bySection: {} }; }
  function today() {
    var d = new Date();
    var z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    var state = {
      version: 2,
      deviceId: "",
      resetAt: 0,
      devices: {},
      cards: {},
      wrong: {},
      stats: blankStats(),
      activity: {},
      history: [],
      session: null,
      lastResult: null,
      exam: null
    };

    if (raw && raw.version === 2 && raw.devices) {
      state.deviceId = typeof raw.deviceId === "string" ? raw.deviceId : "";
      state.resetAt = num(raw.resetAt);
      Object.keys(raw.devices).forEach(function (id) {
        state.devices[id] = Merge.normalizeSnapshot(raw.devices[id], 0);
      });
      state.session = raw.session || null;
      state.lastResult = raw.lastResult || null;
      state.exam = raw.exam || null;
    } else if (raw) {
      var migrated = Merge.migrateV1(raw, uid(), Date.now());
      state.deviceId = migrated.deviceId;
      state.resetAt = migrated.resetAt;
      state.devices = migrated.devices;
      state.session = raw.session || null;
      state.lastResult = raw.lastResult || null;
      state.exam = raw.exam || null;
    }

    if (!state.deviceId) state.deviceId = uid();
    if (!state.devices[state.deviceId]) state.devices[state.deviceId] = Merge.emptySnapshot(Date.now());
    recompute(state);
    return state;
  }

  function recompute(target) {
    var t = target || state;
    var agg = Merge.aggregate(t.devices, t.resetAt);
    t.cards = agg.cards;
    t.wrong = agg.wrong;
    t.stats = agg.stats;
    t.activity = agg.activity;
    t.history = agg.history;
    return t;
  }

  var state = load();

  function current() {
    var snap = state.devices[state.deviceId];
    if (!snap) snap = state.devices[state.deviceId] = Merge.emptySnapshot(Date.now());
    return snap;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function save() {
    persist();
    if (dirty && window.GistSync && window.GistSync.schedule) window.GistSync.schedule();
  }
  function touch() {
    current().updatedAt = Date.now();
    dirty = true;
    recompute();
    save();
  }

  function cardMastered(id) { return !!(state.cards[id] && state.cards[id].mastered); }
  function toggleCard(id) {
    var snap = current();
    var mastered = !!(snap.cards[id] && snap.cards[id].mastered);
    if (mastered) delete snap.cards[id];
    else snap.cards[id] = { mastered: true, at: Date.now() };
    touch();
    return !mastered;
  }

  function recordAnswer(q, correct, mode) {
    var snap = current();
    var sec = snap.stats.bySection[q.section] || { answered: 0, correct: 0 };
    snap.stats.answered += 1;
    if (correct) snap.stats.correct += 1;
    sec.answered += 1;
    if (correct) sec.correct += 1;
    snap.stats.bySection[q.section] = sec;

    var day = today();
    if (!snap.activity[day]) snap.activity[day] = { answered: 0, correct: 0 };
    snap.activity[day].answered += 1;
    if (correct) snap.activity[day].correct += 1;

    var w = snap.wrong[q.id];
    if (!correct) {
      if (!w) {
        w = snap.wrong[q.id] = {
          wrong: 0, streak: 0, removed: false,
          createdAt: Date.now(), lastAt: 0, mode: mode || "practice"
        };
      }
      w.wrong += 1;
      w.streak = 0;
      w.removed = false;
      w.lastAt = Date.now();
      w.mode = mode || "practice";
    } else if (w) {
      w.streak = (w.streak || 0) + 1;
      w.lastAt = Date.now();
      if (w.streak >= WRONG_NEED) w.removed = true;
    }
    touch();
  }

  function wrongActive(questionMap) {
    return Object.keys(state.wrong)
      .filter(function (id) { return !state.wrong[id].removed; })
      .filter(function (id) { return !questionMap || questionMap[id]; })
      .map(function (id) { return Object.assign({ id: id }, state.wrong[id]); })
      .sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); });
  }

  function addHistory(entry) {
    var snap = current();
    snap.history.unshift({
      at: Date.now(),
      mode: entry.mode,
      total: entry.total,
      correct: entry.correct
    });
    snap.history = snap.history.slice(0, 100);
    touch();
  }

  function removeWrong(id) {
    var snap = current();
    var w = snap.wrong[id];
    if (!w) {
      w = snap.wrong[id] = {
        wrong: 0, streak: 0, removed: false,
        createdAt: 0, lastAt: 0, mode: "practice"
      };
    }
    w.removed = true;
    w.lastAt = Date.now();
    touch();
  }

  function clearWrong() {
    var snap = current();
    snap.wrong = {};
    snap.wrongClearedAt = Date.now();
    touch();
  }

  function reset() {
    var now = Date.now();
    state.resetAt = now;
    state.devices = {};
    state.devices[state.deviceId] = Merge.emptySnapshot(now);
    state.session = null;
    state.lastResult = null;
    state.exam = null;
    recompute();
    dirty = true;
    save();
    return state;
  }

  function exportPayload() {
    return { version: 2, resetAt: state.resetAt, devices: state.devices };
  }

  function mergeRemote(remote) {
    var previousReset = state.resetAt;
    var merged = Merge.merge(
      { version: 2, resetAt: state.resetAt, devices: state.devices },
      remote
    );
    state.resetAt = merged.resetAt;
    state.devices = merged.devices;
    if (!state.devices[state.deviceId]) {
      state.devices[state.deviceId] = Merge.emptySnapshot(Date.now());
    }
    if (state.resetAt > previousReset) {
      state.session = null;
      state.lastResult = null;
      state.exam = null;
    }
    recompute();
    persist();
    try { window.dispatchEvent(new Event("store:sync")); } catch (e) { /* ignore */ }
    return true;
  }

  function markClean() { dirty = false; }
  function isDirty() { return dirty; }
  function setDirty() { dirty = true; }

  window.Store = {
    state: state,
    save: save,
    saveLocal: persist,
    markClean: markClean,
    isDirty: isDirty,
    setDirty: setDirty,
    toggleCard: toggleCard,
    cardMastered: cardMastered,
    recordAnswer: recordAnswer,
    wrongActive: wrongActive,
    addHistory: addHistory,
    removeWrong: removeWrong,
    clearWrong: clearWrong,
    reset: reset,
    exportPayload: exportPayload,
    mergeRemote: mergeRemote,
    deviceId: function () { return state.deviceId; },
    WRONG_NEED: WRONG_NEED,
    today: today
  };
})();
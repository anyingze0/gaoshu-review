(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Merge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA = 2;

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function round(v) { return Math.max(0, Math.round(num(v))); }

  function emptySnapshot(now) {
    return {
      updatedAt: num(now) || Date.now(),
      cards: {},
      wrong: {},
      wrongClearedAt: 0,
      stats: { answered: 0, correct: 0, bySection: {} },
      activity: {},
      history: []
    };
  }

  function normalizeSnapshot(raw, fallbackAt) {
    var s = obj(raw);
    var out = emptySnapshot(num(s.updatedAt) || fallbackAt || 0);
    out.wrongClearedAt = num(s.wrongClearedAt);

    var cards = obj(s.cards);
    Object.keys(cards).forEach(function (id) {
      var c = obj(cards[id]);
      if (c.mastered) out.cards[id] = { mastered: true, at: num(c.at) };
    });

    var wrong = obj(s.wrong);
    Object.keys(wrong).forEach(function (id) {
      var w = obj(wrong[id]);
      out.wrong[id] = {
        wrong: round(w.wrong),
        streak: round(w.streak),
        removed: !!w.removed,
        createdAt: num(w.createdAt),
        lastAt: num(w.lastAt) || num(w.createdAt),
        mode: typeof w.mode === "string" ? w.mode : "practice"
      };
    });

    var st = obj(s.stats);
    out.stats.answered = round(st.answered);
    out.stats.correct = round(st.correct);
    var bs = obj(st.bySection);
    Object.keys(bs).forEach(function (k) {
      var x = obj(bs[k]);
      out.stats.bySection[k] = { answered: round(x.answered), correct: round(x.correct) };
    });

    var act = obj(s.activity);
    Object.keys(act).forEach(function (k) {
      var x = obj(act[k]);
      out.activity[k] = { answered: round(x.answered), correct: round(x.correct) };
    });

    out.history = arr(s.history).map(function (h) {
      var x = obj(h);
      return {
        at: num(x.at),
        mode: typeof x.mode === "string" ? x.mode : "practice",
        total: num(x.total),
        correct: num(x.correct)
      };
    }).filter(function (h) { return h.at > 0; }).slice(0, 100);

    return out;
  }

  function normalizePayload(raw) {
    var p = obj(raw);
    var src = obj(p.devices);
    var devices = {};
    Object.keys(src).forEach(function (id) {
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return;
      devices[id] = normalizeSnapshot(src[id], 0);
    });
    return { version: SCHEMA, resetAt: num(p.resetAt), devices: devices };
  }

  function merge(local, remote) {
    var a = normalizePayload(local);
    var b = normalizePayload(remote);
    var resetAt = Math.max(a.resetAt, b.resetAt);
    var devices = {};

    function take(source) {
      Object.keys(source.devices).forEach(function (id) {
        var snap = source.devices[id];
        if (snap.updatedAt < resetAt) return;
        var current = devices[id];
        if (!current || snap.updatedAt > current.updatedAt) devices[id] = snap;
      });
    }

    take(a);
    take(b);
    return { version: SCHEMA, resetAt: resetAt, devices: devices };
  }

  function aggregate(devices, resetAt) {
    var list = obj(devices);
    var limit = num(resetAt);
    var cards = {};
    var wrong = {};
    var stats = { answered: 0, correct: 0, bySection: {} };
    var activity = {};
    var history = [];
    var clearedAt = 0;

    Object.keys(list).forEach(function (id) {
      clearedAt = Math.max(clearedAt, num(list[id].wrongClearedAt));
    });

    Object.keys(list).forEach(function (id) {
      var snap = list[id];
      if (!snap || num(snap.updatedAt) < limit) return;

      var snapCards = obj(snap.cards);
      Object.keys(snapCards).forEach(function (cid) {
        var at = num(snapCards[cid].at);
        if (!cards[cid] || at >= cards[cid].at) cards[cid] = { mastered: true, at: at };
      });

      var st = obj(snap.stats);
      stats.answered += round(st.answered);
      stats.correct += round(st.correct);
      var bs = obj(st.bySection);
      Object.keys(bs).forEach(function (k) {
        var target = stats.bySection[k] || (stats.bySection[k] = { answered: 0, correct: 0 });
        target.answered += round(bs[k].answered);
        target.correct += round(bs[k].correct);
      });

      var act = obj(snap.activity);
      Object.keys(act).forEach(function (day) {
        var target = activity[day] || (activity[day] = { answered: 0, correct: 0 });
        target.answered += round(act[day].answered);
        target.correct += round(act[day].correct);
      });

      var snapWrong = obj(snap.wrong);
      Object.keys(snapWrong).forEach(function (qid) {
        var w = snapWrong[qid];
        var lastAt = num(w.lastAt) || num(w.createdAt);
        if (lastAt <= clearedAt) return;
        var item = wrong[qid];
        if (!item) {
          item = wrong[qid] = {
            wrong: 0, streak: 0, removed: false,
            createdAt: num(w.createdAt), lastAt: 0, mode: w.mode || "practice"
          };
        }
        item.wrong += round(w.wrong);
        if (lastAt >= item.lastAt) {
          item.streak = round(w.streak);
          item.removed = !!w.removed;
          item.mode = w.mode || item.mode;
          item.lastAt = lastAt;
          if (num(w.createdAt)) item.createdAt = num(w.createdAt);
        }
      });

      arr(snap.history).forEach(function (h) { history.push(h); });
    });

    var seen = {};
    history = history.filter(function (h) {
      var key = h.at + "|" + h.mode + "|" + h.total + "|" + h.correct;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) { return b.at - a.at; }).slice(0, 50);

    return { cards: cards, wrong: wrong, stats: stats, activity: activity, history: history };
  }

  function migrateV1(raw, deviceId, now) {
    var snap = normalizeSnapshot(raw, now);
    snap.updatedAt = num(now) || Date.now();
    var devices = {};
    devices[deviceId] = snap;
    return { version: SCHEMA, deviceId: deviceId, resetAt: 0, devices: devices };
  }

  return {
    SCHEMA: SCHEMA,
    emptySnapshot: emptySnapshot,
    normalizeSnapshot: normalizeSnapshot,
    normalizePayload: normalizePayload,
    merge: merge,
    aggregate: aggregate,
    migrateV1: migrateV1
  };
});

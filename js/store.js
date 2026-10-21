(function () {
  "use strict";
  var KEY = "gs_review_v1";
  var WRONG_NEED = (window.SITE_DATA && SITE_DATA.site && SITE_DATA.site.wrongNeed) || 3;
  var DEFAULT = {
    version: 1,
    cards: {},
    wrong: {},
    stats: { answered: 0, correct: 0, bySection: {} },
    activity: {},
    history: [],
    session: null,
    lastResult: null,
    exam: null
  };
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function today() {
    var d = new Date();
    var z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  var state = clone(DEFAULT);
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      state = Object.assign(state, saved);
      state.stats = Object.assign({ answered: 0, correct: 0, bySection: {} }, saved.stats || {});
      state.activity = saved.activity || {};
      state.cards = saved.cards || {};
      state.wrong = saved.wrong || {};
      state.history = saved.history || [];
    }
  } catch (e) { /* localStorage 不可用时使用内存状态 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function cardMastered(id) { return !!(state.cards[id] && state.cards[id].mastered); }
  function toggleCard(id) {
    var current = cardMastered(id);
    if (current) delete state.cards[id];
    else state.cards[id] = { mastered: true, at: Date.now() };
    save();
    return !current;
  }
  function recordAnswer(q, correct, mode) {
    state.stats.answered += 1;
    if (correct) state.stats.correct += 1;
    var sec = state.stats.bySection[q.section] || { answered: 0, correct: 0 };
    sec.answered += 1;
    if (correct) sec.correct += 1;
    state.stats.bySection[q.section] = sec;
    var day = today();
    if (!state.activity[day]) state.activity[day] = { answered: 0, correct: 0 };
    state.activity[day].answered += 1;
    if (correct) state.activity[day].correct += 1;
    var w = state.wrong[q.id];
    if (!correct) {
      if (!w) w = state.wrong[q.id] = { wrong: 0, streak: 0, removed: false, createdAt: Date.now() };
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
    save();
  }
  function wrongActive(questionMap) {
    return Object.keys(state.wrong)
      .filter(function (id) { return !state.wrong[id].removed; })
      .filter(function (id) { return !questionMap || questionMap[id]; })
      .map(function (id) { return Object.assign({ id: id }, state.wrong[id]); })
      .sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); });
  }
  function addHistory(entry) {
    state.history.unshift(Object.assign({ at: Date.now() }, entry));
    state.history = state.history.slice(0, 50);
    save();
  }
  function reset() {
    state = clone(DEFAULT);
    save();
    window.Store.state = state;
    return state;
  }
  window.Store = {
    state: state,
    save: save,
    toggleCard: toggleCard,
    cardMastered: cardMastered,
    recordAnswer: recordAnswer,
    wrongActive: wrongActive,
    addHistory: addHistory,
    reset: reset,
    WRONG_NEED: WRONG_NEED,
    today: today
  };
})();

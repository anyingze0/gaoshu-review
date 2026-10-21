(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function formatText(s) {
    var out = esc(s || "");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\n/g, "<br>");
    return out;
  }
  function renderMath(el) {
    if (!window.renderMathInElement || !el) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false,
        strict: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option", "input"],
        ignoredClasses: ["no-math"]
      });
    } catch (e) { /* 单个公式失败不应阻塞页面 */ }
  }
  var PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/>',
    quiz: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
    wrong: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
    formula: '<path d="M4 4h16"/><path d="M9 4 5 20"/><path d="M15 4l-4 16"/><path d="M4 20h16"/>',
    stats: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    library: '<path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    x: '<path d="m5 5 14 14"/><path d="M19 5 5 19"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m10 7-5 5 5 5"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.5 8a7 7 0 0 1 11-1l2 4"/><path d="M17.5 16a7 7 0 0 1-11 1l-2-4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'
  };
  function icon(name, cls) {
    var p = PATHS[name] || PATHS.spark;
    return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>";
  }
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function statusBadge(status) {
    if (status === "ready") return '<span class="badge badge-green">已整理</span>';
    if (status === "pending") return '<span class="badge badge-amber">待整理</span>';
    if (status === "review") return '<span class="badge badge-red">待复核</span>';
    if (status === "missing") return '<span class="badge badge-red">课件缺失</span>';
    return '<span class="badge">' + esc(status) + "</span>";
  }
  function typeLabel(type) {
    return ({ single: "单选题", multi: "多选题", judge: "判断题", fill: "填空题" })[type] || type;
  }
  function answerText(q) {
    if (q.type === "fill") return (q.answer || []).map(function (group) { return group[0]; }).join("；");
    var map = {};
    (q.options || []).forEach(function (o) { map[o[0]] = o[1]; });
    return (q.answer || []).map(function (a) { return a + ". " + (map[a] || ""); }).join("；");
  }
  window.UI = { esc: esc, formatText: formatText, renderMath: renderMath, icon: icon, toast: toast, fmtDate: fmtDate, pct: pct, statusBadge: statusBadge, typeLabel: typeLabel, answerText: answerText };
})();
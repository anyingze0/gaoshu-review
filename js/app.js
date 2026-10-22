(function () {
  "use strict";
  var D = window.SITE_DATA;
  var app = document.getElementById("app");
  var modalRoot = document.getElementById("modal-root");
  if (!D) {
    app.innerHTML = '<div class="empty"><div class="big">!</div><h2>数据未生成</h2><p>请先运行 <code>node tools/build.mjs</code>，再刷新页面。</p></div>';
    return;
  }
  var S = window.Store.state;
  var cards = D.cards, questions = D.questions, formulas = D.formulas, decks = D.decks, chapters = D.chapters;
  var cardMap = {}, qMap = {}, deckMap = {}, chapterMap = {};
  cards.forEach(function (c) { cardMap[c.id] = c; });
  questions.forEach(function (q) { qMap[q.id] = q; });
  decks.forEach(function (d) { deckMap[d.id] = d; });
  chapters.forEach(function (c) { chapterMap[c.number] = c; });
  var COLORS = { blue: "#1d4e89", teal: "#0f766e", violet: "#6d28d9", amber: "#a16207", rose: "#be123c", green: "#15803d" };
  var examTimer = null;
  var saveTimer = null;
  var lastPath = "";
  var currentQuery = "";
  var pendingFormulaQuery = "";

  function esc(s) { return UI.esc(s); }
  function ft(s) { return UI.formatText(s); }
  function pct(a, b) { return UI.pct(a, b); }
  function chapterColor(ch) { return COLORS[(chapterMap[ch] || {}).color] || COLORS.blue; }
  function chapterName(ch) { var c = chapterMap[ch]; return c ? c.label + " " + c.title : "第" + ch + "章"; }
  function deckCards(id) { return cards.filter(function (c) { return c.deckId === id; }); }
  function deckQuestions(id) { return questions.filter(function (q) { return q.deckId === id; }); }
  function masteredCount(list) { return list.filter(function (c) { return Store.cardMastered(c.id); }).length; }
  function deckProgress(deck) {
    var cs = deckCards(deck.id);
    if (!cs.length) return 0;
    return pct(masteredCount(cs), cs.length);
  }
  function chapterDecks(ch) { return decks.filter(function (d) { return d.chapter === ch; }).sort(function (a, b) { return a.order - b.order; }); }
  function chapterCards(ch) { return cards.filter(function (c) { return c.chapter === ch; }); }
  function navClass(active, key) { return "nav-link" + (active === key ? " active" : ""); }
  function pdfLink(deck, page, label) {
    if (!deck || deck.status === "missing") return '<span class="small muted">课件缺失</span>';
    return '<a class="small" style="color:var(--primary)" target="_blank" href="' + esc(deck.file) + "#page=" + (page || 1) + '">' + esc(label || "打开课件") + " ↗</a>";
  }
  function sourceLine(q) {
    var d = deckMap[q.deckId];
    return '<div class="src muted">出处：' + esc(d ? d.section + " " + d.title : "") + " · p." + q.page + " · " + pdfLink(d, q.page, "查看课件") + "</div>";
  }
  function days(n) {
    var out = [], d = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      var z = function (v) { return String(v).padStart(2, "0"); };
      out.push({ key: x.getFullYear() + "-" + z(x.getMonth() + 1) + "-" + z(x.getDate()), label: (x.getMonth() + 1) + "/" + x.getDate() });
    }
    return out;
  }
  function activityHtml() {
    var list = days(7);
    var max = 1;
    list.forEach(function (d) { max = Math.max(max, (S.activity[d.key] || {}).answered || 0); });
    return '<div class="activity">' + list.map(function (d) {
      var v = (S.activity[d.key] || {}).answered || 0;
      var h = Math.max(3, Math.round(v / max * 62));
      return '<div class="bar"><i style="height:' + h + 'px" title="' + v + ' 题"></i><em>' + d.label + "</em></div>";
    }).join("") + "</div>";
  }
  function nextCard() {
    var sorted = cards.slice().sort(function (a, b) { return (a.chapter - b.chapter) || (a.page - b.page); });
    return sorted.filter(function (c) { return !Store.cardMastered(c.id); })[0] || sorted[0];
  }
  function navigate(path) {
    if (location.hash === path) render();
    else location.hash = path;
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/home";
    return { path: h, parts: h.split("/").filter(Boolean) };
  }
  function shell(content, active, title) {
    var nav = [
      ["home", "#/home", "首页", "home"], ["chapters", "#/chapters", "章节复习", "book"],
      ["quiz", "#/quiz", "刷题练习", "quiz"], ["wrong", "#/wrong", "错题本", "wrong"],
      ["formulas", "#/formulas", "公式速查", "formula"], ["stats", "#/stats", "学习统计", "stats"],
      ["library", "#/library", "课件库", "library"], ["sync", "#/sync", "云同步", "refresh"]
    ];
    return '<div class="app-shell"><aside class="sidebar">' +
      '<div class="brand"><div class="brand-mark">∫</div><div><div class="brand-title">' + esc(D.site.title) + '</div><div class="brand-sub">CALCULUS REVIEW</div></div></div>' +
      '<div class="nav-label">复习</div>' +
      nav.map(function (n) { return '<a class="' + navClass(active, n[0]) + '" href="' + n[1] + '">' + UI.icon(n[3]) + "<span>" + n[2] + "</span></a>"; }).join("") +
      '<div class="sidebar-foot">' + esc(D.site.subtitle) + "<br>数据版本 " + UI.fmtDate(D.version) + "</div></aside>" +
      '<main class="main"><header class="topbar"><div class="topbar-title">' + esc(title) + '</div><button class="search-trigger" data-action="open-search">' + UI.icon("search") + '<span>搜索知识卡、公式</span><span class="kbd">Ctrl K</span></button></header>' +
      '<div class="view">' + content + '</div><div class="footer">本地复习站 · ' + decks.length + " 份课件 · " + cards.length + " 张知识卡 · " + questions.length + " 道题 · " + formulas.length + " 条公式</div></main>" +
      '<nav class="bottom-nav">' + [["home", "#/home", "首页", "home"], ["chapters", "#/chapters", "复习", "book"], ["quiz", "#/quiz", "刷题", "quiz"], ["wrong", "#/wrong", "错题", "wrong"], ["more", "#/more", "更多", "spark"]].map(function (n) {
        var key = active === "sync" ? "more" : active;
        return '<a class="' + (key === n[0] ? "active" : "") + '" href="' + n[1] + '">' + UI.icon(n[3]) + "<span>" + n[2] + "</span></a>";
      }).join("") + "</nav></div>";
  }

  function homeView() {
    var nc = nextCard();
    var examN = (D.site && D.site.examCount) || 20;
    var examMin = (D.site && D.site.examMinutes) || 30;
    var mastered = masteredCount(cards);
    var acc = pct(S.stats.correct, S.stats.answered);
    var wrongs = Store.wrongActive(qMap);
    var pending = decks.filter(function (d) { return d.status === "pending"; });
    var hero = '<section class="hero"><div class="hero-content"><div><div class="eyebrow" style="color:#a9c6e0">GAOSHU · REVIEW</div>' +
      "<h1>把每一章<br>复习成一张网</h1><p>按课件顺序整理知识卡，配合即时批改、错题连对移出与限时测验，把每一节真正过一遍。</p>" +
      '<div class="hero-actions"><a class="btn btn-primary" href="' + (nc ? "#/card/" + nc.id : "#/chapters") + '">' + UI.icon("play") + (mastered === cards.length ? "从头再复习" : "继续复习") + '</a><button class="btn btn-ghost" data-action="quick-quiz" data-count="10">' + UI.icon("quiz") + "随机 10 题</button></div>" +
      '<div class="hero-stats"><div class="hero-stat"><strong>' + mastered + "/" + cards.length + "</strong><span>知识卡已掌握</span></div><div class=\"hero-stat\"><strong>" + acc + "%</strong><span>累计正确率</span></div><div class=\"hero-stat\"><strong>" + wrongs.length + "</strong><span>待攻克错题</span></div></div></div>" +
      '<div class="hero-art"><svg viewBox="0 0 260 180" fill="none"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9dc7ec"/><stop offset="1" stop-color="#ffffff" stop-opacity=".35"/></linearGradient></defs><path d="M20 150H245M35 20V160" stroke="#8fb6d6" stroke-width="1.5"/><path d="M35 145C70 145 82 70 118 70s52 68 92 68" stroke="url(#g1)" stroke-width="3"/><path d="M60 145 150 55" stroke="#e4c766" stroke-width="1.6" stroke-dasharray="5 5"/><circle cx="118" cy="70" r="4" fill="#e4c766"/><text x="128" y="62" fill="#dceaf6" font-size="11">切线</text><text x="150" y="120" fill="#b9d4ea" font-size="11">y=f(x)</text></svg></div></div></section>';
    var quick = '<div class="quick-grid">' +
      [["#/chapters", "book", "章节复习", cards.length + " 张知识卡"], ["#/quiz", "quiz", "刷题练习", questions.length + " 道题"], ["#/wrong", "wrong", "错题本", wrongs.length + " 道待攻克"], ["#/formulas", "formula", "公式速查", formulas.length + " 条公式"]].map(function (x) {
        return '<a class="quick" href="' + x[0] + '"><span class="quick-icon">' + UI.icon(x[1]) + "</span><span><strong>" + x[2] + "</strong><span>" + x[3] + "</span></span></a>";
      }).join("") + "</div>";
    var chs = '<div class="chapter-grid">' + chapters.map(function (ch) {
      var ds = chapterDecks(ch.number), cs = chapterCards(ch.number);
      var mp = pct(masteredCount(cs), cs.length);
      return '<article class="chapter-card card" style="--chapter-color:' + chapterColor(ch.number) + '"><div class="chapter-head"><div><div class="chapter-label">' + esc(ch.label) + "</div><h3>" + esc(ch.title) + '</h3></div><span class="badge badge-blue">' + ds.length + " 节</span></div>" +
        '<div class="chapter-meta"><span>' + cs.length + " 张知识卡</span><span>" + ds.reduce(function (n, d) { return n + d.questionCount; }, 0) + " 道题</span><span>掌握 " + mp + "%</span></div>" +
        '<div class="chapter-sections">' + ds.map(function (d) { return '<a class="section-chip" href="#/deck/' + d.id + '">' + esc(d.section) + "</a>"; }).join("") + "</div>" +
        '<div class="chapter-progress"><div class="progress" style="flex:1"><i style="width:' + mp + '%"></i></div><span>' + masteredCount(cs) + "/" + cs.length + '</span></div><div style="margin-top:16px"><a class="btn btn-soft btn-sm" href="#/chapter/' + ch.number + '">进入本章 ' + UI.icon("arrowRight") + "</a></div></article>";
    }).join("") + "</div>";
    var split = '<div class="home-split"><div class="card card-pad"><div class="section-title" style="margin-top:0">学习概览</div>' +
      '<div class="mini-stat"><span>累计答题</span><strong>' + S.stats.answered + " 题</strong></div>" +
      '<div class="mini-stat"><span>累计正确</span><strong>' + S.stats.correct + " 题</strong></div>" +
      '<div class="mini-stat"><span>错题本待攻克</span><strong>' + wrongs.length + " 题</strong></div>" +
      '<div class="mini-stat"><span>最近一次练习</span><strong>' + (S.history[0] ? S.history[0].correct + "/" + S.history[0].total : "还没有记录") + "</strong></div>" +
      '<div style="margin-top:14px"><a class="btn btn-ghost btn-sm" href="#/stats">查看完整统计 ' + UI.icon("arrowRight") + "</a></div></div>" +
      '<div class="card card-pad"><div class="section-title" style="margin-top:0">最近 7 天</div>' + activityHtml() + '<div class="small muted" style="text-align:center;margin-top:8px">每天答题数</div></div></div>';
    var notice = pending.length ? '<div class="notice" style="margin-top:18px">' + UI.icon("library") + '<div><strong>有 ' + pending.length + ' 份新课件待整理</strong><div class="small">课件已进入课件库，知识卡与题目还需要按规范补齐。 <a href="#/library" style="color:inherit;text-decoration:underline">查看课件库</a></div></div></div>' : "";
    var extras = '<div class="card card-pad" style="margin-top:14px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><strong>准备好就测一次</strong><div class="small muted" style="margin-top:3px">综合测验 ' + examN + " 题 / " + examMin + ' 分钟，按章节比例抽题，交卷后逐题解析，错题自动入库。</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (wrongs.length ? '<button class="btn btn-soft" data-action="retry-all-wrong">' + UI.icon("refresh") + "错题重练（" + wrongs.length + "）</button>" : "") +
      '<a class="btn btn-primary" href="#/exam">' + UI.icon("clock") + "综合测验</a></div></div>";
    return hero + quick + extras + '<div class="section-title">章节导航 <span class="count">按课件顺序</span></div>' + chs + split + notice;
  }  function chaptersView() {
    return '<div class="page-head"><div><div class="eyebrow">SYLLABUS</div><h1 class="page-title">章节复习</h1><p class="page-sub">每节先看知识卡与例题，再进入本节练习。新收录的课件会显示“待整理”。</p></div></div>' +
      chapters.map(function (ch) {
        var ds = chapterDecks(ch.number), cs = chapterCards(ch.number);
        return '<section style="margin-bottom:30px"><div class="section-title" style="margin-top:0"><span style="width:9px;height:9px;border-radius:50%;background:' + chapterColor(ch.number) + '"></span>' + esc(ch.label) + " " + esc(ch.title) + ' <span class="count">' + ds.length + " 节 · " + cs.length + " 张卡</span></div>" +
          '<div class="deck-list">' + ds.map(function (d) {
            var dc = deckCards(d.id), mp = deckProgress(d);
            return '<a class="deck-row" href="#/deck/' + d.id + '"><span class="deck-num">' + esc(d.section) + '</span><span class="deck-main"><h4>' + esc(d.title) + " " + UI.statusBadge(d.status) + '</h4><p>' + d.pages + " 页 · " + dc.length + " 张知识卡 · " + d.questionCount + " 道题</p></span><span class=\"deck-side\"><span class=\"deck-progress\"><span class=\"small\"><span>掌握</span><span>" + mp + '%</span></span><span class="progress"><i style="width:' + mp + '%"></i></span></span>' + UI.icon("arrowRight") + "</span></a>";
          }).join("") + "</div></section>";
      }).join("");
  }
  function chapterView(num) {
    var ch = chapterMap[num];
    if (!ch) return notFound("章节不存在");
    var ds = chapterDecks(num), cs = chapterCards(num);
    var mp = pct(masteredCount(cs), cs.length);
    return '<div class="breadcrumb"><a href="#/chapters">章节复习</a> / <span>' + esc(ch.label) + "</span></div>" +
      '<div class="page-head"><div><div class="eyebrow">' + esc(ch.label) + '</div><h1 class="page-title">' + esc(ch.title) + '</h1><p class="page-sub">' + ds.length + " 节 · " + cs.length + " 张知识卡 · 已掌握 " + masteredCount(cs) + " 张</p></div></div>" +
      '<div class="card card-pad" style="margin-bottom:18px"><div class="chapter-progress"><div class="progress" style="flex:1"><i style="width:' + mp + '%"></i></div><span>' + mp + '%</span></div></div>' +
      '<div class="deck-list">' + ds.map(function (d) {
        var dc = deckCards(d.id), dp = deckProgress(d);
        return '<div class="deck-row"><a class="deck-num" href="#/deck/' + d.id + '">' + esc(d.section) + '</a><div class="deck-main"><h4><a href="#/deck/' + d.id + '">' + esc(d.title) + "</a> " + UI.statusBadge(d.status) + '</h4><p>' + d.pages + " 页 · " + dc.length + " 张卡 · " + d.questionCount + ' 道题</p></div><div class="deck-side"><div class="deck-progress"><div class="small"><span>掌握</span><span>' + dp + '%</span></div><div class="progress"><i style="width:' + dp + '%"></i></div></div>' + (d.questionCount ? '<button class="btn btn-soft btn-sm" data-action="start-section" data-deck="' + d.id + '">练本节</button>' : "") + "</div></div>";
      }).join("") + "</div>";
  }
  function deckView(id) {
    var d = deckMap[id];
    if (!d) return notFound("课件不存在");
    var cs = deckCards(id).slice().sort(function (a, b) { return a.page - b.page; });
    var mp = deckProgress(d);
    var banners = "";
    if (d.status === "review") banners += '<div class="banner banner-amber">' + UI.icon("wrong") + "<div><strong>这份课件已更新，内容待复核。</strong><br>知识卡和题目仍可复习，但页码与表述可能对应旧版。建议对照新课件检查后再使用。</div></div>";
    if (d.status === "missing") banners += '<div class="banner banner-red">' + UI.icon("wrong") + "<div><strong>课件文件缺失。</strong><br>知识卡和题目仍保留，但无法打开原课件。把文件放回 courseware/inbox 后运行更新网站.cmd 即可恢复。</div></div>";
    if (d.status === "pending") banners += '<div class="banner banner-blue">' + UI.icon("library") + "<div><strong>课件已收录，内容待整理。</strong><br>请让 Codex 阅读这份 PDF，按 content/README.md 生成知识卡与题目，然后运行 <code>更新网站.cmd</code>。</div></div>";
    return '<div class="breadcrumb"><a href="#/chapters">章节复习</a> / <a href="#/chapter/' + d.chapter + '">' + esc(chapterName(d.chapter)) + "</a> / <span>" + esc(d.section) + "</span></div>" +
      '<div class="page-head"><div><div class="eyebrow">SECTION ' + esc(d.section) + '</div><h1 class="page-title">' + esc(d.title) + " " + UI.statusBadge(d.status) + '</h1><p class="page-sub">' + d.pages + " 页 · " + cs.length + " 张知识卡 · " + d.questionCount + ' 道题 · 已掌握 ' + masteredCount(cs) + ' 张</p></div><div style="display:flex;gap:9px;flex-wrap:wrap">' +
      (d.questionCount ? '<button class="btn btn-primary" data-action="start-section" data-deck="' + d.id + '">' + UI.icon("quiz") + "练本节</button>" : "") + '<a class="btn btn-ghost" href="' + esc(d.file) + '#page=1" target="_blank">' + UI.icon("external") + "打开课件</a></div></div>" +
      banners + '<div class="card card-pad" style="margin-bottom:18px"><div class="chapter-progress"><div class="progress" style="flex:1"><i style="width:' + mp + '%"></i></div><span>' + mp + "%</span></div></div>" +
      (cs.length ? '<div class="card-list">' + cs.map(function (c, i) {
        return '<a class="knowledge-row" href="#/card/' + c.id + '"><span class="idx">' + String(i + 1).padStart(2, "0") + '</span><span class="body"><h4>' + esc(c.title) + '</h4><span class="tags">' + (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + '</span></span><span class="master-dot ' + (Store.cardMastered(c.id) ? "on" : "") + '">' + UI.icon("check") + "</span></a>";
      }).join("") + "</div>" : '<div class="card empty"><div class="big">' + UI.icon("book") + '</div><h3>这一节还没有知识卡</h3><p>课件已经收录，内容整理后会出现在这里。</p><p style="margin-top:10px">' + pdfLink(d, 1, "先打开原课件") + "</p></div>");
  }
  function cardView(id) {
    var c = cardMap[id];
    if (!c) return notFound("知识卡不存在");
    var d = deckMap[c.deckId];
    var sorted = cards.slice().sort(function (a, b) { return (a.chapter - b.chapter) || (a.order || a.page) - (b.order || b.page); });
    var idx = sorted.findIndex(function (x) { return x.id === id; });
    var prev = sorted[idx - 1], next = sorted[idx + 1];
    var related = questions.filter(function (q) { return q.kp === c.id; });
    var mastery = Store.cardMastered(c.id);
    return '<div class="card-detail"><div class="breadcrumb"><a href="#/chapters">章节复习</a> / <a href="#/chapter/' + c.chapter + '">' + esc(chapterName(c.chapter)) + '</a> / <a href="#/deck/' + c.deckId + '">' + esc(c.section) + " " + esc(c.deckTitle) + "</a> / <span>" + esc(c.title) + "</span></div>" +
      '<div class="detail-head"><div><div class="eyebrow">KNOWLEDGE CARD</div><h1>' + esc(c.title) + '</h1><div class="tags" style="margin-top:9px">' + (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div>" +
      '<button class="btn ' + (mastery ? "btn-soft" : "btn-primary") + '" data-action="toggle-card" data-id="' + c.id + '">' + UI.icon(mastery ? "check" : "spark") + (mastery ? "已掌握" : "标记已掌握") + "</button></div>" +
      '<div class="detail-body">' +
      '<section class="card card-pad"><div class="section-title" style="margin-top:0">核心内容</div><div class="prose">' + ft(c.summary) + "</div></section>" +
      ((c.formulas || []).length ? '<section class="card card-pad"><div class="section-title" style="margin-top:0">关键公式</div><div class="grid" style="gap:10px">' + c.formulas.map(function (f) { return '<div class="formula-block"><div class="label">' + esc(f.label || "公式") + '</div><div class="math">$$' + esc(f.tex) + "$$</div></div>"; }).join("") + "</div></section>" : "") +
      (c.example ? '<section class="example"><div class="section-title" style="margin-top:0">典型例题</div><div class="q">' + ft(c.example.stem) + '</div><details class="solution"><summary>查看解答</summary><div class="sol">' + ft(c.example.solution) + "</div></details></section>" : "") +
      ((c.pitfalls || []).length ? '<section class="card card-pad"><div class="section-title" style="margin-top:0">易错提醒</div>' + c.pitfalls.map(function (p) { return '<div class="pitfall" style="margin-bottom:8px"><span class="mark">!</span><span>' + ft(p) + "</span></div>"; }).join("") + "</section>" : "") +
      '<section class="card card-pad"><div class="section-title" style="margin-top:0">课件出处</div><div class="small muted">' + esc(d ? d.section + " " + d.title : "") + " · 第 " + c.page + " 页</div><div style=\"margin-top:9px\">" + pdfLink(d, c.page, "在课件中查看这一页") + "</div></section>" +
      '<div class="detail-actions"><button class="btn btn-primary" data-action="start-kp" data-kp="' + c.id + '">' + UI.icon("quiz") + "练相关题（" + related.length + '）</button><a class="btn btn-ghost" href="#/deck/' + c.deckId + '">' + UI.icon("book") + '回到本节</a></div></div>' +
      '<div class="pager">' + (prev ? '<a href="#/card/' + prev.id + '">' + UI.icon("arrowLeft") + "<span>上一张</span><strong>" + esc(prev.title) + "</strong></a>" : "<span></span>") + (next ? '<a href="#/card/' + next.id + '" style="text-align:right">' + UI.icon("arrowRight") + "<span>下一张</span><strong>" + esc(next.title) + "</strong></a>" : "<span></span>") + "</div></div>";
  }  function quizSetupView() {
    var opts = '<option value="all">全部章节（' + questions.length + ' 题）</option>' + chapters.map(function (ch) {
      var qn = questions.filter(function (q) { return q.chapter === ch.number; }).length;
      return '<optgroup label="' + esc(ch.label + " " + ch.title) + '"><option value="chapter:' + ch.number + '">整章（' + qn + ' 题）</option>' + chapterDecks(ch.number).map(function (d) {
        return '<option value="deck:' + d.id + '">' + esc(d.section + " " + d.title) + "（" + d.questionCount + " 题）</option>";
      }).join("") + "</optgroup>";
    }).join("");
    return '<div class="quiz-wrap"><div class="page-head"><div><div class="eyebrow">PRACTICE</div><h1 class="page-title">刷题练习</h1><p class="page-sub">选择范围、题量和题型。单选题与判断题点击即判，多选题与填空题提交后判。</p></div></div>' +
      '<div class="card setup-card"><div class="setup-block"><h4>练习范围</h4><select id="quiz-scope" class="scope-select">' + opts + "</select></div>" +
      '<div class="setup-block"><h4>本次题量</h4><div class="chip-row" id="quiz-count">' + [10, 20, 30].map(function (n, i) { return '<button class="chip' + (i === 0 ? " on" : "") + '" data-count="' + n + '">' + n + " 题</button>"; }).join("") + '</div><div class="quiz-count" id="quiz-available">按题库实际情况抽取</div></div>' +
      '<div class="setup-block"><h4>题型</h4><div class="chip-row">' + [["single", "单选题"], ["judge", "判断题"], ["fill", "填空题"], ["multi", "多选题"]].map(function (t) { return '<label class="check-chip"><input type="checkbox" class="quiz-type" value="' + t[0] + '" checked>' + t[1] + "</label>"; }).join("") + "</div></div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px"><button class="btn btn-primary btn-lg" data-action="start-quiz">' + UI.icon("play") + '开始练习</button><a class="btn btn-ghost btn-lg" href="#/wrong">先练错题</a></div></div></div>';
  }
  function startQuiz(opts) {
    var scope = opts.scope || "all", value = opts.value || "";
    var pool = questions.slice();
    if (opts.ids) {
      var set = {}; opts.ids.forEach(function (id) { set[id] = 1; });
      pool = pool.filter(function (q) { return set[q.id]; });
    } else if (scope === "chapter") pool = pool.filter(function (q) { return String(q.chapter) === String(value); });
    else if (scope === "deck") pool = pool.filter(function (q) { return q.deckId === value; });
    else if (scope === "kp") pool = pool.filter(function (q) { return q.kp === value; });
    if (opts.types && opts.types.length) pool = pool.filter(function (q) { return opts.types.indexOf(q.type) >= 0; });
    if (!pool.length) { UI.toast("这个范围暂时没有题目"); return; }
    pool = shuffle(pool).slice(0, Math.min(opts.count || 10, pool.length));
    S.session = { mode: opts.mode || "practice", qids: pool.map(function (q) { return q.id; }), idx: 0, answers: {}, config: { scope: scope, value: value, types: opts.types || [], count: opts.count || 10 }, startedAt: Date.now() };
    Store.save();
    navigate("#/quiz/session");
  }
  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function currentSessionQuestion() {
    if (!S.session) return null;
    return qMap[S.session.qids[S.session.idx]];
  }
  function normFill(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/\s+/g, "").replace(/[−–—]/g, "-")
      .replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/[，]/g, ",").replace(/[。]/g, ".")
      .replace(/π/g, "pi").replace(/∞/g, "无穷")
      .replace(/\$/g, "").replace(/\\left|\\right/g, "")
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
      .replace(/[{}]/g, "").replace(/\\/g, "");
  }
  function gradeAnswer(q, picked, text) {
    if (q.type === "multi") {
      var a = (q.answer || []).slice().sort().join(""), b = (picked || []).slice().sort().join("");
      return a === b;
    }
    if (q.type === "fill") {
      return (q.answer || []).every(function (variants, i) {
        var v = normFill((text || [])[i]);
        return variants.some(function (x) { return normFill(x) === v; });
      });
    }
    return (picked || [])[0] === (q.answer || [])[0];
  }
  function quizSessionView() {
    if (!S.session) return '<div class="empty"><div class="big">?</div><h3>没有进行中的练习</h3><p><a href="#/quiz">去开始一组题</a></p></div>';
    var q = currentSessionQuestion();
    if (!q) return '<div class="empty"><div class="big">?</div><h3>题目数据缺失</h3><p>可能是课件更新后题目被移除。<a href="#/quiz">重新开始</a></p></div>';
    var ans = S.session.answers[q.id];
    var submitted = !!(ans && ans.submitted);
    var total = S.session.qids.length, idx = S.session.idx;
    var options = "";
    if (q.type === "fill") {
      var blanks = Math.max(1, (q.answer || []).length);
      options = '<div class="fill-row">' + Array.from({ length: blanks }).map(function (_, i) {
        var v = ans && ans.text ? ans.text[i] || "" : "";
        return '<span>第 ' + (i + 1) + ' 空</span><input class="fill-input" data-blank="' + i + '" value="' + esc(v) + '"' + (submitted ? " disabled" : "") + ' placeholder="输入答案">';
      }).join("") + "</div>";
    } else {
      options = '<div class="options">' + (q.options || []).map(function (o) {
        var letter = o[0], selected = ans && (ans.picked || []).indexOf(letter) >= 0;
        var cls = "option";
        if (submitted) {
          cls += " locked";
          if ((q.answer || []).indexOf(letter) >= 0) cls += " correct";
          else if (selected) cls += " wrong";
        } else if (selected) cls += " selected";
        var input = q.type === "multi" ? '<input type="checkbox" tabindex="-1" data-letter="' + letter + '"' + (selected ? " checked" : "") + (submitted ? " disabled" : "") + ' style="margin-top:4px;accent-color:var(--primary);pointer-events:none">' : "";
        return '<button class="' + cls + '" data-action="pick" data-letter="' + letter + '"' + (submitted ? " disabled" : "") + '><span class="letter">' + letter + "</span>" + input + "<span>" + ft(o[1]) + "</span></button>";
      }).join("") + "</div>";
    }
    var actions = "";
    if (!submitted) {
      if (q.type === "multi" || q.type === "fill") actions = '<button class="btn btn-primary" data-action="submit-answer">提交本题</button>';
      else actions = '<span class="small muted">点击选项后立即批改</span>';
    } else {
      actions = '<button class="btn btn-primary" data-action="next-question">' + (idx + 1 >= total ? "查看结果" : "下一题") + UI.icon("arrowRight") + "</button>";
    }
    var feedback = submitted ? feedbackHtml(q, ans) : "";
    return '<div class="quiz-wrap"><div class="quiz-top"><span>' + (S.session.mode === "wrong" ? "错题重练" : "章节练习") + " · " + esc(q.section) + '</span><span>第 ' + (idx + 1) + " / " + total + " 题</span></div>" +
      '<div class="quiz-progress"><i style="width:' + Math.round((idx + (submitted ? 1 : 0)) / total * 100) + '%"></i></div>' +
      '<div class="question-card"><div class="q-meta"><span class="badge badge-blue">' + UI.typeLabel(q.type) + '</span><span class="badge">' + "★".repeat(q.difficulty) + '</span><span class="badge">' + esc(q.section) + '</span></div>' +
      '<div class="q-stem">' + ft(q.stem) + "</div>" + options + feedback +
      '<div class="quiz-actions">' + (idx > 0 ? '<button class="btn btn-ghost btn-sm" data-action="prev-question">' + UI.icon("arrowLeft") + '上一题</button><span></span>' : "<span></span>") + '<div class="right">' + actions + "</div></div></div>" +
      '<div style="text-align:center;margin-top:14px"><button class="btn btn-ghost btn-sm" data-action="abandon-quiz">结束本组</button></div></div>';
  }
  function feedbackHtml(q, ans) {
    var ok = ans.correct;
    return '<div class="feedback ' + (ok ? "ok" : "no") + '"><div class="head">' + UI.icon(ok ? "check" : "x") + (ok ? "回答正确" : "回答错误") + '</div><div class="answer"><strong>正确答案：</strong>' + ft(UI.answerText(q)) + "</div><div class=\"exp\"><strong>解析：</strong>" + ft(q.explanation) + "</div>" +
      (q.kp && cardMap[q.kp] ? '<div class="small" style="margin-top:8px"><a href="#/card/' + q.kp + '" style="color:inherit;text-decoration:underline">回看知识卡：' + esc(cardMap[q.kp].title) + "</a></div>" : "") + sourceLine(q) + "</div>";
  }
  function applyAnswer(picked, text) {
    var q = currentSessionQuestion(); if (!q) return;
    var existing = S.session.answers[q.id];
    if (existing && existing.submitted) return;
    var correct = gradeAnswer(q, picked, text);
    S.session.answers[q.id] = { picked: picked || [], text: text || [], correct: correct, submitted: true, at: Date.now() };
    Store.recordAnswer(q, correct, S.session.mode);
    Store.save();
    render();
    UI.toast(correct ? "回答正确" : "已加入错题本");
  }
  function nextQuestion() {
    if (!S.session) return;
    if (S.session.idx + 1 >= S.session.qids.length) { finishSession(); return; }
    S.session.idx += 1;
    Store.save();
    render();
  }
  function finishSession() {
    var s = S.session; if (!s) return;
    var validIds = s.qids.filter(function (id) { return !!qMap[id]; });
    validIds.forEach(function (id) {
      if (!s.answers[id]) {
        var q = qMap[id];
        if (q) { s.answers[id] = { picked: [], text: [], correct: false, submitted: true, unanswered: true }; Store.recordAnswer(q, false, s.mode); }
      }
    });
    var total = validIds.length, correct = 0, bySection = {};
    validIds.forEach(function (id) {
      var q = qMap[id]; if (!q) return;
      var a = s.answers[id];
      if (!bySection[q.section]) bySection[q.section] = { total: 0, correct: 0 };
      bySection[q.section].total += 1;
      if (a && a.correct) { correct += 1; bySection[q.section].correct += 1; }
    });
    S.lastResult = { mode: s.mode, total: total, correct: correct, bySection: bySection, qids: validIds, answers: s.answers, startedAt: s.startedAt, finishedAt: Date.now(), config: s.config };
    Store.addHistory({ mode: s.mode, total: total, correct: correct });
    S.session = null;
    Store.save();
    navigate("#/quiz/result");
  }
  function quizResultView() {
    var r = S.lastResult;
    if (!r) return '<div class="empty"><div class="big">?</div><h3>还没有练习结果</h3><p><a href="#/quiz">去刷一组题</a></p></div>';
    var p = pct(r.correct, r.total);
    var wrongIds = r.qids.filter(function (id) { var a = r.answers[id]; return qMap[id] && a && !a.correct; });
    return '<div class="quiz-wrap"><div class="result-hero"><div class="score-ring" style="--pct:' + p + '%"><span>' + p + '</span></div><h2>本组得分 ' + p + '</h2><p>' + r.total + " 题 · 答对 " + r.correct + " 题 · 用时 " + Math.max(1, Math.round((r.finishedAt - r.startedAt) / 60000)) + " 分钟</p>" +
      '<div class="result-grid"><div class="result-stat"><strong>' + r.correct + '</strong><span>答对</span></div><div class="result-stat"><strong>' + (r.total - r.correct) + '</strong><span>答错/未答</span></div><div class="result-stat"><strong>' + p + '%</strong><span>正确率</span></div></div></div>' +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">分节表现</div>' + Object.keys(r.bySection).map(function (sec) {
        var x = r.bySection[sec];
        return '<div class="bar-row"><span>' + esc(sec) + '</span><span class="bar-track"><i style="width:' + pct(x.correct, x.total) + '%"></i></span><b>' + x.correct + "/" + x.total + "</b></div>";
      }).join("") + "</div>" +
      (wrongIds.length ? '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">需要回看 <span class="count">' + wrongIds.length + ' 题</span></div><div class="review-list">' + wrongIds.map(function (id) {
        var q = qMap[id], a = r.answers[id]; if (!q) return "";
        return '<a class="review-row" href="#/card/' + (q.kp || "") + '"><div class="top"><span>' + esc(q.section) + " · " + UI.typeLabel(q.type) + '</span><span>' + (a && a.unanswered ? "未作答" : "答错") + '</span></div><div class="small" style="font-weight:600">' + ft(q.stem) + '</div><div class="small muted" style="margin-top:5px">正确答案：' + ft(UI.answerText(q)) + "</div></a>";
      }).join("") + "</div></div>" : "") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:22px">' + (wrongIds.length ? '<button class="btn btn-primary" data-action="retry-ids" data-ids="' + wrongIds.join(",") + '">' + UI.icon("refresh") + '重做本组错题</button>' : "") + '<button class="btn btn-soft" data-action="start-quiz" data-scope="all" data-count="10">再来一组</button><a class="btn btn-ghost" href="#/home">回首页</a></div></div>';
  }  function wrongView() {
    var list = Store.wrongActive(qMap);
    var removed = Object.keys(S.wrong).filter(function (id) { return S.wrong[id].removed; }).length;
    var filtered = list;
    if (currentQuery && currentQuery.indexOf("ch:") === 0) {
      var ch = Number(currentQuery.slice(3));
      filtered = list.filter(function (w) { return qMap[w.id].chapter === ch; });
    }
    return '<div class="page-head"><div><div class="eyebrow">MISTAKES</div><h1 class="page-title">错题本</h1><p class="page-sub">答错自动收录。任意模式答对都累计连对，连续答对 ' + Store.WRONG_NEED + ' 次自动移出；答错则清零。</p></div><div style="display:flex;gap:9px;flex-wrap:wrap">' + (list.length ? '<button class="btn btn-primary" data-action="retry-all-wrong">' + UI.icon("refresh") + "重练全部（" + list.length + "）</button>" : "") + '<button class="btn btn-danger" data-action="clear-wrong">清空</button></div></div>' +
      '<div class="chip-row" style="margin-bottom:16px"><button class="chip ' + (!currentQuery ? "on" : "") + '" data-action="wrong-filter" data-value="">全部</button>' + chapters.map(function (ch) { return '<button class="chip ' + (currentQuery === "ch:" + ch.number ? "on" : "") + '" data-action="wrong-filter" data-value="ch:' + ch.number + '">' + esc(ch.label) + "</button>"; }).join("") + '<span class="small muted" style="align-self:center;margin-left:6px">已攻克 ' + removed + " 题</span></div>" +
      (filtered.length ? '<div class="grid" style="gap:11px">' + filtered.map(function (w) {
        var q = qMap[w.id], d = deckMap[q.deckId];
        var dots = ""; for (var i = 0; i < Store.WRONG_NEED; i++) dots += '<i class="' + (i < w.streak ? "on" : "") + '"></i>';
        return '<div class="wrong-row"><div class="body"><h4>' + ft(q.stem) + '</h4><div class="meta"><span>' + esc(q.section) + " " + esc(d ? d.title : "") + "</span><span>错 " + w.wrong + " 次</span><span>连对 " + w.streak + "/" + Store.WRONG_NEED + '</span><span class="streak">' + dots + "</span></div></div><div class=\"wrong-actions\"><button class=\"btn btn-soft btn-sm\" data-action=\"retry-one\" data-id=\"" + q.id + "\">重练</button><button class=\"btn btn-ghost btn-sm\" data-action=\"remove-wrong\" data-id=\"" + q.id + "\">移出</button></div></div>";
      }).join("") + "</div>" : '<div class="card empty"><div class="big">' + UI.icon("check") + '</div><h3>错题本是空的</h3><p>做完一组练习后，答错的题会自动出现在这里。</p><p style="margin-top:10px"><a class="btn btn-soft btn-sm" href="#/quiz">去刷题</a></p></div>');
  }

  function formulasView() {
    var groups = {};
    formulas.forEach(function (f) { (groups[f.group] = groups[f.group] || []).push(f); });
    return '<div class="page-head"><div><div class="eyebrow">FORMULA SHEET</div><h1 class="page-title">公式速查</h1><p class="page-sub">按主题整理的高频公式与条件提醒，支持搜索和打印。公式来自课件整理，使用时注意适用条件。</p></div><button class="btn btn-ghost no-print" data-action="print">打印</button></div>' +
      '<input class="formula-search no-print" id="formula-search" placeholder="搜索公式名称、说明或主题，例如：等价无穷小、链式法则、莱布尼茨">' +
      '<div id="formula-list">' + Object.keys(groups).map(function (g) {
        return '<section class="formula-group" data-group="' + esc(g) + '"><h3><span style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></span>' + esc(g) + ' <span class="count">' + groups[g].length + "</span></h3><div class=\"formula-grid\">" + groups[g].map(function (f) {
          return '<article class="formula-card" data-search="' + esc((f.name + " " + f.note + " " + f.group + " " + f.tex).toLowerCase()) + '"><div class="name">' + esc(f.name) + '</div><div class="math">$$' + esc(f.tex) + '$$</div>' + (f.note ? '<div class="note">' + ft(f.note) + "</div>" : "") + '<div class="where">' + esc(f.section + " " + f.deckTitle) + " · p." + f.page + "</div></article>";
        }).join("") + "</div></section>";
      }).join("") + "</div>";
  }
  function filterFormulas(q) {
    var list = document.getElementById("formula-list"); if (!list) return;
    var query = q.trim().toLowerCase();
    list.querySelectorAll(".formula-card").forEach(function (el) {
      el.style.display = !query || (el.getAttribute("data-search") || "").indexOf(query) >= 0 ? "" : "none";
    });
    list.querySelectorAll(".formula-group").forEach(function (g) {
      var visible = g.querySelectorAll('.formula-card:not([style*="display: none"])').length;
      g.style.display = visible ? "" : "none";
    });
  }

  function statsView() {
    var mastered = masteredCount(cards), wrongs = Store.wrongActive(qMap).length;
    var acc = pct(S.stats.correct, S.stats.answered);
    var chapterRows = chapters.map(function (ch) {
      var qn = 0, cn = 0;
      questions.filter(function (q) { return q.chapter === ch.number; }).forEach(function (q) {
        var x = S.stats.bySection[q.section]; if (!x) return;
        qn += x.answered; cn += x.correct;
      });
      return { ch: ch, answered: qn, correct: cn };
    });
    var sections = {};
    questions.forEach(function (q) {
      if (!sections[q.section]) sections[q.section] = { total: 0, chapter: q.chapter, title: q.deckTitle };
      sections[q.section].total += 1;
    });
    return '<div class="page-head"><div><div class="eyebrow">PROGRESS</div><h1 class="page-title">学习统计</h1><p class="page-sub">' + (GistSync.isConfigured() ? "云同步已开启，多台设备的答题与错题会自动合并。" : "数据保存在当前浏览器；开启云同步后可在多台设备间合并进度。") + '</p></div><button class="btn btn-danger" data-action="reset-data">重置全部数据</button></div>' +
      '<div class="stat-grid"><div class="stat-box"><span>累计答题</span><strong>' + S.stats.answered + '</strong></div><div class="stat-box"><span>累计正确率</span><strong>' + acc + '%</strong></div><div class="stat-box"><span>知识卡掌握</span><strong>' + mastered + "/" + cards.length + '</strong></div><div class="stat-box"><span>错题待攻克</span><strong>' + wrongs + "</strong></div></div>" +
      '<div class="home-split"><div class="card card-pad"><div class="section-title" style="margin-top:0">分章正确率</div>' + chapterRows.map(function (r) {
        return '<div class="bar-row"><span>' + esc(r.ch.label) + '</span><span class="bar-track"><i style="width:' + pct(r.correct, r.answered) + '%"></i></span><b>' + pct(r.correct, r.answered) + "%</b></div>";
      }).join("") + '<div class="small muted" style="margin-top:8px">按已答题数计算；未作答不计入正确率。</div></div>' +
      '<div class="card card-pad"><div class="section-title" style="margin-top:0">最近 7 天</div>' + activityHtml() + '<div class="small muted" style="text-align:center;margin-top:8px">每天答题数</div></div></div>' +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">分节明细</div><div class="table-wrap"><table class="data"><thead><tr><th>节</th><th>题量</th><th>已答</th><th>答对</th><th>正确率</th></tr></thead><tbody>' +
      Object.keys(sections).map(function (sec) {
        var x = S.stats.bySection[sec] || { answered: 0, correct: 0 };
        return "<tr><td><strong>" + esc(sec) + "</strong> <span class=\"muted\">" + esc(sections[sec].title) + "</span></td><td>" + sections[sec].total + "</td><td>" + x.answered + "</td><td>" + x.correct + "</td><td>" + pct(x.correct, x.answered) + "%</td></tr>";
      }).join("") + "</tbody></table></div></div>" +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">最近练习</div>' + (S.history.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>模式</th><th>得分</th><th>正确率</th></tr></thead><tbody>' + S.history.slice(0, 8).map(function (h) {
        return "<tr><td>" + UI.fmtDate(h.at) + "</td><td>" + (h.mode === "wrong" ? "错题重练" : h.mode === "exam" ? "综合测验" : "章节练习") + "</td><td>" + h.correct + "/" + h.total + "</td><td>" + pct(h.correct, h.total) + "%</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="empty" style="padding:26px"><p>还没有练习记录。</p></div>') + "</div>" +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">云同步</div><div class="small muted">' + syncStatusLine() + '</div><div style="margin-top:10px"><a class="btn btn-soft btn-sm" href="#/sync">' + (GistSync.isConfigured() ? "管理同步" : "开启云同步") + '</a></div></div>';
  }

  function libraryView() {
    var pending = decks.filter(function (d) { return d.status === "pending"; });
    var review = decks.filter(function (d) { return d.status === "review"; });
    var missing = decks.filter(function (d) { return d.status === "missing"; });
    var summary = D.importSummary;
    return '<div class="page-head"><div><div class="eyebrow">COURSEWARE</div><h1 class="page-title">课件库</h1><p class="page-sub">共 ' + decks.length + " 份课件，已整理 " + decks.filter(function (d) { return d.status === "ready"; }).length + " 份。新增课件后运行更新网站.cmd，或直接把 PDF 拖到它上面。</p></div></div>" +
      (pending.length || review.length || missing.length ? '<div class="banner banner-blue">' + UI.icon("spark") + "<div>待整理 " + pending.length + " 份 · 待复核 " + review.length + " 份 · 缺失 " + missing.length + " 份。状态会随导入与整理自动更新。</div></div>" : "") +
      chapters.map(function (ch) {
        var ds = chapterDecks(ch.number);
        return '<section style="margin-bottom:24px"><div class="section-title" style="margin-top:0"><span style="width:9px;height:9px;border-radius:50%;background:' + chapterColor(ch.number) + '"></span>' + esc(ch.label) + " " + esc(ch.title) + ' <span class="count">' + ds.length + " 份</span></div><div class=\"deck-list\">" + ds.map(function (d) {
          return '<div class="lib-row"><div class="file"><h4>' + esc(d.section + " " + d.title) + " " + UI.statusBadge(d.status) + '</h4><p>' + esc(d.file) + "</p></div><div class=\"lib-meta\"><span>" + d.pages + " 页</span><span>" + d.cardCount + " 卡</span><span>" + d.questionCount + " 题</span><span>" + UI.fmtDate(d.updatedAt) + "</span></div><div style=\"display:flex;gap:7px;align-items:center\">" + (d.status === "pending" ? '<button class="btn btn-soft btn-sm" data-action="copy-deck-prompt" data-deck="' + d.id + '">整理提示词</button>' : "") + pdfLink(d, 1, "打开") + "</div></div>";
        }).join("") + "</div></section>";
      }).join("") +
      '<div class="card card-pad" style="margin-top:26px"><div class="section-title" style="margin-top:0">如何导入新课件</div><div class="import-guide"><div class="steps">' +
      '<div class="step">把新 PDF 命名为 <code>3.1章节名.pdf</code> 这样的格式，直接拖到网站根目录的 <code>更新网站.cmd</code> 上；或放进 <code>courseware/inbox/</code> 后双击它。</div>' +
      '<div class="step">脚本会计算哈希、读取页数、自动归入章节，并在 <code>backups/</code> 里保留最近 10 次备份。新课件先显示为“待整理”。</div>' +
      '<div class="step">把下面的提示词交给 Codex，让它阅读 PDF 并生成对应的 <code>content/decks/&lt;id&gt;.json</code>。</div>' +
      '<div class="step">再次运行 <code>更新网站.cmd</code>，构建并校验通过后，新知识卡和题目就会出现在网站里。出错可用 <code>恢复上一版.cmd</code> 回滚。</div></div>' +
      '<div><div class="prompt-box" id="prompt-box">请阅读 courseware/decks/&lt;课件id&gt;.pdf，按 content/README.md 的规范生成 content/decks/&lt;课件id&gt;.json：6–10 张知识卡、15–25 道题，所有卡片和题目标注真实页码，公式使用 KaTeX，解析写出推理过程。完成后运行 node tools/build.mjs 并修复所有校验错误。</div><button class="btn btn-soft btn-sm" style="margin-top:9px" data-action="copy-prompt">复制通用提示词</button></div></div></div>' +
      (summary ? '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">上次导入</div><div class="small muted">' + UI.fmtDate(summary.at) + " · 新增 " + (summary.added || []).length + " · 修订 " + (summary.updated || []).length + " · 未归类 " + (summary.unclassified || []).length + "</div>" + ((summary.nextSteps || []).length ? '<ul style="margin-top:9px;padding-left:18px;font-size:12px;color:var(--ink-2)">' + summary.nextSteps.map(function (x) { return "<li>" + ft(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") +
      '<div class="small muted" style="margin-top:16px">数据版本：' + UI.fmtDate(D.version) + " · 未开启云同步时完全离线运行，不读取网络资源。</div>";
  }  function examIntroView() {
    var r = S.exam && S.exam.result;
    var examN = (D.site && D.site.examCount) || 20;
    var examMin = (D.site && D.site.examMinutes) || 30;
    return '<div class="quiz-wrap"><div class="page-head"><div><div class="eyebrow">MOCK EXAM</div><h1 class="page-title">综合测验</h1><p class="page-sub">从全部题库按章节比例抽取 ' + examN + " 题，" + examMin + ' 分钟倒计时。交卷前不显示答案，交卷后统一批改。</p></div></div>' +
      '<div class="card card-pad"><div class="grid grid-3" style="margin-bottom:18px"><div class="stat-box"><span>题量</span><strong>' + examN + '</strong></div><div class="stat-box"><span>时间</span><strong>' + examMin + '′</strong></div><div class="stat-box"><span>范围</span><strong>' + decks.length + " 节</strong></div></div>" +
      '<div class="prose"><p>· 答题卡可以随时跳题，已答题目标记颜色。</p><p>· 倒计时结束会自动交卷；刷新页面后计时与作答继续保留。</p><p>· 未作答按错误计，交卷后错题自动进入错题本。</p></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><button class="btn btn-primary btn-lg" data-action="start-exam">' + UI.icon("clock") + '开始测验</button>' + (r ? '<a class="btn btn-ghost btn-lg" href="#/exam/result">查看上次结果</a>' : "") + "</div></div></div>";
  }
  function pickExamQuestions(n) {
    var byCh = {};
    questions.forEach(function (q) { (byCh[q.chapter] = byCh[q.chapter] || []).push(q); });
    var total = questions.length;
    var alloc = {}, remain = n;
    Object.keys(byCh).forEach(function (ch) {
      var x = Math.floor(n * byCh[ch].length / total);
      alloc[ch] = Math.min(x, byCh[ch].length);
      remain -= alloc[ch];
    });
    var keys = Object.keys(byCh).sort(function (a, b) { return byCh[b].length - byCh[a].length; });
    var i = 0;
    while (remain > 0) {
      var ch = keys[i % keys.length];
      if (alloc[ch] < byCh[ch].length) { alloc[ch] += 1; remain -= 1; }
      i += 1;
      if (i > 500) break;
    }
    var out = [];
    keys.forEach(function (ch) { out = out.concat(shuffle(byCh[ch]).slice(0, alloc[ch])); });
    if (out.length < n) {
      var used = {}; out.forEach(function (q) { used[q.id] = 1; });
      out = out.concat(shuffle(questions.filter(function (q) { return !used[q.id]; })).slice(0, n - out.length));
    }
    return shuffle(out).slice(0, n);
  }
  function startExam() {
    var list = pickExamQuestions(D.site.examCount || 20);
    S.exam = { qids: list.map(function (q) { return q.id; }), idx: 0, answers: {}, startedAt: Date.now(), deadline: Date.now() + (D.site.examMinutes || 30) * 60000, submitted: false, result: null };
    Store.save();
    navigate("#/exam/session");
  }
  function examSessionView() {
    if (!S.exam) return '<div class="empty"><div class="big">?</div><h3>没有进行中的测验</h3><p><a href="#/exam">去开始</a></p></div>';
    if (S.exam.submitted) return examResultView();
    var q = qMap[S.exam.qids[S.exam.idx]];
    if (!q) return '<div class="empty">题目缺失</div>';
    var ans = S.exam.answers[q.id] || { picked: [], text: [] };
    var total = S.exam.qids.length;
    var options = q.type === "fill"
      ? '<div class="fill-row">' + Array.from({ length: Math.max(1, (q.answer || []).length) }).map(function (_, i) { return '<span>第 ' + (i + 1) + ' 空</span><input class="fill-input" data-exam-blank="' + i + '" value="' + esc((ans.text || [])[i] || "") + '" placeholder="输入答案">'; }).join("") + "</div>"
      : '<div class="options">' + (q.options || []).map(function (o) {
        var selected = (ans.picked || []).indexOf(o[0]) >= 0;
        return '<button class="option' + (selected ? " selected" : "") + '" data-action="exam-pick" data-letter="' + o[0] + '"><span class="letter">' + o[0] + "</span><span>" + ft(o[1]) + "</span></button>";
      }).join("") + "</div>";
    return '<div class="quiz-wrap"><div class="quiz-top"><span>综合测验 · ' + esc(q.section) + '</span><span id="exam-timer">--:--</span></div>' +
      '<div class="quiz-progress"><i style="width:' + Math.round((S.exam.idx + 1) / total * 100) + '%"></i></div>' +
      '<div class="question-card"><div class="q-meta"><span class="badge badge-blue">' + UI.typeLabel(q.type) + '</span><span class="badge">第 ' + (S.exam.idx + 1) + " / " + total + ' 题</span></div><div class="q-stem">' + ft(q.stem) + "</div>" + options +
      '<div class="quiz-actions"><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-action="exam-prev">' + UI.icon("arrowLeft") + '上一题</button><button class="btn btn-ghost btn-sm" data-action="exam-next">下一题' + UI.icon("arrowRight") + '</button></div><button class="btn btn-primary" data-action="exam-submit">交卷</button></div></div>' +
      '<div class="card card-pad" style="margin-top:14px"><div class="small muted" style="margin-bottom:8px">答题卡</div><div class="chip-row">' + S.exam.qids.map(function (id, i) {
        var a = S.exam.answers[id];
        var answered = a && ((a.picked && a.picked.length) || (a.text && a.text.some(function (x) { return x; })));
        return '<button class="chip ' + (i === S.exam.idx ? "on" : answered ? "answered" : "") + '" data-action="exam-jump" data-idx="' + i + '">' + (i + 1) + "</button>";
      }).join("") + '</div><div style="margin-top:14px"><button class="btn btn-danger btn-sm" data-action="exam-submit">交卷并查看结果</button></div></div></div>';
  }
  function submitExam(auto) {
    if (!S.exam || S.exam.submitted) return;
    var validIds = S.exam.qids.filter(function (id) { return !!qMap[id]; });
    var total = validIds.length, correct = 0, bySection = {};
    validIds.forEach(function (id) {
      var q = qMap[id]; if (!q) return;
      var a = S.exam.answers[id] || { picked: [], text: [] };
      var ok = gradeAnswer(q, a.picked, a.text);
      a.correct = ok; a.submitted = true; S.exam.answers[id] = a;
      Store.recordAnswer(q, ok, "exam");
      if (!bySection[q.section]) bySection[q.section] = { total: 0, correct: 0 };
      bySection[q.section].total += 1;
      if (ok) { correct += 1; bySection[q.section].correct += 1; }
    });
    S.exam.submitted = true;
    S.exam.finishedAt = Date.now();
    S.exam.result = { total: total, correct: correct, bySection: bySection, qids: validIds, answers: S.exam.answers, startedAt: S.exam.startedAt, finishedAt: Date.now(), auto: !!auto };
    Store.addHistory({ mode: "exam", total: total, correct: correct });
    Store.save();
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    navigate("#/exam/result");
  }
  function examResultView() {
    var r = S.exam && S.exam.result;
    if (!r) return '<div class="empty"><div class="big">?</div><h3>还没有测验结果</h3><p><a href="#/exam">去开始测验</a></p></div>';
    var p = pct(r.correct, r.total);
    return '<div class="quiz-wrap"><div class="result-hero"><div class="score-ring" style="--pct:' + p + '%"><span>' + p + '</span></div><h2>综合测验 ' + p + ' 分</h2><p>' + r.total + " 题 · 答对 " + r.correct + " 题 · 用时 " + Math.max(1, Math.round((r.finishedAt - r.startedAt) / 60000)) + " 分钟" + (r.auto ? " · 已自动交卷" : "") + '</p><div class="result-grid"><div class="result-stat"><strong>' + r.correct + '</strong><span>答对</span></div><div class="result-stat"><strong>' + (r.total - r.correct) + '</strong><span>答错</span></div><div class="result-stat"><strong>' + p + '%</strong><span>正确率</span></div></div></div>' +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">逐题回顾</div><div class="review-list">' + r.qids.map(function (id, i) {
        var q = qMap[id], a = r.answers[id] || {}; if (!q) return "";
        return '<div class="review-row"><div class="top"><span>第 ' + (i + 1) + " 题 · " + esc(q.section) + " · " + UI.typeLabel(q.type) + '</span><span style="color:' + (a.correct ? "var(--green)" : "var(--red)") + '">' + (a.correct ? "正确" : "错误") + '</span></div><div class="small" style="font-weight:600">' + ft(q.stem) + '</div><div class="small muted" style="margin-top:5px">正确答案：' + ft(UI.answerText(q)) + "</div><div class=\"small muted\" style=\"margin-top:5px\">" + ft(q.explanation) + "</div></div>";
      }).join("") + "</div></div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:22px"><button class="btn btn-primary" data-action="start-exam">' + UI.icon("refresh") + '再测一次</button><a class="btn btn-ghost" href="#/home">回首页</a></div></div>';
  }

  function syncStatusLine() {
    var st = GistSync.status();
    if (!st.configured) return "未开启，学习数据只保存在当前浏览器。";
    if (st.lastError) return "同步异常：" + st.lastError;
    return "已开启，最近同步 " + (st.lastSyncAt ? UI.fmtDate(st.lastSyncAt) : "—") + "，共 " + st.deviceCount + " 台设备。";
  }

  function syncView() {
    var st = GistSync.status();
    var head = '<div class="page-head"><div><div class="eyebrow">SYNC</div><h1 class="page-title">云同步</h1><p class="page-sub">用你自己的 GitHub 私有 Gist，让多台设备共用一份学习进度。</p></div></div>';
    if (!st.configured) {
      return head +
        '<div class="banner banner-blue">' + UI.icon("spark") + '<div>未开启时网站完全离线，数据只存本机；开启后会在打开页面和答完题时自动同步。所有设备的数据会合并，不会互相覆盖。</div></div>' +
        '<div class="card card-pad"><div class="section-title" style="margin-top:0">开启步骤</div><div class="steps">' +
        '<div class="step">打开 <a href="https://github.com/settings/tokens/new?scopes=gist&description=%E9%AB%98%E6%95%B0%E5%A4%8D%E4%B9%A0%E7%AB%99" target="_blank" rel="noreferrer" style="color:var(--primary)">GitHub Token 页面</a>，登录后确认勾选了 <code>gist</code> 权限。</div>' +
        '<div class="step">点击 <code>Generate new token (classic)</code> 生成令牌，复制以 <code>ghp_</code> 开头的字符串。</div>' +
        '<div class="step">把令牌粘贴到下面，点击“创建并启用”。网站会新建一个只有你能访问的私有 Gist。</div>' +
        '</div>' +
        '<div class="form-row"><label for="sync-token">GitHub 令牌（classic，仅 gist 权限）</label><input class="text-input" id="sync-token" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_..."></div>' +
        '<div style="margin-top:14px"><button class="btn btn-primary" data-action="sync-create">创建并启用</button></div>' +
        '<p class="small muted" style="margin-top:12px">令牌只保存在本机浏览器，只发送给 api.github.com，不会写进进度数据或 Gist。</p></div>' +
        '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">已有同步？</div>' +
        '<p class="small muted">在已开启同步的设备上打开“云同步”，点击“复制配置串”，把复制到的文本粘贴到这里即可接入同一份进度。</p>' +
        '<div class="form-row"><label for="sync-config">同步配置串</label><textarea class="text-input" id="sync-config" rows="3" placeholder="粘贴配置串"></textarea></div>' +
        '<div style="margin-top:12px"><button class="btn btn-soft" data-action="sync-import">导入并同步</button></div></div>';
    }
    return head +
      '<div class="card card-pad"><div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><span class="badge badge-green">已开启</span> <strong style="margin-left:6px">学习进度会自动同步</strong><div class="small muted" style="margin-top:5px">' + syncStatusLine() + '</div></div><button class="btn btn-primary" data-action="sync-now"' + (st.busy ? " disabled" : "") + '>' + UI.icon("refresh") + (st.busy ? "同步中…" : "立即同步") + '</button></div>' +
      (st.lastError ? '<div class="banner banner-red" style="margin:14px 0 0">' + UI.icon("x") + '<div>' + esc(st.lastError) + '</div></div>' : "") +
      '<div class="grid grid-3" style="margin-top:16px"><div class="stat-box"><span>最近同步</span><strong style="font-size:14px">' + (st.lastSyncAt ? UI.fmtDate(st.lastSyncAt) : "等待首次同步") + '</strong></div><div class="stat-box"><span>已接入设备</span><strong>' + st.deviceCount + '</strong></div><div class="stat-box"><span>存储位置</span><strong style="font-size:13px"><a href="https://gist.github.com/' + esc(st.gistId) + '" target="_blank" rel="noreferrer" style="color:var(--primary)">私有 Gist</a></strong></div></div></div>' +
      '<div class="card card-pad" style="margin-top:16px"><div class="section-title" style="margin-top:0">在另一台设备上接入</div>' +
      '<p class="small muted">复制下面的配置串，在另一台设备打开本站的“更多 → 云同步”，粘贴到“已有同步”里。配置串含有令牌，请只发给自己。</p>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-soft" data-action="sync-copy">复制配置串</button><button class="btn btn-ghost" data-action="sync-disconnect">断开同步</button></div></div>' +
      '<p class="small muted" style="margin-top:16px">Gist 是私有（不公开列出）但不是端到端加密，只存放答题统计与错题，不包含个人信息。令牌失效后重新生成并在此粘贴即可。</p>';
  }

  function moreView() {
    var examN = (D.site && D.site.examCount) || 20;
    var examMin = (D.site && D.site.examMinutes) || 30;
    return '<div class="page-head"><div><div class="eyebrow">MORE</div><h1 class="page-title">更多</h1><p class="page-sub">公式、统计、课件库与导入说明。</p></div></div><div class="more-list">' +
      [["#/sync", "refresh", "云同步", syncStatusLine()], ["#/formulas", "formula", "公式速查", formulas.length + " 条公式"], ["#/stats", "stats", "学习统计", "正确率、分章表现与最近练习"], ["#/library", "library", "课件库", decks.length + " 份课件与导入说明"], ["#/exam", "clock", "综合测验", examN + " 题 / " + examMin + " 分钟"]].map(function (x) {
        return '<a class="more-link" href="' + x[0] + '"><span class="quick-icon">' + UI.icon(x[1]) + "</span><span><strong>" + x[2] + "</strong><span class=\"small muted\" style=\"display:block\">" + x[3] + "</span></span>" + UI.icon("arrowRight") + "</a>";
      }).join("") + "</div>";
  }
  function notFound(msg) {
    return '<div class="empty"><div class="big">?</div><h3>' + esc(msg) + '</h3><p><a href="#/home">回首页</a></p></div>';
  }

  function renderSearchResults(query) {
    var box = document.getElementById("search-results");
    if (!box) return;
    var q = String(query || "").trim().toLowerCase();
    if (!q) {
      box.innerHTML = '<div class="search-empty">输入关键词，检索知识卡标题、标签、摘要，以及公式名称与说明。</div>';
      return;
    }
    function hit(text) { return String(text == null ? "" : text).toLowerCase().indexOf(q) >= 0; }
    var foundCards = cards.filter(function (c) {
      return hit(c.title) || hit((c.tags || []).join(" ")) || hit(c.summary) || hit(c.section) || hit(c.deckTitle);
    }).slice(0, 8);
    var foundFormulas = formulas.filter(function (f) {
      return hit(f.name) || hit(f.note) || hit(f.group) || hit(f.tex) || hit(f.section);
    }).slice(0, 8);
    var html = "";
    if (foundCards.length) {
      html += '<div class="search-group">知识卡</div>' + foundCards.map(function (c) {
        return '<a class="search-item" href="#/card/' + c.id + '" data-action="close-search"><span class="kind">卡片</span><span><strong>' + esc(c.title) + '</strong><span class="small muted" style="display:block">' + esc(c.section + " " + c.deckTitle) + '</span></span></a>';
      }).join("");
    }
    if (foundFormulas.length) {
      html += '<div class="search-group">公式</div>' + foundFormulas.map(function (f) {
        return '<button class="search-item" style="width:100%;border:0;background:transparent;text-align:left;cursor:pointer" data-action="goto-formula" data-name="' + esc(f.name) + '"><span class="kind">公式</span><span><strong>' + esc(f.name) + '</strong><span class="small muted" style="display:block">' + esc(f.group + " · " + f.section) + '</span></span></button>';
      }).join("");
    }
    if (!html) html = '<div class="search-empty">没有找到“' + esc(query) + '”，换个关键词试试。</div>';
    box.innerHTML = html;
  }

  function openSearch() {
    if (!modalRoot) return;
    modalRoot.innerHTML = '<div class="modal-mask"><div class="search-modal"><div class="search-head">' + UI.icon("search") + '<input id="search-input" autocomplete="off" placeholder="搜索知识卡或公式"><button class="btn btn-ghost btn-sm" data-action="close-search">Esc</button></div><div class="search-body" id="search-results"></div></div></div>';
    renderSearchResults("");
    var input = document.getElementById("search-input");
    if (input) input.focus();
  }
  function closeSearch() {
    if (modalRoot) modalRoot.innerHTML = "";
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text, message) {
    function done(ok) { UI.toast(ok ? (message || "已复制到剪贴板") : "复制失败，请手动选择文本复制"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  function promptForDeck(id) {
    var d = deckMap[id];
    if (!d) { UI.toast("找不到这份课件"); return; }
    var target = d.section === "习题课"
      ? "以题型方法卡为主，生成 6–10 张知识卡、8–12 道题"
      : "生成 6–10 张知识卡、15–25 道题";
    var reviewNote = d.status === "review" ? "这是修订版课件，请对照原内容逐项复核，保留稳定的卡片与题目 ID，并修正页码。" : "";
    var text = "请阅读 " + d.file + "（课件 ID：" + d.id + "，章节：" + d.section + " " + d.title + "，共 " + d.pages + " 页），按 content/README.md 的字段规范更新 " + d.contentFile + "：" + target + "；所有卡片和题目标注真实课件页码，公式使用 $...$ 或 $$...$$ 的 KaTeX 语法，题目解析写出完整推理过程。" + reviewNote + "完成后运行 node tools/build.mjs 和 node tools/validate.mjs，并修复全部致命错误。";
    copyText(text, "已复制这份课件的整理提示词");
  }

  function render() {
    var route = parseHash(), path = route.path, parts = route.parts;
    var content = "", active = "", title = "首页";
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    if (path === "/" || path === "/home") {
      content = homeView(); active = "home"; title = "首页";
    } else if (path === "/chapters") {
      content = chaptersView(); active = "chapters"; title = "章节复习";
    } else if (parts[0] === "chapter" && parts[1]) {
      content = chapterView(Number(parts[1])); active = "chapters";
      title = chapterMap[Number(parts[1])] ? chapterMap[Number(parts[1])].title : "章节复习";
    } else if (parts[0] === "deck" && parts[1]) {
      content = deckView(parts[1]); active = "chapters";
      title = deckMap[parts[1]] ? deckMap[parts[1]].section + " " + deckMap[parts[1]].title : "章节复习";
    } else if (parts[0] === "card" && parts[1]) {
      content = cardView(parts[1]); active = "chapters";
      title = cardMap[parts[1]] ? cardMap[parts[1]].title : "知识卡";
    } else if (path === "/quiz") {
      content = quizSetupView(); active = "quiz"; title = "刷题练习";
    } else if (path === "/quiz/session") {
      content = quizSessionView(); active = "quiz"; title = "答题中";
    } else if (path === "/quiz/result") {
      content = quizResultView(); active = "quiz"; title = "练习结果";
    } else if (path === "/wrong") {
      content = wrongView(); active = "wrong"; title = "错题本";
    } else if (path === "/formulas") {
      content = formulasView(); active = "formulas"; title = "公式速查";
    } else if (path === "/stats") {
      content = statsView(); active = "stats"; title = "学习统计";
    } else if (path === "/library") {
      content = libraryView(); active = "library"; title = "课件库";
    } else if (path === "/exam") {
      content = examIntroView(); active = "quiz"; title = "综合测验";
    } else if (path === "/exam/session") {
      content = examSessionView(); active = "quiz"; title = "测验进行中";
    } else if (path === "/exam/result") {
      content = examResultView(); active = "quiz"; title = "测验结果";
    } else if (path === "/sync") {
      content = syncView(); active = "sync"; title = "云同步";
    } else if (path === "/more") {
      content = moreView(); active = "more"; title = "更多";
    } else {
      content = notFound("页面不存在"); active = ""; title = "页面不存在";
    }
    app.innerHTML = shell(content, active, title);
    document.title = title + " · " + ((D.site && D.site.title) || "高等数学复习站");
    if (path !== lastPath) {
      window.scrollTo(0, 0);
      lastPath = path;
    }
    UI.renderMath(app);
    if (path === "/formulas" && pendingFormulaQuery) {
      var fi = document.getElementById("formula-search");
      if (fi) { fi.value = pendingFormulaQuery; filterFormulas(pendingFormulaQuery); }
      pendingFormulaQuery = "";
    }
    if (path === "/exam/session") startExamTimer();
  }

  function startExamTimer() {
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    if (!S.exam || S.exam.submitted) return;
    function tick() {
      var el = document.getElementById("exam-timer");
      if (!S.exam || S.exam.submitted) {
        if (examTimer) { clearInterval(examTimer); examTimer = null; }
        return;
      }
      var left = Math.max(0, S.exam.deadline - Date.now());
      var z = function (n) { return String(n).padStart(2, "0"); };
      if (el) el.textContent = z(Math.floor(left / 60000)) + ":" + z(Math.floor(left % 60000 / 1000));
      if (left <= 0) submitExam(true);
    }
    tick();
    if (!S.exam || S.exam.submitted) return;
    examTimer = setInterval(tick, 1000);
  }

  function quizPoolCount(scope, value, types) {
    var pool = questions.slice();
    if (scope === "chapter") pool = pool.filter(function (q) { return String(q.chapter) === String(value); });
    else if (scope === "deck") pool = pool.filter(function (q) { return q.deckId === value; });
    else if (scope === "kp") pool = pool.filter(function (q) { return q.kp === value; });
    if (types && types.length) pool = pool.filter(function (q) { return types.indexOf(q.type) >= 0; });
    return pool.length;
  }
  function readQuizTypes() {
    return Array.prototype.slice.call(document.querySelectorAll(".quiz-type:checked")).map(function (x) { return x.value; });
  }
  function updateQuizAvailable() {
    var sel = document.getElementById("quiz-scope");
    var out = document.getElementById("quiz-available");
    if (!sel || !out) return;
    var raw = sel.value, scope = "all", value = "";
    if (raw.indexOf("chapter:") === 0) { scope = "chapter"; value = raw.slice(8); }
    else if (raw.indexOf("deck:") === 0) { scope = "deck"; value = raw.slice(5); }
    out.textContent = "当前筛选下共 " + quizPoolCount(scope, value, readQuizTypes()) + " 道题，按题量随机抽取";
  }
  function startSetupQuiz() {
    var sel = document.getElementById("quiz-scope");
    var raw = sel ? sel.value : "all";
    var scope = "all", value = "";
    if (raw.indexOf("chapter:") === 0) { scope = "chapter"; value = raw.slice(8); }
    else if (raw.indexOf("deck:") === 0) { scope = "deck"; value = raw.slice(5); }
    var types = readQuizTypes();
    if (!types.length) { UI.toast("请至少选择一种题型"); return; }
    var chip = document.querySelector("#quiz-count .chip.on");
    var count = chip ? Number(chip.getAttribute("data-count")) : 10;
    startQuiz({ scope: scope, value: value, types: types, count: count, mode: "practice" });
  }

  function sessionStep(delta) {
    if (!S.session) return;
    var ni = S.session.idx + delta;
    if (ni < 0) return;
    if (ni >= S.session.qids.length) { finishSession(); return; }
    S.session.idx = ni;
    Store.save();
    render();
  }
  function examStep(delta) {
    if (!S.exam || S.exam.submitted) return;
    var ni = S.exam.idx + delta;
    if (ni < 0) return;
    if (ni >= S.exam.qids.length) { UI.toast("已经是最后一题"); return; }
    S.exam.idx = ni;
    Store.save();
    render();
  }
  function examUnansweredCount() {
    if (!S.exam) return 0;
    return S.exam.qids.filter(function (id) {
      var a = S.exam.answers[id];
      return !a || (!(a.picked || []).length && !(a.text || []).some(function (x) { return x; }));
    }).length;
  }

  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var mask = target.closest(".modal-mask");
    if (mask && target === mask) { closeSearch(); return; }
    var countChip = target.closest("#quiz-count .chip");
    if (countChip) {
      document.querySelectorAll("#quiz-count .chip").forEach(function (x) { x.classList.remove("on"); });
      countChip.classList.add("on");
      updateQuizAvailable();
      return;
    }
    var el = target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var q, a, letter;

    if (action === "open-search") { e.preventDefault(); openSearch(); return; }
    if (action === "close-search") { closeSearch(); return; }
    if (action === "sync-create") {
      var tokenInput = document.getElementById("sync-token");
      var token = tokenInput ? tokenInput.value : "";
      if (!token.trim()) { UI.toast("请先粘贴 GitHub 令牌"); return; }
      el.disabled = true; el.textContent = "正在创建…";
      GistSync.createGist(token).then(function () {
        UI.toast("云同步已开启");
        render();
      }).catch(function (err) {
        el.disabled = false; el.textContent = "创建并启用";
        UI.toast(err.message || "创建失败");
      });
      return;
    }
    if (action === "sync-import") {
      var configInput = document.getElementById("sync-config");
      if (!configInput || !configInput.value.trim()) { UI.toast("请先粘贴同步配置串"); return; }
      el.disabled = true; el.textContent = "正在导入…";
      GistSync.importConfig(configInput.value).then(function () {
        UI.toast("已接入云同步");
        render();
      }).catch(function (err) {
        el.disabled = false; el.textContent = "导入并同步";
        UI.toast(err.message || "导入失败");
      });
      return;
    }
    if (action === "sync-now") {
      el.disabled = true; el.textContent = "同步中…";
      GistSync.syncNow().then(function (ok) {
        render();
        if (ok) UI.toast("同步完成");
      }).catch(function (err) {
        render();
        UI.toast(err.message || "同步失败");
      });
      return;
    }
    if (action === "sync-copy") {
      copyText(GistSync.packConfig(), "配置串已复制，可在另一台设备导入");
      return;
    }
    if (action === "sync-disconnect") {
      if (confirm("断开后本机不再自动同步，云端 Gist 与已上传的进度会保留。确定断开吗？")) {
        GistSync.disconnect();
        render();
        UI.toast("云同步已断开");
      }
      return;
    }
    if (action === "goto-formula") {
      e.preventDefault();
      pendingFormulaQuery = el.getAttribute("data-name") || "";
      closeSearch();
      navigate("#/formulas");
      return;
    }
    if (action === "toggle-card") {
      var on = Store.toggleCard(el.getAttribute("data-id"));
      render();
      UI.toast(on ? "已标记为掌握" : "已取消掌握标记");
      return;
    }
    if (action === "start-section") {
      var deckId = el.getAttribute("data-deck");
      var d = deckMap[deckId];
      startQuiz({ scope: "deck", value: deckId, count: Math.min(30, d ? d.questionCount : 10), mode: "practice" });
      return;
    }
    if (action === "start-kp") {
      startQuiz({ scope: "kp", value: el.getAttribute("data-kp"), count: 30, mode: "practice" });
      return;
    }
    if (action === "quick-quiz") {
      startQuiz({ scope: "all", count: Number(el.getAttribute("data-count")) || 10, mode: "practice" });
      return;
    }
    if (action === "start-quiz") {
      if (el.hasAttribute("data-scope")) {
        startQuiz({ scope: el.getAttribute("data-scope"), value: el.getAttribute("data-value") || "", count: Number(el.getAttribute("data-count")) || 10, mode: "practice" });
      } else {
        startSetupQuiz();
      }
      return;
    }
    if (action === "retry-one") {
      startQuiz({ ids: [el.getAttribute("data-id")], mode: "wrong", count: 1 });
      return;
    }
    if (action === "retry-ids") {
      var ids = (el.getAttribute("data-ids") || "").split(",").filter(Boolean);
      if (ids.length) startQuiz({ ids: ids, mode: "wrong", count: ids.length });
      return;
    }
    if (action === "retry-all-wrong") {
      var wid = Store.wrongActive(qMap).map(function (w) { return w.id; });
      if (!wid.length) { UI.toast("错题本是空的"); return; }
      startQuiz({ ids: wid, mode: "wrong", count: wid.length });
      return;
    }
    if (action === "wrong-filter") { currentQuery = el.getAttribute("data-value") || ""; render(); return; }
    if (action === "remove-wrong") {
      var rid = el.getAttribute("data-id");
      if (S.wrong[rid]) { Store.removeWrong(rid); render(); UI.toast("已移出错题本"); }
      return;
    }
    if (action === "clear-wrong") {
      if (!Object.keys(S.wrong).length) { UI.toast("错题本已经是空的"); return; }
      if (confirm("确定清空全部错题记录吗？已掌握的知识卡与答题统计不会受影响。")) {
        Store.clearWrong(); render(); UI.toast("错题本已清空");
      }
      return;
    }
    if (action === "reset-data") {
      if (confirm("确定重置全部学习数据吗？掌握状态、错题、统计和练习记录都会被清空。")) {
        S = Store.reset(); currentQuery = ""; lastPath = "";
        navigate("#/home"); UI.toast("学习数据已重置");
      }
      return;
    }
    if (action === "print") { window.print(); return; }
    if (action === "copy-prompt") {
      copyText("请阅读 courseware/decks/<课件id>.pdf，按 content/README.md 的字段规范生成 content/decks/<课件id>.json：普通课件 6–10 张知识卡、15–25 道题；习题课以题型方法卡为主、8–12 道题。所有卡片和题目标注真实课件页码，公式使用 KaTeX，题目解析写出推理过程。完成后运行 node tools/build.mjs 和 node tools/validate.mjs，并修复全部错误。", "已复制通用整理提示词");
      return;
    }
    if (action === "copy-deck-prompt") { promptForDeck(el.getAttribute("data-deck")); return; }

    if (action === "pick") {
      q = currentSessionQuestion(); if (!q) return;
      letter = el.getAttribute("data-letter");
      if (q.type === "multi") {
        a = S.session.answers[q.id] || { picked: [], text: [] };
        if (a.submitted) return;
        var at = a.picked.indexOf(letter);
        if (at >= 0) a.picked.splice(at, 1); else a.picked.push(letter);
        S.session.answers[q.id] = a;
        Store.save(); render();
      } else {
        applyAnswer([letter], []);
      }
      return;
    }
    if (action === "submit-answer") {
      q = currentSessionQuestion(); if (!q) return;
      if (q.type === "multi") {
        a = S.session.answers[q.id];
        if (!a || !(a.picked || []).length) { UI.toast("请至少选择一项"); return; }
        applyAnswer(a.picked.slice(), []);
      } else {
        var text = Array.prototype.slice.call(document.querySelectorAll(".fill-input[data-blank]")).map(function (x) { return x.value; });
        if (!text.some(function (x) { return x.trim(); })) { UI.toast("请先填写答案"); return; }
        applyAnswer([], text);
      }
      return;
    }
    if (action === "next-question") { sessionStep(1); return; }
    if (action === "prev-question") { sessionStep(-1); return; }
    if (action === "abandon-quiz") {
      if (confirm("结束本组练习？未作答的题会按错误计入结果。")) finishSession();
      return;
    }

    if (action === "start-exam") { startExam(); return; }
    if (action === "exam-pick") {
      if (!S.exam || S.exam.submitted) return;
      q = qMap[S.exam.qids[S.exam.idx]]; if (!q) return;
      letter = el.getAttribute("data-letter");
      a = S.exam.answers[q.id] || { picked: [], text: [] };
      if (q.type === "multi") {
        var ei = a.picked.indexOf(letter);
        if (ei >= 0) a.picked.splice(ei, 1); else a.picked.push(letter);
      } else {
        a.picked = [letter];
      }
      S.exam.answers[q.id] = a;
      Store.save(); render();
      return;
    }
    if (action === "exam-prev") { examStep(-1); return; }
    if (action === "exam-next") { examStep(1); return; }
    if (action === "exam-jump") {
      if (!S.exam || S.exam.submitted) return;
      var ji = Number(el.getAttribute("data-idx"));
      if (ji >= 0 && ji < S.exam.qids.length) { S.exam.idx = ji; Store.save(); render(); }
      return;
    }
    if (action === "exam-submit") {
      if (!S.exam || S.exam.submitted) return;
      var un = examUnansweredCount();
      if (un && !confirm("还有 " + un + " 题未作答，未作答按错误计。确定交卷吗？")) return;
      submitExam(false);
      return;
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target && (e.target.id === "quiz-scope" || (e.target.classList && e.target.classList.contains("quiz-type")))) updateQuizAvailable();
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "formula-search") { filterFormulas(t.value); return; }
    if (t.id === "search-input") { renderSearchResults(t.value); return; }
    if (t.classList && t.classList.contains("fill-input")) {
      if (t.hasAttribute("data-blank") && S.session) {
        var q = currentSessionQuestion(); if (!q) return;
        var a = S.session.answers[q.id] || { picked: [], text: [] };
        if (a.submitted) return;
        a.text = Array.prototype.slice.call(document.querySelectorAll(".fill-input[data-blank]")).map(function (x) { return x.value; });
        S.session.answers[q.id] = a;
        Store.save();
      } else if (t.hasAttribute("data-exam-blank") && S.exam && !S.exam.submitted) {
        var eq = qMap[S.exam.qids[S.exam.idx]]; if (!eq) return;
        var ea = S.exam.answers[eq.id] || { picked: [], text: [] };
        ea.text = Array.prototype.slice.call(document.querySelectorAll(".fill-input[data-exam-blank]")).map(function (x) { return x.value; });
        S.exam.answers[eq.id] = ea;
        Store.save();
      }
    }
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === "Escape" && modalRoot && modalRoot.innerHTML) { closeSearch(); return; }
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "ArrowLeft") {
      if (location.hash === "#/quiz/session") { e.preventDefault(); sessionStep(-1); }
      else if (location.hash === "#/exam/session") { e.preventDefault(); examStep(-1); }
    } else if (e.key === "ArrowRight") {
      if (location.hash === "#/quiz/session") { e.preventDefault(); sessionStep(1); }
      else if (location.hash === "#/exam/session") { e.preventDefault(); examStep(1); }
    }
  });

  window.addEventListener("store:sync", function () {
    S = Store.state;
    if (location.hash === "#/quiz/session" || location.hash === "#/exam/session") return;
    render();
  });
  window.addEventListener("sync:status", function () { if (location.hash === "#/sync") render(); });
  window.addEventListener("hashchange", render);

  if (!location.hash) location.hash = "#/home";
  render();
})();

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const katex = require("../vendor/katex/katex.min.js");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PATHS = {
  manifest: path.join(ROOT, "manifest.json"),
  chapters: path.join(ROOT, "content", "chapters.json"),
  site: path.join(ROOT, "content", "site.json"),
  data: path.join(ROOT, "js", "data.js"),
  latest: path.join(ROOT, "reports", "latest.json"),
  backups: path.join(ROOT, "backups")
};

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (err) {
    if (fallback !== null) return fallback;
    throw new Error(`无法读取 JSON：${file}\n${err.message}`);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function writeTextAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

const COLORS = ["blue", "teal", "violet", "amber", "rose", "green"];

export function loadSource() {
  const manifest = readJson(PATHS.manifest);
  const chapters = readJson(PATHS.chapters);
  const site = readJson(PATHS.site);
  const packs = new Map();
  for (const deck of manifest.decks) {
    if (deck.contentFile) {
      const abs = path.join(ROOT, deck.contentFile);
      packs.set(deck.id, fs.existsSync(abs) ? readJson(abs) : { cards: [], questions: [], formulas: [] });
    }
  }
  return { manifest, chapters, site, packs };
}

export function mergeData() {
  const { manifest, chapters, site, packs } = loadSource();
  const chapterList = [...chapters].sort((a, b) => a.number - b.number).map((c, i) => ({
    ...c,
    color: c.color || COLORS[i % COLORS.length],
    label: c.label || `第${c.number}章`
  }));
  const chapterMap = new Map(chapterList.map(c => [c.number, c]));
  const subtitle = chapterList.length
    ? chapterList.map(c => `${c.label} ${c.title}`).join(" · ")
    : (site.subtitle || "");
  const siteData = { ...site, subtitle };
  const decks = [...manifest.decks].sort((a, b) => (a.chapter - b.chapter) || (a.order - b.order)).map(d => ({
    ...d,
    chapterTitle: chapterMap.get(d.chapter)?.title || `第${d.chapter}章`,
    chapterLabel: chapterMap.get(d.chapter)?.label || `第${d.chapter}章`,
    cardCount: 0, questionCount: 0
  }));
  const deckMap = new Map(decks.map(d => [d.id, d]));
  const cards = [], questions = [], formulas = [];
  for (const deck of decks) {
    const pack = packs.get(deck.id) || { cards: [], questions: [], formulas: [] };
    for (const c of (pack.cards || [])) {
      cards.push({
        ...c,
        id: `${deck.id}-${c.id}`,
        localId: c.id,
        deckId: deck.id,
        chapter: deck.chapter,
        section: deck.section,
        deckTitle: deck.title,
        deckStatus: deck.status,
        page: c.page
      });
    }
    for (const q of (pack.questions || [])) {
      questions.push({
        ...q,
        id: `${deck.id}-${q.id}`,
        localId: q.id,
        deckId: deck.id,
        chapter: deck.chapter,
        section: deck.section,
        deckTitle: deck.title,
        deckStatus: deck.status,
        kp: q.kp ? `${deck.id}-${q.kp}` : null
      });
    }
    for (const [i, f] of (pack.formulas || []).entries()) {
      formulas.push({
        ...f,
        id: f.id ? `${deck.id}-${f.id}` : `${deck.id}-f${String(i + 1).padStart(2, "0")}`,
        deckId: deck.id,
        chapter: deck.chapter,
        section: deck.section,
        deckTitle: deck.title,
        page: f.page
      });
    }
    deck.cardCount = (pack.cards || []).length;
    deck.questionCount = (pack.questions || []).length;
  }
  const importSummary = fs.existsSync(PATHS.latest) ? readJson(PATHS.latest) : null;
  return {
    version: new Date().toISOString(),
    site: siteData,
    chapters: chapterList,
    decks,
    cards,
    questions,
    formulas,
    importSummary
  };
}

function extractTex(text) {
  const out = [];
  const s = String(text || "");
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m;
  while ((m = re.exec(s))) out.push({ tex: (m[1] || m[2] || "").trim(), display: Boolean(m[1]) });
  return out;
}

export function validateSource(data) {
  const errors = [], warnings = [];
  const seen = new Set();
  const cardIds = new Set(data.cards.map(c => c.id));
  const deckPages = new Map(data.decks.map(d => [d.id, d.pages]));

  for (const d of data.decks) {
    if (seen.has(d.id)) errors.push(`课件 ID 重复：${d.id}`);
    seen.add(d.id);
    if (!["ready", "pending", "review", "missing"].includes(d.status)) errors.push(`课件 ${d.id} 状态非法：${d.status}`);
    if (!(d.pages > 0)) errors.push(`课件 ${d.id} 页数非法：${d.pages}`);
  }
  const cardSeen = new Set();
  for (const c of data.cards) {
    if (cardSeen.has(c.id)) errors.push(`知识卡 ID 重复：${c.id}`);
    cardSeen.add(c.id);
    if (!c.title) errors.push(`知识卡 ${c.id} 缺少标题`);
    if (!(c.page >= 1 && c.page <= (deckPages.get(c.deckId) || 0))) warnings.push(`知识卡 ${c.id} 页码 ${c.page} 超出课件页数`);
  }
  const qSeen = new Set();
  for (const q of data.questions) {
    if (qSeen.has(q.id)) errors.push(`题目 ID 重复：${q.id}`);
    qSeen.add(q.id);
    if (!["single", "multi", "judge", "fill"].includes(q.type)) errors.push(`题目 ${q.id} 题型非法：${q.type}`);
    if (![1, 2, 3].includes(q.difficulty)) errors.push(`题目 ${q.id} 难度非法：${q.difficulty}`);
    if (!q.stem) errors.push(`题目 ${q.id} 缺少题干`);
    if (!q.explanation) errors.push(`题目 ${q.id} 缺少解析`);
    if (q.kp && !cardIds.has(q.kp)) errors.push(`题目 ${q.id} 关联知识卡不存在：${q.kp}`);
    if (!(q.page >= 1 && q.page <= (deckPages.get(q.deckId) || 0))) warnings.push(`题目 ${q.id} 页码 ${q.page} 超出课件页数`);
    if (q.type === "fill") {
      if (!Array.isArray(q.answer) || !q.answer.length || !q.answer.every(a => Array.isArray(a) && a.length)) {
        errors.push(`填空题 ${q.id} 答案格式应为二维数组`);
      }
    } else {
      const letters = (q.options || []).map(o => Array.isArray(o) ? o[0] : null);
      if (!letters.length) errors.push(`题目 ${q.id} 缺少选项`);
      if (!Array.isArray(q.answer) || !q.answer.length) errors.push(`题目 ${q.id} 缺少答案`);
      for (const a of (q.answer || [])) if (!letters.includes(a)) errors.push(`题目 ${q.id} 答案 ${a} 不在选项中`);
      if (q.type !== "multi" && q.answer?.length !== 1) errors.push(`题目 ${q.id} 应只有一个正确答案`);
      if (q.type === "multi" && (!Array.isArray(q.answer) || q.answer.length < 2)) errors.push(`多选题 ${q.id} 至少需要两个正确答案`);
    }
  }
  const formulaSeen = new Set();
  for (const f of data.formulas) {
    if (formulaSeen.has(f.id)) errors.push(`公式 ID 重复：${f.id}`);
    formulaSeen.add(f.id);
    if (!f.name || !f.tex) errors.push(`公式 ${f.id} 缺少名称或 LaTeX`);
  }

  const texJobs = [];
  for (const c of data.cards) {
    for (const t of [c.summary, c.example?.stem, c.example?.solution, ...(c.pitfalls || [])]) texJobs.push(...extractTex(t).map(x => ({ ...x, where: `知识卡 ${c.id}` })));
    for (const f of (c.formulas || [])) texJobs.push({ tex: f.tex, display: true, where: `知识卡 ${c.id} 公式` });
  }
  for (const q of data.questions) {
    for (const t of [q.stem, q.explanation, ...(q.options || []).map(o => o[1])]) texJobs.push(...extractTex(t).map(x => ({ ...x, where: `题目 ${q.id}` })));
  }
  for (const f of data.formulas) texJobs.push({ tex: f.tex, display: true, where: `公式 ${f.id}` });

  for (const job of texJobs) {
    try {
      katex.renderToString(job.tex, { throwOnError: true, strict: false, displayMode: job.display });
    } catch (err) {
      errors.push(`${job.where} LaTeX 错误：${err.message.split("\n")[0]}`);
    }
  }
  return { errors, warnings };
}

export function writeData(data) {
  const js = `/* 由 tools/build.mjs 自动生成，请勿手改。源数据在 manifest.json 与 content/ 中。 */\nvar SITE_DATA = ${JSON.stringify(data, null, 2)};\n`;
  writeTextAtomic(PATHS.data, js);
}

export function stats(data) {
  const bySection = {};
  for (const q of data.questions) {
    bySection[q.section] = (bySection[q.section] || 0) + 1;
  }
  return {
    decks: data.decks.length,
    cards: data.cards.length,
    questions: data.questions.length,
    formulas: data.formulas.length,
    bySection
  };
}

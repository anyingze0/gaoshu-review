import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { PDFDocument } = require("./vendor/pdf-lib.min.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  manifest: path.join(ROOT, "manifest.json"),
  chapters: path.join(ROOT, "content", "chapters.json"),
  decks: path.join(ROOT, "courseware", "decks"),
  inbox: path.join(ROOT, "courseware", "inbox"),
  processed: path.join(ROOT, "courseware", "processed"),
  unclassified: path.join(ROOT, "courseware", "unclassified"),
  contentDecks: path.join(ROOT, "content", "decks"),
  backups: path.join(ROOT, "backups"),
  reports: path.join(ROOT, "reports")
};
for (const d of [P.decks, P.inbox, P.processed, P.unclassified, P.contentDecks, P.backups, P.reports]) fs.mkdirSync(d, { recursive: true });

const CN = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}
function stamp() {
  const d = new Date();
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}`;
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}
function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
function parseName(file) {
  let base = path.basename(file, path.extname(file)).trim();
  let chapter = null, section = null, title = "";
  let m = base.match(/^ch(\d+)[-_](\d+)[-_]*(.*)$/i);
  if (m) {
    chapter = Number(m[1]); section = `${m[1]}.${m[2]}`; title = m[3] || "";
  }
  if (!chapter) {
    m = base.match(/^(\d+)[.\-](\d+)\s*[._\- ]*(.*)$/);
    if (m) { chapter = Number(m[1]); section = `${m[1]}.${m[2]}`; title = m[3] || ""; }
  }
  if (!chapter) {
    m = base.match(/^(\d+)\s*[-_ ]\s*习题课(.*)$/);
    if (m) { chapter = Number(m[1]); section = "习题课"; title = "习题课" + (m[2] || ""); }
  }
  if (!chapter) {
    m = base.match(/^第([一二三四五六七八九十\d]+)章\s*[._\- ]*(.*)$/);
    if (m) {
      chapter = CN[m[1]] || Number(m[1]);
      section = "整章"; title = m[2] || `第${chapter}章`;
    }
  }
  if (!chapter) {
    m = base.match(/^(\d+)\s*[._\- ]\s*(.*)$/);
    if (m) { chapter = Number(m[1]); section = "整章"; title = m[2] || `第${chapter}章`; }
  }
  title = title.replace(/[（(]\s*[0-9.]+\s*节\s*[）)]\s*$/, "").replace(/^[\s._\-]+/, "").trim();
  if (!title) title = section === "整章" ? `第${chapter}章` : (section || base);
  return { chapter, section, title, base };
}
function sectionOrder(chapter, section) {
  if (/^\d+\.\d+/.test(section)) return Number(section);
  if (section === "习题课") return chapter + 0.99;
  return chapter + 0.01;
}
function idFor(chapter, section, existingIds) {
  let slug;
  if (section === "习题课") slug = `${chapter}-exercises`;
  else if (section === "整章") slug = `${chapter}-whole`;
  else slug = section.replace(/\./g, "-");
  let id = `ch${slug}`;
  let i = 2;
  while (existingIds.has(id)) id = `ch${slug}-${i++}`;
  return id;
}
function chapterLabel(n) {
  const cn = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return `第${cn[n] || n}章`;
}
function packHasContent(file) {
  const p = readJson(file, null);
  return Boolean(p && ((p.cards || []).length || (p.questions || []).length));
}
function createStagingBackup() {
  const dir = path.join(P.backups, ".staging-" + process.pid + "-" + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(P.manifest)) copyFile(P.manifest, path.join(dir, "manifest.json"));
  if (fs.existsSync(path.join(ROOT, "content"))) fs.cpSync(path.join(ROOT, "content"), path.join(dir, "content"), { recursive: true });
  if (fs.existsSync(path.join(ROOT, "js", "data.js"))) copyFile(path.join(ROOT, "js", "data.js"), path.join(dir, "js", "data.js"));
  return dir;
}
function finalizeBackup(staging, changes) {
  let dir = path.join(P.backups, stamp());
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(P.backups, stamp() + "-" + n++);
  fs.renameSync(staging, dir);
  writeJson(path.join(dir, "changes.json"), changes);
  const dirs = fs.readdirSync(P.backups, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith(".")).map(d => d.name).sort();
  for (const old of dirs.slice(0, Math.max(0, dirs.length - 10))) {
    const target = path.join(P.backups, old);
    if (target.startsWith(P.backups + path.sep)) fs.rmSync(target, { recursive: true, force: true });
  }
  return dir;
}
function pruneInbox(files) {
  for (const f of files) {
    if (path.dirname(path.resolve(f)) !== P.inbox) continue;
    const dst = path.join(P.processed, path.basename(f));
    try { fs.renameSync(f, dst); } catch { /* ignore */ }
  }
}

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const manifest = readJson(P.manifest, { version: 1, updatedAt: new Date().toISOString(), decks: [] });
const chapters = readJson(P.chapters, []);
const inputs = args.length ? args : fs.readdirSync(P.inbox).filter(f => f.toLowerCase().endsWith(".pdf")).map(f => path.join(P.inbox, f));
const report = { at: new Date().toISOString(), added: [], updated: [], unchanged: [], missing: [], unclassified: [], errors: [], nextSteps: [] };
const changes = { addedFiles: [], addedContent: [], replaced: [] };
const stagingDir = createStagingBackup();
const pendingDir = path.join(stagingDir, "pdfs");
const byId = new Map(manifest.decks.map(d => [d.id, d]));
const existingIds = new Set(manifest.decks.map(d => d.id));
const hashes = new Map(manifest.decks.map(d => [d.sha256, d]));
let changed = false;

for (const d of manifest.decks) {
  if (!fs.existsSync(path.join(ROOT, d.file))) {
    if (d.status !== "missing") {
      d.status = "missing";
      d.updatedAt = new Date().toISOString();
      report.missing.push({ id: d.id, section: d.section, title: d.title, file: d.file });
      changed = true;
    }
  }
}

for (const input of inputs) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) { report.errors.push(`文件不存在：${input}`); continue; }
  let meta, pages, hash;
  try {
    const bytes = fs.readFileSync(abs);
    hash = crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pages = pdf.getPageCount();
    meta = parseName(abs);
  } catch (err) {
    report.errors.push(`${path.basename(abs)} 无法读取：${err.message.split("\n")[0]}`);
    continue;
  }
  if (hashes.has(hash)) {
    const d = hashes.get(hash);
    const missing = !fs.existsSync(path.join(ROOT, d.file));
    if (missing) {
      copyFile(abs, path.join(ROOT, d.file));
      d.status = packHasContent(path.join(ROOT, d.contentFile)) ? "ready" : "pending";
      d.updatedAt = new Date().toISOString();
      changes.addedFiles.push(d.file);
      report.updated.push({ id: d.id, section: d.section, title: d.title, pages: d.pages, oldPages: d.pages, delta: 0, status: d.status, reason: "课件文件恢复" });
      changed = true;
    } else {
      report.unchanged.push({ id: d.id, section: d.section, title: d.title, reason: "内容哈希相同" });
    }
    pruneInbox([abs]);
    continue;
  }
  if (!meta.chapter || !meta.section) {
    const dst = path.join(P.unclassified, `${hash.slice(0, 8)}-${path.basename(abs)}`);
    if (abs !== dst) copyFile(abs, dst);
    report.unclassified.push({ file: path.basename(abs), copiedTo: path.relative(ROOT, dst).replace(/\\/g, "/"), hint: "请在文件名开头加上节号，例如 3.1函数的应用.pdf" });
    continue;
  }
  const sameSection = manifest.decks.find(d => d.chapter === meta.chapter && d.section === meta.section);
  const now = new Date().toISOString();
  let deck;
  if (sameSection) {
    deck = sameSection;
    const oldFile = path.join(ROOT, deck.file);
    const oldHash = deck.sha256;
    const oldPages = deck.pages;
    if (oldHash !== hash && fs.existsSync(oldFile) && !changes.replaced.some(x => x.id === deck.id)) {
      fs.mkdirSync(pendingDir, { recursive: true });
      copyFile(oldFile, path.join(pendingDir, deck.id + ".pdf"));
      changes.replaced.push({ id: deck.id, target: deck.file, backup: `pdfs/${deck.id}.pdf` });
    }
    deck.pages = pages;
    deck.sha256 = hash;
    deck.sourceName = path.basename(abs);
    deck.updatedAt = now;
    deck.status = packHasContent(path.join(ROOT, deck.contentFile)) ? "review" : "pending";
    if (!deck.file) deck.file = `courseware/decks/${deck.id}.pdf`;
    deck.title = deck.title || meta.title;
    deck.order = sectionOrder(deck.chapter, deck.section);
    report.updated.push({ id: deck.id, section: deck.section, title: deck.title, pages, oldPages, delta: pages - oldPages, status: deck.status });
    changed = true;
  } else {
    const id = idFor(meta.chapter, meta.section, existingIds);
    existingIds.add(id);
    const contentFile = `content/decks/${id}.json`;
    const absContent = path.join(ROOT, contentFile);
    if (!fs.existsSync(absContent)) {
      writeJson(absContent, { deck: id, cards: [], questions: [], formulas: [] });
      changes.addedContent.push(contentFile);
    }
    deck = {
      id, chapter: meta.chapter, section: meta.section, title: meta.title,
      order: sectionOrder(meta.chapter, meta.section),
      file: `courseware/decks/${id}.pdf`, pages, sha256: hash,
      status: "pending", contentFile, sourceName: path.basename(abs),
      addedAt: now, updatedAt: now
    };
    manifest.decks.push(deck);
    byId.set(id, deck);
    hashes.set(hash, deck);
    changes.addedFiles.push(deck.file);
    report.added.push({ id, chapter: deck.chapter, section: deck.section, title: deck.title, pages });
    changed = true;
  }
  const dst = path.join(ROOT, deck.file);
  if (abs !== dst) copyFile(abs, dst);
  if (!chapters.some(c => c.number === deck.chapter)) {
    chapters.push({ number: deck.chapter, title: `${chapterLabel(deck.chapter)}（待命名）`, label: chapterLabel(deck.chapter) });
    chapters.sort((a, b) => a.number - b.number);
    report.nextSteps.push(`为新章节命名：编辑 content/chapters.json 中第 ${deck.chapter} 章的 title。`);
  }
  pruneInbox([abs]);
}

if (changed) {
  const dir = finalizeBackup(stagingDir, changes);
  manifest.updatedAt = new Date().toISOString();
  writeJson(P.manifest, manifest);
  writeJson(P.chapters, chapters);
  report.nextSteps.unshift(`已创建备份：${path.relative(ROOT, dir).replace(/\\/g, "/")}`);
  const build = spawnSync(process.execPath, [path.join(ROOT, "tools", "build.mjs")], { cwd: ROOT, encoding: "utf8" });
  process.stdout.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
  if (build.status !== 0) {
    report.errors.push("网站重建失败，旧 js/data.js 未被覆盖。可运行 恢复上一版.cmd。");
  }
} else {
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  report.nextSteps.push("没有检测到需要更新的课件。把新 PDF 拖到 更新网站.cmd 上，或放入 courseware/inbox/ 后重试。");
}
for (const a of report.added) {
  report.nextSteps.push(`请让 Codex 整理 content/decks/${a.id}.json：阅读 courseware/decks/${a.id}.pdf，生成 6–10 张知识卡和 15–25 道题。`);
}

const ts = stamp();
const md = [
  `# 课件导入报告 ${ts}`, "",
  `- 新增：${report.added.length}`,
  `- 修订：${report.updated.length}`,
  `- 未变：${report.unchanged.length}`,
  `- 缺失：${report.missing.length}`,
  `- 未归类：${report.unclassified.length}`,
  `- 错误：${report.errors.length}`, "",
  "## 新增", ...(report.added.length ? report.added.map(x => `- ${x.section} ${x.title}（${x.pages} 页，${x.id}）`) : ["- 无"]), "",
  "## 修订", ...(report.updated.length ? report.updated.map(x => `- ${x.section} ${x.title}（${x.oldPages == null ? "?" : x.oldPages} → ${x.pages} 页，状态 ${x.status}${x.reason ? "，" + x.reason : ""}）`) : ["- 无"]), "",
  "## 缺失", ...(report.missing.length ? report.missing.map(x => `- ${x.section} ${x.title}`) : ["- 无"]), "",
  "## 未归类", ...(report.unclassified.length ? report.unclassified.map(x => `- ${x.file} → ${x.copiedTo}`) : ["- 无"]), "",
  "## 错误", ...(report.errors.length ? report.errors.map(x => `- ${x}`) : ["- 无"]), "",
  "## 下一步", ...(report.nextSteps.length ? report.nextSteps.map(x => `- ${x}`) : ["- 无"]), ""
].join("\n");
fs.writeFileSync(path.join(P.reports, `import-${ts}.md`), md, "utf8");
writeJson(path.join(P.reports, "latest.json"), report);
if (fs.existsSync(pendingDir)) fs.rmSync(pendingDir, { recursive: true, force: true });
console.log(`导入完成：新增 ${report.added.length}，修订 ${report.updated.length}，未变 ${report.unchanged.length}，缺失 ${report.missing.length}，未归类 ${report.unclassified.length}，错误 ${report.errors.length}。`);
console.log(`报告：reports/import-${ts}.md`);

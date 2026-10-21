import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { PDFDocument } = require("./vendor/pdf-lib.min.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decks = [
  ["ch1-1", 1, "1.1", "函数", 1.1, "ch1-1-functions.pdf", "1.1函数.pdf"],
  ["ch1-2", 1, "1.2", "数列极限", 1.2, "ch1-2-sequence-limits.pdf", "1.2数列极限（2.5节）.pdf"],
  ["ch1-3", 1, "1.3", "函数极限", 1.3, "ch1-3-function-limits.pdf", "1.3函数极限.pdf"],
  ["ch1-4", 1, "1.4", "无穷小与无穷大", 1.4, "ch1-4-infinitesimal.pdf", "1.4无穷小与无穷大.pdf"],
  ["ch1-5", 1, "1.5", "函数的连续性", 1.5, "ch1-5-continuity.pdf", "1.5函数的连续性.pdf"],
  ["ch1-6", 1, "1.6", "闭区间上连续函数的性质", 1.6, "ch1-6-closed-interval.pdf", "1.6闭区间上连续函数的性质.pdf"],
  ["ch1-0", 1, "习题课", "第一章 习题课", 1.7, "ch1-0-exercises.pdf", "1-习题课.pdf"],
  ["ch2-1", 2, "2.1", "导数的概念", 2.1, "ch2-1-derivative-concept.pdf", "2.1导数的概念.pdf"],
  ["ch2-2", 2, "2.2", "导数的计算", 2.2, "ch2-2-derivative-computation.pdf", "2.2导数的计算.pdf"],
  ["ch2-3", 2, "2.3", "高阶导数", 2.3, "ch2-3-higher-order.pdf", "2.3高阶导数.pdf"],
  ["ch2-4", 2, "2.4", "几类特殊类型函数的求导方法", 2.4, "ch2-4-special-derivatives.pdf", "2.4几类特殊类型函数的求导方法.pdf"]
];
const now = new Date().toISOString();
const out = [];
for (const [id, chapter, section, title, order, file, sourceName] of decks) {
  const abs = path.join(root, "courseware", "decks", file);
  const bytes = fs.readFileSync(abs);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  out.push({
    id, chapter, section, title, order,
    file: `courseware/decks/${file}`,
    pages: pdf.getPageCount(),
    sha256,
    status: "ready",
    contentFile: `content/decks/${id}.json`,
    sourceName,
    addedAt: now,
    updatedAt: now
  });
}
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ version: 1, updatedAt: now, decks: out }, null, 2) + "\n");
console.log(out.map(d => `${d.id} ${d.section} ${d.pages}p ${d.sha256.slice(0,8)}`).join("\n"));

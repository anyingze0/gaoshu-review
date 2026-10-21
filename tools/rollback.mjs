import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUPS = path.join(ROOT, "backups");
const args = process.argv.slice(2);
const dirs = fs.existsSync(BACKUPS)
  ? fs.readdirSync(BACKUPS, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith(".")).map(d => d.name).sort()
  : [];

if (args.includes("--list")) {
  if (!dirs.length) console.log("还没有备份。");
  else dirs.forEach((d, i) => console.log(`${String(i + 1).padStart(2, "0")}  ${d}`));
  process.exit(0);
}
if (!dirs.length) {
  console.error("没有可恢复的备份。");
  process.exit(1);
}
const pick = args.includes("--to") ? args[args.indexOf("--to") + 1] : dirs[dirs.length - 1];
const pickIndex = dirs.indexOf(pick);
if (!pick || pickIndex < 0) {
  console.error(`找不到备份：${pick || "(空)"}`);
  console.error("可用备份：\n" + dirs.join("\n"));
  process.exit(1);
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
function remove(file) {
  const abs = path.resolve(ROOT, file);
  if (!abs.startsWith(ROOT + path.sep)) return;
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}
function applyBackup(name) {
  const dir = path.join(BACKUPS, name);
  const changesFile = path.join(dir, "changes.json");
  if (!fs.existsSync(changesFile)) throw new Error(`备份缺少 changes.json：${name}`);
  const changes = JSON.parse(fs.readFileSync(changesFile, "utf8"));
  const contentBackup = path.join(dir, "content");
  if (fs.existsSync(contentBackup)) {
    fs.rmSync(path.join(ROOT, "content"), { recursive: true, force: true });
    fs.cpSync(contentBackup, path.join(ROOT, "content"), { recursive: true });
  }
  if (fs.existsSync(path.join(dir, "manifest.json"))) copy(path.join(dir, "manifest.json"), path.join(ROOT, "manifest.json"));
  for (const f of (changes.addedFiles || [])) remove(f);
  for (const f of (changes.addedContent || [])) remove(f);
  for (const item of (changes.replaced || [])) {
    const src = path.join(dir, item.backup);
    if (fs.existsSync(src)) copy(src, path.join(ROOT, item.target));
  }
  if (fs.existsSync(path.join(dir, "js", "data.js"))) copy(path.join(dir, "js", "data.js"), path.join(ROOT, "js", "data.js"));
}

const undoDirs = dirs.slice(pickIndex).reverse();
for (const name of undoDirs) applyBackup(name);

const build = spawnSync(process.execPath, [path.join(ROOT, "tools", "build.mjs")], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(build.stdout || "");
process.stderr.write(build.stderr || "");
if (build.status !== 0) {
  console.error("已恢复源文件，但网站重建失败。请检查 content/ 与 manifest.json。");
  process.exit(build.status || 1);
}
console.log(`已恢复到备份：${pick}（共撤销 ${undoDirs.length} 次导入）`);
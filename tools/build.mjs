import { mergeData, validateSource, writeData, stats } from "./lib.mjs";
const data = mergeData();
const { errors, warnings } = validateSource(data);
if (warnings.length) {
  console.log(`警告 ${warnings.length} 条：`);
  for (const w of warnings.slice(0, 20)) console.log("  ! " + w);
}
if (errors.length) {
  console.error(`校验失败，共 ${errors.length} 个错误，未覆盖 js/data.js：`);
  for (const e of errors.slice(0, 40)) console.error("  x " + e);
  process.exit(1);
}
writeData(data);
const s = stats(data);
console.log(`构建完成：${s.decks} 份课件，${s.cards} 张知识卡，${s.questions} 道题，${s.formulas} 条公式。`);
console.log("分节题量：" + Object.entries(s.bySection).map(([k, v]) => `${k}(${v})`).join("、"));

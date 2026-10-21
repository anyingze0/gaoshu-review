import { mergeData, validateSource, stats } from "./lib.mjs";
const data = mergeData();
const { errors, warnings } = validateSource(data);
for (const w of warnings) console.log("警告：" + w);
for (const e of errors) console.log("错误：" + e);
const s = stats(data);
console.log(`统计：${s.decks} 份课件，${s.cards} 张知识卡，${s.questions} 道题，${s.formulas} 条公式。`);
if (errors.length) process.exit(1);
console.log("校验通过。");

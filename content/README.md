# 内容包规范

`content/decks/*.json` 是知识卡、题目和公式的唯一手工维护来源。`js/data.js` 由 `tools/build.mjs` 合并生成，请勿直接修改。

## 稳定 ID

- 课件 ID（`manifest.json` 的 `decks[].id`）一经生成不再改变。
- 内容包中的卡片 ID、题目 ID 使用短 ID（如 `c01`、`q01`），构建时会自动加上课件 ID 前缀。
- 修订课件时保留原有短 ID。只有新增内容才使用新 ID，否则浏览器中的掌握状态、错题和统计会丢失。
- 调整节号只修改 `manifest.json` 的 `section` 显示字段，不要改课件 ID。

## 文件结构

```json
{
  "deck": "ch3-1",
  "cards": [],
  "questions": [],
  "formulas": []
}
```

## 知识卡字段

```json
{
  "id": "c01",
  "title": "导数的定义",
  "tags": ["导数", "定义"],
  "summary": "函数在一点处的导数定义为差商的极限，几何上表示切线斜率。",
  "formulas": [
    { "label": "导数定义", "tex": "f'(x_0)=\\lim_{\\Delta x\\to0}\\frac{f(x_0+\\Delta x)-f(x_0)}{\\Delta x}" }
  ],
  "example": {
    "stem": "用定义求 $f(x)=x^2$ 在 $x=1$ 处的导数。",
    "solution": "$f'(1)=\\lim_{h\\to0}\\frac{(1+h)^2-1}{h}=\\lim_{h\\to0}(2+h)=2$。"
  },
  "pitfalls": ["导数存在要求左右导数都存在且相等。"],
  "page": 12
}
```

- `page` 必须是该课件中真实出现对应内容的页码。
- 文本中的行内公式用 `$...$`，独立公式用 `$$...$$`；公式字段 `tex` 只写 LaTeX 本体，不加美元符号。
- `summary` 建议 2–5 句；`example.solution` 必须写出完整推理过程。
- 普通课件整理 6–10 张知识卡；习题课以题型方法卡为主。

## 题目字段

```json
{
  "id": "q01",
  "type": "single",
  "difficulty": 2,
  "stem": "下列说法正确的是（ ）。",
  "options": [["A", "选项一"], ["B", "选项二"], ["C", "选项三"], ["D", "选项四"]],
  "answer": ["A"],
  "explanation": "先判断定义域，再由定义得出结论，因此选 A。",
  "page": 15,
  "kp": "c01"
}
```

- `type`：`single` 单选、`multi` 多选、`judge` 判断、`fill` 填空。
- `difficulty`：1 基础、2 中等、3 提高。
- 单选、判断：`answer` 为单元素数组，例如 `["A"]`。判断题选项固定为 `[["A","正确"],["B","错误"]]`。
- 多选：`answer` 至少包含两个正确选项，例如 `["A","C"]`；判分要求集合完全一致。
- 填空：`answer` 为二维数组，每个空一个数组，数组内是等价写法；例如 `[["0", "零"], ["1/2", "0.5"]]`。
- `kp` 指向同一内容包中的卡片短 ID，构建后会自动加上课件前缀；没有关联卡片时可省略。
- `page` 必须是题干或解答依据在课件中真实出现的页码。
- 解析必须写出推理过程，不能只给答案。
- 普通课件整理 15–25 道题；习题课 8–12 道题。题型尽量覆盖单选、多选、判断、填空。

## 公式字段

```json
{
  "id": "f01",
  "name": "等价无穷小",
  "group": "极限",
  "tex": "\\sin x\\sim x\\quad(x\\to0)",
  "note": "只能在乘除因子中直接替换，加减中需谨慎。",
  "page": 20
}
```

- `group` 用于公式速查页分组，例如“极限”“导数”“微分”。
- `tex` 必须能被 KaTeX 渲染。

## 新课件整理流程

1. 先把 PDF 拖入 `更新网站.cmd`，或放入 `courseware/inbox/` 后双击它。
2. 查看 `reports/latest.json` 或控制台输出，确认课件 ID、节号和页数。
3. 让 Codex 阅读 `courseware/decks/<课件id>.pdf`，按本规范生成 `content/decks/<课件id>.json`。
4. 运行 `node tools/build.mjs` 与 `node tools/validate.mjs`，修复全部致命错误和页码警告。
5. 再次双击 `更新网站.cmd`，确认课件状态变为 `ready`。

## Codex 提示词模板

把下面的提示词连同实际课件 ID 一起交给 Codex：

```text
请阅读 courseware/decks/<课件id>.pdf，按 content/README.md 的字段规范更新 content/decks/<课件id>.json。

要求：
- 普通课件生成 6–10 张知识卡、15–25 道题；习题课以题型方法卡为主，生成 6–10 张知识卡、8–12 道题。
- 题型覆盖 single、multi、judge、fill，建议安排 1–2 道 multi，answer 必须包含 2 个以上正确选项。
- 所有卡片和题目标注真实课件页码；先核对 PDF 页数，不允许超出范围。
- 公式使用 KaTeX：文本内用 $...$，独立公式用 $$...$$，公式字段 tex 不加美元符号。
- 每题解析写出完整推理过程，不能只给答案；填空题给出等价写法。
- 保留原有卡片和题目的稳定 ID；修订版逐项对照新旧内容复核。
- 完成后运行 node tools/build.mjs 和 node tools/validate.mjs，修复全部致命错误。
```

## 校验规则

`node tools/validate.mjs` 会检查：

- JSON 可解析，课件/卡片/题目/公式 ID 唯一；
- 题目关联的知识卡存在，答案在选项中，填空题答案非空；
- 单选与判断题只有一个答案，多选题答案合法；
- 页码是否超出课件页数（页码问题为警告，其余多为致命错误）；
- 所有 LaTeX 是否可被 KaTeX 渲染。

致命错误会阻止 `js/data.js` 被覆盖，旧站点保持可用。

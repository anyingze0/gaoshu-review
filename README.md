# 高等数学复习站

一个完全离线的本地复习网站。双击 `index.html` 即可使用，不需要服务器、不需要联网，也不会把学习数据上传到任何地方。

## 打开与使用

1. 用现代 Chrome 或 Edge 双击打开 `index.html`。
2. 首页可以继续复习、随机抽 10 题、重练错题，或进入综合测验。
3. 章节复习按课件顺序组织知识卡；每张卡包含定义/定理、关键公式、典型例题与解答、易错点和课件页码。
4. 刷题支持全部、整章、单节范围，以及单选、多选、判断、填空筛选。单选与判断点击即判，多选与填空提交后判分。
5. 错题自动入库。任意模式答对都累计连对，连续答对 3 次自动移出；答错会把连对清零。
6. 综合测验为 20 题、30 分钟，按章节题量比例抽题；刷新页面会恢复倒计时和作答。
7. `Ctrl+K` 可全局搜索知识卡和公式。

学习数据保存在当前浏览器的 `localStorage["gs_review_v1"]` 中。换浏览器、换设备或清除浏览器数据都不会同步。

## 导入新课件

### 新增课件

1. 把 PDF 命名为带节号的名字，例如 `3.1函数的应用.pdf`、`3-1函数的应用.pdf`、`第三章函数的应用.pdf`。
2. 把 PDF 直接拖到根目录的 `更新网站.cmd` 上；或者放进 `courseware/inbox/` 后双击 `更新网站.cmd`。
3. 脚本会计算 SHA256、读取页数、识别章节，把课件复制进 `courseware/decks/`，并在 `reports/` 生成导入报告。新课件先标记为 `pending`（待整理）。
4. 打开 `content/README.md`，按其中的提示词让 Codex 阅读新 PDF，生成 `content/decks/<课件id>.json`。
5. 再次双击 `更新网站.cmd`。构建与校验通过后，知识卡和题目会出现在网站上，状态变为 `ready`（已整理）。

新增章节会自动加入章节导航，站点副标题也由 `content/chapters.json` 自动生成，不需要改页面代码。新章节标题默认是“第 N 章（待命名）”，可在 `content/chapters.json` 中改名。

重复文件会按哈希跳过；无法识别节号的文件会进入 `courseware/unclassified/`，不会影响现有网站。

### 修订课件

把同一节的新版 PDF 拖入即可。脚本会保留课件 ID、卡片 ID 和题目 ID，把状态改为 `review`（待复核），并在报告中列出页数变化。此时旧内容仍可复习，但页面会提示需要对照新课件复核页码和表述。

### 回滚

- 双击 `恢复上一版.cmd`：恢复最近一次备份并自动重建网站。
- 在终端运行 `node tools/rollback.mjs --list`：查看全部备份。
- 运行 `node tools/rollback.mjs --to <备份目录名>`：恢复到指定备份。

每次导入会备份 `manifest.json`、整个 `content/`、旧 `js/data.js` 以及被替换的 PDF，只保留最近 10 份备份。

## 常用命令

```powershell
node tools\build.mjs       # 从清单与内容包重建 js/data.js
node tools\validate.mjs    # 只校验，不写文件
node tools\import.mjs "D:\path\to\3.1课件.pdf"
node tools\rollback.mjs --list
```

构建失败时不会覆盖旧的 `js/data.js`，网站仍保持上一个可用版本。

## 目录说明

| 路径 | 用途 |
| --- | --- |
| `index.html` | 网站入口，双击打开 |
| `css/`、`js/` | 样式与前端逻辑；`js/data.js` 由构建生成，不要手改 |
| `vendor/katex/` | 离线 KaTeX 公式渲染 |
| `manifest.json` | 课件清单，记录节号、页数、哈希、状态与内容包路径 |
| `content/chapters.json` | 章节名称与显示顺序 |
| `content/decks/*.json` | 每份课件的知识卡、题目和公式，是唯一需要手工维护的内容源 |
| `content/README.md` | 内容字段规范与 Codex 整理提示词 |
| `courseware/decks/` | 网站使用的 PDF 课件 |
| `courseware/inbox/` | 待导入 PDF 的扫描目录 |
| `courseware/unclassified/` | 无法识别节号的 PDF |
| `backups/` | 最近 10 次导入前的自动备份 |
| `reports/` | 导入报告与 `latest.json` 摘要 |
| `tools/` | 导入、构建、校验、回滚脚本 |

## 环境要求

- 现代 Chrome 或 Edge（需要支持 `localStorage`、ES2017 与 `file://` 下的本地脚本）。
- 导入与构建需要 Node.js 20 或更高版本；不需要 Python，也不需要联网安装依赖。
- `pdf-lib` 与 KaTeX 已随站点打包在 `vendor/` 和 `tools/vendor/` 中。

## 当前内容

初始收录第一、二章共 11 份课件，包含 54 张知识卡、160 道题和 65 条公式。题目覆盖基础与期末难度，每张卡片和每道题都标注了课件页码。

## 已知限制

- 浏览器出于安全限制，`file://` 页面不能直接写入课件目录，因此导入入口是桌面 `.cmd`，而不是网页内上传按钮。
- 学习数据只存在当前浏览器，不会自动备份。重要进度可在浏览器中保留站点数据，避免清理。
- 站点只面向本地使用，未设计公网部署与多用户同步。

# ds-interview-lab 工作规则

中文的 DA / DS 面试交互学习网站。纯静态，部署在 GitHub Pages（公开仓库 `Eriksas/ds-interview-lab`，main 分支根目录发布，带 `.nojekyll`）。
线上地址：https://eriksas.github.io/ds-interview-lab/

## 用户
- 会 Python（pandas、NumPy、SciPy、Matplotlib）、SQL；用 Stata 做过实证论文，熟悉固定效应、DID、PSM、IV。因果推断页面可以用 Stata / 计量的说法类比。机器学习基础一般。
- 协作方式：连续推进，不必每步停下来问；只有必须由用户决定或操作的事才停。
- 主要在手机上看。

## 最重要的限制：仓库和网站公开，内容必须原创
- 素材库 `E:\da-ds-library`（第三方笔记，只读）只用来确定"讲哪些知识点、哪里容易错"。只看 `*_修订版.md`，`【修订】` 是纠正过的错误，`【补充】` 是补写内容。
- 网站上的文字、例子、图、题目都重新写；不复制原文段落、图片、表格和面经原题原文；不提原作者和来源笔记。
- **不要把素材库的任何文件拷进本仓库。**
- 网站上不放用户个人信息（姓名、学校、电话、邮箱）。git 提交身份用 GitHub 的 noreply 邮箱（已在本仓库 git config 里设好）。
- 用户自己的项目 `E:\retail-uplift-ab`（公开仓库 `Eriksas/retail-uplift-ab`，X5 短信 A/B + 增益模型）：页面提到它的数字一律从它的 `results/` 和 `docs/` 读，不凭印象写。

## 内容规则
- 每页统一结构：① 一句话直觉（白话，≤3 句）② 交互实验（滑块 / 拖动 / "再模拟一次"，配 2–3 个"试试看"小任务；有合理默认值和"重置"按钮）③ 关键公式（少而精，每个后跟一句白话）④ 面试口述版（30 秒）⑤ 常见误区（尤其是素材库修订过的错误）⑥ 自测题 3 道（点开看答案，题目数据在 `assets/js/quiz.js`）⑦ 和 X5 项目的联系（适用时）⑧ 可选的补充图表。
- 每个交互都服务一个面试考点；简单清楚优先，不堆功能。
- 英文术语后面紧跟一句简单的中文解释。
- 模拟数据标注"模拟"，不说成真实业务数据。因果页面区分"相关"和"因果"。
- 素材库原文和修订版冲突时以修订版为准；拿不准的结论查教材或原论文，查不到就不写。

## 数字的准确性
- 页面里写死的结论性数字必须来自 `verify/` 下 Python 脚本的输出（seed 42，输出存为同名 `_output.txt` 一并提交）。
- Python：`E:/retail-uplift-ab/.venv/Scripts/python.exe`（numpy、scipy、statsmodels、sklearn）。
- 浏览器实时模拟要和 Python 对得上：`verify/js_sims.js` 用 Node 加载页面里同一份模拟代码跑默认参数，`verify/compare_js.py` 和 numpy 结果比较（差异 < 3 倍蒙特卡洛标准误），输出 `verify/compare_js_output.txt`。方法写在 `verify/README.md`。
- 重新生成全部输出：在仓库根目录运行 `E:/retail-uplift-ab/.venv/Scripts/python.exe verify/run_all.py`。

## 技术
- 纯静态 HTML + CSS + 原生 JS，无构建步骤。D3 `7.9.0`、KaTeX `0.16.9`，都从 cdnjs 引入，写死版本号。
- 带种子的随机数（mulberry32，默认 seed 42），点"再模拟一次"才换种子。
- 手机优先：375px 宽不出现横向滚动，滑块能用手指拖，图表文字 ≥12px；支持深色模式（跟随系统 + 右上角切换，存 localStorage）。
- localStorage 读写都包 try/catch，读不到也能正常显示。
- 全站一份 CSS 变量（`assets/css/site.css`），颜色用 dataviz 参考调色板：对照组 / H0 = 蓝 `--s1`，实验组 / H1 = 橙 `--s2`，第三序列 = 青 `--s3`。图表要有坐标轴标题和单位。

## 代码结构
- `index.html`：首页知识地图（分组、面试频率、学习时长、"已学会"勾选）。
- `pages/<id>.html`：每个知识点一页；`<body data-page="<id>">`，页眉页脚和自测题由 `core.js` 生成。
- `assets/js/core.js`：随机数、统计函数、控件、图表辅助、页面框架。
- `assets/js/registry.js`：页面清单（标题、分组、频率、时长、是否上线）。
- `assets/js/quiz.js`：所有页面的自测题（闪卡页也从这里读）。
- `assets/js/pages/<id>.js`：页面逻辑。纯计算 / 模拟函数挂在 `Lab.sim.<id>` 上，DOM 代码放在 `if (typeof document !== 'undefined')` 里，这样 Node 能直接加载做核对。

## 工作流程
- 每做完一页：跑 verify → 提交并推送（中文提交信息）→ 在线上链接自测（桌面宽度和 375px 各看一遍、控制台无报错、交互都能用）。
- 开发时可以起本地服务器调试，但交付的是线上链接。

# DS 面试实验室

中文的数据分析 / 数据科学面试交互学习网站：每个知识点一页，核心是“拖一拖就懂”的小实验，配关键公式、30 秒面试口述版、常见误区和自测题。手机优先，支持深色模式。

**线上地址：https://eriksas.github.io/ds-interview-lab/**

## 每页的结构

1. 一句话直觉
2. 交互实验：滑块、拖动、“再模拟一次”，每个实验配 2–3 个“试试看”小任务（点开看答案）
3. 关键公式（每个公式后跟一句白话）
4. 面试口述版（30 秒）
5. 常见误区
6. 自测题 3 道
7. 和 X5 短信增益项目（[retail-uplift-ab](https://github.com/Eriksas/retail-uplift-ab)）的联系（适用时）

## 页面清单

| 分组 | 页面 | 交互实验 |
|---|---|---|
| 统计基础 | [中心极限定理与置信区间](https://eriksas.github.io/ds-interview-lab/pages/clt.html) | 五种总体下样本均值的分布与偏度；100 个 95% 置信区间的覆盖率 |
| AB 实验 | [假设检验与功效](https://eriksas.github.io/ds-interview-lab/pages/power.html) | H₀ / H₁ 分布与功效；p 值是什么、不是什么；样本量计算器 |
| AB 实验 | [偷看与序贯检验](https://eriksas.github.io/ds-interview-lab/pages/peeking.html) | A/A 每天偷看的假阳性；Pocock 与 O'Brien-Fleming 门槛 |
| AB 实验 | [多重检验](https://eriksas.github.io/ds-interview-lab/pages/multiple.html) | FWER / FDR 方格模拟；拖动 p 值看 Bonferroni、Holm、BH |
| AB 实验 | [CUPED 方差缩减](https://eriksas.github.io/ds-interview-lab/pages/cuped.html) | 相关系数 ρ 与 1−ρ²；散点、置信区间、重复实验分布 |
| AB 实验 | [比率指标与 Delta 方法](https://eriksas.github.io/ds-interview-lab/pages/delta.html) | 朴素、Delta、按用户 Bootstrap、真实标准误对比；A/A 假阳性 |
| AB 实验 | [实验结果的陷阱](https://eriksas.github.io/ds-interview-lab/pages/pitfalls.html) | 只看付费用户、放量时的辛普森悖论、赢家诅咒、新奇效应 |
| 指标与业务 | [指标异动拆解](https://eriksas.github.io/ds-interview-lab/pages/decomposition.html) | 结构变化 vs 各自比率变化；视频平台 OGV 指标树 |
| 搜索推荐 | [推荐链路与排序指标](https://eriksas.github.io/ds-interview-lab/pages/recsys.html) | 召回 → 粗排 → 精排 → 重排；拖动列表算 P@K、R@K、NDCG、AUC、GAUC |
| 因果推断 | [双重差分 DID](https://eriksas.github.io/ds-interview-lab/pages/did.html) | 平行趋势被破坏时的偏差；事件研究图；交错上线时 TWFE 的偏误 |
| 因果推断 | [倾向得分匹配 PSM](https://eriksas.github.io/ds-interview-lab/pages/psm.html) | 倾向得分重叠、卡钳、有放回 / 无放回、SMD 平衡图 |
| 因果推断 | [断点回归与工具变量](https://eriksas.github.io/ds-interview-lab/pages/rdd-iv.html) | 带宽选择、凑单让 RDD 失效；鼓励设计与 Wald 估计（LATE） |
| 因果推断 | [增益模型 Uplift](https://eriksas.github.io/ds-interview-lab/pages/uplift.html) | 四类人群；S / T / X-Learner 与 X-Learner 权重方向；Qini 曲线 |
| 机器学习 | [分类阈值实验室](https://eriksas.github.io/ds-interview-lab/pages/threshold.html) | 混淆矩阵、精确率 / 召回率 / F1、ROC 与 PR 曲线、类别不平衡 |
| 机器学习 | [偏差-方差与正则化](https://eriksas.github.io/ds-interview-lab/pages/bias-variance.html) | 多项式拟合的欠拟合 / 过拟合；L1 与 L2 的系数路径 |
| 总复习 | [闪卡总复习](https://eriksas.github.io/ds-interview-lab/pages/flashcards.html) | 45 道自测题随机抽，可标记“会了 / 还不会” |

## 建议学习顺序

1. **打底**：中心极限定理与置信区间
2. **AB 实验主线**：假设检验与功效 → 偷看与序贯检验 → 多重检验 → CUPED → Delta 方法 → 实验结果的陷阱
3. **业务分析**：指标异动拆解 → 推荐链路与排序指标
4. **因果推断**：DID → PSM → RDD 与 IV → 增益模型
5. **机器学习**：分类阈值实验室 → 偏差-方差与正则化
6. **面试前**：闪卡总复习

每页底部的“上一页 / 下一页”按这个顺序走。

## 数字从哪里来

- 页面里写死的结论性数字（“试试看”的答案、误区和自测题里的数字）都来自 [`verify/`](verify/) 下的 Python 脚本，随机种子 42，输出存为同名 `_output.txt`。
- 浏览器里的实时模拟和 Python 做了对照：[`verify/js_sims.js`](verify/js_sims.js) 用 Node 加载网页里同一份 JS，按默认参数运行；[`verify/compare_js.py`](verify/compare_js.py) 用 numpy 独立实现同样的模拟逐项比较（公式类差异 ≤ 1e-6，模拟类差异 ≤ 4 倍蒙特卡洛标准误），结果见 [`verify/compare_js_output.txt`](verify/compare_js_output.txt)。部分结果还和 statsmodels、scikit-learn、scikit-uplift 的实现逐位核对（如 BH 校正、事件研究回归、AUC / NDCG、Qini 系数、Lasso / 岭回归）。细节见 [`verify/README.md`](verify/README.md)。
- 标“模拟”的都是随机生成的演示数据，不是真实业务数据。
- “和 X5 项目的联系”里的数字一律来自 [retail-uplift-ab](https://github.com/Eriksas/retail-uplift-ab) 的 `results/` 目录。

重新生成全部输出（需要 Python：numpy、scipy、statsmodels、scikit-learn、scikit-uplift；以及 Node）：

```bash
python verify/run_all.py
```

## 技术

- 纯静态 HTML + CSS + 原生 JavaScript，没有构建步骤；GitHub Pages 从 main 分支根目录发布（带 `.nojekyll`）。
- 图表用 D3 7.9.0，公式用 KaTeX 0.16.9，都从 cdnjs 引入。
- 模拟用带种子的随机数（mulberry32，默认 seed 42），点“再模拟一次”才换种子。
- “已学会”、闪卡记录和配色选择只存在浏览器的 localStorage 里，读不到也能正常使用。

```
index.html              首页（知识地图、学习顺序、已学会进度）
pages/<页面>.html       每个知识点一页
assets/css/site.css     全站样式（颜色变量、深色模式）
assets/js/core.js       随机数、统计函数、控件、图表辅助、页眉页脚
assets/js/registry.js   页面清单和学习顺序
assets/js/quiz.js       所有自测题（闪卡页也从这里读）
assets/js/pages/*.js    各页的模拟和图表；纯计算函数挂在 Lab.sim 上，Node 可以直接加载
verify/                 数字来源脚本、输出和浏览器模拟对照
```

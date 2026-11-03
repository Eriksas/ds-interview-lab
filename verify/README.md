# verify：页面数字的来源与核对

网站上写死的结论性数字（“试试看”的答案、误区里的数字、自测题答案）都来自这里的 Python 脚本，随机种子统一为 42。

| 脚本 | 输出 | 对应页面 |
|---|---|---|
| `01_power.py` | `01_power_output.txt` | 假设检验与功效 |
| `02_peeking.py` | `02_peeking_output.txt` | 偷看与序贯检验 |
| `03_multiple.py` | `03_multiple_output.txt` | 多重检验 |
| `04_cuped.py` | `04_cuped_output.txt` | CUPED 方差缩减 |
| `05_pitfalls.py` | `05_pitfalls_output.txt` | 实验结果的陷阱 |
| `06_decomposition.py` | `06_decomposition_output.txt` | 指标异动拆解 |
| `07_recsys.py` | `07_recsys_output.txt` | 推荐链路与排序指标 |
| `08_delta.py` | `08_delta_output.txt` | 比率指标与 Delta 方法 |
| `09_clt.py` | `09_clt_output.txt` | 中心极限定理与置信区间 |
| `10_did.py` | `10_did_output.txt` | 双重差分 DID |
| `11_psm.py` | `11_psm_output.txt` | 倾向得分匹配 PSM |
| `12_rdd_iv.py` | `12_rdd_iv_output.txt` | 断点回归与工具变量 |
| `13_uplift.py` | `13_uplift_output.txt` | 增益模型 Uplift |
| `14_threshold.py` | `14_threshold_output.txt` | 分类阈值实验室 |
| `15_bias_variance.py` | `15_bias_variance_output.txt` | 偏差-方差与正则化 |
| `compare_js.py` | `compare_js_output.txt` | 所有页面的浏览器模拟代码对照 |

辅助文件：`run_all.py`（重新生成全部输出）、`js_sims.js`（用 Node 运行网页模拟代码）、`js_export.js`（导出网页默认生成的数据）、`lint_site.py`（检查网页文件里有没有控制字符、缺页面、缺自测题）。

## 重新生成

在仓库根目录运行（Python 需要 numpy、scipy、statsmodels、scikit-learn、scikit-uplift；对照还需要 Node）：

```bash
python verify/run_all.py
```

`run_all.py` 依次运行每个 `NN_*.py`，把标准输出存成同名 `_output.txt`，最后运行 `compare_js.py`。只重跑某几页：`python verify/run_all.py 03 compare`。

## 浏览器模拟怎么和 Python 对照

1. 每个页面的模拟逻辑写成纯函数，挂在 `Lab.sim.<页面>` 上（`assets/js/pages/<页面>.js`），和画图代码分开。
2. `js_sims.js` 用 Node 的 `vm` 模块加载**网页里同一份** `core.js` 和页面脚本，按页面默认参数运行，输出 JSON。
3. `compare_js.py` 用 numpy 独立实现同样的模拟，逐项比较：
   - 公式类的量（功效、样本量、门槛值、拆解结果、排序指标等）：差异 ≤ 1e-6（部分 ≤ 1e-9）；
   - 随机模拟的量（假阳性率、覆盖率、偏差、标准差等）：|JS − Python| ≤ 4 × 合并蒙特卡洛标准误。模拟类检查有上百项，用 3 倍时纯靠运气也会有约 0.3 项误报（多重检验问题，见网站“多重检验”页），4 倍时约 0.006 项。
4. 浏览器用 mulberry32 随机数，Python 用 numpy 的 PCG64，两边随机数序列不同，比较的是“同样参数下结果的分布一致”，不是逐个数字相等。多数检查项还会把模拟次数放大几十倍再比一次，让容差更紧。
5. 需要逐位一致的地方，用同一份数据比：要么两边用同一个确定性公式生成数据（如 RDD 局部线性回归、Qini 系数），要么用 `js_export.js` 把网页生成的数据导出来，在 Python 里用 sklearn / numpy 重算（如 Lasso / 岭回归系数、多项式拟合）。
6. 因为随机数序列不同，浏览器默认（seed 42）显示的单次模拟结果和这里 Python 单次模拟的数字会略有不同；页面上引用单次模拟时写作“verify 里的一次模拟”，结论性数字尽量用多次重复的平均或理论值。

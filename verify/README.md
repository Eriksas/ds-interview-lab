# verify：页面数字的来源与核对

网站上写死的结论性数字（“试试看”的答案、误区里的数字、自测题答案）都来自这里的 Python 脚本，随机种子统一为 42。

| 脚本 | 输出 | 对应页面 |
|---|---|---|
| `01_power.py` | `01_power_output.txt` | 假设检验与功效 |
| `compare_js.py` | `compare_js_output.txt` | 所有页面的浏览器模拟代码对照 |

## 重新生成

在仓库根目录运行（Python 环境需要 numpy、scipy、statsmodels、scikit-learn；对照还需要 Node）：

```bash
E:/retail-uplift-ab/.venv/Scripts/python.exe verify/run_all.py
```

`run_all.py` 依次运行每个 `NN_*.py`，把标准输出存成同名 `_output.txt`，最后运行 `compare_js.py`。

## 浏览器模拟怎么和 Python 对照

1. 每个页面的模拟逻辑写成纯函数，挂在 `Lab.sim.<页面>` 上（`assets/js/pages/<页面>.js`），和画图代码分开。
2. `js_sims.js` 用 Node 的 `vm` 模块加载**网页里同一份** `core.js` 和页面脚本，按页面默认参数、seed 42 运行，输出 JSON。
3. `compare_js.py` 用 numpy 独立实现同样的模拟，逐项比较：
   - 公式类的量（功效、样本量、门槛值等）：差异 ≤ 1e-6；
   - 随机模拟的量（假阳性率、覆盖率等）：|JS − Python| ≤ 4 × 合并蒙特卡洛标准误。模拟类检查有上百项，用 3 倍时纯靠运气也会有约 0.3 项误报（多重检验问题，见网站“多重检验”页），4 倍时约 0.006 项。
4. 浏览器用 mulberry32 随机数，Python 用 numpy 的 PCG64，两边随机数序列不同，比较的是“同样参数下结果的分布一致”，不是逐个数字相等。默认参数之外，多数检查项还会把模拟次数放大几十倍再比一次，让容差更紧。

"""页面 10：双重差分 DID、事件研究、交错上线时 TWFE 的偏误。

实验 1 / 2 的模拟面板（页面同款）：处理组、对照组各 30 个单位，时期 t = −6..5，t ≥ 0 为处理后。
y_it = 基础水平（对照 10、处理 11）+ 单位效应 N(0,1) + 0.15·t + s·t·处理组 + τ·处理组·[t≥0] + N(0, 0.6²)
s 是“处理组事前多出的趋势”（平行趋势被破坏的程度）。

实验 3（无噪声的期望值）：早上线组 g=4、晚上线组 g=8、可选的从未上线组，时期 1..10；
处理后第 e 期的效应 = base + growth·e。
"""
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

SEED = 42
PERIODS = np.arange(-6, 6)


def panel2(n, s, tau, rng):
    rows = []
    for g in (0, 1):
        fe = rng.normal(0, 1, n)
        for i in range(n):
            for t in PERIODS:
                y = (11 if g else 10) + fe[i] + 0.15 * t + s * t * g + tau * g * (t >= 0) + rng.normal(0, 0.6)
                rows.append((g * 1000 + i, g, t, y))
    return pd.DataFrame(rows, columns=["id", "treat", "t", "y"])


def did2x2(df):
    m = df.assign(post=df.t >= 0).groupby(["treat", "post"]).y.mean()
    return (m[1, True] - m[1, False]) - (m[0, True] - m[0, False])


def event_study_closed(df):
    """平衡面板、两组：β_k = 处理组 (y_k − y_{−1}) 的均值 − 对照组的；标准误用单位层面的差值方差。"""
    w = df.pivot(index="id", columns="t", values="y")
    treat = df.groupby("id").treat.first()
    out = {}
    for k in PERIODS:
        if k == -1:
            continue
        d = w[k] - w[-1]
        a, b = d[treat == 1], d[treat == 0]
        out[k] = (a.mean() - b.mean(), np.sqrt(a.var(ddof=1) / a.size + b.var(ddof=1) / b.size))
    return out


T = 10


def stagger(base, growth, never=True):
    cohorts = [4, 8] + ([None] if never else [])
    D = np.zeros((len(cohorts), T))
    tau = np.zeros((len(cohorts), T))
    for i, g in enumerate(cohorts):
        for t in range(1, T + 1):
            if g is not None and t >= g:
                D[i, t - 1] = 1
                tau[i, t - 1] = base + growth * (t - g)
    return cohorts, D, tau


def twfe_demean(D, Y):
    Dd = D - D.mean(1, keepdims=True) - D.mean(0, keepdims=True) + D.mean()
    Yd = Y - Y.mean(1, keepdims=True) - Y.mean(0, keepdims=True) + Y.mean()
    return (Dd * Yd).sum() / (Dd ** 2).sum()


def cs(cohorts, Y, D):
    """Callaway-Sant'Anna 思路：每个 (g, t) 用从未处理组（没有则用尚未处理组）做对照，以 g−1 期为基期。"""
    cells = []
    for i, g in enumerate(cohorts):
        if g is None:
            continue
        for t in range(g, T + 1):
            ctrl = [j for j, h in enumerate(cohorts) if h is None]
            if not ctrl:
                ctrl = [j for j, h in enumerate(cohorts) if h is not None and h > t]
            if not ctrl:
                continue
            c = np.mean([Y[j, t - 1] - Y[j, g - 2] for j in ctrl])
            cells.append((i, t, (Y[i, t - 1] - Y[i, g - 2]) - c))
    return cells


def main():
    print("== 1. 2×2 DID：真实效应 τ=2，每组 30 个单位")
    for s in [0.0, 0.2, -0.1]:
        df = panel2(30, s, 2.0, np.random.default_rng(SEED))
        bias_theory = s * (PERIODS[PERIODS >= 0].mean() - PERIODS[PERIODS < 0].mean())
        print(f"事前趋势差 s={s:+.1f}：DID 估计 {did2x2(df):.3f}，理论偏差 {bias_theory:+.2f}（= s × (事后平均 t − 事前平均 t) = s × 6）")
    df0 = panel2(30, 0.2, 0.0, np.random.default_rng(SEED))
    fit = smf.ols("y ~ treat:post + C(id) + C(t)", data=df0.assign(post=(df0.t >= 0).astype(int))).fit(cov_type="cluster", cov_kwds={"groups": df0.id})
    print(f"τ=0、s=+0.2：TWFE 回归系数 {fit.params['treat:post']:.3f}，聚类标准误 {fit.bse['treat:post']:.3f}，p={fit.pvalues['treat:post']:.2g}（把趋势当成了效应）")

    print("\n== 2. 事件研究：闭式解 vs statsmodels 回归（单位、时期固定效应 + 事件哑变量，按单位聚类）")
    df = panel2(30, 0.2, 2.0, np.random.default_rng(SEED))
    es = event_study_closed(df)
    d2 = df.copy()
    for k in PERIODS:
        if k != -1:
            d2[f"e{k + 6}"] = ((d2.t == k) & (d2.treat == 1)).astype(int)
    formula = "y ~ " + " + ".join(f"e{k + 6}" for k in PERIODS if k != -1) + " + C(id) + C(t)"
    fit = smf.ols(formula, data=d2).fit(cov_type="cluster", cov_kwds={"groups": d2.id})
    maxdiff = max(abs(es[k][0] - fit.params[f"e{k + 6}"]) for k in es)
    ratio = np.mean([es[k][1] / fit.bse[f"e{k + 6}"] for k in es])
    print(f"系数最大差异 {maxdiff:.2e}；闭式标准误 / 回归聚类标准误 平均 {ratio:.3f}（聚类标准误带小样本修正，比值略小于 1 正常）")
    print("s=+0.2 时的事件研究系数（理论值：k<0 时 0.2·(k+1)；k≥0 时 2 + 0.2·(k+1)）：")
    print("  " + "  ".join(f"k={k}: {es[k][0]:.2f}" for k in es))

    print("\n== 3. 交错上线（早上线 g=4、晚上线 g=8；无噪声期望值）")
    rng = np.random.default_rng(SEED)
    for never in [False, True]:
        for base, growth in [(1, 0), (1, 0.5), (0, 1)]:
            cohorts, D, tau = stagger(base, growth, never)
            lvl = np.array([10, 9, 8][: len(cohorts)])[:, None]
            Y = lvl + 0.3 * np.arange(1, T + 1)[None, :] + tau * D
            b = twfe_demean(D, Y)
            # 单位层面回归核对：每组 10 个单位，加一点单位效应（不影响 TWFE）
            rows = []
            for i in range(len(cohorts)):
                for u in range(10):
                    a = rng.normal()
                    for t in range(1, T + 1):
                        rows.append((i * 100 + u, t, D[i, t - 1], Y[i, t - 1] + a))
                df3 = pd.DataFrame(rows, columns=["id", "t", "D", "y"])
            b_reg = smf.ols("y ~ D + C(id) + C(t)", data=df3).fit().params["D"]
            att = tau[D == 1].mean()
            cells = cs(cohorts, Y, D)
            cs_att = np.mean([c[2] for c in cells])
            cell_true = np.mean([tau[i, t - 1] for i, t, _ in cells])
            print(f"{'有' if never else '没有'}从未上线组，base={base}, growth={growth}：TWFE {b:.4f}（回归 {b_reg:.4f}）；真实 ATT {att:.4f}；"
                  f"CS {cs_att:.4f}（{len(cells)} 个可识别格子，这些格子的真实平均 {cell_true:.4f}）")


if __name__ == "__main__":
    main()

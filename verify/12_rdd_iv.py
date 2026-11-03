"""页面 12：断点回归 RDD 与工具变量 IV。

RDD 模拟（页面同款）：4,000 个订单，原始下单金额 x0 ~ N(100, 25²) 截断在 [40, 160]（超出就重抽）；用户投入度 u ~ N(0,1)。
满 100 元可用满减券。若“凑单”打开：x0 落在 [90,100) 且 u>0 的用户，以概率 q 凑单到 100 + U(0,5)。
结果 Y（30 天复购金额，模拟）= 60 + 0.3d − 0.004d² + 0.0001d³ + 5u + 3·1[x≥100] + N(0, 5²)，d = x − 100，真实跳跃 = 3。
估计：断点两侧各做带宽 h 内、三角核加权的局部线性回归，跳跃 = 右侧截距 − 左侧截距。

IV 模拟（鼓励设计）：N 个用户随机收到推送 Z（各 50%）。三类人：依从者（收到推送才用新功能）、
总是接受者（不管推送都用）、从不接受者（都不用）。基线时长：总是接受者 60，依从者 40，从不接受者 30（分钟）；
使用新功能的效应：依从者 τ_c，总是接受者 τ_a，从不接受者设为与依从者相同（数据里看不到）。Y 加 N(0, 15²) 噪声。
"""
import numpy as np
import statsmodels.api as sm

SEED = 42
C = 100.0


def rdd_gen(n, manip, q, rng):
    x = rng.normal(100, 25, n)
    bad = (x < 40) | (x > 160)
    while bad.any():  # 截断正态：超出范围就重抽
        x[bad] = rng.normal(100, 25, bad.sum())
        bad = (x < 40) | (x > 160)
    u = rng.normal(size=n)
    if manip:
        mv = (x >= 90) & (x < 100) & (u > 0) & (rng.random(n) < q)
        x = np.where(mv, 100 + 5 * rng.random(n), x)
    d = x - C
    y = 60 + 0.3 * d - 0.004 * d ** 2 + 0.0001 * d ** 3 + 5 * u + 3 * (x >= C) + rng.normal(0, 5, n)
    return x, y


def local_linear(x, y, h):
    """两侧各自三角核加权的局部线性回归；返回 (跳跃, HC0 标准误, 带宽内样本数)。"""
    ests, vars_, n = [], [], 0
    for side in (x < C, x >= C):
        m = side & (np.abs(x - C) <= h)
        d = x[m] - C
        w = 1 - np.abs(d) / h
        X = np.c_[np.ones(m.sum()), d]
        fit = sm.WLS(y[m], X, weights=w).fit(cov_type="HC0")
        ests.append(fit.params[0])
        vars_.append(fit.bse[0] ** 2)
        n += m.sum()
    return ests[1] - ests[0], np.sqrt(sum(vars_)), n


def local_linear_closed(x, y, h):
    """与页面 JS 相同的闭式解（用来和 statsmodels 对照）。"""
    out = []
    for side in (x < C, x >= C):
        m = side & (np.abs(x - C) <= h)
        d = x[m] - C
        w = 1 - np.abs(d) / h
        X = np.c_[np.ones(m.sum()), d]
        A = np.linalg.inv(X.T @ (w[:, None] * X))
        b = A @ X.T @ (w * y[m])
        e = y[m] - X @ b
        meat = X.T @ ((w ** 2 * e ** 2)[:, None] * X)
        V = A @ meat @ A
        out.append((b[0], V[0, 0]))
    return out[1][0] - out[0][0], np.sqrt(out[0][1] + out[1][1])


TYPES = ("complier", "always", "never")
BASE = {"complier": 40.0, "always": 60.0, "never": 30.0}


def iv_gen(n, pc, pa, tc, ta, rng):
    typ = rng.choice(3, size=n, p=[pc, pa, 1 - pc - pa])
    z = rng.random(n) < 0.5
    d = np.where(typ == 1, True, np.where(typ == 0, z, False))
    base = np.choose(typ, [BASE["complier"], BASE["always"], BASE["never"]])
    eff = np.choose(typ, [tc, ta, tc])
    y = base + eff * d + rng.normal(0, 15, n)
    return z, d, y


def iv_est(z, d, y):
    naive = y[d].mean() - y[~d].mean()
    itt = y[z].mean() - y[~z].mean()
    fs = d[z].mean() - d[~z].mean()
    wald = itt / fs
    r = y - wald * d
    se = np.sqrt(r[z].var(ddof=1) / z.sum() + r[~z].var(ddof=1) / (~z).sum()) / abs(fs)
    return dict(naive=naive, itt=itt, fs=fs, wald=wald, se=se)


def main():
    print("== 1. RDD：seed 42 的一份数据，不凑单，带宽 15")
    x, y = rdd_gen(4000, False, 0.6, np.random.default_rng(SEED))
    est, se, n = local_linear(x, y, 15)
    est2, se2 = local_linear_closed(x, y, 15)
    print(f"statsmodels WLS：跳跃 {est:.3f}（HC0 标准误 {se:.3f}，带宽内 {n} 个）；闭式解 {est2:.3f}（{se2:.3f}）；真实 3")

    print("\n== 2. RDD：重复 500 次的偏差和标准差")
    for manip in (False, True):
        for h in (5, 15, 40, 60):
            rng = np.random.default_rng(SEED)
            e = np.array([local_linear_closed(*rdd_gen(4000, manip, 0.6, rng), h)[0] for _ in range(500)])
            print(f"{'凑单（q=0.6）' if manip else '不凑单'}，带宽 {h:>2}：偏差 {e.mean() - 3:+.3f} 标准差 {e.std(ddof=1):.3f}")
    rng = np.random.default_rng(SEED)
    x, _ = rdd_gen(4000, True, 0.6, rng)
    l, r_ = ((x >= 95) & (x < 100)).sum(), ((x >= 100) & (x < 105)).sum()
    print(f"凑单时 [95,100) 有 {l} 单，[100,105) 有 {r_} 单（不凑单时两边大致相等）")

    print("\n== 3. IV 鼓励设计：N=10,000，依从者 30%、总是接受者 20%，依从者效应 10、总是接受者效应 15")
    z, d, y = iv_gen(10_000, 0.3, 0.2, 10, 15, np.random.default_rng(SEED))
    r = iv_est(z, d, y)
    print("seed 42：" + "，".join(f"{k}={v:.3f}" for k, v in r.items()))
    pc, pa, tc, ta = 0.3, 0.2, 10, 15
    pn = 1 - pc - pa
    users = pa / 2 + pa / 2 + pc / 2  # 使用者：总是接受者 + 收到推送的依从者
    naive_th = ((pa * (BASE["always"] + ta) + pc / 2 * (BASE["complier"] + tc)) / (pa + pc / 2)
                - (pc / 2 * BASE["complier"] + pn * BASE["never"]) / (pc / 2 + pn))
    print(f"理论：ITT = {pc * tc:.2f}，第一阶段 = {pc:.2f}，Wald = LATE = {tc}；朴素比较的期望 = {naive_th:.3f}；ATE = {pc * tc + pa * ta + pn * tc:.2f}")
    # 2SLS 核对：Wald 估计等于 Cov(Z,Y)/Cov(Z,D)
    print(f"Cov(Z,Y)/Cov(Z,D) = {np.cov(z, y)[0, 1] / np.cov(z, d)[0, 1]:.6f}（应等于 Wald）")

    print("\n== 4. 弱工具变量：重复 1,000 次 Wald 估计（N=10,000）")
    for pc in (0.3, 0.05, 0.02):
        rng = np.random.default_rng(SEED)
        w = np.array([iv_est(*iv_gen(10_000, pc, 0.2, 10, 15, rng))["wald"] for _ in range(1000)])
        q = np.percentile(w, [2.5, 97.5])
        print(f"依从者 {pc:.0%}：Wald 中位数 {np.median(w):.2f}，标准差 {w.std(ddof=1):.2f}，2.5%–97.5% 分位 [{q[0]:.1f}, {q[1]:.1f}]")


if __name__ == "__main__":
    main()

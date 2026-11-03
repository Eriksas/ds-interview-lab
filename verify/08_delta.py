"""页面 8：比率指标与 Delta 方法。

模拟设定（页面同款）：每组 n 个用户；用户 i 的曝光数 N_i ~ 几何分布（取值 1,2,…，均值 m）；
用户自己的点击倾向 p_i ~ Beta，均值 0.05、标准差 sd（sd=0 时所有人相同）；点击 C_i ~ Binomial(N_i, p_i)。
指标 CTR = ΣC / ΣN。比较四种标准误：朴素（把每次曝光当独立样本）、Delta、按用户 Bootstrap、真实值（重复实验的标准差）。
"""
import numpy as np
import statsmodels.api as sm

SEED = 42
MU = 0.05


def gen(n, m, sd, rng):
    N = rng.geometric(1 / m, size=n)
    if sd <= 0:
        p = np.full(n, MU)
    else:
        k = MU * (1 - MU) / sd ** 2 - 1
        p = rng.beta(MU * k, (1 - MU) * k, size=n)
    C = rng.binomial(N, p)
    return C, N


def ratio(C, N):
    return C.sum() / N.sum()


def se_naive(C, N):
    R = ratio(C, N)
    return np.sqrt(R * (1 - R) / N.sum())


def se_delta(C, N):
    n = C.size
    R = ratio(C, N)
    return np.sqrt(np.var(C - R * N, ddof=1) / (n * N.mean() ** 2))


def se_boot(C, N, B, rng):
    n = C.size
    idx = rng.integers(0, n, size=(B, n))
    return (C[idx].sum(axis=1) / N[idx].sum(axis=1)).std(ddof=1)


def experiment(n, m, sd, reps, rng):
    """重复 reps 次 A/A 实验，返回真实标准差、平均朴素 / Delta 标准误、两种方法的 A/A 假阳性率。"""
    Rs, sn, sdl, fp_n, fp_d = [], [], [], 0, 0
    for _ in range(reps):
        Ca, Na = gen(n, m, sd, rng)
        Cb, Nb = gen(n, m, sd, rng)
        Rs.append(ratio(Ca, Na))
        sn.append(se_naive(Ca, Na))
        sdl.append(se_delta(Ca, Na))
        d = ratio(Cb, Nb) - ratio(Ca, Na)
        fp_n += abs(d / np.hypot(se_naive(Ca, Na), se_naive(Cb, Nb))) > 1.959964
        fp_d += abs(d / np.hypot(se_delta(Ca, Na), se_delta(Cb, Nb))) > 1.959964
    return dict(true=np.std(Rs, ddof=1), naive=np.mean(sn), delta=np.mean(sdl), fpr_naive=fp_n / reps, fpr_delta=fp_d / reps)


def main():
    print("== 1. 默认：每组 1,000 个用户，人均曝光 10，用户 CTR 标准差 0.04（2,000 次重复）")
    r = experiment(1000, 10, 0.04, 2000, np.random.default_rng(SEED))
    print(f"真实标准误 {r['true']:.5f}；平均朴素 {r['naive']:.5f}（是真实的 {r['naive'] / r['true']:.3f}）；平均 Delta {r['delta']:.5f}（{r['delta'] / r['true']:.3f}）")
    print(f"A/A 假阳性率：朴素 {r['fpr_naive']:.4f}，Delta {r['fpr_delta']:.4f}")
    rng = np.random.default_rng(SEED)
    C, N = gen(1000, 10, 0.04, rng)
    print(f"seed 42 的一组数据：CTR {ratio(C, N):.4f}，朴素 {se_naive(C, N):.5f}，Delta {se_delta(C, N):.5f}，Bootstrap(B=500) {se_boot(C, N, 500, rng):.5f}")

    print("\n== 2. Delta 标准误 = 曝光层面回归按用户聚类的标准误（相差 n/(n-1) 这类小样本修正）")
    uid = np.repeat(np.arange(C.size), N)
    clicks = np.concatenate([np.r_[np.ones(c), np.zeros(nn - c)] for c, nn in zip(C, N)])
    fit = sm.OLS(clicks, np.ones_like(clicks)).fit(cov_type="cluster", cov_kwds={"groups": uid, "use_correction": False})
    print(f"聚类标准误（不做小样本修正）{fit.bse[0]:.6f}；Delta {se_delta(C, N):.6f}；比值 {se_delta(C, N) / fit.bse[0]:.6f}，sqrt(n/(n-1))={np.sqrt(1000 / 999):.6f}")

    print("\n== 3. 试试看")
    for label, args in [("用户之间没有差异（sd=0）", (1000, 10, 0.0)), ("人均曝光 40", (1000, 40, 0.04)), ("人均曝光 2", (1000, 2, 0.04))]:
        r = experiment(*args, 2000, np.random.default_rng(SEED))
        print(f"{label}：朴素/真实 {r['naive'] / r['true']:.3f}，Delta/真实 {r['delta'] / r['true']:.3f}；A/A 假阳性 朴素 {r['fpr_naive']:.4f} Delta {r['fpr_delta']:.4f}")


if __name__ == "__main__":
    main()

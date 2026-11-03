"""页面 3：多重检验（FWER、FDR、Bonferroni、Holm、BH）。"""
import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

SEED = 42
Z = stats.norm


def bh(p, alpha=0.05):
    p = np.asarray(p, float)
    m = p.size
    order = np.argsort(p)
    ok = p[order] <= alpha * np.arange(1, m + 1) / m
    k = np.max(np.nonzero(ok)[0]) + 1 if ok.any() else 0
    rej = np.zeros(m, bool)
    rej[order[:k]] = True
    return rej


def holm(p, alpha=0.05):
    p = np.asarray(p, float)
    m = p.size
    order = np.argsort(p)
    rej = np.zeros(m, bool)
    for i, idx in enumerate(order):
        if p[idx] <= alpha / (m - i):
            rej[idx] = True
        else:
            break
    return rej


def bonf(p, alpha=0.05):
    return np.asarray(p) <= alpha / len(p)


def none(p, alpha=0.05):
    return np.asarray(p) <= alpha


METHODS = {"不校正": none, "Bonferroni": bonf, "Holm": holm, "BH": bh}


def simulate(m, pi1, lam, sims, rng, alpha=0.05):
    """每次模拟 m 个检验，其中 round(m*pi1) 个真有效（z 的期望为 lam）。返回各方法的 FWER、FDR、功效、平均拒绝数。"""
    m1 = int(round(m * pi1))
    truth = np.zeros(m, bool)
    truth[:m1] = True
    res = {k: dict(fwer=0.0, fdr=0.0, power=0.0, R=0.0) for k in METHODS}
    for _ in range(sims):
        z = rng.normal(size=m) + lam * truth
        p = 2 * Z.sf(np.abs(z))
        for name, f in METHODS.items():
            rej = f(p, alpha)
            V = np.sum(rej & ~truth)
            R = rej.sum()
            res[name]["fwer"] += V > 0
            res[name]["fdr"] += V / max(R, 1)
            res[name]["power"] += (np.sum(rej & truth) / m1) if m1 else 0
            res[name]["R"] += R
    for name in res:
        for k in res[name]:
            res[name][k] /= sims
    return res


def main():
    print("== 1. 交互实验 2 默认的 8 个 p 值（α=0.05）")
    p = np.array([0.001, 0.014, 0.016, 0.022, 0.03, 0.045, 0.3, 0.7])
    m = p.size
    print("BH 门槛 iα/m：", np.round(0.05 * np.arange(1, m + 1) / m, 5).tolist())
    print("p ≤ iα/m：", (np.sort(p) <= 0.05 * np.arange(1, m + 1) / m).tolist())
    for name, f in METHODS.items():
        print(f"{name:<11} 拒绝：", f(p).astype(int).tolist(), "共", int(f(p).sum()), "个")
    for meth, name in [("bonferroni", "Bonferroni"), ("holm", "Holm"), ("fdr_bh", "BH")]:
        assert (multipletests(p, 0.05, method=meth)[0] == METHODS[name](p)).all()
    print("与 statsmodels.multipletests 结果一致")
    p2 = p.copy(); p2[4] = 0.035
    p3 = p2.copy(); p3[3] = 0.027
    print("第 5 名改成 0.035：BH 拒绝", int(bh(p2).sum()), "个", bh(p2).astype(int).tolist())
    print("再把第 4 名改成 0.027：BH 拒绝", int(bh(p3).sum()), "个", bh(p3).astype(int).tolist())

    print("\n== 2. 自测题的 6 个 p 值")
    q = np.array([0.004, 0.019, 0.022, 0.041, 0.042, 0.38])
    print("BH 门槛：", np.round(0.05 * np.arange(1, 7) / 6, 5).tolist())
    for name, f in METHODS.items():
        print(f"{name:<11} 拒绝：", f(q).astype(int).tolist(), "共", int(f(q).sum()), "个")
    assert (multipletests(q, 0.05, method="fdr_bh")[0] == bh(q)).all()

    print("\n== 3. 不校正时，m 个独立的真零假设至少一个显著的概率 1-0.95^m")
    for mm in [1, 5, 10, 20, 50]:
        print(f"m={mm:>2}: {1 - 0.95 ** mm:.4f}")

    print("\n== 4. 模拟：m=20 个检验，25% 真有效（z 期望 3），2 万次")
    lam = 3.0
    print(f"单个检验不校正时的功效：{Z.cdf(lam - 1.959964) + Z.cdf(-lam - 1.959964):.4f}")
    for pi1 in [0.25, 0.0]:
        res = simulate(20, pi1, lam, 20_000, np.random.default_rng(SEED))
        print(f"真有效占比 {pi1:.0%}：")
        for name, r in res.items():
            print(f"  {name:<11} 平均拒绝 {r['R']:.2f} 个  FWER {r['fwer']:.4f}  FDR {r['fdr']:.4f}  功效 {r['power']:.4f}")
    print(f"BH 理论上限：FDR ≤ π0·α = 0.75×0.05 = {0.75 * 0.05:.4f}")


if __name__ == "__main__":
    main()

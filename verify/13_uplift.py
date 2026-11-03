"""页面 13：增益模型（Uplift）。

实验 1：四类人群（反事实定义）的确定性计算。
实验 2：S / T / X-Learner 的模拟。x ~ U(0,1)，Y = μ0(x) + τ(x)·T + N(0,1)，μ0(x) = 3 + 2 sin(2πx)（复杂），
        τ(x) = 0.5 + x（简单）。第一阶段模型：20 个分箱的分箱均值；X-Learner 第二阶段：线性回归；
        S-Learner：分箱 + 处理变量的加性模型（只能估出一个常数效应）。误差 = 在 [0,1] 网格上与真实 τ 的均方根误差。
实验 3：Qini 曲线。n=10,000，随机分组各 50%；x ~ U(0,1) 是活跃度；
        不发时购买概率 base = 0.2 + 0.6x；发短信的增益 τ = 0.12(1 − x) − 0.01（不活跃的人更容易被说服）。
        增益模型的分数 = τ(x) + 噪声（标准差 = 噪声倍数 × sd(τ)）；响应模型的分数 = base + τ（发了以后的购买概率）。
        Qini 系数按 scikit-uplift 的定义（negative_effect=True），并与 sklift.metrics.qini_auc_score 核对。
"""
import json
import pathlib
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

import numpy as np
from sklearn.metrics import auc

SEED = 42

# ---------- 实验 1 ----------


def four_groups(pp, ps, pl, budget):
    """说服型 pp、确定型 ps、无望型 pl、反感型 pd=1−其余。返回每发 1,000 人带来的增量购买（随机 / 响应模型 / 增益模型）。"""
    pd = 1 - pp - ps - pl
    random_ = (pp - pd) * 1000
    # 响应模型按“发了会不会买”排序：说服型和确定型并列第一，从中随机挑；名额还有剩，再从无望型和反感型里随机挑
    top, rest = pp + ps, pl + pd
    inc = budget * pp / top if budget <= top else pp - (budget - top) * pd / rest
    resp = inc / budget * 1000
    # 增益模型（知道真实增益）：先说服型（+1），再确定型和无望型（0），最后才是反感型（−1）
    inc = min(budget, pp) - max(0.0, budget - (1 - pd))
    upl = inc / budget * 1000
    return random_, resp, upl


# ---------- 实验 2 ----------
B1 = 20


def mu0(x):
    return 3 + 2 * np.sin(2 * np.pi * x)


def tau(x):
    return 0.5 + x


def binned(x, y, xq):
    idx = np.minimum((x * B1).astype(int), B1 - 1)
    glob = y.mean()
    means = np.array([y[idx == b].mean() if (idx == b).any() else glob for b in range(B1)])
    return means[np.minimum((xq * B1).astype(int), B1 - 1)]


def linfit(x, y, xq):
    X = np.c_[np.ones_like(x), x]
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    return b[0] + b[1] * xq


GRID = (np.arange(200) + 0.5) / 200


def learners(n, e, rng):
    x = rng.random(n)
    t = rng.random(n) < e
    y = mu0(x) + tau(x) * t + rng.normal(0, 1, n)
    m1 = lambda q: binned(x[t], y[t], q)
    m0 = lambda q: binned(x[~t], y[~t], q)
    tT = m1(GRID) - m0(GRID)
    idx = np.minimum((x * B1).astype(int), B1 - 1)
    num = den = 0.0
    for b in range(B1):
        tb, cb = (idx == b) & t, (idx == b) & ~t
        if tb.any() and cb.any():
            w = tb.sum() * cb.sum() / (tb.sum() + cb.sum())
            num += w * (y[tb].mean() - y[cb].mean())
            den += w
    tS = np.full_like(GRID, num / den)
    t1 = linfit(x[t], y[t] - m0(x[t]), GRID)
    t0 = linfit(x[~t], m1(x[~t]) - y[~t], GRID)
    out = dict(S=tS, T=tT, X=e * t0 + (1 - e) * t1, Xrev=(1 - e) * t0 + e * t1)
    return {k: float(np.sqrt(np.mean((v - tau(GRID)) ** 2))) for k, v in out.items()}


# ---------- 实验 3 ----------


def qini_data(n, rng):
    x = rng.random(n)
    t = (rng.random(n) < 0.5).astype(int)
    base = 0.2 + 0.6 * x
    tu = 0.12 * (1 - x) - 0.01
    y = (rng.random(n) < base + tu * t).astype(int)
    return x, t, y, base, tu


def qini_curve(y, score, t):
    """与 scikit-uplift 的 qini_curve 相同：按分数从高到低，只在分数变化处取点。"""
    order = np.argsort(score, kind="mergesort")[::-1]
    y, score, t = y[order], score[order], t[order]
    yt, yc = y * t, y * (1 - t)
    distinct = np.where(np.diff(score))[0]
    thr = np.r_[distinct, score.size - 1]
    nt = np.cumsum(t)[thr]
    nall = thr + 1
    nc = nall - nt
    ct, cc = np.cumsum(yt)[thr], np.cumsum(yc)[thr]
    vals = ct - cc * np.divide(nt, nc, out=np.zeros_like(nt, dtype=float), where=nc != 0)
    return np.r_[0, nall], np.r_[0, vals]


def qini_coef(y, score, t):
    xa, ya = qini_curve(y, score, t)
    xp, yp = qini_curve(y, y * t - y * (1 - t), t)
    base = auc([0, xp[-1]], [0, yp[-1]])
    return (auc(xa, ya) - base) / (auc(xp, yp) - base)


def top_share(y, score, t, frac):
    xa, ya = qini_curve(y, score, t)
    k = np.searchsorted(xa, frac * xa[-1])
    return ya[k] / ya[-1]


def main():
    print("== 1. 四类人群：说服型 10%、确定型 40%、无望型 45%、反感型 5%")
    pp, ps, pl = 0.10, 0.40, 0.45
    print(f"全部都发的平均增量 ATE = {pp - (1 - pp - ps - pl):.2%}")
    for budget in (0.1, 0.2, 0.5, 0.97):
        r, rp, u = four_groups(pp, ps, pl, budget)
        print(f"只发 {budget:.0%}：每发 1,000 人的增量购买  随机 {r:.0f}  响应模型 {rp:.0f}  增益模型 {u:.0f}")

    print("\n== 2. S / T / X-Learner 的误差（n=1,000，重复 300 次，均方根误差的平均）")
    for e in (0.03, 0.05, 0.1, 0.3, 0.5):
        rng = np.random.default_rng(SEED)
        res = [learners(1000, e, rng) for _ in range(300)]
        m = {k: np.mean([r[k] for r in res]) for k in res[0]}
        print(f"处理组占 {e:.0%}：S {m['S']:.3f}  T {m['T']:.3f}  X（权重 g=e）{m['X']:.3f}  X（权重反过来）{m['Xrev']:.3f}")

    print("\n== 3. Qini（n=10,000，seed 42）")
    from sklift.metrics import qini_auc_score
    x, t, y, base, tu = qini_data(10_000, np.random.default_rng(SEED))
    sd = tu.std()
    for noise in (0.0, 1.0, 3.0):
        s = tu + noise * sd * np.random.default_rng(SEED + 1).normal(size=x.size)
        q = qini_coef(y, s, t)
        q_sk = qini_auc_score(y, s, t, negative_effect=True)
        print(f"增益模型（噪声 {noise:.0f} 倍）：Qini 系数 {q:.4f}（sklift {q_sk:.4f}）；前 30% 拿到全部增量的 {top_share(y, s, t, 0.3):.1%}")
    resp = base + tu
    print(f"响应模型：Qini 系数 {qini_coef(y, resp, t):.4f}（sklift {qini_auc_score(y, resp, t, negative_effect=True):.4f}）；前 30% 拿到 {top_share(y, resp, t, 0.3):.1%}")
    print(f"总增量（全部发送的增量购买人数）≈ {qini_curve(y, tu, t)[1][-1]:.1f}；真实平均增益 {tu.mean():.4f}")

    print("\n== 4. X5 项目（retail-uplift-ab/results）")
    R = pathlib.Path("E:/retail-uplift-ab/results")
    if R.exists():
        s3 = json.loads((R / "stage3_summary.json").read_text(encoding="utf-8"))
        s4 = json.loads((R / "stage4_summary.json").read_text(encoding="utf-8"))
        s5 = json.loads((R / "stage5_summary.json").read_text(encoding="utf-8"))
        print(f"最终模型 {s3['最终模型（按验证集 Qini 系数）']}：测试集 Qini {s3['最终模型·测试集']['Qini 系数']:.4f}，响应模型 {s3['响应模型·测试集']['Qini 系数']:.4f}")
        b = s4["bootstrap（B=500）"]
        print(f"Qini 95% 区间 [{b['最终模型 Qini']['95%区间下限']:.4f}, {b['最终模型 Qini']['95%区间上限']:.4f}]；与第二名之差 [{b['Qini 差（最终 − 第二名）']['95%区间下限']:.4f}, {b['Qini 差（最终 − 第二名）']['95%区间上限']:.4f}]")
        bg = s5["预算与增量（每 1 万名客户预计增加的购买人数）"]
        print(f"前 30% 拿到全部增量的 {bg['0.3']['增益模型'] / bg['1.0']['增益模型']:.1%}（响应模型 {bg['0.3']['响应模型'] / bg['1.0']['响应模型']:.1%}）")
        q = s5["四类人群"]
        for k, v in q.items():
            print(f"{k}：占 {v['人数占比']:.1%}，对照组购买率 {v['实际对照组购买率']:.1%}，实际增益 {v['实际增益'] * 100:.2f} 个百分点")
        dec = (R / "stage4_deciles.csv").read_text(encoding="utf-8-sig").splitlines()
        rows = [l.split(",") for l in dec[1:] if l.startswith("T-learner")]
        print(f"按预测增益分 10 组：第 1 组实际增益 {float(rows[0][6]) * 100:.2f} 个百分点，第 10 组 {float(rows[9][6]) * 100:.2f} 个百分点")
        sim = s3["模拟数据检验"]
        print(f"模拟数据：T-learner 预测增益标准差是真实的 {sim['T-learner（LightGBM）']['预测增益的标准差'] / sim['T-learner（LightGBM）']['真实增益的标准差']:.1f} 倍；"
              f"与真实增益的相关：X {sim['X-learner（LightGBM）']['与真实增益的相关系数']:.3f}，T {sim['T-learner（LightGBM）']['与真实增益的相关系数']:.3f}")


if __name__ == "__main__":
    main()

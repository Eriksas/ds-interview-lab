"""页面 11：倾向得分匹配 PSM。

模拟（页面同款）：n 个用户，X1 活跃度 ~ N(0,1)，X2 历史消费与 X1 相关 0.3；
是否参加活动 T：P(T=1) = logistic(−1 + b·(X1 + 0.5·X2))，b 是“选择强度”；
结果 Y = 2 + 1.5·X1 + 1.0·X2 + 1.0·T + N(0,1)，真实效应（ATT）= 1。
倾向得分用逻辑回归估计；在 logit 倾向得分上做 1:1 最近邻匹配，卡钳 = c × logit 倾向得分的标准差；
无放回时按随机顺序依次给处理组找最近的、还没被用过的对照。
"""
import numpy as np
import statsmodels.api as sm

SEED = 42


def gen(n, b, rng, tau=1.0):
    x1 = rng.normal(size=n)
    x2 = 0.3 * x1 + np.sqrt(1 - 0.09) * rng.normal(size=n)
    p = 1 / (1 + np.exp(-(-1.0 + b * (x1 + 0.5 * x2))))
    t = rng.random(n) < p
    y = 2 + 1.5 * x1 + 1.0 * x2 + tau * t + rng.normal(size=n)
    return x1, x2, t, y


def logit_ps(x1, x2, t):
    X = sm.add_constant(np.c_[x1, x2])
    return X @ sm.Logit(t.astype(float), X).fit(disp=0).params


def match(lp, t, y, cal, repl, rng):
    ti, ci = np.where(t)[0], np.where(~t)[0]
    width = cal * lp.std(ddof=1)
    used = np.zeros(ci.size, bool)
    pairs = []
    for i in rng.permutation(ti):
        d = np.abs(lp[ci] - lp[i])
        if not repl:
            d = np.where(used, np.inf, d)
        j = int(np.argmin(d))
        if d[j] > width:
            continue
        if not repl:
            used[j] = True
        pairs.append((i, ci[j]))
    pairs = np.array(pairs, int).reshape(-1, 2)
    att = (y[pairs[:, 0]] - y[pairs[:, 1]]).mean() if len(pairs) else np.nan
    return att, pairs


def smd(x, t, pairs=None):
    sd = np.sqrt((x[t].var(ddof=1) + x[~t].var(ddof=1)) / 2)  # 用匹配前的合并标准差做分母
    if pairs is None:
        return (x[t].mean() - x[~t].mean()) / sd
    return (x[pairs[:, 0]].mean() - x[pairs[:, 1]].mean()) / sd


def repeat(n, b, cal, reps, rng):
    out = {"naive": [], True: [], False: []}
    for _ in range(reps):
        x1, x2, t, y = gen(n, b, rng)
        lp = logit_ps(x1, x2, t)
        out["naive"].append(y[t].mean() - y[~t].mean())
        for repl in (True, False):
            out[repl].append(match(lp, t, y, cal, repl, rng)[0])
    return {k: np.array(v) for k, v in out.items()}


def main():
    print("== 1. seed 42 的一份数据：n=600，选择强度 b=1.5，卡钳 0.2")
    rng = np.random.default_rng(SEED)
    x1, x2, t, y = gen(600, 1.5, rng)
    lp = logit_ps(x1, x2, t)
    print(f"处理组 {t.sum()} 人、对照组 {(~t).sum()} 人；朴素差 {y[t].mean() - y[~t].mean():.3f}（真实 1）")
    for repl in (True, False):
        att, pairs = match(lp, t, y, 0.2, repl, rng)
        print(f"{'有放回' if repl else '无放回'}：匹配上 {len(pairs)} 个处理组，ATT {att:.3f}；"
              f"SMD 活跃度 {smd(x1, t):.3f}→{smd(x1, t, pairs):.3f}，历史消费 {smd(x2, t):.3f}→{smd(x2, t, pairs):.3f}，logit 倾向得分 {smd(lp, t):.3f}→{smd(lp, t, pairs):.3f}")

    print("\n== 2. 重复 1,000 次：有放回 vs 无放回（偏差 = 平均估计 − 1，标准差 = 估计值的标准差）")
    for b in [1.5, 3.0]:
        for cal in [0.2, np.inf]:
            r = repeat(600, b, cal, 1000, np.random.default_rng(SEED))
            lab = "不设卡钳" if np.isinf(cal) else f"卡钳 {cal}"
            print(f"选择强度 {b}，{lab}：朴素偏差 {r['naive'].mean() - 1:+.3f}；"
                  f"有放回 偏差 {np.nanmean(r[True]) - 1:+.3f} 标准差 {np.nanstd(r[True], ddof=1):.3f}；"
                  f"无放回 偏差 {np.nanmean(r[False]) - 1:+.3f} 标准差 {np.nanstd(r[False], ddof=1):.3f}")


if __name__ == "__main__":
    main()

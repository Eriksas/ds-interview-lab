"""页面 2：偷看与序贯检验。

模型：每天新增同样多的样本，第 k 天的累计检验统计量 Z_k = S_k / sqrt(k)，S_k 是 k 个独立 N(0,1) 日增量之和
（指标近似正态、每天样本量相同时这是精确的；转化率在每天样本较大时由中心极限定理近似成立，第 2 节用伯努利数据核对）。
"""
import numpy as np
from scipy import optimize, stats

SEED = 42
Z = stats.norm


def peek_fpr(days, sims, rng, crit=1.959964):
    """A/A：每天看一次累计数据，返回“到第 k 天为止至少一次 |Z|>crit”的比例（k=1..days）。"""
    inc = rng.normal(size=(sims, days))
    z = inc.cumsum(axis=1) / np.sqrt(np.arange(1, days + 1))
    hit = np.abs(z) > crit
    return np.logical_or.accumulate(hit, axis=1).mean(axis=0)


def cross_prob(bounds):
    """P(至少一次 |Z_k| > c_k)，Z 为累计统计量，Corr(Z_j, Z_k)=sqrt(j/k)。用多元正态 CDF 精确计算。"""
    K = len(bounds)
    idx = np.arange(1, K + 1)
    cov = np.sqrt(np.minimum.outer(idx, idx) / np.maximum.outer(idx, idx))
    b = np.asarray(bounds, float)
    mvn = stats.multivariate_normal(mean=np.zeros(K), cov=cov, allow_singular=False)
    inside = mvn.cdf(b, lower_limit=-b, rng=np.random.default_rng(SEED)) if K > 1 else 2 * Z.cdf(b[0]) - 1
    return 1 - inside


def pocock(K, alpha=0.05):
    return optimize.brentq(lambda c: cross_prob([c] * K) - alpha, 1.9, 3.5, xtol=1e-6)


def obf(K, alpha=0.05):
    shape = np.sqrt(K / np.arange(1, K + 1))
    cb = optimize.brentq(lambda c: cross_prob(c * shape) - alpha, 1.9, 2.5, xtol=1e-6)
    return cb, cb * shape


def seq_sim(bounds, theta, sims, rng):
    """θ = 最后一次分析时 Z 的期望值。返回 (拒绝率, 平均停止时用掉的样本比例)。"""
    K = len(bounds)
    inc = rng.normal(size=(sims, K)) + theta / np.sqrt(K)
    z = inc.cumsum(axis=1) / np.sqrt(np.arange(1, K + 1))
    cross = np.abs(z) > np.asarray(bounds)
    any_cross = cross.any(axis=1)
    first = np.where(any_cross, cross.argmax(axis=1) + 1, K)
    return any_cross.mean(), (first / K).mean()


def main():
    rng = np.random.default_rng(SEED)
    print("== 1. A/A 每天偷看一次累计数据（20 万次模拟），至少一次 |Z|>1.96 的比例")
    f = peek_fpr(30, 200_000, rng)
    for k in [1, 2, 3, 5, 7, 10, 14, 21, 30]:
        print(f"{k:>2} 天：模拟 {f[k - 1]:.4f}   独立公式 1-0.95^k = {1 - 0.95 ** k:.4f}")
    print("Corr(Z_j, Z_k) = sqrt(j/k)，例如第 6 天和第 7 天：", round(np.sqrt(6 / 7), 4), "；第 1 天和第 7 天：", round(np.sqrt(1 / 7), 4))
    rng = np.random.default_rng(SEED)
    inc = rng.normal(size=(200_000, 14))
    z = inc.cumsum(axis=1) / np.sqrt(np.arange(1, 15))
    ever = (np.abs(z) > 1.959964).any(axis=1)
    final = np.abs(z[:, -1]) > 1.959964
    print(f"14 天：曾经越线的比例 {ever.mean():.4f}，最后一天仍显著的比例 {final.mean():.4f}；"
          f"曾经越线的路径里，最后一天不显著的占 {np.mean(~final[ever]):.3f}")

    print("\n== 2. 用真实的 0/1 转化数据核对（每组每天 1,000 人，转化率 10%，7 天，2 万次模拟）")
    rng = np.random.default_rng(SEED)
    sims, days, per = 20_000, 7, 1000
    a = rng.binomial(per, 0.10, size=(sims, days)).cumsum(axis=1)
    b = rng.binomial(per, 0.10, size=(sims, days)).cumsum(axis=1)
    n = per * np.arange(1, days + 1)
    pa, pb = a / n, b / n
    pool = (a + b) / (2 * n)
    zz = (pb - pa) / np.sqrt(pool * (1 - pool) * 2 / n)
    fp = (np.abs(zz) > 1.959964).any(axis=1).mean()
    print(f"7 天至少一次显著：{fp:.4f}（蒙特卡洛标准误 {np.sqrt(fp * (1 - fp) / sims):.4f}）")

    print("\n== 3. 门槛（双侧 α=0.05，等间隔 K 次分析；多元正态 CDF 求根）")
    print("参考：Jennison & Turnbull (2000) 表 2.1 Pocock C_P：K=2..10 为 2.178 2.289 2.361 2.413 2.453 2.485 2.512 2.535 2.555；")
    print("      表 2.3 O'Brien-Fleming C_B：K=2..10 为 1.977 2.004 2.024 2.040 2.053 2.063 2.072 2.080 2.087")
    table = {}
    for K in range(2, 11):
        cp = pocock(K)
        cb, ob = obf(K)
        table[K] = (cp, cb)
        print(f"K={K:>2}  Pocock {cp:.3f}  OBF C_B {cb:.3f}  OBF 各次门槛 " + " ".join(f"{x:.3f}" for x in ob)
              + f"  | Pocock 每次名义 α={2 * Z.sf(cp):.4f}，OBF 最后一次名义 α={2 * Z.sf(ob[-1]):.4f}")
    print("JS 常量（复制到 assets/js/pages/peeking.js）：")
    print("POCOCK = {" + ", ".join(f"{K}: {table[K][0]:.4f}" for K in table) + "}")
    print("OBF_CB = {" + ", ".join(f"{K}: {table[K][1]:.4f}" for K in table) + "}")

    print("\n== 4. K=5 时三种门槛的模拟（每种 40 万次）")
    K = 5
    cp, (cb, ob) = table[K][0], obf(K)
    rules = {"每次都用 1.96": [1.959964] * K, "Pocock": [cp] * K, "O'Brien-Fleming": list(ob)}
    for theta in [0.0, 2.8]:
        label = "A/A（θ=0）" if theta == 0 else "真实效应 θ=2.8（固定样本设计功效 80%）"
        print(label)
        for name, bd in rules.items():
            rej, used = seq_sim(bd, theta, 400_000, np.random.default_rng(SEED))
            print(f"  {name:<16} 拒绝率 {rej:.4f}  平均用掉最大样本的 {used:.3f}")
    print(f"固定样本设计（只在最后看一次）θ=2.8 的功效：{Z.cdf(2.8 - 1.959964) + Z.cdf(-2.8 - 1.959964):.4f}")

    print("\n== 5. 要和固定样本设计一样有 80% 功效，最大样本量要放大多少（K=5）")
    for name, bd in [("Pocock", [cp] * K), ("O'Brien-Fleming", list(ob))]:
        rng_t = np.random.default_rng(SEED)
        base = rng_t.normal(size=(400_000, K))

        def pw(theta):
            z = (base + theta / np.sqrt(K)).cumsum(axis=1) / np.sqrt(np.arange(1, K + 1))
            return (np.abs(z) > np.asarray(bd)).any(axis=1).mean() - 0.8
        th = optimize.brentq(pw, 2.5, 4.0, xtol=1e-4)
        z = (base + th / np.sqrt(K)).cumsum(axis=1) / np.sqrt(np.arange(1, K + 1))
        cross = np.abs(z) > np.asarray(bd)
        first = np.where(cross.any(axis=1), cross.argmax(axis=1) + 1, K)
        r = (th / (Z.ppf(0.975) + Z.ppf(0.8))) ** 2
        print(f"  {name:<16} 放大系数 {r:.3f}（参考值：Pocock 1.228，OBF 1.028）；此时平均样本 = 固定设计的 {r * (first / K).mean():.3f}")


if __name__ == "__main__":
    main()

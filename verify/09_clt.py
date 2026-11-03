"""页面 9：中心极限定理与置信区间。

五种总体（页面同款）：正态 N(10, 3²)；指数（均值 1）；对数正态 LN(0, 1)；0/1 稀疏（p=0.02）；
“打赏金额”：95% 的人为 0，5% 的人金额 ~ LN(3, 1.2)。
"""
import numpy as np
from scipy import stats

SEED = 42


def draw(dist, size, rng):
    if dist == "normal":
        return rng.normal(10, 3, size)
    if dist == "exp":
        return rng.exponential(1.0, size)
    if dist == "lognorm":
        return rng.lognormal(0, 1, size)
    if dist == "bern":
        return (rng.random(size) < 0.02).astype(float)
    if dist == "tip":
        pay = rng.random(size) < 0.05
        return np.where(pay, rng.lognormal(3, 1.2, size), 0.0)
    raise ValueError(dist)


def pop_moments(dist):
    if dist == "normal":
        return 10.0, 3.0, 0.0
    if dist == "exp":
        return 1.0, 1.0, 2.0
    if dist == "lognorm":
        s2 = 1.0
        return np.exp(0.5), np.sqrt((np.exp(s2) - 1) * np.exp(s2)), (np.exp(s2) + 2) * np.sqrt(np.exp(s2) - 1)
    if dist == "bern":
        p = 0.02
        return p, np.sqrt(p * (1 - p)), (1 - 2 * p) / np.sqrt(p * (1 - p))
    if dist == "tip":
        q, mu, s = 0.05, 3.0, 1.2
        m1 = q * np.exp(mu + s ** 2 / 2)
        m2 = q * np.exp(2 * mu + 2 * s ** 2)
        m3 = q * np.exp(3 * mu + 4.5 * s ** 2)
        var = m2 - m1 ** 2
        skew = (m3 - 3 * m1 * m2 + 2 * m1 ** 3) / var ** 1.5
        return m1, np.sqrt(var), skew


def coverage(dist, n, reps, rng):
    x = draw(dist, (reps, n), rng)
    m, s = x.mean(axis=1), x.std(axis=1, ddof=1)
    t = stats.t.ppf(0.975, n - 1)
    mu = pop_moments(dist)[0]
    return np.mean(np.abs(m - mu) <= t * s / np.sqrt(n))


NAMES = {"normal": "正态", "exp": "指数", "lognorm": "对数正态", "bern": "0/1 稀疏（2%）", "tip": "打赏金额"}


def main():
    print("== 1. 总体的均值、标准差、偏度（偏度为理论值）")
    for d in NAMES:
        mu, sd, sk = pop_moments(d)
        need = (sk / 0.2) ** 2
        print(f"{NAMES[d]}：均值 {mu:.4f} 标准差 {sd:.4f} 偏度 {sk:.3f}；样本均值偏度降到 0.2 以下大约需要 n ≥ {need:,.0f}")

    print("\n== 2. 样本均值的偏度：理论 γ/√n vs 模拟（2 万次）")
    for d in ["exp", "lognorm", "bern", "tip"]:
        sk = pop_moments(d)[2]
        row = []
        for n in [10, 30, 100]:
            m = draw(d, (20_000, n), np.random.default_rng(SEED)).mean(axis=1)
            row.append(f"n={n}: 理论 {sk / np.sqrt(n):.3f} 模拟 {stats.skew(m):.3f}")
        print(f"{NAMES[d]}：" + "；".join(row))

    print("\n== 3. 95% t 置信区间的实际覆盖率（2 万次）")
    for d in NAMES:
        row = [f"n={n}: {coverage(d, n, 20_000, np.random.default_rng(SEED)):.4f}" for n in [10, 30, 100, 200]]
        print(f"{NAMES[d]}：" + "；".join(row))
    print("（0/1 稀疏在 n 小时经常整组都是 0，标准差为 0，区间退化成一个点，所以覆盖率很低）")

    print("\n== 4. X5 项目：购买率约 60.33% 的 0/1 指标")
    p = 0.6033
    g = (1 - 2 * p) / np.sqrt(p * (1 - p))
    print(f"总体偏度 {g:.4f}；每组约 10 万人时样本均值的偏度 {g / np.sqrt(100_000):.6f}")


if __name__ == "__main__":
    main()

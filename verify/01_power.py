"""页面 1：假设检验与功效 —— 页面上写死的数字都从这里来。

运行：E:/retail-uplift-ab/.venv/Scripts/python.exe verify/01_power.py
"""
import numpy as np
from scipy import stats
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import proportion_effectsize

SEED = 42
Z = stats.norm


def se_diff(p0, delta, n):
    """两组转化率之差的标准误（不合并方差）。"""
    p1 = p0 + delta
    return np.sqrt(p0 * (1 - p0) / n + p1 * (1 - p1) / n)


def power_two_sample(p0, delta, n, alpha=0.05, sided=2):
    lam = delta / se_diff(p0, delta, n)
    if sided == 2:
        zc = Z.ppf(1 - alpha / 2)
        return Z.cdf(lam - zc) + Z.cdf(-lam - zc), lam, zc
    zc = Z.ppf(1 - alpha)
    return Z.cdf(lam - zc), lam, zc


def n_per_group(p0, delta, alpha=0.05, power=0.8, sided=2):
    """页面计算器用的公式：n = (z_{1-α/2} + z_{1-β})² (p0(1-p0) + p1(1-p1)) / Δ²。"""
    p1 = p0 + delta
    za = Z.ppf(1 - alpha / 2) if sided == 2 else Z.ppf(1 - alpha)
    zb = Z.ppf(power)
    return (za + zb) ** 2 * (p0 * (1 - p0) + p1 * (1 - p1)) / delta ** 2


def n_pooled(p0, delta, alpha=0.05, power=0.8):
    """另一种常见写法：H0 下用合并方差。"""
    p1 = p0 + delta
    pb = (p0 + p1) / 2
    za, zb = Z.ppf(1 - alpha / 2), Z.ppf(power)
    return (za * np.sqrt(2 * pb * (1 - pb)) + zb * np.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / delta ** 2


def pvalue_mix(pi_eff, lam, n_exp, rng):
    """n_exp 个实验，其中 pi_eff 比例真的有效（统计量中心 lam），其余无效。"""
    eff = rng.random(n_exp) < pi_eff
    z = rng.normal(size=n_exp) + lam * eff
    p = 2 * Z.sf(np.abs(z))
    return eff, p


def main():
    print("== 1. 交互实验 1 默认值：p0=10%，Δ=0.6 个百分点，每组 40,000，α=0.05 双侧")
    pw, lam, zc = power_two_sample(0.10, 0.006, 40000)
    print(f"SE={se_diff(0.10, 0.006, 40000):.6f}  λ=Δ/SE={lam:.3f}  临界值={zc:.3f}  功效={pw:.4f}  β={1-pw:.4f}")

    print("\n== 2. 试试看")
    pw_half, lam_half, _ = power_two_sample(0.10, 0.006, 20000)
    print(f"样本量减半（每组 20,000）：λ={lam_half:.3f} 功效={pw_half:.4f}")
    pw_a01, _, _ = power_two_sample(0.10, 0.006, 40000, alpha=0.01)
    n_a01 = n_per_group(0.10, 0.006, alpha=0.01)
    print(f"α 改成 0.01：功效={pw_a01:.4f}；要回到 80% 需每组 {n_a01:,.0f}（是 0.05 时的 {n_a01 / n_per_group(0.10, 0.006):.3f} 倍）")
    n1 = n_per_group(0.10, 0.006)
    n2 = n_per_group(0.10, 0.012)
    print(f"80% 功效所需每组样本：Δ=0.6pp → {n1:,.0f}；Δ=1.2pp → {n2:,.0f}；比值 {n2 / n1:.3f}")
    pw_one, _, zc1 = power_two_sample(0.10, 0.006, 40000, sided=1)
    print(f"改成单侧检验：临界值={zc1:.3f} 功效={pw_one:.4f}")

    print("\n== 3. p 值：观测 z → 双侧 p")
    for z in [1.0, 1.645, 1.96, 2.0, 2.5, 3.0]:
        print(f"z={z:.3f}  p={2 * Z.sf(z):.4f}")

    print("\n== 4. p 值直方图模拟（2,000 个实验，有效的统计量中心 λ=2.8，即功效约 80%）")
    pw_28 = Z.cdf(2.8 - 1.96) + Z.cdf(-2.8 - 1.96)
    print(f"λ=2.8 时功效（理论）={pw_28:.4f}")
    for pi in [0.1, 0.2, 0.5]:
        fdr_theory = (1 - pi) * 0.05 / ((1 - pi) * 0.05 + pi * pw_28)
        # 0.04 ≤ p < 0.05 这一窄条里无效实验的占比（理论）
        z_hi, z_lo = Z.isf(0.04 / 2), Z.isf(0.05 / 2)
        h1_mass = (Z.cdf(z_hi - 2.8) - Z.cdf(z_lo - 2.8)) + (Z.cdf(-z_lo - 2.8) - Z.cdf(-z_hi - 2.8))
        band = (1 - pi) * 0.01 / ((1 - pi) * 0.01 + pi * h1_mass)
        rng = np.random.default_rng(SEED)
        eff, p = pvalue_mix(pi, 2.8, 2000, rng)
        sig = p < 0.05
        print(f"有效占比 π={pi:.0%}: p<0.05 中无效的比例 理论={fdr_theory:.3f} 模拟={np.mean(~eff[sig]):.3f}（显著 {sig.sum()} 个）；"
              f"0.04≤p<0.05 中无效的比例 理论={band:.3f}")
    rng = np.random.default_rng(SEED)
    p_null = 2 * Z.sf(np.abs(rng.normal(size=200_000)))
    print(f"H0 为真时 p<0.05 的比例（20 万次模拟）={np.mean(p_null < 0.05):.4f}，p 值分布均匀：各十分位比例 "
          + ", ".join(f"{x:.3f}" for x in np.histogram(p_null, bins=10, range=(0, 1))[0] / p_null.size))

    print("\n== 5. 样本量计算器默认值：p0=10%，相对 MDE 5%（Δ=0.5 个百分点），α=0.05 双侧，功效 80%，每天 20,000 人进实验、分 2 组")
    n = n_per_group(0.10, 0.005)
    print(f"页面公式：每组 {n:,.1f} → 取整 {np.ceil(n):,.0f}；两组共 {2 * np.ceil(n):,.0f}；天数 {2 * np.ceil(n) / 20000:.2f} → {int(np.ceil(2 * np.ceil(n) / 20000))} 天")
    print(f"合并方差写法：每组 {n_pooled(0.10, 0.005):,.1f}")
    h = proportion_effectsize(0.105, 0.10)
    n_sm = NormalIndPower().solve_power(effect_size=h, alpha=0.05, power=0.8, ratio=1, alternative="two-sided")
    print(f"statsmodels（Cohen's h，arcsine 变换）：每组 {n_sm:,.1f}")
    print(f"经验公式 16σ²/Δ²（σ²=p0(1-p0)）：每组 {16 * 0.10 * 0.90 / 0.005 ** 2:,.0f}；(1.96+0.8416)²×2 = {(Z.ppf(0.975) + Z.ppf(0.8)) ** 2 * 2:.2f}")
    print(f"相对 MDE 10%（Δ=1 个百分点）：每组 {np.ceil(n_per_group(0.10, 0.01)):,.0f}；相对 MDE 2.5%：每组 {np.ceil(n_per_group(0.10, 0.0025)):,.0f}")
    print(f"基线 2%、相对 MDE 5%：每组 {np.ceil(n_per_group(0.02, 0.001)):,.0f}")
    print(f"基线 10%、绝对 MDE 5 个百分点（10%→15%）：每组 {np.ceil(n_per_group(0.10, 0.05)):,.0f}；"
          f"与相对 5% 的样本量之比 {n_per_group(0.10, 0.005) / n_per_group(0.10, 0.05):.0f} 倍")

    # 用模拟核对：按算出的样本量做实验，实际功效是否约 80%
    rng = np.random.default_rng(SEED)
    nn = int(np.ceil(n))
    sims = 20000
    xa = rng.binomial(nn, 0.10, sims)
    xb = rng.binomial(nn, 0.105, sims)
    pa, pb = xa / nn, xb / nn
    se = np.sqrt(pa * (1 - pa) / nn + pb * (1 - pb) / nn)
    zz = (pb - pa) / se
    emp = np.mean(np.abs(zz) > Z.ppf(0.975))
    print(f"模拟核对（{sims:,} 次实验，每组 {nn:,}）：实际功效 {emp:.4f}（蒙特卡洛标准误 {np.sqrt(emp * (1 - emp) / sims):.4f}）")

    print("\n== 6. 代入 X5 项目参数（对照组购买率 60.33%，ATE 3.32 个百分点，每组约 10 万）")
    pw_x5, lam_x5, _ = power_two_sample(0.6033, 0.0332, 100000)
    print(f"λ={lam_x5:.2f}  功效={pw_x5:.6f}")
    se_x5 = 0.0021693499613884035  # retail-uplift-ab/results/stage1_ab_test.json 的 ate 标准误
    print(f"项目 MDE（α=0.05 双侧、功效 80%）=(1.96+0.84)×SE={(Z.ppf(0.975) + Z.ppf(0.8)) * se_x5 * 100:.3f} 个百分点（项目 results 记为 0.6078）")
    n_x5 = n_per_group(0.6033, 0.0061)
    print(f"计算器：p0=60.33%，绝对 MDE 0.61 个百分点 → 每组 {np.ceil(n_x5):,.0f}")


if __name__ == "__main__":
    main()

"""页面 4：CUPED 方差缩减。

模拟设定（页面同款）：指标是“人均观看时长（分钟）”，实验前 X ~ N(60, 20²)；
实验期 Y = 60 + ρ(X−60) + sqrt(1−ρ²)·20·ε + τ·T，ε ~ N(0,1)，T 为是否在实验组。
CUPED：Y_cv = Y − θ(X − X̄)，θ = Cov(X,Y)/Var(X)，用两组合并的数据估计。
"""
import json
import pathlib

import numpy as np
from scipy import stats

SEED = 42
MU, SD = 60.0, 20.0
Z = stats.norm


def gen(n, rho, tau, rng):
    x = rng.normal(MU, SD, size=(2, n))
    e = rng.normal(size=(2, n))
    y = MU + rho * (x - MU) + np.sqrt(1 - rho ** 2) * SD * e
    y[1] += tau
    return x, y  # 第 0 行对照组，第 1 行实验组


def analyze(x, y):
    xa, ya = x.ravel(), y.ravel()
    theta = np.cov(xa, ya)[0, 1] / np.var(xa, ddof=1)
    ycv = y - theta * (x - xa.mean())
    n = y.shape[1]
    ate_raw = y[1].mean() - y[0].mean()
    se_raw = np.sqrt(y[1].var(ddof=1) / n + y[0].var(ddof=1) / n)
    ate_cv = ycv[1].mean() - ycv[0].mean()
    se_cv = np.sqrt(ycv[1].var(ddof=1) / n + ycv[0].var(ddof=1) / n)
    var_ratio = (ycv[0].var(ddof=1) + ycv[1].var(ddof=1)) / (y[0].var(ddof=1) + y[1].var(ddof=1))
    return dict(theta=theta, ate_raw=ate_raw, se_raw=se_raw, ate_cv=ate_cv, se_cv=se_cv, var_ratio=var_ratio)


def repeat(n, rho, tau, reps, rng):
    out = np.array([[v for v in analyze(*gen(n, rho, tau, rng)).values()] for _ in range(reps)])
    theta, ate_raw, se_raw, ate_cv, se_cv, vr = out.T
    return dict(ate_raw=ate_raw, ate_cv=ate_cv, rej_raw=np.abs(ate_raw / se_raw) > 1.959964, rej_cv=np.abs(ate_cv / se_cv) > 1.959964, vr=vr)


def n_needed(sigma, delta, shrink=1.0):
    return (Z.ppf(0.975) + Z.ppf(0.8)) ** 2 * 2 * sigma ** 2 * shrink / delta ** 2


def main():
    print("== 1. 方差剩余比例 1−ρ²（= 所需样本量的比例）")
    for rho in [0.3, 0.5, 0.6, 0.7, 0.8, 0.9]:
        print(f"ρ={rho:.1f}: 1−ρ²={1 - rho ** 2:.2f}，方差减少 {rho ** 2:.0%}，标准误变成原来的 {np.sqrt(1 - rho ** 2):.3f}")

    print("\n== 2. 页面默认值：ρ=0.7，每组 500 人，真实效应 τ=2 分钟（σ=20）")
    a = analyze(*gen(500, 0.7, 2.0, np.random.default_rng(SEED)))
    print("seed 42 的这一次：" + json.dumps({k: round(float(v), 4) for k, v in a.items()}, ensure_ascii=False))
    lam_raw = 2.0 / (SD * np.sqrt(2 / 500))
    lam_cv = lam_raw / np.sqrt(1 - 0.49)
    print(f"理论功效：不调整 {Z.cdf(lam_raw - 1.959964):.4f}（λ={lam_raw:.3f}），CUPED {Z.cdf(lam_cv - 1.959964):.4f}（λ={lam_cv:.3f}）")
    r = repeat(500, 0.7, 2.0, 4000, np.random.default_rng(SEED))
    print(f"重复 4,000 次实验：不调整 均值 {r['ate_raw'].mean():.4f} 标准差 {r['ate_raw'].std(ddof=1):.4f} 功效 {r['rej_raw'].mean():.4f}")
    print(f"                    CUPED  均值 {r['ate_cv'].mean():.4f} 标准差 {r['ate_cv'].std(ddof=1):.4f} 功效 {r['rej_cv'].mean():.4f}")
    print(f"标准差之比 {r['ate_cv'].std(ddof=1) / r['ate_raw'].std(ddof=1):.4f}（理论 sqrt(1−0.49)={np.sqrt(0.51):.4f}）；样本方差比均值 {r['vr'].mean():.4f}")
    print(f"80% 功效所需每组样本：不调整 {np.ceil(n_needed(SD, 2.0)):,.0f}，CUPED（ρ=0.7）{np.ceil(n_needed(SD, 2.0, 0.51)):,.0f}")

    print("\n== 3. 试试看")
    for rho in [0.5, 0.9]:
        print(f"ρ={rho}：所需每组样本 {np.ceil(n_needed(SD, 2.0, 1 - rho ** 2)):,.0f}，理论功效（每组 500）{Z.cdf(lam_raw / np.sqrt(1 - rho ** 2) - 1.959964):.4f}")
    r0 = repeat(500, 0.7, 0.0, 4000, np.random.default_rng(SEED))
    print(f"τ=0（A/A）时假阳性率：不调整 {r0['rej_raw'].mean():.4f}，CUPED {r0['rej_cv'].mean():.4f}；CUPED 估计均值 {r0['ate_cv'].mean():.4f}")

    print("\n== 4. X5 项目（retail-uplift-ab/results/stage1_ab_test.json）")
    f = pathlib.Path("E:/retail-uplift-ab/results/stage1_ab_test.json")
    if f.exists():
        j = json.loads(f.read_text(encoding="utf-8"))
        cb, mde = j["cuped_best"], j["mde"]
        print(f"最佳单协变量 {cb['协变量']}：方差缩减 {cb['方差缩减比例']:.4f}（= 相关系数平方 {cb['相关系数平方']:.4f}）")
        print(f"MDE：不调整 {mde['不调整']['MDE（百分点）']:.3f} 个百分点；CUPED {mde['CUPED（n_trans）']['MDE（百分点）']:.3f}（等效样本 ×{mde['CUPED（n_trans）']['等效样本量倍数']:.3f}）；"
              f"7 个协变量回归调整 {mde['回归调整（7 个实验前指标）']['MDE（百分点）']:.3f}（等效样本 ×{mde['回归调整（7 个实验前指标）']['等效样本量倍数']:.3f}）")
        bc = j["bad_control_demo"]
        print(f"坏控制变量：截止日后首次兑换比例 实验组 {bc['截止日后首次兑换的比例·实验组']:.4f} 对照组 {bc['截止日后首次兑换的比例·对照组']:.4f}，"
              f"差 {bc['两组差异']['ATE'] * 100:.2f} 个百分点，p={bc['两组差异']['p值']:.4f}")
    else:
        print("（未找到项目结果文件）")


if __name__ == "__main__":
    main()

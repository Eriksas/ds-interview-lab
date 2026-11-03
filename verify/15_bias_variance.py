"""页面 15：偏差-方差与正则化。

实验 1：y = sin(2πx) + N(0, 0.3²)。每份训练集 20 个点，x 固定为 (i+0.5)/20（等间隔），只有噪声不同；
        多项式先把 x 映射到 [−1,1] 再做最小二乘。偏差² 和方差在 [0,1] 上 100 个区间中点计算，
        测试误差用每次新抽的 200 个点（x ~ U(0,1)）。
实验 2：页面的默认数据由网页 JS 生成（seed 42），这里通过 verify/js_export.js 取出同一份数据，
        用 sklearn 的 Lasso / Ridge 重算：Lasso 目标 (1/2n)‖y−Xβ‖² + λ‖β‖₁（sklearn alpha = λ），
        岭回归 (1/2n)‖y−Xβ‖² + (λ/2)‖β‖²（sklearn alpha = nλ），都不带截距（数据已中心化 / 标准化）。
"""
import json
import pathlib
import subprocess

import numpy as np
from sklearn.linear_model import Lasso, Ridge

SEED = 42
HERE = pathlib.Path(__file__).resolve().parent
GRID = (np.arange(100) + 0.5) / 100  # 区间中点网格
SIGMA = 0.3


def f(x):
    return np.sin(2 * np.pi * x)


def design(x, deg):
    return np.vander(2 * np.asarray(x) - 1, deg + 1, increasing=True)


def fit(x, y, deg):
    return np.linalg.lstsq(design(x, deg), y, rcond=None)[0]


def curves(n, maxdeg, reps, rng):
    preds = {d: [] for d in range(1, maxdeg + 1)}
    tr = {d: 0.0 for d in preds}
    te = {d: 0.0 for d in preds}
    for _ in range(reps):
        x = (np.arange(n) + 0.5) / n; y = f(x) + SIGMA * rng.normal(size=n)
        xt = rng.random(200); yt = f(xt) + SIGMA * rng.normal(size=200)
        for d in preds:
            b = fit(x, y, d)
            tr[d] += np.mean((design(x, d) @ b - y) ** 2)
            te[d] += np.mean((design(xt, d) @ b - yt) ** 2)
            preds[d].append(design(GRID, d) @ b)
    out = {}
    for d in preds:
        P = np.array(preds[d])
        out[d] = dict(train=tr[d] / reps, test=te[d] / reps, bias2=np.mean((P.mean(0) - f(GRID)) ** 2), var=np.mean(P.var(0)))
    return out


def js(expr):
    r = subprocess.run(["node", str(HERE / "js_export.js"), expr], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(r.stdout)


def main():
    print("== 1. 多项式：重复 500 份训练集（每份 20 个点）")
    c = curves(20, 12, 500, np.random.default_rng(SEED))
    for d in (1, 2, 3, 4, 5, 6, 9, 12):
        o = c[d]
        print(f"{d:>2} 阶：训练误差 {o['train']:.4f}  测试误差 {o['test']:.4f}  偏差² {o['bias2']:.4f}  方差 {o['var']:.4f}  偏差²+方差+σ² = {o['bias2'] + o['var'] + SIGMA ** 2:.4f}")
    best = min(c, key=lambda d: c[d]["test"])
    print(f"测试误差最小的阶数：{best}（测试误差 {c[best]['test']:.4f}；噪声 σ² = {SIGMA ** 2:.2f} 是下限）")

    print("\n== 2. 页面默认的回归数据（JS 生成，seed 42）上用 sklearn 重算")
    data = js("Lab.sim.biasvar.genReg(100, Lab.rng(42))")
    X, y = np.array(data["X"]), np.array(data["y"])
    n = X.shape[0]
    print(f"数据：{n} 行 × {X.shape[1]} 列；列均值最大绝对值 {np.abs(X.mean(0)).max():.1e}，列标准差 {X.std(0).round(6).tolist()[:2]}…")
    for lam in (0.001, 0.01, 0.1, 0.3, 0.5, 1.0, 2.0):
        bl = Lasso(alpha=lam, fit_intercept=False, tol=1e-14, max_iter=1_000_000).fit(X, y).coef_
        br = Ridge(alpha=n * lam, fit_intercept=False).fit(X, y).coef_
        print(f"λ={lam:<5}：Lasso 为 0 的系数 {int(np.sum(np.abs(bl) < 1e-10))} 个 {np.round(bl, 3).tolist()}；"
              f"岭回归为 0 的 {int(np.sum(np.abs(br) < 1e-10))} 个，最小绝对值 {np.abs(br).min():.4f}")
    lam_max = np.max(np.abs(X.T @ y)) / n
    print(f"Lasso 让所有系数都为 0 的最小 λ = max|Xᵀy|/n = {lam_max:.4f}")


if __name__ == "__main__":
    main()

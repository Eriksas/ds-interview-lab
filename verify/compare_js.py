"""浏览器模拟代码 vs Python 对照。

做法：
1. `node verify/js_sims.js` 加载网页里同一份 JS（assets/js/core.js + pages/*.js），按页面默认参数、seed 42 运行；
2. 本脚本用 numpy（default_rng(42)）独立实现同样的模拟；
3. 确定性的量（公式）要求差异 < 1e-6；随机模拟的量要求 |JS − Python| < 3 × 合并蒙特卡洛标准误。
JS 用 mulberry32 随机数、Python 用 PCG64，两边随机数序列不同，所以比的是“分布一致”，不是逐个数相等。

运行：E:/retail-uplift-ab/.venv/Scripts/python.exe verify/compare_js.py
"""
import importlib
import json
import pathlib
import subprocess
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SEED = 42

js = json.loads(subprocess.run(["node", str(HERE / "js_sims.js")], capture_output=True, text=True, encoding="utf-8", check=True).stdout)
rows = []


def det(name, py_value, tol=1e-6):
    v = js[name]["value"]
    ok = abs(v - py_value) <= tol * max(1, abs(py_value))
    rows.append((name, "公式", v, py_value, abs(v - py_value), tol, ok))


def mc(name, py_value, py_se):
    j = js[name]
    se = float(np.hypot(j["se"], py_se))
    ok = abs(j["value"] - py_value) <= 3 * se
    rows.append((name, "模拟", j["value"], py_value, abs(j["value"] - py_value), 3 * se, ok))


def prop(k, n):
    f = k / n
    return f, np.sqrt(f * (1 - f) / n)


# ---------- 页面 1 ----------
m1 = importlib.import_module("01_power")
det("power.power_default", m1.power_two_sample(0.10, 0.006, 40000)[0])
det("power.power_half_n", m1.power_two_sample(0.10, 0.006, 20000)[0])
det("power.n_calc_default", float(np.ceil(m1.n_per_group(0.10, 0.005))), tol=0)
for tag, n_exp in [("default", 2000), ("big", 200000)]:
    eff, p = m1.pvalue_mix(0.2, 2.8, n_exp, np.random.default_rng(SEED))
    sig = p < 0.05
    mc(f"power.fdr_pi20_{tag}", *prop(np.sum(~eff & sig), sig.sum()))
eff, p = m1.pvalue_mix(0.0, 2.8, 200000, np.random.default_rng(SEED))
mc("power.null_sig_rate", *prop(np.sum(p < 0.05), p.size))

# ---------- 页面 2 ----------
m2 = importlib.import_module("02_peeking")
for tag, n in [("default", 4000), ("big", 100000)]:
    f = m2.peek_fpr(14, n, np.random.default_rng(SEED))
    mc(f"peeking.fpr_day7_{tag}", *prop(round(f[6] * n), n))
    mc(f"peeking.fpr_day14_{tag}", *prop(round(f[13] * n), n))
cp5, (cb5, ob5) = m2.pocock(5), m2.obf(5)
rules = {"naive": [1.959964] * 5, "pocock": [cp5] * 5, "obf": list(ob5)}
for m, bd in rules.items():
    for tag, n in [("default", 20000), ("big", 200000)]:
        rej, _ = m2.seq_sim(bd, 0.0, n, np.random.default_rng(SEED))
        mc(f"peeking.K5_theta0_{m}_{tag}", *prop(round(rej * n), n))
    rej, _ = m2.seq_sim(bd, 2.8, 200000, np.random.default_rng(SEED))
    mc(f"peeking.K5_theta28_{m}", *prop(round(rej * 200000), 200000))
det("peeking.pocock_K5", cp5, tol=1e-4)
det("peeking.obf_cb_K5", cb5, tol=1e-4)
det("peeking.pocock_K3", m2.pocock(3), tol=1e-4)
det("peeking.obf_cb_K3", m2.obf(3)[0], tol=1e-4)

# ---------- 页面 3 ----------
m3 = importlib.import_module("03_multiple")
p = np.array([0.001, 0.014, 0.016, 0.022, 0.03, 0.045, 0.3, 0.7])
for k, f in [("none", m3.none), ("bonf", m3.bonf), ("holm", m3.holm), ("bh", m3.bh)]:
    det(f"multiple.default_{k}_count", float(f(p).sum()), tol=0)


def fdr_runs(n, seed):
    """逐次记录 FDP，用来估计 FDR 的蒙特卡洛标准误。"""
    rng = np.random.default_rng(seed)
    truth = np.arange(20) < 5
    fdp = {"none": [], "bonf": [], "bh": []}
    fw = {"none": 0, "bonf": 0, "bh": 0}
    for _ in range(n):
        z = rng.normal(size=20) + 3 * truth
        pv = 2 * m3.Z.sf(np.abs(z))
        for k, f in [("none", m3.none), ("bonf", m3.bonf), ("bh", m3.bh)]:
            rej = f(pv)
            V, R = np.sum(rej & ~truth), rej.sum()
            fdp[k].append(V / max(R, 1))
            fw[k] += V > 0
    return fdp, fw


for tag, n in [("default", 4000), ("big", 40000)]:
    fdp, fw = fdr_runs(n, SEED)
    for k in ["none", "bonf", "bh"]:
        mc(f"multiple.{k}_fwer_{tag}", *prop(fw[k], n))
        arr = np.array(fdp[k])
        js[f"multiple.{k}_fdr_{tag}"]["se"] = float(arr.std(ddof=1) / np.sqrt(n))  # 两边模拟次数相同，用 Python 的方差近似 JS 的标准误
        mc(f"multiple.{k}_fdr_{tag}", arr.mean(), arr.std(ddof=1) / np.sqrt(n))

# ---------- 输出 ----------
print("浏览器模拟（Node 运行同一份 JS）vs Python（numpy）对照")
print("公式类：差异 ≤ 容差；模拟类：差异 ≤ 3 × 合并蒙特卡洛标准误\n")
print(f"{'检查项':<38}{'类型':<6}{'JS':>12}{'Python':>12}{'差异':>11}{'允许':>11}  结果")
for name, kind, a, b, d, tol, ok in rows:
    print(f"{name:<40}{kind:<4}{a:>12.5f}{b:>12.5f}{d:>11.5f}{tol:>11.5f}  {'通过' if ok else '不通过'}")
bad = [r for r in rows if not r[-1]]
print(f"\n共 {len(rows)} 项，通过 {len(rows) - len(bad)} 项")
if bad:
    sys.exit(1)

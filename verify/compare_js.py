"""浏览器模拟代码 vs Python 对照。

做法：
1. `node verify/js_sims.js` 加载网页里同一份 JS（assets/js/core.js + pages/*.js），按页面默认参数、seed 42 运行；
2. 本脚本用 numpy（default_rng(42)）独立实现同样的模拟；
3. 确定性的量（公式）要求差异 < 1e-6；随机模拟的量要求 |JS − Python| < 4 × 合并蒙特卡洛标准误。
   （模拟类检查有上百项，用 3 倍标准误时纯靠运气也会有约 0.3 项“不通过”，这正是多重检验问题；4 倍时约 0.006 项。）
JS 用 mulberry32 随机数、Python 用 PCG64，两边随机数序列不同，所以比的是“分布一致”，不是逐个数相等。

运行：E:/retail-uplift-ab/.venv/Scripts/python.exe verify/compare_js.py
"""
import importlib
import json
import pathlib
import subprocess
import sys

import warnings

import numpy as np

warnings.filterwarnings("ignore", category=FutureWarning)

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
    ok = abs(j["value"] - py_value) <= 4 * se
    rows.append((name, "模拟", j["value"], py_value, abs(j["value"] - py_value), 4 * se, ok))


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

# ---------- 页面 4 ----------
m4 = importlib.import_module("04_cuped")
for tag, reps in [("default", 300), ("big", 4000)]:
    r = m4.repeat(500, 0.7, 2.0, reps, np.random.default_rng(SEED))
    mc(f"cuped.power_raw_{tag}", *prop(r["rej_raw"].sum(), reps))
    mc(f"cuped.power_cv_{tag}", *prop(r["rej_cv"].sum(), reps))
    mc(f"cuped.mean_cv_{tag}", r["ate_cv"].mean(), r["ate_cv"].std(ddof=1) / np.sqrt(reps))
r = m4.repeat(500, 0.7, 0.0, 20000, np.random.default_rng(SEED))
mc("cuped.aa_fpr_cv", *prop(r["rej_cv"].sum(), 20000))
det("cuped.n_needed_raw", float(np.ceil(m4.n_needed(20, 2.0))), tol=0)
det("cuped.n_needed_cv", float(np.ceil(m4.n_needed(20, 2.0, 0.51))), tol=0)


# ---------- 页面 5 ----------
m5 = importlib.import_module("05_pitfalls")
ac, at, pc, pt = m5.pay_expected(0.03, 1.0)
det("pitfalls.arpu_rel_expected", at / ac - 1)
det("pitfalls.arppu_rel_expected", (at / pt) / (ac / pc) - 1)
c, t = m5.pay_sim(0.03, 1.0, 200_000, np.random.default_rng(SEED))
mc("pitfalls.arpu_diff_sim", t.mean() - c.mean(), np.sqrt(c.var(ddof=1) / c.size + t.var(ddof=1) / t.size))
cp, tp = c[c > 0], t[t > 0]
mc("pitfalls.arppu_diff_sim", tp.mean() - cp.mean(), np.sqrt(cp.var(ddof=1) / cp.size + tp.var(ddof=1) / tp.size))
mc("pitfalls.payrate_t_sim", *prop((t > 0).sum(), t.size))
_, ptt, pcc, wgt = m5.ramp(0.5)
det("pitfalls.ramp_pooled", ptt - pcc)
det("pitfalls.ramp_weighted", wgt)
wr = m5.winners(20000)
det("pitfalls.winner_ratio_theory", wr["ratio"], tol=1e-5)
det("pitfalls.winner_power", wr["power"], tol=1e-5)
# 大样本模拟的“显著实验平均估计 / 真实值”：用 Python 同样模拟 20 万次，标准误用 delta 近似
wb = m5.winners(20000, sims=200_000, rng=np.random.default_rng(SEED))
est = 0.005 + wb["se"] * np.random.default_rng(SEED + 1).normal(size=200_000)
sig = est / wb["se"] > 1.959964
js["pitfalls.winner_ratio_sim_big"]["se"] = float(est[sig].std(ddof=1) / np.sqrt(sig.sum()) / 0.005)
mc("pitfalls.winner_ratio_sim_big", wb["sim_ratio"], float(est[sig].std(ddof=1) / np.sqrt(sig.sum()) / 0.005))
det("pitfalls.novelty_7d_avg", m5.novelty_curve(7, long=0.002, nov=0.01).mean())


# ---------- 页面 6 ----------
m6 = importlib.import_module("06_decomposition")
d = m6.decompose(m6.BASE, m6.CUR)
det("decomp.total", d["R2"] - d["R1"], tol=1e-12)
det("decomp.mix_sym", d["mix"].sum(), tol=1e-12)
det("decomp.rate_sym", d["rate"].sum(), tol=1e-12)
det("decomp.mix_film_sym", d["mix"][1], tol=1e-12)
det("decomp.inter_base", d["inter_b"].sum(), tol=1e-12)
d2 = m6.decompose(m6.BASE, dict(n=[40, 70, 20], r=[0.051, 0.031, 0.022]))
det("decomp.all_up_total", d2["R2"] - d2["R1"], tol=1e-12)


# ---------- 页面 7 ----------
m7 = importlib.import_module("07_recsys")
from sklearn.metrics import roc_auc_score  # noqa: E402
A = m7.USERS["A（活跃）"]
det("recsys.A_p3", m7.p_at_k(A["rel"], 3), tol=1e-12)
det("recsys.A_r3", m7.r_at_k(A["rel"], 3), tol=1e-12)
det("recsys.A_ndcg3", m7.ndcg_at_k(A["rel"], 3), tol=1e-12)
yA = (np.array(A["rel"]) >= 1).astype(int)
det("recsys.A_auc", roc_auc_score(yA, m7.scores(8, A["base"])), tol=1e-12)
ys, ss, aucs, wi, wc = [], [], [], [], []
for u in m7.USERS.values():
    y = (np.array(u["rel"]) >= 1).astype(int)
    s = m7.scores(8, u["base"])
    ys.append(y); ss.append(s)
    aucs.append(roc_auc_score(y, s)); wi.append(8); wc.append(y.sum())
det("recsys.gauc_imp", np.average(aucs, weights=wi), tol=1e-12)
det("recsys.gauc_clk", np.average(aucs, weights=wc), tol=1e-12)
det("recsys.global_auc", roc_auc_score(np.concatenate(ys), np.concatenate(ss)), tol=1e-12)
det("recsys.A_auc_tie23", roc_auc_score(yA, m7.scores(8, A["base"], ties=(2,))), tol=1e-12)
det("recsys.funnel_ratio", 5000 * 50 / (5000 + 500 * 50), tol=1e-12)


# ---------- 页面 8 ----------
m8 = importlib.import_module("08_delta")
for tag, reps in [("default", 400), ("big", 2000)]:
    e = m8.experiment(1000, 10, 0.04, reps, np.random.default_rng(SEED))
    mc(f"delta.fpr_naive_{tag}", *prop(round(e["fpr_naive"] * reps), reps))
    mc(f"delta.fpr_delta_{tag}", *prop(round(e["fpr_delta"] * reps), reps))
    rr = e["naive"] / e["true"]
    mc(f"delta.ratio_naive_true_{tag}", rr, rr / np.sqrt(2 * (reps - 1)))  # 标准差估计的相对误差约 1/sqrt(2(reps-1))


# ---------- 页面 9 ----------
m9 = importlib.import_module("09_clt")
for d, n, reps in [("normal", 30, 4000), ("normal", 30, 20000), ("lognorm", 10, 20000), ("exp", 30, 20000), ("bern", 100, 20000)]:
    cv = m9.coverage(d, n, reps, np.random.default_rng(SEED))
    mc(f"clt.cover_{d}_{n}_{reps}", *prop(round(cv * reps), reps))
ms = m9.draw("exp", (20000, 30), np.random.default_rng(SEED)).mean(axis=1)
mc("clt.exp30_mean", ms.mean(), ms.std(ddof=1) / np.sqrt(20000))
mc("clt.exp30_sd", ms.std(ddof=1), ms.std(ddof=1) / np.sqrt(2 * 19999))


# ---------- 页面 10 ----------
m10 = importlib.import_module("10_did")
for nv, b, g in [(0, 1, 0.5), (0, 0, 1), (1, 1, 0.5), (1, 0, 1), (0, 1, 0)]:
    cohorts, Dm, tau = m10.stagger(b, g, bool(nv))
    lvl = np.array([10, 9, 8][: len(cohorts)])[:, None]
    Y = lvl + 0.3 * np.arange(1, m10.T + 1)[None, :] + tau * Dm
    det(f"did.stagger_never{nv}_b{b}_g{g}_twfe", m10.twfe_demean(Dm, Y), tol=1e-9)
    det(f"did.stagger_never{nv}_b{b}_g{g}_att", tau[Dm == 1].mean(), tol=1e-9)
    det(f"did.stagger_never{nv}_b{b}_g{g}_cs", np.mean([c[2] for c in m10.cs(cohorts, Y, Dm)]), tol=1e-9)
rng10 = np.random.default_rng(SEED)
errs = np.array([m10.did2x2(m10.panel2(30, 0.2, 2.0, rng10)) - 2.0 for _ in range(2000)])
mc("did.bias_s02_mean", errs.mean(), errs.std(ddof=1) / np.sqrt(2000))


# ---------- 页面 11 ----------
m11 = importlib.import_module("11_psm")
for cal, tag in [(0.2, "cal02"), (np.inf, "nocal")]:
    r = m11.repeat(600, 1.5, cal, 300, np.random.default_rng(SEED))
    for k, key in [("naive", "naive"), ("repl", True), ("norepl", False)]:
        a = r[key][np.isfinite(r[key])]
        mc(f"psm.{tag}_{k}_bias", a.mean() - 1, a.std(ddof=1) / np.sqrt(a.size))
        mc(f"psm.{tag}_{k}_sd", a.std(ddof=1), a.std(ddof=1) / np.sqrt(2 * (a.size - 1)))


# ---------- 页面 12 ----------
m12 = importlib.import_module("12_rdd_iv")
i = np.arange(4000)
xs = 40 + 120 * i / 3999
d0 = xs - 100
ys = 60 + 0.3 * d0 - 0.004 * d0 ** 2 + 0.0001 * d0 ** 3 + 3 * (xs >= 100) + np.sin(i)
est, se = m12.local_linear_closed(xs, ys, 15)
est_sm, se_sm, _ = m12.local_linear(xs, ys, 15)
assert abs(est - est_sm) < 1e-9 and abs(se - se_sm) < 1e-9
det("rddiv.det_est", est, tol=1e-9)
det("rddiv.det_se", se, tol=1e-9)
for manip, h, tag in [(False, 15, "h15"), (True, 15, "manip_h15"), (False, 40, "h40")]:
    rng12 = np.random.default_rng(SEED)
    e = np.array([m12.local_linear_closed(*m12.rdd_gen(4000, manip, 0.6, rng12), h)[0] - 3 for _ in range(300)])
    mc(f"rddiv.bias_{tag}", e.mean(), e.std(ddof=1) / np.sqrt(300))
rng12 = np.random.default_rng(SEED)
res = [m12.iv_est(*m12.iv_gen(10_000, 0.3, 0.2, 10, 15, rng12)) for _ in range(300)]
w = np.array([r["wald"] for r in res]); nv = np.array([r["naive"] for r in res])
mc("rddiv.wald_mean", w.mean(), w.std(ddof=1) / np.sqrt(300))
mc("rddiv.naive_mean", nv.mean(), nv.std(ddof=1) / np.sqrt(300))


# ---------- 页面 13 ----------
m13 = importlib.import_module("13_uplift")
from sklift.metrics import qini_auc_score  # noqa: E402
for b in (0.1, 0.2, 0.5, 0.97):
    _, rp, up = m13.four_groups(0.1, 0.4, 0.45, b)
    det(f"uplift.four_b{b}_resp", rp, tol=1e-9)
    det(f"uplift.four_b{b}_upl", up, tol=1e-9)
i = np.arange(5000)
x = (i + 0.5) / 5000
t = i % 2
base = 0.2 + 0.6 * x
tu = 0.12 * (1 - x) - 0.01
y = (((i * 7919) % 1000) / 1000 < base + tu * t).astype(int)
det("uplift.qini_det_tau", qini_auc_score(y, tu, t, negative_effect=True), tol=1e-9)
det("uplift.qini_det_resp", qini_auc_score(y, base + tu, t, negative_effect=True), tol=1e-9)
for e in (0.05, 0.5):
    rng13 = np.random.default_rng(SEED)
    res = [m13.learners(1000, e, rng13) for _ in range(300)]
    for key in ("T", "X", "Xrev"):
        a = np.array([r[key] for r in res])
        mc(f"uplift.rmse_e{e}_{key}", a.mean(), a.std(ddof=1) / np.sqrt(a.size))

# ---------- 输出 ----------
print("浏览器模拟（Node 运行同一份 JS）vs Python（numpy）对照")
print("公式类：差异 ≤ 容差；模拟类：差异 ≤ 4 × 合并蒙特卡洛标准误（上百项一起检查，用 4 倍避免多重比较误报）\n")
print(f"{'检查项':<38}{'类型':<6}{'JS':>12}{'Python':>12}{'差异':>11}{'允许':>11}  结果")
for name, kind, a, b, d, tol, ok in rows:
    print(f"{name:<40}{kind:<4}{a:>12.5f}{b:>12.5f}{d:>11.5f}{tol:>11.5f}  {'通过' if ok else '不通过'}")
bad = [r for r in rows if not r[-1]]
print(f"\n共 {len(rows)} 项，通过 {len(rows) - len(bad)} 项")
if bad:
    sys.exit(1)

"""页面 5：实验结果的陷阱（四个小模拟，参数与页面默认值一致）。"""
import numpy as np
from scipy import stats

SEED = 42
Z = stats.norm

# ---------- (a) 只比较付费用户 ----------
A = dict(heavy_share=0.10, heavy_pay=0.30, heavy_mu=4.4, heavy_sd=0.7,
         light_pay=0.03, light_mu=2.4, light_sd=0.7, new_mu=2.0, new_sd=0.5)


def ln_mean(mu, sd):
    return np.exp(mu + sd ** 2 / 2)


def pay_expected(d_light, heavy_mult, a=A):
    """期望值：返回 (对照 ARPU, 实验 ARPU, 对照付费率, 实验付费率)。"""
    h, l = a["heavy_share"], 1 - a["heavy_share"]
    mh, ml, mn = ln_mean(a["heavy_mu"], a["heavy_sd"]), ln_mean(a["light_mu"], a["light_sd"]), ln_mean(a["new_mu"], a["new_sd"])
    arpu_c = h * a["heavy_pay"] * mh + l * a["light_pay"] * ml
    arpu_t = h * a["heavy_pay"] * mh * heavy_mult + l * a["light_pay"] * ml + l * d_light * mn
    pr_c = h * a["heavy_pay"] + l * a["light_pay"]
    pr_t = pr_c + l * d_light
    return arpu_c, arpu_t, pr_c, pr_t


def pay_sim(d_light, heavy_mult, n, rng, a=A):
    """模拟每组 n 个用户的付费金额（未付费记 0）。"""
    out = []
    for treat in (0, 1):
        heavy = rng.random(n) < a["heavy_share"]
        u = rng.random(n)
        p_base = np.where(heavy, a["heavy_pay"], a["light_pay"])
        base_pay = u < p_base
        new_pay = (~heavy) & (~base_pay) & (u < a["light_pay"] + d_light) if treat else np.zeros(n, bool)
        amt = np.zeros(n)
        hv = base_pay & heavy
        lt = base_pay & ~heavy
        amt[hv] = rng.lognormal(a["heavy_mu"], a["heavy_sd"], hv.sum()) * (heavy_mult if treat else 1)
        amt[lt] = rng.lognormal(a["light_mu"], a["light_sd"], lt.sum())
        amt[new_pay] = rng.lognormal(a["new_mu"], a["new_sd"], new_pay.sum())
        out.append(amt)
    return out  # [对照, 实验]


def diff_ci(x, y):
    d = y.mean() - x.mean()
    se = np.sqrt(x.var(ddof=1) / x.size + y.var(ddof=1) / y.size)
    return d, d - 1.96 * se, d + 1.96 * se


# ---------- (b) 放量中的辛普森悖论 ----------
def ramp(share2, base1=0.12, gap=0.04, eff=0.005, share1=0.10, n_day=100_000):
    base2 = base1 - gap
    rows = []
    for day, share, base in [(1, share1, base1), (2, share2, base2)]:
        nt, nc = n_day * share, n_day * (1 - share)
        rows.append(dict(day=day, nt=nt, nc=nc, pt=base + eff, pc=base))
    pt = sum(r["nt"] * r["pt"] for r in rows) / sum(r["nt"] for r in rows)
    pc = sum(r["nc"] * r["pc"] for r in rows) / sum(r["nc"] for r in rows)
    w = np.array([r["nt"] + r["nc"] for r in rows])
    by_day = np.array([r["pt"] - r["pc"] for r in rows])
    return rows, pt, pc, float((w * by_day).sum() / w.sum())


# ---------- (c) 赢家诅咒 ----------
def winners(n, p0=0.10, tau=0.005, sims=2000, rng=None):
    se = np.sqrt(p0 * (1 - p0) / n + (p0 + tau) * (1 - p0 - tau) / n)
    lam = tau / se
    c = 1.959964
    power_pos = Z.sf(c - lam)
    ratio = (lam + Z.pdf(c - lam) / Z.sf(c - lam)) / lam  # E[估计 | 显著且为正] / 真实效应
    out = dict(se=se, lam=lam, power=Z.sf(c - lam) + Z.cdf(-c - lam), power_pos=power_pos, ratio=ratio)
    if rng is not None:
        est = tau + se * rng.normal(size=sims)
        sig = est / se > c
        out.update(sim_sig=int(sig.sum()), sim_ratio=float(est[sig].mean() / tau), sim_wrong_sign=int((est / se < -c).sum()))
    return out


# ---------- (d) 新奇效应 ----------
def novelty_curve(days, long=0.2, nov=1.0, half=3.0):
    t = np.arange(1, days + 1)
    return long + nov * np.exp(-(t - 1) * np.log(2) / half)


def main():
    print("== (a) 只比较付费用户（默认：轻度用户付费率 +3 个百分点，重度用户金额不变）")
    ac, at, pc, pt = pay_expected(0.03, 1.0)
    print(f"期望值：ARPU 对照 {ac:.3f} 实验 {at:.3f}（{at / ac - 1:+.1%}）；付费率 {pc:.3%} → {pt:.3%}；"
          f"ARPPU 对照 {ac / pc:.2f} 实验 {at / pt:.2f}（{(at / pt) / (ac / pc) - 1:+.1%}）")
    c, t = pay_sim(0.03, 1.0, 200_000, np.random.default_rng(SEED))
    d, lo, hi = diff_ci(c, t)
    print(f"模拟（每组 20 万，seed 42）：全体人均 {c.mean():.3f} → {t.mean():.3f}，差 {d:+.3f} [{lo:+.3f}, {hi:+.3f}]")
    d2, lo2, hi2 = diff_ci(c[c > 0], t[t > 0])
    print(f"                       付费用户人均 {c[c > 0].mean():.2f} → {t[t > 0].mean():.2f}，差 {d2:+.2f} [{lo2:+.2f}, {hi2:+.2f}]")
    for dl, hm in [(0.0, 1.10), (0.03, 0.90), (0.01, 1.0)]:
        ac, at, pc, pt = pay_expected(dl, hm)
        print(f"轻度 +{dl:.0%}、重度金额 ×{hm:.2f}：ARPU {at / ac - 1:+.1%}，ARPPU {(at / pt) / (ac / pc) - 1:+.1%}")

    print("\n== (b) 放量中的辛普森悖论（每天 10 万人；第 1 天实验组 10%，基线 12%；第 2 天基线 8%；真实效应 +0.5 个百分点）")
    for share2 in [0.5, 0.1, 0.9]:
        rows, pt, pc, w = ramp(share2)
        print(f"第 2 天实验组 {share2:.0%}：合并后 实验 {pt:.4%} 对照 {pc:.4%} 差 {(pt - pc) * 100:+.3f} 个百分点；按天算再加权 {w * 100:+.3f}")
    rows, pt, pc, w = ramp(0.5, gap=0.0)
    print(f"两天基线相同（差 0）：合并后差 {(pt - pc) * 100:+.3f} 个百分点")

    print("\n== (c) 赢家诅咒（基线 10%，真实提升 0.5 个百分点，2,000 个实验）")
    for n in [5_000, 20_000, 60_000]:
        r = winners(n, rng=np.random.default_rng(SEED))
        print(f"每组 {n:>6,}：λ={r['lam']:.3f} 功效 {r['power']:.3f}；显著且为正时估计平均是真实值的 {r['ratio']:.3f} 倍（理论）；"
              f"模拟 {r['sim_ratio']:.3f} 倍（显著 {r['sim_sig']} 个，方向显著错误 {r['sim_wrong_sign']} 个）")

    print("\n== (d) 新奇效应（长期效应 0.2 个百分点，初始额外 1.0，半衰期 3 天）")
    for days in [3, 7, 14, 28]:
        v = novelty_curve(days)
        print(f"跑 {days:>2} 天：逐日平均估计 {v.mean():.3f}（长期真实 0.200，高估 {v.mean() / 0.2:.2f} 倍）；最后一天的真实效应 {v[-1]:.3f}")
    v = novelty_curve(7, nov=-0.6)
    print(f"学习效应（初始 −0.6）跑 7 天：平均 {v.mean():.3f}")


if __name__ == "__main__":
    main()

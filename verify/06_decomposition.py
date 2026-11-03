"""页面 6：指标异动拆解（结构效应 vs 比率效应）。全是确定性计算，浏览器结果应与这里逐位一致。

模拟场景：视频平台各内容类型的“观看用户数（万人）”和“付费转化率”，基期 vs 当期。
"""
import numpy as np

NAMES = ["番剧", "影视", "纪录片"]
BASE = dict(n=[40, 40, 20], r=[0.05, 0.03, 0.02])
CUR = dict(n=[40, 70, 20], r=[0.05, 0.028, 0.022])


def decompose(base, cur):
    n1, r1 = np.array(base["n"], float), np.array(base["r"], float)
    n2, r2 = np.array(cur["n"], float), np.array(cur["r"], float)
    w1, w2 = n1 / n1.sum(), n2 / n2.sum()
    R1, R2 = (w1 * r1).sum(), (w2 * r2).sum()
    rbar, wbar = (r1 + r2) / 2, (w1 + w2) / 2
    Rbar = (R1 + R2) / 2
    # 对称拆分：结构 = Δw·(r̄ − R̄)，比率 = w̄·Δr；Σ结构 + Σ比率 = ΔR，没有交互项
    mix = (w2 - w1) * (rbar - Rbar)
    rate = wbar * (r2 - r1)
    # 基期权重拆分：结构 = Δw·r1，比率 = w1·Δr，交互 = Δw·Δr
    mix_b = (w2 - w1) * r1
    rate_b = w1 * (r2 - r1)
    inter_b = (w2 - w1) * (r2 - r1)
    return dict(w1=w1, w2=w2, R1=R1, R2=R2, mix=mix, rate=rate, mix_b=mix_b, rate_b=rate_b, inter_b=inter_b)


def show(label, base, cur):
    d = decompose(base, cur)
    print(label)
    print(f"  总转化率 {d['R1']:.4%} → {d['R2']:.4%}，变化 {(d['R2'] - d['R1']) * 100:+.4f} 个百分点")
    print(f"  对称拆分：结构合计 {d['mix'].sum() * 100:+.4f}，比率合计 {d['rate'].sum() * 100:+.4f}（个百分点）")
    for i, nm in enumerate(NAMES):
        print(f"    {nm}：占比 {d['w1'][i]:.3f}→{d['w2'][i]:.3f}  结构 {d['mix'][i] * 100:+.4f}  比率 {d['rate'][i] * 100:+.4f}")
    print(f"  基期权重拆分：结构 {d['mix_b'].sum() * 100:+.4f}，比率 {d['rate_b'].sum() * 100:+.4f}，交互 {d['inter_b'].sum() * 100:+.4f}")
    assert abs(d["mix"].sum() + d["rate"].sum() - (d["R2"] - d["R1"])) < 1e-12
    assert abs(d["mix_b"].sum() + d["rate_b"].sum() + d["inter_b"].sum() - (d["R2"] - d["R1"])) < 1e-12
    return d


def main():
    print("== 1. 默认场景")
    show("基期：番剧 40 万/5.0%，影视 40 万/3.0%，纪录片 20 万/2.0%；当期：影视 70 万/2.8%，纪录片 2.2%", BASE, CUR)

    print("\n== 2. 试试看")
    show("当期影视观看人数拖回 40 万：", BASE, dict(n=[40, 40, 20], r=CUR["r"]))
    show("各类转化率都上升（番剧 5.1%、影视 3.1%、纪录片 2.2%），影视 70 万：", BASE, dict(n=[40, 70, 20], r=[0.051, 0.031, 0.022]))
    show("只有影视观看人数变成 70 万，转化率都不变：", BASE, dict(n=[40, 70, 20], r=BASE["r"]))

    print("\n== 3. 乘法型指标的对数拆分（自测题）：GMV = UV × 转化率 × 客单价")
    f = np.array([1.05, 1.08, 0.97])
    lg = np.log(f)
    print(f"乘积 {f.prod():.5f}（GMV 变化 {f.prod() - 1:+.3%}）；ln 变化 {lg.round(4).tolist()}，合计 {lg.sum():.4f} = ln({np.exp(lg.sum()):.4f})")
    print("各因素贡献占比：", [f"{x:.1%}" for x in lg / lg.sum()])


if __name__ == "__main__":
    main()

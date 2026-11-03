"""页面 14：分类阈值实验室。

设定（页面同款）：模型分数在负样本中 ~ N(0,1)，在正样本中 ~ N(d,1)（d 是区分度）；正样本占比 π；阈值 t 以上判为正。
页面上的数都是“总体期望值”（按 1 万个样本折算），不是随机模拟；这里另外用 100 万个模拟样本和 sklearn 核对。
"""
import numpy as np
from scipy import stats
from sklearn.metrics import average_precision_score, roc_auc_score

SEED = 42
Z = stats.norm


def metrics(d, pi, t, n=10_000):
    tpr = Z.sf(t - d)
    fpr = Z.sf(t)
    tp, fn = n * pi * tpr, n * pi * (1 - tpr)
    fp, tn = n * (1 - pi) * fpr, n * (1 - pi) * (1 - fpr)
    prec = tp / (tp + fp) if tp + fp > 0 else np.nan
    f1 = 2 * prec * tpr / (prec + tpr) if prec + tpr > 0 else 0.0
    acc = (tp + tn) / n
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=prec, recall=tpr, fpr=fpr, f1=f1, accuracy=acc)


def auc_theory(d):
    return Z.cdf(d / np.sqrt(2))


def ap_theory(d, pi):
    """PR 曲线下面积（平均精确率）：∫ precision d(recall)，在阈值网格上数值积分。"""
    t = np.linspace(12, -12, 20001)
    rec = Z.sf(t - d)
    fp = Z.sf(t)
    prec = pi * rec / (pi * rec + (1 - pi) * fp)
    return np.sum(np.diff(rec) * prec[1:])


def best_f1(d, pi):
    t = np.linspace(-3, 6, 9001)
    f = np.array([metrics(d, pi, x)["f1"] for x in t])
    k = int(np.nanargmax(f))
    return t[k], f[k]


def main():
    print("== 1. 默认：区分度 d=1.5，正样本 10%，阈值 1.0（按 1 万个样本折算）")
    m = metrics(1.5, 0.10, 1.0)
    print({k: round(float(v), 4) for k, v in m.items()})
    print(f"ROC AUC（理论 Φ(d/√2)）{auc_theory(1.5):.4f}；PR 曲线下面积（平均精确率）{ap_theory(1.5, 0.10):.4f}；随机分类器的 PR 基线 = 0.10")

    print("\n== 2. 用 100 万个模拟样本核对 AUC 和平均精确率（seed 42）")
    rng = np.random.default_rng(SEED)
    for d, pi in [(1.5, 0.10), (1.5, 0.01)]:
        n = 1_000_000
        y = rng.random(n) < pi
        s = rng.normal(size=n) + d * y
        print(f"d={d}, π={pi}: AUC 模拟 {roc_auc_score(y, s):.4f} 理论 {auc_theory(d):.4f}；AP 模拟 {average_precision_score(y, s):.4f} 理论 {ap_theory(d, pi):.4f}")

    print("\n== 3. 试试看")
    m1 = metrics(1.5, 0.01, 1.0)
    print(f"正样本降到 1%、阈值不变：精确率 {m1['precision']:.4f}，召回率 {m1['recall']:.4f}，FPR {m1['fpr']:.4f}；AP {ap_theory(1.5, 0.01):.4f}；ROC AUC 仍为 {auc_theory(1.5):.4f}")
    for pi in (0.10, 0.01):
        t, f = best_f1(1.5, pi)
        mm = metrics(1.5, pi, t)
        print(f"π={pi}: F1 最大的阈值 {t:.2f}，F1 {f:.4f}（精确率 {mm['precision']:.4f}，召回率 {mm['recall']:.4f}）")
    print(f"π=1% 时全部判为负：准确率 {metrics(1.5, 0.01, 99)['accuracy']:.4f}")
    m3 = metrics(3.0, 0.01, 2.0)
    print(f"区分度 3、π=1%、阈值 2：精确率 {m3['precision']:.4f}，召回率 {m3['recall']:.4f}；AUC {auc_theory(3.0):.4f}，AP {ap_theory(3.0, 0.01):.4f}")


if __name__ == "__main__":
    main()

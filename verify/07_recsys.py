"""页面 7：推荐链路与排序指标。

排序指标实验室的默认数据：3 个用户、每人 8 条推荐，相关度 0–3（0 不感兴趣、1 点击、2 看完、3 收藏 / 追更）。
“相关”= 相关度 ≥ 1。模型分数由位置决定：用户 u 第 j 条（从 0 开始）的分数 = base_u − 0.05·j，并列的条目分数相同。
NDCG 的增益用 2^rel − 1，折扣 1/log2(位置+1)。
"""
import numpy as np
from sklearn.metrics import ndcg_score, roc_auc_score

USERS = {
    "A（活跃）": dict(rel=[3, 1, 0, 2, 1, 0, 1, 0], base=0.90),
    "B（一般）": dict(rel=[0, 2, 1, 0, 0, 1, 0, 0], base=0.60),
    "C（不活跃）": dict(rel=[0, 0, 1, 0, 0, 0, 0, 0], base=0.35),
}


def scores(n, base, ties=()):
    s = []
    for j in range(n):
        s.append(s[-1] if j in ties else base - 0.05 * j)
    return np.array(s)


def p_at_k(rel, k):
    return np.mean(np.array(rel[:k]) >= 1)


def r_at_k(rel, k):
    rel = np.array(rel)
    return (rel[:k] >= 1).sum() / max(1, (rel >= 1).sum())


def ndcg_at_k(rel, k):
    rel = np.array(rel, float)
    disc = 1 / np.log2(np.arange(2, rel.size + 2))
    gain = 2 ** rel - 1
    dcg = (gain[:k] * disc[:k]).sum()
    idcg = (np.sort(gain)[::-1][:k] * disc[:k]).sum()
    return dcg / idcg if idcg > 0 else 0.0


def auc_pairs(y, s):
    """正负样本对计数，分数相同记 0.5。"""
    y, s = np.asarray(y), np.asarray(s)
    pos, neg = s[y == 1], s[y == 0]
    if pos.size == 0 or neg.size == 0:
        return np.nan
    gt = (pos[:, None] > neg[None, :]).sum()
    eq = (pos[:, None] == neg[None, :]).sum()
    return (gt + 0.5 * eq) / (pos.size * neg.size)


def report(users, k=3, label=""):
    print(label)
    ys, ss, aucs, w_imp, w_clk = [], [], [], [], []
    for name, u in users.items():
        rel = u["rel"]
        s = scores(len(rel), u["base"], u.get("ties", ()))
        y = (np.array(rel) >= 1).astype(int)
        a = auc_pairs(y, s)
        if 0 < y.sum() < y.size:
            assert abs(a - roc_auc_score(y, s)) < 1e-12
        nd = ndcg_at_k(rel, k)
        nd_sk = ndcg_score([2.0 ** np.array(rel) - 1], [s], k=k) if len(set(s)) == len(s) else nd
        assert abs(nd - nd_sk) < 1e-12, (nd, nd_sk)
        print(f"  {name}: P@{k}={p_at_k(rel, k):.4f} R@{k}={r_at_k(rel, k):.4f} NDCG@{k}={nd:.4f} AUC={a:.4f}（正 {y.sum()} 负 {y.size - y.sum()}）")
        ys.append(y); ss.append(s)
        if 0 < y.sum() < y.size:
            aucs.append(a); w_imp.append(y.size); w_clk.append(y.sum())
    yall, sall = np.concatenate(ys), np.concatenate(ss)
    g_imp = np.average(aucs, weights=w_imp)
    g_clk = np.average(aucs, weights=w_clk)
    print(f"  全局 AUC（所有用户混在一起）= {roc_auc_score(yall, sall):.4f}（手算 {auc_pairs(yall, sall):.4f}）")
    print(f"  GAUC（按曝光加权）= {g_imp:.4f}；GAUC（按点击加权）= {g_clk:.4f}")


def main():
    print("== 1. 默认数据，K=3")
    report(USERS, 3)
    print("\n== 2. 试试看（只改用户 A）")
    a = USERS["A（活跃）"]
    swapped = {**USERS, "A（活跃）": dict(rel=[3, 1, 2, 0, 1, 0, 1, 0], base=a["base"])}
    report(swapped, 3, "交换第 3、4 名：")
    tied = {**USERS, "A（活跃）": dict(rel=a["rel"], base=a["base"], ties=(2,))}
    report(tied, 3, "第 3 名和第 2 名并列（相关度 0 与 1 并列）：")
    tied01 = {**USERS, "A（活跃）": dict(rel=a["rel"], base=a["base"], ties=(1,))}
    report(tied01, 3, "第 2 名和第 1 名并列（两条都相关）：")
    print("\n== 3. K 从 1 到 8：用户 A 的 P@K、R@K")
    for k in range(1, 9):
        print(f"  K={k}: P@K={p_at_k(a['rel'], k):.3f} R@K={r_at_k(a['rel'], k):.3f} NDCG@K={ndcg_at_k(a['rel'], k):.3f}")

    print("\n== 4. 自测题：列表 [相关, 不相关, 相关, 不相关]，K=2")
    q = [1, 0, 1, 0]
    print(f"P@2={p_at_k(q, 2):.3f} R@2={r_at_k(q, 2):.3f} NDCG@2={ndcg_at_k(q, 2):.4f} AUC={auc_pairs(np.array(q), scores(4, 0.9)):.3f}")

    print("\n== 5. 漏斗计算量示意（假设单条打分成本：粗排 1，精排 50）")
    recall_out, coarse_out = 5000, 500
    with_coarse = recall_out * 1 + coarse_out * 50
    without = recall_out * 50
    print(f"召回 {recall_out} → 粗排 {coarse_out}：总成本 {with_coarse:,}；跳过粗排：{without:,}，是 {without / with_coarse:.1f} 倍")


if __name__ == "__main__":
    main()

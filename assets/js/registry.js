/* 页面清单：首页知识地图、翻页、闪卡都从这里读。
 * freq：面试频率 1–3；minutes：建议学习时长；ready：是否已上线。 */
(function (G) {
  const Lab = (G.Lab = G.Lab || {});
  Lab.GROUPS = [
    { id: 'ab', title: 'AB 实验', color: 'var(--s2)' },
    { id: 'causal', title: '因果推断', color: 'var(--s4)' },
    { id: 'metric', title: '指标与业务', color: 'var(--s3)' },
    { id: 'rec', title: '搜索推荐', color: 'var(--s1)' },
    { id: 'ml', title: '机器学习', color: 'var(--warn)' },
    { id: 'stat', title: '统计基础', color: 'var(--muted)' },
  ];
  Lab.PAGES = [
    { id: 'power', title: '假设检验与功效', group: 'ab', freq: 3, minutes: 25, ready: true, verify: '01_power',
      desc: '拖动效应量、样本量和 α，看功效怎么变；p 值是什么、不是什么；样本量计算器。' },
    { id: 'peeking', title: '偷看与序贯检验', group: 'ab', freq: 2, minutes: 20, ready: true, verify: '02_peeking',
      desc: "每天看一次累计数据，假阳性率涨到多少；Pocock 和 O'Brien-Fleming 门槛。" },
    { id: 'multiple', title: '多重检验', group: 'ab', freq: 2, minutes: 20, ready: true, verify: '03_multiple',
      desc: 'FWER 和 FDR 的区别；拖动 p 值，对比 Bonferroni、Holm 和 BH 各拒绝哪些。' },
    { id: 'cuped', title: 'CUPED 方差缩减', group: 'ab', freq: 2, minutes: 20, ready: true, verify: '04_cuped',
      desc: '拖动实验前后指标的相关系数，看方差变成 1−ρ²、样本量省多少。' },
    { id: 'pitfalls', title: '实验结果的陷阱', group: 'ab', freq: 3, minutes: 30, ready: true, verify: '05_pitfalls',
      desc: '只看付费用户的选择偏差、放量时的辛普森悖论、赢家诅咒、新奇效应。' },
    { id: 'delta', title: '比率指标与 Delta 方法', group: 'ab', freq: 2, minutes: 20, ready: false, verify: '08_delta',
      desc: '按用户分流、按曝光算指标时，朴素标准误为什么偏小；Delta 与 Bootstrap。' },
    { id: 'did', title: '双重差分 DID', group: 'causal', freq: 3, minutes: 30, ready: false, verify: '10_did',
      desc: '平行趋势被破坏时估计偏多少；事件研究图；交错上线时 TWFE 的偏误。' },
    { id: 'psm', title: '倾向得分匹配 PSM', group: 'causal', freq: 3, minutes: 25, ready: false, verify: '11_psm',
      desc: '倾向得分重叠、卡钳、有放回与无放回的偏差-方差取舍、SMD 平衡图。' },
    { id: 'rdd-iv', title: '断点回归与工具变量', group: 'causal', freq: 1, minutes: 30, ready: false, verify: '12_rdd_iv',
      desc: '带宽选择、凑单让 RDD 失效；鼓励设计里的依从者和 Wald 估计（LATE）。' },
    { id: 'uplift', title: '增益模型 Uplift', group: 'causal', freq: 2, minutes: 30, ready: false, verify: '13_uplift',
      desc: '四类人群、S / T / X-Learner、X-Learner 权重方向、Qini 曲线；联系 X5 项目。' },
    { id: 'decomposition', title: '指标异动拆解', group: 'metric', freq: 3, minutes: 25, ready: false, verify: '06_decomposition',
      desc: '把总指标变化拆成“结构变化”和“各自比率变化”；视频平台指标树。' },
    { id: 'recsys', title: '推荐链路与排序指标', group: 'rec', freq: 2, minutes: 30, ready: false, verify: '07_recsys',
      desc: '召回 → 粗排 → 精排 → 重排；拖动列表算 P@K、R@K、NDCG、AUC 和 GAUC。' },
    { id: 'threshold', title: '分类阈值实验室', group: 'ml', freq: 2, minutes: 20, ready: false, verify: '14_threshold',
      desc: '拖动阈值看混淆矩阵、精确率、召回率、ROC 和 PR 曲线；类别不平衡时看 PR。' },
    { id: 'bias-variance', title: '偏差-方差与正则化', group: 'ml', freq: 2, minutes: 20, ready: false, verify: '15_bias_variance',
      desc: '多项式拟合的欠拟合 / 过拟合；L1 把系数压到 0，L2 只缩小。' },
    { id: 'clt', title: '中心极限定理与置信区间', group: 'stat', freq: 3, minutes: 20, ready: false, verify: '09_clt',
      desc: '偏态分布的样本均值怎样趋近正态；95% 置信区间的“95%”到底指什么。' },
    { id: 'flashcards', title: '闪卡总复习', group: 'review', freq: 0, minutes: 15, ready: false,
      desc: '汇总所有页面的自测题，随机抽题。' },
  ];
})(typeof window !== 'undefined' ? window : globalThis);

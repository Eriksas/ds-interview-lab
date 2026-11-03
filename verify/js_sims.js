// 用 Node 加载网页里同一份模拟代码（assets/js/core.js + assets/js/pages/*.js），
// 按页面默认参数（seed 42）运行，输出 JSON。compare_js.py 会调用它并和 numpy 结果对照。
// 运行：node verify/js_sims.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console });
const load = (rel) => vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
load('assets/js/core.js');
for (const f of fs.readdirSync(path.join(root, 'assets/js/pages')).sort()) load('assets/js/pages/' + f);
const Lab = ctx.Lab;
const out = {};
const prop = (k, n) => ({ value: k / n, se: Math.sqrt(((k / n) * (1 - k / n)) / n), n });

/* ---------- 页面 1：假设检验与功效 ---------- */
if (Lab.sim.power) {
  const P = Lab.sim.power;
  out['power.power_default'] = { value: P.power(0.1, 0.006, 40000, 0.05, 2).power };
  out['power.power_half_n'] = { value: P.power(0.1, 0.006, 20000, 0.05, 2).power };
  out['power.n_calc_default'] = { value: Math.ceil(P.nPerGroup(0.1, 0.005, 0.05, 0.8, 2)) };
  for (const [tag, nExp] of [['default', 2000], ['big', 200000]]) {
    const s = P.pvalueMix(0.2, 2.8, nExp, 42);
    let sig = 0, sigNull = 0;
    s.p.forEach((p, i) => { if (p < 0.05) { sig++; if (!s.eff[i]) sigNull++; } });
    out[`power.fdr_pi20_${tag}`] = prop(sigNull, sig);
  }
  const s0 = P.pvalueMix(0, 2.8, 200000, 42);
  out['power.null_sig_rate'] = prop(s0.p.filter((p) => p < 0.05).length, s0.p.length);
}

/* ---------- 页面 2：偷看与序贯检验 ---------- */
if (Lab.sim.peeking) {
  const P = Lab.sim.peeking;
  for (const [tag, n] of [['default', 4000], ['big', 100000]]) {
    const r = P.peekAA(14, n, 0, 42);
    out[`peeking.fpr_day7_${tag}`] = prop(Math.round(r.fpr[6] * n), n);
    out[`peeking.fpr_day14_${tag}`] = prop(Math.round(r.fpr[13] * n), n);
  }
  for (const m of ['naive', 'pocock', 'obf']) {
    for (const [tag, n] of [['default', 20000], ['big', 200000]]) {
      const r = P.seqSim(P.bounds(m, 5), 0, n, 42);
      out[`peeking.K5_theta0_${m}_${tag}`] = prop(Math.round(r.reject * n), n);
    }
    const r = P.seqSim(P.bounds(m, 5), 2.8, 200000, 42);
    out[`peeking.K5_theta28_${m}`] = prop(Math.round(r.reject * 200000), 200000);
  }
  out['peeking.pocock_K5'] = { value: P.POCOCK[5] };
  out['peeking.obf_cb_K5'] = { value: P.OBF_CB[5] };
  out['peeking.pocock_K3'] = { value: P.POCOCK[3] };
  out['peeking.obf_cb_K3'] = { value: P.OBF_CB[3] };
}

/* ---------- 页面 3：多重检验 ---------- */
if (Lab.sim.multiple) {
  const M = Lab.sim.multiple;
  const p = [0.001, 0.014, 0.016, 0.022, 0.03, 0.045, 0.3, 0.7];
  for (const k of ['none', 'bonf', 'holm', 'bh']) out[`multiple.default_${k}_count`] = { value: M[k](p, 0.05).filter(Boolean).length };
  for (const [tag, n] of [['default', 4000], ['big', 40000]]) {
    const r = M.simulate(20, 0.25, 3, n, 42);
    for (const k of ['none', 'bonf', 'bh']) {
      out[`multiple.${k}_fwer_${tag}`] = prop(Math.round(r.res[k].fwer * n), n);
      out[`multiple.${k}_fdr_${tag}`] = { value: r.res[k].fdr, n };
    }
  }
}

/* ---------- 页面 4：CUPED ---------- */
if (Lab.sim.cuped) {
  const C = Lab.sim.cuped;
  for (const [tag, reps] of [['default', 300], ['big', 4000]]) {
    const r = C.repeat(500, 0.7, 2, reps, 43);
    out[`cuped.power_raw_${tag}`] = prop(Math.round(r.powRaw * reps), reps);
    out[`cuped.power_cv_${tag}`] = prop(Math.round(r.powCv * reps), reps);
    const m = Lab.stats.mean(r.cv), sd = Math.sqrt(Lab.stats.variance(r.cv));
    out[`cuped.mean_cv_${tag}`] = { value: m, se: sd / Math.sqrt(reps), n: reps };
  }
  const a = C.repeat(500, 0.7, 0, 20000, 44);
  out['cuped.aa_fpr_cv'] = prop(Math.round(a.powCv * 20000), 20000);
  out['cuped.n_needed_raw'] = { value: C.nNeeded(2, 1) };
  out['cuped.n_needed_cv'] = { value: C.nNeeded(2, 0.51) };
}


/* ---------- 页面 5：实验结果的陷阱 ---------- */
if (Lab.sim.pitfalls) {
  const P = Lab.sim.pitfalls;
  const e = P.payExpected(0.03, 1);
  out['pitfalls.arpu_rel_expected'] = { value: e.arpuT / e.arpuC - 1 };
  out['pitfalls.arppu_rel_expected'] = { value: (e.arpuT / e.prT) / (e.arpuC / e.prC) - 1 };
  const s = P.paySim(0.03, 1, 200000, 42);
  const all = [P.meanSe(s.c), P.meanSe(s.t)];
  const pay = [P.meanSe(s.c.filter((x) => x > 0)), P.meanSe(s.t.filter((x) => x > 0))];
  out['pitfalls.arpu_diff_sim'] = { value: all[1].m - all[0].m, se: Math.hypot(all[0].se, all[1].se) };
  out['pitfalls.arppu_diff_sim'] = { value: pay[1].m - pay[0].m, se: Math.hypot(pay[0].se, pay[1].se) };
  out['pitfalls.payrate_t_sim'] = prop(pay[1].n, 200000);
  const r = P.ramp(0.5, 0.04, 0.005);
  out['pitfalls.ramp_pooled'] = { value: r.pooled };
  out['pitfalls.ramp_weighted'] = { value: r.weighted };
  const w = P.winners(20000, 2000, 42);
  out['pitfalls.winner_ratio_theory'] = { value: w.ratio };
  out['pitfalls.winner_power'] = { value: w.power };
  const wb = P.winners(20000, 200000, 42);
  out['pitfalls.winner_ratio_sim_big'] = { value: wb.simRatio, n: wb.nSig };
  const nv = P.novelty(7, 0.002, 0.01, 3);
  out['pitfalls.novelty_7d_avg'] = { value: Lab.stats.mean(nv) };
}


/* ---------- 页面 6：指标异动拆解 ---------- */
if (Lab.sim.decomposition) {
  const D = Lab.sim.decomposition;
  const d = D.decompose(D.BASE, D.CUR);
  const s = (a) => a.reduce((x, y) => x + y, 0);
  out['decomp.total'] = { value: d.R2 - d.R1 };
  out['decomp.mix_sym'] = { value: s(d.mix) };
  out['decomp.rate_sym'] = { value: s(d.rate) };
  out['decomp.mix_film_sym'] = { value: d.mix[1] };
  out['decomp.inter_base'] = { value: s(d.interB) };
  const d2 = D.decompose(D.BASE, { n: [40, 70, 20], r: [0.051, 0.031, 0.022] });
  out['decomp.all_up_total'] = { value: d2.R2 - d2.R1 };
}


/* ---------- 页面 7：推荐与排序指标 ---------- */
if (Lab.sim.recsys) {
  const R = Lab.sim.recsys;
  const users = R.USERS.map((u) => ({ rel: u.rel, base: u.base, ties: [] }));
  const a = users[0];
  const sA = R.scores(8, a.base, []);
  out['recsys.A_p3'] = { value: R.pAtK(a.rel, 3) };
  out['recsys.A_r3'] = { value: R.rAtK(a.rel, 3) };
  out['recsys.A_ndcg3'] = { value: R.ndcgAtK(a.rel, 3) };
  out['recsys.A_auc'] = { value: R.auc(a.rel.map((r) => (r >= 1 ? 1 : 0)), sA) };
  const g = R.gauc(users);
  out['recsys.gauc_imp'] = { value: g.gaucImp };
  out['recsys.gauc_clk'] = { value: g.gaucClk };
  out['recsys.global_auc'] = { value: g.global };
  const tie = users.map((u, i) => (i === 0 ? { ...u, ties: [false, false, true] } : u));
  out['recsys.A_auc_tie23'] = { value: R.gauc(tie).per[0].auc };
  out['recsys.funnel_ratio'] = { value: R.funnelCost(5000, 500, 1, 50).ratio };
}


/* ---------- 页面 8：Delta 方法 ---------- */
if (Lab.sim.delta) {
  const D = Lab.sim.delta;
  for (const [tag, reps] of [['default', 400], ['big', 2000]]) {
    const e = D.experiment(1000, 10, 0.04, reps, 49);
    out[`delta.fpr_naive_${tag}`] = prop(Math.round(e.fprNaive * reps), reps);
    out[`delta.fpr_delta_${tag}`] = prop(Math.round(e.fprDelta * reps), reps);
    out[`delta.ratio_naive_true_${tag}`] = { value: e.naive / e.true, se: (e.naive / e.true) / Math.sqrt(2 * (reps - 1)), n: reps };
  }
}


/* ---------- 页面 9：中心极限定理与置信区间 ---------- */
if (Lab.sim.clt) {
  const C = Lab.sim.clt;
  for (const [d, n, reps] of [['normal', 30, 4000], ['normal', 30, 20000], ['lognorm', 10, 20000], ['exp', 30, 20000], ['bern', 100, 20000]]) {
    const r = C.intervals(d, n, reps, 51);
    out[`clt.cover_${d}_${n}_${reps}`] = prop(Math.round(r.coverage * reps), reps);
  }
  const ms = C.sampleMeans('exp', 30, 20000, 52);
  const sd = Math.sqrt(Lab.stats.variance(ms));
  out['clt.exp30_mean'] = { value: Lab.stats.mean(ms), se: sd / Math.sqrt(20000) };
  out['clt.exp30_sd'] = { value: sd, se: sd / Math.sqrt(2 * 19999) };
}


/* ---------- 页面 10：DID ---------- */
if (Lab.sim.did) {
  const D = Lab.sim.did;
  for (const [nv, b, g] of [[0, 1, 0.5], [0, 0, 1], [1, 1, 0.5], [1, 0, 1], [0, 1, 0]]) {
    const r = D.stagger(b, g, !!nv);
    out[`did.stagger_never${nv}_b${b}_g${g}_twfe`] = { value: r.twfe };
    out[`did.stagger_never${nv}_b${b}_g${g}_att`] = { value: r.att };
    out[`did.stagger_never${nv}_b${b}_g${g}_cs`] = { value: r.cs };
  }
  // 2×2 DID 偏差：重复 400 次取平均，和理论 6s 比
  let sum = 0, sum2 = 0;
  for (let i = 0; i < 2000; i++) { const e = D.did2x2(D.panel2(30, 0.2, 2, 1000 + i)) - 2; sum += e; sum2 += e * e; }
  const m = sum / 2000, sd = Math.sqrt(sum2 / 2000 - m * m);
  out['did.bias_s02_mean'] = { value: m, se: sd / Math.sqrt(2000) };
}


/* ---------- 页面 11：PSM ---------- */
if (Lab.sim.psm) {
  const P = Lab.sim.psm;
  for (const [cal, tag] of [[0.2, 'cal02'], [Infinity, 'nocal']]) {
    const r = P.repeat(600, 1.5, cal, 300, 61);
    for (const k of ['naive', 'repl', 'norepl']) {
      out[`psm.${tag}_${k}_bias`] = { value: r[k].bias, se: r[k].sd / Math.sqrt(300) };
      out[`psm.${tag}_${k}_sd`] = { value: r[k].sd, se: r[k].sd / Math.sqrt(2 * 299) };
    }
  }
}


/* ---------- 页面 12：RDD 与 IV ---------- */
if (Lab.sim.rddiv) {
  const R = Lab.sim.rddiv;
  // 确定性数据核对局部线性估计
  const xs = [], ys = [];
  for (let i = 0; i < 4000; i++) { const x = 40 + (120 * i) / 3999; xs.push(x); ys.push(R.f(x - 100) + (x >= 100 ? 3 : 0) + Math.sin(i)); }
  const ll = R.localLinear(xs, ys, 15);
  out['rddiv.det_est'] = { value: ll.est };
  out['rddiv.det_se'] = { value: ll.se };
  for (const [manip, h, tag] of [[false, 15, 'h15'], [true, 15, 'manip_h15'], [false, 40, 'h40']]) {
    const r = Lab.rng(71), e = [];
    for (let k = 0; k < 300; k++) { const d = R.rddGen(4000, manip, 0.6, r); e.push(R.localLinear(d.x, d.y, h).est - 3); }
    const sd = Math.sqrt(Lab.stats.variance(e));
    out[`rddiv.bias_${tag}`] = { value: Lab.stats.mean(e), se: sd / Math.sqrt(300) };
  }
  const r = Lab.rng(72), w = [], nv = [];
  for (let k = 0; k < 300; k++) { const e = R.ivEst(R.ivGen(10000, 0.3, 0.2, 10, 15, r)); w.push(e.wald); nv.push(e.naive); }
  out['rddiv.wald_mean'] = { value: Lab.stats.mean(w), se: Math.sqrt(Lab.stats.variance(w) / 300) };
  out['rddiv.naive_mean'] = { value: Lab.stats.mean(nv), se: Math.sqrt(Lab.stats.variance(nv) / 300) };
}


/* ---------- 页面 13：增益模型 ---------- */
if (Lab.sim.uplift) {
  const U = Lab.sim.uplift;
  for (const b of [0.1, 0.2, 0.5, 0.97]) {
    const r = U.fourGroups(0.1, 0.4, 0.45, b);
    out[`uplift.four_b${b}_resp`] = { value: r.resp };
    out[`uplift.four_b${b}_upl`] = { value: r.upl };
  }
  // 确定性数据核对 Qini 系数（与 sklift 一致）
  const n = 5000, y = [], t = [], tau = [], resp = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n, ti = i % 2, base = 0.2 + 0.6 * x, tu = 0.12 * (1 - x) - 0.01;
    t.push(ti); tau.push(tu); resp.push(base + tu);
    y.push(((i * 7919) % 1000) / 1000 < base + tu * ti ? 1 : 0);
  }
  out['uplift.qini_det_tau'] = { value: U.qiniCoef(y, tau, t) };
  out['uplift.qini_det_resp'] = { value: U.qiniCoef(y, resp, t) };
  for (const e of [0.05, 0.5]) {
    const r = Lab.rng(81), acc = { T: [], X: [], Xrev: [] };
    for (let k = 0; k < 300; k++) { const o = U.learners(1000, e, r); for (const key in acc) acc[key].push(U.rmse(o[key])); }
    for (const key in acc) out[`uplift.rmse_e${e}_${key}`] = { value: Lab.stats.mean(acc[key]), se: Math.sqrt(Lab.stats.variance(acc[key]) / 300) };
  }
}


/* ---------- 页面 14：分类阈值 ---------- */
if (Lab.sim.threshold) {
  const T = Lab.sim.threshold;
  for (const [d, pi, t] of [[1.5, 0.1, 1], [1.5, 0.01, 1], [3, 0.01, 2]]) {
    const m = T.metrics(d, pi, t);
    out[`threshold.prec_${d}_${pi}_${t}`] = { value: m.precision };
    out[`threshold.f1_${d}_${pi}_${t}`] = { value: m.f1 };
  }
  out['threshold.auc_1.5'] = { value: T.auc(1.5) };
  out['threshold.ap_1.5_0.1'] = { value: T.ap(1.5, 0.1) };
  out['threshold.ap_1.5_0.01'] = { value: T.ap(1.5, 0.01) };
  out['threshold.bestf1_t_0.1'] = { value: T.bestF1(1.5, 0.1).t };
  out['threshold.bestf1_t_0.01'] = { value: T.bestF1(1.5, 0.01).t };
}


/* ---------- 页面 15：偏差-方差与正则化 ---------- */
if (Lab.sim.biasvar) {
  const B = Lab.sim.biasvar;
  const d = B.genReg(100, Lab.rng(42));
  for (const lam of [0.01, 0.1, 0.5, 2]) {
    B.lasso(d.X, d.y, lam).forEach((v, j) => (out[`bv.lasso_${lam}_b${j}`] = { value: v }));
    B.ridge(d.X, d.y, lam).forEach((v, j) => (out[`bv.ridge_${lam}_b${j}`] = { value: v }));
  }
  const p = B.genPoly(20, Lab.rng(42));
  const m = B.fitPoly(p.x, p.y, 9);
  out['bv.poly9_pred_0.33'] = { value: m.predict(0.33) };
  const c = B.curves(20, 12, 300, 91);
  for (const deg of [1, 3, 12]) {
    out[`bv.train_deg${deg}`] = { value: c[deg - 1].train, n: 300 };
    out[`bv.bias2_deg${deg}`] = { value: c[deg - 1].bias2, n: 300 };
  }
}

console.log(JSON.stringify(out, null, 1));

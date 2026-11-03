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

console.log(JSON.stringify(out, null, 1));

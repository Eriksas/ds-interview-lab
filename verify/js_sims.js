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

console.log(JSON.stringify(out, null, 1));

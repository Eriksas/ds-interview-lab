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

console.log(JSON.stringify(out, null, 1));

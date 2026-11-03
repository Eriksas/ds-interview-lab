/* 页面 13：增益模型 Uplift */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const B1 = 20;
  const GRID = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
  const mu0 = (x) => 3 + 2 * Math.sin(2 * Math.PI * x);
  const tauF = (x) => 0.5 + x;

  function binnedFit(xs, ys) {
    const s = new Array(B1).fill(0), c = new Array(B1).fill(0);
    xs.forEach((x, i) => { const b = Math.min(B1 - 1, Math.floor(x * B1)); s[b] += ys[i]; c[b]++; });
    const glob = S.mean(ys);
    const m = s.map((v, b) => (c[b] ? v / c[b] : glob));
    return (x) => m[Math.min(B1 - 1, Math.floor(x * B1))];
  }
  function linFit(xs, ys) {
    const mx = S.mean(xs), my = S.mean(ys);
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
    const b = sxx > 0 ? sxy / sxx : 0;
    return (x) => my + b * (x - mx);
  }

  const U = (Lab.sim.uplift = {
    /* 四类人群：每发 1,000 人带来的增量购买 */
    fourGroups(pp, ps, pl, budget) {
      const pd = 1 - pp - ps - pl, top = pp + ps, rest = pl + pd;
      const resp = budget <= top ? (budget * pp) / top : pp - ((budget - top) * pd) / rest;
      const upl = Math.min(budget, pp) - Math.max(0, budget - (1 - pd));
      return { random: (pp - pd) * 1000, resp: (resp / budget) * 1000, upl: (upl / budget) * 1000 };
    },
    /* 一次模拟：返回各 learner 在网格上的估计曲线 */
    learners(n, e, r) {
      const x = [], y = [], t = [];
      for (let i = 0; i < n; i++) {
        const xi = r.uniform(), ti = r.uniform() < e;
        x.push(xi); t.push(ti); y.push(mu0(xi) + (ti ? tauF(xi) : 0) + r.normal());
      }
      const xt = x.filter((v, i) => t[i]), yt = y.filter((v, i) => t[i]);
      const xc = x.filter((v, i) => !t[i]), yc = y.filter((v, i) => !t[i]);
      if (xt.length < 2 || xc.length < 2) return null;
      const m1 = binnedFit(xt, yt), m0 = binnedFit(xc, yc);
      // S-Learner：分箱 + 处理变量的加性模型，只能得到一个常数效应
      let num = 0, den = 0;
      for (let b = 0; b < B1; b++) {
        const inb = (v) => Math.min(B1 - 1, Math.floor(v * B1)) === b;
        const tb = yt.filter((v, i) => inb(xt[i])), cb = yc.filter((v, i) => inb(xc[i]));
        if (tb.length && cb.length) { const w = (tb.length * cb.length) / (tb.length + cb.length); num += w * (S.mean(tb) - S.mean(cb)); den += w; }
      }
      const sConst = num / den;
      const t1 = linFit(xt, yt.map((v, i) => v - m0(xt[i])));
      const t0 = linFit(xc, yc.map((v, i) => m1(xc[i]) - v));
      return {
        S: GRID.map(() => sConst),
        T: GRID.map((g) => m1(g) - m0(g)),
        X: GRID.map((g) => e * t0(g) + (1 - e) * t1(g)),
        Xrev: GRID.map((g) => (1 - e) * t0(g) + e * t1(g)),
      };
    },
    rmse: (curve) => Math.sqrt(S.mean(curve.map((v, i) => (v - tauF(GRID[i])) ** 2))),
    learnerErrors(n, e, reps, seed) {
      const r = Lab.rng(seed), acc = { S: [], T: [], X: [], Xrev: [] };
      for (let k = 0; k < reps; k++) {
        const o = U.learners(n, e, r);
        if (!o) continue;
        for (const key in acc) acc[key].push(U.rmse(o[key]));
      }
      const out = {};
      for (const key in acc) out[key] = S.mean(acc[key]);
      return out;
    },
    qiniData(n, r) {
      const d = { x: [], t: [], y: [], base: [], tau: [] };
      for (let i = 0; i < n; i++) {
        const x = r.uniform(), t = r.uniform() < 0.5 ? 1 : 0, base = 0.2 + 0.6 * x, tu = 0.12 * (1 - x) - 0.01;
        d.x.push(x); d.t.push(t); d.base.push(base); d.tau.push(tu);
        d.y.push(r.uniform() < base + tu * t ? 1 : 0);
      }
      return d;
    },
    /* 与 scikit-uplift 的 qini_curve 相同：按分数从高到低，只在分数变化处取点 */
    qiniCurve(y, score, t) {
      const n = y.length;
      const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[a] - score[b] || a - b).reverse();
      const xs = [0], vs = [0];
      let nt = 0, ct = 0, cc = 0;
      for (let k = 0; k < n; k++) {
        const i = idx[k];
        nt += t[i]; ct += y[i] * t[i]; cc += y[i] * (1 - t[i]);
        if (k === n - 1 || score[idx[k + 1]] !== score[i]) {
          const nall = k + 1, nc = nall - nt;
          xs.push(nall);
          vs.push(ct - (nc ? (cc * nt) / nc : 0));
        }
      }
      return { x: xs, v: vs };
    },
    auc(x, v) {
      let a = 0;
      for (let i = 1; i < x.length; i++) a += ((x[i] - x[i - 1]) * (v[i] + v[i - 1])) / 2;
      return a;
    },
    qiniCoef(y, score, t) {
      const a = U.qiniCurve(y, score, t);
      const p = U.qiniCurve(y, y.map((v, i) => v * t[i] - v * (1 - t[i])), t);
      const base = (p.x[p.x.length - 1] * p.v[p.v.length - 1]) / 2;
      return (U.auc(a.x, a.v) - base) / (U.auc(p.x, p.v) - base);
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  /* ================= 实验 1：四类人群 ================= */
  function lab1() {
    const ctl = Lab.controls('#c1', [
      { key: 'pp', label: '说服型（发了才买）', min: 0, max: 0.4, step: 0.01, value: 0.1, fmt: (v) => F.pct(v, 0) },
      { key: 'ps', label: '确定型（发不发都买）', min: 0, max: 0.8, step: 0.01, value: 0.4, fmt: (v) => F.pct(v, 0) },
      { key: 'pd', label: '反感型（发了反而不买）', min: 0, max: 0.2, step: 0.01, value: 0.05, fmt: (v) => F.pct(v, 0) },
      { key: 'budget', label: '预算：只能发给多少比例的人', min: 0.05, max: 1, step: 0.05, value: 0.2, fmt: (v) => F.pct(v, 0) },
    ], (v, key) => {
      if (v.pp + v.ps + v.pd > 1) {
        const fix = {};
        if (key === 'ps') fix.ps = Math.round((1 - v.pp - v.pd) * 100) / 100;
        else if (key === 'pp') fix.pp = Math.round((1 - v.ps - v.pd) * 100) / 100;
        else fix.pd = Math.round((1 - v.pp - v.ps) * 100) / 100;
        ctl.set(fix, true);
      }
      draw();
    });
    Lab.$('#b1-reset').addEventListener('click', () => ctl.reset());
    function draw() {
      const v = ctl.values;
      const pl = Math.max(0, 1 - v.pp - v.ps - v.pd);
      const cell = (name, share, desc, cls) => `<div class="ug-cell ${cls}"><b>${name}</b><span class="ug-share">${F.pct(share, 0)}</span><small>${desc}</small></div>`;
      Lab.$('#grid1').innerHTML =
        '<div class="ug-head"></div><div class="ug-head">不发也会买</div><div class="ug-head">不发不会买</div>' +
        '<div class="ug-side">发了会买</div>' + cell('确定型', v.ps, '增益 0：发了是浪费', 'sure') + cell('说服型', v.pp, '增益 +1：真正该发的人', 'pers') +
        '<div class="ug-side">发了不买</div>' + cell('反感型', v.pd, '增益 −1：发了反而不买', 'dog') + cell('无望型', pl, '增益 0：怎么都不买', 'lost');
      const r = U.fourGroups(v.pp, v.ps, pl, v.budget);
      const rows = [{ k: '随机发', v: r.random, col: 'var(--muted)' }, { k: '按购买概率（响应模型）', v: r.resp, col: 'var(--s4)' }, { k: '按增益（增益模型）', v: r.upl, col: 'var(--s2)' }];
      const c = Lab.chart('#ch1', { height: 150, margin: { t: 10, r: 46, b: 44, l: 150 }, label: '三种选人方式的增量' });
      const x = d3.scaleLinear([Math.min(0, d3.min(rows, (o) => o.v)), Math.max(10, d3.max(rows, (o) => o.v)) * 1.05], [0, c.w]).nice();
      const y = d3.scaleBand(rows.map((o) => o.k), [0, c.h]).padding(0.3);
      Lab.axes(c, x, y, { xTitle: '每发 1,000 人多带来的购买（人）', grid: false, y: false, xTicks: 4 });
      c.g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--axis)');
      rows.forEach((o) => {
        const yy = y(o.k);
        c.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', yy + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(o.k);
        c.g.append('rect').attr('x', x(Math.min(0, o.v))).attr('width', Math.max(1, Math.abs(x(o.v) - x(0)))).attr('y', yy).attr('height', y.bandwidth()).attr('rx', 3).style('fill', o.col);
        c.g.append('text').attr('class', 'lbl').attr('x', c.w + 6).attr('y', yy + y.bandwidth() / 2 + 4).text(o.v.toFixed(0));
      });
      Lab.$('#r1').innerHTML = Lab.stat('全部都发的平均增量（ATE）', F.pct(v.pp - v.pd, 1)) + Lab.stat('无望型', F.pct(pl, 0));
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 实验 2：S / T / X-Learner ================= */
  function lab2() {
    let seed = 42;
    const N = 1000, REPS = 120;
    const ctl = Lab.controls('#c2', [
      { key: 'e', label: '处理组（收到短信）占比', min: 0.03, max: 0.5, step: 0.01, value: 0.05, fmt: (v) => F.pct(v, 0), full: true },
    ], Lab.throttle(draw));
    Lab.$('#b2-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b2-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    const SER = [
      { k: 'T', name: 'T-Learner', col: 'var(--s4)' },
      { k: 'X', name: 'X-Learner（权重 g = e）', col: 'var(--s2)' },
      { k: 'Xrev', name: 'X-Learner（权重反过来）', col: 'var(--bad)' },
      { k: 'S', name: 'S-Learner', col: 'var(--s1)' },
    ];
    Lab.legend('#lg2', SER.map((s) => ({ color: s.col, label: s.name, line: true })).concat([{ color: 'var(--good)', label: '真实增益 τ(x)', dash: true }]));
    function draw() {
      const e = ctl.values.e;
      const one = U.learners(N, e, Lab.rng(seed));
      const c = Lab.chart('#ch2', { height: 230, margin: { t: 26, r: 12, b: 46, l: 40 }, label: '各 learner 估计的增益曲线' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const all = one ? SER.flatMap((s) => one[s.k]) : [0, 2];
      const y = d3.scaleLinear([Math.max(-2, Math.min(0, d3.min(all))), Math.min(4, Math.max(2, d3.max(all)))], [c.h, 0]).nice();
      Lab.axes(c, x, y, { xTitle: '用户特征 x', yTitle: '估计的增益 τ̂(x)', yTicks: 5 });
      if (one) {
        SER.forEach((s) => c.g.append('path').attr('d', d3.line().x((d, i) => x(GRID[i])).y((d) => y(Lab.clamp(d, y.domain()[0], y.domain()[1])))(one[s.k])).style('fill', 'none').style('stroke', s.col).style('stroke-width', s.k === 'X' ? 2.5 : 1.6).style('opacity', s.k === 'T' ? 0.8 : 1));
      }
      c.g.append('path').attr('d', d3.line().x((g) => x(g)).y((g) => y(tauF(g)))(GRID)).style('fill', 'none').style('stroke', 'var(--good)').style('stroke-width', 2.5).style('stroke-dasharray', '6 4');
      const err = U.learnerErrors(N, e, REPS, seed + 5);
      const c2 = Lab.chart('#ch3', { height: 170, margin: { t: 10, r: 46, b: 44, l: 158 }, label: '各 learner 的误差' });
      const x2 = d3.scaleLinear([0, d3.max(SER, (s) => err[s.k]) * 1.1], [0, c2.w]).nice();
      const y2 = d3.scaleBand(SER.map((s) => s.name), [0, c2.h]).padding(0.3);
      Lab.axes(c2, x2, y2, { xTitle: `误差（均方根，重复 ${REPS} 次平均，越小越好）`, grid: false, y: false, xTicks: 4 });
      SER.forEach((s) => {
        const yy = y2(s.name);
        c2.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', yy + y2.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(s.name);
        c2.g.append('rect').attr('x', 0).attr('width', Math.max(1, x2(err[s.k]))).attr('y', yy).attr('height', y2.bandwidth()).attr('rx', 3).style('fill', s.col);
        c2.g.append('text').attr('class', 'lbl').attr('x', c2.w + 6).attr('y', yy + y2.bandwidth() / 2 + 4).text(err[s.k].toFixed(3));
      });
      Lab.$('#cap2').innerHTML = `处理组占 ${F.pct(e, 0)}：正确的权重 g = e = ${e.toFixed(2)} 给 τ̂₀，<strong>${(1 - e).toFixed(2)}</strong> 给 τ̂₁（用处理组样本、借对照组模型 μ̂₀ 算出来的那个）。`;
    }
    draw();
    Lab.watch('#ch2', draw);
  }

  /* ================= 实验 3：Qini 曲线 ================= */
  function lab3() {
    let seed = 42;
    const N = 10000;
    const ctl = Lab.controls('#c3', [
      { key: 'noise', label: '增益模型的噪声（0 = 按真实增益排序）', min: 0, max: 4, step: 0.25, value: 1, fmt: (v) => v.toFixed(2) + ' 倍', full: true },
    ], Lab.throttle(draw));
    Lab.$('#b3-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b3-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg3', [
      { color: 'var(--s2)', label: '增益模型', line: true },
      { color: 'var(--s4)', label: '响应模型（按购买概率）', line: true },
      { color: 'var(--good)', label: '按真实增益排序', dash: true },
      { color: 'var(--text-2)', label: '随机发', dash: true },
    ]);
    function draw() {
      const d = U.qiniData(N, Lab.rng(seed));
      const sd = Math.sqrt(S.variance(d.tau));
      const rn = Lab.rng(seed + 1);
      const score = d.tau.map((t) => t + ctl.values.noise * sd * rn.normal());
      const resp = d.base.map((b, i) => b + d.tau[i]);
      const cm = U.qiniCurve(d.y, score, d.t), cr = U.qiniCurve(d.y, resp, d.t), co = U.qiniCurve(d.y, d.tau, d.t);
      const total = cm.v[cm.v.length - 1];
      const c = Lab.chart('#ch4', { height: 250, margin: { t: 26, r: 12, b: 46, l: 44 }, label: 'Qini 曲线' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const all = cm.v.concat(cr.v, co.v);
      const y = d3.scaleLinear([Math.min(0, d3.min(all)), d3.max(all) * 1.05], [c.h, 0]).nice();
      Lab.axes(c, x, y, { xTitle: '按分数从高到低，发给前多少比例的人', yTitle: '多带来的购买（人，共 1 万人）', yTicks: 5, xFmt: d3.format('.0%') });
      const ln = (cv) => d3.line().x((v, i) => x(cv.x[i] / N)).y((v) => y(v))(cv.v);
      c.g.append('line').attr('x1', x(0)).attr('x2', x(1)).attr('y1', y(0)).attr('y2', y(total)).style('stroke', 'var(--text-2)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      c.g.append('path').attr('d', ln(co)).style('fill', 'none').style('stroke', 'var(--good)').style('stroke-width', 2).style('stroke-dasharray', '6 4');
      c.g.append('path').attr('d', ln(cr)).style('fill', 'none').style('stroke', 'var(--s4)').style('stroke-width', 2);
      c.g.append('path').attr('d', ln(cm)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2.5);
      c.g.append('line').attr('x1', x(0.3)).attr('x2', x(0.3)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--axis)').style('stroke-dasharray', '2 3');
      const at = (cv, f) => { const k = cv.x.findIndex((v) => v >= f * N); return cv.v[k < 0 ? cv.v.length - 1 : k]; };
      Lab.$('#r3').innerHTML =
        Lab.stat('增益模型 Qini 系数', U.qiniCoef(d.y, score, d.t).toFixed(4), 'hl') +
        Lab.stat('响应模型 Qini 系数', U.qiniCoef(d.y, resp, d.t).toFixed(4), 'bad') +
        Lab.stat('前 30%：增益模型拿到全部增量的', F.pct(at(cm, 0.3) / total, 0)) +
        Lab.stat('前 30%：响应模型拿到', F.pct(at(cr, 0.3) / total, 0));
    }
    draw();
    Lab.watch('#ch4', draw);
  }

  Lab.ready(() => {
    lab1();
    lab2();
    lab3();
  });
})(typeof window !== 'undefined' ? window : globalThis);

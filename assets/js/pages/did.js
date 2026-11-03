/* 页面 10：双重差分 DID */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const PERIODS = Array.from({ length: 12 }, (_, i) => i - 6); // −6..5
  const T = 10;

  const D = (Lab.sim.did = {
    PERIODS,
    /* 两组面板：y[g][i][k]，k 是 PERIODS 的下标 */
    panel2(n, s, tau, seed) {
      const r = Lab.rng(seed);
      const y = [[], []];
      for (const g of [0, 1]) {
        for (let i = 0; i < n; i++) {
          const fe = r.normal();
          y[g].push(PERIODS.map((t) => (g ? 11 : 10) + fe + 0.15 * t + s * t * g + (g && t >= 0 ? tau : 0) + r.normal(0, 0.6)));
        }
      }
      return y;
    },
    means(y) {
      return [0, 1].map((g) => PERIODS.map((_, k) => S.mean(y[g].map((u) => u[k]))));
    },
    did2x2(y) {
      const m = D.means(y);
      const avg = (g, post) => S.mean(PERIODS.map((t, k) => ((t >= 0) === post ? m[g][k] : null)).filter((v) => v !== null));
      return avg(1, true) - avg(1, false) - (avg(0, true) - avg(0, false));
    },
    /* 事件研究：以 t=−1 为基期；β_k = 处理组 (y_k − y_{−1}) 均值 − 对照组；标准误按单位 */
    eventStudy(y) {
      const base = PERIODS.indexOf(-1);
      const out = [];
      PERIODS.forEach((t, k) => {
        if (t === -1) return;
        const a = y[1].map((u) => u[k] - u[base]), b = y[0].map((u) => u[k] - u[base]);
        out.push({ t, beta: S.mean(a) - S.mean(b), se: Math.sqrt(S.variance(a) / a.length + S.variance(b) / b.length) });
      });
      return out;
    },
    /* 交错上线（无噪声期望值）：早上线 g=4、晚上线 g=8，可选从未上线组 */
    stagger(base, growth, never) {
      const cohorts = [4, 8].concat(never ? [null] : []);
      const Dm = cohorts.map((g) => Array.from({ length: T }, (_, j) => (g !== null && j + 1 >= g ? 1 : 0)));
      const tau = cohorts.map((g, i) => Dm[i].map((d, j) => (d ? base + growth * (j + 1 - g) : 0)));
      const lvl = [10, 9, 8];
      const Y = cohorts.map((g, i) => Dm[i].map((d, j) => lvl[i] + 0.3 * (j + 1) + tau[i][j] * d));
      // TWFE：平衡面板下双向去均值后做一元回归
      const dm = (M) => {
        const rows = M.map((r) => S.mean(r)), cols = M[0].map((_, j) => S.mean(M.map((r) => r[j]))), all = S.mean(rows);
        return M.map((r, i) => r.map((v, j) => v - rows[i] - cols[j] + all));
      };
      const Dd = dm(Dm), Yd = dm(Y);
      let num = 0, den = 0;
      Dd.forEach((r, i) => r.forEach((v, j) => { num += v * Yd[i][j]; den += v * v; }));
      let sum = 0, cnt = 0;
      Dm.forEach((r, i) => r.forEach((d, j) => { if (d) { sum += tau[i][j]; cnt++; } }));
      // Callaway-Sant'Anna 思路：从未上线组做对照，没有就用尚未上线组
      const cells = [];
      cohorts.forEach((g, i) => {
        if (g === null) return;
        for (let t = g; t <= T; t++) {
          let ctrl = cohorts.map((h, j) => (h === null ? j : -1)).filter((j) => j >= 0);
          if (!ctrl.length) ctrl = cohorts.map((h, j) => (h !== null && h > t ? j : -1)).filter((j) => j >= 0);
          if (!ctrl.length) continue;
          const c = S.mean(ctrl.map((j) => Y[j][t - 1] - Y[j][g - 2]));
          cells.push({ i, t, est: Y[i][t - 1] - Y[i][g - 2] - c, truth: tau[i][t - 1] });
        }
      });
      return { cohorts, Dm, tau, Y, twfe: num / den, att: sum / cnt, cs: S.mean(cells.map((c) => c.est)), csTruth: S.mean(cells.map((c) => c.truth)), nCells: cells.length, nTreated: cnt };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const sg = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d === undefined ? 2 : d);

  function lab1() {
    let seed = 42;
    const N = 30;
    const ctl = Lab.controls('#c1', [
      { key: 's', label: '处理组事前每期多涨（平行趋势被破坏）', min: -0.3, max: 0.3, step: 0.05, value: 0, fmt: (v) => sg(v) },
      { key: 'tau', label: '真实效应 τ', min: 0, max: 3, step: 0.25, value: 2, fmt: (v) => v.toFixed(2) },
    ], draw);
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg1', [
      { color: 'var(--s2)', label: '处理组（实际）', line: true },
      { color: 'var(--s1)', label: '对照组', line: true },
      { color: 'var(--s2)', label: 'DID 默认的反事实（平行趋势）', dash: true },
      { color: 'var(--text-2)', label: '处理组真正的“没处理会怎样”', dash: true },
    ]);
    function draw() {
      const v = ctl.values;
      const y = D.panel2(N, v.s, v.tau, seed);
      const m = D.means(y);
      const est = D.did2x2(y);
      const preIdx = PERIODS.map((t, k) => (t < 0 ? k : -1)).filter((k) => k >= 0);
      const gap = S.mean(preIdx.map((k) => m[1][k] - m[0][k]));
      const cf = PERIODS.map((t, k) => m[0][k] + gap);
      const truthCf = PERIODS.map((t, k) => m[1][k] - (t >= 0 ? v.tau : 0));
      const c = Lab.chart('#ch1', { height: 240, margin: { t: 26, r: 14, b: 46, l: 40 }, label: '两组的平均结果' });
      const x = d3.scaleLinear([-6, 5], [0, c.w]);
      const all = m[0].concat(m[1], cf, truthCf);
      const yy = d3.scaleLinear([d3.min(all) - 0.3, d3.max(all) + 0.3], [c.h, 0]).nice();
      Lab.axes(c, x, yy, { xTitle: '相对处理开始的时期（0 = 开始处理）', yTitle: '结果均值（模拟单位）', yTicks: 5, xFmt: d3.format('d') });
      c.g.append('rect').attr('x', x(-0.5)).attr('width', c.w - x(-0.5)).attr('y', 0).attr('height', c.h).style('fill', 'var(--accent-soft)').style('opacity', 0.5);
      c.g.append('text').attr('class', 'lbl-2').attr('x', x(-0.5) + 4).attr('y', 12).text('处理后');
      const line = (arr, from) => d3.line().defined((d, k) => PERIODS[k] >= (from === undefined ? -99 : from)).x((d, k) => x(PERIODS[k])).y((d) => yy(d))(arr);
      c.g.append('path').attr('d', line(truthCf, -1)).style('fill', 'none').style('stroke', 'var(--text-2)').style('stroke-width', 1.5).style('stroke-dasharray', '2 3');
      c.g.append('path').attr('d', line(cf, -1)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2).style('stroke-dasharray', '6 4');
      [[0, 'var(--s1)'], [1, 'var(--s2)']].forEach(([g, col]) => {
        c.g.append('path').attr('d', line(m[g])).style('fill', 'none').style('stroke', col).style('stroke-width', 2);
        m[g].forEach((v2, k) => c.g.append('circle').attr('cx', x(PERIODS[k])).attr('cy', yy(v2)).attr('r', 3).style('fill', col));
      });
      Lab.$('#r1').innerHTML =
        Lab.stat('2×2 DID 估计', est.toFixed(2), 'hl') +
        Lab.stat('真实效应 τ', v.tau.toFixed(2)) +
        Lab.stat('偏差（估计 − 真实）', sg(est - v.tau), Math.abs(est - v.tau) > 0.3 ? 'bad' : '') +
        Lab.stat('理论偏差 = 趋势差 × 6', sg(6 * v.s));
      event(y);
    }
    function event(y) {
      const es = D.eventStudy(y);
      const c = Lab.chart('#ch2', { height: 230, margin: { t: 26, r: 14, b: 46, l: 40 }, label: '事件研究图' });
      const x = d3.scaleLinear([-6.5, 5.5], [0, c.w]);
      const lo = d3.min(es, (e) => e.beta - 1.96 * e.se), hi = d3.max(es, (e) => e.beta + 1.96 * e.se);
      const yy = d3.scaleLinear([Math.min(-0.5, lo), Math.max(0.5, hi)], [c.h, 0]).nice();
      Lab.axes(c, x, yy, { xTitle: '相对处理开始的时期（以 −1 期为基准）', yTitle: '处理组 − 对照组（相对 −1 期），95% 区间', yTicks: 5, xFmt: d3.format('d'), xValues: [-6, -4, -2, 0, 2, 4] });
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', yy(0)).attr('y2', yy(0)).style('stroke', 'var(--axis)');
      c.g.append('line').attr('x1', x(-0.5)).attr('x2', x(-0.5)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
      c.g.append('circle').attr('cx', x(-1)).attr('cy', yy(0)).attr('r', 4).style('fill', 'var(--surface)').style('stroke', 'var(--text-2)').style('stroke-width', 1.5);
      es.forEach((e) => {
        const col = e.t < 0 ? 'var(--s1)' : 'var(--s2)';
        c.g.append('line').attr('x1', x(e.t)).attr('x2', x(e.t)).attr('y1', yy(e.beta - 1.96 * e.se)).attr('y2', yy(e.beta + 1.96 * e.se)).style('stroke', col).style('stroke-width', 2);
        c.g.append('circle').attr('cx', x(e.t)).attr('cy', yy(e.beta)).attr('r', 4.5).style('fill', col);
      });
      const pre = es.filter((e) => e.t < -1);
      const sig = pre.filter((e) => Math.abs(e.beta / e.se) > 1.96).length;
      Lab.$('#cap2').textContent = `事前 ${pre.length} 个系数（不含基准期 −1）里，${sig} 个的 95% 区间不含 0。` + (sig ? '事前就有系统性差异，平行趋势很可疑。' : '看不出事前差异；但这不能证明平行趋势成立。');
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  function lab3() {
    const ctl = Lab.controls('#c3', [
      { key: 'base', label: '刚上线时的效应', min: 0, max: 2, step: 0.25, value: 1, fmt: (v) => v.toFixed(2) },
      { key: 'growth', label: '效应每期增长多少', min: 0, max: 1, step: 0.1, value: 0.5, fmt: (v) => v.toFixed(1) },
      { key: 'never', label: '有没有“从未上线”的对照组', type: 'seg', full: true, value: 0, options: [{ v: 0, t: '没有（所有城市最终都上线）' }, { v: 1, t: '有' }] },
    ], draw);
    Lab.$('#b3-reset').addEventListener('click', () => ctl.reset());
    const NAMES = ['早上线（第 4 期）', '晚上线（第 8 期）', '从未上线'];
    const COLS = ['var(--s2)', 'var(--s3)', 'var(--s1)'];
    function draw() {
      const v = ctl.values;
      const r = D.stagger(v.base, v.growth, !!v.never);
      Lab.legend('#lg3', r.cohorts.map((g, i) => ({ color: COLS[i], label: NAMES[i], line: true })));
      const c = Lab.chart('#ch3', { height: 230, margin: { t: 26, r: 14, b: 46, l: 40 }, label: '分批上线的三组城市' });
      const x = d3.scaleLinear([1, T], [0, c.w]);
      const all = r.Y.flat();
      const yy = d3.scaleLinear([d3.min(all) - 0.5, d3.max(all) + 0.5], [c.h, 0]).nice();
      Lab.axes(c, x, yy, { xTitle: '时期', yTitle: '结果均值（无噪声期望值）', yTicks: 5, xFmt: d3.format('d') });
      r.cohorts.forEach((g, i) => {
        if (g !== null) {
          c.g.append('line').attr('x1', x(g - 0.5)).attr('x2', x(g - 0.5)).attr('y1', 0).attr('y2', c.h).style('stroke', COLS[i]).style('stroke-dasharray', '4 3').style('opacity', 0.8);
        }
        c.g.append('path').attr('d', d3.line().x((d, j) => x(j + 1)).y((d) => yy(d))(r.Y[i])).style('fill', 'none').style('stroke', COLS[i]).style('stroke-width', 2);
        r.Y[i].forEach((y, j) => c.g.append('circle').attr('cx', x(j + 1)).attr('cy', yy(y)).attr('r', r.Dm[i][j] ? 4 : 2.5).style('fill', r.Dm[i][j] ? COLS[i] : 'var(--surface)').style('stroke', COLS[i]).style('stroke-width', 1.5));
      });
      Lab.$('#r3').innerHTML =
        Lab.stat('真实 ATT（所有已上线格子平均）', r.att.toFixed(2)) +
        Lab.stat('TWFE 回归估计', r.twfe.toFixed(2), Math.abs(r.twfe - r.att) > 0.1 ? 'bad' : 'good') +
        Lab.stat(v.never ? 'CS 思路估计（从未上线组做对照）' : 'CS 思路（只能估计有干净对照的格子）', `${r.cs.toFixed(2)}<small>（这些格子的真实值 ${r.csTruth.toFixed(2)}）</small>`, 'hl');
      // 偏误随增长速度变化
      const c2 = Lab.chart('#ch4', { height: 190, margin: { t: 26, r: 14, b: 46, l: 40 }, label: 'TWFE 偏误随效应增长速度变化' });
      const gs = d3.range(0, 1.0001, 0.05);
      const pts = gs.map((gr) => { const o = D.stagger(v.base, gr, !!v.never); return [gr, o.twfe, o.att]; });
      const x2 = d3.scaleLinear([0, 1], [0, c2.w]);
      const y2 = d3.scaleLinear([Math.min(0, d3.min(pts, (p) => p[1])) - 0.2, d3.max(pts, (p) => p[2]) + 0.2], [c2.h, 0]).nice();
      Lab.axes(c2, x2, y2, { xTitle: '效应每期增长多少', yTitle: '估计值', yTicks: 4 });
      c2.g.append('line').attr('x1', 0).attr('x2', c2.w).attr('y1', y2(0)).attr('y2', y2(0)).style('stroke', 'var(--axis)');
      c2.g.append('path').attr('d', d3.line().x((p) => x2(p[0])).y((p) => y2(p[2]))(pts)).style('fill', 'none').style('stroke', 'var(--good)').style('stroke-width', 2);
      c2.g.append('path').attr('d', d3.line().x((p) => x2(p[0])).y((p) => y2(p[1]))(pts)).style('fill', 'none').style('stroke', 'var(--bad)').style('stroke-width', 2);
      c2.g.append('circle').attr('cx', x2(v.growth)).attr('cy', y2(r.twfe)).attr('r', 5).style('fill', 'var(--bad)');
      c2.g.append('circle').attr('cx', x2(v.growth)).attr('cy', y2(r.att)).attr('r', 5).style('fill', 'var(--good)');
      Lab.legend('#lg4', [{ color: 'var(--good)', label: '真实 ATT', line: true }, { color: 'var(--bad)', label: 'TWFE 估计', line: true }]);
    }
    draw();
    Lab.watch('#ch3', draw);
  }

  Lab.ready(() => {
    lab1();
    lab3();
  });
})(typeof window !== 'undefined' ? window : globalThis);

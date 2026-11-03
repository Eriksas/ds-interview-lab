/* 页面 8：比率指标与 Delta 方法 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const MU = 0.05;

  const D = (Lab.sim.delta = {
    gen(n, m, sd, r) {
      const C = new Array(n), N = new Array(n);
      const k = sd > 0 ? (MU * (1 - MU)) / (sd * sd) - 1 : 0;
      for (let i = 0; i < n; i++) {
        N[i] = r.geometric(1 / m);
        const p = sd > 0 ? r.beta(MU * k, (1 - MU) * k) : MU;
        C[i] = r.binomial(N[i], p);
      }
      return { C, N };
    },
    ratio: (d) => S.sum(d.C) / S.sum(d.N),
    seNaive(d) {
      const R = D.ratio(d);
      return Math.sqrt((R * (1 - R)) / S.sum(d.N));
    },
    seDelta(d) {
      const R = D.ratio(d), n = d.C.length;
      const e = d.C.map((c, i) => c - R * d.N[i]);
      return Math.sqrt(S.variance(e) / (n * Math.pow(S.mean(d.N), 2)));
    },
    seBoot(d, B, r) {
      const n = d.C.length, out = [];
      for (let b = 0; b < B; b++) {
        let c = 0, nn = 0;
        for (let i = 0; i < n; i++) {
          const j = r.int(n);
          c += d.C[j];
          nn += d.N[j];
        }
        out.push(c / nn);
      }
      return Math.sqrt(S.variance(out));
    },
    /* 重复 reps 次 A/A：真实标准差、平均朴素 / Delta 标准误、两种方法的假阳性率 */
    experiment(n, m, sd, reps, seed) {
      const r = Lab.rng(seed);
      const Rs = [];
      let sn = 0, sdl = 0, fpN = 0, fpD = 0;
      for (let t = 0; t < reps; t++) {
        const a = D.gen(n, m, sd, r), b = D.gen(n, m, sd, r);
        const ra = D.ratio(a), rb = D.ratio(b);
        const na = D.seNaive(a), nb = D.seNaive(b), da = D.seDelta(a), db = D.seDelta(b);
        Rs.push(ra);
        sn += na;
        sdl += da;
        if (Math.abs((rb - ra) / Math.hypot(na, nb)) > 1.959964) fpN++;
        if (Math.abs((rb - ra) / Math.hypot(da, db)) > 1.959964) fpD++;
      }
      return { true: Math.sqrt(S.variance(Rs)), naive: sn / reps, delta: sdl / reps, fprNaive: fpN / reps, fprDelta: fpD / reps, reps };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  function init() {
    let seed = 42;
    const REPS = 400, B = 200;
    const ctl = Lab.controls('#c1', [
      { key: 'n', label: '每组用户数', min: 200, max: 5000, scale: 'log', value: 1000, round: (v) => Math.round(v / 100) * 100, fmt: F.int },
      { key: 'm', label: '人均曝光次数', min: 1, max: 50, step: 1, value: 10, fmt: (v) => v + ' 次' },
      { key: 'sd', label: '用户之间点击倾向的差异（CTR 标准差）', min: 0, max: 0.08, step: 0.005, value: 0.04, fmt: (v) => F.pct(v, 1), full: true },
    ], Lab.throttle(draw));
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });

    function draw() {
      const v = ctl.values;
      const r = Lab.rng(seed);
      const d = D.gen(v.n, v.m, v.sd, r);
      const se = { naive: D.seNaive(d), delta: D.seDelta(d), boot: D.seBoot(d, B, r) };
      const ex = D.experiment(v.n, v.m, v.sd, REPS, seed + 7);
      const rows = [
        { k: '朴素（每次曝光当独立）', v: se.naive, col: 'var(--bad)' },
        { k: 'Delta 方法', v: se.delta, col: 'var(--s3)' },
        { k: '按用户 Bootstrap', v: se.boot, col: 'var(--s4)' },
        { k: '真实（重复实验）', v: ex.true, col: 'var(--text-2)' },
      ];
      const c = Lab.chart('#ch1', { height: 190, margin: { t: 10, r: 60, b: 44, l: 150 }, label: '四种标准误对比' });
      const x = d3.scaleLinear([0, d3.max(rows, (o) => o.v) * 1.1], [0, c.w]).nice();
      const y = d3.scaleBand(rows.map((o) => o.k), [0, c.h]).padding(0.3);
      Lab.axes(c, x, y, { xTitle: 'CTR 的标准误（个百分点）', grid: false, y: false, xTicks: 4, xFmt: (t) => (t * 100).toFixed(2) });
      rows.forEach((o) => {
        c.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', y(o.k) + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(o.k);
        c.g.append('rect').attr('x', 0).attr('y', y(o.k)).attr('width', Math.max(1, x(o.v))).attr('height', y.bandwidth()).attr('rx', 3).style('fill', o.col);
        c.g.append('text').attr('class', 'lbl').attr('x', x(o.v) + 5).attr('y', y(o.k) + y.bandwidth() / 2 + 4).text((o.v * 100).toFixed(3));
      });
      c.g.append('line').attr('x1', x(ex.true)).attr('x2', x(ex.true)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
      Lab.$('#r1').innerHTML =
        Lab.stat('这组数据的 CTR', F.pct(D.ratio(d), 2)) +
        Lab.stat('朴素 ÷ 真实', (se.naive / ex.true).toFixed(2), se.naive / ex.true < 0.9 ? 'bad' : '') +
        Lab.stat('Delta ÷ 真实', (se.delta / ex.true).toFixed(2), 'good') +
        Lab.stat('A/A 假阳性：朴素', F.pct(ex.fprNaive, 1), ex.fprNaive > 0.08 ? 'bad' : '') +
        Lab.stat('A/A 假阳性：Delta', F.pct(ex.fprDelta, 1), 'hl');
      Lab.$('#cap1').textContent = `“真实”标准误和假阳性率来自重复 ${REPS} 次 A/A 实验（两组都没有效果），本身也有约 ±4% 的模拟误差；Bootstrap 重抽 ${B} 次。verify 里用 2,000 次重复得到的是：朴素约为真实的 0.78，Delta 约 0.99。`;
      scatter(d);
    }

    function scatter(d) {
      const R = D.ratio(d);
      const c = Lab.chart('#ch2', { height: 220, margin: { t: 26, r: 14, b: 46, l: 40 }, label: '每个用户的曝光和点击' });
      const show = Math.min(400, d.C.length);
      const xmax = Math.max(5, d3.quantile(d.N.slice().sort((a, b) => a - b), 0.99));
      const ymax = Math.max(3, d3.max(d.C.slice(0, show)));
      const x = d3.scaleLinear([0, xmax], [0, c.w]);
      const y = d3.scaleLinear([0, ymax], [c.h, 0]).nice();
      Lab.axes(c, x, y, { xTitle: '这个用户的曝光数 N', yTitle: '这个用户的点击数 C', yTicks: 4 });
      const r = Lab.rng(99);
      for (let i = 0; i < show; i++) {
        if (d.N[i] > xmax) continue;
        const jit = (r.uniform() - 0.5) * 0.4;
        c.g.append('circle').attr('cx', x(d.N[i] + jit)).attr('cy', y(d.C[i] + jit)).attr('r', 2.6).style('fill', 'var(--s1)').style('opacity', 0.5);
      }
      c.g.append('line').attr('x1', x(0)).attr('x2', x(xmax)).attr('y1', y(0)).attr('y2', y(R * xmax)).style('stroke', 'var(--s2)').style('stroke-width', 2);
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(xmax) - 2).attr('y', y(R * xmax) - 6).attr('text-anchor', 'end').style('fill', 'var(--s2)').text(`C = CTR × N`);
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  Lab.ready(init);
})(typeof window !== 'undefined' ? window : globalThis);

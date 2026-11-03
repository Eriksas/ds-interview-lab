/* 页面 9：中心极限定理与置信区间 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  const tipMoments = () => {
    const q = 0.05, mu = 3, s = 1.2;
    const m1 = q * Math.exp(mu + (s * s) / 2), m2 = q * Math.exp(2 * mu + 2 * s * s), m3 = q * Math.exp(3 * mu + 4.5 * s * s);
    const v = m2 - m1 * m1;
    return [m1, Math.sqrt(v), (m3 - 3 * m1 * m2 + 2 * m1 * m1 * m1) / Math.pow(v, 1.5)];
  };
  const DISTS = {
    normal: { name: '正态', draw: (r) => r.normal(10, 3), mom: [10, 3, 0], unit: '' },
    exp: { name: '指数（偏态）', draw: (r) => r.exponential(1), mom: [1, 1, 2], unit: '' },
    lognorm: { name: '对数正态（强偏态）', draw: (r) => r.lognormal(0, 1), mom: [Math.exp(0.5), Math.sqrt((Math.E - 1) * Math.E), (Math.E + 2) * Math.sqrt(Math.E - 1)], unit: '' },
    bern: { name: '0/1 稀疏（2%）', draw: (r) => (r.uniform() < 0.02 ? 1 : 0), mom: [0.02, Math.sqrt(0.02 * 0.98), 0.96 / Math.sqrt(0.02 * 0.98)], unit: '' },
    tip: { name: '打赏金额', draw: (r) => (r.uniform() < 0.05 ? r.lognormal(3, 1.2) : 0), mom: tipMoments(), unit: '元' },
  };

  const C = (Lab.sim.clt = {
    DISTS,
    sampleMeans(dist, n, reps, seed) {
      const r = Lab.rng(seed), d = DISTS[dist], out = new Array(reps);
      for (let i = 0; i < reps; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += d.draw(r);
        out[i] = s / n;
      }
      return out;
    },
    /* reps 个 95% t 区间；返回区间和覆盖率 */
    intervals(dist, n, reps, seed) {
      const r = Lab.rng(seed), d = DISTS[dist], mu = d.mom[0];
      const t = S.tPpf(0.975, n - 1);
      const out = [];
      let cover = 0;
      for (let i = 0; i < reps; i++) {
        let s = 0, s2 = 0;
        for (let j = 0; j < n; j++) {
          const x = d.draw(r);
          s += x;
          s2 += x * x;
        }
        const m = s / n, sd = Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1)));
        const h = (t * sd) / Math.sqrt(n);
        const ok = Math.abs(m - mu) <= h;
        if (ok) cover++;
        out.push({ m, lo: m - h, hi: m + h, ok });
      }
      return { out, coverage: cover / reps, mu };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const fmtv = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(3));
  const OPTS = Object.keys(DISTS).map((k) => ({ v: k, t: DISTS[k].name }));

  function lab1() {
    let seed = 42;
    const REPS = 2000;
    const ctl = Lab.controls('#c1', [
      { key: 'dist', label: '总体分布', type: 'seg', full: true, value: 'exp', options: OPTS },
      { key: 'n', label: '每次抽多少个样本 n', min: 1, max: 2000, scale: 'log', value: 10, round: (v) => Math.max(1, Math.round(v)), fmt: F.int, full: true },
    ], Lab.throttle(draw));
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg1', [{ color: 'var(--s1)', label: `${F.int(REPS)} 个样本均值的直方图` }, { color: 'var(--s2)', label: '正态近似 N(μ, σ²/n)', line: true }]);
    function draw() {
      const v = ctl.values, d = DISTS[v.dist];
      const [mu, sd, sk] = d.mom;
      // 总体分布
      const r = Lab.rng(seed + 3);
      const pop = Array.from({ length: 5000 }, () => d.draw(r)).sort((a, b) => a - b);
      const cap = Math.max(pop[Math.floor(0.99 * pop.length)], pop[0] + 1e-9);
      const c0 = Lab.chart('#ch0', { height: 140, margin: { t: 24, r: 12, b: 36, l: 44 }, label: '总体分布' });
      const x0 = d3.scaleLinear(v.dist === 'normal' ? [0, 20] : [0, cap], [0, c0.w]);
      const b0 = d3.bin().domain(x0.domain()).thresholds(30)(pop.filter((p) => p <= x0.domain()[1]));
      const y0 = d3.scaleLinear([0, d3.max(b0, (b) => b.length)], [c0.h, 0]);
      Lab.axes(c0, x0, y0, { yTitle: `总体长什么样（5,000 个点${v.dist === 'normal' ? '' : '，截到 99% 分位'}）`, yTicks: 2, grid: false, y: false });
      b0.forEach((b) => c0.g.append('rect').attr('x', x0(b.x0) + 0.5).attr('width', Math.max(0.5, x0(b.x1) - x0(b.x0) - 1)).attr('y', y0(b.length)).attr('height', c0.h - y0(b.length)).style('fill', 'var(--muted)'));
      // 样本均值
      const ms = C.sampleMeans(v.dist, v.n, REPS, seed);
      const se = sd / Math.sqrt(v.n);
      const sorted = ms.slice().sort((a, b) => a - b);
      const lo = Math.min(sorted[Math.floor(0.002 * REPS)], mu - 4 * se), hi = Math.max(sorted[Math.floor(0.998 * REPS)], mu + 4 * se);
      const c = Lab.chart('#ch1', { height: 220, margin: { t: 26, r: 12, b: 46, l: 44 }, label: '样本均值的分布' });
      const x = d3.scaleLinear([Math.max(lo, v.dist === 'normal' ? -Infinity : 0), hi], [0, c.w]);
      const bins = d3.bin().domain(x.domain()).thresholds(40)(ms.filter((m) => m >= x.domain()[0] && m <= x.domain()[1]));
      const bw = bins[0] ? bins[0].x1 - bins[0].x0 : 1;
      const dens = (b) => b.length / (REPS * bw);
      const curve = Lab.linspace(x.domain()[0], x.domain()[1], 200).map((t) => [t, S.normPdf(t, mu, se)]);
      const y = d3.scaleLinear([0, Math.max(d3.max(bins, dens), d3.max(curve, (p) => p[1])) * 1.08], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: `样本均值${d.unit ? '（' + d.unit + '）' : ''}`, yTitle: '概率密度', yTicks: 4, yFmt: () => '' });
      bins.forEach((b) => c.g.append('rect').attr('x', x(b.x0) + 0.5).attr('width', Math.max(0.5, x(b.x1) - x(b.x0) - 1)).attr('y', y(dens(b))).attr('height', c.h - y(dens(b))).style('fill', 'var(--s1)').style('opacity', 0.75));
      c.g.append('path').attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(curve)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      const need = Math.ceil(Math.pow(sk / 0.2, 2));
      Lab.$('#r1').innerHTML =
        Lab.stat('总体偏度 γ', sk.toFixed(2)) +
        Lab.stat('样本均值的偏度 γ/√n', (sk / Math.sqrt(v.n)).toFixed(3), 'hl') +
        Lab.stat('偏度降到 0.2 以下约需', sk === 0 ? '任意 n' : 'n ≥ ' + F.int(need));
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  function lab2() {
    let seed = 42;
    const SHOW = 100, BIG = 4000;
    const ctl = Lab.controls('#c2', [
      { key: 'dist', label: '总体分布', type: 'seg', full: true, value: 'normal', options: OPTS },
      { key: 'n', label: '每次抽多少个样本 n', min: 5, max: 500, scale: 'log', value: 30, round: (v) => Math.round(v), fmt: F.int, full: true },
    ], Lab.throttle(draw));
    Lab.$('#b2-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b2-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg2', [{ color: 'var(--s1)', label: '盖住了真值', line: true }, { color: 'var(--bad)', label: '没盖住', line: true }, { color: 'var(--s2)', label: '真实均值 μ', dash: true }]);
    function draw() {
      const v = ctl.values;
      const res = C.intervals(v.dist, v.n, SHOW, seed);
      const big = C.intervals(v.dist, v.n, BIG, seed + 11);
      const c = Lab.chart('#ch2', { height: 330, margin: { t: 26, r: 12, b: 46, l: 36 }, label: '100 个 95% 置信区间' });
      const vals = res.out.flatMap((o) => [o.lo, o.hi]).sort((a, b) => a - b);
      const lo = vals[2], hi = vals[vals.length - 3];
      const x = d3.scaleLinear([Math.min(lo, res.mu), Math.max(hi, res.mu)], [0, c.w]).nice();
      const y = d3.scaleLinear([0, SHOW + 1], [0, c.h]);
      Lab.axes(c, x, y, { xTitle: '均值的 95% 置信区间', yTitle: '第几次抽样', grid: false, yTicks: 4 });
      res.out.forEach((o, i) => {
        c.g.append('line').attr('x1', x(Math.max(o.lo, x.domain()[0]))).attr('x2', x(Math.min(o.hi, x.domain()[1]))).attr('y1', y(i + 1)).attr('y2', y(i + 1))
          .style('stroke', o.ok ? 'var(--s1)' : 'var(--bad)').style('stroke-width', o.ok ? 1.6 : 2.6).style('opacity', o.ok ? 0.75 : 1);
      });
      c.g.append('line').attr('x1', x(res.mu)).attr('x2', x(res.mu)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--s2)').style('stroke-width', 2).style('stroke-dasharray', '5 4');
      const hit = res.out.filter((o) => o.ok).length;
      Lab.$('#r2').innerHTML =
        Lab.stat('这 100 个区间里盖住真值的', hit + ' 个') +
        Lab.stat(`重复 ${F.int(BIG)} 次的覆盖率`, F.pct(big.coverage, 1), Math.abs(big.coverage - 0.95) > 0.02 ? 'bad' : 'hl') +
        Lab.stat('名义水平', '95%');
    }
    draw();
    Lab.watch('#ch2', draw);
  }

  Lab.ready(() => {
    lab1();
    lab2();
  });
})(typeof window !== 'undefined' ? window : globalThis);

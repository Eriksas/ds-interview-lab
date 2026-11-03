/* 页面 12：断点回归 RDD 与工具变量 IV */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const C = 100;

  const R = (Lab.sim.rddiv = {
    f: (d) => 60 + 0.3 * d - 0.004 * d * d + 0.0001 * d * d * d,
    rddGen(n, manip, q, r) {
      const x = new Array(n), y = new Array(n);
      for (let i = 0; i < n; i++) {
        let xi = r.normal(100, 25);
        while (xi < 40 || xi > 160) xi = r.normal(100, 25); // 截断正态：超出范围就重抽
        const u = r.normal();
        if (manip && xi >= 90 && xi < 100 && u > 0 && r.uniform() < q) xi = 100 + 5 * r.uniform();
        const d = xi - C;
        x[i] = xi;
        y[i] = R.f(d) + 5 * u + (xi >= C ? 3 : 0) + r.normal(0, 5);
      }
      return { x, y };
    },
    /* 两侧各自三角核加权的局部线性回归；跳跃 = 右截距 − 左截距，标准误用 HC0 三明治公式 */
    localLinear(x, y, h) {
      const side = (right) => {
        let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
        const pts = [];
        for (let i = 0; i < x.length; i++) {
          const d = x[i] - C;
          if ((right ? d < 0 : d >= 0) || Math.abs(d) > h) continue;
          const w = 1 - Math.abs(d) / h;
          s0 += w; s1 += w * d; s2 += w * d * d; t0 += w * y[i]; t1 += w * d * y[i];
          pts.push([d, w, y[i]]);
        }
        const det = s0 * s2 - s1 * s1;
        if (pts.length < 3 || Math.abs(det) < 1e-12) return null;
        const A = [[s2 / det, -s1 / det], [-s1 / det, s0 / det]];
        const b0 = A[0][0] * t0 + A[0][1] * t1, b1 = A[1][0] * t0 + A[1][1] * t1;
        let m00 = 0, m01 = 0, m11 = 0;
        for (const [d, w, yy] of pts) {
          const e = yy - b0 - b1 * d, k = w * w * e * e;
          m00 += k; m01 += k * d; m11 += k * d * d;
        }
        // V = A M A，只要 [0][0]
        const v00 = A[0][0] * (A[0][0] * m00 + A[0][1] * m01) + A[0][1] * (A[0][0] * m01 + A[0][1] * m11);
        return { b0, b1, v00, n: pts.length };
      };
      const L = side(false), Rr = side(true);
      if (!L || !Rr) return null;
      return { est: Rr.b0 - L.b0, se: Math.sqrt(L.v00 + Rr.v00), n: L.n + Rr.n, L, R: Rr };
    },
    ivGen(n, pc, pa, tc, ta, r) {
      const z = [], d = [], y = [], typ = [];
      for (let i = 0; i < n; i++) {
        const u = r.uniform();
        const t = u < pc ? 0 : u < pc + pa ? 1 : 2; // 0 依从者 1 总是接受者 2 从不接受者
        const zi = r.uniform() < 0.5;
        const di = t === 1 ? true : t === 0 ? zi : false;
        const base = [40, 60, 30][t], eff = [tc, ta, tc][t];
        z.push(zi); d.push(di); typ.push(t);
        y.push(base + (di ? eff : 0) + r.normal(0, 15));
      }
      return { z, d, y, typ };
    },
    ivEst(o) {
      const mean = (pred) => { let s = 0, k = 0; o.y.forEach((v, i) => { if (pred(i)) { s += v; k++; } }); return s / k; };
      const rate = (zv) => { let s = 0, k = 0; o.d.forEach((v, i) => { if (o.z[i] === zv) { s += v ? 1 : 0; k++; } }); return s / k; };
      const naive = mean((i) => o.d[i]) - mean((i) => !o.d[i]);
      const itt = mean((i) => o.z[i]) - mean((i) => !o.z[i]);
      const fs = rate(true) - rate(false);
      const wald = itt / fs;
      const r1 = [], r0 = [];
      o.y.forEach((v, i) => (o.z[i] ? r1 : r0).push(v - wald * (o.d[i] ? 1 : 0)));
      const se = Math.sqrt(S.variance(r1) / r1.length + S.variance(r0) / r0.length) / Math.abs(fs);
      return { naive, itt, fs, wald, se };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const sg = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d === undefined ? 2 : d);

  /* ================= RDD ================= */
  function labRdd() {
    let seed = 42;
    const N = 4000;
    const ctl = Lab.controls('#cr', [
      { key: 'h', label: '带宽 h（断点两侧各用多宽的数据）', min: 3, max: 60, step: 1, value: 15, fmt: (v) => v + ' 元' },
      { key: 'q', label: '凑单比例（门槛下方 90–100 元、投入度高的人里）', min: 0, max: 1, step: 0.1, value: 0, fmt: (v) => (v === 0 ? '不凑单' : F.pct(v, 0)) },
    ], Lab.throttle(draw));
    Lab.$('#br-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#br-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lgr', [
      { color: 'var(--s1)', label: '每 2 元一组的平均复购金额' },
      { color: 'var(--s2)', label: '带宽内的局部线性拟合', line: true },
      { color: 'var(--accent-soft)', label: '带宽范围' },
    ]);
    function draw() {
      const v = ctl.values;
      const dat = R.rddGen(N, v.q > 0, v.q, Lab.rng(seed));
      const fit = R.localLinear(dat.x, dat.y, v.h);
      // ① 分组散点 + 拟合
      const c = Lab.chart('#chr1', { height: 240, margin: { t: 26, r: 12, b: 46, l: 40 }, label: '断点两侧的结果' });
      const x = d3.scaleLinear([40, 160], [0, c.w]);
      const bins = new Map();
      dat.x.forEach((xi, i) => { const k = Math.floor(xi / 2) * 2; const b = bins.get(k) || [0, 0]; b[0] += dat.y[i]; b[1]++; bins.set(k, b); });
      const pts = [...bins].filter(([, b]) => b[1] >= 5).map(([k, b]) => [k + 1, b[0] / b[1]]);
      const y = d3.scaleLinear([d3.min(pts, (p) => p[1]) - 3, d3.max(pts, (p) => p[1]) + 3], [c.h, 0]).nice();
      Lab.axes(c, x, y, { xTitle: '下单金额（元），满 100 元可用满减', yTitle: '30 天复购金额（元，模拟）', yTicks: 5 });
      c.g.append('rect').attr('x', x(C - v.h)).attr('width', x(C + v.h) - x(C - v.h)).attr('y', 0).attr('height', c.h).style('fill', 'var(--accent-soft)').style('opacity', 0.7);
      pts.forEach((p) => c.g.append('circle').attr('cx', x(p[0])).attr('cy', y(p[1])).attr('r', 3).style('fill', 'var(--s1)').style('opacity', 0.8));
      c.g.append('line').attr('x1', x(C)).attr('x2', x(C)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
      if (fit) {
        [[fit.L, -v.h, 0], [fit.R, 0, v.h]].forEach(([s, a, b]) => {
          c.g.append('line').attr('x1', x(C + a)).attr('x2', x(C + b)).attr('y1', y(s.b0 + s.b1 * a)).attr('y2', y(s.b0 + s.b1 * b)).style('stroke', 'var(--s2)').style('stroke-width', 3);
        });
        c.g.append('line').attr('x1', x(C)).attr('x2', x(C)).attr('y1', y(fit.L.b0)).attr('y2', y(fit.R.b0)).style('stroke', 'var(--s2)').style('stroke-width', 5).style('opacity', 0.6);
      }
      // ② 订单金额的分布
      const c2 = Lab.chart('#chr2', { height: 150, margin: { t: 24, r: 12, b: 40, l: 40 }, label: '订单金额的分布' });
      const hb = d3.bin().domain([40, 160]).thresholds(d3.range(40, 160.1, 2.5))(dat.x);
      const y2 = d3.scaleLinear([0, d3.max(hb, (b) => b.length) * 1.1], [c2.h, 0]);
      Lab.axes(c2, x, y2, { xTitle: '下单金额（元）', yTitle: '订单数（每 2.5 元一格）', yTicks: 3 });
      hb.forEach((b) => c2.g.append('rect').attr('x', x(b.x0) + 0.5).attr('width', Math.max(0.5, x(b.x1) - x(b.x0) - 1)).attr('y', y2(b.length)).attr('height', c2.h - y2(b.length))
        .style('fill', b.x0 >= 100 && b.x0 < 105 ? 'var(--s2)' : b.x0 >= 95 && b.x0 < 100 ? 'var(--s1)' : 'var(--muted)'));
      c2.g.append('line').attr('x1', x(C)).attr('x2', x(C)).attr('y1', 0).attr('y2', c2.h).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
      const below = dat.x.filter((t) => t >= 95 && t < 100).length, above = dat.x.filter((t) => t >= 100 && t < 105).length;
      // ③ 估计随带宽变化
      const hs = d3.range(3, 61, 3);
      const ests = hs.map((h) => [h, R.localLinear(dat.x, dat.y, h)]).filter((p) => p[1]);
      const c3 = Lab.chart('#chr3', { height: 200, margin: { t: 26, r: 12, b: 46, l: 40 }, label: '估计值随带宽变化' });
      const x3 = d3.scaleLinear([0, 61], [0, c3.w]);
      const lo = d3.min(ests, (p) => p[1].est - 1.96 * p[1].se), hi = d3.max(ests, (p) => p[1].est + 1.96 * p[1].se);
      const y3 = d3.scaleLinear([Math.min(lo, 0), Math.max(hi, 4)], [c3.h, 0]).nice();
      Lab.axes(c3, x3, y3, { xTitle: '带宽 h（元）', yTitle: '跳跃估计及 95% 区间', yTicks: 5 });
      c3.g.append('line').attr('x1', 0).attr('x2', c3.w).attr('y1', y3(3)).attr('y2', y3(3)).style('stroke', 'var(--good)').style('stroke-dasharray', '5 4').style('stroke-width', 2);
      c3.g.append('text').attr('class', 'lbl-2 halo').attr('x', c3.w - 2).attr('y', y3(3) - 5).attr('text-anchor', 'end').text('真实跳跃 3');
      ests.forEach(([h, e]) => {
        const on = Math.abs(h - v.h) < 1.5;
        c3.g.append('line').attr('x1', x3(h)).attr('x2', x3(h)).attr('y1', y3(e.est - 1.96 * e.se)).attr('y2', y3(e.est + 1.96 * e.se)).style('stroke', on ? 'var(--s2)' : 'var(--s1)').style('stroke-width', 2);
        c3.g.append('circle').attr('cx', x3(h)).attr('cy', y3(e.est)).attr('r', on ? 5 : 3.5).style('fill', on ? 'var(--s2)' : 'var(--s1)');
      });
      Lab.$('#rr').innerHTML = !fit ? '<div class="callout warn">带宽内样本太少。</div>' :
        Lab.stat('跳跃估计', fit.est.toFixed(2), Math.abs(fit.est - 3) > 1.96 * fit.se ? 'bad' : 'hl') +
        Lab.stat('95% 区间', `[${(fit.est - 1.96 * fit.se).toFixed(2)}, ${(fit.est + 1.96 * fit.se).toFixed(2)}]`) +
        Lab.stat('真实跳跃', '3.00') +
        Lab.stat('门槛两侧各 5 元的订单数', `${below} | ${above}`, above > 1.5 * below ? 'bad' : '');
    }
    draw();
    Lab.watch('#chr1', draw);
  }

  /* ================= IV ================= */
  function labIv() {
    let seed = 42;
    const N = 10000;
    const ctl = Lab.controls('#ci', [
      { key: 'pc', label: '依从者占比（收到推送才用）', min: 0.02, max: 0.8, step: 0.01, value: 0.3, fmt: (v) => F.pct(v, 0) },
      { key: 'pa', label: '总是接受者占比（不推送也用）', min: 0, max: 0.5, step: 0.05, value: 0.2, fmt: (v) => F.pct(v, 0) },
      { key: 'tc', label: '依从者用了以后多看（分钟）', min: 0, max: 20, step: 1, value: 10, fmt: (v) => v + ' 分钟' },
      { key: 'ta', label: '总是接受者用了以后多看（分钟）', min: 0, max: 30, step: 1, value: 15, fmt: (v) => v + ' 分钟' },
    ], (vals, key) => {
      if (vals.pc + vals.pa > 0.98) ctl.set(key === 'pa' ? { pc: Math.round((0.98 - vals.pa) * 100) / 100 } : { pa: Math.floor((0.98 - vals.pc) * 20) / 20 }, true);
      thr();
    });
    const thr = Lab.throttle(draw);
    Lab.$('#bi-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#bi-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    const TYPES = [
      { k: '总是接受者', col: 'var(--s4)' },
      { k: '依从者', col: 'var(--s2)' },
      { k: '从不接受者', col: 'var(--muted)' },
    ];
    Lab.legend('#lgi', TYPES.map((t) => ({ color: t.col, label: t.k })).concat([{ color: 'var(--text-2)', label: '实心 = 用了新功能，浅色 = 没用' }]));
    function draw() {
      const v = ctl.values;
      const pn = Math.max(0, 1 - v.pc - v.pa);
      const o = R.ivGen(N, v.pc, v.pa, v.tc, v.ta, Lab.rng(seed));
      const e = R.ivEst(o);
      // ① 两组的人群构成
      const c = Lab.chart('#chi1', { height: 130, margin: { t: 8, r: 10, b: 36, l: 72 }, label: '两组的人群构成' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const arms = [{ k: '没收到推送', z: 0 }, { k: '收到推送', z: 1 }];
      const y = d3.scaleBand(arms.map((a) => a.k), [0, c.h]).padding(0.25);
      Lab.axes(c, x, y, { xTitle: '人数占比', grid: false, y: false, xTicks: 5, xFmt: d3.format('.0%') });
      arms.forEach((a) => {
        let acc = 0;
        c.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', y(a.k) + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(a.k);
        [[0, v.pa, true], [1, v.pc, a.z === 1], [2, pn, false]].forEach(([ti, share, used]) => {
          if (share <= 0) return;
          c.g.append('rect').attr('x', x(acc) + 1).attr('width', Math.max(0, x(share) - x(0) - 2)).attr('y', y(a.k)).attr('height', y.bandwidth()).attr('rx', 3)
            .style('fill', TYPES[ti].col).style('opacity', used ? 1 : 0.3);
          if (x(share) - x(0) > 36) c.g.append('text').attr('class', 'lbl').attr('x', x(acc + share / 2)).attr('y', y(a.k) + y.bandwidth() / 2 + 4).attr('text-anchor', 'middle')
            .style('fill', used ? '#fff' : 'var(--text)').text(used ? '用' : '不用');
          acc += share;
        });
      });
      // ② 几种估计
      const lateTrue = v.tc, ate = v.pc * v.tc + v.pa * v.ta + pn * v.tc;
      const rows = [
        { k: '朴素：用了 vs 没用', m: e.naive, col: 'var(--bad)' },
        { k: 'ITT：推送 vs 没推送', m: e.itt, col: 'var(--s1)' },
        { k: 'Wald = ITT ÷ 第一阶段', m: e.wald, se: e.se, col: 'var(--s2)' },
        { k: '真实：依从者效应 LATE', m: lateTrue, col: 'var(--good)' },
        { k: '真实：全体平均 ATE', m: ate, col: 'var(--text-2)' },
      ];
      const c2 = Lab.chart('#chi2', { height: 210, margin: { t: 10, r: 46, b: 44, l: 150 }, label: '几种估计对比' });
      const vals = rows.flatMap((r2) => (r2.se ? [r2.m - 1.96 * r2.se, r2.m + 1.96 * r2.se] : [r2.m]));
      const x2 = d3.scaleLinear([Math.min(0, d3.min(vals)), Math.max(1, d3.max(vals)) * 1.05], [0, c2.w]).nice();
      const y2 = d3.scaleBand(rows.map((r2) => r2.k), [0, c2.h]).padding(0.35);
      Lab.axes(c2, x2, y2, { xTitle: '多看的分钟数', grid: false, y: false, xTicks: 4 });
      c2.g.append('line').attr('x1', x2(0)).attr('x2', x2(0)).attr('y1', 0).attr('y2', c2.h).style('stroke', 'var(--axis)');
      rows.forEach((r2) => {
        const cy = y2(r2.k) + y2.bandwidth() / 2;
        c2.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', cy + 4).attr('text-anchor', 'end').text(r2.k);
        if (r2.se) c2.g.append('line').attr('x1', x2(Math.max(x2.domain()[0], r2.m - 1.96 * r2.se))).attr('x2', x2(Math.min(x2.domain()[1], r2.m + 1.96 * r2.se))).attr('y1', cy).attr('y2', cy).style('stroke', r2.col).style('stroke-width', 3);
        c2.g.append('circle').attr('cx', x2(r2.m)).attr('cy', cy).attr('r', 6).style('fill', r2.col);
        c2.g.append('text').attr('class', 'lbl').attr('x', c2.w + 6).attr('y', cy + 4).text(r2.m.toFixed(1));
      });
      Lab.$('#ri').innerHTML =
        Lab.stat('第一阶段：使用率差', F.pct(e.fs, 1)) +
        Lab.stat('ITT', e.itt.toFixed(2) + '<small> 分钟</small>') +
        Lab.stat('Wald 估计（LATE）', `${e.wald.toFixed(1)}<small> ± ${(1.96 * e.se).toFixed(1)}</small>`, 'hl') +
        Lab.stat('朴素比较', e.naive.toFixed(1) + '<small> 分钟</small>', 'bad');
    }
    draw();
    Lab.watch('#chi1', draw);
  }

  Lab.ready(() => {
    labRdd();
    labIv();
  });
})(typeof window !== 'undefined' ? window : globalThis);

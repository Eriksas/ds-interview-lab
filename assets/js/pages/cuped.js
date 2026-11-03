/* 页面 4：CUPED 方差缩减 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const MU = 60, SD = 20;

  const C = (Lab.sim.cuped = {
    /* 对照组 / 实验组各 n 人；X 实验前，Y 实验期，Corr(X,Y)=rho，实验组 Y 多 tau */
    gen(n, rho, tau, r) {
      const k = Math.sqrt(1 - rho * rho) * SD;
      const g = (t) => {
        const x = new Array(n), y = new Array(n);
        for (let i = 0; i < n; i++) {
          x[i] = r.normal(MU, SD);
          y[i] = MU + rho * (x[i] - MU) + k * r.normal() + (t ? tau : 0);
        }
        return { x, y };
      };
      return { c: g(0), t: g(1) };
    },
    analyze(d) {
      const n = d.c.x.length;
      const xa = d.c.x.concat(d.t.x), ya = d.c.y.concat(d.t.y);
      const theta = S.cov(xa, ya) / S.variance(xa);
      const xbar = S.mean(xa);
      const cv = (g) => g.y.map((y, i) => y - theta * (g.x[i] - xbar));
      const cc = cv(d.c), ct = cv(d.t);
      const vc = S.variance(d.c.y), vt = S.variance(d.t.y), vcc = S.variance(cc), vct = S.variance(ct);
      return {
        theta,
        ateRaw: S.mean(d.t.y) - S.mean(d.c.y),
        seRaw: Math.sqrt(vt / n + vc / n),
        ateCv: S.mean(ct) - S.mean(cc),
        seCv: Math.sqrt(vct / n + vcc / n),
        varRatio: (vcc + vct) / (vc + vt),
      };
    },
    repeat(n, rho, tau, reps, seed) {
      const r = Lab.rng(seed);
      const raw = [], cv = [];
      let rejRaw = 0, rejCv = 0;
      for (let i = 0; i < reps; i++) {
        const a = C.analyze(C.gen(n, rho, tau, r));
        raw.push(a.ateRaw);
        cv.push(a.ateCv);
        if (Math.abs(a.ateRaw / a.seRaw) > 1.959964) rejRaw++;
        if (Math.abs(a.ateCv / a.seCv) > 1.959964) rejCv++;
      }
      return { raw, cv, powRaw: rejRaw / reps, powCv: rejCv / reps };
    },
    nNeeded(delta, shrink) {
      return Math.ceil(((1.959964 + 0.841621) ** 2 * 2 * SD * SD * shrink) / (delta * delta));
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const COL_RAW = 'var(--text-2)', COL_CV = 'var(--s3)';

  function init() {
    let seed = 42;
    const REPS = 300;
    const ctl = Lab.controls('#c1', [
      { key: 'rho', label: '实验前后指标的相关系数 ρ', min: 0, max: 0.95, step: 0.05, value: 0.7, fmt: (v) => v.toFixed(2) },
      { key: 'n', label: '每组样本量', min: 100, max: 2000, step: 50, value: 500, fmt: F.int },
      { key: 'tau', label: '真实效应 τ（分钟）', min: 0, max: 5, step: 0.25, value: 2, fmt: (v) => v.toFixed(2) },
    ], Lab.throttle(draw));
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg1', [
      { color: 'var(--s1)', label: '对照组' },
      { color: 'var(--s2)', label: '实验组' },
      { color: 'var(--text-2)', label: '回归线（斜率 θ）', dash: true },
    ]);
    Lab.legend('#lg3', [
      { color: COL_RAW, label: '不调整' },
      { color: COL_CV, label: 'CUPED' },
      { color: 'var(--s2)', label: '真实效应', dash: true },
    ]);

    function draw() {
      const v = ctl.values;
      const r = Lab.rng(seed);
      const d = C.gen(v.n, v.rho, v.tau, r);
      const a = C.analyze(d);
      scatter(d, a);
      ciChart(a, v.tau);
      const rep = C.repeat(v.n, v.rho, v.tau, REPS, seed + 1);
      histChart(rep, v.tau);
      shrinkChart(v.rho);
      const nRaw = C.nNeeded(Math.max(v.tau, 0.25), 1), nCv = C.nNeeded(Math.max(v.tau, 0.25), 1 - v.rho * v.rho);
      Lab.$('#r1').innerHTML =
        Lab.stat('斜率 θ（估计）', a.theta.toFixed(3)) +
        Lab.stat('方差比：这次样本 / 理论 1−ρ²', `${a.varRatio.toFixed(3)} / ${(1 - v.rho * v.rho).toFixed(3)}`) +
        Lab.stat('标准误：不调整 → CUPED', `${a.seRaw.toFixed(2)} → ${a.seCv.toFixed(2)}`, 'hl') +
        Lab.stat(`80% 功效所需每组（τ=${Math.max(v.tau, 0.25).toFixed(2)}）`, `${F.int(nRaw)} → ${F.int(nCv)}`, 'hl');
      Lab.$('#cap3').textContent = `重复 ${REPS} 次实验（每组 ${F.int(v.n)} 人）。显著比例：不调整 ${F.pct(rep.powRaw, 1)}，CUPED ${F.pct(rep.powCv, 1)}` +
        (v.tau === 0 ? '（τ=0，所以这是假阳性率，两者都应约 5%）。' : '。');
    }

    function scatter(d, a) {
      const c = Lab.chart('#ch1', { height: (w) => Math.min(300, Math.max(230, w * 0.7)), margin: { t: 26, r: 14, b: 46, l: 44 }, label: '实验前与实验期指标的散点图' });
      const x = d3.scaleLinear([0, 120], [0, c.w]);
      const y = d3.scaleLinear([0, 125], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '实验前人均观看时长 X（分钟）', yTitle: '实验期人均观看时长 Y（分钟）', yTicks: 5 });
      const show = Math.min(250, d.c.x.length);
      [['c', 'var(--s1)'], ['t', 'var(--s2)']].forEach(([k, col]) => {
        const g = d[k];
        for (let i = 0; i < show; i++) {
          if (g.x[i] < 0 || g.x[i] > 120 || g.y[i] < 0 || g.y[i] > 125) continue;
          c.g.append('circle').attr('cx', x(g.x[i])).attr('cy', y(g.y[i])).attr('r', 2.6).style('fill', col).style('opacity', 0.55);
        }
      });
      const xa = d.c.x.concat(d.t.x), ya = d.c.y.concat(d.t.y);
      const mx = S.mean(xa), my = S.mean(ya);
      const ln = (xx) => my + a.theta * (xx - mx);
      c.g.append('line').attr('x1', x(0)).attr('x2', x(120)).attr('y1', y(ln(0))).attr('y2', y(ln(120)))
        .style('stroke', 'var(--text)').style('stroke-width', 2).style('stroke-dasharray', '6 4');
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(118)).attr('y', y(ln(118)) - 8).attr('text-anchor', 'end').text(`斜率 θ=${a.theta.toFixed(2)}`);
    }

    function ciChart(a, tau) {
      const c = Lab.chart('#ch2', { height: 150, margin: { t: 20, r: 18, b: 46, l: 70 }, label: '两种估计的 95% 置信区间' });
      const rows = [{ k: '不调整', m: a.ateRaw, se: a.seRaw, col: COL_RAW }, { k: 'CUPED', m: a.ateCv, se: a.seCv, col: COL_CV }];
      const lo = Math.min(-1, ...rows.map((r) => r.m - 2.2 * r.se)), hi = Math.max(tau + 1, ...rows.map((r) => r.m + 2.2 * r.se));
      const x = d3.scaleLinear([lo, hi], [0, c.w]).nice();
      const y = d3.scaleBand(rows.map((r) => r.k), [0, c.h]).padding(0.4);
      Lab.axes(c, x, y, { xTitle: '实验组 − 对照组（分钟），线段为 95% 置信区间', grid: false, y: false });
      c.g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--axis)');
      c.g.append('line').attr('x1', x(tau)).attr('x2', x(tau)).attr('y1', -6).attr('y2', c.h).style('stroke', 'var(--s2)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      c.g.append('text').attr('class', 'lbl-2 halo').attr('x', x(tau) + 4).attr('y', -8).text(`真实 τ=${tau}`);
      rows.forEach((r) => {
        const cy = y(r.k) + y.bandwidth() / 2;
        c.g.append('text').attr('class', 'lbl').attr('x', -10).attr('y', cy + 4).attr('text-anchor', 'end').text(r.k);
        c.g.append('line').attr('x1', x(r.m - 1.96 * r.se)).attr('x2', x(r.m + 1.96 * r.se)).attr('y1', cy).attr('y2', cy).style('stroke', r.col).style('stroke-width', 4).style('stroke-linecap', 'round');
        c.g.append('circle').attr('cx', x(r.m)).attr('cy', cy).attr('r', 6).style('fill', r.col).style('stroke', 'var(--surface)').style('stroke-width', 2);
      });
    }

    function histChart(rep, tau) {
      const c = Lab.chart('#ch3', { height: 210, margin: { t: 24, r: 14, b: 46, l: 44 }, label: '重复实验的估计值分布' });
      const all = rep.raw.concat(rep.cv);
      const lo = Math.floor(d3.min(all)), hi = Math.ceil(d3.max(all));
      const x = d3.scaleLinear([lo, hi], [0, c.w]);
      const bins = d3.bin().domain([lo, hi]).thresholds(x.ticks(30));
      const br = bins(rep.raw), bc = bins(rep.cv);
      const y = d3.scaleLinear([0, d3.max(br.concat(bc), (b) => b.length) * 1.1], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '每次实验估计出的效应（分钟）', yTitle: '实验次数', yTicks: 4 });
      const area = (bs) => d3.area().curve(d3.curveStepAfter).x((b) => x(b.x0)).y0(c.h).y1((b) => y(b.length))(bs.concat([{ x0: bs[bs.length - 1].x1, length: 0 }]));
      c.g.append('path').attr('d', area(br)).style('fill', COL_RAW).style('opacity', 0.25);
      c.g.append('path').attr('d', area(br)).style('fill', 'none').style('stroke', COL_RAW).style('stroke-width', 1.5);
      c.g.append('path').attr('d', area(bc)).style('fill', COL_CV).style('opacity', 0.35);
      c.g.append('path').attr('d', area(bc)).style('fill', 'none').style('stroke', COL_CV).style('stroke-width', 2);
      c.g.append('line').attr('x1', x(tau)).attr('x2', x(tau)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--s2)').style('stroke-dasharray', '5 4').style('stroke-width', 2);
      const sdR = Math.sqrt(S.variance(rep.raw)), sdC = Math.sqrt(S.variance(rep.cv));
      Lab.$('#r3').innerHTML =
        Lab.stat('估计值的平均：不调整', S.mean(rep.raw).toFixed(2)) + Lab.stat('估计值的平均：CUPED', S.mean(rep.cv).toFixed(2)) +
        Lab.stat('标准差之比 CUPED / 不调整', (sdC / sdR).toFixed(3), 'hl');
    }

    function shrinkChart(rho) {
      const c = Lab.chart('#ch4', { height: 180, margin: { t: 24, r: 16, b: 46, l: 44 }, label: '剩余方差比例随相关系数变化' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const y = d3.scaleLinear([0, 1], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '相关系数 ρ', yTitle: '剩余方差 = 所需样本量的比例 1−ρ²', yTicks: 4, yFmt: d3.format('.0%') });
      const pts = d3.range(0, 101).map((i) => [i / 100, 1 - (i / 100) ** 2]);
      c.g.append('path').attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts)).style('fill', 'none').style('stroke', COL_CV).style('stroke-width', 2);
      c.g.append('circle').attr('cx', x(rho)).attr('cy', y(1 - rho * rho)).attr('r', 6).style('fill', COL_CV).style('stroke', 'var(--surface)').style('stroke-width', 2);
      const left = rho > 0.55;
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(rho) + (left ? -10 : 10)).attr('y', y(1 - rho * rho) + 4)
        .attr('text-anchor', left ? 'end' : 'start').text(`ρ=${rho.toFixed(2)}：剩 ${F.pct(1 - rho * rho, 0)}`);
    }

    draw();
    Lab.watch('#ch1', draw);
  }

  Lab.ready(init);
})(typeof window !== 'undefined' ? window : globalThis);

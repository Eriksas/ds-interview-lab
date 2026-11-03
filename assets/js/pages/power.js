/* 页面 1：假设检验与功效 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  /* ---------- 纯计算（Node 也能跑，verify/js_sims.js 会调用） ---------- */
  const P = (Lab.sim.power = {
    seDiff(p0, d, n) {
      const p1 = p0 + d;
      return Math.sqrt((p0 * (1 - p0)) / n + (p1 * (1 - p1)) / n);
    },
    power(p0, d, n, alpha, sided) {
      const se = P.seDiff(p0, d, n);
      const lam = d / se;
      const zc = sided === 1 ? S.normPpf(1 - alpha) : S.normPpf(1 - alpha / 2);
      const pw = sided === 1 ? S.normCdf(lam - zc) : S.normCdf(lam - zc) + S.normCdf(-lam - zc);
      return { se, lam, zc, power: pw, beta: 1 - pw };
    },
    nPerGroup(p0, d, alpha, power, sided) {
      const p1 = p0 + d;
      const za = sided === 1 ? S.normPpf(1 - alpha) : S.normPpf(1 - alpha / 2);
      const zb = S.normPpf(power);
      return ((za + zb) ** 2 * (p0 * (1 - p0) + p1 * (1 - p1))) / (d * d);
    },
    /* nExp 个实验，比例 pi 真的有效（统计量中心 lam）；返回每个实验是否有效和双侧 p 值 */
    pvalueMix(pi, lam, nExp, seed) {
      const r = Lab.rng(seed);
      const eff = new Array(nExp), p = new Array(nExp);
      for (let i = 0; i < nExp; i++) {
        eff[i] = r.uniform() < pi;
        const z = r.normal() + (eff[i] ? lam : 0);
        p[i] = 2 * (1 - S.normCdf(Math.abs(z)));
      }
      return { eff, p };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const roundN = (v) => (v < 10000 ? Math.round(v / 100) * 100 : Math.round(v / 1000) * 1000);

  function hatch(svg, id) {
    const pat = svg.append('defs').append('pattern').attr('id', id).attr('width', 6).attr('height', 6)
      .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).style('stroke', 'var(--s2)').style('stroke-width', 2);
  }

  /* ================= 实验 1：H0 / H1 两个分布 ================= */
  function lab1() {
    const ctl = Lab.controls('#c1', [
      { key: 'p0', label: '基线转化率 p₀', min: 0.01, max: 0.7, step: 0.005, value: 0.1, fmt: (v) => F.pct(v, 1) },
      { key: 'd', label: '真实提升 Δ（绝对值）', min: 0.001, max: 0.04, step: 0.0005, value: 0.006, fmt: (v) => F.pp(v, 2) },
      { key: 'n', label: '每组样本量 n', min: 500, max: 500000, scale: 'log', value: 40000, round: roundN, fmt: F.int },
      { key: 'alpha', label: '显著性水平 α', min: 0.005, max: 0.2, step: 0.005, value: 0.05, fmt: (v) => v.toFixed(3) },
      { key: 'sided', label: '检验方向', type: 'seg', options: [{ v: 2, t: '双侧' }, { v: 1, t: '单侧（只关心提升）' }], value: 2, full: true },
    ], draw);
    Lab.$('#b1-reset').addEventListener('click', () => ctl.reset());
    Lab.$('#b1-x5').addEventListener('click', () => ctl.set({ p0: 0.6033, d: 0.0332, n: 100000, alpha: 0.05, sided: 2 }));
    Lab.legend('#lg1', [
      { color: 'var(--s1)', label: 'H₀ 分布（没效果）', line: true },
      { color: 'var(--s2)', label: 'H₁ 分布（真有提升）', line: true },
      { color: 'var(--s1-a)', label: 'α：没效果却判显著' },
      { color: 'var(--s2-a)', label: '功效 1−β：测出来了' },
      { color: 'repeating-linear-gradient(45deg,var(--s2) 0 2px,transparent 2px 5px)', label: 'β：有效却没测出' },
    ]);

    function draw() {
      const v = ctl.values;
      const r = P.power(v.p0, v.d, v.n, v.alpha, v.sided);
      const c = Lab.chart('#ch1', { height: (w) => (w < 520 ? 240 : 280), margin: { t: 30, r: 12, b: 46, l: 44 }, label: 'H0 与 H1 下检验统计量的分布' });
      hatch(c.svg, 'hatch1');
      const xmax = Math.max(5.5, r.lam + 4);
      const x = d3.scaleLinear([-4, xmax], [0, c.w]);
      const y = d3.scaleLinear([0, 0.47], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '检验统计量 Z（单位：标准误）', yTitle: '概率密度', yTicks: 4 });
      const h0 = (z) => S.normPdf(z), h1 = (z) => S.normPdf(z, r.lam, 1);
      const seg = (f, a, b) => (b <= a ? [] : Lab.linspace(Math.max(a, -4), Math.min(b, xmax), 160).map((z) => [z, f(z)]));
      const area = d3.area().x((d) => x(d[0])).y0(c.h).y1((d) => y(d[1]));
      const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
      const zc = r.zc;
      const betaPart = v.sided === 1 ? seg(h1, -4, zc) : seg(h1, -zc, zc);
      c.g.append('path').attr('d', area(betaPart)).style('fill', 'url(#hatch1)').style('opacity', 0.55);
      [seg(h1, zc, xmax), v.sided === 2 ? seg(h1, -4, -zc) : []].forEach((s) => s.length && c.g.append('path').attr('d', area(s)).style('fill', 'var(--s2-a)'));
      [seg(h0, zc, xmax), v.sided === 2 ? seg(h0, -4, -zc) : []].forEach((s) => s.length && c.g.append('path').attr('d', area(s)).style('fill', 'var(--s1)').style('opacity', 0.45));
      const xs = Lab.linspace(-4, xmax, 400);
      c.g.append('path').attr('d', line(xs.map((z) => [z, h0(z)]))).style('fill', 'none').style('stroke', 'var(--s1)').style('stroke-width', 2);
      c.g.append('path').attr('d', line(xs.map((z) => [z, h1(z)]))).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      const crit = v.sided === 2 ? [-zc, zc] : [zc];
      crit.forEach((z) => {
        c.g.append('line').attr('x1', x(z)).attr('x2', x(z)).attr('y1', -6).attr('y2', c.h)
          .style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3').style('stroke-width', 1.5);
      });
      const cRight = x(zc) > c.w * 0.62;
      c.g.append('text').attr('class', 'lbl-2 halo').attr('x', x(zc) + (cRight ? -4 : 4)).attr('y', -10)
        .attr('text-anchor', cRight ? 'end' : 'start').text(`临界值 ${zc.toFixed(2)}`);
      const close = r.lam < 2.2;
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(0) + (close ? -4 : 0)).attr('y', y(0.4) - 6)
        .attr('text-anchor', close ? 'end' : 'middle').style('fill', 'var(--s1)').text('H₀');
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(r.lam) + (close ? 4 : 0)).attr('y', y(0.4) - 6)
        .attr('text-anchor', close ? 'start' : 'middle').style('fill', 'var(--s2)').text("H₁");

      Lab.$('#r1').innerHTML =
        Lab.stat('两组差的标准误 SE', F.pp(r.se, 3).replace(' 个百分点', '<small> 个百分点</small>')) +
        Lab.stat('H₁ 中心 λ = Δ/SE', r.lam.toFixed(2)) +
        Lab.stat('临界值', zc.toFixed(3)) +
        Lab.stat('β（漏判概率）', F.pct(r.beta, 1)) +
        Lab.stat('功效 1−β', F.pct(r.power, 1), 'hl');
      drawCurve(v, r);
    }

    function drawCurve(v, r) {
      const c = Lab.chart('#ch1b', { height: 190, margin: { t: 26, r: 14, b: 46, l: 44 }, label: '功效随样本量变化' });
      const x = d3.scaleLog([500, 500000], [0, c.w]);
      const y = d3.scaleLinear([0, 1], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '每组样本量 n（对数刻度）', yTitle: '功效', yTicks: 4, yFmt: d3.format('.0%'),
        xValues: [1000, 10000, 100000], xFmt: (d) => F.int(d) });
      const ns = d3.range(0, 201).map((i) => 500 * Math.pow(1000, i / 200));
      const pts = ns.map((n) => [n, P.power(v.p0, v.d, n, v.alpha, v.sided).power]);
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(0.8)).attr('y2', y(0.8))
        .style('stroke', 'var(--muted)').style('stroke-dasharray', '4 3');
      c.g.append('text').attr('class', 'lbl-2 halo').attr('x', 2).attr('y', y(0.8) - 4).text('80%');
      c.g.append('path').attr('d', d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(pts))
        .style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      c.g.append('circle').attr('cx', x(v.n)).attr('cy', y(r.power)).attr('r', 5.5)
        .style('fill', 'var(--s2)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      const right = x(v.n) > c.w * 0.5;
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(v.n) + (right ? -10 : 10)).attr('y', y(r.power) + (r.power > 0.6 ? 18 : -10))
        .attr('text-anchor', right ? 'end' : 'start').text(`n=${F.int(v.n)}，功效 ${F.pct(r.power, 1)}`);
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 实验 2：p 值 ================= */
  function lab2() {
    const ctlA = Lab.controls('#c2a', [
      { key: 'z', label: '这次实验算出的 z 值', min: 0, max: 4, step: 0.01, value: 2.0, fmt: (v) => v.toFixed(2), full: true },
    ], drawA);
    function drawA() {
      const zo = ctlA.values.z;
      const p = 2 * (1 - S.normCdf(zo));
      const c = Lab.chart('#ch2a', { height: 200, margin: { t: 26, r: 12, b: 46, l: 44 }, label: 'p 值是 H0 分布两侧尾巴的面积' });
      const x = d3.scaleLinear([-4.2, 4.2], [0, c.w]);
      const y = d3.scaleLinear([0, 0.45], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '检验统计量 Z（假设 H₀ 为真）', yTitle: '概率密度', yTicks: 4 });
      const area = d3.area().x((d) => x(d[0])).y0(c.h).y1((d) => y(d[1]));
      const tail = (a, b) => Lab.linspace(a, b, 120).map((z) => [z, S.normPdf(z)]);
      if (zo < 4.2) {
        c.g.append('path').attr('d', area(tail(zo, 4.2))).style('fill', 'var(--s1)').style('opacity', 0.5);
        c.g.append('path').attr('d', area(tail(-4.2, -zo))).style('fill', 'var(--s1)').style('opacity', 0.5);
      }
      c.g.append('path').attr('d', d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(tail(-4.2, 4.2)))
        .style('fill', 'none').style('stroke', 'var(--s1)').style('stroke-width', 2);
      [zo, -zo].forEach((z, i) => {
        c.g.append('line').attr('x1', x(z)).attr('x2', x(z)).attr('y1', y(0.42)).attr('y2', c.h)
          .style('stroke', i ? 'var(--muted)' : 'var(--text)').style('stroke-width', i ? 1 : 2).style('stroke-dasharray', i ? '3 3' : null);
      });
      const oRight = x(zo) > c.w * 0.62;
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(zo) + (oRight ? -5 : 5)).attr('y', y(0.42) + 4)
        .attr('text-anchor', oRight ? 'end' : 'start').text(`观测值 ${zo.toFixed(2)}`);
      Lab.$('#r2a').innerHTML =
        Lab.stat('双侧 p 值（两块蓝色面积之和）', F.p(p), 'hl') +
        Lab.stat('相当于没效果时，每多少次实验出现一次', p > 0 ? '约 ' + F.num(1 / p, 0) + ' 次' : '—');
    }
    drawA();
    Lab.watch('#ch2a', drawA);

    let seed = 42;
    const N_EXP = 2000, LAM = 2.8;
    const ctlB = Lab.controls('#c2b', [
      { key: 'pi', label: '真正有效的想法占比 π', min: 0, max: 1, step: 0.05, value: 0.2, fmt: (v) => F.pct(v, 0), full: true },
    ], drawB);
    Lab.$('#b2-again').addEventListener('click', () => { seed = Lab.newSeed(); drawB(); });
    Lab.$('#b2-reset').addEventListener('click', () => { seed = 42; ctlB.reset(); });
    Lab.legend('#lg2', [
      { color: 'var(--s1)', label: '其实无效的实验' },
      { color: 'var(--s2)', label: '真正有效的实验' },
      { color: 'var(--text-2)', label: '全都无效时每格的期望个数', dash: true },
    ]);
    function drawB() {
      const pi = ctlB.values.pi;
      const sim = P.pvalueMix(pi, LAM, N_EXP, seed);
      const bins = 20;
      const cnt = d3.range(bins).map(() => [0, 0]);
      sim.p.forEach((p, i) => { cnt[Math.min(bins - 1, Math.floor(p * bins))][sim.eff[i] ? 1 : 0]++; });
      const c = Lab.chart('#ch2b', { height: 230, margin: { t: 26, r: 12, b: 46, l: 44 }, label: 'p 值直方图' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const ymax = Math.max(60, d3.max(cnt, (d) => d[0] + d[1]) * 1.08);
      const y = d3.scaleLinear([0, ymax], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: 'p 值（每格宽 0.05）', yTitle: '实验个数', yTicks: 4, xValues: [0, 0.25, 0.5, 0.75, 1], xFmt: d3.format('~g') });
      const bw = c.w / bins;
      const tip = Lab.tip(Lab.$('#ch2b'));
      cnt.forEach((d, i) => {
        const x0 = x(i / bins) + 1, wid = Math.max(1, bw - 2);
        const g = c.g.append('g');
        g.append('rect').attr('x', x0).attr('width', wid).attr('y', y(d[0])).attr('height', c.h - y(d[0])).style('fill', 'var(--s1)');
        g.append('rect').attr('x', x0).attr('width', wid).attr('y', y(d[0] + d[1])).attr('height', Math.max(0, y(d[0]) - y(d[0] + d[1]) - (d[1] && d[0] ? 2 : 0)))
          .attr('rx', 2).style('fill', 'var(--s2)');
        g.append('rect').attr('x', x(i / bins)).attr('width', bw).attr('y', 0).attr('height', c.h).style('fill', 'transparent')
          .on('pointerenter pointermove', (ev) => {
            const [mx, my] = d3.pointer(ev, Lab.$('#ch2b'));
            tip.show(`p ∈ [${(i / bins).toFixed(2)}, ${((i + 1) / bins).toFixed(2)})<br>无效 ${d[0]} 个，有效 ${d[1]} 个`, mx, my);
          })
          .on('pointerleave', () => tip.hide());
      });
      c.g.append('text').attr('class', 'lbl halo').attr('x', x(0) + 2).attr('y', y(cnt[0][0] + cnt[0][1]) - 6).text('← p<0.05 这一格');
      const expNull = (N_EXP * (1 - pi)) / bins;
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(expNull)).attr('y2', y(expNull))
        .style('stroke', 'var(--text-2)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      const sig = sim.p.filter((p) => p < 0.05).length;
      const sigNull = sim.p.filter((p, i) => p < 0.05 && !sim.eff[i]).length;
      const pw = S.normCdf(LAM - 1.959964) + S.normCdf(-LAM - 1.959964);
      const theory = (1 - pi) * 0.05 + pi * pw > 0 ? ((1 - pi) * 0.05) / ((1 - pi) * 0.05 + pi * pw) : NaN;
      Lab.$('#r2b').innerHTML =
        Lab.stat('p<0.05 的实验', sig + ' 个') +
        Lab.stat('其中其实无效的占比（模拟）', sig ? F.pct(sigNull / sig, 1) : '—', 'hl') +
        Lab.stat('理论值', F.pct(theory, 1));
    }
    drawB();
    Lab.watch('#ch2b', drawB);
  }

  /* ================= 实验 3：样本量计算器 ================= */
  function lab3() {
    const ctl = Lab.controls('#c3', [
      { key: 'p0', label: '基线转化率 p₀', min: 0.005, max: 0.6, step: 0.005, value: 0.1, fmt: (v) => F.pct(v, 1) },
      { key: 'mtype', label: 'MDE（最小可检测效应）的写法', type: 'seg', options: [{ v: 'rel', t: '相对提升' }, { v: 'abs', t: '绝对提升' }], value: 'rel' },
      { key: 'mrel', label: '相对 MDE', min: 0.01, max: 0.3, step: 0.005, value: 0.05, fmt: (v) => F.pct(v, 1) },
      { key: 'mabs', label: '绝对 MDE', min: 0.0005, max: 0.05, step: 0.0005, value: 0.005, fmt: (v) => F.pp(v, 2) },
      { key: 'alpha', label: '显著性水平 α', type: 'seg', options: [{ v: 0.01, t: '0.01' }, { v: 0.05, t: '0.05' }, { v: 0.1, t: '0.10' }], value: 0.05 },
      { key: 'power', label: '功效 1−β', type: 'seg', options: [{ v: 0.7, t: '70%' }, { v: 0.8, t: '80%' }, { v: 0.9, t: '90%' }], value: 0.8 },
      { key: 'sided', label: '检验方向', type: 'seg', options: [{ v: 2, t: '双侧' }, { v: 1, t: '单侧' }], value: 2 },
      { key: 'daily', label: '每天进入实验的总人数（两组合计）', min: 1000, max: 1000000, scale: 'log', value: 20000, round: roundN, fmt: F.int },
    ], onChange);
    Lab.$('#b3-reset').addEventListener('click', () => ctl.reset());
    function onChange(v, key) {
      if (key === 'mtype') {
        if (v.mtype === 'abs') ctl.set({ mabs: Lab.clamp(Math.round((v.mrel * v.p0) / 0.0005) * 0.0005, 0.0005, 0.05) }, true);
        else ctl.set({ mrel: Lab.clamp(Math.round(v.mabs / v.p0 / 0.005) * 0.005, 0.01, 0.3) }, true);
      }
      draw();
    }
    function draw() {
      const v = ctl.values;
      ctl.ui.mrel.inp.closest('.ctrl').classList.toggle('hide', v.mtype !== 'rel');
      ctl.ui.mabs.inp.closest('.ctrl').classList.toggle('hide', v.mtype !== 'abs');
      const d = v.mtype === 'rel' ? v.mrel * v.p0 : v.mabs;
      const p1 = v.p0 + d;
      const n = Math.ceil(P.nPerGroup(v.p0, d, v.alpha, v.power, v.sided));
      const days = Math.ceil((2 * n) / v.daily);
      const za = v.sided === 1 ? S.normPpf(1 - v.alpha) : S.normPpf(1 - v.alpha / 2);
      const zb = S.normPpf(v.power);
      const bad = p1 >= 1;
      Lab.$('#r3').innerHTML = bad ? '<div class="callout warn">提升后的转化率超过 100%，请调小 MDE。</div>' :
        Lab.stat('绝对提升 Δ', F.pp(d, 2).replace(' 个百分点', '<small> 个百分点</small>')) +
        Lab.stat('相对提升', F.pct(d / v.p0, 1)) +
        Lab.stat('每组样本量', F.int(n), 'hl') +
        Lab.stat('两组合计', F.int(2 * n)) +
        Lab.stat('所需天数', days + ' 天', 'hl');
      let advice = '';
      if (!bad) {
        if (days < 7) advice = `算出来 ${days} 天，建议仍然跑满 7 天，覆盖完整的一周，避免工作日 / 周末的差异混进结果。`;
        else if (days > 28) advice = `要跑 ${days} 天，太久了：可以放宽 MDE、换更灵敏的指标，或者用 CUPED 降低方差（见 CUPED 页）。`;
        else advice = `需要 ${days} 天。中途不要因为“已经显著”提前停（见“偷看与序贯检验”页）。`;
      }
      Lab.$('#adv3').textContent = advice;
      const fx = Lab.$('#f3');
      if (typeof katex !== 'undefined' && !bad) {
        katex.render(
          `n=\\frac{(${za.toFixed(3)}+${zb.toFixed(3)})^2\\times(${(v.p0 * (1 - v.p0)).toFixed(4)}+${(p1 * (1 - p1)).toFixed(4)})}{${d.toFixed(4)}^2}\\approx ${F.int(n).replace(/,/g, '{,}')}`,
          fx, { displayMode: true, throwOnError: false });
      }
      drawCurve(v, d, n);
    }
    function drawCurve(v, d, n) {
      const c = Lab.chart('#ch3', { height: 210, margin: { t: 26, r: 16, b: 46, l: 58 }, label: '每组样本量随 MDE 变化' });
      const rel = v.mtype === 'rel';
      const lo = rel ? 0.01 : 0.0005, hi = rel ? 0.3 : 0.05;
      const toD = (m) => (rel ? m * v.p0 : m);
      const ms = d3.range(0, 121).map((i) => lo * Math.pow(hi / lo, i / 120)).filter((m) => v.p0 + toD(m) < 1);
      const pts = ms.map((m) => [m, P.nPerGroup(v.p0, toD(m), v.alpha, v.power, v.sided)]);
      const x = d3.scaleLog([lo, hi], [0, c.w]);
      const y = d3.scaleLog([Math.max(10, d3.min(pts, (p) => p[1])), d3.max(pts, (p) => p[1])], [c.h, 0]).nice();
      Lab.axes(c, x, y, {
        xTitle: rel ? '相对 MDE（对数刻度）' : '绝对 MDE（个百分点，对数刻度）', yTitle: '每组样本量（对数刻度）',
        xValues: rel ? [0.01, 0.02, 0.05, 0.1, 0.2] : [0.001, 0.002, 0.005, 0.01, 0.02, 0.05],
        xFmt: (m) => (rel ? F.pct(m, 0) : (m * 100).toFixed(1)), yTicks: 4, yFmt: (t) => (Math.log10(t) % 1 === 0 ? F.int(t) : ''),
      });
      c.g.append('path').attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      const m0 = rel ? d / v.p0 : d;
      if (v.p0 + d < 1) {
        c.g.append('circle').attr('cx', x(m0)).attr('cy', y(n)).attr('r', 5.5).style('fill', 'var(--s2)').style('stroke', 'var(--surface)').style('stroke-width', 2);
        const right = x(m0) > c.w * 0.6;
        c.g.append('text').attr('class', 'lbl halo').attr('x', x(m0) + (right ? -8 : 8)).attr('y', y(n) - 8).attr('text-anchor', right ? 'end' : 'start').text(`每组 ${F.int(n)}`);
      }
    }
    draw();
    Lab.watch('#ch3', draw);
  }

  Lab.ready(() => {
    lab1();
    lab2();
    lab3();
  });
})(typeof window !== 'undefined' ? window : globalThis);

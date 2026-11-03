/* 页面 2：偷看与序贯检验 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  /* 门槛常量来自 verify/02_peeking_output.txt（多元正态 CDF 求根，双侧 α=0.05） */
  const POCOCK = { 2: 2.1783, 3: 2.2895, 4: 2.3613, 5: 2.4132, 6: 2.4532, 7: 2.4855, 8: 2.5123, 9: 2.5352, 10: 2.555 };
  const OBF_CB = { 2: 1.9774, 3: 2.004, 4: 2.0243, 5: 2.0401, 6: 2.0528, 7: 2.0633, 8: 2.0722, 9: 2.0798, 10: 2.0865 };
  const Z975 = 1.959964;

  const P = (Lab.sim.peeking = {
    POCOCK,
    OBF_CB,
    bounds(method, K) {
      if (method === 'pocock') return Array(K).fill(POCOCK[K]);
      if (method === 'obf') return Array.from({ length: K }, (_, i) => OBF_CB[K] * Math.sqrt(K / (i + 1)));
      return Array(K).fill(Z975);
    },
    /* A/A：每天看一次累计数据。fpr[k] = 到第 k+1 天为止至少一次 |Z|>1.96 的比例；paths 为前 nPaths 条路径 */
    peekAA(K, nSims, nPaths, seed) {
      const r = Lab.rng(seed);
      const hitBy = new Array(K).fill(0);
      const paths = [];
      for (let s = 0; s < nSims; s++) {
        let sum = 0, first = -1;
        const path = s < nPaths ? [] : null;
        for (let k = 1; k <= K; k++) {
          sum += r.normal();
          const z = sum / Math.sqrt(k);
          if (path) path.push(z);
          if (first < 0 && Math.abs(z) > Z975) first = k;
        }
        if (first > 0) for (let k = first; k <= K; k++) hitBy[k - 1]++;
        if (path) paths.push({ z: path, first });
      }
      return { fpr: hitBy.map((h) => h / nSims), paths, nSims };
    },
    /* θ = 最后一次分析时 Z 的期望值；返回拒绝率和平均用掉的样本比例 */
    seqSim(bounds, theta, nSims, seed) {
      const r = Lab.rng(seed);
      const K = bounds.length, drift = theta / Math.sqrt(K);
      let rej = 0, used = 0;
      for (let s = 0; s < nSims; s++) {
        let sum = 0, stop = K, hit = false;
        for (let k = 1; k <= K; k++) {
          sum += r.normal() + drift;
          if (Math.abs(sum / Math.sqrt(k)) > bounds[k - 1]) {
            hit = true;
            stop = k;
            break;
          }
        }
        if (hit) rej++;
        used += stop / K;
      }
      return { reject: rej / nSims, used: used / nSims, nSims };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  /* ================= 实验 1：A/A 每天偷看 ================= */
  function lab1() {
    let seed = 42;
    const N_SIMS = 4000, N_PATHS = 40;
    const ctl = Lab.controls('#c1', [
      { key: 'K', label: '实验天数（每天看一次累计数据）', min: 2, max: 30, step: 1, value: 14, fmt: (v) => v + ' 天', full: true },
    ], draw);
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lg1a', [
      { color: 'var(--muted)', label: '始终没越线的路径', line: true },
      { color: 'var(--s2)', label: '某天越线（会被误判显著）', line: true },
    ]);
    Lab.legend('#lg1b', [
      { color: 'var(--s2)', label: '模拟：至少一次误判显著', line: true },
      { color: 'var(--text-2)', label: '独立公式 1−0.95ᵏ', dash: true },
      { color: 'var(--s1)', label: '名义 α = 5%', line: true },
    ]);
    function draw() {
      const K = ctl.values.K;
      const sim = P.peekAA(K, N_SIMS, N_PATHS, seed);
      // 路径图
      const c = Lab.chart('#ch1', { height: 230, margin: { t: 26, r: 14, b: 46, l: 40 }, label: 'A/A 实验累计 Z 值路径' });
      const x = d3.scaleLinear([1, K], [0, c.w]);
      const y = d3.scaleLinear([-3.6, 3.6], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '第几天', yTitle: '累计数据的 Z 值', yTicks: 6, xTicks: Math.min(K - 1, 7), xFmt: d3.format('d') });
      [Z975, -Z975].forEach((v) => c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(v)).attr('y2', y(v))
        .style('stroke', 'var(--text-2)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5));
      c.g.append('text').attr('class', 'lbl-2 halo').attr('x', c.w - 2).attr('y', y(Z975) - 5).attr('text-anchor', 'end').text('门槛 +1.96');
      const line = d3.line().x((d, i) => x(i + 1)).y((d) => y(Lab.clamp(d, -3.6, 3.6)));
      const sorted = sim.paths.slice().sort((a, b) => (a.first > 0) - (b.first > 0));
      sorted.forEach((p) => {
        const hit = p.first > 0;
        c.g.append('path').attr('d', line(p.z)).style('fill', 'none')
          .style('stroke', hit ? 'var(--s2)' : 'var(--muted)').style('stroke-width', hit ? 1.8 : 1).style('opacity', hit ? 0.95 : 0.35);
        if (hit) c.g.append('circle').attr('cx', x(p.first)).attr('cy', y(Lab.clamp(p.z[p.first - 1], -3.6, 3.6))).attr('r', 3.5).style('fill', 'var(--s2)');
      });
      const nHit = sim.paths.filter((p) => p.first > 0).length;
      Lab.$('#cap1').textContent = `图中是前 ${N_PATHS} 次模拟的路径，其中 ${nHit} 条在 ${K} 天内某天越过门槛。`;

      // 假阳性率曲线
      const c2 = Lab.chart('#ch2', { height: 220, margin: { t: 26, r: 14, b: 46, l: 44 }, label: '偷看次数与假阳性率' });
      const formula = d3.range(1, K + 1).map((k) => 1 - Math.pow(0.95, k));
      const x2 = d3.scaleLinear([1, K], [0, c2.w]);
      const y2 = d3.scaleLinear([0, Math.min(1, Math.max(0.3, formula[K - 1] + 0.05))], [c2.h, 0]);
      Lab.axes(c2, x2, y2, { xTitle: '一共看了几天', yTitle: '至少一次误判显著的比例', yTicks: 5, yFmt: d3.format('.0%'), xTicks: Math.min(K - 1, 7), xFmt: d3.format('d') });
      c2.g.append('line').attr('x1', 0).attr('x2', c2.w).attr('y1', y2(0.05)).attr('y2', y2(0.05)).style('stroke', 'var(--s1)').style('stroke-width', 1.5);
      c2.g.append('path').attr('d', d3.line().x((d, i) => x2(i + 1)).y((d) => y2(d))(formula))
        .style('fill', 'none').style('stroke', 'var(--text-2)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      c2.g.append('path').attr('d', d3.line().x((d, i) => x2(i + 1)).y((d) => y2(d))(sim.fpr))
        .style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      const tip = Lab.tip(Lab.$('#ch2'));
      sim.fpr.forEach((f, i) => {
        c2.g.append('circle').attr('cx', x2(i + 1)).attr('cy', y2(f)).attr('r', K > 20 ? 2.5 : 3.5).style('fill', 'var(--s2)');
        c2.g.append('rect').attr('x', x2(i + 1) - c2.w / K / 2).attr('width', c2.w / K).attr('y', 0).attr('height', c2.h).style('fill', 'transparent')
          .on('pointerenter pointermove', (ev) => {
            const [mx, my] = d3.pointer(ev, Lab.$('#ch2'));
            tip.show(`看 ${i + 1} 天<br>模拟 ${F.pct(f, 1)}<br>独立公式 ${F.pct(formula[i], 1)}`, mx, my);
          })
          .on('pointerleave', () => tip.hide());
      });
      const last = sim.fpr[K - 1];
      c2.g.append('text').attr('class', 'lbl halo').attr('x', c2.w - 2).attr('y', y2(last) + 16).attr('text-anchor', 'end').style('fill', 'var(--s2)').text(F.pct(last, 1));
      Lab.$('#r1').innerHTML =
        Lab.stat(`每天看、${K} 天内至少一次显著（模拟）`, F.pct(last, 1), 'hl') +
        Lab.stat('独立公式 1−0.95ᵏ 给出', F.pct(formula[K - 1], 1)) +
        Lab.stat('只在最后一天看一次', '5.0%');
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 实验 2：序贯检验门槛 ================= */
  function lab2() {
    let seed = 42;
    const N = 20000;
    const ctl = Lab.controls('#c2', [
      { key: 'K', label: '一共分析几次 K（等间隔）', min: 2, max: 10, step: 1, value: 5, fmt: (v) => v + ' 次' },
      { key: 'theta', label: '真实效应 θ（最后一次分析时 Z 的期望值）', min: 0, max: 4, step: 0.1, value: 0, fmt: (v) => (v === 0 ? '0（A/A）' : v.toFixed(1)) },
    ], draw);
    Lab.$('#b2-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b2-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    const METHODS = [
      { id: 'naive', name: '每次都用 1.96', color: 'var(--text-2)', dash: true },
      { id: 'pocock', name: 'Pocock', color: 'var(--s1)' },
      { id: 'obf', name: "O'Brien-Fleming", color: 'var(--s2)' },
    ];
    Lab.legend('#lg2', METHODS.map((m) => ({ color: m.color, label: m.name, line: !m.dash, dash: m.dash })));
    function draw() {
      const { K, theta } = ctl.values;
      const c = Lab.chart('#ch3', { height: 230, margin: { t: 26, r: 14, b: 46, l: 40 }, label: '三种门槛随分析次数变化' });
      const bd = {};
      METHODS.forEach((m) => (bd[m.id] = P.bounds(m.id, K)));
      const x = d3.scaleLinear([1, K], [0, c.w]);
      const y = d3.scaleLinear([1.5, Math.max(5, bd.obf[0] + 0.3)], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '第几次分析（第 K 次用满全部样本）', yTitle: '|Z| 门槛（超过就停、判显著）', yTicks: 5, xTicks: K - 1, xFmt: d3.format('d') });
      const tip = Lab.tip(Lab.$('#ch3'));
      METHODS.forEach((m) => {
        c.g.append('path').attr('d', d3.line().x((d, i) => x(i + 1)).y((d) => y(d))(bd[m.id]))
          .style('fill', 'none').style('stroke', m.color).style('stroke-width', 2).style('stroke-dasharray', m.dash ? '5 4' : null);
        bd[m.id].forEach((b, i) => {
          c.g.append('circle').attr('cx', x(i + 1)).attr('cy', y(b)).attr('r', 5).style('fill', m.color).style('stroke', 'var(--surface)').style('stroke-width', 2)
            .on('pointerenter', (ev) => {
              const [mx, my] = d3.pointer(ev, Lab.$('#ch3'));
              tip.show(`${m.name} 第 ${i + 1} 次<br>门槛 ${b.toFixed(3)}<br>名义 α ${(2 * (1 - S.normCdf(b))).toFixed(4)}`, mx, my);
            })
            .on('pointerleave', () => tip.hide());
        });
      });
      const rows = METHODS.map((m, i) => ({ m, r: P.seqSim(bd[m.id], theta, N, seed + i) }));
      const fixedPower = theta === 0 ? 0.05 : S.normCdf(theta - Z975) + S.normCdf(-theta - Z975);
      const head = theta === 0 ? '假阳性率' : '功效';
      Lab.$('#t2').innerHTML =
        `<table class="tbl"><thead><tr><th>门槛</th><th class="n">${head}</th><th class="n">平均样本</th></tr></thead><tbody>` +
        rows.map((o) => `<tr><td style="white-space:nowrap"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${o.m.color};margin-right:6px"></span>${o.m.name}</td><td class="n">${F.pct(o.r.reject, 1)}</td><td class="n">${F.pct(o.r.used, 0)}</td></tr>`).join('') +
        `<tr><td style="white-space:nowrap">只在最后看一次</td><td class="n">${F.pct(fixedPower, 1)}</td><td class="n">100%</td></tr></tbody></table>`;
      Lab.$('#cap2').textContent = `每种门槛模拟 ${F.int(N)} 次。第 1 次分析的门槛：Pocock ${bd.pocock[0].toFixed(2)}，O'Brien-Fleming ${bd.obf[0].toFixed(2)}；最后一次：Pocock ${bd.pocock[K - 1].toFixed(2)}，O'Brien-Fleming ${bd.obf[K - 1].toFixed(2)}。`;
    }
    draw();
    Lab.watch('#ch3', draw);
  }

  Lab.ready(() => {
    lab1();
    lab2();
  });
})(typeof window !== 'undefined' ? window : globalThis);

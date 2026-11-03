/* 页面 3：多重检验 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  function order(p) {
    return p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  }
  const M = (Lab.sim.multiple = {
    none: (p, a) => p.map((v) => v <= a),
    bonf: (p, a) => p.map((v) => v <= a / p.length),
    holm(p, a) {
      const m = p.length, o = order(p), rej = Array(m).fill(false);
      for (let i = 0; i < m; i++) {
        if (p[o[i]] <= a / (m - i)) rej[o[i]] = true;
        else break;
      }
      return rej;
    },
    bh(p, a) {
      const m = p.length, o = order(p), rej = Array(m).fill(false);
      let k = 0;
      for (let i = 0; i < m; i++) if (p[o[i]] <= (a * (i + 1)) / m) k = i + 1;
      for (let i = 0; i < k; i++) rej[o[i]] = true;
      return rej;
    },
    /* m 个检验，round(m·pi1) 个真有效（z 期望 lam）；返回各方法的 FWER、FDR、功效、平均拒绝数，以及第一次模拟的样例 */
    simulate(m, pi1, lam, sims, seed, alpha) {
      alpha = alpha || 0.05;
      const r = Lab.rng(seed);
      const m1 = Math.round(m * pi1);
      const truth = Array.from({ length: m }, (_, i) => i < m1);
      const names = ['none', 'bonf', 'holm', 'bh'];
      const res = {};
      names.forEach((n) => (res[n] = { fwer: 0, fdr: 0, power: 0, R: 0 }));
      let example = null;
      for (let s = 0; s < sims; s++) {
        const p = truth.map((t) => 2 * (1 - S.normCdf(Math.abs(r.normal() + (t ? lam : 0)))));
        if (!example) example = { p, truth };
        names.forEach((n) => {
          const rej = M[n](p, alpha);
          let V = 0, R = 0, T = 0;
          rej.forEach((x, i) => { if (x) { R++; if (truth[i]) T++; else V++; } });
          res[n].fwer += V > 0 ? 1 : 0;
          res[n].fdr += V / Math.max(R, 1);
          res[n].power += m1 ? T / m1 : 0;
          res[n].R += R;
        });
      }
      names.forEach((n) => Object.keys(res[n]).forEach((k) => (res[n][k] /= sims)));
      return { res, example, m1 };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const NAMES = { none: '不校正', bonf: 'Bonferroni', holm: 'Holm', bh: 'BH' };

  /* ================= 实验 1：FWER 和 FDR ================= */
  function lab1() {
    let seed = 42;
    const LAM = 3, SIMS = 4000;
    const ctl = Lab.controls('#c1', [
      { key: 'm', label: '同时检验的个数 m', min: 1, max: 50, step: 1, value: 20, fmt: (v) => v + ' 个' },
      { key: 'pi1', label: '其中真有效的比例', min: 0, max: 1, step: 0.05, value: 0.25, fmt: (v) => F.pct(v, 0) },
      { key: 'meth', label: '方格图展示哪种方法的判断', type: 'seg', full: true, value: 'bh',
        options: [{ v: 'none', t: '不校正' }, { v: 'bonf', t: 'Bonferroni' }, { v: 'holm', t: 'Holm' }, { v: 'bh', t: 'BH' }] },
    ], draw);
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    function draw() {
      const v = ctl.values;
      const out = M.simulate(v.m, v.pi1, LAM, SIMS, seed);
      const ex = out.example;
      const rej = M[v.meth](ex.p, 0.05);
      let TP = 0, FP = 0, FN = 0;
      Lab.$('#grid1').innerHTML = ex.p.map((p, i) => {
        const t = ex.truth[i], r = rej[i];
        let cls, icon, lab;
        if (r && t) { cls = 'tp'; icon = '✓'; lab = '真阳性'; TP++; }
        else if (r && !t) { cls = 'fp'; icon = '✗'; lab = '假阳性'; FP++; }
        else if (!r && t) { cls = 'fn'; icon = '○'; lab = '漏掉的真效应'; FN++; }
        else { cls = 'tn'; icon = '·'; lab = '真阴性'; }
        return `<span class="tile ${cls}" title="检验 ${i + 1}：${lab}，p=${p.toFixed(4)}">${icon}</span>`;
      }).join('');
      const R = TP + FP;
      Lab.$('#ex1').innerHTML = `这一次（${NAMES[v.meth]}）：判显著 <strong>${R}</strong> 个，其中假阳性 <strong>${FP}</strong> 个` +
        (R ? `，假阳性占比 ${F.pct(FP / R, 0)}` : '') + `；漏掉真效应 ${FN} 个。`;
      Lab.$('#t1').innerHTML =
        `<table class="tbl"><thead><tr><th>方法</th><th class="n">平均判显著</th><th class="n">FWER</th><th class="n">FDR</th><th class="n">功效</th></tr></thead><tbody>` +
        ['none', 'bonf', 'holm', 'bh'].map((n) => {
          const r = out.res[n];
          return `<tr class="${n === v.meth ? 'on' : ''}"><td>${NAMES[n]}</td><td class="n">${r.R.toFixed(2)}</td><td class="n">${F.pct(r.fwer, 1)}</td><td class="n">${F.pct(r.fdr, 1)}</td><td class="n">${out.m1 ? F.pct(r.power, 1) : '—'}</td></tr>`;
        }).join('') + '</tbody></table>';
      Lab.$('#cap1').textContent = `表格是 ${F.int(SIMS)} 次模拟的平均：FWER = 至少一个假阳性的概率；FDR = 判显著的结果里假阳性比例的平均；功效 = 真效应被找出来的比例。真有效的检验 z 的期望为 ${LAM}（单独检验功效约 85%）。`;
    }
    draw();
  }

  /* ================= 实验 2：拖动 p 值 ================= */
  function lab2() {
    const ALPHA = 0.05;
    const DEFAULT = [0.001, 0.014, 0.016, 0.022, 0.03, 0.045, 0.3, 0.7];
    let data = DEFAULT.map((p, i) => ({ id: i, p }));
    let c, x, y, gPts;
    const m = DEFAULT.length;
    const LO = 0.0005;
    Lab.legend('#lg2', [
      { color: 'var(--text-2)', label: '不校正：α=0.05', dash: true },
      { color: 'var(--s1)', label: 'Bonferroni：α/m', line: true },
      { color: 'var(--s2)', label: 'BH：kα/m', line: true },
      { color: 'var(--s2)', label: '实心点 = BH 判显著' },
    ]);
    Lab.$('#b2-rand').addEventListener('click', () => {
      const r = Lab.rng(Lab.newSeed());
      data = data.map((d, i) => ({ id: d.id, p: Lab.clamp(i < 4 ? Math.pow(r.uniform(), 3) * 0.06 : r.uniform(), LO, 1) }));
      update();
    });
    Lab.$('#b2-reset').addEventListener('click', () => { data = DEFAULT.map((p, i) => ({ id: i, p })); update(); });

    function build() {
      c = Lab.chart('#ch2', { height: 260, margin: { t: 26, r: 14, b: 46, l: 50 }, label: '排序后的 p 值和三种门槛' });
      x = d3.scalePoint(d3.range(1, m + 1), [0, c.w]).padding(0.5);
      y = d3.scaleLog([LO, 1], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: 'p 值从小到大的排名 k', yTitle: 'p 值（对数刻度，可上下拖动圆点）', xFmt: d3.format('d'),
        yValues: [0.001, 0.01, 0.05, 0.1, 1], yFmt: d3.format('~g') });
      const xl = x(1) - 10, xr = x(m) + 10;
      const hline = (v, color, dash) => c.g.append('line').attr('x1', xl).attr('x2', xr).attr('y1', y(v)).attr('y2', y(v))
        .style('stroke', color).style('stroke-width', dash ? 1.5 : 2).style('stroke-dasharray', dash ? '5 4' : null);
      hline(ALPHA, 'var(--text-2)', true);
      hline(ALPHA / m, 'var(--s1)');
      c.g.append('path').attr('d', d3.line().x((k) => x(k)).y((k) => y((ALPHA * k) / m))(d3.range(1, m + 1)))
        .style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      d3.range(1, m + 1).forEach((k) => c.g.append('circle').attr('cx', x(k)).attr('cy', y((ALPHA * k) / m)).attr('r', 2.5).style('fill', 'var(--s2)'));
      gPts = c.g.append('g');
      update();
    }

    function update() {
      const p = data.map((d) => d.p);
      const dec = { none: M.none(p, ALPHA), bonf: M.bonf(p, ALPHA), holm: M.holm(p, ALPHA), bh: M.bh(p, ALPHA) };
      const sorted = data.slice().sort((a, b) => a.p - b.p);
      sorted.forEach((d, i) => (d.rank = i + 1));
      const sel = gPts.selectAll('g.pt').data(data, (d) => d.id);
      const enter = sel.enter().append('g').attr('class', 'pt').style('cursor', 'ns-resize').style('touch-action', 'none');
      enter.append('circle').attr('class', 'hit').attr('r', 18).style('fill', 'transparent');
      enter.append('circle').attr('class', 'dot').attr('r', 8).style('stroke', 'var(--s2)').style('stroke-width', 2.5);
      enter.call(
        d3.drag()
          .subject((ev, d) => ({ x: x(d.rank), y: y(d.p) }))
          .on('drag', (ev, d) => {
            d.p = Lab.clamp(y.invert(ev.y), LO, 1);
            update();
          })
      );
      const all = enter.merge(sel);
      all.attr('transform', (d) => `translate(${x(d.rank)},${y(d.p)})`);
      all.select('.dot').style('fill', (d) => (dec.bh[d.id] ? 'var(--s2)' : 'var(--surface)'));

      const ck = (b) => (b ? '<span class="good-ink">✓</span>' : '<span class="muted">–</span>');
      Lab.$('#t2').innerHTML =
        `<table class="tbl compact"><thead><tr><th class="n">k</th><th class="n">p 值</th><th class="n">kα/m</th><th class="n">原始</th><th class="n">Bonf</th><th class="n">Holm</th><th class="n">BH</th></tr></thead><tbody>` +
        sorted.map((d) => `<tr><td class="n">${d.rank}</td><td class="n">${d.p < 0.001 ? d.p.toFixed(4) : d.p.toFixed(3)}</td><td class="n">${((ALPHA * d.rank) / m).toFixed(4)}</td>` +
          `<td class="n">${ck(dec.none[d.id])}</td><td class="n">${ck(dec.bonf[d.id])}</td><td class="n">${ck(dec.holm[d.id])}</td><td class="n">${ck(dec.bh[d.id])}</td></tr>`).join('') +
        '</tbody></table>';
      const cnt = (a) => a.filter(Boolean).length;
      Lab.$('#r2').innerHTML =
        Lab.stat('不校正', cnt(dec.none) + ' 个') + Lab.stat('Bonferroni', cnt(dec.bonf) + ' 个') +
        Lab.stat('Holm', cnt(dec.holm) + ' 个') + Lab.stat('BH', cnt(dec.bh) + ' 个', 'hl');
    }
    build();
    Lab.watch('#ch2', build);
  }

  Lab.ready(() => {
    lab1();
    lab2();
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* 页面 14：分类阈值实验室 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const sf = (x) => 0.5 * S.erfc(x / Math.SQRT2); // 右尾概率，直接用 erfc，避免 1 − Φ 在尾部变成 0

  const T = (Lab.sim.threshold = {
    metrics(d, pi, t, n) {
      n = n || 10000;
      const tpr = sf(t - d), fpr = sf(t);
      const tp = n * pi * tpr, fn = n * pi * (1 - tpr), fp = n * (1 - pi) * fpr, tn = n * (1 - pi) * (1 - fpr);
      const precision = tp + fp > 0 ? tp / (tp + fp) : NaN;
      const f1 = precision + tpr > 0 ? (2 * precision * tpr) / (precision + tpr) : 0;
      return { tp, fp, fn, tn, precision, recall: tpr, fpr, f1, accuracy: (tp + tn) / n };
    },
    auc: (d) => S.normCdf(d / Math.SQRT2),
    ap(d, pi) {
      let prevR = 0, a = 0;
      for (let k = 0; k <= 20000; k++) {
        const t = 12 - (24 * k) / 20000;
        const rec = sf(t - d), fp = sf(t);
        const den = pi * rec + (1 - pi) * fp;
        const prec = den > 0 ? (pi * rec) / den : 1;
        if (k > 0) a += (rec - prevR) * prec;
        prevR = rec;
      }
      return a;
    },
    bestF1(d, pi) {
      let best = { t: 0, f1: -1 };
      for (let k = 0; k <= 9000; k++) {
        const t = -3 + k / 1000, f = T.metrics(d, pi, t).f1;
        if (f > best.f1) best = { t, f1: f };
      }
      return best;
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  function init() {
    const ctl = Lab.controls('#c1', [
      { key: 'd', label: '模型区分度 d（正负样本分数差几个标准差）', min: 0.5, max: 3, step: 0.1, value: 1.5, fmt: (v) => v.toFixed(1) },
      { key: 'pi', label: '正样本占比（比如欺诈、付费、流失）', min: 0.005, max: 0.5, scale: 'log', value: 0.1, round: (v) => (v < 0.02 ? Math.round(v * 1000) / 1000 : Math.round(v * 200) / 200), fmt: (v) => F.pct(v, v < 0.02 ? 1 : 1) },
      { key: 't', label: '阈值（分数高于它判为正）', min: -2, max: 5, step: 0.05, value: 1, fmt: (v) => v.toFixed(2), full: true },
      { key: 'view', label: '分布图', type: 'seg', full: true, value: 'count', options: [{ v: 'count', t: '按人数（看出不平衡）' }, { v: 'shape', t: '各自归一化（看形状）' }] },
    ], draw);
    Lab.$('#b1-reset').addEventListener('click', () => ctl.reset());
    Lab.$('#b1-f1').addEventListener('click', () => { const b = T.bestF1(ctl.values.d, ctl.values.pi); ctl.set({ t: Math.round(b.t * 20) / 20 }); });
    Lab.legend('#lg1', [
      { color: 'var(--s1)', label: '负样本' },
      { color: 'var(--s2)', label: '正样本' },
      { color: 'var(--text)', label: '阈值', line: true },
    ]);
    function draw() {
      const v = ctl.values;
      const m = T.metrics(v.d, v.pi, v.t);
      // ① 分数分布
      const c = Lab.chart('#ch1', { height: 220, margin: { t: 26, r: 12, b: 46, l: 46 }, label: '两类样本的分数分布' });
      const x = d3.scaleLinear([-4, 6], [0, c.w]);
      const count = v.view === 'count';
      const neg = (s) => (count ? (1 - v.pi) * 10000 : 1) * S.normPdf(s);
      const pos = (s) => (count ? v.pi * 10000 : 1) * S.normPdf(s, v.d, 1);
      const xs = Lab.linspace(-4, 6, 300);
      const ymax = d3.max(xs, (s) => Math.max(neg(s), pos(s))) * 1.1;
      const y = d3.scaleLinear([0, ymax], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '模型分数', yTitle: count ? '人数密度（按 1 万人）' : '概率密度（各自归一化）', yTicks: 4 });
      const area = (f, a, b) => d3.area().x((s) => x(s)).y0(c.h).y1((s) => y(f(s)))(Lab.linspace(a, b, 120));
      const line = (f) => d3.line().x((s) => x(s)).y((s) => y(f(s)))(xs);
      if (v.t < 6) {
        c.g.append('path').attr('d', area(neg, Math.max(-4, v.t), 6)).style('fill', 'var(--s1)').style('opacity', 0.45);
        c.g.append('path').attr('d', area(pos, Math.max(-4, v.t), 6)).style('fill', 'var(--s2)').style('opacity', 0.55);
      }
      c.g.append('path').attr('d', line(neg)).style('fill', 'none').style('stroke', 'var(--s1)').style('stroke-width', 2);
      c.g.append('path').attr('d', line(pos)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      c.g.append('line').attr('x1', x(v.t)).attr('x2', x(v.t)).attr('y1', -6).attr('y2', c.h).style('stroke', 'var(--text)').style('stroke-width', 2);
      c.g.append('text').attr('class', 'lbl-2 halo').attr('x', x(v.t) + 4).attr('y', -10).text('判为正 →');
      // ② 混淆矩阵
      const cell = (k, val, cls) => `<td class="n ${cls}"><b>${F.int(val)}</b><small>${k}</small></td>`;
      Lab.$('#cm').innerHTML = `<table class="tbl cm"><thead><tr><th></th><th class="n">判为正</th><th class="n">判为负</th></tr></thead><tbody>` +
        `<tr><th>真的是正</th>${cell('TP 真阳性', m.tp, 'tp')}${cell('FN 漏报', m.fn, 'fn')}</tr>` +
        `<tr><th>真的是负</th>${cell('FP 误报', m.fp, 'fp')}${cell('TN 真阴性', m.tn, 'tn')}</tr></tbody></table>`;
      Lab.$('#r1').innerHTML =
        Lab.stat('精确率 Precision', F.pct(m.precision, 1), 'hl') +
        Lab.stat('召回率 Recall', F.pct(m.recall, 1), 'hl') +
        Lab.stat('误报率 FPR', F.pct(m.fpr, 1)) +
        Lab.stat('F1', m.f1.toFixed(3)) +
        Lab.stat('准确率 Accuracy', F.pct(m.accuracy, 1)) +
        Lab.stat('ROC AUC / PR 曲线下面积', `${T.auc(v.d).toFixed(3)} / ${T.ap(v.d, v.pi).toFixed(3)}`);
      // ③ ROC 和 PR
      const ts = Lab.linspace(8, -6, 240);
      const roc = ts.map((t) => [sf(t), sf(t - v.d)]);
      const pr = ts.map((t) => { const r = sf(t - v.d), fp = sf(t); return [r, (v.pi * r) / (v.pi * r + (1 - v.pi) * fp)]; }).filter((p) => p[0] > 1e-4);
      const small = (sel, title, xT, yT, pts, cur, base) => {
        const cc = Lab.chart(sel, { height: (w) => Math.min(230, w + 20), margin: { t: 24, r: 10, b: 44, l: 38 }, label: title });
        const xx = d3.scaleLinear([0, 1], [0, cc.w]), yy = d3.scaleLinear([0, 1], [cc.h, 0]);
        Lab.axes(cc, xx, yy, { xTitle: xT, yTitle: yT, yTicks: 4, xTicks: 4 });
        base(cc, xx, yy);
        cc.g.append('path').attr('d', d3.line().x((p) => xx(p[0])).y((p) => yy(p[1]))(pts)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
        cc.g.append('circle').attr('cx', xx(cur[0])).attr('cy', yy(cur[1])).attr('r', 6).style('fill', 'var(--text)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      };
      small('#ch2', 'ROC 曲线', '误报率 FPR', 'ROC：召回率 TPR', roc, [m.fpr, m.recall], (cc, xx, yy) =>
        cc.g.append('line').attr('x1', xx(0)).attr('y1', yy(0)).attr('x2', xx(1)).attr('y2', yy(1)).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3'));
      small('#ch3', 'PR 曲线', '召回率 Recall', 'PR：精确率', pr, [m.recall, Number.isFinite(m.precision) ? m.precision : 0], (cc, xx, yy) => {
        cc.g.append('line').attr('x1', xx(0)).attr('y1', yy(v.pi)).attr('x2', xx(1)).attr('y2', yy(v.pi)).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
        cc.g.append('text').attr('class', 'lbl-2 halo').attr('x', xx(1) - 2).attr('y', yy(v.pi) - 4).attr('text-anchor', 'end').text(`随机 = ${F.pct(v.pi, 1)}`);
      });
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  Lab.ready(init);
})(typeof window !== 'undefined' ? window : globalThis);

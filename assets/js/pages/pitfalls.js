/* 页面 5：实验结果的陷阱 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  const A = { heavyShare: 0.1, heavyPay: 0.3, heavyMu: 4.4, heavySd: 0.7, lightPay: 0.03, lightMu: 2.4, lightSd: 0.7, newMu: 2.0, newSd: 0.5 };
  const lnMean = (mu, sd) => Math.exp(mu + (sd * sd) / 2);

  const P = (Lab.sim.pitfalls = {
    A,
    /* (a) 期望值 */
    payExpected(dLight, heavyMult) {
      const h = A.heavyShare, l = 1 - h;
      const mh = lnMean(A.heavyMu, A.heavySd), ml = lnMean(A.lightMu, A.lightSd), mn = lnMean(A.newMu, A.newSd);
      const arpuC = h * A.heavyPay * mh + l * A.lightPay * ml;
      const arpuT = h * A.heavyPay * mh * heavyMult + l * A.lightPay * ml + l * dLight * mn;
      const prC = h * A.heavyPay + l * A.lightPay;
      return { arpuC, arpuT, prC, prT: prC + l * dLight };
    },
    /* (a) 模拟每组 n 个用户的付费金额（未付费记 0） */
    paySim(dLight, heavyMult, n, seed) {
      const r = Lab.rng(seed);
      const grp = (treat) => {
        const amt = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const heavy = r.uniform() < A.heavyShare;
          const u = r.uniform();
          if (heavy) {
            if (u < A.heavyPay) amt[i] = r.lognormal(A.heavyMu, A.heavySd) * (treat ? heavyMult : 1);
          } else if (u < A.lightPay) amt[i] = r.lognormal(A.lightMu, A.lightSd);
          else if (treat && u < A.lightPay + dLight) amt[i] = r.lognormal(A.newMu, A.newSd);
        }
        return amt;
      };
      return { c: grp(0), t: grp(1) };
    },
    meanSe(a) {
      let n = 0, s = 0, s2 = 0;
      for (const v of a) { n++; s += v; s2 += v * v; }
      const m = s / n;
      return { m, se: Math.sqrt((s2 / n - m * m) * (n / (n - 1)) / n), n };
    },
    /* (b) 放量：每天 nDay 人，第 1 天实验组 share1 */
    ramp(share2, gap, eff, base1, share1, nDay) {
      base1 = base1 === undefined ? 0.12 : base1;
      share1 = share1 === undefined ? 0.1 : share1;
      nDay = nDay || 100000;
      const days = [
        { day: 1, nt: nDay * share1, nc: nDay * (1 - share1), pc: base1 },
        { day: 2, nt: nDay * share2, nc: nDay * (1 - share2), pc: base1 - gap },
      ];
      days.forEach((d) => (d.pt = d.pc + eff));
      const sumT = days.reduce((s, d) => s + d.nt, 0), sumC = days.reduce((s, d) => s + d.nc, 0);
      const pt = days.reduce((s, d) => s + d.nt * d.pt, 0) / sumT;
      const pc = days.reduce((s, d) => s + d.nc * d.pc, 0) / sumC;
      const w = days.map((d) => d.nt + d.nc);
      const weighted = days.reduce((s, d, i) => s + w[i] * (d.pt - d.pc), 0) / (w[0] + w[1]);
      return { days, pt, pc, pooled: pt - pc, weighted, sumT, sumC };
    },
    /* (c) 赢家诅咒 */
    winners(n, sims, seed, p0, tau) {
      p0 = p0 || 0.1;
      tau = tau || 0.005;
      const se = Math.sqrt((p0 * (1 - p0)) / n + ((p0 + tau) * (1 - p0 - tau)) / n);
      const lam = tau / se, c = 1.959964;
      const ratio = (lam + S.normPdf(c - lam) / (1 - S.normCdf(c - lam))) / lam;
      const r = Lab.rng(seed);
      const est = [];
      let nSig = 0, sumSig = 0;
      for (let i = 0; i < sims; i++) {
        const e = tau + se * r.normal();
        est.push(e);
        if (e / se > c) { nSig++; sumSig += e; }
      }
      return { se, lam, power: 1 - S.normCdf(c - lam) + S.normCdf(-c - lam), ratio, est, nSig, simRatio: nSig ? sumSig / nSig / tau : NaN, tau };
    },
    /* (d) 新奇效应：第 t 天的真实效应 = long + nov·2^{-(t-1)/half} */
    novelty(days, long, nov, half) {
      return Array.from({ length: days }, (_, i) => long + nov * Math.pow(2, -i / half));
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const ppf = (x, d) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d === undefined ? 2 : d);

  /* ================= (a) 只比较付费用户 ================= */
  function labA() {
    let seed = 42;
    const N = 200000;
    const ctl = Lab.controls('#ca', [
      { key: 'dl', label: '策略让轻度用户新增付费（付费率 +）', min: 0, max: 0.05, step: 0.005, value: 0.03, fmt: (v) => F.pp(v, 1) },
      { key: 'hm', label: '策略对重度用户付费金额的影响', min: 0.8, max: 1.2, step: 0.02, value: 1, fmt: (v) => '×' + v.toFixed(2) },
    ], Lab.throttle(draw));
    Lab.$('#ba-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#ba-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lga', [{ color: 'var(--s1)', label: '对照组' }, { color: 'var(--s2)', label: '实验组' }, { color: 'var(--text)', label: '95% 置信区间', line: true }]);
    function panel(sel, title, mc, mt) {
      const c = Lab.chart(sel, { height: 210, margin: { t: 26, r: 8, b: 30, l: 42 }, label: title });
      const x = d3.scaleBand(['对照', '实验'], [0, c.w]).padding(0.35);
      const top = Math.max(mc.m + 2 * mc.se, mt.m + 2 * mt.se) * 1.15;
      const y = d3.scaleLinear([0, top], [c.h, 0]).nice();
      Lab.axes(c, x, y, { yTitle: title, yTicks: 4 });
      [['对照', mc, 'var(--s1)'], ['实验', mt, 'var(--s2)']].forEach(([k, v, col]) => {
        c.g.append('rect').attr('x', x(k)).attr('width', x.bandwidth()).attr('y', y(v.m)).attr('height', c.h - y(v.m)).attr('rx', 4).style('fill', col);
        const cx = x(k) + x.bandwidth() / 2;
        c.g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(v.m - 1.96 * v.se)).attr('y2', y(v.m + 1.96 * v.se)).style('stroke', 'var(--text)').style('stroke-width', 2);
        c.g.append('text').attr('class', 'lbl halo').attr('x', cx).attr('y', y(v.m + 1.96 * v.se) - 5).attr('text-anchor', 'middle').text(v.m.toFixed(2));
      });
    }
    function draw() {
      const v = ctl.values;
      const s = P.paySim(v.dl, v.hm, N, seed);
      const all = [P.meanSe(s.c), P.meanSe(s.t)];
      const payers = [P.meanSe(s.c.filter((x) => x > 0)), P.meanSe(s.t.filter((x) => x > 0))];
      panel('#cha1', '全体用户人均（元）', all[0], all[1]);
      panel('#cha2', '付费用户人均（元）', payers[0], payers[1]);
      const d1 = all[1].m - all[0].m, se1 = Math.hypot(all[0].se, all[1].se);
      const d2 = payers[1].m - payers[0].m, se2 = Math.hypot(payers[0].se, payers[1].se);
      const sig = (d, se) => (Math.abs(d / se) > 1.96 ? (d > 0 ? '显著上升' : '显著下降') : '不显著');
      Lab.$('#ra').innerHTML =
        Lab.stat('付费率：对照 → 实验', `${F.pct(payers[0].n / N, 1)} → ${F.pct(payers[1].n / N, 1)}`) +
        Lab.stat('全体人均（ARPU）差', `${d1 >= 0 ? '+' : ''}${d1.toFixed(2)}<small> 元，${sig(d1, se1)}</small>`, d1 > 0 ? 'good' : 'bad') +
        Lab.stat('付费用户人均（ARPPU）差', `${d2 >= 0 ? '+' : ''}${d2.toFixed(2)}<small> 元，${sig(d2, se2)}</small>`, d2 > 0 ? 'good' : 'bad');
      const ex = P.payExpected(v.dl, v.hm);
      Lab.$('#capa').textContent = `每组模拟 ${F.int(N)} 人。按期望值算：全体人均 ${ex.arpuT / ex.arpuC - 1 >= 0 ? '+' : ''}${F.pct(ex.arpuT / ex.arpuC - 1, 1)}，付费用户人均 ${(ex.arpuT / ex.prT) / (ex.arpuC / ex.prC) - 1 >= 0 ? '+' : ''}${F.pct((ex.arpuT / ex.prT) / (ex.arpuC / ex.prC) - 1, 1)}。`;
    }
    draw();
    Lab.watch('#cha1', draw);
  }

  /* ================= (b) 放量中的辛普森悖论 ================= */
  function labB() {
    const ctl = Lab.controls('#cb', [
      { key: 's2', label: '第 2 天实验组的流量占比（第 1 天是 10%）', min: 0.1, max: 0.9, step: 0.05, value: 0.5, fmt: (v) => F.pct(v, 0), full: true },
      { key: 'gap', label: '第 2 天的基线转化率比第 1 天低', min: 0, max: 0.08, step: 0.005, value: 0.04, fmt: (v) => F.pp(v, 1) },
      { key: 'eff', label: '真实效应（每天都一样）', min: -0.01, max: 0.01, step: 0.001, value: 0.005, fmt: (v) => ppf(v, 1) + ' 个百分点' },
    ], draw);
    Lab.$('#bb-reset').addEventListener('click', () => ctl.reset());
    Lab.legend('#lgb', [{ color: 'var(--s1)', label: '对照组转化率' }, { color: 'var(--s2)', label: '实验组转化率' }]);
    function draw() {
      const v = ctl.values;
      const r = P.ramp(v.s2, v.gap, v.eff);
      const rows = r.days.map((d) => ({ k: `第 ${d.day} 天`, nt: d.nt, nc: d.nc, pt: d.pt, pc: d.pc }))
        .concat([{ k: '两天合并', nt: r.sumT, nc: r.sumC, pt: r.pt, pc: r.pc, pooled: true }]);
      const wan = (n) => (n / 10000).toFixed(1) + ' 万人';
      Lab.$('#tb').innerHTML =
        '<table class="tbl compact"><thead><tr><th></th><th class="n">实验组</th><th class="n">对照组</th><th class="n">差（百分点）</th></tr></thead><tbody>' +
        rows.map((o) => `<tr class="${o.pooled ? 'on' : ''}"><td style="white-space:nowrap">${o.k}</td>` +
          `<td class="n">${F.pct(o.pt, 2)}<div class="small muted">${wan(o.nt)}</div></td>` +
          `<td class="n">${F.pct(o.pc, 2)}<div class="small muted">${wan(o.nc)}</div></td>` +
          `<td class="n ${o.pt - o.pc < 0 ? 'bad-ink' : 'good-ink'}">${ppf(o.pt - o.pc)}</td></tr>`).join('') +
        '</tbody></table>';
      const c = Lab.chart('#chb', { height: 200, margin: { t: 24, r: 12, b: 30, l: 46 }, label: '每天和合并后的转化率' });
      const x = d3.scalePoint(rows.map((o) => o.k), [0, c.w]).padding(0.5);
      const vals = rows.flatMap((o) => [o.pt, o.pc]);
      const y = d3.scaleLinear([Math.min(...vals) - 0.01, Math.max(...vals) + 0.01], [c.h, 0]).nice();
      Lab.axes(c, x, y, { yTitle: '转化率', yTicks: 4, yFmt: d3.format('.0%') });
      rows.forEach((o) => {
        const cx = x(o.k);
        c.g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(o.pc)).attr('y2', y(o.pt)).style('stroke', o.pt < o.pc ? 'var(--bad)' : 'var(--good)').style('stroke-width', 3);
        c.g.append('circle').attr('cx', cx).attr('cy', y(o.pc)).attr('r', 7).style('fill', 'var(--s1)').style('stroke', 'var(--surface)').style('stroke-width', 2);
        c.g.append('circle').attr('cx', cx).attr('cy', y(o.pt)).attr('r', 7).style('fill', 'var(--s2)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      });
      Lab.$('#rb').innerHTML =
        Lab.stat('两天合并后直接比', ppf(r.pooled) + '<small> 个百分点</small>', r.pooled < 0 ? 'bad' : 'good') +
        Lab.stat('按天算差值、再按人数加权', ppf(r.weighted) + '<small> 个百分点</small>', 'hl');
    }
    draw();
    Lab.watch('#chb', draw);
  }

  /* ================= (c) 赢家诅咒 ================= */
  function labC() {
    let seed = 42;
    const SIMS = 2000;
    const roundN = (v) => (v < 10000 ? Math.round(v / 100) * 100 : Math.round(v / 1000) * 1000);
    const ctl = Lab.controls('#cc', [
      { key: 'n', label: '每组样本量（决定功效）', min: 2000, max: 200000, scale: 'log', value: 20000, round: roundN, fmt: F.int, full: true },
    ], Lab.throttle(draw));
    Lab.$('#bc-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#bc-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lgc', [
      { color: 'var(--muted)', label: '不显著的实验' },
      { color: 'var(--s2)', label: '显著为正（会被推全）' },
      { color: 'var(--s1)', label: '真实效应 0.5', dash: true },
      { color: 'var(--s2)', label: '显著实验的平均估计', line: true },
    ]);
    function draw() {
      const w = P.winners(ctl.values.n, SIMS, seed);
      const c = Lab.chart('#chc', { height: 220, margin: { t: 24, r: 12, b: 46, l: 44 }, label: '2000 个实验的效应估计' });
      const lo = Math.min(-0.01, d3.min(w.est)), hi = Math.max(0.02, d3.max(w.est));
      const x = d3.scaleLinear([lo, hi], [0, c.w]).nice();
      const thr = 1.959964 * w.se;
      const bins = d3.bin().domain(x.domain()).thresholds(d3.range(x.domain()[0], x.domain()[1] + 1e-9, (x.domain()[1] - x.domain()[0]) / 40));
      const bAll = bins(w.est);
      const y = d3.scaleLinear([0, d3.max(bAll, (b) => b.length) * 1.1], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '估计出的提升（个百分点）', yTitle: '实验个数', yTicks: 4, xFmt: (d) => (d * 100).toFixed(1) });
      bAll.forEach((b) => {
        const sigN = b.filter((e) => e > thr).length, rest = b.length - sigN;
        const bx = x(b.x0) + 0.5, bw = Math.max(0.5, x(b.x1) - x(b.x0) - 1);
        c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(rest)).attr('height', c.h - y(rest)).style('fill', 'var(--muted)').style('opacity', 0.5);
        if (sigN) c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(rest + sigN)).attr('height', y(rest) - y(rest + sigN)).style('fill', 'var(--s2)');
      });
      c.g.append('line').attr('x1', x(w.tau)).attr('x2', x(w.tau)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--s1)').style('stroke-width', 2).style('stroke-dasharray', '5 4');
      if (w.nSig) {
        const ms = w.simRatio * w.tau;
        c.g.append('line').attr('x1', x(ms)).attr('x2', x(ms)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--s2)').style('stroke-width', 2);
      }
      Lab.$('#rc').innerHTML =
        Lab.stat('功效', F.pct(w.power, 1)) +
        Lab.stat('显著为正的实验', `${w.nSig} 个`) +
        Lab.stat('它们的平均估计是真实值的', Number.isFinite(w.simRatio) ? w.simRatio.toFixed(2) + ' 倍' : '—', 'hl') +
        Lab.stat('理论值', w.ratio.toFixed(2) + ' 倍');
    }
    draw();
    Lab.watch('#chc', draw);
  }

  /* ================= (d) 新奇效应 ================= */
  function labD() {
    let seed = 42;
    const LONG = 0.002, NOISE = 0.0015, MAXD = 28;
    const ctl = Lab.controls('#cd', [
      { key: 'nov', label: '刚上线时额外的效应（负数 = 学习效应）', min: -0.01, max: 0.015, step: 0.001, value: 0.01, fmt: (v) => ppf(v, 1) + ' 个百分点' },
      { key: 'half', label: '新鲜感的半衰期', min: 1, max: 10, step: 0.5, value: 3, fmt: (v) => v + ' 天' },
      { key: 'days', label: '实验跑几天', min: 3, max: MAXD, step: 1, value: 7, fmt: (v) => v + ' 天', full: true },
    ], draw);
    Lab.$('#bd-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#bd-reset').addEventListener('click', () => { seed = 42; ctl.reset(); });
    Lab.legend('#lgd', [
      { color: 'var(--s2)', label: '每天的真实效应', line: true },
      { color: 'var(--s2)', label: '每天的估计（含噪声）' },
      { color: 'var(--s1)', label: '长期效应 0.2', dash: true },
      { color: 'var(--text)', label: '实验期的平均估计', line: true },
    ]);
    function draw() {
      const v = ctl.values;
      const truth = P.novelty(MAXD, LONG, v.nov, v.half);
      const r = Lab.rng(seed);
      const est = truth.map((t) => t + NOISE * r.normal());
      const inWin = est.slice(0, v.days);
      const avg = S.mean(inWin);
      const c = Lab.chart('#chd', { height: 230, margin: { t: 24, r: 12, b: 46, l: 44 }, label: '每天的效应' });
      const x = d3.scaleLinear([1, MAXD], [0, c.w]);
      const vals = truth.concat(est, [0]);
      const y = d3.scaleLinear([Math.min(...vals) - 0.001, Math.max(...vals) + 0.001], [c.h, 0]).nice();
      Lab.axes(c, x, y, { xTitle: '上线后第几天', yTitle: '点击率提升（个百分点）', yTicks: 5, yFmt: (d) => (d * 100).toFixed(1), xValues: [1, 7, 14, 21, 28] });
      c.g.append('rect').attr('x', 0).attr('width', x(v.days) - x(1) + 4).attr('y', 0).attr('height', c.h).style('fill', 'var(--accent-soft)').style('opacity', 0.6);
      c.g.append('text').attr('class', 'lbl-2').attr('x', 4).attr('y', 12).text(`实验期 ${v.days} 天`);
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--axis)');
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(LONG)).attr('y2', y(LONG)).style('stroke', 'var(--s1)').style('stroke-dasharray', '5 4').style('stroke-width', 2);
      c.g.append('path').attr('d', d3.line().x((d, i) => x(i + 1)).y((d) => y(d))(truth)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2);
      est.forEach((e, i) => c.g.append('circle').attr('cx', x(i + 1)).attr('cy', y(e)).attr('r', 3.5).style('fill', 'var(--s2)').style('opacity', i < v.days ? 1 : 0.25));
      c.g.append('line').attr('x1', x(1)).attr('x2', x(v.days)).attr('y1', y(avg)).attr('y2', y(avg)).style('stroke', 'var(--text)').style('stroke-width', 3);
      const truthAvg = S.mean(truth.slice(0, v.days));
      Lab.$('#rd').innerHTML =
        Lab.stat(`${v.days} 天的平均估计`, ppf(avg) + '<small> 个百分点</small>', 'hl') +
        Lab.stat('长期真实效应', '+0.20<small> 个百分点</small>') +
        Lab.stat('不含噪声时是长期效应的', (truthAvg / LONG).toFixed(2) + ' 倍');
    }
    draw();
    Lab.watch('#chd', draw);
  }

  Lab.ready(() => {
    labA();
    labB();
    labC();
    labD();
  });
})(typeof window !== 'undefined' ? window : globalThis);

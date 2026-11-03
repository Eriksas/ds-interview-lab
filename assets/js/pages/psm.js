/* 页面 11：倾向得分匹配 PSM */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;

  /* 3×3 线性方程组（高斯消元） */
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      [M[k], M[p]] = [M[p], M[k]];
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  const P = (Lab.sim.psm = {
    gen(n, b, r, tau) {
      tau = tau === undefined ? 1 : tau;
      const d = { x1: [], x2: [], t: [], y: [] };
      for (let i = 0; i < n; i++) {
        const x1 = r.normal(), x2 = 0.3 * x1 + Math.sqrt(0.91) * r.normal();
        const p = 1 / (1 + Math.exp(-(-1 + b * (x1 + 0.5 * x2))));
        const t = r.uniform() < p;
        d.x1.push(x1); d.x2.push(x2); d.t.push(t);
        d.y.push(2 + 1.5 * x1 + x2 + (t ? tau : 0) + r.normal());
      }
      return d;
    },
    /* 逻辑回归（牛顿法），返回每个人的 logit 倾向得分 */
    logitPs(d) {
      const n = d.t.length, X = d.x1.map((v, i) => [1, v, d.x2[i]]);
      let beta = [0, 0, 0];
      for (let it = 0; it < 30; it++) {
        const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          const eta = beta[0] + beta[1] * X[i][1] + beta[2] * X[i][2];
          const p = 1 / (1 + Math.exp(-eta)), w = p * (1 - p), res = (d.t[i] ? 1 : 0) - p;
          for (let a = 0; a < 3; a++) {
            g[a] += X[i][a] * res;
            for (let c = 0; c < 3; c++) H[a][c] += w * X[i][a] * X[i][c];
          }
        }
        const step = solve(H, g);
        beta = beta.map((v, a) => v + step[a]);
        if (Math.max(...step.map(Math.abs)) < 1e-10) break;
      }
      return X.map((x) => beta[0] + beta[1] * x[1] + beta[2] * x[2]);
    },
    match(lp, d, cal, repl, r) {
      const ti = [], ci = [];
      d.t.forEach((t, i) => (t ? ti : ci).push(i));
      const width = cal * Math.sqrt(S.variance(lp));
      const order = r.shuffle(ti.slice());
      const used = new Uint8Array(ci.length);
      const pairs = [];
      for (const i of order) {
        let best = -1, bd = Infinity;
        for (let k = 0; k < ci.length; k++) {
          if (!repl && used[k]) continue;
          const dd = Math.abs(lp[ci[k]] - lp[i]);
          if (dd < bd) { bd = dd; best = k; }
        }
        if (best < 0 || bd > width) continue;
        if (!repl) used[best] = 1;
        pairs.push([i, ci[best]]);
      }
      const att = pairs.length ? S.mean(pairs.map(([i, j]) => d.y[i] - d.y[j])) : NaN;
      return { att, pairs, nT: ti.length };
    },
    smd(x, t, pairs) {
      const xt = x.filter((v, i) => t[i]), xc = x.filter((v, i) => !t[i]);
      const sd = Math.sqrt((S.variance(xt) + S.variance(xc)) / 2);
      if (!pairs) return (S.mean(xt) - S.mean(xc)) / sd;
      return (S.mean(pairs.map((p) => x[p[0]])) - S.mean(pairs.map((p) => x[p[1]]))) / sd;
    },
    repeat(n, b, cal, reps, seed) {
      const r = Lab.rng(seed);
      const res = { naive: [], repl: [], norepl: [] };
      for (let k = 0; k < reps; k++) {
        const d = P.gen(n, b, r);
        const lp = P.logitPs(d);
        const yt = d.y.filter((v, i) => d.t[i]), yc = d.y.filter((v, i) => !d.t[i]);
        res.naive.push(S.mean(yt) - S.mean(yc));
        res.repl.push(P.match(lp, d, cal, true, r).att);
        res.norepl.push(P.match(lp, d, cal, false, r).att);
      }
      const sum = (a) => { const f = a.filter(Number.isFinite); return { bias: S.mean(f) - 1, sd: Math.sqrt(S.variance(f)) }; };
      return { naive: sum(res.naive), repl: sum(res.repl), norepl: sum(res.norepl), reps };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const N = 600;
  const calFmt = (v) => (v > 1 ? '不设卡钳' : v.toFixed(2) + ' × 标准差');
  const calVal = (v) => (v > 1 ? Infinity : v);

  function init() {
    let seed = 42;
    const ctl = Lab.controls('#c1', [
      { key: 'b', label: '选择强度（活跃的人更爱参加活动）', min: 0, max: 3, step: 0.25, value: 1.5, fmt: (v) => v.toFixed(2) },
      { key: 'cal', label: '卡钳（logit 倾向得分的标准差的倍数）', min: 0.05, max: 1.05, step: 0.05, value: 0.2, fmt: calFmt },
      { key: 'repl', label: '匹配方式', type: 'seg', full: true, value: 0, options: [{ v: 0, t: '无放回' }, { v: 1, t: '有放回' }] },
    ], Lab.throttle(draw));
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; ctl.reset(); Lab.$('#t2').innerHTML = ''; });
    Lab.$('#b2-rep').addEventListener('click', () => {
      const v = ctl.values;
      const btn = Lab.$('#b2-rep');
      btn.disabled = true;
      btn.textContent = '计算中…';
      setTimeout(() => {
        const r = P.repeat(N, v.b, calVal(v.cal), 200, seed + 101);
        const row = (k, o) => `<tr><td>${k}</td><td class="n">${o.bias >= 0 ? '+' : ''}${o.bias.toFixed(3)}</td><td class="n">${o.sd.toFixed(3)}</td></tr>`;
        Lab.$('#t2').innerHTML = `<p class="note small">选择强度 ${v.b.toFixed(2)}，${calFmt(v.cal)}，重复 ${r.reps} 次（真实效应 1）：</p>` +
          '<table class="tbl compact"><thead><tr><th>方法</th><th class="n">偏差</th><th class="n">标准差</th></tr></thead><tbody>' +
          row('不匹配，直接比', r.naive) + row('有放回匹配', r.repl) + row('无放回匹配', r.norepl) + '</tbody></table>';
        btn.disabled = false;
        btn.textContent = '重复 200 次，比较有放回和无放回';
      }, 30);
    });
    Lab.legend('#lg1', [
      { color: 'var(--s2)', label: '参加活动（处理组）' },
      { color: 'var(--s1)', label: '没参加（对照组）' },
      { color: 'var(--muted)', label: '浅色 = 没进入匹配样本' },
    ]);
    Lab.legend('#lg2', [{ color: 'var(--muted)', label: '匹配前' }, { color: 'var(--s3)', label: '匹配后' }]);

    function draw() {
      const v = ctl.values;
      const r = Lab.rng(seed);
      const d = P.gen(N, v.b, r);
      const lp = P.logitPs(d);
      const m = P.match(lp, d, calVal(v.cal), !!v.repl, r);
      const ps = lp.map((l) => 1 / (1 + Math.exp(-l)));
      const inT = new Set(m.pairs.map((p) => p[0])), inC = new Set(m.pairs.map((p) => p[1]));
      // 倾向得分重叠图
      const c = Lab.chart('#ch1', { height: 240, margin: { t: 26, r: 12, b: 46, l: 40 }, label: '倾向得分的重叠' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const bins = d3.range(0, 1.0001, 0.05);
      const hist = (idx) => {
        const h = bins.slice(0, -1).map(() => 0);
        idx.forEach((i) => h[Math.min(h.length - 1, Math.floor(ps[i] / 0.05))]++);
        return h;
      };
      const all = d.t.map((_, i) => i);
      const T1 = all.filter((i) => d.t[i]), C1 = all.filter((i) => !d.t[i]);
      const hT = hist(T1), hTm = hist(T1.filter((i) => inT.has(i))), hC = hist(C1), hCm = hist(C1.filter((i) => inC.has(i)));
      const ymax = Math.max(d3.max(hT), d3.max(hC)) * 1.1;
      const y = d3.scaleLinear([-ymax, ymax], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: '倾向得分（估计的参加概率）', yTitle: '人数（上：处理组，下：对照组）', yTicks: 4, yFmt: (t) => Math.abs(t) });
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--axis)');
      const bw = x(0.05) - x(0) - 1;
      bins.slice(0, -1).forEach((b0, k) => {
        const bx = x(b0) + 0.5;
        c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(hT[k])).attr('height', y(0) - y(hT[k])).style('fill', 'var(--s2)').style('opacity', 0.25);
        c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(hTm[k])).attr('height', y(0) - y(hTm[k])).style('fill', 'var(--s2)');
        c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(0)).attr('height', y(-hC[k]) - y(0)).style('fill', 'var(--s1)').style('opacity', 0.25);
        c.g.append('rect').attr('x', bx).attr('width', bw).attr('y', y(0)).attr('height', y(-hCm[k]) - y(0)).style('fill', 'var(--s1)');
      });
      // SMD 平衡图
      const vars = [['活跃度 X1', d.x1], ['历史消费 X2', d.x2], ['logit 倾向得分', lp]];
      const rows = vars.map(([k, xx]) => ({ k, before: Math.abs(P.smd(xx, d.t)), after: m.pairs.length ? Math.abs(P.smd(xx, d.t, m.pairs)) : NaN }));
      const c2 = Lab.chart('#ch2', { height: 150, margin: { t: 10, r: 16, b: 44, l: 104 }, label: '标准化均值差' });
      const x2 = d3.scaleLinear([0, Math.max(0.5, d3.max(rows, (o) => o.before) * 1.1)], [0, c2.w]).nice();
      const y2 = d3.scaleBand(rows.map((o) => o.k), [0, c2.h]).padding(0.4);
      Lab.axes(c2, x2, y2, { xTitle: '|SMD|（标准化均值差的绝对值）', grid: false, y: false, xTicks: 4 });
      c2.g.append('line').attr('x1', x2(0.1)).attr('x2', x2(0.1)).attr('y1', 0).attr('y2', c2.h).style('stroke', 'var(--text-2)').style('stroke-dasharray', '4 3');
      c2.g.append('text').attr('class', 'lbl-2').attr('x', x2(0.1) + 3).attr('y', -1).text('0.1');
      rows.forEach((o) => {
        const cy = y2(o.k) + y2.bandwidth() / 2;
        c2.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', cy + 4).attr('text-anchor', 'end').text(o.k);
        if (Number.isFinite(o.after)) c2.g.append('line').attr('x1', x2(o.after)).attr('x2', x2(o.before)).attr('y1', cy).attr('y2', cy).style('stroke', 'var(--border)').style('stroke-width', 2);
        c2.g.append('circle').attr('cx', x2(o.before)).attr('cy', cy).attr('r', 6).style('fill', 'var(--muted)');
        if (Number.isFinite(o.after)) c2.g.append('circle').attr('cx', x2(o.after)).attr('cy', cy).attr('r', 6).style('fill', 'var(--s3)');
      });
      const yt = d.y.filter((v2, i) => d.t[i]), yc = d.y.filter((v2, i) => !d.t[i]);
      Lab.$('#r1').innerHTML =
        Lab.stat('处理组匹配上', `${m.pairs.length} / ${m.nT}`) +
        Lab.stat('直接比（朴素差）', (S.mean(yt) - S.mean(yc)).toFixed(2), 'bad') +
        Lab.stat('匹配后的 ATT 估计', Number.isFinite(m.att) ? m.att.toFixed(2) : '—', 'hl') +
        Lab.stat('真实效应', '1.00');
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  Lab.ready(init);
})(typeof window !== 'undefined' ? window : globalThis);

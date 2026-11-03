/* 页面 15：偏差-方差与正则化 */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  const S = Lab.stats;
  const SIGMA = 0.3;
  const f = (x) => Math.sin(2 * Math.PI * x);
  const GRID = Array.from({ length: 100 }, (_, j) => (j + 0.5) / 100); // 区间中点网格
  const BETA = [3, 1.5, 0, 0, 2, 0, 0, 0];

  const B = (Lab.sim.biasvar = {
    SIGMA,
    BETA,
    /* 训练集：x 固定为 [0,1] 上等间隔的 n 个点，每次只有噪声不同 */
    genPoly(n, r) {
      const x = [], y = [];
      for (let i = 0; i < n; i++) { const xi = (i + 0.5) / n; x.push(xi); y.push(f(xi) + SIGMA * r.normal()); }
      return { x, y };
    },
    /* 测试集：x 在 [0,1] 上均匀随机 */
    genTest(n, r) {
      const x = [], y = [];
      for (let i = 0; i < n; i++) { const xi = r.uniform(); x.push(xi); y.push(f(xi) + SIGMA * r.normal()); }
      return { x, y };
    },
    /* 多项式最小二乘：先把 x 映射到 [−1,1]，用 Householder QR 求解 */
    fitPoly(x, y, deg) {
      const row = (xi) => { const u = 2 * xi - 1, r = [1]; for (let k = 1; k <= deg; k++) r.push(r[k - 1] * u); return r; };
      const beta = S.lstsq(x.map(row), y);
      return { beta, predict: (xi) => row(xi).reduce((s, v, k) => s + v * beta[k], 0) };
    },
    /* 重复 reps 份训练集：每个阶数的训练误差、测试误差、偏差²、方差 */
    curves(nTrain, maxDeg, reps, seed) {
      const r = Lab.rng(seed);
      const preds = Array.from({ length: maxDeg + 1 }, () => GRID.map(() => []));
      const tr = new Array(maxDeg + 1).fill(0), te = new Array(maxDeg + 1).fill(0);
      for (let k = 0; k < reps; k++) {
        const d = B.genPoly(nTrain, r), t = B.genTest(200, r);
        for (let deg = 1; deg <= maxDeg; deg++) {
          const m = B.fitPoly(d.x, d.y, deg);
          tr[deg] += S.mean(d.x.map((xi, i) => (m.predict(xi) - d.y[i]) ** 2));
          te[deg] += S.mean(t.x.map((xi, i) => (m.predict(xi) - t.y[i]) ** 2));
          GRID.forEach((g, j) => preds[deg][j].push(m.predict(g)));
        }
      }
      const out = [];
      for (let deg = 1; deg <= maxDeg; deg++) {
        const bias2 = S.mean(GRID.map((g, j) => (S.mean(preds[deg][j]) - f(g)) ** 2));
        const vari = S.mean(GRID.map((g, j) => S.variance(preds[deg][j], 0)));
        out.push({ deg, train: tr[deg] / reps, test: te[deg] / reps, bias2, vari });
      }
      return out;
    },
    /* 回归数据：8 个两两相关 0.5 的特征（标准化），真实系数 BETA，噪声标准差 1；y 已中心化 */
    genReg(n, r) {
      const p = BETA.length, X = [];
      for (let i = 0; i < n; i++) {
        const z = r.normal();
        X.push(Array.from({ length: p }, () => Math.SQRT1_2 * z + Math.SQRT1_2 * r.normal()));
      }
      for (let j = 0; j < p; j++) {
        const col = X.map((row) => row[j]), m = S.mean(col), sd = Math.sqrt(S.variance(col, 0));
        X.forEach((row) => (row[j] = (row[j] - m) / sd));
      }
      let y = X.map((row) => row.reduce((s, v, j) => s + v * BETA[j], 0) + r.normal());
      const my = S.mean(y);
      y = y.map((v) => v - my);
      return { X, y };
    },
    /* 岭回归：min (1/2n)‖y−Xβ‖² + (λ/2)‖β‖²，即 (XᵀX/n + λI)β = Xᵀy/n */
    ridge(X, y, lam) {
      const n = X.length, p = X[0].length;
      // 增广最小二乘：[X; √(nλ) I] β ≈ [y; 0]
      const A = X.map((r) => r.slice()), b = y.slice();
      for (let j = 0; j < p; j++) { const r = new Array(p).fill(0); r[j] = Math.sqrt(n * lam); A.push(r); b.push(0); }
      return S.lstsq(A, b);
    },
    /* Lasso：min (1/2n)‖y−Xβ‖² + λ‖β‖₁，坐标下降 */
    lasso(X, y, lam, init) {
      const n = X.length, p = X[0].length;
      const beta = init ? init.slice() : new Array(p).fill(0);
      const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0));
      const nrm = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j] * r[j], 0) / n);
      for (let it = 0; it < 5000; it++) {
        let maxd = 0;
        for (let j = 0; j < p; j++) {
          let rho = 0;
          for (let i = 0; i < n; i++) rho += X[i][j] * (res[i] + X[i][j] * beta[j]);
          rho /= n;
          const nb = Math.sign(rho) * Math.max(0, Math.abs(rho) - lam) / nrm[j];
          const dlt = nb - beta[j];
          if (dlt !== 0) { for (let i = 0; i < n; i++) res[i] -= X[i][j] * dlt; beta[j] = nb; }
          maxd = Math.max(maxd, Math.abs(dlt));
        }
        if (maxd < 1e-12) break;
      }
      return beta;
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  /* ================= 实验 1：多项式拟合 ================= */
  function lab1() {
    let seed = 42;
    const N = 20, MAXD = 12;
    let cache = null;
    const ctl = Lab.controls('#c1', [
      { key: 'deg', label: '多项式阶数（模型复杂度）', min: 1, max: MAXD, step: 1, value: 3, fmt: (v) => v + ' 阶', full: true },
    ], draw);
    Lab.$('#b1-again').addEventListener('click', () => { seed = Lab.newSeed(); cache = null; draw(); });
    Lab.$('#b1-reset').addEventListener('click', () => { seed = 42; cache = null; ctl.reset(); });
    Lab.legend('#lg1', [
      { color: 'var(--good)', label: '真实规律 sin(2πx)', dash: true },
      { color: 'var(--s2)', label: '拟合曲线', line: true },
      { color: 'var(--s1)', label: '20 个训练点（x 等间隔，y 带噪声）' },
    ]);
    Lab.legend('#lg2', [
      { color: 'var(--s1)', label: '训练误差', line: true },
      { color: 'var(--s2)', label: '测试误差', line: true },
      { color: 'var(--s4)', label: '偏差²', dash: true },
      { color: 'var(--s3)', label: '方差', dash: true },
    ]);
    function draw() {
      const deg = ctl.values.deg;
      const d = B.genPoly(N, Lab.rng(seed));
      const m = B.fitPoly(d.x, d.y, deg);
      const c = Lab.chart('#ch1', { height: 230, margin: { t: 26, r: 12, b: 46, l: 40 }, label: '多项式拟合' });
      const x = d3.scaleLinear([0, 1], [0, c.w]);
      const y = d3.scaleLinear([-2, 2], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: 'x', yTitle: 'y（模拟数据）', yTicks: 4 });
      c.g.append('path').attr('d', d3.line().x((g) => x(g)).y((g) => y(f(g)))(GRID)).style('fill', 'none').style('stroke', 'var(--good)').style('stroke-width', 2).style('stroke-dasharray', '6 4');
      const fine = Lab.linspace(0, 1, 300);
      c.g.append('path').attr('d', d3.line().x((g) => x(g)).y((g) => y(Lab.clamp(m.predict(g), -2.2, 2.2)))(fine)).style('fill', 'none').style('stroke', 'var(--s2)').style('stroke-width', 2.5);
      d.x.forEach((xi, i) => c.g.append('circle').attr('cx', x(xi)).attr('cy', y(d.y[i])).attr('r', 4).style('fill', 'var(--s1)').style('stroke', 'var(--surface)').style('stroke-width', 1.5));
      if (!cache) cache = B.curves(N, MAXD, 150, seed + 9);
      const cur = cache[deg - 1];
      const c2 = Lab.chart('#ch2', { height: 220, margin: { t: 26, r: 12, b: 46, l: 46 }, label: '误差随复杂度变化' });
      const x2 = d3.scaleLinear([1, MAXD], [0, c2.w]);
      const vals = cache.flatMap((o) => [o.train, o.test, o.bias2, o.vari]).filter((v) => v > 0);
      const y2 = d3.scaleLog([Math.max(1e-3, d3.min(vals)), Math.min(100, d3.max(vals))], [c2.h, 0]).nice();
      Lab.axes(c2, x2, y2, { xTitle: '多项式阶数', yTitle: '均方误差（对数刻度，150 份训练集平均）', xTicks: 6, yValues: [0.001, 0.01, 0.1, 1, 10, 100].filter((v) => v >= y2.domain()[0] && v <= y2.domain()[1]), yFmt: d3.format('~g') });
      const ln = (k, col, dash) => c2.g.append('path').attr('d', d3.line().x((o) => x2(o.deg)).y((o) => y2(Lab.clamp(o[k], y2.domain()[0], y2.domain()[1])))(cache)).style('fill', 'none').style('stroke', col).style('stroke-width', 2).style('stroke-dasharray', dash ? '5 4' : null);
      ln('bias2', 'var(--s4)', true); ln('vari', 'var(--s3)', true); ln('train', 'var(--s1)'); ln('test', 'var(--s2)');
      c2.g.append('line').attr('x1', x2(deg)).attr('x2', x2(deg)).attr('y1', 0).attr('y2', c2.h).style('stroke', 'var(--text)').style('stroke-dasharray', '2 3');
      c2.g.append('line').attr('x1', 0).attr('x2', c2.w).attr('y1', y2(SIGMA * SIGMA)).attr('y2', y2(SIGMA * SIGMA)).style('stroke', 'var(--muted)').style('stroke-dasharray', '1 3');
      c2.g.append('text').attr('class', 'lbl-2 halo').attr('x', 2).attr('y', y2(SIGMA * SIGMA) - 4).text('噪声 σ² = 0.09');
      const best = cache.reduce((a, o) => (o.test < a.test ? o : a));
      Lab.$('#r1').innerHTML =
        Lab.stat('这份数据的训练误差', S.mean(d.x.map((xi, i) => (m.predict(xi) - d.y[i]) ** 2)).toFixed(3)) +
        Lab.stat(`${deg} 阶：平均测试误差`, cur.test.toFixed(3), 'hl') +
        Lab.stat('偏差² / 方差', `${cur.bias2.toFixed(3)} / ${cur.vari.toFixed(3)}`) +
        Lab.stat('测试误差最小的阶数', best.deg + ' 阶');
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 实验 2：L1 和 L2 的系数路径 ================= */
  function lab2() {
    const data = B.genReg(100, Lab.rng(42));
    const lams = Lab.linspace(-3, 1, 61).map((e) => Math.pow(10, e));
    let w = null;
    const lassoPath = lams.slice().reverse().map((l) => (w = B.lasso(data.X, data.y, l, w))).reverse();
    const ridgePath = lams.map((l) => B.ridge(data.X, data.y, l));
    const ctl = Lab.controls('#c2', [
      { key: 'lg', label: '正则化强度 λ（对数刻度）', min: -3, max: 1, step: 0.05, value: -1, fmt: (v) => 'λ = ' + Math.pow(10, v).toPrecision(2), full: true },
    ], draw);
    Lab.$('#b2-reset').addEventListener('click', () => ctl.reset());
    const COLS = ['var(--s2)', 'var(--s1)', 'var(--muted)', 'var(--muted)', 'var(--s3)', 'var(--muted)', 'var(--muted)', 'var(--muted)'];
    Lab.legend('#lg3', [
      { color: 'var(--s2)', label: 'x1（真实 3）', line: true },
      { color: 'var(--s3)', label: 'x5（真实 2）', line: true },
      { color: 'var(--s1)', label: 'x2（真实 1.5）', line: true },
      { color: 'var(--muted)', label: '其余 5 个（真实 0）', line: true },
    ]);
    function panel(sel, title, path, lam) {
      const c = Lab.chart(sel, { height: 220, margin: { t: 26, r: 8, b: 46, l: 36 }, label: title });
      const x = d3.scaleLog([1e-3, 10], [0, c.w]);
      const y = d3.scaleLinear([-0.5, 3.3], [c.h, 0]);
      Lab.axes(c, x, y, { xTitle: 'λ（对数刻度）', yTitle: title, yTicks: 4, xValues: [0.001, 0.01, 0.1, 1, 10], xFmt: d3.format('~g') });
      c.g.append('line').attr('x1', 0).attr('x2', c.w).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--axis)');
      BETA.forEach((_, j) => c.g.append('path').attr('d', d3.line().x((b, k) => x(lams[k])).y((b) => y(b[j]))(path)).style('fill', 'none').style('stroke', COLS[j]).style('stroke-width', BETA[j] ? 2.2 : 1.2));
      c.g.append('line').attr('x1', x(lam)).attr('x2', x(lam)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--text)').style('stroke-dasharray', '3 3');
    }
    function draw() {
      const lam = Math.pow(10, ctl.values.lg);
      panel('#ch3', 'Lasso（L1）系数', lassoPath, lam);
      panel('#ch4', '岭回归（L2）系数', ridgePath, lam);
      const bl = B.lasso(data.X, data.y, lam), br = B.ridge(data.X, data.y, lam);
      const zeros = (b) => b.filter((v) => Math.abs(v) < 1e-10).length;
      Lab.$('#t2').innerHTML = '<table class="tbl compact"><thead><tr><th>特征</th><th class="n">真实</th><th class="n">Lasso</th><th class="n">岭回归</th></tr></thead><tbody>' +
        BETA.map((t, j) => `<tr><td>x${j + 1}</td><td class="n">${t}</td><td class="n ${Math.abs(bl[j]) < 1e-10 ? 'muted' : ''}">${Math.abs(bl[j]) < 1e-10 ? '0' : bl[j].toFixed(3)}</td><td class="n">${br[j].toFixed(3)}</td></tr>`).join('') + '</tbody></table>';
      Lab.$('#r2').innerHTML = Lab.stat('Lasso 恰好为 0 的系数', zeros(bl) + ' 个', 'hl') + Lab.stat('岭回归恰好为 0 的系数', zeros(br) + ' 个');
    }
    draw();
    Lab.watch('#ch3', draw);
  }

  Lab.ready(() => {
    lab1();
    lab2();
  });
})(typeof window !== 'undefined' ? window : globalThis);

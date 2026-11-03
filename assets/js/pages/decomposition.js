/* 页面 6：指标异动拆解 */
(function (G) {
  'use strict';
  const Lab = G.Lab;

  const D = (Lab.sim.decomposition = {
    NAMES: ['番剧', '影视', '纪录片'],
    BASE: { n: [40, 40, 20], r: [0.05, 0.03, 0.02] },
    CUR: { n: [40, 70, 20], r: [0.05, 0.028, 0.022] },
    /* 对称拆分（结构 = Δw·(r̄−R̄)，比率 = w̄·Δr）和基期权重拆分（结构、比率、交互） */
    decompose(base, cur) {
      const s1 = base.n.reduce((a, b) => a + b, 0), s2 = cur.n.reduce((a, b) => a + b, 0);
      const w1 = base.n.map((n) => n / s1), w2 = cur.n.map((n) => n / s2);
      const R1 = w1.reduce((s, w, i) => s + w * base.r[i], 0), R2 = w2.reduce((s, w, i) => s + w * cur.r[i], 0);
      const Rbar = (R1 + R2) / 2;
      const k = w1.length;
      const out = { w1, w2, R1, R2, mix: [], rate: [], mixB: [], rateB: [], interB: [] };
      for (let i = 0; i < k; i++) {
        const dw = w2[i] - w1[i], dr = cur.r[i] - base.r[i];
        out.mix.push(dw * ((base.r[i] + cur.r[i]) / 2 - Rbar));
        out.rate.push(((w1[i] + w2[i]) / 2) * dr);
        out.mixB.push(dw * base.r[i]);
        out.rateB.push(w1[i] * dr);
        out.interB.push(dw * dr);
      }
      return out;
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;
  const pp = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d === undefined ? 3 : d);

  function lab1() {
    const state = { base: JSON.parse(JSON.stringify(D.BASE)), cur: JSON.parse(JSON.stringify(D.CUR)) };
    let editing = 'cur';
    const specs = [{ key: 'which', label: '现在编辑', type: 'seg', full: true, value: 'cur', options: [{ v: 'base', t: '基期（上周）' }, { v: 'cur', t: '当期（本周）' }] },
      { key: 'how', label: '拆解方法', type: 'seg', full: true, value: 'sym', options: [{ v: 'sym', t: '对称拆分（无交互项）' }, { v: 'base', t: '基期权重 + 交互项' }] }];
    D.NAMES.forEach((nm, i) => {
      specs.push({ key: 'n' + i, label: `${nm}：观看用户（万人）`, min: 5, max: 100, step: 1, value: state.cur.n[i], fmt: (v) => v + ' 万' });
      specs.push({ key: 'r' + i, label: `${nm}：付费转化率`, min: 0.005, max: 0.08, step: 0.001, value: state.cur.r[i], fmt: (v) => F.pct(v, 1) });
    });
    const ctl = Lab.controls('#c1', specs, (v, key) => {
      if (key === 'which') {
        editing = v.which;
        const src = state[editing], o = {};
        D.NAMES.forEach((_, i) => { o['n' + i] = src.n[i]; o['r' + i] = src.r[i]; });
        ctl.set(o, true);
      } else if (key && /^[nr]\d$/.test(key)) {
        const i = +key[1];
        state[editing][key[0]][i] = v[key];
      }
      draw();
    });
    Lab.$('#b1-reset').addEventListener('click', () => {
      state.base = JSON.parse(JSON.stringify(D.BASE));
      state.cur = JSON.parse(JSON.stringify(D.CUR));
      editing = 'cur';
      ctl.reset();
    });
    Lab.legend('#lg1', [{ color: 'var(--s1)', label: '让总转化率上升' }, { color: 'var(--bad)', label: '让总转化率下降' }]);

    function draw() {
      const d = D.decompose(state.base, state.cur);
      const sym = ctl.values.how === 'sym';
      const rows = [];
      D.NAMES.forEach((nm, i) => {
        rows.push({ k: `${nm} · 结构`, v: sym ? d.mix[i] : d.mixB[i], kind: 'mix' });
        rows.push({ k: `${nm} · 比率`, v: sym ? d.rate[i] : d.rateB[i], kind: 'rate' });
        if (!sym) rows.push({ k: `${nm} · 交互`, v: d.interB[i], kind: 'inter' });
      });
      const sum = (a) => a.reduce((s, x) => s + x, 0);
      const tot = d.R2 - d.R1;
      const mixT = sum(sym ? d.mix : d.mixB), rateT = sum(sym ? d.rate : d.rateB), interT = sym ? 0 : sum(d.interB);
      Lab.$('#r1').innerHTML =
        Lab.stat('总付费转化率', `${F.pct(d.R1, 2)} → ${F.pct(d.R2, 2)}`) +
        Lab.stat('总变化（个百分点）', pp(tot), 'hl') +
        Lab.stat('结构变化合计', pp(mixT), mixT < 0 ? 'bad' : 'good') +
        Lab.stat('各自比率变化合计', pp(rateT), rateT < 0 ? 'bad' : 'good') +
        (sym ? '' : Lab.stat('交互项合计', pp(interT)));
      Lab.$('#t1').innerHTML =
        '<table class="tbl compact"><thead><tr><th>内容类型</th><th class="n">观看占比</th><th class="n">付费转化率</th></tr></thead><tbody>' +
        D.NAMES.map((nm, i) => `<tr><td>${nm}</td><td class="n">${F.pct(d.w1[i], 1)} → ${F.pct(d.w2[i], 1)}</td><td class="n">${F.pct(state.base.r[i], 1)} → ${F.pct(state.cur.r[i], 1)}</td></tr>`).join('') +
        `<tr class="on"><td>合计</td><td class="n">${state.base.n.reduce((a, b) => a + b)} → ${state.cur.n.reduce((a, b) => a + b)} 万人</td><td class="n">${F.pct(d.R1, 2)} → ${F.pct(d.R2, 2)}</td></tr></tbody></table>`;

      const c = Lab.chart('#ch1', { height: 30 + rows.length * 30 + 40, margin: { t: 14, r: 56, b: 40, l: 92 }, label: '各部分对总变化的贡献' });
      const ext = Math.max(0.0005, ...rows.map((r) => Math.abs(r.v)));
      const x = d3.scaleLinear([-ext, ext], [0, c.w]).nice();
      const y = d3.scaleBand(rows.map((r) => r.k), [0, c.h]).padding(0.25);
      Lab.axes(c, x, y, { xTitle: '对总转化率变化的贡献（个百分点）', grid: false, y: false, xTicks: 3, xFmt: (t) => (t * 100).toFixed(2) });
      c.g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', c.h).style('stroke', 'var(--axis)');
      rows.forEach((r) => {
        const yy = y(r.k);
        c.g.append('text').attr('class', 'lbl-2').attr('x', -8).attr('y', yy + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(r.k);
        const x0 = x(Math.min(0, r.v)), w = Math.abs(x(r.v) - x(0));
        c.g.append('rect').attr('x', x0).attr('width', Math.max(1, w)).attr('y', yy).attr('height', y.bandwidth()).attr('rx', 3)
          .style('fill', r.v < 0 ? 'var(--bad)' : 'var(--s1)').style('opacity', r.kind === 'rate' ? 0.95 : r.kind === 'mix' ? 0.6 : 0.35);
        c.g.append('text').attr('class', 'lbl').attr('x', c.w + 6).attr('y', yy + y.bandwidth() / 2 + 4)
          .attr('text-anchor', 'start').style('fill', r.v < 0 ? 'var(--bad-ink)' : 'var(--text)').text(pp(r.v));
      });
      const all = rows.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
      Lab.$('#sum1').innerHTML = Math.abs(tot) < 1e-6 ? '总转化率没有变化。' :
        `总转化率${tot < 0 ? '下降' : '上升'}了 ${Math.abs(tot * 100).toFixed(3)} 个百分点，其中<strong>结构变化</strong>贡献 ${pp(mixT)}，<strong>各自比率变化</strong>贡献 ${pp(rateT)}${sym ? '' : `，交互项 ${pp(interT)}`}。单项影响最大的是“${all.k}”（${pp(all.v)}）。`;
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 指标树 ================= */
  const TREE = [
    { name: 'OGV 播放时长', op: '= 观看用户数 × 人均播放时长', tip: '版权内容（番剧、影视等）的消费规模，常作为内容业务的北极星指标之一。', kids: [
      { name: '观看用户数', op: '= 新观看用户 + 留存观看用户 + 回流用户', tip: '先拆新老：新用户看拉新和站内导流，老用户看留存。', kids: [
        { name: '新观看用户', op: '= 入口曝光 × 点击率 × 起播率', tip: '看首页推荐、搜索、频道页等入口的曝光和点击，以及站外投放。' },
        { name: '留存观看用户', op: '', tip: '看追番 / 追剧（订阅）用户的到访，内容更新是否断档、有无热门内容完结。' },
        { name: '回流用户', op: '', tip: '看新内容上线、召回推送的触达和打开。' },
      ] },
      { name: '人均播放时长', op: '= 人均播放次数 × 每次播放时长', tip: '用户“看得多不多”。', kids: [
        { name: '人均播放次数', op: '= 人均曝光 × 点击率', tip: '看推荐位数量、封面标题、推荐策略是否改版。' },
        { name: '每次播放时长', op: '≈ 单集时长 × 完播率', tip: '看内容质量、片头片尾、广告、卡顿和清晰度等播放体验。' },
      ] },
    ] },
    { name: 'OGV 付费收入', op: '= 付费用户数 × 付费用户人均收入（ARPPU）', tip: '收入侧的拆解。', kids: [
      { name: '付费用户数', op: '= 观看用户数 × 付费转化率', tip: '', kids: [
        { name: '付费转化率', op: '= Σ 内容类型占比 × 各类型转化率', tip: '就是上面实验的拆法：先分清是“结构变化”还是“各自比率变化”。', kids: [
          { name: '番剧', op: '', tip: '看新番是否需要会员、会员抢先看的集数、更新节奏。' },
          { name: '影视', op: '', tip: '看热门剧集 / 电影是否需要会员；免费爆款会带来大量低付费意愿的观看用户，拉低总转化率。' },
          { name: '其他（纪录片、综艺等）', op: '', tip: '' },
        ] },
      ] },
      { name: '付费用户人均收入', op: '= 套餐单价 × 购买时长（套餐结构）', tip: '看连续包月、季卡、年卡的占比变化，以及折扣活动。' },
    ] },
  ];

  function tree() {
    const box = Lab.$('#tree');
    const render = (node, depth) => {
      const head = `<span class="tn-name">${node.name}</span>${node.op ? ` <span class="tn-op">${node.op}</span>` : ''}`;
      const tip = node.tip ? `<div class="tn-tip">${node.tip}</div>` : '';
      if (!node.kids) return `<div class="tn leaf">${head}${tip}</div>`;
      return `<details class="tn"${depth === 0 ? ' open' : ''}><summary>${head}</summary>${tip}<div class="tn-kids">${node.kids.map((k) => render(k, depth + 1)).join('')}</div></details>`;
    };
    box.innerHTML = TREE.map((n) => render(n, 0)).join('');
    Lab.$('#b-open').addEventListener('click', () => Lab.$$('details.tn', box).forEach((d) => (d.open = true)));
    Lab.$('#b-close').addEventListener('click', () => Lab.$$('details.tn', box).forEach((d) => (d.open = false)));
  }

  Lab.ready(() => {
    lab1();
    tree();
  });
})(typeof window !== 'undefined' ? window : globalThis);

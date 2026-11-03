/* 页面 7：推荐链路与排序指标 */
(function (G) {
  'use strict';
  const Lab = G.Lab;

  const R = (Lab.sim.recsys = {
    USERS: [
      { id: 'A', name: '用户 A（活跃）', base: 0.9, rel: [3, 1, 0, 2, 1, 0, 1, 0] },
      { id: 'B', name: '用户 B（一般）', base: 0.6, rel: [0, 2, 1, 0, 0, 1, 0, 0] },
      { id: 'C', name: '用户 C（不活跃）', base: 0.35, rel: [0, 0, 1, 0, 0, 0, 0, 0] },
    ],
    scores(n, base, ties) {
      const s = [];
      for (let j = 0; j < n; j++) s.push(j > 0 && ties && ties[j] ? s[j - 1] : base - 0.05 * j);
      return s;
    },
    pAtK: (rel, k) => rel.slice(0, k).filter((r) => r >= 1).length / k,
    rAtK(rel, k) {
      const tot = rel.filter((r) => r >= 1).length;
      return tot ? rel.slice(0, k).filter((r) => r >= 1).length / tot : 0;
    },
    ndcgAtK(rel, k) {
      const disc = (i) => 1 / Math.log2(i + 2);
      const gain = rel.map((r) => Math.pow(2, r) - 1);
      let dcg = 0, idcg = 0;
      const ideal = gain.slice().sort((a, b) => b - a);
      for (let i = 0; i < Math.min(k, rel.length); i++) {
        dcg += gain[i] * disc(i);
        idcg += ideal[i] * disc(i);
      }
      return idcg > 0 ? dcg / idcg : 0;
    },
    /* 正负样本对：分数高的正样本记 1，并列记 0.5 */
    auc(y, s) {
      let pos = 0, neg = 0, win = 0;
      for (let i = 0; i < y.length; i++) {
        if (y[i]) pos++;
        else neg++;
      }
      if (!pos || !neg) return NaN;
      for (let i = 0; i < y.length; i++) {
        if (!y[i]) continue;
        for (let j = 0; j < y.length; j++) {
          if (y[j]) continue;
          if (s[i] > s[j]) win += 1;
          else if (s[i] === s[j]) win += 0.5;
        }
      }
      return win / (pos * neg);
    },
    /* users: [{rel, base, ties}] → 每个用户的 AUC、GAUC、全局 AUC */
    gauc(users) {
      const per = [], ys = [], ss = [];
      users.forEach((u) => {
        const s = R.scores(u.rel.length, u.base, u.ties);
        const y = u.rel.map((r) => (r >= 1 ? 1 : 0));
        per.push({ auc: R.auc(y, s), pos: y.filter(Boolean).length, n: y.length });
        ys.push(...y);
        ss.push(...s);
      });
      const valid = per.filter((p) => Number.isFinite(p.auc));
      const wavg = (key) => valid.reduce((a, p) => a + p.auc * (key === 'n' ? p.n : p.pos), 0) / valid.reduce((a, p) => a + (key === 'n' ? p.n : p.pos), 0);
      return { per, gaucImp: wavg('n'), gaucClk: wavg('pos'), global: R.auc(ys, ss) };
    },
    funnelCost(recallOut, coarseOut, cCoarse, cFine) {
      const withC = recallOut * cCoarse + coarseOut * cFine;
      const without = recallOut * cFine;
      return { withC, without, ratio: without / withC };
    },
  });

  if (typeof document === 'undefined') return;
  const F = Lab.fmt;

  /* ================= 实验 1：推荐漏斗 ================= */
  const STAGES = [
    { name: '内容库', n: 1e7, fixed: true, model: '—', job: '所有可以推荐的视频，规模在百万到上亿条。', metric: '—' },
    { name: '召回', key: 'recall', model: '多路召回并行：协同过滤（看过 A 的人也爱看 B，相似度来自共同行为）、向量召回（把用户和视频都变成向量，用近似最近邻检索找最近的）、热门与新内容、关注和订阅、内容标签相似。各路结果合并去重。',
      job: '从海量内容里快速捞出几千条“可能感兴趣”的，宁可多捞，不能漏掉好内容。模型简单、速度快。', metric: '召回率（真正感兴趣的被捞到多少）、覆盖率' },
    { name: '粗排', key: 'coarse', model: '轻量模型，常用双塔：用户塔和视频塔分别算向量，视频向量可以提前算好存起来，线上只需算一次内积，所以很便宜。',
      job: '在昂贵的精排之前，用很低的成本把几千条砍到几百条。', metric: '和精排排序的一致性、召回率' },
    { name: '精排', n: 100, fixed: true, model: '复杂的深度模型，特征最全（用户、视频、上下文、交叉特征），同时预估点击、完播、点赞、追番、付费等多个目标，再融合成一个排序分。',
      job: '把候选排准，是效果提升的主战场。', metric: '离线看 AUC / GAUC、logloss；线上看 AB 实验的点击率、时长等' },
    { name: '重排', n: 20, fixed: true, model: '规则 + 列表级模型：多样性打散（同类视频不扎堆）、去重、频控、新鲜度、运营位。常见做法是生成少量候选序列再用模型打分选最好的，不会枚举所有排列。',
      job: '让整屏列表的整体体验最好，而不只是每条单独最好。', metric: '列表多样性、整屏点击和时长' },
  ];

  function lab1() {
    let sel = 1;
    const ctl = Lab.controls('#c1', [
      { key: 'recall', label: '召回输出多少条', min: 1000, max: 20000, scale: 'log', value: 5000, round: (v) => Math.round(v / 100) * 100, fmt: F.int },
      { key: 'coarse', label: '粗排输出多少条', min: 100, max: 2000, scale: 'log', value: 500, round: (v) => Math.round(v / 10) * 10, fmt: F.int },
    ], draw);
    Lab.$('#b1-reset').addEventListener('click', () => { sel = 1; ctl.reset(); });
    const chips = Lab.$('#chips1');
    chips.innerHTML = STAGES.map((s, i) => `<button type="button" data-i="${i}">${s.name}</button>`).join('');
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sel = +b.dataset.i;
      draw();
    });
    function draw() {
      const v = ctl.values;
      const ns = STAGES.map((s) => (s.key ? v[s.key] : s.n));
      const c = Lab.chart('#ch1', { height: 34 * STAGES.length + 20, margin: { t: 8, r: 8, b: 12, l: 8 }, label: '推荐漏斗' });
      const w = d3.scaleLinear([0, 7.2], [0, c.w - 10]);
      const rowH = (c.h - 4) / STAGES.length;
      STAGES.forEach((s, i) => {
        const bw = Math.max(70, w(Math.log10(ns[i]) + 0.2));
        const g = c.g.append('g').style('cursor', 'pointer').on('click', () => { sel = i; draw(); });
        g.append('rect').attr('x', (c.w - bw) / 2).attr('y', i * rowH + 2).attr('width', bw).attr('height', rowH - 6).attr('rx', 6)
          .style('fill', i === sel ? 'var(--s2)' : 'var(--s1)').style('opacity', i === sel ? 1 : 0.35 + 0.12 * i);
        g.append('text').attr('class', 'lbl').attr('x', c.w / 2).attr('y', i * rowH + rowH / 2 + 2).attr('text-anchor', 'middle')
          .style('fill', '#fff').text(`${s.name} · ${ns[i] >= 1e6 ? '千万级' : F.int(ns[i]) + ' 条'}`);
      });
      chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === sel)));
      const s = STAGES[sel];
      Lab.$('#d1').innerHTML = `<p><strong>${s.name}</strong>：${s.job}</p><p class="note"><strong>模型：</strong>${s.model}</p><p class="note"><strong>常看的指标：</strong>${s.metric}</p>`;
      const cost = R.funnelCost(v.recall, v.coarse, 1, 50);
      Lab.$('#r1').innerHTML =
        Lab.stat('有粗排时的打分成本（相对）', F.int(cost.withC)) +
        Lab.stat('跳过粗排、精排直接打分召回结果', F.int(cost.without)) +
        Lab.stat('跳过粗排的成本是', cost.ratio.toFixed(1) + ' 倍', 'hl');
    }
    draw();
    Lab.watch('#ch1', draw);
  }

  /* ================= 实验 2：排序指标实验室 ================= */
  const TITLES = {
    A: ['新番 · 第 3 集', '国创 · 第 8 集', '综艺 · 第 2 期', '纪录片 · 美食', '番剧 · 完结篇', '电影 · 喜剧', '电视剧 · 第 10 集', '番剧 · 第 1 集'],
    B: ['电影 · 动作', '纪录片 · 自然', '番剧 · 第 5 集', '综艺 · 第 6 期', '电视剧 · 第 1 集', '国创 · 第 2 集', '电影 · 爱情', '番剧 · 第 12 集'],
    C: ['综艺 · 第 1 期', '电影 · 悬疑', '番剧 · 第 7 集', '电视剧 · 第 3 集', '纪录片 · 历史', '国创 · 第 1 集', '电影 · 动画', '番剧 · 第 2 集'],
  };
  const GRADE = ['无感', '点击', '看完', '追更'];

  function lab2() {
    const fresh = () => R.USERS.map((u) => ({ ...u, items: u.rel.map((r, i) => ({ id: u.id + i, title: TITLES[u.id][i].replace(/\s+/g, ''), rel: r, tie: false })) }));
    let users = fresh();
    let cur = 0;
    const ctl = Lab.controls('#c2', [
      { key: 'user', label: '编辑哪个用户的列表', type: 'seg', full: true, value: 0, options: R.USERS.map((u, i) => ({ v: i, t: u.name })) },
      { key: 'k', label: '只看前 K 条', min: 1, max: 8, step: 1, value: 3, fmt: (v) => 'K = ' + v, full: true },
    ], (v) => { cur = v.user; draw(); });
    Lab.$('#b2-reset').addEventListener('click', () => { users = fresh(); cur = 0; ctl.reset(); });
    const list = Lab.$('#list2');
    const ROW_H = 52;

    function toModel(u) {
      return { rel: u.items.map((it) => it.rel), base: u.base, ties: u.items.map((it, j) => j > 0 && it.tie) };
    }
    function draw() {
      const u = users[cur], k = ctl.values.k;
      const m = toModel(u);
      const sc = R.scores(m.rel.length, m.base, m.ties);
      list.innerHTML = u.items.map((it, j) =>
        `<div class="rk-row${j < k ? ' topk' : ''}" data-j="${j}">` +
        `<span class="rk-handle" title="按住拖动" aria-label="拖动排序">≡</span>` +
        `<span class="rk-pos">${j + 1}</span>` +
        `<span class="rk-title">${it.title}<small>分数 ${sc[j].toFixed(2)}</small></span>` +
        `<button type="button" class="rk-grade g${it.rel}" data-act="grade" aria-label="相关度">${it.rel} ${GRADE[it.rel]}</button>` +
        `<button type="button" class="rk-tie" data-act="tie" aria-pressed="${it.tie && j > 0}" ${j === 0 ? 'disabled' : ''} title="和上一条分数相同">=上</button>` +
        `<span class="rk-move"><button type="button" data-act="up" aria-label="上移" ${j === 0 ? 'disabled' : ''}>↑</button><button type="button" data-act="down" aria-label="下移" ${j === u.items.length - 1 ? 'disabled' : ''}>↓</button></span>` +
        `</div>`).join('') + `<div class="rk-cut" style="top:${k * ROW_H - 1}px"><span>前 ${k} 条</span></div>`;
      const rel = m.rel, y = rel.map((r) => (r >= 1 ? 1 : 0));
      Lab.$('#r2').innerHTML =
        Lab.stat(`P@${k} 精确率`, R.pAtK(rel, k).toFixed(3)) +
        Lab.stat(`R@${k} 召回率`, R.rAtK(rel, k).toFixed(3)) +
        Lab.stat(`NDCG@${k}`, R.ndcgAtK(rel, k).toFixed(3), 'hl') +
        Lab.stat('AUC（这个用户）', Number.isFinite(R.auc(y, sc)) ? R.auc(y, sc).toFixed(3) : '无法计算');
      const g = R.gauc(users.map(toModel));
      Lab.$('#t2').innerHTML =
        '<table class="tbl compact"><thead><tr><th>用户</th><th class="n">相关 / 共</th><th class="n">AUC</th></tr></thead><tbody>' +
        g.per.map((p, i) => `<tr class="${i === cur ? 'on' : ''}"><td>${R.USERS[i].name}</td><td class="n">${p.pos} / ${p.n}</td><td class="n">${Number.isFinite(p.auc) ? p.auc.toFixed(3) : '剔除'}</td></tr>`).join('') +
        `</tbody></table>`;
      Lab.$('#r2b').innerHTML =
        Lab.stat('GAUC（按曝光加权）', g.gaucImp.toFixed(3), 'hl') +
        Lab.stat('GAUC（按点击加权）', g.gaucClk.toFixed(3)) +
        Lab.stat('全局 AUC（所有用户混在一起）', g.global.toFixed(3));
    }

    list.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const j = +b.closest('.rk-row').dataset.j;
      const items = users[cur].items;
      const act = b.dataset.act;
      if (act === 'grade') items[j].rel = (items[j].rel + 1) % 4;
      else if (act === 'tie') items[j].tie = !items[j].tie;
      else if (act === 'up' && j > 0) [items[j - 1], items[j]] = [items[j], items[j - 1]];
      else if (act === 'down' && j < items.length - 1) [items[j + 1], items[j]] = [items[j], items[j + 1]];
      draw();
    });

    // 按住 ≡ 拖动排序（鼠标和手指都可以）
    let drag = null;
    list.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.rk-handle');
      if (!h) return;
      e.preventDefault();
      drag = { j: +h.closest('.rk-row').dataset.j, y0: e.clientY, id: e.pointerId };
      list.setPointerCapture(e.pointerId);
      list.classList.add('dragging');
      const row = list.querySelector(`.rk-row[data-j="${drag.j}"]`);
      if (row) row.classList.add('lift');
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const items = users[cur].items;
      const target = Lab.clamp(drag.j + Math.round((e.clientY - drag.y0) / ROW_H), 0, items.length - 1);
      if (target !== drag.j) {
        const [it] = items.splice(drag.j, 1);
        items.splice(target, 0, it);
        drag.y0 += (target - drag.j) * ROW_H;
        drag.j = target;
        draw();
        const row = list.querySelector(`.rk-row[data-j="${drag.j}"]`);
        if (row) row.classList.add('lift');
      }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      list.classList.remove('dragging');
      draw();
    };
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
    draw();
  }

  Lab.ready(() => {
    lab1();
    lab2();
  });
})(typeof window !== 'undefined' ? window : globalThis);

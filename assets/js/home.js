/* 首页：知识地图 */
(function () {
  'use strict';
  const Lab = window.Lab;
  const FREQ = { 3: '高', 2: '中', 1: '低' };
  Lab.ready(() => {
    const map = Lab.$('#map');
    const pages = Lab.PAGES;
    const studyable = pages.filter((p) => p.group !== 'review');

    function progress() {
      const ready = studyable.filter((p) => p.ready);
      const done = ready.filter((p) => Lab.learned.is(p.id)).length;
      Lab.$('#prog-text').textContent = `已学会 ${done} / ${ready.length} 个已上线的页面` + (ready.length < studyable.length ? `（共 ${studyable.length} 个，其余建设中）` : '');
      Lab.$('#prog-bar').style.width = ready.length ? (100 * done) / ready.length + '%' : '0';
    }

    function card(p) {
      const done = Lab.learned.is(p.id);
      const box = Lab.el('article', { class: 'topic' + (p.ready ? '' : ' soon') + (done && p.ready ? ' done' : '') });
      const stars = p.freq ? `<span class="freq" aria-label="面试频率${FREQ[p.freq]}">${'★'.repeat(p.freq)}<span class="off">${'★'.repeat(3 - p.freq)}</span></span> 面试频率${FREQ[p.freq]}` : '';
      box.innerHTML =
        `<a class="t" href="pages/${p.id}.html">${p.title}</a>` +
        `<div class="d">${p.desc}</div>` +
        `<div class="meta">${stars ? `<span>${stars}</span>` : ''}<span>约 ${p.minutes} 分钟</span>${p.ready ? '' : '<span class="badge">建设中</span>'}</div>`;
      if (p.ready && p.group !== 'review') {
        const lab = Lab.el('label', { class: 'chk' });
        const cb = Lab.el('input', { type: 'checkbox' });
        cb.checked = done;
        cb.addEventListener('change', () => {
          Lab.learned.set(p.id, cb.checked);
          box.classList.toggle('done', cb.checked);
          progress();
        });
        lab.append(cb, '已学会');
        box.querySelector('.meta').append(lab);
      }
      return box;
    }

    Lab.GROUPS.forEach((g) => {
      const list = pages.filter((p) => p.group === g.id);
      if (!list.length) return;
      const h = Lab.el('h2', { class: 'group-title' }, Lab.el('span', { class: 'gdot', style: `background:${g.color}` }), g.title);
      const grid = Lab.el('div', { class: 'cards' });
      list.forEach((p) => grid.append(card(p)));
      map.append(h, grid);
    });
    const review = pages.filter((p) => p.group === 'review');
    if (review.length) {
      const h = Lab.el('h2', { class: 'group-title' }, Lab.el('span', { class: 'gdot', style: 'background:var(--good)' }), '总复习');
      const grid = Lab.el('div', { class: 'cards' });
      review.forEach((p) => grid.append(card(p)));
      map.append(h, grid);
    }
    progress();
  });
})();

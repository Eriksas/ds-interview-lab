/* 页面 16：闪卡总复习（题目来自 quiz.js） */
(function (G) {
  'use strict';
  const Lab = G.Lab;
  if (typeof document === 'undefined') return;

  Lab.ready(() => {
    const pages = Lab.PAGES.filter((p) => Lab.QUIZ[p.id]);
    const all = [];
    pages.forEach((p) => Lab.QUIZ[p.id].forEach((q, i) => all.push({ key: p.id + ':' + i, page: p, q: q.q, a: q.a })));
    const marks = () => { const m = Lab.store.get('dsil.cards', {}); return m && typeof m === 'object' ? m : {}; };
    let group = 'all', onlyUnknown = false, deck = [], pos = 0, shown = false;

    const chips = Lab.$('#fc-groups');
    const groups = [{ id: 'all', title: '全部' }].concat(Lab.GROUPS.filter((g) => pages.some((p) => p.group === g.id)));
    chips.innerHTML = groups.map((g) => `<button type="button" data-g="${g.id}">${g.title}</button>`).join('');
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      group = b.dataset.g;
      build();
    });
    const only = Lab.$('#fc-only');
    only.addEventListener('change', () => { onlyUnknown = only.checked; build(); });

    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function build() {
      const m = marks();
      deck = shuffle(all.filter((c) => (group === 'all' || c.page.group === group) && (!onlyUnknown || m[c.key] !== 1)));
      pos = 0;
      shown = false;
      chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === group)));
      render();
    }
    function render() {
      const m = marks();
      const pool = all.filter((c) => group === 'all' || c.page.group === group);
      const known = pool.filter((c) => m[c.key] === 1).length;
      Lab.$('#fc-stat').textContent = `这一组共 ${pool.length} 张，已会 ${known} 张` + (deck.length ? `；第 ${pos + 1} / ${deck.length} 张` : '');
      const box = Lab.$('#fc-card');
      if (!deck.length) {
        box.innerHTML = `<div class="flash"><p class="q">这一组没有需要复习的卡片了 🎉</p><p class="note">取消“只看还不会的”，或者换一组。</p></div>`;
        Lab.$('#fc-ctl').classList.add('hide');
        return;
      }
      Lab.$('#fc-ctl').classList.remove('hide');
      const c = deck[pos];
      const st = m[c.key] === 1 ? '<span class="badge good-ink">已会</span>' : m[c.key] === 0 ? '<span class="badge bad-ink">还不会</span>' : '';
      box.innerHTML = `<div class="flash"><div class="src">来自：<a href="${c.page.id}.html">${c.page.title}</a> ${st}</div><div class="q">${c.q}</div>` +
        (shown ? `<div class="a">${c.a}</div>` : '') + '</div>';
      Lab.$('#fc-show').classList.toggle('hide', shown);
      Lab.$('#fc-yes').classList.toggle('hide', !shown);
      Lab.$('#fc-no').classList.toggle('hide', !shown);
      Lab.$('#fc-prev').disabled = pos === 0;
    }
    function mark(v) {
      const m = marks();
      m[deck[pos].key] = v;
      Lab.store.set('dsil.cards', m);
      next();
    }
    function next() {
      if (pos < deck.length - 1) { pos++; shown = false; render(); }
      else { shown = false; render(); Lab.$('#fc-stat').textContent += '（已经是最后一张，可以点“重新洗牌”）'; }
    }
    Lab.$('#fc-show').addEventListener('click', () => { shown = true; render(); });
    Lab.$('#fc-yes').addEventListener('click', () => mark(1));
    Lab.$('#fc-no').addEventListener('click', () => mark(0));
    Lab.$('#fc-next').addEventListener('click', next);
    Lab.$('#fc-prev').addEventListener('click', () => { if (pos > 0) { pos--; shown = false; render(); } });
    Lab.$('#fc-shuffle').addEventListener('click', build);
    Lab.$('#fc-clear').addEventListener('click', () => { Lab.store.set('dsil.cards', {}); build(); });
    build();
  });
})(typeof window !== 'undefined' ? window : globalThis);

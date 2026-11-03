/* DS 面试实验室 · 公共代码
 * 纯计算部分（随机数、统计函数）在浏览器和 Node 里都能跑；
 * DOM 部分只在浏览器里执行。 */
(function (G) {
  'use strict';
  const Lab = (G.Lab = G.Lab || {});
  Lab.sim = Lab.sim || {};
  const HAS_DOM = typeof document !== 'undefined';

  /* ================= 随机数（mulberry32，可复现） ================= */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  Lab.rng = function (seed) {
    const s = seed === undefined ? 42 : seed;
    const u = mulberry32(s);
    let spare = null;
    const r = {
      seed: s,
      uniform: u,
      normal(mu, sd) {
        mu = mu || 0;
        sd = sd === undefined ? 1 : sd;
        if (spare !== null) {
          const z = spare;
          spare = null;
          return mu + sd * z;
        }
        let u1 = 0;
        while (u1 <= 1e-300) u1 = u();
        const u2 = u();
        const rad = Math.sqrt(-2 * Math.log(u1));
        spare = rad * Math.sin(2 * Math.PI * u2);
        return mu + sd * rad * Math.cos(2 * Math.PI * u2);
      },
      int(n) {
        return Math.floor(u() * n);
      },
      bernoulli(p) {
        return u() < p ? 1 : 0;
      },
      exponential(rate) {
        return -Math.log(1 - u()) / (rate || 1);
      },
      lognormal(mu, sigma) {
        return Math.exp(r.normal(mu, sigma));
      },
      /* 二项分布：np 小时用几何等待时间精确抽样，np 大时用正态近似 */
      binomial(n, p) {
        if (p <= 0) return 0;
        if (p >= 1) return n;
        const flip = p > 0.5;
        const q = flip ? 1 - p : p;
        let k;
        if (n * q < 40) {
          const lq = Math.log(1 - q);
          k = 0;
          let pos = 0;
          for (;;) {
            pos += Math.floor(Math.log(1 - u()) / lq) + 1;
            if (pos > n) break;
            k++;
          }
        } else {
          k = Math.round(n * q + Math.sqrt(n * q * (1 - q)) * r.normal());
          k = Math.max(0, Math.min(n, k));
        }
        return flip ? n - k : k;
      },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(u() * (i + 1));
          const t = arr[i];
          arr[i] = arr[j];
          arr[j] = t;
        }
        return arr;
      },
    };
    return r;
  };
  /* "再模拟一次"用的新种子 */
  Lab.newSeed = function () {
    return Math.floor(Math.random() * 1e9) + 1;
  };

  /* ================= 统计函数 ================= */
  function erfc(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.5 * z);
    const r =
      t *
      Math.exp(
        -z * z - 1.26551223 +
          t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
          t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
      );
    return x >= 0 ? r : 2 - r;
  }
  const SQRT2PI = Math.sqrt(2 * Math.PI);
  const normPdf = (x, mu, sd) => {
    mu = mu || 0;
    sd = sd || 1;
    const z = (x - mu) / sd;
    return Math.exp(-0.5 * z * z) / (SQRT2PI * sd);
  };
  const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);
  function normPpf(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    let x;
    if (p < pl) {
      const q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= 1 - pl) {
      const q = p - 0.5;
      const r = q * q;
      x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    // 一步 Halley 修正
    const e = 0.5 * erfc(-x / Math.SQRT2) - p;
    const uu = e * SQRT2PI * Math.exp((x * x) / 2);
    return x - uu / (1 + (x * uu) / 2);
  }
  function logGamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    const tmp0 = x + 5.5;
    const tmp = tmp0 - (x + 0.5) * Math.log(tmp0);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  function tCdf(t, df) {
    const x = df / (df + t * t);
    const tail = 0.5 * betaInc(df / 2, 0.5, x);
    return t >= 0 ? 1 - tail : tail;
  }
  function tPpf(p, df) {
    if (df > 1e6) return normPpf(p);
    let lo = -1e3, hi = 1e3;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const sum = (a) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s;
  };
  const mean = (a) => sum(a) / a.length;
  function variance(a, ddof) {
    ddof = ddof === undefined ? 1 : ddof;
    const m = mean(a);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return s / (a.length - ddof);
  }
  function cov(a, b, ddof) {
    ddof = ddof === undefined ? 1 : ddof;
    const ma = mean(a), mb = mean(b);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (a.length - ddof);
  }
  const corr = (a, b) => cov(a, b) / Math.sqrt(variance(a) * variance(b));
  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  /* 最小二乘：Householder QR，X 为行数组，返回系数 */
  function lstsq(X, y) {
    const n = X.length, p = X[0].length;
    const A = X.map((r) => r.slice());
    const b = y.slice();
    for (let k = 0; k < p; k++) {
      let norm = 0;
      for (let i = k; i < n; i++) norm += A[i][k] * A[i][k];
      norm = Math.sqrt(norm);
      if (norm === 0) continue;
      const alpha = A[k][k] > 0 ? -norm : norm;
      const v = new Array(n).fill(0);
      for (let i = k; i < n; i++) v[i] = A[i][k];
      v[k] -= alpha;
      let vv = 0;
      for (let i = k; i < n; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      for (let j = k; j < p; j++) {
        let s = 0;
        for (let i = k; i < n; i++) s += v[i] * A[i][j];
        s = (2 * s) / vv;
        for (let i = k; i < n; i++) A[i][j] -= s * v[i];
      }
      let s = 0;
      for (let i = k; i < n; i++) s += v[i] * b[i];
      s = (2 * s) / vv;
      for (let i = k; i < n; i++) b[i] -= s * v[i];
    }
    const beta = new Array(p).fill(0);
    for (let k = p - 1; k >= 0; k--) {
      let s = b[k];
      for (let j = k + 1; j < p; j++) s -= A[k][j] * beta[j];
      beta[k] = Math.abs(A[k][k]) < 1e-12 ? 0 : s / A[k][k];
    }
    return beta;
  }
  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  Lab.stats = { erfc, normPdf, normCdf, normPpf, logGamma, betaInc, tCdf, tPpf, sum, mean, variance, cov, corr, quantile, lstsq };
  Lab.linspace = linspace;
  Lab.clamp = clamp;

  /* ================= 格式化 ================= */
  const fixed = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  Lab.fmt = {
    pct: (x, d) => (Number.isFinite(x) ? (x * 100).toFixed(d === undefined ? 1 : d) + '%' : '—'),
    pp: (x, d) => (Number.isFinite(x) ? (x * 100).toFixed(d === undefined ? 2 : d) + ' 个百分点' : '—'),
    num: (x, d) => (Number.isFinite(x) ? x.toLocaleString('zh-CN', { maximumFractionDigits: d === undefined ? 2 : d, minimumFractionDigits: d === undefined ? 0 : d }) : '—'),
    int: (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('zh-CN') : '—'),
    fixed,
    p: (p) => (!Number.isFinite(p) ? '—' : p < 0.0001 ? '<0.0001' : p.toFixed(4)),
  };

  /* ================= 本地存储（读不到也不报错） ================= */
  Lab.store = {
    get(k, fallback) {
      try {
        const v = G.localStorage.getItem(k);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(k, v) {
      try {
        G.localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
  Lab.learned = {
    all() {
      const v = Lab.store.get('dsil.learned', {});
      return v && typeof v === 'object' ? v : {};
    },
    is(id) {
      return !!Lab.learned.all()[id];
    },
    set(id, on) {
      const all = Lab.learned.all();
      if (on) all[id] = 1;
      else delete all[id];
      return Lab.store.set('dsil.learned', all);
    },
  };

  if (!HAS_DOM) return;

  /* ================= DOM 工具 ================= */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (attrs[k] === undefined || attrs[k] === null || attrs[k] === false) continue;
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
      }
    kids.flat().forEach((k) => {
      if (k === null || k === undefined || k === false) return;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    });
    return e;
  }
  Lab.el = el;
  Lab.$ = (s, r) => (r || document).querySelector(s);
  Lab.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  /* defer 脚本执行时 readyState 已经是 interactive，但后面的脚本还没加载，所以要等 DOMContentLoaded */
  let domReady = document.readyState === 'complete';
  const queue = [];
  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    queue.splice(0).forEach((f) => f());
  });
  Lab.ready = (fn) => (domReady ? fn() : queue.push(fn));

  /* ---------- 控件 ----------
   * spec: {key,label,min,max,step,value,fmt,scale:'log',round}  滑块
   *       {key,label,type:'seg',options:[{v,t}],value}           分段按钮 */
  let uid = 0;
  Lab.controls = function (root, specs, onChange) {
    if (typeof root === 'string') root = Lab.$(root);
    root.classList.add('controls');
    const values = {}, defaults = {}, ui = {};
    const fire = (key) => onChange && onChange(values, key);
    function show(key) {
      const u = ui[key], s = u.spec, v = values[key];
      if (s.type === 'seg') {
        u.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
      } else {
        const txt = s.fmt ? s.fmt(v) : String(v);
        u.out.textContent = txt;
        u.inp.setAttribute('aria-valuetext', txt);
        if (s.scale === 'log') {
          const t = (Math.log(v) - Math.log(s.min)) / (Math.log(s.max) - Math.log(s.min));
          u.inp.value = String(Math.round(clamp(t, 0, 1) * 1000));
        } else u.inp.value = String(v);
      }
    }
    specs.forEach((s) => {
      defaults[s.key] = s.value;
      values[s.key] = s.value;
      const id = 'ctl' + ++uid;
      const wrap = el('div', { class: 'ctrl' + (s.type === 'seg' ? ' ctrl-seg' : '') });
      if (s.full) wrap.style.gridColumn = '1 / -1';
      const top = el('div', { class: 'ctrl-top' });
      if (s.type === 'seg') {
        top.append(el('span', null, s.label));
        const seg = el('div', { class: 'seg', role: 'group', 'aria-label': s.label });
        s.options.forEach((o) => {
          const b = el('button', { type: 'button', 'aria-pressed': 'false' }, o.t);
          b.dataset.v = String(o.v);
          b.addEventListener('click', () => {
            values[s.key] = o.v;
            show(s.key);
            fire(s.key);
          });
          seg.append(b);
        });
        wrap.append(top, seg);
        ui[s.key] = { spec: s, seg };
      } else {
        const out = el('output', { for: id });
        top.append(el('label', { for: id }, s.label), out);
        const inp =
          s.scale === 'log'
            ? el('input', { type: 'range', id, min: 0, max: 1000, step: 1 })
            : el('input', { type: 'range', id, min: s.min, max: s.max, step: s.step || 'any' });
        inp.addEventListener('input', () => {
          let v;
          if (s.scale === 'log') {
            const t = +inp.value / 1000;
            v = Math.exp(Math.log(s.min) + t * (Math.log(s.max) - Math.log(s.min)));
          } else v = +inp.value;
          if (s.round) v = s.round(v);
          values[s.key] = v;
          const txt = s.fmt ? s.fmt(v) : String(v);
          out.textContent = txt;
          inp.setAttribute('aria-valuetext', txt);
          fire(s.key);
        });
        wrap.append(top, inp);
        ui[s.key] = { spec: s, out, inp };
      }
      if (s.hint) wrap.append(el('div', { class: 'note small' }, s.hint));
      root.append(wrap);
      show(s.key);
    });
    return {
      values,
      defaults,
      set(obj, silent) {
        for (const k in obj) if (k in ui) {
          values[k] = obj[k];
          show(k);
        }
        if (!silent) fire(Object.keys(obj)[0]);
      },
      reset() {
        for (const k in defaults) {
          values[k] = defaults[k];
          show(k);
        }
        fire(null);
      },
      ui,
    };
  };

  /* ---------- 读数卡片 ---------- */
  Lab.stat = (k, v, cls) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  /* ---------- 图表 ---------- */
  Lab.chart = function (container, opt) {
    if (typeof container === 'string') container = Lab.$(container);
    opt = opt || {};
    const m = Object.assign({ t: 26, r: 14, b: 44, l: 50 }, opt.margin || {});
    const W = Math.max(260, container.clientWidth || 340);
    const H = typeof opt.height === 'function' ? opt.height(W) : opt.height || 240;
    d3.select(container).selectAll('svg').remove();
    const svg = d3
      .select(container)
      .insert('svg', ':first-child')
      .attr('width', W)
      .attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', opt.label || '');
    const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
    return { svg, g, W, H, w: W - m.l - m.r, h: H - m.t - m.b, m, el: container };
  };
  Lab.axes = function (c, x, y, o) {
    o = o || {};
    const g = c.g;
    if (o.grid !== false) {
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(o.yTicks || 5).tickSize(-c.w).tickFormat(''));
    }
    const xa = d3.axisBottom(x).ticks(o.xTicks || Math.max(3, Math.floor(c.w / 70)));
    if (o.xFmt) xa.tickFormat(o.xFmt);
    if (o.xValues) xa.tickValues(o.xValues);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${c.h})`).call(xa);
    if (o.y !== false) {
      const ya = d3.axisLeft(y).ticks(o.yTicks || 5);
      if (o.yFmt) ya.tickFormat(o.yFmt);
      g.append('g').attr('class', 'axis').call(ya);
    }
    if (o.xTitle)
      g.append('text').attr('class', 'axis-title').attr('x', c.w / 2).attr('y', c.h + 36).attr('text-anchor', 'middle').text(o.xTitle);
    if (o.yTitle)
      g.append('text').attr('class', 'axis-title').attr('x', -c.m.l + 4).attr('y', -12).attr('text-anchor', 'start').text(o.yTitle);
  };
  Lab.legend = function (container, items) {
    if (typeof container === 'string') container = Lab.$(container);
    container.className = 'legend';
    container.innerHTML = items
      .map((it) => {
        const st = it.dash ? `border-color:${it.color}` : `background:${it.color}`;
        return `<span><span class="sw ${it.line ? 'line' : ''} ${it.dash ? 'dash' : ''}" style="${st}"></span>${it.label}</span>`;
      })
      .join('');
  };
  Lab.tip = function (container) {
    let t = container.querySelector(':scope > .tooltip');
    if (!t) {
      t = el('div', { class: 'tooltip', role: 'status' });
      container.append(t);
    }
    return {
      show(html, x, y) {
        t.innerHTML = html;
        t.classList.add('on');
        const cw = container.clientWidth;
        const tw = t.offsetWidth;
        let left = x + 12;
        if (left + tw > cw) left = Math.max(0, x - tw - 12);
        t.style.left = left + 'px';
        t.style.top = Math.max(0, y - 10) + 'px';
      },
      hide() {
        t.classList.remove('on');
      },
    };
  };
  /* 容器宽度变化时重画 */
  Lab.watch = function (elm, fn) {
    if (typeof elm === 'string') elm = Lab.$(elm);
    let last = elm.clientWidth, raf = 0;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', () => fn());
      return;
    }
    new ResizeObserver(() => {
      const w = elm.clientWidth;
      if (Math.abs(w - last) < 2) return;
      last = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fn());
    }).observe(elm);
  };

  /* ---------- 公式 ---------- */
  Lab.tex = function (root) {
    if (typeof katex === 'undefined') return;
    Lab.$$('.tex, .texd', root).forEach((e) => {
      if (e.dataset.done) return;
      const src = e.dataset.tex || e.textContent;
      try {
        katex.render(src, e, { displayMode: e.classList.contains('texd'), throwOnError: false, strict: false });
        e.dataset.done = '1';
      } catch (err) {
        /* 渲染失败就保留原文 */
      }
    });
  };

  /* ---------- 主题 ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '◐ 跟随系统', light: '☀ 浅色', dark: '☾ 深色' };
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function themeButton() {
    let cur = Lab.store.get('dsil.theme', 'auto');
    if (THEMES.indexOf(cur) < 0) cur = 'auto';
    const b = el('button', { class: 'icon-btn', type: 'button', 'aria-label': '切换配色' }, THEME_LABEL[cur]);
    b.addEventListener('click', () => {
      cur = THEMES[(THEMES.indexOf(cur) + 1) % 3];
      applyTheme(cur);
      Lab.store.set('dsil.theme', cur);
      b.textContent = THEME_LABEL[cur];
    });
    return b;
  }

  /* ---------- 页面框架：页眉、页脚、自测题 ---------- */
  const REPO = 'https://github.com/Eriksas/ds-interview-lab';
  Lab.REPO = REPO;
  function frame() {
    const body = document.body;
    const id = body.dataset.page;
    const isHome = id === 'home';
    const root = isHome ? './' : '../';
    const pages = Lab.PAGES || [];
    const me = pages.find((p) => p.id === id);
    const bar = el(
      'header',
      { class: 'topbar' },
      el(
        'div',
        { class: 'topbar-in' },
        el('a', { class: 'brand', href: root + 'index.html' }, el('span', { class: 'dot' }), 'DS 面试实验室'),
        el('span', { class: 'crumb' }, me && !isHome ? '/ ' + me.title : ''),
        themeButton()
      )
    );
    body.prepend(bar);
    if (isHome || !me) return;

    // 自测题
    const quizBox = Lab.$('#quiz-list');
    const qs = (Lab.QUIZ || {})[id];
    if (quizBox && qs) {
      quizBox.className = 'quiz-list';
      quizBox.innerHTML = qs
        .map((q, i) => `<details><summary>Q${i + 1}. ${q.q}</summary><div class="ans">${q.a}</div></details>`)
        .join('');
    }

    // 页脚：已学会、上一页 / 下一页、数字来源
    const main = Lab.$('main');
    const ready = pages.filter((p) => p.ready);
    const idx = ready.findIndex((p) => p.id === id);
    const prev = ready[idx - 1], next = ready[idx + 1];
    const learnedBtn = el('button', { class: 'btn', type: 'button' });
    const paint = () => {
      const on = Lab.learned.is(id);
      learnedBtn.textContent = on ? '✓ 已学会（点击取消）' : '标记为已学会';
      learnedBtn.classList.toggle('primary', on);
    };
    learnedBtn.addEventListener('click', () => {
      Lab.learned.set(id, !Lab.learned.is(id));
      paint();
    });
    paint();
    const foot = el('section', { class: 'card' });
    foot.append(
      el('div', { class: 'learned-row' },
        el('span', { class: 'note' }, '学完了？'),
        learnedBtn
      )
    );
    if (me.verify) {
      foot.append(
        el('p', { class: 'note small', html: `本页写死的结论性数字来自 <a href="${REPO}/blob/main/verify/${me.verify}_output.txt" target="_blank" rel="noopener">verify/${me.verify}_output.txt</a>（Python，seed 42）。标“模拟”的都是随机生成的演示数据，不是真实业务数据。` })
      );
    }
    main.append(foot);
    const pager = el('nav', { class: 'pager', 'aria-label': '翻页' });
    pager.append(prev ? el('a', { href: prev.id + '.html' }, el('small', null, '← 上一页'), prev.title) : el('span'));
    pager.append(next ? el('a', { class: 'next', href: next.id + '.html' }, el('small', null, '下一页 →'), next.title) : el('a', { class: 'next', href: root + 'index.html' }, el('small', null, '回到'), '知识地图'));
    main.append(pager);
  }

  Lab.ready(() => {
    frame();
    Lab.tex(document);
  });
})(typeof window !== 'undefined' ? window : globalThis);

// Floating classroom tools for the touch panel: timer, random picker, spotlight,
// screen curtain, ruler, protractor, calculator and quiz. Every widget is draggable.
(function () {
  const layer = () => document.getElementById('widgets');
  const open = {};

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /** Makes `handle` drag `target` (pointer events, works with fingers and pens). */
  function draggable(target, handle, onMove) {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button,input,textarea,select,.no-drag')) return;
      e.preventDefault(); e.stopPropagation();
      const r = target.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const mv = ev => {
        const x = Math.max(-r.width + 60, Math.min(innerWidth - 60, ev.clientX - dx));
        const y = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy));
        target.style.left = x + 'px'; target.style.top = y + 'px';
        onMove && onMove(x, y);
      };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  /** Standard card widget with title bar + close. */
  function card(id, title, body, { w = 360, x, y } = {}) {
    if (open[id]) { open[id].remove(); delete open[id]; }
    const c = el('div', 'widget card');
    c.style.width = w + 'px';
    c.style.left = (x != null ? x : (innerWidth - w) / 2) + 'px';
    c.style.top = (y != null ? y : 90) + 'px';
    const head = el('div', 'w-head', `<span>${title}</span>`);
    const close = el('button', 'w-close', '✕');
    close.onclick = () => { c.dispatchEvent(new Event('close')); c.remove(); delete open[id]; };
    head.appendChild(close);
    c.append(head, body);
    draggable(c, head);
    layer().appendChild(c);
    open[id] = c;
    c.addEventListener('pointerdown', () => { c.style.zIndex = ++card.z; });
    c.style.zIndex = ++card.z;
    return c;
  }
  card.z = 10;

  function beep(times = 3) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        const t = ac.currentTime + i * 0.45;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.start(t); o.stop(t + 0.4);
      }
    } catch (_) {}
  }

  // ---------------- Timer & stopwatch ----------------
  function timer(seconds) {
    const b = el('div', 'timer', `
      <div class="seg no-drag"><button data-m="down" class="on">Countdown</button><button data-m="up">Stopwatch</button></div>
      <div class="t-display">05:00</div>
      <div class="t-presets no-drag">${[1, 2, 3, 5, 10, 15].map(m => `<button data-p="${m * 60}">${m}m</button>`).join('')}</div>
      <div class="t-adjust no-drag"><button data-a="-60">−1m</button><button data-a="-10">−10s</button><button data-a="10">+10s</button><button data-a="60">+1m</button></div>
      <div class="t-ctrl no-drag"><button class="primary" data-c="go">Start</button><button data-c="reset">Reset</button></div>`);
    const c = card('timer', '⏱ Timer', b, { w: 380, x: innerWidth - 420, y: 80 });
    const disp = b.querySelector('.t-display'), go = b.querySelector('[data-c=go]');
    let mode = 'down', total = seconds || 300, left = total, iv = null, t0 = 0, base = 0;
    const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
    const show = () => { disp.textContent = fmt(mode === 'down' ? left : base); disp.classList.toggle('warn', mode === 'down' && left <= 10 && left > 0); };
    const stop = () => { clearInterval(iv); iv = null; go.textContent = 'Start'; };
    const start = () => {
      if (mode === 'down' && left <= 0) left = total;
      t0 = Date.now(); const startLeft = left, startBase = base;
      iv = setInterval(() => {
        const el = (Date.now() - t0) / 1000;
        if (mode === 'down') {
          left = startLeft - el;
          if (left <= 0) { left = 0; stop(); show(); disp.classList.add('done'); beep(); setTimeout(() => disp.classList.remove('done'), 4000); return; }
        } else base = startBase + el;
        show();
      }, 200);
      go.textContent = 'Pause';
    };
    b.addEventListener('click', e => {
      const t = e.target;
      if (t.dataset.m) { stop(); mode = t.dataset.m; b.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === t)); base = 0; left = total; b.querySelector('.t-presets').style.display = b.querySelector('.t-adjust').style.display = mode === 'down' ? '' : 'none'; show(); }
      if (t.dataset.p) { stop(); total = left = +t.dataset.p; show(); }
      if (t.dataset.a) { total = left = Math.max(5, left + +t.dataset.a); if (iv) { stop(); start(); } show(); }
      if (t.dataset.c === 'go') iv ? stop() : start();
      if (t.dataset.c === 'reset') { stop(); left = total; base = 0; show(); }
    });
    c.addEventListener('close', stop);
    show();
    if (seconds) start();
  }

  // ---------------- Random student picker ----------------
  function picker() {
    let saved = '';
    try { saved = localStorage.getItem('bh.names') || ''; } catch (_) {}
    const b = el('div', 'picker', `
      <div class="p-result">?</div>
      <textarea class="no-drag" rows="4" placeholder="Student names, one per line — or leave empty to pick a roll number">${saved}</textarea>
      <div class="row no-drag"><label>Roll no. 1 to <input type="number" min="2" max="200" value="40" class="p-max"></label>
      <label><input type="checkbox" class="p-remove"> Don't repeat</label></div>
      <div class="row no-drag"><button class="primary p-go">🎲 Pick</button><button class="p-say">🔊 Say</button></div>`);
    card('picker', '🎲 Random Picker', b, { w: 400, x: 40, y: 80 });
    const res = b.querySelector('.p-result'), ta = b.querySelector('textarea');
    let used = new Set();
    ta.addEventListener('input', () => { try { localStorage.setItem('bh.names', ta.value); } catch (_) {} used.clear(); });
    b.querySelector('.p-go').onclick = () => {
      let pool = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!pool.length) pool = Array.from({ length: +b.querySelector('.p-max').value || 40 }, (_, i) => String(i + 1));
      const noRep = b.querySelector('.p-remove').checked;
      let choices = noRep ? pool.filter(p => !used.has(p)) : pool;
      if (!choices.length) { used.clear(); choices = pool; }
      let n = 0;
      const spin = setInterval(() => {
        res.textContent = choices[Math.floor(Math.random() * choices.length)];
        if (++n > 16) {
          clearInterval(spin);
          const pick = choices[Math.floor(Math.random() * choices.length)];
          res.textContent = pick; used.add(pick);
          res.classList.remove('pop'); void res.offsetWidth; res.classList.add('pop');
        }
      }, 70);
    };
    b.querySelector('.p-say').onclick = () => window.Teacher && Teacher.say(res.textContent);
  }

  // ---------------- Spotlight ----------------
  function spotlight() {
    if (open.spot) { open.spot.remove(); delete open.spot; return; }
    const s = el('div', 'spotlight');
    const hole = el('div', 'spot-hole');
    const ctr = el('div', 'spot-ctrl', '<button data-r="-40">−</button><button data-r="40">+</button><button data-x>✕</button>');
    s.append(hole, ctr);
    let r = 180, cx = innerWidth / 2, cy = innerHeight / 2;
    const upd = () => {
      s.style.background = `radial-gradient(circle ${r}px at ${cx}px ${cy}px, transparent 0, transparent ${r - 2}px, rgba(0,0,0,.88) ${r}px)`;
      Object.assign(hole.style, { left: cx - r + 'px', top: cy - r + 'px', width: r * 2 + 'px', height: r * 2 + 'px' });
      Object.assign(ctr.style, { left: cx - 70 + 'px', top: Math.min(innerHeight - 60, cy + r + 12) + 'px' });
    };
    hole.style.touchAction = 'none';
    hole.addEventListener('pointerdown', e => {
      e.preventDefault(); hole.setPointerCapture(e.pointerId);
      const ox = e.clientX - cx, oy = e.clientY - cy;
      const mv = ev => { cx = ev.clientX - ox; cy = ev.clientY - oy; upd(); };
      hole.addEventListener('pointermove', mv);
      hole.addEventListener('pointerup', () => hole.removeEventListener('pointermove', mv), { once: true });
    });
    ctr.addEventListener('click', e => {
      if (e.target.dataset.r) { r = Math.max(60, Math.min(600, r + +e.target.dataset.r)); upd(); }
      if (e.target.hasAttribute('data-x')) { s.remove(); delete open.spot; }
    });
    layer().appendChild(s); open.spot = s; upd();
  }

  // ---------------- Screen curtain (reveal step by step) ----------------
  function curtain() {
    if (open.curtain) { open.curtain.remove(); delete open.curtain; return; }
    const c = el('div', 'curtain', '<div class="c-handle">⇕ Drag to reveal <button class="no-drag">✕</button></div>');
    const h = c.querySelector('.c-handle');
    let top = 0;
    h.querySelector('button').onclick = () => { c.remove(); delete open.curtain; };
    h.style.touchAction = 'none';
    h.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      const sy = e.clientY, st = top;
      const mv = ev => { top = Math.max(0, Math.min(innerHeight - 70, st + ev.clientY - sy)); c.style.top = top + 'px'; };
      h.addEventListener('pointermove', mv);
      h.addEventListener('pointerup', () => h.removeEventListener('pointermove', mv), { once: true });
    });
    layer().appendChild(c); open.curtain = c;
  }

  // ---------------- Geometry: ruler & protractor ----------------
  function rotatable(kind, svg, w, h) {
    if (open[kind]) { open[kind].remove(); delete open[kind]; return; }
    const g = el('div', 'geo ' + kind);
    g.style.width = w + 'px'; g.style.height = h + 'px';
    g.style.left = (innerWidth - w) / 2 + 'px'; g.style.top = innerHeight / 2 - h / 2 + 'px';
    g.innerHTML = svg;
    const ctr = el('div', 'geo-ctrl no-drag', '<button data-d="-15">⟲</button><span class="ang">0°</span><button data-d="15">⟳</button><button data-x>✕</button>');
    g.appendChild(ctr);
    let ang = 0;
    ctr.addEventListener('click', e => {
      if (e.target.dataset.d) { ang = (ang + +e.target.dataset.d + 360) % 360; g.style.transform = `rotate(${ang}deg)`; ctr.querySelector('.ang').textContent = ang + '°'; }
      if (e.target.hasAttribute('data-x')) { g.remove(); delete open[kind]; }
    });
    draggable(g, g);
    layer().appendChild(g); open[kind] = g;
  }

  function ruler() {
    const cm = 38; // px per "cm" on screen (visual teaching ruler)
    const n = Math.min(30, Math.floor((innerWidth * 0.8) / cm));
    const w = n * cm + 40, h = 96;
    let ticks = '';
    for (let i = 0; i <= n * 10; i++) {
      const x = 20 + i * cm / 10, len = i % 10 === 0 ? 34 : i % 5 === 0 ? 24 : 14;
      ticks += `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#1e293b" stroke-width="${i % 10 ? 1 : 2}"/>`;
      if (i % 10 === 0) ticks += `<text x="${x}" y="54" font-size="16" text-anchor="middle" fill="#1e293b">${i / 10}</text>`;
    }
    rotatable('ruler', `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="rgba(254,240,138,.82)" stroke="#a16207" stroke-width="2"/>${ticks}<text x="${w - 16}" y="${h - 14}" font-size="13" text-anchor="end" fill="#78350f">cm</text></svg>`, w, h);
  }

  function protractor() {
    const R = 260, w = R * 2 + 20, h = R + 30, cx = w / 2, cy = R + 10;
    let s = `<path d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z" fill="rgba(191,219,254,.75)" stroke="#1e40af" stroke-width="2"/>`;
    for (let a = 0; a <= 180; a++) {
      const rad = Math.PI - a * Math.PI / 180, len = a % 10 === 0 ? 26 : a % 5 === 0 ? 17 : 9;
      const x1 = cx + R * Math.cos(rad), y1 = cy - R * Math.sin(rad), x2 = cx + (R - len) * Math.cos(rad), y2 = cy - (R - len) * Math.sin(rad);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1e3a8a" stroke-width="${a % 10 ? 1 : 2}"/>`;
      if (a % 10 === 0) {
        const tx = cx + (R - 44) * Math.cos(rad), ty = cy - (R - 44) * Math.sin(rad);
        s += `<text x="${tx}" y="${ty + 5}" font-size="14" text-anchor="middle" fill="#1e3a8a">${a}</text>`;
        const ix = cx + (R - 70) * Math.cos(rad), iy = cy - (R - 70) * Math.sin(rad);
        s += `<text x="${ix}" y="${iy + 4}" font-size="11" text-anchor="middle" fill="#64748b">${180 - a}</text>`;
      }
    }
    s += `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#1e40af" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="5" fill="#dc2626"/>`;
    rotatable('protractor', `<svg width="${w}" height="${h}">${s}</svg>`, w, h);
  }

  // ---------------- Calculator ----------------
  function calculator() {
    const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '%', '=', '√', 'x²', '⌫', 'π'];
    const b = el('div', 'calc', `<div class="c-screen"><div class="c-expr"></div><div class="c-out">0</div></div>
      <div class="c-keys no-drag">${keys.map(k => `<button data-k="${k}" class="${'÷×−+='.includes(k) ? 'op' : ''}">${k}</button>`).join('')}</div>`);
    card('calc', '🧮 Calculator', b, { w: 340, x: innerWidth - 380, y: 120 });
    let expr = '';
    const ex = b.querySelector('.c-expr'), out = b.querySelector('.c-out');
    const evaluate = (s) => {
      const js = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, '(' + Math.PI + ')')
        .replace(/√\(?([0-9.]+)\)?/g, 'Math.sqrt($1)').replace(/([0-9.)]+)²/g, '($1)**2').replace(/([0-9.]+)%/g, '($1/100)');
      if (!/^[0-9+\-*/().\sMathsqrtPI*e]*$/.test(js)) throw new Error('bad');
      const v = Function('"use strict";return (' + js + ')')();
      if (!isFinite(v)) throw new Error('bad');
      return +parseFloat(v.toPrecision(12));
    };
    b.querySelector('.c-keys').addEventListener('click', e => {
      const k = e.target.dataset.k; if (!k) return;
      if (k === 'C') expr = '';
      else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') { try { const v = evaluate(expr); ex.textContent = expr + ' ='; expr = String(v); out.textContent = v; return; } catch (_) { out.textContent = 'Error'; return; } }
      else if (k === 'x²') expr += '²';
      else expr += k;
      ex.textContent = expr;
      try { out.textContent = expr ? evaluate(expr) : 0; } catch (_) {}
    });
  }

  // ---------------- Quiz (from AI teacher) ----------------
  function quiz(questions, { lang, onDone } = {}) {
    if (!Array.isArray(questions) || !questions.length) return;
    const info = window.langInfo ? langInfo(lang) : {};
    const b = el('div', 'quiz');
    if (info.rtl) b.dir = 'rtl';
    const c = card('quiz', '📝 Quiz', b, { w: Math.min(760, innerWidth - 40), y: 70 });
    let i = 0, score = 0;
    const render = () => {
      delete b.dataset.answered;
      if (i >= questions.length) {
        b.innerHTML = `<div class="q-final">🎉 ${score} / ${questions.length}</div><div class="row no-drag"><button class="primary q-again">Try again</button></div>`;
        b.querySelector('.q-again').onclick = () => { i = 0; score = 0; render(); };
        onDone && onDone(score, questions.length);
        return;
      }
      const q = questions[i];
      const opts = Array.isArray(q.options) ? q.options : [];
      b.innerHTML = `<div class="q-meta">${i + 1} / ${questions.length}</div><div class="q-q"></div>
        <div class="q-opts no-drag">${opts.map((o, j) => `<button data-j="${j}"><b>${'ABCD'[j] || j + 1}</b><span></span></button>`).join('')}</div>
        <div class="q-explain"></div><div class="row no-drag"><button class="q-read">🔊 Read</button><button class="primary q-next" style="display:none">Next ›</button></div>`;
      b.querySelector('.q-q').textContent = q.q || q.question || '';
      b.querySelectorAll('.q-opts span').forEach((s, j) => { s.textContent = opts[j]; });
      const ans = Number(q.answer);
      b.querySelector('.q-read').onclick = () => Teacher && Teacher.say((q.q || q.question) + '. ' + opts.map((o, j) => ('ABCD'[j] || '') + '. ' + o).join('. '));
      b.querySelectorAll('.q-opts button').forEach(btn => btn.onclick = () => {
        if (b.dataset.answered) return; b.dataset.answered = '1';
        const j = +btn.dataset.j;
        btn.classList.add(j === ans ? 'right' : 'wrong');
        b.querySelector(`[data-j="${ans}"]`)?.classList.add('right');
        if (j === ans) score++;
        const ex = b.querySelector('.q-explain');
        ex.textContent = (j === ans ? '✅ ' : '❌ ') + (q.explain || '');
        b.querySelector('.q-next').style.display = '';
        if (q.explain && window.Teacher) Teacher.say(q.explain);
      });
      b.querySelector('.q-next').onclick = () => { i++; render(); };
    };
    render();
    return c;
  }

  function closeAll() { Object.keys(open).forEach(k => { open[k].remove(); delete open[k]; }); }

  window.Widgets = { timer, picker, spotlight, curtain, ruler, protractor, calculator, quiz, card, draggable, closeAll, open };
})();

// Bhumika Smart Board — multi-page vector whiteboard tuned for interactive flat panels.
// Pages live in a fixed 1920x1080 "world" that is letter-boxed to the screen, so content
// never shifts when the panel is rotated or the window resizes.
(function () {
  const W = 1920, H = 1080;
  const FONT = "'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Nastaliq Urdu', system-ui, sans-serif";

  const BACKGROUNDS = {
    white: { label: 'White', fill: '#ffffff' },
    cream: { label: 'Paper', fill: '#fdf8ec' },
    grid: { label: 'Grid', fill: '#ffffff', pattern: 'grid' },
    graph: { label: 'Graph', fill: '#ffffff', pattern: 'graph' },
    ruled: { label: 'Ruled', fill: '#ffffff', pattern: 'ruled' },
    fourline: { label: '4-Line', fill: '#ffffff', pattern: 'fourline' },
    dots: { label: 'Dots', fill: '#ffffff', pattern: 'dots' },
    chalk: { label: 'Chalkboard', fill: '#1f3d2b', dark: true },
    black: { label: 'Black', fill: '#0f172a', dark: true },
    chalkgrid: { label: 'Chalk grid', fill: '#1f3d2b', dark: true, pattern: 'grid' }
  };

  const SIZES = {
    pen: [2.5, 5, 9, 16],
    hl: [18, 28, 42, 64],
    eraser: [24, 48, 84, 130],
    shape: [3, 5, 9, 14],
    text: [30, 42, 58, 84]
  };

  const newPage = (bg = 'white') => ({ bg, objs: [], undo: [], redo: [], cy: 70, bgImg: null });

  class Board {
    constructor(stage) {
      this.stage = stage;
      this.bgC = this._canvas('bg');
      this.inkC = this._canvas('ink');
      this.liveC = this._canvas('live');
      this.bgX = this.bgC.getContext('2d');
      this.inkX = this.inkC.getContext('2d');
      this.liveX = this.liveC.getContext('2d');
      this.measureX = document.createElement('canvas').getContext('2d');

      this.pages = [newPage()];
      this.pi = 0;
      this.tool = 'pen';
      this.shape = 'line';
      this.color = '#111827';
      this.sizeIdx = 1;
      this.palmErase = true;
      this.active = new Map();
      this.imgCache = {};
      this.listeners = {};
      this.anims = [];

      this._bindInput();
      new ResizeObserver(() => this.resize()).observe(stage);
      this.resize();
    }

    // ---------- events for the UI ----------
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, d) { (this.listeners[ev] || []).forEach(f => f(d)); }

    _canvas(cls) {
      const c = document.createElement('canvas');
      c.className = 'layer ' + cls;
      this.stage.appendChild(c);
      return c;
    }

    get page() { return this.pages[this.pi]; }
    get dark() { return !!BACKGROUNDS[this.page.bg].dark; }
    get backgrounds() { return BACKGROUNDS; }

    // ---------- geometry ----------
    resize() {
      const r = this.stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cw = r.width; this.ch = r.height;
      for (const c of [this.bgC, this.inkC, this.liveC]) {
        c.width = Math.round(r.width * this.dpr);
        c.height = Math.round(r.height * this.dpr);
        c.style.width = r.width + 'px';
        c.style.height = r.height + 'px';
      }
      this.scale = Math.min(r.width / W, r.height / H);
      this.ox = (r.width - W * this.scale) / 2;
      this.oy = (r.height - H * this.scale) / 2;
      this.render();
    }

    toWorld(e) {
      const r = this.liveC.getBoundingClientRect();
      return [(e.clientX - r.left - this.ox) / this.scale, (e.clientY - r.top - this.oy) / this.scale];
    }
    toScreen(x, y) {
      const r = this.liveC.getBoundingClientRect();
      return [r.left + this.ox + x * this.scale, r.top + this.oy + y * this.scale];
    }
    _setT(ctx) {
      const k = this.dpr * this.scale;
      ctx.setTransform(k, 0, 0, k, this.dpr * this.ox, this.dpr * this.oy);
    }

    // ---------- rendering ----------
    render() { this.renderBg(); this.renderInk(); this.renderLive(); }

    renderBg() {
      const x = this.bgX;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = '#cbd5e1';
      x.fillRect(0, 0, this.bgC.width, this.bgC.height);
      this._setT(x);
      this.paintBg(x, this.page);
    }

    paintBg(x, page) {
      const bg = BACKGROUNDS[page.bg] || BACKGROUNDS.white;
      x.fillStyle = bg.fill;
      x.fillRect(0, 0, W, H);
      const line = bg.dark ? 'rgba(255,255,255,.14)' : 'rgba(30,58,138,.13)';
      const strong = bg.dark ? 'rgba(255,255,255,.28)' : 'rgba(30,58,138,.28)';
      x.lineWidth = 1.2;
      const hline = (y, c) => { x.strokeStyle = c; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); };
      const vline = (xx, c) => { x.strokeStyle = c; x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); };
      switch (bg.pattern) {
        case 'grid': for (let i = 60; i < W; i += 60) vline(i, line); for (let j = 60; j < H; j += 60) hline(j, line); break;
        case 'graph':
          for (let i = 0; i < W; i += 20) vline(i, i % 100 === 0 ? strong : 'rgba(30,58,138,.07)');
          for (let j = 0; j < H; j += 20) hline(j, j % 100 === 0 ? strong : 'rgba(30,58,138,.07)');
          break;
        case 'ruled':
          for (let j = 140; j < H; j += 64) hline(j, line);
          x.strokeStyle = 'rgba(220,38,38,.35)'; x.beginPath(); x.moveTo(140, 0); x.lineTo(140, H); x.stroke();
          break;
        case 'fourline':
          for (let j = 110; j + 120 < H; j += 170) {
            hline(j, 'rgba(37,99,235,.35)'); hline(j + 40, 'rgba(220,38,38,.35)');
            hline(j + 80, 'rgba(220,38,38,.35)'); hline(j + 120, 'rgba(37,99,235,.35)');
          }
          break;
        case 'dots':
          x.fillStyle = bg.dark ? 'rgba(255,255,255,.3)' : 'rgba(30,58,138,.3)';
          for (let i = 50; i < W; i += 50) for (let j = 50; j < H; j += 50) { x.beginPath(); x.arc(i, j, 2.2, 0, 7); x.fill(); }
          break;
      }
      if (page.bgImg) {
        const img = this._img(page.bgImg, () => this.renderBg());
        if (img && img.complete && img.naturalWidth) {
          const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
          const w = img.naturalWidth * s, h = img.naturalHeight * s;
          x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        }
      }
    }

    renderInk() {
      const x = this.inkX;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, this.inkC.width, this.inkC.height);
      this._setT(x);
      x.save();
      x.beginPath(); x.rect(0, 0, W, H); x.clip();
      for (const o of this.page.objs) this.drawObj(x, o);
      x.restore();
    }

    renderLive() {
      const x = this.liveX;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, this.liveC.width, this.liveC.height);
      this._setT(x);
      for (const d of this.active.values()) {
        if (d.k === 'stroke' && d.tool === 'eraser') {
          const n = d.pts.length;
          x.strokeStyle = 'rgba(100,116,139,.9)'; x.lineWidth = 2; x.setLineDash([6, 6]);
          x.beginPath(); x.arc(d.pts[n - 2], d.pts[n - 1], d.w / 2, 0, 7); x.stroke(); x.setLineDash([]);
        } else this.drawObj(x, d);
      }
    }

    drawObj(x, o) {
      switch (o.k) {
        case 'stroke': return this._drawStroke(x, o);
        case 'shape': return this._drawShape(x, o);
        case 'text': return this._drawText(x, o);
        case 'img': {
          const img = this._img(o.src, () => this.renderInk());
          if (img && img.complete && img.naturalWidth) x.drawImage(img, o.x, o.y, o.w, o.h);
        }
      }
    }

    _img(src, onload) {
      let img = this.imgCache[src];
      if (!img) {
        img = this.imgCache[src] = new Image();
        img.onload = onload;
        img.src = src;
      }
      return img;
    }

    _drawStroke(x, o) {
      const p = o.pts;
      x.save();
      x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = o.w;
      if (o.tool === 'eraser') { x.globalCompositeOperation = 'destination-out'; x.strokeStyle = x.fillStyle = '#000'; }
      else { x.strokeStyle = x.fillStyle = o.color; if (o.tool === 'hl') x.globalAlpha = 0.33; }
      if (p.length <= 4) {
        x.beginPath(); x.arc(p[0], p[1], o.w / 2, 0, Math.PI * 2); x.fill();
      } else {
        x.beginPath(); x.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length - 2; i += 2) {
          x.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
        }
        x.lineTo(p[p.length - 2], p[p.length - 1]);
        x.stroke();
      }
      x.restore();
    }

    _drawShape(x, o) {
      const { x1, y1, x2, y2 } = o;
      const sc = o.reveal == null ? 1 : o.reveal; // grow-in animation for AI drawings
      x.save();
      x.globalAlpha = sc < 1 ? Math.max(0.15, sc) : 1;
      x.strokeStyle = o.color; x.fillStyle = o.fill || o.color; x.lineWidth = o.w;
      x.lineCap = 'round'; x.lineJoin = 'round';
      const l = Math.min(x1, x2), t = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      x.beginPath();
      switch (o.s) {
        case 'line': case 'arrow': {
          const ex = x1 + (x2 - x1) * sc, ey = y1 + (y2 - y1) * sc;
          x.moveTo(x1, y1); x.lineTo(ex, ey); x.stroke();
          if (o.s === 'arrow' && sc >= 1) {
            const a = Math.atan2(y2 - y1, x2 - x1), hs = Math.max(16, o.w * 4);
            x.beginPath(); x.moveTo(x2, y2);
            x.lineTo(x2 - hs * Math.cos(a - 0.45), y2 - hs * Math.sin(a - 0.45));
            x.lineTo(x2 - hs * Math.cos(a + 0.45), y2 - hs * Math.sin(a + 0.45));
            x.closePath(); x.fillStyle = o.color; x.fill();
          }
          break;
        }
        case 'rect': x.rect(l, t, w, h); if (o.fill) x.fill(); x.stroke(); break;
        case 'ellipse': x.ellipse(l + w / 2, t + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2 * sc); if (o.fill && sc >= 1) x.fill(); x.stroke(); break;
        case 'tri': x.moveTo(l + w / 2, t); x.lineTo(l + w, t + h); x.lineTo(l, t + h); x.closePath(); if (o.fill) x.fill(); x.stroke(); break;
        case 'dot': x.arc(x1, y1, Math.max(5, o.w * 1.6), 0, Math.PI * 2); x.fill(); break;
      }
      x.restore();
    }

    _font(o) { return `${o.bold ? '700' : '500'} ${o.fs}px ${FONT}`; }

    wrap(text, font, maxW) {
      const m = this.measureX; m.font = font;
      const out = [];
      for (const para of String(text).split('\n')) {
        let line = '';
        for (const tok of para.split(/(\s+)/)) {
          if (!tok) continue;
          const test = line + tok;
          if (m.measureText(test).width <= maxW || !line.trim()) {
            if (m.measureText(test).width > maxW && !/\s/.test(tok)) {
              // a single very long token (or CJK text without spaces): break by characters
              for (const ch of Array.from(tok)) {
                if (m.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
              }
            } else line = test;
          } else { out.push(line.trimEnd()); line = tok.trimStart(); }
        }
        out.push(line.trimEnd());
      }
      return out;
    }

    textHeight(o) {
      const lines = this.wrap(o.text, this._font(o), o.w);
      return lines.length * o.fs * 1.32 + (o.box ? o.pad * 2 : 0);
    }

    _drawText(x, o) {
      const font = this._font(o);
      const lines = o._lines && o._lf === font + o.w + o.text ? o._lines : (o._lines = this.wrap(o.text, font, o.w));
      o._lf = font + o.w + o.text;
      const lh = o.fs * 1.32;
      x.save();
      if (o.box) {
        const h = lines.length * lh + o.pad * 2;
        x.fillStyle = o.box; x.strokeStyle = o.boxStroke || o.box; x.lineWidth = 3;
        this._roundRect(x, o.x - o.pad, o.y - o.pad, o.w + o.pad * 2, h, 18);
        x.fill(); x.stroke();
      }
      x.font = font; x.fillStyle = o.color; x.textBaseline = 'top';
      x.direction = o.rtl ? 'rtl' : 'ltr';
      let budget = o.reveal == null ? Infinity : Math.floor(o.reveal);
      lines.forEach((ln, i) => {
        if (budget <= 0) return;
        const chars = Array.from(ln);
        const s = budget >= chars.length ? ln : chars.slice(0, budget).join('');
        budget -= chars.length + 1;
        let tx = o.x, align = o.align || (o.rtl ? 'right' : 'left');
        if (align === 'center') tx = o.x + o.w / 2; else if (align === 'right') tx = o.x + o.w;
        x.textAlign = align;
        x.fillText(s, tx, o.y + i * lh + (lh - o.fs) * 0.35);
      });
      x.restore();
    }

    _roundRect(x, l, t, w, h, r) {
      x.beginPath();
      x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
      x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
    }

    // ---------- input ----------
    _bindInput() {
      const c = this.liveC;
      c.addEventListener('pointerdown', e => this._down(e));
      c.addEventListener('pointermove', e => this._move(e));
      c.addEventListener('pointerup', e => this._up(e));
      c.addEventListener('pointercancel', e => this._up(e));
      c.addEventListener('contextmenu', e => e.preventDefault());
    }

    _down(e) {
      e.preventDefault();
      this.emit('interact');
      const [x, y] = this.toWorld(e);
      if (this.tool === 'text') { this.openTextEditor(x, y); return; }
      c_capture(this.liveC, e.pointerId);
      let tool = this.tool;
      // Palm / fist erase on touch panels: very large contact area acts as an eraser
      const contact = Math.max(e.width || 0, e.height || 0);
      if (this.palmErase && e.pointerType === 'touch' && contact > 70) tool = 'eraser';
      if (tool === 'shape') {
        this.active.set(e.pointerId, { k: 'shape', s: this.shape, x1: x, y1: y, x2: x, y2: y, color: this.color, w: SIZES.shape[this.sizeIdx] });
      } else {
        const w = tool === 'eraser' && tool !== this.tool ? Math.max(90, contact / this.scale) : SIZES[tool][this.sizeIdx];
        this.active.set(e.pointerId, { k: 'stroke', tool, color: this.color, w, pts: [r1(x), r1(y)] });
      }
      this._schedule();
    }

    _move(e) {
      const d = this.active.get(e.pointerId);
      if (!d) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = this.toWorld(ev);
        if (d.k === 'shape') { d.x2 = x; d.y2 = y; continue; }
        const p = d.pts, lx = p[p.length - 2], ly = p[p.length - 1];
        if (Math.hypot(x - lx, y - ly) < 1.2) continue;
        p.push(r1(x), r1(y));
        if (d.tool === 'eraser') { // erase immediately on the ink layer
          const k = this.inkX; this._setT(k);
          this._drawStroke(k, { tool: 'eraser', w: d.w, pts: [lx, ly, x, y, x, y] });
        }
      }
      this._schedule();
    }

    _up(e) {
      const d = this.active.get(e.pointerId);
      if (!d) return;
      this.active.delete(e.pointerId);
      const tiny = d.k === 'shape' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 6;
      if (!tiny) {
        if (d.k === 'shape' && e.shiftKey === false && (d.s === 'ellipse' || d.s === 'rect')) { /* keep free aspect */ }
        this.add(d, d.tool === 'eraser');
      }
      this._schedule();
    }

    _schedule() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.renderLive(); });
    }

    // ---------- model ops ----------
    add(o, alreadyDrawn) {
      const p = this.page;
      p.objs.push(o); p.undo.push({ op: 'add', o }); p.redo.length = 0;
      if (!alreadyDrawn) { const k = this.inkX; this._setT(k); k.save(); k.beginPath(); k.rect(0, 0, W, H); k.clip(); this.drawObj(k, o); k.restore(); }
      this.emit('change');
    }

    undo() {
      const p = this.page, e = p.undo.pop();
      if (!e) return;
      if (e.op === 'add') { const i = p.objs.lastIndexOf(e.o); if (i >= 0) p.objs.splice(i, 1); }
      else if (e.op === 'clear') { p.objs = e.objs; p.bgImg = e.bgImg; p.cy = e.cy; this.renderBg(); }
      p.redo.push(e); this.renderInk(); this.emit('change');
    }

    redo() {
      const p = this.page, e = p.redo.pop();
      if (!e) return;
      if (e.op === 'add') p.objs.push(e.o);
      else if (e.op === 'clear') { p.objs = []; p.bgImg = null; p.cy = 70; this.renderBg(); }
      p.undo.push(e); this.renderInk(); this.emit('change');
    }

    clear() {
      const p = this.page;
      if (!p.objs.length && !p.bgImg) return;
      p.undo.push({ op: 'clear', objs: p.objs, bgImg: p.bgImg, cy: p.cy });
      p.objs = []; p.bgImg = null; p.cy = 70; p.redo.length = 0;
      this.render(); this.emit('change');
    }

    setTool(t, shape) {
      // highlighter gets a highlighter colour when the current ink is plain black/white
      if (t === 'hl' && /^#(111827|ffffff)$/i.test(this.color)) { this._penColor = this.color; this.color = '#facc15'; }
      else if (t !== 'hl' && this.tool === 'hl' && this._penColor && this.color === '#facc15') { this.color = this._penColor; this._penColor = null; }
      this.tool = t; if (shape) this.shape = shape; this.emit('tool');
    }
    setColor(c) { this.color = c; this.emit('tool'); }
    setSize(i) { this.sizeIdx = i; this.emit('tool'); }

    setBg(name) {
      this.page.bg = name;
      const dark = !!BACKGROUNDS[name].dark;
      if (dark && /^#(111827|000000|1e3a8a)$/i.test(this.color)) this.color = '#ffffff';
      if (!dark && /^#ffffff$/i.test(this.color)) this.color = '#111827';
      this.render(); this.emit('tool'); this.emit('change');
    }

    addPage(bgImg) {
      const p = newPage(this.page.bg);
      if (bgImg) { p.bgImg = bgImg; p.bg = 'white'; }
      this.pages.splice(this.pi + 1, 0, p);
      this.goto(this.pi + 1);
      return p;
    }

    goto(i) {
      if (i < 0 || i >= this.pages.length) return;
      this.closeTextEditor(true);
      this.finishAnims();
      this.pi = i; this.render(); this.emit('page');
    }

    deletePage() {
      if (this.pages.length === 1) { this.clear(); return; }
      this.pages.splice(this.pi, 1);
      this.goto(Math.min(this.pi, this.pages.length - 1));
    }

    insertImage(src) {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, (W * 0.6) / img.naturalWidth, (H * 0.6) / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        this.imgCache[src] = img;
        this.add({ k: 'img', src, x: (W - w) / 2, y: (H - h) / 2, w, h });
      };
      img.src = src;
    }

    /** Renders one page (background + ink) to a data URL. */
    exportPage(i = this.pi, type = 'image/png', maxW = W) {
      const page = this.pages[i], k = maxW / W;
      const out = document.createElement('canvas'); out.width = W * k; out.height = H * k;
      const ink = document.createElement('canvas'); ink.width = out.width; ink.height = out.height;
      const ox = out.getContext('2d'), ix = ink.getContext('2d');
      ox.scale(k, k); ix.scale(k, k);
      this.paintBg(ox, page);
      for (const o of page.objs) this.drawObj(ix, o);
      ox.setTransform(1, 0, 0, 1, 0, 0);
      ox.drawImage(ink, 0, 0);
      return out.toDataURL(type, 0.85);
    }

    // ---------- text tool ----------
    openTextEditor(x, y, initial = '') {
      this.closeTextEditor(true);
      const [sx, sy] = this.toScreen(x, y);
      const fs = SIZES.text[this.sizeIdx];
      const ta = document.createElement('textarea');
      ta.className = 'text-editor';
      ta.value = initial;
      const stageR = this.stage.getBoundingClientRect();
      Object.assign(ta.style, {
        left: (sx - stageR.left) + 'px', top: (sy - stageR.top) + 'px',
        fontSize: fs * this.scale + 'px', color: this.color, fontFamily: FONT,
        maxWidth: (W - x - 20) * this.scale + 'px'
      });
      ta.placeholder = 'Type here…';
      ta._pos = [x, y];
      this.stage.appendChild(ta);
      this._editor = ta;
      setTimeout(() => ta.focus(), 30);
      ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') this.closeTextEditor(false); });
      ta.addEventListener('blur', () => setTimeout(() => this.closeTextEditor(true), 120));
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = 'auto'; ta.style.width = Math.max(200, ta.scrollWidth + 20) + 'px'; };
      ta.addEventListener('input', grow); grow();
    }

    closeTextEditor(commit) {
      const ta = this._editor;
      if (!ta) return;
      this._editor = null;
      const text = ta.value.trim();
      ta.remove();
      if (commit && text) {
        const [x, y] = ta._pos;
        const fs = SIZES.text[this.sizeIdx];
        const rtl = /[֐-ࣿ]/.test(text);
        const w = Math.max(100, W - x - 30);
        const o = { k: 'text', x, y, w, text, fs, color: this.color, bold: false, rtl, align: rtl ? 'left' : 'left' };
        // shrink width to content so later layout looks natural
        this.measureX.font = this._font(o);
        o.w = Math.min(w, Math.max(...text.split('\n').map(l => this.measureX.measureText(l).width)) + 4);
        this.add(o);
      }
    }

    // ---------- AI teacher writing on the board ----------
    palette() {
      return this.dark
        ? { head: '#fde68a', text: '#f8fafc', accent: '#93c5fd', box: 'rgba(253,230,138,.14)', boxStroke: '#fde68a', line: '#fde68a' }
        : { head: '#1e3a8a', text: '#111827', accent: '#b45309', box: '#fef3c7', boxStroke: '#f59e0b', line: '#f59e0b' };
    }

    _color(c, fallback) {
      if (!c || typeof c !== 'string') return fallback;
      const v = c.trim().toLowerCase();
      if (this.dark && (v === 'black' || v === '#000' || v === '#000000')) return '#ffffff';
      if (!this.dark && (v === 'white' || v === '#fff' || v === '#ffffff')) return '#111827';
      return c;
    }

    /**
     * Lays out AI board items (heading, text, bullet, numbered, formula, box, table, figure)
     * on the current page, flowing to new pages as needed, and animates the writing.
     * Resolves when the writing animation has finished.
     */
    write(items, { rtl = false, speed = 1 } = {}) {
      if (!Array.isArray(items) || !items.length) return Promise.resolve();
      const L = 100, R = 1820, MW = R - L, BOTTOM = H - 50;
      const queue = [];
      let num = 0;
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const pal = this.palette();
        const type = String(it.type || 'text').toLowerCase();
        const text = it.text != null ? String(it.text) : '';
        const objs = [];
        let h = 0;
        const tObj = (props) => Object.assign({ k: 'text', x: L, y: 0, w: MW, text, fs: 44, color: pal.text, bold: false, rtl }, props);

        // All coordinates below are relative to the top of this block (y = 0).
        const T = (props, y) => { const o = tObj(props); o.y = y; objs.push(o); return o; };
        const S = (props) => { const o = Object.assign({ k: 'shape', w: 3, color: pal.text }, props); objs.push(o); return o; };

        if (type === 'heading' || type === 'title') {
          const o = T({ fs: type === 'title' ? 74 : 62, bold: true, color: this._color(it.color, pal.head) }, 0);
          const th = this.textHeight(o);
          const len = Math.min(MW, 420);
          S({ s: 'line', x1: rtl ? R : L, x2: rtl ? R - len : L + len, y1: th + 4, y2: th + 4, color: pal.line, w: 6 });
          h = th + 30;
        } else if (type === 'bullet' || type === 'numbered') {
          num = type === 'numbered' ? num + 1 : num;
          const mark = type === 'numbered' ? (it.n || num) + '.' : '•';
          const ind = 62;
          T({ text: mark, x: rtl ? R - ind + 6 : L + 6, w: ind - 10, color: pal.accent, bold: true, align: rtl ? 'right' : 'left' }, 0);
          const o = T({ x: rtl ? L : L + ind, w: MW - ind, color: this._color(it.color, pal.text) }, 0);
          h = this.textHeight(o) + 14;
        } else if (type === 'formula' || type === 'equation') {
          const o = T({ fs: 58, bold: true, align: 'center', color: this._color(it.color, pal.accent), x: L + 120, w: MW - 240,
            box: this.dark ? 'rgba(147,197,253,.10)' : '#eff6ff', boxStroke: '#93c5fd', pad: 22 }, 22);
          h = this.textHeight(o) + 34;
        } else if (type === 'box' || type === 'note' || type === 'key') {
          const o = T({ fs: 44, bold: true, box: pal.box, boxStroke: pal.boxStroke, pad: 24, x: L + 24, w: MW - 48, color: this._color(it.color, pal.text) }, 24);
          h = this.textHeight(o) + 36;
        } else if (type === 'table' && Array.isArray(it.rows) && it.rows.length) {
          const rows = it.rows.slice(0, 10).map(r => (Array.isArray(r) ? r : [r]).map(v => String(v)));
          const cols = Math.max(...rows.map(r => r.length));
          const cw = MW / cols, fs = 36, pad = 12;
          let y = 0;
          rows.forEach((r, ri) => {
            const cells = [];
            let rh = 0;
            for (let ci = 0; ci < cols; ci++) {
              const cx = rtl ? L + MW - (ci + 1) * cw : L + ci * cw;
              const o = tObj({ text: r[ci] || '', x: cx + pad, w: cw - pad * 2, fs, bold: ri === 0, color: ri === 0 ? pal.head : pal.text });
              o.y = y + pad;
              cells.push(o);
              rh = Math.max(rh, this.textHeight(o) + pad * 2);
            }
            if (ri === 0) S({ s: 'rect', x1: L, y1: 0, x2: L + MW, y2: rh, color: pal.boxStroke, fill: pal.box, w: 2 });
            cells.forEach(o => objs.push(o));
            y += rh;
            S({ s: 'line', x1: L, x2: L + MW, y1: y, y2: y, w: 2 });
          });
          S({ s: 'line', x1: L, x2: L + MW, y1: 0, y2: 0, w: 2 });
          for (let ci = 0; ci <= cols; ci++) S({ s: 'line', x1: L + ci * cw, x2: L + ci * cw, y1: 0, y2: y, w: 2 });
          h = y + 24;
        } else if (type === 'figure' || type === 'diagram') {
          const fh = Math.min(BOTTOM - 120, Math.max(220, (Number(it.height) || 40) / 100 * H));
          const fw = Math.min(MW, fh * 1.9);
          const fx = L + (MW - fw) / 2;
          const P = (px, py) => [fx + (Number(px) || 0) / 100 * fw, (Number(py) || 0) / 100 * fh];
          for (const s of (it.shapes || []).slice(0, 40)) {
            if (!s || typeof s !== 'object') continue;
            const kind = String(s.shape || s.type || 'rect').toLowerCase();
            const col = this._color(s.color, pal.text);
            const fill = s.fill ? this._color(s.fill, null) : null;
            if (kind === 'text' || kind === 'label') {
              const [tx, ty] = P(s.x, s.y);
              T({ text: String(s.text || s.label || ''), x: tx - 240, w: 480, fs: 34, align: 'center', color: col, bold: !!s.bold }, ty - 20);
              continue;
            }
            let x1, y1, x2, y2, sh;
            if (kind === 'line' || kind === 'arrow') {
              [x1, y1] = P(s.x, s.y); [x2, y2] = P(s.x2, s.y2); sh = kind;
            } else if (kind === 'circle' || kind === 'ellipse') {
              const r = Number(s.r) || 0;
              const rx = (r || (Number(s.w) || 20) / 2) / 100 * (kind === 'circle' ? fh : fw);
              const ry = (r || (Number(s.h) || 20) / 2) / 100 * fh;
              const [cx, cy] = P(s.x, s.y);
              x1 = cx - rx; x2 = cx + rx; y1 = cy - ry; y2 = cy + ry; sh = 'ellipse';
            } else if (kind === 'dot' || kind === 'point') {
              [x1, y1] = P(s.x, s.y); x2 = x1; y2 = y1; sh = 'dot';
            } else {
              [x1, y1] = P(s.x, s.y);
              [x2, y2] = P((Number(s.x) || 0) + (Number(s.w) || 10), (Number(s.y) || 0) + (Number(s.h) || 10));
              sh = kind === 'triangle' ? 'tri' : 'rect';
            }
            S({ s: sh, x1, y1, x2, y2, color: col, fill, w: 4 });
            if (s.label) {
              const lx = (x1 + x2) / 2;
              const ly = (sh === 'line' || sh === 'arrow') ? Math.min(y1, y2) - 46 : sh === 'dot' ? y1 - 50 : (y1 + y2) / 2 - 20;
              T({ text: String(s.label), x: lx - 220, w: 440, fs: 32, align: 'center', color: col, bold: true }, ly);
            }
          }
          h = fh + 30;
        } else {
          const o = T({ color: this._color(it.color, pal.text), bold: !!it.bold }, 0);
          h = this.textHeight(o) + 16;
        }
        if (objs.length) queue.push({ objs, h });
      }

      // place items, flowing to a fresh page when the current one is full
      const placed = [];
      for (const blk of queue) {
        let p = this.page;
        if (p.cy + blk.h > BOTTOM && p.cy > 100) { p = this.addPage(); }
        for (const o of blk.objs) {
          if (o.k === 'text') o.y += p.cy; else { o.y1 += p.cy; o.y2 += p.cy; }
          o.reveal = 0;
          o._page = p;
          p.objs.push(o); p.undo.push({ op: 'add', o });
          placed.push(o);
        }
        p.cy += blk.h;
      }
      this.renderInk();
      this.emit('change');
      return this._animate(placed, speed);
    }

    _animate(objs, speed) {
      return new Promise(resolve => {
        const anim = { objs, i: 0, last: performance.now(), resolve, speed };
        this.anims.push(anim);
        const step = (t) => {
          if (anim.done) return;
          const dt = Math.min(100, t - anim.last); anim.last = t;
          let budget = dt;
          while (budget > 0 && anim.i < objs.length) {
            const o = objs[anim.i];
            if (o.k === 'text') {
              const total = Array.from(o.text).length + 5;
              o.reveal += budget * 0.045 * anim.speed;
              if (o.reveal >= total) { delete o.reveal; anim.i++; budget = 0.01; } else budget = 0;
            } else {
              o.reveal = (o.reveal || 0) + budget / (380 / anim.speed);
              if (o.reveal >= 1) { delete o.reveal; anim.i++; budget = 0.01; } else budget = 0;
            }
          }
          if (objs[0] && objs[0]._page === this.page) this.renderInk();
          if (anim.i >= objs.length) return this._endAnim(anim);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    _endAnim(anim) {
      anim.done = true;
      anim.objs.forEach(o => { delete o.reveal; delete o._page; });
      this.anims = this.anims.filter(a => a !== anim);
      this.renderInk();
      anim.resolve();
    }

    finishAnims() { [...this.anims].forEach(a => this._endAnim(a)); }
  }

  function r1(v) { return Math.round(v * 10) / 10; }
  function c_capture(el, id) { try { el.setPointerCapture(id); } catch (_) {} }

  window.Board = Board;
  Board.W = W; Board.H = H;
})();

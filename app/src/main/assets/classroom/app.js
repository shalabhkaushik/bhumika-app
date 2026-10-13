// Wires the toolbar, bottom bar, popovers and panels to the board, widgets and AI teacher.
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ICONS = {
    pen: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    hl: 'M6 14l3 3v5h6v-5l3-3V9H6v5zm5-12h2v3h-2zM3.5 5.88l1.41-1.41 2.12 2.12L5.62 8 3.5 5.88zm13.46.71l2.12-2.12 1.41 1.41L18.38 8l-1.42-1.41z',
    eraser: 'M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z',
    shapes: 'M11 13.5v8H3v-8h8zm-2 2H5v4h4v-4zM12 2l5.5 9h-11L12 2zm0 3.86L10.08 9h3.84L12 5.86zM17.5 13c2.5 0 4.5 2 4.5 4.5S20 22 17.5 22 13 20 13 17.5s2-4.5 4.5-4.5zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    text: 'M5 4v3h5.5v12h3V7H19V4z',
    image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
    undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
    redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
    clear: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    swap: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
    left: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    right: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    grid: 'M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z',
    apps: 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
    save: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z',
    spark: 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
    mic: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
    send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    stop: 'M6 6h12v12H6z',
    next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
    prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
    gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24"><path d="${ICONS[n] || ''}"/></svg>`;
  $$('[data-i]').forEach(e => e.insertAdjacentHTML('afterbegin', icon(e.dataset.i)));

  const COLORS = ['#111827', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777', '#92400e', '#64748b'];

  const board = new Board($('#stage'));
  window.board = board;

  // ---------- popovers ----------
  let openPop = null;
  function showPop(pop, anchor) {
    if (openPop === pop) { hidePop(); return; }
    hidePop();
    pop.classList.add('show');
    const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
    let left, top;
    if (anchor.closest('#toolbar')) {
      const right = document.getElementById('app').classList.contains('tb-right');
      left = right ? a.left - p.width - 10 : a.right + 10;
      top = Math.min(innerHeight - p.height - 90, Math.max(10, a.top - 10));
    } else {
      left = Math.min(innerWidth - p.width - 10, Math.max(10, a.left + a.width / 2 - p.width / 2));
      top = a.top - p.height - 12;
    }
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    openPop = pop;
  }
  function hidePop() { if (openPop) openPop.classList.remove('show'); openPop = null; }
  document.addEventListener('pointerdown', e => {
    if (openPop && !e.target.closest('.pop') && !e.target.closest('#toolbar button, #bottombar button')) hidePop();
  }, true);
  board.on('interact', hidePop);

  // ---------- tools ----------
  function setTool(t) {
    board.setTool(t);
    $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  }
  $$('.tool').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tool === 'shape') { setTool('shape'); showPop($('#shapePop'), b); return; }
    if (b.dataset.tool === board.tool && b.dataset.tool !== 'text') { $('#sizeBtn').click(); return; } // tap again → size
    setTool(b.dataset.tool);
    hidePop();
  }));
  $('#shapePop').addEventListener('click', e => {
    const s = e.target.closest('button')?.dataset.shape; if (!s) return;
    board.setTool('shape', s);
    $$('#shapePop button').forEach(b => b.classList.toggle('on', b.dataset.shape === s));
    hidePop();
  });
  $('#shapePop [data-shape=line]').classList.add('on');

  // colours
  $('#colorPop').innerHTML = COLORS.map(c => `<button class="swatch" data-c="${c}" style="background:${c}"></button>`).join('');
  $('#colorBtn').onclick = () => showPop($('#colorPop'), $('#colorBtn'));
  $('#colorPop').addEventListener('click', e => {
    const c = e.target.dataset.c; if (!c) return;
    board.setColor(c);
    if (board.tool === 'eraser' || board.tool === 'text') setTool('pen');
    hidePop();
  });

  // sizes
  $('#sizePop').innerHTML = [6, 11, 18, 28].map((d, i) => `<button data-s="${i}"><span style="width:${d}px;height:${d}px"></span></button>`).join('');
  $('#sizeBtn').onclick = () => showPop($('#sizePop'), $('#sizeBtn'));
  $('#sizePop').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    board.setSize(+b.dataset.s); hidePop();
  });

  function syncToolUi() {
    $('#colorDot').style.background = board.color;
    $$('#colorPop .swatch').forEach(s => s.classList.toggle('on', s.dataset.c.toLowerCase() === board.color.toLowerCase()));
    $$('#sizePop button').forEach(b => b.classList.toggle('on', +b.dataset.s === board.sizeIdx));
    $('#sizeDot').style.height = [3, 6, 10, 15][board.sizeIdx] + 'px';
  }
  board.on('tool', syncToolUi);
  syncToolUi();

  $('#imgInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => board.insertImage(r.result);
    r.readAsDataURL(f);
    e.target.value = '';
  });

  $('#undoBtn').onclick = () => board.undo();
  $('#redoBtn').onclick = () => board.redo();
  let clearArmed = 0;
  $('#clearBtn').onclick = () => {
    // two-tap clear so a stray touch never wipes the board; Undo also restores
    if (Date.now() - clearArmed < 2500) { board.clear(); clearArmed = 0; Teacher.toast('Page cleared — Undo restores it'); }
    else { clearArmed = Date.now(); Teacher.toast('Tap again to clear this page'); }
  };
  $('#flipBtn').onclick = () => {
    const a = $('#app');
    a.classList.toggle('tb-right'); a.classList.toggle('tb-left');
    try { localStorage.setItem('bh.tbSide', a.classList.contains('tb-right') ? 'right' : 'left'); } catch (_) {}
    setTimeout(() => board.resize(), 30);
  };
  try { if (localStorage.getItem('bh.tbSide') === 'right') $('#flipBtn').click(); } catch (_) {}

  // ---------- pages & backgrounds ----------
  const syncPages = () => { $('#pageNo').textContent = (board.pi + 1) + ' / ' + board.pages.length; };
  board.on('page', syncPages); board.on('change', syncPages);
  $('#prevPage').onclick = () => board.goto(board.pi - 1);
  $('#nextPage').onclick = () => board.pi < board.pages.length - 1 ? board.goto(board.pi + 1) : board.addPage();
  $('#addPage').onclick = () => board.addPage();
  syncPages();

  const bgs = board.backgrounds;
  $('#bgPop').innerHTML = Object.keys(bgs).map(k => `<button data-bg="${k}"><span class="chip" style="background:${bgs[k].fill}"></span>${bgs[k].label}</button>`).join('');
  $('#bgBtn').onclick = () => {
    $$('#bgPop button').forEach(b => b.classList.toggle('on', b.dataset.bg === board.page.bg));
    showPop($('#bgPop'), $('#bgBtn'));
  };
  $('#bgPop').addEventListener('click', e => {
    const k = e.target.closest('button')?.dataset.bg; if (!k) return;
    board.setBg(k); hidePop();
  });

  // ---------- tools menu ----------
  $('#toolsBtn').onclick = () => showPop($('#toolsPop'), $('#toolsBtn'));
  $('#toolsPop').addEventListener('click', e => {
    const w = e.target.closest('button')?.dataset.w; if (!w) return;
    hidePop();
    if (w === 'delpage') { board.deletePage(); return; }
    if (w === 'palm') { board.palmErase = !board.palmErase; $('#palmLbl').textContent = 'Palm erase: ' + (board.palmErase ? 'on' : 'off'); return; }
    if (w === 'fullscreen') { const d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen && d.requestFullscreen().catch(() => {}); return; }
    Widgets[w]();
  });

  $('#saveBtn').onclick = () => {
    const where = Native.saveImage(board.exportPage(), 'bhumika-board-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '-p' + (board.pi + 1));
    Teacher.toast(where ? 'Saved to ' + where : 'Could not save the page');
  };

  // ---------- website & library ----------
  $('#homeBtn').onclick = () => Native.openWebsite('https://www.bhumika.group/');
  const openLibrary = () => {
    Native.openLibrary('https://www.bhumika.group/ebook');
    if (Native.isApp) Teacher.toast('Open a book page, then tap “Write on this page”', null, null, 4000);
  };
  $('#libBtn').onclick = openLibrary;
  // Snapshot of a library page arrives here → new page to annotate
  BH.onCapture = (dataUrl) => {
    board.addPage(dataUrl);
    setTool('pen');
    if (board.color === '#ffffff') board.setColor('#dc2626');
    Teacher.toast('Book page added — write on it!');
  };

  // ---------- AI panel ----------
  function openAI(tab) {
    $('#app').classList.add('ai-open'); $('#aiBtn').classList.add('active');
    if (tab) switchTab(tab);
    setTimeout(() => board.resize(), 280);
  }
  function closeAI() {
    $('#app').classList.remove('ai-open'); $('#aiBtn').classList.remove('active');
    setTimeout(() => board.resize(), 280);
  }
  function switchTab(t) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#chatView').hidden = t !== 'chat';
    $('#lessonView').hidden = t !== 'lesson';
  }
  $('#aiBtn').onclick = () => $('#app').classList.contains('ai-open') ? closeAI() : openAI();
  $('#aiClose').onclick = closeAI;
  $$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  // ---------- back button (Android) ----------
  BH.onBack = () => {
    if (!$('#settings').hidden) { $('#settings').hidden = true; return 'handled'; }
    if (!$('#listening').hidden) { $('#stopListen').click(); return 'handled'; }
    if (openPop) { hidePop(); return 'handled'; }
    if (Object.keys(Widgets.open).length) { Widgets.closeAll(); return 'handled'; }
    if ($('#app').classList.contains('ai-open')) { closeAI(); return 'handled'; }
    if (!$('#player').hidden) { Teacher.Player.stop(); return 'handled'; }
    return 'exit';
  };

  // keyboard shortcuts for panels with keyboards / presenters
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.ctrlKey && e.key === 'z') board.undo();
    else if (e.ctrlKey && e.key === 'y') board.redo();
    else if (e.key === 'PageDown' || e.key === 'ArrowRight') $('#nextPage').click();
    else if (e.key === 'PageUp' || e.key === 'ArrowLeft') board.goto(board.pi - 1);
    else if (e.key === ' ' && !$('#player').hidden) { e.preventDefault(); Teacher.Player.toggle(); }
  });

  window.App = { icon, openAI, closeAI, setTool, openLibrary };
  Teacher.init(board);
  Teacher.Player._ui();
})();

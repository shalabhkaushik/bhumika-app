// Bhumika AI Teacher — multilingual voice + text teaching assistant that explains aloud
// and writes notes / diagrams on the smart board, runs full lessons with quizzes and
// obeys classroom voice commands ("clear the board", "start a 5 minute timer", …).
(function () {
  const $ = (s) => document.querySelector(s);
  let board;

  const state = {
    lang: 'en-IN',
    rate: 1,
    voice: true,
    writeBoard: true,
    grade: 'Class 5',
    history: [],        // [{role, content}] trimmed conversation
    busy: false,
    lastTopic: ''
  };

  // ---------------- prompt ----------------
  function systemPrompt(mode) {
    const L = langInfo(state.lang);
    return `You are "Bhumika AI Teacher", a friendly, patient and encouraging school teacher made for Bhumika Group, an Indian educational publisher. You are teaching a real classroom on a large interactive touch panel (smart board). The teacher and students talk to you by voice or text.

LANGUAGE: Speak and write in ${L.name} (${L.native}). Every "say" text and every board text must be in ${L.name} using its native script. Keep numbers, formulas and standard scientific symbols as usual. If the user writes in another language, still answer in ${L.name} unless they explicitly ask you to switch language.

STYLE: Short, clear, warm spoken sentences that sound natural through text-to-speech: no markdown, no emojis, no asterisks or hash signs, no bullet characters inside "say". Pitch it for ${state.grade} students. Use familiar Indian examples (rupees, cricket, mangoes, festivals, trains). Be factually accurate; if unsure, say so honestly. Ask the class an occasional question to keep them engaged.

OUTPUT FORMAT: Reply with ONLY one JSON object and nothing else:
{"steps":[{"say":"spoken explanation","board":[ITEM, ...]}], "quiz":[{"q":"question","options":["...","...","...","..."],"answer":0,"explain":"one short sentence"}], "actions":[ACTION, ...]}

Board ITEM types (the board is a wide 16:9 page; write short notes, not the full speech):
{"type":"heading","text":"..."}
{"type":"text","text":"..."}
{"type":"bullet","text":"..."}
{"type":"numbered","text":"..."}
{"type":"formula","text":"a² + b² = c²"}   (use Unicode symbols: ² ³ √ π × ÷ ≤ ≥ ° → ½)
{"type":"box","text":"key idea to remember"}
{"type":"table","rows":[["Header","Header"],["cell","cell"]]}
{"type":"figure","height":40,"shapes":[SHAPE, ...]}  — a simple labelled diagram. x and y are percentages (0-100) of the figure box, x to the right and y downwards; the box is about twice as wide as it is tall. height is the % of the page height (25-60).
SHAPE: {"shape":"circle","x":50,"y":50,"r":30,"label":"Sun","color":"#ea580c","fill":"#fde68a"} | {"shape":"rect","x":10,"y":10,"w":30,"h":20,"label":"..."} | {"shape":"triangle","x":..,"y":..,"w":..,"h":..} | {"shape":"line","x":..,"y":..,"x2":..,"y2":..,"label":"..."} | {"shape":"arrow","x":..,"y":..,"x2":..,"y2":..} | {"shape":"dot","x":..,"y":..,"label":"A"} | {"shape":"text","x":..,"y":..,"text":"..."}
Keep shapes inside 0-100 and labels short (1-3 words).

ACTION (only when the user asks you to control the classroom): {"do":"clear"} {"do":"new_page"} {"do":"next_page"} {"do":"prev_page"} {"do":"background","value":"white|cream|chalk|black|grid|graph|ruled|fourline|dots"} {"do":"timer","seconds":300} {"do":"picker"} {"do":"tool","value":"pen|highlighter|eraser|ruler|protractor|spotlight|curtain|calculator"} {"do":"color","value":"#dc2626"} {"do":"library"} {"do":"stop"}

Leave out "quiz" and "actions" when not needed. ${mode === 'lesson' ? '' : 'For pure classroom commands, reply with one very short confirming step and the action.'}`;
  }

  // ---------------- helpers ----------------
  function parseReply(text) {
    let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      const core = t.slice(a, b + 1);
      for (const cand of [core, core.replace(/,\s*([}\]])/g, '$1')]) {
        try {
          const j = JSON.parse(cand);
          if (j && typeof j === 'object') {
            if (!Array.isArray(j.steps)) j.steps = j.say ? [{ say: j.say, board: j.board || [] }] : [];
            return j;
          }
        } catch (_) {}
      }
    }
    return { steps: [{ say: t, board: [] }] };
  }

  function speechOf(reply) { return (reply.steps || []).map(s => s && s.say).filter(Boolean).join('\n\n'); }

  function setStatus(s) { $('#aiStatus').textContent = s; }

  function addMsg(kind, text, extra) {
    const m = document.createElement('div');
    m.className = 'msg ' + kind;
    if (langInfo(state.lang).rtl && kind !== 'me') m.dir = 'auto';
    m.textContent = text;
    if (extra) m.appendChild(extra);
    const log = $('#chatLog');
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function remember(role, content) {
    const h = state.history;
    if (h.length && h[h.length - 1].role === role) h[h.length - 1].content += '\n' + content;
    else h.push({ role, content });
    while (h.length > 14) h.shift();
    while (h.length && h[0].role !== 'user') h.shift();
  }

  // ---------------- talking to the model ----------------
  async function request(userText, { mode = 'chat', image, maxTokens } = {}) {
    const content = image
      ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: userText }]
      : userText;
    const messages = state.history.map(m => ({ role: m.role, content: m.content }));
    if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
    messages.push({ role: 'user', content });
    const text = await Native.askAI({ system: systemPrompt(mode), messages, max_tokens: maxTokens || (mode === 'lesson' ? 8000 : 2000) });
    remember('user', image ? '[picture of the board] ' + userText : userText);
    return text;
  }

  function friendlyError(e) {
    const m = String(e && e.message || e);
    if (m === 'NO_KEY') { openSettings('Add your Claude API key (or a school server endpoint) to use the AI teacher.'); return 'The AI teacher needs an API key — opened settings.'; }
    if (/401|authentication/i.test(m)) return 'The API key was rejected. Please check it in settings.';
    if (/429|rate/i.test(m)) return 'Too many requests right now. Please wait a moment and try again.';
    if (/529|overloaded/i.test(m)) return 'The AI service is busy. Please try again in a few seconds.';
    if (/Unable to resolve|network|failed to fetch|timeout|ConnectException|UnknownHost/i.test(m)) return 'No internet connection. The board, tools and saved lessons (My Lessons) still work offline.';
    return 'Something went wrong: ' + m;
  }

  /** Ask a question / give a command (typed or spoken). */
  async function ask(text, opts = {}) {
    text = (text || '').trim();
    if (!text || state.busy) return;
    if (!opts.silentUser) addMsg('me', opts.display || text);
    if (!opts.image && localCommand(text)) return;
    state.busy = true; setStatus('Thinking…');
    const typing = addMsg('ai typing', '');
    try {
      const prompt = opts.image ? text : (state.writeBoard ? text : text + '\n(Do not write on the board for this answer unless I ask.)');
      const raw = await request(prompt, { image: opts.image });
      const reply = parseReply(raw);
      typing.remove();
      const said = speechOf(reply);
      remember('assistant', said || raw.slice(0, 1500));
      const replay = document.createElement('button');
      replay.className = 'replay'; replay.textContent = '🔊 Replay';
      replay.onclick = () => say(said);
      addMsg('ai', said || '(done)', said ? replay : null);
      runActions(reply.actions);
      if (!state.writeBoard && !opts.image) reply.steps.forEach(s => s.board = []);
      Player.play(reply, { title: '' });   // plays in the background; AI is free for the next question
    } catch (e) {
      typing.remove();
      addMsg('err', friendlyError(e), offlineHint(e));
    } finally {
      state.busy = false; setStatus(navigator.onLine === false ? 'Offline' : 'Ready');
    }
  }

  /** Asks the AI for a complete lesson; resolves to the parsed reply (does not play it). */
  async function generateLesson({ topic, grade, subject, steps, quiz }) {
    const prompt = `Teach a complete classroom lesson.
Topic: ${topic}
Class: ${grade}
Subject: ${subject}
Use about ${steps} steps. Step 1: a "title" item with the topic plus a short hook question to the class. Middle steps: explain the concepts one by one with simple examples; include at least one figure or table where it helps; one "box" with the key idea to remember. Last step: a short recap with bullets.
Each step's "say" is 3 to 6 spoken sentences; each step's "board" has 1 to 4 concise items.
${quiz ? 'Finish with a "quiz" of 4 multiple-choice questions (4 options each).' : 'Do not include a quiz.'}`;
    const raw = await request(prompt, { mode: 'lesson' });
    const reply = parseReply(raw);
    if (!reply.steps.length || !reply.steps.some(s => s && s.say)) throw new Error('The lesson came back empty. Please try again.');
    return reply;
  }

  function lessonRecord(p, reply) {
    return {
      id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: p.topic, grade: p.grade, subject: p.subject, lang: state.lang,
      chalk: !!p.chalk, steps: reply.steps.length, quizCount: Array.isArray(reply.quiz) ? reply.quiz.length : 0,
      created: Date.now(), reply
    };
  }

  /** Full lesson: generate, save for offline use, then teach it on the board. */
  async function teachLesson(p) {
    const { topic, grade, chalk } = p;
    if (!topic || state.busy) return;
    state.grade = grade || state.grade;
    state.lastTopic = topic;
    state.busy = true;
    const btn = $('#lStart'); btn.disabled = true; btn.textContent = 'Preparing the lesson…';
    setStatus('Preparing lesson…');
    toast('✦ Preparing a lesson on “' + topic + '”…');
    try {
      const reply = await generateLesson(p);
      remember('assistant', ('Lesson on ' + topic + ': ' + speechOf(reply)).slice(0, 3000));
      if (p.save !== false) { Native.lessons.save(lessonRecord(p, reply)); updateBadge(); }
      startLesson(reply, { title: topic, chalk });
    } catch (e) {
      addMsg('err', friendlyError(e), offlineHint(e));
      App.openAI('chat');
    } finally {
      state.busy = false; setStatus(navigator.onLine === false ? 'Offline' : 'Ready');
      btn.disabled = false; btn.textContent = '✦ Start teaching';
    }
  }

  async function startLesson(reply, { title, chalk }) {
    if (board.page.objs.length || board.page.bgImg) board.addPage();
    if (chalk) board.setBg('chalk');
    App.closeAI();
    await Player.play(reply, { title, lesson: true });
  }

  // ---------------- My Lessons (offline library) ----------------
  const isNetErr = (e) => /Unable to resolve|network|failed to fetch|timeout|ConnectException|UnknownHost|NO_KEY/i.test(String(e && e.message || e));

  function offlineHint(e) {
    if (!isNetErr(e) || !Native.lessons.list().length) return null;
    const b = document.createElement('button');
    b.className = 'go-lib'; b.textContent = '📚 Play a saved lesson (works offline)';
    b.onclick = () => App.openAI('lib');
    return b;
  }

  function updateBadge() {
    const n = Native.lessons.list().length;
    $('#libBadge').textContent = n ? n : '';
  }

  /** Plays a saved lesson — no internet needed. */
  async function playSaved(id) {
    const rec = Native.lessons.load(id);
    if (!rec || !rec.reply) { toast('This lesson could not be opened.'); return; }
    if (rec.lang && rec.lang !== state.lang) { state.lang = rec.lang; $('#aiLang').value = rec.lang; persist(); }
    state.lastTopic = rec.title;
    state.grade = rec.grade || state.grade;
    remember('user', 'Teach the lesson: ' + rec.title);
    remember('assistant', ('Lesson on ' + rec.title + ': ' + speechOf(rec.reply)).slice(0, 3000));
    await startLesson(rec.reply, { title: rec.title, chalk: rec.chalk });
  }

  function renderLibrary() {
    const list = $('#libList');
    const q = ($('#libSearch').value || '').trim().toLowerCase();
    const lf = $('#libLangFilter').value;
    const all = Native.lessons.list().sort((a, b) => (b.created || 0) - (a.created || 0));
    const items = all.filter(r => (!lf || r.lang === lf) &&
      (!q || [r.title, r.subject, r.grade].join(' ').toLowerCase().includes(q)));
    updateBadge();
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="lib-empty">${all.length ? 'No saved lesson matches.' : 'No saved lessons yet.<br>Every lesson from <b>Teach a Lesson</b> is saved here automatically and can be played without internet.'}</div>`;
      return;
    }
    for (const r of items) {
      const el = document.createElement('div');
      el.className = 'lesson-item';
      const date = r.created ? new Date(r.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      const L = langInfo(r.lang || 'en-IN');
      el.innerHTML = '<div class="li-main"><b></b><small></small></div><button class="li-play" title="Play lesson">▶</button><button class="li-del" title="Delete">🗑</button>';
      el.querySelector('b').textContent = r.title || 'Lesson';
      if (L.rtl) el.querySelector('b').dir = 'auto';
      el.querySelector('small').textContent = [r.grade, r.subject, L.native, (r.steps || '?') + ' steps' + (r.quizCount ? ' + quiz' : ''), date].filter(Boolean).join(' · ');
      el.querySelector('.li-play').onclick = () => playSaved(r.id);
      const del = el.querySelector('.li-del');
      del.onclick = () => {
        if (del.classList.contains('armed')) { Native.lessons.remove(r.id); renderLibrary(); toast('Lesson deleted'); return; }
        del.classList.add('armed'); del.textContent = 'Sure?';
        setTimeout(() => { del.classList.remove('armed'); del.textContent = '🗑'; }, 3000);
      };
      list.appendChild(el);
    }
  }

  let bulkStop = false;
  async function bulkPrepare() {
    const btn = $('#bulkStart'), status = $('#bulkStatus');
    if (btn.dataset.running) { bulkStop = true; btn.textContent = 'Stopping…'; return; }
    const topics = $('#bulkTopics').value.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 40);
    if (!topics.length) { toast('Write at least one topic'); return; }
    if (state.busy) { toast('Please wait — the AI teacher is busy'); return; }
    const base = { grade: $('#lGrade').value, subject: $('#lSubject').value, steps: +$('#lSteps').value, quiz: $('#lQuiz').checked, chalk: $('#lChalk').checked };
    state.busy = true; bulkStop = false;
    btn.dataset.running = '1'; btn.textContent = 'Stop';
    let ok = 0, failed = [];
    for (let i = 0; i < topics.length && !bulkStop; i++) {
      status.textContent = `Preparing ${i + 1} of ${topics.length}: ${topics[i]}…`;
      setStatus(`Preparing ${i + 1}/${topics.length}…`);
      try {
        const p = Object.assign({ topic: topics[i] }, base);
        state.history = [];   // each lesson is prepared on its own
        const reply = await generateLesson(p);
        Native.lessons.save(lessonRecord(p, reply));
        ok++;
        renderLibrary();
      } catch (e) {
        failed.push(topics[i]);
        if (isNetErr(e)) { status.textContent = friendlyError(e); break; }
      }
    }
    state.history = [];
    state.busy = false; setStatus('Ready');
    delete btn.dataset.running; btn.textContent = 'Prepare lessons';
    const left = topics.filter((t, i) => failed.includes(t) || i >= ok + failed.length);
    $('#bulkTopics').value = left.join('\n');
    if (!status.textContent.startsWith('No internet')) status.textContent = `✓ ${ok} lesson${ok === 1 ? '' : 's'} saved` + (left.length ? ` · ${left.length} left in the box — press again to retry` : '');
    toast(`${ok} lesson${ok === 1 ? '' : 's'} ready for offline use`);
  }

  function exportLessons() {
    const all = Native.lessons.list().map(m => Native.lessons.load(m.id)).filter(Boolean);
    if (!all.length) { toast('No saved lessons to export'); return; }
    const name = 'bhumika-lessons-' + new Date().toISOString().slice(0, 10) + '.json';
    const where = Native.exportFile(name, JSON.stringify({ app: 'bhumika-smart-class', version: 1, lessons: all }));
    toast(where ? `${all.length} lessons exported to ${where}` : 'Could not export the lessons', null, null, 5000);
  }

  function importLessons(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const list = Array.isArray(data) ? data : (data.lessons || [data]);
        let n = 0;
        for (const rec of list) {
          if (!rec || !rec.reply || !Array.isArray(rec.reply.steps) || !rec.title) continue;
          rec.id = String(rec.id || ('l' + Date.now().toString(36) + n)).replace(/[^A-Za-z0-9_-]/g, '_');
          if (Native.lessons.save(rec)) n++;
        }
        renderLibrary();
        toast(n ? `${n} lesson${n === 1 ? '' : 's'} imported` : 'No lessons found in that file', null, null, 4000);
      } catch (_) { toast('That file is not a Bhumika lesson file'); }
    };
    r.readAsText(file);
  }

  // Quick chips that look at the board
  async function chip(kind) {
    const lang = langInfo(state.lang).name;
    if (kind === 'explain_board' || kind === 'check_board') {
      const img = board.exportPage(board.pi, 'image/jpeg', 1280).split(',')[1];
      const q = kind === 'explain_board'
        ? `This is a photo of what is on our class board right now. Explain it to the class step by step in ${lang}, and write helpful notes on the board.`
        : `This is a photo of our class board with a student's work. Check whether the answer or working is correct. Praise what is right, gently point out any mistake, and show the correct method on the board, in ${lang}.`;
      const wasWrite = state.writeBoard;
      state.writeBoard = true;
      await ask(q, { image: img, display: kind === 'explain_board' ? '🖼 Explain the board' : '✔ Check the answer on the board' });
      state.writeBoard = wasWrite;
      return;
    }
    if (kind === 'quiz') return ask(`Give the class a short 4-question multiple-choice quiz${state.lastTopic ? ' on ' + state.lastTopic : ' on what we just discussed'}. Put the questions in "quiz" and say one line to introduce it.`, { display: '📝 Quiz on this topic' });
    if (kind === 'simpler') return ask('Please explain that again more simply, with an everyday example.', { display: '🙂 Explain more simply' });
  }

  // ---------------- classroom actions ----------------
  function runActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (!a || !a.do) continue;
      const v = a.value;
      switch (String(a.do).toLowerCase()) {
        case 'clear': board.clear(); break;
        case 'new_page': board.addPage(); break;
        case 'next_page': board.pi < board.pages.length - 1 ? board.goto(board.pi + 1) : board.addPage(); break;
        case 'prev_page': board.goto(board.pi - 1); break;
        case 'background': if (board.backgrounds[v]) board.setBg(v); break;
        case 'timer': Widgets.timer(Math.max(5, Math.min(7200, Number(a.seconds) || 60))); break;
        case 'picker': Widgets.picker(); break;
        case 'color': if (typeof v === 'string') board.setColor(v); break;
        case 'library': App.openLibrary(); break;
        case 'stop': Player.stop(); break;
        case 'tool': {
          const map = { pen: 'pen', highlighter: 'hl', eraser: 'eraser' };
          if (map[v]) App.setTool(map[v]);
          else if (Widgets[v]) Widgets[v]();
          break;
        }
      }
    }
  }

  /** Instant handling of the most common spoken commands (English + Hindi) without a network round trip. */
  function localCommand(t) {
    const s = t.toLowerCase().replace(/[.!?।]/g, '').trim();
    const done = (msg, fn) => { fn(); addMsg('ai', msg); return true; };
    if (/^(clear|erase|clean)( the)? (board|page|screen)$|^बोर्ड (साफ|क्लियर) (करो|करें|कर दो)$/.test(s)) return done('✓ Board cleared', () => board.clear());
    if (/^(new|add)( a)? page$|^नया (पेज|पन्ना)$/.test(s)) return done('✓ New page', () => board.addPage());
    if (/^next page$|^अगला (पेज|पन्ना)$/.test(s)) return done('✓ Next page', () => runActions([{ do: 'next_page' }]));
    if (/^(previous|prev|last) page$|^पिछला (पेज|पन्ना)$/.test(s)) return done('✓ Previous page', () => board.goto(board.pi - 1));
    if (/^(stop|be quiet|silence|चुप|रुको|बस)$/.test(s)) return done('✓ Stopped', () => Player.stop());
    const m = s.match(/(?:timer|टाइमर).*?(\d+)\s*(minute|min|मिनट|second|sec|सेकंड)|(\d+)\s*(minute|min|मिनट|second|sec|सेकंड).*?(?:timer|टाइमर)/);
    if (m) {
      const n = +(m[1] || m[3]), unit = m[2] || m[4];
      return done(`✓ Timer: ${n} ${unit}`, () => Widgets.timer(/sec|सेकंड/.test(unit) ? n : n * 60));
    }
    return false;
  }

  // ---------------- voice ----------------
  function say(text, onstart) {
    if (!state.voice || !text) return Promise.resolve('muted');
    return Native.speak(text, state.lang, state.rate, 1, onstart).then(r => {
      if (r === 'nolang') voiceMissing();
      return r;
    });
  }

  let warned = {};
  function voiceMissing() {
    if (warned[state.lang]) return;
    warned[state.lang] = 1;
    toast(`The ${langInfo(state.lang).name} voice isn't installed on this panel.`, 'Install voice', () => Native.openTtsSettings(), 8000);
  }

  function listen(onFinal) {
    Native.stopSpeaking();
    const ov = $('#listening'), heard = $('#heard');
    heard.textContent = 'Listening… (' + langInfo(state.lang).native + ')';
    ov.hidden = false;
    $('#micBtn').classList.add('on');
    let finalText = '';
    const close = () => { ov.hidden = true; $('#micBtn').classList.remove('on'); };
    $('#stopListen').onclick = () => { Native.stopListening(); close(); if (finalText) onFinal(finalText); };
    Native.listen(state.lang, (kind, text) => {
      if (kind === 'partial') { heard.textContent = text; $('#chatInput').value = text; }
      else if (kind === 'final') { finalText = text; heard.textContent = text; close(); if (text) onFinal(text); }
      else if (kind === 'error') { close(); toast(text, null, null, 5000); }
      else if (kind === 'end' && !Native.isApp) { setTimeout(() => { if (!ov.hidden) { close(); if (finalText) onFinal(finalText); } }, 400); }
    });
  }

  // ---------------- lesson / answer player ----------------
  const Player = {
    reply: null, i: 0, playing: false, run: 0, drawn: new Set(),

    async play(reply, { title, lesson } = {}) {
      this.stop(true);
      this.reply = reply; this.i = 0; this.drawn = new Set(); this.lesson = !!lesson;
      this.playing = true;
      const hasBoard = reply.steps.some(s => Array.isArray(s.board) && s.board.length);
      const showBar = lesson || reply.steps.length > 1 || hasBoard;
      $('#player').hidden = !showBar;
      this._ui();
      await this._loop();
    },

    async _loop() {
      const token = ++this.run;
      while (this.playing && this.reply && this.i < this.reply.steps.length) {
        const st = this.reply.steps[this.i] || {};
        this._ui();
        $('#caption').textContent = st.say || '';
        const rtl = !!langInfo(state.lang).rtl;
        $('#caption').dir = rtl ? 'rtl' : 'ltr';
        const writing = this.drawn.has(this.i) ? Promise.resolve()
          : board.write(Array.isArray(st.board) ? st.board : [], { rtl, speed: state.rate });
        this.drawn.add(this.i);
        const readDelay = () => new Promise(r => setTimeout(r, Math.min(9000, 1200 + (st.say || '').length * 45)));
        const talking = state.voice ? say(st.say || '').then(r => (r === 'nolang' || r === 'error') ? readDelay() : r) : readDelay();
        await Promise.all([writing, talking]);
        if (token !== this.run || !this.playing) return;
        await new Promise(r => setTimeout(r, 500));
        if (token !== this.run || !this.playing) return;
        this.i++;
      }
      if (token !== this.run) return;
      this.playing = false;
      this._ui();
      const q = this.reply && this.reply.quiz;
      if (Array.isArray(q) && q.length) {
        Widgets.quiz(q, { lang: state.lang });
      }
      if (!this.lesson) setTimeout(() => { if (!this.playing) $('#player').hidden = true; }, 2500);
    },

    pause() { this.playing = false; this.run++; Native.stopSpeaking(); board.finishAnims(); this._ui(); },
    resume() { if (!this.reply) return; if (this.i >= this.reply.steps.length) this.i = 0; this.playing = true; this._loop(); },
    toggle() { this.playing ? this.pause() : this.resume(); },
    next() { if (!this.reply) return; this.pause(); this.i = Math.min(this.reply.steps.length - 1, this.i + 1); this.resume(); },
    prev() { if (!this.reply) return; this.pause(); this.i = Math.max(0, this.i - 1); this.resume(); },
    stop(keepBar) { this.playing = false; this.run++; Native.stopSpeaking(); board && board.finishAnims(); if (!keepBar) { $('#player').hidden = true; this.reply = null; } },

    _ui() {
      const n = this.reply ? this.reply.steps.length : 0;
      $('#stepNo').textContent = n ? Math.min(this.i + 1, n) + ' / ' + n : '';
      const pp = $('#ppBtn');
      pp.innerHTML = App.icon(this.playing ? 'pause' : 'play');
      document.querySelector('#player .avatar').classList.toggle('talking', this.playing);
    }
  };

  // ---------------- settings ----------------
  function openSettings(msg) {
    $('#sKey').value = '';
    const has = Native.getSetting('apiKey') === 'SET';
    $('#sKey').placeholder = has ? '•••••••• (saved — leave empty to keep)' : 'sk-ant-…';
    $('#sKeyHint').textContent = msg || 'The key is stored only on this device. Get one at console.anthropic.com.';
    $('#sKeyHint').style.color = msg ? '#b45309' : '';
    $('#sModel').value = Native.getSetting('model');
    $('#sEndpoint').value = Native.getSetting('endpoint');
    $('#sRate').value = state.rate; $('#sRateLbl').textContent = state.rate.toFixed(2) + '×';
    $('#settings').hidden = false;
  }

  function saveSettings() {
    const k = $('#sKey').value.trim();
    if (k) Native.setSetting('apiKey', k);
    Native.setSetting('model', $('#sModel').value.trim());
    Native.setSetting('endpoint', $('#sEndpoint').value.trim());
    state.rate = +$('#sRate').value;
    persist();
    $('#settings').hidden = true;
    toast('Settings saved');
  }

  function persist() {
    try { localStorage.setItem('bh.teacher', JSON.stringify({ lang: state.lang, rate: state.rate, voice: state.voice, writeBoard: state.writeBoard, grade: state.grade })); } catch (_) {}
  }

  function restore() {
    try { Object.assign(state, JSON.parse(localStorage.getItem('bh.teacher') || '{}'), { history: [], busy: false }); } catch (_) {}
  }

  // ---------------- toast ----------------
  let toastT;
  function toast(text, actionLabel, action, ms = 2600) {
    const t = $('#toast');
    t.innerHTML = '';
    const s = document.createElement('span'); s.textContent = text; t.appendChild(s);
    if (actionLabel) { const b = document.createElement('button'); b.textContent = actionLabel; b.onclick = () => { t.hidden = true; action(); }; t.appendChild(b); }
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------------- init ----------------
  function init(b) {
    board = b;
    restore();
    const sel = $('#aiLang');
    sel.innerHTML = LANGS.map(l => `<option value="${l.code}">${l.native}${l.native !== l.name ? ' — ' + l.name : ''}</option>`).join('');
    sel.value = state.lang;
    sel.onchange = () => {
      state.lang = sel.value; persist();
      const st = Native.ttsLangStatus(state.lang);
      if (st === 'missing' || st === 'unsupported') { warned[state.lang] = 0; voiceMissing(); }
      else toast('Teaching language: ' + langInfo(state.lang).native);
    };
    const v = $('#aiVoice'); v.checked = state.voice;
    v.onchange = () => { state.voice = v.checked; if (!v.checked) Native.stopSpeaking(); persist(); };
    const wb = $('#writeBoard'); wb.checked = state.writeBoard;
    wb.onchange = () => { state.writeBoard = wb.checked; persist(); };

    $('#lGrade').innerHTML = GRADES.map(g => `<option>${g}</option>`).join('');
    $('#lGrade').value = state.grade;
    $('#lGrade').onchange = () => { state.grade = $('#lGrade').value; persist(); };
    $('#lSubject').innerHTML = SUBJECTS.map(g => `<option>${g}</option>`).join('');
    $('#lSteps').oninput = () => { $('#lStepsLbl').textContent = $('#lSteps').value + ' steps'; };
    $('#lStart').onclick = () => {
      const topic = $('#lTopic').value.trim();
      if (!topic) { $('#lTopic').focus(); toast('Type a topic first'); return; }
      teachLesson({ topic, grade: $('#lGrade').value, subject: $('#lSubject').value, steps: +$('#lSteps').value, quiz: $('#lQuiz').checked, chalk: $('#lChalk').checked, save: $('#lSave').checked });
    };

    // My Lessons
    $('#libLangFilter').innerHTML = '<option value="">All languages</option>' + LANGS.map(l => `<option value="${l.code}">${l.native}</option>`).join('');
    $('#libSearch').oninput = renderLibrary;
    $('#libLangFilter').onchange = renderLibrary;
    $('#bulkStart').onclick = bulkPrepare;
    $('#libExport').onclick = exportLessons;
    $('#libImport').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) importLessons(f); e.target.value = ''; };
    updateBadge();
    const net = () => { if (!state.busy) setStatus(navigator.onLine === false ? 'Offline — saved lessons available' : 'Ready'); };
    addEventListener('online', net); addEventListener('offline', net); net();

    const input = $('#chatInput');
    const send = () => { const t = input.value; input.value = ''; input.style.height = ''; ask(t); };
    $('#sendBtn').onclick = send;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
    $('#micBtn').onclick = () => listen(t => { input.value = ''; ask(t); });
    document.querySelectorAll('.chips button').forEach(b => b.onclick = () => chip(b.dataset.q));

    document.querySelector('#player .p-ctrl').addEventListener('click', e => {
      const p = e.target.closest('button')?.dataset.p;
      if (!p) return;
      if (p === 'mic') { Player.pause(); listen(t => ask(t)); return; }
      Player[p]();
    });

    $('#settingsBtn').onclick = () => openSettings();
    $('#sCancel').onclick = () => { $('#settings').hidden = true; };
    $('#sSave').onclick = saveSettings;
    $('#sRate').oninput = () => { $('#sRateLbl').textContent = (+$('#sRate').value).toFixed(2) + '×'; };
    $('#sTest').onclick = () => {
      const r = state.rate; state.rate = +$('#sRate').value;
      const samples = { 'hi-IN': 'नमस्ते बच्चों! आज हम कुछ नया सीखेंगे।', 'ur-IN': 'السلام علیکم بچو! آج ہم کچھ نیا سیکھیں گے۔', 'bn-IN': 'নমস্কার! আজ আমরা নতুন কিছু শিখব।', 'ta-IN': 'வணக்கம் குழந்தைகளே! இன்று புதியதாக கற்போம்.', 'te-IN': 'నమస్కారం పిల్లలూ! ఈ రోజు కొత్తది నేర్చుకుందాం.', 'mr-IN': 'नमस्कार मुलांनो! आज आपण काहीतरी नवीन शिकूया.', 'gu-IN': 'નમસ્તે બાળકો! આજે આપણે કંઈક નવું શીખીશું.', 'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਬੱਚਿਓ! ਅੱਜ ਅਸੀਂ ਕੁਝ ਨਵਾਂ ਸਿੱਖਾਂਗੇ।', 'kn-IN': 'ನಮಸ್ಕಾರ ಮಕ್ಕಳೇ! ಇಂದು ಹೊಸದನ್ನು ಕಲಿಯೋಣ.', 'ml-IN': 'നമസ്കാരം കുട്ടികളേ! ഇന്ന് പുതിയത് പഠിക്കാം.' };
      say(samples[state.lang] || 'Hello class! Today we are going to learn something new.').then(() => { state.rate = r; });
    };
    $('#sTts').onclick = () => Native.openTtsSettings();
  }

  window.Teacher = { init, ask, say, teachLesson, playSaved, renderLibrary, Player, toast, listen, state, openSettings };
})();

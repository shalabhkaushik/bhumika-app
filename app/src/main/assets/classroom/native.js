// Adapter over the Android bridge (window.Android). When the page is opened in a normal
// browser (for testing, or hosted on the website) it falls back to Web Speech APIs.
(function () {
  const A = window.Android;
  const BH = window.BH = window.BH || {};
  const ttsWaiters = {};
  const aiWaiters = {};
  let sttHandler = null;
  let seq = 0;

  // ---- callbacks from native ----
  BH.onTts = (id, state) => {
    if (id === 'engine') return;
    const w = ttsWaiters[id];
    if (!w) return;
    if (state === 'start') { w.onstart && w.onstart(); return; }
    delete ttsWaiters[id];
    w.resolve(state);
  };
  BH.onStt = (kind, text) => { sttHandler && sttHandler(kind, text); };
  BH.onAi = (id, status, text) => {
    const w = aiWaiters[id];
    if (!w) return;
    delete aiWaiters[id];
    status === 'ok' ? w.resolve(text) : w.reject(new Error(text));
  };

  const browserRecognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition;

  window.Native = {
    isApp: !!A,

    /** Speaks text; resolves 'done' | 'stopped' | 'error' | 'nolang'. */
    speak(text, lang, rate = 1, pitch = 1, onstart) {
      const id = 's' + (++seq);
      return new Promise(resolve => {
        if (!text || !text.trim()) return resolve('done');
        if (A) {
          ttsWaiters[id] = { resolve, onstart };
          A.speak(text, lang, rate, pitch, id);
        } else if (window.speechSynthesis) {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang; u.rate = rate; u.pitch = pitch;
          const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
          if (v) u.voice = v;
          u.onstart = () => onstart && onstart();
          u.onend = () => resolve('done');
          u.onerror = (e) => resolve(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'error');
          speechSynthesis.speak(u);
        } else resolve('error');
      });
    },

    stopSpeaking() {
      if (A) A.stopSpeaking();
      else if (window.speechSynthesis) speechSynthesis.cancel();
      Object.keys(ttsWaiters).forEach(k => { ttsWaiters[k].resolve('stopped'); delete ttsWaiters[k]; });
    },

    ttsLangStatus(lang) {
      if (A) return A.ttsLangStatus(lang);
      if (!window.speechSynthesis) return 'noengine';
      const vs = speechSynthesis.getVoices();
      return !vs.length || vs.some(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2))) ? 'ok' : 'missing';
    },

    openTtsSettings() { A && A.openTtsSettings(); },

    sttAvailable() { return A ? A.sttAvailable() : !!browserRecognizer(); },

    /** handler(kind, text): kind = ready | partial | final | end | error */
    listen(lang, handler) {
      sttHandler = handler;
      if (A) { A.startListening(lang); return; }
      const R = browserRecognizer();
      if (!R) { handler('error', 'Voice input is not supported in this browser.'); return; }
      const r = this._rec = new R();
      r.lang = lang; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = () => handler('ready', '');
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        handler(res.isFinal ? 'final' : 'partial', res[0].transcript);
      };
      r.onerror = (e) => handler('error', 'Voice input error: ' + e.error);
      r.onend = () => handler('end', '');
      r.start();
    },

    stopListening() { if (A) A.stopListening(); else if (this._rec) this._rec.stop(); },

    /** payload = {system, messages, max_tokens}; resolves to the model's text. */
    askAI(payload) {
      const id = 'a' + (++seq);
      if (A) {
        return new Promise((resolve, reject) => {
          aiWaiters[id] = { resolve, reject };
          A.askAI(JSON.stringify(payload), id);
        });
      }
      // Browser fallback — direct call with a locally stored key (testing only)
      const key = localStorage.getItem('bh.apiKey') || '';
      const endpoint = localStorage.getItem('bh.endpoint') || 'https://api.anthropic.com/v1/messages';
      if (!key && endpoint.includes('api.anthropic.com')) return Promise.reject(new Error('NO_KEY'));
      const body = Object.assign({ model: localStorage.getItem('bh.model') || 'claude-sonnet-5-5' }, payload);
      const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' };
      if (key) headers['x-api-key'] = key;
      return fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
        .then(async r => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + ((j.error && j.error.message) || ''));
          return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        });
    },

    getSetting(k) { return A ? A.getSetting(k) : (k === 'apiKey' ? (localStorage.getItem('bh.apiKey') ? 'SET' : '') : (localStorage.getItem('bh.' + k) || '')); },
    setSetting(k, v) { if (A) A.setSetting(k, v); else localStorage.setItem('bh.' + k, v); },

    /** Saves a PNG data URL. Returns where it went. */
    saveImage(dataUrl, name) {
      if (A) return A.saveImage(dataUrl, name);
      const a = document.createElement('a');
      a.href = dataUrl; a.download = name + '.png'; a.click();
      return 'Downloads';
    },

    // ---- saved lessons (offline library) ----
    lessons: {
      _ls() { try { return JSON.parse(localStorage.getItem('bh.lessons') || '{}'); } catch (_) { return {}; } },
      _put(o) { try { localStorage.setItem('bh.lessons', JSON.stringify(o)); return true; } catch (_) { return false; } },
      save(rec) {
        if (A) return A.saveLesson(rec.id, JSON.stringify(rec));
        const all = this._ls(); all[rec.id] = rec; return this._put(all);
      },
      list() {
        if (A) { try { return JSON.parse(A.listLessons()); } catch (_) { return []; } }
        return Object.values(this._ls()).map(r => { const m = Object.assign({}, r); delete m.reply; return m; });
      },
      load(id) {
        if (A) { try { return JSON.parse(A.loadLesson(id) || 'null'); } catch (_) { return null; } }
        return this._ls()[id] || null;
      },
      remove(id) {
        if (A) return A.deleteLesson(id);
        const all = this._ls(); delete all[id]; return this._put(all);
      }
    },

    /** Saves a text file for the user (Downloads/Bhumika in the app). Returns where it went. */
    exportFile(name, text) {
      if (A) return A.exportFile(name, text);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name; a.click();
      return 'Downloads';
    },

    openLibrary(url) {
      if (A) A.openLibrary(url);
      else window.open(url, '_blank');
    },
    openWebsite(url) { if (A) A.openWebsite(url); else location.href = url; },
    exit() { if (A) A.exit(); else history.back(); }
  };
})();

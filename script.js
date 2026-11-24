const LANGS = ['Java', 'Python', 'JavaScript', 'C++', 'C', 'HTML/CSS', 'SQL'];
const RANKS = [['Beginner', 0, 'Learning the basics.'], ['Novice', 1100, 'Solving easy problems reliably.'], ['Intermediate', 1300, 'Comfortable with common patterns.'],
  ['Advanced', 1500, 'Handles mixed difficulty.'], ['Expert', 1700, 'Strong across many topics.'], ['Master', 1900, 'Top of the arena.']];
const MODES = { blitz: ['Blitz', 15, 'Fast and high pressure.'], rapid: ['Rapid', 30, 'Balanced pace.'], classic: ['Classic', 0, 'No time limit. Focus on accuracy.'] };
const KEY = 'cca.v1', K = 32;
addEventListener('error', e => { document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;right:0;background:#7f1d1d;color:#fff;padding:8px;z-index:99">Script error: ${e.message}</pre>`); });
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (d = new Date()) => d.toISOString().slice(0, 10);

// ---- QuizAPI service: real multiple-choice programming questions, filtered by language tag (needs a free API key) ----
const DIFF_R = { easy: 900, medium: 1300, hard: 1700 }; // opponent rating used by Elo
const TTL = 6 * 36e5, KEYNAME = 'cca.key';
const DEFAULT_KEY = 'qa_sk_f23581d5462d71e9290d4e7d7a5ab8cb7cffde32'; // built-in key; a key saved in Settings overrides it
const apiKey = () => localStorage.getItem(KEYNAME) || DEFAULT_KEY;
const TAGS = { Java: ['java'], Python: ['python'], JavaScript: ['javascript'], 'C++': ['c++', 'cpp'], C: ['c'], 'HTML/CSS': ['html', 'css'], SQL: ['sql', 'mysql'] };
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dec = t => new DOMParser().parseFromString(t, 'text/html').body.textContent;
const hash = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.codePointAt(0)) | 0; return 'q' + (h >>> 0).toString(36); };
function parseQ(x) { // accepts QuizAPI's legacy and current shapes; single-correct questions only
  const text = dec(String(x.question || x.text || '')); if (!text) return null; let opts, ci = -1;
  if (x.answers && !Array.isArray(x.answers)) {
    const ks = Object.keys(x.answers).filter(k => x.answers[k]); opts = ks.map(k => dec(String(x.answers[k])));
    const cs = ks.filter(k => String(x.correct_answers?.[k + '_correct']) === 'true'); if (cs.length !== 1) return null; ci = ks.indexOf(cs[0]);
  } else {
    const arr = x.options || x.answers || x.choices; if (!Array.isArray(arr)) return null;
    opts = arr.map(a => dec(String(typeof a === 'string' ? a : a.text ?? a.answer ?? a.label ?? '')));
    const f = arr.map(a => typeof a === 'object' && (a.isCorrect === true || a.correct === true));
    if (f.filter(Boolean).length === 1) ci = f.indexOf(true);
    else if (Number.isInteger(x.correctAnswer)) ci = x.correctAnswer; else if (typeof x.correctAnswer === 'string') ci = opts.indexOf(dec(x.correctAnswer));
  }
  if (opts.length < 2 || ci < 0 || ci >= opts.length || opts.some(o => !o)) return null;
  const d = String(x.difficulty || 'medium').toLowerCase();
  const tags = [...new Set((Array.isArray(x.tags) ? x.tags : []).map(t => String(typeof t === 'string' ? t : t?.name || '').toLowerCase().trim()).filter(Boolean))];
  return { q: text, correct: opts[ci], opts: shuffle(opts), diff: DIFF_R[d] ? d : 'medium', tags };
}
const quizMem = {};
async function getQuiz(lang) {
  if (quizMem[lang]) return quizMem[lang];
  try { const c = JSON.parse(localStorage.getItem('cca.q2.' + lang)); if (c && Date.now() - c.t < TTL && c.q?.length) return (quizMem[lang] = c.q); } catch {}
  const key = apiKey(); if (!key) throw new Error('NOKEY');
  const all = [];
  for (const tag of TAGS[lang]) {
    const base = `https://quizapi.io/api/v1/questions?tags=${encodeURIComponent(tag)}&limit=50`;
    let r = await fetch(base, { headers: { Authorization: 'Bearer ' + key } }).catch(() => null);
    if (!r || r.status === 401 || r.status === 403) r = await fetch(base + '&apiKey=' + encodeURIComponent(key)).catch(() => null);
    if (!r) throw new Error('Could not reach QuizAPI (network or CORS problem)');
    if (r.status === 401 || r.status === 403) throw new Error('QuizAPI rejected your API key. Check it in Settings');
    if (r.status === 429) throw new Error('QuizAPI rate limit reached. Try again later');
    if (r.status === 404) continue;
    if (!r.ok) throw new Error('QuizAPI returned HTTP ' + r.status);
    const j = await r.json().catch(() => null), arr = Array.isArray(j) ? j : j?.data?.questions || j?.data || j?.questions || j?.results;
    if (!Array.isArray(arr)) throw new Error('QuizAPI sent a response in an unexpected format');
    all.push(...arr.map(parseQ).filter(Boolean));
  }
  const seen = new Set(), q = all.filter(x => !seen.has(x.q) && seen.add(x.q));
  if (!q.length) throw new Error(`QuizAPI has no usable ${lang} questions`);
  quizMem[lang] = q; try { localStorage.setItem('cca.q2.' + lang, JSON.stringify({ t: Date.now(), q })); } catch {}
  return q;
}

// ---------- storage ----------
const newUser = () => ({ elo: Object.fromEntries(LANGS.map(l => [l, 1000])), stats: Object.fromEntries(LANGS.map(l => [l, { done: 0, ok: 0, ms: 0 }])),
  history: [], sessions: [], seen: [], days: [], theme: 'dark', lang: 'Python', anim: true });
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d?.users?.[d.current]) return d; } catch {}
  return { current: 'Player', users: { Player: newUser() } };
}
let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Storage is full or blocked; progress will not be saved.'); } };
const me = () => db.users[db.current];
const overall = u => Math.round(LANGS.reduce((a, l) => a + u.elo[l], 0) / LANGS.length);
const rankIdx = r => RANKS.reduce((i, x, j) => (r >= x[1] ? j : i), 0);
const total = (u, f) => LANGS.reduce((a, l) => a + u.stats[l][f], 0);
const acc = u => (total(u, 'done') ? Math.round(100 * total(u, 'ok') / total(u, 'done')) : 0);
function streak(u) { let n = 0; const d = new Date(); if (!u.days.includes(day(d))) d.setDate(d.getDate() - 1);
  while (u.days.includes(day(d))) { n++; d.setDate(d.getDate() - 1); } return n; }

// ---------- ELO: E = 1/(1+10^((opp-r)/400)); new = r + K(S-E); opp = problem rating ----------
const expected = (r, opp) => 1 / (1 + 10 ** ((opp - r) / 400));
const nextElo = (r, opp, s) => Math.round(r + K * (s - expected(r, opp)));

const ACH = [['First Blood', 'Complete your first challenge', u => total(u, 'done') >= 1], ['Getting Started', 'Answer 10 questions', u => total(u, 'done') >= 10],
  ['Consistency', 'Practice 3 days in a row', u => streak(u) >= 3], ['Sharpshooter', '90% accuracy over 10+ questions', u => total(u, 'done') >= 10 && acc(u) >= 90],
  ['Rising Star', 'Reach Intermediate', u => rankIdx(overall(u)) >= 2], ['Code Master', 'Reach Master', u => rankIdx(overall(u)) >= 5]];
const unlocked = u => ACH.filter(a => a[2](u)).map(a => a[0]);

function toast(msg) { const t = document.createElement('div'); t.textContent = msg; $('#toast').append(t); setTimeout(() => t.remove(), 4000); }
function applyPrefs() { const u = me(); document.documentElement.dataset.theme = u.theme; document.body.classList.toggle('noanim', !u.anim); }

// ---------- shell ----------
const VIEWS = { dashboard: 'Dashboard', arena: 'Play Arena', practice: 'Practice', leaderboard: 'Leaderboard', stats: 'Statistics', profile: 'Profile', settings: 'Settings' };
$('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button data-view="${k}"><span>${v}</span></button>`).join('');
$('#nav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
$('#collapse').onclick = () => document.body.classList.toggle('slim');
let timer = null, S = null, charts = [];
function go(v) {
  clearInterval(timer); S = null; $('#view').onclick = null; charts.forEach(c => c.destroy()); charts = [];
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  setMe(); applyPrefs(); location.hash = v; views[v]();
}
function setMe() { const r = overall(me()); $('#me').innerHTML = `<b>${esc(db.current)}</b>${r} Elo · ${RANKS[rankIdx(r)][0]}`; }
const view = html => { $('#view').innerHTML = html; };
const skeleton = () => view('<h1>Loading problems</h1><p class="mute">Fetching questions…</p><div class="grid"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
const failure = (e, again) => { view(`<div class="empty"><h2>Could not load problems</h2><p>${esc(e.message)}. Check your connection, then retry.</p><br><button class="primary" id="retry">Retry</button></div>`);
  $('#retry').onclick = again; };
const stat = (l, v, sub = '') => `<div class="card"><div class="mute">${l}</div><div class="big">${v}</div>${sub}</div>`;
const bar = p => `<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div>`;
function prog(r) { const i = rankIdx(r), n = RANKS[i + 1]; return n ? (r - RANKS[i][1]) / (n[1] - RANKS[i][1]) : 1; }
function eloChart(el) {
  const h = me().history; if (!window.Chart || !h.length) { el.parentElement.innerHTML = '<div class="empty">Play a session to see your Elo history.</div>'; return; }
  charts.push(new Chart(el, { type: 'line', data: { labels: h.map(x => x.d), datasets: [{ label: 'Overall Elo', data: h.map(x => x.e), borderColor: '#22D3EE', tension: .3 }] }, options: { plugins: { legend: { display: false } } } }));
}

// ---------- views ----------
const views = {
  dashboard() {
    const u = me(), r = overall(u), i = rankIdx(r);
    view(`<h1>Welcome back, ${esc(db.current)}</h1><p class="mute">${RANKS[i][0]} · ${r} Elo · ${streak(u)}-day streak</p><div class="acts"><button class="primary" data-go="arena">Play now</button></div>
    <h2>Overview</h2><div class="grid">${stat('Questions answered', total(u, 'done'))}${stat('Accuracy', acc(u) + '%')}${stat('Elo', r)}${stat('Practice time', Math.round(total(u, 'ms') / 60000) + ' min')}</div>
    <h2>Language ratings</h2><div class="grid">${LANGS.map(l => { const e = u.elo[l], s = u.stats[l]; return `<div class="card"><b>${l}</b><div class="big">${e}</div><span class="badge">${RANKS[rankIdx(e)][0]}</span>${bar(prog(e))}<p class="mute">${s.done} done · ${s.done ? Math.round(100 * s.ok / s.done) : 0}% accuracy</p></div>`; }).join('')}</div>
    <h2>Elo progression</h2><div class="card"><canvas id="ch" height="90"></canvas></div>
    <h2>Daily challenge</h2><div class="card row"><span>One medium question in your default language, no clock.</span><button class="primary" data-daily>Start daily challenge</button></div>
    <h2>Recent activity</h2><div class="card">${u.sessions.length ? u.sessions.slice(-5).reverse().map(s => `<div class="row"><span>${s.d} · ${s.lang} · ${MODES[s.mode][0]}</span><span>${s.ok}/${s.items.length} solved · ${s.after - s.before >= 0 ? '+' : ''}${s.after - s.before} Elo</span></div>`).join('') : '<p class="mute">No sessions yet.</p>'}</div>`);
    eloChart($('#ch'));
  },
  arena() {
    const u = me(), c = { mode: 'rapid', lang: u.lang, diff: 'medium', n: 5 };
    const sync = () => { if (!$('#l')) return; c.lang = $('#l').value; c.tag = $('#t').value; c.diff = $('#d').value; c.n = +$('#n').value; };
    const draw = (msg = '') => view(`<h1>Play Arena</h1><p class="mute">Multiple-choice questions for the language you pick, from QuizAPI. You answer right here.</p>
      <div class="modes">${Object.entries(MODES).map(([k, m]) => `<button class="card mode ${c.mode === k ? 'on' : ''}" data-m="${k}"><b>${m[0]}</b>${m[1] ? m[1] + ' s per question' : 'No time limit'}<br><span class="mute">${m[2]}</span></button>`).join('')}</div>
      <div class="form"><label>Language<select id="l">${LANGS.map(l => `<option ${l === c.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Topic<select id="t"><option value="">Any topic</option></select></label><label>Difficulty<select id="d">${['easy', 'medium', 'hard'].map(d => `<option ${d === c.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Questions<input id="n" type="number" min="1" max="20" value="${c.n}"></label><button class="primary" id="start">Start session</button></div><p class="mute" id="err">${msg}</p>`);
    draw(); fillTopics(); $('#l').onchange = fillTopics;
    $('#view').onclick = e => {
      if (e.target.id === 'start') { sync(); return c.n >= 1 && c.n <= 20 ? begin(c) : ($('#err').textContent = 'Choose between 1 and 20 questions.'); }
      const m = e.target.closest('[data-m]'); if (m) { sync(); c.mode = m.dataset.m; draw(); fillTopics(); $('#l').onchange = fillTopics; }
    };
  },
  practice() {
    const u = me(), c = { lang: u.lang, diff: 'medium', n: 5 };
    view(`<h1>Practice</h1><p class="mute">Relaxed practice with no clock. Your Elo and stats do not change.</p>
      <div class="form"><label>Language<select id="l">${LANGS.map(l => `<option ${l === c.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Topic<select id="t"><option value="">Any topic</option></select></label><label>Difficulty<select id="d">${['easy', 'medium', 'hard'].map(d => `<option ${d === c.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Questions<input id="n" type="number" min="1" max="20" value="${c.n}"></label><button class="primary" id="start">Start practice</button></div><p class="mute" id="err"></p>`);
    fillTopics(); $('#l').onchange = fillTopics;
    $('#start').onclick = () => { const n = +$('#n').value; if (!(n >= 1 && n <= 20)) return ($('#err').textContent = 'Choose between 1 and 20 questions.');
      begin({ mode: 'classic', practice: true, lang: $('#l').value, tag: $('#t').value, diff: $('#d').value, n }, 'practice'); };
  },
  leaderboard() {
    const rows = Object.entries(db.users).map(([n, u]) => ({ n, r: overall(u), u })).sort((a, b) => b.r - a.r);
    view(`<h1>Local leaderboard</h1><p class="mute">Players on this browser only. A shared online board needs a backend (not included in this version).</p>
      <div class="podium">${rows.slice(0, 3).map((x, i) => `<div class="card p${i + 1}"><div class="mute">#${i + 1}</div><b>${esc(x.n)}</b><div class="big">${x.r}</div></div>`).join('')}</div><div class="card">${rows.map((x, i) => `<div class="row"><span>#${i + 1} ${esc(x.n)}</span><span>${x.r} Elo · ${total(x.u, 'done') ? acc(x.u) : 0}% win rate</span></div>`).join('')}</div>`);
  },
  stats() {
    const u = me(), t = total(u, 'done');
    if (!t) return view('<h1>Statistics</h1><div class="empty">No data yet. Finish a session in the Play Arena.</div>');
    view(`<h1>Statistics</h1><div class="grid">${stat('Correct', total(u, 'ok'))}${stat('Incorrect or unanswered', t - total(u, 'ok'))}${stat('Accuracy', acc(u) + '%')}${stat('Avg time per question', Math.round(total(u, 'ms') / t / 1000) + ' s')}</div>
      <h2>Elo history</h2><div class="card"><canvas id="ch" height="90"></canvas></div><h2>Per language</h2><div class="card">${LANGS.map(l => `<div class="row"><span>${l}</span><span>${u.stats[l].done} done · ${u.elo[l]} Elo</span></div>`).join('')}</div>`);
    eloChart($('#ch'));
  },
  profile() {
    const u = me(), r = overall(u), got = unlocked(u);
    view(`<h1>${esc(db.current)}</h1><p class="mute">${RANKS[rankIdx(r)][0]} · ${RANKS[rankIdx(r)][2]}</p>${bar(prog(r))}
      <div class="form"><label>Username<input id="nm" maxlength="16" value="${esc(db.current)}"></label><button id="ren">Save name</button><button id="new">Add player</button></div>
      <div class="grid">${stat('Elo', r)}${stat('Sessions', u.sessions.length)}${stat('Best session', u.sessions.length ? Math.max(...u.sessions.map(s => Math.round(100 * s.ok / s.items.length))) + '%' : '—')}</div>
      <h2>Achievements</h2><div class="grid">${ACH.map(a => `<div class="card ${got.includes(a[0]) ? '' : 'lock'}"><b>${a[0]}</b><p class="mute">${a[1]}</p>${got.includes(a[0]) ? '<span class="ok">Unlocked</span>' : 'Locked'}</div>`).join('')}</div>
      <h2>Session history</h2><div class="card">${u.sessions.length ? u.sessions.slice().reverse().map(s => `<div class="row"><span>${s.d} · ${s.lang}</span><span>${s.ok}/${s.items.length} · ${s.before} → ${s.after}</span></div>`).join('') : '<p class="mute">No sessions yet.</p>'}</div>`);
    const ok = n => /^[\w .-]{2,16}$/.test(n) && !db.users[n];
    $('#ren').onclick = () => { const n = $('#nm').value.trim(); if (n === db.current) return; if (!ok(n)) return toast('Use 2–16 letters, numbers, spaces, . _ - (name must be unused).');
      db.users[n] = db.users[db.current]; delete db.users[db.current]; db.current = n; save(); go('profile'); };
    $('#new').onclick = () => { const n = prompt('New player name'); if (n === null) return; if (!ok(n.trim())) return toast('Invalid or already used name.'); db.users[n.trim()] = newUser(); db.current = n.trim(); save(); go('profile'); };
  },
  settings() {
    const u = me(), others = Object.keys(db.users);
    view(`<h1>Settings</h1><div class="form"><label>Theme<select id="th"><option value="dark">Dark</option><option value="light" ${u.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
      <label>Default language<select id="dl">${LANGS.map(l => `<option ${l === u.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>QuizAPI key<input id="ak" type="password" value="${esc(localStorage.getItem(KEYNAME) || '')}" placeholder="Using built-in key"></label><label>Animations<select id="an"><option value="1">On</option><option value="0" ${u.anim ? '' : 'selected'}>Off</option></select></label>
      ${others.length > 1 ? `<label>Active player<select id="pl">${others.map(n => `<option ${n === db.current ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="acts"><button id="rs">Reset progress</button><button id="cl">Clear all saved data</button></div>`);
    $('#ak').onchange = e => { localStorage.setItem(KEYNAME, e.target.value.trim()); toast('API key saved'); };
    $('#th').onchange = e => { u.theme = e.target.value; save(); applyPrefs(); }; $('#dl').onchange = e => { u.lang = e.target.value; save(); };
    $('#an').onchange = e => { u.anim = e.target.value === '1'; save(); applyPrefs(); };
    $('#pl')?.addEventListener('change', e => { db.current = e.target.value; save(); go('settings'); });
    $('#rs').onclick = () => { if (confirm('Reset Elo, stats and history for this player?')) { db.users[db.current] = newUser(); save(); toast('Progress reset'); go('settings'); } };
    $('#cl').onclick = () => { if (confirm('Delete ALL saved data, including the cached problem list?')) { localStorage.removeItem(KEY); Object.keys(localStorage).filter(k => k.startsWith('cca.')).forEach(k => localStorage.removeItem(k)); db = load(); go('dashboard'); } };
  },
};

// ---------- game session ----------
async function fillTopics() {
  const t = $('#t'), l = $('#l'); if (!t || !l) return; const lang = l.value; t.innerHTML = '<option value="">Loading topics…</option>';
  let html = '<option value="">Any topic</option>';
  try { const cnt = {}, skip = new Set(TAGS[lang]); (await getQuiz(lang)).forEach(q => q.tags.forEach(g => { if (!skip.has(g)) cnt[g] = (cnt[g] || 0) + 1; }));
    html += Object.keys(cnt).sort().map(g => `<option value="${esc(g)}">${esc(g)} (${cnt[g]})</option>`).join(''); } catch {}
  if ($('#l')?.value === lang) t.innerHTML = html;
}
function keyForm(retry) {
  view(`<div class="q card"><h1>QuizAPI key needed</h1><p class="mute">Language-specific questions (Java, Python, SQL…) come from QuizAPI. Create a free account at quizapi.io, copy your API key, and paste it here. It is saved only in this browser.</p>
    <div class="form"><label>API key<input id="ak" type="password" autocomplete="off"></label><button class="primary" id="sv">Save and continue</button></div><p class="bad" id="er"></p></div>`);
  $('#sv').onclick = () => { const k = $('#ak').value.trim(); if (k.length < 8) return ($('#er').textContent = 'That key looks too short.'); localStorage.setItem(KEYNAME, k); retry(); };
}
async function begin(c, back = 'arena') {
  const u = me(); skeleton(); let qs;
  try { qs = await getQuiz(c.lang); } catch (e) { return e.message === 'NOKEY' ? keyForm(() => begin(c, back)) : failure(e, () => begin(c, back)); }
  qs = qs.map(x => ({ ...x, id: hash(x.q) })); if (c.tag) qs = qs.filter(x => x.tags.includes(c.tag)); if (!c.practice) qs = qs.filter(x => !u.seen.includes(x.id));
  const first = shuffle(qs.filter(x => x.diff === c.diff)), items = [...first, ...shuffle(qs.filter(x => x.diff !== c.diff))].slice(0, c.n);
  if (!items.length) return failure(new Error('No unseen questions match these filters. Try another topic, difficulty or language'), () => go(back));
  const note = first.length >= items.length ? '' : `Only ${Math.min(first.length, items.length)} ${c.diff} ${c.lang} question(s) are available; the rest are other difficulties.`;
  S = { ...c, items, i: 0, res: [], note, before: overall(u), startRank: rankIdx(overall(u)), startLang: u.elo[c.lang] }; ask();
}
function ask() {
  clearInterval(timer);
  if (S.i >= S.items.length) return finish();
  const p = S.items[S.i], lim = MODES[S.mode][1]; let left = lim, pick = null, locked = false; S.t0 = Date.now();
  view(`<div class="q card"><div class="row"><span>Question ${S.i + 1} of ${S.items.length} · ${MODES[S.mode][0]} · ${esc(S.lang)}</span><span class="timer" id="tm">${lim ? left : '∞'}</span></div>${bar(S.i / S.items.length)}
    <h1>${esc(p.q)}</h1><span class="badge">${p.diff}</span> ${p.tags.filter(t => !TAGS[S.lang].includes(t)).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${S.note && S.i === 0 ? `<p class="mute">${esc(S.note)}</p>` : ''}
    <div class="acts" style="flex-direction:column;margin-top:1rem">${p.opts.map((o, i) => `<button class="opt" data-o="${i}">${esc(o)}</button>`).join('')}</div><div id="fb"></div>
    <div class="acts" id="act"><button class="primary" id="sub" disabled>Submit answer</button><button id="sk">Skip</button><button class="ghost" id="ex">Exit</button></div></div>`);
  const settle = res => {
    if (locked) return; locked = true; clearInterval(timer);
    S.res.push({ ...p, res, ms: Date.now() - S.t0, pick: pick === null ? null : p.opts[pick] });
    document.querySelectorAll('[data-o]').forEach(b => { b.disabled = true; if (p.opts[b.dataset.o] === p.correct) b.classList.add('right'); else if (b.classList.contains('sel')) b.classList.add('wrong'); });
    $('#fb').innerHTML = `<p class="${res === 'ok' ? 'ok' : 'bad'}">${res === 'ok' ? 'Correct.' : res === 'no' ? 'Incorrect.' : 'No answer.'} The answer is: ${esc(p.correct)}</p>`;
    $('#act').innerHTML = `<button class="primary" id="nx">${S.i + 1 < S.items.length ? 'Next question' : 'See results'}</button>`;
    $('#nx').onclick = () => { S.i++; ask(); }; $('#nx').focus();
  };
  document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { if (locked) return; pick = +b.dataset.o;
    document.querySelectorAll('[data-o]').forEach(x => x.classList.toggle('sel', x === b)); $('#sub').disabled = false; });
  $('#sub').onclick = () => settle(p.opts[pick] === p.correct ? 'ok' : 'no'); $('#sk').onclick = () => settle(null);
  $('#ex').onclick = () => { if (confirm('Exit this session? Nothing will be saved.')) go('arena'); };
  if (lim) timer = setInterval(() => { left--; const t = $('#tm'); if (t) { t.textContent = left; t.classList.toggle('hot', left <= 5); } if (left <= 0) settle(null); }, 1000);
}
function finish() {
  if (S.practice) { const res = S.res, ok = res.filter(r => r.res === 'ok').length; S = null;
    return view(`<div class="q"><h1>Practice complete</h1><div class="grid">${stat('Correct', ok + ' / ' + res.length)}</div><p class="mute">Practice does not change your Elo.</p><h2>Review</h2><div class="card">${res.map(r => `<div class="row"><span>${esc(r.q)}</span><span class="${r.res === 'ok' ? 'ok' : 'bad'}">${r.res === 'ok' ? 'Correct' : esc(r.correct)}</span></div>`).join('')}</div><div class="acts"><button class="primary" data-go="practice">Practice again</button><button data-go="dashboard">Dashboard</button></div></div>`); }
  const u = me(), had = unlocked(u); let e = u.elo[S.lang];
  S.res.forEach(r => { e = nextElo(e, DIFF_R[r.diff], r.res === 'ok' ? 1 : 0); const s = u.stats[S.lang]; s.done++; s.ms += r.ms; if (r.res === 'ok') s.ok++; u.seen.push(r.id); });
  u.seen = u.seen.slice(-300); u.elo[S.lang] = e; if (!u.days.includes(day())) u.days.push(day());
  const after = overall(u), ok = S.res.filter(r => r.res === 'ok').length, bad = S.res.filter(r => r.res === 'no').length, none = S.res.length - ok - bad;
  u.sessions.push({ d: day(), lang: S.lang, mode: S.mode, ok, items: S.res.map(r => ({ id: r.id, res: r.res })), before: S.before, after }); u.history.push({ d: day(), e: after }); save();
  const up = rankIdx(after) > S.startRank, sum = { before: S.before, sl: S.startLang, n: S.res.length, res: S.res }; S = null; setMe();
  view(`<div class="q">${up ? `<div class="rankup"><h1>Rank up: ${RANKS[rankIdx(after)][0]}</h1></div>` : ''}<h1>Session results</h1>
    <div class="grid">${stat('Correct', `${ok} / ${sum.n}`)}${stat('Incorrect', bad)}${stat('Unanswered', none)}${stat('Language Elo', e, `<span class="${e >= sum.sl ? 'ok' : 'bad'}">${e - sum.sl >= 0 ? '+' : ''}${e - sum.sl}</span>`)}</div>
    <p class="mute">Overall Elo ${sum.before} → ${after}. Skipped and timed-out questions count as incorrect. The opponent rating is 900 (easy), 1300 (medium) or 1700 (hard).</p>
    <h2>Review</h2><div class="card">${sum.res.map(r => `<div class="row"><span>${esc(r.q)}</span><span class="${r.res === 'ok' ? 'ok' : 'bad'}">${r.res === 'ok' ? 'Correct' : esc(r.correct)}</span></div>`).join('')}</div>
    <div class="acts"><button class="primary" data-go="arena">Play again</button><button data-go="dashboard">Dashboard</button></div></div>`);
  ACH.filter(a => a[2](u) && !had.includes(a[0])).forEach(a => toast('Achievement unlocked: ' + a[0]));
}
document.addEventListener('click', e => { if (e.target.closest('[data-daily]')) return begin({ mode: 'classic', lang: me().lang, diff: 'medium', n: 1 }); const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
go(Object.keys(VIEWS).includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
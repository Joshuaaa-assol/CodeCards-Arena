const LANGS = ['Java', 'Python', 'JavaScript', 'C++', 'C#', 'C', 'HTML/CSS', 'SQL'];
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
const DEFAULT_KEY = window.CCA_CONFIG?.quizApiKey || ''; // comes from config.js (git-ignored); a key saved in Settings overrides it
const apiKey = () => localStorage.getItem(KEYNAME) || DEFAULT_KEY;
const TAGS = { Java: ['java'], Python: ['python'], JavaScript: ['javascript'], 'C++': ['c++', 'cpp', 'cplusplus'], 'C#': ['c#', 'csharp', 'c-sharp'], C: ['c', 'c-programming', 'clang'], 'HTML/CSS': ['html', 'css'], SQL: ['sql', 'mysql'] };
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
  const raw = [...(Array.isArray(x.tags) ? x.tags : []), x.category, x.categoryName, x.topic], tags = [...new Set(raw.map(t => String(typeof t === 'string' ? t : t?.name || '').toLowerCase().trim()).filter(t => t && !['code', 'programming', 'null', 'undefined'].includes(t)))];
  return { q: text, correct: opts[ci], opts: shuffle(opts), diff: DIFF_R[d] ? d : 'medium', tags };
}
const quizMem = {}, quizOff = {}; // question pool per language, and how far we've paged through each tag
// Some languages have no tag in the question bank (C often has none). For those we read the Programming category and keep only questions that clearly mention the language.
const KW = {
  C: t => (/\b(printf|scanf|malloc|calloc|realloc|stdio|stdlib|#include|sizeof|typedef|fopen|strcpy|strlen|segmentation fault)\b/i.test(t) || /\bin C\b|\bC (language|programming|program|code|compiler|standard)\b/.test(t)) && !/C\+\+|C#|\bJava|Python|JavaScript/.test(t),
  'C#': t => /\bC#|csharp|\.NET\b|\bLINQ\b|\bNuGet\b/i.test(t), 'C++': t => /c\+\+|\bstd::|\bcout\b|\bnullptr\b|\bconstexpr\b/i.test(t), Java: t => /\bjava\b(?!script)|\bJVM\b|System\.out|\bJDK\b/i.test(t),
  Python: t => /python|\bPEP ?8\b|\bpip\b/i.test(t), JavaScript: t => /javascript|node\.?js|\bES6\b/i.test(t), 'HTML/CSS': t => /\bhtml\b|\bcss\b|flexbox/i.test(t), SQL: t => /\bsql\b|\bGROUP BY\b|\bJOIN\b/i.test(t) };
const giveaway = q => { const m = Math.max(...q.opts.filter(o => o !== q.correct).map(o => o.length)); return q.correct.length > m && q.correct.length >= m * 1.4 && q.correct.length - m >= 12; }; // correct answer is obviously the longest
async function page(qs, off) { // one request to the question source; returns the raw question list, or null when there is nothing (404)
  const key = apiKey(), proxy = !key && SB; if (!key && !SB) throw new Error('NOKEY');
  const hdr = proxy ? { apikey: SB.key } : { Authorization: 'Bearer ' + key };
  const base = `${proxy ? SB.url + '/functions/v1/quiz' : 'https://quizapi.io/api/v1/questions'}?${qs}&limit=50&offset=${off}`;
  let r = await fetch(base, { headers: hdr }).catch(() => null);
  if (!proxy && (!r || r.status === 401 || r.status === 403)) r = await fetch(base + '&apiKey=' + encodeURIComponent(key)).catch(() => null);
  if (r && r.status === 400 && off === 0) r = await fetch(base.replace('&offset=0', ''), { headers: hdr }).catch(() => null);
  if (!r) throw new Error(proxy ? 'Could not reach the quiz function in Supabase. Deploy the Edge Function named "quiz" and turn off Verify JWT' : 'Could not reach the question service');
  if (r.status === 401 || r.status === 403) throw new Error(proxy ? 'The question function rejected the request (turn off Verify JWT for it in Supabase)' : 'The question service rejected the request');
  if (r.status === 429) throw new Error('Too many requests. Try again in a moment');
  if (r.status === 404) { const t = await r.clone().text().catch(() => ''); if (proxy && /function/i.test(t) && /not found/i.test(t)) throw new Error('The quiz function is not deployed in Supabase yet'); return null; }
  if (!r.ok) throw new Error('Question service returned HTTP ' + r.status);
  const j = await r.json().catch(() => null), arr = Array.isArray(j) ? j : j?.data?.questions || j?.data || j?.questions || j?.results;
  if (!Array.isArray(arr)) throw new Error('Unexpected response from the question service');
  return arr;
}
async function pull(lang) { // fetch up to 5 more pages; returns only usable questions we don't have yet
  const offs = quizOff[lang] ??= JSON.parse(localStorage.getItem('cca.off3.' + lang) || '{}'), have = new Set((quizMem[lang] || []).map(x => x.q)), got = [];
  const run = async (key, qs, keep) => {
    for (let n = 0; n < 5 && offs[key] !== -1; n++) {
      const off = offs[key] || 0, arr = await page(qs, off); if (!arr) { offs[key] = -1; break; }
      const nw = arr.map(parseQ).filter(x => x && !have.has(x.q) && have.add(x.q));
      offs[key] = arr.length && nw.length ? off + arr.length : -1; // nothing new means this source is used up
      got.push(...nw.filter(x => !giveaway(x) && keep(x)));
    }
  };
  for (const tag of TAGS[lang]) await run(tag, 'tags=' + encodeURIComponent(tag), () => true);
  if (KW[lang] && (offs.__fb || (!got.length && !(quizMem[lang] || []).length))) { offs.__fb = true; await run('__cat', 'category=Programming', x => KW[lang](x.q + ' ' + x.opts.join(' '))); }
  try { localStorage.setItem('cca.off3.' + lang, JSON.stringify(offs)); } catch {}
  return got;
}
async function getQuiz(lang, more = false) {
  if (!quizMem[lang]) { try { quizMem[lang] = JSON.parse(localStorage.getItem('cca.q3.' + lang)) || []; } catch { quizMem[lang] = []; } if (!Array.isArray(quizMem[lang])) quizMem[lang] = []; quizMem[lang] = quizMem[lang].filter(x => !giveaway(x)); }
  if (!quizMem[lang].length || more) {
    const got = await pull(lang); quizMem[lang] = [...quizMem[lang], ...got];
    try { localStorage.setItem('cca.q3.' + lang, JSON.stringify(quizMem[lang])); } catch {}
  }
  if (!quizMem[lang].length) throw new Error(`No ${lang} questions are available right now`);
  return quizMem[lang];
}
// ---------- storage ----------
const newUser = () => ({ elo: Object.fromEntries(LANGS.map(l => [l, 1000])), stats: Object.fromEntries(LANGS.map(l => [l, { done: 0, ok: 0, ms: 0 }])),
  history: [], sessions: [], seen: [], days: [], theme: 'dark', lang: 'Python', anim: true });
function normalizeUser(u) { u.elo ||= {}; u.stats ||= {}; u.history ||= []; u.sessions ||= []; u.seen ||= []; u.days ||= [];
  LANGS.forEach(l => { if (typeof u.elo[l] !== 'number') u.elo[l] = 1000; if (!u.stats[l]) u.stats[l] = { done: 0, ok: 0, ms: 0 }; }); }
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d?.users?.[d.current]) { Object.values(d.users).forEach(normalizeUser); return d; } } catch {}
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

// ---------- Supabase (optional): accounts (Auth) + global leaderboard through REST, no extra library ----------
// The Supabase URL and publishable key are public by design (Row Level Security protects the data), so they are built in. config files can override them.
const SB = { url: (window.CCA_CONFIG?.supabaseUrl || 'https://tnjnvrgfasophahwbhqu.supabase.co').replace(/\/$/, ''), key: window.CCA_CONFIG?.supabaseAnonKey || 'sb_publishable_W34kwVhB8qI8KqBKp7eLqg_hVW43MGz' };
let auth = null; try { auth = JSON.parse(localStorage.getItem('cca.auth')); } catch {}
const saveAuth = a => { auth = a; a ? localStorage.setItem('cca.auth', JSON.stringify(a)) : localStorage.removeItem('cca.auth'); };
async function authCall(path, body) {
  const r = await fetch(`${SB.url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'HTTP ' + r.status); return j;
}
const sessionFrom = j => ({ token: j.access_token, refresh: j.refresh_token, uid: j.user.id, email: j.user.email, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 });
async function freshToken() {
  if (!auth) return null;
  if (Date.now() > auth.exp) { try { saveAuth(sessionFrom(await authCall('token?grant_type=refresh_token', { refresh_token: auth.refresh }))); } catch { saveAuth(null); return null; } }
  return auth.token;
}
async function sbFetch(path, opt = {}) {
  const t = await freshToken(), bearer = t || (SB.key.startsWith('eyJ') ? SB.key : '');
  return fetch(`${SB.url}/rest/v1/${path}`, { ...opt, headers: { apikey: SB.key, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), 'Content-Type': 'application/json', ...opt.headers } });
}
let noDataCol = false;
async function pushPlayer(nick) {
  const u = me(), ts = new Date().toISOString(); u.ts = Date.parse(ts); save();
  const body = { id: auth.uid, nickname: nick, avatar: u.avatar || null, overall: overall(u), elos: u.elo, done: total(u, 'done'), ok: total(u, 'ok'), updated_at: ts };
  const data = { stats: u.stats, history: u.history.slice(-200), sessions: u.sessions.slice(-100), seen: u.seen.slice(-2000), days: u.days.slice(-120), theme: u.theme, lang: u.lang, anim: u.anim };
  const send = b => sbFetch('players?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(b) });
  if (!noDataCol) { const r = await send({ ...body, data }); if (r.status !== 400) return r; const t = await r.clone().text().catch(() => ''); if (!/data/i.test(t)) return r; noDataCol = true; toast('Run the new SQL in Supabase to sync full progress'); }
  return send(body);
}
async function syncPlayer() {
  if (!SB || !auth) return;
  try { const r = await pushPlayer(db.current); if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`); }
  catch (e) { toast('Could not save to Supabase: ' + e.message); }
}
const RCOL = ['#94A3B8', '#34D399', '#22D3EE', '#3B82F6', '#8B5CF6', '#FBBF24'];
const av = (src, name, cls = '') => src ? `<img class="av ${cls}" src="${esc(src)}" alt="">` : `<span class="av ${cls}">${esc((name || '?')[0].toUpperCase())}</span>`;
const rb = i => `<span class="rb" style="--c:${RCOL[i]}">${RANKS[i][0][0]}</span>`;
function reconcile(row) { // decides between the saved account data and this device's data: 'push', 'applied' or 'none'
  const u = me(), cloudTs = row?.updated_at ? Date.parse(row.updated_at) : 0, done = total(u, 'done');
  if (!row) return 'push';
  if (row.data && cloudTs > (u.ts || 0)) { Object.assign(u, row.data); if (row.elos) Object.assign(u.elo, row.elos); if (row.avatar) u.avatar = row.avatar; normalizeUser(u); u.ts = cloudTs; save(); return 'applied'; }
  if (!row.data) { if (done > 0 && done >= (row.done || 0)) return 'push'; if (done === 0 && row.elos) { Object.assign(u.elo, row.elos); if (row.avatar) u.avatar = row.avatar; save(); return 'applied'; } return 'none'; }
  return (u.ts || 0) > cloudTs ? 'push' : 'none';
}
async function loadRow() { try { const r = await sbFetch(`players?id=eq.${auth.uid}&select=*`); const j = r.ok ? await r.json() : null; return j ? (j[0] || null) : undefined; } catch { return undefined; } }
async function afterLogin(nickHint) {
  const row = await loadRow(), nick = row?.nickname || nickHint || auth.email.split('@')[0].slice(0, 16);
  if (!db.users[nick]) db.users[nick] = newUser(); db.current = nick; save();
  if (row !== undefined && reconcile(row) === 'push') await syncPlayer();
  go('dashboard');
}
async function pullCloud() { // keeps this device up to date with the account (other devices)
  if (!auth || S) return; const row = await loadRow(); if (row === undefined || S) return;
  if (row && row.nickname && row.nickname !== db.current && !db.users[row.nickname]) { db.users[row.nickname] = db.users[db.current]; delete db.users[db.current]; db.current = row.nickname; save(); }
  const act = reconcile(row); if (act === 'push') await syncPlayer();
  else if (act === 'applied') { setMe(); applyPrefs(); const v = location.hash.slice(1); if (['dashboard', 'stats', 'profile'].includes(v)) go(v); }
}
function authScreen() {
  document.body.classList.add('authing'); let mode = 'login';
  const draw = (msg = '') => {
    view(`<div class="authwrap"><img src="assets/logo.png?v=5" alt="Code Cards Arena"><div class="card"><h1>${mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <div class="form auth">${mode === 'signup' ? '<label>First name or nickname<input id="au_n" maxlength="16" autocomplete="nickname"></label>' : ''}
      <label>Email<input id="au_e" type="email" autocomplete="email"></label><label>Password<input id="au_p" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
      <button class="primary" id="au_go">${mode === 'login' ? 'Log in' : 'Create account'}</button></div><p class="${msg.startsWith('OK') ? 'ok' : 'bad'}" id="au_m">${esc(msg.replace(/^OK/, ''))}</p>
      <div class="acts" style="justify-content:space-between"><button class="ghost" id="au_sw">${mode === 'login' ? 'Create an account' : 'I have an account'}</button><button class="ghost" id="au_g">Continue as guest</button></div></div></div>`);
    $('#au_sw').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); };
    $('#au_g').onclick = () => { localStorage.setItem('cca.guest', '1'); document.body.classList.remove('authing'); go('dashboard'); };
    $('#au_go').onclick = async () => {
      const email = $('#au_e').value.trim(), pw = $('#au_p').value, nick = $('#au_n')?.value.trim() || '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return draw('Enter a valid email.'); if (pw.length < 6) return draw('Password needs 6 or more characters.');
      if (mode === 'signup' && !/^[\w .-]{2,16}$/.test(nick)) return draw('Name: 2–16 letters, numbers, spaces, . _ -');
      $('#au_go').disabled = true;
      try {
        const j = await authCall(mode === 'login' ? 'token?grant_type=password' : 'signup', mode === 'login' ? { email, password: pw } : { email, password: pw, data: { nickname: nick } });
        if (!j.access_token) return draw('OKAccount created. Check your email to confirm it, then log in.');
        saveAuth(sessionFrom(j)); await afterLogin(nick || j.user?.user_metadata?.nickname);
      } catch (e) { draw(e.message); }
    };
  };
  draw();
}

// ---------- shell ----------
const VIEWS = { dashboard: 'Dashboard', arena: 'Play Arena', practice: 'Practice', leaderboard: 'Leaderboard', stats: 'Statistics', profile: 'Profile', settings: 'Settings' };
const ICONS = { dashboard: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', arena: 'M13 2L3 14h8l-1 8 10-12h-8z', practice: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  leaderboard: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3', stats: 'M4 20V10M10 20V4M16 20v-8M22 20H2', profile: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' };
const SHORT = { dashboard: 'Home', arena: 'Play', practice: 'Practice', leaderboard: 'Ranks', stats: 'Stats', profile: 'Profile', settings: 'Settings' };
$('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button data-view="${k}" aria-label="${v}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k]}"/></svg><span class="l">${v}</span><span class="s">${SHORT[k]}</span></button>`).join('');
$('#nav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
$('#collapse').onclick = () => document.body.classList.toggle('slim');
let timer = null, S = null, charts = [];
function go(v) {
  clearInterval(timer); S = null; $('#view').onclick = null; document.body.classList.remove('authing'); charts.forEach(c => c.destroy()); charts = [];
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  setMe(); applyPrefs(); location.hash = v; views[v]();
}
function setMe() { const r = overall(me()); $('#me').innerHTML = `${av(me().avatar, db.current)}<div><b>${esc(db.current)}</b><span class="t">${r} Elo · ${RANKS[rankIdx(r)][0]}</span></div>`; }
const view = html => { $('#view').innerHTML = html; };
const skeleton = () => view('<div class="stats"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
const failure = (e, again) => { view(`<div class="empty"><h2>Could not load questions</h2><p>${esc(e.message)}.</p><br><button class="primary" id="retry">Retry</button></div>`);
  $('#retry').onclick = again; };
const notice = (t, m, back) => { view(`<div class="empty"><h2>${t}</h2><p>${esc(m)}</p><br><button class="primary" id="bk">Back</button></div>`); $('#bk').onclick = () => go(back); };
const stat = (l, v, sub = '') => `<div class="card"><div class="mute">${l}</div><div class="big">${v}</div>${sub}</div>`;
const bar = p => `<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div>`;
function prog(r) { const i = rankIdx(r), n = RANKS[i + 1]; return n ? (r - RANKS[i][1]) / (n[1] - RANKS[i][1]) : 1; }
function eloChart(el) {
  const h = me().history; if (!window.Chart || !h.length) { el.parentElement.innerHTML = '<div class="empty">Play a game to see your Elo history.</div>'; return; }
  const tk = { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(148,163,184,.1)' } };
  charts.push(new Chart(el, { type: 'line', data: { labels: h.map(x => x.d), datasets: [{ label: 'Overall Elo', data: h.map(x => x.e), borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,.12)', fill: true, tension: .3, pointRadius: 3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: tk, y: tk } } }));
}

// ---------- views ----------
let boardCache = null;
const played = (x, l) => x.elos?.[l] !== undefined && x.elos[l] !== 1000;
async function getBoard(force = false) { // one shared fetch for the leaderboard and dashboard (cached for a minute)
  if (!force && boardCache && Date.now() - boardCache.t < 60000) return boardCache.rows;
  let rows = Object.entries(db.users).map(([n, u]) => ({ id: null, n, avatar: u.avatar, overall: overall(u), elos: u.elo, done: total(u, 'done'), ok: total(u, 'ok') }));
  if (SB) {
    try { const r = await sbFetch('players?select=id,nickname,avatar,overall,elos,done,ok&order=overall.desc&limit=100'); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (Array.isArray(j)) rows = j.map(x => ({ id: x.id, n: x.nickname, avatar: x.avatar, overall: x.overall, elos: x.elos || {}, done: x.done || 0, ok: x.ok || 0 })); }
    catch (e) { toast('Could not load the leaderboard: ' + e.message); }
  }
  boardCache = { t: Date.now(), rows }; return rows;
}
async function fillLeaders() {
  if (!$('#leaders')) return; const rows = await getBoard(), el = $('#leaders'); if (!el) return;
  const best = (l) => [...(l ? rows.filter(x => played(x, l)) : rows)].sort((a, b) => (l ? b.elos[l] - a.elos[l] : b.overall - a.overall))[0];
  el.innerHTML = rows.length ? ['', ...LANGS].map(l => { const x = best(l); return `<div class="lead"><span class="ll">${l || 'Overall'}</span>${x ? `${av(x.avatar, x.n)}<b>${esc(x.n)}</b><span class="lv">${l ? x.elos[l] : x.overall}</span>` : '<span class="mute">No leader yet</span>'}</div>`; }).join('') : '<p class="mute">No players yet.</p>';
}

const views = {
  dashboard() {
    const u = me(), r = overall(u), i = rankIdx(r), nx = RANKS[i + 1];
    view(`<section class="hero"><div><span class="eyebrow">${rb(i)} ${RANKS[i][0]}</span><h1>Welcome back, ${esc(db.current)}</h1>
      <p class="mute">${r} Elo · ${streak(u)}-day streak</p>${bar(prog(r))}<p class="mute small">${nx ? nx[1] - r + ' Elo to ' + nx[0] : 'Top rank reached'}</p>
      <div class="acts"><button class="primary" data-go="arena">Play now</button><button data-daily>Daily challenge</button></div></div><img src="assets/logo.png?v=5" alt=""></section>
      <div class="stats">${stat('Answered', total(u, 'done'))}${stat('Accuracy', acc(u) + '%')}${stat('Elo', r)}${stat('Practice time', Math.round(total(u, 'ms') / 60000) + ' min')}</div>
      <div class="two"><div class="card"><h3>Elo progression</h3><div class="chartbox"><canvas id="ch"></canvas></div></div>
      <div class="card"><h3>Recent activity</h3>${u.sessions.length ? u.sessions.slice(-6).reverse().map(s => `<div class="row"><span>${s.lang}<br><span class="mute small">${s.d} · ${MODES[s.mode][0]}</span></span><span>${s.ok}/${s.items.length} · <span class="${s.after - s.before >= 0 ? 'ok' : 'bad'}">${s.after - s.before >= 0 ? '+' : ''}${s.after - s.before}</span></span></div>`).join('') : '<p class="mute">No games yet. Start your first one.</p>'}</div></div>
      <h2>Top players</h2><div class="card"><div class="leaders" id="leaders"><div class="sk"></div></div></div>
      <h2>Languages</h2><div class="langs">${LANGS.map(l => { const e = u.elo[l], s = u.stats[l]; return `<div class="card"><b>${l}</b><div class="big">${e}</div><span class="badge">${RANKS[rankIdx(e)][0]}</span>${bar(prog(e))}<p class="mute small">${s.done} answered · ${s.done ? Math.round(100 * s.ok / s.done) : 0}%</p></div>`; }).join('')}</div>`);
    eloChart($('#ch')); fillLeaders();
  },
  arena() {
    const u = me(), c = { mode: 'rapid', lang: u.lang, diff: 'medium', n: 5, tag: '' };
    const sync = () => { if (!$('#l')) return; c.lang = $('#l').value; c.tag = $('#t').value; c.diff = $('#d').value; c.n = +$('#n').value; };
    const draw = (msg = '') => view(`<div class="ph"><h1>Play Arena</h1><p class="mute">Choose a mode, then your language.</p></div>
      <div class="modes">${Object.entries(MODES).map(([k, m]) => `<button class="mode ${k} ${c.mode === k ? 'on' : ''}" data-m="${k}"><span class="chip">${m[1] ? m[1] + ' s' : 'No timer'}</span><b>${m[0]}</b><span class="mute">${m[2]}</span></button>`).join('')}</div>
      <div class="form"><label>Language<select id="l">${LANGS.map(l => `<option ${l === c.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Topic<select id="t"><option value="">Any topic</option></select></label><label>Difficulty<select id="d">${['easy', 'medium', 'hard'].map(d => `<option ${d === c.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Questions<input id="n" type="number" min="1" max="20" value="${c.n}"></label><button class="primary" id="start">Start session</button></div><p class="bad" id="err">${msg}</p>`);
    draw(); fillTopics(); $('#l').onchange = fillTopics;
    $('#view').onclick = e => {
      if (e.target.id === 'start') { sync(); return c.n >= 1 && c.n <= 20 ? begin(c) : ($('#err').textContent = 'Choose between 1 and 20 questions.'); }
      const m = e.target.closest('[data-m]'); if (m) { sync(); c.mode = m.dataset.m; draw(); fillTopics(); $('#l').onchange = fillTopics; }
    };
  },
  practice() {
    const u = me(), c = { lang: u.lang, diff: 'medium', n: 5 };
    view(`<div class="ph"><h1>Practice</h1><p class="mute">No timer. Your Elo stays the same.</p></div>
      <div class="form"><label>Language<select id="l">${LANGS.map(l => `<option ${l === c.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Topic<select id="t"><option value="">Any topic</option></select></label><label>Difficulty<select id="d">${['easy', 'medium', 'hard'].map(d => `<option ${d === c.diff ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Questions<input id="n" type="number" min="1" max="20" value="${c.n}"></label><button class="primary" id="start">Start practice</button></div><p class="bad" id="err"></p>`);
    fillTopics(); $('#l').onchange = fillTopics;
    $('#start').onclick = () => { const n = +$('#n').value; if (!(n >= 1 && n <= 20)) return ($('#err').textContent = 'Choose between 1 and 20 questions.');
      begin({ mode: 'classic', practice: true, lang: $('#l').value, tag: $('#t').value, diff: $('#d').value, n }, 'practice'); };
  },
  async leaderboard() {
    view('<div class="stats"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>');
    const rows = await getBoard(); let lang = '';
    const isMe = x => (x.id ? x.id === auth?.uid : x.n === db.current);
    const draw = () => {
      const val = x => (lang ? x.elos[lang] : x.overall), sorted = [...(lang ? rows.filter(x => played(x, lang)) : rows)].sort((a, b) => val(b) - val(a));
      const top = sorted[0] ? val(sorted[0]) : 1, low = Math.min(...sorted.map(val), 1000), span = Math.max(top - low, 1), mi = sorted.findIndex(isMe), order = [1, 0, 2].filter(i => sorted[i]);
      const crown = '<svg class="crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18h18l1-11-5 4-5-8-5 8-5-4z"/></svg>';
      view(`<div class="ph"><h1>Leaderboard</h1></div>
        <div class="chips">${['', ...LANGS].map(l => `<button class="chip2 ${l === lang ? 'on' : ''}" data-l="${l}">${l || 'Overall'}</button>`).join('')}</div>
        ${mi >= 0 ? `<div class="card yourrank"><div><span class="mute small">Your position${lang ? ' in ' + lang : ''}</span><div class="big">#${mi + 1} <span class="mute small">of ${sorted.length}</span></div></div><div class="rt"><b>${val(sorted[mi])} Elo</b><span class="mute small">${mi ? val(sorted[mi - 1]) - val(sorted[mi]) + ' Elo behind #' + mi : 'You lead the board'}</span></div></div>` : ''}
        ${sorted.length ? `<div class="podium">${order.map(i => { const x = sorted[i]; return `<div class="pod p${i + 1} ${isMe(x) ? 'mine' : ''}">${i === 0 ? crown : ''}<span class="rk">${i + 1}</span>${av(x.avatar, x.n, 'lg')}<b>${esc(x.n)}</b><span class="elo">${val(x)}</span><span class="mute small">${RANKS[rankIdx(val(x))][0]}</span></div>`; }).join('')}</div>
        ${sorted.length > 3 ? `<div class="lb">${sorted.slice(3).map((x, i) => `<div class="lrow ${isMe(x) ? 'mine' : ''}"><span class="rk2">${i + 4}</span>${av(x.avatar, x.n)}<div class="nm"><b>${esc(x.n)}</b><span class="mute small">${RANKS[rankIdx(val(x))][0]}${lang ? '' : ' · ' + (x.done ? Math.round(100 * x.ok / x.done) : 0) + '% correct'}</span><div class="bar"><i style="width:${Math.round(8 + 92 * (val(x) - low) / span)}%"></i></div></div><span class="ev">${val(x)}</span></div>`).join('')}</div>` : ''}`
        : `<div class="empty">No one is ranked in ${lang} yet. Be the first.<br><br><button class="primary" data-go="arena">Play now</button></div>`}`);
    };
    draw(); $('#view').onclick = e => { const c = e.target.closest('[data-l]'); if (c) { lang = c.dataset.l; draw(); } };
  },
  stats() {
    const u = me(), t = total(u, 'done');
    if (!t) return view('<div class="ph"><h1>Statistics</h1></div><div class="empty">Play a game to see your stats.</div>');
    view(`<div class="ph"><h1>Statistics</h1></div><div class="stats">${stat('Correct', total(u, 'ok'))}${stat('Incorrect', t - total(u, 'ok'))}${stat('Accuracy', acc(u) + '%')}${stat('Avg time', Math.round(total(u, 'ms') / t / 1000) + ' s')}</div>
      <div class="two"><div class="card"><h3>Elo history</h3><div class="chartbox"><canvas id="ch"></canvas></div></div><div class="card"><h3>By language</h3>${LANGS.map(l => `<div class="row"><span>${l}</span><span>${u.stats[l].done} · <b>${u.elo[l]}</b></span></div>`).join('')}</div></div>`);
    eloChart($('#ch'));
  },
  profile() {
    const u = me(), r = overall(u), ri = rankIdx(r), got = unlocked(u);
    view(`<div class="card prof">${av(u.avatar, db.current, 'big')}<div><h1>${esc(db.current)}</h1><p class="mute">${auth ? esc(auth.email) : 'Guest'} · ${RANKS[ri][0]} · ${r} Elo</p>${bar(prog(r))}</div></div>
      <div class="form"><label>Nickname<input id="nm" maxlength="16" value="${esc(db.current)}"></label><button id="ren">Save nickname</button><label>Profile photo<input id="ph" type="file" accept="image/*"></label>
      ${auth ? '<button id="out">Log out</button>' : SB ? '<button id="in">Log in / create account</button>' : ''}</div>
      <h2>Rank badges</h2><div class="grid">${RANKS.map((x, i) => `<div class="card ${i <= ri ? '' : 'lock'}">${rb(i)} <b>${x[0]}</b><p class="mute">${x[1]}+ Elo</p></div>`).join('')}</div>
      <h2>Achievements</h2><div class="grid">${ACH.map(a => `<div class="card ${got.includes(a[0]) ? '' : 'lock'}"><b>${a[0]}</b><p class="mute">${a[1]}</p>${got.includes(a[0]) ? '<span class="ok">Unlocked</span>' : 'Locked'}</div>`).join('')}</div>
      <h2>Stats</h2><div class="grid">${stat('Sessions', u.sessions.length)}${stat('Questions', total(u, 'done'))}${stat('Accuracy', acc(u) + '%')}${stat('Best session', u.sessions.length ? Math.max(...u.sessions.map(s => Math.round(100 * s.ok / s.items.length))) + '%' : '—')}</div>
      <h2>Session history</h2><div class="card">${u.sessions.length ? u.sessions.slice().reverse().map(s => `<div class="row"><span>${s.d} · ${s.lang}</span><span>${s.ok}/${s.items.length} · ${s.before} → ${s.after}</span></div>`).join('') : '<p class="mute">No sessions yet.</p>'}</div>`);
    const ok = n => /^[\w .-]{2,16}$/.test(n) && !db.users[n];
    $('#ren').onclick = async () => { const n = $('#nm').value.trim(); if (n === db.current) return; if (!ok(n)) return toast('Use 2–16 letters, numbers, spaces, . _ - (name must be unused).');
      if (SB && auth) { try { const r = await pushPlayer(n); if (r.status === 409) return toast('That nickname is taken.'); if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`); } catch (e) { return toast('Could not save nickname: ' + e.message); } }
      db.users[n] = db.users[db.current]; delete db.users[db.current]; db.current = n; save(); go('profile'); };
    $('#out')?.addEventListener('click', () => { saveAuth(null); localStorage.removeItem('cca.guest'); location.reload(); });
    $('#in')?.addEventListener('click', () => { localStorage.removeItem('cca.guest'); location.reload(); });
    $('#ph').onchange = e => { const f = e.target.files[0]; if (!f || !f.type.startsWith('image/') || f.size > 5e6) return toast('Choose an image under 5 MB.');
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 128; const m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 128, 128); URL.revokeObjectURL(url); u.avatar = c.toDataURL('image/jpeg', .8); save(); syncPlayer(); go('profile'); };
      img.onerror = () => toast('Could not read that image.'); img.src = url; };
  },
  settings() {
    const u = me(), others = Object.keys(db.users);
    view(`<h1>Settings</h1><div class="form"><label>Theme<select id="th"><option value="dark">Dark</option><option value="light" ${u.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
      <label>Default language<select id="dl">${LANGS.map(l => `<option ${l === u.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Animations<select id="an"><option value="1">On</option><option value="0" ${u.anim ? '' : 'selected'}>Off</option></select></label>
      ${others.length > 1 ? `<label>Active player<select id="pl">${others.map(n => `<option ${n === db.current ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}</div>
      <div class="acts"><button id="rs">Reset progress</button><button id="cl">Clear all saved data</button></div>`);
    $('#th').onchange = e => { u.theme = e.target.value; save(); applyPrefs(); }; $('#dl').onchange = e => { u.lang = e.target.value; save(); };
    $('#an').onchange = e => { u.anim = e.target.value === '1'; save(); applyPrefs(); };
    $('#pl')?.addEventListener('change', e => { db.current = e.target.value; save(); go('settings'); });
    $('#rs').onclick = () => { if (confirm('Reset Elo, stats and history for this player?')) { db.users[db.current] = newUser(); save(); toast('Progress reset'); syncPlayer().then(() => { boardCache = null; }); go('settings'); } };
    $('#cl').onclick = () => { if (confirm('Delete all saved data on this device?')) { Object.keys(localStorage).filter(k => k.startsWith('cca.')).forEach(k => localStorage.removeItem(k)); location.reload(); } };
  },
};


async function fillTopics() {
  const t = $('#t'), l = $('#l'); if (!t || !l) return; const lang = l.value, keep = t.value; t.innerHTML = '<option value="">Loading topics…</option>';
  let html = '<option value="">Any topic</option>';
  try {
    const cnt = {}, skip = new Set([...TAGS[lang], lang.toLowerCase()]); (await getQuiz(lang)).forEach(q => q.tags.forEach(g => { if (!skip.has(g)) cnt[g] = 1; }));
    const names = Object.keys(cnt).sort(); html += names.length ? names.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('') : '<option value="" disabled>(no topics)</option>';
  } catch { html += '<option value="" disabled>(topics unavailable)</option>'; }
  if ($('#l')?.value === lang) { t.innerHTML = html; if ([...t.options].some(o => o.value === keep)) t.value = keep; }
}
async function begin(c, back = 'arena') {
  const u = me(); skeleton(); let qs;
  const filt = l => (c.tag ? l.filter(x => x.tags.includes(c.tag)) : l), isNew = x => !u.seen.includes(hash(x.q));
  try {
    qs = await getQuiz(c.lang);
    for (let i = 0; i < 5 && filt(qs).filter(isNew).length < c.n; i++) { const n = qs.length; qs = await getQuiz(c.lang, true); if (qs.length === n) break; } // page for more new questions
  } catch (e) { return failure(e, () => begin(c, back)); }
  const all = filt(qs).map(x => ({ ...x, id: hash(x.q) }));
  if (!all.length) return notice('No questions for this topic', `There are no ${c.lang} questions${c.tag ? ' for "' + c.tag + '"' : ''}. Try another topic or language.`, back);
  const pool = all.filter(isNew);
  if (!pool.length) { view(`<div class="empty"><h2>You have answered them all</h2><p>No new ${esc(c.lang)} questions are left${c.tag ? ' for this topic' : ''}.</p><div class="acts" style="justify-content:center"><button class="primary" id="rst">Start over with repeats</button><button id="bk">Back</button></div></div>`);
    $('#rst').onclick = () => { u.seen = []; save(); begin(c, back); }; $('#bk').onclick = () => go(back); return; }
  const first = shuffle(pool.filter(x => x.diff === c.diff)), items = [...first, ...shuffle(pool.filter(x => x.diff !== c.diff))].slice(0, c.n);
  const short = items.length < c.n ? `Only ${items.length} new ${c.lang}${c.tag ? ' "' + c.tag + '"' : ''} question(s) left, so this session has ${items.length}.` : '';
  const dn = first.length >= items.length ? '' : `Some questions are ${first.length ? 'from other difficulties' : 'not ' + c.diff}.`;
  const note = [short, dn].filter(Boolean).join(' ');
  S = { ...c, items, i: 0, res: [], note, before: overall(u), startRank: rankIdx(overall(u)), startLang: u.elo[c.lang] }; ask();
}
function ask() {
  clearInterval(timer);
  if (S.i >= S.items.length) return finish();
  const p = S.items[S.i], lim = MODES[S.mode][1]; let left = lim, pick = null, locked = false; S.t0 = Date.now();
  view(`<div class="q card"><div class="row"><span>Question ${S.i + 1} of ${S.items.length} · ${MODES[S.mode][0]} · ${esc(S.lang)}</span><span class="timer" id="tm">${lim ? left : '∞'}</span></div>${bar(S.i / S.items.length)}
    <h1>${esc(p.q)}</h1><span class="badge">${p.diff}</span> ${p.tags.filter(t => !TAGS[S.lang].includes(t)).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${S.note && S.i === 0 ? `<p class="note">${esc(S.note)}</p>` : ''}
    <div class="opts">${p.opts.map((o, i) => `<button class="opt" data-o="${i}"><i>${'ABCDEFGH'[i]}</i><span>${esc(o)}</span></button>`).join('')}</div><div id="fb"></div>
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
  if (S.practice) { const res = S.res, ok = res.filter(r => r.res === 'ok').length, pu = me(); res.forEach(r => pu.seen.push(r.id)); pu.seen = pu.seen.slice(-3000); save(); S = null;
    return view(`<div class="q"><h1>Practice complete</h1><div class="grid">${stat('Correct', ok + ' / ' + res.length)}</div><h2>Review</h2><div class="card">${res.map(r => `<div class="row"><span>${esc(r.q)}</span><span class="${r.res === 'ok' ? 'ok' : 'bad'}">${r.res === 'ok' ? 'Correct' : esc(r.correct)}</span></div>`).join('')}</div><div class="acts"><button class="primary" data-go="practice">Practice again</button><button data-go="dashboard">Dashboard</button></div></div>`); }
  const u = me(), had = unlocked(u); let e = u.elo[S.lang];
  S.res.forEach(r => { e = nextElo(e, DIFF_R[r.diff], r.res === 'ok' ? 1 : 0); const s = u.stats[S.lang]; s.done++; s.ms += r.ms; if (r.res === 'ok') s.ok++; u.seen.push(r.id); });
  u.seen = u.seen.slice(-3000); u.elo[S.lang] = e; if (!u.days.includes(day())) u.days.push(day());
  const after = overall(u), ok = S.res.filter(r => r.res === 'ok').length, bad = S.res.filter(r => r.res === 'no').length, none = S.res.length - ok - bad;
  u.sessions.push({ d: day(), lang: S.lang, mode: S.mode, ok, items: S.res.map(r => ({ id: r.id, res: r.res })), before: S.before, after }); u.history.push({ d: day(), e: after }); save(); syncPlayer().then(() => { boardCache = null; });
  const up = rankIdx(after) > S.startRank, sum = { before: S.before, sl: S.startLang, n: S.res.length, res: S.res }; S = null; setMe();
  view(`<div class="q">${up ? `<div class="rankup"><h1>Rank up: ${RANKS[rankIdx(after)][0]}</h1></div>` : ''}<h1>Session results</h1>
    <div class="grid">${stat('Correct', `${ok} / ${sum.n}`)}${stat('Incorrect', bad)}${stat('Unanswered', none)}${stat('Language Elo', e, `<span class="${e >= sum.sl ? 'ok' : 'bad'}">${e - sum.sl >= 0 ? '+' : ''}${e - sum.sl}</span>`)}</div>
    <p class="mute">Overall Elo ${sum.before} → ${after}</p>
    <h2>Review</h2><div class="card">${sum.res.map(r => `<div class="row"><span>${esc(r.q)}</span><span class="${r.res === 'ok' ? 'ok' : 'bad'}">${r.res === 'ok' ? 'Correct' : esc(r.correct)}</span></div>`).join('')}</div>
    <div class="acts"><button class="primary" data-go="arena">Play again</button><button data-go="dashboard">Dashboard</button></div></div>`);
  ACH.filter(a => a[2](u) && !had.includes(a[0])).forEach(a => toast('Achievement unlocked: ' + a[0]));
}
document.addEventListener('click', e => { if (e.target.closest('[data-daily]')) return begin({ mode: 'classic', lang: me().lang, diff: 'medium', n: 1 }); const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
if (SB && !auth && !localStorage.getItem('cca.guest')) authScreen();
else go(Object.keys(VIEWS).includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard');
if (auth) freshToken().then(t => { if (!t) location.reload(); else pullCloud(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullCloud(); });
// Codeforces service: fetch, validate, cache, filter. No UI code here.
const URL_ = 'https://codeforces.com/api/problemset.problems';
const KEY = 'cca.cf', TTL = 6 * 36e5;
let mem = null, pending = null;

export function validate(json) {
  if (!json || json.status !== 'OK' || !Array.isArray(json.result?.problems)) throw new Error('Unexpected response from Codeforces');
  return json.result.problems
    .filter(p => Number.isInteger(p.contestId) && p.index && p.name && Number.isInteger(p.rating) && Array.isArray(p.tags))
    .map(p => ({ id: `${p.contestId}${p.index}`, name: p.name, rating: p.rating, tags: p.tags,
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}` }));
}

export async function getProblems(force = false) {
  if (mem && !force) return mem;
  if (!force) {
    try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && Date.now() - c.t < TTL && c.p?.length) return (mem = c.p); } catch {}
  }
  if (pending) return pending; // one request at a time
  pending = (async () => {
    try {
      const r = await fetch(URL_);
      if (!r.ok) throw new Error('Codeforces returned HTTP ' + r.status);
      const p = validate(await r.json());
      if (!p.length) throw new Error('No rated problems were returned');
      mem = p;
      try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), p })); } catch {}
      return p;
    } finally { pending = null; }
  })();
  return pending;
}

export const filterProblems = (ps, { q = '', min = 0, max = 4000, tag = '' } = {}) =>
  ps.filter(p => p.rating >= min && p.rating <= max && (!tag || p.tags.includes(tag)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
export const allTags = ps => [...new Set(ps.flatMap(p => p.tags))].sort();

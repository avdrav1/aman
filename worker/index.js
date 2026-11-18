/* The site's Worker. Static files in public/ are served first; this only runs for paths that are not a file.
   POST /api/event stores anonymous playtest events in D1. Everything else falls through to the static 404. */
const KINDS = new Set(['start', 'resume', 'season', 'act', 'crisis', 'dispute', 'council', 'vote', 'battle', 'choice', 'over', 'leave', 'abandon', 'optout']);
const ID = /^[A-Za-z0-9-]{8,40}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/api/event') return env.ASSETS.fetch(req);
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    const body = await req.text();
    if (body.length > 32768) return new Response('Too large', { status: 413 });
    let d; try { d = JSON.parse(body); } catch (e) { return new Response('Bad JSON', { status: 400 }); }
    if (!d || !ID.test(d.pid || '') || (d.gid && !ID.test(d.gid)) || !Array.isArray(d.ev) || d.ev.length > 50) return new Response('Bad batch', { status: 400 });
    const at = Date.now(), rows = [];
    for (const e of d.ev) {
      if (!e || !KINDS.has(e.k)) continue;
      const data = JSON.stringify(e.d || {});
      if (data.length > 4000) continue;
      rows.push(env.DB.prepare('INSERT INTO events (at, pid, gid, k, turn, act, d) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(at, d.pid, d.gid || null, e.k, Number.isInteger(e.turn) ? e.turn : null, Number.isInteger(e.act) ? e.act : null, data));
    }
    if (rows.length) await env.DB.batch(rows);
    return new Response(null, { status: 204 });
  }
};

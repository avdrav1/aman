/* Reads the playtest events from D1 and prints a summary: who played, how far they got, where they stopped, battles, and which actions they used.
   Needs a Cloudflare login for wrangler (npx wrangler login).
   Run: node tools/playtests.js [--local] [--days N]
   --local reads the database that `npx wrangler dev` writes to, for testing. */
const { execFileSync } = require('child_process');

const local = process.argv.includes('--local');
const di = process.argv.indexOf('--days'), days = di > 0 ? +process.argv[di + 1] : 0;
const since = days ? Date.now() - days * 864e5 : 0;

function q(sql) {
  const out = execFileSync('npx', ['-y', 'wrangler@4', 'd1', 'execute', 'aman-events', local ? '--local' : '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: __dirname + '/..' });
  return JSON.parse(out)[0].results;
}
const W = 'at >= ' + since;
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
function median(xs) { if (!xs.length) return '-'; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

/* One row per game: how far it got, how it ended, and the last thing that happened. */
const games = q(`SELECT gid, pid, MIN(at) t0, MAX(at) t1, MAX(turn) turn, MAX(act) act,
    MAX(CASE WHEN k = 'over' THEN json_extract(d, '$.result') END) result,
    MAX(CASE WHEN k = 'abandon' THEN 1 ELSE 0 END) abandoned,
    (SELECT e2.k || ':' || COALESCE(json_extract(e2.d, '$.phase'), '') FROM events e2 WHERE e2.gid = e.gid ORDER BY e2.id DESC LIMIT 1) last
  FROM events e WHERE gid IS NOT NULL AND ${W} GROUP BY gid`);
const players = new Set(games.map(g => g.pid)).size;
const done = games.filter(g => g.result), quit = games.filter(g => !g.result);
console.log('Playtests' + (days ? ' in the last ' + days + ' days' : '') + (local ? ' (local)' : ''));
console.log('  ' + players + ' players, ' + games.length + ' games, ' + done.length + ' finished, ' + quit.filter(g => g.abandoned).length + ' abandoned for a new game');
const res = {}; done.forEach(g => { res[g.result] = (res[g.result] || 0) + 1; });
console.log('  endings: ' + (Object.keys(res).map(k => k + ' ' + res[k]).join(', ') || 'none yet'));
console.log('  seasons reached: median ' + median(games.map(g => g.turn || 1)) + ', finished games ' + median(done.map(g => g.turn)) + ', unfinished ' + median(quit.map(g => g.turn || 1)));
console.log('  minutes per game: median ' + median(games.map(g => Math.round((g.t1 - g.t0) / 6e4))));

/* Where unfinished games stopped, by act and season. */
const stop = {};
quit.forEach(g => { const k = 'act ' + (g.act || 1) + ', season ' + (g.turn || 1); stop[k] = (stop[k] || 0) + 1; });
console.log('  unfinished games stopped at: ' + (Object.keys(stop).sort((a, b) => stop[b] - stop[a]).slice(0, 8).map(k => k + ' (' + stop[k] + ')').join(', ') || '-'));
const lastScreens = {};
quit.forEach(g => { lastScreens[g.last] = (lastScreens[g.last] || 0) + 1; });
console.log('  their last event: ' + (Object.keys(lastScreens).map(k => k.replace(/:$/, '') + ' ' + lastScreens[k]).join(', ') || '-'));

const secs = q(`SELECT json_extract(d, '$.ms') ms FROM events WHERE k = 'season' AND ${W}`).map(r => Math.round(r.ms / 1000));
console.log('  seconds per season: median ' + median(secs));

const bt = q(`SELECT json_extract(d, '$.won') won, json_extract(d, '$.auto') auto, json_extract(d, '$.cut') cut, json_extract(d, '$.rounds') rounds FROM events WHERE k = 'battle' AND ${W}`);
const fought = bt.filter(b => !b.auto), moves = {};
fought.forEach(b => JSON.parse(b.rounds || '[]').forEach(r => { const m = r.slice(0, -1); moves[m] = (moves[m] || 0) + 1; }));
console.log('  battles: ' + bt.length + ', auto-resolved ' + pct(bt.length - fought.length, bt.length) + ', won ' + pct(bt.filter(b => b.won).length, bt.length) +
  ', on the map won ' + pct(fought.filter(b => b.won).length, fought.length) + ', cut ' + pct(fought.filter(b => b.cut).length, fought.length) +
  '; moves ' + (Object.keys(moves).map(k => k + ' ' + moves[k]).join(', ') || '-'));

const ch = q(`SELECT json_extract(d, '$.on') kind, json_extract(d, '$.c') c, COUNT(*) n FROM events WHERE k = 'choice' AND ${W} GROUP BY 1, 2 ORDER BY 1, 3 DESC`);
console.log('  choices: ' + (ch.map(r => r.kind + ' ' + r.c + ' ' + r.n).join(', ') || '-'));

const acts = {};
q(`SELECT json_extract(d, '$.acts') a FROM events WHERE k = 'season' AND ${W}`).forEach(r => { const a = JSON.parse(r.a || '{}'); for (const k in a) acts[k] = (acts[k] || 0) + a[k]; });
const total = Object.values(acts).reduce((a, b) => a + b, 0);
console.log('  actions used: ' + (Object.keys(acts).sort((a, b) => acts[b] - acts[a]).map(k => k + ' ' + pct(acts[k], total)).join(', ') || '-'));
console.log('  opted out: ' + q(`SELECT COUNT(DISTINCT pid) n FROM events WHERE k = 'optout' AND ${W}`)[0].n);

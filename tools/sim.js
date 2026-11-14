/* Balance check for Aman. Plays games with three bots, all the way through the three acts, and prints outcomes.
   "greedy" always takes the adviser's first suggestion (Aman.advise).
   "random" picks any legal action.
   "neglect" follows the adviser but never meets demands, hears grievances, or counters the Company.
   Run: node tools/sim.js [games per bot, default 2000]
   Games run in parallel worker threads, one chunk of seeds each. Results are gathered in seed order, so the output repeats exactly. */
const A = require('../public/engine.js');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const NEVER = { demand: true, hear: true, counter: true };
/* The random bot draws from its own stream, seeded from the game seed, so runs repeat. It never touches S.rng. */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rnd = Math.random;
function greedy(S) { const a = A.advise(S); return a.length ? a[0] : null; }
function neglect(S) { const a = A.advise(S).filter(x => !NEVER[x.id.split(':')[0]]); return a.length ? a[0] : null; }
function random(S) {
  const acts = A.available(S).filter(a => a.ok);
  return acts.length ? acts[Math.floor(rnd() * acts.length)] : null;
}

function councilChoice(S, bot) {
  const q = A.councilItem(S); const ks = Object.keys(q.options);
  if (bot === random) return ks[Math.floor(rnd() * ks.length)];
  const score = k => A.ORDER.reduce((s, id) => s + (q.options[k].trust[id] || 0) * (S.factions[id].member || S.factions[id].trust > 45 ? 2 : 1), 0);
  return score(ks[0]) >= score(ks[1]) ? ks[0] : ks[1];
}

function play(seed, bot, trace) {
  const S = A.create(seed);
  rnd = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  let guard = 0, act = S.act;
  while (S.phase !== 'over' && guard++ < 5000) {
    if (S.act !== act) { act = S.act; if (trace) console.log('  season ' + S.turn + ': act ' + act + ' (' + A.ACTS[act].name + ') begins with ' + A.members(S).length + ' members'); }
    if (S.phase === 'crisis') { const r = A.resolveCrisis(S, S.res.capital >= 4 ? 'address' : 'fight'); if (!r.ok) throw new Error('crisis'); continue; }
    if (S.phase === 'dispute') {
      let r = A.resolveDispute(S, 'mediate');
      if (!r.ok) { const d = S.dispute; r = A.resolveDispute(S, bot === random ? ['a', 'b', 'out'][Math.floor(rnd() * 3)] : (S.factions[d.a].trust >= S.factions[d.b].trust ? 'a' : 'b')); }
      if (!r.ok) throw new Error('dispute'); continue;
    }
    if (S.phase === 'council') {
      const r = A.chooseCharter(S, councilChoice(S, bot));
      if (!r.ok) throw new Error('council');
      continue;
    }
    let a; let n = 0;
    while ((a = bot(S)) && n++ < 30) { const r = A.act(S, a.id); if (!r.ok) throw new Error('act failed ' + a.id + ' ' + r.msg); if (S.phase !== 'actions') break; }
    if (S.phase === 'actions') A.endSeason(S);
  }
  if (guard >= 5000) throw new Error('loop');
  return S;
}

/* One finished game, reduced to what the report needs. */
function summary(S) {
  return { act: S.outcome.act, result: S.outcome.result, title: S.outcome.title, pledges: S.outcome.pledges, members: A.members(S).length, turn: S.turn,
    a2: S.actStart[2], a3: S.actStart[3], stats: Object.assign({}, S.stats) };
}
const BOTS = { greedy: greedy, neglect: neglect, random: random };

if (!isMainThread) {
  const out = [];
  for (let i = workerData.from; i <= workerData.to; i++) out.push(summary(play(i * 7919, BOTS[workerData.bot])));
  parentPort.postMessage(out);
} else main();

function runBot(name, N, chunks) {
  const size = Math.ceil(N / chunks), jobs = [];
  for (let from = 1; from <= N; from += size) {
    const to = Math.min(N, from + size - 1);
    jobs.push(new Promise(function (ok, fail) {
      const w = new Worker(__filename, { workerData: { bot: name, from: from, to: to } });
      w.on('message', ok); w.on('error', fail);
    }));
  }
  return Promise.all(jobs).then(function (parts) { return [].concat.apply([], parts); });
}

function pct(x, n) { return (100 * x / n).toFixed(1) + '%'; }
function q(arr, p) { if (!arr.length) return '-'; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

function report(name, games) {
  const N = games.length;
  const tally = {}, res = { win: 0, partial: 0, loss: 0 }, byAct = { 1: 0, 2: 0, 3: 0 };
  let aman = 0, ratified = 0, company = 0, mem = 0, pledgeSum = 0, votes = 0, reached2 = 0;
  const turns = [], a2 = [], a3 = [];
  const st = { walkouts: 0, secessions: 0, demandsMet: 0, demandsMissed: 0, motionsPassed: 0, motionsFailed: 0, pledgesLost: 0, termsOffered: 0 };
  let walk2 = 0;
  for (const o of games) {
    const k = o.act + ':' + o.result + ':' + o.title; tally[k] = (tally[k] || 0) + 1;
    res[o.result]++; byAct[o.act]++;
    if (o.title === 'Aman') aman++;
    if (o.title === 'The charter is ratified') ratified++;
    if (o.title === 'The Company wins') company++;
    if (o.pledges !== undefined) { pledgeSum += o.pledges; votes++; }
    mem += o.members; turns.push(o.turn);
    if (o.a2) { a2.push(o.a2); reached2++; walk2 += o.stats.walkouts; }
    if (o.a3) a3.push(o.a3);
    for (const c in st) st[c] += o.stats[c];
  }
  const avg = turns.reduce((a, b) => a + b, 0) / N;
  const dem = st.demandsMet + st.demandsMissed, mot = st.motionsPassed + st.motionsFailed;
  console.log(name.padEnd(8) + 'win ' + pct(res.win, N) + ' (Aman ' + pct(aman, N) + ', ratified ' + pct(ratified, N) + ')  partial ' + pct(res.partial, N) + '  loss ' + pct(res.loss, N));
  console.log('        ended in act: 1 ' + pct(byAct[1], N) + '  2 ' + pct(byAct[2], N) + '  3 ' + pct(byAct[3], N) + '   company ' + pct(company, N) + '   reached act 2 ' + pct(reached2, N));
  console.log('        seasons: avg ' + avg.toFixed(1) + '  median ' + q(turns, 0.5) + '  p10 ' + q(turns, 0.1) + '  p90 ' + q(turns, 0.9) + '   act2 starts median ' + q(a2, 0.5) + '  act3 starts median ' + q(a3, 0.5));
  console.log('        members at end ' + (mem / N).toFixed(2) + '  pledges at vote ' + (votes ? (pledgeSum / votes).toFixed(2) : '-') + '  walkouts/game ' + (st.walkouts / N).toFixed(2) + ' (' + (reached2 ? (walk2 / reached2).toFixed(2) : '-') + ' per act-2 game)  secessions/game ' + (st.secessions / N).toFixed(2));
  console.log('        demands met ' + (dem ? pct(st.demandsMet, dem) : '-') + '  motions passed ' + (mot ? pct(st.motionsPassed, mot) : '-') + '  pledges lost/game ' + (st.pledgesLost / N).toFixed(2) + '  terms/game ' + (st.termsOffered / N).toFixed(2));
  console.log('        ' + JSON.stringify(tally));
}

async function main() {
  const N = +process.argv[2] || 2000;
  const chunks = Math.max(1, Math.min(8, Math.floor(os.cpus().length / 3)));
  const names = ['greedy', 'neglect', 'random'];
  const all = await Promise.all(names.map(function (n) { return runBot(n, N, chunks); }));
  names.forEach(function (n, i) { report(n, all[i]); });
  // one trace
  console.log('trace, seed 42, greedy:');
  const S = play(42, greedy, true);
  console.log('  season ' + S.turn + ': ' + S.outcome.result + ', ' + S.outcome.title + '. ' + S.outcome.text);
}

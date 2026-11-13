/* Balance check for Aman. Plays 2,000 games with each of two bots and prints outcome counts.
   "greedy" always takes the adviser's first suggestion (Aman.advise). "random" picks any legal action.
   Baseline: greedy about 57% win, 42% partial; random almost never wins.
   Run: node tools/sim.js */
const A = require('../public/engine.js');

function greedy(S) { const a = A.advise(S); return a.length ? a[0] : null; }
function random(S) {
  const acts = A.available(S).filter(a => a.ok);
  return acts.length ? acts[Math.floor(Math.random() * acts.length)] : null;
}
function play(seed, bot) {
  const S = A.create(seed);
  let guard = 0;
  while (S.phase !== 'over' && guard++ < 2000) {
    if (S.phase === 'crisis') { const r = A.resolveCrisis(S, S.res.capital >= 4 ? 'address' : 'fight'); if (!r.ok) throw new Error('crisis'); continue; }
    if (S.phase === 'dispute') {
      let r = A.resolveDispute(S, 'mediate');
      if (!r.ok) { const d = S.dispute; r = A.resolveDispute(S, bot === random ? ['a','b','out'][Math.floor(Math.random()*3)] : (S.factions[d.a].trust >= S.factions[d.b].trust ? 'a' : 'b')); }
      if (!r.ok) throw new Error('dispute'); continue;
    }
    if (S.phase === 'council') {
      const q = A.CHARTER[S.council]; const ks = Object.keys(q.options);
      const score = k => A.ORDER.reduce((s, id) => s + (q.options[k].trust[id] || 0) * (S.factions[id].member || S.factions[id].trust > 45 ? 2 : 1), 0);
      A.chooseCharter(S, bot === random ? ks[Math.floor(Math.random() * 2)] : (score(ks[0]) >= score(ks[1]) ? ks[0] : ks[1]));
      continue;
    }
    let a; let n = 0;
    while ((a = bot(S)) && n++ < 20) { const r = A.act(S, a.id); if (!r.ok) throw new Error('act failed ' + a.id + ' ' + r.msg); if (S.phase !== 'actions') break; }
    if (S.phase === 'actions') A.endSeason(S);
  }
  if (guard >= 2000) throw new Error('loop');
  return S;
}
for (const [name, bot] of [['greedy', greedy], ['random', random]]) {
  const tally = {}; let mem = 0, turns = 0; const N = 2000;
  for (let i = 1; i <= N; i++) {
    const S = play(i * 7919, bot);
    const k = S.outcome.result + ':' + S.outcome.title; tally[k] = (tally[k] || 0) + 1;
    mem += A.members(S).length; turns += S.turn;
  }
  console.log(name, JSON.stringify(tally), 'avg members', (mem / N).toFixed(2), 'avg turns', (turns / N).toFixed(1));
}
// one trace
const S = play(42, greedy);



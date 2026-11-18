/* Save and resume check. Plays greedy games two ways: straight through, and saved and reloaded as JSON after every step.
   Both must end in exactly the same state. Crises are fought on the map, so a save in the middle of a battle is covered too.
   Run: node tools/save_test.js [games, default 200] */
const A = require('../public/engine.js');

function step(S) {
  if (S.phase === 'crisis') return A.resolveCrisis(S, S.turn % 2 ? 'battle' : 'fight');
  if (S.phase === 'battle') return S.battle.done ? A.finishBattle(S) : A.battleMove(S, S.battle.round === 0 && !S.battle.cutUsed ? 'cut' : 'hold');
  if (S.phase === 'dispute') { const r = A.resolveDispute(S, 'mediate'); return r.ok ? r : A.resolveDispute(S, 'a'); }
  if (S.phase === 'council') { const q = A.councilItem(S); return A.chooseCharter(S, Object.keys(q.options)[0]); }
  const a = A.advise(S);
  return a.length ? A.act(S, a[0].id) : A.endSeason(S);
}

function run(seed, reload) {
  let S = A.create(seed), n = 0;
  while (S.phase !== 'over' && n++ < 20000) {
    const r = step(S);
    if (!r || !r.ok) { if (S.phase === 'actions') A.endSeason(S); else throw new Error('stuck in ' + S.phase + ' at seed ' + seed); }
    if (reload) { S = A.load(A.save(S)); if (!S) throw new Error('load refused at seed ' + seed); }
  }
  if (n >= 20000) throw new Error('loop at seed ' + seed);
  return S;
}

const N = +process.argv[2] || 200;
let bad = 0;
for (let i = 1; i <= N; i++) {
  const a = A.save(run(i * 7919, false)), b = A.save(run(i * 7919, true));
  if (a !== b) { bad++; if (bad <= 3) console.log('diverged at seed ' + i * 7919); }
}
const junk = [A.load('nope'), A.load('{}'), A.load(JSON.stringify({ v: A.SAVE_V + 1, S: {} }))];
if (junk.some(x => x !== null)) { bad++; console.log('a bad save was accepted'); }
console.log(bad ? 'FAIL ' + bad + ' of ' + N : 'ok   ' + N + ' games end the same with a save and reload after every step');
process.exit(bad ? 1 : 0);

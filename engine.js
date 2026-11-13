/* Aman prototype rules engine. No DOM. Runs in the browser (window.Aman) and in Node. */
(function (root) {
  'use strict';

  const SEASONS = ['Spring', 'Monsoon', 'Autumn', 'Winter'];
  const RES = ['water', 'energy', 'food'];
  const MAX_TURNS = 12;
  const JOIN_TRUST = 55;
  const JOIN_NEEDS = 4;
  const BLOCK_GAIN = 10;
  const ORDER = ['indus', 'himal', 'delta', 'ganga', 'coast'];
  const REL_NAMES = { '-2': 'Rival', '-1': 'Tense', '0': 'Neutral', '1': 'Friendly', '2': 'Allied' };
  const REL_START = { 'indus|ganga': -2, 'himal|delta': -1, 'ganga|coast': -1, 'delta|coast': 1, 'himal|ganga': 1 };
  const TOPICS = { 'indus|ganga': 'border garrisons', 'himal|delta': 'dam releases', 'ganga|coast': 'tariffs', 'delta|ganga': 'river diversions', 'himal|ganga': 'headwater tolls' };
  const PAIRS = [];
  ORDER.forEach(function (a, i) { ORDER.slice(i + 1).forEach(function (b) { PAIRS.push([a, b]); }); });
  function pk(a, b) { return ORDER.indexOf(a) < ORDER.indexOf(b) ? a + '|' + b : b + '|' + a; }

  /* Each power pursues plans of its own. A plan runs for `eta` seasons unless its end condition is met or you talk the power out of it. */
  const PLANS = {
    himal: [
      { key: 'dams', name: 'Build the Karnali dams', eta: 3, harmed: ['delta'],
        then: 'Hydro exports +1. Delta river flow -1, and the two river states fall out a step.',
        endIf: 'you hold run-of-river turbines', cancelIf: function (S) { return !!S.tech.ror; },
        done: function (S) { pip(S, 'himal', 'hydro', 1); pip(S, 'delta', 'flow', -1); shiftRel(S, 'himal', 'delta', -1); } },
      { key: 'toll', name: 'Charge a headwaters toll', eta: 3, harmed: ['ganga', 'delta'],
        then: 'Its relations with the Gangetic Union and the Delta Republic each worsen a step.',
        endIf: 'the River Flow Compact is built', cancelIf: function (S) { return !!S.projects.flow; },
        done: function (S) { shiftRel(S, 'himal', 'ganga', -1); shiftRel(S, 'himal', 'delta', -1); } }
    ],
    indus: [
      { key: 'forts', name: 'Fortify the eastern border', eta: 4, harmed: ['ganga'],
        then: 'It buys Company arms: Company grip +1. Gangetic Union trust in you -5.',
        endIf: 'it is no longer a rival of the Gangetic Union', cancelIf: function (S) { return rel(S, 'indus', 'ganga') > -2; },
        done: function (S) { gripUp(S, 'indus'); trust(S, 'ganga', -5); } },
      { key: 'arms', name: 'Seek a Company security contract', eta: 3, harmed: [],
        then: 'Company grip +1.',
        endIf: 'its autonomy need reaches 2', cancelIf: function (S) { return S.factions.indus.pips.autonomy >= 2; },
        done: function (S) { gripUp(S, 'indus'); } }
    ],
    ganga: [
      { key: 'tariff', name: 'Raise tariffs on coastal goods', eta: 3, harmed: ['coast'],
        then: 'Industry +1. Coastal trade -1, and the two fall out a step.',
        endIf: 'the charter settles trade policy', cancelIf: function (S) { return !!S.charter.trade; },
        done: function (S) { pip(S, 'ganga', 'industry', 1); pip(S, 'coast', 'trade', -1); shiftRel(S, 'ganga', 'coast', -1); } },
      { key: 'divert', name: 'Divert the middle river for farms', eta: 3, harmed: ['delta'],
        then: 'Food +1. Delta river flow -1, and the two fall out a step.',
        endIf: 'its food need is fully met', cancelIf: function (S) { return S.factions.ganga.pips.food >= 3; },
        done: function (S) { pip(S, 'ganga', 'food', 1); pip(S, 'delta', 'flow', -1); shiftRel(S, 'ganga', 'delta', -1); } }
    ],
    coast: [
      { key: 'bloc', name: 'Form a Maritime Bloc with the Delta Republic', eta: 4, harmed: [],
        then: 'The two become allies. If neither is a member, each trusts you 6 less: they have each other. If one is a member, the other trusts you 8 more.',
        endIf: '', cancelIf: function () { return false; },
        done: function (S) {
          S.rel[pk('coast', 'delta')] = 2;
          const c = S.factions.coast.member, d = S.factions.delta.member;
          if (!c && !d) { trust(S, 'coast', -6); trust(S, 'delta', -6); }
          else if (c && !d) trust(S, 'delta', 8);
          else if (d && !c) trust(S, 'coast', 8);
        } },
      { key: 'freeport', name: 'Declare free ports', eta: 3, harmed: [],
        then: 'Trade +1. It trusts you 4 more if you hold the Trade Pact, 4 less if not.',
        endIf: '', cancelIf: function () { return false; },
        done: function (S) { pip(S, 'coast', 'trade', 1); trust(S, 'coast', S.factions.coast.pact ? 4 : -4); } }
    ],
    delta: [
      { key: 'appeal', name: 'Appeal to the Company for flood aid', eta: 3, harmed: [],
        then: 'Company grip +1.',
        endIf: 'its flood protection reaches 2', cancelIf: function (S) { return S.factions.delta.pips.flood >= 2; },
        done: function (S) { gripUp(S, 'delta'); } },
      { key: 'rights', name: 'Campaign for delta-first water rights', eta: 3, harmed: ['himal'],
        then: 'River flow +1. Its relations with the Himalayan Accord worsen a step.',
        endIf: 'the River Flow Compact is built', cancelIf: function (S) { return !!S.projects.flow; },
        done: function (S) { pip(S, 'delta', 'flow', 1); shiftRel(S, 'himal', 'delta', -1); } }
    ]
  };
  const PLAN_WAIT = { himal: 1, indus: 1, ganga: 2, delta: 3, coast: 4 };
  /* Systems arrive one season at a time so a new player is not handed everything at once. */
  const UNLOCK = { company: 2, relations: 3, plans: 4 };
  const INTRO = {
    2: 'New this season: the Company. It courts the power that trusts you least. Raise that power\'s trust by 10 within the season, or counter the Company there, or its grip tightens. Three steps and the power goes rogue.',
    3: 'New this season: ties between powers. Helping a power pleases its friends and irritates its rivals, and a power will not join while its rival is a member. Open Relations to broker talks.',
    4: 'New this season: the powers act on their own. Each runs a plan on a countdown. Open a power to back its plan or talk it out of it.'
  };
  function unlocked(S) { return { company: S.turn >= UNLOCK.company, relations: S.turn >= UNLOCK.relations, plans: S.turn >= UNLOCK.plans }; }

  const FACTIONS = {
    indus: {
      name: 'Indus League', seat: 'Lahore', trust: 30,
      blurb: 'Upstream river cities. Proud, wary of any strong center.',
      needs: [{ key: 'water', label: 'Water share', res: 'water', how: 'Send Water, or build the Indus Water Treaty' }, { key: 'autonomy', label: 'Autonomy', how: 'Autonomy Guarantee pact. In the charter: Loose union, Local militias' }],
      pact: { name: 'Autonomy Guarantee', effect: 'Autonomy +1', cost: {} }
    },
    himal: {
      name: 'Himalayan Accord', seat: 'Kathmandu', trust: 40,
      blurb: 'Mountain states that hold the headwaters and want to sell hydropower.',
      needs: [{ key: 'hydro', label: 'Hydro exports', how: 'Power Purchase Agreement pact, or build the Hydro Grid' }, { key: 'food', label: 'Food', res: 'food', how: 'Send Food, or research drought-resistant crops' }],
      pact: { name: 'Power Purchase Agreement', effect: 'Hydro exports +1. You gain 1 Energy and pay 1 Capital each season', cost: {} }
    },
    delta: {
      name: 'Delta Republic', seat: 'Dhaka', trust: 45,
      blurb: 'Downstream delta. Lives or dies by river flow and flood defense.',
      needs: [{ key: 'flow', label: 'River flow', res: 'water', how: 'Send Water, or build the River Flow Compact' }, { key: 'flood', label: 'Flood protection', how: 'Relief Corridor pact, Flood defense research. In the charter: Common defense force' }],
      pact: { name: 'Relief Corridor', effect: 'Flood protection +1', cost: { capital: 2 } }
    },
    ganga: {
      name: 'Gangetic Union', seat: 'Patna', trust: 36,
      blurb: 'Populous inland plain. Wants food security and protected industry.',
      needs: [{ key: 'food', label: 'Food', res: 'food', how: 'Send Food, or research drought-resistant crops' }, { key: 'industry', label: 'Industry', how: 'Industry Compact pact, Subcontinental Rail. In the charter: Protected industry' }],
      pact: { name: 'Industry Compact', effect: 'Industry +2. Coastal League trust -5', cost: { capital: 2 } }
    },
    coast: {
      name: 'Coastal League', seat: 'Kochi and Colombo', trust: 42,
      blurb: 'Port cities of the south. Wants open trade and reliable power.',
      needs: [{ key: 'trade', label: 'Trade', how: 'Trade Pact, Subcontinental Rail. In the charter: Open market' }, { key: 'energy', label: 'Energy', res: 'energy', how: 'Send Energy, or build the Hydro Grid' }],
      pact: { name: 'Trade Pact', effect: 'Trade +2. You gain 1 Capital each season. Gangetic Union trust -5', cost: {} }
    }
  };

  const PROJECTS = {
    hydro: {
      name: 'Himalayan Hydro Grid', cost: 5, partners: ['himal'],
      effect: 'Energy +2 each season. Himalayan hydro exports +2, Coastal energy +1.',
      catch: 'Delta Republic loses river flow and trust, and the two river states fall out a step, unless you hold run-of-river turbines.'
    },
    flow: {
      name: 'River Flow Compact', cost: 4, partners: ['himal', 'delta'],
      effect: 'Delta river flow +2. The two river states move a step closer.',
      catch: 'Limits Himalayan dams: hydro exports -1 and trust -6, unless you hold run-of-river turbines.'
    },
    induswater: {
      name: 'Indus Water Treaty', cost: 4, partners: ['indus'],
      effect: 'Indus water share +2.',
      catch: 'You give up 1 Water each season.'
    },
    rail: {
      name: 'Subcontinental Rail', cost: 6, partners: 'any2',
      effect: 'Capital +2 each season. Coastal trade +1, Gangetic industry +1, all trust +3. The plain and the coast move a step closer.',
      catch: ''
    }
  };

  const TECH = {
    crops: { name: 'Drought-resistant crops', effect: 'Food +2 each season. Failed monsoons hurt half as much. Shared: Himalayan and Gangetic food +1.' },
    desal: { name: 'Desalination', effect: 'Water +2 each season.' },
    ror: { name: 'Run-of-river turbines', effect: 'Hydro Grid and River Flow Compact no longer harm the other river state.' },
    flood: { name: 'Flood defense', effect: 'Shared with the delta: flood protection +2, trust +6.' },
    civil: { name: 'Civil defense doctrine', effect: 'Battle odds +20%. Winning a battle no longer breeds resentment.' }
  };

  const CHARTER = {
    3: {
      key: 'structure', title: 'How strong is the center?',
      options: {
        center: { name: 'Strong center', text: 'One capital sets policy for all.', trust: { ganga: 8, delta: 4, indus: -10, himal: -6 }, pips: {} },
        loose: { name: 'Loose union', text: 'Members keep most powers.', trust: { indus: 8, himal: 6, ganga: -6 }, pips: { indus: ['autonomy', 2] } }
      }
    },
    6: {
      key: 'trade', title: 'Open market or protected industry?',
      options: {
        open: { name: 'Open market', text: 'No tariffs inside or out.', trust: { coast: 10, ganga: -10 }, pips: { coast: ['trade', 1], ganga: ['industry', -1] } },
        protect: { name: 'Protected industry', text: 'Tariffs shield inland factories.', trust: { ganga: 10, coast: -10 }, pips: { ganga: ['industry', 1], coast: ['trade', -1] } }
      }
    },
    9: {
      key: 'defense', title: 'Who defends the federation?',
      options: {
        common: { name: 'Common defense force', text: 'One force under the council. Battle odds +15%.', trust: { delta: 6, ganga: 4, indus: -8 }, pips: { delta: ['flood', 1] } },
        local: { name: 'Local militias', text: 'Each member defends itself.', trust: { indus: 8, himal: 4 }, pips: { indus: ['autonomy', 1] } }
      }
    }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(seed) {
    const S = {
      seed: seed >>> 0, rng: mulberry32(seed >>> 0),
      turn: 0, phase: 'actions', outcome: null,
      res: { water: 3, energy: 3, food: 3, capital: 5 },
      influence: 3, shortage: false,
      factions: {}, projects: {}, tech: {}, research: null, charter: {},
      companyTargets: [], escalated: false, crisis: null, rel: {}, dispute: null, monsoon: null, plansDone: {}, council: null,
      briefing: [], log: [], lastResolution: []
    };
    ORDER.forEach(function (id) {
      const d = FACTIONS[id];
      const pips = {};
      d.needs.forEach(function (n) { pips[n.key] = 0; });
      S.factions[id] = { id: id, trust: d.trust, pips: pips, grip: 0, member: false, pact: false, request: null, touched: false, countered: false, trustAtStart: d.trust, plan: null, planIdx: 0, planWait: PLAN_WAIT[id] };
    });
    PAIRS.forEach(function (p) { const k = pk(p[0], p[1]); S.rel[k] = REL_START[k] || 0; });
    startTurn(S);
    return S;
  }

  /* ---------- helpers ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fname(id) { return FACTIONS[id].name; }
  function members(S) { return ORDER.filter(function (id) { return S.factions[id].member; }); }
  function clients(S) { return ORDER.filter(function (id) { return S.factions[id].grip >= 2; }); }
  function needTotal(S, id) { const p = S.factions[id].pips; return Object.keys(p).reduce(function (a, k) { return a + p[k]; }, 0); }
  function trust(S, id, d) { const f = S.factions[id]; f.trust = clamp(f.trust + d, 0, 100); }
  function pip(S, id, key, d) { const f = S.factions[id]; if (key in f.pips) f.pips[key] = clamp(f.pips[key] + d, 0, 3); }
  function log(S, text, kind) { S.log.push({ turn: S.turn, text: text, kind: kind || 'info' }); }
  function season(S) { return SEASONS[(S.turn - 1) % 4]; }
  function year(S) { return 2050 + Math.floor((S.turn - 1) / 4); }
  function rel(S, a, b) { return S.rel[pk(a, b)]; }
  function shiftRel(S, a, b, d) { const k = pk(a, b), o = S.rel[k]; S.rel[k] = clamp(o + d, -2, 2); return S.rel[k] !== o; }
  function gripUp(S, id) { const f = S.factions[id]; f.grip = Math.min(3, f.grip + 1); if (f.grip >= 3 && f.member) f.member = false; }
  function rivalInside(S, id) { if (S.turn < UNLOCK.relations) return undefined; return members(S).filter(function (m) { return m !== id && rel(S, id, m) <= -2; })[0]; }
  function canJoin(S, id) { const f = S.factions[id]; return !f.member && f.trust >= JOIN_TRUST && needTotal(S, id) >= JOIN_NEEDS && f.grip < 2 && !rivalInside(S, id); }
  /* What still stands between a power and membership, as short phrases. */
  function gaps(S, id) {
    const f = S.factions[id], g = [], nt = needTotal(S, id), rv = rivalInside(S, id);
    if (f.trust < JOIN_TRUST) g.push((JOIN_TRUST - f.trust) + ' more trust');
    if (nt < JOIN_NEEDS) g.push((JOIN_NEEDS - nt) + ' more need point' + (JOIN_NEEDS - nt > 1 ? 's' : ''));
    if (f.grip >= 2) g.push('the Company\'s grip below client level');
    if (rv) g.push('peace with its rival ' + fname(rv) + ', which is already a member');
    return g;
  }
  /* Goodwill spills over: a power's friends warm to you when you help it, its rivals cool. */
  function spillList(S, id, amt) {
    if (S.turn < UNLOCK.relations) return [];
    return ORDER.filter(function (o) { return o !== id; }).map(function (o) { return { id: o, d: Math.round(amt * rel(S, id, o) / 2) }; }).filter(function (x) { return x.d; });
  }
  function spill(S, id, amt) { spillList(S, id, amt).forEach(function (x) { trust(S, x.id, x.d); }); }
  function spillText(S, id, amt) {
    const l = spillList(S, id, amt);
    return l.length ? '. Spillover: ' + l.map(function (x) { return fname(x.id) + ' ' + (x.d > 0 ? '+' : '') + x.d; }).join(', ') : '';
  }
  /* The four gates to membership, for checklists. */
  function gates(S, id) {
    const f = S.factions[id], nt = needTotal(S, id), rv = rivalInside(S, id);
    const g = [
      { key: 'trust', label: 'Trust', ok: f.trust >= JOIN_TRUST, text: f.trust + ' of ' + JOIN_TRUST },
      { key: 'needs', label: 'Needs met', ok: nt >= JOIN_NEEDS, text: nt + ' of ' + JOIN_NEEDS },
      { key: 'company', label: 'Free of the Company', ok: f.grip < 2, text: ['Yes', 'Taking its money', 'No: a client', 'No: gone rogue'][f.grip] }
    ];
    if (S.turn >= UNLOCK.relations) g.push({ key: 'rival', label: 'No rival inside', ok: !rv, text: rv ? fname(rv) + ' is a member' : 'Clear' });
    return g;
  }

  /* The adviser: every available action, scored, with a one-line reason. Also drives the test bot. */
  function advise(S) {
    const out = [];
    available(S).forEach(function (a) {
      if (!a.ok) return;
      let s = 0, why = '', label = a.label;
      const f = a.f ? S.factions[a.f] : null, nt = a.f ? needTotal(S, a.f) : 0;
      const courted = a.f && S.companyTargets.indexOf(a.f) >= 0;
      if (a.f) label = fname(a.f) + ': ' + a.label.charAt(0).toLowerCase() + a.label.slice(1);
      switch (a.type) {
        case 'invite': s = 100; why = 'Every gate is open. It will join now.'; break;
        case 'counter':
          if (f.grip >= 2) { s = 60; why = 'A Company client will not join. This loosens the grip.'; }
          else if (courted && f.grip >= 1) { s = 45; why = 'Blocks this season\'s deal. One more step would make it a Company client.'; }
          break;
        case 'answer': s = 40 + (f.member ? 10 : 0) + (courted ? 4 : 0);
          why = 'It asked. Helping earns 8 trust; silence costs ' + (f.member ? 10 : 6) + '.' + (courted ? ' It also helps outbid the Company.' : ''); break;
        case 'project': s = 35; why = PROJECTS[a.p].effect;
          if (a.p === 'hydro' && !S.tech.ror) { s = 8; }
          if (a.p === 'flow' && !S.tech.ror) s = 20;
          break;
        case 'pact': s = 30; why = 'One Influence buys a need point and 6 trust.';
          if ((a.f === 'ganga' && S.factions.coast.member) || (a.f === 'coast' && S.factions.ganga.member)) { s = 10; }
          break;
        case 'research': s = S.turn <= 8 ? ({ ror: 28, crops: 26, flood: 24, desal: 14, civil: 6 })[a.t] : 0; why = TECH[a.t].effect; break;
        case 'aid': if (nt < JOIN_NEEDS) { s = 18; why = 'Raises one of its needs. It has ' + nt + ' of the ' + JOIN_NEEDS + ' it wants.'; } break;
        case 'broker': {
          const fa = S.factions[a.a], fb = S.factions[a.b];
          label = 'Broker talks: ' + fname(a.a) + ' and ' + fname(a.b);
          if (a.rel <= -2 && ((fa.member && needTotal(S, a.b) >= 3) || (fb.member && needTotal(S, a.a) >= 3))) { s = 70; why = 'One is a member and the other is nearly ready, but it will not join beside a rival.'; }
          else if (fa.member && fb.member && a.rel < 0) { s = 32; why = 'Both are members and they quarrel in council every season.'; }
          else if (a.rel <= -2) { s = 22; why = 'They are rivals. Whichever joins first will shut the other out.'; }
          else if (a.rel < 0) { s = 9; }
          break;
        }
        case 'dissuade': {
          const p = planOf(S, a.f);
          const fine = p.key === 'freeport' || (p.key === 'bloc' && (S.factions.coast.member || S.factions.delta.member));
          if (!fine) { s = 27; why = 'If its plan finishes: ' + p.then; }
          break;
        }
        case 'envoy':
          if (f.member) break;
          if (nt >= JOIN_NEEDS && f.trust < JOIN_TRUST) { s = 25; why = 'Its needs are met. Only trust stands between it and joining.'; }
          else if (courted) { s = 12; why = 'Helps outbid the Company this season.'; }
          else s = 5;
          break;
      }
      if (s > 0) out.push({ id: a.id, score: s, why: why, label: label, cost: a.cost });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  function planOf(S, id) { const f = S.factions[id]; return f.plan ? PLANS[id][f.plan.i] : null; }
  function nextPhase(S) {
    const rogue = ORDER.filter(function (id) { return S.factions[id].grip >= 3; })[0];
    if (rogue) { S.crisis = rogue; S.phase = 'crisis'; return; }
    S.crisis = null;
    if (S.dispute && (S.factions[S.dispute.a].grip >= 3 || S.factions[S.dispute.b].grip >= 3)) S.dispute = null;
    S.phase = S.dispute ? 'dispute' : 'actions';
  }

  function yields(S) {
    const y = { water: 2, energy: 2, food: 2, capital: 3 };
    if (S.tech.desal) y.water += 2;
    if (S.tech.crops) y.food += 2;
    if (S.projects.hydro) y.energy += 2;
    if (S.projects.induswater) y.water -= 1;
    if (S.projects.rail) y.capital += 2;
    if (S.factions.coast.pact) y.capital += 1;
    if (S.factions.himal.pact) { y.energy += 1; y.capital -= 1; }
    if (S.charter.trade === 'open') y.capital += 1;
    y.capital += members(S).length;
    // home consumption
    y.water -= 1; y.energy -= 1; y.food -= 1;
    return y;
  }

  function fightOdds(S) {
    let p = 0.45 + 0.1 * members(S).length;
    if (S.charter.defense === 'common') p += 0.15;
    if (S.tech.civil) p += 0.2;
    return clamp(p, 0.05, 0.95);
  }

  /* ---------- turn start: briefing + income ---------- */
  function startTurn(S) {
    S.turn += 1;
    S.briefing = [];
    const B = S.briefing;
    const sea = season(S);
    if (INTRO[S.turn]) B.push({ kind: 'new', text: INTRO[S.turn] });

    // research completes
    if (S.research) {
      const id = S.research; S.research = null; S.tech[id] = true;
      if (id === 'crops') { pip(S, 'himal', 'food', 1); pip(S, 'ganga', 'food', 1); }
      if (id === 'flood') { pip(S, 'delta', 'flood', 2); trust(S, 'delta', 6); }
      B.push({ kind: 'good', text: 'Research complete: ' + TECH[id].name + '.' });
      log(S, 'Research complete: ' + TECH[id].name + '.', 'good');
    }

    // income
    const y = yields(S);
    let failed = false;
    S.monsoon = null;
    if (sea === 'Monsoon') {
      const r = S.rng();
      if (r < 0.25) {
        failed = true; S.monsoon = 'failed';
        const hit = S.tech.crops ? 1 : 2;
        y.water -= hit; y.food -= hit;
        B.push({ kind: 'bad', text: 'The monsoon failed. Water and Food each fall by ' + hit + ', and more factions ask for help.' });
      } else if (r < 0.7) {
        y.water += 1; y.food += 1; S.monsoon = 'normal';
        B.push({ kind: 'info', text: 'A normal monsoon. Water +1, Food +1.' });
      } else {
        y.water += 3; y.food += 2; S.monsoon = 'good';
        B.push({ kind: 'good', text: 'A strong monsoon fills the reservoirs. Water +3, Food +2.' });
      }
    } else {
      B.push({ kind: 'info', text: sea + ' ' + year(S) + '. The rivers run as expected.' });
    }
    S.shortage = false;
    ['water', 'energy', 'food', 'capital'].forEach(function (k) {
      S.res[k] += y[k];
      if (S.res[k] < 0) { S.res[k] = 0; if (k !== 'capital') S.shortage = true; }
    });
    S.lastIncome = y;
    const nm = members(S).length;
    S.influence = 3 + (nm >= 1 ? 1 : 0) - (S.shortage ? 1 : 0);
    if (S.shortage) B.push({ kind: 'bad', text: 'Shortages at home distract your government. Influence -1 this season.' });

    // per-faction reset
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      f.touched = false; f.countered = false; f.trustAtStart = f.trust; f.request = null;
    });

    // requests
    let n = 1 + (failed ? 1 : 0) + (nm >= 2 ? 1 : 0);
    const pool = ORDER.filter(function (id) { return S.factions[id].grip < 3; });
    while (n > 0 && pool.length) {
      const id = pool.splice(Math.floor(S.rng() * pool.length), 1)[0];
      const open = FACTIONS[id].needs.filter(function (nd) { return nd.res && S.factions[id].pips[nd.key] < 3; });
      let r;
      if (open.length && S.rng() < 0.7) r = open[0].res; else r = RES[Math.floor(S.rng() * 3)];
      S.factions[id].request = { res: r, amount: 2 };
      B.push({ f: id, kind: 'ask', text: fname(id) + ' asks for 2 ' + cap(r) + '.' });
      n--;
    }

    // company announces its target
    S.companyTargets = S.turn >= UNLOCK.company ? pickCompanyTargets(S, nm >= 3 ? 2 : 1) : [];
    if (S.companyTargets.length) {
      B.push({ fs: S.companyTargets.slice(), co: 'court', kind: 'warn', text: 'Company agents are courting ' + S.companyTargets.map(fname).join(' and ') + '. Raise trust there by ' + BLOCK_GAIN + ' this season, or counter the Company, to block the deal.' });
      if (S.companyTargets.length > 1 && !S.escalated) { S.escalated = true; B.push({ kind: 'warn', text: 'Your federation alarms the Company. From now on it courts two factions each season.' }); }
    }

    // powers start plans of their own
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (S.turn >= UNLOCK.plans && !f.plan && f.grip < 3 && f.planWait <= 0) {
        const i = f.planIdx % PLANS[id].length, p = PLANS[id][i];
        f.planIdx += 1;
        if (p.cancelIf(S)) { f.planWait = 2; return; }
        f.plan = { i: i, eta: p.eta, backed: false };
        B.push({ f: id, kind: 'plan', text: fname(id) + ' starts a plan of its own: ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + '. Done in ' + p.eta + ' seasons.' });
      }
    });

    // a quarrel between two powers lands on your desk
    S.dispute = null;
    if (S.turn >= UNLOCK.relations && S.rng() < 0.4) {
      const sour = PAIRS.filter(function (p) { return rel(S, p[0], p[1]) < 0 && S.factions[p[0]].grip < 3 && S.factions[p[1]].grip < 3; });
      if (sour.length) {
        const p = sour[Math.floor(S.rng() * sour.length)];
        S.dispute = { a: p[0], b: p[1], topic: TOPICS[pk(p[0], p[1])] || 'trade routes' };
      }
    }
    nextPhase(S);
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function pickCompanyTargets(S, n) {
    const el = ORDER.filter(function (id) {
      const f = S.factions[id];
      return f.grip < 3 && !(f.member && f.trust >= JOIN_TRUST);
    });
    const out = [];
    while (out.length < n && el.length) {
      const lo = Math.min.apply(null, el.map(function (id) { return S.factions[id].trust; }));
      const ties = el.filter(function (id) { return S.factions[id].trust === lo; });
      const pick = ties[Math.floor(S.rng() * ties.length)];
      out.push(pick); el.splice(el.indexOf(pick), 1);
    }
    return out;
  }

  /* ---------- crisis ---------- */
  function resolveCrisis(S, choice) {
    if (S.phase !== 'crisis') return { ok: false, msg: 'No crisis to resolve.' };
    const id = S.crisis, f = S.factions[id];
    let msg;
    if (choice === 'address') {
      if (S.res.capital < 4) return { ok: false, msg: 'Addressing the grievance costs 4 Capital.' };
      S.res.capital -= 4; f.grip = 0; trust(S, id, 12);
      msg = 'You met ' + fname(id) + ' at the table and funded what it was promised. The Company loses its client. Trust +12.';
      log(S, msg, 'good');
    } else if (choice === 'fight') {
      const p = fightOdds(S);
      if (S.rng() < p) {
        f.grip = 1;
        if (S.tech.civil) {
          ORDER.forEach(function (o) { if (o !== id) trust(S, o, 2); });
          msg = 'Battle won (auto-resolved). Your forces held the line and protected civilians. Other factions take note: trust +2.';
        } else {
          trust(S, id, -6);
          ORDER.forEach(function (o) { if (o !== id) trust(S, o, -2); });
          msg = 'Battle won (auto-resolved). The raids stop, but ' + fname(id) + ' resents the defeat (trust -6) and the others grow wary (trust -2).';
        }
        log(S, msg, 'warn');
      } else {
        S.res.capital = Math.max(0, S.res.capital - 3); S.res.food = Math.max(0, S.res.food - 2);
        f.grip = 2; trust(S, id, -4);
        msg = 'Battle lost (auto-resolved). Raiders burn depots: Capital -3, Food -2. ' + fname(id) + ' stays a Company client.';
        log(S, msg, 'bad');
      }
    } else {
      S.res.capital = Math.max(0, S.res.capital - 1); S.res.food = Math.max(0, S.res.food - 1);
      f.grip = 2; trust(S, id, -2);
      msg = 'You sealed the border and absorbed the raids: Capital -1, Food -1. ' + fname(id) + ' remains a Company client.';
      log(S, msg, 'warn');
    }
    nextPhase(S);
    return { ok: true, msg: msg };
  }

  /* ---------- dispute between two powers ---------- */
  function resolveDispute(S, choice) {
    if (S.phase !== 'dispute') return { ok: false, msg: 'No dispute to settle.' };
    const a = S.dispute.a, b = S.dispute.b;
    let msg;
    if (choice === 'mediate') {
      if (S.res.capital < 3 || S.influence < 1) return { ok: false, msg: 'Mediation costs 3 Capital and 1 Influence.' };
      S.res.capital -= 3; S.influence -= 1; shiftRel(S, a, b, 1); trust(S, a, 3); trust(S, b, 3);
      S.factions[a].touched = S.factions[b].touched = true;
      msg = 'You hosted talks on ' + S.dispute.topic + '. ' + fname(a) + ' and ' + fname(b) + ' are now ' + REL_NAMES[rel(S, a, b)].toLowerCase() + '. Trust +3 with each.';
      log(S, msg, 'good');
    } else if (choice === 'a' || choice === 'b') {
      const w = choice === 'a' ? a : b, l = choice === 'a' ? b : a;
      trust(S, w, 8); trust(S, l, -8);
      msg = 'You backed ' + fname(w) + ' over ' + S.dispute.topic + '. Trust +8 there, -8 with ' + fname(l) + '.';
      log(S, msg, 'warn');
    } else {
      trust(S, a, -3); trust(S, b, -3); shiftRel(S, a, b, -1);
      msg = 'You stayed out of it. Both resent your silence (trust -3), and they are now ' + REL_NAMES[rel(S, a, b)].toLowerCase() + '.';
      log(S, msg, 'warn');
    }
    S.dispute = null; S.phase = 'actions';
    return { ok: true, msg: msg };
  }

  /* ---------- actions ---------- */
  function has(S, cost) {
    return Object.keys(cost).every(function (k) { return (k === 'inf' ? S.influence : S.res[k]) >= cost[k]; });
  }
  function pay(S, cost) {
    Object.keys(cost).forEach(function (k) { if (k === 'inf') S.influence -= cost[k]; else S.res[k] -= cost[k]; });
  }
  function costText(cost) {
    return Object.keys(cost).map(function (k) { return cost[k] + ' ' + (k === 'inf' ? 'Influence' : cap(k)); }).join(', ');
  }

  /* Returns every action the player could take, with ok/why, for the UI and for bots. */
  function available(S) {
    const A = [];
    if (S.phase !== 'actions') return A;
    function add(a) {
      if (a.ok === undefined) a.ok = true;
      if (a.ok && !has(S, a.cost)) { a.ok = false; a.why = 'Costs ' + costText(a.cost) + '.'; }
      A.push(a);
    }
    ORDER.forEach(function (id) {
      const f = S.factions[id], d = FACTIONS[id];
      if (f.request) {
        const c = { inf: 1 }; c[f.request.res] = f.request.amount;
        const match = d.needs.some(function (n) { return n.res === f.request.res; });
        add({ id: 'answer:' + id, type: 'answer', f: id, label: 'Answer request: send 2 ' + cap(f.request.res), cost: c, hint: 'Trust +8' + (match ? ', and one of its needs improves' : '') + spillText(S, id, 2) });
      }
      add({ id: 'envoy:' + id, type: 'envoy', f: id, label: 'Send envoy', cost: { inf: 1 }, hint: 'Trust +5' });
      d.needs.forEach(function (n) {
        if (!n.res) return;
        const c = { inf: 1 }; c[n.res] = 2;
        add({ id: 'aid:' + id + ':' + n.key, type: 'aid', f: id, need: n.key, label: 'Send aid: 2 ' + cap(n.res), cost: c, hint: 'Trust +5, ' + n.label + ' +1' + spillText(S, id, 2), ok: f.pips[n.key] < 3, why: n.label + ' is fully met.' });
      });
      const pc = Object.assign({ inf: 1 }, d.pact.cost);
      add({ id: 'pact:' + id, type: 'pact', f: id, label: 'Sign ' + d.pact.name, cost: pc, hint: d.pact.effect + '. Trust +6' + spillText(S, id, 4), ok: !f.pact && f.trust >= 40, why: f.pact ? 'Already signed.' : 'Needs trust 40.' });
      add({ id: 'counter:' + id, type: 'counter', f: id, label: 'Counter the Company', cost: { inf: 1, capital: 2 }, hint: 'Company grip -1, trust +3, blocks this season\'s deal', ok: f.grip > 0 || S.companyTargets.indexOf(id) >= 0, why: 'The Company has no hold here.' });
      if (!f.member) {
        const g = gaps(S, id);
        add({ id: 'invite:' + id, type: 'invite', f: id, label: 'Invite to the federation', cost: { inf: 1 }, hint: 'Joins at trust ' + JOIN_TRUST + ' with ' + JOIN_NEEDS + ' of 6 need points met' + spillText(S, id, 8), ok: !g.length, why: 'Still needs ' + g.join(', ') + '.' });
      }
      const pl = planOf(S, id);
      if (pl) {
        const hurt = pl.harmed.length ? '. ' + pl.harmed.map(fname).join(' and ') + ' trust -4' : '';
        add({ id: 'back:' + id, type: 'back', f: id, label: 'Back its plan', cost: { inf: 1 }, hint: 'Done one season sooner. Trust +6' + hurt, ok: !f.plan.backed, why: 'You already backed this plan.' });
        add({ id: 'dissuade:' + id, type: 'dissuade', f: id, label: 'Talk it out of the plan', cost: { inf: 1 }, hint: 'Plan dropped. Trust -3', ok: f.trust >= 45, why: 'Needs trust 45 before it will listen.' });
      }
    });
    if (S.turn >= UNLOCK.relations) PAIRS.forEach(function (p) {
      const a = p[0], b = p[1], r = rel(S, a, b), fa = S.factions[a], fb = S.factions[b];
      let ok = true, why = '';
      if (r >= 2) { ok = false; why = 'Already allies.'; }
      else if (fa.grip >= 3 || fb.grip >= 3) { ok = false; why = 'A rogue power will not come to the table.'; }
      else if (fa.trust < 40 || fb.trust < 40) { ok = false; why = 'Both must trust you at 40 to accept you as broker.'; }
      add({ id: 'broker:' + a + '|' + b, type: 'broker', a: a, b: b, rel: r, label: fname(a) + ' and ' + fname(b) + ': ' + REL_NAMES[r], cost: { inf: 1, capital: 2 }, hint: 'Broker talks. They move one step closer, and each trusts you 2 more', ok: ok, why: why });
    });
    Object.keys(PROJECTS).forEach(function (pid) {
      const p = PROJECTS[pid];
      let ok = !S.projects[pid], why = 'Already built.';
      if (ok) {
        if (p.partners === 'any2') {
          ok = ORDER.filter(function (id) { return S.factions[id].trust >= 45; }).length >= 2; why = 'Needs two factions at trust 45.';
        } else {
          const miss = p.partners.filter(function (id) { return S.factions[id].trust < 45; });
          ok = !miss.length; why = 'Needs ' + miss.map(fname).join(' and ') + ' at trust 45.';
        }
      }
      add({ id: 'project:' + pid, type: 'project', p: pid, label: 'Build ' + p.name, cost: { inf: 2, capital: p.cost }, ok: ok, why: why });
    });
    Object.keys(TECH).forEach(function (tid) {
      let ok = true, why = '';
      if (S.tech[tid]) { ok = false; why = 'Already researched.'; }
      else if (S.research) { ok = false; why = S.research === tid ? 'In progress. Ready next season.' : 'Your labs are busy until next season.'; }
      add({ id: 'research:' + tid, type: 'research', t: tid, label: 'Research ' + TECH[tid].name, cost: { inf: 1, capital: 3 }, ok: ok, why: why });
    });
    return A;
  }

  function act(S, actionId) {
    const a = available(S).filter(function (x) { return x.id === actionId; })[0];
    if (!a) return { ok: false, msg: 'That action is not available.' };
    if (!a.ok) return { ok: false, msg: a.why };
    pay(S, a.cost);
    let msg = '';
    const f = a.f ? S.factions[a.f] : null;
    if (f) f.touched = true;
    switch (a.type) {
      case 'envoy':
        trust(S, a.f, 5); msg = 'Your envoy is received in ' + FACTIONS[a.f].seat + '. Trust +5.'; break;
      case 'answer': {
        const r = f.request.res; f.request = null; trust(S, a.f, 8); spill(S, a.f, 2);
        FACTIONS[a.f].needs.forEach(function (n) { if (n.res === r) pip(S, a.f, n.key, 1); });
        msg = 'You answered ' + fname(a.f) + '\'s call for ' + r + '. Trust +8.'; break;
      }
      case 'aid':
        trust(S, a.f, 5); pip(S, a.f, a.need, 1); spill(S, a.f, 2);
        msg = 'Aid convoy reaches ' + fname(a.f) + '. Trust +5.'; break;
      case 'pact': {
        f.pact = true; trust(S, a.f, 6); spill(S, a.f, 4);
        if (a.f === 'indus') pip(S, 'indus', 'autonomy', 1);
        if (a.f === 'himal') pip(S, 'himal', 'hydro', 1);
        if (a.f === 'delta') pip(S, 'delta', 'flood', 1);
        if (a.f === 'ganga') { pip(S, 'ganga', 'industry', 2); trust(S, 'coast', -5); }
        if (a.f === 'coast') { pip(S, 'coast', 'trade', 2); trust(S, 'ganga', -5); }
        msg = FACTIONS[a.f].pact.name + ' signed with ' + fname(a.f) + '.';
        if (a.f === 'ganga') msg += ' The Coastal League protests the tariffs (trust -5).';
        if (a.f === 'coast') msg += ' The Gangetic Union fears cheap imports (trust -5).';
        break;
      }
      case 'counter':
        f.grip = Math.max(0, f.grip - 1); f.countered = true; trust(S, a.f, 3);
        msg = 'You exposed Company arms deals in ' + FACTIONS[a.f].seat + '. Its grip loosens.'; break;
      case 'invite':
        f.member = true; trust(S, a.f, 5); spill(S, a.f, 8);
        msg = fname(a.f) + ' signs the charter and joins the federation.'; break;
      case 'project': {
        S.projects[a.p] = true;
        if (a.p === 'hydro') {
          pip(S, 'himal', 'hydro', 2); trust(S, 'himal', 8); pip(S, 'coast', 'energy', 1);
          msg = 'The Hydro Grid comes online.';
          if (!S.tech.ror) { pip(S, 'delta', 'flow', -1); trust(S, 'delta', -12); shiftRel(S, 'himal', 'delta', -1); msg += ' Dams cut the flow downstream: Delta Republic trust -12.'; }
        }
        if (a.p === 'flow') {
          pip(S, 'delta', 'flow', 2); trust(S, 'delta', 8); shiftRel(S, 'himal', 'delta', 1);
          msg = 'The River Flow Compact guarantees water to the delta.';
          if (!S.tech.ror) { pip(S, 'himal', 'hydro', -1); trust(S, 'himal', -6); msg += ' The Himalayan Accord resents the dam limits: trust -6.'; }
        }
        if (a.p === 'induswater') { pip(S, 'indus', 'water', 2); trust(S, 'indus', 8); msg = 'The Indus Water Treaty is signed in Lahore.'; }
        if (a.p === 'rail') {
          pip(S, 'coast', 'trade', 1); pip(S, 'ganga', 'industry', 1); shiftRel(S, 'ganga', 'coast', 1);
          ORDER.forEach(function (id) { trust(S, id, 3); S.factions[id].touched = true; });
          msg = 'The first trains run coast to plain. All trust +3.';
        }
        break;
      }
      case 'broker':
        shiftRel(S, a.a, a.b, 1); trust(S, a.a, 2); trust(S, a.b, 2);
        S.factions[a.a].touched = S.factions[a.b].touched = true;
        msg = 'Talks succeed. ' + fname(a.a) + ' and ' + fname(a.b) + ' are now ' + REL_NAMES[rel(S, a.a, a.b)].toLowerCase() + '.'; break;
      case 'back': {
        const p = planOf(S, a.f);
        f.plan.backed = true; f.plan.eta -= 1; trust(S, a.f, 6);
        p.harmed.forEach(function (h) { trust(S, h, -4); });
        msg = 'You put your name behind ' + fname(a.f) + '\'s plan. Trust +6.' + (p.harmed.length ? ' ' + p.harmed.map(fname).join(' and ') + ' notice whose side you took.' : '');
        if (f.plan.eta <= 0) { p.done(S); S.plansDone[p.key] = true; f.plan = null; f.planWait = 2; msg += ' The plan is complete: ' + p.then; }
        break;
      }
      case 'dissuade': {
        const p = planOf(S, a.f);
        f.plan = null; f.planWait = 2; trust(S, a.f, -3);
        msg = fname(a.f) + ' shelves its plan to ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + ', grudgingly. Trust -3.'; break;
      }
      case 'research':
        S.research = a.t; msg = 'Your labs begin work on ' + TECH[a.t].name + '. Ready next season.'; break;
    }
    log(S, msg, a.type === 'invite' ? 'good' : 'info');
    checkWin(S);
    return { ok: true, msg: msg };
  }

  function checkWin(S) {
    if (members(S).length >= 4 && !S.outcome) {
      S.outcome = { result: 'win', title: 'The charter is ratified', text: 'Four of five powers have joined you. A supermajority ratifies the federation charter in ' + season(S) + ' ' + year(S) + '.' };
      S.phase = 'over';
    }
  }

  /* ---------- end of season: council, then resolution ---------- */
  function endSeason(S) {
    if (S.phase !== 'actions') return { ok: false };
    if (CHARTER[S.turn] && !S.charter[CHARTER[S.turn].key]) {
      S.council = S.turn; S.phase = 'council';
      return { ok: true, council: true };
    }
    resolve(S);
    return { ok: true };
  }

  function chooseCharter(S, opt) {
    if (S.phase !== 'council') return { ok: false };
    const q = CHARTER[S.council];
    const keys = Object.keys(q.options);
    const other = keys.filter(function (k) { return k !== opt; })[0];
    const ms = members(S);
    const votes = ms.map(function (id) { return { id: id, yes: (q.options[opt].trust[id] || 0) >= 0 }; });
    const yes = votes.filter(function (v) { return v.yes; }).length + 1; // your own vote
    const no = votes.length - (yes - 1);
    const passed = yes >= no;
    const chosen = passed ? opt : other;
    const o = q.options[chosen];
    S.charter[q.key] = chosen;
    Object.keys(o.trust).forEach(function (id) { trust(S, id, o.trust[id]); });
    Object.keys(o.pips).forEach(function (id) { pip(S, id, o.pips[id][0], o.pips[id][1]); });
    let msg;
    if (!ms.length) msg = 'With no members yet, you declare a founding principle: ' + o.name + '.';
    else if (passed) msg = 'The council adopts your proposal, ' + o.name + ', ' + yes + ' to ' + no + '.';
    else msg = 'The council rejects your proposal ' + yes + ' to ' + no + ' and adopts ' + o.name + ' instead.';
    log(S, msg, passed ? 'info' : 'warn');
    S.lastVote = { votes: votes, passed: passed, chosen: chosen, proposed: opt, yes: yes, no: no, msg: msg };
    S.council = null;
    resolve(S);
    return { ok: true, msg: msg };
  }

  function resolve(S) {
    const R = [];
    // ignored requests
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.request) {
        const d = f.member ? -10 : -6; trust(S, id, d);
        R.push({ f: id, d: d, kind: 'bad', text: fname(id) + '\'s request went unanswered. Trust ' + d + '.' });
        f.request = null;
      }
    });
    // drift
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member) {
        if (needTotal(S, id) >= JOIN_NEEDS) trust(S, id, 1); else { trust(S, id, -2); R.push({ f: id, d: -2, kind: 'warn', text: fname(id) + ' feels the federation is not meeting its needs. Trust -2.' }); }
      } else if (!f.touched) trust(S, id, -1);
    });
    // powers advance their own plans
    ORDER.forEach(function (id) {
      const f = S.factions[id], p = planOf(S, id);
      if (!p) { if (f.planWait > 0 && S.turn >= UNLOCK.plans - 1) f.planWait -= 1; return; }
      if (f.grip >= 3) return;
      if (p.cancelIf(S)) {
        f.plan = null; f.planWait = 2;
        R.push({ f: id, kind: 'good', text: fname(id) + ' drops its plan to ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + ': ' + p.endIf + '.' });
        return;
      }
      f.plan.eta -= 1;
      if (f.plan.eta <= 0) {
        p.done(S); S.plansDone[p.key] = true; f.plan = null; f.planWait = 2;
        R.push({ f: id, kind: 'warn', text: fname(id) + ' completes its plan: ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + '. ' + p.then });
      }
    });
    // members who dislike each other quarrel in council
    PAIRS.forEach(function (p) {
      if (S.turn < UNLOCK.relations || !S.factions[p[0]].member || !S.factions[p[1]].member) return;
      const r = rel(S, p[0], p[1]);
      if (r < 0) { trust(S, p[0], 2 * r); trust(S, p[1], 2 * r); R.push({ f: p[0], f2: p[1], d: 2 * r, kind: 'warn', text: fname(p[0]) + ' and ' + fname(p[1]) + ' quarrel in council. Trust ' + (2 * r) + ' each.' }); }
      else if (r > 0) { trust(S, p[0], 1); trust(S, p[1], 1); }
    });
    // the Company moves
    S.companyTargets.forEach(function (t) {
      const f = S.factions[t];
      const gained = f.trust - f.trustAtStart;
      if (f.countered) R.push({ f: t, co: 'blocked', kind: 'good', text: 'Your exposure of the arms deal blocked the Company in ' + FACTIONS[t].seat + '.' });
      else if (gained >= BLOCK_GAIN) R.push({ f: t, co: 'blocked', kind: 'good', text: fname(t) + ' turns the Company\'s agents away. Your goodwill outbid them.' });
      else {
        f.grip = Math.min(3, f.grip + 1);
        const stage = ['', 'takes Company money', 'is now a Company client', 'goes rogue with Company arms'][f.grip];
        R.push({ f: t, co: 'grip', kind: 'bad', text: fname(t) + ' ' + stage + '.' });
        if (f.grip >= 3 && f.member) { f.member = false; R.push({ f: t, kind: 'bad', text: fname(t) + ' leaves the federation.' }); }
      }
    });
    // secession
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member && f.trust < 40) {
        f.member = false; f.grip = Math.min(3, f.grip + 1);
        R.push({ f: id, kind: 'bad', text: fname(id) + ' secedes from the federation. Its hardliners turn to the Company.' });
      }
    });
    R.forEach(function (r) { log(S, r.text, r.kind); });
    S.lastResolution = R;

    if (clients(S).length >= 3) {
      S.outcome = { result: 'loss', title: 'The Company wins', text: 'Three of five powers are now Company clients. Division pays, and the subcontinent stays divided.' };
      S.phase = 'over'; return;
    }
    if (S.turn >= MAX_TURNS) {
      const n = members(S).length;
      if (n >= 3) S.outcome = { result: 'partial', title: 'A fragile federation', text: n + ' of five powers stand with you at the end of ' + year(S) + '. It is a start, short of the supermajority the charter needs.' };
      else S.outcome = { result: 'loss', title: 'Still divided', text: 'Only ' + n + ' of five powers joined you in three years. The warring-states era goes on.' };
      S.phase = 'over'; return;
    }
    startTurn(S);
  }

  root.Aman = {
    create: create, available: available, act: act, endSeason: endSeason, chooseCharter: chooseCharter,
    resolveCrisis: resolveCrisis, resolveDispute: resolveDispute, advise: advise, gates: gates, unlocked: unlocked, rel: rel, gaps: gaps, planOf: planOf, REL_NAMES: REL_NAMES, PAIRS: PAIRS, yields: yields, fightOdds: fightOdds, canJoin: canJoin, needTotal: needTotal,
    members: members, clients: clients, season: season, year: year,
    FACTIONS: FACTIONS, PROJECTS: PROJECTS, TECH: TECH, CHARTER: CHARTER, ORDER: ORDER,
    BLOCK_GAIN: BLOCK_GAIN, MAX_TURNS: MAX_TURNS, JOIN_TRUST: JOIN_TRUST, JOIN_NEEDS: JOIN_NEEDS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Aman;
})(typeof window !== 'undefined' ? window : globalThis);

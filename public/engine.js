/* Aman prototype rules engine. No DOM. Runs in the browser (window.Aman) and in Node. */
(function (root) {
  'use strict';

  const SEASONS = ['Spring', 'Monsoon', 'Autumn', 'Winter'];
  const RES = ['water', 'energy', 'food'];
  /* Three acts. Act 1 has an absolute deadline (season 12); acts 2 and 3 run a fixed length from their start. */
  const ACTS = {
    1: { name: 'Neighbors', max: 12, goal: 3 },
    2: { name: 'Strain', len: 12, goal: 4 },
    3: { name: 'Charter', len: 12, goal: 4, callFrom: 8 }
  };
  const MAX_TURNS = 36;          // hard bound only
  const RATIFY_TRUST = 65;       // pledge gate
  const RATIFY_NEEDS = 5;        // pledge gate, of 6 need points
  const PLEDGE_KEEP = 62;        // a pledge is withdrawn below this trust
  const STRAIN_MAX = 3;          // a member walks out at this much strain
  const DEMAND_TRUST = 6;        // trust lost by ignoring a demand
  const DEMAND_GAIN = 2;         // trust gained by granting one: members expect it
  const ACT3_INF = 6;            // influence each season in act 3
  const SHARE_PER = 10;          // a budget share grows by 1 Capital for every 10 in your treasury
  const HEAR_COST = { inf: 1, capital: 2 };
  const TERMS_COST = { inf: 2, capital: 3 };
  const TERMS_TRUST = 35;
  const DISPUTE = { back: 8, talks: 3, out: -3, cost: { capital: 3, inf: 1 } };
  const DISTRUST_VOTE = 50;      // members below this trust vote against you (acts 2 and 3)
  const MEMBER_DRIFT = { 1: 1, 2: -1, 3: -1 };  // members' trust each season with needs met. From act 2 they expect more.
  const EXPECT_AT = 70, EXPECT_HIGH = -4;       // from act 2, members above this trust lose more each season
  const JOIN_SPILL = { 1: 8, 2: 12, 3: 12 };
  const CO_IMMUNE = { 1: 55, 2: 60, 3: 60 };   // act 3 drops immunity entirely from its second season
  const COUNCIL_AS = [3, 6, 9, 12];            // act 2 council seasons, as act seasons
  const ACT_START = {
    2: function (n) { return 'Act 2 begins. ' + NUMW[n] + ' powers stand with you. Now they want a say.'; },
    3: function (n) { return 'Act 3 begins. ' + NUMW[n] + ' members stand with you. The charter goes to the powers.'; }
  };
  const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  const JOIN_TRUST = 55;
  const SECEDE_TRUST = 40;       // a member below this trust secedes
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
  const REPEAT_PLANS = { forts: true, arms: true, appeal: true };
  /* Systems arrive one season at a time so a new player is not handed everything at once. */
  const UNLOCK = { company: 2, relations: 3, plans: 4 };
  const INTRO = {
    2: 'New this season: the Company. It courts the power that trusts you least. Raise that power\'s trust by 10 within the season, or counter the Company there, or its grip tightens. Three steps and the power goes rogue.',
    3: 'New this season: ties between powers. Helping a power pleases its friends and irritates its rivals, and a power will not join while its rival is a member. Open Relations to broker talks.',
    4: 'New this season: the powers act on their own. Each runs a plan on a countdown. Open a power to back its plan or talk it out of it.'
  };
  /* From act 2, intros are keyed by act and act season. */
  const ACT_INTRO = {
    '2:1': 'New this act: demands. Each season some members ask for resources or a budget share. Each unmet demand adds a strain mark. Three marks and the member walks out. Members also expect more: trust -1 each season, -4 above trust 70.',
    '2:2': 'New this season: motions. Members table motions for the next council. Members with Company money or trust below 50 vote against you, and so do members with strain unless the option gains them trust. Ties now go against you.',
    '2:3': 'New this season: rivals harden. A power outside loses 1 trust each season for every member it is tense or rival with.',
    '3:1': 'New this act: pledges. A member pledges to ratify at trust 65 with 5 need points, no Company grip, and no strain. It withdraws below trust ' + PLEDGE_KEEP + '. Four pledges ratify the charter.',
    '3:2': 'New this season: the Company goes all in. It courts three powers a season, pledged powers first, and none is immune. A pledged power that takes its money withdraws its pledge.',
    '3:3': 'New this season: holdouts. Each power outside names a grievance. Offer terms to bring one in, even beside its rival.',
    '3:8': 'You may now call the ratification vote. It passes with four pledges.'
  };
  function actSeason(S) { return S.actStart[S.act] ? S.turn - S.actStart[S.act] + 1 : 0; }
  function unlocked(S) {
    const as = actSeason(S), a = S.act;
    return {
      company: S.turn >= UNLOCK.company, relations: S.turn >= UNLOCK.relations, plans: S.turn >= UNLOCK.plans,
      demands: a >= 2, motions: a === 2 && as >= 2, harden: (a === 2 && as >= 3) || a === 3,
      pledges: a === 3, allIn: a === 3 && as >= 2, terms: a === 3 && as >= 3, callVote: a === 3 && as >= ACTS[3].callFrom
    };
  }

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

  /* Act 2: each member can table two motions, in order. Passing one costs upkeep each season while its proposer is a member. */
  const MOTIONS = {
    indus: [
      { key: 'veto', short: 'federal policing', name: 'Provincial veto on federal policing', text: 'Members can block federal police on their soil.', pips: { indus: ['autonomy', 1] }, trust: { ganga: -6, delta: -4 } },
      { key: 'indusfirst', short: 'Indus waters', name: 'Indus waters for the League first', text: 'No Indus water leaves the League.', pips: { indus: ['water', 1] }, trust: {}, upkeep: { water: 1 } }
    ],
    himal: [
      { key: 'hydrobuy', short: 'hydro purchases', name: 'Guaranteed hydro purchase', text: 'The federation buys Himalayan power at a fixed price.', pips: { himal: ['hydro', 1] }, trust: { coast: 2 }, upkeep: { capital: 1 } },
      { key: 'headfee', short: 'headwater fees', name: 'Headwater fee', text: 'Downstream members pay for the rivers they use.', pips: {}, trust: { delta: -8, ganga: -4 } }
    ],
    delta: [
      { key: 'minflow', short: 'river flow', name: 'Minimum flow guarantee', text: 'Upstream dams must release a set flow.', pips: { delta: ['flow', 1] }, trust: { himal: -8 } },
      { key: 'floodfund', short: 'flood funding', name: 'Federal flood fund', text: 'Every member pays into flood defense.', pips: { delta: ['flood', 1] }, trust: { indus: -2 }, upkeep: { capital: 1 } }
    ],
    ganga: [
      { key: 'grain', short: 'grain prices', name: 'Grain price support', text: 'The federation guarantees farm prices.', pips: { ganga: ['food', 1] }, trust: { coast: -4 }, upkeep: { food: 1 } },
      { key: 'seats', short: 'council seats', name: 'Council seats by population', text: 'Bigger members get more say in council.', pips: {}, trust: { indus: -8, himal: -6, coast: -4 } }
    ],
    coast: [
      { key: 'freeports', short: 'free ports', name: 'Free ports charter', text: 'No duties at member ports.', pips: { coast: ['trade', 1] }, trust: { ganga: -8 } },
      { key: 'portgrid', short: 'the power grid', name: 'Ports first on the grid', text: 'Ports get power before inland towns.', pips: { coast: ['energy', 1] }, trust: { ganga: -4, himal: -2 }, upkeep: { energy: 1 } }
    ]
  };
  const MOTION_BY_KEY = {};
  Object.keys(MOTIONS).forEach(function (id) { MOTIONS[id].forEach(function (m) { MOTION_BY_KEY[m.key] = Object.assign({ f: id }, m); }); });

  /* Act 3: two last charter questions, keyed by act season. */
  const ARTICLES = {
    3: { key: 'revenue', title: 'How is federal revenue shared?', options: {
      equal: { name: 'Equal shares', text: 'Every member gets the same.', trust: { indus: 6, himal: 6, coast: 2, ganga: -8 }, pips: { himal: ['food', 1] } },
      people: { name: 'By population', text: 'Revenue follows the people.', trust: { ganga: 8, delta: 4, indus: -6, himal: -6 }, pips: { ganga: ['industry', 1] } } } },
    6: { key: 'borders', title: 'Open borders or managed movement?', options: {
      open: { name: 'Open borders', text: 'Anyone may live and work anywhere.', trust: { coast: 6, delta: 4, ganga: 2, indus: -6 }, pips: { coast: ['trade', 1] } },
      managed: { name: 'Managed movement', text: 'Members set their own entry rules.', trust: { indus: 6, himal: 4, coast: -4 }, pips: { indus: ['autonomy', 1] } } } }
  };

  /* One shape for every council item: Act 1 questions, motions, and articles. */
  function motionOptions(m) {
    const tp = Object.assign({}, m.trust); tp[m.f] = (tp[m.f] || 0) + 8;
    const sp = {}; sp[m.f] = -1;
    const sr = {}; sr[m.f] = 1;
    const tr = {}; tr[m.f] = -8;
    return {
      pass: { name: 'Pass it', text: m.text, trust: tp, pips: m.pips, upkeep: m.upkeep || {}, strain: sp },
      reject: { name: 'Reject it', text: 'The motion fails. ' + FACTIONS[m.f].name + ' takes it badly.', trust: tr, pips: {}, upkeep: {}, strain: sr }
    };
  }
  function itemView(it) {
    if (it.kind === 'motion') {
      const m = MOTION_BY_KEY[it.key];
      return { kind: 'motion', key: it.key, f: m.f, title: FACTIONS[m.f].name + ' tables a motion: ' + m.name, text: m.text, options: motionOptions(m) };
    }
    const q = it.kind === 'article' ? ARTICLES[it.as] : CHARTER[it.turn];
    const opts = {};
    Object.keys(q.options).forEach(function (k) { const o = q.options[k]; opts[k] = { name: o.name, text: o.text, trust: o.trust, pips: o.pips, upkeep: {}, strain: {} }; });
    return { kind: it.kind, key: q.key, title: q.title, text: '', options: opts };
  }
  /* Older UI reads A.CHARTER[S.council]. Motions and articles get hidden entries so that lookup keeps working. */
  Object.keys(MOTION_BY_KEY).forEach(function (k) {
    Object.defineProperty(CHARTER, 'motion:' + k, { enumerable: false, value: itemView({ kind: 'motion', key: k }) });
  });
  Object.keys(ARTICLES).forEach(function (as) {
    Object.defineProperty(CHARTER, 'article:' + ARTICLES[as].key, { enumerable: false, value: itemView({ kind: 'article', as: +as }) });
  });

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
      act: 1, actStart: { 1: 1, 2: null, 3: null }, agenda: [], exits: [], lastVotes: [], lastVote: null, passed: {}, voteCalled: null,
      stats: { walkouts: 0, secessions: 0, demandsMet: 0, demandsMissed: 0, motionsPassed: 0, motionsFailed: 0, pledgesLost: 0, termsOffered: 0 },
      briefing: [], log: [], lastResolution: [], history: []
    };
    ORDER.forEach(function (id) {
      const d = FACTIONS[id];
      const pips = {};
      d.needs.forEach(function (n) { pips[n.key] = 0; });
      S.factions[id] = { id: id, trust: d.trust, pips: pips, grip: 0, member: false, pact: false, request: null, touched: false, countered: false, trustAtStart: d.trust, plan: null, planIdx: 0, planWait: PLAN_WAIT[id],
        demand: null, strain: 0, lastStrain: null, motion: null, motionIdx: 0, left: null, leftHow: null, grievance: null, pledged: false, terms: false };
    });
    PAIRS.forEach(function (p) { const k = pk(p[0], p[1]); S.rel[k] = REL_START[k] || 0; });
    S.history.push(histEntry(S, 1));
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
  /* A plan that buys Company arms. A member that goes rogue this way leaves; resolve() reports it. */
  function gripUp(S, id) { const f = S.factions[id]; f.grip = Math.min(3, f.grip + 1); if (f.grip >= 3 && f.member) { leave(S, id, 'rogue'); S.exits.push(id); } }
  function rivalOf(S, id) { if (S.turn < UNLOCK.relations) return undefined; return members(S).filter(function (m) { return m !== id && rel(S, id, m) <= -2; })[0]; }
  /* Accession terms waive the rival gate. */
  function rivalInside(S, id) { return S.factions[id].terms ? undefined : rivalOf(S, id); }
  function canJoin(S, id) { const f = S.factions[id]; return !f.member && f.trust >= JOIN_TRUST && needTotal(S, id) >= JOIN_NEEDS && f.grip < 2 && !rivalInside(S, id) && f.strain <= 0; }
  /* What still stands between a power and membership, as short phrases. */
  function gaps(S, id) {
    const f = S.factions[id], g = [], nt = needTotal(S, id), rv = rivalInside(S, id);
    if (f.trust < JOIN_TRUST) g.push((JOIN_TRUST - f.trust) + ' more trust');
    if (nt < JOIN_NEEDS) g.push((JOIN_NEEDS - nt) + ' more need point' + (JOIN_NEEDS - nt > 1 ? 's' : ''));
    if (f.grip >= 2) g.push('the Company\'s grip below client level');
    if (rv) g.push('peace with its rival ' + fname(rv) + ', which is already a member');
    if (f.strain > 0) g.push('its grievance heard (' + f.strain + ' strain left)');
    return g;
  }
  /* Act 3: what stands between a member and its pledge. */
  function pledgeGaps(S, id) {
    const f = S.factions[id], g = [], nt = needTotal(S, id);
    if (f.trust < RATIFY_TRUST) g.push((RATIFY_TRUST - f.trust) + ' more trust');
    if (nt < RATIFY_NEEDS) g.push((RATIFY_NEEDS - nt) + ' more need point' + (RATIFY_NEEDS - nt > 1 ? 's' : ''));
    if (f.grip > 0) g.push('Company grip at zero');
    if (f.strain > 0) g.push('no grievance');
    return g;
  }
  function canPledge(S, id) { const f = S.factions[id]; return S.act === 3 && f.member && !f.pledged && !pledgeGaps(S, id).length; }
  function pledges(S) { return ORDER.filter(function (id) { return S.factions[id].member && S.factions[id].pledged; }); }
  function weakestNeed(id, f) { return FACTIONS[id].needs.reduce(function (a, n) { return f.pips[n.key] < f.pips[a.key] ? n : a; }); }
  function opposedMembers(S, id) { return members(S).filter(function (m) { return m !== id && rel(S, id, m) <= -1; }); }
  /* The members a power outside hardens against this season (trust -1 each), or none. */
  function hardenedBy(S, id) {
    const f = S.factions[id], as = actSeason(S);
    if (!((S.act === 2 && as >= 3) || S.act === 3) || f.member || f.grip >= 3) return [];
    return opposedMembers(S, id);
  }
  function addStrain(S, id, d, why) {
    const f = S.factions[id];
    f.strain = clamp(f.strain + d, 0, STRAIN_MAX);
    if (d > 0 && why) f.lastStrain = why;
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
    if (S.act === 3 && f.member) return [
      { key: 'trust', label: 'Trust', ok: f.trust >= RATIFY_TRUST, text: f.trust + ' of ' + RATIFY_TRUST },
      { key: 'needs', label: 'Needs met', ok: nt >= RATIFY_NEEDS, text: nt + ' of ' + RATIFY_NEEDS },
      { key: 'company', label: 'Company grip at zero', ok: f.grip === 0, text: ['Yes', 'Taking its money', 'No: a client', 'No: gone rogue'][f.grip] },
      { key: 'strain', label: 'No grievance', ok: f.strain === 0, text: f.strain ? f.strain + ' of ' + STRAIN_MAX + ' strain' : 'Clear' }
    ];
    if (f.member) {
      // what keeps a member in: secession, rogue, and (from act 2) walkout
      const m = [
        { key: 'trust', label: 'Trust', ok: f.trust >= SECEDE_TRUST, text: f.trust + ', secedes below ' + SECEDE_TRUST },
        { key: 'company', label: 'Not rogue', ok: f.grip < 3, text: ['No Company money', 'Taking its money', 'A client: one step from rogue', 'Gone rogue'][f.grip] }
      ];
      if (S.act >= 2) m.push({ key: 'strain', label: 'Strain', ok: f.strain < STRAIN_MAX, text: f.strain + ' of ' + STRAIN_MAX + ', walks out at ' + STRAIN_MAX });
      return m;
    }
    const g = [
      { key: 'trust', label: 'Trust', ok: f.trust >= JOIN_TRUST, text: f.trust + ' of ' + JOIN_TRUST },
      { key: 'needs', label: 'Needs met', ok: nt >= JOIN_NEEDS, text: nt + ' of ' + JOIN_NEEDS },
      { key: 'company', label: 'Free of the Company', ok: f.grip < 2, text: ['Yes', 'Taking its money', 'No: a client', 'No: gone rogue'][f.grip] }
    ];
    if (S.turn >= UNLOCK.relations) g.push({ key: 'rival', label: 'No rival inside', ok: !rv, text: rv ? fname(rv) + ' is a member' : (f.terms ? 'Waived by its accession terms' : 'Clear') });
    if (S.act >= 2 && (f.strain > 0 || f.leftHow === 'walkout')) g.push({ key: 'grievance', label: 'Grievance heard', ok: f.strain === 0, text: f.strain ? f.strain + ' of ' + STRAIN_MAX + ' strain' : 'Heard' });
    return g;
  }

  /* The adviser: every available action, scored, with a one-line reason. Also drives the test bot. */
  function advise(S) {
    const out = [];
    const ps = pledges(S);
    available(S).forEach(function (a) {
      if (!a.ok) return;
      let s = 0, why = '', label = a.label;
      const f = a.f ? S.factions[a.f] : null, nt = a.f ? needTotal(S, a.f) : 0;
      const courted = a.f && S.companyTargets.indexOf(a.f) >= 0;
      const unblocked = courted && !f.countered && f.trust - f.trustAtStart < BLOCK_GAIN;
      if (a.f) label = fname(a.f) + ': ' + a.label.charAt(0).toLowerCase() + a.label.slice(1);
      switch (a.type) {
        case 'invite': s = 100; why = 'Every gate is open. It will join now.'; break;
        case 'pledge': s = 100; why = 'Every ratification gate is open. It will pledge now.'; break;
        case 'callvote': {
          const lost = ps.filter(function (id) { const g = S.factions[id]; return g.demand || (S.companyTargets.indexOf(id) >= 0 && !g.countered && g.trust - g.trustAtStart < BLOCK_GAIN); }).length;
          // with four pledges, wait a while for a fifth member that is close
          const fifth = ORDER.filter(function (id) { const g = S.factions[id]; return g.member && !g.pledged && g.grip === 0 && pledgeGaps(S, id).length <= 1; }).length;
          const wait = ps.length < 5 && fifth && actSeason(S) < ACTS[3].len - 1;
          if (ps.length - lost >= ACTS[3].goal && !wait) { s = 95; why = 'Four pledges stand and the Company cannot reach enough of them this season.'; }
          break;
        }
        case 'counter':
          if (S.act === 3 && f.pledged && unblocked) { s = 72; why = 'The Company is after a pledge. Without a counter, it is withdrawn.'; }
          else if (S.act === 3 && f.member && !f.pledged && f.grip === 1 && pledgeGaps(S, a.f).length === 1) { s = 65; why = 'Only Company money stands between it and a pledge.'; }
          else if (f.grip >= 2) { s = 60; why = 'A Company client will not join. This loosens the grip.'; }
          else if (courted && f.grip >= 1) { s = 45; why = 'Blocks this season\'s deal. One more step would make it a Company client.'; }
          else if (S.act >= 2 && f.member && f.grip === 1) { s = 40; why = 'Company money buys its council vote.'; }
          break;
        case 'hear':
          if (f.member && f.strain >= 2) { s = 58; why = 'One more grievance and it walks out.'; }
          else if (!f.member && f.left !== null && nt >= JOIN_NEEDS) { s = 40; why = 'Hear it out and it can rejoin.'; }
          else if (S.act === 3 && f.member && !f.pledged && pledgeGaps(S, a.f).length === 1) { s = 45; why = 'Only its grievance stands between it and a pledge.'; }
          else if (f.member && f.strain === 1) { s = 20; why = 'Clears a strain mark before it grows.'; }
          break;
        case 'demand': {
          s = 46 + (f.strain >= 2 ? 10 : 0) + (f.trust < 55 ? 4 : 0);
          if (f.demand.kind === 'share' && S.res.capital - a.cost.capital < 3) s -= 16;
          why = 'A member asked. Unmet, it costs ' + DEMAND_TRUST + ' trust and a strain mark (now ' + f.strain + ' of ' + STRAIN_MAX + ').';
          if (S.act === 3 && f.pledged) { s += 20; why = 'A pledged member asked. Unmet, it withdraws its pledge.'; }
          break;
        }
        case 'terms': {
          const opens = !!rivalOf(S, a.f) || nt + 1 === JOIN_NEEDS;
          s = opens ? 50 : 15; why = 'Terms settle its grievance and let it join beside its rival.';
          break;
        }
        case 'answer': s = 40 + (f.member ? 10 : 0) + (courted ? 4 : 0);
          why = 'It asked. Helping earns 8 trust; silence costs ' + (f.member ? 10 : 6) + '.' + (courted ? ' It also helps outbid the Company.' : ''); break;
        case 'project': s = 35; why = PROJECTS[a.p].effect;
          if (a.p === 'hydro' && !S.tech.ror) { s = 8; }
          if (a.p === 'flow' && !S.tech.ror) s = 20;
          break;
        case 'pact': s = 30; why = 'One Influence buys a need point and 6 trust.';
          if ((a.f === 'ganga' && S.factions.coast.member) || (a.f === 'coast' && S.factions.ganga.member)) { s = 10; }
          break;
        case 'research': s = (S.turn <= 8 || S.act === 2) ? ({ ror: 28, crops: 26, flood: 24, desal: 14, civil: 6 })[a.t] : 0; why = TECH[a.t].effect; break;
        case 'aid':
          if (nt < JOIN_NEEDS) { s = 18; why = 'Raises one of its needs. It has ' + nt + ' of the ' + JOIN_NEEDS + ' it wants.'; }
          else if (S.act === 3 && f.member && nt < RATIFY_NEEDS) { s = 18; why = 'Raises one of its needs. It has ' + nt + ' of the ' + RATIFY_NEEDS + ' a pledge wants.'; }
          break;
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
          if (f.member) {
            if (f.trust < 40 + 6) { s = 55; why = 'Its trust is near 40. Below that it secedes.'; break; }
            if (S.act === 3 && f.pledged && f.trust < PLEDGE_KEEP + 6) { s = 50; why = 'Its pledge is withdrawn below trust ' + PLEDGE_KEEP + '.'; break; }
            if (S.act === 3 && !f.pledged && nt >= RATIFY_NEEDS && f.trust < RATIFY_TRUST) { s = 25; why = 'Its needs are met. Only trust stands between it and a pledge.'; }
            break;
          }
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
    // upkeep of passed motions, while the proposer is a member
    Object.keys(S.passed || {}).forEach(function (k) {
      const m = MOTION_BY_KEY[k];
      if (!m.upkeep || !S.factions[S.passed[k]].member) return;
      Object.keys(m.upkeep).forEach(function (r) { y[r] -= m.upkeep[r]; });
    });
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
    const as = actSeason(S);
    if (S.act === 1 && INTRO[S.turn]) B.push({ kind: 'new', text: INTRO[S.turn] });
    if (S.act >= 2 && ACT_INTRO[S.act + ':' + as]) B.push({ kind: 'new', fs: members(S), text: ACT_INTRO[S.act + ':' + as] });

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
    const baseInf = S.act === 1 ? 3 + (nm >= 1 ? 1 : 0) : S.act === 2 ? (nm >= 4 ? 5 : 4) : ACT3_INF;
    S.influence = baseInf - (S.shortage ? 1 : 0);
    if (S.shortage) B.push({ kind: 'bad', text: 'Shortages at home distract your government. Influence -1 this season.' });

    // per-faction reset
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      f.touched = false; f.countered = false; f.trustAtStart = f.trust; f.request = null; f.demand = null;
    });

    // requests: from act 2, only powers outside make them
    const pool = ORDER.filter(function (id) { return S.factions[id].grip < 3 && (S.act === 1 || !S.factions[id].member); });
    let n = S.act === 1 ? 1 + (failed ? 1 : 0) + (nm >= 2 ? 1 : 0) : Math.min(pool.length, 1 + (failed ? 1 : 0));
    while (n > 0 && pool.length) {
      const id = pool.splice(Math.floor(S.rng() * pool.length), 1)[0];
      const r = pickRes(S, id);
      S.factions[id].request = { res: r, amount: 2 };
      B.push({ f: id, kind: 'ask', text: fname(id) + ' asks for 2 ' + cap(r) + '.' });
      n--;
    }

    // members make demands (act 2 on). The random stream is touched only from act 2.
    if (S.act >= 2) drawDemands(S, failed, as);

    // company announces its targets
    const nTargets = S.act === 1 ? (nm >= 3 ? 2 : 1) : S.act === 2 ? 2 : (as >= 2 ? 3 : 2);
    S.companyTargets = S.turn >= UNLOCK.company ? pickCompanyTargets(S, nTargets) : [];
    if (S.companyTargets.length) {
      B.push({ fs: S.companyTargets.slice(), co: 'court', kind: 'warn', text: 'Company agents are courting ' + S.companyTargets.map(fname).join(' and ') + '. Raise trust there by ' + BLOCK_GAIN + ' this season, or counter the Company, to block the deal.' });
      if (S.companyTargets.length > 1 && !S.escalated) { S.escalated = true; B.push({ kind: 'warn', text: 'Your federation alarms the Company. From now on it courts two factions each season.' }); }
    }

    // powers start plans of their own
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (S.turn >= UNLOCK.plans && !f.plan && f.grip < 3 && f.planWait <= 0) {
        // from act 2, a plan that has landed does not start again, except the Company plans
        let i = -1;
        for (let k = 0; k < PLANS[id].length; k++) {
          const j = (f.planIdx + k) % PLANS[id].length, q = PLANS[id][j];
          if (S.act === 1 || !S.plansDone[q.key] || REPEAT_PLANS[q.key]) { i = j; f.planIdx += k; break; }
        }
        if (i < 0) return;
        const p = PLANS[id][i];
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

  /* The resource a power asks for: 70% its first unmet resource need, else random. */
  function pickRes(S, id) {
    const open = FACTIONS[id].needs.filter(function (nd) { return nd.res && S.factions[id].pips[nd.key] < 3; });
    if (open.length && S.rng() < 0.7) return open[0].res;
    return RES[Math.floor(S.rng() * 3)];
  }

  /* The next council in act 2 at least one season away, as an absolute season, or null. */
  function nextCouncil(S, as) {
    if (S.act !== 2) return null;
    const c = COUNCIL_AS.filter(function (x) { return x > as; })[0];
    return c ? S.actStart[2] + c - 1 : null;
  }

  function drawDemands(S, failed, as) {
    const B = S.briefing, ms = members(S);
    const pool = ms.filter(function (id) { return S.factions[id].grip < 3 && !S.factions[id].demand; });
    const base = Math.ceil(ms.length / 2);
    const total = base + (failed ? 1 : 0);
    const nc = nextCouncil(S, as);
    for (let i = 0; i < total && pool.length; i++) {
      const id = pool.splice(Math.floor(S.rng() * pool.length), 1)[0], f = S.factions[id];
      let kind;
      if (i >= base) kind = 'claim';
      else {
        const canMotion = S.act === 2 && as >= 2 && !f.motion && f.motionIdx < 2 && nc !== null;
        if (canMotion && S.rng() < 0.25) kind = 'motion';
        else kind = S.rng() < 0.55 ? 'claim' : 'share';
        if (kind === 'motion' && ORDER.filter(function (o) { return S.factions[o].motion && S.factions[o].motion.at === nc; }).length >= 2) kind = 'claim';
      }
      if (kind === 'motion') {
        const m = MOTIONS[id][f.motionIdx];
        f.motionIdx += 1; f.motion = { key: m.key, at: nc };
        const wait = nc - S.turn;
        B.push({ f: id, kind: 'ask', text: fname(id) + ' tables a motion: ' + m.name + '. The council votes on it in ' + wait + ' season' + (wait > 1 ? 's' : '') + '.' });
      } else if (kind === 'claim') {
        const r = pickRes(S, id);
        f.demand = { kind: 'claim', res: r, amount: 3 };
        B.push({ f: id, kind: 'ask', text: fname(id) + ' claims 3 ' + cap(r) + ' from the federation.' });
      } else {
        const amt = 2 + (ms.length >= 4 ? 1 : 0) + Math.floor(S.res.capital / SHARE_PER);
        f.demand = { kind: 'share', res: 'capital', amount: amt };
        B.push({ f: id, kind: 'ask', text: fname(id) + ' asks for its budget share: ' + amt + ' Capital.' });
      }
    }
  }

  function pickCompanyTargets(S, n) {
    const as = actSeason(S), allIn = S.act === 3 && as >= 2;
    const immune = allIn ? Infinity : CO_IMMUNE[S.act];
    const harden = (S.act === 2 && as >= 3) || S.act === 3;
    function score(id) { return S.factions[id].trust - (harden ? 5 * opposedMembers(S, id).length : 0); }
    const el = ORDER.filter(function (id) {
      const f = S.factions[id];
      return f.grip < 3 && !(f.member && f.trust >= immune);
    });
    const out = [];
    function take(list, sc) {
      while (out.length < n && list.length) {
        const lo = Math.min.apply(null, list.map(sc));
        const ties = list.filter(function (id) { return sc(id) === lo; });
        const pick = ties[Math.floor(S.rng() * ties.length)];
        out.push(pick); list.splice(list.indexOf(pick), 1); el.splice(el.indexOf(pick), 1);
      }
    }
    if (allIn) take(el.filter(function (id) { return S.factions[id].pledged; }), function (id) { return S.factions[id].trust; });
    take(el.slice(), score);
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
  /* The four ways to settle the dispute in front of you, with their effects, for the scene and the bots.
     resolveDispute applies exactly these numbers. */
  function disputeOptions(S) {
    if (!S.dispute) return null;
    const a = S.dispute.a, b = S.dispute.b, r = rel(S, a, b);
    const bothIn = S.act >= 2 && S.factions[a].member && S.factions[b].member;
    function t(x, y) { const o = {}; o[a] = x; o[b] = y; return o; }
    function back(w, l) {
      const st = {}; if (bothIn) st[l] = 1;
      const tr = {}; tr[w] = DISPUTE.back; tr[l] = -DISPUTE.back;
      return { key: w === a ? 'a' : 'b', back: w, trust: tr, rel: r, strain: st, cost: {}, ok: true, why: '' };
    }
    const canTalk = S.res.capital >= DISPUTE.cost.capital && S.influence >= DISPUTE.cost.inf;
    return {
      a: a, b: b, topic: S.dispute.topic, rel: r,
      options: [
        back(a, b), back(b, a),
        { key: 'mediate', trust: t(DISPUTE.talks, DISPUTE.talks), rel: clamp(r + 1, -2, 2), strain: {}, cost: Object.assign({}, DISPUTE.cost), ok: canTalk, why: canTalk ? '' : 'Mediation costs 3 Capital and 1 Influence.' },
        { key: 'out', trust: t(DISPUTE.out, DISPUTE.out), rel: clamp(r - 1, -2, 2), strain: {}, cost: {}, ok: true, why: '' }
      ]
    };
  }
  function resolveDispute(S, choice) {
    if (S.phase !== 'dispute') return { ok: false, msg: 'No dispute to settle.' };
    const a = S.dispute.a, b = S.dispute.b;
    let msg;
    if (choice === 'mediate') {
      if (S.res.capital < DISPUTE.cost.capital || S.influence < DISPUTE.cost.inf) return { ok: false, msg: 'Mediation costs 3 Capital and 1 Influence.' };
      S.res.capital -= DISPUTE.cost.capital; S.influence -= DISPUTE.cost.inf; shiftRel(S, a, b, 1); trust(S, a, DISPUTE.talks); trust(S, b, DISPUTE.talks);
      S.factions[a].touched = S.factions[b].touched = true;
      msg = 'You hosted talks on ' + S.dispute.topic + '. ' + fname(a) + ' and ' + fname(b) + ' are now ' + REL_NAMES[rel(S, a, b)].toLowerCase() + '. Trust +' + DISPUTE.talks + ' with each.';
      log(S, msg, 'good');
    } else if (choice === 'a' || choice === 'b') {
      const w = choice === 'a' ? a : b, l = choice === 'a' ? b : a;
      trust(S, w, DISPUTE.back); trust(S, l, -DISPUTE.back);
      msg = 'You backed ' + fname(w) + ' over ' + S.dispute.topic + '. Trust +' + DISPUTE.back + ' there, -' + DISPUTE.back + ' with ' + fname(l) + '.';
      if (S.act >= 2 && S.factions[w].member && S.factions[l].member) {
        addStrain(S, l, 1, 'you sided against it over ' + S.dispute.topic);
        msg += ' ' + fname(l) + ' takes it as a grievance: strain ' + S.factions[l].strain + ' of ' + STRAIN_MAX + '.';
      }
      log(S, msg, 'warn');
    } else {
      trust(S, a, DISPUTE.out); trust(S, b, DISPUTE.out); shiftRel(S, a, b, -1);
      msg = 'You stayed out of it. Both resent your silence (trust ' + DISPUTE.out + '), and they are now ' + REL_NAMES[rel(S, a, b)].toLowerCase() + '.';
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
      if (f.member && f.demand) {
        const dm = f.demand, claim = dm.kind === 'claim';
        const c = { inf: 1 };
        if (claim) c[dm.res] = dm.amount; else c.capital = dm.amount;
        const match = claim && d.needs.some(function (n) { return n.res === dm.res && f.pips[n.key] < 3; });
        add({ id: 'demand:' + id, type: 'demand', f: id, kind: dm.kind, res: dm.res, label: claim ? 'Grant its claim: send ' + dm.amount + ' ' + cap(dm.res) : 'Pay its budget share: ' + dm.amount + ' Capital', cost: c,
          hint: 'Trust +' + DEMAND_GAIN + '. Unmet, it costs ' + DEMAND_TRUST + ' trust' + (S.act === 3 && f.pledged ? '' : ' and a strain mark') + (match ? ', and one of its needs improves' : '') + spillText(S, id, 2) });
      }
      if (S.act >= 2 && (f.member || f.strain > 0)) {
        add({ id: 'hear:' + id, type: 'hear', f: id, label: 'Hear its grievances', cost: Object.assign({}, HEAR_COST), hint: 'Strain -1, trust +3', ok: f.strain > 0, why: 'It has no grievance to air.' });
      }
      if (S.act === 3 && f.member && !f.pledged) {
        const pg = pledgeGaps(S, id);
        add({ id: 'pledge:' + id, type: 'pledge', f: id, label: 'Ask it to ratify', cost: { inf: 1 }, hint: 'Pledges at trust ' + RATIFY_TRUST + ' with ' + RATIFY_NEEDS + ' of 6 need points, no Company grip, and no strain', ok: !pg.length, why: 'Still needs ' + pg.join(', ') + '.' });
      }
      if (S.act === 3 && actSeason(S) >= 3 && !f.member && f.grip < 3 && !f.terms) {
        const rv = rivalOf(S, id);
        add({ id: 'terms:' + id, type: 'terms', f: id, label: 'Offer accession terms', cost: Object.assign({}, TERMS_COST), hint: 'Trust +8, its weakest need +1' + (rv ? ', and it will join beside its rival ' + fname(rv) : ''), ok: f.trust >= TERMS_TRUST, why: 'Needs trust ' + TERMS_TRUST + ' before it will hear terms.' });
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
        add({ id: 'invite:' + id, type: 'invite', f: id, label: 'Invite to the federation', cost: { inf: 1 }, hint: 'Joins at trust ' + JOIN_TRUST + ' with ' + JOIN_NEEDS + ' of 6 need points met' + spillText(S, id, JOIN_SPILL[S.act]), ok: !g.length, why: 'Still needs ' + g.join(', ') + '.' });
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
    if (S.act === 3 && actSeason(S) >= ACTS[3].callFrom && S.voteCalled === null) {
      const np = pledges(S).length;
      add({ id: 'callvote', type: 'callvote', label: 'Call the ratification vote', cost: { inf: 1 }, hint: 'Held at the end of this season. It passes with ' + ACTS[3].goal + ' pledges.', ok: np >= ACTS[3].goal, why: 'Needs ' + ACTS[3].goal + ' pledges. You have ' + np + '.' });
    }
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
        f.grip = Math.max(0, f.grip - 1); f.countered = true; if (S.act === 1 || !f.member) trust(S, a.f, 3);
        msg = 'You exposed Company arms deals in ' + FACTIONS[a.f].seat + '. Its grip loosens.'; break;
      case 'invite':
        f.member = true; trust(S, a.f, 5); spill(S, a.f, JOIN_SPILL[S.act]);
        msg = fname(a.f) + (f.left !== null ? ' returns to the federation.' : ' signs the charter and joins the federation.');
        f.grievance = null; f.left = null; break;
      case 'demand': {
        const dm = f.demand; f.demand = null; trust(S, a.f, DEMAND_GAIN); spill(S, a.f, 2);
        if (dm.kind === 'claim') FACTIONS[a.f].needs.forEach(function (n) { if (n.res === dm.res) pip(S, a.f, n.key, 1); });
        S.stats.demandsMet += 1;
        msg = 'You met ' + fname(a.f) + '\'s ' + (dm.kind === 'claim' ? 'claim' : 'budget share') + '. Trust +' + DEMAND_GAIN + '.'; break;
      }
      case 'hear':
        addStrain(S, a.f, -1); trust(S, a.f, 3);
        msg = 'You heard ' + fname(a.f) + '\'s grievances in ' + FACTIONS[a.f].seat + '. Strain -1.'; break;
      case 'pledge':
        f.pledged = true; trust(S, a.f, 3);
        msg = fname(a.f) + ' pledges to ratify the charter.'; break;
      case 'terms': {
        const w = weakestNeed(a.f, f);
        trust(S, a.f, 8); pip(S, a.f, w.key, 1); f.grievance = null; f.terms = true; S.stats.termsOffered += 1;
        msg = fname(a.f) + ' accepts accession terms. Its grievance is settled.'; break;
      }
      case 'callvote':
        S.voteCalled = S.turn;
        msg = 'You call the ratification vote for the end of ' + season(S) + ' ' + year(S) + '.'; break;
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
        if (f.plan.eta <= 0) { p.done(S); S.plansDone[p.key] = true; f.plan = null; f.planWait = 2; msg += ' The plan is complete: ' + p.then; if (f.grip >= 3) msg += ' ' + fname(a.f) + ' goes rogue.'; }
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
    log(S, msg, a.type === 'invite' || a.type === 'pledge' ? 'good' : 'info');
    return { ok: true, msg: msg };
  }

  /* ---------- end of season: council, then resolution ---------- */
  function councilKey(it) { return it.kind === 'charter' ? it.turn : it.kind + ':' + it.key; }
  function endSeason(S) {
    if (S.phase !== 'actions') return { ok: false };
    const ag = [];
    if (CHARTER[S.turn] && !S.charter[CHARTER[S.turn].key]) ag.push({ kind: 'charter', key: CHARTER[S.turn].key, turn: S.turn });
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.motion && f.motion.at === S.turn && f.member) ag.push({ kind: 'motion', f: id, key: f.motion.key });
    });
    const as = actSeason(S);
    if (S.act === 3 && ARTICLES[as] && !S.charter[ARTICLES[as].key]) ag.push({ kind: 'article', key: ARTICLES[as].key, as: as });
    S.agenda = ag; S.lastVotes = [];
    if (ag.length) {
      S.council = councilKey(ag[0]); S.phase = 'council';
      return { ok: true, council: true };
    }
    S.council = null;
    resolve(S);
    return { ok: true };
  }

  /* The council item at the head of the agenda, in one shape for the dialog and the sim. */
  function councilItem(S) { return S.agenda && S.agenda.length ? itemView(S.agenda[0]) : null; }

  /* How each member votes on your proposal. chooseCharter uses this, so the dialog and the result always agree. */
  function votePreview(S, optKey) {
    const it = councilItem(S);
    if (!it || !it.options[optKey]) return null;
    const o = it.options[optKey];
    const votes = members(S).map(function (id) {
      const f = S.factions[id], d = o.trust[id] || 0;
      let yes, why;
      if (S.act >= 2 && it.kind === 'motion' && it.f === id) { yes = optKey === 'pass'; why = 'proposer'; }
      else if (S.act >= 2 && f.grip >= 1) { yes = false; why = 'company'; }
      else if (S.act >= 2 && f.trust < DISTRUST_VOTE) { yes = false; why = 'distrust'; }
      else if (d < 0) { yes = false; why = 'cost'; }
      else if (S.act >= 2 && f.strain > 0 && d <= 0) { yes = false; why = 'strain'; }
      else { yes = true; why = d > 0 ? 'gain' : 'neutral'; }
      return { id: id, yes: yes, why: why, d: d };
    });
    const yes = votes.filter(function (v) { return v.yes; }).length + 1; // your own vote
    const no = votes.length - (yes - 1);
    // in act 1 ties go your way; from act 2 a proposal needs a majority
    return { votes: votes, yes: yes, no: no, passes: S.act >= 2 ? yes > no : yes >= no };
  }

  function chooseCharter(S, opt) {
    if (S.phase !== 'council' || !S.agenda.length) return { ok: false };
    const it = councilItem(S), head = S.agenda[0];
    if (!it.options[opt]) return { ok: false, msg: 'That is not an option.' };
    const keys = Object.keys(it.options);
    const other = keys.filter(function (k) { return k !== opt; })[0];
    const ms = members(S);
    const vp = votePreview(S, opt);
    const passed = vp.passes, yes = vp.yes, no = vp.no;
    const chosen = passed ? opt : other;
    const o = it.options[chosen];
    Object.keys(o.trust).forEach(function (id) { trust(S, id, o.trust[id]); });
    Object.keys(o.pips).forEach(function (id) { pip(S, id, o.pips[id][0], o.pips[id][1]); });
    let msg;
    if (it.kind === 'motion') {
      const m = MOTION_BY_KEY[it.key], pf = S.factions[m.f];
      pf.motion = null;
      if (chosen === 'pass') {
        S.passed[m.key] = m.f; S.stats.motionsPassed += 1; addStrain(S, m.f, -1);
        msg = 'The council passes ' + fname(m.f) + '\'s motion, ' + m.name + ', ' + (passed ? yes + ' to ' + no : no + ' to ' + yes + ' against your proposal') + '.';
      } else {
        S.stats.motionsFailed += 1; addStrain(S, m.f, 1, 'the council voted down its motion on ' + m.short);
        msg = 'The council rejects ' + fname(m.f) + '\'s motion, ' + m.name + ', ' + (passed ? yes + ' to ' + no : no + ' to ' + yes + ' against your proposal') + '. ' + fname(m.f) + ' strain ' + pf.strain + ' of ' + STRAIN_MAX + '.';
      }
    } else {
      S.charter[it.key] = chosen;
      if (!ms.length) msg = 'With no members yet, you declare a founding principle: ' + o.name + '.';
      else if (passed) msg = 'The council adopts your proposal, ' + o.name + ', ' + yes + ' to ' + no + '.';
      else msg = 'The council rejects your proposal ' + yes + ' to ' + no + ' and adopts ' + o.name + ' instead.';
    }
    log(S, msg, passed ? 'info' : 'warn');
    S.lastVote = { kind: it.kind, key: it.key, f: it.f, title: it.title, votes: vp.votes, passed: passed, chosen: chosen, proposed: opt, yes: yes, no: no, msg: msg, turn: S.turn };
    S.lastVotes.push(S.lastVote);
    S.agenda.shift();
    // a motion whose proposer has left is dropped
    while (S.agenda.length && S.agenda[0].kind === 'motion' && !S.factions[S.agenda[0].f].member) { S.factions[S.agenda[0].f].motion = null; S.agenda.shift(); }
    if (S.agenda.length) { S.council = councilKey(S.agenda[0]); return { ok: true, msg: msg, more: true }; }
    S.council = null;
    resolve(S);
    return { ok: true, msg: msg, more: false };
  }

  /* how: 'walkout', 'secede' or 'rogue'. Only a walkout leaves a grievance to hear. */
  function leave(S, id, how) {
    const f = S.factions[id];
    f.member = false; f.left = S.turn; f.leftHow = how; f.demand = null; f.motion = null;
  }

  function resolve(S) {
    const R = [];
    const as = actSeason(S), actWas = S.act;
    // ignored requests
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.request) {
        const d = f.member ? -10 : -6; trust(S, id, d);
        R.push({ f: id, d: d, kind: 'bad', text: fname(id) + '\'s request went unanswered. Trust ' + d + '.' });
        f.request = null;
      }
    });
    // unmet demands
    ORDER.forEach(function (id) {
      const f = S.factions[id], dm = f.demand;
      if (!dm) return;
      f.demand = null;
      if (!f.member) return;
      trust(S, id, -DEMAND_TRUST);
      // a pledged member takes it out on its trust, not as a grievance: the pledge holds while trust stays at PLEDGE_KEEP
      const pledgedNow = S.act === 3 && f.pledged;
      if (!pledgedNow) addStrain(S, id, 1, dm.kind === 'claim' ? 'its claim for ' + dm.res + ' went unmet' : 'its budget share went unpaid');
      S.stats.demandsMissed += 1;
      // an unpaid share at strain 2 or more sends a member with no Company ties to the Company for the money
      const coPays = dm.kind === 'share' && f.strain >= 2 && f.grip === 0;
      if (coPays) f.grip += 1;
      const what = dm.kind === 'claim' ? 'claim for ' + dm.res : 'budget share';
      R.push({ f: id, d: -DEMAND_TRUST, kind: 'bad', text: fname(id) + '\'s ' + what + ' went unmet. Trust -' + DEMAND_TRUST + (pledgedNow ? '. Its pledge holds while its trust stays at ' + PLEDGE_KEEP + '.' : ', strain ' + f.strain + ' of ' + STRAIN_MAX + '.') });
      if (coPays) R.push({ f: id, co: 'grip', kind: 'bad', text: fname(id) + ' takes the money from the Company instead. Company grip +1.' });
    });
    // drift
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member) {
        if (needTotal(S, id) >= JOIN_NEEDS) { if (S.act === 1) trust(S, id, MEMBER_DRIFT[1]); } else { trust(S, id, -2); R.push({ f: id, d: -2, kind: 'warn', text: fname(id) + ' feels the federation is not meeting its needs. Trust -2.' }); }
      } else if (!f.touched) trust(S, id, -1);
    });
    if (S.act >= 2) {
      // members expect more of the federation, and the ones who trust you most expect the most
      [[false, MEMBER_DRIFT[S.act]], [true, EXPECT_HIGH]].forEach(function (g) {
        const fs = members(S).filter(function (id) { return needTotal(S, id) >= JOIN_NEEDS && (S.factions[id].trust > EXPECT_AT) === g[0]; });
        fs.forEach(function (id) { trust(S, id, g[1]); });
        if (fs.length) R.push({ fs: fs, d: g[1], kind: 'warn', text: (g[0] ? 'Members above trust ' + EXPECT_AT + ' expect the most' : 'Members expect more of the federation') + '. Trust ' + g[1] + ' each.' });
      });
    }
    // rivals harden against the federation
    if ((S.act === 2 && as >= 3) || S.act === 3) {
      ORDER.forEach(function (id) {
        const opp = hardenedBy(S, id);
        if (!opp.length) return;
        trust(S, id, -opp.length);
        R.push({ f: id, fs: opp, d: -opp.length, kind: 'warn', text: fname(id) + ' hardens against the federation over ' + opp.map(fname).join(' and ') + '. Trust -' + opp.length + '.' });
      });
    }
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
    // members that went rogue through a plan this season, including one you backed
    S.exits.splice(0).forEach(function (id) { R.push({ f: id, co: 'grip', kind: 'bad', text: fname(id) + ' goes rogue with Company arms and leaves the federation.' }); });
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
        if (f.grip >= 3 && f.member) { leave(S, t, 'rogue'); R.push({ f: t, kind: 'bad', text: fname(t) + ' leaves the federation.' }); }
      }
    });
    // secession and walkouts
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member && f.trust < SECEDE_TRUST) {
        leave(S, id, 'secede'); f.grip = Math.min(3, f.grip + 1);
        if (S.act >= 2) { f.grievance = 'it no longer trusts the federation'; S.stats.secessions += 1; }
        R.push({ f: id, kind: 'bad', text: fname(id) + ' secedes from the federation. Its hardliners turn to the Company.' });
      } else if (f.member && f.strain >= STRAIN_MAX) {
        leave(S, id, 'walkout'); f.grievance = f.lastStrain || 'its grievances went unheard'; S.stats.walkouts += 1;
        R.push({ f: id, kind: 'bad', text: fname(id) + ' walks out of the federation. Its grievance: ' + f.grievance + '.' });
      }
    });
    // pledge checks
    if (S.act === 3) {
      ORDER.forEach(function (id) {
        const f = S.factions[id];
        if (!f.pledged) return;
        let why = null;
        if (!f.member) why = 'it left the federation';
        else if (f.grip >= 1) why = 'it took Company money';
        else if (f.trust < PLEDGE_KEEP) why = 'its trust fell below ' + PLEDGE_KEEP;
        else if (f.strain >= 1) why = 'it carries a grievance';
        if (!why) return;
        f.pledged = false; S.stats.pledgesLost += 1;
        R.push({ f: id, kind: 'bad', text: fname(id) + ' withdraws its pledge: ' + why + '.' });
      });
    }
    R.forEach(function (r) { log(S, r.text, r.kind); });
    S.lastResolution = R;
    checkEnd(S, R);
    recordHistory(S, actWas);
    if (S.phase !== 'over') startTurn(S);
  }

  /* ---------- history: one entry per season end, for the sparklines and the campaign chart ----------
     Reads state only. It never touches S.rng and changes no rule. Entry 0 is the starting position. */
  function histEntry(S, act) {
    const e = { turn: S.turn, act: act, when: S.turn ? season(S) + ' ' + year(S) : 'Start', trust: {}, member: {}, pledged: {}, grip: {}, ev: [] };
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      e.trust[id] = f.trust; e.member[id] = f.member; e.pledged[id] = f.member && f.pledged; e.grip[id] = f.grip;
    });
    return e;
  }
  /* What changed since the last entry, as events: k is join, rejoin, walkout, secede, rogue, pledge, withdraw, client, act, vote, or end. */
  function recordHistory(S, actWas) {
    const H = S.history, prev = H[H.length - 1], e = histEntry(S, actWas), ev = e.ev;
    ORDER.forEach(function (id) {
      const f = S.factions[id], nm = fname(id);
      if (e.member[id] && !prev.member[id]) {
        const again = H.some(function (h) { return h.member[id]; });
        ev.push({ k: again ? 'rejoin' : 'join', f: id, text: nm + (again ? ' returns to the federation.' : ' joins the federation.') });
      }
      if (!e.member[id] && prev.member[id]) {
        const how = f.leftHow || 'secede';
        ev.push({ k: how, f: id, text: nm + { walkout: ' walks out.', secede: ' secedes.', rogue: ' goes rogue and leaves.' }[how] });
      }
      if (e.pledged[id] && !prev.pledged[id]) ev.push({ k: 'pledge', f: id, text: nm + ' pledges to ratify.' });
      if (!e.pledged[id] && prev.pledged[id]) ev.push({ k: 'withdraw', f: id, text: nm + ' withdraws its pledge.' });
      if (e.grip[id] >= 2 && prev.grip[id] < 2) ev.push({ k: 'client', f: id, text: nm + ' becomes a Company client.' });
      if (e.grip[id] >= 3 && prev.grip[id] < 3 && !(prev.member[id] && !e.member[id])) ev.push({ k: 'rogue', f: id, text: nm + ' goes rogue.' });
    });
    if (S.act !== actWas) ev.push({ k: 'act', act: S.act, text: 'Act ' + S.act + ', ' + ACTS[S.act].name + ', begins with ' + NUMW[members(S).length].toLowerCase() + ' members.' });
    if (S.outcome) {
      if (S.outcome.pledges !== undefined) ev.push({ k: 'vote', n: S.outcome.pledges, fs: pledges(S), text: 'The ratification vote. ' + (S.outcome.pledges ? NUMW[S.outcome.pledges] : 'None') + ' of five ratify: ' + S.outcome.title.toLowerCase().replace(/^aman$/, 'Aman') + '.' });
      else ev.push({ k: 'end', text: S.outcome.title + '.' });
    }
    H.push(e);
  }
  function history(S) { return S.history || []; }
  /* The trust line that matters most for a power right now, for the sparklines. */
  function trustLine(S, id) {
    const f = S.factions[id];
    if (!f.member) return { v: JOIN_TRUST, text: 'joins at ' + JOIN_TRUST };
    if (S.act === 3) return f.pledged ? { v: PLEDGE_KEEP, text: 'keeps its pledge at ' + PLEDGE_KEEP } : { v: RATIFY_TRUST, text: 'pledges at ' + RATIFY_TRUST };
    return { v: SECEDE_TRUST, text: 'secedes below ' + SECEDE_TRUST };
  }

  function over(S, o, R) {
    o.act = S.act;
    S.outcome = o; S.phase = 'over';
  }

  /* All act changes and endings happen here, at the end of a season. */
  function checkEnd(S, R) {
    const as = actSeason(S), nm = members(S).length;
    if (clients(S).length >= 3) return over(S, { result: 'loss', title: 'The Company wins', text: 'Three of five powers are now Company clients. Division pays, and the subcontinent stays divided.' }, R);
    if (S.act >= 2 && nm <= 1) return over(S, { result: 'loss', title: 'The federation breaks apart', text: 'Your partners have walked out. The federation is a name on paper.' }, R);
    if (S.act === 3 && (S.voteCalled === S.turn || as >= ACTS[3].len)) {
      const ps = pledges(S), n = ps.length;
      const ev = { fs: ps.length ? ps : (members(S).length ? members(S) : ORDER.slice()), kind: n >= ACTS[3].goal ? 'good' : 'bad', text: 'The charter goes to the vote. ' + n + ' of five powers ratify.' };
      R.push(ev); log(S, ev.text, ev.kind);
      const when = season(S) + ' ' + year(S);
      const short = 'The charter falls short, ' + n + ' of the four it needed.';
      let o;
      if (n >= 5) o = { result: 'win', title: 'Aman', text: 'All five powers ratify the charter in ' + when + '. The subcontinent governs itself, by consent.' };
      else if (n >= ACTS[3].goal) {
        const h = ORDER.filter(function (id) { return ps.indexOf(id) < 0; })[0], hf = S.factions[h];
        const rest = hf.member ? ' has not pledged yet, and the door stays open.' : hf.grievance ? ' keeps its grievance, and the door stays open.' : ' stays outside, and the door stays open.';
        o = { result: 'win', title: 'The charter is ratified', text: 'Four of five powers ratify the charter in ' + when + '. ' + fname(h) + rest };
      }
      else if (clients(S).length >= 2) o = { result: 'loss', title: 'The Company wins', text: short + ' Company money bought the votes it lacked.' };
      else if (nm >= 3) o = { result: 'partial', title: 'A federation without a charter', text: short + ' The federation survives as a loose alliance.' };
      else o = { result: 'loss', title: 'The federation breaks apart', text: short.slice(0, -1) + ', and the federation goes with it.' };
      o.pledges = n;
      return over(S, o, R);
    }
    if (S.act === 1) {
      if (nm >= ACTS[1].goal) return beginAct(S, 2, R);
      if (S.turn >= ACTS[1].max) return over(S, { result: 'loss', title: 'Still divided', text: 'Only ' + nm + ' of five powers joined you in three years. The warring-states era goes on.' }, R);
      return;
    }
    if (S.act === 2 && as >= ACTS[2].len) {
      if (nm >= ACTS[2].goal) return beginAct(S, 3, R);
      if (nm === 3) return over(S, { result: 'partial', title: 'A fragile federation', text: 'Three powers stand with you at the end of ' + year(S) + '. The federation holds, one short of the four a charter needs.' }, R);
      return over(S, { result: 'loss', title: 'The federation breaks apart', text: 'Only two powers stand with you at the end of ' + year(S) + '. The federation is a name on paper.' }, R);
    }
    if (S.turn >= MAX_TURNS) return over(S, { result: 'loss', title: 'Still divided', text: 'Time runs out before the charter is settled.' }, R);
  }

  function beginAct(S, n, R) {
    S.act = n; S.actStart[n] = S.turn + 1;
    const ms = members(S);
    const ev = { fs: ms, kind: 'good', act: n, text: ACT_START[n](ms.length) };
    R.push(ev); log(S, ev.text, 'good');
    if (n === 3) {
      ORDER.forEach(function (id) {
        const f = S.factions[id];
        if (f.member || f.grip >= 3) return;
        const rv = rivalOf(S, id);
        let g;
        if (rv) g = 'its rival ' + fname(rv) + ' sits in the federation';
        else if (f.grip >= 2) g = 'Company money pays its leaders';
        else if (needTotal(S, id) < JOIN_NEEDS) g = 'the federation has not met its ' + weakestNeed(id, f).label.toLowerCase() + ' need';
        else g = f.grievance || 'it does not trust you yet';
        f.grievance = g;
        const e = { f: id, kind: 'warn', text: fname(id) + ' holds out. Its grievance: ' + g + '.' };
        R.push(e); log(S, e.text, 'warn');
      });
    }
  }

  /* Where the player stands in the three acts, for the track, the goal block, and dialogs. */
  function actInfo(S) {
    const a = S.act, start = S.actStart[a], as = actSeason(S);
    const len = a === 1 ? ACTS[1].max : ACTS[a].len;
    const end = a === 1 ? ACTS[1].max : start + len - 1;
    const councils = a === 1 ? Object.keys(CHARTER).map(Number) : a === 2 ? COUNCIL_AS.map(function (x) { return start + x - 1; }) : Object.keys(ARTICLES).map(function (x) { return start + (+x) - 1; });
    return {
      act: a, name: ACTS[a].name, as: as, len: len, start: start, end: end, seasonsLeft: Math.max(0, end - S.turn),
      councils: councils, councilSeasons: { 1: Object.keys(CHARTER).map(Number), 2: COUNCIL_AS.slice(), 3: Object.keys(ARTICLES).map(Number) }, callAt: a === 3 ? start + ACTS[3].callFrom - 1 : null, voteCalled: S.voteCalled,
      starts: Object.assign({}, S.actStart),
      goal: a === 3 ? { kind: 'pledges', need: ACTS[3].goal, have: pledges(S).length } : { kind: 'members', need: ACTS[a].goal, have: members(S).length }
    };
  }
  function motionInfo(key) { return MOTION_BY_KEY[key] || null; }

  /* What needs the player this season, one item per thing, each tied to a power (f) where there is one.
     k is the kind, which the map draws as a pin: vote, ready, strain, demand, motion, court, blocked, ask, plan.
     tone is the color family. done marks an item that is already settled (a blocked Company deal).
     Reads state only; changes nothing. */
  function attention(S) {
    const t = [], cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    const callv = available(S).filter(function (a) { return a.type === 'callvote'; })[0];
    if (S.voteCalled === S.turn) t.push({ k: 'vote', tone: 'good', text: 'The ratification vote is held at the end of this season.' });
    else if (callv && callv.ok) t.push({ k: 'vote', tone: 'good', text: 'You hold ' + pledges(S).length + ' pledges. You can call the ratification vote.' });
    ORDER.forEach(function (id) { if (canJoin(S, id)) t.push({ k: 'ready', tone: 'good', f: id, text: fname(id) + ' is ready to join. Invite it.' }); });
    ORDER.forEach(function (id) { if (canPledge(S, id)) t.push({ k: 'ready', tone: 'good', f: id, text: fname(id) + ' is ready to pledge. Ask it to ratify.' }); });
    ORDER.forEach(function (id) {
      const f = S.factions[id], nm = fname(id);
      if (f.member && f.strain >= STRAIN_MAX - 1) t.push({ k: 'strain', tone: 'bad', f: id, text: nm + ' is one grievance from walking out. Hear it.' });
      if (f.demand) {
        const miss = S.act === 3 && f.pledged ? ' it costs ' + DEMAND_TRUST + ' trust. Below ' + PLEDGE_KEEP + ' its pledge breaks.' : ' it adds a strain mark.';
        t.push({ k: 'demand', tone: 'ask', f: id, res: f.demand.kind === 'claim' ? f.demand.res : 'capital', text: f.demand.kind === 'claim' ? nm + ' claims ' + f.demand.amount + ' ' + cap(f.demand.res) + '. Unmet,' + miss : nm + ' wants its budget share: ' + f.demand.amount + ' Capital. Unpaid,' + miss });
      }
      if (f.member && f.motion && f.motion.at === S.turn) t.push({ k: 'motion', tone: 'plan', f: id, text: nm + '\'s motion goes to council at the end of this season.' });
    });
    S.companyTargets.forEach(function (id) {
      const f = S.factions[id], left = Math.max(0, BLOCK_GAIN - (f.trust - f.trustAtStart));
      if (f.countered || left === 0) t.push({ k: 'blocked', tone: 'co', done: true, f: id, text: 'Company deal with ' + fname(id) + ': blocked.' });
      else t.push({ k: 'court', tone: 'co', f: id, text: 'The Company is courting ' + fname(id) + '. Gain ' + left + ' more trust there, or counter it.' });
    });
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.request) t.push({ k: 'ask', tone: 'ask', f: id, res: f.request.res, text: fname(id) + ' asks for ' + f.request.amount + ' ' + cap(f.request.res) + '.' });
      if (f.plan && f.plan.eta === 1) { const n = planOf(S, id).name; t.push({ k: 'plan', tone: 'plan', f: id, text: fname(id) + ' finishes its plan this season: ' + n.charAt(0).toLowerCase() + n.slice(1) + '.' }); }
    });
    return t;
  }

  root.Aman = {
    create: create, available: available, act: act, endSeason: endSeason, chooseCharter: chooseCharter,
    resolveCrisis: resolveCrisis, resolveDispute: resolveDispute, advise: advise, gates: gates, unlocked: unlocked, rel: rel, gaps: gaps, planOf: planOf, REL_NAMES: REL_NAMES, PAIRS: PAIRS, yields: yields, fightOdds: fightOdds, canJoin: canJoin, needTotal: needTotal,
    members: members, clients: clients, season: season, year: year,
    FACTIONS: FACTIONS, PROJECTS: PROJECTS, TECH: TECH, CHARTER: CHARTER, ORDER: ORDER,
    BLOCK_GAIN: BLOCK_GAIN, MAX_TURNS: MAX_TURNS, JOIN_TRUST: JOIN_TRUST, JOIN_NEEDS: JOIN_NEEDS,
    actInfo: actInfo, attention: attention, hardenedBy: hardenedBy, SECEDE_TRUST: SECEDE_TRUST, EXPECT_AT: EXPECT_AT, EXPECT_HIGH: EXPECT_HIGH, MEMBER_DRIFT: MEMBER_DRIFT, DEMAND_TRUST: DEMAND_TRUST, DEMAND_GAIN: DEMAND_GAIN, actSeason: actSeason, councilItem: councilItem, votePreview: votePreview, pledges: pledges, pledgeGaps: pledgeGaps, canPledge: canPledge, motionInfo: motionInfo,
    ACTS: ACTS, MOTIONS: MOTIONS, ARTICLES: ARTICLES, RATIFY_TRUST: RATIFY_TRUST, RATIFY_NEEDS: RATIFY_NEEDS, STRAIN_MAX: STRAIN_MAX, PLEDGE_KEEP: PLEDGE_KEEP,
    DISTRUST_VOTE: DISTRUST_VOTE, HEAR_COST: HEAR_COST, TERMS_COST: TERMS_COST, JOIN_SPILL: JOIN_SPILL,
    disputeOptions: disputeOptions, history: history, trustLine: trustLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Aman;
})(typeof window !== 'undefined' ? window : globalThis);

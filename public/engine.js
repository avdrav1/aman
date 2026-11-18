/* Aman prototype rules engine. No DOM. Runs in the browser (window.Aman) and in Node. */
(function (root) {
  'use strict';

  const SEASONS = ['Spring', 'Monsoon', 'Autumn', 'Winter'];
  const RES = ['water', 'energy', 'food'];
  /* Three acts. Act 1 has an absolute deadline (season 16); acts 2 and 3 run a fixed length from their start. */
  const ACTS = {
    1: { name: 'Neighbors', max: 16, goal: 8 },
    2: { name: 'Strain', len: 12, goal: 11 },
    3: { name: 'Charter', len: 12, goal: 11, callFrom: 8 }
  };
  const MAX_TURNS = 40;          // hard bound only
  /* Scale: budgets and caps for fifteen rivals. All tuned with tools/sim.js. */
  const INF_BASE = { 1: 7, 2: 7, 3: 9 };  // Influence each season, by act
  const INF_PER = 3;             // plus 1 Influence for every this many members
  const RES_PER = 4;             // plus 1 Water, Energy, and Food each season for every this many members
  const REQ_CAP = 4;             // at most this many requests a season
  const DEMAND_CAP = 6;          // at most this many demands a season, plus one in a failed monsoon
  const ASK_CAP = 8;             // requests and demands together, at most this many a season
  const MOTION_CAP = 3;          // at most this many motions per council
  const CO_TARGETS = { 1: 2, 2: 3, 3: 3, allIn: 4 };  // powers the Company courts each season
  const CO_GROW_AT = 4;          // in act 1 it courts one more once you have this many members
  const CO_SPREAD = 1;           // the Company ranks a power 1 trust lower for each neighbor that is its client
  const CO_WIN = 6;              // this many Company clients and the Company wins
  const CO_WIN_VOTE = 3;         // a failed ratification with this many clients is a Company win
  const COLLAPSE_AT = 3;         // from act 2, this many members or fewer and the federation breaks apart
  const FRAGILE_AT = 8;          // a federation this size without its goal is a partial result
  const AMAN_AT = 15;            // pledges for the best ending: every rival
  const FIGHT_PER = 0.035;       // battle odds per member
  const SHARE_BIG = 8;           // a budget share costs 1 more Capital with this many members
  const RATIFY_TRUST = 65;       // pledge gate
  const RATIFY_NEEDS = 5;        // pledge gate, of 6 need points
  const PLEDGE_KEEP = 62;        // a pledge is withdrawn below this trust
  const STRAIN_MAX = 3;          // a member walks out at this much strain
  const DEMAND_TRUST = 6;        // trust lost by ignoring a demand
  const DEMAND_GAIN = 2;         // trust gained by granting one: members expect it
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
    2: function (n) { return 'Act 2 begins. ' + Numw(n) + ' powers stand with you. Now they want a say.'; },
    3: function (n) { return 'Act 3 begins. ' + Numw(n) + ' members stand with you. The charter goes to the powers.'; }
  };
  const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen'];
  function numw(n) { return NUMW[n] !== undefined ? NUMW[n].toLowerCase() : String(n); }
  function Numw(n) { return NUMW[n] !== undefined ? NUMW[n] : String(n); }
  const JOIN_TRUST = 55;
  const SECEDE_TRUST = 40;       // a member below this trust secedes
  const JOIN_NEEDS = 4;
  const BLOCK_GAIN = 10;
  const REL_NAMES = { '-2': 'Rival', '-1': 'Tense', '0': 'Neutral', '1': 'Friendly', '2': 'Allied' };

  /* ---------- the powers ----------
     Everything about a power lives in its entry here. The rules read this table and never test a power's id.
     Effects and conditions are small lists, run by runEffects() and test():
       effects: ['pip', id, need, d]  ['trust', id, d]  ['rel', a, b, d]  ['grip', id]  ['all', d] (every power, and counts as dealt with)
                ['ally', a, b] (the two become allies; if neither is a member each trusts you 6 less; if one is, the other trusts you 8 more)
                ['pactTrust', id, ifSigned, ifNot]
       conditions: ['tech', key]  ['project', key]  ['charter', key]  ['relAbove', a, b, v]  ['pipAtLeast', id, need, v]   (null: never)
     ties: relations and dispute topics with other powers. Only listed pairs exist; every other pair is neutral and fixed. */
  const PLAYER = { id: 'deccan', name: 'Deccan Compact', short: 'Deccan', seat: 'Hyderabad', lat: 17.39, lon: 78.49, hue: 28, title: 'Speaker of the Compact',
    neighbors: ['narmada', 'mahanadi', 'seaboard', 'malabar', 'coromandel'] };
  function need(key, label, res, how) { const n = { key: key, label: label, how: how }; if (res) n.res = res; return n; }
  const POWERS = [
    {
      id: 'indus', name: 'Indus League', short: 'Indus', seat: 'Lahore', lat: 31.55, lon: 74.34, hue: 205, title: 'Chair of the League Council', trust: 30, planWait: 1,
      blurb: 'Upstream river cities of the Indus plains. Proud, wary of any strong center.',
      needs: [need('water', 'Water share', 'water', 'Send Water, or build the Indus Water Treaty'), need('autonomy', 'Autonomy', null, 'Autonomy Guarantee pact. In the charter: Loose union, Local militias, Managed movement')],
      pact: { name: 'Autonomy Guarantee', effect: 'Autonomy +1', cost: {}, does: [['pip', 'indus', 'autonomy', 1]] },
      ties: { lindus: { rel: -2, topic: 'Indus water releases' }, passes: { rel: 1, topic: 'pass tolls' }, aravalli: { topic: 'desert canals' }, yamuna: { topic: 'canal water' } },
      plans: [
        { key: 'barrage', name: 'Build barrages on the upper Indus', eta: 3, harmed: ['lindus'],
          then: 'Water share +1. Lower Indus river flow -1, and the two fall out a step.',
          endIf: 'the Indus Water Treaty is built', cancel: ['project', 'induswater'],
          does: [['pip', 'indus', 'water', 1], ['pip', 'lindus', 'flow', -1], ['rel', 'indus', 'lindus', -1]] },
        { key: 'arms', name: 'Seek a Company security contract', eta: 3, harmed: [], repeat: true,
          then: 'Company grip +1.',
          endIf: 'its autonomy need reaches 2', cancel: ['pipAtLeast', 'indus', 'autonomy', 2],
          does: [['grip', 'indus']] }
      ],
      motions: [
        { key: 'veto', short: 'federal policing', name: 'Provincial veto on federal policing', text: 'Members can block federal police on their soil.', pips: { indus: ['autonomy', 1] }, trust: { yamuna: -6, ganga: -4 } },
        { key: 'indusfirst', short: 'Indus waters', name: 'Indus waters for the League first', text: 'Upstream needs come before any release.', pips: { indus: ['water', 1] }, trust: { lindus: -8 }, upkeep: { water: 1 } }
      ]
    },
    {
      id: 'lindus', name: 'Lower Indus Ports', short: 'Lower Indus', seat: 'Karachi', lat: 24.86, lon: 67.01, hue: 190, title: 'President of the Port Council', trust: 34, planWait: 3,
      blurb: 'The river mouth and its port city. Lives on what the river brings down and what the ships bring in.',
      needs: [need('flow', 'River flow', 'water', 'Send Water, or build the Indus Water Treaty'), need('trade', 'Trade', null, 'Port Access Treaty pact. In the charter: Open market')],
      pact: { name: 'Port Access Treaty', effect: 'Trade +1. You gain 1 Capital each season', cost: {}, does: [['pip', 'lindus', 'trade', 1]], income: { capital: 1 } },
      ties: { passes: { topic: 'transit trade' }, aravalli: { topic: 'desert trade' }, seaboard: { topic: 'shipping lanes' } },
      plans: [
        { key: 'flowrights', name: 'Campaign for downstream water rights', eta: 3, harmed: ['indus'],
          then: 'River flow +1. Its relations with the Indus League worsen a step.',
          endIf: 'the Indus Water Treaty is built', cancel: ['project', 'induswater'],
          does: [['pip', 'lindus', 'flow', 1], ['rel', 'indus', 'lindus', -1]] },
        { key: 'portfees', name: 'Raise port fees on inland trade', eta: 3, harmed: ['passes'],
          then: 'Trade +1. Its relations with the Western Passes Council worsen a step.',
          endIf: 'the charter settles trade policy', cancel: ['charter', 'trade'],
          does: [['pip', 'lindus', 'trade', 1], ['rel', 'lindus', 'passes', -1]] }
      ],
      motions: [
        { key: 'indusflow', short: 'Indus flow', name: 'Minimum flow to the Indus mouth', text: 'Upstream barrages must release a set flow.', pips: { lindus: ['flow', 1] }, trust: { indus: -8 } },
        { key: 'portfund', short: 'port funding', name: 'Federal port fund', text: 'The federation dredges and equips member ports.', pips: { lindus: ['trade', 1] }, trust: {}, upkeep: { capital: 1 } }
      ]
    },
    {
      id: 'passes', name: 'Western Passes Council', short: 'Western Passes', seat: 'Peshawar', lat: 34.01, lon: 71.58, hue: 15, title: 'Convener of the Passes Council', trust: 26, planWait: 2,
      blurb: 'Uplands that hold the mountain roads. Short of protection, and the Company knows it.',
      needs: [need('security', 'Protection', 'capital', 'Send Capital for its border guard, or research civil defense doctrine. In the charter: Common defense force'), need('trade', 'Trade routes', null, 'Caravan Corridor pact, Subcontinental Rail')],
      pact: { name: 'Caravan Corridor', effect: 'Trade routes +2', cost: { capital: 2 }, does: [['pip', 'passes', 'trade', 2]] },
      ties: {},
      plans: [
        { key: 'guards', name: 'Hire Company guards for the passes', eta: 3, harmed: [], repeat: true,
          then: 'Company grip +1.',
          endIf: 'its protection need reaches 2', cancel: ['pipAtLeast', 'passes', 'security', 2],
          does: [['grip', 'passes']] },
        { key: 'roadtolls', name: 'Charge tolls on the mountain roads', eta: 3, harmed: ['indus', 'lindus'],
          then: 'Trade routes +1. Its relations with the Indus League worsen a step.',
          endIf: 'Subcontinental Rail is built', cancel: ['project', 'rail'],
          does: [['pip', 'passes', 'trade', 1], ['rel', 'indus', 'passes', -1]] }
      ],
      motions: [
        { key: 'borderforce', short: 'a border force', name: 'A federal guard for the passes', text: 'The federation pays for guards on the mountain roads.', pips: { passes: ['security', 1] }, trust: { narmada: -2 }, upkeep: { capital: 1 } },
        { key: 'roadsfirst', short: 'mountain roads', name: 'Mountain roads before new rail', text: 'Road money goes to the passes first.', pips: { passes: ['trade', 1] }, trust: { brahma: -4 } }
      ]
    },
    {
      id: 'aravalli', name: 'Aravalli Council', short: 'Aravalli', seat: 'Jaipur', lat: 26.91, lon: 75.79, hue: 40, title: 'Chair of the Aravalli Council', trust: 38, planWait: 4,
      blurb: 'Desert and hill country. Short of water, rich in sun, and keen to sell its solar power.',
      needs: [need('water', 'Water', 'water', 'Send Water, or research desalination'), need('solar', 'Energy exports', null, 'Solar Purchase Agreement pact, or build the Desert Solar Grid')],
      pact: { name: 'Solar Purchase Agreement', effect: 'Energy exports +1. You gain 1 Energy and pay 1 Capital each season', cost: {}, does: [['pip', 'aravalli', 'solar', 1]], income: { energy: 1, capital: -1 } },
      ties: { yamuna: { rel: -1, topic: 'Yamuna water' }, narmada: { topic: 'river sharing' }, seaboard: { topic: 'solar exports' } },
      plans: [
        { key: 'canal', name: 'Dig a canal from the Yamuna', eta: 4, harmed: ['yamuna'],
          then: 'Water +1. Yamuna food -1, and the two fall out a step.',
          endIf: 'you hold desalination', cancel: ['tech', 'desal'],
          does: [['pip', 'aravalli', 'water', 1], ['pip', 'yamuna', 'food', -1], ['rel', 'aravalli', 'yamuna', -1]] },
        { key: 'solarbid', name: 'Sell desert solar to the Company', eta: 3, harmed: [],
          then: 'Energy exports +1, and Company grip +1.',
          endIf: 'the Desert Solar Grid is built', cancel: ['project', 'solar'],
          does: [['pip', 'aravalli', 'solar', 1], ['grip', 'aravalli']] }
      ],
      motions: [
        { key: 'solarquota', short: 'solar purchases', name: 'A federal solar quota', text: 'The federation buys a fixed share of desert solar.', pips: { aravalli: ['solar', 1] }, trust: { mahanadi: -4 }, upkeep: { capital: 1 } },
        { key: 'yamunashare', short: 'the Yamuna', name: 'A fixed share of the Yamuna', text: 'The desert gets a set share of the river.', pips: { aravalli: ['water', 1] }, trust: { yamuna: -8 } }
      ]
    },
    {
      id: 'yamuna', name: 'Yamuna Compact', short: 'Yamuna', seat: 'Delhi', lat: 28.61, lon: 77.21, hue: 330, title: 'Mayor of the Capital Region', trust: 36, planWait: 2,
      blurb: 'The capital megacity and its suburbs. Hungry for food and power, and it draws water from its neighbors.',
      needs: [need('food', 'Food', 'food', 'Send Food, or research drought-resistant crops'), need('energy', 'Energy', 'energy', 'Send Energy, or build the Hydro Grid or the Desert Solar Grid')],
      pact: { name: 'Capital Region Compact', effect: 'Food +1, Energy +1. You give 1 Food each season', cost: {}, does: [['pip', 'yamuna', 'food', 1], ['pip', 'yamuna', 'energy', 1]], income: { food: -1 } },
      ties: { ganga: { rel: 1, topic: 'grain prices' }, himal: { topic: 'headwaters' } },
      plans: [
        { key: 'draw', name: 'Draw more water upstream', eta: 3, harmed: ['aravalli'],
          then: 'Food +1. Aravalli water -1, and the two fall out a step.',
          endIf: 'its food need is fully met', cancel: ['pipAtLeast', 'yamuna', 'food', 3],
          does: [['pip', 'yamuna', 'food', 1], ['pip', 'aravalli', 'water', -1], ['rel', 'aravalli', 'yamuna', -1]] },
        { key: 'powerbuy', name: 'Buy power from the Himalayan Accord', eta: 3, harmed: [], fine: true,
          then: 'Energy +1. The two move a step closer.',
          endIf: '', cancel: null,
          does: [['pip', 'yamuna', 'energy', 1], ['rel', 'yamuna', 'himal', 1]] }
      ],
      motions: [
        { key: 'capitalgrid', short: 'the power grid', name: 'The capital region first on the grid', text: 'The megacity gets power before the provinces.', pips: { yamuna: ['energy', 1] }, trust: { aravalli: -4, ganga: -2 }, upkeep: { energy: 1 } },
        { key: 'grainreserve', short: 'a grain reserve', name: 'A federal grain reserve', text: 'The federation stores grain near the capital.', pips: { yamuna: ['food', 1] }, trust: { ganga: -2 }, upkeep: { food: 1 } }
      ]
    },
    {
      id: 'ganga', name: 'Gangetic Union', short: 'Gangetic', seat: 'Lucknow', lat: 26.85, lon: 80.95, hue: 55, title: 'Convener of the Union', trust: 36, planWait: 3,
      blurb: 'The populous middle Ganges plain. Wants food security and protected industry.',
      needs: [need('food', 'Food', 'food', 'Send Food, or research drought-resistant crops'), need('industry', 'Industry', null, 'Industry Compact pact, Subcontinental Rail. In the charter: Protected industry, By population')],
      pact: { name: 'Industry Compact', effect: 'Industry +2. Western Seaboard trust -5', cost: { capital: 2 }, does: [['pip', 'ganga', 'industry', 2], ['trust', 'seaboard', -5]], msg: ' The Western Seaboard protests the tariffs (trust -5).' },
      ties: { himal: { rel: -1, topic: 'dam releases' }, delta: { topic: 'river diversions' }, narmada: { topic: 'forest timber' }, mahanadi: { topic: 'mineral freight' } },
      plans: [
        { key: 'divert', name: 'Divert the middle river for farms', eta: 3, harmed: ['delta'],
          then: 'Food +1. Delta river flow -1, and the two fall out a step.',
          endIf: 'its food need is fully met', cancel: ['pipAtLeast', 'ganga', 'food', 3],
          does: [['pip', 'ganga', 'food', 1], ['pip', 'delta', 'flow', -1], ['rel', 'ganga', 'delta', -1]] },
        { key: 'tariff', name: 'Raise tariffs on coastal goods', eta: 3, harmed: ['seaboard'],
          then: 'Industry +1. Western Seaboard trade -1.',
          endIf: 'the charter settles trade policy', cancel: ['charter', 'trade'],
          does: [['pip', 'ganga', 'industry', 1], ['pip', 'seaboard', 'trade', -1]] }
      ],
      motions: [
        { key: 'grain', short: 'grain prices', name: 'Grain price support', text: 'The federation guarantees farm prices.', pips: { ganga: ['food', 1] }, trust: { malabar: -4 }, upkeep: { food: 1 } },
        { key: 'seats', short: 'council seats', name: 'Council seats by population', text: 'Bigger members get more say in council.', pips: {}, trust: { indus: -8, himal: -6, island: -6, brahma: -4 } }
      ]
    },
    {
      id: 'himal', name: 'Himalayan Accord', short: 'Himalaya', seat: 'Kathmandu', lat: 27.72, lon: 85.32, hue: 160, title: 'Chair of the Accord', trust: 40, planWait: 1,
      blurb: 'Mountain states of the central and eastern Himalaya. They hold the headwaters and want to sell hydropower.',
      needs: [need('hydro', 'Hydro exports', null, 'Power Purchase Agreement pact, or build the Hydro Grid'), need('food', 'Food', 'food', 'Send Food, or research drought-resistant crops')],
      pact: { name: 'Power Purchase Agreement', effect: 'Hydro exports +1. You gain 1 Energy and pay 1 Capital each season', cost: {}, does: [['pip', 'himal', 'hydro', 1]], income: { energy: 1, capital: -1 } },
      ties: { delta: { rel: -1, topic: 'dam releases' }, brahma: { topic: 'hydro sales' } },
      plans: [
        { key: 'dams', name: 'Build the Karnali dams', eta: 3, harmed: ['delta', 'ganga'],
          then: 'Hydro exports +1. Delta river flow -1. It falls out a step with the Delta Republic and with the Gangetic Union.',
          endIf: 'you hold run-of-river turbines', cancel: ['tech', 'ror'],
          does: [['pip', 'himal', 'hydro', 1], ['pip', 'delta', 'flow', -1], ['rel', 'himal', 'delta', -1], ['rel', 'himal', 'ganga', -1]] },
        { key: 'toll', name: 'Charge a headwaters toll', eta: 3, harmed: ['ganga', 'yamuna'],
          then: 'Its relations with the Gangetic Union and the Yamuna Compact each worsen a step.',
          endIf: 'the River Flow Compact is built', cancel: ['project', 'flow'],
          does: [['rel', 'himal', 'ganga', -1], ['rel', 'himal', 'yamuna', -1]] }
      ],
      motions: [
        { key: 'hydrobuy', short: 'hydro purchases', name: 'Guaranteed hydro purchase', text: 'The federation buys Himalayan power at a fixed price.', pips: { himal: ['hydro', 1] }, trust: { yamuna: 2 }, upkeep: { capital: 1 } },
        { key: 'headfee', short: 'headwater fees', name: 'Headwater fee', text: 'Downstream members pay for the rivers they use.', pips: {}, trust: { delta: -8, ganga: -4, yamuna: -4 } }
      ]
    },
    {
      id: 'brahma', name: 'Brahmaputra League', short: 'Brahmaputra', seat: 'Guwahati', lat: 26.14, lon: 91.74, hue: 140, title: 'Speaker of the League', trust: 42, planWait: 5,
      blurb: 'The Brahmaputra valley and the northeast hills. Floods every year, and cut off from the rest by a narrow corridor.',
      needs: [need('flood', 'Flood protection', null, 'Embankment Pact, Flood defense research. In the charter: Common defense force'), need('link', 'Connection', 'capital', 'Send Capital for road and rail links, or build Subcontinental Rail')],
      pact: { name: 'Embankment Pact', effect: 'Flood protection +1', cost: { capital: 2 }, does: [['pip', 'brahma', 'flood', 1]] },
      ties: { delta: { rel: -1, topic: 'Brahmaputra flows' } },
      plans: [
        { key: 'gorgedams', name: 'Dam the Brahmaputra gorges', eta: 4, harmed: ['delta'],
          then: 'Flood protection +1. Delta river flow -1, and the two fall out a step.',
          endIf: 'you hold run-of-river turbines', cancel: ['tech', 'ror'],
          does: [['pip', 'brahma', 'flood', 1], ['pip', 'delta', 'flow', -1], ['rel', 'brahma', 'delta', -1]] },
        { key: 'corridor', name: 'Let the Company build a freight corridor', eta: 3, harmed: [],
          then: 'Connection +1, and Company grip +1.',
          endIf: 'Subcontinental Rail is built', cancel: ['project', 'rail'],
          does: [['pip', 'brahma', 'link', 1], ['grip', 'brahma']] }
      ],
      motions: [
        { key: 'embank', short: 'embankments', name: 'A federal embankment fund', text: 'Every member pays to hold back the river.', pips: { brahma: ['flood', 1] }, trust: {}, upkeep: { capital: 1 } },
        { key: 'eastrail', short: 'northeast rail', name: 'Rail to the northeast first', text: 'New track goes through the corridor before anywhere else.', pips: { brahma: ['link', 1] }, trust: { passes: -4, malabar: -2 } }
      ]
    },
    {
      id: 'delta', name: 'Delta Republic', short: 'Delta', seat: 'Dhaka', lat: 23.81, lon: 90.41, hue: 110, title: 'President of the Republic', trust: 45, planWait: 3,
      blurb: 'The great delta, downstream of everyone. Lives or dies by river flow and flood defense.',
      needs: [need('flow', 'River flow', 'water', 'Send Water, or build the River Flow Compact'), need('flood', 'Flood protection', null, 'Relief Corridor pact, Flood defense research, the Bay Cyclone Shield. In the charter: Common defense force')],
      pact: { name: 'Relief Corridor', effect: 'Flood protection +1', cost: { capital: 2 }, does: [['pip', 'delta', 'flood', 1]] },
      ties: { mahanadi: { topic: 'coal smoke' } },
      plans: [
        { key: 'appeal', name: 'Appeal to the Company for flood aid', eta: 3, harmed: [], repeat: true,
          then: 'Company grip +1.',
          endIf: 'its flood protection reaches 2', cancel: ['pipAtLeast', 'delta', 'flood', 2],
          does: [['grip', 'delta']] },
        { key: 'rights', name: 'Campaign for delta-first water rights', eta: 3, harmed: ['himal', 'brahma'],
          then: 'River flow +1. Its relations with the Himalayan Accord worsen a step.',
          endIf: 'the River Flow Compact is built', cancel: ['project', 'flow'],
          does: [['pip', 'delta', 'flow', 1], ['rel', 'himal', 'delta', -1]] }
      ],
      motions: [
        { key: 'minflow', short: 'river flow', name: 'Minimum flow guarantee', text: 'Upstream dams must release a set flow.', pips: { delta: ['flow', 1] }, trust: { himal: -8, brahma: -4 } },
        { key: 'floodfund', short: 'flood funding', name: 'Federal flood fund', text: 'Every member pays into flood defense.', pips: { delta: ['flood', 1] }, trust: { indus: -2, aravalli: -2 }, upkeep: { capital: 1 } }
      ]
    },
    {
      id: 'mahanadi', name: 'Mahanadi Coast', short: 'Mahanadi', seat: 'Bhubaneswar', lat: 20.30, lon: 85.82, hue: 85, title: 'Governor of the Coast', trust: 40, planWait: 4,
      blurb: 'The eastern coast and its mineral belt. Burns coal for industry and braces for each cyclone season.',
      needs: [need('storm', 'Cyclone protection', 'capital', 'Send Capital for cyclone shelters, or research flood defense, or build the Bay Cyclone Shield'), need('industry', 'Industry', null, 'Minerals Compact pact, Subcontinental Rail. In the charter: Protected industry')],
      pact: { name: 'Minerals Compact', effect: 'Industry +2. Delta Republic trust -4', cost: { capital: 2 }, does: [['pip', 'mahanadi', 'industry', 2], ['trust', 'delta', -4]], msg: ' The Delta Republic fears more coal smoke (trust -4).' },
      ties: { narmada: { rel: 1, topic: 'mining rights' } },
      plans: [
        { key: 'coal', name: 'Expand the coal plants', eta: 3, harmed: ['delta'],
          then: 'Industry +1. Its relations with the Delta Republic worsen a step.',
          endIf: 'the Desert Solar Grid is built', cancel: ['project', 'solar'],
          does: [['pip', 'mahanadi', 'industry', 1], ['rel', 'mahanadi', 'delta', -1]] },
        { key: 'shelters', name: 'Buy cyclone shelters from the Company', eta: 3, harmed: [], repeat: true,
          then: 'Cyclone protection +1, and Company grip +1.',
          endIf: 'you hold flood defense', cancel: ['tech', 'flood'],
          does: [['pip', 'mahanadi', 'storm', 1], ['grip', 'mahanadi']] }
      ],
      motions: [
        { key: 'coalcredit', short: 'coal credits', name: 'Coal credits for the mineral belt', text: 'Coal-fired industry pays no federal levy.', pips: { mahanadi: ['industry', 1] }, trust: { delta: -6, coromandel: -2 } },
        { key: 'cyclonenet', short: 'cyclone warnings', name: 'A federal cyclone warning network', text: 'The federation runs radar and shelters on the coast.', pips: { mahanadi: ['storm', 1] }, trust: {}, upkeep: { capital: 1 } }
      ]
    },
    {
      id: 'narmada', name: 'Narmada Highlands', short: 'Narmada', seat: 'Bhopal', lat: 23.26, lon: 77.41, hue: 95, title: 'Steward of the Highlands', trust: 32, planWait: 2,
      blurb: 'Central forests and plateau. Guards its self-rule and the river that rises in its hills.',
      needs: [need('autonomy', 'Autonomy', null, 'Forest Charter pact. In the charter: Loose union, Local militias, Managed movement'), need('water', 'Water', 'water', 'Send Water')],
      pact: { name: 'Forest Charter', effect: 'Autonomy +1', cost: {}, does: [['pip', 'narmada', 'autonomy', 1]] },
      ties: { seaboard: { rel: -1, topic: 'Narmada dams' } },
      plans: [
        { key: 'narmadadams', name: 'Raise the Narmada dams', eta: 4, harmed: ['seaboard'],
          then: 'Water +1. The Western Seaboard trusts you 4 less, and the two fall out a step.',
          endIf: 'its water need is fully met', cancel: ['pipAtLeast', 'narmada', 'water', 3],
          does: [['pip', 'narmada', 'water', 1], ['trust', 'seaboard', -4], ['rel', 'narmada', 'seaboard', -1]] },
        { key: 'closeforest', name: 'Close the forests to mining', eta: 3, harmed: ['mahanadi'],
          then: 'Autonomy +1. Mahanadi industry -1.',
          endIf: 'you sign its Forest Charter', cancel: ['pact', 'narmada'],
          does: [['pip', 'narmada', 'autonomy', 1], ['pip', 'mahanadi', 'industry', -1]] }
      ],
      motions: [
        { key: 'forestrule', short: 'forest self-rule', name: 'Forest self-rule', text: 'Forest councils decide what is cut and mined.', pips: { narmada: ['autonomy', 1] }, trust: { mahanadi: -4, seaboard: -2 } },
        { key: 'damwater', short: 'dam water', name: 'Dam water stays upstream first', text: 'Highland reservoirs fill before any release.', pips: { narmada: ['water', 1] }, trust: { seaboard: -8 } }
      ]
    },
    {
      id: 'seaboard', name: 'Western Seaboard', short: 'Seaboard', seat: 'Mumbai', lat: 19.08, lon: 72.88, hue: 230, title: 'Chair of the Seaboard Assembly', trust: 44, planWait: 1,
      blurb: 'The Konkan and Gujarat coasts and their finance hub. The Company courts its banks.',
      needs: [need('trade', 'Trade', null, 'Finance Accord pact. In the charter: Open market, Open borders'), need('energy', 'Energy', 'energy', 'Send Energy, or build the Desert Solar Grid')],
      pact: { name: 'Finance Accord', effect: 'Trade +2. You gain 1 Capital each season. Gangetic Union trust -5', cost: {}, does: [['pip', 'seaboard', 'trade', 2], ['trust', 'ganga', -5]], income: { capital: 1 }, msg: ' The Gangetic Union fears cheap imports (trust -5).' },
      ties: { malabar: { rel: 1, topic: 'coastal shipping' } },
      plans: [
        { key: 'bonds', name: 'Float bonds with the Company', eta: 3, harmed: [], repeat: true,
          then: 'Company grip +1.',
          endIf: 'its trade need reaches 2', cancel: ['pipAtLeast', 'seaboard', 'trade', 2],
          does: [['grip', 'seaboard']] },
        { key: 'freeport', name: 'Declare free ports', eta: 3, harmed: [], fine: true,
          then: 'Trade +1. It trusts you 4 more if you hold its Finance Accord, 4 less if not.',
          endIf: '', cancel: null,
          does: [['pip', 'seaboard', 'trade', 1], ['pactTrust', 'seaboard', 4, -4]] }
      ],
      motions: [
        { key: 'westbank', short: 'a federal bank', name: 'A federal bank on the western coast', text: 'The federation keeps its treasury in the port city.', pips: { seaboard: ['trade', 1] }, trust: { yamuna: -4, ganga: -2 } },
        { key: 'portgrid', short: 'the power grid', name: 'Ports first on the grid', text: 'Ports get power before inland towns.', pips: { seaboard: ['energy', 1] }, trust: { ganga: -4, aravalli: -2 }, upkeep: { energy: 1 } }
      ]
    },
    {
      id: 'malabar', name: 'Malabar Ports', short: 'Malabar', seat: 'Kochi', lat: 9.93, lon: 76.27, hue: 270, title: 'Harbor Master of the Ports', trust: 46, planWait: 4,
      blurb: 'Port cities of the southwest coast. Wants open trade and food it cannot grow on its narrow coast.',
      needs: [need('trade', 'Trade', null, 'Spice Route Pact. In the charter: Open market, Open borders'), need('food', 'Food', 'food', 'Send Food')],
      pact: { name: 'Spice Route Pact', effect: 'Trade +2. Island Compact trust -5', cost: {}, does: [['pip', 'malabar', 'trade', 2], ['trust', 'island', -5]], msg: ' The Island Compact sees its harbors undercut (trust -5).' },
      ties: { island: { rel: -2, topic: 'port traffic' }, coromandel: { topic: 'southern trade' } },
      plans: [
        { key: 'undercut', name: 'Undercut the Island Compact\'s ports', eta: 3, harmed: ['island'],
          then: 'Trade +1. Island Compact trade -1, and the two fall out a step.',
          endIf: 'the charter settles trade policy', cancel: ['charter', 'trade'],
          does: [['pip', 'malabar', 'trade', 1], ['pip', 'island', 'trade', -1], ['rel', 'malabar', 'island', -1]] },
        { key: 'bloc', name: 'Form a shipping bloc with the Western Seaboard', eta: 4, harmed: [], fine: ['malabar', 'seaboard'],
          then: 'The two become allies. If neither is a member, each trusts you 6 less: they have each other. If one is a member, the other trusts you 8 more.',
          endIf: '', cancel: null,
          does: [['ally', 'malabar', 'seaboard']] }
      ],
      motions: [
        { key: 'freeports', short: 'free ports', name: 'Free ports charter', text: 'No duties at member ports.', pips: { malabar: ['trade', 1] }, trust: { ganga: -6, island: -4 } },
        { key: 'fishprice', short: 'food prices', name: 'Coastal food price support', text: 'The federation keeps rice cheap on the coast.', pips: { malabar: ['food', 1] }, trust: { coromandel: -2 }, upkeep: { food: 1 } }
      ]
    },
    {
      id: 'coromandel', name: 'Coromandel Coast', short: 'Coromandel', seat: 'Chennai', lat: 13.08, lon: 80.27, hue: 300, title: 'Chair of the Coast Council', trust: 38, planWait: 2,
      blurb: 'The southeast coast. Downstream of you on the Kaveri, and short of the power its factories need.',
      needs: [need('water', 'Water (Kaveri)', 'water', 'Send Water, Kaveri Release pact, or research desalination'), need('energy', 'Energy', 'energy', 'Send Energy')],
      pact: { name: 'Kaveri Release', effect: 'Water +1. You give 1 Water each season', cost: {}, does: [['pip', 'coromandel', 'water', 1]], income: { water: -1 } },
      ties: { island: { rel: -1, topic: 'fishing waters' } },
      plans: [
        { key: 'kaveri', name: 'Press its claim on the Kaveri', eta: 3, harmed: [],
          then: 'Water +1. You lose 2 Water to the release.',
          endIf: 'you sign the Kaveri Release', cancel: ['pact', 'coromandel'],
          does: [['pip', 'coromandel', 'water', 1], ['res', 'water', -2]] },
        { key: 'trawlers', name: 'Send trawlers into the Island Compact\'s waters', eta: 3, harmed: ['island'],
          then: 'Island Compact protection at sea -1, and the two fall out a step.',
          endIf: 'the charter settles defense', cancel: ['charter', 'defense'],
          does: [['pip', 'island', 'security', -1], ['rel', 'coromandel', 'island', -1]] }
      ],
      motions: [
        { key: 'kaveritribunal', short: 'the Kaveri', name: 'A federal Kaveri tribunal', text: 'A federal court sets the Kaveri release each season.', pips: { coromandel: ['water', 1] }, trust: {}, upkeep: { water: 1 } },
        { key: 'southgrid', short: 'a southern grid', name: 'A southern power grid', text: 'The federation links the southern coasts\' power.', pips: { coromandel: ['energy', 1] }, trust: { malabar: -2 }, upkeep: { energy: 1 } }
      ]
    },
    {
      id: 'island', name: 'Island Compact', short: 'Island', seat: 'Colombo', lat: 6.93, lon: 79.86, hue: 250, title: 'Secretary-General of the Compact', trust: 33, planWait: 3,
      blurb: 'The island and its harbors. Lives by trade and needs its sea lanes kept safe.',
      needs: [need('trade', 'Trade', null, 'Harbor Pact. In the charter: Open market'), need('security', 'Protection at sea', 'capital', 'Send Capital for patrol boats. In the charter: Common defense force')],
      pact: { name: 'Harbor Pact', effect: 'Trade +2. Malabar Ports trust -5', cost: {}, does: [['pip', 'island', 'trade', 2], ['trust', 'malabar', -5]], msg: ' Malabar Ports sees its trade undercut (trust -5).' },
      ties: {},
      plans: [
        { key: 'harbor', name: 'Lease a harbor to the Company', eta: 3, harmed: [], repeat: true,
          then: 'Company grip +1.',
          endIf: 'its protection at sea reaches 2', cancel: ['pipAtLeast', 'island', 'security', 2],
          does: [['grip', 'island']] },
        { key: 'closewaters', name: 'Close its fishing waters', eta: 3, harmed: ['coromandel'],
          then: 'Protection at sea +1. Its relations with the Coromandel Coast worsen a step.',
          endIf: 'it makes peace with the Coromandel Coast', cancel: ['relAbove', 'island', 'coromandel', -1],
          does: [['pip', 'island', 'security', 1], ['rel', 'coromandel', 'island', -1]] }
      ],
      motions: [
        { key: 'coastguard', short: 'a coast guard', name: 'A federal coast guard', text: 'The federation patrols the island\'s sea lanes.', pips: { island: ['security', 1] }, trust: { coromandel: -4 }, upkeep: { capital: 1 } },
        { key: 'dutyfree', short: 'duty-free harbors', name: 'Duty-free harbors', text: 'Island harbors charge no federal duty.', pips: { island: ['trade', 1] }, trust: { malabar: -8 } }
      ]
    }
  ];

  /* Derived views of the table. */
  const ORDER = POWERS.map(function (p) { return p.id; });
  const FACTIONS = {}, PLANS = {}, MOTIONS = {}, PLAN_WAIT = {}, NEIGHBORS = {}, REL_START = {}, TOPICS = {};
  POWERS.forEach(function (p) { FACTIONS[p.id] = p; PLANS[p.id] = p.plans; MOTIONS[p.id] = p.motions; PLAN_WAIT[p.id] = p.planWait; NEIGHBORS[p.id] = []; });
  const IDX = {};
  ORDER.forEach(function (id, i) { IDX[id] = i; });
  function pk(a, b) { return IDX[a] < IDX[b] ? a + '|' + b : b + '|' + a; }
  POWERS.forEach(function (p) {
    Object.keys(p.ties).forEach(function (o) {
      const t = p.ties[o], k = pk(p.id, o);
      if (NEIGHBORS[p.id].indexOf(o) < 0) { NEIGHBORS[p.id].push(o); NEIGHBORS[o].push(p.id); }
      if (t.rel) REL_START[k] = t.rel;
      if (t.topic) TOPICS[k] = t.topic;
    });
  });
  ORDER.forEach(function (id) { NEIGHBORS[id].sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); }); });
  /* Pairs that have a relation at all: neighbors and river partners, in table order. */
  const PAIRS = [];
  ORDER.forEach(function (a, i) { ORDER.slice(i + 1).forEach(function (b) { if (NEIGHBORS[a].indexOf(b) >= 0) PAIRS.push([a, b]); }); });
  /* Every need key in play, with the resource that feeds it (null: raised only by pacts, projects, research, and the charter) and the powers that hold it. Labels are generic; each power's own label is in its needs. */
  const NEED_LABELS = { water: 'Water', flow: 'River flow', food: 'Food', energy: 'Energy', autonomy: 'Autonomy', hydro: 'Hydro exports', flood: 'Flood protection', storm: 'Cyclone protection',
    industry: 'Industry', trade: 'Trade', solar: 'Energy exports', security: 'Protection', link: 'Connection' };
  const NEED_KEYS = {};
  POWERS.forEach(function (p) {
    p.needs.forEach(function (n) {
      const k = NEED_KEYS[n.key] = NEED_KEYS[n.key] || { key: n.key, label: NEED_LABELS[n.key] || n.label, res: n.res || null, holders: [] };
      k.holders.push(p.id);
    });
  });
  const REPEAT_PLANS = {};
  POWERS.forEach(function (p) { p.plans.forEach(function (q) { if (q.repeat) REPEAT_PLANS[q.key] = true; }); });

  /* Shared projects and research. `does` always applies; `hurts` applies unless you hold the `spared` tech (always, if none). */
  const PROJECTS = {
    hydro: {
      name: 'Himalayan Hydro Grid', cost: 5, partners: ['himal'], score: 35, scoreUnspared: 8, income: { energy: 2 },
      effect: 'Energy +2 each season. Himalayan hydro exports +2, Yamuna energy +1.',
      catch: 'The Delta Republic loses river flow and trust, the Gangetic Union loses trust, and the Himalayan Accord falls out a step with the delta, unless you hold run-of-river turbines.',
      does: [['pip', 'himal', 'hydro', 2], ['trust', 'himal', 8], ['pip', 'yamuna', 'energy', 1]], msg: 'The Hydro Grid comes online.',
      hurts: [['pip', 'delta', 'flow', -1], ['trust', 'delta', -10], ['trust', 'ganga', -4], ['rel', 'himal', 'delta', -1]], spared: 'ror', hurtMsg: ' Dams cut the flow downstream: Delta Republic trust -10, Gangetic Union trust -4.'
    },
    flow: {
      name: 'River Flow Compact', cost: 4, partners: ['himal', 'delta'], score: 35, scoreUnspared: 20,
      effect: 'Delta river flow +2. The Himalayan Accord and the Delta Republic move a step closer.',
      catch: 'Limits Himalayan dams: hydro exports -1 and trust -6, unless you hold run-of-river turbines.',
      does: [['pip', 'delta', 'flow', 2], ['trust', 'delta', 8], ['rel', 'himal', 'delta', 1]], msg: 'The River Flow Compact guarantees water to the delta.',
      hurts: [['pip', 'himal', 'hydro', -1], ['trust', 'himal', -6]], spared: 'ror', hurtMsg: ' The Himalayan Accord resents the dam limits: trust -6.'
    },
    induswater: {
      name: 'Indus Water Treaty', cost: 4, partners: ['indus', 'lindus'], score: 35, income: { water: -1 },
      effect: 'Indus water share +1, Lower Indus river flow +2, trust +6 each. The two move a step closer.',
      catch: 'You give up 1 Water each season.',
      does: [['pip', 'indus', 'water', 1], ['pip', 'lindus', 'flow', 2], ['trust', 'indus', 6], ['trust', 'lindus', 6], ['rel', 'indus', 'lindus', 1]], msg: 'The Indus Water Treaty is signed in Lahore and Karachi.'
    },
    solar: {
      name: 'Desert Solar Grid', cost: 5, partners: ['aravalli'], score: 35, income: { energy: 1 },
      effect: 'Energy +1 each season. Aravalli energy exports +2, Yamuna and Western Seaboard energy +1.',
      catch: 'The Mahanadi Coast loses coal sales: trust -4.',
      does: [['pip', 'aravalli', 'solar', 2], ['trust', 'aravalli', 8], ['pip', 'yamuna', 'energy', 1], ['pip', 'seaboard', 'energy', 1]], msg: 'Desert solar reaches the cities.',
      hurts: [['trust', 'mahanadi', -4]], hurtMsg: ' The Mahanadi Coast loses coal sales: trust -4.'
    },
    shield: {
      name: 'Bay Cyclone Shield', cost: 5, partners: ['mahanadi', 'delta'], score: 35,
      effect: 'Mahanadi cyclone protection +2, Delta flood protection +1, trust +5 each.',
      catch: '',
      does: [['pip', 'mahanadi', 'storm', 2], ['pip', 'delta', 'flood', 1], ['trust', 'mahanadi', 5], ['trust', 'delta', 5]], msg: 'Sea walls and shelters rise along the bay.'
    },
    rail: {
      name: 'Subcontinental Rail', cost: 7, partners: 'any2', score: 35, income: { capital: 2 },
      effect: 'Capital +2 each season. Brahmaputra connection +1, Western Passes trade routes +1, Gangetic and Mahanadi industry +1, all trust +2.',
      catch: '',
      does: [['pip', 'brahma', 'link', 1], ['pip', 'passes', 'trade', 1], ['pip', 'ganga', 'industry', 1], ['pip', 'mahanadi', 'industry', 1], ['all', 2]], msg: 'The first trains run from the passes to the northeast. All trust +2.'
    }
  };

  const TECH = {
    crops: { name: 'Drought-resistant crops', score: 26, income: { food: 2 }, does: [['pip', 'himal', 'food', 1], ['pip', 'ganga', 'food', 1], ['pip', 'yamuna', 'food', 1]], effect: 'Food +2 each season. Failed monsoons hurt half as much. Shared: Himalayan, Gangetic, and Yamuna food +1.' },
    desal: { name: 'Desalination', score: 18, income: { water: 2 }, does: [['pip', 'coromandel', 'water', 1], ['pip', 'aravalli', 'water', 1]], effect: 'Water +2 each season. Shared: Coromandel and Aravalli water +1.' },
    ror: { name: 'Run-of-river turbines', score: 28, does: [], effect: 'The Hydro Grid and the River Flow Compact no longer harm the other river state. Ends the Karnali and gorge dam plans.' },
    flood: { name: 'Flood defense', score: 24, does: [['pip', 'delta', 'flood', 2], ['trust', 'delta', 6], ['pip', 'brahma', 'flood', 1], ['pip', 'mahanadi', 'storm', 1]], effect: 'Shared: Delta flood protection +2 and trust +6, Brahmaputra flood protection +1, Mahanadi cyclone protection +1.' },
    civil: { name: 'Civil defense doctrine', score: 6, does: [['pip', 'passes', 'security', 1]], effect: 'Battle odds +20%. Winning a battle no longer breeds resentment. Shared: Western Passes protection +1.' }
  };

  function runEffects(S, list) {
    (list || []).forEach(function (e) {
      switch (e[0]) {
        case 'pip': pip(S, e[1], e[2], e[3]); break;
        case 'trust': trust(S, e[1], e[2]); break;
        case 'rel': shiftRel(S, e[1], e[2], e[3]); break;
        case 'grip': gripUp(S, e[1]); break;
        case 'all': ORDER.forEach(function (id) { trust(S, id, e[1]); S.factions[id].touched = true; }); break;
        case 'res': S.res[e[1]] = Math.max(0, S.res[e[1]] + e[2]); break;
        case 'pactTrust': trust(S, e[1], S.factions[e[1]].pact ? e[2] : e[3]); break;
        case 'ally': {
          S.rel[pk(e[1], e[2])] = 2;
          const c = S.factions[e[1]].member, d = S.factions[e[2]].member;
          if (!c && !d) { trust(S, e[1], -6); trust(S, e[2], -6); }
          else if (c && !d) trust(S, e[2], 8);
          else if (d && !c) trust(S, e[1], 8);
          break;
        }
      }
    });
  }
  function test(S, c) {
    if (!c) return false;
    switch (c[0]) {
      case 'tech': return !!S.tech[c[1]];
      case 'project': return !!S.projects[c[1]];
      case 'charter': return !!S.charter[c[1]];
      case 'relAbove': return rel(S, c[1], c[2]) > c[3];
      case 'pact': return !!S.factions[c[1]].pact;
      case 'pipAtLeast': return S.factions[c[1]].pips[c[2]] >= c[3];
    }
    return false;
  }
  function addIncome(y, inc) { Object.keys(inc || {}).forEach(function (r) { y[r] += inc[r]; }); }
  /* Systems arrive one season at a time so a new player is not handed everything at once. */
  const UNLOCK = { company: 2, relations: 3, plans: 4, memory: 5 };
  const INTRO = {
    2: 'New this season: the Company. Each season it courts the powers that trust you least. Raise a courted power\'s trust by 10 within the season, or counter the Company there, or its grip tightens. Three steps and the power goes rogue.',
    3: 'New this season: ties between powers. Helping a power pleases its friends and irritates its rivals, and a power will not join while its rival is a member. Open Relations to broker talks.',
    4: 'New this season: the powers act on their own. Each runs a plan on a countdown. Open a power to back its plan or talk it out of it.',
    5: 'New this season: powers remember. Two favors and a power repays you. Two slights and it hits back. Open a power to see what it remembers.'
  };
  /* From act 2, intros are keyed by act and act season. */
  const ACT_INTRO = {
    '2:1': 'New this act: demands. Each season some members ask for resources or a budget share. Each unmet demand adds a strain mark. Three marks and the member walks out. Members also expect more: trust -1 each season, -4 above trust 70.',
    '2:2': 'New this season: motions. Members table motions for the next council. Members with Company money or trust below 50 vote against you, and so do members with strain unless the option gains them trust. Ties now go against you.',
    '2:3': 'New this season: rivals harden. A power outside loses 1 trust each season for every member it is tense or rival with.',
    '3:1': 'New this act: pledges. A member pledges to ratify at trust 65 with 5 need points, no Company grip, and no strain. It withdraws below trust ' + PLEDGE_KEEP + '. ' + Numw(ACTS[3].goal) + ' pledges ratify the charter.',
    '3:2': 'New this season: the Company goes all in. It courts ' + numw(CO_TARGETS.allIn) + ' powers a season, pledged powers first, and none is immune. A pledged power that takes its money withdraws its pledge.',
    '3:3': 'New this season: holdouts. Each power outside names a grievance. Offer terms to bring one in, even beside its rival.',
    '3:8': 'You may now call the ratification vote. It passes with ' + numw(ACTS[3].goal) + ' pledges.'
  };
  function actSeason(S) { return S.actStart[S.act] ? S.turn - S.actStart[S.act] + 1 : 0; }
  function unlocked(S) {
    const as = actSeason(S), a = S.act;
    return {
      company: S.turn >= UNLOCK.company, relations: S.turn >= UNLOCK.relations, plans: S.turn >= UNLOCK.plans, memory: S.turn >= UNLOCK.memory,
      demands: a >= 2, motions: a === 2 && as >= 2, harden: (a === 2 && as >= 3) || a === 3,
      pledges: a === 3, allIn: a === 3 && as >= 2, terms: a === 3 && as >= 3, callVote: a === 3 && as >= ACTS[3].callFrom
    };
  }

  const CHARTER = {
    3: {
      key: 'structure', title: 'How strong is the center?',
      options: {
        center: { name: 'Strong center', text: 'One capital sets policy for all.', trust: { ganga: 8, yamuna: 8, delta: 4, seaboard: 4, indus: -10, himal: -6, narmada: -6, passes: -6, island: -4 }, pips: {} },
        loose: { name: 'Loose union', text: 'Members keep most powers.', trust: { indus: 8, himal: 6, narmada: 6, passes: 6, island: 4, ganga: -6, yamuna: -6 }, pips: { indus: ['autonomy', 2], narmada: ['autonomy', 1] } }
      }
    },
    6: {
      key: 'trade', title: 'Open market or protected industry?',
      options: {
        open: { name: 'Open market', text: 'No tariffs inside or out.', trust: { malabar: 8, seaboard: 8, island: 6, lindus: 6, ganga: -10, mahanadi: -6 }, pips: { malabar: ['trade', 1], island: ['trade', 1], lindus: ['trade', 1], ganga: ['industry', -1] } },
        protect: { name: 'Protected industry', text: 'Tariffs shield inland factories.', trust: { ganga: 10, mahanadi: 8, malabar: -8, seaboard: -8, island: -4 }, pips: { ganga: ['industry', 1], mahanadi: ['industry', 1], malabar: ['trade', -1] } }
      }
    },
    9: {
      key: 'defense', title: 'Who defends the federation?',
      options: {
        common: { name: 'Common defense force', text: 'One force under the council. Battle odds +15%.', trust: { delta: 6, island: 6, passes: 4, brahma: 4, ganga: 4, indus: -8, narmada: -6 }, pips: { delta: ['flood', 1], brahma: ['flood', 1], island: ['security', 1], passes: ['security', 1] } },
        local: { name: 'Local militias', text: 'Each member defends itself.', trust: { indus: 8, narmada: 6, himal: 4, passes: -4 }, pips: { indus: ['autonomy', 1], narmada: ['autonomy', 1] } }
      }
    }
  };

  /* Act 2: each member can table two motions, in order (its `motions` in POWERS). Passing one costs upkeep each season while its proposer is a member. */
  const MOTION_BY_KEY = {};
  Object.keys(MOTIONS).forEach(function (id) { MOTIONS[id].forEach(function (m) { MOTION_BY_KEY[m.key] = Object.assign({ f: id }, m); }); });


  /* Act 3: two last charter questions, keyed by act season. */
  const ARTICLES = {
    3: { key: 'revenue', title: 'How is federal revenue shared?', options: {
      equal: { name: 'Equal shares', text: 'Every member gets the same.', trust: { indus: 6, himal: 6, passes: 4, narmada: 4, brahma: 4, island: 4, malabar: 2, ganga: -8, yamuna: -6 }, pips: { himal: ['food', 1], brahma: ['link', 1] } },
      people: { name: 'By population', text: 'Revenue follows the people.', trust: { ganga: 8, yamuna: 6, delta: 4, seaboard: 2, indus: -6, himal: -6, brahma: -4, island: -4 }, pips: { ganga: ['industry', 1] } } } },
    6: { key: 'borders', title: 'Open borders or managed movement?', options: {
      open: { name: 'Open borders', text: 'Anyone may live and work anywhere.', trust: { malabar: 6, seaboard: 6, delta: 4, ganga: 2, island: 2, indus: -6, narmada: -4 }, pips: { malabar: ['trade', 1], seaboard: ['trade', 1] } },
      managed: { name: 'Managed movement', text: 'Members set their own entry rules.', trust: { indus: 6, himal: 4, narmada: 4, seaboard: -4, malabar: -4 }, pips: { indus: ['autonomy', 1], narmada: ['autonomy', 1] } } } }
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

  /* Mulberry32, with its state kept on S.rs so a game saves as plain JSON and resumes on the same draws. */
  function attachRng(S) {
    Object.defineProperty(S, 'rng', { enumerable: false, configurable: true, writable: true, value: function () {
      let a = S.rs = (S.rs + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    } });
    return S;
  }

  /* Save and resume. A save is JSON of the whole state; SAVE_V changes whenever the state's shape does, and older saves are refused. */
  const SAVE_V = 2;
  function save(S) { return JSON.stringify({ v: SAVE_V, S: S }); }
  function load(str) {
    let d; try { d = JSON.parse(str); } catch (e) { return null; }
    // version 1 had no memory: give every power an empty one
    if (d && d.v === 1 && d.S && d.S.factions) { Object.keys(d.S.factions).forEach(function (id) { d.S.factions[id].mem = d.S.factions[id].mem || []; }); d.v = 2; }
    if (!d || d.v !== SAVE_V || !d.S || typeof d.S.rs !== 'number' || !d.S.factions || ORDER.some(function (id) { return !d.S.factions[id]; })) return null;
    return attachRng(d.S);
  }

  function create(seed) {
    const S = {
      seed: seed >>> 0, rs: seed | 0,
      turn: 0, phase: 'actions', outcome: null,
      res: { water: 3, energy: 3, food: 3, capital: 5 },
      influence: 3, shortage: false,
      factions: {}, projects: {}, tech: {}, research: null, charter: {},
      companyTargets: [], escalated: false, coReach: 0, crisis: null, battle: null, lastBattle: null, rel: {}, dispute: null, monsoon: null, plansDone: {}, council: null,
      act: 1, actStart: { 1: 1, 2: null, 3: null }, agenda: [], exits: [], lastVotes: [], lastVote: null, passed: {}, voteCalled: null,
      stats: { walkouts: 0, secessions: 0, demandsMet: 0, demandsMissed: 0, motionsPassed: 0, motionsFailed: 0, pledgesLost: 0, termsOffered: 0 },
      briefing: [], log: [], lastResolution: [], history: []
    };
    ORDER.forEach(function (id) {
      const d = FACTIONS[id];
      const pips = {};
      d.needs.forEach(function (n) { pips[n.key] = 0; });
      S.factions[id] = { id: id, trust: d.trust, pips: pips, grip: 0, member: false, pact: false, request: null, touched: false, countered: false, trustAtStart: d.trust, plan: null, planIdx: 0, planWait: PLAN_WAIT[id],
        demand: null, mem: [], strain: 0, lastStrain: null, motion: null, motionIdx: 0, left: null, leftHow: null, grievance: null, pledged: false, terms: false, lastAsk: 0 };
    });
    PAIRS.forEach(function (p) { const k = pk(p[0], p[1]); S.rel[k] = REL_START[k] || 0; });
    attachRng(S);
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
  function rel(S, a, b) { return S.rel[pk(a, b)] || 0; }
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
  function clientNeighbors(S, id) { return NEIGHBORS[id].filter(function (o) { return S.factions[o].grip >= 2; }); }
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
  /* ---------- memory: each power keeps your last few favors (+1) and slights (-1) toward it ----------
     A met demand is a duty, not a favor, so only a missed one is remembered. At a net of REPLY_AT either way it replies at the start of a season, and the memory is spent. Entries fade after MEM_AGE seasons. */
  const MEM_MAX = 4, MEM_AGE = 8, REPLY_AT = 3, REPLY_GIFT = 3, REPLY_VOUCH = 3, REPLY_SNUB = 3;
  function remember(S, id, d, text) {
    const f = S.factions[id];
    f.mem.push({ t: S.turn, d: d, text: text });
    if (f.mem.length > MEM_MAX) f.mem.shift();
  }
  function memScore(S, id) { return S.factions[id].mem.reduce(function (a, m) { return a + m.d; }, 0); }
  /* Its friends: powers it is friendly with or allied to, not rogue. */
  function friendsOf(S, id) { return NEIGHBORS[id].filter(function (o) { return rel(S, id, o) >= 1 && S.factions[o].grip < 3; }); }
  /* What a power will do when its memory comes due, or null. Reads state only, so the dossier can show it.
     sc overrides the memory's score, to preview the reply at either end. */
  function replyOf(S, id, sc) {
    const f = S.factions[id];
    if (sc === undefined) sc = memScore(S, id);
    if (f.grip >= 3 || Math.abs(sc) < REPLY_AT) return null;
    const fr = friendsOf(S, id);
    if (sc > 0) {
      // a member repays only by dropping a grievance; with none, it keeps the memory
      if (f.member) return f.strain > 0 ? { k: 'mend', good: true, text: 'drops a grievance. Strain -1' } : null;
      if (fr.length) return { k: 'vouch', good: true, fs: fr, text: 'vouches for you with ' + andList(fr.map(fname)) + '. Trust +' + REPLY_VOUCH + ' there' };
      const nd = FACTIONS[id].needs.filter(function (n) { return n.res; })[0], r = nd ? nd.res : 'capital';
      return { k: 'gift', good: true, res: r, text: 'sends you ' + REPLY_GIFT + ' ' + cap(r) };
    }
    if (f.member && S.act >= 2) return { k: 'grudge', good: false, text: 'nurses a grudge. Strain +1' };
    if (fr.length) return { k: 'snub', good: false, fs: fr, text: 'speaks against you to ' + andList(fr.map(fname)) + '. Trust -' + REPLY_SNUB + ' there' };
    if (S.turn >= UNLOCK.company && !f.member && f.grip < 2) return { k: 'court', good: false, text: 'invites the Company in. Its agents court it this season' };
    return { k: 'cool', good: false, text: 'cools on you. Trust -' + REPLY_SNUB };
  }
  /* Season start: memories fade, and powers whose memory has come due reply. Uses no randomness. */
  function replies(S) {
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      f.mem = f.mem.filter(function (m) { return m.t > S.turn - MEM_AGE; });
      if (S.turn < UNLOCK.memory) return;
      const r = replyOf(S, id);
      if (!r) return;
      f.mem = [];
      if (r.k === 'mend') addStrain(S, id, -1);
      else if (r.k === 'vouch') r.fs.forEach(function (o) { trust(S, o, REPLY_VOUCH); });
      else if (r.k === 'gift') S.res[r.res] += REPLY_GIFT;
      else if (r.k === 'grudge') addStrain(S, id, 1, 'it held a grudge over your slights');
      else if (r.k === 'snub') r.fs.forEach(function (o) { trust(S, o, -REPLY_SNUB); });
      else if (r.k === 'court') S.companyTargets.push(id);
      else trust(S, id, -REPLY_SNUB);
      S.briefing.push({ g: 'reply', f: id, fs: r.fs, res: r.res, co: r.k === 'court' ? 'court' : undefined, kind: r.good ? 'good' : 'bad', reply: r.k,
        text: (r.good ? 'Remembering your favors, ' : 'Remembering your slights, ') + fname(id) + ' ' + r.text + '.' });
    });
  }

  /* Goodwill spills over: a power's friends warm to you when you help it, its rivals cool. */
  function spillList(S, id, amt) {
    if (S.turn < UNLOCK.relations) return [];
    // only neighbors have a relation, and NEIGHBORS keeps table order
    return NEIGHBORS[id].map(function (o) { return { id: o, d: Math.round(amt * rel(S, id, o) / 2) }; }).filter(function (x) { return x.d; });
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

  /* Powers outside, closest to joining first, with a rough cost in actions. The adviser focuses on the first few. */
  function prospects(S) {
    return ORDER.filter(function (id) { return !S.factions[id].member && S.factions[id].grip < 3; }).map(function (id) {
      const f = S.factions[id];
      const cost = Math.max(0, JOIN_TRUST - f.trust) / 5 + Math.max(0, JOIN_NEEDS - needTotal(S, id)) * 1.5 + (rivalInside(S, id) ? 4 : 0) + Math.max(0, f.grip - 1) * 2 + f.strain;
      return { id: id, cost: Math.round(cost * 10) / 10 };
    }).sort(function (a, b) { return a.cost - b.cost || IDX[a.id] - IDX[b.id]; });
  }
  const FOCUS = 4;               // the adviser works on this many prospects at a time

  /* The adviser: every available action, scored, with a one-line reason. Also drives the test bot. */
  function advise(S) {
    const out = [];
    const ps = pledges(S);
    const focus = {};
    prospects(S).slice(0, FOCUS).forEach(function (p) { focus[p.id] = true; });
    const nearCoWin = clients(S).length >= CO_WIN - 2;
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
          const wait = ps.length < AMAN_AT && fifth && actSeason(S) < ACTS[3].len - 1;
          if (ps.length - lost >= ACTS[3].goal && !wait) { s = 95; why = Numw(ACTS[3].goal) + ' pledges stand and the Company cannot reach enough of them this season.'; }
          break;
        }
        case 'counter':
          if (S.act === 3 && f.pledged && unblocked) { s = 72; why = 'The Company is after a pledge. Without a counter, it is withdrawn.'; }
          else if (S.act === 3 && f.member && !f.pledged && f.grip === 1 && pledgeGaps(S, a.f).length === 1) { s = 65; why = 'Only Company money stands between it and a pledge.'; }
          else if (f.grip >= 2 && (focus[a.f] || f.member || nearCoWin)) { s = 60; why = nearCoWin && !focus[a.f] ? 'The Company is close to enough clients to win. This loosens one.' : 'A Company client will not join. This loosens the grip.'; }
          else if (f.grip >= 2) { s = 16; why = 'A Company client will not join. This loosens the grip.'; }
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
        case 'project': {
          const pj = PROJECTS[a.p];
          s = pj.hurts && !S.tech[pj.spared] && pj.scoreUnspared !== undefined ? pj.scoreUnspared : pj.score; why = pj.effect;
          break;
        }
        case 'pact': s = 30; why = 'One Influence buys a need point and 6 trust.';
          if (pactHurtsMember(S, a.f)) { s = 10; }
          break;
        case 'research': s = (S.turn <= 8 || S.act === 2) ? TECH[a.t].score : 0; why = TECH[a.t].effect; break;
        case 'aid':
          if (nt < JOIN_NEEDS) { s = focus[a.f] ? 24 : 14; why = 'Raises one of its needs. It has ' + nt + ' of the ' + JOIN_NEEDS + ' it wants.'; }
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
          const fine = p.fine === true || (Array.isArray(p.fine) && p.fine.some(function (id) { return S.factions[id].member; }));
          // a plan matters when it buys Company arms, or hurts a member or a prospect
          const grips = p.does.some(function (e) { return e[0] === 'grip'; });
          const hurts = p.harmed.concat(p.does.filter(function (e) { return (e[0] === 'pip' && e[3] < 0) || (e[0] === 'trust' && e[2] < 0); }).map(function (e) { return e[1]; }));
          const matters = grips || f.member || focus[a.f] || hurts.some(function (h) { return S.factions[h].member || focus[h]; });
          if (!fine) { s = matters ? 27 : 8; why = 'If its plan finishes: ' + p.then; }
          break;
        }
        case 'envoy':
          if (f.member) {
            if (f.trust < SECEDE_TRUST + 6) { s = 55; why = 'Its trust is near ' + SECEDE_TRUST + '. Below that it secedes.'; break; }
            if (S.act === 3 && f.pledged && f.trust < PLEDGE_KEEP + 6) { s = 50; why = 'Its pledge is withdrawn below trust ' + PLEDGE_KEEP + '.'; break; }
            if (S.act === 3 && !f.pledged && nt >= RATIFY_NEEDS && f.trust < RATIFY_TRUST) { s = 25; why = 'Its needs are met. Only trust stands between it and a pledge.'; }
            break;
          }
          if (nt >= JOIN_NEEDS && f.trust < JOIN_TRUST) { s = 25; why = 'Its needs are met. Only trust stands between it and joining.'; }
          else if (focus[a.f] && f.trust < JOIN_TRUST) { s = 20; why = 'It is among the closest to joining. Trust is its biggest gap.'; }
          else if (courted) { s = 12; why = 'Helps outbid the Company this season.'; }
          else s = 5;
          break;
      }
      if (s > 0) out.push({ id: a.id, score: s, why: why, label: label, cost: a.cost });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  /* A pact that costs trust with a power already in the federation. */
  function pactHurtsMember(S, id) { return (FACTIONS[id].pact.does || []).some(function (e) { return e[0] === 'trust' && e[1] !== id && e[2] < 0 && S.factions[e[1]].member; }); }
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
    Object.keys(TECH).forEach(function (k) { if (S.tech[k]) addIncome(y, TECH[k].income); });
    Object.keys(PROJECTS).forEach(function (k) { if (S.projects[k]) addIncome(y, PROJECTS[k].income); });
    ORDER.forEach(function (id) { if (S.factions[id].pact) addIncome(y, FACTIONS[id].pact.income); });
    if (S.charter.trade === 'open') y.capital += 1;
    const nm = members(S).length;
    y.capital += nm;
    y.water += Math.floor(nm / RES_PER); y.energy += Math.floor(nm / RES_PER); y.food += Math.floor(nm / RES_PER);
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
    let p = 0.45 + FIGHT_PER * members(S).length;
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
      runEffects(S, TECH[id].does);
      const shared = (TECH[id].does || []).map(function (e) { return e[1]; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
      B.push(shared.length ? { fs: shared, kind: 'good', text: 'Research complete: ' + TECH[id].name + '.' } : { kind: 'good', text: 'Research complete: ' + TECH[id].name + '.' });
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
    const baseInf = INF_BASE[S.act] + Math.floor(nm / INF_PER);
    S.influence = baseInf - (S.shortage ? 1 : 0);
    if (S.shortage) B.push({ kind: 'bad', text: 'Shortages at home distract your government. Influence -1 this season.' });

    // per-faction reset
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      f.touched = false; f.countered = false; f.trustAtStart = f.trust; f.request = null; f.demand = null;
    });

    // requests: from act 2, only powers outside make them
    const pool = ORDER.filter(function (id) { return S.factions[id].grip < 3 && (S.act === 1 || !S.factions[id].member); });
    let n = Math.min(REQ_CAP, S.act === 1 ? 2 + (failed ? 1 : 0) + Math.floor(nm / 4) : 2 + (failed ? 1 : 0));
    while (n > 0 && pool.length) {
      const id = pool.splice(Math.floor(S.rng() * pool.length), 1)[0];
      const r = pickRes(S, id);
      S.factions[id].request = { res: r, amount: 2 };
      B.push({ g: 'ask', res: r, f: id, kind: 'ask', text: fname(id) + ' asks for 2 ' + cap(r) + '.' });
      n--;
    }

    // members make demands (act 2 on). The random stream is touched only from act 2.
    if (S.act >= 2) drawDemands(S, failed, as, ORDER.filter(function (id) { return S.factions[id].request; }).length);

    // company announces its targets
    const nTargets = S.act === 1 ? CO_TARGETS[1] + (nm >= CO_GROW_AT ? 1 : 0) : S.act === 2 ? CO_TARGETS[2] : (as >= 2 ? CO_TARGETS.allIn : CO_TARGETS[3]);
    S.companyTargets = S.turn >= UNLOCK.company ? pickCompanyTargets(S, nTargets) : [];
    if (S.companyTargets.length) {
      B.push({ fs: S.companyTargets.slice(), co: 'court', kind: 'warn', text: 'Company agents are courting ' + andList(S.companyTargets.map(fname)) + '. Raise trust there by ' + BLOCK_GAIN + ' this season, or counter the Company, to block the deal.' });
      // S.coReach is the most powers it has courted in one season; each step up is announced
      if (S.companyTargets.length > (S.coReach || CO_TARGETS[1])) { S.escalated = true; B.push({ fs: S.companyTargets.slice(), kind: 'warn', text: 'Your federation alarms the Company. It now courts ' + numw(S.companyTargets.length) + ' powers each season.' }); }
      S.coReach = Math.max(S.coReach || 0, S.companyTargets.length);
    }

    // powers reply to what they remember of you
    replies(S);

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
        if (test(S, p.cancel)) { f.planWait = 2; return; }
        f.plan = { i: i, eta: p.eta, backed: false };
        B.push({ g: 'planstart', f: id, kind: 'plan', text: fname(id) + ' starts a plan of its own: ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + '. Done in ' + p.eta + ' seasons.' });
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

  /* Members take turns: the one that asked longest ago goes first, ties at random. */
  function drawFair(S, pool) {
    const lo = Math.min.apply(null, pool.map(function (id) { return S.factions[id].lastAsk; }));
    const ties = pool.filter(function (id) { return S.factions[id].lastAsk === lo; });
    const id = ties[Math.floor(S.rng() * ties.length)];
    pool.splice(pool.indexOf(id), 1); S.factions[id].lastAsk = S.turn;
    return id;
  }
  /* Demands: half the members, at most DEMAND_CAP, plus a claim in a failed monsoon. Requests and demands together stay within ASK_CAP. */
  function drawDemands(S, failed, as, asked) {
    const B = S.briefing, ms = members(S);
    const pool = ms.filter(function (id) { return S.factions[id].grip < 3 && !S.factions[id].demand; });
    const room = Math.max(0, ASK_CAP - asked);
    const base = Math.min(DEMAND_CAP, Math.ceil(ms.length / 2), room);
    const total = Math.min(room, base + (failed ? 1 : 0));
    const nc = nextCouncil(S, as);
    for (let i = 0; i < total && pool.length; i++) {
      const id = drawFair(S, pool), f = S.factions[id];
      let kind;
      if (i >= base) kind = 'claim';
      else {
        const canMotion = S.act === 2 && as >= 2 && !f.motion && f.motionIdx < 2 && nc !== null;
        if (canMotion && S.rng() < 0.25) kind = 'motion';
        else kind = S.rng() < 0.55 ? 'claim' : 'share';
        if (kind === 'motion' && ORDER.filter(function (o) { return S.factions[o].motion && S.factions[o].motion.at === nc; }).length >= MOTION_CAP) kind = 'claim';
      }
      if (kind === 'motion') {
        const m = MOTIONS[id][f.motionIdx];
        f.motionIdx += 1; f.motion = { key: m.key, at: nc };
        const wait = nc - S.turn;
        B.push({ g: 'motion', f: id, kind: 'ask', text: fname(id) + ' tables a motion: ' + m.name + '. The council votes on it in ' + wait + ' season' + (wait > 1 ? 's' : '') + '.' });
      } else if (kind === 'claim') {
        const r = pickRes(S, id);
        f.demand = { kind: 'claim', res: r, amount: 3 };
        B.push({ g: 'claim', res: r, f: id, kind: 'ask', text: fname(id) + ' claims 3 ' + cap(r) + ' from the federation.' });
      } else {
        const amt = 2 + (ms.length >= SHARE_BIG ? 1 : 0) + Math.floor(S.res.capital / SHARE_PER);
        f.demand = { kind: 'share', res: 'capital', amount: amt };
        B.push({ g: 'share', res: 'capital', f: id, kind: 'ask', text: fname(id) + ' asks for its budget share: ' + amt + ' Capital.' });
      }
    }
  }

  function pickCompanyTargets(S, n) {
    const as = actSeason(S), allIn = S.act === 3 && as >= 2;
    const immune = allIn ? Infinity : CO_IMMUNE[S.act];
    const harden = (S.act === 2 && as >= 3) || S.act === 3;
    // it spreads from its footholds: each neighbor that is already its client makes a power an easier mark
    function score(id) { return S.factions[id].trust - (harden ? 5 * opposedMembers(S, id).length : 0) - CO_SPREAD * clientNeighbors(S, id).length; }
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
      // the auto-resolved battle, in one call: the sim and the adviser take this path
      enterBattle(S, id);
      return autoBattle(S);
    } else if (choice === 'battle') {
      // the battle on the map: the scene plays it round by round with battleMove, then calls finishBattle
      enterBattle(S, id, true);
      return { ok: true, battle: true, msg: 'You move to defend the federation against Company contractors.' };
    } else {
      S.res.capital = Math.max(0, S.res.capital - 1); S.res.food = Math.max(0, S.res.food - 1);
      f.grip = 2; trust(S, id, -2);
      msg = 'You sealed the border and absorbed the raids: Capital -1, Food -1. ' + fname(id) + ' remains a Company client.';
      log(S, msg, 'warn');
    }
    nextPhase(S);
    return { ok: true, msg: msg };
  }

  /* ---------- battle ---------- */
  /* A battle is always against Company forces, never a power. It plays out on the campaign map in up to
     three rounds. Each round the Company strikes one place next to the rogue power, and you choose a move:
       hold:  defend it. Chance per round, plus allies who border it. A failed hold hits its towns.
       evac:  move its people out first. Certain, and it earns trust, but the round goes to the Company.
       cut:   strike the Company's supply line. Lower chance; success ends the battle at once and frees the
              rogue power entirely. Once per battle. A failed cut reinforces the Company.
     Two rounds win or lose it. fightOdds counts every member; here members count only where they march.
     The base chance per round comes from fightOdds without the member term, so holding every round with
     the usual allies wins about as often as auto-resolve does. */
  const BT_ROUNDS = 3, BT_ALLY = 0.1, BT_ALLY_MAX = 3, BT_ALLY_TRUST = 50, BT_CUT = 0.15, BT_REINF = 0.1;
  const BT_HIT = -3, BT_EVAC = 2, BT_HIT_HOME = { capital: 1 };
  // the chance per round q whose best of three, 3q^2 - 2q^3, equals the battle odds
  function roundChance(odds) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (3 * m * m - 2 * m * m * m < odds) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function borders(a, b) {
    if (a === b) return true;
    if (a === PLAYER.id) return PLAYER.neighbors.indexOf(b) >= 0;
    if (b === PLAYER.id) return PLAYER.neighbors.indexOf(a) >= 0;
    return NEIGHBORS[a].indexOf(b) >= 0;
  }
  // where the Company strikes from the rogue power: federation places first (you and members), then any free neighbor
  function strikeTargets(S, id) {
    const near = NEIGHBORS[id].filter(function (o) { return S.factions[o].grip < 3; });
    if (PLAYER.neighbors.indexOf(id) >= 0) near.unshift(PLAYER.id);
    const fed = near.filter(function (o) { return o === PLAYER.id || S.factions[o].member; });
    const pool = fed.length ? fed : near.length ? near : [PLAYER.id];
    const out = [];
    for (let r = 0; r < BT_ROUNDS; r++) {
      const fresh = pool.filter(function (o) { return out.indexOf(o) < 0; }), from = fresh.length ? fresh : pool;
      out.push(from[Math.floor(S.rng() * from.length)]);
    }
    return out;
  }
  // members who march to a place: they trust you, they are not the rogue power, and they border it (or are it)
  function battleAllies(S, t) {
    const id = S.battle.f;
    return members(S).filter(function (o) { return o !== id && S.factions[o].trust >= BT_ALLY_TRUST && borders(o, t); }).slice(0, BT_ALLY_MAX);
  }
  function enterBattle(S, id, live) {
    S.battle = { kind: 'crisis', f: id, odds: fightOdds(S), turn: S.turn };
    // the auto-resolved path draws nothing extra, so the sim is unchanged
    if (live) Object.assign(S.battle, { live: true, q: roundChance(S.battle.odds - FIGHT_PER * members(S).length), targets: strikeTargets(S, id), round: 0, wins: 0, losses: 0, reinf: 0, cutUsed: false, cut: false, rounds: [], done: null });
    S.phase = 'battle';
  }
  /* What you can do this round, with the chance of each move, for the scene and the bots. */
  function battleOptions(S) {
    const b = S.battle;
    if (S.phase !== 'battle' || !b || !b.live || b.done) return null;
    const t = b.targets[b.round], allies = battleAllies(S, t), pen = BT_REINF * b.reinf;
    const home = t === PLAYER.id;
    return {
      round: b.round, rounds: BT_ROUNDS, target: t, from: b.f, allies: allies, wins: b.wins, losses: b.losses, odds: b.odds,
      moves: [
        { key: 'hold', ok: true, p: clamp(b.q + BT_ALLY * allies.length - pen, 0.05, 0.95), fail: home ? { res: BT_HIT_HOME } : { trust: BT_HIT } },
        { key: 'evac', ok: true, p: 1, gain: home ? {} : { trust: BT_EVAC } },
        { key: 'cut', ok: !b.cutUsed, why: b.cutUsed ? 'You tried the supply line once already.' : '', p: clamp(b.q - BT_CUT - pen, 0.05, 0.95) }
      ]
    };
  }
  /* Play one round. One draw from S.rng for hold and cut. Sets S.battle.done when the battle is decided. */
  function battleMove(S, key) {
    const o = battleOptions(S);
    if (!o) return { ok: false, msg: 'No battle round to play.' };
    const m = o.moves.filter(function (x) { return x.key === key; })[0];
    if (!m || !m.ok) return { ok: false, msg: m ? m.why : 'Unknown move.' };
    const b = S.battle, t = o.target, home = t === PLAYER.id, tn = home ? 'your towns' : fname(t);
    const ev = { round: b.round, t: t, move: key, allies: o.allies, p: m.p, ok: true, trust: 0, res: {} };
    if (key === 'evac') {
      b.losses += 1;
      if (!home) { trust(S, t, BT_EVAC); ev.trust = BT_EVAC; }
      ev.text = 'You moved ' + (home ? 'your people' : fname(t) + '\'s people') + ' out first. No one was hurt. The Company takes the round.';
    } else {
      ev.ok = S.rng() < m.p;
      if (key === 'cut') b.cutUsed = true;
      if (ev.ok && key === 'cut') { b.cut = true; b.wins = 2; ev.text = 'You cut the Company\'s supply line. Its contractors pull out of ' + fname(b.f) + '.'; }
      else if (ev.ok) {
        b.wins += 1;
        const others = o.allies.filter(function (x) { return x !== t; }).map(fname), with_ = others.length > 2 ? others.slice(0, -1).join(', ') + ', and ' + others[others.length - 1] : others.join(' and ');
        ev.text = (others.length ? 'With ' + with_ + ', you' : 'You') + ' held ' + tn + '.';
      }
      else {
        b.losses += 1;
        if (key === 'cut') { b.reinf += 1; ev.text = 'The strike on the supply line failed. The Company sends more contractors.'; }
        else if (home) { Object.keys(BT_HIT_HOME).forEach(function (r) { S.res[r] = Math.max(0, S.res[r] - BT_HIT_HOME[r]); ev.res[r] = -BT_HIT_HOME[r]; }); ev.text = 'Contractors broke through at your towns. Capital -1.'; }
        else { trust(S, t, BT_HIT); ev.trust = BT_HIT; ev.text = 'Contractors broke through at ' + tn + '. Its towns were hit, and it blames you. Trust ' + BT_HIT + '.'; }
      }
    }
    b.rounds.push(ev);
    b.round += 1;
    if (b.wins >= 2 || b.losses >= 2 || b.round >= BT_ROUNDS) b.done = { won: b.wins >= 2, cut: b.cut };
    return { ok: true, msg: ev.text, ev: ev, done: b.done };
  }
  /* Roll the battle with fightOdds. One draw from S.rng, exactly as the old dice roll, so the sim is unchanged. */
  function autoBattle(S) {
    if (S.phase !== 'battle') return { ok: false, msg: 'No battle to fight.' };
    return finishBattle(S, { won: S.rng() < S.battle.odds, auto: true });
  }
  /* result: { won, auto }, or nothing once the rounds have decided it. Applies the outcome the crisis dialog promised.
     Cutting the supply line frees the rogue power entirely: grip falls to zero, not one. */
  function finishBattle(S, result) {
    if (S.phase !== 'battle' || !S.battle) return { ok: false, msg: 'No battle to finish.' };
    result = result || S.battle.done;
    if (!result) return { ok: false, msg: 'The battle is not decided yet.' };
    const id = S.battle.f, f = S.factions[id], how = result.auto ? ' (auto-resolved)' : '';
    let msg;
    if (result.won) {
      f.grip = result.cut ? 0 : 1;
      const freed = result.cut ? ' ' + fname(id) + ' is free of the Company.' : '';
      if (S.tech.civil) {
        ORDER.forEach(function (o) { if (o !== id) trust(S, o, 2); });
        msg = 'Battle won' + how + '.' + freed + ' Your forces held the line and protected civilians. Other factions take note: trust +2.';
      } else {
        trust(S, id, -6);
        ORDER.forEach(function (o) { if (o !== id) trust(S, o, -2); });
        msg = 'Battle won' + how + '.' + freed + ' The raids stop, but ' + fname(id) + ' resents the defeat (trust -6) and the others grow wary (trust -2).';
      }
      log(S, msg, 'warn');
    } else {
      S.res.capital = Math.max(0, S.res.capital - 3); S.res.food = Math.max(0, S.res.food - 2);
      f.grip = 2; trust(S, id, -4);
      msg = 'Battle lost' + how + '. Raiders burn depots: Capital -3, Food -2. ' + fname(id) + ' stays a Company client.';
      log(S, msg, 'bad');
    }
    S.lastBattle = { f: id, won: !!result.won, auto: !!result.auto, cut: !!result.cut, turn: S.turn, msg: msg, rounds: S.battle.rounds || [] };
    S.battle = null;
    nextPhase(S);
    return { ok: true, msg: msg, won: !!result.won };
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
      remember(S, a, 1, 'You hosted talks on ' + S.dispute.topic + '.'); remember(S, b, 1, 'You hosted talks on ' + S.dispute.topic + '.');
      msg = 'You hosted talks on ' + S.dispute.topic + '. ' + fname(a) + ' and ' + fname(b) + ' are now ' + REL_NAMES[rel(S, a, b)].toLowerCase() + '. Trust +' + DISPUTE.talks + ' with each.';
      log(S, msg, 'good');
    } else if (choice === 'a' || choice === 'b') {
      const w = choice === 'a' ? a : b, l = choice === 'a' ? b : a;
      trust(S, w, DISPUTE.back); trust(S, l, -DISPUTE.back);
      remember(S, w, 1, 'You backed it over ' + S.dispute.topic + '.'); remember(S, l, -1, 'You backed ' + fname(w) + ' over ' + S.dispute.topic + '.');
      msg = 'You backed ' + fname(w) + ' over ' + S.dispute.topic + '. Trust +' + DISPUTE.back + ' there, -' + DISPUTE.back + ' with ' + fname(l) + '.';
      if (S.act >= 2 && S.factions[w].member && S.factions[l].member) {
        addStrain(S, l, 1, 'you sided against it over ' + S.dispute.topic);
        msg += ' ' + fname(l) + ' takes it as a grievance: strain ' + S.factions[l].strain + ' of ' + STRAIN_MAX + '.';
      }
      log(S, msg, 'warn');
    } else {
      trust(S, a, DISPUTE.out); trust(S, b, DISPUTE.out); shiftRel(S, a, b, -1);
      remember(S, a, -1, 'You stayed out of its quarrel over ' + S.dispute.topic + '.'); remember(S, b, -1, 'You stayed out of its quarrel over ' + S.dispute.topic + '.');
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
  function available(S) { return listActions(S, null); }
  /* only: an action id. Then only the part of the list that can hold it is built, so act() stays cheap with many powers. */
  function listActions(S, only) {
    const A = [];
    const oType = only ? only.split(':')[0] : null, oWho = only ? only.split(':')[1] : null;
    if (S.phase !== 'actions') return A;
    const spc = {};
    function sp(id, amt) { const k = id + ':' + amt; return spc[k] !== undefined ? spc[k] : (spc[k] = spillText(S, id, amt)); }
    function add(a) {
      if (a.ok === undefined) a.ok = true;
      if (a.ok && !has(S, a.cost)) { a.ok = false; a.why = 'Costs ' + costText(a.cost) + '.'; }
      A.push(a);
    }
    ORDER.forEach(function (id) {
      if (only && oWho !== id) return;
      const f = S.factions[id], d = FACTIONS[id];
      if (f.request) {
        const c = { inf: 1 }; c[f.request.res] = f.request.amount;
        const match = d.needs.some(function (n) { return n.res === f.request.res; });
        add({ id: 'answer:' + id, type: 'answer', f: id, label: 'Answer request: send 2 ' + cap(f.request.res), cost: c, hint: 'Trust +8' + (match ? ', and one of its needs improves' : '') + sp(id, 2) });
      }
      if (f.member && f.demand) {
        const dm = f.demand, claim = dm.kind === 'claim';
        const c = { inf: 1 };
        if (claim) c[dm.res] = dm.amount; else c.capital = dm.amount;
        const match = claim && d.needs.some(function (n) { return n.res === dm.res && f.pips[n.key] < 3; });
        add({ id: 'demand:' + id, type: 'demand', f: id, kind: dm.kind, res: dm.res, label: claim ? 'Grant its claim: send ' + dm.amount + ' ' + cap(dm.res) : 'Pay its budget share: ' + dm.amount + ' Capital', cost: c,
          hint: 'Trust +' + DEMAND_GAIN + '. Unmet, it costs ' + DEMAND_TRUST + ' trust' + (S.act === 3 && f.pledged ? '' : ' and a strain mark') + (match ? ', and one of its needs improves' : '') + sp(id, 2) });
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
        add({ id: 'aid:' + id + ':' + n.key, type: 'aid', f: id, need: n.key, label: 'Send aid: 2 ' + cap(n.res), cost: c, hint: 'Trust +5, ' + n.label + ' +1' + sp(id, 2), ok: f.pips[n.key] < 3, why: n.label + ' is fully met.' });
      });
      const pc = Object.assign({ inf: 1 }, d.pact.cost);
      add({ id: 'pact:' + id, type: 'pact', f: id, label: 'Sign ' + d.pact.name, cost: pc, hint: d.pact.effect + '. Trust +6' + sp(id, 4), ok: !f.pact && f.trust >= 40, why: f.pact ? 'Already signed.' : 'Needs trust 40.' });
      add({ id: 'counter:' + id, type: 'counter', f: id, label: 'Counter the Company', cost: { inf: 1, capital: 2 }, hint: 'Company grip -1, trust +3, blocks this season\'s deal', ok: f.grip > 0 || S.companyTargets.indexOf(id) >= 0, why: 'The Company has no hold here.' });
      if (!f.member) {
        const g = gaps(S, id);
        add({ id: 'invite:' + id, type: 'invite', f: id, label: 'Invite to the federation', cost: { inf: 1 }, hint: 'Joins at trust ' + JOIN_TRUST + ' with ' + JOIN_NEEDS + ' of 6 need points met' + sp(id, JOIN_SPILL[S.act]), ok: !g.length, why: 'Still needs ' + g.join(', ') + '.' });
      }
      const pl = planOf(S, id);
      if (pl) {
        const hurt = pl.harmed.length ? '. ' + pl.harmed.map(fname).join(' and ') + ' trust -4' : '';
        add({ id: 'back:' + id, type: 'back', f: id, label: 'Back its plan', cost: { inf: 1 }, hint: 'Done one season sooner. Trust +6' + hurt, ok: !f.plan.backed, why: 'You already backed this plan.' });
        add({ id: 'dissuade:' + id, type: 'dissuade', f: id, label: 'Talk it out of the plan', cost: { inf: 1 }, hint: 'Plan dropped. Trust -3', ok: f.trust >= 45, why: 'Needs trust 45 before it will listen.' });
      }
    });
    if (S.turn >= UNLOCK.relations && (!only || oType === 'broker')) PAIRS.forEach(function (p) {
      const a = p[0], b = p[1], r = rel(S, a, b), fa = S.factions[a], fb = S.factions[b];
      let ok = true, why = '';
      if (r >= 2) { ok = false; why = 'Already allies.'; }
      else if (fa.grip >= 3 || fb.grip >= 3) { ok = false; why = 'A rogue power will not come to the table.'; }
      else if (fa.trust < 40 || fb.trust < 40) { ok = false; why = 'Both must trust you at 40 to accept you as broker.'; }
      add({ id: 'broker:' + a + '|' + b, type: 'broker', a: a, b: b, rel: r, label: fname(a) + ' and ' + fname(b) + ': ' + REL_NAMES[r], cost: { inf: 1, capital: 2 }, hint: 'Broker talks. They move one step closer, and each trusts you 2 more', ok: ok, why: why });
    });
    if (!only || oType === 'project') Object.keys(PROJECTS).forEach(function (pid) {
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
    if (!only || oType === 'research') Object.keys(TECH).forEach(function (tid) {
      let ok = true, why = '';
      if (S.tech[tid]) { ok = false; why = 'Already researched.'; }
      else if (S.research) { ok = false; why = S.research === tid ? 'In progress. Ready next season.' : 'Your labs are busy until next season.'; }
      add({ id: 'research:' + tid, type: 'research', t: tid, label: 'Research ' + TECH[tid].name, cost: { inf: 1, capital: 3 }, ok: ok, why: why });
    });
    if ((!only || oType === 'callvote') && S.act === 3 && actSeason(S) >= ACTS[3].callFrom && S.voteCalled === null) {
      const np = pledges(S).length;
      add({ id: 'callvote', type: 'callvote', label: 'Call the ratification vote', cost: { inf: 1 }, hint: 'Held at the end of this season. It passes with ' + ACTS[3].goal + ' pledges.', ok: np >= ACTS[3].goal, why: 'Needs ' + ACTS[3].goal + ' pledges. You have ' + np + '.' });
    }
    return A;
  }

  function act(S, actionId) {
    const a = listActions(S, actionId).filter(function (x) { return x.id === actionId; })[0];
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
        const r = f.request.res; f.request = null; trust(S, a.f, 8); spill(S, a.f, 2); remember(S, a.f, 1, 'You answered its call for ' + r + '.');
        FACTIONS[a.f].needs.forEach(function (n) { if (n.res === r) pip(S, a.f, n.key, 1); });
        msg = 'You answered ' + fname(a.f) + '\'s call for ' + r + '. Trust +8.'; break;
      }
      case 'aid':
        trust(S, a.f, 5); pip(S, a.f, a.need, 1); spill(S, a.f, 2); remember(S, a.f, 1, 'You sent it aid.');
        msg = 'Aid convoy reaches ' + fname(a.f) + '. Trust +5.'; break;
      case 'pact': {
        f.pact = true; trust(S, a.f, 6); spill(S, a.f, 4); remember(S, a.f, 1, 'You signed its pact.');
        runEffects(S, FACTIONS[a.f].pact.does);
        msg = FACTIONS[a.f].pact.name + ' signed with ' + fname(a.f) + '.' + (FACTIONS[a.f].pact.msg || '');
        break;
      }
      case 'counter':
        f.grip = Math.max(0, f.grip - 1); f.countered = true; if (S.act === 1 || !f.member) trust(S, a.f, 3);
        msg = 'You exposed Company arms deals in ' + FACTIONS[a.f].seat + '. Its grip loosens.'; break;
      case 'invite':
        f.member = true; trust(S, a.f, 5); spill(S, a.f, JOIN_SPILL[S.act]);
        NEIGHBORS[a.f].forEach(function (o) { if (rel(S, a.f, o) <= -2 && !S.factions[o].member) remember(S, o, -1, 'You let its rival, ' + fname(a.f) + ', into the federation.'); });
        msg = fname(a.f) + (f.left !== null ? ' returns to the federation.' : ' signs the charter and joins the federation.');
        f.grievance = null; f.left = null; break;
      case 'demand': {
        const dm = f.demand; f.demand = null; trust(S, a.f, DEMAND_GAIN); spill(S, a.f, 2);
        if (dm.kind === 'claim') FACTIONS[a.f].needs.forEach(function (n) { if (n.res === dm.res) pip(S, a.f, n.key, 1); });
        S.stats.demandsMet += 1;
        msg = 'You met ' + fname(a.f) + '\'s ' + (dm.kind === 'claim' ? 'claim' : 'budget share') + '. Trust +' + DEMAND_GAIN + '.'; break;
      }
      case 'hear':
        addStrain(S, a.f, -1); trust(S, a.f, 3); remember(S, a.f, 1, 'You heard its grievances.');
        msg = 'You heard ' + fname(a.f) + '\'s grievances in ' + FACTIONS[a.f].seat + '. Strain -1.'; break;
      case 'pledge':
        f.pledged = true; trust(S, a.f, 3);
        msg = fname(a.f) + ' pledges to ratify the charter.'; break;
      case 'terms': {
        const w = weakestNeed(a.f, f);
        trust(S, a.f, 8); pip(S, a.f, w.key, 1); f.grievance = null; f.terms = true; S.stats.termsOffered += 1; remember(S, a.f, 1, 'You offered it fair terms.');
        msg = fname(a.f) + ' accepts accession terms. Its grievance is settled.'; break;
      }
      case 'callvote':
        S.voteCalled = S.turn;
        msg = 'You call the ratification vote for the end of ' + season(S) + ' ' + year(S) + '.'; break;
      case 'project': {
        S.projects[a.p] = true;
        const pj = PROJECTS[a.p];
        runEffects(S, pj.does); msg = pj.msg;
        if (pj.hurts && !S.tech[pj.spared]) { runEffects(S, pj.hurts); msg += pj.hurtMsg; pj.hurts.forEach(function (e) { if (e[0] === 'trust' && e[2] < 0) remember(S, e[1], -1, 'Your ' + pj.name + ' hurt it.'); }); }
        break;
      }
      case 'broker':
        shiftRel(S, a.a, a.b, 1); trust(S, a.a, 2); trust(S, a.b, 2);
        remember(S, a.a, 1, 'You brokered talks with ' + fname(a.b) + '.'); remember(S, a.b, 1, 'You brokered talks with ' + fname(a.a) + '.');
        S.factions[a.a].touched = S.factions[a.b].touched = true;
        msg = 'Talks succeed. ' + fname(a.a) + ' and ' + fname(a.b) + ' are now ' + REL_NAMES[rel(S, a.a, a.b)].toLowerCase() + '.'; break;
      case 'back': {
        const p = planOf(S, a.f);
        f.plan.backed = true; f.plan.eta -= 1; trust(S, a.f, 6);
        p.harmed.forEach(function (h) { trust(S, h, -4); remember(S, h, -1, 'You backed ' + fname(a.f) + '\'s plan against it.'); });
        remember(S, a.f, 1, 'You backed its plan.');
        msg = 'You put your name behind ' + fname(a.f) + '\'s plan. Trust +6.' + (p.harmed.length ? ' ' + p.harmed.map(fname).join(' and ') + ' notice whose side you took.' : '');
        if (f.plan.eta <= 0) { runEffects(S, p.does); S.plansDone[p.key] = true; f.plan = null; f.planWait = 2; msg += ' The plan is complete: ' + p.then; if (f.grip >= 3) msg += ' ' + fname(a.f) + ' goes rogue.'; }
        break;
      }
      case 'dissuade': {
        const p = planOf(S, a.f);
        f.plan = null; f.planWait = 2; trust(S, a.f, -3); remember(S, a.f, -1, 'You talked it out of its plan.');
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
      // the tally on the motion itself, the winning side first, and how you voted when you lost
      const tally = Math.max(yes, no) + ' to ' + Math.min(yes, no) + (passed ? '' : '. You voted ' + (opt === 'pass' ? 'for' : 'against') + ' it');
      if (chosen === 'pass') {
        S.passed[m.key] = m.f; S.stats.motionsPassed += 1; addStrain(S, m.f, -1);
        msg = 'The council passes ' + fname(m.f) + '\'s motion, ' + m.name + ', ' + tally + '.';
      } else {
        S.stats.motionsFailed += 1; addStrain(S, m.f, 1, 'the council voted down its motion on ' + m.short);
        msg = 'The council rejects ' + fname(m.f) + '\'s motion, ' + m.name + ', ' + tally + '. ' + fname(m.f) + ' strain ' + pf.strain + ' of ' + STRAIN_MAX + '.';
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
        const d = f.member ? -10 : -6; trust(S, id, d); remember(S, id, -1, 'You ignored its call for ' + f.request.res + '.');
        R.push({ g: 'unanswered', f: id, d: d, kind: 'bad', text: fname(id) + '\'s request went unanswered. Trust ' + d + '.' });
        f.request = null;
      }
    });
    // unmet demands
    ORDER.forEach(function (id) {
      const f = S.factions[id], dm = f.demand;
      if (!dm) return;
      f.demand = null;
      if (!f.member) return;
      trust(S, id, -DEMAND_TRUST); remember(S, id, -1, 'You left its ' + (dm.kind === 'claim' ? 'claim' : 'budget share') + ' unmet.');
      // a pledged member takes it out on its trust, not as a grievance: the pledge holds while trust stays at PLEDGE_KEEP
      const pledgedNow = S.act === 3 && f.pledged;
      if (!pledgedNow) addStrain(S, id, 1, dm.kind === 'claim' ? 'its claim for ' + dm.res + ' went unmet' : 'its budget share went unpaid');
      S.stats.demandsMissed += 1;
      // an unpaid share at strain 2 or more sends a member with no Company ties to the Company for the money
      const coPays = dm.kind === 'share' && f.strain >= 2 && f.grip === 0;
      if (coPays) f.grip += 1;
      const what = dm.kind === 'claim' ? 'claim for ' + dm.res : 'budget share';
      R.push({ g: 'unmet', f: id, d: -DEMAND_TRUST, kind: 'bad', text: fname(id) + '\'s ' + what + ' went unmet. Trust -' + DEMAND_TRUST + (pledgedNow ? '. Its pledge holds while its trust stays at ' + PLEDGE_KEEP + '.' : ', strain ' + f.strain + ' of ' + STRAIN_MAX + '.') });
      if (coPays) R.push({ g: 'copays', f: id, co: 'grip', kind: 'bad', text: fname(id) + ' takes the money from the Company instead. Company grip +1.' });
    });
    // drift
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member) {
        if (needTotal(S, id) >= JOIN_NEEDS) { if (S.act === 1) trust(S, id, MEMBER_DRIFT[1]); } else { trust(S, id, -2); R.push({ g: 'unserved', f: id, d: -2, kind: 'warn', text: fname(id) + ' feels the federation is not meeting its needs. Trust -2.' }); }
      } else if (!f.touched && f.trust > FACTIONS[id].trust) trust(S, id, -1);
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
        R.push({ f: id, fs: opp, d: -opp.length, kind: 'warn', text: fname(id) + ' hardens against the federation over ' + andList(opp.map(fname)) + '. Trust -' + opp.length + '.' });
      });
    }
    // powers advance their own plans
    ORDER.forEach(function (id) {
      const f = S.factions[id], p = planOf(S, id);
      if (!p) { if (f.planWait > 0 && S.turn >= UNLOCK.plans - 1) f.planWait -= 1; return; }
      if (f.grip >= 3) return;
      if (test(S, p.cancel)) {
        f.plan = null; f.planWait = 2;
        R.push({ g: 'plandrop', f: id, kind: 'good', text: fname(id) + ' drops its plan to ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + ': ' + p.endIf + '.' });
        return;
      }
      f.plan.eta -= 1;
      if (f.plan.eta <= 0) {
        runEffects(S, p.does); S.plansDone[p.key] = true; f.plan = null; f.planWait = 2;
        R.push({ g: 'plandone', f: id, kind: 'warn', text: fname(id) + ' completes its plan: ' + p.name.charAt(0).toLowerCase() + p.name.slice(1) + '. ' + p.then });
      }
    });
    // members that went rogue through a plan this season, including one you backed
    S.exits.splice(0).forEach(function (id) { R.push({ g: 'rogue', f: id, co: 'grip', kind: 'bad', text: fname(id) + ' goes rogue with Company arms and leaves the federation.' }); });
    // members who dislike each other quarrel in council
    PAIRS.forEach(function (p) {
      if (S.turn < UNLOCK.relations || !S.factions[p[0]].member || !S.factions[p[1]].member) return;
      const r = rel(S, p[0], p[1]);
      if (r < 0) { trust(S, p[0], 2 * r); trust(S, p[1], 2 * r); R.push({ g: 'quarrel', f: p[0], f2: p[1], d: 2 * r, kind: 'warn', text: fname(p[0]) + ' and ' + fname(p[1]) + ' quarrel in council. Trust ' + (2 * r) + ' each.' }); }
      else if (r > 0) { trust(S, p[0], 1); trust(S, p[1], 1); }
    });
    // the Company moves
    S.companyTargets.forEach(function (t) {
      const f = S.factions[t];
      const gained = f.trust - f.trustAtStart;
      if (f.countered) R.push({ g: 'blocked', f: t, co: 'blocked', kind: 'good', text: 'Your exposure of the arms deal blocked the Company in ' + FACTIONS[t].seat + '.' });
      else if (gained >= BLOCK_GAIN) R.push({ g: 'blocked', f: t, co: 'blocked', kind: 'good', text: fname(t) + ' turns the Company\'s agents away. Your goodwill outbid them.' });
      else {
        f.grip = Math.min(3, f.grip + 1);
        const stage = ['', 'takes Company money', 'is now a Company client', 'goes rogue with Company arms'][f.grip];
        R.push({ g: 'grip' + f.grip, f: t, co: 'grip', kind: 'bad', text: fname(t) + ' ' + stage + '.' });
        if (f.grip >= 3 && f.member) { leave(S, t, 'rogue'); R.push({ g: 'leaves', f: t, kind: 'bad', text: fname(t) + ' leaves the federation.' }); }
      }
    });
    // secession and walkouts
    ORDER.forEach(function (id) {
      const f = S.factions[id];
      if (f.member && f.trust < SECEDE_TRUST) {
        leave(S, id, 'secede'); f.grip = Math.min(3, f.grip + 1);
        if (S.act >= 2) { f.grievance = 'it no longer trusts the federation'; S.stats.secessions += 1; }
        R.push({ g: 'secede', f: id, kind: 'bad', text: fname(id) + ' secedes from the federation. Its hardliners turn to the Company.' });
      } else if (f.member && f.strain >= STRAIN_MAX) {
        leave(S, id, 'walkout'); f.grievance = f.lastStrain || 'its grievances went unheard'; S.stats.walkouts += 1;
        R.push({ g: 'walkout', f: id, kind: 'bad', text: fname(id) + ' walks out of the federation. Its grievance: ' + f.grievance + '.' });
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
        R.push({ g: 'withdraw', f: id, kind: 'bad', text: fname(id) + ' withdraws its pledge: ' + why + '.' });
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
    if (S.act !== actWas) ev.push({ k: 'act', act: S.act, text: 'Act ' + S.act + ', ' + ACTS[S.act].name + ', begins with ' + numw(members(S).length) + ' members.' });
    if (S.outcome) {
      if (S.outcome.pledges !== undefined) ev.push({ k: 'vote', n: S.outcome.pledges, fs: pledges(S), text: 'The ratification vote. ' + (S.outcome.pledges ? Numw(S.outcome.pledges) : 'None') + ' of ' + numw(ORDER.length) + ' ratify: ' + (S.outcome.title === 'Aman' ? 'Aman' : S.outcome.title.charAt(0).toLowerCase() + S.outcome.title.slice(1)) + '.' });
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
    const N = ORDER.length, all = numw(N);
    if (clients(S).length >= CO_WIN) return over(S, { result: 'loss', title: 'The Company wins', text: Numw(clients(S).length) + ' of ' + all + ' powers are now Company clients. Division pays, and the subcontinent stays divided.' }, R);
    if (S.act >= 2 && nm <= COLLAPSE_AT) return over(S, { result: 'loss', title: 'The federation breaks apart', text: 'Your partners have walked out. The federation is a name on paper.' }, R);
    if (S.act === 3 && (S.voteCalled === S.turn || as >= ACTS[3].len)) {
      const ps = pledges(S), n = ps.length, goal = ACTS[3].goal;
      const ev = { fs: ps.length ? ps : (members(S).length ? members(S) : ORDER.slice()), kind: n >= goal ? 'good' : 'bad', text: 'The charter goes to the vote. ' + n + ' of ' + all + ' powers ratify.' };
      R.push(ev); log(S, ev.text, ev.kind);
      const when = season(S) + ' ' + year(S);
      const short = 'The charter falls short, ' + n + ' of the ' + numw(goal) + ' it needed.';
      let o;
      if (n >= AMAN_AT) o = { result: 'win', title: 'Aman', text: (n >= N ? 'All ' + all : Numw(n) + ' of ' + all) + ' powers ratify the charter in ' + when + '. The subcontinent governs itself, by consent.' };
      else if (n >= goal) {
        const out = ORDER.filter(function (id) { return ps.indexOf(id) < 0; }), h = out[0], hf = S.factions[h];
        const rest = out.length > 1 ? ' and ' + numw(out.length - 1) + ' other' + (out.length > 2 ? 's' : '') + ' have not ratified yet, and the door stays open.' :
          hf.member ? ' has not pledged yet, and the door stays open.' : hf.grievance ? ' keeps its grievance, and the door stays open.' : ' stays outside, and the door stays open.';
        o = { result: 'win', title: 'The charter is ratified', text: Numw(n) + ' of ' + all + ' powers ratify the charter in ' + when + ': with you, ' + numw(n + 1) + ' of ' + numw(N + 1) + '. ' + fname(h) + rest };
      }
      else if (clients(S).length >= CO_WIN_VOTE) o = { result: 'loss', title: 'The Company wins', text: short + ' Company money bought the votes it lacked.' };
      else if (nm >= FRAGILE_AT) o = { result: 'partial', title: 'A federation without a charter', text: short + ' The federation survives as a loose alliance.' };
      else o = { result: 'loss', title: 'The federation breaks apart', text: short.slice(0, -1) + ', and the federation goes with it.' };
      o.pledges = n;
      return over(S, o, R);
    }
    if (S.act === 1) {
      if (nm >= ACTS[1].goal) return beginAct(S, 2, R);
      if (S.turn >= ACTS[1].max) return over(S, { result: 'loss', title: 'Still divided', text: 'Only ' + nm + ' of ' + all + ' powers joined you in ' + numw(ACTS[1].max / 4) + ' years. The warring-states era goes on.' }, R);
      return;
    }
    if (S.act === 2 && as >= ACTS[2].len) {
      if (nm >= ACTS[2].goal) return beginAct(S, 3, R);
      const short = ACTS[2].goal - nm;
      if (nm >= FRAGILE_AT) return over(S, { result: 'partial', title: 'A fragile federation', text: Numw(nm) + ' powers stand with you at the end of ' + year(S) + '. The federation holds, ' + numw(short) + ' short of the ' + numw(ACTS[2].goal) + ' a charter needs.' }, R);
      return over(S, { result: 'loss', title: 'The federation breaks apart', text: 'Only ' + numw(nm) + ' powers stand with you at the end of ' + year(S) + '. The federation is a name on paper.' }, R);
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
      // memory one step from coming due
      if (S.turn >= UNLOCK.memory - 1 && f.grip < 3) {
        const sc = memScore(S, id);
        if (sc === REPLY_AT - 1 && !(f.member && !f.strain)) t.push({ k: 'warm', tone: 'good', f: id, text: nm + ' is one favor from repaying you.' });
        if (sc === 1 - REPLY_AT) t.push({ k: 'grudge', tone: 'bad', f: id, text: nm + ' is one slight from hitting back.' });
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

  /* A season's events, grouped for reading. Events of the same group (g), tone, and trust change
     merge into one line that names every power, so fifteen rivals do not make a wall of sentences.
     Returns [{ g, kind, co, f, fs, d, res, text, head, items }] in order of first appearance. text names
     the powers; head counts them ("Three powers take Company money.") for a page that shows the names as
     chips. A line that stands alone keeps its own text and has no head. Reads its input only. */
  const DIGEST = {
    unanswered: function (l, d) { return 'Requests from ' + l + ' went unanswered. Trust ' + d + ' each.'; },
    unmet: function (l, d) { return 'Demands from ' + l + ' went unmet. Trust ' + d + ' each.'; },
    copays: function (l) { return l + ' take the money from the Company instead. Company grip +1 each.'; },
    unserved: function (l, d) { return l + ' feel the federation is not meeting their needs. Trust ' + d + ' each.'; },
    plandrop: function (l) { return l + ' drop their plans.'; },
    plandone: function (l) { return l + ' complete their plans.'; },
    rogue: function (l) { return l + ' go rogue with Company arms and leave the federation.'; },
    quarrel: function (l, d) { return 'Members quarrel in council: ' + l + '. Trust ' + d + ' each.'; },
    blocked: function (l) { return 'The Company is turned away by ' + l + '.'; },
    grip1: function (l) { return l + ' take Company money.'; },
    grip2: function (l) { return l + ' are now Company clients.'; },
    grip3: function (l) { return l + ' go rogue with Company arms.'; },
    leaves: function (l) { return l + ' leave the federation.'; },
    secede: function (l) { return l + ' secede from the federation.'; },
    walkout: function (l) { return l + ' walk out of the federation.'; },
    withdraw: function (l) { return l + ' withdraw their pledges.'; },
    ask: function (l) { return l + ' ask you for help.'; },
    claim: function (l) { return l + ' claim resources from the federation.'; },
    share: function (l) { return l + ' ask for their budget shares.'; },
    motion: function (l) { return l + ' table motions for the council.'; },
    planstart: function (l) { return l + ' start plans of their own.'; }
  };
  /* "A", "A and B", "A, B, and C". */
  function andList(n) { return n.length < 3 ? n.join(' and ') : n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1]; }
  function listNames(ids) { return andList(ids.map(function (id) { return FACTIONS[id].short; })); }
  function digest(list) {
    const out = [], at = {};
    (list || []).forEach(function (e) {
      const key = e.g && DIGEST[e.g] ? e.g + '|' + e.kind + '|' + (e.d || 0) : null;
      if (key && at[key] !== undefined) { out[at[key]].items.push(e); return; }
      if (key) at[key] = out.length;
      out.push({ g: e.g || null, kind: e.kind, co: e.co, items: [e] });
    });
    return out.map(function (x) {
      const e = x.items[0], fs = [];
      x.items.forEach(function (i) { [i.f].concat(i.f2 ? [i.f2] : []).concat(i.fs || []).forEach(function (id) { if (id && fs.indexOf(id) < 0) fs.push(id); }); });
      const one = x.items.length === 1;
      if (one) return { g: x.g, kind: x.kind, co: x.co, f: e.f, f2: e.f2, fs: fs, d: e.d, res: e.res, text: e.text, items: x.items };
      const names = x.g === 'quarrel' ? x.items.map(function (i) { return FACTIONS[i.f].short + ' and ' + FACTIONS[i.f2].short; }).join(', ') : listNames(x.items.map(function (i) { return i.f; }));
      const count = numw(x.items.length) + (x.g === 'quarrel' ? ' pairs' : ' powers'), head = DIGEST[x.g](count, e.d);
      return { g: x.g, kind: x.kind, co: x.co, f: null, f2: null, fs: fs, d: e.d, res: null, text: DIGEST[x.g](names, e.d), head: head.charAt(0).toUpperCase() + head.slice(1), items: x.items };
    });
  }

  root.Aman = {
    digest: digest,
    memScore: memScore, replyOf: replyOf, REPLY_AT: REPLY_AT, MEM_AGE: MEM_AGE,
    create: create, save: save, load: load, SAVE_V: SAVE_V, available: available, act: act, endSeason: endSeason, chooseCharter: chooseCharter,
    resolveCrisis: resolveCrisis, resolveDispute: resolveDispute, finishBattle: finishBattle, autoBattle: autoBattle, battleOptions: battleOptions, battleMove: battleMove, roundChance: roundChance, BT_ALLY: BT_ALLY, BT_ALLY_TRUST: BT_ALLY_TRUST, BT_REINF: BT_REINF, advise: advise, gates: gates, unlocked: unlocked, rel: rel, gaps: gaps, planOf: planOf, REL_NAMES: REL_NAMES, PAIRS: PAIRS, yields: yields, fightOdds: fightOdds, canJoin: canJoin, needTotal: needTotal,
    members: members, clients: clients, season: season, year: year,
    FACTIONS: FACTIONS, PROJECTS: PROJECTS, TECH: TECH, CHARTER: CHARTER, ORDER: ORDER,
    BLOCK_GAIN: BLOCK_GAIN, MAX_TURNS: MAX_TURNS, JOIN_TRUST: JOIN_TRUST, JOIN_NEEDS: JOIN_NEEDS,
    actInfo: actInfo, attention: attention, hardenedBy: hardenedBy, SECEDE_TRUST: SECEDE_TRUST, EXPECT_AT: EXPECT_AT, EXPECT_HIGH: EXPECT_HIGH, MEMBER_DRIFT: MEMBER_DRIFT, DEMAND_TRUST: DEMAND_TRUST, DEMAND_GAIN: DEMAND_GAIN, actSeason: actSeason, councilItem: councilItem, votePreview: votePreview, pledges: pledges, pledgeGaps: pledgeGaps, canPledge: canPledge, motionInfo: motionInfo,
    ACTS: ACTS, MOTIONS: MOTIONS, ARTICLES: ARTICLES, RATIFY_TRUST: RATIFY_TRUST, RATIFY_NEEDS: RATIFY_NEEDS, STRAIN_MAX: STRAIN_MAX, PLEDGE_KEEP: PLEDGE_KEEP,
    DISTRUST_VOTE: DISTRUST_VOTE, HEAR_COST: HEAR_COST, TERMS_COST: TERMS_COST, JOIN_SPILL: JOIN_SPILL,
    disputeOptions: disputeOptions, history: history, trustLine: trustLine,
    POWERS: POWERS, PLAYER: PLAYER, NEIGHBORS: NEIGHBORS, NEED_KEYS: NEED_KEYS, prospects: prospects, clientNeighbors: clientNeighbors,
    CO_WIN: CO_WIN, CO_WIN_VOTE: CO_WIN_VOTE, AMAN_AT: AMAN_AT, COLLAPSE_AT: COLLAPSE_AT, FRAGILE_AT: FRAGILE_AT, CO_TARGETS: CO_TARGETS,
    SCALE: { INF_BASE: INF_BASE, INF_PER: INF_PER, RES_PER: RES_PER, REQ_CAP: REQ_CAP, DEMAND_CAP: DEMAND_CAP, ASK_CAP: ASK_CAP, MOTION_CAP: MOTION_CAP, CO_TARGETS: CO_TARGETS, CO_GROW_AT: CO_GROW_AT,
      CO_SPREAD: CO_SPREAD, CO_WIN: CO_WIN, CO_WIN_VOTE: CO_WIN_VOTE, COLLAPSE_AT: COLLAPSE_AT, FRAGILE_AT: FRAGILE_AT, AMAN_AT: AMAN_AT, SHARE_BIG: SHARE_BIG, FIGHT_PER: FIGHT_PER, FOCUS: FOCUS }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Aman;
})(typeof window !== 'undefined' ? window : globalThis);

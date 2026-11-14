# Acts 2 and 3: spec

Status: proposed, not built. This spec turns the twelve-season prototype into a three-act game of 30 to 36 seasons. It is written for whoever implements it in `public/engine.js`. Every number is a starting value to tune with `tools/sim.js`. When this is built, move the rules into `docs/rules.md` and delete what this file no longer needs to say.

Scope: five powers, as today. Growing to more powers is a separate step.

## 1. Shape of the game

| Act | Name | Seasons | Goal to advance | Ends early when |
| --- | --- | --- | --- | --- |
| 1 | Neighbors | Up to 12 (seasons 1 to 12) | 3 members at the end of any season | The goal is met |
| 2 | Strain | Exactly 12 | 4 members when its last season ends | The federation collapses (1 member or none) |
| 3 | Charter | Up to 12 | 4 pledges when the ratification vote is held | You call the vote (from its 8th season) |

- Longest game: 12 + 12 + 12 = 36 seasons, nine years (2050 to 2058).
- Expected adviser game: Act 1 ends near season 9 (the current adviser reaches 3 members at a median of season 9, p10 7, p90 11, in 99% of games). Act 2 runs to about season 21. Act 3 ends between seasons 28 and 33.
- **Why the Act 1 goal drops from 4 to 3.** With five powers, a goal of 4 leaves only one power for Act 2 to grow into. A goal of 3 leaves two, and one of them is usually the rival of a member. That rivalry is the Act 2 puzzle.
- **Act 1 otherwise stays as it is:** same rules, same numbers, same staged introduction, same three charter questions at seasons 3, 6, and 9. The instant win at 4 members goes away. The partial result at season 12 becomes "advance to Act 2".

Terms used below:

- `as` is the act season: `S.turn - S.actStart[S.act] + 1`. The first season of an act is `as = 1`.
- "Member" means `f.member === true`.
- "Pledged" means `f.pledged === true` (Act 3 only).

## 2. Constants

Replace `MAX_TURNS = 12` with these. Keep `MAX_TURNS` exported, set to 36, as a hard bound only.

```js
const ACTS = {
  1: { name: 'Neighbors', max: 12, goal: 3 },   // max is an absolute season for act 1
  2: { name: 'Strain',    len: 12, goal: 4 },
  3: { name: 'Charter',   len: 12, goal: 4, callFrom: 8 }
};
const RATIFY_TRUST = 65;      // pledge gate
const RATIFY_NEEDS = 5;       // pledge gate, of 6 need points
const PLEDGE_KEEP = 58;       // a pledge is withdrawn below this trust
const STRAIN_MAX = 3;         // a member walks out at this much strain
const DEMAND_TRUST = 6;       // trust gained by granting, lost by ignoring
const HEAR_COST = { inf: 1, capital: 2 };
const TERMS_COST = { inf: 2, capital: 3 };
const DISTRUST_VOTE = 50;     // members below this trust vote against you (acts 2 and 3)
const JOIN_SPILL = { 1: 8, 2: 12, 3: 12 };   // spillover amount when a power joins
const CO_TARGETS = { 1: 1, 2: 2, 3: 3 };     // act 1 keeps today's "2 at 3 members" rule; act 3 uses 3 from as 2
const CO_IMMUNE = { 1: 55, 2: 60, 3: Infinity }; // members at or above this trust are not courted; nobody is immune from act 3, as 2
```

## 3. New state

### On `S`

| Field | Type | Start | Meaning |
| --- | --- | --- | --- |
| `act` | 1, 2, or 3 | 1 | Current act |
| `actStart` | `{1: 1, 2: null, 3: null}` | | Absolute season each act began |
| `agenda` | array | `[]` | Council items still to settle this season (see section 7) |
| `lastVotes` | array | `[]` | Every vote held this season, in order. `S.lastVote` stays as the last one for the UI. |
| `passed` | `{motionKey: powerId}` | `{}` | Member motions that passed |
| `voteCalled` | number or null | null | Season the ratification vote was called |
| `stats` | object | zeros | Counters for the sim: `walkouts`, `secessions`, `demandsMet`, `demandsMissed`, `motionsPassed`, `motionsFailed`, `pledgesLost`, `termsOffered` |

`S.council` (a season number) is replaced by `S.agenda[0]`. `S.escalated` stays.

### On each faction `f`

| Field | Type | Start | Meaning |
| --- | --- | --- | --- |
| `demand` | null or `{kind, res, amount}` | null | This season's claim or budget share. `kind` is `'claim'` or `'share'`. Due by season's end. |
| `strain` | 0 to 3 | 0 | Unanswered grievances. Members walk out at 3. Carries over if the power leaves. |
| `motion` | null or `{key, at}` | null | A motion it has tabled, and the absolute season of the council that votes on it |
| `motionIdx` | 0, 1, 2 | 0 | Next motion in its list. At 2 it has no more. |
| `left` | null or season | null | Season it last walked out or seceded |
| `grievance` | null or string | null | Its stated reason, shown on screen. Set on walkout, secession, and on being a holdout at the start of Act 3. Cleared when it rejoins or accepts terms. |
| `pledged` | bool | false | Has pledged to ratify (Act 3) |
| `terms` | bool | false | Has accepted accession terms (Act 3). Waives the rival gate for this power. |

## 4. Act transitions

All transitions happen at the end of `resolve`, never in the middle of a season. Remove `checkWin` from `act()`.

Add `checkEnd(S, R)` at the end of `resolve`, after the log is written. It runs these checks in order and stops at the first that sets `S.outcome` or changes the act:

1. **Company wins:** 3 or more Company clients (grip 2 or more). Any act. Unchanged.
2. **Collapse:** `S.act >= 2` and 1 member or none. Loss.
3. **Ratification vote:** `S.act === 3` and (`S.voteCalled === S.turn` or `as === 12`). Count pledges and set the outcome (section 10).
4. **Act 1 deadline or goal:** `S.act === 1`. If members are 3 or more, start Act 2. Else if `S.turn === 12`, loss.
5. **Act 2 end:** `S.act === 2` and `as === 12`. With 4 or more members, start Act 3. With 3, partial. With 2, loss.

**Starting an act** (`beginAct(S, n, R)`):

- `S.act = n; S.actStart[n] = S.turn + 1`.
- Push `{ fs: members(S), kind: 'good', text: ACT_START[n] }` onto `R` and log it.
- Act 3 only: every non-member with grip below 3 becomes a holdout. Set `f.grievance` from the first rule that matches, and push `{ f: id, kind: 'warn', text: name + ' holds out. Its grievance: ' + grievance + '.' }`:
  1. A rival (relation -2) is a member: `'its rival ' + rivalName + ' sits in the federation'`
  2. Grip 2: `'Company money pays its leaders'`
  3. Need points below 4: `'the federation has not met its ' + lowestNeedLabel.toLowerCase() + ' need'`
  4. Otherwise: `'it does not trust you yet'`

Then `startTurn` runs as usual and adds the act's intro to the briefing.

```js
const ACT_START = {
  2: 'Act 2 begins. Three powers stand with you. Now they want a say.',
  3: 'Act 3 begins. Four members stand with you. The charter goes to the powers.'
};
```

## 5. Act 2: Strain

Four mechanics, each built from an existing system.

### 5.1 Demands (from requests)

Members stop making requests. They make demands instead.

- **When:** every season from Act 2, `as = 1`, in `startTurn`, after requests and before the Company picks targets.
- **How many:** `Math.ceil(members / 2)`, plus 1 in a failed monsoon. Drawn at random from members with grip below 3 and no demand.
- **Kind, per draw:** if motions are unlocked (Act 2, `as >= 2`), the member has no pending motion, `motionIdx < 2`, and a council remains in Act 2 at least one season away, roll 25% motion. Otherwise 55% claim, 45% share. A failed monsoon's extra demand is always a claim.
- **Claim:** 3 of a resource. Pick the resource the way requests do: 70% its first unmet resource need, else random.
- **Share:** Capital, `2 + (members >= 4 ? 1 : 0)`.
- **Motion:** take `MOTIONS[id][f.motionIdx]`, increment `motionIdx`, set `f.motion = { key, at: nextCouncil }`. At most 2 motions per council. If 2 are already tabled for that council, the draw becomes a claim.

Requests now come only from non-members: `n = Math.min(nonMembers, 1 + (failed ? 1 : 0))`.

At the end of the season (resolution step 2), every claim or share still standing is unmet: trust -6, strain +1, `stats.demandsMissed += 1`, and the demand clears.

### 5.2 Strain and walkouts (from secession and the Company's grip steps)

Strain is a three-step track, the same shape as Company grip, so players already know how to read it.

| Raises strain by 1 | Lowers strain by 1 |
| --- | --- |
| An unmet claim or share | Hear its grievances (action) |
| Its motion is rejected in council | Its motion passes in council |
| You back the other side in a dispute between two members | |

- A member at strain 3 at the end of a season **walks out**: `member = false`, `pledged = false`, `left = S.turn`, `grievance` set to the reason for the last strain point (table below), `stats.walkouts += 1`. It does not gain Company grip. It is a spoiler, not a client.
- Secession at trust below 40 stays, and now also sets `left` and `grievance = 'it no longer trusts the federation'`, and `stats.secessions += 1`.
- **The way back in:** a power with strain above 0 has a fifth join gate, "Grievance heard". Hear its grievances until strain is 0, then invite it as usual.

| Last strain point came from | Grievance text |
| --- | --- |
| Unmet claim | `'its claim for ' + res + ' went unmet'` |
| Unmet share | `'its budget share went unpaid'` |
| Rejected motion | `'the council voted down its motion on ' + motion.short` |
| Dispute | `'you sided against it over ' + topic` |

Store the reason on the faction as `f.lastStrain` (a string) so the walkout can copy it.

### 5.3 Member motions (from charter votes)

Councils in Act 2 sit at `as` 3, 6, 9, and 12. Each votes on the motions tabled for it. A motion is a two-option council item, so `chooseCharter` resolves it with today's code.

| Option | Trust | Pips | Strain | Upkeep |
| --- | --- | --- | --- | --- |
| `pass`: "Pass it" | The motion's trust map, plus +8 to the proposer | The motion's pips | Proposer -1 | The motion's upkeep, while the proposer is a member |
| `reject`: "Reject it" | Proposer -8 | | Proposer +1 | |

Because a member votes yes when an option does not cost it trust, proposing `reject` loses only the proposer's vote, and proposing `pass` loses every member the motion hurts. That is the whole decision.

```js
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
```

- Trust deltas and pips apply to every power named, member or not, the same way charter options do today.
- Upkeep subtracts from `yields(S)` each season while `S.passed[key]` is set and its proposer is a member. It shows in the resource chips' "next season" numbers.
- If the proposer leaves before its council, drop the motion.
- On pass: `S.passed[key] = id; stats.motionsPassed += 1`. On reject: `stats.motionsFailed += 1`.

### 5.4 Votes against you (from charter votes)

From Act 2, each member's vote on your proposal follows these rules, first match wins. Apply them to every council item, including an Act 1 question that falls in Act 2.

| Rule | Vote | `why` code |
| --- | --- | --- |
| It proposed this motion | Yes on `pass`, no on `reject` | `proposer` |
| Company grip 1 or more | No | `company` |
| Trust below 50 and the option gives it less than +6 | No | `distrust` |
| The option costs it trust | No | `cost` |
| Otherwise | Yes | `gain` or `neutral` |

You still hold one vote and ties go your way. Put these rules in one function, `votePreview(S, optKey)`, and have `chooseCharter` call it, so the dialog and the result cannot disagree.

### 5.5 Rivals harden (from relations and spillover)

From Act 2, `as >= 3`:

- **Hardening:** in resolution, each non-member with grip below 3 loses 1 trust for every member it is Tense or Rival with.
- **Joining hurts more:** the spillover amount when a power joins rises from 8 to 12.
- **The Company preys on them:** `pickCompanyTargets` ranks by `trust - 5 * (members it is Tense or Rival with)` instead of plain trust.

### 5.6 The Company in Act 2

- Courts 2 powers a season from the first season of Act 2.
- Members are immune at trust 60, up from 55.
- Members with Company grip 1 or more vote against you in council (5.4).
- Everything else is unchanged, including the 3-client loss.

## 6. Act 3: Charter

### 6.1 Pledges (from the join gates)

A member pledges to ratify when you ask and all four pledge gates are open:

1. Trust at 65 or more.
2. 5 of its 6 need points met.
3. Company grip 0.
4. Strain 0.

At the end of every season (resolution step 9), a pledge is withdrawn if the power is no longer a member, trust is below 58, grip is 1 or more, or strain is 1 or more. Push `{ f, kind: 'bad', text: name + ' withdraws its pledge: ' + reason + '.' }` and add 1 to `stats.pledgesLost`. Reasons: `'it took Company money'`, `'its trust fell below 58'`, `'it carries a grievance'`, `'it left the federation'`.

Members keep making claims and shares in Act 3. Motions stop.

### 6.2 Articles (from charter votes)

Two last charter questions, voted like the Act 1 questions, with the Act 2 vote rules. Store them in `S.charter` with the Act 1 answers.

```js
const ARTICLES = {
  3: { key: 'revenue', title: 'How is federal revenue shared?', options: {
    equal:  { name: 'Equal shares',     text: 'Every member gets the same.',       trust: { indus: 6, himal: 6, coast: 2, ganga: -8 }, pips: { himal: ['food', 1] } },
    people: { name: 'By population',    text: 'Revenue follows the people.',       trust: { ganga: 8, delta: 4, indus: -6, himal: -6 }, pips: { ganga: ['industry', 1] } } } },
  6: { key: 'borders', title: 'Open borders or managed movement?', options: {
    open:    { name: 'Open borders',     text: 'Anyone may live and work anywhere.', trust: { coast: 6, delta: 4, ganga: 2, indus: -6 }, pips: { coast: ['trade', 1] } },
    managed: { name: 'Managed movement', text: 'Members set their own entry rules.', trust: { indus: 6, himal: 4, coast: -4 }, pips: { indus: ['autonomy', 1] } } } }
};
```

Keys are act seasons, not absolute seasons. These votes can knock a pledged member below 58, which is the point.

### 6.3 Holdouts and terms (pillar 2: enemies have grievances)

Every non-member at the start of Act 3 is a holdout with a stated grievance (section 4). A holdout is never a villain. The way back in is either the normal join gates or accession terms:

- **Offer accession terms**, once per power, from Act 3, `as >= 3`. Trust +8, its weakest need +1, grievance cleared, and `f.terms = true`, which waives the rival gate. It can then join beside its rival. The two will quarrel in council every season (today's quarrel rule), so terms trade one problem for another.

### 6.4 The Company goes all in

From Act 3, `as >= 2`:

- Courts 3 powers a season.
- Nobody is immune.
- Picks pledged powers first, lowest trust first, then everyone else by the Act 2 ranking.
- An unblocked deal raises grip by 1 as today, which withdraws the pledge at season's end (6.1). Blocking is unchanged: +10 trust in the season, or counter.
- If the ratification vote fails with 2 or more clients, the Company wins (section 10).

### 6.5 The ratification vote

- From Act 3, `as >= 8`, you may call the vote once you hold 4 pledges. It is held at the end of that season, after the Company moves and pledges are checked. Calling early is a bet that the Company cannot strip a pledge this season.
- If you have not called it, it is held at the end of Act 3, `as = 12`.
- Pledged powers ratify. Everyone else does not. 4 or more pledges win.
- Push `{ fs: pledgedIds, kind: pledges >= 4 ? 'good' : 'bad', text: 'The charter goes to the vote. ' + n + ' of five powers ratify.' }`.

## 7. Council agenda

Replace the single `S.council` with a queue, because an Act 1 question, two motions, and an article can land in the same season.

In `endSeason`, build `S.agenda` in this order and enter `phase = 'council'` if it is not empty:

1. The Act 1 charter question for `S.turn` (seasons 3, 6, 9), if unsettled. `{ kind: 'charter', key }`
2. Act 2 motions with `motion.at === S.turn`, proposers in `ORDER`. `{ kind: 'motion', f, key }`
3. The Act 3 article for `as` (3 or 6). `{ kind: 'article', key }`

`chooseCharter(S, optKey)` settles `S.agenda[0]`, pushes the vote onto `S.lastVotes`, sets `S.lastVote`, and shifts the queue. When the queue is empty it calls `resolve(S)`. Otherwise the phase stays `council`.

Export `councilItem(S)`, which returns the head of the agenda in one shape for the dialog and the sim:

```js
{ kind, key, f /* proposer, motions only */, title, text, options: { k: { name, text, trust, pips, upkeep, strain } } }
```

For motions, `title` is `fname(f) + ' tables a motion: ' + motion.name`. Add `f` to `S.lastVote` for motions so playback can spotlight the proposer.

## 8. New and changed actions

All new actions go through `available(S)` first. Each entry has `ok`, `why`, `cost`, and `hint`, as today.

### New

| id | type | When listed | Label | Cost | Hint | `ok` and `why` |
| --- | --- | --- | --- | --- | --- | --- |
| `demand:<id>` | `demand` | Member with a claim or share | Claim: `'Grant its claim: send 3 ' + Res`. Share: `'Pay its budget share: ' + n + ' Capital'` | Claim `{inf: 1, [res]: 3}`. Share `{capital: n}` | `'Trust +6. Unmet, it costs 6 trust and a strain mark'` plus `', and one of its needs improves'` when the claim matches a need, plus `spillText(S, id, 2)` | Cost check only |
| `hear:<id>` | `hear` | Act 2 or 3, and the power is a member or has strain | Hear its grievances | `{inf: 1, capital: 2}` | `'Strain -1, trust +3'` | `ok: f.strain > 0`, `why: 'It has no grievance to air.'` |
| `pledge:<id>` | `pledge` | Act 3, member, not pledged | Ask it to ratify | `{inf: 1}` | `'Pledges at trust 65 with 5 of 6 need points, no Company grip, and no strain'` | `ok` when all pledge gates are open, `why: 'Still needs ' + pledgeGaps.join(', ') + '.'` |
| `terms:<id>` | `terms` | Act 3, `as >= 3`, non-member, grip below 3, `!f.terms` | Offer accession terms | `{inf: 2, capital: 3}` | `'Trust +8, its weakest need +1'` plus `', and it will join beside its rival ' + rival` when a rival is a member | `ok: f.trust >= 35`, `why: 'Needs trust 35 before it will hear terms.'` |
| `callvote` | `callvote` | Act 3, `as >= 8`, vote not called | Call the ratification vote | `{inf: 1}` | `'Held at the end of this season. It passes with 4 pledges.'` | `ok: pledges >= 4`, `why: 'Needs 4 pledges. You have ' + n + '.'` |

Effects in `act()`:

- `demand`: pay, `trust +6`, claim adds the matching need point, `spill(S, id, 2)`, clear `f.demand`, `stats.demandsMet += 1`. Message: `'You met ' + name + '\'s ' + (claim ? 'claim' : 'budget share') + '. Trust +6.'`
- `hear`: `strain -1`, `trust +3`. Message: `'You heard ' + name + '\'s grievances in ' + seat + '. Strain -1.'`
- `pledge`: `pledged = true`, `trust +3`. Message: `name + ' pledges to ratify the charter.'` Log as `good`.
- `terms`: as in 6.3, `stats.termsOffered += 1`. Message: `name + ' accepts accession terms. Its grievance is settled.'`
- `callvote`: `S.voteCalled = S.turn`. Message: `'You call the ratification vote for the end of ' + season + ' ' + year + '.'`

### Changed

| Action | Change |
| --- | --- |
| `answer` | Only non-members make requests from Act 2 on, so this only appears for them. |
| `invite` | Gates add "Grievance heard" when strain is above 0. The rival gate is waived when `f.terms`. Spillover uses `JOIN_SPILL[S.act]`. On joining, clear `grievance` and `left`. |
| `canJoin`, `gaps`, `gates` | Match `invite`. In Act 3, `gates(S, id)` returns the pledge gates for members, so the map's gate dots keep working. Add `'no grievance'` and `'Company grip at zero'` gap phrases for pledges. |
| `resolveDispute` | From Act 2, if both powers are members, backing one gives the other strain +1. |
| Plans | A plan that has landed does not start again, except the three Company plans (`forts`, `arms`, `appeal`). Without this, a 36-season game repeats every plan five times. |
| Influence | Act 2: 4, or 5 with 4 or more members. Act 3: 5. Shortage still costs 1. |

## 9. Resolution order

`resolve(S)` becomes:

1. Ignored requests (non-members only from Act 2). Unchanged.
2. **Unmet demands.** Trust -6, strain +1. Event `{ f, d: -6, kind: 'bad', text: name + '\'s ' + what + ' went unmet. Trust -6, strain ' + s + ' of 3.' }`
3. Drift. Unchanged.
4. **Hardening** (Act 2 `as >= 3`, and Act 3). One event per hardened power: `{ f: id, fs: opposedMemberIds, d: -k, kind: 'warn', text: name + ' hardens against the federation over ' + names + '. Trust -' + k + '.' }`
5. Plans advance. Unchanged apart from the no-repeat rule.
6. Quarrels. Unchanged.
7. The Company moves. Unchanged, with Act 3 targeting.
8. Secession (trust below 40) and **walkouts** (strain 3). Walkout event: `{ f, kind: 'bad', text: name + ' walks out of the federation. Its grievance: ' + grievance + '.' }`
9. **Pledge checks** (Act 3).
10. Log `R` and set `S.lastResolution`.
11. `checkEnd(S, R)` (section 4). If the game is not over, `startTurn(S)`.

`startTurn` order, so the seeded random stream is fixed: research, income and monsoon, influence, per-faction reset (also clear `demand`), requests, **demands**, Company targets, plans, dispute. Demands use `S.rng` only from Act 2, so Act 1 games replay exactly as they do today up to the point the old game would have ended.

## 10. Outcomes

`S.outcome` gains `act` and, for the final vote, `pledges`. Titles and copy:

| Act | Condition | Result | Title | Text |
| --- | --- | --- | --- | --- |
| Any | 3 Company clients | loss | The Company wins | Three of five powers are now Company clients. Division pays, and the subcontinent stays divided. |
| 1 | Season 12 ends with 2 members or fewer | loss | Still divided | Only N of five powers joined you in three years. The warring-states era goes on. |
| 2 or 3 | 1 member or none at the end of a season | loss | The federation breaks apart | Your partners have walked out. The federation is a name on paper. |
| 2 | Act 2 ends with 3 members | partial | A fragile federation | Three powers stand with you at the end of YEAR. The federation holds, one short of the four a charter needs. |
| 2 | Act 2 ends with 2 members | loss | The federation breaks apart | Only two powers stand with you at the end of YEAR. The federation is a name on paper. |
| 3 | 5 pledges | win | Aman | All five powers ratify the charter in SEASON YEAR. The subcontinent governs itself, by consent. |
| 3 | 4 pledges | win | The charter is ratified | Four of five powers ratify the charter in SEASON YEAR. POWER has not pledged yet (a member), keeps its grievance (a non-member with one), or stays outside, and the door stays open. |
| 3 | 3 or fewer pledges, 2 or more clients | loss | The Company wins | The charter falls short, N of the four it needed. Company money bought the votes it lacked. |
| 3 | 3 or fewer pledges, 3 or more members | partial | A federation without a charter | The charter falls short, N of the four it needed. The federation survives as a loose alliance. |
| 3 | 3 or fewer pledges, 2 members or fewer | loss | The federation breaks apart | The charter falls short, N of the four it needed, and the federation goes with it. |

## 11. Staged introduction

Act 1 is unchanged (seasons 1 to 4). Each later system arrives one season apart, with a `kind: 'new'` briefing that carries `fs: members(S)`. Key `INTRO` by `act + ':' + as` from Act 2 on.

| When | Unlocks | Briefing text |
| --- | --- | --- |
| Act 2, as 1 | Demands, strain, hear | New this act: demands. Each season some members ask for resources or a budget share. Each unmet demand adds a strain mark. Three marks and the member walks out. |
| Act 2, as 2 | Motions, the new vote rules | New this season: motions. Members table motions for the next council. Members with Company money, or with trust below 50, vote against you. |
| Act 2, as 3 | Hardening | New this season: rivals harden. A power outside loses 1 trust each season for every member it is tense or rival with. |
| Act 3, as 1 | Pledges | New this act: pledges. A member pledges to ratify at trust 65 with 5 need points, no Company grip, and no strain. Four pledges ratify the charter. |
| Act 3, as 2 | Company all in | New this season: the Company goes all in. It courts three powers a season, pledged powers first, and none is immune. A pledged power that takes its money withdraws its pledge. |
| Act 3, as 3 | Terms | New this season: holdouts. Each power outside names a grievance. Offer terms to bring one in, even beside its rival. |
| Act 3, as 8 | Calling the vote | You may now call the ratification vote. It passes with four pledges. |

Extend `unlocked(S)` with `demands`, `motions`, `harden`, `pledges`, `allIn`, `terms`, and `callVote`, computed from `S.act` and `as`.

## 12. What the player sees

The rule from `CLAUDE.md` holds: a mechanic the player cannot see is a bug. Pictures first.

| Mechanic | Map or gauge | Elsewhere |
| --- | --- | --- |
| Acts and time left | The top `.track` splits into three labeled groups: Neighbors, Strain, Charter. Act 1 shows the seasons it actually took once it ends. Council seasons get a dot. Act 3 marks season 8, when the vote can be called. | `goal()` shows the current act's goal: "2 of 3 founding members", "4 of 4 members. Hold four for 7 more seasons", "3 of 4 pledges". |
| Act change | A title card dialog: act number, name, one line from `ACT_START`, three pictograms of what is new. The UI keeps a `seenAct` variable so the card shows once. | The `new` briefing. |
| Demands | A tag beside the member node, like today's request badge but square: the resource icon for a claim, the Capital icon for a share. | "Needs your attention" list. Suggestion arrows reach it like any action with `f`. |
| Strain | Three small marks under each member node, where non-members show gate dots. Filled marks use `--bad`. | A strain gauge in the dossier beside the need gauges. Tooltip: "Raised by unmet demands, rejected motions, and lost disputes. Lowered by hearing its grievances." |
| Walked out | The node's ring turns dashed. Tag: "Walked out". | Dossier shows the grievance in one line and the "Grievance heard" gate. |
| Motions | A scroll badge on the proposer's node with the seasons until its council, the same shape as the plan badge. | The council dialog. |
| Votes | The council dialog shows one seat per member as a small portrait, with a yes or no mark and a reason icon: the Company icon for a bought vote, a low trust ring for distrust. Data comes from `votePreview`, never from UI logic. | |
| Upkeep from motions | The resource chips' "next season" numbers already include it. | The charter view lists passed motions with their upkeep icons. |
| Hardening | The Tense or Rival line between a non-member and a member gets thicker and pulses once per playback event. No pulse under reduced motion. | Floating "-1" during playback, from the event's `d`. |
| Pledges | A seal on the node, reusing the treaty seal drawing. In Act 3 the dots under member nodes are the pledge gates. | `goal()` shows five seal slots. |
| Holdouts and terms | Tag "Holdout" on the node. | Dossier shows the grievance and the terms button. |
| Company all in | The offshore Company base gains a ship per act: one, two, three. Agents appear on up to three nodes, as today. | |
| Ratification vote | The outcome dialog shows five seals in a row, signed or blank, before the text. | |

Both color themes: new marks use existing tokens only (`--bad`, `--company`, `--accent`, `--muted`). The title card and ship changes respect `prefers-reduced-motion`.

Text to change in `index.html`:

- Start dialog: "It is 2050. You lead the Deccan Compact. Bring three powers into your federation within twelve seasons. Then hold it together, and win a charter."
- Abandon dialog: replace "season X of 12" with the act and act season, from `actInfo`.
- Charter view: list the three Act 1 questions, passed motions, and the two articles.

## 13. The adviser

`advise(S)` drives both the in-game council and the sim bot. New and changed scores:

| Action | Score | Why text |
| --- | --- | --- |
| `pledge` | 100 | Every ratification gate is open. It will pledge now. |
| `callvote` | 95 when 4 or more pledges would survive this season: pledges minus pledged Company targets not yet blocked is 4 or more. Else 0. | Four pledges stand and the Company cannot reach enough of them this season. |
| `counter`, Act 3, pledged target not yet blocked | 72 | The Company is after a pledge. Without a counter, it is withdrawn. |
| `hear`, member at strain 2 | 58 | One more grievance and it walks out. |
| `demand` | 46, +10 at strain 2, +4 below trust 55. A share that would leave less than 3 Capital: -16. | A member asked. Unmet, it costs 6 trust and a strain mark (now N of 3). |
| `terms` | 50 if it opens a gate (a rival is inside, or the need point brings it to 4), else 15 | Terms settle its grievance and let it join beside its rival. |
| `hear`, non-member that walked out, needs at 4 or more | 40 | Hear it out and it can rejoin. |
| `counter`, Act 2 or 3, member with grip 1 | 40 | Company money buys its council vote. |
| `envoy`, Act 3, member not pledged, needs at 5, trust below 65 | 25 | Its needs are met. Only trust stands between it and a pledge. |
| `aid`, Act 3, member with needs below 5 | 18 | Raises one of its needs. It has N of the 5 a pledge wants. |
| `hear`, member at strain 1 | 20 | Clears a strain mark before it grows. |
| `research` | Today's scores while `S.turn <= 8` or `S.act === 2` | Unchanged |

All other scores stay as they are. Today `envoy` scores 0 for members; that changes only for the Act 3 case above.

## 14. Sim targets and reporting

### Bots

- `greedy`: the adviser's first suggestion, as today.
- `random`: any legal action, as today.
- `neglect` (new): the adviser's first suggestion, but it never takes `demand`, `hear`, or `counter`. This is the bad play the Company and strain must punish.

Council choices: `greedy` and `neglect` keep today's score over `councilItem(S).options`. `random` picks at random. Replace `A.CHARTER[S.council]` with `A.councilItem(S)`.

### Targets over 2,000 games each

| Bot | Target |
| --- | --- |
| `greedy` | Win (either win title) 50 to 60%. "Aman" 5 to 15%. Partial 25 to 40%. Loss 10% or less. Fails Act 1 2% or less. Company wins 3% or less. |
| `greedy` | Average season ended 29 to 34. Median Act 2 start 8 to 10. Walkouts 0.3 to 1.0 per game. Demands met 70 to 90%. |
| `random` | Win under 0.5%. Reaches Act 2 under 3%. |
| `neglect` | Company wins 15 to 35%. Win under 15%. At least 1 walkout per game that reaches Act 2. |

### Tuning knobs, in the order to try

1. Greedy wins too often: raise `PLEDGE_KEEP` to 60, or raise demands to `members - 1` per season.
2. Greedy wins too rarely: lower `RATIFY_NEEDS` to 4, or start Act 3 Company targeting at 2 a season.
3. Neglect rarely loses to the Company: raise `CO_TARGETS[2]` to 3, or make an unmet share also raise Company grip by 1 at strain 2.
4. Games run short: move `callFrom` to 10.

### Report

`tools/sim.js` prints, per bot:

```
greedy  win 56.1% (Aman 9.2%, ratified 46.9%)  partial 33.0%  loss 10.9%
        by act: 1 1.0%  2 18.4%  3 80.6%   company 1.2%
        seasons: avg 31.4  median 32  p10 27  p90 35   act2 starts median 9  act3 starts median 21
        members at end 3.9  pledges at vote 3.8  walkouts/game 0.6  demands met 82%  motions passed 61%
```

- Tally key: `act + ':' + result + ':' + title`.
- Season ended is `S.turn`. Act starts come from `S.actStart`.
- Counters come from `S.stats`.
- Accept `node tools/sim.js 500` to run fewer games. At 2,000 games and three bots, expect about 10 seconds.
- Keep the one-game trace at seed 42, printing each act change and the outcome.

## 15. Exports to add

`actInfo(S)` returns `{ act, name, as, len, start, end, seasonsLeft, goal: { kind: 'members' | 'pledges', need, have } }`, where `end` is the act's last absolute season (12 for Act 1). The UI uses it for the track, the goal block, and the dialogs.

Also export: `councilItem`, `votePreview`, `pledges(S)` (pledged ids), `actSeason(S)`, `ACTS`, `MOTIONS`, `ARTICLES`, `RATIFY_TRUST`, `RATIFY_NEEDS`, `STRAIN_MAX`.

## 16. Build order

1. Engine: acts, `checkEnd`, agenda, `councilItem`, `votePreview`. Run the sim: greedy should now reach Act 2 in about 99% of games.
2. Engine: Act 2 (demands, strain, motions, hardening). Sim with `neglect`.
3. Engine: Act 3 (pledges, articles, terms, Company all in, the vote). Tune to section 14.
4. UI: track, goal block, title card, then per-mechanic visuals in the order of section 12.
5. `tools/smoke_test.py`: play to the end of Act 3 and handle the generic council dialog. Then look at the page in both themes.
6. Update `docs/rules.md`, the baseline in `CLAUDE.md`, and the backlog item "The Company does not win outright".

## 17. Sensitivity check

- No power is a villain in Acts 2 or 3. Every walkout and holdout shows a stated grievance the player caused or inherited, and each has a way back: hear it, or offer terms.
- Member motions are ordinary federal bargains (water, seats, prices, ports). None names a people, faith, or language. Language policy stays out of the charter until regional reviewers are involved.
- The Company is still the only antagonist, and its last push is against consent itself.
- The best ending is called "Aman" and is reached only when all five powers sign. Four of five keeps the door open for the fifth.

## 18. As built: deviations and results

Built in `public/engine.js` and `tools/sim.js`. Rules now live in `docs/rules.md`. Deviations from the sections above:

- **Budget shares cost 1 Influence in Acts 2 and 3**, and the Capital amount grows by 1 for every 10 Capital in your treasury. By Act 2 the player held 30 to 80 Capital, so a Capital-only share was a free +6 trust click. Average Capital at the start of Act 3 fell from 68 to 39, and at game end from 57 to 13.
- **The plan no-repeat rule applies from Act 2 only.** Applied from season 1 it changed some Act 1 games at season 11. With it gated, Act 1 replays the old engine exactly (checked on 500 seeds, step by step, until the act changes).
- **`ACT_START` text uses the real member count** ("Four powers stand with you" when four joined in Act 1).
- **A walkout does not clear `pledged` itself.** The pledge check in the same resolution clears it and posts "withdraws its pledge: it left the federation", so the reason is visible.
- **Holdout grievance, rule 4:** a power that walked out keeps its walkout grievance instead of "it does not trust you yet".
- **"Grievance heard" gate** shows from Act 2 for a non-member with strain above 0 or one that walked out (`f.leftHow === 'walkout'`), so a walked-out power shows the gate after it is cleared too. `leave()` records how a power left: walkout, secede, or rogue. Only a walkout is labeled "Walked out".
- **Company immunity in Act 3, season 1** is 60, as in Act 2. Nobody is immune from season 2.
- **Adviser additions,** needed to reach the targets: a demand from a pledged member scores +20; in Act 3, `hear` scores 45 and `counter` 65 when strain or Company grip is a member's only remaining pledge gate; `callvote` treats a pledged member with an open demand as at risk, and waits until act season 10 while a fifth member is one gate from pledging.
- **Old UI compatibility:** `S.council` is kept and still indexes `Aman.CHARTER`. Motions and articles are registered as hidden entries `CHARTER['motion:<key>']` and `CHARTER['article:<key>']`, so the current dialog keeps working. New UI should use `councilItem(S)` and `votePreview(S, opt)`.
- A fallback ending at season 36 exists as a guard. It cannot be reached by the rules above.

- **Member trust decays from Act 2** (review fix). Members sat at the 100 ceiling, so every trust threshold in Acts 2 and 3 did nothing. Now a member with its needs met loses 1 trust a season, or 4 above trust 70. A granted demand gives +2 trust (was +6; an unmet one still costs 6). Countering the Company gives a member no trust from Act 2. Average member trust at the start of Act 3 fell from 98 to 77.
- **Council votes are contestable from Act 2** (review fix). Ties go against you. A member with strain votes no on an option that gains it nothing. The distrust rule has no +6 exception. Proposals that fail rose from 8 of about 11,600 Act 2 and 3 items to 536 of about 13,000. Forcing "reject" on every motion now drops the adviser from 58% to 27% wins (it was 55% to 50%).
- **Pledged members and unmet demands** (review fix): in Act 3 a pledged member loses 6 trust but gains no strain mark, so its pledge falls through the trust gate. `PLEDGE_KEEP` is 62 (was 58). Pledges lost per game fell from 2.51 (97% "it carries a grievance") to 0.39 (98% "its trust fell below 62").
- **Act 3 Influence is 6** (was 5), paying for the share cost above.
- **An unpaid budget share from a member at strain 2 or more** with no Company grip raises its grip by 1. This keeps neglect's Company wins in range after the other changes.
- **The adviser sends an envoy** to a member within 6 trust of seceding (score 55) or a pledged member within 6 of `PLEDGE_KEEP` (score 50).
- **The random bot is seeded** from the game seed, so `tools/sim.js` repeats exactly.

Sim results, 2,000 games per bot, after the review fixes:

| Measure | Target | Before | After |
| --- | --- | --- | --- |
| greedy win | 50 to 60% | 55.1% | 58.1% |
| greedy Aman | 5 to 15% | 7.5% | 6.8% |
| greedy partial | 25 to 40% | 43.4% (miss) | 40.5% (miss by 0.5) |
| greedy loss | 10% or less | 1.4% | 1.4% |
| greedy fails Act 1 | 2% or less | 1.1% | 1.1% |
| greedy Company wins | 3% or less | 0.4% | 0.1% |
| greedy average season ended | 29 to 34 | 30.2 | 29.6 |
| greedy median Act 2 start | 8 to 10 | 10 | 10 |
| greedy walkouts per game | 0.3 to 1.0 | 0.12 (miss) | 0.12 (miss) |
| greedy demands met | 70 to 90% | 86% | 84.8% |
| random win | under 0.5% | 0% | 0% |
| random reaches Act 2 | under 3% | 2.4% | 2.8% |
| neglect Company wins | 15 to 35% | 18.1% | 19.0% |
| neglect win | under 15% | 0% | 0% |
| neglect walkouts per Act 2 game | at least 1 | 3.4 | 3.1 |

The remaining misses: the greedy bot loses almost never (1.4%), so win and partial share about 98.6% between them, and the window where both meet their targets is about one point wide. `EXPECT_AT` 71 gives 61.5% win and 37.1% partial; 70 gives 58.1% and 40.5%. Walkouts stay rare because the adviser hears a member at strain 2 almost every time.

### UI as built

Built in `public/index.html` from section 12. Departures:

- **Track:** the three act groups share the top bar's width, so 36 bars fit at phone width. Seasons of acts not yet started have no monsoon height, because their start is unknown.
- **Motion badge** sits above the node, not beside it, because the northern nodes are close together on the real map.
- **Strain marks** sit under member nodes in Act 2. In Act 3 the pledge gate dots take that row, and strain marks show in a second row only when strain is above 0.
- **Council seats** show each member's portrait with a yes or no mark and a reason badge: the Company flag, a low-trust ring, a scroll for the proposer, or the trust change. All from `votePreview`.
- **Title card** shows after the season playback ends, before any dispute dialog.
- **Map layering (review fix):** power names, river names, and your own label draw in a layer above the suggestion arrows and rails, and the numbered suggestion badges draw above that. The Gangetic Union's gate dots sit to its west and the Himalayan Accord's gate dots and strain marks sit to its east, under its name. The Himalayan pledge check is nudged off the Gangetic node. The Ganges label moved west of Patna and the Brahmaputra label to 91.0E, and the Brahmaputra draws as a full river.
- **Territory glows (review fix):** each glow is a circle centered on the power's node, 1.6 to 2.4 degrees across in radius, so it reads as a sphere of influence and never traces a present-day country (`GLOW_R` in `tools/build_map.py`).
- **Member dossier (review fix):** "What keeps it in" shows the exit rules (trust 40, not rogue, strain below 3), not the joining gates, and says how members' trust decays.
- **Fixed in passing:** the hover detail box in the dossier changed height on hover, which shifted the page under the pointer and made buttons jitter. It now has a fixed height. This was also the cause of the old smoke test click timeouts.

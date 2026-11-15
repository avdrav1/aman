# The battle layer

Scope and plan for the real-time battle layer, agreed November 2026. M0 (the engine plumbing) and M1 (a greybox battle at a dam) are built. M2 to M4 are not.

## What is built (M1)

- **Entry:** a rogue crisis offers **Defend the towns**, which opens a choice: **Fight it** (the battle screen; needs a screen 760 px wide) or **Auto-resolve** (`fightOdds`, one roll). `resolveCrisis(S, 'battle')` draws the battle's seed from `S.rng`; the auto path draws nothing extra, so the sim is unchanged.
- **`public/battle.js`** (`window.AmanBattle`): the rules, deterministic at 10 ticks a second. `setup(ctx)`, `command(B, cmd)`, `step(B)`, `available(B)`, `canPlace`, `result(B)`, `waves(B)`, `bot(B)`, `simulate(ctx)`.
- **The field:** 960 by 600. A river with two crossings, the Dam and a Ford. Your bank is the west; the Company enters from the east at two points.
- **Yours:** Depot (trains engineers), Dam, Town; 2 engineers and 2 guards to start; supply `35 + 30 x odds`, plus 1 a second and a bounty per Company unit stopped.
- **Buildings:** Barricade (10, blocks ground units), Watchtower (25, range 150, strong against drones), Workshop (30, trains guards and interceptors). Engineers build what you place, then repair.
- **Units:** Guard (15, holds a point, cannot hit drones), Interceptor (20, ranged, strong against drones), Engineer (10).
- **The Company:** 8 waves from 45 s to 355 s: drones (fly straight at the dam or town), contractors (cross at the dam or the ford, fight what they meet), and a convoy in the last wave. Numbers scale by `1.55 - odds`.
- **Win or lose:** win when every wave is stopped (about 6.5 minutes). Lose if the Depot falls or the Company takes the Dam. The Town's damage is reported, for M2's conduct score.
- **The screen (`public/battle-ui.js`, `window.AmanBattleUI`):** a how-to card, then the field on a canvas with gauges for the Dam, Depot, and Town, wave pips, supply, pause (Space) and 1x or 2x. Q, W, E place buildings. Click or drag to select troops, click to move them. A result card reports time, Dam, Town, and losses; Continue calls `finishBattle`.
- **Bot and sim:** `tools/sim.js` plays the battle bot at four odds. Today: 2% at 45% odds, 67% at 60%, 85% at 75%, 100% at 95%. Steeper than the odds; M4 calibrates it.
- **Smoke test:** opens the battle screen, places a watchtower by key and click, pauses, lets the bot finish, and continues. A crisis battle met in a random game is played out by the bot.

## Open questions from M1

- Does a 6 to 7 minute battle feel right inside a 33-season campaign? Only playing it will tell.
- Winning still costs trust with the rogue power (-6) and everyone else (-2) unless you have civil defense. M2's conduct score is meant to replace that.
- The dam usually ends badly damaged even in a win. Is holding it too hard, or is that the right tension?
- Is the 760 px minimum right? Below it, only auto-resolve is offered.

## Context

Avniel asked how we might build real-time battles for dispute resolution, fought against the Company or Company-controlled powers. `docs/design.md` has always planned a rare, ten-minute, StarCraft-style base-defense layer: "Hold a dam, protect a relief corridor, break the siege of an ally". So far every battle is one dice roll, `fightOdds` in `resolveCrisis` (`public/engine.js:875`, `:1078`).

Decisions made in this conversation:
- **Opponent: Company forces only.** You never fight a power. Neighbors are never villains. A rogue power's people are civilians to protect, not targets.
- **Fidelity: a mini base-builder, 5 to 10 minutes.** You get a small base, a resource, building, and units, then hold against Company waves.

Measured today, with the adviser bot over 300 games:
- Rogue crises: 1.6 per game. 76% of games have one.
- The bot almost never fights (0.03 per game). It pays 4 Capital to "address" instead.
- Disputes: 8.6 per game.

The design targets one battle every 5 to 10 seasons, which is 3 to 6 in a 33-season game. Crises alone give too few, and disputes alone give too many.

## When a battle happens (both are Company acts)

1. **A rogue crisis, "Defend the border".** Company contractors strike from a rogue power's land. The rogue power has a grievance, and its people are not the enemy. This replaces the dice roll. Also fix the known copy bug: "raiding across your border" fires even for distant powers. Use "raiding federation towns" or similar.
2. **A Company sabotage of a disputed site.** This fires when a dispute's pair includes a power with Company grip of 1 or more:
   - Company contractors move to seize the thing being disputed: a dam, a port, or a grid line.
   - You defend it alongside both disputants.
   - Winning together raises their relation by one step and settles the dispute. This is how a battle settles a dispute without picking a side.
   - It's capped at one per act, so a game has about 2 to 4 battles in total.

Every battle offers **Auto-resolve**, which uses today's `fightOdds`. That's the path for the sim, for phones, and for players who don't want to fight.

## The battle (a 5 to 10 minute base-builder)

- **Field:** a small top-down map drawn from the real site:
  - a river and dam;
  - a coast and port;
  - a rail or relief corridor.
  
  It uses abstract shapes, no ethnic or religious markers, and colors from the CSS tokens.
- **Your base:**
  - a Depot (lose it and you lose the battle);
  - the Site you came to protect;
  - a Town of civilian tokens.
- **Resource:** Supply, which trickles in. Strategic resources carry in:
  - Capital adds starting Supply.
  - Energy speeds up building.
  - Food speeds up relief.
- **Buildings,** weighted to defense and non-lethal options, as the design's "Defense doctrine" asks:
  - Barricade;
  - Watchtower (counters drones);
  - Jammer (disables drones, non-lethal);
  - Shelter (protects civilians);
  - Workshop (makes units).
- **Units:**
  - Guard (holds a point);
  - Engineer (builds and repairs);
  - Relief (escorts civilians to shelter);
  - Interceptor (fights drones).
- **Allies:** each member that borders the site and trusts you above a threshold sends a squad in its own hue. This is "diplomacy decides who fights beside you". Common defense in the charter and civil defense doctrine (`S.charter.defense`, `S.tech.civil`) add a starting building or unit.
- **The Company:**
  - waves of drones, contractor squads, and an armored convoy;
  - a Forward Post that you can cut off to end the fight early. This is the design's remedy: "cut the funding and supply routes".
- **Win and loss:**
  - Win by holding through the waves (about 6 minutes) or by cutting the Forward Post.
  - Lose if the Depot falls.
- **Conduct:** protecting civilians and the Site changes trust afterward. This keeps "conduct counts" from the design:
  - civilians sheltered;
  - Site integrity;
  - collateral damage.
  
  Enemy units are machines and contractors. The battle never depicts people being killed.
- **Controls:**
  - select and command by click;
  - pause with Space, which lets you give orders while paused;
  - 1x and 2x speed.
  
  With reduced motion, there's no shake and effects are simpler. Desktop comes first. At phone width, it offers auto-resolve.

## Architecture (keeps CLAUDE.md's rules)

- **`public/battle.js`** is new. It holds the battle rules and has no DOM. It runs as `window.AmanBattle` and in Node via `require`, like `engine.js`.
  - It uses a deterministic fixed tick of 10 per second, seeded with one draw from `S.rng`.
  - API:
    - `setup(S, ctx)` returns the battle state `B`;
    - `command(B, cmd)`;
    - `step(B)`;
    - `result(B)`;
    - `bot(B)` returns commands for the sim and tests;
    - `available(B)` lists the legal commands, mirroring `Aman.available`.
- **`public/engine.js`:**
  - new phase `'battle'` with an `S.battle` context: kind, site, ally squads, and carry-over;
  - `resolveCrisis(S, 'fight')` and a new dispute option enter that phase;
  - `Aman.finishBattle(S, result)` applies the outcome, reusing the trust and grip effects in `resolveCrisis`, plus conduct;
  - `Aman.autoBattle(S)` keeps the `fightOdds` path;
  - every result event carries `f` or `fs`, so playback can spotlight it.
- **`public/battle-ui.js`** is new. It holds the canvas renderer and input. `index.html` is already about 2,000 lines, so the battle gets its own file. It's loaded by `index.html` and opens as a full-screen layer while the phase is `'battle'`. It reads colors from the CSS tokens, so both themes work.
- **`tools/sim.js`** keeps auto-resolve, so the balance baseline doesn't move. A new check plays `battle.js` with its own bot and confirms the bot's win rate stays close to `fightOdds` for the same setup. That keeps the two paths fair to each other.

## Milestones (stop and playtest after each)

| # | What | Size | Answers |
| --- | --- | --- | --- |
| M0 | Engine plumbing: the `'battle'` phase, `finishBattle`, `autoBattle`, and the crisis entering a battle. A placeholder screen with Win and Lose buttons. | 1 day | Does the campaign flow survive a battle phase? Sim unchanged. |
| M1 | Greybox battle on one site (a dam): Depot, Site, Town, 3 buildings, 3 units, drone and squad waves, win and loss. | about 1 week | **Is a 5 to 10 minute fight fun here?** If not, fall back to an animated auto-resolve. |
| M2 | Carry-over: resources, ally squads, doctrine. Conduct scoring into trust. The Company Forward Post. | 3 to 4 days | Does diplomacy visibly change the fight, and the fight change diplomacy? |
| M3 | Port and corridor sites. The dispute-sabotage trigger. Fix the crisis copy. | 3 to 4 days | Does fighting beside two disputants feel like settling their dispute? |
| M4 | Polish, the bot-versus-`fightOdds` check, smoke test coverage, docs. | 2 to 3 days | Ready for playtesters. |

Before any public build, battles need the same regional review as the rest. Combat imagery on real places is the most sensitive content in the game.

## Files

- New: `public/battle.js`, `public/battle-ui.js`.
- Changed:
  - `public/engine.js` (phase, context, finish and auto, the dispute trigger);
  - `public/index.html` (script tags, the entry dialog with the Fight or Auto-resolve choice, the result scene);
  - `tools/sim.js`;
  - `tools/smoke_test.py`.
- Docs:
  - `docs/battle.md` (new);
  - `docs/rules.md`;
  - `docs/backlog.md`;
  - `CLAUDE.md` (file table, architecture rule for `battle.js`, run notes).

## Verification

- `node tools/sim.js`: the adviser bot stays at about 54% win with auto-resolve. The new check shows the battle bot's win rate within about 10 points of `fightOdds` across setups.
- A Node determinism test: the same seed and the same commands give the same `result(B)`.
- `python3 tools/smoke_test.py`:
  - force a crisis;
  - play one battle with `AmanBattle.bot` driving commands through the UI;
  - check that the result applies and that there are no console errors;
  - check that auto-resolve works at phone width.
- Look at it: screenshots in both themes and with reduced motion. Avniel plays M1 by hand. Timing has to be judged by eye.

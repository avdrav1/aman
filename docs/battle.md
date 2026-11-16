# The battle layer

A battle is always against Company forces, never a power. It plays out on the campaign map in up to three rounds. There is no separate battle screen.

## History

- **November 2026, the plan:** a 5 to 10 minute real-time base-builder against Company forces only. M0 (the `'battle'` phase) and M1 (a greybox battle at a dam, `battle.js` and `battle-ui.js`) were built and deployed.
- **The M1 playtest:** Avniel "didn't like the battle screen at all." The screen didn't look like the rest of the game, half the field sat empty, and the units were tiny. It asked for six minutes of real-time micro, and none of the campaign's choices changed the fight.
- **The decision:** of four options (reskin the same battle, a short tower defense, a decision scene on the campaign map, or animated auto-resolve only), Avniel chose the scene on the map. `battle.js` and `battle-ui.js` were deleted. They are in git history at `bedee14`.

What the map battle keeps from the original plan:

- you fight the Company, never a power;
- "diplomacy decides who fights beside you" (allies march to the place);
- "conduct counts" (moving people out earns trust, and a failed hold costs it);
- the remedy of cutting the Company's supply.

It drops the "StarCraft moment" from `docs/design.md`.

## How it plays

- **Entry:** a rogue crisis offers **Defend the towns**. The map stays on screen, and the season panel becomes the battle panel. Before the first round you can still **auto-resolve** at `fightOdds` with one roll.
- **The map shows:**
  - the Company's supply line, a dashed maroon curve from its offshore base into the rogue power;
  - its strike, an arrow from the rogue power to this round's place, with a pulsing ring around the place;
  - the next places, numbered 2 and 3;
  - allies marching, as gold dashed lines;
  - a mark per round played: a check for held, a cross for broken, a heart for moved out.
- **Where it strikes:** three places next to the rogue power, drawn from `S.rng` when the battle starts. Federation places come first (you and members), then any neighbor that hasn't gone rogue. A place repeats only when there are fewer than three.
- **Each round, one move:**
  - **Hold the place.** The chance is set per round, as described below. Allies add 10% each, up to 3.
    - Success wins the round.
    - On a failure the place's towns are hit: trust -3 with that power, or Capital -1 if it is your land.
  - **Move people out.** It always works and costs nothing, but the Company takes the round. You gain trust +2 with that power.
  - **Cut the supply line.** The round chance minus 15%, once per battle.
    - Success wins the battle at once, and the rogue power goes free of the Company (grip 0, not 1).
    - Failure gives the round to the Company and reinforces it: -10% on later rounds.
- **Allies:** members at trust 50 or more that border the place (or are the place) march there. They show as faces in the panel and as lines and tokens on the map.
- **End:** two rounds win or lose it. Continue applies the result with `finishBattle`. The effects are the same as auto-resolve:
  - win: grip 1, or 0 after a cut. Trust -6 with the rogue power and -2 elsewhere, or +2 to others with civil defense doctrine;
  - loss: Capital -3, Food -2, grip 2, trust -4 with the rogue power.

## Balance

`fightOdds` counts every member. Here members count only where they march. So the base chance per round comes from `fightOdds` without the member term (`roundChance` inverts best of three, `3q^2 - 2q^3`). Allies on the spot supply the rest.

From `node tools/sim.js`, every rogue crisis in 300 greedy games fought with three fixed policies:

| Policy | Wins | Mean odds | Notes |
| --- | --- | --- | --- |
| Hold every round | 67.3% | 67.4% | matches auto-resolve |
| Cut first, then hold | 55.6% | 68.3% | frees the rogue power in 35% of battles |
| Move out first, then hold | 41.4% | 68.3% | least trust lost overall |

The campaign baseline is unchanged: the sim's bots take the auto-resolve path (`resolveCrisis(S, 'fight')`), which draws exactly as before.

## Engine API

- `resolveCrisis(S, 'battle')` enters the `'battle'` phase with a live battle.
- `battleOptions(S)` returns this round's place, allies, and the three moves with their chances and effects.
- `battleMove(S, key)` plays `'hold'`, `'evac'`, or `'cut'`, and sets `S.battle.done` once the battle is decided.
- `finishBattle(S)` applies `S.battle.done`.
- `autoBattle(S)` rolls `fightOdds` instead.
- `S.lastBattle.rounds` keeps each round.

## Open questions

- Is three rounds the right length? Is the choice between holding, moving people out, and cutting the supply line interesting after the second battle?
- Winning still costs trust with the rogue power and the others, unless you have civil defense. Should moving people out, or cutting the supply line, soften that?
- From the original plan, not built: the Company sabotaging a disputed site as a second trigger, carry-over of Food and Energy, and the charter's common defense showing as a squad.

## Sensitivity

The map battle shows Company strikes on real places. It needs the same regional review as the rest of the game before any public build.

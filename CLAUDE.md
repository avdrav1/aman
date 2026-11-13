# Aman

A browser prototype of a strategy game about reuniting the Indian subcontinent by consent in 2050.
This file is the handoff from the design sessions in Claude chat. Read it before changing anything.

## What this is

- **The full game (not built):** Civ-style turn-based diplomacy, with rare StarCraft-style real-time base-defense battles. See `docs/design.md`.
- **What exists:** a playable prototype of the turn-based layer only. Battles are a single dice roll.
- **The question the prototype answers:** is the diplomacy fun with no real-time layer at all? The owner's answer so far is "the core loop might be working."

The owner is Avniel. He is a product manager and former engineer. He plays each build and gives feedback on feel; expect requests phrased as "how might we...".

## Run it

No build step, no dependencies for the game itself.

```bash
python3 -m http.server 8000      # then open http://localhost:8000
node tools/sim.js                # balance check: 2,000 games per bot, about 2 seconds
python3 tools/smoke_test.py      # browser smoke test (needs: pip install playwright && playwright install chromium)
```

Opening `index.html` straight from disk also works.

## Files

| File | What it holds |
| --- | --- |
| `engine.js` | All rules. No DOM. Runs in the browser as `window.Aman` and in Node via `require`. |
| `index.html` | All UI: CSS, the SVG map, panels, dialogs, animation. Talks to the engine only through `window.Aman`. |
| `tools/sim.js` | Plays thousands of games with two bots and prints outcome counts. |
| `tools/smoke_test.py` | Playwright script: plays full games by clicking, fails on any console error. |
| `docs/design.md` | The one-page design doc and the core-loop doc. |
| `docs/rules.md` | Every rule and number as currently implemented. |
| `docs/backlog.md` | What is known to be weak, and what was proposed but not built. |

## Architecture rules

1. **Rules live in `engine.js`, never in `index.html`.** The UI reads state and calls `Aman.act(S, id)`, `endSeason`, `chooseCharter`, `resolveCrisis`, `resolveDispute`. If the UI needs to know something, add an engine function and export it.
2. **`Aman.available(S)` is the single source of what the player can do.** It returns every action with `ok`, `why`, `cost`, and `hint`. The UI renders buttons from it; the bots choose from it. A new action goes here first.
3. **`Aman.advise(S)` is both the in-game adviser and the test bot.** Changing its scores changes the simulated win rate and what players are told. Re-run the sim after touching it.
4. **The engine is deterministic given a seed.** All randomness goes through `S.rng`. Do not call `Math.random` in the engine.
5. **The UI re-renders everything on each state change** by rebuilding `#app.innerHTML`. Transient animation (tokens, floating numbers, bursts) is added to the `#fx` SVG layer after render and removes itself. Anything that must survive a re-render has to be derived from state.
6. **Every event carries a location.** Entries in `S.lastResolution` and `S.briefing` have `f` (a power id), `fs`, or `f2`, so the season playback can spotlight them on the map. Keep this when adding events.

## Working conventions

- **Balance changes need the sim.** State the before and after win rates in the commit message. Current baseline, with the bot taking the adviser's first suggestion every time: about 57% win, 42% partial, 1% loss over 2,000 games. A random bot should almost never win.
- **UI changes need a look.** Run the smoke test, then open the page. The test catches errors, not ugliness.
- **Every mechanic must be visible.** The prototype only became playable once each need showed what raises it. A rule the player cannot see on screen is a bug.
- **Prefer pictures to sentences.** The last several rounds of feedback were all "too much to read" and "more visual." New information should go on the map or into a gauge before it goes into a paragraph.
- **Copy style:** short declarative sentences, active voice, no em dashes, sentence case, no exclamation marks.
- **Both color themes must work.** All color goes through the CSS tokens at the top of `index.html`. Animation respects `prefers-reduced-motion`.
- **Content sensitivity is a design constraint, not an afterthought.** See the next section.

## Sensitivity constraints

The setting touches a live political question. These decisions were deliberate; do not undo them casually.

- **No present-day country is the protagonist.** The premise is that the nation-states fractured in the 2040s. Every power is a peer and the federation is voluntary. A game where one existing country absorbs its neighbors reads as nationalist irredentism.
- **Victory is by consent.** Conquest is allowed in the full design but is always the worse path.
- **The antagonist is the Company,** a private arms conglomerate echoing the East India Company. Neighbors are never the villains. Rogue powers have grievances and a way back in.
- **The title is Aman** ("peace" in Urdu, Hindi, and Bengali). It replaced "Sangam," whose strongest association is a Hindu sacred site. Avoid "Bharat," "Hind," "Akhand," and words for "unity" that belong to one language community.
- **The map draws no borders.** Territory is shown as a soft glow, not lines.
- **Leader portraits are abstract line art with titles, not names,** and carry no religious or ethnic dress markers. Keep them that way unless an artist and regional reviewers are involved.
- **Before any public release,** the doc calls for reviewers from across the region, including Pakistan and Bangladesh. The power names, the title, and the leader depictions have not had that review.

## Current state, honestly

Working: the season loop, five powers with needs and trust, the Company, relations between powers, powers' own plans, disputes, three charter votes, the adviser, the living map, season playback, the dossier panel, staged introduction of systems over the first four seasons.

Known weak points are in `docs/backlog.md`. The three that matter most:

1. The Company does not win outright against sensible play, so the "Company wins" ending is close to dead code.
2. The other powers follow fixed plan lists. They do not react to what the player does.
3. Motion timing (token flights, playback at about two seconds per event) was tuned from still screenshots and has never been judged by eye.

## Deployment

The owner asked about hosting. The game is two static files, so any static host works. The recommendation given was Cloudflare Pages connected to a GitHub repository, so each push deploys. Note that a Cloudflare Pages project created by drag-and-drop Direct Upload cannot be switched to Git integration later, so create it from the repository from the start. Nothing has been deployed yet beyond a private claude.ai artifact.

## Likely next steps

The owner has not chosen. Candidates, roughly in the order they were discussed: deploy, give the Company a budget and goals, make powers react to the player, a visual calendar in place of the season bars, decision scenes for disputes and votes, save and resume, analytics for playtests, and eventually the real-time battle layer. Ask before starting any of these.

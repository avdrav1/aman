# Aman

A browser prototype of a strategy game about reuniting the Indian subcontinent by consent in 2050.
This file is the handoff from the design sessions in Claude chat. Read it before changing anything.

## What this is

- **The full game (not built):** Civ-style turn-based diplomacy, with rare StarCraft-style real-time base-defense battles. See `docs/design.md`.
- **What exists:** a playable prototype of the turn-based layer. A battle against the Company plays on the campaign map in up to three rounds, or auto-resolves with one roll. A real-time battle screen was built, playtested, and dropped.
- **The question the prototype answers:** is the diplomacy fun with no real-time layer at all? The owner's answer so far is "the core loop might be working."

The owner is Avniel. He is a product manager and former engineer. He plays each build and gives feedback on feel; expect requests phrased as "how might we...".

## Run it

No build step, no dependencies for the game itself.

```bash
python3 -m http.server 8000 -d public   # then open http://localhost:8000
node tools/sim.js                       # balance check: 2,000 games per bot, about 20 seconds (worker threads)
python3 tools/smoke_test.py             # browser smoke test (needs: pip install playwright && playwright install chromium)
node tools/save_test.js                 # save and resume: games saved and reloaded after every step must end the same
node tools/playtests.js [--days N]      # summary of playtest analytics from D1 (needs: npx wrangler login)
```

Opening `public/index.html` straight from disk also works.

## Files

| File | What it holds |
| --- | --- |
| `public/engine.js` | All rules. No DOM. Runs in the browser as `window.Aman` and in Node via `require`. |
| `public/index.html` | All UI: CSS, the SVG map, panels, dialogs, animation. Talks to the engine only through `window.Aman`. |
| `tools/sim.js` | Plays thousands of games with two bots and prints outcome counts. |
| `tools/smoke_test.py` | Playwright script: plays full games by clicking, fails on any console error. |
| `tools/save_test.js` | Plays games straight through and with a save and reload after every step, and fails if they end differently. |
| `tools/playtests.js` | Reads the playtest events from D1 and prints who played, how far they got, where they stopped, battles, and actions used. |
| `worker/index.js` | The site's Worker. Static files are served first; it only handles `POST /api/event`, which stores anonymous playtest events in D1. Schema in `worker/schema.sql`. |
| `tools/build_map.py` | Stdlib Python. Builds the map (land, rivers, every placed point) from Natural Earth land and river layers only, and writes it into `index.html` between the `GENERATED MAP` markers. Run `python3 tools/build_map.py --write`; move map items by editing its lon/lat tables, not the pixels. |
| `docs/design.md` | The one-page design doc and the core-loop doc. |
| `docs/rules.md` | Every rule and number as currently implemented. |
| `docs/acts.md` | The three-act campaign: design, deviations, and the UI as built. |
| `docs/powers.md` | The sixteen powers, the engine's `POWERS` table, and choices flagged for regional review. |
| `docs/battle.md` | The battle on the map: how it plays, its balance, and why the real-time screen was dropped. |
| `docs/backlog.md` | What is known to be weak, and what was proposed but not built. |

## Architecture rules

1. **Rules live in `engine.js`, never in `index.html`.** The UI reads state and calls `Aman.act(S, id)`, `endSeason`, `chooseCharter`, `resolveCrisis`, `resolveDispute`, `battleMove`, `finishBattle`, `autoBattle`. If the UI needs to know something, add an engine function and export it.
2. **`Aman.available(S)` is the single source of what the player can do.** It returns every action with `ok`, `why`, `cost`, and `hint`. The UI renders buttons from it; the bots choose from it. A new action goes here first.
3. **`Aman.advise(S)` is both the in-game adviser and the test bot.** Changing its scores changes the simulated win rate and what players are told. Re-run the sim after touching it.
4. **The engine is deterministic given a seed.** All randomness goes through `S.rng`. Do not call `Math.random` in the engine.
5. **The UI re-renders everything on each state change** by rebuilding `#app.innerHTML`. Transient animation (tokens, floating numbers, bursts) is added to the `#fx` SVG layer after render and removes itself. Anything that must survive a re-render has to be derived from state.
6. **Battles live in the engine too.** `battleOptions` and `battleMove` hold every chance and effect; `index.html` only draws the battle on the map and the panel beside it.
7. **Saves are the whole state as JSON.** `Aman.save(S)` and `Aman.load(str)`; the RNG's state lives on `S.rs`. Keep `S` plain data (no functions, Maps, or shared object references). If you change the shape of `S`, bump `SAVE_V` in `engine.js`, which refuses older saves, and run `node tools/save_test.js`.
8. **Every event carries a location.** Entries in `S.lastResolution` and `S.briefing` have `f` (a power id), `fs`, or `f2`, so the season playback can spotlight them on the map. Keep this when adding events.

## Working conventions

- **Balance changes need the sim.** State the before and after win rates in the commit message. Current baseline, with the bot taking the adviser's first suggestion every time: about 54% win, 44% partial, 2% loss over 2,000 games, averaging 33 seasons. A bot that neglects its members should let the Company win sometimes (about 22%). A random bot should almost never win.
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

Working: three acts over about 33 seasons (Neighbors, Strain, Charter), sixteen powers (the player and fifteen rivals) defined as data in `POWERS`, needs and trust, the Company, relations between powers, powers' own plans, powers' memory of your favors and slights, disputes, three charter votes, the adviser, the living map, season playback, the dossier panel, staged introduction of systems in each act, attention pins and weather on a Natural Earth map, decision scenes, and trust charts.

Known weak points are in `docs/backlog.md`. The three that matter most:

1. Balance is a knife edge at sixteen powers: Act 3 Influence of 8, 9, or 10 swings the win rate from about 40% to 63%.
2. The other powers follow fixed plan lists. They react to the player only through memory: favors and slights, with a reply at three either way.
3. Motion timing (token flights, grouped playback, weather, signing seals) was tuned from still screenshots and has never been judged by eye. The north of the map is still crowded.

## Deployment

The owner asked about hosting. The game is static files in `public/`, so any static host works. Only `public/` is served; docs, tools, and this file stay out of the deployed site. Set the host's build output directory to `public` with no build command. The recommendation given was Cloudflare Pages connected to a GitHub repository, so each push deploys. Note that a Cloudflare Pages project created by drag-and-drop Direct Upload cannot be switched to Git integration later, so create it from the repository from the start. It is deployed as a Cloudflare Worker at https://aman.av-667.workers.dev/ connected to GitHub `avdrav1/aman`: every push to `main` deploys. `wrangler.jsonc` serves only `public/`, and the build runs `npm run build`, which is a no-op. `worker/index.js` runs only for paths that are not a static file, and handles `POST /api/event`.

## Save and analytics

- **Save:** the game saves itself to `localStorage` (`aman-save`) on every render and resumes on load. A finished game clears it.
- **Analytics:** anonymous events (start, season, act, crisis, dispute, council, vote, battle, choice, over, leave, abandon, optout) go to `POST /api/event` and into the D1 database `aman-events`. Each carries a random player id and game id kept in the browser. No IP, user agent, or name is stored. Sending is off on localhost and from disk, under Global Privacy Control, and when the player turns off "Share anonymous play data" in How to win. Read them with `node tools/playtests.js`. To test locally, run `npx wrangler dev` and open `http://aman.localhost:8787/` (plain localhost does not send).

## Likely next steps

The owner chose a battle against Company forces only. The real-time base-builder was built and playtested, and the owner did not like it, so the battle now plays on the campaign map in three rounds (`docs/battle.md`). Playtest it next. Save and resume, playtest analytics, and powers' memory are built. Other candidates, not started: give the Company a budget and goals, reactive plans (powers choosing plans from the situation). Ask before starting any of these.

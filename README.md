# Aman

A browser prototype of a turn-based strategy game about reuniting the Indian subcontinent by consent in 2050.

You lead the Deccan Compact. Bring four of five rival powers into a federation within twelve seasons, while a private arms conglomerate called the Company works to keep them apart.

## Play

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. There is no build step. Opening `index.html` directly also works.

## Develop

```bash
node tools/sim.js             # balance check across 2,000 simulated games per bot
python3 tools/smoke_test.py   # browser smoke test; needs Playwright
```

- `engine.js` holds every rule and has no DOM.
- `index.html` holds the interface.
- `CLAUDE.md` is the project brief for Claude Code. Start there.
- `docs/` has the design, the rules as implemented, and the backlog.

## Deploy

Two static files. Any static host works: point it at the repository root with no build command.

## Status

A prototype of the diplomacy layer only. Battles are auto-resolved. Names, numbers, and art are placeholders, and the content has not been reviewed by people from the region it depicts.

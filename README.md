# Guildz

A browser-based (mobile + PC) arena battle game inspired by the **Stronghold** mIRC
channel game. Turn-based **d20 combat**, classes (Fighter / Thief / Mage / Cleric),
gold-and-gear progression. Single-player today, architected so multiplayer is an
*addition*, not a rewrite.

## Run

Static site — no build step. A tiny Node static server is included:

```bash
node serve.js 47811
# then open http://localhost:47811
```

## Layout

- `js/` — clean, layered architecture:
  - `engine.js` — seeded RNG + pure helpers
  - `data.js` — classes, weapons, armor, items (content)
  - `combat.js` — the **pure** combat engine (the multiplayer seam)
  - `ai.js` — opponent action + foe generation (replaceable by a real player)
  - `game.js` — meta store: progression, economy, day loop, save/load
  - `ui.js`, `main.js` — rendering/input and boot
- `sim_*.js`, `tools/` — headless balance simulations (run with `node`)
- `PLAN.md` — the living design doc & roadmap (Champion mode → Lord mode → emergent world)

## Status

Champion mode is built and tested (combat, four classes, armor + Blacksmith, shop,
save/load). The Lord-mode / emergent-world expansion is fully designed in `PLAN.md` and
tracked as tasks — not yet implemented.

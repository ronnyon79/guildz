/* engine.js — pure, reusable primitives. No game rules, no DOM.
 * Loaded first. Attaches to a single global namespace `G`.
 * Written to run in the browser AND in Node (so combat can be unit-tested headless). */
(function (root) {
  const G = (root.G = root.G || {});

  /* Seedable PRNG (mulberry32). Determinism matters: a seeded battle replays
   * identically, which is what lets multiplayer verify a fight server-side later. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  // Percent roll: returns true `pct`% of the time (e.g. roll(rng, 60) for To Hit 60%).
  const roll = (rng, pct) => rng() * 100 < pct;

  // Dice notation "NdM" (e.g. "1d8", "2d6"). Returns the summed roll.
  function rollDice(rng, notation) {
    const m = /^(\d+)d(\d+)$/.exec(notation);
    if (!m) return 0;
    const n = +m[1], sides = +m[2];
    let total = 0;
    for (let i = 0; i < n; i++) total += randInt(rng, 1, sides);
    return total;
  }

  G.engine = { makeRng, clamp, clone, pick, randInt, roll, rollDice };
})(typeof window !== "undefined" ? window : globalThis);

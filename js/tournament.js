/* tournament.js — the Day/Season/Tournament backbone (GUI-5). Pure & shared:
 * Champion mode plays inside these brackets; Lord mode organizes them.
 *
 * A Day: bucket champions into win-bands (width 5) → one single-elimination
 * bracket per band (random bye when a round is odd) → exactly ONE winner per
 * band at sunset. Losing a bout ends your day (the original Stronghold rule).
 *
 * Everything is seeded and serializable: brackets reference champions by id
 * only, so a day can be persisted, replayed, or verified server-side.
 * Career effects (wins/gold/popularity) are applied by the CALLER via the
 * onBout callback — the engine itself never mutates champion records.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { makeRng, randInt } = G.engine;

  const BAND_WIDTH = 5;
  const bandOf = (wins) => Math.floor(wins / BAND_WIDTH);
  const bandLabel = (band) => `${band * BAND_WIDTH}–${band * BAND_WIDTH + BAND_WIDTH - 1} wins`;

  // Group champions into bands by CURRENT win count (sunrise re-bucketing;
  // the band is then locked for the day because brackets hold ids, not wins).
  function bucket(champions) {
    const bands = {};
    for (const c of champions) {
      const b = bandOf(c.wins || 0);
      (bands[b] = bands[b] || []).push(c);
    }
    return bands;
  }

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(rng, 0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* A bracket for one band. Plain data; champions referenced by id.
   * A lone entrant wins by walkover with 0 bouts won — the popularity formula
   * (boutsWon × …) makes an empty-bracket "win" worth nothing by itself. */
  function newBracket(band, entrantIds, seed) {
    const br = {
      band, seed,
      entrants: entrantIds.slice(),
      alive: entrantIds.slice(),
      round: 0,
      matches: [],       // {round, a, b, winner, seed, rounds}
      byes: [],          // {round, id} — random sit-out, advances without a bout
      pendingBye: null,
      boutsWon: {},      // id -> bouts won (drives the popularity award)
      winner: null,
    };
    for (const id of br.entrants) br.boutsWon[id] = 0;
    if (br.alive.length === 1) br.winner = br.alive[0];
    else if (br.alive.length > 1) nextRound(br);
    return br;
  }

  // Pair the survivors for a new round; an odd count sits one out at random.
  function nextRound(br) {
    br.round += 1;
    const rng = makeRng((br.seed + br.round * 7919) >>> 0);
    const pool = shuffle(rng, br.alive);
    if (pool.length % 2 === 1) {
      br.pendingBye = pool.pop(); // random because the pool was just shuffled
      br.byes.push({ round: br.round, id: br.pendingBye });
    }
    for (let i = 0; i < pool.length; i += 2) {
      br.matches.push({
        round: br.round, a: pool[i], b: pool[i + 1], winner: null,
        seed: (br.seed ^ (br.matches.length + 1) * 2654435761) >>> 0, // per-bout battle seed
        rounds: 0,
      });
    }
  }

  const pendingMatch = (br) => br.matches.find((m) => !m.winner) || null;

  // Record a bout result; when the round completes, survivors advance.
  function reportBout(br, match, winnerId) {
    if (winnerId !== match.a && winnerId !== match.b) throw new Error("winner not in match");
    if (match.winner) throw new Error("bout already resolved");
    match.winner = winnerId;
    br.boutsWon[winnerId] += 1;
    if (pendingMatch(br)) return; // round still running
    const advancing = br.matches.filter((m) => m.round === br.round).map((m) => m.winner);
    if (br.pendingBye) { advancing.push(br.pendingBye); br.pendingBye = null; }
    br.alive = advancing;
    if (advancing.length === 1) br.winner = advancing[0];
    else nextRound(br);
  }

  /* Sunrise: build the whole day. One bracket per occupied band.
   * Day length scales with population by construction (more entrants → more
   * rounds → more bouts before sunset). */
  function newDay(champions, seed) {
    const rng = makeRng(seed >>> 0);
    const bands = bucket(champions);
    const brackets = Object.keys(bands).map(Number).sort((a, b) => a - b)
      .map((band) => newBracket(band, bands[band].map((c) => c.id), randInt(rng, 1, 0x7fffffff)));
    return { seed: seed >>> 0, brackets, done: false };
  }

  /* Resolve one AI-vs-AI bout with the real combat engine + shipped AI on both
   * sides (the exact loop the balance sims use). Side assignment alternates by
   * seed parity so neither champion systematically gets the "you" tiebreaks. */
  function autoBout(a, b, seed) {
    const aIsYou = (seed & 1) === 0;
    let s = G.combat.newBattle(aIsYou ? a : b, aIsYou ? b : a, seed);
    let guard = 0;
    while (s.phase === "choose" && guard++ < 160) {
      const rY = makeRng((seed + s.round * 40503 + 7) >>> 0);
      const rF = makeRng((seed + s.round * 97 + 91193) >>> 0);
      s = G.combat.resolveRound(
        s,
        G.ai.chooseAction(s.you, s.foe, s.range, rY),
        G.ai.chooseAction(s.foe, s.you, s.range, rF)
      );
    }
    // Round-cap safety net: higher remaining HP% takes it.
    const youWon = s.phase === "won" ? true
      : s.phase === "lost" ? false
      : s.you.hp / s.you.maxHp >= s.foe.hp / s.foe.maxHp;
    const winner = youWon ? (aIsYou ? a : b) : (aIsYou ? b : a);
    // Crowd Rating (if the spectacle module is loaded).
    const spec = G.spectacle ? G.spectacle.rate(s, youWon ? "you" : "foe").stars : null;
    return { winnerId: winner.id, rounds: s.round, log: s.log, spec };
  }

  /* Sunset in one call: run every bracket to completion with autoBout.
   * `onBout(bracket, match, result, champion)` fires after each bout — the
   * caller applies career wins/gold there (and may mutate the champion record;
   * battle chars are rebuilt per bout, so mid-day growth carries forward).
   * Champions with `isPlayer` are refused — interactive days are driven
   * bout-by-bout by the game layer, not auto-resolved. */
  function runDay(champions, seed, onBout) {
    const byId = {};
    for (const c of champions) byId[c.id] = c;
    const day = newDay(champions, seed);
    for (const br of day.brackets) {
      let m;
      while (!br.winner && (m = pendingMatch(br))) {
        const a = byId[m.a], b = byId[m.b];
        if (a.isPlayer || b.isPlayer) throw new Error("runDay is NPC-only; drive player bouts via pendingMatch/reportBout");
        const res = autoBout(a, b, m.seed);
        m.rounds = res.rounds;
        m.spec = res.spec;
        reportBout(br, m, res.winnerId);
        if (onBout) onBout(br, m, res, byId[res.winnerId]);
      }
    }
    day.done = true;
    return day;
  }

  /* Seed-replay (GUI-14/GUI-23): re-run a recorded bout deterministically and
   * return the FULL final battle state — the Scribe re-renders the prose from
   * this instead of ever storing it. Same loop as autoBout, same outcome. */
  function replayBout(a, b, seed, openRange) {
    let s = G.combat.newBattle((seed & 1) === 0 ? a : b, (seed & 1) === 0 ? b : a, seed, openRange);
    let guard = 0;
    while (s.phase === "choose" && guard++ < 160) {
      const rY = makeRng((seed + s.round * 40503 + 7) >>> 0);
      const rF = makeRng((seed + s.round * 97 + 91193) >>> 0);
      s = G.combat.resolveRound(
        s,
        G.ai.chooseAction(s.you, s.foe, s.range, rY),
        G.ai.chooseAction(s.foe, s.you, s.range, rF)
      );
    }
    return s;
  }

  // Sunset summary: band -> {winnerId, boutsWon} (popularity award inputs).
  function winners(day) {
    const out = {};
    for (const br of day.brackets) {
      if (br.winner) out[br.band] = { winnerId: br.winner, boutsWon: br.boutsWon[br.winner] };
    }
    return out;
  }

  G.tournament = {
    BAND_WIDTH, bandOf, bandLabel, bucket,
    newBracket, nextRound, pendingMatch, reportBout,
    newDay, autoBout, replayBout, runDay, winners,
  };
})(typeof window !== "undefined" ? window : globalThis);

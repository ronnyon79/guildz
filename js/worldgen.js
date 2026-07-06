/* worldgen.js — pre-simulated history (GUI-33). A fresh world isn't born the
 * day you arrive: N background seasons are fought before the gates open, so
 * the residents carry real fame, the Lord's reign was really contested, and
 * the last day's parchments already hang on the board.
 *
 * This is the player-less twin of game.js's season loop, driven through the
 * same engines (runDay → fame → decay → aging → churn → throne challenges).
 * Fully seeded: the same worldSeed always births the same history.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { POPULARITY, SEASON, AGE, WORLDGEN, ARMOR, CLASSES } = G.data;

  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  // A plain throne-duel kit for a HISTORY lord (no buildings in the past).
  function lordChar(L) {
    const c = CLASSES[L.classId];
    const pools = G.ai.maxPools(L.classId, L.wins, 0.6);
    const fade = AGE.mult(L.age);
    const armor = G.ai.bestAffordableArmor(L.classId, G.data.totalGoldAt(L.wins));
    return {
      id: "lord", name: L.name, classId: L.classId, wins: L.wins,
      maxHp: Math.max(1, Math.round(pools.maxHp * fade)), maxMp: Math.round(pools.maxMp * fade),
      meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
      items: {}, arrows: [], activeArrow: "normal",
      armor, armorDurability: armor ? ARMOR[armor].durability : 0,
      personality: L.personality || null, isPlayer: false,
    };
  }

  /* Mutates `npcs` and `lordBox.lord`; returns { clock, lastSeason, board }. */
  function simulateHistory(npcs, lordBox, playerName, seed, seasons) {
    seasons = seasons == null ? WORLDGEN.seasons : seasons;
    if (seasons <= 0) return { clock: { day: 1, season: 1 }, lastSeason: null, board: [] }; // a world born today
    const rng = G.engine.makeRng(seed >>> 0);
    let board = [], lastSeason = null;

    for (let season = 1; season <= seasons; season++) {
      for (let day = 1; day <= SEASON.days; day++) {
        const chars = npcs.map((n) => G.roster.combatChar(n, 0.9)); // the old Lord taxed 10% too
        const byId = {};
        for (const c of chars) byId[c.id] = c;
        const dayState = G.tournament.runDay(chars, G.engine.randInt(rng, 1, 0x7fffffff), (br, m, res, w) => {
          const n = npcs.find((x) => x.id === w.id);
          if (n) n.wins += 1;
        });
        for (const br of dayState.brackets) {
          if (!br.winner) continue;
          const gain = G.spectacle.fameFor(br.matches, br.winner, POPULARITY.perBout(br.band), POPULARITY.specMult);
          const n = npcs.find((x) => x.id === br.winner);
          if (n) n.popularity = (n.popularity || 0) + gain;
        }
        // The final day of history: its parchments greet the newcomer.
        if (season === seasons && day === SEASON.days) {
          const bouts = [];
          for (const br of dayState.brackets) for (const m of br.matches) {
            if (!m.winner || m.forfeit) continue;
            bouts.push({ band: br.band, round: m.round, a: byId[m.a], b: byId[m.b], winner: byId[m.winner].name, rounds: m.rounds, spec: m.spec, seed: m.seed });
          }
          board = [{ day, season, bouts }];
        }
      }

      // Season close: standings…
      const ladder = npcs.slice().sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || b.wins - a.wins);
      lastSeason = { season, top: ladder.slice(0, 3).map((r) => ({ name: r.name, classId: r.classId, popularity: r.popularity || 0, isPlayer: false })) };

      // …the boldest of the famous may come for the throne (history had teeth):
      const bold = ladder.slice(0, 3).find((r) => (r.popularity || 0) > 0 && (!r.personality || r.personality.amb >= 0.3));
      if (bold && lordBox.lord) {
        const L = lordBox.lord;
        const duel = G.tournament.autoBout(lordChar(L), G.roster.combatChar(bold, 0.9), G.engine.randInt(rng, 1, 0x7fffffff));
        if (duel.winnerId === bold.id) {
          // The throne fell — history remembers a usurper.
          const idx = npcs.findIndex((x) => x.id === bold.id);
          npcs.splice(idx, 1);
          const stays = rng() < 0.25 + 0.7 * ((L.personality || {}).loy != null ? L.personality.loy : 0.5);
          if (stays) npcs.push({ id: "x" + season + "h", name: L.name, classId: L.classId, wins: L.wins, popularity: 0, age: L.age, personality: L.personality });
          lordBox.lord = { name: bold.name, classId: bold.classId, wins: bold.wins + 1, reignSeasons: 0, age: bold.age, personality: bold.personality };
        } else {
          bold.wins = Math.max(0, bold.wins); // the Lord holds; the challenger licks their wounds among the residents
          L.wins += 1;
        }
      }

      // …fame fades, everyone ages, the old bow out and the young arrive.
      for (const n of npcs) n.popularity = Math.round((n.popularity || 0) / 2);
      for (const n of npcs) n.age = (n.age || AGE.start) + 1;
      if (lordBox.lord) { lordBox.lord.age = (lordBox.lord.age || 40) + 1; lordBox.lord.reignSeasons = (lordBox.lord.reignSeasons || 0) + 1; }
      const retiring = npcs.filter((n) => n.age >= AGE.retire + (hash(n.id) % 12));
      if (retiring.length) {
        for (const r of retiring) npcs.splice(npcs.indexOf(r), 1);
        const fresh = G.roster.generateRoster(((seed >>> 0) ^ (season * 2654435761)) >>> 0, playerName, retiring.length, "h" + season + "_");
        const taken = new Set(npcs.map((n) => n.name).concat(lordBox.lord ? [lordBox.lord.name] : []));
        for (const f of fresh) {
          f.wins = Math.min(f.wins, 4); f.age = AGE.start + (hash(f.id) % 4);
          while (taken.has(f.name)) f.name += " II";
          taken.add(f.name);
          npcs.push(f);
        }
      }
    }
    // History's veterans climbed the bands — a fresh INTAKE of hopefuls
    // arrives at the gates the same day the player does, so the novice
    // brackets the newcomer fights in are full of peers, not ghosts.
    const intake = G.roster.generateRoster(((seed >>> 0) ^ 0xbeef) >>> 0, playerName, 10, "i");
    const taken = new Set(npcs.map((n) => n.name).concat(lordBox.lord ? [lordBox.lord.name] : []));
    for (const f of intake) {
      f.wins = hash(f.id) % 2 ? hash(f.id + "w") % 5 : 5 + (hash(f.id + "w") % 5); // bands 0–1
      f.age = AGE.start + (hash(f.id) % 5);
      while (taken.has(f.name)) f.name += " II";
      taken.add(f.name);
      npcs.push(f);
    }

    return { clock: { day: 1, season: seasons + 1 }, lastSeason, board };
  }

  G.worldgen = { simulateHistory };
})(typeof window !== "undefined" ? window : globalThis);

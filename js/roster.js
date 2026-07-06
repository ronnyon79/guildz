/* roster.js — the Stronghold's resident NPC champions (GUI-6).
 * Generates the persistent population that fills the daily brackets, and builds
 * battle-ready combat chars from the tiny persisted records. An NPC record is
 * deliberately minimal — {id, name, classId, wins} — everything else (pools,
 * gear, arrows) is derived from `wins`, exactly how foes have always geared up.
 * Daily arrive/leave churn is a separate system (planned; D2.2).
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, FOE_NAMES, EPITHETS, ROSTER, ARMOR, totalGoldAt } = G.data;
  const { makeRng, pick, randInt } = G.engine;

  /* Seed a fresh Stronghold's population. Names are unique and never collide
   * with the player's (battle narration colours lines by fighter name). */
  function generateRoster(seed, playerName, size, idPrefix) {
    size = size || ROSTER.size;
    idPrefix = idPrefix || "n";
    const rng = makeRng(seed >>> 0);
    const used = new Set([String(playerName || "").trim().toLowerCase()]);
    const npcs = [];
    let guard = 0;
    while (npcs.length < size && guard++ < size * 50) {
      const name = pick(rng, FOE_NAMES) + " " + pick(rng, EPITHETS);
      if (used.has(name.toLowerCase())) continue;
      used.add(name.toLowerCase());
      // Draw career wins from the weighted tiers (novice-heavy).
      const r = rng();
      let acc = 0, wins = 0;
      for (const [lo, hi, w] of ROSTER.winTiers) {
        acc += w;
        if (r < acc) { wins = randInt(rng, lo, hi); break; }
      }
      // Veterans are older — age tracks the career behind the wins.
      npcs.push({
        id: idPrefix + (npcs.length + 1), name, classId: pick(rng, Object.keys(CLASSES)), wins,
        popularity: 0, age: G.data.AGE.start + Math.round(wins / 3) + randInt(rng, 0, 6),
        personality: rollPersonality(rng),
      });
    }
    return npcs;
  }

  // A seeded temperament (GUI-42). Every game's cast rolls differently.
  function rollPersonality(rng) {
    const p = {};
    for (const t of G.data.PERSONALITY.traits) p[t] = Math.round(rng() * 100) / 100;
    return p;
  }

  /* Battle-ready char for an NPC record (same shape as game.playerCombatChar).
   * Rebuilt per bout, so mid-day win gains carry into the NPC's next fight.
   * `goldScale` models the Lord's sales tax: high taxes leave residents less
   * to spend on gear (the economy's core tension). */
  function combatChar(npc, goldScale) {
    const c = CLASSES[npc.classId];
    const pools = G.ai.maxPools(npc.classId, npc.wins, 0.6);
    // Peak then decline: an old champion's pools fade (GUI-17).
    const fade = G.data.AGE.mult(npc.age);
    pools.maxHp = Math.max(1, Math.round(pools.maxHp * fade));
    pools.maxMp = Math.round(pools.maxMp * fade);
    const budget = Math.round(totalGoldAt(npc.wins) * (goldScale == null ? 1 : goldScale));
    const armor = G.ai.bestAffordableArmor(npc.classId, budget);
    const char = {
      id: npc.id, name: npc.name, classId: npc.classId, wins: npc.wins,
      maxHp: pools.maxHp, maxMp: pools.maxMp,
      meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
      items: {}, arrows: [], activeArrow: "normal",
      armor, armorDurability: armor ? ARMOR[armor].durability : 0,
      personality: npc.personality || null, // temperament rides into battle
      isPlayer: false,
    };
    if (npc.classId === "thief") {
      // Veteran thieves spend leftover winnings on special arrows (as foes did).
      const gold = budget - (armor ? ARMOR[armor].cost : 0);
      if (gold >= 1000) { char.arrows = ["fire"]; char.activeArrow = "fire"; }
      else if (gold >= 500) { char.arrows = ["ice"]; char.activeArrow = "ice"; }
    }
    return char;
  }

  G.roster = { generateRoster, combatChar, rollPersonality };
})(typeof window !== "undefined" ? window : globalThis);

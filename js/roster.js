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
  function generateRoster(seed, playerName, size) {
    size = size || ROSTER.size;
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
      npcs.push({ id: "n" + (npcs.length + 1), name, classId: pick(rng, Object.keys(CLASSES)), wins, popularity: 0 });
    }
    return npcs;
  }

  /* Battle-ready char for an NPC record (same shape as game.playerCombatChar).
   * Rebuilt per bout, so mid-day win gains carry into the NPC's next fight.
   * `goldScale` models the Lord's sales tax: high taxes leave residents less
   * to spend on gear (the economy's core tension). */
  function combatChar(npc, goldScale) {
    const c = CLASSES[npc.classId];
    const pools = G.ai.maxPools(npc.classId, npc.wins, 0.6);
    const budget = Math.round(totalGoldAt(npc.wins) * (goldScale == null ? 1 : goldScale));
    const armor = G.ai.bestAffordableArmor(npc.classId, budget);
    const char = {
      id: npc.id, name: npc.name, classId: npc.classId, wins: npc.wins,
      maxHp: pools.maxHp, maxMp: pools.maxMp,
      meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
      items: {}, arrows: [], activeArrow: "normal",
      armor, armorDurability: armor ? ARMOR[armor].durability : 0,
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

  G.roster = { generateRoster, combatChar };
})(typeof window !== "undefined" ? window : globalThis);

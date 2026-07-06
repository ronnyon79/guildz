/* ai.js — THE MULTIPLAYER SEAM.
 *   generateFoe()  — invent an opponent (later: matchmake a real player)
 *   chooseAction() — decide the foe's move each round (later: their input)
 * combat.js never imports this; it only receives an action id.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, FOE_NAMES, ARMOR, ARMOR_MAXTIER, totalGoldAt } = G.data;
  const { pick, randInt, makeRng } = G.engine;

  // Best armor a class can afford + wear, given `gold` (prefers higher DR, then magical).
  function bestAffordableArmor(classId, gold) {
    const max = ARMOR_MAXTIER[classId] || 0;
    let best = null, score = -1;
    for (const id in ARMOR) {
      const a = ARMOR[id];
      if (a.tier <= max && gold >= a.cost) { const s = a.dr * 2 + (a.magical ? 1 : 0); if (s > score) { score = s; best = id; } }
    }
    return best;
  }

  // Max pools for a given class at a given win-count (mirrors game.js growth).
  function maxPools(classId, wins, mageHpShare) {
    const c = CLASSES[classId];
    const points = 2 * wins;
    if (!c.caster) return { maxHp: c.startHp + points, maxMp: 0 };
    const toHp = Math.round(points * (mageHpShare ?? 0.6));
    return { maxHp: c.startHp + toHp, maxMp: c.startMp + (points - toHp) };
  }

  function generateFoe(playerWins, streak, seed) {
    const rng = makeRng(seed);
    const classId = pick(rng, Object.keys(CLASSES));
    const wins = Math.max(0, playerWins + Math.floor(streak / 2) + randInt(rng, -1, 1));
    const pools = maxPools(classId, wins, 0.6);
    return {
      name: pick(rng, FOE_NAMES),
      classId,
      wins,
      maxHp: pools.maxHp,
      maxMp: pools.maxMp,
      meleeWeapon: CLASSES[classId].startEq.melee,
      missileWeapon: CLASSES[classId].startEq.missile,
      armor: bestAffordableArmor(classId, totalGoldAt(wins)), // foes gear up from their winnings
      isPlayer: false,
    };
  }

  /* Decide a fighter's action given the shared range.
   * Fighter wants melee (1d8 > 1d6); Mage wants to stay at missile and cast
   * (keeping a charging Fighter on its weaker missile die); Thief just brawls.
   *
   * PERSONALITY (GUI-42) re-weights these thresholds — never a new tree, never
   * raw power. Every trait at 0.5 reproduces the old baseline exactly. */
  function chooseAction(me, foe, range, rng) {
    const c = CLASSES[me.classId];
    const P = me.personality || {};
    const T = (t) => (P[t] != null ? P[t] : 0.5); // 0.5 = the old baseline

    // --- consumables (a DISCIPLINED fighter drinks earlier, a rash one late) ---
    const items = me.items || {};
    const critical = me.hp / me.maxHp < 0.15 + 0.3 * T("dis");
    const canSelfHeal = me.classId === "cleric" && me.mp >= 8; // has a Cure to fall back on
    if (items.potion_healing > 0 && critical && !canSelfHeal) return "item:potion_healing";
    if (items.potion_mana > 0 && me.caster && me.mp < 8 && me.hp / me.maxHp > 0.35) return "item:potion_mana";

    if (me.classId === "mage") {
      const can = (id) => c.spells.find((s) => s.id === id && me.mp >= s.mp);
      if (can("summon") && !me.pet && rng() < 0.35 + 0.8 * T("cun")) return "spell:summon"; // the cunning open with the elemental
      if (range === "melee" && rng() < 0.8 - 0.8 * T("agg")) return "move"; // the timid kite; the fierce stand and blast
      if (can("poison") && !foe.poison && rng() < 0.3 + 0.8 * T("cun")) return "spell:poison";
      if (can("fireball") && rng() < 0.2 + 0.8 * T("agg")) return "spell:fireball";
      if (can("lightning") && rng() < 0.6) return "spell:lightning";
      if (can("missile")) return "spell:missile"; // reliable auto-hit fallback
      return "attack";
    }

    if (me.classId === "cleric") {
      const can = (id) => c.spells.find((s) => s.id === id && me.mp >= s.mp);
      const hp = me.hp / me.maxHp;
      // The brave dig deeper before they turn to prayer.
      const panic = 0.5 - 0.3 * T("brv");
      if (hp < panic) { if (can("heal")) return "spell:heal"; if (can("cure_serious")) return "spell:cure_serious"; if (can("cure")) return "spell:cure"; }
      if (!me.pet && can("spirit")) return "spell:spirit";
      if (me.shield <= 0 && can("shield") && rng() < 0.35 + 0.8 * T("dis")) return "spell:shield";
      if (hp < panic + 0.2 && can("cure")) return "spell:cure";
      if (me.shield <= 0 && can("shield")) return "spell:shield";
      if (range === "missile" && rng() < 0.6 * T("agg")) return "move"; // the fierce close for the mace
      return "attack";
    }

    if (me.classId === "fighter") {
      if (range === "missile" && rng() < 0.3 + T("agg")) return "move"; // charge in for 1d8 melee
      return "attack";
    }

    if (me.classId === "thief") {
      // The cunning vanish; the straightforward just stab.
      if (me.abilities && me.abilities.includes("hide") && !me.autoCritNext && rng() < 0.7 * T("cun")) return "ability:hide";
      // missile die (1d8) beats melee (1d6): the cautious break to range
      if (range === "melee" && rng() < 1.05 - T("agg")) return "move";
      return "attack";
    }
    return "attack";
  }

  G.ai = { generateFoe, chooseAction, maxPools, bestAffordableArmor };
})(typeof window !== "undefined" ? window : globalThis);

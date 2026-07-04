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
   * (keeping a charging Fighter on its weaker missile die); Thief just brawls. */
  function chooseAction(me, foe, range, rng) {
    const c = CLASSES[me.classId];

    // --- consumables (emergency use) ---
    const items = me.items || {};
    const critical = me.hp / me.maxHp < 0.3;
    const canSelfHeal = me.classId === "cleric" && me.mp >= 8; // has a Cure to fall back on
    if (items.potion_healing > 0 && critical && !canSelfHeal) return "item:potion_healing";
    if (items.potion_mana > 0 && me.caster && me.mp < 8 && me.hp / me.maxHp > 0.35) return "item:potion_mana";

    if (me.classId === "mage") {
      const can = (id) => c.spells.find((s) => s.id === id && me.mp >= s.mp);
      if (can("summon") && !me.pet && rng() < 0.75) return "spell:summon"; // 2-on-1 swing
      if (range === "melee" && rng() < 0.4) return "move"; // kite off a melee attacker
      if (can("poison") && !foe.poison && rng() < 0.7) return "spell:poison"; // big DoT
      if (can("fireball") && rng() < 0.6) return "spell:fireball";
      if (can("lightning") && rng() < 0.6) return "spell:lightning";
      if (can("missile")) return "spell:missile"; // reliable auto-hit fallback
      return "attack";
    }

    if (me.classId === "cleric") {
      const can = (id) => c.spells.find((s) => s.id === id && me.mp >= s.mp);
      const hp = me.hp / me.maxHp;
      // Emergency heal — biggest affordable tier when badly hurt.
      if (hp < 0.35) { if (can("heal")) return "spell:heal"; if (can("cure_serious")) return "spell:cure_serious"; if (can("cure")) return "spell:cure"; }
      // Set up the persistent Spiritual Weapon first (main damage source).
      if (!me.pet && can("spirit")) return "spell:spirit";
      // Keep a Shield of Faith up.
      if (me.shield <= 0 && can("shield") && rng() < 0.75) return "spell:shield";
      if (hp < 0.55 && can("cure")) return "spell:cure";
      if (me.shield <= 0 && can("shield")) return "spell:shield";
      // The weapon reaches melee on its own, so the Cleric can stay safe at range.
      if (range === "missile" && rng() < 0.3) return "move"; // occasionally close for the mace
      return "attack";
    }

    if (me.classId === "fighter") {
      if (range === "missile" && rng() < 0.8) return "move"; // charge in for 1d8 melee
      return "attack";
    }

    if (me.classId === "thief") {
      // Set up a guaranteed crit when hidden isn't already primed.
      if (me.abilities && me.abilities.includes("hide") && !me.autoCritNext && rng() < 0.35) return "ability:hide";
      // missile die (1d8) beats melee (1d6): prefer to fight at range
      if (range === "melee" && rng() < 0.55) return "move"; // back off to missile
      return "attack";
    }
    return "attack";
  }

  G.ai = { generateFoe, chooseAction, maxPools };
})(typeof window !== "undefined" ? window : globalThis);

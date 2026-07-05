/* combat.js — THE PURE GAME ENGINE (Stronghold ruleset). No DOM, no AI, no I/O.
 *
 * Pure function of (state, yourActionId, foeActionId). The same code runs the
 * fight whether the foe's action comes from local AI or a remote player. This is
 * the multiplayer seam — keep it pure.
 *
 * Round model: both fighters pick an action; they resolve in INITIATIVE order
 * (Thief → Fighter → Mage). Range is SHARED (missile | melee); "move" flips it.
 * Attacks use melee or missile dice based on the range AT THE MOMENT they act.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { clamp, clone, rollDice, randInt } = G.engine;
  const { CLASSES, WEAPONS, ITEMS, ARROWS, ARMOR, CRIT_MULT } = G.data;

  /* Single 1d20 roll drives hit / crit / critical-miss. Every class % is a
   * multiple of 5, so it maps directly onto the die (each face = 5%).
   *   nat 1            -> critical miss (fumble): fails AND stuns next round
   *   roll >= critThr  -> critical hit (double damage)
   *   roll >= hitThr   -> normal hit
   *   otherwise        -> miss
   * autoHit spells (Magic Missile) never miss or fumble, but can still crit. */
  function d20Resolve(rng, hitPct, critPct, autoHit) {
    const roll = randInt(rng, 1, 20);
    const critThr = 21 - Math.round(critPct / 5); // 5% -> 20, 10% -> 19
    if (autoHit) return { roll, outcome: roll >= critThr ? "crit" : "hit" };
    if (roll === 1) return { roll, outcome: "critmiss" };
    const hitThr = 21 - Math.round(hitPct / 5);    // 60% -> 9, 50% -> 11, 40% -> 13
    if (roll >= critThr) return { roll, outcome: "crit" };
    if (roll >= hitThr) return { roll, outcome: "hit" };
    return { roll, outcome: "miss" };
  }

  // Minimum possible roll of a dice notation (e.g. "2d10" -> 2). Used by Curse.
  function minDice(dice) { const m = /^(\d+)d\d+$/.exec(dice); return m ? +m[1] : 0; }
  // Roll damage — but a cursed attacker deals the minimum.
  function rollDmg(rng, dice, cursed) { return cursed ? minDice(dice) : rollDice(rng, dice); }

  // Apply damage to a fighter. Order: Shield of Faith absorbs, THEN armor DR
  // reduces the remainder (physical hits only; magic/DoT/summons pass `false`).
  // Armor loses 1 durability per physical hit it soaks and breaks at 0.
  function dealDamage(f, dmg, physical) {
    let absorbed = 0, broke = false, mitigated = 0, armorBroke = false;
    if (f.shield > 0) {
      absorbed = Math.min(f.shield, dmg);
      f.shield -= absorbed; dmg -= absorbed;
      if (f.shield <= 0) { f.shield = 0; broke = true; }
    }
    // Normal armor reduces physical only; enchanted armor also reduces magic.
    if ((physical || f.armorMagical) && dmg > 0 && f.armorDR > 0 && f.armorDurability > 0) {
      const before = dmg;
      dmg = Math.max(1, dmg - f.armorDR);
      mitigated = before - dmg;
      f.armorDurability -= 1;
      if (f.armorDurability <= 0) { f.armorDurability = 0; f.armorDR = 0; f.armor = null; armorBroke = true; }
    }
    f.hp = clamp(f.hp - dmg, 0, f.maxHp);
    return { absorbed, broke, mitigated, armorBroke };
  }

  function makeFighter(char) {
    const c = CLASSES[char.classId];
    const mw = WEAPONS[char.meleeWeapon], sw = WEAPONS[char.missileWeapon];
    const f = {
      name: char.name,
      emoji: c.emoji,
      classId: char.classId,
      wins: char.wins || 0,
      isPlayer: !!char.isPlayer,
      maxHp: char.maxHp, hp: char.maxHp,
      maxMp: char.maxMp, mp: char.maxMp,
      toHit: c.toHit, toCrit: c.toCrit, toCast: c.toCast,
      evadeOn: c.evade || 0,             // 1d20 >= this evades an incoming attack (0 = none)
      attacks: 1,                        // independent To-Hit rolls per action (multi-attack)
      weapons: 1,                        // weapon damage dice per landed hit (dual wield)
      shieldPct: 0,                      // perk override for Shield of Faith (0 = use spell's)
      melee: mw ? mw.dmg : c.melee,      // dice from the equipped weapon (fallback: class)
      missile: sw ? sw.dmg : c.missile,
      meleeWeapon: char.meleeWeapon || null,
      missileWeapon: char.missileWeapon || null,
      caster: c.caster,
      spells: c.spells.map((s) => s.id),
      abilities: (c.abilities || []).filter((a) => (char.wins || 0) >= a.at).map((a) => a.id),
      autoCritNext: false, // Hide in Shadows: next attack is a guaranteed crit
      arrows: char.arrows ? char.arrows.slice() : [], // owned special arrow ids
      activeArrow: char.activeArrow || "normal",       // arrow loaded for missile shots
      initBonus: 0,   // added to the 1d20 initiative roll (Thief perks)
      slowed: 0,      // rounds slowed (Ice Arrow) — while > 0, loses initiative
      // Armor: flat DR vs physical hits; wears down; heavy armor slows initiative.
      armor: char.armor || null,
      armorDR: ARMOR[char.armor] ? ARMOR[char.armor].dr : 0,
      armorMagical: ARMOR[char.armor] ? !!ARMOR[char.armor].magical : false, // reduces magic too
      armorInit: ARMOR[char.armor] ? ARMOR[char.armor].initPenalty : 0,
      armorDurability: char.armorDurability != null ? char.armorDurability : (ARMOR[char.armor] ? ARMOR[char.armor].durability : 0),
      skipNext: false, // set by a critical miss; skips the fighter's next action
      poison: null,    // active damage-over-time: { dice, turns }
      cursed: 0,       // rounds remaining of Curse — deals minimum damage while > 0
      shield: 0,       // Shield of Faith HP buffer; absorbs hits before real HP
      items: char.items ? { ...char.items } : {}, // consumables brought to battle
      pet: null,       // summoned ally (only one at a time): { name, emoji, hp, ... }
      // Optional balance hooks — default to no-ops so base rules are unchanged.
      spellPower: char.spellPower || 0, // flat bonus added to spell damage
      dodge: c.dodge || 0,              // chance to evade an incoming melee/missile hit
    };
    // Flat combat bonuses on the char (home-crowd roar, future buffs). Kept in
    // multiples of 5 so they map cleanly onto the d20.
    if (char.toHitBonus) f.toHit += char.toHitBonus;
    if (char.toCritBonus) f.toCrit += char.toCritBonus;
    // Win-based class perks (extra attacks, improved crit). Later entries win ties.
    for (const perk of c.perks || []) {
      if (f.wins >= perk.at) {
        if (perk.attacks != null) f.attacks = perk.attacks;
        if (perk.weapons != null) f.weapons = perk.weapons;
        if (perk.toCrit != null) f.toCrit = perk.toCrit;
        if (perk.initBonus != null) f.initBonus = perk.initBonus;
        if (perk.evade != null) f.evadeOn = perk.evade;
        if (perk.shieldPct != null) f.shieldPct = perk.shieldPct;
        if (perk.spiritDmg != null) f.spiritDmg = perk.spiritDmg;
        if (perk.spiritMelee != null) f.spiritMelee = perk.spiritMelee;
        if (perk.spiritStrikes != null) f.spiritStrikes = perk.spiritStrikes;
      }
    }
    return f;
  }

  // `openRange` (default missile) — the Lord's home-arena advantage lets him
  // dictate where the throne duel begins.
  function newBattle(playerChar, foeChar, seed, openRange) {
    return {
      seed,
      round: 1,
      phase: "choose", // choose | won | lost
      range: openRange === "melee" ? "melee" : "missile",
      you: makeFighter({ ...playerChar, isPlayer: true }),
      foe: makeFighter(foeChar),
      log: [],
    };
  }

  // Actions available to a fighter given the current shared range.
  function actionsFor(fighter, range) {
    const list = [];
    const mult = fighter.attacks > 1 ? ` ×${fighter.attacks}` : fighter.weapons > 1 ? ` ⚔️×${fighter.weapons}` : "";
    if (range === "missile") {
      const w = WEAPONS[fighter.missileWeapon];
      const ar = ARROWS[fighter.activeArrow];
      const special = fighter.activeArrow !== "normal" && ar;
      const die = special ? ar.dmg : fighter.missile;
      const tag = special ? ` ${ar.emoji} ${ar.name}` : "";
      list.push({ id: "move", name: "Charge", emoji: "🏃", mp: 0, desc: "Close to melee range.", usable: true });
      list.push({ id: "attack", name: "Shoot", emoji: special ? ar.emoji : w ? w.emoji : "🏹", mp: 0, desc: `${w ? w.name : "Missile"} · ${die}${mult}${tag}`, usable: true });
    } else {
      const w = WEAPONS[fighter.meleeWeapon];
      list.push({ id: "move", name: "Retreat", emoji: "↩️", mp: 0, desc: "Back off to missile range.", usable: true });
      list.push({ id: "attack", name: "Strike", emoji: w ? w.emoji : "⚔️", mp: 0, desc: `${w ? w.name : "Melee"} · ${fighter.melee}${mult}`, usable: true });
    }
    for (const sid of fighter.spells) {
      const sk = CLASSES[fighter.classId].spells.find((s) => s.id === sid);
      if (!sk) continue;
      const isSummon = sk.summon || sk.spirit;
      const blocked = isSummon && !!fighter.pet; // can't summon a 2nd while one is active
      list.push({
        id: "spell:" + sk.id, name: sk.name, emoji: sk.emoji, mp: sk.mp,
        desc: blocked ? sk.desc + " (one already active)" : sk.desc,
        usable: fighter.mp >= sk.mp && !blocked,
      });
    }
    // Win-unlocked martial abilities (no MP).
    for (const aid of fighter.abilities) {
      const ab = (CLASSES[fighter.classId].abilities || []).find((a) => a.id === aid);
      if (ab) list.push({ id: "ability:" + ab.id, name: ab.name, emoji: ab.emoji, mp: 0, desc: ab.desc, usable: !(aid === "hide" && fighter.autoCritNext) });
    }
    // Consumable items carried into battle.
    for (const iid in fighter.items) {
      const it = ITEMS[iid];
      if (it && fighter.items[iid] > 0) list.push({ id: "item:" + iid, name: it.name, emoji: it.emoji, mp: 0, desc: `${it.desc} (×${fighter.items[iid]})`, usable: true });
    }
    // Swap loaded arrows (a full turn) — only if special arrows are owned.
    if (fighter.arrows && fighter.arrows.length) {
      for (const id of ["normal", ...fighter.arrows]) {
        if (id === fighter.activeArrow) continue;
        const ar = ARROWS[id];
        list.push({ id: "arrow:" + id, name: "Load " + ar.name, emoji: ar.emoji, mp: 0, desc: `${ar.desc || "Standard arrows."} (takes a full turn)`, usable: true });
      }
    }
    return list;
  }

  /* Initiative: each side rolls 1d20 + initBonus each round; higher acts first
   * (tie → player). A slowed fighter automatically loses initiative to a
   * non-slowed one. Returns { order, you, foe, bySlow }. */
  function rollInitiative(state, rng) {
    const yS = state.you.slowed > 0, fS = state.foe.slowed > 0;
    if (yS && !fS) return { order: ["foe", "you"], bySlow: true };
    if (fS && !yS) return { order: ["you", "foe"], bySlow: true };
    const y = randInt(rng, 1, 20) + (state.you.initBonus || 0) - (state.you.armorInit || 0);
    const f = randInt(rng, 1, 20) + (state.foe.initBonus || 0) - (state.foe.armorInit || 0);
    return { order: y >= f ? ["you", "foe"] : ["foe", "you"], you: y, foe: f };
  }

  function resolveRound(state, youActionId, foeActionId) {
    const next = clone(state);
    const rng = G.engine.makeRng(next.seed + next.round * 2654435761);
    const log = next.log;
    const sides = { you: next.you, foe: next.foe };
    const actionIds = { you: youActionId, foe: foeActionId };

    // Damage-over-time (Poison Cloud) ticks at the top of the round, before actions.
    for (const key of ["you", "foe"]) {
      const f = sides[key];
      if (f.poison && f.poison.turns > 0 && f.hp > 0) {
        const dmg = rollDice(rng, f.poison.dice);
        f.hp = clamp(f.hp - dmg, 0, f.maxHp);
        f.poison.turns -= 1;
        log.push({ t: "poison", who: f.name, dmg, dotType: f.poison.type || "poison" });
        if (f.poison.turns <= 0) f.poison = null;
      }
    }
    if (checkEnd(next, log)) return next;

    // Range flips at most ONCE per round: if either fighter moves, the gap
    // changes. Two simultaneous moves don't cancel — they close the distance
    // together (e.g. both at missile + both move => both end in melee).
    // Roll initiative for the round.
    const init = rollInitiative(next, rng);
    log.push({ t: "initiative", first: sides[init.order[0]].name, youRoll: init.you, foeRoll: init.foe, bySlow: !!init.bySlow });

    let flipped = false;
    for (const key of init.order) {
      const actor = sides[key];
      const target = sides[key === "you" ? "foe" : "you"];
      if (actor.hp <= 0 || target.hp <= 0) continue;
      // Stunned (Ice Arrow this round, or a critical miss last round) — turn lost.
      // A miss deals no stun, so the foe still fights back — no perma-lock.
      if (actor.skipNext) {
        actor.skipNext = false;
        log.push({ t: "recover", who: actor.name });
        continue;
      }
      const aid = actionIds[key];
      if (aid === "move") {
        if (!flipped) { next.range = next.range === "missile" ? "melee" : "missile"; flipped = true; }
        log.push({ t: "move", who: actor.name, to: next.range });
        continue;
      }
      applyAction(next, actor, target, aid, rng, log);
      if (checkEnd(next, log)) return next;
    }

    // Summoned allies (Air Elemental / Spiritual Weapon) act after their owners.
    for (const key of ["you", "foe"]) {
      const owner = sides[key], enemy = sides[key === "you" ? "foe" : "you"];
      const pet = owner.pet;
      if (!pet || owner.hp <= 0) continue;
      if (pet.hp !== undefined && pet.hp <= 0) continue; // dead soakable pet
      if (pet.toHit != null) {
        // A melee-only Spiritual Weapon flies in on its first round (independent of
        // the caster's range — the Cleric can stay safe at missile), then strikes.
        if (pet.meleeOnly && !pet.engaged) {
          pet.engaged = true;
          log.push({ t: "petMove", who: pet.name, owner: owner.name });
          continue;
        }
        // Spiritual Weapon: attacks with the caster's To Hit / To Crit (may strike twice).
        for (let s = 0; s < (pet.strikes || 1) && enemy.hp > 0; s++) {
          const r = d20Resolve(rng, pet.toHit, pet.toCrit, false);
          if (r.outcome === "miss" || r.outcome === "critmiss") {
            log.push({ t: "petMiss", who: pet.name, owner: owner.name, target: enemy.name, roll: r.roll });
          } else {
            const crit = r.outcome === "crit";
            const dmg = rollDice(rng, pet.dmg) * (crit ? CRIT_MULT : 1);
            const res = dealDamage(enemy, dmg, false); // summons deal magical damage
            log.push({ t: "petHit", who: pet.name, owner: owner.name, target: enemy.name, dmg, crit, roll: r.roll, absorbed: res.absorbed, broke: res.broke });
          }
        }
      } else {
        // Air Elemental: auto-hits (magical, bypasses armor).
        const dmg = rollDice(rng, pet.dmg);
        const res = dealDamage(enemy, dmg, false);
        log.push({ t: "petHit", who: pet.name, owner: owner.name, target: enemy.name, dmg, absorbed: res.absorbed, broke: res.broke });
      }
      if (checkEnd(next, log)) return next;
    }

    // Curse and Slow count down at the end of the round.
    for (const key of ["you", "foe"]) {
      if (sides[key].cursed > 0) sides[key].cursed -= 1;
      if (sides[key].slowed > 0) sides[key].slowed -= 1;
    }

    // Timed summons (Spiritual Weapon) count down and expire.
    for (const key of ["you", "foe"]) {
      const p = sides[key].pet;
      if (p && p.turns !== undefined) {
        p.turns -= 1;
        if (p.turns <= 0) { log.push({ t: "petExpire", who: p.name, owner: sides[key].name }); sides[key].pet = null; }
      }
    }

    next.round += 1;
    return next;
  }

  // One weapon strike: to-hit, fumble, dodge, crit, damage (shield/pet-soak aware).
  // `forceCrit` (from Hide in Shadows) makes this strike a guaranteed critical.
  function doOneAttack(actor, target, dice, kind, rng, log, forceCrit, arrow, weapons) {
    let { roll, outcome } = d20Resolve(rng, actor.toHit, actor.toCrit, false);
    if (forceCrit) outcome = "crit"; // guaranteed critical from the shadows
    if (outcome === "critmiss") { actor.skipNext = true; log.push({ t: "critmiss", who: actor.name, roll, kind }); return; }
    if (outcome === "miss") { log.push({ t: "miss", who: actor.name, target: target.name, kind, roll }); return; }
    // A summoned elemental (soakable) soaks ~half of incoming physical attacks.
    const tgt = target.pet && target.pet.soakable && target.pet.hp > 0 && rng() < 0.5 ? target.pet : target;
    if (tgt.dodge > 0 && randInt(rng, 1, 100) <= tgt.dodge * 100) { log.push({ t: "dodge", who: tgt.name, by: actor.name, kind, roll }); return; }
    // Thief evasion: roll 1d20 to slip the attack entirely.
    if (tgt.evadeOn > 0) {
      const er = randInt(rng, 1, 20);
      if (er >= tgt.evadeOn) { log.push({ t: "evade", who: tgt.name, by: actor.name, kind, roll: er }); return; }
    }
    const crit = outcome === "crit";
    // Dual wield: one To-Hit, damage from `weapons` dice on the hit — but the
    // off-hand weapon(s) deal half (rounded up).
    const w = weapons || 1;
    let dmg = 0;
    for (let k = 0; k < w; k++) {
      let wd = rollDmg(rng, dice, actor.cursed > 0);
      if (k > 0) wd = Math.max(1, Math.ceil(wd / 2)); // off-hand: half damage
      dmg += wd * (crit ? CRIT_MULT : 1);
    }
    const res = dealDamage(tgt, dmg, true); // weapon/arrow base damage is physical
    log.push({ t: "hit", who: actor.name, target: tgt.name, dmg, crit, kind, roll, cursed: actor.cursed > 0, absorbed: res.absorbed, broke: res.broke, mitigated: res.mitigated, armorBroke: res.armorBroke, arrow: arrow ? arrow.id : undefined, dual: w > 1 || undefined });
    if (tgt !== target && tgt.hp <= 0) { target.pet = null; log.push({ t: "petDown", who: tgt.name }); }
    // Special-arrow on-hit effect (only against the main target, not a soaking pet).
    if (arrow && tgt === target) {
      if (arrow.effect === "slow") { target.slowed = arrow.slowTurns || 2; log.push({ t: "arrowFx", fx: "slow", who: actor.name, target: target.name, turns: arrow.slowTurns || 2 }); }
      else if (arrow.effect === "burn") { const turns = rollDice(rng, arrow.dotTurns); target.poison = { dice: arrow.dot, turns, type: "burn" }; log.push({ t: "arrowFx", fx: "burn", who: actor.name, target: target.name, turns }); }
    }
  }

  // Handles attacks, spells and items. "move" is resolved in resolveRound.
  function applyAction(state, actor, target, actionId, rng, log) {
    if (actionId.startsWith("item:")) {
      const iid = actionId.slice(5), it = ITEMS[iid];
      if (!it || !(actor.items[iid] > 0)) return; // nothing to use
      actor.items[iid] -= 1;
      if (it.effect === "fullheal") actor.hp = actor.maxHp;
      else if (it.effect === "fullmana") actor.mp = actor.maxMp;
      log.push({ t: "item", who: actor.name, item: it.name, effect: it.effect });
      return;
    }
    if (actionId === "attack") {
      const melee = state.range === "melee";
      const kind = melee ? "melee" : "missile";
      let dice = melee ? actor.melee : actor.missile;
      // A loaded special arrow overrides the missile die and adds an on-hit effect.
      let arrow = null;
      if (!melee && actor.activeArrow && actor.activeArrow !== "normal") {
        arrow = ARROWS[actor.activeArrow];
        if (arrow && arrow.dmg) dice = arrow.dmg;
      }
      // Perks may grant multiple strikes per attack action; stop early on a kill.
      // A critical miss (nat 1) fumbles so badly it aborts the rest of the flurry
      // and stuns the attacker next round (skipNext set inside doOneAttack).
      const n = actor.attacks || 1;
      for (let i = 0; i < n; i++) {
        if (target.hp <= 0) break;
        doOneAttack(actor, target, dice, kind, rng, log, actor.autoCritNext && i === 0, arrow, actor.weapons);
        if (actor.skipNext) break; // fumbled — remaining strikes are lost
      }
      actor.autoCritNext = false; // consumed by attacking (first strike)
      return;
    }
    if (actionId.startsWith("arrow:")) {
      const id = actionId.slice(6);
      if (id === "normal" || actor.arrows.includes(id)) {
        actor.activeArrow = id;
        log.push({ t: "arrowSwap", who: actor.name, arrow: (ARROWS[id] || {}).name || id });
      }
      return;
    }
    if (actionId === "ability:hide") {
      // Roll To Hit to hide; on success, the next attack is a guaranteed crit.
      const { roll, outcome } = d20Resolve(rng, actor.toHit, actor.toCrit, false);
      const success = outcome === "hit" || outcome === "crit";
      if (success) actor.autoCritNext = true;
      log.push({ t: "hide", who: actor.name, success, roll });
      return;
    }
    if (actionId.startsWith("spell:")) {
      const sid = actionId.slice(6);
      const sk = CLASSES[actor.classId].spells.find((s) => s.id === sid);
      // Can't cast if unknown, no MP, or trying to summon a 2nd entity while one is active.
      if (!sk || actor.mp < sk.mp || ((sk.summon || sk.spirit) && actor.pet)) {
        log.push({ t: "fizzle", who: actor.name, skill: sk ? sk.name : "spell", reason: "no mp" });
        return;
      }
      actor.mp -= sk.mp;
      // Cast roll: Magic Missile auto-hits; Fireball uses To Cast. Both can crit.
      const { roll, outcome } = d20Resolve(rng, actor.toCast, actor.toCrit, !!sk.autoHit);
      if (outcome === "critmiss") {
        actor.skipNext = true;
        log.push({ t: "critmiss", who: actor.name, roll, skill: sk.name });
        return;
      }
      if (outcome === "miss") {
        log.push({ t: "fizzle", who: actor.name, skill: sk.name, reason: "failed", roll });
        return;
      }
      const crit = outcome === "crit";
      if (sk.heal) {
        // Cure Wounds: restore the caster's own HP (heals don't crit).
        const amt = rollDice(rng, sk.heal);
        actor.hp = clamp(actor.hp + amt, 0, actor.maxHp);
        log.push({ t: "heal", who: actor.name, amt, skill: sk.name, roll });
        return;
      }
      if (sk.shield) {
        // Shield of Faith HP buffer; a perk (actor.shieldPct) can override the spell's %.
        const pct = actor.shieldPct || sk.shieldPct || 1;
        actor.shield = Math.round(actor.maxHp * pct);
        log.push({ t: "shield", who: actor.name, amount: actor.shield, roll });
        return;
      }
      if (sk.spirit) {
        // Spiritual Weapon: a permanent, untargetable ally that attacks with the
        // caster's To Hit / To Crit for sk.dmg each round.
        // Duration = base + 1 round per `turnsPer` wins (scales with progression).
        const dur = sk.turns + (sk.turnsPer ? Math.floor((actor.wins || 0) / sk.turnsPer) : 0);
        // Perks may upgrade the weapon's die and require melee range.
        actor.pet = { name: "Spiritual Weapon", emoji: "🗡️", dmg: actor.spiritDmg || sk.dmg, toHit: actor.toHit, toCrit: actor.toCrit, soakable: false, meleeOnly: !!actor.spiritMelee, strikes: actor.spiritStrikes || 1, turns: dur };
        log.push({ t: "summonWeapon", who: actor.name, turns: dur, roll });
        return;
      }
      if (sk.summon) {
        // Summon Air Elemental: an ally with the caster's HP, hits for sk.dmg/round.
        actor.pet = { name: "Air Elemental", emoji: "🌪️", hp: actor.maxHp, maxHp: actor.maxHp, dmg: sk.dmg, def: 0, dodge: 0, soakable: true };
        log.push({ t: "summon", who: actor.name, hp: actor.maxHp, roll });
        return;
      }
      if (sk.dot) {
        // Poison Cloud: successful cast applies a DoT (ticks at round start).
        target.poison = { dice: sk.dmg, turns: sk.turns };
        log.push({ t: "applyDot", who: actor.name, target: target.name, skill: sk.name, turns: sk.turns, roll });
        return;
      }
      if (sk.curse) {
        // Curse: the target deals minimum damage for a few rounds.
        target.cursed = sk.turns;
        log.push({ t: "applyCurse", who: actor.name, target: target.name, skill: sk.name, turns: sk.turns, roll });
        return;
      }
      // spellPower (default 0) scales caster damage with progression.
      const dmg = rollDmg(rng, sk.dmg, actor.cursed > 0) * (crit ? CRIT_MULT : 1) + (actor.spellPower || 0);
      const sres = dealDamage(target, dmg, false); // physical:false — only enchanted armor reduces this
      log.push({ t: "spell", who: actor.name, target: target.name, skill: sk.name, dmg, crit, roll, absorbed: sres.absorbed, broke: sres.broke, mitigated: sres.mitigated });
      return;
    }
  }

  function checkEnd(state, log) {
    if (state.you.hp <= 0 && state.phase === "choose") {
      state.phase = "lost"; log.push({ t: "end", result: "lost" }); return true;
    }
    if (state.foe.hp <= 0 && state.phase === "choose") {
      state.phase = "won"; log.push({ t: "end", result: "won" }); return true;
    }
    return false;
  }

  G.combat = { makeFighter, newBattle, actionsFor, resolveRound, rollInitiative };
})(typeof window !== "undefined" ? window : globalThis);

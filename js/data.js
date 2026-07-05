/* data.js — static game content for the Stronghold-style ruleset. Pure data.
 *
 * Each class is defined by tabletop-style combat numbers:
 *   toHit  — % chance an attack lands
 *   toCrit — % chance a landed hit is a critical (double damage)
 *   toCast — % chance a spell succeeds (Mage only); 0 = non-caster
 *   melee / missile — damage dice rolled by range ("NdM")
 *   startHp / startMp — level-1 pools
 *   caster — has MP + spells
 */
(function (root) {
  const G = (root.G = root.G || {});

  const CLASSES = {
    fighter: {
      id: "fighter", name: "Fighter", emoji: "🛡️",
      blurb: "Brawler. Highest melee die and best To Hit. Wants to close the gap.",
      startHp: 25, startMp: 0,
      toHit: 60, toCrit: 5, toCast: 0,
      melee: "1d8", missile: "1d6", // fallback dice if unarmed; normally from equipment
      startEq: { melee: "two_handed_sword", missile: "short_bow" },
      caster: false, spells: [],
      // Win-based perks: a 2nd attack at 25 wins, a 3rd at 50.
      perks: [{ at: 25, attacks: 2 }, { at: 50, attacks: 3 }],
    },
    thief: {
      id: "thief", name: "Thief", emoji: "🗡️",
      blurb: "Opportunist. Strikes first every round and crits twice as often.",
      startHp: 25, startMp: 0,
      toHit: 50, toCrit: 10, toCast: 0,
      evade: 18, // incoming attack evaded on a 1d20 roll >= this (18 -> ~15%; tune here)
      melee: "1d6", missile: "1d8",
      startEq: { melee: "one_handed_sword", missile: "long_bow" },
      caster: false, spells: [],
      // Win-based perks: @25 initiative +1 and dual wield (2 weapon dice/hit);
      // @50 initiative +2, better crit and better evasion.
      perks: [{ at: 25, initBonus: 1, weapons: 2, label: "Dual wield" }, { at: 50, initBonus: 2, toCrit: 15, evade: 17 }],
      // Win-unlocked active abilities (no MP).
      abilities: [
        { id: "hide", name: "Hide in Shadows", emoji: "🌑", at: 25, desc: "Roll To Hit to vanish. On success, your next attack is a guaranteed critical." },
      ],
    },
    mage: {
      id: "mage", name: "Mage", emoji: "🔮",
      blurb: "Caster. Weak in melee, but spells hit hard from range. Kite and blast.",
      startHp: 20, startMp: 20,
      toHit: 40, toCrit: 5, toCast: 60,
      melee: "1d4", missile: "1d4",
      startEq: { melee: "staff", missile: "sling" },
      caster: true,
      spells: [
        // Magic Missile always lands (no To Cast roll). The rest use To Cast.
        { id: "missile", name: "Magic Missile", emoji: "✨", mp: 5, dmg: "1d8", autoHit: true, desc: "Auto-hits for 1d8. 5 MP." },
        { id: "lightning", name: "Lightning Bolt", emoji: "⚡", mp: 7, dmg: "1d10", desc: "1d10 shock — needs To Cast. 7 MP." },
        { id: "fireball", name: "Fireball", emoji: "🔥", mp: 10, dmg: "2d10", desc: "2d10 fire — needs To Cast. 10 MP." },
        { id: "poison", name: "Poison Cloud", emoji: "☠️", mp: 20, dmg: "2d20", dot: true, turns: 2, desc: "Poisons for 2d20/turn over 2 turns. Needs To Cast. 20 MP." },
        { id: "summon", name: "Summon Air Elemental", emoji: "🌪️", mp: 40, dmg: "2d10", summon: true, desc: "Summons an elemental (your HP) that hits for 2d10/round. Needs To Cast. 40 MP." },
      ],
    },
    cleric: {
      id: "cleric", name: "Cleric", emoji: "⛪",
      blurb: "Battle priest. Conjures a spiritual weapon, shields the faithful, and mends wounds.",
      startHp: 25, startMp: 25,
      toHit: 50, toCrit: 5, toCast: 60,
      melee: "1d6", missile: "1d4",
      startEq: { melee: "mace", missile: "sling" },
      caster: true,
      // Win-based perks: @25 Shield of Faith 100% max HP + Spiritual Weapon (1d8)
      // striking TWICE/round; @50 weapon upgrades to 1d10 and becomes melee-range.
      perks: [{ at: 25, shieldPct: 1.0, spiritStrikes: 2 }, { at: 50, spiritDmg: "1d10", spiritMelee: true }],
      spells: [
        { id: "shield", name: "Shield of Faith", emoji: "🛡️", mp: 20, shield: true, shieldPct: 0.75, autoHit: true, desc: "Raise a shield with 75% of your max HP (100% at 25 wins); absorbs all hits until it breaks. 20 MP." },
        { id: "spirit", name: "Spiritual Weapon", emoji: "🗡️", mp: 20, spirit: true, autoHit: true, dmg: "1d8", turns: 5, turnsPer: 5, desc: "Conjure a floating weapon that strikes for 1d8/round (your To Hit/Crit). Lasts 5 rounds, +1 per 5 wins. At 50 wins: 1d10 but only strikes at melee range. 20 MP." },
        { id: "cure", name: "Cure Wounds", emoji: "💚", mp: 8, heal: "3d8", autoHit: true, desc: "Reliably heal yourself 3d8. 8 MP." },
        { id: "cure_serious", name: "Cure Serious Wounds", emoji: "💚", mp: 14, heal: "5d8", autoHit: true, desc: "Reliably heal yourself 5d8. 14 MP." },
        { id: "heal", name: "Heal", emoji: "💖", mp: 22, heal: "8d8", autoHit: true, desc: "Reliably heal yourself 8d8. 22 MP." },
      ],
    },
  };

  /* Weapons. A melee weapon sets your melee die, a missile weapon your missile die.
   * `noun` is the lowercase word used in combat narration; `name` is for the UI. */
  const WEAPONS = {
    two_handed_sword: { id: "two_handed_sword", name: "Two-Handed Sword", noun: "greatsword", slot: "melee", dmg: "1d8", emoji: "⚔️" },
    one_handed_sword: { id: "one_handed_sword", name: "One-Handed Sword", noun: "sword", slot: "melee", dmg: "1d6", emoji: "🗡️" },
    staff:            { id: "staff", name: "Staff", noun: "staff", slot: "melee", dmg: "1d4", emoji: "🪄" },
    mace:             { id: "mace", name: "Mace", noun: "mace", slot: "melee", dmg: "1d6", emoji: "🔨" },
    short_bow:        { id: "short_bow", name: "Short Bow", noun: "short bow", slot: "missile", dmg: "1d6", emoji: "🏹" },
    long_bow:         { id: "long_bow", name: "Long Bow", noun: "longbow", slot: "missile", dmg: "1d8", emoji: "🏹" },
    sling:            { id: "sling", name: "Sling", noun: "sling", slot: "missile", dmg: "1d4", emoji: "🎯" },
  };

  const GOLD_PER_WIN = 50; // base (0–24 wins)
  // Gold per win scales with progression: 50 (<25), 100 (25–49), 150 (50+).
  function goldForWin(wins) { return wins >= 50 ? 150 : wins >= 25 ? 100 : 50; }
  // Total gold earned by a character with `wins` wins (foes gear up from this).
  function totalGoldAt(wins) { let g = 0; for (let w = 1; w <= wins; w++) g += goldForWin(w); return g; }
  const POINTS_PER_WIN = 2; // HP for Fighter/Thief; HP/MP split for Mage
  const CRIT_MULT = 2;      // PLACEHOLDER: crit = double damage

  /* Shop vendors. `soon` = placeholder, not yet browsable. */
  const VENDORS = [
    { id: "magic", name: "Magic Shop", emoji: "🔮", blurb: "Potions, scrolls and enchanted curios." },
    { id: "blacksmith", name: "Blacksmith", emoji: "⚒️", blurb: "Armor — soak physical blows." },
    { id: "alchemist", name: "Alchemist", emoji: "⚗️", blurb: "Battle elixirs & reagents.", soon: true },
  ];

  /* Special arrows (Thief only). The active arrow replaces the missile die and
   * adds an on-hit effect. `normal` is the default (uses the bow's own die).
   * Buy once = owned; swapping the active arrow in battle costs a full turn. */
  const ARROWS = {
    normal:    { id: "normal", name: "Normal Arrows", noun: "arrow", emoji: "➵", cost: 0 },
    ice:       { id: "ice", name: "Ice Arrows", noun: "ice arrow", emoji: "❄️", cost: 500, dmg: "1d10", effect: "slow", slowTurns: 2, desc: "1d10 damage; slows the target — they lose initiative for 2 rounds." },
    fire:      { id: "fire", name: "Fire Arrows", noun: "fire arrow", emoji: "🔥", cost: 1000, dmg: "1d10", effect: "burn", dot: "1d4", dotTurns: "1d3", desc: "1d10 damage; target burns for 1d4/turn over 1d3 turns." },
  };

  /* Armor: flat DR vs PHYSICAL damage only (magic/DoT/summons bypass). Wears out
   * over hits (durability) and must be re-bought when it breaks. Heavy armor slows
   * initiative. Sold at the Blacksmith. */
  /* Armor tiers 1–3. `magical: true` variants (2× cost) also reduce MAGICAL damage
   * (spells + summons), not just physical. */
  const ARMOR = {
    leather:       { id: "leather",       name: "Leather Armor",       emoji: "🦺", tier: 1, dr: 1, magical: false, initPenalty: 0, durability: 25, cost: 250, vendor: "blacksmith" },
    leather_magic: { id: "leather_magic", name: "Enchanted Leather",    emoji: "🦺", tier: 1, dr: 1, magical: true,  initPenalty: 0, durability: 31, cost: 500, vendor: "blacksmith" },
    chain:         { id: "chain",         name: "Chainmail",           emoji: "⛓️", tier: 2, dr: 2, magical: false, initPenalty: 1, durability: 50, cost: 500, vendor: "blacksmith" },
    chain_magic:   { id: "chain_magic",   name: "Enchanted Chainmail",  emoji: "⛓️", tier: 2, dr: 2, magical: true,  initPenalty: 1, durability: 63, cost: 1000, vendor: "blacksmith" },
    plate:         { id: "plate",         name: "Plate Armor",         emoji: "🛡️", tier: 3, dr: 3, magical: false, initPenalty: 2, durability: 75, cost: 1000, vendor: "blacksmith" },
    plate_magic:   { id: "plate_magic",   name: "Enchanted Plate",     emoji: "🛡️", tier: 3, dr: 3, magical: true,  initPenalty: 2, durability: 94, cost: 2000, vendor: "blacksmith" },
  };
  // Heaviest armor tier a class may wear.
  const ARMOR_MAXTIER = { fighter: 3, cleric: 2, thief: 1, mage: 1 };

  /* Buyable items. Consumables can be used as a battle action; `effect` is what
   * the combat engine applies. */
  const ITEMS = {
    // NB: keep the `potion_healing` id for save compatibility; display name renamed.
    potion_healing: {
      id: "potion_healing", name: "Potion of Life Restoration", emoji: "🧪",
      cost: 1000, vendor: "magic", type: "consumable", effect: "fullheal",
      desc: "In battle, instantly restores you to full HP. Single use.",
    },
    potion_mana: {
      id: "potion_mana", name: "Potion of Mana Restoration", emoji: "🔷",
      cost: 1000, vendor: "magic", type: "consumable", effect: "fullmana",
      desc: "In battle, instantly restores you to full MP. Single use.",
    },
  };

  const FOE_NAMES = [
    "Garruk", "Mira", "Thorne", "Vex", "Sable", "Korin", "Lyra", "Draven",
    "Nyx", "Ozric", "Fenn", "Isolde", "Brak", "Quill", "Roan", "Yara",
  ];
  // Combined with FOE_NAMES for the resident champion roster (16×12 combos).
  const EPITHETS = [
    "the Grim", "the Swift", "Ironhand", "the Quiet", "Ashborn", "the Bold",
    "Nightshade", "the Stray", "Oakenshield", "the Red", "Duskwalker", "of the Vale",
  ];

  /* The Stronghold's resident NPC champion population (GUI-6).
   * `winTiers` = [lo, hi, weight]: a new NPC's career wins are drawn from these
   * bands, weighted toward novices so a fresh player has a full band-0 bracket.
   * Starting size is a first guess — tuned by sim (GUI-34). */
  const ROSTER = {
    size: 40,
    winTiers: [[0, 4, 0.4], [5, 14, 0.3], [15, 29, 0.2], [30, 60, 0.1]],
  };

  G.data = { CLASSES, WEAPONS, ARMOR, ARMOR_MAXTIER, VENDORS, ITEMS, ARROWS, GOLD_PER_WIN, goldForWin, totalGoldAt, POINTS_PER_WIN, CRIT_MULT, FOE_NAMES, EPITHETS, ROSTER };
})(typeof window !== "undefined" ? window : globalThis);

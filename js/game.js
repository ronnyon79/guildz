/* game.js — the meta-game "store". Owns durable player state and orchestrates
 * battles via the pure combat engine and the AI seam.
 *
 * Stronghold progression: there are no XP levels. Each win grants +50 gold and
 * 2 stat points — auto HP for Fighter/Thief, a player-chosen HP/MP split for the
 * Mage. UI never mutates state directly; it calls actions.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, ITEMS, ARROWS, ARMOR, ARMOR_MAXTIER, goldForWin, POINTS_PER_WIN } = G.data;

  const SAVE_KEY = "guildz.save.v2";
  const listeners = new Set();

  const state = {
    screen: "title", // title | class-select | home | battle | win | loss | shop | hero
    player: null,
    streak: 0,
    battle: null,
    foe: null,
    lastReward: null,
    allocPending: false, // Mage must spend 2 points before continuing
    vendor: null,        // which shop vendor is open (null = vendor list)
    seedCounter: 1,
  };

  function computeMax(player) {
    const c = CLASSES[player.classId];
    return { maxHp: c.startHp + player.bonusHp, maxMp: c.startMp + player.bonusMp };
  }

  function playerCombatChar() {
    const p = state.player, m = computeMax(p);
    return {
      name: p.name, classId: p.classId, wins: p.wins, maxHp: m.maxHp, maxMp: m.maxMp,
      meleeWeapon: p.equipment.melee, missileWeapon: p.equipment.missile,
      items: { ...(p.inventory || {}) },
      arrows: (p.arrows || []).slice(), activeArrow: p.activeArrow || "normal",
      armor: p.armor || null, armorDurability: p.armorDurability || 0,
      isPlayer: true,
    };
  }

  // ---- persistence ----
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ player: state.player, seedCounter: state.seedCounter })); }
    catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.player) return false;
      state.player = data.player;
      // Migrate saves created before equipment / inventory existed.
      if (!state.player.equipment) state.player.equipment = { ...CLASSES[state.player.classId].startEq };
      if (!state.player.inventory) state.player.inventory = {};
      if (!state.player.arrows) state.player.arrows = [];
      if (!state.player.activeArrow) state.player.activeArrow = "normal";
      if (state.player.armor === undefined) { state.player.armor = null; state.player.armorDurability = 0; }
      state.seedCounter = data.seedCounter || 1;
      state.screen = "home";
      return true;
    } catch (e) { return false; }
  }
  function nextSeed() { return (state.seedCounter = (state.seedCounter + 1) >>> 0); }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { for (const fn of listeners) fn(state); }

  // ---- actions ----
  function createCharacter(classId, name) {
    state.player = {
      name: (name || "Hero").slice(0, 14) || "Hero",
      classId,
      wins: 0,
      gold: 0,
      bonusHp: 0,
      bonusMp: 0,
      bestStreak: 0,
      battlesWon: 0,
      equipment: { ...CLASSES[classId].startEq }, // starting weapons
      inventory: {}, // itemId -> count of consumables owned
      arrows: [],    // owned special arrow ids (Thief)
      activeArrow: "normal",
      armor: null,   // equipped armor id
      armorDurability: 0,
    };
    state.screen = "home";
    save(); emit();
  }

  function go(screen) { state.screen = screen; state.vendor = null; emit(); }

  function openVendor(id) { state.vendor = id; emit(); }
  function closeVendor() { state.vendor = null; emit(); }

  function buyItem(itemId) {
    const p = state.player, it = ITEMS[itemId];
    if (!it || p.gold < it.cost) return false;
    p.gold -= it.cost;
    p.inventory[itemId] = (p.inventory[itemId] || 0) + 1;
    save(); emit();
    return true;
  }

  // Special arrows (Thief only): buy once (owned), then load one as the active arrow.
  function buyArrow(arrowId) {
    const p = state.player, ar = ARROWS[arrowId];
    if (p.classId !== "thief" || !ar || arrowId === "normal") return false;
    if (p.arrows.includes(arrowId) || p.gold < ar.cost) return false;
    p.gold -= ar.cost;
    p.arrows.push(arrowId);
    p.activeArrow = arrowId; // auto-load the new arrow
    save(); emit();
    return true;
  }
  function loadArrow(arrowId) {
    const p = state.player;
    if (arrowId === "normal" || p.arrows.includes(arrowId)) { p.activeArrow = arrowId; save(); emit(); }
  }

  // Buy & equip armor (Blacksmith). Must be within the class's tier and affordable.
  function buyArmor(armorId) {
    const p = state.player, a = ARMOR[armorId];
    if (!a || a.tier > (ARMOR_MAXTIER[p.classId] || 0) || p.gold < a.cost) return false;
    p.gold -= a.cost;
    p.armor = armorId;
    p.armorDurability = a.durability; // fresh piece
    save(); emit();
    return true;
  }

  function startBattle() {
    state.foe = G.ai.generateFoe(state.player.wins, state.streak, nextSeed());
    state.battle = G.combat.newBattle(playerCombatChar(), state.foe, nextSeed());
    state.allocPending = false;
    state.screen = "battle";
    emit();
  }
  function enterArena() { state.streak = 0; startBattle(); }

  function chooseAction(actionId) {
    const b = state.battle;
    if (!b || b.phase !== "choose") return;
    const rng = G.engine.makeRng(b.seed + b.round * 7919);
    const foeAction = G.ai.chooseAction(b.foe, b.you, b.range, rng);
    state.battle = G.combat.resolveRound(b, actionId, foeAction);
    // Keep durable state in sync with what changed this battle (items, loaded arrow).
    state.player.inventory = G.engine.clone(state.battle.you.items || {});
    state.player.activeArrow = state.battle.you.activeArrow || "normal";
    state.player.armor = state.battle.you.armor; // may become null if it broke
    state.player.armorDurability = state.battle.you.armorDurability;
    if (state.battle.phase === "won") onWin();
    else if (state.battle.phase === "lost") onLoss();
    emit();
  }

  function onWin() {
    const p = state.player;
    state.streak += 1;
    p.battlesWon += 1;
    p.wins += 1;
    const reward = goldForWin(p.wins); // scales: 50 / 100 (@25) / 150 (@50)
    p.gold += reward;
    if (state.streak > p.bestStreak) p.bestStreak = state.streak;

    if (CLASSES[p.classId].caster) {
      state.allocPending = true; // Mage chooses the split on the win screen
    } else {
      p.bonusHp += POINTS_PER_WIN; // Fighter/Thief auto-invest in HP
    }
    state.lastReward = { gold: reward, streak: state.streak };
    state.screen = "win";
    save();
  }

  function onLoss() {
    state.lastReward = { streak: state.streak, reachedBest: state.streak >= state.player.bestStreak };
    state.screen = "loss";
    save();
  }

  // Mage allocation: spend the win's 2 points (hpPts to HP, rest to MP).
  function allocate(hpPts) {
    if (!state.allocPending) return;
    hpPts = Math.max(0, Math.min(POINTS_PER_WIN, hpPts | 0));
    state.player.bonusHp += hpPts;
    state.player.bonusMp += POINTS_PER_WIN - hpPts;
    state.allocPending = false;
    save(); emit();
  }

  function fightOn() { startBattle(); }
  function retreat() { state.streak = 0; go("home"); }
  function returnHome() { state.streak = 0; go("home"); }

  function resetGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state.player = null; state.streak = 0; state.battle = null; state.foe = null;
    state.allocPending = false; state.screen = "title";
    emit();
  }

  G.game = {
    state, subscribe, load, save,
    computeMax,
    createCharacter, go, enterArena, chooseAction,
    allocate, fightOn, retreat, returnHome, resetGame,
    openVendor, closeVendor, buyItem, buyArrow, loadArrow, buyArmor,
  };
})(typeof window !== "undefined" ? window : globalThis);

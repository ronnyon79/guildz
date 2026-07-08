/* game.js — the meta-game "store". Owns durable player state and orchestrates
 * battles via the pure combat engine and the AI seam.
 *
 * Stronghold progression: there are no XP levels. Each win grants +50 gold and
 * 2 stat points — auto HP for Fighter/Thief, a player-chosen HP/MP split for the
 * Mage. UI never mutates state directly; it calls actions.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, ITEMS, ARROWS, ARMOR, ARMOR_MAXTIER, goldForWin, POINTS_PER_WIN, POPULARITY, SEASON, LORD, ECONOMY, BOARD, BUILDINGS, BUILDING_FX, AGE, FOE_NAMES, EPITHETS, totalGoldAt } = G.data;

  /* ---- worlds: each universe is a SEPARATE save game (decided design) ----
   * An index lists the universes; each world lives under its own key. Within a
   * world your role changes in place (champion → servant/lord) — one
   * continuous save per world. The pre-worlds single save migrates to slot 1. */
  const LEGACY_KEY = "guildz.save.v2";
  const INDEX_KEY = "guildz.worlds.v1";
  const worldKey = (id) => "guildz.world." + id;
  const listeners = new Set();

  const state = {
    screen: "title", // title | class-select | home | bracket | battle | win | loss | day-champion | shop | hero
    worldId: null,       // which universe this session lives in
    player: null,
    npcs: [],            // the Stronghold's resident champions (persisted)
    lord: null,          // the reigning Lord (persisted; null once YOU reign)
    stronghold: null,    // treasury + the Lord's decrees (persisted)
    household: [],       // the Lord's servants — throne defenders (persisted)
    news: [],            // the town crier's ring — recent world events (persisted, GUI-53)
    ledgerLog: [],       // the clerk's book — last 7 presided days (persisted, GUI-52)
    defense: null,       // a pending challenge {challengerId, name, season, fielded} (persisted)
    defenseRun: null,    // transient gauntlet progress {bouts, chHp, chMp}
    board: [],           // the Scribe's parchments: recent days' bouts (persisted ring)
    viewBout: null,      // which parchment is open {di, bi}
    clock: { day: 1, season: 1 }, // the world clock (persisted)
    lastSeason: null,    // last season's final fame standings (persisted)
    challengeOpen: false, // season's #1 = you → the throne may be challenged (persisted)
    throneFight: false,  // transient: the current battle is the throne duel
    lastThrone: null,    // outcome details for the coronation / fate screens
    streak: 0,           // bouts won today
    battle: null,
    foe: null,
    lastReward: null,
    allocPending: false, // Mage must spend 2 points before continuing
    vendor: null,        // which shop vendor is open (null = vendor list)
    seedCounter: 1,
    // --- the current Day (transient — an abandoned mid-day is not resumed) ---
    day: null,           // tournament state (all brackets)
    playerBracket: null, // the bracket the player fights in
    dayById: null,       // id -> battle-ready char, rebuilt as champions grow
    pendingBout: null,   // the player's next unresolved match
    lastDay: null,       // sunset summary of the most recent finished day
  };

  function computeMax(player) {
    const c = CLASSES[player.classId];
    return { maxHp: c.startHp + player.bonusHp, maxMp: c.startMp + player.bonusMp };
  }

  function playerCombatChar() {
    const p = state.player, m = computeMax(p);
    const fade = AGE.mult(p.age); // you too, champion: peak, then decline
    return {
      name: p.name, classId: p.classId, wins: p.wins,
      maxHp: Math.max(1, Math.round(m.maxHp * fade)), maxMp: Math.round(m.maxMp * fade),
      meleeWeapon: p.equipment.melee, missileWeapon: p.equipment.missile,
      items: { ...(p.inventory || {}) },
      arrows: (p.arrows || []).slice(), activeArrow: p.activeArrow || "normal",
      armor: p.armor || null, armorDurability: p.armorDurability || 0,
      isPlayer: true,
    };
  }

  // ---- persistence (multi-world) ----
  function readIndex() {
    try {
      const ix = JSON.parse(G.store.get(INDEX_KEY));
      if (ix && Array.isArray(ix.worlds)) return ix;
    } catch (e) {}
    return { nextId: 1, worlds: [] };
  }
  function writeIndex(ix) { try { G.store.set(INDEX_KEY, JSON.stringify(ix)); } catch (e) {} }
  function worldMeta(id, d) {
    return {
      id, name: d.player.name, classId: d.player.classId,
      hold: (d.stronghold || {}).name || "",
      role: d.player.role || "champion", wins: d.player.wins,
      season: (d.clock || {}).season || 1, day: (d.clock || {}).day || 1,
    };
  }
  // One-time: the pre-worlds single save becomes a world slot.
  function migrateLegacy() {
    try {
      const raw = G.store.get(LEGACY_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.player) {
        const ix = readIndex();
        const id = "w" + ix.nextId++;
        G.store.set(worldKey(id), raw);
        ix.worlds.push(worldMeta(id, d));
        writeIndex(ix);
      }
      G.store.remove(LEGACY_KEY);
    } catch (e) {}
  }
  // A hold's seeded default name (GUI-54): "Ravenhold", "Stormgate"…
  function defaultHoldName(seed) {
    const rng = G.engine.makeRng((seed ^ 0x5747) >>> 0);
    const H = G.data.HOLD_NAMES;
    return G.engine.pick(rng, H.prefixes) + G.engine.pick(rng, H.suffixes);
  }
  // The Lord may rename the hold; commoners live where they live.
  function renameHold(name) {
    if (!state.stronghold || state.player.role !== "lord") return;
    const n = (name || "").trim().slice(0, 18);
    if (!n) return;
    state.stronghold.name = n;
    save(); emit();
  }

  /* ---- the Hold Chronicle (GUI-87) ----
   * The permanent, curated counterpart of the 20-cap news ring: one line per
   * event that matters in a hundred years. Append-only, never trimmed. Types:
   * founding · regime · succession · uprising · child · milestone · legend
   * (softfail arrives with Stewardship, conquest with Warfare). Entries are
   * {y, d, icon, type, text, refs} — refs name real records so the hold
   * profile card (GUI-88) can make every line tappable. The optional unique
   * key `k` guards once-only entries (a 100th win is one legend, not forty). */
  function chronicle(icon, type, text, opts) {
    const o = opts || {};
    if (!state.chronicle) state.chronicle = [];
    if (o.k && state.chronicle.some((e) => e.k === o.k)) return;
    const e = { y: o.y != null ? o.y : state.clock.season, d: o.d != null ? o.d : state.clock.day, icon, type, text };
    if (o.refs) e.refs = o.refs;
    if (o.k) e.k = o.k;
    state.chronicle.push(e);
  }
  // Page one of the chronicle. With a founder + archetype (GUI-86) it tells
  // the real story; without (very old saves mid-migration) a plain line.
  function foundingEntry(holdName, founder, archetypeId) {
    const a = archetypeId && G.data.ARCHETYPES[archetypeId];
    if (!founder || !a) return { y: 1, d: 1, icon: "🏰", type: "founding", text: `<b>${holdName}</b> was founded.` };
    return {
      y: 1, d: 1, icon: a.emoji, type: "founding",
      text: `<b>${holdName}</b> was founded by <b>${founder.name}</b> the ${CLASSES[founder.classId].name} — ${a.line}. The founder took the hold's first throne.`,
      refs: [founder.name],
    };
  }

  /* GUI-89: a founder's record — when a champion rides out to raise a banner,
   * the ledger mints the hold they go on to found: a seeded name (never this
   * hold's, never a sibling's) + an archetype by their temperament (exiles
   * always build in Spite). One tiny record; the living hold waits for the
   * multi-stronghold world (GUI-25), but trade and lore get real identities. */
  function mintHold(seed, personality, exile) {
    const rng = G.engine.makeRng(seed >>> 0);
    const H = G.data.HOLD_NAMES;
    const taken = new Set([(state.stronghold || {}).name].concat((state.departed || []).map((d) => d.holdName).filter(Boolean)));
    let holdName = G.engine.pick(rng, H.prefixes) + G.engine.pick(rng, H.suffixes);
    let guard = 0;
    while (taken.has(holdName) && guard++ < 24) holdName = G.engine.pick(rng, H.prefixes) + G.engine.pick(rng, H.suffixes);
    return { holdName, archetype: exile ? "spite" : G.worldgen.pickArchetype(rng, personality || {}) };
  }
  const nameHash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  // Every building in the catalogue starts unbuilt — derived, so new eras
  // (GUI-81+) join world creation and save migration automatically.
  const freshBuildings = () => { const b = {}; for (const k of Object.keys(BUILDINGS)) b[k] = 0; return b; };
  /* The archetype's FINGERPRINT (GUI-85): every origin leaves ONE permanent
   * mark — a building that was already standing, a hoard, or a site trait
   * (read live from stronghold.archetype: quarry/ford/hunter/spite). Applied
   * once (st.fingerprint guards), at creation and at old-save migration. */
  function applyFingerprint() {
    const st = state.stronghold;
    const a = st && G.data.ARCHETYPES[st.archetype];
    if (!st || !a || st.fingerprint) return;
    st.fingerprint = true;
    const fx = a.fx || {};
    if (fx.building && !(st.buildings[fx.building] > 0)) st.buildings[fx.building] = 1;
    if (fx.gold) st.treasury += fx.gold;
  }
  // What a building costs HERE (GUI-85): the Quarry's stone discounts every raise.
  function buildCost(id) {
    const st = state.stronghold, def = BUILDINGS[id];
    if (!st || !def) return null;
    const lvl = (st.buildings || {})[id] || 0;
    if (lvl >= def.max) return null;
    return Math.round(def.costs[lvl] * (st.archetype === "quarry" ? 1 - BUILDING_FX.archQuarryDiscount : 1));
  }

  function listWorlds() { migrateLegacy(); return readIndex().worlds; }
  function boot() { migrateLegacy(); state.screen = "title"; emit(); }

  function save() {
    if (!state.worldId) return;
    try {
      const blob = { player: state.player, npcs: state.npcs, lord: state.lord, stronghold: state.stronghold, household: state.household, defense: state.defense, board: state.board, departed: state.departed, clock: state.clock, lastSeason: state.lastSeason, challengeOpen: state.challengeOpen, throneRestUntil: state.throneRestUntil || 0, news: state.news, ledgerLog: state.ledgerLog, chronicle: state.chronicle || [], watchWarned: state.watchWarned || 0, seedCounter: state.seedCounter };
      G.store.set(worldKey(state.worldId), JSON.stringify(blob));
      const ix = readIndex();
      const i = ix.worlds.findIndex((w) => w.id === state.worldId);
      const meta = worldMeta(state.worldId, blob);
      if (i >= 0) ix.worlds[i] = meta; else ix.worlds.push(meta);
      writeIndex(ix);
    } catch (e) {}
  }
  // Erase a universe (permadeath / exile / start-over). In-memory state is
  // untouched so memorial screens can still render.
  function deleteWorld(id) {
    if (!id) return;
    try { G.store.remove(worldKey(id)); G.store.remove("guildz.facts." + id); G.store.remove("guildz.rollup." + id); } catch (e) {}
    const ix = readIndex();
    ix.worlds = ix.worlds.filter((w) => w.id !== id);
    writeIndex(ix);
  }
  function load(worldId) {
    try {
      migrateLegacy();
      if (!worldId) {
        const ws = readIndex().worlds;
        if (!ws.length) return false;
        worldId = ws[0].id;
      }
      const raw = G.store.get(worldKey(worldId));
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.player) return false;
      state.worldId = worldId;
      state.player = data.player;
      // Migrate saves created before equipment / inventory existed.
      if (!state.player.equipment) state.player.equipment = { ...CLASSES[state.player.classId].startEq };
      if (!state.player.inventory) state.player.inventory = {};
      if (!state.player.arrows) state.player.arrows = [];
      if (!state.player.activeArrow) state.player.activeArrow = "normal";
      if (state.player.armor === undefined) { state.player.armor = null; state.player.armorDurability = 0; }
      state.seedCounter = data.seedCounter || 1;
      // Migrate saves created before the resident roster existed.
      state.npcs = Array.isArray(data.npcs) && data.npcs.length
        ? data.npcs
        : G.roster.generateRoster((state.player.worldSeed || state.seedCounter * 2654435761) >>> 0, state.player.name);
      // Migrate saves created before fame / the world clock existed.
      if (state.player.popularity == null) state.player.popularity = 0;
      for (const n of state.npcs) if (n.popularity == null) n.popularity = 0;
      state.clock = data.clock && data.clock.day ? data.clock : { day: 1, season: 1 };
      state.lastSeason = data.lastSeason || null;
      // Migrate saves created before the Lord existed.
      if (state.player.role == null) state.player.role = "champion";
      // Migrate saves created before aging existed.
      if (state.player.age == null) state.player.age = AGE.start + Math.round(state.player.wins / 3);
      for (const n of state.npcs) if (n.age == null) n.age = AGE.start + Math.round(n.wins / 3);
      // Migrate saves created before personality existed (seeded per id).
      const pseed = (id) => { let h = state.player.worldSeed || 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
      for (const n of state.npcs) if (!n.personality) n.personality = G.roster.rollPersonality(G.engine.makeRng(pseed(n.id)));
      if (state.lord && !state.lord.personality) state.lord.personality = G.roster.rollPersonality(G.engine.makeRng(pseed(state.lord.name)));
      for (const h of state.household) if (!h.personality) h.personality = G.roster.rollPersonality(G.engine.makeRng(pseed(h.id)));
      state.lord = data.lord !== undefined ? data.lord
        : generateLord((state.player.worldSeed || state.seedCounter * 97) + 1);
      if (state.lord && state.lord.age == null) state.lord.age = AGE.start + Math.round(state.lord.wins / 3) + (state.lord.reignSeasons || 1) + 6;
      state.challengeOpen = !!data.challengeOpen;
      state.throneRestUntil = data.throneRestUntil || 0;
      state.news = Array.isArray(data.news) ? data.news : [];
      state.ledgerLog = Array.isArray(data.ledgerLog) ? data.ledgerLog : [];
      // Migrate saves created before the economy existed.
      state.stronghold = data.stronghold || { ...ECONOMY.start };
      if (!state.stronghold.name) state.stronghold.name = defaultHoldName(state.player.worldSeed || 7); // pre-GUI-54 saves
      if (!state.stronghold.buildings) state.stronghold.buildings = freshBuildings();
      for (const k of Object.keys(BUILDINGS)) if (state.stronghold.buildings[k] == null) state.stronghold.buildings[k] = 0; // eras added since this save
      if (!state.stronghold.foundedOn) state.stronghold.foundedOn = 1; // pre-GUI-84 saves: the hold has stood since the world clock began
      // Pre-GUI-87 saves: the chronicle opens with the founding it never wrote down.
      state.chronicle = Array.isArray(data.chronicle) ? data.chronicle : [foundingEntry(state.stronghold.name)];
      // Pre-GUI-86 saves: retro-roll a coherent origin (seeded — the same world
      // always remembers the same founder), and enrich the plain founding line.
      if (!state.stronghold.archetype) {
        const f = G.worldgen.rollFounding((state.player.worldSeed || 7) + 1);
        state.stronghold.archetype = f.archetype;
        state.stronghold.founder = { name: f.founder.name, classId: f.founder.classId };
        const first = state.chronicle[0];
        if (first && first.type === "founding" && !first.refs) state.chronicle[0] = foundingEntry(state.stronghold.name, f.founder, f.archetype);
      }
      applyFingerprint(); // pre-GUI-85 saves: the origin's mark arrives (once)
      state.watchWarned = data.watchWarned || 0;
      state.household = Array.isArray(data.household) ? data.household : [];
      state.departed = Array.isArray(data.departed) ? data.departed : [];
      // Pre-GUI-89 ledgers: founders who rode out before holds were minted.
      for (const d of state.departed) {
        if (d.reason === "found" && !d.holdName) {
          const m = mintHold(((state.player.worldSeed || 7) ^ nameHash(d.name) ^ ((d.season || 1) * 2654435761)) >>> 0, null, false);
          d.holdName = m.holdName; d.archetype = m.archetype;
        }
      }
      state.defense = data.defense || null;
      state.board = Array.isArray(data.board) ? data.board : [];
      state.screen = "home";
      return true;
    } catch (e) { return false; }
  }
  function nextSeed() { return (state.seedCounter = (state.seedCounter + 1) >>> 0); }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { for (const fn of listeners) fn(state); }

  // ---- actions ----
  function createCharacter(classId, name, worldSeed, holdName) {
    const seed = (worldSeed != null ? worldSeed : Date.now()) >>> 0;
    const ix = readIndex();
    state.worldId = "w" + ix.nextId++;
    writeIndex(ix);
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
      popularity: 0, // fame — the ladder to the Lord's throne
      role: "champion", // champion | servant | lord
      age: AGE.start,
      controller: "player", // the governance seam (GUI-26): ai | a player id
      worldSeed: seed, // seeds this world's population (deterministic world-gen)
    };
    state.npcs = G.roster.generateRoster(seed, state.player.name);
    // The founding comes FIRST (GUI-86): a veteran founder raises the hold and
    // takes its first throne — THEN history is fought on top of it, so the
    // reigning Lord on arrival is the founder or whoever toppled the line.
    const founding = G.worldgen.rollFounding(seed + 1);
    state.lord = founding.founder;
    const lordBox = { lord: state.lord };
    const history = G.worldgen.simulateHistory(state.npcs, lordBox, state.player.name, seed + 99);
    state.lord = lordBox.lord;
    state.stronghold = { ...ECONOMY.start, buildings: freshBuildings() };
    state.stronghold.name = (holdName || "").trim().slice(0, 18) || defaultHoldName(seed);
    state.stronghold.foundedOn = 1; // Year 1 — the world epoch IS this hold's founding (GUI-84)
    state.stronghold.founder = { name: founding.founder.name, classId: founding.founder.classId };
    state.stronghold.archetype = founding.archetype;
    applyFingerprint(); // GUI-85: the origin leaves its mark
    state.household = [];
    state.defense = null;
    state.board = history.board;
    state.clock = history.clock;
    state.lastSeason = history.lastSeason;
    state.challengeOpen = false;
    state.throneRestUntil = 0;
    state.news = [];
    state.ledgerLog = [];
    // The chronicle opens with the founding, then history's own regime fights
    // (GUI-86/87) — chronicle, lords line and worldgen finally agree.
    state.chronicle = [foundingEntry(state.stronghold.name, founding.founder, founding.archetype), ...(history.events || [])];
    state.lastThrone = null;
    state.screen = "home";
    save(); emit();
  }

  function go(screen) { state.screen = screen; state.vendor = null; emit(); }

  function openVendor(id) { state.vendor = id; emit(); }
  function closeVendor() { state.vendor = null; emit(); }

  /* The Lord's sales tax: champions pay it on every purchase; the Lord himself
   * pays none (he IS the taxman). */
  function taxedCost(base) {
    if (state.player && state.player.role === "lord") return base;
    const rate = state.stronghold ? state.stronghold.taxRate : 0;
    return Math.round(base * (1 + rate / 100));
  }
  // Residents' gear budgets: shrunk by the sales tax, lifted by the Armory.
  function gearScale() {
    const st = state.stronghold;
    if (!st) return 1;
    return 1 - st.taxRate / 100 + ((st.buildings || {}).armory || 0) * BUILDING_FX.armoryGear;
  }

  // Raise a building one level, paid from the treasury (GUI-15).
  function buyBuilding(id) {
    const st = state.stronghold, def = BUILDINGS[id];
    if (!def || !st || !state.player || state.player.role !== "lord") return false;
    const lvl = (st.buildings || {})[id] || 0;
    const price = buildCost(id);
    if (lvl >= def.max || price == null || st.treasury < price) return false;
    st.treasury -= price;
    st.buildings[id] = lvl + 1;
    if (lvl === 0) chronicle("🏗️", "milestone", `The <b>${def.name}</b> was raised.`, { k: "built:" + id }); // first raising only — upgrades are upkeep, not history
    save(); emit();
    return true;
  }

  function buyItem(itemId) {
    const p = state.player, it = ITEMS[itemId];
    if (!it || p.gold < taxedCost(it.cost)) return false;
    p.gold -= taxedCost(it.cost);
    p.inventory[itemId] = (p.inventory[itemId] || 0) + 1;
    save(); emit();
    return true;
  }

  // Special arrows (Thief only): buy once (owned), then load one as the active arrow.
  function buyArrow(arrowId) {
    const p = state.player, ar = ARROWS[arrowId];
    if (p.classId !== "thief" || !ar || arrowId === "normal") return false;
    if (p.arrows.includes(arrowId) || p.gold < taxedCost(ar.cost)) return false;
    p.gold -= taxedCost(ar.cost);
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
    if (!a || a.tier > (ARMOR_MAXTIER[p.classId] || 0) || p.gold < taxedCost(a.cost)) return false;
    p.gold -= taxedCost(a.cost);
    p.armor = armorId;
    p.armorDurability = a.durability; // fresh piece
    save(); emit();
    return true;
  }

  /* ---- the Day: a knockout tournament in your win-band (GUI-5/GUI-6) ----
   * Sunrise buckets everyone (player + residents) into bands-of-5 brackets.
   * Other bands auto-resolve; in YOUR band, your bouts are played turn-based
   * and the rest auto-resolve around you. One winner per band at sunset. */

  const npcById = (id) => state.npcs.find((n) => n.id === id);

  // NPC career effect for a won bout: +1 permanent win (gear derives from wins).
  function applyNpcBout(winnerId) {
    const n = npcById(winnerId);
    if (!n) return;
    n.wins += 1;
    if (state.dayById) state.dayById[n.id] = G.roster.combatChar(n, gearScale()); // mid-day growth
  }

  /* The Scribe (GUI-14): pin a bout's parchment to the board. NPC bouts store
   * the pre-fight snapshots + seed (prose re-rendered by replay, never stored);
   * player bouts keep their log verbatim (human moves can't be replayed). */
  function recordBout(rec) {
    let today = state.board[state.board.length - 1];
    if (!today || today.day !== state.clock.day || today.season !== state.clock.season) {
      today = { day: state.clock.day, season: state.clock.season, bouts: [] };
      state.board.push(today);
      while (state.board.length > BOARD.days) state.board.shift(); // old parchments come down
    }
    today.bouts.push(rec);
    // The FACT lives forever even after the parchment comes down (GUI-22):
    // a compact row per bout, plus an incrementally-updated career rollup
    // (GUI-24) — the cheap aggregate a decision AI reads instead of raw rows.
    try {
      const fk = "guildz.facts." + state.worldId, rk = "guildz.rollup." + state.worldId;
      const facts = JSON.parse(G.store.get(fk) || "[]");
      facts.push([state.clock.season, state.clock.day, rec.band != null ? rec.band : -1, rec.a.name, rec.b.name, rec.winner, rec.rounds || 0, rec.spec || 0]);
      while (facts.length > 4000) facts.shift(); // localStorage-era cap; unbounded on a row-store backend
      G.store.set(fk, JSON.stringify(facts));
      const roll = JSON.parse(G.store.get(rk) || "{}");
      for (const f of [rec.a, rec.b]) {
        const r = (roll[f.name] = roll[f.name] || { bouts: 0, wins: 0, stars: 0 });
        r.bouts += 1;
        if (f.name === rec.winner) { r.wins += 1; r.stars += rec.spec || 0; }
      }
      G.store.set(rk, JSON.stringify(roll));
    } catch (e) {}
  }

  // Head-to-head from the fact rows (GUI-47): every recorded meeting of two
  // names, whoever was listed first. [season, day, band, a, b, winner, ...]
  function headToHead(x, y) {
    try {
      const rows = JSON.parse(G.store.get("guildz.facts." + state.worldId) || "[]");
      const h = { meetings: 0, xWins: 0, yWins: 0 };
      for (const r of rows) {
        const a = r[3], b = r[4];
        if ((a === x && b === y) || (a === y && b === x)) {
          h.meetings++;
          if (r[5] === x) h.xWins++; else if (r[5] === y) h.yWins++;
        }
      }
      return h;
    } catch (e) { return { meetings: 0, xWins: 0, yWins: 0 }; }
  }

  // The rollup, read back (GUI-24): a champion's recorded career in O(1).
  function careerOf(name) {
    try { return JSON.parse(G.store.get("guildz.rollup." + state.worldId) || "{}")[name] || null; }
    catch (e) { return null; }
  }

  function autoResolveMatch(br, m) {
    const a = state.dayById[m.a], b = state.dayById[m.b];
    const res = G.tournament.autoBout(a, b, m.seed);
    m.rounds = res.rounds;
    m.spec = res.spec;
    G.tournament.reportBout(br, m, res.winnerId);
    recordBout({ band: br.band, round: m.round, a, b, winner: (res.winnerId === a.id ? a : b).name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed: m.seed });
    applyNpcBout(res.winnerId);
  }

  function startDay() {
    state.streak = 0;
    state.challengeOpen = false; // stepping onto the sand lets the moment pass
    const pc = playerCombatChar();
    pc.id = "player";
    const champs = [pc, ...state.npcs.map((n) => G.roster.combatChar(n, gearScale()))];
    state.dayById = {};
    for (const c of champs) state.dayById[c.id] = c;
    state.day = G.tournament.newDay(champs, nextSeed());
    state.playerBracket = state.day.brackets.find((b) => b.entrants.includes("player"));
    // The other bands fight at dawn, off-screen.
    for (const br of state.day.brackets) {
      if (br === state.playerBracket) continue;
      let m;
      while (!br.winner && (m = G.tournament.pendingMatch(br))) autoResolveMatch(br, m);
    }
    resumeDay();
  }
  function enterArena() { startDay(); }

  /* Advance the player's bracket: NPC bouts resolve instantly; stop when it's
   * the player's turn to fight (bracket screen) or the band is decided. */
  function resumeDay() {
    const br = state.playerBracket;
    if (!br) { go("home"); return; }
    while (!br.winner) {
      const pending = br.matches.filter((m) => !m.winner);
      const npcMatch = pending.find((m) => m.a !== "player" && m.b !== "player");
      if (npcMatch) { autoResolveMatch(br, npcMatch); continue; }
      const mine = pending.find((m) => m.a === "player" || m.b === "player");
      if (mine) {
        state.pendingBout = mine;
        state.screen = "bracket";
        save(); emit();
        return;
      }
      break; // no pending matches at all (shouldn't happen)
    }
    finishDay();
  }

  /* Sunset (shared by champion days AND the Lord's presided games): award fame
   * to every band champion, build the winners' board, tick the world clock
   * (season roll = −50% fame decay + the challenge gate). */
  function settleDay(day, byId, playerBracket) {
    const nameOf = (id) => (id === "player" ? state.player.name : ((byId && byId[id]) || npcById(id) || {}).name || "?");
    // Popularity: Σ perBout(band) × Crowd Rating over the champion's won bouts
    // (the decided formula, per-bout variant; a forfeit walkover pays 0).
    const awardFame = (br) => {
      let gain = G.spectacle.fameFor(br.matches, br.winner, POPULARITY.perBout(br.band), POPULARITY.specMult);
      if (br.winner === "player") state.player.popularity = (state.player.popularity || 0) + gain;
      else {
        const n = npcById(br.winner);
        if (n) {
          // Chapel (GUI-81): the Steadfast are honoured — a loyal champion's day counts a little extra.
          if (gain > 0 && ((n.personality || {}).loy || 0) >= 0.7) gain += ((state.stronghold.buildings || {}).chapel || 0);
          n.popularity = (n.popularity || 0) + gain;
        }
      }
      return gain;
    };
    const champion = playerBracket && playerBracket.winner === "player";
    state.lastDay = {
      band: playerBracket ? playerBracket.band : 0,
      bandLabel: G.tournament.bandLabel(playerBracket ? playerBracket.band : 0),
      boutsWon: playerBracket ? playerBracket.boutsWon.player || 0 : 0,
      champion: !!champion,
      popGain: 0,
      board: day.brackets.map((br) => ({
        band: br.band,
        label: G.tournament.bandLabel(br.band),
        name: nameOf(br.winner),
        classId: br.winner === "player" ? state.player.classId : ((byId && byId[br.winner]) || {}).classId,
        boutsWon: br.boutsWon[br.winner] || 0,
        popGain: awardFame(br),
        isPlayer: br.winner === "player",
      })),
    };
    if (champion) state.lastDay.popGain = (state.lastDay.board.find((w) => w.isPlayer) || {}).popGain || 0;

    // The sun sets: the world clock ticks; a finished season halves all fame.
    state.clock.day += 1;
    if (state.clock.day > SEASON.days) {
      state.lastSeason = {
        season: state.clock.season,
        top: fameLadder().slice(0, 3).map((r) => ({ name: r.name, classId: r.classId, popularity: r.popularity, isPlayer: !!r.isPlayer })),
      };
      // The season's #1 — if that's YOU — earns the right to challenge the
      // Lord (optional). Standings are judged pre-decay.
      state.challengeOpen = !!(state.lord && state.player.role !== "lord" &&
        state.lastSeason.top[0] && state.lastSeason.top[0].isPlayer && state.lastSeason.top[0].popularity > 0);
      // …and if a RESIDENT is #1, they come for the throne (the Defend loop):
      // for YOUR crown if you reign, or for your Lord's — with YOU fielded —
      // if you serve. A challenge must be answered (the Lord cannot refuse).
      if (!state.defense && (state.player.role === "lord" || state.player.role === "servant")) {
        // AMBITION (GUI-42) gates who dares: the most famous AMBITIOUS resident
        // among the fame top-3 comes for the crown; the meek stand aside.
        const famous = fameLadder().filter((r) => !r.isPlayer && r.popularity > 0).slice(0, 3);
        const bold = famous.find((r) => { const n = npcById(r.id); return n && (!n.personality || n.personality.amb >= 0.3); });
        if (bold && !(state.lastSeason.top[0] && state.lastSeason.top[0].isPlayer)) {
          state.defense = { challengerId: bold.id, name: bold.name, season: state.clock.season, fielded: state.player.role === "servant" };
          state.lastDay.defenseComing = bold.name;
        }
      }
      // GUI-72: while YOU hold no seat, the throne is still a prize — the
      // boldest famous resident lays a claim (resolved after the roll, when
      // the world's beds are settled). Your #1 finish always outranks theirs.
      let npcClaim = null;
      if (state.lord && state.player.role !== "lord" && state.player.role !== "servant" && !state.challengeOpen
          && state.clock.season >= (state.throneRestUntil || 0)) {
        // Gates that keep reigns at the designed 5–6 seasons: any real fame won
        // pre-decay, not residue), ambition, and a season of rest after any
        // rebellion — the Stronghold suffers no two in quick succession.
        const famous = fameLadder().filter((r) => !r.isPlayer && r.popularity > 0).slice(0, 3);
        const bold = famous.find((r) => { const n = npcById(r.id); return n && (!n.personality || n.personality.amb >= 0.3); });
        if (bold) { npcClaim = bold.id; state.throneRestUntil = state.clock.season + 2; }
      }
      state.player.popularity = Math.round((state.player.popularity || 0) / 2);
      for (const n of state.npcs) n.popularity = Math.round((n.popularity || 0) / 2);
      state.clock.season += 1;
      state.clock.day = 1;
      state.lastDay.seasonEnd = state.lastSeason; // surfaced on the sunset screens
      state.lastDay.mayChallenge = state.challengeOpen;

      // ---- the season's turn: everyone ages a year (GUI-17) ----
      const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
      state.player.age = (state.player.age || AGE.start) + 1;
      for (const n of state.npcs) n.age = (n.age || AGE.start) + 1;
      for (const h of state.household) h.age = (h.age || AGE.start) + 1;
      if (state.lord) state.lord.age = (state.lord.age || 40) + 1;
      // Fresh hopefuls arrive to fill emptied beds (shared by churn + departures).
      const arriveHopefuls = (count, prefix) => {
        if (count <= 0) return;
        const fresh = G.roster.generateRoster(((state.player.worldSeed || 1) ^ (state.clock.season * 2654435761) ^ hash(prefix)) >>> 0, state.player.name, count, prefix + state.clock.season + "_");
        const taken = new Set(state.npcs.map((n) => n.name).concat(state.household.map((h) => h.name), state.lord ? [state.lord.name] : []));
        for (const f of fresh) {
          f.wins = Math.min(f.wins, 4); f.age = AGE.start + (hash(f.id) % 4);
          while (taken.has(f.name)) f.name += " II"; // no two champions share a name (narration keys on it)
          taken.add(f.name);
          state.npcs.push(f);
        }
      };
      // Old residents bow out; young hopefuls take their beds (churn's first cycle).
      const retiring = state.npcs.filter((n) => n.age >= AGE.retire + (hash(n.id) % 12));
      if (retiring.length) {
        state.npcs = state.npcs.filter((n) => !retiring.includes(n));
        arriveHopefuls(retiring.length, "a");
        state.lastDay.retired = retiring.map((r) => r.name);
      }
      /* Idle veterans move on (GUI-60, user design): a resident who fought NO
       * bouts all season — alone at the top, fame-locked out of the throne —
       * decides by temperament: the AMBITIOUS ride out to FOUND their own hold
       * (the founders' ledger seeds the multi-stronghold world, GUI-25), the
       * RESTLESS leave for adventure, the steadfast linger another year. */
      {
        const closing = state.lastSeason.season;
        let fought = null;
        try {
          fought = new Set();
          for (const f of JSON.parse(G.store.get("guildz.facts." + state.worldId) || "[]")) {
            if (f[0] === closing) { fought.add(f[3]); fought.add(f[4]); }
          }
        } catch (e) { fought = null; }
        if (fought) {
          const departures = [];
          for (const n of state.npcs.slice()) {
            if (n.wins < 25 || fought.has(n.name)) continue; // only idle VETERANS stagnate
            const P = n.personality || {};
            const stay = (((state.stronghold || {}).buildings || {}).chapel || 0) * BUILDING_FX.chapelLoyalty; // the Chapel makes leaving harder (GUI-81)
            const reason = (P.amb != null ? P.amb : 0.5) >= 0.5 + stay ? "found"
              : (P.brv != null ? P.brv : 0.5) >= 0.4 + stay ? "adventure" : null;
            if (!reason) continue; // the steadfast wait for a worthy rival
            const dep = { name: n.name, classId: n.classId, wins: n.wins, age: n.age, reason, season: closing };
            if (reason === "found") { // GUI-89: the ledger mints the hold they ride out to raise
              const m = mintHold(((state.player.worldSeed || 1) ^ nameHash(n.name) ^ (closing * 2654435761)) >>> 0, P, false);
              dep.holdName = m.holdName; dep.archetype = m.archetype;
            }
            departures.push(dep);
            state.npcs = state.npcs.filter((x) => x.id !== n.id);
          }
          if (departures.length) {
            state.departed = (state.departed || []).concat(departures).slice(-12); // the founders' ledger
            state.lastDay.departures = departures;
            arriveHopefuls(departures.length, "d");
          }
        }
      }
      // GUI-72: the claim is answered — the Lord's wall in order, then the
      // Lord himself. Same law as ever: 50% replenish, fallen servants die,
      // and every bout is pinned to the board (👑 on the new season's day 1).
      if (npcClaim) {
        const npc = npcById(npcClaim);
        if (npc && state.lord) {
          const ch = G.roster.combatChar(npc, gearScale());
          let chHp = ch.maxHp, chMp = ch.maxMp;
          const news = { challenger: npc.name, lordName: state.lord.name };
          const order = state.household.slice().sort((a, b) => b.wins - a.wins);
          let stopped = false;
          for (const servant of order) {
            const sChar = G.roster.combatChar(servant, 1);
            const worn = { ...ch, startHp: chHp, startMp: chMp };
            const seed = nextSeed();
            const res = G.tournament.autoBout(worn, sChar, seed);
            recordBout({ a: worn, b: sChar, winner: res.winnerId === worn.id ? worn.name : sChar.name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed, gauntlet: true });
            if (res.winnerId === sChar.id) {
              servant.wins += 1;
              news.result = "held"; news.by = servant.name; news.fate = challengerFate(npc, seed);
              stopped = true;
              break;
            }
            state.household = state.household.filter((s) => s.id !== servant.id);
            const after = G.tournament.replayBout(worn, sChar, seed);
            const chSide = after.you.name === npc.name ? after.you : after.foe;
            chHp = Math.min(ch.maxHp, Math.round(chSide.hp + ch.maxHp * 0.5));
            chMp = Math.min(ch.maxMp, Math.round(chSide.mp + ch.maxMp * 0.5));
          }
          if (!stopped) {
            const lc = lordCombatChar();
            // No wall of servants? The keep guard still harries the way in.
            if (!order.length) {
              chHp = Math.round(chHp * keepWear(LORD.keepGuardWear));
              chMp = Math.round(chMp * keepWear(LORD.keepGuardWear));
            }
            const worn = { ...ch, startHp: chHp, startMp: chMp };
            const seed = nextSeed();
            const res = G.tournament.autoBout(worn, lc, seed);
            recordBout({ a: worn, b: lc, winner: res.winnerId === worn.id ? worn.name : lc.name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed, throne: true });
            if (res.spec === 5) chronicle("🌟", "legend", `The throne duel of Year ${state.clock.season} — <b>${res.winnerId === worn.id ? worn.name : lc.name}</b> over <b>${res.winnerId === worn.id ? lc.name : worn.name}</b> — was a five-star classic the bards took up at once.`, { refs: [worn.name, lc.name] });
            if (res.winnerId === worn.id) {
              news.result = "usurped";
              state.lord = { name: npc.name, classId: npc.classId, wins: npc.wins, reignSeasons: 0, age: npc.age, personality: npc.personality };
              state.npcs = state.npcs.filter((x) => x.id !== npc.id);
              arriveHopefuls(1, "t");
              // The keep KNEELS to the victor (GUI-73, user design): the guard
              // that harried the way in swears on as NAMED servants — every
              // Lord after the first defends with a real, recordable wall.
              const guards = G.roster.generateRoster(((state.player.worldSeed || 1) ^ (state.clock.season * 7919) ^ 0xBEEF) >>> 0, state.player.name, 3, "g" + state.clock.season + "_");
              const taken = new Set(state.npcs.map((x) => x.name).concat([state.lord.name, state.player.name], (state.departed || []).map((x) => x.name)));
              state.household = guards.map((f) => {
                while (taken.has(f.name)) f.name += " II";
                taken.add(f.name);
                return { id: f.id, name: f.name, classId: f.classId, wins: Math.max(20, Math.round(npc.wins * 0.7)), age: AGE.start + 8, personality: f.personality };
              });
              news.sworn = state.household.map((h) => h.name);
            } else {
              news.result = "held"; news.by = state.lord.name; news.fate = challengerFate(npc, seed);
            }
          }
          state.lastDay.npcThrone = news;
        }
      }
      if (state.player.role === "lord") {
        // An undefeated Lord dies ON the throne — the rarest of endings.
        if (state.player.age >= AGE.lifespan + (hash(state.player.name) % 12)) {
          state.lastThrone = { oldAge: true, reignSeasons: state.clock.season - (state.player.crownedSeason || 1) };
          state.lastDay.runEnded = true;
        }
      } else if (state.lord && state.lord.age >= AGE.lifespan + (hash(state.lord.name) % 12)) {
        // The old Lord dies; the crown passes to the people's favourite.
        const dead = state.lord.name;
        state.lastDay.lordDied = dead;
        if (state.player.role === "servant") state.player.role = "champion"; // the household dissolves — you are free
        state.defense = null; state.challengeOpen = false;
        const ladder = fameLadder();
        const heir = ladder.find((r) => r.popularity > 0) || ladder.find((r) => !r.isPlayer);
        if (heir && heir.isPlayer) {
          state.player.role = "lord";
          state.player.crownedSeason = state.clock.season;
          state.lord = null;
          state.lastThrone = { won: true, oldAge: true, lordName: dead };
          state.lastDay.crownedYou = true;
        } else if (heir) {
          const npc = npcById(heir.id);
          state.lord = { name: npc.name, classId: npc.classId, wins: npc.wins, reignSeasons: 0, age: npc.age };
          state.npcs = state.npcs.filter((x) => x.id !== npc.id);
          state.lastDay.newLord = npc.name;
        }
      }
    }
    // ---- the town crier hears everything (GUI-53) ----
    {
      const rolled = !!state.lastDay.seasonEnd; // clock already ticked past the settled day
      const cry = (icon, text) => state.news.push({ s: rolled ? state.clock.season - 1 : state.clock.season, d: rolled ? G.data.SEASON.days : Math.max(1, state.clock.day - 1), icon, text });
      const nt = state.lastDay.npcThrone;
      if (nt && nt.result === "usurped") cry("👑", `<b>${nt.challenger}</b> stormed the keep — the throne FELL. A new Lord rules.${nt.sworn ? " The keep's guard knelt to the victor." : ""}`);
      else if (nt) cry("🛡️", `<b>${nt.challenger}</b> came for the throne — <b>${nt.by}</b> ${nt.by === nt.lordName ? "cut them down" : "held the wall"}.`);
      for (const d2 of state.lastDay.departures || []) cry(d2.reason === "found" ? "🐎" : "🌄", `<b>${d2.name}</b> (${d2.wins}w) ${d2.reason === "found" ? "rode out to raise a banner of their own" : "left to seek adventure beyond the gates"}.`);
      for (const r of state.lastDay.retired || []) cry("🍂", `<b>${r}</b> hung up their blade — a young hopeful took the empty bed.`);
      if (state.lastDay.newLord) cry("⚱️", `The old Lord died on the throne. <b>${state.lastDay.newLord}</b>, most famed of the residents, was raised in their place.`);
      if (state.lastDay.defenseComing) cry("⚠️", `<b>${state.lastDay.defenseComing}</b> eyes the throne — a challenge comes with the new year.`);
      if (state.lastDay.mayChallenge) cry("👑", `The year was <b>yours</b> — the right to challenge the Lord awaits at home.`);
      else if (state.lastDay.seasonEnd && state.lastDay.seasonEnd.top[0]) cry("⭐", `Year ${state.lastDay.seasonEnd.season} closed with <b>${state.lastDay.seasonEnd.top[0].name}</b> atop the fame ladder (⭐${state.lastDay.seasonEnd.top[0].popularity}).`);
      // 🗼 The Watchtower at full height (GUI-81): it hears a claim brewing
      // DAYS before season's end — time to order the wall, not just meet it.
      if (!rolled && state.player.role === "lord" && !state.defense
          && (((state.stronghold || {}).buildings || {}).watchtower || 0) >= BUILDING_FX.watchWarnAt
          && (state.watchWarned || 0) !== state.clock.season) {
        const famous = fameLadder().filter((r) => !r.isPlayer && r.popularity > 0).slice(0, 3);
        const brewing = famous.find((r) => { const n = npcById(r.id); return n && (!n.personality || n.personality.amb >= 0.3); });
        if (brewing) { state.watchWarned = state.clock.season; cry("🗼", `The watchtower hears whispers: <b>${brewing.name}</b> courts the crowd — a claim is brewing for season's end.`); }
      }
      while (state.news.length > 20) state.news.shift();
      // ---- and the Chronicle keeps what matters in a hundred years (GUI-87) ----
      const when = { y: rolled ? state.clock.season - 1 : state.clock.season, d: rolled ? G.data.SEASON.days : Math.max(1, state.clock.day - 1) };
      if (nt && nt.result === "usurped") chronicle("👑", "regime", `<b>${nt.challenger}</b> stormed the keep and took the throne from <b>${nt.lordName}</b>.`, { d: 1, refs: [nt.challenger, nt.lordName] }); // dated with its 👑 parchment: the new year's day 1
      else if (nt) chronicle("🛡️", "regime", `<b>${nt.challenger}</b> came for the throne — <b>${nt.by}</b> held it.`, { d: 1, refs: [nt.challenger, nt.by] });
      for (const d2 of state.lastDay.departures || []) if (d2.reason === "found") {
        const a2 = d2.archetype && G.data.ARCHETYPES[d2.archetype];
        chronicle("🐎", "child", d2.holdName
          ? `<b>${d2.name}</b> rode out and founded <b>${d2.holdName}</b>${a2 ? ` — ${a2.line}` : ""}.`
          : `<b>${d2.name}</b> rode out to raise a banner of their own.`, { ...when, refs: [d2.name] });
      }
      if (state.lastDay.lordDied) chronicle("⚱️", "succession", `Lord <b>${state.lastDay.lordDied}</b> died on the throne; <b>${state.lastDay.newLord || state.player.name}</b> was raised in their place.`, { ...when, refs: [state.lastDay.lordDied, state.lastDay.newLord || state.player.name] });
      // Legends: the hundredth career win, chronicled once per name.
      for (const c of [state.player, ...state.npcs, ...(state.household || [])]) {
        if (c && (c.wins || 0) >= 100) chronicle("💯", "legend", `<b>${c.name}</b> won their hundredth bout — a career for the ages.`, { ...when, k: "w100:" + c.name, refs: [c.name] });
      }
    }
    return state.lastDay;
  }

  function finishDay(keepScreen) {
    const champion = state.playerBracket && state.playerBracket.winner === "player";
    settleDay(state.day, state.dayById, state.playerBracket);
    state.day = null; state.playerBracket = null; state.dayById = null; state.pendingBout = null;
    if (state.lastDay.runEnded) { perish("throne-age"); return; } // died on the throne
    if (state.lastDay.crownedYou) state.screen = "coronation"; // the empty throne is yours
    else if (champion) state.screen = "day-champion";
    else if (!keepScreen) state.screen = "loss"; // normally already there
    save(); emit();
  }

  // The Stronghold's fame ladder: player + residents, most famous first.
  function fameLadder() {
    const rows = [
      { id: "player", name: state.player.name, classId: state.player.classId, wins: state.player.wins, popularity: state.player.popularity || 0, isPlayer: true },
      ...state.npcs.map((n) => ({ id: n.id, name: n.name, classId: n.classId, wins: n.wins, popularity: n.popularity || 0 })),
    ];
    return rows.sort((a, b) => b.popularity - a.popularity || b.wins - a.wins);
  }

  function champName(id) {
    if (id === "player") return state.player.name;
    const c = (state.dayById && state.dayById[id]) || npcById(id);
    return c ? c.name : "?";
  }

  // The player steps onto the sand for their pending bout.
  function fightBout() {
    const m = state.pendingBout;
    if (!m || state.screen !== "bracket") return;
    const foeId = m.a === "player" ? m.b : m.a;
    state.foe = state.dayById[foeId];
    state.battle = G.combat.newBattle(playerCombatChar(), state.foe, m.seed);
    state.allocPending = false;
    state.screen = "battle";
    emit();
  }

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
    // A throne DEFENCE resolves outside the brackets.
    if (state.throneDefense && state.battle.phase !== "choose") {
      state.lastSpec = G.spectacle.rate(state.battle, state.battle.phase === "won" ? "you" : "foe");
      resolveDefense(state.battle.phase === "won");
      emit();
      return;
    }
    // The throne duel resolves outside the brackets.
    if (state.throneFight && state.battle.phase !== "choose") {
      state.lastSpec = G.spectacle.rate(state.battle, state.battle.phase === "won" ? "you" : "foe");
      recordPlayerBout({ throne: true });
      if (state.battle.phase === "won") coronation();
      else throneLoss();
      emit();
      return;
    }
    if (state.battle.phase === "won") {
      const m = state.pendingBout;
      state.lastSpec = G.spectacle.rate(state.battle, "you"); // the crowd's verdict
      if (m && state.playerBracket) {
        m.rounds = state.battle.round;
        m.spec = state.lastSpec.stars;
        G.tournament.reportBout(state.playerBracket, m, "player");
        recordPlayerBout({ band: state.playerBracket.band, round: m.round });
        state.pendingBout = null;
      }
      onWin(); // win screen first; "Continue the day" resumes the bracket
    } else if (state.battle.phase === "lost") {
      const m = state.pendingBout;
      state.lastSpec = G.spectacle.rate(state.battle, "foe");
      if (m && state.playerBracket) {
        m.rounds = state.battle.round;
        m.spec = state.lastSpec.stars;
        const foeId = m.a === "player" ? m.b : m.a;
        G.tournament.reportBout(state.playerBracket, m, foeId);
        recordPlayerBout({ band: state.playerBracket.band, round: m.round });
        applyNpcBout(foeId); // beating you is a career win for them
        state.pendingBout = null;
      }
      onLoss(); // loss screen
      // The bracket finishes without you; sunset board lands on the loss screen.
      if (state.playerBracket) {
        const br = state.playerBracket;
        let nm;
        while (!br.winner && (nm = G.tournament.pendingMatch(br))) autoResolveMatch(br, nm);
        finishDay(true); // keep the loss screen
      }
    }
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

  // A bout the human fought: the log is kept verbatim (their moves can't be
  // re-derived from a seed), with slim fighter headers for the narrator.
  function recordPlayerBout(extra) {
    const b = state.battle;
    const slim = (f) => ({ name: f.name, classId: f.classId, wins: f.wins, meleeWeapon: f.meleeWeapon, missileWeapon: f.missileWeapon });
    recordBout(Object.assign({
      a: slim(b.you), b: slim(b.foe), youIsA: true,
      winner: b.phase === "won" ? b.you.name : b.foe.name,
      rounds: b.round, spec: state.lastSpec ? state.lastSpec.stars : null,
      hl: state.lastSpec ? (state.lastSpec.comeback ? "comeback" : state.lastSpec.nailBiter ? "nailbiter" : state.lastSpec.rout ? "rout" : null) : null,
      log: b.log,
    }, extra || {}));
  }

  // Open a parchment from the Bulletin Board.
  function openBout(di, bi) {
    if (!state.board[di] || !state.board[di].bouts[bi]) return;
    state.viewBout = { di, bi };
    state.screen = "parchment";
    emit();
  }

  /* ---- the throne DEFENCE: the servant gauntlet (GUI-16/41/43) ----
   * A challenger must beat the Lord's servants IN ORDER, then the Lord.
   * Defenders fight fresh; the challenger replenishes only 50% of max HP/MP
   * between bouts. A beaten servant DIES. A beaten challenger faces
   * die / serve / exile. The throne falls only when the LORD falls. */

  const barracksSlots = () => ((state.stronghold || {}).buildings || {}).barracks || 0;

  // The keep's wear on an unopposed challenger (GUI-81 Walls & Gatehouse):
  // base wear (1.0 for a player-lord's open keep, LORD.keepGuardWear for the
  // abstract guard) minus 5pp per Walls level — the gatehouse makes them
  // bleed for the approach. Floor 40%: stone alone never wins the duel.
  function keepWear(base) {
    const lvl = ((state.stronghold || {}).buildings || {}).walls || 0;
    return Math.max(0.4, base - lvl * BUILDING_FX.wallsWear);
  }

  // A beaten challenger's fate — their PERSONALITY chooses (GUI-42):
  // the loyal and level-headed kneel; the proud ride out; the fearless die.
  function challengerFate(npc, seed) {
    const r = G.engine.makeRng((seed >>> 0) + 17)();
    const P = npc.personality || {};
    state.npcs = state.npcs.filter((x) => x.id !== npc.id); // leaves the roster either way
    const kneel = 0.2 + 0.6 * (P.loy != null ? P.loy : 0.5) // loyalty bends the knee…
      + (((state.stronghold || {}).buildings || {}).chapel || 0) * BUILDING_FX.chapelLoyalty; // …and the Chapel bends it further (GUI-81)
    const room = state.player.role === "lord" ? state.household.length < barracksSlots()
      : !!state.lord && state.household.length < 3; // NPC keeps hold 3 (GUI-73)
    if (r < kneel && room) {
      state.household.push({ id: npc.id, name: npc.name, classId: npc.classId, wins: npc.wins, age: npc.age, personality: npc.personality });
      return "serve"; // kneels — your wall grows
    }
    return r < 1 - 0.3 * (P.brv != null ? P.brv : 0.5) ? "exile" : "die";
  }

  // Answer the challenge. Lord: the household fights first. Servant: YOU are
  // the household — your Lord fields you, to the death.
  function beginDefense() {
    const d = state.defense;
    if (!d) return;
    const npc = npcById(d.challengerId);
    if (!npc) { state.defense = null; save(); emit(); return; } // challenger gone (edge)
    const ch = G.roster.combatChar(npc, gearScale());
    state.defenseRun = { bouts: [], chHp: ch.maxHp, chMp: ch.maxMp, fielded: !!d.fielded };
    if (d.fielded) { startDefenseDuel(null, "missile"); return; } // servants get no perks
    if (!state.household.length) { // no wall of servants — the WALLS take their toll (GUI-81)
      state.defenseRun.chHp = Math.round(ch.maxHp * keepWear(1));
      state.defenseRun.chMp = Math.round(ch.maxMp * keepWear(1));
    }
    // The gauntlet in the LORD'S chosen order (GUI-51): household[0] fights
    // first. Speed-bumps-first or stopper-first is his decree to make.
    const order = state.household.slice();
    for (const servant of order) {
      const sChar = G.roster.combatChar(servant, 1); // the armory keeps its own fed
      const worn = { ...ch, startHp: state.defenseRun.chHp, startMp: state.defenseRun.chMp };
      const seed = nextSeed();
      const res = G.tournament.autoBout(worn, sChar, seed);
      recordBout({ a: worn, b: sChar, winner: res.winnerId === worn.id ? worn.name : sChar.name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed, gauntlet: true });
      const boutNote = { servant: servant.name, challenger: npc.name, spec: res.spec };
      if (res.winnerId === sChar.id) {
        // The wall holds. The challenger faces their fate; the servant grows.
        servant.wins += 1;
        boutNote.result = "held";
        state.defenseRun.bouts.push(boutNote);
        state.lastDefense = { won: true, byServant: servant.name, challenger: npc.name, fate: challengerFate(npc, seed), bouts: state.defenseRun.bouts };
        chronicle("🛡️", "regime", `<b>${npc.name}</b> came for the throne — <b>${servant.name}</b> held the wall.`, { refs: [npc.name, servant.name] });
        state.defense = null; state.defenseRun = null;
        state.screen = "defended";
        save(); emit();
        return;
      }
      // The servant falls — permanently.
      boutNote.result = "fell";
      state.defenseRun.bouts.push(boutNote);
      state.household = state.household.filter((s) => s.id !== servant.id);
      // Replay the wear on the challenger, then patch half their wounds.
      const after = G.tournament.replayBout(worn, sChar, seed);
      const chSide = after.you.name === npc.name ? after.you : after.foe;
      state.defenseRun.chHp = Math.min(ch.maxHp, Math.round(chSide.hp + ch.maxHp * 0.5));
      state.defenseRun.chMp = Math.min(ch.maxMp, Math.round(chSide.mp + ch.maxMp * 0.5));
    }
    // The challenger stands before YOU, worn from the gauntlet.
    state.screen = "defense-prep";
    save(); emit();
  }

  /* Household management (decided): to make room — or on a whim — the Lord may
   * RELEASE a servant (freed: rejoins the arena), EXILE them (the wilds,
   * one-way), or KILL them. */
  // Promote/demote a servant in the gauntlet order (GUI-51).
  function moveServant(id, dir) {
    if (!state.player || state.player.role !== "lord") return;
    const i = state.household.findIndex((x) => x.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= state.household.length) return;
    const t = state.household[i]; state.household[i] = state.household[j]; state.household[j] = t;
    save(); emit();
  }

  function removeServant(id, how) {
    if (!state.player || state.player.role !== "lord") return;
    const s = state.household.find((x) => x.id === id);
    if (!s) return;
    state.household = state.household.filter((x) => x.id !== id);
    if (how === "release") state.npcs.push({ id: s.id, name: s.name, classId: s.classId, wins: s.wins, popularity: 0 });
    // exile / kill: gone from the world (churn arrivals come with D2.2)
    save(); emit();
  }

  // The Lord's building-gated boons for the final duel (GUI-43).
  function defensePerks() {
    const b = (state.stronghold || {}).buildings || {};
    return [
      { id: "crowd", name: "Home crowd", emoji: "📣", ok: (b.seating || 0) >= 1, why: "needs Arena Seating", desc: "The roar of your stands: +5% To Hit, +5% To Crit." },
      { id: "armory", name: "The armory", emoji: "🛡️", ok: (b.armory || 0) >= 1, why: "needs the Armory", desc: "The vault's finest: top enchanted armor (fire arrows for a thief)." },
      { id: "treasury", name: "Treasury stock", emoji: "🧪", ok: (state.stronghold || {}).treasury >= 200, why: "needs 🏛️200", desc: "Enter with 1 HP + 1 MP potion (costs 🏛️200)." },
    ];
  }

  // The final duel: you, fresh, on your own sand (or fielded as a servant).
  function startDefenseDuel(perk, openRange) {
    const d = state.defense, run = state.defenseRun;
    if (!d || !run) return;
    const npc = npcById(d.challengerId);
    const me = playerCombatChar();
    if (!run.fielded) {
      me.regen = (((state.stronghold || {}).buildings || {}).infirmary || 0) * BUILDING_FX.infirmaryRegen;
      if (perk === "crowd") { me.toHitBonus = LORD.crowd.toHit; me.toCritBonus = LORD.crowd.toCrit; }
      if (perk === "armory") {
        const best = Object.values(ARMOR).filter((a) => a.magical && a.tier <= (ARMOR_MAXTIER[state.player.classId] || 0)).sort((a, b) => b.dr - a.dr)[0];
        if (best) { me.armor = best.id; me.armorDurability = best.durability; }
        if (state.player.classId === "thief") { me.arrows = ["fire"]; me.activeArrow = "fire"; }
      }
      if (perk === "treasury" && state.stronghold.treasury >= 200) {
        state.stronghold.treasury -= 200;
        me.items = { ...me.items, potion_healing: (me.items.potion_healing || 0) + 1, potion_mana: (me.items.potion_mana || 0) + 1 };
      }
    }
    const ch = G.roster.combatChar(npc, gearScale());
    ch.startHp = run.chHp; ch.startMp = run.chMp;
    state.foe = ch;
    state.throneDefense = true;
    state.battle = G.combat.newBattle(me, ch, nextSeed(), openRange);
    state.allocPending = false;
    state.screen = "battle";
    save(); emit();
  }

  // The defence resolves: hold the throne, or lose everything to the upstart.
  function resolveDefense(won) {
    const d = state.defense, npc = npcById(d.challengerId);
    recordPlayerBout({ throne: true, gauntlet: !!(state.defenseRun && !state.defenseRun.fielded) });
    if (won) {
      const p = state.player;
      p.wins += 1; p.battlesWon += 1; // a defence is a career victory
      if (state.defenseRun && state.defenseRun.fielded) {
        // A fielded servant is rewarded with growth (the Serve loop's engine).
        if (CLASSES[p.classId].caster) { p.bonusHp += 1; p.bonusMp += 1; } else { p.bonusHp += POINTS_PER_WIN; }
        state.lastDefense = { won: true, fielded: true, challenger: npc.name, fate: (state.npcs = state.npcs.filter((x) => x.id !== npc.id), "exile"), bouts: [] };
        chronicle("🛡️", "regime", `<b>${npc.name}</b> came for the throne — <b>${p.name}</b> held the wall for Lord <b>${state.lord.name}</b>.`, { refs: [npc.name, p.name, state.lord.name] });
      } else {
        state.lastDefense = { won: true, challenger: npc.name, fate: challengerFate(npc, state.battle.seed), bouts: state.defenseRun.bouts };
        chronicle("🛡️", "regime", `<b>${npc.name}</b> came for the throne — Lord <b>${p.name}</b> held it.`, { refs: [npc.name, p.name] });
        if (state.lastSpec && state.lastSpec.stars === 5) chronicle("🌟", "legend", `The throne duel of Year ${state.clock.season} — Lord <b>${p.name}</b> over <b>${npc.name}</b> — was a five-star classic the bards took up at once.`, { refs: [p.name, npc.name] });
      }
      state.defense = null; state.defenseRun = null; state.throneDefense = false;
      state.screen = "defended";
      save();
      return;
    }
    // The throne falls (or the fielded servant dies with no mercy).
    if (state.defenseRun && state.defenseRun.fielded) {
      state.lastThrone = { won: false, uprising: false, lordName: npc.name, defending: true };
      state.defense = null; state.defenseRun = null; state.throneDefense = false;
      perish("defense");
      return;
    }
    // Regime change: the upstart is crowned; your surviving servants are freed.
    state.lord = { name: npc.name, classId: npc.classId, wins: npc.wins, reignSeasons: 0 };
    state.npcs = state.npcs.filter((x) => x.id !== npc.id);
    for (const s of state.household) state.npcs.push({ id: s.id, name: s.name, classId: s.classId, wins: s.wins, popularity: 0 });
    state.household = [];
    state.player.role = "champion"; // dethroned — your fate is chosen next
    state.lastThrone = { won: false, uprising: false, deposed: true, lordName: npc.name };
    chronicle("👑", "regime", `<b>${npc.name}</b> stormed the keep and took the throne from <b>${state.player.name}</b>.`, { refs: [npc.name, state.player.name] });
    state.defense = null; state.defenseRun = null; state.throneDefense = false;
    state.screen = "throne-fate";
    save();
  }

  // The Lord's decrees (GUI-13): nudge a knob within its bounds.
  function setDecree(key, delta) {
    if (!state.player || state.player.role !== "lord" || !state.stronghold) return;
    const lim = ECONOMY.limits[key];
    if (!lim) return;
    state.stronghold[key] = Math.max(lim[0], Math.min(lim[1], (state.stronghold[key] || 0) + delta));
    save(); emit();
  }

  // From the win screen: continue the day (next bout, or the sunset if you
  // just took the final).
  function fightOn() {
    if (state.day && state.playerBracket) resumeDay();
    else go("home");
  }

  /* Withdraw from the day. Mid-tournament this is a FORFEIT: your remaining
   * opponents advance by walkover (no career win — nobody fought). */
  function retreat() {
    if (state.day && state.playerBracket && state.playerBracket.winner) { finishDay(); return; } // day already decided
    if (state.day && state.playerBracket) {
      const br = state.playerBracket;
      let m;
      while (!br.winner && (m = G.tournament.pendingMatch(br))) {
        if (m.a === "player" || m.b === "player") {
          m.forfeit = true;
          m.spec = 0; // nobody fought — the crowd pays nothing for a walkover
          G.tournament.reportBout(br, m, m.a === "player" ? m.b : m.a); // walkover
        } else {
          autoResolveMatch(br, m);
        }
      }
      finishDay(true); // never crowns the player — they withdrew
    }
    state.streak = 0; go("home");
  }
  function returnHome() { state.streak = 0; go("home"); }

  /* ---- the Lord & the throne (GUI-9 / GUI-10) ----
   * The Lord is a career-statted ex-champion made at world-gen. At each
   * season's end, if YOU top the fame ladder, the right to challenge is yours
   * (optional — entering the next day's tournament lets the moment pass).
   * Interim scope until Lord mode lands: a single duel (the servant gauntlet
   * arrives with the household, GUI-16); only the player challenges (NPC
   * challengers arrive with the Defend phase). */

  function generateLord(seed) {
    const rng = G.engine.makeRng(seed >>> 0);
    const name = G.engine.pick(rng, FOE_NAMES) + " " + G.engine.pick(rng, EPITHETS);
    const wins = G.engine.randInt(rng, LORD.wins[0], LORD.wins[1]);
    const reignSeasons = G.engine.randInt(rng, 1, 4);
    return {
      name,
      classId: G.engine.pick(rng, Object.keys(CLASSES)),
      wins,
      reignSeasons, // backstory: seasons already held
      age: AGE.start + Math.round(wins / 3) + reignSeasons + G.engine.randInt(rng, 4, 10),
      personality: G.roster.rollPersonality(rng),
    };
  }

  /* The Lord's throne-duel kit (decided): fresh at full HP/MP, dictates the
   * opening range, plus ONE perk — the AI picks by class:
   *   caster (mage/cleric) → treasury (1 HP + 1 MP potion — refuels the kit)
   *   martial (fighter/thief) → armory (top-tier ENCHANTED armor + arrows)
   * (Home-crowd +hit/+crit exists for the player-as-Lord era, GUI-43.) */
  function lordCombatChar() {
    const L = state.lord, c = CLASSES[L.classId];
    const pools = G.ai.maxPools(L.classId, L.wins, 0.6);
    const fade = AGE.mult(L.age); // an old Lord is past his peak
    pools.maxHp = Math.max(1, Math.round(pools.maxHp * fade));
    pools.maxMp = Math.round(pools.maxMp * fade);
    const char = {
      id: "lord", name: L.name, classId: L.classId, wins: L.wins,
      maxHp: pools.maxHp, maxMp: pools.maxMp,
      meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
      items: {}, arrows: [], activeArrow: "normal",
      armor: null, armorDurability: 0, isPlayer: false,
      personality: L.personality || null,
    };
    if (c.caster) {
      char.perk = "treasury";
      char.items = { ...LORD.treasury };
      const a = G.ai.bestAffordableArmor(L.classId, totalGoldAt(L.wins));
      if (a) { char.armor = a; char.armorDurability = ARMOR[a].durability; }
    } else {
      char.perk = "armory";
      // The vault: best enchanted piece his class can wear.
      const best = Object.values(ARMOR)
        .filter((a) => a.magical && a.tier <= (ARMOR_MAXTIER[L.classId] || 0))
        .sort((a, b) => b.dr - a.dr)[0];
      if (best) { char.armor = best.id; char.armorDurability = best.durability; }
      if (L.classId === "thief") { char.arrows = ["fire"]; char.activeArrow = "fire"; }
    }
    return char;
  }

  // The throne duel. As a servant this is an UPRISING — lose and you die.
  function challengeLord() {
    if (!state.challengeOpen || !state.lord) return;
    state.challengeOpen = false;
    const lord = lordCombatChar();
    // Home-arena advantage: the Lord dictates the opening range.
    const openRange = CLASSES[lord.classId].caster ? "missile" : "melee";
    state.foe = lord;
    state.throneFight = true;
    state.battle = G.combat.newBattle(playerCombatChar(), lord, nextSeed(), openRange);
    state.allocPending = false;
    state.screen = "battle";
    save(); emit();
  }

  // Victory: the throne changes hands.
  function coronation() {
    const p = state.player, L = state.lord;
    p.wins += 1; p.battlesWon += 1; // the duel is a career victory (the prize is the throne)
    const uprising = p.role === "servant";
    // The deposed Lord's fate: a STEADFAST lord swallows his pride and stays
    // to fight in your arena; the proud ride out (GUI-42).
    const rng = G.engine.makeRng((p.worldSeed || 1) + state.clock.season * 131);
    const stays = rng() < 0.25 + 0.7 * ((L.personality || {}).loy != null ? L.personality.loy : 0.5);
    if (stays) {
      state.npcs.push({ id: "x" + state.clock.season + "_" + state.npcs.length, name: L.name, classId: L.classId, wins: L.wins, popularity: 0, age: L.age, personality: L.personality });
    } else if (((L.personality || {}).amb != null ? L.personality.amb : 0.5) >= 0.5) {
      // GUI-89: an AMBITIOUS deposed Lord doesn't fade into the wilds — they
      // build again, in sight of your banners. The Exile's Spite, always.
      const m = mintHold(((p.worldSeed || 1) ^ nameHash(L.name) ^ (state.clock.season * 7919)) >>> 0, L.personality, true);
      state.departed = (state.departed || []).concat([{ name: L.name, classId: L.classId, wins: L.wins, age: L.age, reason: "found", holdName: m.holdName, archetype: m.archetype, season: state.clock.season }]).slice(-12);
      chronicle("🔥", "child", `Deposed Lord <b>${L.name}</b> rode into exile and raised <b>${m.holdName}</b> in defiance — ${G.data.ARCHETYPES.spite.line}.`, { refs: [L.name] });
    }
    state.lastThrone = { won: true, uprising, lordName: L.name, lordStays: stays };
    chronicle("👑", uprising ? "uprising" : "regime", uprising
      ? `<b>${p.name}</b> rose against Lord <b>${L.name}</b> from within the household and seized the throne.`
      : `<b>${p.name}</b> defeated Lord <b>${L.name}</b> and took the throne.`, { refs: [p.name, L.name] });
    if (state.lastSpec && state.lastSpec.stars === 5) chronicle("🌟", "legend", `The throne duel of Year ${state.clock.season} — <b>${p.name}</b> over <b>${L.name}</b> — was a five-star classic the bards took up at once.`, { refs: [p.name, L.name] });
    p.role = "lord";
    p.crownedSeason = state.clock.season;
    state.lord = null; // the throne is YOURS
    state.throneFight = false;
    state.screen = "coronation";
    save();
  }

  // Defeat: the fates. A failed UPRISING grants no mercy — death, immediately.
  function throneLoss() {
    state.throneFight = false;
    if (state.player.role === "servant") { // failed uprising: fight to the death
      state.lastThrone = { won: false, uprising: true, lordName: state.lord.name };
      perish("uprising");
      return;
    }
    state.lastThrone = { won: false, uprising: false, lordName: state.lord.name };
    chronicle("🛡️", "regime", `<b>${state.player.name}</b> challenged Lord <b>${state.lord.name}</b> for the throne — and fell.`, { refs: [state.player.name, state.lord.name] });
    state.screen = "throne-fate";
    save();
  }

  // Permadeath: the world is erased NOW (no reload resurrection); the memorial
  // screen lives on in-memory until "New Game".
  function perish(kind) {
    deleteWorld(state.worldId);
    state.lastThrone = { ...(state.lastThrone || {}), fate: kind === "uprising" ? "uprising" : kind === "defense" ? "defense" : kind === "throne-age" ? "throne-age" : "die" };
    state.screen = "memorial";
    emit();
  }

  // The three fates (GUI-10) after losing to the Lord.
  function chooseFate(fate) {
    if (state.screen !== "throne-fate") return;
    if (fate === "die") { perish("die"); return; }
    if (fate === "exile") {
      // One-way: you leave the Stronghold forever. (Exile mode — the wilds,
      // founding your own hold — is a later build; the run ends here for now.)
      deleteWorld(state.worldId);
      state.lastThrone.fate = "exile";
      state.screen = "exiled";
      emit();
      return;
    }
    if (fate === "serve") {
      // Stay and rise from within: you keep fighting the daily brackets in his
      // household. Top the fame ladder again to RISE AGAINST HIM — to the death.
      state.player.role = "servant";
      state.lastThrone.fate = "serve";
      state.streak = 0;
      save(); go("home");
    }
  }

  function resetGame() {
    deleteWorld(state.worldId);
    state.worldId = null;
    state.player = null; state.npcs = []; state.lord = null; state.streak = 0; state.battle = null; state.foe = null;
    state.day = null; state.playerBracket = null; state.dayById = null; state.pendingBout = null; state.lastDay = null;
    state.clock = { day: 1, season: 1 }; state.lastSeason = null;
    state.challengeOpen = false; state.throneFight = false; state.lastThrone = null;
    state.stronghold = null; state.household = []; state.defense = null; state.defenseRun = null;
    state.throneDefense = false; state.board = []; state.lastDefense = null; state.viewBout = null;
    state.chronicle = [];
    state.allocPending = false; state.screen = "title";
    emit();
  }

  G.game = {
    state, subscribe, boot, load, save, listWorlds, deleteWorld,
    computeMax, champName, fameLadder, lordCombatChar, careerOf, headToHead, playerCombatChar,
    createCharacter, go, enterArena, fightBout, chooseAction,
    challengeLord, chooseFate,
    allocate, fightOn, retreat, returnHome, resetGame,
    openVendor, closeVendor, buyItem, buyArrow, loadArrow, buyArmor,
    taxedCost, gearScale, setDecree, buyBuilding, buildCost, recordBout, openBout, renameHold, defaultHoldName,
    beginDefense, defensePerks, startDefenseDuel, removeServant, moveServant,
    reignEnds: () => perish("throne-age"),
    nextSeed, settleDay, emit, // the seam lord.js drives the shared day through
  };
})(typeof window !== "undefined" ? window : globalThis);

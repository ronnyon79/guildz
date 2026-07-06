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
  function listWorlds() { migrateLegacy(); return readIndex().worlds; }
  function boot() { migrateLegacy(); state.screen = "title"; emit(); }

  function save() {
    if (!state.worldId) return;
    try {
      const blob = { player: state.player, npcs: state.npcs, lord: state.lord, stronghold: state.stronghold, household: state.household, defense: state.defense, board: state.board, departed: state.departed, clock: state.clock, lastSeason: state.lastSeason, challengeOpen: state.challengeOpen, throneRestUntil: state.throneRestUntil || 0, seedCounter: state.seedCounter };
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
      // Migrate saves created before the economy existed.
      state.stronghold = data.stronghold || { ...ECONOMY.start };
      if (!state.stronghold.buildings) state.stronghold.buildings = { seating: 0, armory: 0, infirmary: 0, barracks: 0, yard: 0 };
      state.household = Array.isArray(data.household) ? data.household : [];
      state.departed = Array.isArray(data.departed) ? data.departed : [];
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
  function createCharacter(classId, name, worldSeed) {
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
    state.lord = generateLord(seed + 1);
    // The world was alive before you: pre-simulate its history (GUI-33).
    const lordBox = { lord: state.lord };
    const history = G.worldgen.simulateHistory(state.npcs, lordBox, state.player.name, seed + 99);
    state.lord = lordBox.lord;
    state.stronghold = { ...ECONOMY.start, buildings: { seating: 0, armory: 0, infirmary: 0, barracks: 0, yard: 0 } };
    state.household = [];
    state.defense = null;
    state.board = history.board;
    state.clock = history.clock;
    state.lastSeason = history.lastSeason;
    state.challengeOpen = false;
    state.throneRestUntil = 0;
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
    if (lvl >= def.max || st.treasury < def.costs[lvl]) return false;
    st.treasury -= def.costs[lvl];
    st.buildings[id] = lvl + 1;
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
      const gain = G.spectacle.fameFor(br.matches, br.winner, POPULARITY.perBout(br.band), POPULARITY.specMult);
      if (br.winner === "player") state.player.popularity = (state.player.popularity || 0) + gain;
      else { const n = npcById(br.winner); if (n) n.popularity = (n.popularity || 0) + gain; }
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
            const reason = (P.amb != null ? P.amb : 0.5) >= 0.5 ? "found"
              : (P.brv != null ? P.brv : 0.5) >= 0.4 ? "adventure" : null;
            if (!reason) continue; // the steadfast wait for a worthy rival
            departures.push({ name: n.name, classId: n.classId, wins: n.wins, age: n.age, reason, season: closing });
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
              chHp = Math.round(chHp * LORD.keepGuardWear);
              chMp = Math.round(chMp * LORD.keepGuardWear);
            }
            const worn = { ...ch, startHp: chHp, startMp: chMp };
            const seed = nextSeed();
            const res = G.tournament.autoBout(worn, lc, seed);
            recordBout({ a: worn, b: lc, winner: res.winnerId === worn.id ? worn.name : lc.name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed, throne: true });
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

  // A beaten challenger's fate — their PERSONALITY chooses (GUI-42):
  // the loyal and level-headed kneel; the proud ride out; the fearless die.
  function challengerFate(npc, seed) {
    const r = G.engine.makeRng((seed >>> 0) + 17)();
    const P = npc.personality || {};
    state.npcs = state.npcs.filter((x) => x.id !== npc.id); // leaves the roster either way
    const kneel = 0.2 + 0.6 * (P.loy != null ? P.loy : 0.5); // loyalty bends the knee
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
    // The gauntlet: strongest servant first (ordering decree can come later).
    const order = state.household.slice().sort((a, b) => b.wins - a.wins);
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
      } else {
        state.lastDefense = { won: true, challenger: npc.name, fate: challengerFate(npc, state.battle.seed), bouts: state.defenseRun.bouts };
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
    }
    state.lastThrone = { won: true, uprising, lordName: L.name, lordStays: stays };
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
    taxedCost, gearScale, setDecree, buyBuilding, recordBout, openBout,
    beginDefense, defensePerks, startDefenseDuel, removeServant,
    reignEnds: () => perish("throne-age"),
    nextSeed, settleDay, emit, // the seam lord.js drives the shared day through
  };
})(typeof window !== "undefined" ? window : globalThis);

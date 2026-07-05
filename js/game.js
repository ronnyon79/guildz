/* game.js — the meta-game "store". Owns durable player state and orchestrates
 * battles via the pure combat engine and the AI seam.
 *
 * Stronghold progression: there are no XP levels. Each win grants +50 gold and
 * 2 stat points — auto HP for Fighter/Thief, a player-chosen HP/MP split for the
 * Mage. UI never mutates state directly; it calls actions.
 */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, ITEMS, ARROWS, ARMOR, ARMOR_MAXTIER, goldForWin, POINTS_PER_WIN, POPULARITY, SEASON, LORD, FOE_NAMES, EPITHETS, totalGoldAt } = G.data;

  const SAVE_KEY = "guildz.save.v2";
  const listeners = new Set();

  const state = {
    screen: "title", // title | class-select | home | bracket | battle | win | loss | day-champion | shop | hero
    player: null,
    npcs: [],            // the Stronghold's resident champions (persisted)
    lord: null,          // the reigning Lord (persisted; null once YOU reign)
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
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ player: state.player, npcs: state.npcs, lord: state.lord, clock: state.clock, lastSeason: state.lastSeason, challengeOpen: state.challengeOpen, seedCounter: state.seedCounter })); }
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
      state.lord = data.lord !== undefined ? data.lord
        : generateLord((state.player.worldSeed || state.seedCounter * 97) + 1);
      state.challengeOpen = !!data.challengeOpen;
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
      worldSeed: seed, // seeds this world's population (deterministic world-gen)
    };
    state.npcs = G.roster.generateRoster(seed, state.player.name);
    state.lord = generateLord(seed + 1);
    state.clock = { day: 1, season: 1 };
    state.lastSeason = null;
    state.challengeOpen = false;
    state.lastThrone = null;
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
    if (state.dayById) state.dayById[n.id] = G.roster.combatChar(n); // mid-day growth
  }

  function autoResolveMatch(br, m) {
    const res = G.tournament.autoBout(state.dayById[m.a], state.dayById[m.b], m.seed);
    m.rounds = res.rounds;
    m.spec = res.spec;
    G.tournament.reportBout(br, m, res.winnerId);
    applyNpcBout(res.winnerId);
  }

  function startDay() {
    state.streak = 0;
    state.challengeOpen = false; // stepping onto the sand lets the moment pass
    const pc = playerCombatChar();
    pc.id = "player";
    const champs = [pc, ...state.npcs.map((n) => G.roster.combatChar(n))];
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

  // Sunset: award fame to every band champion, build the winners' board,
  // advance the world clock (season roll = −50% fame decay), clean up.
  function finishDay(keepScreen) {
    const champion = state.playerBracket && state.playerBracket.winner === "player";
    // Popularity: Σ perBout(band) × Crowd Rating over the champion's won bouts
    // (the decided formula, per-bout variant; a forfeit walkover pays 0).
    const awardFame = (br) => {
      const gain = G.spectacle.fameFor(br.matches, br.winner, POPULARITY.perBout(br.band), POPULARITY.specMult);
      if (br.winner === "player") state.player.popularity = (state.player.popularity || 0) + gain;
      else { const n = npcById(br.winner); if (n) n.popularity = (n.popularity || 0) + gain; }
      return gain;
    };
    state.lastDay = {
      band: state.playerBracket ? state.playerBracket.band : 0,
      bandLabel: G.tournament.bandLabel(state.playerBracket ? state.playerBracket.band : 0),
      boutsWon: state.playerBracket ? state.playerBracket.boutsWon.player || 0 : 0,
      champion,
      popGain: 0,
      board: state.day.brackets.map((br) => ({
        band: br.band,
        label: G.tournament.bandLabel(br.band),
        name: champName(br.winner),
        classId: br.winner === "player" ? state.player.classId : (state.dayById[br.winner] || {}).classId,
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
      state.player.popularity = Math.round((state.player.popularity || 0) / 2);
      for (const n of state.npcs) n.popularity = Math.round((n.popularity || 0) / 2);
      state.clock.season += 1;
      state.clock.day = 1;
      state.lastDay.seasonEnd = state.lastSeason; // surfaced on the sunset screens
      state.lastDay.mayChallenge = state.challengeOpen;
    }

    state.day = null; state.playerBracket = null; state.dayById = null; state.pendingBout = null;
    if (champion) state.screen = "day-champion";
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
    // The throne duel resolves outside the brackets.
    if (state.throneFight && state.battle.phase !== "choose") {
      state.lastSpec = G.spectacle.rate(state.battle, state.battle.phase === "won" ? "you" : "foe");
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
    return {
      name,
      classId: G.engine.pick(rng, Object.keys(CLASSES)),
      wins: G.engine.randInt(rng, LORD.wins[0], LORD.wins[1]),
      reignSeasons: G.engine.randInt(rng, 1, 4), // backstory: seasons already held
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
    const char = {
      id: "lord", name: L.name, classId: L.classId, wins: L.wins,
      maxHp: pools.maxHp, maxMp: pools.maxMp,
      meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
      items: {}, arrows: [], activeArrow: "normal",
      armor: null, armorDurability: 0, isPlayer: false,
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
    // The deposed Lord's fate (no personality system yet — seeded):
    // most swallow their pride and stay to fight in your arena; some ride out.
    const rng = G.engine.makeRng((p.worldSeed || 1) + state.clock.season * 131);
    const stays = rng() < 0.6;
    if (stays) {
      state.npcs.push({ id: "x" + state.clock.season + "_" + state.npcs.length, name: L.name, classId: L.classId, wins: L.wins, popularity: 0 });
    }
    state.lastThrone = { won: true, uprising, lordName: L.name, lordStays: stays };
    p.role = "lord";
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

  // Permadeath: the save is wiped NOW (no reload resurrection); the memorial
  // screen lives on in-memory until "New Game".
  function perish(kind) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state.lastThrone = { ...(state.lastThrone || {}), fate: kind === "uprising" ? "uprising" : "die" };
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
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
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
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state.player = null; state.npcs = []; state.lord = null; state.streak = 0; state.battle = null; state.foe = null;
    state.day = null; state.playerBracket = null; state.dayById = null; state.pendingBout = null; state.lastDay = null;
    state.clock = { day: 1, season: 1 }; state.lastSeason = null;
    state.challengeOpen = false; state.throneFight = false; state.lastThrone = null;
    state.allocPending = false; state.screen = "title";
    emit();
  }

  G.game = {
    state, subscribe, load, save,
    computeMax, champName, fameLadder, lordCombatChar,
    createCharacter, go, enterArena, fightBout, chooseAction,
    challengeLord, chooseFate,
    allocate, fightOn, retreat, returnHome, resetGame,
    openVendor, closeVendor, buyItem, buyArrow, loadArrow, buyArmor,
  };
})(typeof window !== "undefined" ? window : globalThis);

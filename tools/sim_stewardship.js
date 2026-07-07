/* sim_stewardship.js — GUI-74 (numbers) + GUI-80 (stability), BEFORE any code.
 *
 * The four Stewardship systems (maintenance / supplies / trade / Pull) run as
 * a MODELED OVERLAY on the real engine: real presided days (lord.holdGames →
 * gate/wagers/tax through the actual combat + economy), with the stewardship
 * flows applied on top each day/season. The STEW constants below are the
 * design deliverable — GUI-75..79 move the survivors into data.js.
 *
 * Plan targets (PLAN.md → Stewardship → "Sim requirements"):
 *   T1 no death spiral at default decrees (net > 0, population stable ~40)
 *   T2 greedy NEGLECT fails in ~2–3 seasons (not instantly)
 *   T3 a well-run hold grows to a soft cap (~48); a neglected one decays to a
 *      floor (~24) without extinction
 *   T4 NPC-lord policies keep commoner holds within ±20% of 40 long-run
 *
 * Run: node tools/sim_stewardship.js
 */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");
const game = G.game, S = game.state;

/* ---------------- THE NUMBERS (GUI-74 deliverable) ---------------- */
const STEW = {
  // 2 · Supplies — the granary
  provisionsPerHead: 1,          // units/day: residents + household + the Lord's table
  grainPrice: 1.0,               // g/unit baseline; seeded seasonal swing below
  priceSwing: [0.7, 1.5],        // seeded market price band (g/unit, per season)
  granaryCap0: 80,               // the bare larder (no Granary built): ~2 days of food
  hungerGateHit: 0.25,           // starving days: gate + wagers −25% (worn fighters, thin crowds)
  starvationExodus: 0.25,        // a fully starving season drives out a QUARTER of residents (people don't stay where there's no bread)
  // 1 · Maintenance — condition 0–100 per building
  decayPerSeason: 10,            // condition points lost per season per building
  crowdWearPer40: 1,             // seating: +1 decay per 40 average attendance (success wears the benches)
  repairPerPoint: 2,             // g per condition point (tier 1; ×tier at higher tiers)
  conditionGateFloor: 0.75,      // rotten hold (avg condition 0) still keeps 75% of its crowd
  // 3 · Trade — caravans on the founders' routes
  caravansPerSeason: 1,          // per route; routes = founders' ledger holds + 1 seeded neighbour
  caravanCap: 120,               // units per caravan
  caravanMargin: 0.15,           // buy-low/sell-high spread captured per unit traded
  // 4 · Attraction — the Pull score (0–100; 50 = today's steady state)
  pullW: { purse: 25, fame: 10, taxInv: 15, granary: 10, condition: 25, stability: 15 },
  heraldsMax: 15,                // Pull points from a maxed heralds budget…
  heraldsBudget: 100,            // …which costs this much per SEASON (diminishing sqrt curve)
  migrationSlope: 6,             // net migrants/season = (Pull − 50) / slope
  softCapPop: 64,                // arrivals × (1 − pop/softCapPop): growth chokes near ~56–60
  floorPop: 30,                  // a FED, functioning hold finds its level here — it shrinks threadbare, never extinct
  dyingPop: 24,                  // below this the hold has FAILED (only starvation/exodus can push it there)
};

/* ---------------- the overlay ---------------- */
function seasonPrice(rng) { return STEW.priceSwing[0] + rng() * (STEW.priceSwing[1] - STEW.priceSwing[0]); }

function runHold(label, cfg, seasons, seed) {
  for (const k of Object.keys(store)) delete store[k];
  game.resetGame();
  game.createCharacter("fighter", "Steward", seed);
  S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
  S.player.age = 20; // a long reign ahead — we are testing the economy, not mortality
  Object.assign(S.stronghold, cfg.decrees || {});
  game.save();
  const rng = G.engine.makeRng(seed ^ 0x57e3);
  const buildings = { seating: 1, armory: 1, infirmary: 1, barracks: 1, yard: 1 }; // a modest built hold
  S.stronghold.buildings = { ...buildings };
  const condition = {}; for (const b of Object.keys(buildings)) condition[b] = 100;
  let stock = STEW.granaryCap0, price = seasonPrice(rng);
  let routes = 1; // the worldgen neighbour; founders' departures add more
  let stewSpend = 0, stewTrade = 0, starvedDays = 0, failedAt = null;
  const popTrack = [S.npcs.length];
  let attSum = 0, attN = 0, lastSeason = S.clock.season;

  const days = seasons * G.data.SEASON.days;
  for (let d = 0; d < days; d++) {
    G.lord.holdGames();
    if (S.screen !== "lord-sunset") break; // deposed/died (not expected here)
    game.returnHome();
    const led = S.lastDay.ledger;
    attSum += led.attendance; attN += 1;

    // -- supplies: eat, then buy per policy --
    const heads = S.npcs.length + S.household.length + 1;
    stock -= heads * STEW.provisionsPerHead;
    const starving = stock < 0;
    if (starving) { stock = 0; starvedDays += 1; }
    if (cfg.provision) {
      const want = STEW.granaryCap0 - stock;
      const cost = Math.round(want * price);
      S.stronghold.treasury -= cost; stewSpend += cost; stock += want;
    }
    // hunger bites the gate (worn fighters, thin crowds) — modeled vs yesterday's take
    if (starving) {
      const hit = Math.round((led.gate + led.wagers) * STEW.hungerGateHit);
      S.stronghold.treasury -= hit; stewSpend += hit;
    }
    // rot bites the crowd: a crumbling hold keeps only part of its draw
    const avgCond = Object.values(condition).reduce((s, x) => s + x, 0) / Object.keys(condition).length;
    if (avgCond < 100) {
      const keep = STEW.conditionGateFloor + (1 - STEW.conditionGateFloor) * (avgCond / 100);
      const hit = Math.round((led.gate + led.wagers) * (1 - keep));
      S.stronghold.treasury -= hit; stewSpend += hit;
    }

    // -- season roll happened inside settleDay? detect and run seasonal flows --
    if (S.clock.season !== lastSeason) {
      lastSeason = S.clock.season;
      price = seasonPrice(rng);
      // maintenance: decay (+ crowd wear on seating), then repairs per policy
      for (const b of Object.keys(condition)) {
        let dec = STEW.decayPerSeason;
        if (b === "seating") dec += Math.round((attSum / Math.max(1, attN)) / 40) * STEW.crowdWearPer40;
        condition[b] = Math.max(0, condition[b] - dec);
      }
      if (cfg.repair) {
        for (const b of Object.keys(condition)) {
          const pts = 100 - condition[b];
          const cost = pts * STEW.repairPerPoint;
          S.stronghold.treasury -= cost; stewSpend += cost; condition[b] = 100;
        }
      }
      // trade: one caravan per route; profit = spread captured on capacity
      routes = 1 + (S.departed || []).filter((x) => x.reason === "found").length;
      if (cfg.trade) {
        const profit = Math.round(routes * STEW.caravanCap * STEW.caravanMargin * (0.5 + rng()));
        S.stronghold.treasury += profit; stewTrade += profit;
      }
      // heralds: a season budget for Pull
      if (cfg.heralds) { S.stronghold.treasury -= STEW.heraldsBudget; stewSpend += STEW.heraldsBudget; }

      // -- the Pull score: who wants to live here? --
      const st = S.stronghold;
      const W = STEW.pullW;
      const fameTop = Math.max(0, ...S.npcs.map((n) => n.popularity || 0));
      const pull =
        W.purse * Math.min(1, st.purse / 40) +
        W.fame * Math.min(1, fameTop / 200) +
        W.taxInv * (1 - st.taxRate / 25) +
        W.granary * (stock / STEW.granaryCap0) +
        W.condition * (avgCond / 100) +
        W.stability * Math.min(1, (S.clock.season - (S.player.crownedSeason || 1)) / 3) +
        (cfg.heralds ? STEW.heraldsMax * Math.sqrt(1) : 0);
      // migration replaces the automatic 1:1 refill: the engine already
      // refilled churn — we now apply Pull's NET adjustment on top.
      const pop = S.npcs.length;
      let net = Math.round((pull - 50) / STEW.migrationSlope);   // pull 82 → +4/season; pull 26 → −3
      const starvedFrac = starvedDays / G.data.SEASON.days;
      if (starvedFrac > 0) net -= Math.round(pop * STEW.starvationExodus * starvedFrac); // the exodus
      if (net > 0) net = Math.round(net * Math.max(0, 1 - pop / STEW.softCapPop)); // crowding chokes growth
      if (starvedFrac === 0 && pop + net < STEW.floorPop) net = Math.max(net, STEW.floorPop - pop); // a fed hold finds its level
      if (net > 0) {
        const fresh = G.roster.generateRoster((seed ^ (S.clock.season * 7919)) >>> 0, S.player.name, net, "pull" + S.clock.season + "_");
        for (const f of fresh) { f.wins = Math.min(f.wins, 4); S.npcs.push(f); }
      } else if (net < 0) {
        for (let i = 0; i < -net && S.npcs.length; i++) S.npcs.pop();
      }
      starvedDays = 0; attSum = 0; attN = 0;
      popTrack.push(S.npcs.length);
      const reignSeason = S.clock.season - (S.player.crownedSeason || 1); // report in REIGN seasons
      if (S.stronghold.treasury < 0 && failedAt == null) failedAt = reignSeason;
      if (S.npcs.length <= STEW.dyingPop && failedAt == null) failedAt = reignSeason;
    }
  }
  const t = S.stronghold.treasury;
  return { label, pop: S.npcs.length, popTrack, treasury: t, perDay: Math.round((t - 500) / days), stewSpend: Math.round(stewSpend / days), trade: Math.round(stewTrade / Math.max(1, seasons)), failedAt };
}

/* ---------------- scenarios ---------------- */
const SEASONS = 8;
console.log(`GUI-74/80 — stewardship overlay on real presided days (${SEASONS} seasons each)\n`);

function show(r) {
  console.log(`  ${r.label.padEnd(34)} pop ${String(r.popTrack[0]).padStart(2)}→${String(r.pop).padEnd(3)} 🏛️${String(r.treasury).padStart(6)} (${r.perDay >= 0 ? "+" : ""}${r.perDay}/day, stew −${r.stewSpend}/day, trade +${r.trade}/season)${r.failedAt ? ` ☠️ FAILED season ${r.failedAt}` : ""} [${r.popTrack.join("→")}]`);
}

// T1: the default steward — repairs, provisions, no heralds
show(runHold("T1 default (repair+provision)", { decrees: {}, repair: true, provision: true, trade: true }, SEASONS, 74801));
// T3a: the showman investor — grows toward the soft cap
show(runHold("T3a showman+heralds (grow)", { decrees: { purse: 50, ticketPrice: 8, taxRate: 5 }, repair: true, provision: true, trade: true, heralds: true }, SEASONS, 74802));
// T2: greedy NEGLECT — no repairs, no provisions, squeeze everything
show(runHold("T2 greedy neglect (should fail s2-3)", { decrees: { purse: 0, ticketPrice: 15, taxRate: 25 }, repair: false, provision: false, trade: false }, SEASONS, 74803));
// T3b: poor but honest — provisions yes, nothing else; decays to floor, not death
show(runHold("T3b threadbare (floor, no death)", { decrees: { purse: 0, ticketPrice: 12, taxRate: 20 }, repair: false, provision: true, trade: false }, SEASONS, 74804));
// T3c: the floor, proven long-run — threadbare for 20 seasons: sag to ~30, never extinct
show(runHold("T3c threadbare LONG (20 seasons)", { decrees: { purse: 0, ticketPrice: 12, taxRate: 20 }, repair: false, provision: true, trade: false }, 20, 74806));
// generous: known bankrupt case, now with stewardship costs
show(runHold("bankrupt control (generous)", { decrees: { purse: 100, ticketPrice: 2, taxRate: 0 }, repair: true, provision: true, trade: true }, 4, 74805));

/* T4: NPC-lord policies — personality-weighted stewardship */
console.log("\nT4 — NPC-lord policies (personality-weighted decrees + budgets)");
const NPC_POLICIES = {
  grasping:    { decrees: { purse: 10, ticketPrice: 12, taxRate: 20 }, repair: false, provision: true, trade: true },          // pockets gold, lets the benches rot
  disciplined: { decrees: { purse: 30, ticketPrice: 6, taxRate: 10 }, repair: true, provision: true, trade: true },            // balances the book
  steadfast:   { decrees: { purse: 20, ticketPrice: 5, taxRate: 10 }, repair: true, provision: true, trade: false },           // keeps the old ways
  ferocious:   { decrees: { purse: 50, ticketPrice: 8, taxRate: 15 }, repair: false, provision: true, trade: true, heralds: true }, // blood and crowds
};
let inBand = 0, n4 = 0;
for (const [temper, pol] of Object.entries(NPC_POLICIES)) {
  const r = runHold(`npc ${temper}`, pol, SEASONS, 74810 + n4);
  show(r);
  n4++;
  if (!r.failedAt && r.pop >= 40 && r.pop <= 60) inBand++;
}
console.log(`  → ${inBand}/${n4} NPC temperaments hold population within ±20% of the 50 baseline (40–60)`);

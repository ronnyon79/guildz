/* sim_founding.js — GUI-91: size the from-scratch settlement (Act 1) so it
 * takes ~2–4 years at competent play before the Arena can be raised, and the
 * pooled purse is a real runway (not a formality, not a death sentence).
 *
 * A standalone model of the settlement economy (no arena income): the party
 * eats, trades one neighbour route, and draws settlers via a settlement Pull.
 * The survivors of this tuning become the GUI-90 constants.
 *
 * Run: node tools/sim_founding.js
 */
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
for (const f of ["engine", "store", "data"]) require("../js/" + f + ".js");
const STEW = G.data.STEW, SEASON = G.data.SEASON;

const CFG = {
  partySize: 8,          // founders who followed you out
  pooledPurse: 1000,     // founding capital (the party's pooled gold)
  arenaPop: 16,          // settlers needed before the Arena is worth raising
  arenaCost: 400,        // gold to raise it
  provPrice: 1.0,        // grain
  forage: 5,             // the scrappy camp hunts/forages this many units/day for free
  tradePerRoute: 18,     // one neighbour caravan, export stance
  fieldsIncome: 40,      // if the player raises Fields (competent play invests)
};

function runSettlement(cfg, mgmt, seed) {
  const rng = G.engine.makeRng(seed >>> 0);
  let pop = cfg.partySize, purse = cfg.pooledPurse, condition = 100, stock = 40;
  const track = [pop];
  let year = 0, arenaYear = null, died = null;
  while (year < 20 && arenaYear == null && died == null) {
    year++;
    // eat (the Hunter trickle etc. folded into a flat need); buy to refill
    const need = Math.max(0, pop * STEW.provisionsPerHead - cfg.forage) * SEASON.days;
    purse -= Math.round(need * cfg.provPrice); // provisions (net of forage)
    stock = 40;
    // trade income (one route) + optional fields
    purse += cfg.tradePerRoute + (mgmt.fields ? cfg.fieldsIncome : 0);
    // management spend: heralds (draw settlers) + repairs
    if (mgmt.heralds) purse -= STEW.heraldsBudget;
    if (mgmt.repair) { purse -= (100 - condition) * 2; condition = 100; } else { condition = Math.max(0, condition - STEW.decayPerSeason); }
    // settlement Pull: safety (condition) + stock + heralds — no arena purse yet
    const pull = 40 + (condition / 100) * 20 + (mgmt.heralds ? STEW.heraldsMax : 0) + (mgmt.walls ? 8 : 0);
    let growth = Math.round((pull - 50) / STEW.migrationSlope);
    if (growth > 0) growth = Math.round(growth * Math.max(0.2, 1 - pop / (cfg.arenaPop + 8)));
    if (!Number.isFinite(growth)) growth = 0;
    pop = Math.max(cfg.partySize - 2, pop + growth + Math.round(rng() * 1.4)); // a wanderer or two
    track.push(pop);
    if (purse < 0) died = year;
    else if (pop >= cfg.arenaPop && purse >= cfg.arenaCost) arenaYear = year;
  }
  return { arenaYear, died, purse: Math.round(purse), pop, track };
}

console.log("GUI-91 — from-scratch settlement runway (target: raise the Arena in years 2–4)\n");
const show = (label, r) => console.log(`  ${label.padEnd(32)} ${r.arenaYear ? `🏛️ Arena in year ${r.arenaYear}` : r.died ? `☠️ purse died year ${r.died}` : `… still a camp (pop ${r.pop})`} · purse ${r.purse} · [${r.track.join("→")}]`);

// competent play: heralds to draw folk, repairs to stay safe
let hit = 0, n = 0;
for (let s = 1; s <= 5; s++) { const r = runSettlement(CFG, { heralds: true, repair: true, walls: true, fields: true }, 9100 + s); show(`competent #${s}`, r); if (r.arenaYear >= 2 && r.arenaYear <= 5) hit++; n++; }
console.log(`  → ${hit}/${n} competent runs raise the Arena in the 2–5 year window\n`);

// neglectful play: no heralds, no repairs — slow, but the purse should outlast folly a while
show("neglectful (no heralds/repair)", runSettlement(CFG, { heralds: false, repair: false, walls: true, fields: false }, 9199));
// spendthrift: heralds but let it rot
show("spendthrift", runSettlement(CFG, { heralds: true, repair: false, walls: false, fields: false }, 9198));

console.log("\nCHOSEN (GUI-90): party 8 · pooled purse 1000 · forage 5/day · arena at pop " + CFG.arenaPop + " + " + CFG.arenaCost + "g");

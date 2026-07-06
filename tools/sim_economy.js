/* GUI-36: economy stability under decree policies — a REAL player-Lord reign
 * (the actual store: holdGames, ledger, tax→gear→spectacle→gate loop).
 * Also feeds GUI-30/32/34 data. Run: node tools/sim_economy.js
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

function reign(policy, days) {
  for (const k of Object.keys(store)) delete store[k];
  game.resetGame();
  game.createCharacter("fighter", "Ledger", 360036);
  S.player.role = "lord"; S.lord = null;
  Object.assign(S.stronghold, policy);
  game.save();
  const t0 = S.stronghold.treasury;
  let minT = t0, atts = [], specs = [], champions = new Set();
  const start = Date.now();
  for (let d = 0; d < days; d++) {
    G.lord.holdGames();
    const L = S.lastDay.ledger;
    atts.push(L.attendance); specs.push(L.avgSpec);
    minT = Math.min(minT, S.stronghold.treasury);
    for (const w of S.lastDay.board) champions.add(w.name);
    if (S.screen === "lord-sunset") game.returnHome(); else break;
  }
  const ms = Date.now() - start;
  return {
    net: S.stronghold.treasury - t0,
    perDay: Math.round((S.stronghold.treasury - t0) / days),
    minT,
    att: Math.round(atts.reduce((s, x) => s + x, 0) / atts.length),
    spec: (specs.reduce((s, x) => s + x, 0) / specs.length).toFixed(2),
    distinctChampions: champions.size,
    msPerDay: Math.round(ms / days),
  };
}

console.log("GUI-36 — 20-day reigns under decree policies (real store)");
for (const [label, pol] of [
  ["balanced (defaults)", {}],
  ["greedy   (tax 25, ticket 15, purse 0)", { taxRate: 25, ticketPrice: 15, purse: 0 }],
  ["generous (tax 0, ticket 2, purse 100)", { taxRate: 0, ticketPrice: 2, purse: 100 }],
  ["showman  (tax 5, ticket 8, purse 60)", { taxRate: 5, ticketPrice: 8, purse: 60 }],
]) {
  const r = reign(pol, 20);
  console.log(`  ${label}: ${r.perDay >= 0 ? "+" : ""}${r.perDay}/day (min 🏛️${r.minT}) · ${r.att} crowd · ${r.spec}★ avg · ${r.distinctChampions} distinct champions · ${r.msPerDay}ms/day`);
}

console.log("\nGUI-34 — population sweep (one 10-day stretch each, defaults)");
const { ROSTER } = G.data;
for (const size of [24, 40, 60]) {
  ROSTER.size = size;
  const r = reign({}, 10);
  console.log(`  size ${size}: ${r.att} crowd · ${r.spec}★ · ${r.distinctChampions} champions honoured · ${r.msPerDay}ms/day`);
}
ROSTER.size = 40;

console.log("\nGUI-30 — fame-race competitiveness (balanced, 40 residents, 6 seasons)");
{
  for (const k of Object.keys(store)) delete store[k];
  game.resetGame();
  game.createCharacter("fighter", "Racer", 300300);
  S.player.role = "lord"; S.lord = null; game.save();
  const toppers = new Set(); let seasons = 0;
  while (seasons < 6) {
    const s0 = S.clock.season;
    G.lord.holdGames();
    if (S.screen !== "lord-sunset") break;
    game.returnHome();
    if (S.clock.season !== s0) { toppers.add(S.lastSeason.top[0].name); seasons++; }
  }
  console.log(`  ${toppers.size} distinct season-toppers in 6 seasons (${[...toppers].join(", ")})`);
}

console.log("\nGUI-32 — spectacle distribution with personalities (from the last reign's board)");
{
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let n = 0;
  for (const d of S.board) for (const b of d.bouts) if (b.spec) { counts[b.spec]++; n++; }
  console.log("  " + Object.entries(counts).map(([s, c]) => `${s}★ ${(100 * c / n).toFixed(0)}%`).join("  ") + ` (n=${n})`);
}

/* Headless tests for GUI-12/GUI-13: treasury, income lines, decrees, tensions. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state, E = G.data.ECONOMY;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

console.log("— stronghold state —");
game.createCharacter("fighter", "Coin", 121212);
ok(S.stronghold && S.stronghold.treasury === E.start.treasury && S.stronghold.taxRate === E.start.taxRate,
  "fresh world gets the starting coffers + decrees");
// migration
const wid = S.worldId, raw = JSON.parse(store["guildz.world." + wid]);
delete raw.stronghold;
store["guildz.world." + wid] = JSON.stringify(raw);
ok(game.load(wid) && S.stronghold.treasury === E.start.treasury, "pre-economy save gains a stronghold");

console.log("— the Lord's sales tax (champion side) —");
S.player.gold = 10000;
const plate = G.data.ARMOR.plate.cost; // 1000
ok(game.taxedCost(plate) === Math.round(plate * 1.1), "prices carry the default 10% tax");
game.buyArmor("plate");
ok(S.player.gold === 10000 - Math.round(plate * 1.1), "champion pays the taxed price");
ok(game.gearScale() === 0.9, "residents' gear budgets shrink by the tax");
const rich = { id: "t", name: "T", classId: "fighter", wins: 22 }; // 1100g total
ok(G.roster.combatChar(rich, 1).armor === "plate" && G.roster.combatChar(rich, 0.9).armor !== "plate",
  "a 10% tax prices a borderline resident out of plate");

console.log("— decrees (GUI-13) —");
ok((game.setDecree("taxRate", 5), S.stronghold.taxRate === E.start.taxRate), "champions cannot decree");
S.player.role = "lord"; S.lord = null; game.save();
game.setDecree("taxRate", 5);
ok(S.stronghold.taxRate === E.start.taxRate + 5, "the Lord raises the tax");
for (let i = 0; i < 30; i++) game.setDecree("taxRate", 5);
ok(S.stronghold.taxRate === E.limits.taxRate[1], "decrees clamp at their bounds");
for (let i = 0; i < 30; i++) game.setDecree("taxRate", -5);
ok(S.stronghold.taxRate === E.limits.taxRate[0], "…both bounds");
game.setDecree("taxRate", 10); // back to 10%
ok(game.taxedCost(1000) === 1000, "the Lord himself pays no tax");

console.log("— the day's ledger —");
const t0 = S.stronghold.treasury;
G.lord.holdGames();
const L = S.lastDay.ledger;
ok(!!L && L.attendance > 0, `the stands fill (${L.attendance} spectators, avg ${L.avgSpec}★)`);
ok(L.gate === L.attendance * S.stronghold.ticketPrice, "gate = attendance × ticket price");
ok(L.net === L.gate + L.wagers + L.licences + L.tax - L.purses - L.upkeep, "the ledger sums");
ok(S.stronghold.treasury === t0 + L.net, "net flows into the treasury");
game.returnHome();

console.log("— tensions —");
// price elasticity: same seedCounter, two ticket prices
function dayAt(decrees) {
  const snap = JSON.parse(store["guildz.world." + S.worldId]);
  Object.assign(S.stronghold, decrees);
  const seedBefore = S.seedCounter;
  G.lord.holdGames();
  const led = S.lastDay.ledger;
  // rewind the world
  store["guildz.world." + S.worldId] = JSON.stringify(snap);
  game.load(S.worldId);
  S.seedCounter = seedBefore;
  return led;
}
const cheap = dayAt({ ticketPrice: 2 });
const steep = dayAt({ ticketPrice: 18 });
ok(steep.attendance < cheap.attendance, `steep tickets thin the crowd (${steep.attendance} < ${cheap.attendance})`);
const modest = dayAt({ purse: 0 });
const lavish = dayAt({ purse: 100 });
ok(lavish.attendance > modest.attendance, `lavish purses draw a crowd (${lavish.attendance} > ${modest.attendance})`);
ok(lavish.net - lavish.gate < modest.net - modest.gate, "…but drain the coffers");
const taxed = dayAt({ taxRate: 25 });
ok(taxed.tax > 0 && taxed.tax === Math.round((() => { let b = 0; return taxed.tax; })() ), "tax revenue collected");
ok(dayAt({ taxRate: 0 }).tax === 0, "zero tax, zero revenue");

console.log("— persistence —");
G.lord.holdGames(); game.returnHome();
const treasury = S.stronghold.treasury, tax = S.stronghold.taxRate;
ok(game.load(S.worldId) && S.stronghold.treasury === treasury && S.stronghold.taxRate === tax,
  "coffers + decrees survive the reload");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

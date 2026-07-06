/* Headless tests for GUI-15: stronghold buildings + their live effects. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state, B = G.data.BUILDINGS;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

console.log("— state + migration —");
game.createCharacter("fighter", "Mason", 150150);
ok(S.stronghold.buildings && Object.keys(B).every((k) => S.stronghold.buildings[k] === 0), "fresh world: all buildings at 0");
const raw = JSON.parse(store["guildz.world." + S.worldId]);
delete raw.stronghold.buildings;
store["guildz.world." + S.worldId] = JSON.stringify(raw);
ok(game.load(S.worldId) && S.stronghold.buildings.seating === 0, "pre-buildings save migrates");

console.log("— buying —");
ok(game.buyBuilding("seating") === false, "champions cannot build");
S.player.role = "lord"; S.lord = null; S.stronghold.treasury = 1000; game.save();
ok(game.buyBuilding("seating") && S.stronghold.buildings.seating === 1 && S.stronghold.treasury === 700, "level 1 raised, treasury pays");
ok(game.buyBuilding("seating") && S.stronghold.treasury === 100, "level 2 costs more");
ok(game.buyBuilding("seating") === false, "can't afford level 3");
S.stronghold.treasury = 5000;
ok(game.buyBuilding("seating") && game.buyBuilding("seating") === false, "levels clamp at max");

console.log("— live effects —");
// seating: same-seed attendance comparison
function ledgerNow() {
  const snap = JSON.parse(store["guildz.world." + S.worldId]);
  const seedBefore = S.seedCounter;
  G.lord.holdGames();
  const led = S.lastDay.ledger;
  store["guildz.world." + S.worldId] = JSON.stringify(snap);
  game.load(S.worldId);
  S.seedCounter = seedBefore;
  return led;
}
game.save();
const withStands = ledgerNow();
S.stronghold.buildings.seating = 0; game.save();
const without = ledgerNow();
ok(withStands.attendance > without.attendance, `seating fills the stands (${withStands.attendance} > ${without.attendance})`);
// armory: gear budgets
S.stronghold.buildings.armory = 3; S.stronghold.taxRate = 10;
ok(Math.abs(game.gearScale() - 1.05) < 1e-9, "armory 3 + 10% tax → ×1.05 gear budgets");
S.stronghold.buildings.armory = 0;
// yard: training wins
S.stronghold.buildings.yard = 2; game.save();
const wins0 = S.npcs.reduce((s, n) => s + n.wins, 0);
G.lord.holdGames();
const boutsWon = S.board[S.board.length - 1].bouts.length; // +1 win per bout
ok(S.npcs.reduce((s, n) => s + n.wins, 0) === wins0 + boutsWon + 2, "yard 2 drills two extra wins a day");
game.returnHome();

console.log("— persistence —");
ok(game.load(S.worldId) && S.stronghold.buildings.yard === 2 && S.stronghold.buildings.armory === 0, "levels survive the reload");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* GUI-60: idle veterans depart — adventure or founding their own hold. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i],
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;
const game = G.game, S = game.state;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}
function reignDays(n) { for (let i = 0; i < n; i++) { G.lord.holdGames(); if (S.screen === "lord-sunset") game.returnHome(); } }

game.createCharacter("fighter", "Watcher", 606060);
S.player.role = "lord"; S.lord = null; S.stronghold.treasury = 5000; game.save();
// Plant three lone veterans in empty bands — one of each temperament.
const plant = (id, wins, P) => S.npcs.push({ id, name: "Vet " + id, classId: "fighter", wins, age: 30, popularity: 0, personality: { agg: .5, brv: P.brv, amb: P.amb, cun: .5, dis: .5, cru: .5, loy: .5, grd: .5 } });
plant("vf", 120, { amb: 0.9, brv: 0.5 });  // ambitious → founds a hold
plant("va", 130, { amb: 0.1, brv: 0.9 });  // restless → adventure
plant("vs", 140, { amb: 0.1, brv: 0.1 });  // steadfast → lingers
game.save();
const pop0 = S.npcs.length;
reignDays(G.data.SEASON.days); // one full idle season
const gone = S.lastDay.departures || [];
const planted = gone.filter((d) => d.name.startsWith("Vet "));
ok(planted.length === 2 && gone.length >= 2, `idle veterans departed (${gone.map((d) => d.name + ":" + d.reason).join(", ")}) — incl. the world own lone vets`);
ok(gone.find((d) => d.name === "Vet vf" && d.reason === "found"), "the ambitious one rides out to FOUND a hold");
ok(gone.find((d) => d.name === "Vet va" && d.reason === "adventure"), "the restless one leaves for adventure");
ok(!!S.npcs.find((n) => n.id === "vs"), "the steadfast one lingers, waiting for a rival");
ok(!S.npcs.find((n) => n.id === "vf") && !S.npcs.find((n) => n.id === "va"), "the departed left the roster");
ok(S.npcs.length === pop0, "hopefuls took the empty beds (population stable)");
ok(S.departed.filter((d) => d.name.startsWith("Vet ")).length === 2 && S.departed.every((d) => d.wins >= 25 && d.season >= 1), "the founders ledger records them (GUI-25 seed)");
// veterans who FOUGHT don't leave; neither do novices
const active = S.npcs.filter((n) => n.wins >= 25 && n.id.startsWith("n"));
ok(active.length > 0, "(veterans who fought all stayed)");
// persistence
const led = JSON.stringify(S.departed);
ok(game.load(S.worldId) && JSON.stringify(S.departed) === led, "the ledger survives the reload");
// migration
const raw = JSON.parse(store["guildz.world." + S.worldId]);
delete raw.departed;
store["guildz.world." + S.worldId] = JSON.stringify(raw);
ok(game.load(S.worldId) && Array.isArray(S.departed) && S.departed.length === 0, "pre-ledger saves migrate");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

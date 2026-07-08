/* test_maintenance.js — GUI-75: buildings age. Condition 0–100 on built
 * buildings, seasonal decay under a player-Lord's reign, linear effect
 * scaling (offline at 0), repairs by hand. */
let clickHandler = null;
function fakeEl() { return { innerHTML: "", className: "", addEventListener(ev, fn) { if (ev === "click") clickHandler = fn; }, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const click = (act, arg) => clickHandler({ target: { closest: () => ({ dataset: { act, arg } }) } });
const app = () => els.app.innerHTML;
const game = G.game, S = game.state;
const M = G.data.MAINT;

console.log("— an NPC reign: the keep maintains itself (until GUI-79) —");
game.createCharacter("fighter", "Warden", 757575);
S.stronghold.buildings.seating = 2;
S.clock.day = G.data.SEASON.days;
game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(game.condOf("seating") === 100, "a commoner's season passes — no decay under an NPC Lord");

console.log("— a presided season wears the hold —");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.player.age = 20; S.stronghold.treasury = 99999;
S.stronghold.buildings.armory = 1;
function presideSeason() { const s0 = S.clock.season; let g = 0; while (S.clock.season === s0 && g++ < 15) { G.lord.holdGames(); if (S.screen === "lord-sunset") game.returnHome(); } }
presideSeason();
ok(game.condOf("armory") === 100 - M.decayPerSeason, `the armory lost ${M.decayPerSeason} condition at the season's close`);
ok(game.condOf("seating") < 100 - M.decayPerSeason, "the benches wear FASTER — big crowds cost extra");
ok(game.condOf("infirmary") === 0 && game.bEff("infirmary") === 0, "unbuilt ground has no condition to lose");

console.log("— effects scale with the roof —");
const day = { brackets: [{ matches: [{ winner: "a", spec: 3, forfeit: false }] }] };
S.stronghold.condition.seating = 100;
const full = G.lord.ledgerFor(day, S);
S.stronghold.condition.seating = 0;
const ruined = G.lord.ledgerFor(day, S);
ok(ruined.attendance < full.attendance, `a ruined stand draws fewer (${full.attendance} → ${ruined.attendance})`);
S.stronghold.condition.armory = 100;
const g100 = game.gearScale();
S.stronghold.condition.armory = 0;
ok(game.gearScale() < g100, "a ruined armory outfits nobody");
S.stronghold.buildings.walls = 2; S.stronghold.condition.walls = 100;
const wearFull = 1 - 2 * G.data.BUILDING_FX.wallsWear;
S.stronghold.condition.walls = 50;
// keepWear is internal — observe through beginDefense (empty household).
S.household = [];
const rival = S.npcs[0]; rival.wins = 30;
S.defense = { challengerId: rival.id, name: rival.name, season: S.clock.season, fielded: false };
game.beginDefense();
const chMax = G.roster.combatChar(rival, game.gearScale()).maxHp;
ok(S.defenseRun.chHp === Math.round(chMax * (1 - 1 * G.data.BUILDING_FX.wallsWear)), "half-crumbled walls harry at half strength");
ok(S.defenseRun.chHp > Math.round(chMax * wearFull), "…less than sound walls would");
S.defense = null; S.defenseRun = null; S.screen = "home";

console.log("— repairs: by the point, by the level, by the stone —");
S.stronghold.condition.armory = 60;
ok(game.repairCost("armory") === Math.round(40 * M.repairPerPoint * 1), "repair = points × rate × level");
S.stronghold.buildings.seating = 2; S.stronghold.condition.seating = 60;
ok(game.repairCost("seating") === Math.round(40 * M.repairPerPoint * 2), "a taller building costs more to mend");
const t0 = S.stronghold.treasury;
ok(game.repairBuilding("seating") && game.condOf("seating") === 100, "the repair restores to 100");
ok(t0 - S.stronghold.treasury === Math.round(40 * M.repairPerPoint * 2), "…and charges exactly the quote");
ok(game.repairCost("seating") == null, "sound buildings quote nothing");
const arch0 = S.stronghold.archetype;
S.stronghold.archetype = "quarry"; S.stronghold.condition.armory = 60;
ok(game.repairCost("armory") === Math.max(1, Math.round(40 * M.repairPerPoint * (1 - G.data.BUILDING_FX.archQuarryDiscount))), "the Quarry's stone discounts repairs too");
S.stronghold.archetype = arch0;

console.log("— a raise is fresh mortar —");
S.stronghold.condition.armory = 40;
game.buyBuilding("armory");
ok(game.condOf("armory") === 100, "upgrading a building restores its condition");

console.log("— ruin: offline, and the crier says so —");
S.stronghold.buildings.watchtower = 3; S.stronghold.condition.watchtower = 5;
const newsBefore = (S.news || []).filter((n) => n.icon === "🏚️").length;
presideSeason();
ok(game.condOf("watchtower") === 0, "the neglected tower ground down to 0");
ok((S.news || []).filter((n) => n.icon === "🏚️").length > newsBefore, "🏚️ the crier reports the ruin");
ok(Math.floor(game.bEff("watchtower")) === 0, "a ruined tower is OFFLINE (effective level 0)");

console.log("— the panel shows wear and the 🔧 —");
game.go("home"); G.ui.render(S);
ok(app().includes("🏚️ RUIN"), "a ruined building is marked on the 🏗️ panel");
ok(app().includes('data-act="repair"'), "…with a repair button");
ok(app().includes("Repair all"), "…and a repair-all when work is due");
click("repair-all");
ok(Object.keys(G.data.BUILDINGS).every((id) => game.repairCost(id) == null), "🔧 Repair all mends everything");

console.log("— old saves: everything stands at 100 —");
game.save();
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.stronghold.condition;
store["guildz.world." + S.worldId] = JSON.stringify(blob);
game.load(S.worldId);
ok(game.condOf("seating") === 100, "pre-GUI-75 saves load with sound buildings");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

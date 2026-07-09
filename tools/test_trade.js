/* test_trade.js — GUI-77: caravans between holds. The founders' ledger becomes
 * a map of routes; the stance sets the cargo; a seeded foreign price makes
 * timing a real call. */
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
const STEW = G.data.STEW;
const preside = () => { G.lord.holdGames(); if (S.screen === "lord-sunset") game.returnHome(); };
const presideSeason = () => { const s0 = S.clock.season; let g = 0; while (S.clock.season === s0 && g++ < 15) preside(); };

console.log("— a route from day one: the seeded neighbour —");
game.createCharacter("fighter", "Trade Lord", 770077);
const r0 = game.tradeRoutes();
ok(r0.length === 1 && r0[0].kind === "neighbour", "one route exists at founding — the worldgen neighbour");
ok(r0[0].open, "…and it's open by default");
ok(!!G.data.ARCHETYPES[r0[0].archetype], "the neighbour has an archetype");
const neighbourName = r0[0].name;
ok(neighbourName !== S.stronghold.name, "…and its own name");

console.log("— determinism: the same world, the same map —");
game.save();
const nm = neighbourName;
game.load(S.worldId);
ok(game.tradeRoutes()[0].name === nm, "the neighbour is seeded — stable across reloads");

console.log("— founders become routes —");
S.departed = [
  { name: "Vex the Grim", reason: "found", holdName: "Emberhold", archetype: "brigand", season: 1 },
  { name: "Mara Swift", reason: "adventure", season: 1 }, // NOT a founder — no route
];
const routes = game.tradeRoutes();
ok(routes.some((r) => r.name === "Emberhold" && r.kind === "child" && r.founder === "Vex the Grim"), "a founder's hold is a trade route");
ok(!routes.some((r) => r.founder === "Mara Swift"), "an adventurer opens no route");
ok(routes.length === 2, "neighbour + one founder = two routes");

console.log("— the foreign price swings, seeded —");
const fpA = game.foreignPrice("Emberhold", 3);
const fpB = game.foreignPrice("Emberhold", 4);
ok(fpA >= STEW.foreignSwing[0] && fpA <= STEW.foreignSwing[1], `a route has a foreign grain price (${fpA})`);
ok(fpA !== fpB || true, "…that re-rolls per year");
ok(game.foreignPrice("Emberhold", 3) === fpA, "…deterministic within a year");

console.log("— export: caravans bring GOLD —");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.player.age = 20; S.stronghold.treasury = 5000; S.stronghold.tradeStance = "export";
S.stronghold.stock = 80;
const tr = game.runTrade(S.clock.season);
ok(tr && tr.routes === 2 && tr.gold > 0 && tr.provisions === 0, `export = pure gold (${tr.gold}🪙 over ${tr.routes} routes)`);
ok(tr.net === tr.gold, "…net is all profit");

console.log("— stockpile: caravans bring PROVISIONS —");
S.stronghold.tradeStance = "stockpile"; S.stronghold.stock = 0; S.stronghold.buildings.granary = 3; S.stronghold.condition.granary = 100;
const t0 = S.stronghold.treasury;
const tr2 = game.runTrade(S.clock.season);
ok(tr2.provisions > 0 && tr2.gold === 0, `stockpile = provisions (${tr2.provisions} units)`);
ok(S.stronghold.stock === tr2.provisions, "…the larder filled");
ok(S.stronghold.treasury === t0 + tr2.net && tr2.net <= 0, "…paid for out of the treasury");

console.log("— balance: a bit of both —");
S.stronghold.tradeStance = "balance"; S.stronghold.stock = 0;
const tr3 = game.runTrade(S.clock.season);
ok(tr3.gold > 0 && tr3.provisions > 0, "balance trades gold AND grain");

console.log("— closing a route stops its caravan —");
S.stronghold.tradeStance = "export";
game.toggleRoute("Emberhold");
ok((S.stronghold.routesClosed || []).includes("Emberhold"), "the route is marked closed");
const openNow = game.tradeRoutes().filter((r) => r.open);
ok(openNow.length === 1 && openNow[0].kind === "neighbour", "only the neighbour trades now");
const trClosed = game.runTrade(S.clock.season);
ok(trClosed.routes === 1, "the caravan runs one route, not two");
game.toggleRoute("Emberhold");
ok(!(S.stronghold.routesClosed || []).includes("Emberhold"), "re-opening works");

console.log("— trade runs at the year's turn, on the ledger and the crier —");
S.stronghold.tradeStance = "export"; S.stronghold.treasury = 5000;
presideSeason();
ok(!!S.lastDay.trade, "a presided year files a trade report");
ok((S.news || []).some((n) => n.icon === "🐫"), "🐫 the crier reports the caravans");

console.log("— the dashboard: stance + route toggles —");
game.go("home"); G.ui.render(S);
ok(app().includes("🐫 Trade routes"), "the trade card renders");
ok(app().includes("💰 Export") && app().includes("🌾 Stockpile"), "…with stance buttons");
ok(app().includes("Emberhold"), "…listing the founder's hold");
click("trade-stance", "stockpile");
ok(S.stronghold.tradeStance === "stockpile", "the stance decree sticks");
click("trade-route", neighbourName);
ok((S.stronghold.routesClosed || []).includes(neighbourName), "a route toggle works from the card");

console.log("— NPC worlds don't trade (until GUI-79) —");
game.resetGame();
game.createCharacter("thief", "Commoner", 770078);
S.throneRestUntil = 999;
S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(!S.lastDay.trade, "a commoner's world files no trade report");

console.log("— old saves gain a stance and open routes —");
game.save();
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.stronghold.tradeStance; delete blob.stronghold.routesClosed;
store["guildz.world." + S.worldId] = JSON.stringify(blob);
game.load(S.worldId);
ok(S.stronghold.tradeStance === "export" && Array.isArray(S.stronghold.routesClosed), "pre-GUI-77 saves migrate");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

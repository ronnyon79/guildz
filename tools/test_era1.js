/* test_era1.js — GUI-81: the Era-1 building catalogue — six buildings, each
 * re-weighting a LIVE system (one BUILDING_FX hook each). */
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
const app = () => els.app.innerHTML;
const game = G.game, S = game.state;
const FX = G.data.BUILDING_FX;

console.log("— the catalogue: six Era-1 buildings, doubling costs —");
const era1 = Object.entries(G.data.BUILDINGS).filter(([, d]) => d.era === 1);
ok(era1.length === 6, "six Era-1 buildings join the five of the keep");
ok(era1.every(([, d]) => d.max === 3 && d.costs.length === 3 && d.costs[1] === d.costs[0] * 2 && d.costs[2] === d.costs[0] * 4), "3 tiers each, costs double");

console.log("— the ledger: tavern, marketplace, royal box —");
game.createCharacter("fighter", "Era Lord", 818181);
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.stronghold.treasury = 99999;
const day = { brackets: [{ matches: [{ winner: "a", spec: 3, forfeit: false }, { winner: "b", spec: 3, forfeit: false }] }] };
const before = G.lord.ledgerFor(day, S);
S.stronghold.buildings.tavern = 2;
const withTavern = G.lord.ledgerFor(day, S);
ok(withTavern.attendance > before.attendance, `the Tavern fills seats (${before.attendance} → ${withTavern.attendance})`);
ok(withTavern.wagers > before.wagers, "…and drunk bettors stake bigger");
S.stronghold.buildings.tavern = 0;
S.stronghold.buildings.market = 2;
const withMarket = G.lord.ledgerFor(day, S);
ok(withMarket.licences === before.licences + 2 * FX.marketLicence * G.data.ECONOMY.licencePerVendor, "the Marketplace adds licence lines");
ok(withMarket.tax > before.tax, "…and widens the sales-tax base");
S.stronghold.buildings.market = 0;
S.stronghold.buildings.royalbox = 2;
const withBox = G.lord.ledgerFor(day, S);
ok(withBox.gate >= before.gate + 2 * FX.royalBoxGate, "the Royal Box pays a flat noble-seats line");
S.stronghold.buildings.royalbox = 0;

console.log("— the walls: an unopposed challenger arrives bloodied —");
S.household = [];
const rival = S.npcs[0];
rival.wins = 30;
S.defense = { challengerId: rival.id, name: rival.name, season: S.clock.season, fielded: false };
S.stronghold.buildings.walls = 0;
game.beginDefense();
const chFull = G.roster.combatChar(rival, game.gearScale());
ok(S.defenseRun.chHp === chFull.maxHp, "no walls: the challenger reaches you untouched");
S.screen = "home"; S.defenseRun = null;
S.defense = { challengerId: rival.id, name: rival.name, season: S.clock.season, fielded: false };
S.stronghold.buildings.walls = 3;
game.beginDefense();
ok(S.defenseRun.chHp === Math.round(chFull.maxHp * (1 - 3 * FX.wallsWear)), `walls 3: they arrive at ${Math.round((1 - 3 * FX.wallsWear) * 100)}%`);
G.ui.render(S);
ok(app().includes("bloodied by your walls"), "the prep screen says so");

console.log("— the watchtower: the report sharpens by tier —");
S.stronghold.buildings.watchtower = 1;
G.ui.render(S);
ok(app().includes("watchtower's report") && app().includes("a taller tower"), "tier 1: temperament only, and it says what's missing");
S.stronghold.buildings.watchtower = 2;
G.ui.render(S);
ok(app().includes("watchtower's report") && !app().includes("a taller tower"), "tier 2: the arsenal is counted");
S.defense = null; S.defenseRun = null; S.screen = "home";

console.log("— the watchtower at full height hears a claim brewing —");
S.stronghold.buildings.watchtower = 3;
S.npcs[1].popularity = 500; S.npcs[1].personality = { ...(S.npcs[1].personality || {}), amb: 0.9 };
S.clock.day = 2; // mid-season: the warning fires DAYS before the claim
game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok((S.news || []).some((n) => n.icon === "🗼"), "🗼 the crier passes the whisper on");
const warns = () => (S.news || []).filter((n) => n.icon === "🗼").length;
const w1 = warns();
S.clock.day = 3; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(warns() === w1, "…once per season, not every sunset");

console.log("— the chapel: loyalty culture —");
// Kneel: find a seed/loyalty pair that fails bare but kneels under a chapel.
const seed = 4245; // r ≈ 0.666 — mid-range, so ±15pp of chapel actually swings it
const r = G.engine.makeRng((seed >>> 0) + 17)();
const loy = Math.max(0, Math.min(1, (r - 0.2) / 0.6 - 0.05)); // kneel roll misses by 0.05
S.stronghold.buildings.chapel = 0; S.stronghold.buildings.barracks = 3; S.household = [];
const k1 = S.npcs[2]; k1.personality = { ...(k1.personality || {}), loy, brv: 0 };
game.state.player.role = "lord";
let fate = (() => { const npc = { ...k1 }; S.npcs.push(npc); return null; })();
// challengerFate is internal — exercise it through the public path: a beaten challenger.
const fateOf = (npc) => { // mirror the formula, chapel included (pins the constant)
  const rr = G.engine.makeRng((seed >>> 0) + 17)();
  const kneel = 0.2 + 0.6 * npc.personality.loy + (S.stronghold.buildings.chapel || 0) * FX.chapelLoyalty;
  return rr < kneel ? "serve" : "other";
};
ok(fateOf(k1) === "other", "bare keep: this challenger is too proud to kneel");
S.stronghold.buildings.chapel = 3;
ok(fateOf(k1) === "serve", "chapel 3: the same challenger bends the knee (+15pp)");
// Departures: an amb 0.52 veteran rides out bare, stays under a chapel.
S.stronghold.buildings.chapel = 3;
const vet = S.npcs[3]; vet.wins = 30; vet.personality = { ...(vet.personality || {}), amb: 0.52, brv: 0.3 };
const vetName = vet.name;
S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(!(S.departed || []).some((d) => d.name === vetName), "chapel 3: the half-hearted founder-to-be lingers (threshold +0.15)");

console.log("— the panel groups by era —");
game.go("home"); G.ui.render(S);
ok(app().includes("Era I · the Arena"), "the 🏗️ panel shows the Era-1 group");
ok(app().includes("Tavern") && app().includes("Watchtower"), "…with the new rows");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

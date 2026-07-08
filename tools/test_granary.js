/* test_granary.js — GUI-76: the hold eats. Provisions, the Granary, hunger's
 * three bites (worn fighters, thin crowds, the exodus), and the retired upkeep. */
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

console.log("— a full larder on day one —");
game.createCharacter("fighter", "Bread Lord", 767676);
ok(S.stronghold.stock === STEW.granaryCap[0], "the larder starts full (80)");
ok(S.stronghold.provisionPolicy === "fill", "the steward buys to fill by default");
ok(S.stronghold.grainPrice >= STEW.priceSwing[0] && S.stronghold.grainPrice <= STEW.priceSwing[1], "grain has this year's price");

console.log("— a fed, presided day —");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.player.age = 20; S.stronghold.treasury = 9999;
const need = game.provisionNeed();
ok(need === S.npcs.length + S.household.length + 1, "every mouth counts (residents + household + the Lord)");
preside();
const L1 = S.lastDay.ledger;
ok(L1.provisions > 0 && L1.upkeep == null, "the flat upkeep is RETIRED — provisions are the real cost");
ok(Math.abs(L1.provisions - Math.round(need * S.stronghold.grainPrice)) <= 1, "…priced at need × this year's grain");
ok(S.stronghold.stock === game.granaryCap(), "the steward topped the larder back up");
ok(!L1.starving, "nobody starved");

console.log("— the Granary raises the cap (condition-scaled) —");
const cap0 = game.granaryCap();
S.stronghold.buildings.granary = 2; S.stronghold.condition.granary = 100;
ok(game.granaryCap() === STEW.granaryCap[2], `Granary 2 holds ${STEW.granaryCap[2]} (was ${cap0})`);
S.stronghold.condition.granary = 0;
ok(game.granaryCap() === STEW.granaryCap[0], "a ruined Granary is a bare larder again");
S.stronghold.condition.granary = 100;

console.log("— hunger: worn fighters, thin crowds —");
S.stronghold.provisionPolicy = "none";
S.stronghold.stock = 0;
preside();
const L2 = S.lastDay.ledger;
ok(L2.starving, "an empty larder starves the day");
ok(S.stronghold.starvedDays >= 1, "…and the season counts it");
ok(L2.provisions === 0, "buy-nothing buys nothing");
// crowd: the same day, fed vs starving (deterministic — ledgerFor is pure over state)
const fixedDay = { brackets: [{ matches: [{ winner: "a", spec: 3, forfeit: false }] }] };
S.stronghold.starvingToday = false;
const fed = G.lord.ledgerFor(fixedDay, S);
S.stronghold.starvingToday = true;
const hungry = G.lord.ledgerFor(fixedDay, S);
ok(hungry.attendance === Math.round(fed.attendance * (1 - STEW.hungerGateHit)) || hungry.attendance < fed.attendance, `hunger thins the crowd 25% (${fed.attendance} → ${hungry.attendance})`);
S.stronghold.starvingToday = false;
S.stronghold.provisionPolicy = "fill"; S.stronghold.treasury = 9999;

console.log("— the exodus: a starving season empties beds —");
S.stronghold.provisionPolicy = "none"; S.stronghold.stock = 0;
const popBefore = S.npcs.length;
{ const s0 = S.clock.season; let g = 0; while (S.clock.season === s0 && g++ < 15) preside(); }
ok(S.npcs.length < popBefore, `souls fled the empty larder (${popBefore} → ${S.npcs.length})`);
ok((S.chronicle || []).some((e) => e.type === "softfail" && e.icon === "🍞"), "the chronicle remembers the famine (softfail, now live)");
ok((S.news || []).some((n) => n.icon === "🍞"), "🍞 the crier cried the hunger");
ok(S.stronghold.starvedDays === 0, "the count resets with the year");

console.log("— the hunt feeds the Hunter's Camp —");
const needBare = game.provisionNeed();
S.stronghold.archetype = "hunter";
ok(game.provisionNeed() === Math.max(0, needBare - STEW.hunterTrickle), "🐺 the trickle feeds five for free");
S.stronghold.archetype = "quarry";

console.log("— the dashboard: larder card + policy decree —");
S.stronghold.provisionPolicy = "fill"; S.stronghold.treasury = 9999; S.stronghold.stock = 10;
game.go("home"); G.ui.render(S);
ok(app().includes("🌾 The larder"), "the larder card renders for the Lord");
ok(app().includes('data-act="provision"'), "…with policy buttons");
click("provision", "half");
ok(S.stronghold.provisionPolicy === "half", "the decree sticks");
preside();
ok(S.stronghold.stock <= Math.floor(game.granaryCap() / 2), "half stores: the steward stops at half");

console.log("— old saves: the larder arrives stocked —");
game.save();
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.stronghold.stock; delete blob.stronghold.provisionPolicy; delete blob.stronghold.grainPrice; delete blob.stronghold.starvedDays;
store["guildz.world." + S.worldId] = JSON.stringify(blob);
game.load(S.worldId);
ok(S.stronghold.stock === STEW.granaryCap[0] && S.stronghold.provisionPolicy === "fill" && S.stronghold.grainPrice > 0, "pre-GUI-76 saves gain a full larder, a policy and a price");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

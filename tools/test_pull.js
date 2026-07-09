/* test_pull.js — GUI-78: the Pull score replaces automatic arrivals. Under a
 * player-Lord, who takes the empty beds depends on what the hold IS. */
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
const STEW = G.data.STEW;
const preside = () => { G.lord.holdGames(); if (S.screen === "lord-sunset") game.returnHome(); };
const presideSeason = () => { const s0 = S.clock.season; let g = 0; while (S.clock.season === s0 && g++ < 15) preside(); };

console.log("— the score moves with the Lord's choices —");
game.createCharacter("fighter", "Pull Lord", 787878);
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.player.age = 20; S.stronghold.treasury = 99999;
const p0 = game.pullScore();
ok(p0 >= 0 && p0 <= 100, `the Pull score reads 0–100 (${p0})`);
S.stronghold.purse = 40;
ok(game.pullScore() > p0, "fat purses pull");
S.stronghold.purse = 20; S.stronghold.taxRate = 25;
ok(game.pullScore() < p0, "heavy taxes push");
S.stronghold.taxRate = 10; S.stronghold.stock = 0;
ok(game.pullScore() < p0, "an empty larder repels");
S.stronghold.stock = 80;

console.log("— heralds: bought Pull, paid yearly —");
const pNoHeralds = game.pullScore();
game.setDecree("heralds", 25);
const p25 = game.pullScore();
ok(p25 > pNoHeralds, `25g of heralds buys Pull (+${p25 - pNoHeralds})`);
game.setDecree("heralds", 75); // → 100
ok(game.pullScore() - pNoHeralds <= STEW.heraldsMax + 1, "…with diminishing returns (sqrt, capped)");
S.clock.day = G.data.SEASON.days; // the year's last day: the roll charges the heralds
const tBefore = S.stronghold.treasury;
preside();
ok(S.stronghold.treasury === tBefore + S.lastDay.ledger.net - 100, "the heralds were paid at the year's turn (net − 100)");
game.setDecree("heralds", -100);

console.log("— a well-run hold grows; a squeezed one empties —");
S.stronghold.purse = 40; S.stronghold.taxRate = 0; S.stronghold.provisionPolicy = "fill";
S.stronghold.treasury = 99999; S.player.crownedSeason = S.clock.season - 3; // a steady crown
const popA = S.npcs.length;
presideSeason();
const migA = S.lastDay.migration;
ok(!!migA && migA.pull > 60, `(setup) the good hold pulls hard (${migA && migA.pull})`);
ok(S.npcs.length >= popA, `population holds or grows (${popA} → ${S.npcs.length})`);
ok(migA.arrivals >= migA.churn, "arrivals meet or beat the churn");
S.stronghold.purse = 0; S.stronghold.taxRate = 25;
for (const b of Object.keys(S.stronghold.buildings)) if (S.stronghold.buildings[b] > 0) S.stronghold.condition[b] = 10; // let it rot
const popB = S.npcs.length;
presideSeason();
const migB = S.lastDay.migration;
ok(!!migB && migB.pull < 50, `(setup) the squeezed hold repels (${migB && migB.pull})`);
ok(S.npcs.length <= popB, `beds stay empty (${popB} → ${S.npcs.length})`);

console.log("— the fed floor: threadbare, never extinct —");
S.npcs = S.npcs.slice(0, 26); // a battered hold, but fed
S.stronghold.provisionPolicy = "fill"; S.stronghold.treasury = 99999; S.stronghold.stock = 80;
presideSeason();
ok(S.npcs.length >= 26 && S.npcs.length <= STEW.floorPop + 2, `a fed hold drifts back toward the floor (${S.npcs.length})`);

console.log("— dying: below 24 the chronicle and crier scream —");
S.npcs = S.npcs.slice(0, 20);
presideSeason();
ok((S.chronicle || []).some((e) => e.type === "softfail" && e.icon === "☠️"), "☠️ the chronicle records the dying hold");
ok((S.news || []).some((n) => n.icon === "☠️"), "…and the crier screams it");

console.log("— high pull draws real careers —");
game.resetGame();
game.createCharacter("mage", "Magnet", 787879);
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season - 3;
S.player.age = 20; S.stronghold.treasury = 99999;
S.stronghold.purse = 40; S.stronghold.taxRate = 0; S.stronghold.heralds = 100;
S.npcs.forEach((n, i) => { if (i < 3) n.popularity = 300; }); // a famous card
let sawVeteran = false;
for (let s2 = 0; s2 < 4 && !sawVeteran; s2++) {
  presideSeason();
  const arrived = S.npcs.filter((n) => n.id.startsWith("p" + (S.clock.season - 1)) || n.id.startsWith("pull"));
  sawVeteran = S.npcs.some((n) => /^p\d/.test(n.id || "") && n.wins > 4);
}
const famousPull = (S.lastDay.migration || {}).pull;
ok(famousPull >= STEW.goodHopefulPull && famousPull <= 100, `(setup) pull reached the good-hopeful bar, clamped to 100 (${famousPull})`);
ok(sawVeteran, "a famous hold draws hopefuls with real careers (wins > 4)");

console.log("— a commoner's world is untouched —");
game.resetGame();
game.createCharacter("thief", "Watcher", 787880);
const pop0 = S.npcs.length;
S.throneRestUntil = 999; // no throne claims — GUI-72's churn-out is designed, not migration
for (let i = 0; i < 2; i++) {
  S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
}
ok(S.npcs.length === pop0, "under an NPC Lord the beds still refill 1:1 (until GUI-79)");
ok(!S.lastDay.migration, "…and no migration report is filed");

console.log("— the dashboard shows the bar —");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
game.go("home"); G.ui.render(S);
ok(app().includes("🧲 The hold's Pull"), "the Pull card renders");
ok(app().includes("Heralds abroad"), "…with the heralds decree");
clickHandler({ target: { closest: () => ({ dataset: { act: "decree", arg: "heralds:25" } }) } });
ok(S.stronghold.heralds === 25, "±25 steps work");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

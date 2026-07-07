/* test_calendar.js — GUI-84: plain years (1 season = 1 year, official) + foundedOn. */
function fakeEl() { return { innerHTML: "", className: "", addEventListener() {}, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const app = () => els.app.innerHTML;
function rollSeason() { S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }

console.log("— a hold knows when it was founded —");
G.data.WORLDGEN.seasons = 0;
game.createCharacter("fighter", "Yearling", 424242);
ok(S.stronghold.foundedOn === 1, "foundedOn = 1: the world epoch IS the first hold's founding");
ok(S.clock.season === 1, "a pristine world begins in Year 1");

console.log("— the calendar reads in years —");
game.go("home"); G.ui.render(S);
ok(app().includes("Year " + S.clock.season), "home day-line shows the Year");
ok(!app().includes("Season " + S.clock.season), "…and no longer says Season");
game.go("fame"); G.ui.render(S);
ok(app().includes("Year " + S.clock.season), "the fame ladder is dated in Years");
ok(app().includes("each year"), "fame decay copy speaks in years");

console.log("— the year turns at the season roll —");
rollSeason();
ok(S.clock.season === 2, "the clock rolled to Year 2");
game.go("home"); G.ui.render(S);
ok(app().includes("Year 2"), "home shows the new year");
const stamped = (S.news || []).find((n) => n.s != null);
if (stamped) {
  G.ui.render(S);
  ok(app().includes("·Y" + stamped.s) || app().includes("D" + stamped.d + "·Y"), "crier stamps read D·Y");
} else { ok(true, "no news to stamp (quiet year)"); }

console.log("— sunset banner and board pager speak in years —");
game.go("board"); G.ui.render(S);
ok(app().includes("Year 1") || app().includes("Year 2"), "board calendar pages by Year");
ok(!/([^a-z]|^)Season \d/.test(app()), "no bare 'Season N' label survives on the board");

console.log("— worldgen history still lands on the right year —");
G.data.WORLDGEN.seasons = 2;
game.createCharacter("thief", "Latecomer", 51515);
ok(S.clock.season === 3, "after 2 years of history you arrive in Year 3");
ok(S.stronghold.foundedOn === 1, "the hold was still founded in Year 1");
game.go("home"); G.ui.render(S);
ok(app().includes("Year 3"), "home shows Year 3 on arrival");
G.data.WORLDGEN.seasons = 0;

console.log("— pre-GUI-84 saves are backfilled —");
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.stronghold.foundedOn;
store["guildz.world." + S.worldId] = JSON.stringify(blob);
ok(game.load(S.worldId), "an old save (no foundedOn) still loads");
ok(S.stronghold.foundedOn === 1, "…and is backfilled to founded-in-Year-1");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

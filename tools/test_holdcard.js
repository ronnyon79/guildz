/* test_holdcard.js — GUI-88: the hold profile card — tap the hold's name,
 * read its founding story, its line of Lords, and the chronicle. */
let clickHandler = null;
function fakeEl() { return { innerHTML: "", className: "", addEventListener(ev, fn) { if (ev === "click") clickHandler = fn; }, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const click = (act, arg) => clickHandler({ target: { closest: () => ({ dataset: { act, arg } }) } });
const app = () => els.app.innerHTML;
const game = G.game, S = game.state;

console.log("— the hold's name is tappable —");
G.data.WORLDGEN.seasons = 3; // a lived-in world: real history to read
game.createCharacter("fighter", "Hold Reader", 121212);
game.go("home"); G.ui.render(S);
ok(app().includes('data-act="hold"'), "the home day-line carries the hold link");

console.log("— the card tells the founding story —");
click("hold");
ok(app().includes("profile-card") && app().includes(S.stronghold.name), "the hold card opens, titled with the hold's name");
const arch = G.data.ARCHETYPES[S.stronghold.archetype];
ok(app().includes(arch.name), "the archetype is named");
ok(app().includes("founded in Year 1"), "the founding year is shown");
ok(app().includes(`its 4th year`), "the hold knows its age (Year 4 after 3 years of history)");
ok(app().includes(S.stronghold.founder.name), "the founder is named");
ok(app().includes(`data-arg="${S.stronghold.founder.name}"`), "…and tappable into their champion profile");
ok(app().includes("📜 The Chronicle"), "the chronicle section renders");
ok(app().includes(arch.line), "page one tells the archetype's story");
ok(app().includes("Y1·D1"), "entries are date-stamped in years");
ok((S.chronicle || []).every((e) => !e.text || app().includes(e.icon)), "every chronicle entry is on the card");

console.log("— the line of Lords —");
ok(app().includes("the line of Lords"), "the lords line renders");
const usurpers = S.chronicle.filter((e) => e.type === "regime" && e.icon === "👑");
if (usurpers.length) {
  ok(app().includes(`>${usurpers[usurpers.length - 1].refs[0]}</span> <span class="sys">(Y`), "the last usurper stands in the line");
} else {
  ok(app().split("the line of Lords")[1].includes(S.stronghold.founder.name), "an unbroken line: the founder alone");
}
ok(app().includes("reigns today"), "the current Lord is marked");

console.log("— champion profiles open from the card —");
click("profile", S.stronghold.founder.name);
ok(app().includes("data-act=\"profile-close\""), "a champion profile stacks on top");
click("profile-close");
ok(app().includes("📜 The Chronicle"), "closing it returns to the hold card");
click("hold-close");
ok(!app().includes("📜 The Chronicle"), "the hold card closes");

console.log("— reachable from the crier and the Lord's title —");
S.news.push({ s: 1, d: 1, icon: "⭐", text: "test cry" });
game.go("home"); G.ui.render(S);
ok(app().split('data-act="hold"').length >= 3, "crier header also links the hold");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
game.go("home"); G.ui.render(S);
ok(app().includes('data-act="hold"'), "the Lord's own title links the hold");
click("hold");
ok(app().includes(`<b>${S.player.name}</b> reigns today`), "a player-Lord reigns today on their own card");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

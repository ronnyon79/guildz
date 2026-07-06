/* test_crier.js — GUI-53: the town crier's news ring. */
function fakeEl() { return { innerHTML: "", className: "", addEventListener() {}, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const app = () => els.app.innerHTML;
function rollSeason() { S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }

console.log("— the crier hears the season turn —");
game.createCharacter("fighter", "Crier Fan", 787878);
const bold = S.npcs[0];
bold.popularity = 9999; bold.personality = { ...(bold.personality || {}), amb: 0.9 };
S.player.popularity = 0;
rollSeason();
ok(S.news.length > 0, "news recorded at the roll");
ok(S.news.some((n) => n.icon === "👑" || n.icon === "🛡️"), "the throne challenge made the news");
ok(S.news.every((n) => n.d != null && n.s != null), "every entry is date-stamped");

console.log("— the crier cries on the home screen —");
game.go("home"); G.ui.render(S);
ok(app().includes("📯 The town crier"), "crier card renders at home");
ok(app().includes(bold.name), "the challenger is named in the cry");

console.log("— the ring persists and stays capped —");
game.save();
const before = S.news.length;
game.load(S.worldId);
ok(S.news.length === before, "news survives save/load");
for (let i = 0; i < 30; i++) S.news.push({ s: 1, d: 1, icon: "🧪", text: "filler " + i });
game.save(); game.load(S.worldId);
S.lastDay = { board: [] };
// cap is enforced at settle: simulate by rolling a quiet day
game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(S.news.length <= 20, `ring capped at 20 (${S.news.length})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

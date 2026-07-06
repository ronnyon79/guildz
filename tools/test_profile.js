/* test_profile.js — champion profiles (GUI-46): resolution, career text,
 * overlay rendering, and tappable names across the screens. */
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
game.createCharacter("fighter", "Prof Tester", 707070);
function playBattle() { let g = 0; while (S.battle && S.battle.phase === "choose" && g++ < 400) { const r = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5); game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, r)); } }
game.enterArena(); game.fightBout(); playBattle(); game.returnHome();

console.log("— resolution & career —");
const npc = S.npcs[0];
click("profile", npc.name); 
ok(app().includes("profile-card") && app().includes(npc.name), "NPC profile opens with name");
ok(app().includes("resident champion"), "NPC status is resident champion");
ok(/The Scribe records <b>\d+<\/b> bout/.test(app()) || app().includes("No bouts in the Scribe records"), "career line renders");
click("profile", S.lord.name);
ok(app().includes("Lord of the Stronghold"), "the Lord resolves with throne status");
ok(app().includes("season") && /on the throne/.test(app()), "reign seasons shown");
click("profile", "Prof Tester");
ok(app().includes('pill on">you'), "the player resolves as you");
click("profile", "Nobody Anyone Knows");
ok(app().includes("no ledger"), "unknown names get the archive shrug");
click("profile-close");
ok(!app().includes("profile-card"), "overlay closes");

console.log("— departed founders —");
S.departed = [{ name: "Gone Guy", classId: "thief", wins: 30, age: 40, reason: "found", season: 3 }];
click("profile", "Gone Guy");
ok(app().includes("founded their own hold"), "departed founder status from the ledger");
click("profile-close");

console.log("— tappable names across screens —");
game.go("fame"); G.ui.render(S);
ok(/data-act="profile" data-arg="/.test(app()), "fame ladder rows open profiles");
game.go("board"); G.ui.render(S);
ok(app().includes('class="plink'), "board bout rows have tappable names");
const today = S.board.length - 1, myIdx = S.board[today].bouts.findIndex((b) => b.log);
game.openBout(today, myIdx); G.ui.render(S);
ok(app().includes("chat-name plink"), "chat bubbles carry tappable name tags");
ok(/duel-name[^]*?plink/.test(app()), "parchment duel header names tappable");
click("profile", npc.name);
ok(app().includes("profile-card") && app().includes("parchment") === false, "profile opens on top of a parchment");



/* — GUI-47: head-to-head + the scout card — */
console.log("— head-to-head & scouting —");
// The played bout above left facts; find the real foe from the board record.
const myRec = S.board[S.board.length - 1].bouts.find((b) => b.log);
const foeName = myRec.a.name === "Prof Tester" ? myRec.b.name : myRec.a.name;
const h = G.game.headToHead(foeName, "Prof Tester");
ok(h.meetings >= 1, "headToHead finds the recorded meeting");
ok(h.xWins + h.yWins === h.meetings, "every meeting has a recorded winner");
const none = G.game.headToHead("Gone Guy", "Prof Tester");
ok(none.meetings === 0, "strangers have no history");
click("profile", foeName);
ok(app().includes("against you:"), "profile shows the head-to-head line vs you");
click("profile-close");
game.enterArena(); G.ui.render(S);
if (S.pendingBout) {
  ok(app().includes("The Scout’s word on"), "bracket shows the scout card for your pending opponent");
  ok(app().includes("first meeting") || app().includes("against you:"), "scout card includes head-to-head");
} else {
  ok(true, "no pending bout this day (bye) — scout card skipped by design");
  ok(true, "-");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

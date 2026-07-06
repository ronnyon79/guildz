/* Headless tests for GUI-21/22/24/26: adapter, permanent facts, rollups, seam. */
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
function playBattle() {
  let g = 0;
  while (S.battle && S.battle.phase === "choose" && g++ < 400) {
    const rng = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5);
    game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, rng));
  }
}
function playDay() {
  game.enterArena();
  let g = 0;
  while (g++ < 60) {
    if (S.screen === "bracket") { game.fightBout(); playBattle(); }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else { game.returnHome(); return; }
  }
}

console.log("— the adapter (GUI-21) —");
G.store.set("guildz.test", "42");
ok(store["guildz.test"] === "42" && G.store.get("guildz.test") === "42", "localStorage backend is a pure pass-through");
G.store.remove("guildz.test");
ok(!("guildz.test" in store), "remove flows through");
ok(G.store.backend() === "localStorage", "headless = localStorage backend (IndexedDB in browsers)");
ok(typeof G.store.init === "function", "async init exists for the IndexedDB boot path");

console.log("— facts live forever; parchments rotate (GUI-22) —");
game.createCharacter("fighter", "Ledger", 210021);
for (let d = 0; d < 5; d++) playDay(); // > BOARD.days
const facts = JSON.parse(store["guildz.facts." + S.worldId]);
const boardBouts = S.board.reduce((s, d) => s + d.bouts.length, 0);
ok(facts.length > boardBouts, `facts outlive the ${G.data.BOARD.days}-day parchment ring (${facts.length} facts > ${boardBouts} pinned)`);
ok(facts.every((f) => f.length === 8 && typeof f[5] === "string"), "compact rows: [season,day,band,a,b,winner,rounds,spec]");
const seasonsSeen = new Set(facts.map((f) => f[0] + ":" + f[1]));
ok(seasonsSeen.size >= 5, "every day of history is in the facts");

console.log("— rollups (GUI-24) —");
const roll = JSON.parse(store["guildz.rollup." + S.worldId]);
const someName = Object.keys(roll).find((n) => roll[n].wins > 0);
ok(!!someName && roll[someName].bouts >= roll[someName].wins, "career rollups accumulate (bouts ≥ wins)");
// verify against raw facts
const rawWins = facts.filter((f) => f[5] === someName).length;
const rawBouts = facts.filter((f) => f[3] === someName || f[4] === someName).length;
ok(roll[someName].wins === rawWins && roll[someName].bouts === rawBouts,
  `rollup matches a full fact scan exactly (${someName}: ${rawWins}W/${rawBouts}B) — O(1) instead of O(rows)`);
ok(game.careerOf(someName).wins === rawWins, "careerOf() reads the rollup");
ok(game.careerOf("Nobody Realname") === null, "unknown champions have no career");

console.log("— the governance seam (GUI-26) —");
ok(S.player.controller === "player", "the human's seat is marked");
ok(S.npcs.every((n) => n.controller === "ai" || n.id.startsWith("x")), "every resident seat is ai (swappable to a player id)");

console.log("— erasing a world erases its records —");
const wid = S.worldId;
game.deleteWorld(wid);
ok(!store["guildz.facts." + wid] && !store["guildz.rollup." + wid], "facts + rollups die with the world");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

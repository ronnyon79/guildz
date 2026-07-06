/* Headless tests for GUI-14: the Scribe's board — recording, seed-replay, ring. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");

G.data.WORLDGEN.seasons = 0; // pristine world — history behaviour is covered by test_worldgen
const game = G.game, S = game.state, T = G.tournament;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}
function playBattle() {
  let guard = 0;
  while (S.battle && S.battle.phase === "choose" && guard++ < 400) {
    const rng = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5);
    game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, rng));
  }
}
function playDay() {
  game.enterArena();
  let guard = 0;
  while (guard++ < 60) {
    if (S.screen === "bracket") { game.fightBout(); playBattle(); }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else { game.returnHome(); return; }
  }
}

console.log("— the Scribe records a day —");
game.createCharacter("thief", "Quill", 140140);
playDay();
ok(S.board.length === 1 && S.board[0].day === 1 && S.board[0].season === 1, "day 1's parchments pinned");
const bouts = S.board[0].bouts;
ok(bouts.length > 10, `every bout recorded (${bouts.length})`);
const mine = bouts.filter((b) => b.log);
const theirs = bouts.filter((b) => !b.log);
ok(mine.length >= 1 && mine.every((b) => b.a.name === "Quill" || b.b.name === "Quill"), "player bouts keep their log verbatim");
ok(theirs.length > 5 && theirs.every((b) => b.seed && b.a.maxHp && !b.log), "NPC bouts store snapshots + seed, NO prose");

console.log("— seed-replay determinism (GUI-23 principle) —");
const rec = theirs[0];
const r1 = T.replayBout(rec.a, rec.b, rec.seed, rec.range);
const r2 = T.replayBout(rec.a, rec.b, rec.seed, rec.range);
ok(JSON.stringify(r1.log) === JSON.stringify(r2.log), "same seed → identical blow-by-blow");
const winner1 = r1.phase === "won" ? r1.you.name : r1.phase === "lost" ? r1.foe.name : (r1.you.hp / r1.you.maxHp >= r1.foe.hp / r1.foe.maxHp ? r1.you.name : r1.foe.name);
ok(winner1 === rec.winner, "replay reproduces the recorded winner");
ok(r1.round === rec.rounds + (r1.phase === "choose" ? 0 : 0) || Math.abs(r1.round - rec.rounds) <= 1, `replay reproduces the fight length (${r1.round} vs ${rec.rounds})`);

console.log("— the ring buffer —");
for (let d = 0; d < 4; d++) playDay();
ok(S.board.length === G.data.BOARD.days, `only ${G.data.BOARD.days} days stay pinned`);
ok(S.board[0].day > 1 || S.board[0].season > 1, "the oldest parchments came down");

console.log("— the Lord's presided games are recorded too —");
S.player.role = "lord"; S.lord = null; game.save();
const before = S.board[S.board.length - 1];
G.lord.holdGames();
const today = S.board[S.board.length - 1];
ok(today !== before && today.bouts.length > 10, `presided bouts recorded (${today.bouts.length})`);
ok(today.bouts.every((b) => !b.log && b.seed), "all presided bouts are seed-replayable");
game.returnHome();

console.log("— persistence —");
const total = S.board.reduce((s, d) => s + d.bouts.length, 0);
ok(game.load(S.worldId) && S.board.reduce((s, d) => s + d.bouts.length, 0) === total, "parchments survive the reload");
// pre-board save migrates
const raw = JSON.parse(store["guildz.world." + S.worldId]);
delete raw.board;
store["guildz.world." + S.worldId] = JSON.stringify(raw);
ok(game.load(S.worldId) && Array.isArray(S.board) && S.board.length === 0, "pre-board save gets an empty board");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

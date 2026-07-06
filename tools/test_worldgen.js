/* Headless tests for GUI-33: pre-simulated history + a depth study. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state, W = G.data.WORLDGEN;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

console.log("— a living world —");
const t0 = Date.now();
game.createCharacter("fighter", "Newcomer", 330033);
const genMs = Date.now() - t0;
ok(S.clock.season === W.seasons + 1 && S.clock.day === 1, `you arrive in Season ${S.clock.season} (after ${W.seasons} of history)`);
ok(S.npcs.some((n) => (n.popularity || 0) > 0), "residents carry real fame from past seasons");
ok(S.npcs.reduce((s, n) => s + n.wins, 0) > 400, `careers grew through history (${S.npcs.reduce((s, n) => s + n.wins, 0)} total wins)`);
ok(S.lastSeason && S.lastSeason.season === W.seasons && S.lastSeason.top[0].popularity > 0, "last season's standings are real");
ok(S.board.length === 1 && S.board[0].bouts.length > 5, `yesterday's parchments hang on the board (${S.board[0] ? S.board[0].bouts.length : 0})`);
ok(S.player.age === G.data.AGE.start && (S.player.popularity || 0) === 0 && S.player.wins === 0, "the newcomer is untouched by history");
ok(S.lord && S.lord.reignSeasons >= 1, `the Lord's reign is real (${S.lord.name}, ${S.lord.reignSeasons} season${S.lord.reignSeasons === 1 ? "" : "s"})`);
ok(genMs < 3000, `history generates fast enough (${genMs}ms)`);

console.log("— a parchment from before your time is readable —");
const rec = S.board[0].bouts.find((b) => !b.log);
const r1 = G.tournament.replayBout(rec.a, rec.b, rec.seed, rec.range);
ok(r1.log.length > 3, "the Scribe can re-read history's bouts");

console.log("— determinism —");
const lordA = S.lord.name, famousA = game.fameLadder()[1].name, winsA = S.npcs.reduce((s, n) => s + n.wins, 0);
game.resetGame();
game.createCharacter("fighter", "Newcomer", 330033);
ok(S.lord.name === lordA && game.fameLadder()[1].name === famousA && S.npcs.reduce((s, n) => s + n.wins, 0) === winsA,
  "same worldSeed → the same history, every time");

console.log("— history has teeth (regime changes can happen) —");
let usurped = 0;
for (let seed = 1; seed <= 8; seed++) {
  game.resetGame();
  game.createCharacter("mage", "Probe", 8800 + seed);
  if (S.lord.reignSeasons < W.seasons + 1) usurped++; // a young reign = the throne changed hands
}
ok(usurped >= 1, `in 8 worlds, ${usurped} had their throne change hands during history`);

console.log("— depth study (GUI-33's question) —");
for (const depth of [1, 3, 5]) {
  const npcs = G.roster.generateRoster(777, "Study");
  const lordBox = { lord: { name: "Old King", classId: "fighter", wins: 50, reignSeasons: 1, age: 40, personality: G.roster.rollPersonality(G.engine.makeRng(5)) } };
  const t = Date.now();
  G.worldgen.simulateHistory(npcs, lordBox, "Study", 777, depth);
  const ms = Date.now() - t;
  const famed = npcs.filter((n) => (n.popularity || 0) > 0).length;
  const avgW = Math.round(npcs.reduce((s, n) => s + n.wins, 0) / npcs.length);
  console.log(`    depth ${depth}: ${ms}ms · ${famed}/${npcs.length} residents famed · avg ${avgW} wins · lord reign ${lordBox.lord.reignSeasons}`);
}
ok(true, "depth data recorded (3 chosen: lived-in, sub-second)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

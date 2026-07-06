/* Headless tests for GUI-8: the Crowd Rating + fame integration. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game"])
  require("../js/" + f + ".js");

const S = G.game.state, game = G.game, spec = G.spectacle, { POPULARITY } = G.data;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

// Synthetic battle states for exact rating control.
function fakeBattle(log, round, youHp, opts) {
  return Object.assign({
    phase: "won", round,
    you: { name: "You", hp: youHp, maxHp: 40 },
    foe: { name: "Foe", hp: 0, maxHp: 40 },
    log,
  }, opts || {});
}

console.log("— rating unit tests —");
const slog = fakeBattle(Array.from({ length: 30 }, () => ({ t: "miss", who: "You", target: "Foe" })), 30, 38);
ok(spec.rate(slog).stars === 1, "a 30-round all-miss slog bores the crowd (1★)");

const critfest = fakeBattle([
  { t: "hit", who: "You", target: "Foe", dmg: 14, crit: true },
  { t: "hit", who: "You", target: "Foe", dmg: 16, crit: true },
  { t: "evade", who: "You", by: "Foe" },
], 3, 38);
const cf = spec.rate(critfest);
ok(cf.stars === 5 && cf.rout, "a 3-round crit-fest finishing at full HP = 5★ rout");

const nail = fakeBattle([{ t: "hit", who: "You", target: "Foe", dmg: 8 }], 12, 8);
ok(spec.rate(nail).nailBiter, "winner ending ≤25% HP = nail-biter");

const comeback = fakeBattle([
  { t: "hit", who: "Foe", target: "You", dmg: 20 },
  { t: "hit", who: "Foe", target: "You", dmg: 15 },
  { t: "heal", who: "You", amt: 24 },
  { t: "hit", who: "You", target: "Foe", dmg: 12 },
], 10, 20);
const cb = spec.rate(comeback);
ok(cb.comeback && !cb.nailBiter, "healing through 80%+ of your HP = comeback (supersedes nail-biter)");

const soaked = fakeBattle([{ t: "hit", who: "You", target: "Foe", dmg: 12, absorbed: 6, mitigated: 3 }], 6, 40);
ok(spec.rate(soaked).score < spec.rate(fakeBattle([{ t: "hit", who: "You", target: "Foe", dmg: 12 }], 6, 40)).score,
  "huge-blow check uses damage AFTER shield/armor soaks");

ok(spec.rate(fakeBattle([], 5, 10, { phase: "choose", foe: { name: "Foe", hp: 20, maxHp: 40 } }), "foe").stars >= 1,
  "explicit winnerSide handles round-cap fights");

console.log("— fameFor —");
const perBout = POPULARITY.perBout(2), mult = POPULARITY.specMult; // band 2 → 7/bout
const matches = [
  { winner: "w", spec: 5 }, { winner: "w", spec: 1 },
  { winner: "x", spec: 5 },              // someone else's bout — ignored
  { winner: "w", spec: 0, forfeit: true }, // walkover — pays nothing
  { winner: "w" },                        // unrated — counts as 3★ (×1)
];
ok(spec.fameFor(matches, "w", perBout, mult) === Math.round(7 * (5 / 3) + 7 * (1 / 3) + 0 + 7),
  "fameFor = Σ perBout × specMult over the winner's bouts (walkover 0, unrated = 3★)");
ok(spec.fameFor(matches, "nobody", perBout, mult) === 0, "non-winner earns nothing");

console.log("— integration: a real day —");
function playBattle() {
  let guard = 0;
  while (S.battle && S.battle.phase === "choose" && guard++ < 200) {
    const rng = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5);
    game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, rng));
  }
}
game.createCharacter("thief", "Fizz", 31007);
game.enterArena();
let specs = [], playerBr = S.playerBracket;
{
  let guard = 0, done = false;
  while (guard++ < 60 && !done) {
    if (S.screen === "bracket") { game.fightBout(); playBattle(); ok(S.lastSpec && S.lastSpec.stars >= 1 && S.lastSpec.stars <= 5, "player bout rated " + S.lastSpec.stars + "★"); }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else done = true;
  }
}
specs = playerBr.matches.filter((m) => m.winner && !m.forfeit).map((m) => m.spec);
ok(specs.length > 0 && specs.every((x) => x >= 1 && x <= 5), `every resolved bout carries a rating (${specs.join(",")})`);
// Verify each board award matches fameFor exactly (recompute from the day's brackets is
// impossible post-cleanup, so check the player band via the snapshot we kept).
const w = playerBr.winner;
const expected = spec.fameFor(playerBr.matches, w, POPULARITY.perBout(playerBr.band), POPULARITY.specMult);
const boardRow = S.lastDay.board.find((x) => x.band === playerBr.band);
ok(boardRow.popGain === expected, `board award matches fameFor exactly (${expected})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

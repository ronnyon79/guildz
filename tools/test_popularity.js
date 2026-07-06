/* Headless tests for GUI-7: popularity awards, fame ladder, season roll. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game"])
  require("../js/" + f + ".js");

G.data.WORLDGEN.seasons = 0; // pristine world — history behaviour is covered by test_worldgen
const game = G.game, S = game.state, { POPULARITY, SEASON } = G.data;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

function playBattle() {
  let guard = 0;
  while (S.battle && S.battle.phase === "choose" && guard++ < 200) {
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
    else if (S.screen === "day-champion") { game.returnHome(); return "champion"; }
    else if (S.screen === "loss") { game.returnHome(); return "loss"; }
    else break;
  }
  throw new Error("day did not end (screen=" + S.screen + ")");
}
const popOf = (id) => (id === "player" ? S.player.popularity || 0 : (S.npcs.find((n) => n.id === id) || {}).popularity || 0);
const snapshot = () => { const m = { player: S.player.popularity || 0 }; for (const n of S.npcs) m[n.id] = n.popularity || 0; return m; };

console.log("— award math —");
game.createCharacter("fighter", "Rok", 99001); S.throneRestUntil = 9999; // GUI-72 quiet
ok(S.player.popularity === 0 && S.clock.day === 1 && S.clock.season === 1, "fresh world: 0 fame, day 1 season 1");
const pre = snapshot();
playDay();
ok(S.clock.day === 2 && S.clock.season === 1, "sunset advances the clock");
ok(S.lastDay.board.length >= 1, "board built");
ok(S.lastDay.board.every((w) =>
    w.popGain >= 0 &&
    w.popGain <= Math.round(w.boutsWon * POPULARITY.perBout(w.band) * POPULARITY.specMult(5)) &&
    (w.boutsWon === 0 ? w.popGain === 0 : true)),
  "every award within Σ perBout × specMult bounds (exact math unit-tested in test_spectacle)");
// verify actual increments match the board
const winnersById = {};
for (const w of S.lastDay.board) {
  const row = game.fameLadder().find((r) => r.name === w.name);
  winnersById[row.id] = w.popGain;
}
ok(Object.keys(winnersById).every((id) => popOf(id) === (pre[id] || 0) + winnersById[id]),
  "fame applied to each band champion");
ok(game.fameLadder()[0].popularity >= game.fameLadder()[9].popularity, "ladder sorted descending");

console.log("— higher bands pay more —");
ok(POPULARITY.perBout(0) === 5 && POPULARITY.perBout(5) === 10 && POPULARITY.perBout(10) === 15,
  "perBout: band0→5, 25wins→10, 50wins→15");

console.log("— season roll (−50% decay) —");
while (S.clock.season === 1 && S.clock.day < SEASON.days) playDay(); // to the last day
ok(S.clock.day === SEASON.days, "on the season's final day");
const preRoll = snapshot();
playDay(); // final day of the season
ok(S.clock.season === 2 && S.clock.day === 1, "season rolled to S2 D1");
ok(S.lastSeason && S.lastSeason.season === 1 && S.lastSeason.top.length > 0, "final standings recorded");
ok(S.lastDay.seasonEnd && S.lastDay.seasonEnd.season === 1, "sunset surfaced the season end");
// expected post-roll fame: round((pre + day's gain)/2)
const gains = {};
for (const w of S.lastDay.board) {
  const row = game.fameLadder().find((r) => r.name === w.name);
  if (row) gains[row.id] = w.popGain; // a departed idle veteran (GUI-60) takes their fame with them
}
const allIds = ["player", ...S.npcs.map((n) => n.id)];
ok(allIds.every((id) => popOf(id) === Math.round(((preRoll[id] || 0) + (gains[id] || 0)) / 2)),
  "everyone's fame = round((old + today's gain) / 2)");
const preTop = Math.max(...allIds.map((id) => (preRoll[id] || 0) + (gains[id] || 0)));
ok(S.lastSeason.top[0].popularity === preTop, "season top recorded pre-decay");

console.log("— persistence —");
const savedPop = S.player.popularity, savedClock = { ...S.clock };
const wkey = "guildz.world." + S.worldId, wid = S.worldId;
const raw = JSON.parse(store[wkey]);
ok(raw.clock && raw.npcs.every((n) => n.popularity != null), "clock + fame persisted");
S.player.popularity = -1; S.clock = { day: 0, season: 0 };
ok(game.load(wid) && S.player.popularity === savedPop && S.clock.day === savedClock.day && S.clock.season === savedClock.season,
  "load restores fame + clock");

console.log("— old-save migration —");
const stripped = JSON.parse(store[wkey]);
delete stripped.clock; delete stripped.lastSeason; delete stripped.player.popularity;
stripped.npcs.forEach((n) => delete n.popularity);
store[wkey] = JSON.stringify(stripped);
ok(game.load(wid) && S.player.popularity === 0 && S.clock.day === 1 && S.clock.season === 1 && S.npcs.every((n) => n.popularity === 0),
  "pre-fame save migrates to zeroed fame + fresh clock");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

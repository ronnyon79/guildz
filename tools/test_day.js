/* Headless tests for the GUI-6 day loop (roster + game store). Run: node tools/test_day.js */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "data", "combat", "spectacle", "ai", "tournament", "roster", "game"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state, T = G.tournament;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

// Drive the player's battle with the shipped AI until it ends.
function playBattle() {
  let guard = 0;
  while (S.battle && S.battle.phase === "choose" && guard++ < 200) {
    const rng = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5);
    game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, rng));
  }
}
// Play a full day from home; returns "champion" | "loss".
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

console.log("— roster —");
game.createCharacter("thief", "Sly", 424242);
ok(S.npcs.length === G.data.ROSTER.size, `roster generated (${S.npcs.length})`);
ok(new Set(S.npcs.map((n) => n.name)).size === S.npcs.length, "NPC names are unique");
ok(!S.npcs.some((n) => n.name.toLowerCase() === "sly"), "no NPC collides with the player's name");
ok(S.npcs.filter((n) => T.bandOf(n.wins) === 0).length >= 5, "band 0 is populated for a fresh player");
ok(S.npcs.every((n) => G.data.CLASSES[n.classId]), "all NPC classes valid");
const npc = S.npcs.find((n) => n.wins >= 15);
const ch = G.roster.combatChar(npc);
ok(ch.maxHp > 25 && ch.armor, "veteran NPC combat char has grown pools + armor");

console.log("— world-gen determinism —");
const namesA = S.npcs.map((n) => n.name).join("|");
game.resetGame();
game.createCharacter("thief", "Sly", 424242);
ok(S.npcs.map((n) => n.name).join("|") === namesA, "same worldSeed → identical roster");

console.log("— one full day —");
const winsBefore = S.npcs.reduce((s, n) => s + n.wins, 0) + S.player.wins;
game.enterArena();
ok(S.screen === "bracket" || S.screen === "day-champion", "sunrise lands on the bracket (screen=" + S.screen + ")");
ok(S.day && S.playerBracket && S.playerBracket.entrants.includes("player"), "player is bucketed into their band");
ok(S.playerBracket.band === T.bandOf(S.player.wins), "player's band matches their wins");
const othersDone = S.day.brackets.filter((b) => b !== S.playerBracket).every((b) => !!b.winner);
ok(othersDone, "all other bands resolved at dawn");
if (S.screen === "bracket") {
  ok(S.pendingBout && (S.pendingBout.a === "player" || S.pendingBout.b === "player"), "a player bout is pending");
  game.fightBout();
  ok(S.screen === "battle" && S.battle && S.battle.foe.name !== S.player.name, "fightBout starts a battle vs a resident");
  playBattle();
  ok(S.screen === "win" || S.screen === "loss", "bout resolves to win/loss (" + S.screen + ")");
}
// finish the day whatever happened
let res1 = null;
{
  let guard = 0;
  while (guard++ < 60 && !res1) {
    if (S.screen === "bracket") { game.fightBout(); playBattle(); }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else if (S.screen === "day-champion") res1 = "champion";
    else if (S.screen === "loss") res1 = "loss";
  }
}
ok(res1 === "champion" || res1 === "loss", "day ends in champion/loss (" + res1 + ")");
ok(S.lastDay && S.lastDay.board.length >= 1, "sunset board built");
ok(S.lastDay.board.every((w) => w.name && w.name !== "?"), "every band has a named champion");
ok(S.day === null && S.dayById === null && S.pendingBout === null, "day state cleaned up");
const winsAfter = S.npcs.reduce((s, n) => s + n.wins, 0) + S.player.wins;
ok(winsAfter > winsBefore, `career wins applied (${winsBefore} → ${winsAfter})`);
game.returnHome();

console.log("— save / load round-trip —");
const savedWins = S.npcs.map((n) => n.wins).join(",");
const wid = S.worldId;
const raw = JSON.parse(store["guildz.world." + wid]);
ok(Array.isArray(raw.npcs) && raw.npcs.length === S.npcs.length, "npcs persisted in the save");
S.npcs = []; // simulate fresh boot
ok(game.load(wid) && S.npcs.map((n) => n.wins).join(",") === savedWins, "load restores the roster (with earned wins)");

console.log("— old-save (legacy single-slot) migration —");
{
  const keep = { ...store };
  for (const k of Object.keys(store)) delete store[k];
  store["guildz.save.v2"] = JSON.stringify({ player: raw.player, seedCounter: 9 }); // pre-roster, pre-worlds save
  ok(game.load() && S.npcs.length === G.data.ROSTER.size, "pre-roster legacy save migrates to a world + gains a roster");
  ok(store["guildz.save.v2"] == null && game.listWorlds().length === 1, "legacy key consumed into the worlds index");
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, keep);
  game.load(wid);
}

console.log("— many days (stability) —");
let champs = 0, losses = 0;
for (let d = 0; d < 8; d++) {
  const r = playDay();
  if (r === "champion") champs++; else losses++;
}
ok(champs + losses === 8, `8 more days complete without a crash (${champs} crowns, ${losses} defeats)`);
ok(S.player.wins === S.player.battlesWon, "player career wins == bouts won");
ok(S.npcs.every((n) => n.wins >= 0), "roster intact after many days");

console.log("— forfeit —");
game.enterArena();
if (S.screen === "bracket") {
  const totalBefore = S.npcs.reduce((s, n) => s + n.wins, 0);
  const oppId = S.pendingBout.a === "player" ? S.pendingBout.b : S.pendingBout.a;
  const opp = S.npcs.find((n) => n.id === oppId);
  const oppWins = opp.wins;
  game.retreat();
  ok(S.screen === "home" && S.day === null, "withdrawing forfeits and returns home");
  ok(opp.wins === oppWins, "walkover grants the opponent NO career win");
  ok(S.lastDay && !S.lastDay.champion, "forfeited day never crowns the player");
  ok(S.npcs.reduce((s, n) => s + n.wins, 0) >= totalBefore, "other bouts still resolved");
} else { game.returnHome(); ok(true, "(walkover day — forfeit path skipped)"); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

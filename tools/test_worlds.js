/* Headless tests for GUI-11: multi-world saves, legacy migration, role-aware
 * boot, and the lord.js presided-day loop. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state;
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

console.log("— legacy migration —");
// A fresh browser holding only the old single-slot save.
game.createCharacter("fighter", "Relic", 11111); // build a valid blob shape…
const legacyBlob = store["guildz.world." + S.worldId];
for (const k of Object.keys(store)) delete store[k];
store["guildz.save.v2"] = legacyBlob; // …and plant it as the legacy key
game.boot();
ok(store["guildz.save.v2"] == null, "legacy key consumed on boot");
const worlds0 = game.listWorlds();
ok(worlds0.length === 1 && worlds0[0].name === "Relic", "legacy save became world slot 1");
ok(game.load(worlds0[0].id) && S.player.name === "Relic", "migrated world loads");

console.log("— multiple universes —");
game.createCharacter("mage", "Wanda", 22222);
const widB = S.worldId;
const worlds = game.listWorlds();
ok(worlds.length === 2, "two independent worlds in the index");
ok(new Set(worlds.map((w) => w.id)).size === 2, "unique world ids");
const widA = worlds.find((w) => w.name === "Relic").id;
game.load(widA);
ok(S.player.name === "Relic" && S.player.classId === "fighter", "switching loads world A's champion");
const lordA = S.lord.name;
game.load(widB);
ok(S.player.name === "Wanda" && S.lord.name !== undefined, "world B is its own universe");
ok(S.lord.name !== lordA || S.player.worldSeed !== 11111, "worlds have independent Lords");
playDay();
game.load(widA);
ok(S.clock.day === 1, "world B's days never touch world A's clock");

console.log("— world meta + deletion —");
const meta = game.listWorlds().find((w) => w.id === widB);
ok(meta.day >= 1 && meta.role === "champion", "index meta tracks clock + role");
game.deleteWorld(widB);
ok(game.listWorlds().length === 1 && store["guildz.world." + widB] == null, "deleting a world erases it fully");

console.log("— role-aware boot —");
game.load(widA);
S.player.role = "lord"; S.lord = null; game.save();
game.load(widA);
ok(S.player.role === "lord", "a crowned world resumes as the Lord");
ok(game.listWorlds()[0].role === "lord", "the index shows the crown");

console.log("— the Lord presides (lord.js) —");
const day0 = S.clock.day, npcWins0 = S.npcs.reduce((s, n) => s + n.wins, 0);
const fame0 = S.npcs.reduce((s, n) => s + (n.popularity || 0), 0);
G.lord.holdGames();
ok(S.screen === "lord-sunset", "holding the games → the Lord's sunset");
ok(S.lastDay && S.lastDay.board.length >= 1 && S.lastDay.board.every((w) => !w.isPlayer), "every band crowned a resident (the Lord doesn't fight)");
ok(S.clock.day === day0 + 1 || S.clock.day === 1, "the clock ticks under your reign");
ok(S.npcs.reduce((s, n) => s + n.wins, 0) > npcWins0, "residents earn career wins in your games");
ok(S.npcs.reduce((s, n) => s + (n.popularity || 0), 0) > fame0, "residents earn fame in your games");
ok(S.challengeOpen === false, "no challenge banner for the reigning Lord");
game.returnHome();
ok(S.screen === "home", "back to the high seat");
// a full season under the crown
let guard = 0;
const season0 = S.clock.season;
while (S.clock.season === season0 && guard++ < 15) { G.lord.holdGames(); game.returnHome(); }
ok(S.clock.season === season0 + 1, "a whole season passes under your reign");
ok(S.lastSeason && !S.lastSeason.top[0].isPlayer, "a resident tops the season's fame ladder");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

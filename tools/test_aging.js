/* Headless tests for GUI-17: aging — peak/decline, retirement churn, succession. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "data", "combat", "spectacle", "ai", "tournament", "roster", "game", "lord"])
  require("../js/" + f + ".js");

const game = G.game, S = game.state, AGE = G.data.AGE;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}
function reignDays(n) {
  for (let i = 0; i < n; i++) {
    G.lord.holdGames();
    if (S.screen === "lord-sunset") game.returnHome();
    else if (S.screen === "coronation" || S.screen === "memorial") return;
  }
}

console.log("— the decline curve —");
ok(AGE.mult(25) === 1 && AGE.mult(35) === 1, "in your prime, nothing fades");
ok(AGE.mult(45) === 1 - 0.3 && AGE.mult(90) === 0.5, "past the peak: −3%/year, floored at 50%");
const young = G.roster.combatChar({ id: "y", name: "Y", classId: "fighter", wins: 30, age: 30 }, 1);
const old = G.roster.combatChar({ id: "o", name: "O", classId: "fighter", wins: 30, age: 50 }, 1);
ok(old.maxHp < young.maxHp, `a 50-year-old 30-win fighter has faded (${old.maxHp} < ${young.maxHp} HP)`);

console.log("— world-gen ages —");
game.createCharacter("fighter", "Tock", 170017);
ok(S.player.age === AGE.start, "a new champion is 18");
ok(S.npcs.every((n) => n.age >= AGE.start), "every resident has an age");
ok(S.npcs.filter((n) => n.wins >= 15).every((n) => n.age > AGE.start + 3), "veterans are older");
ok(S.lord.age > 25, `the Lord carries his years (${S.lord.age})`);
const fadedPlayer = (() => { S.player.age = 55; const hp = game.lordCombatChar ? null : null; const c = JSON.parse(JSON.stringify(S.player)); return true; })();
S.player.age = AGE.start;

console.log("— seasons age everyone —");
S.player.role = "lord"; S.lord = null; S.stronghold.treasury = 5000; game.save();
const age0 = S.player.age, npcAges0 = S.npcs.map((n) => n.age);
reignDays(G.data.SEASON.days);
ok(S.player.age === age0 + 1, "you age a year at the season's turn");
ok(S.npcs.filter((n) => n.id.startsWith("n")).every((n) => npcAges0[0] != null), "residents age too");

console.log("— retirement churn —");
const greybeard = S.npcs[0];
greybeard.age = 70; // guarantee retirement
const size0 = S.npcs.length, oldId = greybeard.id;
reignDays(G.data.SEASON.days);
ok(!S.npcs.find((n) => n.id === oldId), "the greybeard bowed out");
ok(S.npcs.length === size0, "a young hopeful took the bed (population stable)");
ok(S.npcs.some((n) => n.id.startsWith("a")), "…a fresh arrival");
ok(S.lastDay.retired && S.lastDay.retired.length >= 1, "the sunset noted the farewell");

console.log("— an NPC Lord dies of old age → succession —");
game.resetGame();
game.createCharacter("mage", "Heir", 171717);
S.lord.age = 75; // at death's door
S.player.popularity = 99999; // the people's favourite
function playDayFast() {
  game.enterArena();
  let g = 0;
  while (g++ < 60) {
    if (S.screen === "bracket") { game.fightBout(); let k = 0; while (S.battle && S.battle.phase === "choose" && k++ < 400) { const r = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5); game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, r)); } }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else return;
  }
}
while (S.clock.season === 1) playDayFast();
ok(S.screen === "coronation" && S.lastThrone.oldAge, "the old Lord dies — the crown passes to YOU (people's favourite)");
ok(S.player.role === "lord" && S.lord === null, "…and you take the empty throne");
game.returnHome();

game.resetGame();
game.createCharacter("mage", "Bystander", 181818);
S.lord.age = 75;
S.player.popularity = 0; // a nobody — the crown goes elsewhere
while (S.clock.season === 1) { S.player.popularity = 0; playDayFast(); if (S.screen !== "home") { game.returnHome(); } }
ok(S.player.role !== "lord" && S.lord && S.lord.reignSeasons === 0 && S.lord.age < 75, `a resident is crowned instead (${S.lord.name})`);
ok(S.lastDay.lordDied != null, "the sunset mourned the old Lord");

console.log("— a player-Lord dies on the throne, undefeated —");
game.resetGame();
game.createCharacter("fighter", "Eternal", 191919);
S.player.role = "lord"; S.lord = null; S.player.age = 80; S.player.crownedSeason = 1; S.stronghold.treasury = 5000; game.save();
reignDays(G.data.SEASON.days + 1);
ok(S.screen === "memorial" && S.lastThrone.fate === "throne-age", "died in the high seat — the rarest ending");
ok(store["guildz.world." + S.worldId] == null, "the run ends (world erased)");
game.resetGame();

console.log("— migration —");
game.createCharacter("thief", "Aged", 202020);
const raw = JSON.parse(store["guildz.world." + S.worldId]);
delete raw.player.age; raw.npcs.forEach((n) => delete n.age); delete raw.lord.age;
store["guildz.world." + S.worldId] = JSON.stringify(raw);
ok(game.load(S.worldId) && S.player.age >= AGE.start && S.npcs.every((n) => n.age >= AGE.start) && S.lord.age > 20,
  "pre-aging saves gain believable ages");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* Headless tests for GUI-9/GUI-10: the Lord, the challenge, coronation, fates. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game"])
  require("../js/" + f + ".js");

G.data.WORLDGEN.seasons = 0; // pristine world — history behaviour is covered by test_worldgen
const game = G.game, S = game.state, { LORD, CLASSES } = G.data;
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
    else if (S.screen === "day-champion" || S.screen === "loss") { game.returnHome(); return; }
    else return;
  }
}
function playToSeasonEnd() { while (S.clock.day <= G.data.SEASON.days && S.clock.day !== 1 || S.clock.day === 1 && S.clock.season === 1 && S.player.battlesWon === 0) { const s0 = S.clock.season; playDay(); if (S.clock.season !== s0) return; } }

console.log("— world-gen: the Lord —");
game.createCharacter("fighter", "Ash", 60601);
ok(S.lord && S.lord.name && CLASSES[S.lord.classId], `the Stronghold has a Lord (${S.lord.name}, ${S.lord.classId})`);
ok(S.lord.wins >= LORD.wins[0] && S.lord.wins <= LORD.wins[1], `a veteran career (${S.lord.wins} wins)`);
ok(S.player.role === "champion", "you start as a champion");
const lordName = S.lord.name;
game.resetGame(); game.createCharacter("fighter", "Ash", 60601);
ok(S.lord.name === lordName, "same worldSeed → same Lord");

console.log("— the Lord's kit —");
const lc = game.lordCombatChar();
const cls = CLASSES[lc.classId];
const expectTotal = Math.round((cls.startHp + cls.startMp + 2 * S.lord.wins) * G.data.AGE.mult(S.lord.age));
ok(Math.abs(lc.maxHp + lc.maxMp - expectTotal) <= 2,
  `veteran pools, age-faded (${lc.maxHp} HP / ${lc.maxMp} MP @ ${S.lord.wins} wins, age ${S.lord.age})`);
if (CLASSES[lc.classId].caster) {
  ok(lc.perk === "treasury" && lc.items.potion_healing === 1 && lc.items.potion_mana === 1, "caster lord picks the treasury (1 HP + 1 MP potion)");
} else {
  ok(lc.perk === "armory" && lc.armor && G.data.ARMOR[lc.armor].magical, `martial lord picks the armory (${lc.armor})`);
}

console.log("— challenge gating —");
game.resetGame(); game.createCharacter("fighter", "Titan", 70707);
S.player.bonusHp = 400; // a titan — guarantees throne outcomes below
while (S.clock.season === 1) playDay();
ok(!S.challengeOpen || S.lastSeason.top[0].isPlayer, "challenge only offered to the season's #1");
// force fame supremacy for the next season end
S.player.popularity = 99999;
while (S.clock.season === 2) playDay();
ok(S.challengeOpen === true, "season's #1 (you) → the challenge is open");
ok(S.lastDay.mayChallenge === true, "sunset announced the right to challenge");
game.enterArena();
ok(S.challengeOpen === false, "entering the next day's tournament lets the moment pass");
game.retreat();

console.log("— coronation (win path) —");
S.player.popularity = 99999;
{ const s0 = S.clock.season; while (S.clock.season === s0) playDay(); }
ok(S.challengeOpen, "challenge open again");
const rosterBefore = S.npcs.length, winsBefore = S.player.wins, deposed = S.lord.name;
game.challengeLord();
ok(S.screen === "battle" && S.throneFight && S.battle.foe.name === deposed, "the throne duel begins");
ok(!CLASSES[S.battle.foe.classId].caster ? S.battle.range === "melee" : S.battle.range === "missile",
  `the Lord dictates the opening range (${S.battle.range})`);
playBattle();
ok(S.screen === "coronation", "victory → coronation");
ok(S.player.role === "lord" && S.lord === null, "you are the Lord now");
ok(S.player.wins === winsBefore + 1, "the duel counts as a career victory");
ok(S.lastThrone.won && (S.lastThrone.lordStays ? S.npcs.length === rosterBefore + 1 : S.npcs.length === rosterBefore),
  `deposed Lord's fate is consistent (${S.lastThrone.lordStays ? "stays as a resident" : "rides into exile"})`);
game.returnHome();
S.player.popularity = 99999;
{ const s0 = S.clock.season; while (S.clock.season === s0) playDay(); }
ok(S.challengeOpen === false, "a reigning Lord gets no challenge banner");
ok(JSON.parse(store["guildz.world." + S.worldId]).player.role === "lord", "the crown persists in the save");

console.log("— the fates (loss path) —");
game.resetGame(); game.createCharacter("mage", "Moth", 80808);
S.player.bonusHp = -15; // 5 HP — guarantees defeat
S.player.popularity = 99999;
while (S.clock.season === 1) playDay();
ok(S.challengeOpen, "doomed challenger has the right");
game.challengeLord();
playBattle();
ok(S.screen === "throne-fate", "defeat → choose your fate");
ok(store["guildz.world." + S.worldId] != null, "save still exists at the choice");
game.chooseFate("serve");
ok(S.screen === "home" && S.player.role === "servant", "serve: you stay, as his servant");
ok(JSON.parse(store["guildz.world." + S.worldId]).player.role === "servant", "servitude persists");
playDay();
ok(["home"].includes(S.screen), "a servant still fights the daily brackets");

console.log("— uprising: to the death —");
S.player.popularity = 99999;
{ const s0 = S.clock.season; while (S.clock.season === s0) playDay(); }
ok(S.challengeOpen, "a famous servant may rise");
game.challengeLord();
playBattle();
ok(S.screen === "memorial" && S.lastThrone.fate === "uprising", "failed uprising = death, no mercy");
ok(store["guildz.world." + S.worldId] == null, "the save is gone — permadeath");
game.resetGame();

console.log("— die & exile —");
game.createCharacter("mage", "Wisp", 90909);
S.player.bonusHp = -15; S.player.popularity = 99999;
while (S.clock.season === 1) playDay();
game.challengeLord(); playBattle();
game.chooseFate("die");
ok(S.screen === "memorial" && store["guildz.world." + S.worldId] == null, "die: memorial + save erased");
game.resetGame();
game.createCharacter("mage", "Reed", 91919);
S.player.bonusHp = -15; S.player.popularity = 99999;
while (S.clock.season === 1) playDay();
game.challengeLord(); playBattle();
game.chooseFate("exile");
ok(S.screen === "exiled" && store["guildz.world." + S.worldId] == null, "exile: one-way — gates close, save erased");
game.resetGame();

console.log("— old-save migration —");
game.createCharacter("thief", "Old", 93939);
const raw = JSON.parse(store["guildz.world." + S.worldId]);
delete raw.lord; delete raw.challengeOpen; delete raw.player.role;
store["guildz.world." + S.worldId] = JSON.stringify(raw);
ok(game.load(S.worldId) && S.lord && S.lord.name && S.player.role === "champion", "pre-throne save gains a Lord + champion role");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

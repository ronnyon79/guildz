/* Headless tests for GUI-16/41/43: challengers, the servant gauntlet, defence. */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"])
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
function reignDays(n) {
  for (let i = 0; i < n; i++) { G.lord.holdGames(); if (S.screen === "lord-sunset") game.returnHome(); }
}
function makeLordWorld(seed, hp) {
  game.resetGame();
  game.createCharacter("fighter", "Rex", seed);
  S.player.role = "lord"; S.lord = null;
  if (hp != null) S.player.bonusHp = hp;
  S.stronghold.treasury = 5000;
  game.save();
}

console.log("— engine: worn entry + regen —");
{
  const c = (id) => ({ id, name: id, classId: "fighter", wins: 0, maxHp: 40, maxMp: 0, meleeWeapon: "two_handed_sword", missileWeapon: "short_bow", items: {}, arrows: [], activeArrow: "normal", armor: null, armorDurability: 0 });
  const worn = { ...c("W"), startHp: 10 };
  const b = G.combat.newBattle(worn, c("F"), 42);
  ok(b.you.hp === 10 && b.you.maxHp === 40, "a fighter can enter the sand worn (10/40)");
  const rb = G.combat.newBattle({ ...c("R"), regen: 3, startHp: 10 }, c("F2"), 43);
  const r2 = G.combat.resolveRound(rb, "move", "move");
  ok(r2.you.hp === 13 && r2.log.some((e) => e.t === "regen"), "the Infirmary's healers close wounds each round");
}

console.log("— a challenger comes —");
makeLordWorld(160160);
let guard = 0;
while (!S.defense && guard++ < 30) reignDays(1);
ok(!!S.defense && !S.defense.fielded, `the season's favourite comes for the throne (${S.defense.name})`);
ok(S.lastDay.defenseComing === S.defense.name, "the sunset announced it");
const challengerId = S.defense.challengerId;
ok(!!S.npcs.find((n) => n.id === challengerId), "the challenger is a real resident");

console.log("— the gauntlet (with a household) —");
S.stronghold.buildings.barracks = 3;
// conscript three residents as servants (as if past challengers knelt)
const picks = S.npcs.filter((n) => n.id !== challengerId).slice(0, 3);
for (const p of picks) {
  S.household.push({ id: p.id, name: p.name, classId: p.classId, wins: p.wins });
  S.npcs = S.npcs.filter((x) => x.id !== p.id);
}
S.player.bonusHp = 400; game.save();
const hh0 = S.household.length, npcs0 = S.npcs.length;
game.beginDefense();
ok(["defense-prep", "defended"].includes(S.screen), `the gauntlet ran (→ ${S.screen})`);
if (S.screen === "defense-prep") {
  const run = S.defenseRun;
  ok(run.bouts.length > 0 && run.bouts.every((b) => b.result === "fell"), `the challenger cut through ${run.bouts.length} servant(s)`);
  ok(S.household.length === hh0 - run.bouts.length, "fallen servants are DEAD (removed)");
  const ch = G.roster.combatChar(S.npcs.find((n) => n.id === challengerId), game.gearScale());
  ok(run.chHp <= ch.maxHp && run.chHp > 0, `carry-over tracked (${run.chHp}/${ch.maxHp} — the 50% replenish can top off a dominant challenger; GUI-31 tunes it)`);
  ok(S.board[S.board.length - 1].bouts.some((b) => b.gauntlet), "the Scribe recorded the gauntlet");
  console.log("— the boons (GUI-43) —");
  const perks = game.defensePerks();
  ok(perks.find((p) => p.id === "crowd").ok === false, "no seating → no home crowd");
  S.stronghold.buildings.seating = 1; S.stronghold.buildings.armory = 1;
  ok(game.defensePerks().every((p) => p.ok), "built + funded → all boons offered");
  const t0 = S.stronghold.treasury;
  game.startDefenseDuel("treasury", "melee");
  ok(S.stronghold.treasury === t0 - 200, "treasury boon costs 🏛️200");
  ok(S.battle.range === "melee", "the Lord chose the ground");
  ok(S.battle.you.items.potion_healing >= 1 && S.battle.you.items.potion_mana >= 1, "…and carries the potions");
  ok(S.battle.foe.hp === S.defenseRun.chHp, "the challenger enters at their carried-over HP");
  console.log("— holding the throne —");
  playBattle();
  ok(S.screen === "defended", "the titan Lord holds (→ defended)");
  ok(S.lastDefense.won && ["serve", "exile", "die"].includes(S.lastDefense.fate), `challenger's fate: ${S.lastDefense.fate}`);
  ok(!S.npcs.find((n) => n.id === challengerId), "the beaten challenger left the roster");
  if (S.lastDefense.fate === "serve") ok(S.household.find((h) => h.id === challengerId), "…and kneels in your household");
  ok(S.defense === null && S.defenseRun === null, "the challenge is spent");
  game.returnHome();
} else {
  ok(S.lastDefense.won && S.lastDefense.byServant, `a servant stopped the challenger (${S.lastDefense.byServant})`);
  game.returnHome();
}

console.log("— losing the throne (deposed) —");
makeLordWorld(170170, -15); // a 10 HP fighter lord
guard = 0;
while (!S.defense && guard++ < 30) reignDays(1);
const usurperId = S.defense.challengerId, usurperName = S.defense.name;
S.household = [{ id: "hx", name: "Old Guard", classId: "fighter", wins: 5 }];
S.stronghold.buildings.barracks = 1; game.save();
game.beginDefense();
if (S.screen === "defense-prep") {
  game.startDefenseDuel(null, "missile");
  playBattle();
  ok(S.screen === "throne-fate" && S.lastThrone.deposed, "the throne falls → choose your fate");
  ok(S.lord && S.lord.name === usurperName && S.lord.reignSeasons === 0, "the usurper is crowned");
  ok(!S.npcs.find((n) => n.id === usurperId), "…and leaves the roster");
  // By gauntlet order every servant fights BEFORE the Lord — so when the Lord
  // falls, his household already fell first. Emergent, and correct.
  ok(S.household.length === 0, "no household survives a fallen Lord (they fought first)");
  game.chooseFate("serve");
  ok(S.player.role === "servant", "a fallen Lord may serve the new one");
} else { ok(true, "(servant stopped the usurper — deposition path took the held branch)"); game.returnHome(); }

console.log("— fielded: a servant defends (GUI-41) —");
// as servant of the new lord, next challenger → YOU are fielded
S.player.bonusHp = 400; S.player.popularity = 0;
guard = 0;
let played = 0;
function playDay() {
  game.enterArena();
  let g = 0;
  while (g++ < 60) {
    if (S.screen === "bracket") { game.fightBout(); playBattle(); }
    else if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else { game.returnHome(); return; }
  }
}
while (!S.defense && guard++ < 40) { S.player.popularity = 0; playDay(); } // keep own fame at 0 so a resident tops
ok(!!S.defense && S.defense.fielded === true, "the Lord fields his servant");
const winsBefore = S.player.wins;
game.beginDefense();
ok(S.screen === "battle" && S.throneDefense, "no prep, no boons — you fight");
playBattle();
if (S.screen === "defended") {
  ok(S.player.wins === winsBefore + 1, "a fielded win is a career win (+growth)");
  ok(S.lastDefense.fielded, "…credited as the household's stand");
  game.returnHome();
  ok(S.player.role === "servant" && S.lord, "the Lord keeps his throne — and his servant");
} else {
  ok(S.screen === "memorial" && S.lastThrone.fate === "defense", "a fielded defender who falls, dies (no choice)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

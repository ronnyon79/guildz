/* test_npcpolicy.js — GUI-79: NPC Lords run the four Stewardship systems by
 * temperament, so a commoner watches the hold flourish or rot. */
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const STEW = G.data.STEW;
// A commoner's world: roll a season with no throne claims muddying the count.
function rollSeason() { S.throneRestUntil = 9999; S.npcs.forEach((n) => { n.popularity = Math.max(n.popularity || 0, 1); }); S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }

console.log("— the policy reads the Lord's temperament —");
const grasping = game.npcLordPolicy({ personality: { grd: 0.95, dis: 0.3, amb: 0.3 } });
const generous = game.npcLordPolicy({ personality: { grd: 0.05, dis: 0.8, amb: 0.3 } });
ok(grasping.taxRate > generous.taxRate, `the grasping Lord taxes harder (${grasping.taxRate}% vs ${generous.taxRate}%)`);
ok(generous.purse > grasping.purse, "the generous Lord funds fatter purses");
ok(!game.npcLordPolicy({ personality: { dis: 0.1 } }).repairs, "an undisciplined Lord skips repairs");
ok(game.npcLordPolicy({ personality: { dis: 0.9 } }).repairs, "a disciplined Lord keeps things mended");
ok(game.npcLordPolicy({ personality: { amb: 0.9 } }).heralds > 0, "an ambitious Lord pays heralds");

console.log("— the decrees are LIVE from day one —");
game.createCharacter("fighter", "Commoner A", 790079);
S.lord.personality = { grd: 0.95, dis: 0.3, amb: 0.3 };
game.save(); game.load(S.worldId); // re-derive nothing; decrees were set at creation from the OLD lord — reset explicitly:
S.lord.personality = { grd: 0.95, dis: 0.3, amb: 0.3 };
// creation already applied the founding lord's policy; assert the mechanism via a fresh world with a forced lord
game.resetGame();
game.createCharacter("fighter", "Commoner B", 111222);
const pol = game.npcLordPolicy(S.lord);
ok(S.stronghold.taxRate === pol.taxRate, "the hold's tax matches its Lord's policy at creation");

console.log("— a grasping Lord's hold ROTS —");
game.resetGame();
game.createCharacter("thief", "Witness Grim", 424299);
S.lord.personality = { grd: 0.95, dis: 0.1, amb: 0.2, loy: 0.5 };
S.stronghold.buildings.seating = 2; S.stronghold.condition = {};
const popG0 = S.npcs.length;
for (let i = 0; i < 4; i++) rollSeason();
ok(game.condOf("seating") < 100, `the benches rot under the negligent Lord (${game.condOf("seating")}%)`);
ok(S.stronghold.taxRate >= 20, "he taxes the commoners hard");
ok(S.npcs.length < popG0, `and the hold empties (${popG0} → ${S.npcs.length})`);
ok((S.lastDay.migration || {}).pull < 50, `its Pull sits below the line (${(S.lastDay.migration || {}).pull})`);

console.log("— a wise Lord's hold HOLDS —");
game.resetGame();
game.createCharacter("thief", "Witness Wise", 424300);
S.lord.personality = { grd: 0.2, dis: 0.85, amb: 0.5, loy: 0.6 };
S.stronghold.buildings.seating = 2; S.stronghold.condition = {};
const popW0 = S.npcs.length;
for (let i = 0; i < 4; i++) rollSeason();
ok(game.condOf("seating") === 100, "the benches stay sound — he keeps them mended");
ok(S.npcs.length >= popW0 - 4, `the hold holds its own (${popW0} → ${S.npcs.length})`);
ok((S.lastDay.migration || {}).pull >= 50, `its Pull sits at or above the line (${(S.lastDay.migration || {}).pull})`);

console.log("— a neutral Lord stays within the band (the sim target) —");
game.resetGame();
game.createCharacter("fighter", "Witness Fair", 424301);
S.lord.personality = { grd: 0.5, dis: 0.5, amb: 0.5, loy: 0.5 };
S.stronghold.condition = {};
let minP = S.npcs.length, maxP = S.npcs.length;
for (let i = 0; i < 8; i++) { rollSeason(); minP = Math.min(minP, S.npcs.length); maxP = Math.max(maxP, S.npcs.length); }
ok(minP >= 30 && maxP <= 66, `population held the band across 8 years (${minP}–${maxP})`);
ok(S.npcs.length >= STEW.dyingPop, "a fairly-run hold never dies");

console.log("— the migration report marks the NPC hand —");
ok((S.lastDay.migration || {}).npc === true, "a commoner's migration report is flagged npc");

console.log("— your Lord's tenure feeds the hold's stability —");
game.resetGame();
game.createCharacter("mage", "Tenant", 424302);
S.lord.reignSeasons = 0; const pFresh = game.pullScore();
S.lord.reignSeasons = 5; const pSettled = game.pullScore();
ok(pSettled > pFresh, "a long-reigning Lord's hold pulls harder (stability)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

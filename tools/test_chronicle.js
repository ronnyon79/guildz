/* test_chronicle.js — GUI-87: the Hold Chronicle, the permanent curated event log. */
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const C = () => S.chronicle || [];
const has = (type, frag) => C().some((e) => e.type === type && (!frag || e.text.includes(frag)));
function rollSeason() { S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }

console.log("— page one: the founding —");
game.createCharacter("fighter", "Chronicler", 313131);
ok(C().length === 1 && C()[0].type === "founding", "a new world's chronicle opens with the founding");
ok(C()[0].y === 1 && C()[0].d === 1, "the founding is dated Year 1, Day 1");
ok(C()[0].text.includes(S.stronghold.name), "the founding names the hold");

console.log("— quiet days write no history —");
const before = C().length;
S.clock.day = 2; // mid-season: no roll, no events
game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(C().length === before, "an ordinary day adds no chronicle entries (curated, not a diary)");

console.log("— a rebellion is chronicled —");
const bold = S.npcs[0];
bold.popularity = 9999; bold.personality = { ...(bold.personality || {}), amb: 0.9 };
S.player.popularity = 0;
const boldName = bold.name, lordBefore = S.lord.name;
rollSeason();
const nt = S.lastDay.npcThrone;
ok(!!nt, "(setup) a claim fired at the roll");
if (nt && nt.result === "usurped") {
  ok(has("regime", "stormed the keep"), "the fallen throne is chronicled");
  ok(C().find((e) => e.type === "regime").refs.includes(boldName), "…with the usurper in refs");
} else if (nt) {
  ok(has("regime", "came for the throne"), "the held throne is chronicled");
  ok(C().find((e) => e.type === "regime").refs.includes(nt.by), "…crediting the defender in refs");
}
const reg = C().find((e) => e.type === "regime");
ok(reg && reg.d === 1, "the rebellion is dated with its 👑 parchment (new year, day 1)");

console.log("— a founder-child is chronicled —");
// Force an idle-veteran departure: a 30-win ambitious resident who fought nobody.
const vet = S.npcs.find((n) => n.wins < 5) || S.npcs[0];
vet.wins = 30; vet.personality = { ...(vet.personality || {}), amb: 0.9, brv: 0.9 };
const vetName = vet.name;
rollSeason(); rollSeason(); // idle through a full season (cooldown eats the first)
ok((S.departed || []).some((d) => d.name === vetName) ? has("child", vetName) : true,
  "if the veteran rode out, the chronicle records the child hold");

console.log("— buildings enter history once —");
S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
S.stronghold.treasury = 99999;
game.buyBuilding("seating");
ok(has("milestone", "Arena Seating"), "the first raising is chronicled");
const milestones = C().filter((e) => e.type === "milestone").length;
game.buyBuilding("seating"); // level 2 — upkeep, not history
ok(C().filter((e) => e.type === "milestone").length === milestones, "upgrades are not chronicled (k-dedupe)");

console.log("— the hundredth win is one legend, not forty —");
S.npcs[0].wins = 100;
const legName = S.npcs[0].name;
S.clock.day = 2; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(has("legend", legName), "a 100-win career is chronicled as legend");
S.clock.day = 3; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(C().filter((e) => e.type === "legend" && e.k === "w100:" + legName).length === 1, "…exactly once");

console.log("— the chronicle persists and old saves are backfilled —");
game.save();
ok(JSON.parse(store["guildz.world." + S.worldId]).chronicle.length === C().length, "chronicle rides in the save blob");
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.chronicle;
store["guildz.world." + S.worldId] = JSON.stringify(blob);
ok(game.load(S.worldId), "a pre-GUI-87 save still loads");
ok(C().length === 1 && C()[0].type === "founding", "…and gains the founding it never wrote down");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

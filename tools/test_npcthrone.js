/* test_npcthrone.js — GUI-72: NPCs challenge the throne while the player is
 * a commoner. Season-end only, fame+ambition gated, player's #1 outranks. */
function fakeEl() { return { innerHTML: "", className: "", addEventListener() {}, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;

// Roll a season as a commoner: last day of season, enter and withdraw.
function rollSeason() {
  S.clock.day = G.data.SEASON.days;
  game.enterArena();
  game.retreat();
  if (S.screen !== "home") game.returnHome();
}

console.log("— an ambitious famous resident comes for the throne —");
game.createCharacter("fighter", "Commoner Kim", 727272);
const bold = S.npcs[0];
bold.popularity = 9999; bold.personality = { ...(bold.personality || {}), amb: 0.9 };
S.player.popularity = 0;
const lordBefore = S.lord.name, rosterBefore = S.npcs.length, boldName = bold.name;
rollSeason();
const nt = S.lastDay.npcThrone;
ok(!!nt, "npcThrone news exists after the roll");
ok(nt && nt.challenger === boldName, "the boldest famous resident is the challenger");
ok(nt && ["held", "usurped"].includes(nt.result), "result is held or usurped");
const d1 = S.board[S.board.length - 1];
ok(d1.season === S.clock.season && d1.day === 1, "challenge parchments pin to the new season's day 1");
ok(d1.bouts.some((b) => b.throne || b.gauntlet), "a throne/gauntlet parchment is on the board");
const throneRec = d1.bouts.find((b) => b.throne);
if (nt.result === "usurped") {
  ok(S.lord.name === boldName, "usurper now reigns");
  ok(!S.npcs.find((n) => n.name === boldName), "usurper left the roster");
  ok(S.npcs.length === rosterBefore, "a hopeful arrived to fill the empty bed");
  ok(throneRec && throneRec.winner === boldName, "throne parchment names the usurper");
} else {
  ok(S.lord.name === lordBefore, "the Lord still reigns");
  ok(["exile", "die"].includes(nt.fate), "beaten challenger met their fate (exile/die)");
  ok(!S.npcs.find((n) => n.name === boldName), "beaten challenger left the roster");
  ok(!throneRec || throneRec.winner === lordBefore, "throne parchment (if reached) names the Lord");
}
ok(throneRec ? !!throneRec.seed : true, "throne parchment is seed-replayable");

console.log("— the throne rests a season after any rebellion —");
const again = S.npcs[0];
again.popularity = 9999; again.personality = { ...(again.personality || {}), amb: 0.9 };
S.player.popularity = 0;
rollSeason();
ok(!S.lastDay.npcThrone, "no second challenge the very next season (cooldown)");
rollSeason();
ok(!!S.lastDay.npcThrone || S.npcs.every((n) => (n.personality || {}).amb < 0.3 || n.popularity <= 0), "the season after, claims may fire again");

console.log("— your #1 finish outranks their claim —");
game.resetGame(); game.createCharacter("fighter", "Top Dog", 737373);
const rival = S.npcs[0];
rival.popularity = 500; rival.personality = { ...(rival.personality || {}), amb: 0.9 };
S.player.popularity = 99999;
rollSeason();
ok(!S.lastDay.npcThrone, "no NPC challenge when YOU are the season's #1");
ok(S.lastDay.mayChallenge === true, "your own challenge right opens instead");

console.log("— the meek stand aside —");
game.resetGame(); game.createCharacter("fighter", "Quiet World", 747474);
for (const n of S.npcs) n.personality = { ...(n.personality || {}), amb: 0.1 };
S.npcs[0].popularity = 9999; S.player.popularity = 0;
rollSeason();
ok(!S.lastDay.npcThrone, "no challenge when nobody famous is ambitious");
ok(S.lord && S.lord.name, "the Lord sits untroubled");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

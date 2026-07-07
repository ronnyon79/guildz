/* test_founderrecords.js — GUI-89: departures mint real holds in the ledger. */
let clickHandler = null;
function fakeEl() { return { innerHTML: "", className: "", addEventListener(ev, fn) { if (ev === "click") clickHandler = fn; }, closest() { return null; }, scrollTop: 0, scrollHeight: 0, classList: { add() {}, remove() {} }, dataset: {}, value: "" }; }
const els = {};
global.window = global; global.confirm = () => true;
global.document = { getElementById: (id) => (els[id] = els[id] || fakeEl()) };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord", "ui"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const click = (act, arg) => clickHandler({ target: { closest: () => ({ dataset: { act, arg } }) } });
const app = () => els.app.innerHTML;
const game = G.game, S = game.state;
function rollSeason() { S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }
function playBattle() { let g = 0; while (S.battle && S.battle.phase === "choose" && g++ < 400) { const r = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5); game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, r)); } }

console.log("— a departing veteran's hold is minted —");
game.createCharacter("fighter", "Ledger Keeper", 232323);
const vet = S.npcs[0];
vet.wins = 30; vet.personality = { ...(vet.personality || {}), amb: 0.9 };
const vetName = vet.name;
rollSeason();
const row = (S.departed || []).find((d) => d.name === vetName);
ok(!!row, "(setup) the idle ambitious veteran rode out");
if (row) {
  ok(!!row.holdName && row.holdName.length > 3, `the ledger mints their hold (${row.holdName})`);
  ok(!!G.data.ARCHETYPES[row.archetype], "…with a real archetype");
  ok(row.archetype !== "spite", "…never the Exile's Spite for a free rider-out");
  ok(row.holdName !== S.stronghold.name, "…and never this hold's own name");
  const child = (S.chronicle || []).find((e) => e.type === "child" && e.refs && e.refs[0] === vetName);
  ok(child && child.text.includes(row.holdName), "the chronicle names the daughter hold");
  ok(child && child.text.includes(G.data.ARCHETYPES[row.archetype].line), "…and tells how it stands");
}

console.log("— the ledger pill names the hold —");
game.go("home"); G.ui.render(S);
click("profile", vetName);
ok(app().includes("founder of") && row && app().includes(row.holdName), "the departed founder's profile names their hold");
click("profile-close");

console.log("— an ambitious deposed Lord builds in Spite —");
game.resetGame();
game.createCharacter("fighter", "Usurper Prime", 434344); // seeded so the beaten Lord RIDES OUT (loy 0 still stays 25% of the time)
S.player.wins = 200; S.player.bonusHp = 400; // guarantee the duel
S.lord.personality = { ...(S.lord.personality || {}), loy: 0, amb: 0.9 }; // rides out, builds again
const oldLord = S.lord.name;
S.player.popularity = 99999;
rollSeason();
ok(S.challengeOpen, "(setup) the challenge is open");
game.challengeLord(); playBattle();
ok(S.screen === "coronation", "(setup) the throne is yours");
const exiled = (S.departed || []).find((d) => d.name === oldLord);
ok(!!exiled && exiled.archetype === "spite", "the deposed Lord founded in the Exile's Spite");
ok((S.chronicle || []).some((e) => e.type === "child" && e.text.includes("in defiance") && e.text.includes(exiled ? exiled.holdName : "@")), "the chronicle records the defiant hold");

console.log("— pre-GUI-89 ledgers are backfilled —");
game.save();
const blob = JSON.parse(store["guildz.world." + S.worldId]);
if (blob.departed && blob.departed.length) {
  for (const d of blob.departed) { delete d.holdName; delete d.archetype; }
  store["guildz.world." + S.worldId] = JSON.stringify(blob);
  game.load(S.worldId);
  ok(S.departed.every((d) => d.reason !== "found" || !!d.holdName), "old founder rows gain minted holds on load");
  const first = S.departed.find((d) => d.reason === "found");
  const minted = first && first.holdName;
  store["guildz.world." + S.worldId] = JSON.stringify(blob);
  game.load(S.worldId);
  ok(!first || S.departed.find((d) => d.name === first.name).holdName === minted, "…deterministically");
} else { ok(true, "(no ledger rows to backfill in this world)"); ok(true, "(skip)"); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

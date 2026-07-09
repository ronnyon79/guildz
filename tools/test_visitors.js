/* test_visitors.js — GUI-92: visiting challengers. When the player's win-band
 * is too thin, the arena's renown draws fighters from neighbouring holds, so a
 * day is never a hollow walkover and the player can always progress. */
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
const app = () => els.app.innerHTML;
const game = G.game, S = game.state;
const band = (w) => G.tournament.bandOf(w);
const minField = G.data.ARENA.minField;

console.log("— a lone champion is never left with a walkover —");
game.createCharacter("fighter", "Solo", 920001);
S.player.wins = 90; // far above the roster
S.npcs.forEach((n) => { if (n.wins > 40) n.wins = 20; });
const mates = S.npcs.filter((n) => band(n.wins) === band(S.player.wins)).length;
ok(mates === 0, "(setup) the player is alone in their band");
game.enterArena();
ok((S.dayVisitors || []).length === minField - 1, `${minField - 1} visitors fill the field (target ${minField})`);
ok(S.playerBracket.entrants.length === minField, "the player's bracket is a real field, not a walkover");
ok(!!S.pendingBout, "the player has a bout to fight");
ok(!S.playerBracket.matches.some((m) => m.forfeit && (m.a === "player" || m.b === "player")), "no walkover for the player");
game.retreat();

console.log("— visitors come from real neighbouring holds, scaled to the band —");
game.enterArena();
const vs = S.dayVisitors;
ok(vs.every((v) => band(v.wins) === band(S.player.wins)), "every visitor sits in the player's win-band (a fair fight)");
const routeNames = new Set(game.tradeRoutes().map((r) => r.name));
ok(vs.every((v) => routeNames.has(v.visiting)), "every visitor names a real trade-route hold as home");
ok(vs.every((v) => !S.npcs.find((n) => n.id === v.id)), "visitors are transient — they never join the roster");
game.retreat();

console.log("— the player can WIN a visitor bout (progression restored) —");
{
  // scale the player up so they reliably beat a band-mate visitor
  S.player.bonusHp = 300;
  game.enterArena();
  let guard = 0, wins0 = S.player.wins;
  while (S.screen === "bracket" && guard++ < 20) {
    game.fightBout();
    let g2 = 0; while (S.battle && S.battle.phase === "choose" && g2++ < 400) { const r = G.engine.makeRng(S.battle.seed + S.battle.round * 31337 + 5); game.chooseAction(G.ai.chooseAction(S.battle.you, S.battle.foe, S.battle.range, r)); }
    if (S.screen === "win") { if (S.allocPending) game.allocate(1); game.fightOn(); }
    else break;
  }
  ok(S.player.wins > wins0, `beating visitors is a real career win (${wins0} → ${S.player.wins})`);
  if (S.screen !== "home") game.returnHome();
  S.player.bonusHp = 0;
}

console.log("— the bracket + scout show the visitor's origin —");
game.createCharacter("fighter", "Renowned", 920004);
S.player.wins = 90; S.npcs.forEach((n) => { if (n.wins > 40) n.wins = 15; });
game.enterArena();
G.ui.render(S);
ok(app().includes("neighbouring holds"), "the bracket heralds the visiting challengers");
ok(app().includes("🚩 of ") || app().includes("travelled from"), "the scout names the visitor's home hold");
const vName = S.dayVisitors[0].name;
clickHandler({ target: { closest: () => ({ dataset: { act: "profile", arg: vName } }) } });
ok(app().includes("visiting from"), "tapping a visitor shows a 'visiting from' profile");
game.retreat();

console.log("— a full band draws NO visitors —");
game.createCharacter("fighter", "Crowded", 920002);
S.player.wins = 10; // a well-populated low band
const mates2 = S.npcs.filter((n) => band(n.wins) === band(S.player.wins)).length;
game.enterArena();
if (mates2 >= minField - 1) ok((S.dayVisitors || []).length === 0, `a full band (${mates2} rivals) needs no visitors`);
else ok((S.dayVisitors || []).length === minField - 1 - mates2, `a partly-filled band tops up to the target (${mates2} real + ${(S.dayVisitors || []).length} visiting)`);
game.retreat();

console.log("— determinism: the same day summons the same visitors —");
game.createCharacter("thief", "Twin", 920003);
S.player.wins = 75; S.npcs.forEach((n) => { if (n.wins > 40) n.wins = 15; });
game.save();
game.enterArena();
const names1 = (S.dayVisitors || []).map((v) => v.name + "@" + v.visiting);
game.load(S.worldId);
game.enterArena();
const names2 = (S.dayVisitors || []).map((v) => v.name + "@" + v.visiting);
ok(JSON.stringify(names1) === JSON.stringify(names2), "the same seeded day draws the same visitors");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

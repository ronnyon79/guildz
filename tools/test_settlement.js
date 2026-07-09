/* test_settlement.js — GUI-90: found from scratch. A settlement (Act 1) grows
 * by stewardship until it can raise an Arena (Act 2), then the founders choose
 * a Lord — crown / champion / road. */
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
const STEW = G.data.STEW;
function growToArena() { let y = 0; while (y++ < 15 && !game.arenaReady() && !S.settleFailed) { game.advanceSettlement(); if (S.screen === "settlement-sunset") game.settleContinue(); } }

console.log("— world creation offers the choice —");
S.screen = "class-select"; G.ui.render(S);
ok(app().includes("How will you begin?") && app().includes("Found from scratch"), "the seat choice renders on class select");

console.log("— founding a camp —");
game.createCharacter("fighter", "Founder Fay", 990011, "Newcamp", "found");
ok(S.player.role === "founder", "you are a founder");
ok(S.player.wins === STEW.founderWins, "…a veteran (the champion door stays viable)");
ok(S.stronghold.arenaRaised === false, "no Arena yet");
ok(S.stronghold.treasury === STEW.foundPurse || S.stronghold.treasury === STEW.foundPurse + 150, "the pooled purse funds the founding");
ok(S.npcs.length === STEW.foundParty || S.npcs.length === STEW.foundParty + 2, "a founding party of ~8 followed you");
ok(S.lord === null, "a settlement has no Lord");
ok(S.chronicle[0] && S.chronicle[0].type === "founding" && S.chronicle[0].text.includes("Founder Fay"), "parchment #0 names you the founder");
ok(S.screen === "settlement", "you begin on the settlement screen");

console.log("— the settlement screen —");
G.ui.render(S);
ok(app().includes("Toward the Arena"), "the arena-progress card shows the goal");
ok(app().includes("advance-settlement"), "…with a 'let a season pass' button");
ok(app().includes("🌾 The larder") && app().includes("🧲") && app().includes("🐫 Trade"), "the stewardship dashboard is present");
ok(!app().includes("enter-arena") && !app().includes("hold-games"), "no arena flows pre-Arena");

console.log("— a season passes —");
const need = game.provisionNeed();
ok(need < S.npcs.length + 1, "the camp forages (net need below its mouths)");
game.advanceSettlement();
ok(!!S.settleReport && S.screen === "settlement-sunset", "the season resolves to a sunset report");
ok(S.settleReport.pull >= 50, "a fed, safe camp pulls settlers");
game.settleContinue();
ok(S.screen === "settlement", "…and returns to building");

console.log("— growth reaches the Arena threshold —");
growToArena();
ok(game.arenaReady(), `the camp reached ${S.npcs.length} settlers and ${S.stronghold.treasury}🪙 — ready to raise the Arena`);
ok(S.npcs.length >= STEW.arenaPop && S.stronghold.treasury >= STEW.arenaCost, "both gates met");

console.log("— raising the Arena —");
G.ui.render(S);
ok(app().includes("raise-arena"), "the raise button appears when ready");
const tBefore = S.stronghold.treasury;
game.raiseArena();
ok(S.stronghold.arenaRaised && S.stronghold.arenaRaisedOn === S.clock.season, "the Arena is raised, dated in the chronicle era");
ok(tBefore - S.stronghold.treasury === STEW.arenaCost, "…paid for from the common purse");
ok(S.chronicle.some((e) => e.type === "milestone" && e.text.includes("Arena")), "the chronicle records the raising");
ok(S.screen === "arena-election", "the founders convene to choose a Lord");
G.ui.render(S);
ok(app().includes("The Arena stands") && app().includes("founder-fate"), "the election offers crown / sword / road");

console.log("— door 1: take the crown —");
game.chooseFounderFate("crown");
ok(S.player.role === "lord" && S.lord === null && S.player.crownedSeason === S.clock.season, "you are crowned the first Lord");
ok(S.stronghold.purse === G.data.ECONOMY.start.purse, "arena income turns on (decrees seeded)");
ok(S.screen === "home", "the Lord dashboard takes over");
ok(S.chronicle.some((e) => e.type === "regime" && e.text.includes("first throne")), "the coronation is chronicled");

console.log("— door 2: take up the sword (an NPC founder is acclaimed) —");
game.resetGame(); game.createCharacter("thief", "Sword Sil", 990012, "Bladeburgh", "found");
growToArena(); game.raiseArena();
const heirName = S.npcs.slice().sort((a, b) => ((b.personality || {}).amb || 0.5) - ((a.personality || {}).amb || 0.5))[0].name;
game.chooseFounderFate("champion");
ok(S.player.role === "champion", "you take up the sword");
ok(S.lord && S.lord.name === heirName, "the most ambitious founder is acclaimed Lord");
ok(!S.npcs.find((n) => n.name === heirName), "…and leaves the roster for the throne");
ok(S.player.wins === 0, "you enter the arena you built as a fresh challenger");
ok(S.screen === "home", "the champion flow takes over");

console.log("— door 3: ride on —");
game.resetGame(); game.createCharacter("mage", "Wanderer", 990013, "Roadsend", "found");
const wid = S.worldId;
growToArena(); game.raiseArena();
game.chooseFounderFate("road");
ok(S.screen === "memorial" && (S.lastThrone || {}).founderRoad, "riding on ends the founding");
G.ui.render(S);
ok(app().includes("The founder rides on") && app().includes("Roadsend"), "a triumphant departure, not a grave");
ok(!store["guildz.world." + wid], "the world is closed out");

console.log("— a hungry camp fails to thrive —");
game.resetGame(); game.createCharacter("fighter", "Starver", 990014, "Faminehold", "found");
S.stronghold.provisionPolicy = "none";
let y = 0, everStarved = false;
while (y++ < 8 && !S.settleFailed) { game.advanceSettlement(); if ((S.settleReport || {}).starved) everStarved = true; if (S.screen === "settlement-sunset") game.settleContinue(); }
ok(everStarved && S.npcs.length < STEW.arenaPop, "buy-nothing starves the camp and it never reaches the Arena");

console.log("— join-mode worlds are unchanged (arena from the start) —");
game.resetGame(); game.createCharacter("fighter", "Classic", 990015, "Oldhold", "join");
ok(S.player.role === "champion" && S.stronghold.arenaRaised === true && S.lord, "join mode: a living hold with its Lord and arena");
ok(S.screen === "home", "…starts on the arena home screen");

console.log("— a founder world resumes on its own screen —");
game.resetGame(); game.createCharacter("fighter", "Resumer", 990016, "Pauseton", "found");
const rid = S.worldId; game.advanceSettlement(); if (S.screen === "settlement-sunset") game.settleContinue();
game.save(); game.load(rid);
ok(S.screen === "settlement" && S.player.role === "founder", "reloading a camp returns to the settlement screen");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

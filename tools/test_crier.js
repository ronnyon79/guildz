/* test_crier.js — GUI-53: the town crier's news ring. */
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
const app = () => els.app.innerHTML;
function rollSeason() { S.clock.day = G.data.SEASON.days; game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome(); }

console.log("— the crier hears the season turn —");
game.createCharacter("fighter", "Crier Fan", 787878);
const bold = S.npcs[0];
bold.popularity = 9999; bold.personality = { ...(bold.personality || {}), amb: 0.9 };
S.player.popularity = 0;
rollSeason();
ok(S.news.length > 0, "news recorded at the roll");
ok(S.news.some((n) => n.icon === "👑" || n.icon === "🛡️"), "the throne challenge made the news");
ok(S.news.every((n) => n.d != null && n.s != null), "every entry is date-stamped");

console.log("— the crier cries on the home screen —");
game.go("home"); G.ui.render(S);
ok(app().includes("📯 The crier of"), "crier card renders at home");
ok(app().includes(bold.name), "the challenger is named in the cry");

console.log("— the ring persists and stays capped —");
game.save();
const before = S.news.length;
game.load(S.worldId);
ok(S.news.length === before, "news survives save/load");
for (let i = 0; i < 30; i++) S.news.push({ s: 1, d: 1, icon: "🧪", text: "filler " + i });
game.save(); game.load(S.worldId);
S.lastDay = { board: [] };
// cap is enforced at settle: simulate by rolling a quiet day
game.enterArena(); game.retreat(); if (S.screen !== "home") game.returnHome();
ok(S.news.length <= 20, `ring capped at 20 (${S.news.length})`);

/* — GUI-50: today's field at sunrise — */
console.log("— today's field —");
{
  game.go("home"); G.ui.render(S);
  const band = G.tournament.bandOf(S.player.wins);
  const rivals = S.npcs.filter((n) => G.tournament.bandOf(n.wins) === band);
  ok(app().includes("🌅 Today's field"), "field card renders at home");
  if (rivals.length) {
    ok(app().includes(rivals[0].name), "rivals are listed by name");
    ok(new RegExp(rivals.length + " rival").test(app()), "rival count shown");
  } else {
    ok(app().includes("walkover"), "empty band announces the walkover");
    ok(true, "-");
  }
  const role = S.player.role; S.player.role = "lord"; G.ui.render(S);
  ok(!app().includes("🌅 Today's field"), "Lords see no field — they preside");
  S.player.role = role;
}

/* — GUI-52: the clerk's book — */
console.log("— the clerk's book —");
{
  game.resetGame(); game.createCharacter("fighter", "Ledger Lord", 525252);
  S.player.role = "lord"; S.lord = null; S.player.crownedSeason = S.clock.season;
  S.stronghold.treasury = 5000;
  let treasuries = [S.stronghold.treasury];
  for (let i = 0; i < 9; i++) {
    G.lord.holdGames();
    if (S.screen !== "home") game.returnHome();
    treasuries.push(S.stronghold.treasury);
  }
  ok(S.ledgerLog.length === 7, `the book keeps exactly 7 days (${S.ledgerLog.length})`);
  const last = S.ledgerLog[S.ledgerLog.length - 1];
  ok(last.after === S.stronghold.treasury, "the closing balance matches the treasury");
  ok(S.ledgerLog.every((r, i) => i === 0 || S.ledgerLog[i - 1].after + r.net === r.after), "each net reconciles to the running balance");
  game.save(); game.load(S.worldId);
  ok(S.ledgerLog.length === 7, "the book survives save/load");
  game.go("home"); G.ui.render(S);
  ok(app().includes("📒 The clerk's book"), "the book renders on the Lord's home");
  ok(/[+-]\d+g over 7 days/.test(app()), "the 7-day total is pinned in the title");
}

/* — GUI-54: name your Stronghold — */
console.log("— naming the hold —");
{
  game.resetGame(); game.createCharacter("fighter", "Named One", 545454, "Wolfden Keep");
  ok(S.stronghold.name === "Wolfden Keep", "a chosen name sticks");
  game.go("home"); G.ui.render(S);
  ok(app().includes("🏰 <b>Wolfden Keep</b>"), "the hold heads the home screen");
  game.save();
  ok(game.listWorlds().some((w) => w.hold === "Wolfden Keep"), "the world index carries the hold");
  game.resetGame(); game.createCharacter("mage", "Blank Namer", 555555, "");
  ok(/^[A-Z][a-z]+(hold|gate|spire|keep|reach|fen|garde|rock|watch|mere)$/.test(S.stronghold.name), `blank name → the Scribe picks one (${S.stronghold.name})`);
  const first = S.stronghold.name;
  game.resetGame(); game.createCharacter("mage", "Blank Namer", 555555, "");
  ok(S.stronghold.name === first, "the default is seeded — same world seed, same name");
  // renaming: lords only
  game.renameHold("Sneaky Rename");
  ok(S.stronghold.name === first, "a commoner cannot rename the hold");
  S.player.role = "lord";
  game.renameHold("New Banner");
  ok(S.stronghold.name === "New Banner", "the Lord may rename");
  // old saves get a backfilled name
  const raw = JSON.parse(store["guildz.world." + S.worldId]);
  delete raw.stronghold.name;
  store["guildz.world." + S.worldId] = JSON.stringify(raw);
  game.load(S.worldId);
  ok(!!S.stronghold.name, "old saves are backfilled with a seeded name");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

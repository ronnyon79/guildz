/* test_voices.js — GUI-49: temperament-coloured chat voices. Synthetic verbatim
 * logs pin the exact events, so each temperament's pool is provably spoken. */
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
const game = G.game, S = game.state;
const app = () => els.app.innerHTML;

game.createCharacter("fighter", "Voice Tester", 767676);

// Pin a synthetic parchment: fighter A with a chosen temperament lands a big
// hit, misses, evades, charges; fighter B is even-tempered.
function plant(trait, temperName) {
  if (!S.board.length) S.board.push({ day: S.clock.day, season: S.clock.season, bouts: [] });
  const A = { name: "Speaker", classId: "fighter", wins: 10, meleeWeapon: "one_handed_sword", missileWeapon: "long_bow", personality: { agg: 0, brv: 0, amb: 0, cun: 0, dis: 0, cru: 0, loy: 0, grd: 0, [trait]: 0.9 } };
  const B = { name: "Bland", classId: "cleric", wins: 10, meleeWeapon: "mace", missileWeapon: "sling", personality: null };
  const log = [
    { t: "move", who: "Speaker", to: "melee" },
    { t: "hit", who: "Speaker", target: "Bland", dmg: 9, kind: "melee", roll: 15 },
    { t: "miss", who: "Speaker", roll: 4 },
    { t: "evade", who: "Speaker", roll: 19 },
    { t: "hit", who: "Speaker", target: "Bland", dmg: 12, kind: "melee", roll: 20, crit: true },
    { t: "move", who: "Bland", to: "melee" },
    { t: "end", result: "won" },
  ];
  S.board[S.board.length - 1].bouts.push({ a: A, b: B, winner: "Speaker", rounds: 2, spec: 3, log, youIsA: true });
  game.openBout(S.board.length - 1, S.board[S.board.length - 1].bouts.length - 1);
  G.ui.render(S);
  return temperName;
}

console.log("— each temperament speaks its own voice —");
const CASES = [
  ["agg", "Ferocious", /(BLOOD! Give me MORE|tear you APART|RIP AND RUIN|guard means NOTHING|stand STILL|dodge me forever|no more distance|EAT you alive)/],
  ["cun", "Cunning", /(never saw the real strike|Exactly where I wanted|trap SPRINGS|and mate|Interesting… noted|That miss\? Bait|three moves ago|just as planned|change the game)/],
  ["loy", "Steadfast", /(For the Stronghold|never once failed|wall strikes BACK|Stand or fall|Steady\. Again|bends nothing|do not break|tire before I yield|Shoulder to shoulder|hold the line)/],
  ["grd", "Grasping", /(coin in MY purse|owed to me|JACKPOT|counting THIS one|Wasted effort|MY winnings|take what's mine|copper of damage|Time is money|purse is close)/],
];
for (const [trait, name, rx] of CASES) {
  plant(trait, name);
  ok(rx.test(app()), `${name} voice heard in the parchment`);
  ok(app().includes(`· ${name}`), `${name} tag shown on the name line`);
}

console.log("— the even-tempered stay neutral —");
plant("agg", "check-bland");
ok(!/Bland[^]*?· (Ferocious|Cunning|Steadfast|Grasping)/.test(app().split("Speaker")[0] || ""), "Bland carries no temperament tag");
const neutralCharge = /(No more hiding|Closing in\. Let's end this)/.test(app());
ok(neutralCharge, "even-tempered fighters use the neutral pools");

console.log("— threshold respected: a 0.5 trait is no temperament —");
const A2 = { name: "Halfway", classId: "thief", wins: 10, meleeWeapon: "one_handed_sword", missileWeapon: "long_bow", personality: { agg: 0.5, brv: 0, amb: 0, cun: 0, dis: 0, cru: 0, loy: 0, grd: 0 } };
S.board[S.board.length - 1].bouts.push({ a: A2, b: { name: "Foe2", classId: "cleric", wins: 5, meleeWeapon: "mace", missileWeapon: "sling" }, winner: "Halfway", rounds: 1, spec: 2, log: [{ t: "hit", who: "Halfway", target: "Foe2", dmg: 10, kind: "melee", roll: 14 }, { t: "end", result: "won" }], youIsA: true });
game.openBout(S.board.length - 1, S.board[S.board.length - 1].bouts.length - 1); G.ui.render(S);
ok(!app().includes("· Ferocious"), "below-threshold trait speaks neutrally (label rule)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

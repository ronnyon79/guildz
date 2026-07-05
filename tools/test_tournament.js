/* Headless tests for js/tournament.js (GUI-5). Run: node tools/test_tournament.js */
for (const f of ["engine", "data", "combat", "ai", "tournament"])
  require("../js/" + f + ".js");

const T = G.tournament, ai = G.ai, CLASSES = G.data.CLASSES;
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}

// Battle-ready champion record (what the GUI-6 roster will store).
function makeChamp(id, classId, wins) {
  const c = CLASSES[classId];
  const pools = c.caster ? ai.maxPools(classId, wins, 0.6)
    : { maxHp: c.startHp + 2 * wins, maxMp: 0 };
  return {
    id, name: id, classId, wins,
    maxHp: pools.maxHp, maxMp: pools.maxMp,
    meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
    items: {}, arrows: [], activeArrow: "normal",
    armor: null, armorDurability: 0,
  };
}
const CLS = ["fighter", "thief", "mage", "cleric"];
function roster(n, winsFn) {
  return Array.from({ length: n }, (_, i) => makeChamp("c" + i, CLS[i % 4], winsFn(i)));
}

console.log("— bands —");
ok(T.bandOf(0) === 0 && T.bandOf(4) === 0 && T.bandOf(5) === 1 && T.bandOf(27) === 5, "bandOf: 0,4→0 · 5→1 · 27→5");
ok(T.bandLabel(1) === "5–9 wins", "bandLabel(1) = '5–9 wins'");
const bk = T.bucket(roster(10, (i) => i)); // wins 0..9 → bands 0 and 1, 5 each
ok(Object.keys(bk).length === 2 && bk[0].length === 5 && bk[1].length === 5, "bucket: wins 0..9 → two bands of 5");

console.log("— bracket structure —");
let br = T.newBracket(0, ["a", "b", "c", "d", "e", "f", "g", "h"], 42);
ok(br.matches.filter((m) => m.round === 1).length === 4 && !br.pendingBye, "8 entrants → 4 first-round matches, no bye");
let guard = 0;
while (!br.winner && guard++ < 50) T.reportBout(br, T.pendingMatch(br), T.pendingMatch(br).a);
ok(!!br.winner, "8-bracket completes to a single winner");
ok(br.matches.length === 7, "8 entrants → exactly 7 bouts (single elim)");
ok(br.boutsWon[br.winner] === 3, "winner of an 8-bracket won exactly 3 bouts");

br = T.newBracket(0, ["a", "b", "c", "d", "e"], 7);
ok(br.matches.filter((m) => m.round === 1).length === 2 && !!br.pendingBye, "5 entrants → 2 matches + 1 random bye");
guard = 0;
while (!br.winner && guard++ < 50) T.reportBout(br, T.pendingMatch(br), T.pendingMatch(br).a);
ok(!!br.winner && br.matches.length === 4, "5 entrants → 4 bouts total (byes fight nobody)");
ok(br.byes.length >= 1, "bye recorded");

br = T.newBracket(3, ["solo"], 1);
ok(br.winner === "solo" && br.boutsWon.solo === 0, "lone entrant → walkover winner with 0 boutsWon");

ok((() => { try { T.reportBout(T.newBracket(0, ["a", "b"], 1), T.pendingMatch(T.newBracket(0, ["a", "b"], 1)), "zzz"); return false; } catch (e) { return true; } })(),
  "reporting a non-participant winner throws");

console.log("— full day (real combat auto-resolve) —");
const champs = roster(23, (i) => [0, 2, 6, 11, 26][i % 5]); // bands 0,0,1,2,5 → odd counts too
const events = [];
const day = T.runDay(champs, 20260705, (b, m, res, w) => { w.wins += 1; events.push(res); });
ok(day.done, "day completes");
const W = T.winners(day);
ok(day.brackets.every((b) => !!b.winner), "every band produced a winner");
ok(Object.keys(W).length === day.brackets.length, "winners() covers every bracket");
const totalBouts = day.brackets.reduce((s, b) => s + b.matches.length, 0);
ok(events.length === totalBouts, "onBout fired once per bout (" + totalBouts + ")");
ok(day.brackets.every((b) => b.entrants.length - 1 === b.matches.length),
  "each bracket ran exactly entrants−1 bouts");
ok(champs.reduce((s, c) => s + c.wins, 0) === [0, 2, 6, 11, 26].reduce((s, w, i) => s + w * (i < 3 ? 5 : 4), 0) + totalBouts,
  "career wins applied via onBout (+1 per bout won)");
ok(day.brackets.every((b) => b.matches.every((m) => m.rounds > 0)), "every bout recorded its combat rounds");

console.log("— determinism —");
const c1 = roster(16, (i) => i % 8), c2 = roster(16, (i) => i % 8);
const d1 = T.runDay(c1, 777), d2 = T.runDay(c2, 777);
ok(JSON.stringify(T.winners(d1)) === JSON.stringify(T.winners(d2)), "same seed + roster → identical winners");
const d3 = T.runDay(roster(16, (i) => i % 8), 778);
ok(JSON.stringify(T.winners(d1)) !== JSON.stringify(T.winners(d3)), "different seed → (almost surely) different outcome");
ok(JSON.parse(JSON.stringify(d1)).brackets.length === d1.brackets.length, "day state is JSON-serializable");

console.log("— player guard —");
const pc = roster(4, () => 0); pc[0].isPlayer = true;
ok((() => { try { T.runDay(pc, 5); return false; } catch (e) { return true; } })(),
  "runDay refuses player bouts (interactive days are driven by the game layer)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* matchmaking.js — "real day" simulator. Each run: start at streak 0, fight
 * in-game-generated foes (scaling with streak), grow on each win, stop on a loss.
 * Measures how far each class realistically pushes a streak.
 * Usage: node tools/matchmaking.js [daysPerClass] [startWins] [mageHpPerWin]
 */
const path = require("path");
const base = path.join(__dirname, "..", "js");
for (const f of ["engine", "data", "combat", "ai"]) require(path.join(base, f + ".js"));
const C = G.combat, AI = G.ai, E = G.engine, D = G.data;

const DAYS = parseInt(process.argv[2], 10) || 10000;
const START_WINS = parseInt(process.argv[3], 10) || 0;
const MAGE_HP_PER_WIN = process.argv[4] != null ? parseInt(process.argv[4], 10) : 1; // 0..2
const MAXR = 220, STREAK_CAP = 400;

function playerMax(p) {
  const c = D.CLASSES[p.classId];
  return { maxHp: c.startHp + p.bonusHp, maxMp: c.caster ? c.startMp + p.bonusMp : 0 };
}
function playerChar(p) {
  const m = playerMax(p);
  return { name: "You", classId: p.classId, wins: p.wins, maxHp: m.maxHp, maxMp: m.maxMp, isPlayer: true };
}
function newPlayer(classId) {
  const c = D.CLASSES[classId];
  const p = { classId, wins: START_WINS, bonusHp: 0, bonusMp: 0 };
  if (c.caster) { p.bonusHp = MAGE_HP_PER_WIN * START_WINS; p.bonusMp = (2 - MAGE_HP_PER_WIN) * START_WINS; }
  else p.bonusHp = 2 * START_WINS;
  return p;
}
function onWin(p) {
  p.wins += 1;
  if (D.CLASSES[p.classId].caster) { p.bonusHp += MAGE_HP_PER_WIN; p.bonusMp += 2 - MAGE_HP_PER_WIN; }
  else p.bonusHp += 2;
}

// Player is always "you" (matches the real game's initiative tiebreak).
function playerWinsFight(pChar, foe, seed) {
  let st = C.newBattle(pChar, foe, seed);
  const dec = E.makeRng(seed ^ 0x9e3779b9);
  let g = 0;
  while (st.phase === "choose" && g++ < MAXR)
    st = C.resolveRound(st, AI.chooseAction(st.you, st.foe, st.range, dec), AI.chooseAction(st.foe, st.you, st.range, dec));
  return st.phase === "won"; // a draw (timeout) counts as not-a-win => day ends
}

function runDay(classId, seedBase) {
  const p = newPlayer(classId);
  let streak = 0, seed = seedBase;
  while (streak < STREAK_CAP) {
    const foe = AI.generateFoe(p.wins, streak, (seed = (seed * 1103515245 + 12345) >>> 0));
    if (playerWinsFight(playerChar(p), foe, (seed = (seed * 1103515245 + 12345) >>> 0))) {
      streak += 1; onWin(p);
    } else break;
  }
  return streak;
}

function stats(arr) {
  arr.sort((a, b) => a - b);
  const n = arr.length, at = (q) => arr[Math.min(n - 1, Math.floor(q * n))];
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const reach = (k) => (100 * arr.filter((x) => x >= k).length / n).toFixed(1) + "%";
  return { mean: mean.toFixed(1), median: at(0.5), p90: at(0.9), max: arr[n - 1],
    r1: reach(1), r5: reach(5), r10: reach(10), r20: reach(20) };
}

console.log(`"Real day" sim — ${DAYS} days/class, start ${START_WINS} wins, mage split +${MAGE_HP_PER_WIN}HP/+${2 - MAGE_HP_PER_WIN}MP per win\n`);
console.log("class    mean  median  p90  max  |  reach≥1   ≥5    ≥10   ≥20");
for (const cls of ["fighter", "thief", "mage"]) {
  const streaks = [];
  for (let d = 0; d < DAYS; d++) streaks.push(runDay(cls, d * 2654435761 + 12345));
  const s = stats(streaks);
  console.log(`${cls.padEnd(8)} ${String(s.mean).padStart(4)}  ${String(s.median).padStart(5)}  ${String(s.p90).padStart(3)}  ${String(s.max).padStart(3)}  |  ${s.r1.padStart(6)}  ${s.r5.padStart(5)}  ${s.r10.padStart(5)}  ${s.r20.padStart(5)}`);
}

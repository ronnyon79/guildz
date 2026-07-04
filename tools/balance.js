/* balance.js — headless class-balance simulator.
 * Runs every class matchup thousands of times at several progression levels and
 * reports win rates. Both sides use the shipped AI (js/ai.js). Usage:
 *   node tools/balance.js [battlesPerMatchup] [mageHpShare]
 */
const path = require("path");
const base = path.join(__dirname, "..", "js");
for (const f of ["engine", "data", "combat", "ai"]) require(path.join(base, f + ".js"));
const C = G.combat, AI = G.ai, E = G.engine, D = G.data;

const CLASSES = Object.keys(D.CLASSES);
const N = parseInt(process.argv[2], 10) || 20000; // battles per matchup
const MAGE_HP_SHARE = process.argv[3] != null ? parseFloat(process.argv[3]) : 0.6;
const WIN_LEVELS = [0, 10, 25, 50];
const MAX_ROUNDS = 300;

// Build a character at a given win-count. Mage splits its points by hpShare.
function charAt(classId, wins, hpShare) {
  const c = D.CLASSES[classId];
  const pts = 2 * wins;
  let maxHp, maxMp;
  if (c.caster) {
    const toHp = Math.round(pts * hpShare);
    maxHp = c.startHp + toHp; maxMp = c.startMp + (pts - toHp);
  } else {
    maxHp = c.startHp + pts; maxMp = 0;
  }
  return { name: classId, classId, wins, maxHp, maxMp };
}

// One battle between two chars. Returns "a" | "b" | "draw". `flip` swaps sides
// so neither class benefits from the player-first initiative tiebreak.
function fight(a, b, seed, flip) {
  const you = flip ? b : a, foe = flip ? a : b;
  let st = C.newBattle({ ...you, isPlayer: true }, { ...foe }, seed);
  const dec = E.makeRng(seed ^ 0x9e3779b9);
  let guard = 0;
  while (st.phase === "choose" && guard++ < MAX_ROUNDS) {
    const yA = AI.chooseAction(st.you, st.foe, st.range, dec);
    const fA = AI.chooseAction(st.foe, st.you, st.range, dec);
    st = C.resolveRound(st, yA, fA);
  }
  if (st.phase === "won") return flip ? "b" : "a";
  if (st.phase === "lost") return flip ? "a" : "b";
  return "draw";
}

function runMatchup(clsA, clsB, wins, hpShare) {
  let aWins = 0, bWins = 0, draws = 0, rounds = 0;
  for (let i = 0; i < N; i++) {
    const a = charAt(clsA, wins, hpShare), b = charAt(clsB, wins, hpShare);
    const r = fight(a, b, i * 2654435761 + wins * 40503 + 1, i % 2 === 1);
    if (r === "a") aWins++; else if (r === "b") bWins++; else draws++;
  }
  return { aWins, bWins, draws };
}

function pct(x, n) { return (100 * x / n).toFixed(1).padStart(5) + "%"; }

console.log(`Guildz balance sim — ${N} battles/matchup, mage HP share ${MAGE_HP_SHARE}\n`);

for (const W of WIN_LEVELS) {
  const hpFor = (hp) => hp;
  const sampleHp = CLASSES.map((c) => `${c}:${charAt(c, W, MAGE_HP_SHARE).maxHp}hp${D.CLASSES[c].caster ? "/" + charAt(c, W, MAGE_HP_SHARE).maxMp + "mp" : ""}`).join("  ");
  console.log(`===== ${W} wins  (${sampleHp}) =====`);

  const overall = {}; CLASSES.forEach((c) => (overall[c] = { w: 0, g: 0 }));
  // header
  console.log("            " + CLASSES.map((c) => c.padStart(9)).join(""));
  for (const A of CLASSES) {
    let row = A.padEnd(8);
    for (const B of CLASSES) {
      if (A === B) { row += "     -   "; continue; }
      const { aWins, bWins, draws } = runMatchup(A, B, W, MAGE_HP_SHARE);
      const n = aWins + bWins + draws;
      row += pct(aWins, n).padStart(9);
      overall[A].w += aWins; overall[A].g += n;
      if (draws > n * 0.01) row = row.replace(/%$/, `%(${(100 * draws / n).toFixed(0)}d)`);
    }
    console.log(row + "   | row = " + A + " win% vs column");
  }
  console.log("  overall: " + CLASSES.map((c) => `${c} ${pct(overall[c].w, overall[c].g).trim()}`).join("   ") + "\n");
}

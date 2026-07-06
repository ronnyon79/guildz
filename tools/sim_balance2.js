/* GUI-37 (+GUI-32/35 data): class balance at equal wins, WITH personalities,
 * aging and the current meta. Optionally applies a candidate Mage buff via the
 * engine's spellPower hook to compare. Run: node tools/sim_balance2.js [buff]
 */
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster"])
  require("../js/" + f + ".js");

const { CLASSES, AGE } = G.data;
const BUFF = process.argv[2] ? parseInt(process.argv[2], 10) : 0; // spellPower per N wins (0 = off)

function champ(id, cls, wins, seed) {
  const rng = G.engine.makeRng(seed);
  const n = {
    id, name: id, classId: cls, wins,
    age: AGE.start + Math.round(wins / 3), // in-prime by construction
    personality: G.roster.rollPersonality(rng),
  };
  const c = G.roster.combatChar(n, 0.9); // the standard 10%-tax world
  if (BUFF && cls === "mage") c.spellPower = Math.floor(wins / BUFF);
  return c;
}

const CLS = ["fighter", "thief", "mage", "cleric"];
const K = 700;
console.log(`Equal-wins balance (personalities ON, 10% tax era${BUFF ? `, mage spellPower = wins/${BUFF}` : ""}) — ${K}/pair/band`);
const overall = {};
CLS.forEach((c) => (overall[c] = { w: 0, t: 0 }));
for (const band of [0, 15, 30]) {
  const line = {};
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      let aw = 0;
      for (let k = 0; k < K; k++) {
        const A = champ("A", CLS[i], band, band * 999 + k * 7 + i);
        const B = champ("B", CLS[j], band, band * 555 + k * 13 + j);
        const res = G.tournament.autoBout(A, B, band * 100000 + k * 2 + 1);
        if (res.winnerId === "A") aw++;
      }
      overall[CLS[i]].w += aw; overall[CLS[i]].t += K;
      overall[CLS[j]].w += K - aw; overall[CLS[j]].t += K;
      line[CLS[i]] = (line[CLS[i]] || 0) + aw / K;
      line[CLS[j]] = (line[CLS[j]] || 0) + (K - aw) / K;
    }
  }
  console.log(`  band ${String(band).padStart(2)}: ` + CLS.map((c) => `${c} ${(100 * line[c] / 3).toFixed(0)}%`).join("  "));
}
console.log("  OVERALL: " + CLS.map((c) => `${c} ${(100 * overall[c].w / overall[c].t).toFixed(1)}%`).join("  "));

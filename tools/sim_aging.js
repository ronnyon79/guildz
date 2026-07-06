/* GUI-35: the aging curve in practice — does decline keep veterans beatable
 * and rotate the threat? Run: node tools/sim_aging.js */
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const f of ["engine", "data", "combat", "spectacle", "ai", "tournament", "roster"])
  require("../js/" + f + ".js");
const { AGE } = G.data;

function champ(id, cls, wins, age, seed) {
  return G.roster.combatChar({ id, name: id, classId: cls, wins, age, personality: G.roster.rollPersonality(G.engine.makeRng(seed)) }, 0.9);
}
console.log("GUI-35 — same 30-win fighter at different ages vs a 30-win, age-30 rival (800 bouts each)");
for (const age of [30, 40, 45, 50, 55]) {
  let w = 0;
  const K = 800;
  for (let k = 0; k < K; k++) {
    const A = champ("A", "fighter", 30, age, k * 3 + 1);
    const B = champ("B", "fighter", 30, 30, k * 7 + 2);
    if (G.tournament.autoBout(A, B, 35000 + k * 2 + 1).winnerId === "A") w++;
  }
  console.log(`  age ${age} (fade ×${AGE.mult(age).toFixed(2)}): wins ${(100 * w / K).toFixed(0)}% vs the age-30 twin`);
}
console.log("Interpretation: veterans stay dangerous into their 40s but fall past 50 —");
console.log("old champions leave the top bands beatable and the threat rotates (as designed).");

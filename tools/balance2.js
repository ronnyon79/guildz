/* balance2.js — test candidate rebalance configs against the sim.
 * Applies tunables via the engine's optional hooks + class-stat overrides,
 * WITHOUT changing the shipped data files. Usage: node tools/balance2.js */
const path = require("path");
const base = path.join(__dirname, "..", "js");
for (const f of ["engine", "data", "combat", "ai"]) require(path.join(base, f + ".js"));
const C = G.combat, AI = G.ai, E = G.engine, D = G.data;

const CLASSES = ["fighter", "thief", "mage"];
const N = 12000, LEVELS = [0, 10, 25, 50], MAX_ROUNDS = 400;

function applyConfig(cfg) {
  // reset to canonical, then apply overrides
  D.CLASSES.thief.melee = "1d6"; D.CLASSES.thief.toHit = 50; delete D.CLASSES.thief.dodge;
  if (cfg.thiefMelee) D.CLASSES.thief.melee = cfg.thiefMelee;
  if (cfg.thiefToHit) D.CLASSES.thief.toHit = cfg.thiefToHit;
  if (cfg.thiefDodge) D.CLASSES.thief.dodge = cfg.thiefDodge;
}
function charAt(cls, wins, cfg) {
  const c = D.CLASSES[cls], pts = 2 * wins;
  let maxHp, maxMp, spellPower = 0;
  if (c.caster) {
    const toHp = Math.round(pts * 0.4); // mage: lean MP (best for it)
    maxHp = c.startHp + toHp; maxMp = c.startMp + (pts - toHp);
    spellPower = Math.round(wins * (cfg.mageSpellPerWin || 0));
  } else { maxHp = c.startHp + pts; maxMp = 0; }
  return { name: cls, classId: cls, wins, maxHp, maxMp, spellPower };
}
function fight(a, b, seed, flip) {
  const you = flip ? b : a, foe = flip ? a : b;
  let st = C.newBattle({ ...you, isPlayer: true }, { ...foe }, seed);
  const dec = E.makeRng(seed ^ 0x9e3779b9); let g = 0;
  while (st.phase === "choose" && g++ < MAX_ROUNDS)
    st = C.resolveRound(st, AI.chooseAction(st.you, st.foe, st.range, dec), AI.chooseAction(st.foe, st.you, st.range, dec));
  return st.phase === "won" ? (flip ? "b" : "a") : st.phase === "lost" ? (flip ? "a" : "b") : "draw";
}
function matchup(A, B, W, cfg) {
  let a = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const r = fight(charAt(A, W, cfg), charAt(B, W, cfg), i * 2654435761 + W * 40503 + 1, i % 2 === 1);
    if (r === "a") a++; n++;
  }
  return 100 * a / n;
}
function report(name, cfg) {
  applyConfig(cfg);
  console.log(`\n######## ${name} ########`);
  for (const W of LEVELS) {
    const ov = {}; CLASSES.forEach((c) => (ov[c] = { w: 0, n: 0 }));
    let line = `  W${String(W).padEnd(2)} `;
    for (const A of CLASSES) for (const B of CLASSES) {
      if (A === B) continue;
      const p = matchup(A, B, W, cfg);
      ov[A].w += p; ov[A].n += 1;
    }
    console.log(line + CLASSES.map((c) => `${c} ${(ov[c].w / ov[c].n).toFixed(1)}%`).join("   "));
  }
}

report("BASELINE (canonical — hooks off)", {});
report("CANDIDATE: Thief 1d8 melee + Mage spellPower floor(wins*0.5)", { thiefMelee: "1d8", mageSpellPerWin: 0.5 });
report("CANDIDATE-2: Thief 1d8 + 12% dodge, Mage spellPower wins*0.6", { thiefMelee: "1d8", thiefDodge: 0.12, mageSpellPerWin: 0.6 });

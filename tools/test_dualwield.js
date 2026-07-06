/* GUI-44: dual wield is MELEE-ONLY — two blades in hand, not two bows. */
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster"])
  require("../js/" + f + ".js");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL " + name); }
}
// A 25-win thief (dual wield perk) vs a tough dummy, at both ranges.
const thief = { id: "t", name: "T", classId: "thief", wins: 25, maxHp: 75, maxMp: 0, meleeWeapon: "one_handed_sword", missileWeapon: "long_bow", items: {}, arrows: [], activeArrow: "normal", armor: null, armorDurability: 0 };
const dummy = { id: "d", name: "D", classId: "fighter", wins: 60, maxHp: 500, maxMp: 0, meleeWeapon: "two_handed_sword", missileWeapon: "short_bow", items: {}, arrows: [], activeArrow: "normal", armor: null, armorDurability: 0 };
function hits(range, rounds) {
  let b = G.combat.newBattle(thief, dummy, 4444, range);
  const out = [];
  for (let r = 0; r < rounds && b.phase === "choose"; r++) {
    const before = b.log.length;
    b = G.combat.resolveRound(b, "attack", "move"); // dummy walks, flipping range…
    b = G.combat.resolveRound(b, "attack", "move"); // …and back, so we sample both orders
    out.push(...b.log.slice(before).filter((e) => e.t === "hit" && e.who === "T"));
  }
  return out;
}
ok(G.combat.makeFighter(thief).weapons === 2, "a 25-win thief has the dual-wield perk");
// Force pure ranges via fresh battles + attack/attack (no movement).
function pureHits(openRange) {
  let b = G.combat.newBattle(thief, dummy, 5555, openRange);
  const res = [];
  for (let r = 0; r < 30 && b.phase === "choose"; r++) {
    b = G.combat.resolveRound(b, "attack", "attack");
    for (const e of b.log) if (e.t === "hit" && e.who === "T") res.push(e);
    b.log.length = 0;
  }
  return res;
}
const meleeHits = pureHits("melee");
const missileHits = pureHits("missile");
ok(meleeHits.length > 3 && meleeHits.every((e) => e.dual === true), "in melee, every landed hit is a dual strike");
ok(missileHits.length > 3 && missileHits.every((e) => !e.dual), "at missile range, NO shot is dual — you can't dual-wield a longbow");
const maxShot = Math.max(...missileHits.filter((e) => !e.crit).map((e) => e.dmg));
ok(maxShot <= 8, `a non-crit longbow shot caps at the single 1d8 (saw ${maxShot})`);
// The buttons agree.
const f = G.combat.makeFighter(thief);
const meleeBtn = G.combat.actionsFor(f, "melee").find((a) => a.id === "attack");
const missileBtn = G.combat.actionsFor(f, "missile").find((a) => a.id === "attack");
ok(/⚔️×2/.test(meleeBtn.desc) && !/⚔️×2/.test(missileBtn.desc), "the ⚔️×2 tag shows on Strike, not on Shoot");

/* GUI-57: flurry strikes are tagged and labelled. */
{
  const f25 = { id: "f", name: "F", classId: "fighter", wins: 25, maxHp: 200, maxMp: 0, meleeWeapon: "two_handed_sword", missileWeapon: "short_bow", items: {}, arrows: [], activeArrow: "normal", armor: null, armorDurability: 0 };
  const wall = { id: "w", name: "W", classId: "cleric", wins: 60, maxHp: 500, maxMp: 0, meleeWeapon: "mace", missileWeapon: "sling", items: {}, arrows: [], activeArrow: "normal", armor: null, armorDurability: 0 };
  ok(G.combat.makeFighter(f25).attacks === 2, "a 25-win fighter swings twice");
  let b = G.combat.newBattle(f25, wall, 6767, "melee");
  let tagged = [], guard = 0;
  while (guard++ < 40 && tagged.length < 6) {
    b = G.combat.resolveRound(b, "attack", "move");
    tagged = b.log.filter((e) => ["hit", "miss", "critmiss", "evade", "dodge"].includes(e.t) && e.who === "F" || (e.t === "evade" && e.by === "F"));
  }
  const flurried = b.log.filter((e) => e.strikes === 2);
  ok(flurried.length >= 4, `flurry events carry strike tags (${flurried.length})`);
  ok(flurried.some((e) => e.strike === 1) && flurried.some((e) => e.strike === 2), "…numbered 1st and 2nd");
  const solo = { ...f25, wins: 5 }; // no perk: single strikes stay untagged
  let b2 = G.combat.newBattle(solo, wall, 6868, "melee");
  b2 = G.combat.resolveRound(b2, "attack", "move");
  ok(b2.log.filter((e) => e.t === "hit" || e.t === "miss").every((e) => !e.strikes), "single attacks carry no strike label");
}
console.log(`(with GUI-57) ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

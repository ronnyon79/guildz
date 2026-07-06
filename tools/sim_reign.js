/* GUI-31: reign-length study. NPC-only worlds with full politics — fame,
 * ambition-gated challenges, the servant GAUNTLET (cap, replenish), regime
 * change, aging, churn. Measures completed-reign lengths per configuration.
 * Run: node tools/sim_reign.js
 */
const store = {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
for (const f of ["engine", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen"])
  require("../js/" + f + ".js");

const { POPULARITY, SEASON, AGE, CLASSES, ARMOR } = G.data;
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function lordChar(L) {
  const c = CLASSES[L.classId];
  const pools = G.ai.maxPools(L.classId, L.wins, 0.6);
  const fade = AGE.mult(L.age);
  const armor = G.ai.bestAffordableArmor(L.classId, G.data.totalGoldAt(L.wins));
  return {
    id: "lord", name: L.name, classId: L.classId, wins: L.wins,
    maxHp: Math.max(1, Math.round(pools.maxHp * fade)), maxMp: Math.round(pools.maxMp * fade),
    meleeWeapon: c.startEq.melee, missileWeapon: c.startEq.missile,
    items: {}, arrows: [], activeArrow: "normal",
    armor, armorDurability: armor ? ARMOR[armor].durability : 0,
    personality: L.personality || null, isPlayer: false,
  };
}

function simWorld(seed, cfg, seasons) {
  const rng = G.engine.makeRng(seed >>> 0);
  const npcs = G.roster.generateRoster(seed, "SIM");
  let lord = { name: "First Lord", classId: G.engine.pick(rng, Object.keys(CLASSES)), wins: 50, reignSeasons: 0, age: 38, personality: G.roster.rollPersonality(rng) };
  let household = [];
  const reigns = [];
  for (let season = 1; season <= seasons; season++) {
    for (let day = 1; day <= SEASON.days; day++) {
      const chars = npcs.map((n) => G.roster.combatChar(n, 0.9));
      const dayState = G.tournament.runDay(chars, G.engine.randInt(rng, 1, 0x7fffffff), (br, m, res, w) => {
        const n = npcs.find((x) => x.id === w.id);
        if (n) n.wins += 1;
      });
      for (const br of dayState.brackets) {
        if (!br.winner) continue;
        const gain = G.spectacle.fameFor(br.matches, br.winner, POPULARITY.perBout(br.band), POPULARITY.specMult);
        const n = npcs.find((x) => x.id === br.winner);
        if (n) n.popularity = (n.popularity || 0) + gain;
      }
    }
    // season close: the boldest famous resident challenges
    const ladder = npcs.slice().sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || b.wins - a.wins);
    const bold = ladder.slice(0, 3).find((r) => (r.popularity || 0) > 0 && (!r.personality || r.personality.amb >= 0.3));
    if (bold) {
      const ch = G.roster.combatChar(bold, 0.9);
      let chHp = ch.maxHp, chMp = ch.maxMp, stopped = false;
      // the gauntlet
      const order = household.slice().sort((a, b) => b.wins - a.wins).slice(0, cfg.cap);
      for (const servant of order) {
        const worn = { ...ch, startHp: chHp, startMp: chMp };
        const sChar = G.roster.combatChar(servant, 1);
        const seed2 = G.engine.randInt(rng, 1, 0x7fffffff);
        const res = G.tournament.autoBout(worn, sChar, seed2);
        if (res.winnerId === sChar.id) { stopped = true; servant.wins += 1; break; }
        household = household.filter((s) => s.id !== servant.id); // servant dies
        const after = G.tournament.replayBout(worn, sChar, seed2);
        const side = after.you.name === ch.name ? after.you : after.foe;
        chHp = Math.min(ch.maxHp, Math.round(side.hp + ch.maxHp * cfg.rep));
        chMp = Math.min(ch.maxMp, Math.round(side.mp + ch.maxMp * cfg.rep));
      }
      const fate = (npc, r) => { // challenger beaten
        npcs.splice(npcs.findIndex((x) => x.id === npc.id), 1);
        const kneel = 0.2 + 0.6 * ((npc.personality || {}).loy != null ? npc.personality.loy : 0.5);
        if (r < kneel && household.length < cfg.cap) household.push({ id: npc.id, name: npc.name, classId: npc.classId, wins: npc.wins, age: npc.age, personality: npc.personality });
      };
      if (stopped) fate(bold, rng());
      else {
        const worn = { ...ch, startHp: chHp, startMp: chMp };
        const res = G.tournament.autoBout(lordChar(lord), worn, G.engine.randInt(rng, 1, 0x7fffffff));
        if (res.winnerId === bold.id) {
          reigns.push(lord.reignSeasons + 1);
          for (const s of household) npcs.push({ id: s.id, name: s.name, classId: s.classId, wins: s.wins, popularity: 0, age: s.age, personality: s.personality });
          household = [];
          npcs.splice(npcs.findIndex((x) => x.id === bold.id), 1);
          lord = { name: bold.name, classId: bold.classId, wins: bold.wins + 1, reignSeasons: 0, age: bold.age, personality: bold.personality };
        } else { lord.wins += 1; fate(bold, rng()); }
      }
    }
    // decay, aging, churn, old age
    for (const n of npcs) { n.popularity = Math.round((n.popularity || 0) / 2); n.age = (n.age || AGE.start) + 1; }
    for (const h of household) h.age += 1;
    lord.age += 1; lord.reignSeasons += 1;
    if (lord.age >= AGE.lifespan + (hash(lord.name) % 12)) {
      reigns.push(lord.reignSeasons);
      const heir = npcs.slice().sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
      for (const s of household) npcs.push({ id: s.id, name: s.name, classId: s.classId, wins: s.wins, popularity: 0, age: s.age, personality: s.personality });
      household = [];
      npcs.splice(npcs.indexOf(heir), 1);
      lord = { name: heir.name, classId: heir.classId, wins: heir.wins, reignSeasons: 0, age: heir.age, personality: heir.personality };
    }
    const retiring = npcs.filter((n) => n.age >= AGE.retire + (hash(n.id) % 12));
    if (retiring.length) {
      for (const r of retiring) npcs.splice(npcs.indexOf(r), 1);
      const fresh = G.roster.generateRoster(((seed >>> 0) ^ (season * 97)) >>> 0, "SIM", retiring.length, "r" + season + "_");
      for (const f of fresh) { f.wins = Math.min(f.wins, 4); f.age = AGE.start + (hash(f.id) % 4); npcs.push(f); }
    }
  }
  return { reigns, householdEnd: household.length };
}

console.log("GUI-31 — reign lengths over 40 seasons × 6 worlds per config");
console.log("cfg (cap, replenish) | completed reigns | mean | median | max | %≥5");
for (const cfg of [
  { cap: 0, rep: 0.5, label: "no household (history era)" },
  { cap: 1, rep: 0.5, label: "1 servant" },
  { cap: 3, rep: 0.5, label: "3 servants, 50% (DESIGNED)" },
  { cap: 3, rep: 0.25, label: "3 servants, 25% replenish" },
  { cap: 3, rep: 0.75, label: "3 servants, 75% replenish" },
]) {
  let all = [];
  for (let w = 0; w < 6; w++) {
    const { reigns } = simWorld(31000 + w * 17, cfg, 40);
    all = all.concat(reigns);
  }
  all.sort((a, b) => a - b);
  const mean = (all.reduce((s, x) => s + x, 0) / all.length).toFixed(1);
  const med = all[(all.length / 2) | 0];
  const pct5 = ((100 * all.filter((x) => x >= 5).length) / all.length).toFixed(0);
  console.log(`  cap ${cfg.cap}, rep ${cfg.rep} (${cfg.label}): n=${all.length} | mean ${mean} | med ${med} | max ${all[all.length - 1]} | ${pct5}% ≥5 seasons`);
}

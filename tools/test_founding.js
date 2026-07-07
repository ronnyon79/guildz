/* test_founding.js — GUI-86: the founding is rolled FIRST, history on top.
 * Chronicle, lords line and worldgen must agree about how the hold began. */
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"]) require("/workspace/Guildz/js/" + f + ".js");

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const C = () => S.chronicle || [];

console.log("— a world born today: the founder sits the throne —");
G.data.WORLDGEN.seasons = 0;
game.createCharacter("fighter", "Witness", 616161);
ok(!!S.stronghold.archetype && !!G.data.ARCHETYPES[S.stronghold.archetype], "the hold has a founding archetype");
ok(S.stronghold.archetype !== "spite", "the Exile's Spite never rolls at world-gen");
ok(!!S.stronghold.founder && S.stronghold.founder.name === S.lord.name, "with no history, the reigning Lord IS the founder");
ok(S.lord.wins >= G.data.LORD.wins[0] && S.lord.wins <= G.data.LORD.wins[1], "the founder is a veteran of legend (LORD.wins range)");
ok(S.lord.reignSeasons === 0, "reignSeasons counts real years now (no backstory padding)");
ok(C()[0].type === "founding" && C()[0].text.includes(S.stronghold.founder.name), "page one names the founder");
ok(C()[0].text.includes(G.data.ARCHETYPES[S.stronghold.archetype].line), "…and tells the archetype's story");
ok(C()[0].icon === G.data.ARCHETYPES[S.stronghold.archetype].emoji, "…under the archetype's mark");
ok((C()[0].refs || []).includes(S.stronghold.founder.name), "the founder is a tappable ref");

console.log("— determinism: the same seed remembers the same origin —");
const f1 = { founder: S.stronghold.founder.name, arch: S.stronghold.archetype };
game.resetGame();
game.createCharacter("mage", "Witness II", 616161);
ok(S.stronghold.founder.name === f1.founder && S.stronghold.archetype === f1.arch, "same worldSeed → same founder + archetype");

console.log("— history on top: chronicle and lords line agree —");
G.data.WORLDGEN.seasons = 3;
let coherent = 0, usurpedWorlds = 0, checked = 0;
for (let seed = 1; seed <= 6; seed++) {
  game.resetGame();
  game.createCharacter("thief", "Prober", 9900 + seed);
  checked++;
  const regimes = C().filter((e) => e.type === "regime" && e.text.includes("stormed the keep"));
  if (regimes.length) {
    usurpedWorlds++;
    const last = regimes[regimes.length - 1];
    if ((last.refs || [])[0] === S.lord.name) coherent++;
  } else if (S.lord.name === S.stronghold.founder.name) coherent++;
  else coherent--; // a successor with no recorded fall = incoherent history
}
ok(coherent === checked, `all ${checked} worlds coherent: the Lord is the founder or the last recorded usurper`);
ok(usurpedWorlds >= 1, `history still has teeth (${usurpedWorlds}/6 thrones fell, chronicled)`);
ok(C().every((e) => e.type !== "regime" || (e.y >= 1 && e.y <= 3)), "history's regime entries are dated within the pre-sim years");
ok(C()[0].y === 1 && C()[0].d === 1, "the founding stays page one, Year 1 Day 1");

console.log("— pre-GUI-86 saves retro-gain a coherent origin —");
const blob = JSON.parse(store["guildz.world." + S.worldId]);
delete blob.stronghold.archetype; delete blob.stronghold.founder;
blob.chronicle = [{ y: 1, d: 1, icon: "🏰", type: "founding", text: "<b>" + blob.stronghold.name + "</b> was founded." }];
store["guildz.world." + S.worldId] = JSON.stringify(blob);
ok(game.load(S.worldId), "an old save loads");
ok(!!S.stronghold.archetype && !!S.stronghold.founder, "…and retro-rolls founder + archetype");
ok(C()[0].refs && C()[0].text.includes(S.stronghold.founder.name), "…the plain founding line is enriched");
const retro = { f: S.stronghold.founder.name, a: S.stronghold.archetype };
store["guildz.world." + S.worldId] = JSON.stringify(blob); // strip again
game.load(S.worldId);
ok(S.stronghold.founder.name === retro.f && S.stronghold.archetype === retro.a, "…deterministically (same world, same memory)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* test_fingerprints.js — GUI-85: every origin leaves ONE permanent mark.
 * Exercised through the migration path (craft a save with a chosen archetype,
 * load, assert the mark) — which also proves old worlds retro-gain theirs. */
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k], get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] };
for (const f of ["engine", "store", "data", "combat", "spectacle", "ai", "tournament", "roster", "worldgen", "game", "lord"]) require("/workspace/Guildz/js/" + f + ".js");
G.data.WORLDGEN.seasons = 0;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const game = G.game, S = game.state;
const FX = G.data.BUILDING_FX;

game.createCharacter("fighter", "Marked One", 858585);
const worldId = S.worldId;
function loadAs(archetype) {
  game.save();
  const blob = JSON.parse(store["guildz.world." + worldId]);
  blob.stronghold.archetype = archetype;
  delete blob.stronghold.fingerprint;
  blob.stronghold.buildings = Object.fromEntries(Object.keys(G.data.BUILDINGS).map((k) => [k, 0]));
  blob.stronghold.treasury = 500;
  store["guildz.world." + worldId] = JSON.stringify(blob);
  return game.load(worldId);
}

console.log("— a fresh world bears its mark from birth —");
ok(S.stronghold.fingerprint === true, "creation applies the fingerprint (guard flag set)");

console.log("— free buildings: the origin built them —");
loadAs("ruin");
ok(S.stronghold.buildings.walls === 1, "🏚️ the Ruin Reclaimed begins with Walls & Gatehouse");
loadAs("crossroads");
ok(S.stronghold.buildings.market === 1, "🛤️ the Crossroads Camp begins with a Marketplace");
loadAs("pilgrim");
ok(S.stronghold.buildings.chapel === 1, "⛪ the Pilgrim's Rest begins with a Chapel");

console.log("— the hoard: once, and only once —");
loadAs("brigand");
ok(S.stronghold.treasury === 500 + FX.archBrigandGold, "⚔️ Brigand's End pockets the hoard (+150)");
game.save(); game.load(worldId);
ok(S.stronghold.treasury === 500 + FX.archBrigandGold, "…reloading does not pay it twice (guard flag)");

console.log("— site traits: origin-only, read live —");
loadAs("quarry");
ok(game.buildCost("seating") === Math.round(G.data.BUILDINGS.seating.costs[0] * (1 - FX.archQuarryDiscount)), "🕳️ the Quarry discounts every raise 10%");
S.player.role = "lord"; S.lord = null; S.stronghold.treasury = 500;
const t0 = S.stronghold.treasury;
game.buyBuilding("yard");
ok(t0 - S.stronghold.treasury === Math.round(G.data.BUILDINGS.yard.costs[0] * 0.9), "…and charges the discounted price");
const day = { brackets: [{ matches: [{ winner: "a", spec: 3, forfeit: false }] }] };
const quarryLedger = G.lord.ledgerFor(day, S);
loadAs("ford");
S.player.role = "lord"; S.lord = null;
const fordLedger = G.lord.ledgerFor(day, S);
ok(fordLedger.gate === quarryLedger.gate + FX.archFordGate, "🌊 the Ford tolls travellers into the gate");
loadAs("hunter");
S.player.role = "lord"; S.lord = null;
const hunterLedger = G.lord.ledgerFor(day, S);
ok(hunterLedger.upkeep === quarryLedger.upkeep - FX.archHunterUpkeep, "🐺 the Hunter's Camp keeps itself a little");

console.log("— spite is recorded, spent later —");
ok(G.data.ARCHETYPES.spite.fx.trait === "spite" && FX.archSpiteCompany === 2, "🔥 the Exile's Spite carries +2 founding company (consumed by the GUI-90 from-scratch start)");

console.log("— free buildings never downgrade a built hold —");
game.save();
const blob = JSON.parse(store["guildz.world." + worldId]);
blob.stronghold.archetype = "ruin";
delete blob.stronghold.fingerprint;
blob.stronghold.buildings.walls = 3;
store["guildz.world." + worldId] = JSON.stringify(blob);
game.load(worldId);
ok(S.stronghold.buildings.walls === 3, "a hold that built walls 3 keeps them (fingerprint only fills empty ground)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

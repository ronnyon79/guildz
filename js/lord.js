/* lord.js — the Lord-mode store (GUI-11). The other chair at the same arena:
 * once crowned you no longer fight the daily brackets — you PRESIDE over them.
 * Drives the identical Day/Season machinery through game.js's shared seam
 * (runDay → settleDay), so a presided day is exactly a champion day minus you.
 *
 * This is the frame: treasury & income (GUI-12), decision knobs (GUI-13), the
 * Scribe's Bulletin Board (GUI-14), buildings (GUI-15) and the servant
 * gauntlet vs NPC challengers (GUI-16) all bolt onto this loop.
 */
(function (root) {
  const G = (root.G = root.G || {});

  /* The day's money (GUI-12): gate + the wager cut + stall licences + sales
   * tax, less purses + upkeep. Attendance follows the SHOW: resident count ×
   * how exciting the fights were (avg ★) × ticket-price demand × purse prestige. */
  function ledgerFor(day, state) {
    const E = G.data.ECONOMY, st = state.stronghold;
    let bouts = 0, specSum = 0, rated = 0;
    for (const br of day.brackets) for (const m of br.matches) {
      if (!m.winner || m.forfeit) continue;
      bouts += 1;
      if (m.spec) { specSum += m.spec; rated += 1; }
    }
    const avgSpec = rated ? specSum / rated : 3;
    const FX = G.data.BUILDING_FX, B = st.buildings || {};
    const seating = (B.seating || 0) * FX.seatingCrowd;
    // Era-1 hooks (GUI-81): the Tavern fills seats, the Royal Box reads the
    // card finer (a ★ bias in the DRAW only — the Scribe's ratings stay honest),
    // the Marketplace adds licence lines and widens the tax base.
    const boxSpec = Math.min(5, avgSpec + (B.royalbox || 0) * FX.royalBoxSpec);
    const attendance = Math.round(
      (E.crowdBase + seating + E.crowdPerResident * state.npcs.length) *
      (boxSpec / 3) * E.demand(st.ticketPrice) * E.prestige(st.purse) *
      (1 + (B.tavern || 0) * FX.tavernCrowd));
    const gate = attendance * st.ticketPrice + (B.royalbox || 0) * FX.royalBoxGate;
    const wagers = Math.round(attendance * (E.wagerStake + (B.tavern || 0) * FX.tavernStake) * E.wagerCut);
    const licences = (G.data.VENDORS.filter((v) => !v.soon).length + (B.market || 0) * FX.marketLicence) * E.licencePerVendor;
    // Poor champions spend less: the tax base shrinks with the very poverty a
    // heavy tax causes (GUI-36 found greedy rates were a degenerate optimum).
    const tax = Math.round(bouts * E.taxSpendPerBout * (1 + (B.market || 0) * FX.marketTax) * G.game.gearScale() * st.taxRate / 100);
    const purses = day.brackets.length * st.purse;
    const net = gate + wagers + licences + tax - purses - E.upkeep;
    return { attendance, avgSpec: Math.round(avgSpec * 10) / 10, gate, wagers, licences, tax, purses, upkeep: E.upkeep, net };
  }

  // Hold the day's games: every band fights, the Lord watches from the high seat.
  function holdGames() {
    const game = G.game, state = game.state;
    if (!state.player || state.player.role !== "lord") return;
    const champs = state.npcs.map((n) => G.roster.combatChar(n, game.gearScale()));
    const byId = {};
    for (const c of champs) byId[c.id] = c;
    const day = G.tournament.runDay(champs, game.nextSeed(), (br, m, res, w) => {
      const n = state.npcs.find((x) => x.id === w.id);
      if (n) n.wins += 1; // every bout won is a career win — the residents grow
      // The Scribe records every bout of the presided games.
      game.recordBout({ band: br.band, round: m.round, a: byId[m.a], b: byId[m.b], winner: w.name, rounds: res.rounds, spec: res.spec, hl: res.hl, seed: m.seed });
    });
    // Training Yard: each level drills one resident a day (+1 win of sparring).
    const yard = ((state.stronghold.buildings || {}).yard || 0);
    if (yard > 0 && state.npcs.length) {
      const rng = G.engine.makeRng(day.seed ^ 0x5eed);
      for (let i = 0; i < yard; i++) G.engine.pick(rng, state.npcs).wins += 1;
    }
    game.settleDay(day, byId, null); // fame, board, clock, season roll
    if (state.lastDay.runEnded) { game.reignEnds(); return; } // died on the throne, undefeated
    const ledger = ledgerFor(day, state);
    state.stronghold.treasury += ledger.net;
    state.lastDay.ledger = ledger;
    // The clerk keeps a running book (GUI-52): last 7 presided days.
    state.ledgerLog = state.ledgerLog || [];
    state.ledgerLog.push({ d: state.clock.day, s: state.clock.season, net: ledger.net, after: state.stronghold.treasury });
    while (state.ledgerLog.length > 7) state.ledgerLog.shift();
    state.screen = "lord-sunset";
    game.save();
    game.emit();
  }

  G.lord = { holdGames, ledgerFor };
})(typeof window !== "undefined" ? window : globalThis);

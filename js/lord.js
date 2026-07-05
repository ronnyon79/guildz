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

  // Hold the day's games: every band fights, the Lord watches from the high seat.
  function holdGames() {
    const game = G.game, state = game.state;
    if (!state.player || state.player.role !== "lord") return;
    const champs = state.npcs.map((n) => G.roster.combatChar(n));
    const byId = {};
    for (const c of champs) byId[c.id] = c;
    const day = G.tournament.runDay(champs, game.nextSeed(), (br, m, res, w) => {
      const n = state.npcs.find((x) => x.id === w.id);
      if (n) n.wins += 1; // every bout won is a career win — the residents grow
    });
    game.settleDay(day, byId, null); // fame, board, clock, season roll
    state.screen = "lord-sunset";
    game.save();
    game.emit();
  }

  G.lord = { holdGames };
})(typeof window !== "undefined" ? window : globalThis);

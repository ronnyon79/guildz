/* spectacle.js — the Crowd Rating (GUI-8). Pure analysis of a finished battle:
 * grade how much ACTION a fight had, from its combat log. Feeds (a) the fame
 * award multiplier now, and (b) gate/wager revenue in Lord mode later.
 *
 * Score events (weights are sim-tunable, GUI-32):
 *   crits +3 · huge blows (≥25% of the target's max HP after soaks) +3 ·
 *   evades/dodges +2 · fumbles +1 · summons/shields +1 · procs (dot/curse/
 *   arrow effects) +1 · shield/armor shattering +1
 * Finish bonuses: comeback +5 (winner healed through ≥80% of their HP in
 * damage) · nail-biter +4 (winner ends ≤25% HP) · rout +4 (≤4 rounds, ≥90% HP).
 * Density = score / rounds → ★1–5 (a short crit-fest beats a long slog).
 */
(function (root) {
  const G = (root.G = root.G || {});

  const WEIGHTS = { crit: 3, hugeBlow: 3, evade: 2, fumble: 1, cast: 1, proc: 1, shatter: 1 };
  const BONUS = { comeback: 5, nailBiter: 4, rout: 4 };
  // Density → stars thresholds. RECALIBRATED for the personality era (GUI-32):
  // temperamental fighters brawl harder, so the bar rose — 2.4k sim bouts with
  // personalities land a bell around 3★ (~10/24/38/20/8%).
  const STARS = [[2.65, 5], [1.5, 4], [0.7, 3], [0.4, 2]];

  /* Rate a finished battle state. `winnerSide` ("you"|"foe") is required when
   * the fight ended on the round cap; otherwise derived from the phase. */
  function rate(b, winnerSide) {
    const side = winnerSide || (b.phase === "won" ? "you"
      : b.phase === "lost" ? "foe"
      : b.you.hp / b.you.maxHp >= b.foe.hp / b.foe.maxHp ? "you" : "foe");
    const winner = b[side];
    const maxOf = (name) => (name === b.you.name ? b.you.maxHp : name === b.foe.name ? b.foe.maxHp : 0);

    let score = 0, dmgToWinner = 0, winnerHealed = false;
    for (const ev of b.log) {
      switch (ev.t) {
        case "hit": case "spell": case "petHit": {
          if (ev.crit) score += WEIGHTS.crit;
          const real = Math.max(0, (ev.dmg || 0) - (ev.absorbed || 0) - (ev.mitigated || 0));
          const tMax = maxOf(ev.target);
          if (tMax && real >= tMax * 0.25) score += WEIGHTS.hugeBlow;
          if (ev.broke || ev.armorBroke) score += WEIGHTS.shatter;
          if (ev.target === winner.name) dmgToWinner += real;
          break;
        }
        case "evade": case "dodge": score += WEIGHTS.evade; break;
        case "critmiss": score += WEIGHTS.fumble; break;
        case "summon": case "summonWeapon": case "shield": score += WEIGHTS.cast; break;
        case "arrowFx": case "applyDot": case "applyCurse": score += WEIGHTS.proc; break;
        case "poison": if (ev.who === winner.name) dmgToWinner += ev.dmg || 0; break;
        case "heal": if (ev.who === winner.name) winnerHealed = true; break;
        case "item": if (ev.who === winner.name && ev.effect === "fullheal") winnerHealed = true; break;
      }
    }

    const rounds = Math.max(1, b.round);
    const finalPct = winner.maxHp ? winner.hp / winner.maxHp : 1;
    const comeback = winnerHealed && dmgToWinner >= winner.maxHp * 0.8;
    const nailBiter = !comeback && finalPct <= 0.25;
    const rout = rounds <= 4 && finalPct >= 0.9;
    if (comeback) score += BONUS.comeback;
    if (nailBiter) score += BONUS.nailBiter;
    if (rout) score += BONUS.rout;

    const density = score / rounds;
    let stars = 1;
    for (const [thr, s] of STARS) if (density >= thr) { stars = s; break; }
    return { stars, score, density: Math.round(density * 100) / 100, comeback, nailBiter, rout };
  }

  /* Fame for a bracket's day-champion: Σ perBoutValue × specMult(spec) over
   * the bouts they won. An unrated bout counts as average (3★); a forfeit
   * walkover is stored as spec 0 → the crowd pays nothing for it. */
  function fameFor(matches, winnerId, perBoutValue, specMult) {
    let total = 0;
    for (const m of matches)
      if (m.winner === winnerId) total += perBoutValue * specMult(m.spec != null ? m.spec : 3);
    return Math.round(total);
  }

  G.spectacle = { rate, fameFor, WEIGHTS, BONUS };
})(typeof window !== "undefined" ? window : globalThis);

/* ui.js — rendering + input only. Reads game state, writes DOM, turns taps into
 * game actions. Contains ZERO game rules. Swappable without touching logic. */
(function (root) {
  const G = (root.G = root.G || {});
  const { CLASSES, WEAPONS, VENDORS, ITEMS, ARROWS, ARMOR, ARMOR_MAXTIER } = G.data;
  const game = G.game;

  const app = document.getElementById("app");
  const ui = { selectedClass: "fighter", shownLog: 0 };

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pctOf = (cur, max) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

  function bar(kind, cur, max) {
    if (max <= 0 && kind === "mp") return ""; // no MP bar for non-casters
    return `<div class="bar ${kind}"><i style="width:${pctOf(cur, max)}%"></i><span>${Math.max(0, Math.round(cur))}/${Math.round(max)}</span></div>`;
  }

  // Class combat stat summary line.
  function classStats(classId) {
    const c = CLASSES[classId];
    const cast = c.caster ? ` · 🎯 Cast <b>${c.toCast}%</b>` : "";
    const evade = c.evade ? ` · 💨 Evade <b>${Math.round(((21 - c.evade) / 20) * 100)}%</b>` : "";
    return `<div class="statline">
      <span>✊ Hit <b>${c.toHit}%</b></span><span>💥 Crit <b>${c.toCrit}%</b></span>${cast}${evade}
      <span>⚔️ Melee <b>${c.melee}</b></span><span>🏹 Missile <b>${c.missile}</b></span>
    </div>`;
  }

  // Crowd Rating: ★★★☆☆ + the crowd's verdict.
  const starsOf = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const CROWD_VERDICT = [
    "", // 0 = walkover, never shown
    "The crowd murmurs — a dull affair.",
    "A scattering of polite applause.",
    "A solid showing — the stands approve.",
    "The crowd roars!",
    "The crowd is ECSTATIC — they'll sing of this bout for seasons!",
  ];
  function crowdBlock(spec) {
    if (!spec || !spec.stars) return "";
    const beats = [spec.comeback ? "a legendary comeback" : "", spec.nailBiter ? "a nail-biter" : "", spec.rout ? "a ruthless rout" : ""].filter(Boolean);
    return `<p class="muted">Crowd: <b>${starsOf(spec.stars)}</b> — ${CROWD_VERDICT[spec.stars]}${beats.length ? ` <span class="pill">${beats.join(" · ")}</span>` : ""}</p>`;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ---------- top bar / nav ----------
  function topbar(p) {
    const lord = p && p.role === "lord";
    const st = game.state.stronghold;
    return `<div class="topbar">
      <div class="brand">⚔️ Guildz</div>
      <div class="resources">
        ${lord && st ? `<span class="res">🏛️ <b>${st.treasury}</b></span>` : ""}
        <span class="res">🪙 <b>${p ? p.gold : 0}</b></span>
        <span class="res">🏅 <b>${p ? p.wins : 0}</b></span>
        <span class="res">⭐ <b>${p ? p.popularity || 0 : 0}</b></span>
      </div>
    </div>`;
  }
  function tabbar(active) {
    const tabs = [["home", "🏟️", "Arena"], ["fame", "⭐", "Fame"], ["board", "📜", "Board"], ["shop", "🛒", "Shop"], ["hero", "🛡️", "Hero"]];
    return `<nav class="tabbar">${tabs
      .map(([id, ic, label]) => `<button class="tab ${active === id ? "is-active" : ""}" data-act="tab" data-arg="${id}">${ic}<span>${label}</span></button>`)
      .join("")}</nav>`;
  }

  // ---------- screens ----------
  function screenTitle() {
    const worlds = game.listWorlds();
    const roleBadge = (w) => (w.role === "lord" ? "👑 Lord" : w.role === "servant" ? "🙇 Servant" : "⚔️ Champion");
    const cards = worlds.map((w) => `<div class="card class-card" data-act="load-world" data-arg="${w.id}">
      <div class="card-row"><div class="avatar">${CLASSES[w.classId] ? CLASSES[w.classId].emoji : "⚔️"}</div>
        <div><div class="card-title">${esc(w.name)} <span class="pill">${roleBadge(w)}</span></div>
        <div class="card-sub">${CLASSES[w.classId] ? CLASSES[w.classId].name : ""} · ${w.wins} wins · Season ${w.season}, Day ${w.day}</div></div>
        <div class="spacer"></div>
        <button class="btn sm ghost" data-act="delete-world" data-arg="${w.id}">🗑</button></div></div>`).join("");
    return `<div class="title-wrap">
      <div class="title-logo">⚔️</div>
      <div class="title-name">Guildz</div>
      <div class="title-sub">Arena of champions</div>
      ${worlds.length ? `<div class="screen" style="width:100%;max-width:420px">${cards}</div>` : ""}
      <button class="btn lg ${worlds.length ? "" : "gold"}" data-act="new-character">${worlds.length ? "➕ New World" : "Enter the Arena"}</button>
      ${worlds.length ? `<p class="card-sub center" style="margin-top:8px">Each world is its own universe — its own Stronghold, residents and Lord.</p>` : ""}
    </div>`;
  }

  function screenClassSelect() {
    const cards = Object.values(CLASSES).map((c) => {
      const pools = c.caster ? `${c.startHp} HP / ${c.startMp} MP` : `${c.startHp} HP`;
      return `<div class="card class-card ${ui.selectedClass === c.id ? "sel" : ""}" data-act="pick-class" data-arg="${c.id}">
        <div class="card-row"><div class="avatar">${c.emoji}</div>
          <div><div class="card-title">${c.name} <span class="pill">${pools}</span></div>
          <div class="card-sub">${c.blurb}</div></div></div>
        ${classStats(c.id)}</div>`;
    }).join("");
    return `<div class="screen">
      <div class="screen-title">Choose your class</div>${cards}
      <div class="screen-title">Your name</div>
      <input class="name-input" id="hero-name" maxlength="14" placeholder="Hero" />
      <button class="btn block lg" style="margin-top:14px" data-act="create">Begin</button>
    </div>`;
  }

  // The seat of power: who rules, and — when you've earned it — the challenge.
  function lordBlock(s) {
    const p = s.player;
    if (p.role === "lord") {
      const slots = ((s.stronghold || {}).buildings || {}).barracks || 0;
      const servants = s.household.length
        ? s.household.map((h) => `<div class="card-sub" style="margin-top:4px">${CLASSES[h.classId].emoji} ${esc(h.name)} (${h.wins}w)
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:release" title="Release">🕊️</button>
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:exile" title="Exile">🚪</button>
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:kill" title="Kill">💀</button></div>`).join("")
        : slots ? "empty — beaten challengers may kneel" : "build the Barracks to house defenders";
      const challenge = s.defense && !s.defense.fielded ? `<div class="card" style="border-color:#c0392b">
        <div class="card-title">⚔️ A CHALLENGER COMES</div>
        <div class="card-sub"><b>${esc(s.defense.name)}</b> ended the season as the people's favourite and demands your throne. The challenge cannot be refused — your household fights first, then it is you.</div>
        <button class="btn block lg" style="margin-top:10px" data-act="begin-defense">🛡️ Answer the challenge</button></div>` : "";
      return `<div class="card"><div class="card-row"><div class="avatar">👑</div>
        <div><div class="card-title"><span class="you">${esc(p.name)}</span> <span class="pill on">Lord of the Stronghold</span></div>
        <div class="card-sub">${s.npcs.length} champions fight under your banner.</div>
        <div class="card-sub">🏚️ Household (${s.household.length}/${slots}): ${servants}</div></div></div></div>` + challenge;
    }
    const L = s.lord;
    if (!L) return "";
    const fielded = p.role === "servant" && s.defense && s.defense.fielded ? `<div class="card" style="border-color:#c0392b">
      <div class="card-title">🛡️ YOUR LORD FIELDS YOU</div>
      <div class="card-sub"><b>${esc(s.defense.name)}</b> has come for Lord ${esc(L.name)}'s throne — and you are the household. Win, and you grow. Fall, and you die. There is no refusing.</div>
      <button class="btn block lg" style="margin-top:10px" data-act="begin-defense">⚔️ Stand and fight</button></div>` : "";
    const lordCard = fielded + `<div class="card"><div class="card-row"><div class="avatar">👑</div>
      <div><div class="card-title">Lord ${esc(L.name)} <span class="pill">${CLASSES[L.classId].name}</span></div>
      <div class="card-sub">${L.wins}-win champion of old · reigning ${L.reignSeasons} season${L.reignSeasons === 1 ? "" : "s"}${p.role === "servant" ? " · <b>you serve his household</b>" : ""}</div></div></div></div>`;
    if (!s.challengeOpen) return lordCard;
    const uprising = p.role === "servant";
    return lordCard + `<div class="card" style="border-color:#b9a06a">
      <div class="card-title">${uprising ? "🗡️ RISE AGAINST YOUR LORD" : "⚔️ The throne can be YOURS"}</div>
      <div class="card-sub">${uprising
        ? "You top the fame ladder — even in servitude. An uprising is a fight <b>to the death</b>: win and the throne is yours; lose and there is no mercy."
        : `You ended the season as the most famous in the Stronghold. Challenge Lord ${esc(L.name)} for the throne — he'll be fresh, on his own sand, with the crowd at his back. Or enter the day's tournament and let the moment pass.`}</div>
      <button class="btn block lg" style="margin-top:10px" data-act="challenge-lord">${uprising ? "🗡️ Rise — to the death" : "👑 Challenge the Lord"}</button>
    </div>`;
  }

  function screenHome(s) {
    const p = s.player, m = game.computeMax(p);
    const pools = CLASSES[p.classId].caster ? `${m.maxHp} HP · ${m.maxMp} MP` : `${m.maxHp} HP`;
    const rolePill = p.role === "servant" ? ` <span class="pill">🙇 servant</span>` : p.role === "lord" ? ` <span class="pill on">👑 Lord</span>` : "";
    return topbar(p) + `<div class="screen">
      <div class="card">
        <div class="card-row"><div class="avatar">${CLASSES[p.classId].emoji}</div>
          <div><div class="card-title">${esc(p.name)} <span class="pill">${CLASSES[p.classId].name}</span>${rolePill}</div>
          <div class="card-sub">${pools} · ${p.wins} wins · age ${p.age || 18}${(p.age || 18) > 35 ? " 🍂" : ""} · best streak ${p.bestStreak} 🔥</div></div></div>
        ${classStats(p.classId)}
      </div>
      ${lordBlock(s)}
      ${p.role === "lord"
        ? `${decreesBlock(s)}
      ${buildingsBlock(s)}
      <button class="btn block lg gold" data-act="hold-games">👑 Hold the Day's Games</button>
      <p class="card-sub center" style="margin-top:12px"><b>Day ${s.clock.day} · Season ${s.clock.season}</b></p>
      <p class="card-sub center" style="margin-top:6px">Every band fights while you watch from the high seat. Champions earn fame in your arena — and one day, the boldest of them will come for your throne.</p>`
        : `<button class="btn block lg gold" data-act="enter-arena">🌅 Enter the Day's Tournament</button>
      <p class="card-sub center" style="margin-top:12px"><b>Day ${s.clock.day} · Season ${s.clock.season}</b></p>
      <p class="card-sub center" style="margin-top:6px">Each day is a knockout tournament in your win-band (${G.tournament.bandLabel(G.tournament.bandOf(p.wins))}). Every bout won earns gold and stats — lose once and your day ends, but you keep everything. Take the band to be <b>Champion of the Day</b> and earn ⭐ fame — the most famous at season's end may challenge the Lord.</p>`}
    </div>` + tabbar("home");
  }

  // ---------- the day's bracket ----------
  function sunsetBoard(lastDay) {
    if (!lastDay || !lastDay.board || !lastDay.board.length) return "";
    const rows = lastDay.board.map((w) => `<div class="card"><div class="card-row">
      <div class="avatar">${w.classId && CLASSES[w.classId] ? CLASSES[w.classId].emoji : "🏆"}</div>
      <div><div class="card-title">${w.isPlayer ? `<span class="you">${esc(w.name)}</span>` : esc(w.name)} ${w.isPlayer ? '<span class="pill on">you</span>' : ""}</div>
      <div class="card-sub">Band ${w.label} · ${w.boutsWon === 0
        ? `<span class="sys">🕊️ walkover — no challengers in this band</span>`
        : `${w.boutsWon} bout${w.boutsWon === 1 ? "" : "s"} won · <b>+${w.popGain} ⭐</b>`}</div></div></div></div>`).join("");
    let season = "";
    if (lastDay.seasonEnd) {
      const t = lastDay.seasonEnd.top[0];
      // Idle veterans riding out (GUI-60) — announced with the season's turn.
      const gone = (lastDay.departures || []).map((d) => d.reason === "found"
        ? `🐎 <b>${esc(d.name)}</b> (${d.wins}w), with no rival left worth fighting, rides out to raise a banner of their own.`
        : `🌄 <b>${esc(d.name)}</b> (${d.wins}w) leaves the Stronghold to seek adventures beyond the gates.`).join("<br>");
      season = `<div class="levelup">🍂 Season ${lastDay.seasonEnd.season} ends! ${t ? `${t.isPlayer ? "<b>You</b>" : `<b>${esc(t.name)}</b>`} top${t.isPlayer ? "" : "s"} the fame ladder with ⭐ ${t.popularity}.` : ""} All fame fades by half as the new season dawns.${lastDay.mayChallenge ? " <b>👑 The right to challenge the Lord is yours — it awaits you at home.</b>" : ""}${gone ? `<br>${gone}` : ""}</div>`;
    }
    return `<div class="screen-title">🌇 Sunset — champions of the day</div>${rows}${season}`;
  }

  function screenFame(s) {
    const ladder = game.fameLadder();
    const myRank = ladder.findIndex((r) => r.isPlayer) + 1;
    const shown = ladder.slice(0, 10);
    if (myRank > 10) shown.push(ladder[myRank - 1]);
    const rows = shown.map((r) => {
      const rank = ladder.indexOf(r) + 1;
      const npc = r.isPlayer ? null : s.npcs.find((n) => n.id === r.id);
      const temper = npc && npc.personality ? G.data.PERSONALITY.label(npc.personality) : "";
      return `<div class="card"><div class="card-row">
        <div class="avatar">${rank === 1 ? "👑" : CLASSES[r.classId].emoji}</div>
        <div><div class="card-title">#${rank} ${r.isPlayer ? `<span class="you">${esc(r.name)}</span> <span class="pill on">you</span>` : esc(r.name)}${temper ? ` <span class="pill">${temper}</span>` : ""}</div>
        <div class="card-sub">${CLASSES[r.classId].name} · ${r.wins} wins${npc ? ` · age ${npc.age}` : ""}</div></div>
        <div class="spacer"></div><span class="pill">⭐ ${r.popularity}</span></div></div>`;
    }).join("");
    const last = s.lastSeason && s.lastSeason.top[0]
      ? `<p class="card-sub center" style="margin-top:10px">Last season's most famous: <b>${esc(s.lastSeason.top[0].name)}</b> (⭐ ${s.lastSeason.top[0].popularity})</p>` : "";
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">⭐ Fame — Day ${s.clock.day}, Season ${s.clock.season}</div>
      <p class="card-sub center" style="margin-bottom:10px">Day champions earn fame by band and bouts won. Fame fades by half each season — the most famous at season's end may challenge the Lord.</p>
      ${rows}${last}
    </div>` + tabbar("fame");
  }

  function screenBracket(s) {
    const br = s.playerBracket, m = s.pendingBout;
    if (!br) return screenHome(s);
    const name = (id) => game.champName(id);
    const tag = (id) => (id === "player"
      ? `<span class="you"><b>${esc(s.player.name)}</b></span>`
      : esc(name(id)));
    const rounds = [];
    for (let r = 1; r <= br.round; r++) {
      const ms = br.matches.filter((x) => x.round === r);
      if (!ms.length) continue;
      const lines = ms.map((x) => {
        const vs = `${tag(x.a)} <span class="sys">vs</span> ${tag(x.b)}`;
        if (x.winner) return `<div class="card-sub">⚔️ ${vs} — <b>${x.winner === "player" ? `<span class="you">${esc(s.player.name)}</span>` : esc(name(x.winner))}</b> wins${x.forfeit ? " (walkover)" : x.spec ? ` <span class="roll">${starsOf(x.spec)}</span>` : ""}</div>`;
        if (x === m) return `<div class="card-sub">🔥 ${vs} — <b>your bout</b></div>`;
        return `<div class="card-sub">⏳ ${vs}</div>`;
      }).join("");
      const bye = br.byes.filter((b) => b.round === r).map((b) => `<div class="card-sub">🍀 ${tag(b.id)} draws a bye</div>`).join("");
      rounds.push(`<div class="card"><div class="card-title">Round ${r}</div>${lines}${bye}</div>`);
    }
    const alive = br.alive.length;
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">🏟️ Band ${G.tournament.bandLabel(br.band)} — ${br.entrants.length} fighters</div>
      ${rounds.join("")}
      <button class="btn block lg gold" data-act="fight-bout">⚔️ Fight your bout</button>
      <button class="btn ghost block sm" style="margin-top:8px" data-act="retreat">Withdraw (forfeit the day)</button>
      <p class="card-sub center" style="margin-top:10px">${alive} still standing. The other bands fought at dawn — all champions are honoured at sunset.</p>
    </div>`;
  }

  function screenDayChampion(s) {
    const d = s.lastDay || {};
    return `<div class="result win">
      <div class="result-emoji">👑</div>
      <div class="result-title">Champion of the Day!</div>
      <p class="muted">You took Band ${d.bandLabel} — ${d.boutsWon} bout${d.boutsWon === 1 ? "" : "s"} won${d.boutsWon === 0 ? " (a walkover — no challengers)" : ""}.</p>
      ${d.popGain ? `<div class="reward-grid"><div class="reward"><b>+${d.popGain}</b><span>⭐ fame</span></div></div>` : ""}
      ${sunsetBoard(d)}
      <div class="result-actions"><button class="btn block" data-act="return-home">Return home 🌇</button></div>
    </div>`;
  }

  /* ---------- the Scribe's Bulletin Board (GUI-14) ---------- */
  // One parchment row (a single bout on the board).
  function boutRow(s, di, bi, bt) {
    const you = (n) => (n === s.player.name ? `<span class="you">${esc(n)}</span>` : esc(n));
    return `<div class="card class-card" data-act="view-bout" data-arg="${di}:${bi}">
      <div class="card-row"><div class="avatar">${bt.throne ? "👑" : CLASSES[(bt.a || {}).classId] ? CLASSES[bt.a.classId].emoji : "⚔️"}</div>
      <div><div class="card-title" style="font-size:14px">${you(bt.a.name)} <span class="sys">vs</span> ${you(bt.b.name)}${bt.throne ? ' <span class="pill on">THRONE DUEL</span>' : ""}</div>
      <div class="card-sub">🏆 ${you(bt.winner)} · ${bt.rounds} rounds${bt.spec ? ` · ${starsOf(bt.spec)}` : ""}</div></div>
      <div class="spacer"></div><span class="pill">Read →</span></div></div>`;
  }

  /* The board, foldered: each day's parchments hang grouped by BAND (GUI-58) —
   * pick a category, read its reports. Throne & gauntlet pin above the bands. */
  function screenBoard(s) {
    ui.boardOpen = ui.boardOpen || {};
    const days = s.board.slice().reverse(); // newest first
    const body = days.length ? days.map((d, ri) => {
      const di = s.board.length - 1 - ri;
      const groups = new Map();
      d.bouts.forEach((bt, bi) => {
        const key = bt.throne ? "T" : bt.gauntlet ? "G" : String(bt.band != null ? bt.band : "X");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push([bt, bi]);
      });
      const weight = (k) => (k === "T" ? -2 : k === "G" ? -1 : k === "X" ? 999 : parseInt(k, 10));
      const sections = [...groups.keys()].sort((a, b) => weight(a) - weight(b)).map((key) => {
        const items = groups.get(key);
        const label = key === "T" ? "👑 The Throne" : key === "G" ? "🛡️ The Gauntlet"
          : key === "X" ? "⚔️ Other bouts" : `🏟️ Band ${G.tournament.bandLabel(+key)}`;
        const yours = items.some(([bt]) => bt.a.name === s.player.name || bt.b.name === s.player.name);
        const openKey = di + ":" + key;
        const open = !!ui.boardOpen[openKey];
        const head = `<div class="card class-card" data-act="board-band" data-arg="${openKey}">
          <div class="card-row"><div class="avatar">${open ? "📖" : "📜"}</div>
          <div><div class="card-title" style="font-size:14px">${label}${yours ? ' <span class="pill on">you fought here</span>' : ""}</div>
          <div class="card-sub">${items.length} bout${items.length === 1 ? "" : "s"} · tap to ${open ? "fold away" : "read"}</div></div>
          <div class="spacer"></div><span class="pill">${open ? "▾" : "▸"}</span></div></div>`;
        return head + (open ? items.map(([bt, bi]) => boutRow(s, di, bi, bt)).join("") : "");
      }).join("");
      return `<div class="screen-title">📜 Day ${d.day} · Season ${d.season}</div>${sections}`;
    }).join("") : `<p class="card-sub center" style="margin-top:20px">The board is bare — no games have been fought yet. The Scribe waits, quill ready.</p>`;
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">The Bulletin Board</div>
      <p class="card-sub center" style="margin-bottom:10px">The Scribe records every bout, hung by band. Parchments stay pinned for ${G.data.BOARD.days} days.</p>
      ${body}
    </div>` + tabbar("board");
  }

  // A parchment: the full blow-by-blow, re-rendered deterministically from the
  // seed (or the verbatim log for bouts the champion fought in person).
  function screenParchment(s) {
    const v = s.viewBout;
    const rec = v && s.board[v.di] && s.board[v.di].bouts[v.bi];
    if (!rec) return screenBoard(s);
    let b, log;
    if (rec.log) {
      b = { you: rec.youIsA ? rec.a : rec.b, foe: rec.youIsA ? rec.b : rec.a };
      log = rec.log;
    } else {
      b = G.tournament.replayBout(rec.a, rec.b, rec.seed, rec.range); // the Scribe re-reads the seed
      log = b.log;
    }
    const ctx = battleCtx(b, s.player.name);
    const intro = `<p class="line-intro shown">${fill(pickVar(INTRO, rec.seed || 7), {
      A: `<span class="${b.you.name === s.player.name ? "you" : "foe"}">${esc(b.you.name)}</span>`,
      B: `<span class="foe">${esc(b.foe.name)}</span>`,
      bc: CLASSES[b.foe.classId] ? CLASSES[b.foe.classId].name : "",
    })}</p>`;
    // The last damaging strike before the end is THE KILLING BLOW.
    const endIdx = log.findIndex((e) => e.t === "end");
    let killIdx = -1;
    for (let i = (endIdx < 0 ? log.length : endIdx) - 1; i >= 0; i--) {
      if (["hit", "spell", "petHit", "poison"].includes(log[i].t) && (log[i].dmg || 0) > 0) { killIdx = i; break; }
    }
    const lines = log.map((ev, i) => narrate(ev, i, ctx, false, i === killIdx)).join("");
    return topbar(s.player) + `<div class="screen">
      <button class="btn ghost sm" data-act="tab" data-arg="board" style="margin:4px 0 10px">← The board</button>
      <div class="screen-title">${rec.throne ? "👑 The Throne Duel" : "⚔️ " + esc(rec.a.name) + " vs " + esc(rec.b.name)}</div>
      <p class="card-sub center">🏆 ${esc(rec.winner)} · ${rec.rounds} rounds${rec.spec ? ` · ${starsOf(rec.spec)}` : ""}</p>
      <div class="log" style="max-height:none">${intro}${lines}</div>
      <p class="card-sub center" style="margin-top:8px">— faithfully recorded by the Scribe 🖋️</p>
    </div>`;
  }

  // The Lord's decrees (GUI-13): the knobs of the realm.
  function decreesBlock(s) {
    const st = s.stronghold;
    if (!st) return "";
    const row = (key, emoji, label, unit, hint) => `<div class="card-row" style="margin-top:6px">
      <div style="flex:1"><div class="card-title" style="font-size:14px">${emoji} ${label}: <b>${st[key]}${unit}</b></div>
      <div class="card-sub">${hint}</div></div>
      <button class="btn sm ghost" data-act="decree" data-arg="${key}:-1">−</button>
      <button class="btn sm" data-act="decree" data-arg="${key}:1" style="margin-left:6px">+</button></div>`;
    return `<div class="card"><div class="card-title">📜 Decrees</div>
      ${row("ticketPrice", "🎫", "Ticket price", "g", "Steeper tickets thin the crowd.")}
      ${row("taxRate", "🧾", "Sales tax", "%", "Heavy taxes leave champions poorly geared — and the fights duller.")}
      ${row("purse", "🏆", "Band purse", "g", "Fat purses draw crowds — and drain the coffers.")}
    </div>`;
  }

  // Stronghold buildings (GUI-15): level the arena, and it serves its Lord.
  function buildingsBlock(s) {
    const st = s.stronghold;
    if (!st || !st.buildings) return "";
    const rows = Object.entries(G.data.BUILDINGS).map(([id, def]) => {
      const lvl = st.buildings[id] || 0;
      const maxed = lvl >= def.max;
      const cost = maxed ? null : def.costs[lvl];
      const afford = cost != null && st.treasury >= cost;
      return `<div class="card-row" style="margin-top:6px">
        <div style="flex:1"><div class="card-title" style="font-size:14px">${def.emoji} ${def.name} <span class="pill">${"▮".repeat(lvl)}${"▯".repeat(def.max - lvl)}</span></div>
        <div class="card-sub">${def.desc}</div></div>
        ${maxed ? `<span class="pill on">MAX</span>` : `<button class="btn sm gold" data-act="build" data-arg="${id}" ${afford ? "" : "disabled"}>🏛️ ${cost}</button>`}</div>`;
    }).join("");
    return `<div class="card"><div class="card-title">🏗️ The Stronghold</div>${rows}</div>`;
  }

  // The Lord's view of a finished day: the games he presided over.
  function screenLordSunset(s) {
    const d = s.lastDay || {};
    let seasonNote = "";
    if (d.seasonEnd) {
      const t = d.seasonEnd.top[0];
      seasonNote = `<div class="levelup">🍂 Season ${d.seasonEnd.season} closes under your reign. ${t ? `<b>${esc(t.name)}</b> is the people's favourite (⭐ ${t.popularity}).` : ""} None dare challenge you… yet.</div>`;
    }
    const L = d.ledger;
    const money = L ? `<div class="card"><div class="card-title">🏛️ The day's ledger <span class="pill">${L.attendance} spectators · avg ${L.avgSpec}★</span></div>
      <div class="card-sub">🎫 Gate ${L.gate} · 🎲 Wagers ${L.wagers} · 🏪 Licences ${L.licences} · 🧾 Tax ${L.tax}</div>
      <div class="card-sub">🏆 Purses −${L.purses} · 🏗️ Upkeep −${L.upkeep}</div>
      <div class="card-title" style="margin-top:6px">${L.net >= 0 ? "Net +" : "Net "}${L.net} 🪙 → treasury <b>${s.stronghold.treasury}</b>${s.stronghold.treasury < 0 ? ' <span class="pill">⚠️ the coffers run dry</span>' : ""}</div>
    </div>` : "";
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">👑 The games conclude — Day ${d.seasonEnd ? G.data.SEASON.days : s.clock.day - 1}, Season ${d.seasonEnd ? d.seasonEnd.season : s.clock.season}</div>
      ${money}
      ${sunsetBoard(d)}
      ${seasonNote}
      <button class="btn block lg" data-act="return-home">To the high seat</button>
    </div>`;
  }

  /* ---------- the throne DEFENCE (GUI-16/41/43) ---------- */
  function screenDefensePrep(s) {
    const run = s.defenseRun, d = s.defense;
    if (!run || !d) return screenHome(s);
    const npc = s.npcs.find((n) => n.id === d.challengerId) || { name: d.name };
    const bouts = run.bouts.map((b) => `<div class="card-sub">${b.result === "fell"
      ? `☠️ ${esc(b.servant)} fell to ${esc(b.challenger)}`
      : `🛡️ ${esc(b.servant)} stopped ${esc(b.challenger)}`}${b.spec ? ` ${starsOf(b.spec)}` : ""}</div>`).join("");
    const ch = G.roster.combatChar(npc, game.gearScale());
    const wornPct = Math.round((run.chHp / ch.maxHp) * 100);
    ui.defPerk = ui.defPerk || "none";
    ui.defRange = ui.defRange || "missile";
    const perks = game.defensePerks().map((pk) => `<div class="card class-card ${ui.defPerk === pk.id ? "sel" : ""}" data-act="def-perk" data-arg="${pk.id}" style="${pk.ok ? "" : "opacity:.45"}">
      <div class="card-row"><div class="avatar">${pk.emoji}</div>
      <div><div class="card-title" style="font-size:14px">${pk.name} ${pk.ok ? "" : `<span class="pill">${pk.why}</span>`}</div>
      <div class="card-sub">${pk.desc}</div></div></div></div>`).join("");
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">⚔️ The challenger stands before you</div>
      ${bouts ? `<div class="card"><div class="card-title">The gauntlet</div>${bouts}</div>` : `<p class="card-sub center">You have no household — ${esc(npc.name)} comes to you untouched.</p>`}
      <div class="card"><div class="card-row"><div class="avatar">${CLASSES[ch.classId].emoji}</div>
        <div><div class="card-title">${esc(npc.name)} <span class="pill">${CLASSES[ch.classId].name} · ${ch.wins}w</span></div>
        <div class="card-sub">Worn to <b>${wornPct}%</b> — the gauntlet takes its toll. You fight FRESH, on your own sand.</div></div></div></div>
      <div class="screen-title">Choose the ground</div>
      <div class="alloc-row">
        <button class="btn sm ${ui.defRange === "missile" ? "" : "ghost"}" data-act="def-range" data-arg="missile">🏹 Open at missile</button>
        <button class="btn sm ${ui.defRange === "melee" ? "" : "ghost"}" data-act="def-range" data-arg="melee">⚔️ Open at melee</button>
      </div>
      <div class="screen-title">One boon of the Stronghold</div>
      <div class="card class-card ${ui.defPerk === "none" ? "sel" : ""}" data-act="def-perk" data-arg="none"><div class="card-row"><div class="avatar">✊</div>
        <div><div class="card-title" style="font-size:14px">No boon</div><div class="card-sub">Steel alone.</div></div></div></div>
      ${perks}
      <button class="btn block lg gold" style="margin-top:10px" data-act="start-defense">🛡️ Defend the throne</button>
    </div>`;
  }

  function screenDefended(s) {
    const d = s.lastDefense || {};
    const fate = d.fate === "serve" ? `${esc(d.challenger)} <b>kneels</b> — they join your household.`
      : d.fate === "exile" ? `${esc(d.challenger)} limps out of the gates, never to return.`
      : `${esc(d.challenger)} dies on the sand.`;
    return `<div class="result win">
      <div class="result-emoji">🛡️</div>
      <div class="result-title">The throne holds</div>
      ${d.byServant ? `<p class="muted"><b>${esc(d.byServant)}</b> of your household stopped the challenger — you never had to rise.</p>` : d.fielded ? `<p class="muted">You held your Lord's throne — and grew for it (+1 win).</p>` : `<p class="muted">You met ${esc(d.challenger)} yourself and put them down (+1 win).</p>`}
      ${crowdBlock(s.lastSpec)}
      <p class="muted">${d.fielded ? `${esc(d.challenger)} is dragged from the sand.` : fate}</p>
      <div class="result-actions"><button class="btn block" data-act="return-home">${d.fielded ? "Back to the household" : "To the high seat 👑"}</button></div>
    </div>`;
  }

  // ---------- the throne (GUI-9 / GUI-10) ----------
  function screenCoronation(s) {
    const t = s.lastThrone || {};
    return `<div class="result win">
      <div class="result-emoji">👑</div>
      <div class="result-title">CORONATION</div>
      <p class="muted">${t.oldAge ? `Old Lord ${esc(t.lordName)} has died on the throne, undefeated to the last. The crowd calls one name —` : t.uprising ? "The uprising succeeds — the household kneels to its new master." : "The crowd falls silent, then erupts —"} <b><span class="you">${esc(s.player.name)}</span>, Lord of the Stronghold!</b></p>
      ${crowdBlock(s.lastSpec)}
      ${t.oldAge ? "" : `<p class="muted">${esc(t.lordName)} ${t.lordStays
        ? "swallows his pride and stays — the fallen Lord will fight in <b>your</b> arena."
        : "rides out of the gates, never to return."}</p>`}
      <p class="card-sub center">The high seat is yours: preside over the games, set the decrees, raise the Stronghold — and hold the throne against those who will come for it.</p>
      <div class="result-actions"><button class="btn block" data-act="return-home">To the high seat 👑</button></div>
    </div>`;
  }

  function screenThroneFate(s) {
    const t = s.lastThrone || {};
    return `<div class="result loss">
      <div class="result-emoji">⚖️</div>
      <div class="result-title">${t.deposed ? "Your throne is taken" : "The Lord stands over you"}</div>
      ${crowdBlock(s.lastSpec)}
      <p class="muted">${t.deposed
        ? `${esc(t.lordName)} takes the high seat that was yours, frees your household — and offers the fallen Lord the same mercy you once received. Choose your fate:`
        : `Lord ${esc(t.lordName)} lowers his blade and offers you a choice. Choose your fate:`}</p>
      <div class="card class-card" data-act="fate" data-arg="serve"><div class="card-row"><div class="avatar">🙇</div>
        <div><div class="card-title">Serve</div><div class="card-sub">Join his household. Keep fighting the daily brackets in his service — top the fame ladder again and you may <b>rise against him, to the death</b>.</div></div></div></div>
      <div class="card class-card" data-act="fate" data-arg="exile"><div class="card-row"><div class="avatar">🚪</div>
        <div><div class="card-title">Exile</div><div class="card-sub"><b>One-way.</b> Walk out of the gates forever. (The wilds — and founding your own Stronghold — arrive with Exile mode; your story ends here for now.)</div></div></div></div>
      <div class="card class-card" data-act="fate" data-arg="die"><div class="card-row"><div class="avatar">💀</div>
        <div><div class="card-title">Die</div><div class="card-sub">Meet the blade with your eyes open. <b>Permanent.</b></div></div></div></div>
    </div>`;
  }

  function screenMemorial(s) {
    const t = s.lastThrone || {};
    return `<div class="result loss">
      <div class="result-emoji">🪦</div>
      <div class="result-title">${t.fate === "uprising" ? "The uprising fails" : t.fate === "defense" ? "Fallen in defence" : t.fate === "throne-age" ? "👑 Died on the throne — UNDEFEATED" : "Here ends the tale"}</div>
      <p class="muted">${t.fate === "uprising"
        ? `A servant who rises gets no second chance. Lord ${esc(t.lordName)} shows no mercy.`
        : t.fate === "defense"
        ? `Fielded for a throne not your own, ${esc((s.player || {}).name || "the servant")} fell to ${esc(t.lordName)} on the sand. A defender gets no choice.`
        : t.fate === "throne-age"
        ? `After <b>${t.reignSeasons || "?"}</b> season${t.reignSeasons === 1 ? "" : "s"} of rule, Lord ${esc((s.player || {}).name || "?")} passes in the high seat at a great age, crown untaken. The rarest of endings — the bards will sing of it for a hundred years.`
        : `${esc((s.player || {}).name || "The champion")} chose to meet the end unbowed.`}</p>
      <p class="card-sub center">The save is gone — as permanent as the grave. The Stronghold will remember.</p>
      <div class="result-actions"><button class="btn block" data-act="reset-hard">⚔️ A new champion rises</button></div>
    </div>`;
  }

  function screenExiled(s) {
    return `<div class="result loss">
      <div class="result-emoji">🚪</div>
      <div class="result-title">Into the wilds</div>
      <p class="muted">The gates close behind ${esc((s.player || {}).name || "you")}. The Stronghold, the crowds, the fame — all of it, behind you now. One day the wilds themselves will be yours to survive… but that story waits for Exile mode.</p>
      <div class="result-actions"><button class="btn block" data-act="reset-hard">⚔️ A new champion rises</button></div>
    </div>`;
  }

  // ---------- battle ----------
  function rangeBanner(range) {
    const melee = range === "melee";
    return `<div class="range-banner ${range}">
      <span class="r-tag ${!melee ? "on" : ""}">🏹 Missile</span>
      <span class="r-dots">${melee ? "🤺 ⚔️" : "•   •"}</span>
      <span class="r-tag ${melee ? "on" : ""}">⚔️ Melee</span>
    </div>`;
  }

  function fighterPanel(f, side) {
    const c = CLASSES[f.classId];
    const poison = f.poison && f.poison.turns > 0 ? ` <span class="poison-tag">☠️ ${f.poison.turns}</span>` : "";
    const curse = f.cursed > 0 ? ` <span class="curse-tag">🕸️ ${f.cursed}</span>` : "";
    const shield = f.shield > 0 ? ` <span class="shield-tag">🛡️ ${f.shield}</span>` : "";
    const hidden = f.autoCritNext ? ` <span class="hidden-tag">🌑 hidden</span>` : "";
    const slowed = f.slowed > 0 ? ` <span class="slow-tag">❄️ ${f.slowed}</span>` : "";
    const armorTag = f.armor && f.armorDurability > 0 ? ` <span class="armor-tag">${ARMOR[f.armor].emoji} DR${f.armorDR}·${f.armorDurability}</span>` : "";
    let pet = "";
    if (f.pet && f.pet.hp !== undefined && f.pet.hp > 0) {
      // Air Elemental — has HP, show a bar.
      pet = `<div class="pet-row"><span class="pet-ava">${f.pet.emoji}</span>
           <div class="pet-bar"><div class="pet-label">${esc(f.pet.name)}</div>${bar("hp", f.pet.hp, f.pet.maxHp)}</div></div>`;
    } else if (f.pet && f.pet.hp === undefined) {
      // Spiritual Weapon — untargetable, no HP bar; show rounds left.
      const dur = f.pet.turns !== undefined ? ` · ${f.pet.turns} rounds` : " · active";
      pet = `<div class="pet-row"><span class="pet-ava">${f.pet.emoji}</span>
           <div class="pet-bar"><div class="pet-label">${esc(f.pet.name)}${dur}</div></div></div>`;
    }
    return `<div class="fighter ${side === "foe" ? "foe-side" : ""}">
      <div class="fighter-top"><div class="avatar">${f.emoji}</div>
        <div><div class="fighter-name">${esc(f.name)}${poison}${curse}${shield}${hidden}${slowed}${armorTag}</div>
          <div class="fighter-meta">${c.name} · ${f.wins} wins</div></div></div>
      <div class="bars">${bar("hp", f.hp, f.maxHp)}${bar("mp", f.mp, f.maxMp)}</div>
      ${pet}
    </div>`;
  }

  /* ---------- combat narration (pure flavor; lives entirely in the UI) ----------
   * Each event is turned into varied, evocative prose. A stable per-line seed
   * picks the phrasing so it doesn't change on re-render, and damage "tiers"
   * escalate the language from a graze to a devastating blow. */
  const MELEE_HIT = [
    ["{A} grazes {T} with a glancing {w}", "{A} nicks {T} with a quick {w}", "{A} barely clips {T}"],
    ["{A} lands a clean {w}-blow on {T}", "{A} cuts into {T}", "{A} drives their {w} home against {T}"],
    ["{A} hammers {T} with a brutal {w}-swing", "{A} cleaves into {T}, staggering them", "{A} batters {T} back a step"],
    ["{A} carves a savage wound across {T}", "{A} crushes {T} with a devastating {w}-blow", "{A} nearly fells {T} in a single stroke"],
  ];
  const MISSILE_HIT = [
    ["{A}'s {w} grazes {T}", "{A} clips {T} from range", "{A}'s shot barely catches {T}"],
    ["{A}'s {w} finds its mark in {T}", "{A} strikes {T} from afar", "{A} lands a shot square on {T}"],
    ["{A}'s {w} slams into {T}", "{A} punches a heavy shot through {T}'s guard", "{A} hits {T} hard from range"],
    ["{A}'s {w} tears into {T} with terrible force", "{A} lands a crippling shot on {T}", "{A}'s {w} very nearly drops {T}"],
  ];
  const CRIT_MELEE = ["A perfect strike! {A} runs {T} through", "{A} finds the gap and lands a critical {w}-blow on {T}", "Critical hit! {A} puts everything into {T}"];
  const CRIT_MISSILE = ["Bullseye! {A}'s {w} strikes a vital spot on {T}", "A critical shot — {A} skewers {T}", "{A}'s {w} lands dead-on against {T}"];
  const MELEE_MISS = ["{A} swings wide and {T} slips away", "{T} turns {A}'s {w} aside", "{A}'s {w} whistles harmlessly past {T}"];
  const MISSILE_MISS = ["{A}'s {w} sails wide of {T}", "{T} ducks under {A}'s shot", "{A} looses a {w} but it goes astray"];
  const CRITMISS = [
    "{A} overcommits and stumbles — <span class='fumble'>CRITICAL MISS!</span>{roll} left reeling for the next round",
    "{A} fumbles badly <span class='fumble'>[!]</span>{roll} and is thrown off balance — stunned next round",
    "{A} loses their footing — <span class='fumble'>a disastrous miss!</span>{roll} they'll lose next turn",
  ];
  const RECOVER = ["{A} scrambles back into stance — turn lost", "{A}, still reeling, can only recover this round", "{A} shakes off the daze, their chance to strike gone"];
  const CHARGE = ["{A} charges in, closing to melee!", "{A} surges forward into striking range", "{A} rushes in — the fight is up close now"];
  const RETREAT = ["{A} disengages, opening the distance", "{A} backpedals out to missile range", "{A} slips away, breaking to range"];
  const SPELL_FLAVOR = {
    "Magic Missile": { hit: ["{A} looses a bolt of pure force that unerringly slams into {T}", "{A}'s Magic Missile streaks across and strikes {T}"], crit: ["{A}'s Magic Missile detonates against {T} — a critical surge!"] },
    "Lightning Bolt": { hit: ["{A} calls down a crackling Lightning Bolt onto {T}", "Arcs of lightning leap from {A} into {T}"], crit: ["A thunderous critical — lightning rips clean through {T}!"] },
    "Fireball": { hit: ["{A} hurls a roaring Fireball that bursts over {T}", "A ball of flame erupts against {T}"], crit: ["The Fireball detonates catastrophically on {T} — critical!"] },
    "Holy Smite": { hit: ["{A} calls down searing radiance upon {T}", "{A} smites {T} with a shaft of holy light"], crit: ["Divine judgment! Radiance scorches {T} — critical!"] },
    "Divine Wrath": { hit: ["{A} unleashes divine wrath on {T}", "A pillar of holy fire crashes down on {T}"], crit: ["The heavens split — a critical strike of divine wrath rends {T}!"] },
  };
  const HEAL = ["a warm light knits {A}'s wounds, restoring {amt}", "{A} channels divine energy and heals {amt}", "holy radiance mends {A} for {amt}"];
  const CURSE = ["{A} lays a dark curse on {T} — their blows will barely land for {turns} rounds", "{A} hexes {T}, sapping their strength to nothing for {turns} rounds", "a shadow falls over {T} as {A}'s curse takes hold ({turns} rounds)"];
  const FIZZLE_FAIL = ["{A}'s {S} sputters and collapses{roll}", "{A} loses the weave — {S} fizzles out{roll}", "{A}'s {S} unravels harmlessly{roll}"];
  const FIZZLE_NOMP = ["{A} grasps for magic but has no MP left", "{A}'s reserves are spent — nothing answers the call"];
  const APPLYDOT = ["{A} conjures a Poison Cloud around {T} — choking fumes cling for {turns} turns", "{A} engulfs {T} in a roiling toxic cloud ({turns} turns)"];
  const POISON = ["{A} chokes as poison eats away {dmg}", "the toxic cloud sears {A} for {dmg}", "venom courses through {A} — {dmg} damage"];
  const SUMMON = ["{A} tears the air open and summons a howling 🌪️ Air Elemental ({hp} HP) to their side!", "winds spiral into form — {A} conjures a 🌪️ Air Elemental ({hp} HP)!"];
  const PETHIT = ["the Air Elemental buffets {T} with a screaming gust for {dmg}", "{A} slams {T} on a howling wind for {dmg}", "a raging vortex tears at {T} for {dmg}"];
  const PETDOWN = ["the Air Elemental unravels into a dying gust", "{A} is torn apart and scatters to the wind"];
  const SHIELD = ["a shimmering 🛡️ Shield of Faith envelops {A} ({amount} HP)", "{A} raises a radiant Shield of Faith ({amount} HP) to absorb the coming blows"];
  const SPIRIT = ["{A} conjures a glowing 🗡️ Spiritual Weapon to strike for {turns} rounds", "a radiant blade winks into being at {A}'s side, striking for {turns} rounds"];
  const SPIRIT_HIT = ["{A} slashes {T} with holy force for {dmg}", "the Spiritual Weapon carves into {T} for {dmg}", "a blade of light strikes {T} for {dmg}"];
  const SPIRIT_MISS = ["the Spiritual Weapon swings at {T} and misses", "{A}'s holy blade glances wide of {T}"];
  const PETEXPIRE = ["{A} flickers out and fades away", "{A} winks out of existence, its purpose served"];
  const PETMOVE = ["{A} streaks toward the foe, closing to melee", "{A} flies in to engage"];
  const ARROW_SLOW = ["frost creeps over {T} — sluggish and off-balance for {turns} rounds", "{T} is chilled to the bone, timing thrown off for {turns} rounds"];
  const ARROW_BURN = ["flames engulf {T}, set to burn for {turns} rounds", "{T} catches fire — burning for {turns} rounds"];
  const INIT = ["{A} reads the moment and moves first", "{A} seizes the initiative", "{A} is quicker off the mark"];
  const ARROW_SWAP = ["{A} nocks {arrow}", "{A} loads {arrow}"];
  const BURN_TICK = ["{A} sears in the flames for {dmg}", "the fire burns {A} for {dmg}"];
  const HIDE_OK = ["{A} melts into the shadows — their next strike will be lethal", "{A} vanishes from sight, poised for a killing blow"];
  const HIDE_FAIL = ["{A} tries to slip into shadow but is spotted", "{A} fails to find cover and stays exposed"];
  const ITEMUSE_LIFE = ["{A} quaffs a {item} and surges back to full health!", "{A} downs a {item} — wounds close and vigour floods back!"];
  const ITEMUSE_MANA = ["{A} drinks a {item} — arcane energy floods back to full!", "{A} downs a {item}, mana surging through their veins!"];
  const DODGE = ["{T} reads it and evades {A} entirely", "{A} strikes only air — {T} dodges clear"];
  const INTRO = [
    "⚔️ {A} squares off against {B} the {bc} — the crowd roars!",
    "⚔️ The bell rings: {A} faces {B} the {bc} across the sand!",
    "⚔️ {A} vs {B} the {bc}. Blades ready at missile range…",
  ];
  const KO_WIN = ["{L} is cut down — {W} stands triumphant!", "{L} falls! Victory to {W}!", "{L} drops to the sand. {W} wins the bout!"];
  const KO_LOSS = ["{L} is struck down — {W} claims the win.", "{L} falls in the dust. {W} stands over them.", "{L} can fight no more. {W} takes the victory."];
  // The fall of a fighter, as the Scribe records it (GUI-45) — pure theatre.
  const DEATH_THEATRE = [
    "{L} sways… totters… and the sand rushes up to meet them. A heartbeat of silence — then the arena ERUPTS. {W} stands alone beneath the roar.",
    "A hush falls over the stands. {L}'s weapon slips from nerveless fingers and rings against the stone. {W} raises both arms as the crowd screams its delight.",
    "{L} drops to one knee, then to the sand — and does not rise. Somewhere the bell tolls. The bout, the day, the glory: all of it belongs to {W}.",
    "{L} crashes down like a felled oak, dust blooming around them. In the stands, fortunes change hands and children climb the railings to see {W} triumphant.",
    "The dust settles slowly. {L} lies where they fell, staring at a sky they no longer see clearly. {W} turns to the crowd, chest heaving, and the Stronghold thunders their name.",
    "{L}'s guard drops at last — the long dance is over. They fold onto the sand almost gently, and the roar that greets {W} shakes birds from the battlements.",
  ];

  const fill = (tpl, map) => tpl.replace(/\{(\w+)\}/g, (_, k) => (map[k] != null ? map[k] : ""));
  const dmgTier = (d) => (d <= 3 ? 0 : d <= 7 ? 1 : d <= 13 ? 2 : 3);
  const pickVar = (arr, seed) => arr[((seed % arr.length) + arr.length) % arr.length];
  // A note about a Shield of Faith soaking / shattering under a hit.
  function shieldNote(ev) {
    if (!ev.absorbed) return "";
    const through = (ev.dmg || 0) - ev.absorbed;
    if (ev.broke) return ` <span class="shield-tag">🛡️💥 the shield shatters${through > 0 ? ` — ${through} gets through` : `, absorbing the blow`}</span>`;
    return ` <span class="shield-tag">🛡️ absorbed by the shield</span>`;
  }
  // A note about armor soaking / breaking under a hit.
  function armorNote(ev) {
    let s = "";
    if (ev.mitigated > 0) s += ` <span class="armor-tag">🛡️ −${ev.mitigated} armor</span>`;
    if (ev.armorBroke) s += ` <span class="armor-tag">💥 armor shatters!</span>`;
    return s;
  }

  function narrate(ev, i, ctx, animate, killing) {
    const a = animate ? "" : "shown";
    const pName = ctx.pName;
    const sideCls = (n) => (n === pName ? "you" : "foe");
    const span = (n, cls) => `<span class="${cls || sideCls(n)}">${esc(n)}</span>`;
    const dmgB = ev.dmg != null ? `<b>${ev.dmg}</b>` : "";
    const rollS = ev.roll != null ? ` <span class="roll">[d20: ${ev.roll}]</span>` : "";
    const seed = i * 97 + (ev.roll || 0) * 13 + (ev.dmg || 0) * 7 + (ev.who ? ev.who.length : 0);
    const V = (arr) => pickVar(arr, seed);
    const weaponOf = (n, kind) => ctx.weaponOf(n, kind);

    let out = "";
    switch (ev.t) {
      case "move": out = fill(V(ev.to === "melee" ? CHARGE : RETREAT), { A: span(ev.who) }); break;
      case "hit": {
        const A = span(ev.who), T = span(ev.target);
        const w = ev.arrow && ARROWS[ev.arrow] ? ARROWS[ev.arrow].noun : weaponOf(ev.who, ev.kind);
        const tpl = ev.crit ? V(ev.kind === "melee" ? CRIT_MELEE : CRIT_MISSILE)
          : V((ev.kind === "melee" ? MELEE_HIT : MISSILE_HIT)[dmgTier(ev.dmg)]);
        out = fill(tpl, { A, T, w }) + ` for ${dmgB}` + (ev.crit ? ` <span class="crit">CRIT!</span>` : "") + (ev.dual ? ` <span class="dual-tag">⚔️⚔️ dual</span>` : "") + (ev.cursed ? ` <span class="curse-tag">🕸️ cursed</span>` : "") + rollS + shieldNote(ev) + armorNote(ev);
        break;
      }
      case "miss": out = fill(V(ev.kind === "melee" ? MELEE_MISS : MISSILE_MISS), { A: span(ev.who), T: span(ev.target), w: weaponOf(ev.who, ev.kind) }) + rollS; break;
      case "dodge": out = fill(V(DODGE), { A: span(ev.by), T: span(ev.who) }) + rollS; break;
      case "evade": out = fill(V(DODGE), { A: span(ev.by), T: span(ev.who) }) + ` <span class="roll">[d20: ${ev.roll}]</span>`; break;
      case "critmiss": out = fill(V(CRITMISS), { A: span(ev.who), roll: rollS }); break;
      case "recover": out = fill(V(RECOVER), { A: span(ev.who) }); break;
      case "hide": out = fill(V(ev.success ? HIDE_OK : HIDE_FAIL), { A: span(ev.who) }) + rollS; break;
      case "spell": {
        const fl = SPELL_FLAVOR[ev.skill] || { hit: ["{A} casts {S} at {T}"], crit: ["{A} critically casts {S} at {T}"] };
        out = fill(V(ev.crit ? fl.crit : fl.hit), { A: span(ev.who), T: span(ev.target), S: ev.skill }) + ` for ${dmgB}` + (ev.crit ? ` <span class="crit">CRIT!</span>` : "") + rollS + shieldNote(ev) + armorNote(ev);
        break;
      }
      case "fizzle": out = ev.reason === "no mp" ? fill(V(FIZZLE_NOMP), { A: span(ev.who) }) : fill(V(FIZZLE_FAIL), { A: span(ev.who), S: ev.skill, roll: rollS }); break;
      case "applyDot": out = fill(V(APPLYDOT), { A: span(ev.who), T: span(ev.target), turns: ev.turns }) + rollS; break;
      case "heal": out = fill(V(HEAL), { A: span(ev.who), amt: `<b>${ev.amt}</b>` }) + rollS + ` <span class="heal-tag">✚</span>`; break;
      case "item": {
        const mana = ev.effect === "fullmana";
        out = fill(V(mana ? ITEMUSE_MANA : ITEMUSE_LIFE), { A: span(ev.who), item: ev.item }) + (mana ? ` <span class="mana-tag">◆</span>` : ` <span class="heal-tag">✚</span>`);
        break;
      }
      case "applyCurse": out = fill(V(CURSE), { A: span(ev.who), T: span(ev.target), turns: ev.turns }) + rollS; break;
      case "poison": out = ev.dotType === "burn"
        ? fill(V(BURN_TICK), { A: span(ev.who), dmg: dmgB }) + ` <span class="burn-tag">🔥</span>`
        : fill(V(POISON), { A: span(ev.who), dmg: dmgB }) + ` <span class="poison-tag">☠️</span>`; break;
      case "arrowFx": {
        if (ev.fx === "slow") out = fill(V(ARROW_SLOW), { T: span(ev.target), turns: ev.turns }) + ` <span class="slow-tag">❄️</span>`;
        else out = fill(V(ARROW_BURN), { T: span(ev.target), turns: ev.turns }) + ` <span class="burn-tag">🔥</span>`;
        break;
      }
      case "arrowSwap": out = fill(V(ARROW_SWAP), { A: span(ev.who), arrow: ev.arrow }); break;
      case "initiative": {
        const roll = ev.bySlow ? " (slowed)" : ev.youRoll != null ? ` <span class="roll">[${Math.max(ev.youRoll, ev.foeRoll)} vs ${Math.min(ev.youRoll, ev.foeRoll)}]</span>` : "";
        return `<p class="${a} line-init"><span class="sys">⚡ ${fill(V(INIT), { A: esc(ev.first) })}${roll}</span></p>`;
      }
      case "summon": out = fill(V(SUMMON), { A: span(ev.who), hp: ev.hp }) + rollS; break;
      case "summonWeapon": out = fill(V(SPIRIT), { A: span(ev.who), turns: ev.turns }) + rollS; break;
      case "shield": out = fill(V(SHIELD), { A: span(ev.who), amount: ev.amount }) + rollS; break;
      case "petHit": {
        const A = span(ev.who, ev.owner === pName ? "you" : "foe"), T = span(ev.target);
        const tpl = ev.who === "Spiritual Weapon" ? V(SPIRIT_HIT) : V(PETHIT);
        out = fill(tpl, { A, T, dmg: dmgB }) + (ev.crit ? ` <span class="crit">CRIT!</span>` : "") + shieldNote(ev) + armorNote(ev);
        break;
      }
      case "petMiss": out = fill(V(SPIRIT_MISS), { A: span(ev.who, ev.owner === pName ? "you" : "foe"), T: span(ev.target) }) + rollS; break;
      case "petDown": out = fill(V(PETDOWN), { A: span(ev.who, "sys") }); break;
      case "petExpire": out = fill(V(PETEXPIRE), { A: span(ev.who, "sys") }); break;
      case "petMove": out = fill(V(PETMOVE), { A: span(ev.who, ev.owner === pName ? "you" : "foe") }); break;
      case "regen": out = `${span(ev.who)}'s wounds close under the healers' hands <span class="heal-tag">✚${ev.amt}</span>`; break;
      // The round opens: the Scribe notes both fighters' condition (GUI-45).
      case "round": {
        if (ev.n === 1) return ""; // the intro already sets the first scene
        const st = (name, hp, maxHp, mp, maxMp) =>
          `${span(name)} <b>${hp}</b>/${maxHp}${maxMp > 0 ? ` · ${mp}MP` : ""}`;
        return `<p class="${a} line-init"><span class="sys">— Round ${ev.n} — ${st(ctx.youName, ev.youHp, ev.youMaxHp, ev.youMp, ev.youMaxMp)} ⚔ ${st(ctx.foeName, ev.foeHp, ev.foeMaxHp, ev.foeMp, ev.foeMaxMp)}</span></p>`;
      }
      // A fighter falls: pure theatre for the parchment (GUI-45).
      case "end": {
        const W = span(ev.result === "won" ? ctx.youName : ctx.foeName);
        const L = span(ev.result === "won" ? ctx.foeName : ctx.youName);
        return `<p class="${a} line-ko">💀 ${fill(V(DEATH_THEATRE), { W, L })}</p>`;
      }
      default: return "";
    }
    // Strikes of a flurry are labelled so a multi-attack reads as ONE action:
    // "1st strike: …grazes for 1" / "2nd strike: …turned aside" (GUI-57).
    if (ev.strikes > 1 && ev.strike) {
      const ord = ["", "1st", "2nd", "3rd", "4th"][ev.strike] || ev.strike + "th";
      out = `<span class="sys">${ord} strike:</span> ` + out;
    }
    // The final strike gets its due (set by the parchment reader).
    if (killing) out = `<span class="crit">☠️ THE KILLING BLOW</span> — ` + out;
    // Visual emphasis for the dramatic beats.
    let extra = "";
    if (killing) extra = "line-ko";
    else if ((ev.t === "hit" || ev.t === "spell") && ev.crit) extra = "line-crit";
    else if (ev.t === "critmiss") extra = "line-fumble";
    else if (ev.t === "summon" || ev.t === "summonWeapon" || ev.t === "shield") extra = "line-summon";
    else if (ev.t === "heal" || ev.t === "item") extra = "line-heal";
    else if (ev.t === "arrowFx") extra = ev.fx === "slow" ? "line-curse" : "line-heavy";
    else if (ev.t === "applyCurse") extra = "line-curse";
    else if ((ev.t === "hit" || ev.t === "petHit" || ev.t === "poison") && ev.dmg >= 14) extra = "line-heavy";

    // Capitalise the first visible letter for a clean sentence start.
    out = out.replace(/^(\s*(?:<span[^>]*>)?)([a-z])/, (m, pre, ch) => pre + ch.toUpperCase());
    return `<p class="${a} ${extra}">${out}</p>`;
  }

  // Context object the narrator needs (names + class lookup) built from a battle.
  function battleCtx(b, playerName) {
    const fighterOf = (n) => (n === b.you.name ? b.you : n === b.foe.name ? b.foe : null);
    return {
      pName: playerName, youName: b.you.name, foeName: b.foe.name,
      classOf: (n) => { const f = fighterOf(n); return f ? f.classId : null; },
      weaponOf: (n, kind) => {
        const f = fighterOf(n); if (!f) return "attack";
        const w = WEAPONS[kind === "melee" ? f.meleeWeapon : f.missileWeapon];
        return w ? w.noun : "attack";
      },
    };
  }
  // The last damaging event of a finished fight — narrated as the "final blow".
  function lastBlowLine(b, ctx) {
    for (let i = b.log.length - 1; i >= 0; i--) {
      if (["hit", "spell", "poison", "petHit"].includes(b.log[i].t)) return narrate(b.log[i], i, ctx, false);
    }
    return "";
  }

  function screenBattle(s) {
    const b = s.battle, pName = s.player.name;
    const ctx = battleCtx(b, pName);
    const intro = `<p class="line-intro shown">${fill(pickVar(INTRO, b.seed), {
      A: `<span class="you">${esc(b.you.name)}</span>`,
      B: `<span class="foe">${esc(b.foe.name)}</span>`,
      bc: CLASSES[b.foe.classId].name,
    })}</p>`;
    const lines = intro + b.log.map((ev, i) => narrate(ev, i, ctx, i >= ui.shownLog)).join("");
    ui.shownLog = b.log.length;

    const actions = G.combat.actionsFor(b.you, b.range);
    const actionHTML = actions.map((a) => `
      <button class="action-btn" data-act="battle-action" data-arg="${a.id}" ${a.usable ? "" : "disabled"}>
        <div class="ab-top">${a.emoji} ${a.name}${a.mp ? `<span class="ab-cost">${a.mp} MP</span>` : ""}</div>
        <div class="ab-desc">${a.desc}</div>
      </button>`).join("");

    const stunned = b.you.skipNext
      ? `<div class="stun-note">⚠️ You stumbled — you lose this turn. Tap any action to continue.</div>`
      : "";

    return `<div class="battle">
      <div class="battle-head"><span class="round">Round ${b.round}</span><span class="streak-pill">${s.streak} bout${s.streak === 1 ? "" : "s"} won 🔥</span></div>
      ${fighterPanel(b.foe, "foe")}
      ${rangeBanner(b.range)}
      ${fighterPanel(b.you, "you")}
      <div class="log" id="battle-log">${lines || '<p class="sys shown">The arena bell rings — you face off at missile range. Choose your move…</p>'}</div>
      ${stunned}
      <div class="actions">${actionHTML}</div>
    </div>`;
  }

  function recapBlock(b, playerName, won) {
    if (!b) return "";
    const ctx = battleCtx(b, playerName);
    const winner = `<span class="${won ? "you" : "foe"}">${esc(won ? b.you.name : b.foe.name)}</span>`;
    const loser = `<span class="${won ? "foe" : "you"}">${esc(won ? b.foe.name : b.you.name)}</span>`;
    const ko = fill(pickVar(won ? KO_WIN : KO_LOSS, b.seed + b.round), { W: winner, L: loser });
    return `<div class="recap">${lastBlowLine(b, ctx)}<p class="line-ko shown">💀 ${ko}</p></div>`;
  }

  function screenWin(s) {
    const r = s.lastReward, p = s.player, isMage = CLASSES[p.classId].caster;
    let allocBlock = "";
    if (s.allocPending) {
      allocBlock = `<div class="alloc">
        <div class="alloc-title">Allocate 2 points</div>
        <div class="alloc-row">
          <button class="btn sm" data-act="alloc" data-arg="2">+2 HP</button>
          <button class="btn sm" data-act="alloc" data-arg="1">+1 HP / +1 MP</button>
          <button class="btn sm" data-act="alloc" data-arg="0">+2 MP</button>
        </div></div>`;
    } else {
      const gained = isMage ? "Points allocated." : "+2 HP";
      const tookFinal = s.playerBracket && s.playerBracket.winner === "player";
      allocBlock = `<p class="muted">${gained}</p>
      <div class="result-actions">` + (tookFinal
        ? `<button class="btn good" data-act="fight-on">🌇 To the sunset</button>`
        : `<button class="btn ghost" data-act="retreat">Withdraw &amp; bank</button>
        <button class="btn good" data-act="fight-on">Continue the day ⚔️</button>`) + `
      </div>`;
    }
    return `<div class="result win">
      <div class="result-emoji">🏆</div>
      <div class="result-title">Victory!</div>
      <p class="muted">${s.streak} bout${s.streak === 1 ? "" : "s"} won today</p>
      ${recapBlock(s.battle, p.name, true)}
      ${crowdBlock(s.lastSpec)}
      <div class="reward-grid"><div class="reward"><b>+${r.gold}</b><span>🪙 gold</span></div></div>
      ${allocBlock}
    </div>`;
  }

  function screenLoss(s) {
    const r = s.lastReward;
    return `<div class="result loss">
      <div class="result-emoji">💀</div>
      <div class="result-title">Defeated</div>
      ${recapBlock(s.battle, s.player.name, false)}
      ${crowdBlock(s.lastSpec)}
      <p class="muted">You fell after <b>${r.streak}</b> bout${r.streak === 1 ? "" : "s"} won. Your day is over — but your gold and stat gains are yours to keep.</p>
      ${r.reachedBest && r.streak > 0 ? `<div class="levelup">🔥 New best day: ${r.streak} bouts!</div>` : ""}
      ${sunsetBoard(s.lastDay)}
      <div class="result-actions"><button class="btn block" data-act="return-home">Return home</button></div>
    </div>`;
  }

  function screenShop(s) {
    const p = s.player;
    // A specific vendor is open — list its wares.
    if (s.vendor) {
      const v = VENDORS.find((x) => x.id === s.vendor);
      const items = s.vendor === "blacksmith" ? "" : Object.values(ITEMS).filter((it) => it.vendor === s.vendor).map((it) => {
        const owned = (p.inventory && p.inventory[it.id]) || 0;
        const cost = game.taxedCost(it.cost), afford = p.gold >= cost;
        return `<div class="card"><div class="card-row"><div class="avatar">${it.emoji}</div>
          <div><div class="card-title">${it.name} ${owned ? `<span class="pill">owned ×${owned}</span>` : ""}</div>
          <div class="card-sub">${it.desc}</div></div>
          <div class="spacer"></div>
          <button class="btn sm gold" data-act="buy-item" data-arg="${it.id}" ${afford ? "" : "disabled"}>🪙 ${cost}</button></div></div>`;
      }).join("") || `<p class="card-sub center">Nothing in stock yet.</p>`;
      // Special arrows — Thief only.
      let arrowsBlock = "";
      if (s.vendor === "magic" && p.classId === "thief") {
        const cards = Object.values(ARROWS).filter((a) => a.id !== "normal").map((a) => {
          const owned = p.arrows.includes(a.id);
          const active = p.activeArrow === a.id;
          const cost = game.taxedCost(a.cost), afford = p.gold >= cost;
          let btn;
          if (!owned) btn = `<button class="btn sm gold" data-act="buy-arrow" data-arg="${a.id}" ${afford ? "" : "disabled"}>🪙 ${cost}</button>`;
          else if (active) btn = `<button class="btn sm ghost" disabled>Loaded ✓</button>`;
          else btn = `<button class="btn sm" data-act="load-arrow" data-arg="${a.id}">Load</button>`;
          return `<div class="card"><div class="card-row"><div class="avatar">${a.emoji}</div>
            <div><div class="card-title">${a.name} ${owned ? `<span class="pill">owned</span>` : ""}</div>
            <div class="card-sub">${a.desc}</div></div><div class="spacer"></div>${btn}</div></div>`;
        }).join("");
        const cur = ARROWS[p.activeArrow];
        arrowsBlock = `<div class="screen-title">🏹 Arrows — loaded: ${cur.emoji} ${cur.name}${p.activeArrow !== "normal" ? ` <button class="btn sm ghost" data-act="load-arrow" data-arg="normal" style="margin-left:6px">Back to Normal</button>` : ""}</div>${cards}`;
      }
      // Armor — Blacksmith.
      let armorBlock = "";
      if (s.vendor === "blacksmith") {
        const maxTier = ARMOR_MAXTIER[p.classId] || 0;
        const cur = p.armor ? ARMOR[p.armor] : null;
        const cards = Object.values(ARMOR).filter((a) => a.tier <= maxTier).map((a) => {
          const cost = game.taxedCost(a.cost);
          const worn = p.armor === a.id, afford = p.gold >= cost;
          const pen = a.initPenalty ? ` · −${a.initPenalty} init` : "";
          const mag = a.magical ? ` · ✨ blocks magic` : "";
          const btn = worn
            ? `<button class="btn sm ghost" disabled>Worn ✓</button>`
            : `<button class="btn sm gold" data-act="buy-armor" data-arg="${a.id}" ${afford ? "" : "disabled"}>🪙 ${cost}</button>`;
          return `<div class="card"><div class="card-row"><div class="avatar">${a.emoji}</div>
            <div><div class="card-title">${a.name} ${worn ? `<span class="pill on">worn</span>` : ""}</div>
            <div class="card-sub">🛡️ DR ${a.dr}${mag}${pen} · ${a.durability} durability</div></div>
            <div class="spacer"></div>${btn}</div></div>`;
        }).join("");
        const wornTxt = cur ? `${cur.emoji} ${cur.name} — ${p.armorDurability}/${cur.durability} durability` : "none";
        armorBlock = `<p class="card-sub center" style="margin:2px 0 10px">Currently worn: <b>${wornTxt}</b></p>${cards}
          <p class="card-sub center" style="margin-top:8px">Armor soaks physical hits (DR) but wears out. Magic ignores normal armor — enchanted armor blocks it.</p>`;
      }
      return topbar(p) + `<div class="screen">
        <button class="btn ghost sm" data-act="close-vendor" style="margin:4px 0 12px">← All vendors</button>
        <div class="screen-title">${v.emoji} ${v.name}</div>${items}${arrowsBlock}${armorBlock}
      </div>` + tabbar("shop");
    }
    // Vendor list.
    const vendors = VENDORS.map((v) => `<div class="card ${v.soon ? "" : "class-card"}" ${v.soon ? "" : `data-act="open-vendor" data-arg="${v.id}"`}>
      <div class="card-row"><div class="avatar">${v.emoji}</div>
        <div><div class="card-title">${v.name} ${v.soon ? `<span class="pill">soon</span>` : ""}</div>
        <div class="card-sub">${v.blurb}</div></div>
        ${v.soon ? "" : `<div class="spacer"></div><span class="pill">Browse →</span>`}</div></div>`).join("");
    const taxNote = p.role !== "lord" && s.stronghold && s.stronghold.taxRate
      ? ` Prices include the Lord's <b>${s.stronghold.taxRate}%</b> sales tax.` : "";
    return topbar(p) + `<div class="screen">
      <div class="screen-title">Vendors</div>${vendors}
      <p class="card-sub center" style="margin-top:10px">You have 🪙 <b>${p.gold}</b> gold.${taxNote}</p>
    </div>` + tabbar("shop");
  }

  function screenHero(s) {
    const p = s.player, m = game.computeMax(p), c = CLASSES[p.classId];
    const spells = c.spells.length
      ? c.spells.map((sk) => `<div class="card"><div class="card-row"><div class="avatar">${sk.emoji}</div>
        <div><div class="card-title">${sk.name} <span class="pill">${sk.mp} MP</span></div>
        <div class="card-sub">${sk.desc}</div></div></div></div>`).join("")
      : `<p class="card-sub center">${c.name} uses no spells — pure martial prowess.</p>`;
    const eqCard = (slot, label) => {
      const w = WEAPONS[p.equipment[slot]];
      return `<div class="card"><div class="card-row"><div class="avatar">${w ? w.emoji : "—"}</div>
        <div><div class="card-title">${w ? w.name : "None"} <span class="pill">${label}</span></div>
        <div class="card-sub">${w ? `Damage ${w.dmg}` : "Unarmed"}</div></div></div></div>`;
    };
    return topbar(p) + `<div class="screen">
      <div class="card">
        <div class="card-row"><div class="avatar">${c.emoji}</div>
          <div><div class="card-title">${esc(p.name)} <span class="pill">${c.name}</span></div>
          <div class="card-sub">${m.maxHp} HP${c.caster ? ` · ${m.maxMp} MP` : ""} · ${p.wins} wins · ${p.battlesWon} total victories</div></div></div>
        ${classStats(p.classId)}
      </div>
      <div class="screen-title">Equipment</div>
      ${eqCard("melee", "melee")}${eqCard("missile", "missile")}
      ${(() => {
        const a = p.armor ? ARMOR[p.armor] : null;
        return `<div class="card"><div class="card-row"><div class="avatar">${a ? a.emoji : "—"}</div>
          <div><div class="card-title">${a ? a.name : "No Armor"} <span class="pill">armor</span></div>
          <div class="card-sub">${a ? `🛡️ DR ${a.dr}${a.magical ? " · blocks magic" : ""} · ${p.armorDurability}/${a.durability} durability` : "Visit the Blacksmith to buy armor"}</div></div></div></div>`;
      })()}
      ${(() => {
        const perks = c.perks || [];
        if (!perks.length) return "";
        const txt = (pk) => {
          const bits = [];
          if (pk.label) bits.push(pk.label);
          if (pk.attacks != null) bits.push(`${pk.attacks} attacks per turn`);
          if (pk.toCrit != null) bits.push(`crit on ${21 - Math.round(pk.toCrit / 5)}+ (${pk.toCrit}%)`);
          if (pk.initBonus != null) bits.push(`+${pk.initBonus} initiative`);
          if (pk.evade != null) bits.push(`evade ${Math.round(((21 - pk.evade) / 20) * 100)}%`);
          if (pk.shieldPct != null) bits.push(`Shield of Faith ${Math.round(pk.shieldPct * 100)}% max HP`);
          if (pk.spiritDmg != null) bits.push(`Spiritual Weapon ${pk.spiritDmg}${pk.spiritMelee ? " (melee only)" : ""}`);
          return bits.join(" · ") || "Perk";
        };
        const body = perks.map((pk) => { const on = p.wins >= pk.at; return `<div class="card"><div class="card-row">
          <div class="avatar">${on ? "✅" : "🔒"}</div>
          <div><div class="card-title">${txt(pk)} <span class="pill">${pk.at} wins</span></div>
          <div class="card-sub">${on ? "Unlocked" : `Locked — reach ${pk.at} wins`}</div></div></div></div>`; }).join("");
        return `<div class="screen-title">Perks</div>${body}`;
      })()}
      ${(() => {
        const abilities = c.abilities || [];
        if (!abilities.length) return "";
        const body = abilities.map((ab) => { const on = p.wins >= ab.at; return `<div class="card"><div class="card-row">
          <div class="avatar">${on ? ab.emoji : "🔒"}</div>
          <div><div class="card-title">${ab.name} <span class="pill">${ab.at} wins</span></div>
          <div class="card-sub">${on ? ab.desc : `Locked — reach ${ab.at} wins`}</div></div></div></div>`; }).join("");
        return `<div class="screen-title">Abilities</div>${body}`;
      })()}
      ${(() => {
        const inv = Object.keys(p.inventory || {}).filter((k) => p.inventory[k] > 0 && ITEMS[k]);
        const body = inv.length
          ? inv.map((k) => { const it = ITEMS[k]; return `<div class="card"><div class="card-row"><div class="avatar">${it.emoji}</div>
              <div><div class="card-title">${it.name} <span class="pill">×${p.inventory[k]}</span></div>
              <div class="card-sub">${it.desc}</div></div></div></div>`; }).join("")
          : `<p class="card-sub center">No items — visit the Magic Shop in the Shop tab.</p>`;
        return `<div class="screen-title">Items</div>${body}`;
      })()}
      ${(() => {
        if (p.classId !== "thief" || !p.arrows.length) return "";
        const body = p.arrows.map((id) => { const a = ARROWS[id]; const on = p.activeArrow === id;
          return `<div class="card"><div class="card-row"><div class="avatar">${a.emoji}</div>
            <div><div class="card-title">${a.name} ${on ? `<span class="pill on">loaded</span>` : ""}</div>
            <div class="card-sub">${a.desc}</div></div></div></div>`; }).join("");
        return `<div class="screen-title">Arrows</div>${body}`;
      })()}
      <div class="screen-title">Spells</div>${spells}
      <button class="btn ghost block sm" style="margin-top:18px" data-act="reset">Start over (delete character)</button>
    </div>` + tabbar("hero");
  }

  // ---------- render ----------
  function render(s) {
    let html;
    switch (s.screen) {
      case "title": html = screenTitle(); break;
      case "class-select": html = screenClassSelect(); break;
      case "home": html = screenHome(s); break;
      case "fame": html = screenFame(s); break;
      case "board": html = screenBoard(s); break;
      case "parchment": html = screenParchment(s); break;
      case "bracket": html = screenBracket(s); break;
      case "day-champion": html = screenDayChampion(s); break;
      case "lord-sunset": html = screenLordSunset(s); break;
      case "defense-prep": html = screenDefensePrep(s); break;
      case "defended": html = screenDefended(s); break;
      case "coronation": html = screenCoronation(s); break;
      case "throne-fate": html = screenThroneFate(s); break;
      case "memorial": html = screenMemorial(s); break;
      case "exiled": html = screenExiled(s); break;
      case "battle": html = screenBattle(s); break;
      case "win": html = screenWin(s); break;
      case "loss": html = screenLoss(s); break;
      case "shop": html = screenShop(s); break;
      case "hero": html = screenHero(s); break;
      default: html = screenTitle();
    }
    app.innerHTML = html;
    if (s.screen === "battle") {
      const log = document.getElementById("battle-log");
      if (log) log.scrollTop = log.scrollHeight;
    } else {
      ui.shownLog = 0;
    }
  }

  // ---------- input (one delegated handler) ----------
  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act, arg = el.dataset.arg;
    switch (act) {
      case "new-character": game.go("class-select"); break;
      case "load-world": game.load(arg) && render(game.state); break;
      case "delete-world": {
        e.stopPropagation();
        if (confirm("Delete this world FOREVER? Its champion, residents and Lord are all erased.")) { game.deleteWorld(arg); render(game.state); }
        break;
      }
      case "hold-games": G.lord.holdGames(); break;
      case "decree": { const [k, d] = arg.split(":"); game.setDecree(k, parseInt(d, 10)); break; }
      case "view-bout": { const [di, bi] = arg.split(":"); game.openBout(parseInt(di, 10), parseInt(bi, 10)); break; }
      case "board-band": ui.boardOpen[arg] = !ui.boardOpen[arg]; render(game.state); break;
      case "build": toast(game.buyBuilding(arg) ? "Raised!" : "The treasury cannot bear it.") ; break;
      case "begin-defense": game.beginDefense(); break;
      case "servant": {
        const [sid, how] = arg.split(":");
        const verb = how === "release" ? "Release" : how === "exile" ? "Exile (one-way)" : "KILL";
        if (confirm(verb + " this servant?")) game.removeServant(sid, how);
        break;
      }
      case "def-range": ui.defRange = arg; render(game.state); break;
      case "def-perk": {
        const pk = game.defensePerks().find((x) => x.id === arg);
        if (arg === "none" || (pk && pk.ok)) { ui.defPerk = arg; render(game.state); }
        else toast(pk ? pk.why : "Unavailable.");
        break;
      }
      case "start-defense": {
        const perk = ui.defPerk === "none" ? null : ui.defPerk;
        ui.defPerk = null; ui.defRange = ui.defRange || "missile";
        game.startDefenseDuel(perk, ui.defRange);
        break;
      }
      case "pick-class": ui.selectedClass = arg; render(game.state); break;
      case "create": {
        const name = (document.getElementById("hero-name") || {}).value || "";
        game.createCharacter(ui.selectedClass, name.trim());
        break;
      }
      case "tab": game.go(arg); break;
      case "enter-arena": game.enterArena(); break;
      case "fight-bout": game.fightBout(); break;
      case "challenge-lord": {
        const uprising = game.state.player.role === "servant";
        if (confirm(uprising ? "An uprising is a fight TO THE DEATH — lose and your story ends. Rise?" : "Challenge the Lord for the throne?")) game.challengeLord();
        break;
      }
      case "fate": {
        if (arg === "die" && !confirm("Meet the blade. This is PERMANENT — your save will be erased. Are you sure?")) break;
        if (arg === "exile" && !confirm("Exile is one-way — your story ends here (for now). Walk out?")) break;
        game.chooseFate(arg);
        break;
      }
      case "reset-hard": game.resetGame(); break;
      case "battle-action": game.chooseAction(arg); break;
      case "alloc": game.allocate(parseInt(arg, 10)); break;
      case "fight-on": game.fightOn(); break;
      case "retreat": game.retreat(); break;
      case "return-home": game.returnHome(); break;
      case "open-vendor": game.openVendor(arg); break;
      case "close-vendor": game.closeVendor(); break;
      case "buy-item": toast(game.buyItem(arg) ? "Purchased!" : "Not enough gold."); break;
      case "buy-arrow": toast(game.buyArrow(arg) ? "Bought & loaded!" : "Not enough gold."); break;
      case "load-arrow": game.loadArrow(arg); break;
      case "buy-armor": toast(game.buyArmor(arg) ? "Armor equipped!" : "Not enough gold."); break;
      case "reset": if (confirm("Delete your character and start over?")) game.resetGame(); break;
    }
  });

  G.ui = { render, toast };
})(typeof window !== "undefined" ? window : globalThis);

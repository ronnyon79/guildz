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
    "The crowd is ECSTATIC — they'll sing of this bout for years!",
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
        <div><div class="card-title">${esc(w.name)} <span class="pill">${roleBadge(w)}</span>${w.hold ? ` <span class="pill">🏰 ${esc(w.hold)}</span>` : ""}</div>
        <div class="card-sub">${CLASSES[w.classId] ? CLASSES[w.classId].name : ""} · ${w.wins} wins · Year ${w.season}, Day ${w.day}</div></div>
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
      <div class="screen-title">Your Stronghold's name <span class="sys" style="text-transform:none">(leave blank and the Scribe picks one)</span></div>
      <input class="name-input" id="hold-name" maxlength="18" placeholder="Ravenhold" />
      <button class="btn block lg" style="margin-top:14px" data-act="create">Begin</button>
    </div>`;
  }

  // The seat of power: who rules, and — when you've earned it — the challenge.
  function lordBlock(s) {
    const p = s.player;
    if (p.role === "lord") {
      const slots = ((s.stronghold || {}).buildings || {}).barracks || 0;
      const servants = s.household.length
        ? s.household.map((h, i) => `<div class="card-sub" style="margin-top:4px"><b>${i + 1}.</b> ${CLASSES[h.classId].emoji} ${esc(h.name)} (${h.wins}w)
            <button class="btn sm ghost" data-act="servant-move" data-arg="${h.id}:-1" title="Fights earlier" ${i === 0 ? "disabled" : ""}>▲</button>
            <button class="btn sm ghost" data-act="servant-move" data-arg="${h.id}:1" title="Fights later" ${i === s.household.length - 1 ? "disabled" : ""}>▼</button>
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:release" title="Release">🕊️</button>
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:exile" title="Exile">🚪</button>
            <button class="btn sm ghost" data-act="servant" data-arg="${h.id}:kill" title="Kill">💀</button></div>`).join("")
          + `<div class="card-sub sys" style="margin-top:4px">⚔️ Challengers fight your wall in this order (1. first) — they patch only half their wounds between bouts.</div>`
        : slots ? "empty — beaten challengers may kneel" : "build the Barracks to house defenders";
      const challenge = s.defense && !s.defense.fielded ? `<div class="card" style="border-color:#c0392b">
        <div class="card-title">⚔️ A CHALLENGER COMES</div>
        <div class="card-sub"><b>${esc(s.defense.name)}</b> ended the year as the people's favourite and demands your throne. The challenge cannot be refused — your household fights first, then it is you.</div>
        <button class="btn block lg" style="margin-top:10px" data-act="begin-defense">🛡️ Answer the challenge</button></div>` : "";
      return `<div class="card"><div class="card-row"><div class="avatar">👑</div>
        <div><div class="card-title"><span class="you">${esc(p.name)}</span> <span class="pill on plink" data-act="hold">👑 Lord of ${esc((s.stronghold || {}).name || "the Stronghold")}</span> <button class="btn sm ghost" data-act="rename-hold" title="Rename your hold">✏️</button></div>
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
      <div class="card-sub">${L.wins}-win champion of old · ${L.reignSeasons >= 1 ? `reigning ${L.reignSeasons} year${L.reignSeasons === 1 ? "" : "s"}` : "crowned this year"}${p.role === "servant" ? " · <b>you serve his household</b>" : ""}</div></div></div></div>`;
    if (!s.challengeOpen) return lordCard;
    const uprising = p.role === "servant";
    return lordCard + `<div class="card" style="border-color:#b9a06a">
      <div class="card-title">${uprising ? "🗡️ RISE AGAINST YOUR LORD" : "⚔️ The throne can be YOURS"}</div>
      <div class="card-sub">${uprising
        ? "You top the fame ladder — even in servitude. An uprising is a fight <b>to the death</b>: win and the throne is yours; lose and there is no mercy."
        : `You ended the year as the most famous in the Stronghold. Challenge Lord ${esc(L.name)} for the throne — he'll be fresh, on his own sand, with the crowd at his back. Or enter the day's tournament and let the moment pass.`}</div>
      <button class="btn block lg" style="margin-top:10px" data-act="challenge-lord">${uprising ? "🗡️ Rise — to the death" : "👑 Challenge the Lord"}</button>
    </div>`;
  }

  /* 🌅 Today's field (GUI-50): who shares your win-band this morning — so
   * "enter or let the moment pass" is an informed choice. Names tap to the
   * profile card (with its scout intel). Lords see no field; they preside. */
  function fieldBlock(s) {
    if (s.player.role === "lord") return "";
    const band = G.tournament.bandOf(s.player.wins);
    const rivals = s.npcs.filter((n) => G.tournament.bandOf(n.wins) === band);
    if (!rivals.length) return `<div class="card"><div class="card-title" style="font-size:14px">🌅 Today's field — Band ${G.tournament.bandLabel(band)}</div>
      <div class="card-sub" style="margin-top:6px">🕊️ No rivals share your band this morning — enter and the day is a walkover.</div></div>`;
    const rows = rivals.slice(0, 8).map((n) => {
      const temper = n.personality ? G.data.PERSONALITY.label(n.personality) : "";
      return `<div class="card-sub crier-row">${CLASSES[n.classId].emoji} ${plink(s, n.name)} · ${n.wins}w · age ${n.age}${G.data.AGE.mult(n.age) < 1 ? " 🍂" : ""}${temper ? ` · <b>${temper}</b>` : ""}</div>`;
    }).join("");
    return `<div class="card"><div class="card-title" style="font-size:14px">🌅 Today's field — Band ${G.tournament.bandLabel(band)} · ${rivals.length} rival${rivals.length === 1 ? "" : "s"}</div>${rows}${rivals.length > 8 ? `<div class="card-sub crier-row sys">…and ${rivals.length - 8} more</div>` : ""}</div>`;
  }

  // 📯 The town crier (GUI-53): the world's recent news, newest first.
  function crierBlock(s) {
    if (!s.news || !s.news.length) return "";
    const rows = s.news.slice(-6).reverse().map((n) =>
      `<div class="card-sub crier-row">${n.icon} <span class="sys">D${n.d}·Y${n.s}</span> ${n.text}</div>`).join("");
    return `<div class="card"><div class="card-title" style="font-size:14px">📯 The crier of <span class="plink" data-act="hold">${esc((s.stronghold || {}).name || "the Stronghold")}</span></div>${rows}</div>`;
  }

  // 📒 The clerk's book (GUI-52): the last 7 presided days of treasury flow —
  // so a decree change visibly moves the needle within a week.
  function clerkBlock(s) {
    const log = s.ledgerLog || [];
    if (s.player.role !== "lord" || !log.length) return "";
    const max = Math.max(...log.map((r) => Math.abs(r.net)), 1);
    const rows = log.slice().reverse().map((r) => {
      const w = Math.max(4, Math.round((Math.abs(r.net) / max) * 100));
      return `<div class="card-sub ledger-row"><span class="sys">D${r.d}·S${r.s}</span>
        <span class="ledger-bar ${r.net >= 0 ? "up" : "down"}" style="width:${w}px"></span>
        <b class="${r.net >= 0 ? "up" : "down"}">${r.net >= 0 ? "+" : ""}${r.net}g</b>
        <span class="sys">→ ${r.after}g</span></div>`;
    }).join("");
    const total = log.reduce((a, r) => a + r.net, 0);
    return `<div class="card"><div class="card-title" style="font-size:14px">📒 The clerk's book <span class="pill">${total >= 0 ? "+" : ""}${total}g over ${log.length} day${log.length === 1 ? "" : "s"}</span></div>${rows}</div>`;
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
      ${fieldBlock(s)}
      ${crierBlock(s)}
      ${p.role === "lord"
        ? `${clerkBlock(s)}
      ${decreesBlock(s)}
      ${buildingsBlock(s)}
      <button class="btn block lg gold" data-act="hold-games">👑 Hold the Day's Games</button>
      <p class="card-sub center" style="margin-top:12px"><span class="plink" data-act="hold">🏰 <b>${esc((s.stronghold || {}).name || "The Stronghold")}</b></span> · Day ${s.clock.day} · Year ${s.clock.season}</p>
      <p class="card-sub center" style="margin-top:6px">Every band fights while you watch from the high seat. Champions earn fame in your arena — and one day, the boldest of them will come for your throne.</p>`
        : `<button class="btn block lg gold" data-act="enter-arena">🌅 Enter the Day's Tournament</button>
      <p class="card-sub center" style="margin-top:12px"><span class="plink" data-act="hold">🏰 <b>${esc((s.stronghold || {}).name || "The Stronghold")}</b></span> · Day ${s.clock.day} · Year ${s.clock.season}</p>
      <p class="card-sub center" style="margin-top:6px">Each day is a knockout tournament in your win-band (${G.tournament.bandLabel(G.tournament.bandOf(p.wins))}). Every bout won earns gold and stats — lose once and your day ends, but you keep everything. Take the band to be <b>Champion of the Day</b> and earn ⭐ fame — the most famous at year's end may challenge the Lord.</p>`}
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
      const nt = lastDay.npcThrone;
      const throne = nt ? (nt.result === "usurped"
        ? `👑 <b>${esc(nt.challenger)}</b> stormed the keep — <b>the throne FELL</b>. ${esc(nt.lordName)}'s reign is ended; a new Lord rules the Stronghold.${nt.sworn && nt.sworn.length ? ` The keep's guard — ${nt.sworn.map(esc).join(" and ")} — knelt and swore to the victor.` : ""}`
        : `👑 <b>${esc(nt.challenger)}</b> came for the throne — <b>${esc(nt.by)}</b> ${nt.by === nt.lordName ? "cut them down" : "held the wall"}${nt.fate === "exile" ? "; the beaten challenger rode into exile" : nt.fate === "die" ? "; the challenger lies dead" : ""}. The parchments hang on the board.`) : "";
      season = `<div class="levelup">🍂 Year ${lastDay.seasonEnd.season} ends! ${t ? `${t.isPlayer ? "<b>You</b>" : `<b>${esc(t.name)}</b>`} top${t.isPlayer ? "" : "s"} the fame ladder with ⭐ ${t.popularity}.` : ""} All fame fades by half as the new year dawns.${lastDay.mayChallenge ? " <b>👑 The right to challenge the Lord is yours — it awaits you at home.</b>" : ""}${throne ? `<br>${throne}` : ""}${gone ? `<br>${gone}` : ""}</div>`;
    }
    return `<div class="screen-title">🌇 Sunset — champions of the day</div>${rows}${season}`;
  }

  /* ---------- champion profiles (GUI-46) ---------- */
  // Resolve a name to whatever the world knows: you, the Lord, a resident,
  // a sworn servant, a departed founder — or a name the Scribe barely recalls.
  function resolvePerson(s, name) {
    if (name === s.player.name) return { rec: s.player, status: `<span class="pill on">you</span>` };
    if (s.lord && s.lord.name === name) return { rec: s.lord, status: `<span class="pill on">👑 Lord of the Stronghold</span>` };
    const h = (s.household || []).find((x) => x.name === name);
    if (h) return { rec: h, status: `<span class="pill">🛡️ sworn to the household</span>` };
    const n = s.npcs.find((x) => x.name === name);
    if (n) return { rec: n, status: `<span class="pill">resident champion</span>` };
    const d = (s.departed || []).find((x) => x.name === name);
    if (d) return { rec: d, status: `<span class="pill">${d.reason === "found" ? (d.holdName ? `${d.archetype === "spite" ? "🔥" : "🐎"} founder of ${esc(d.holdName)}` : "🐎 founded their own hold") : "🌄 rode out for adventure"}</span>` };
    return { rec: null, status: "" };
  }

  // The champion's battle kit — the SAME builders the arena uses (GUI-70).
  function champKit(s, name) {
    try {
      if (name === s.player.name) return game.playerCombatChar();
      if (s.lord && s.lord.name === name) return game.lordCombatChar();
      const n = s.npcs.find((x) => x.name === name) || (s.household || []).find((x) => x.name === name)
        || (s.departed || []).find((x) => x.name === name);
      if (n) return G.roster.combatChar({ age: 30, id: "kit", ...n }, game.gearScale());
    } catch (e) {}
    return null;
  }

  function arsenalLine(s, name) {
    const k = champKit(s, name);
    if (!k) return "";
    const dual = (CLASSES[k.classId].perks || []).some((p) => p.weapons > 1 && (k.wins || 0) >= p.at);
    const mw = WEAPONS[k.meleeWeapon], xw = WEAPONS[k.missileWeapon];
    const bits = [`❤️ ${k.maxHp} HP`];
    if (k.maxMp > 0) bits.push(`🔷 ${k.maxMp} MP`);
    if (mw) bits.push(`${mw.emoji} ${mw.name}${dual ? " ×2" : ""}`);
    if (xw) bits.push(`${xw.emoji} ${xw.name}${k.arrows && k.arrows.length ? ` (${k.arrows.join("/")} arrows)` : ""}`);
    bits.push(k.armor ? `${ARMOR[k.armor].emoji} ${ARMOR[k.armor].name} (DR${ARMOR[k.armor].dr})` : "no armor");
    return `<div class="card-sub">${bits.join(" · ")}</div>`;
  }

  // What they ACTUALLY do in the arena: mined from recent parchments —
  // verbatim logs when we have them, seed-replays otherwise (GUI-70).
  function styleStats(s, name) {
    const counts = {};
    let bouts = 0;
    outer:
    for (let di = s.board.length - 1; di >= 0; di--) {
      for (const rec of s.board[di].bouts) {
        if (rec.a.name !== name && rec.b.name !== name) continue;
        let log = rec.log;
        if (!log) { try { log = G.tournament.replayBout(rec.a, rec.b, rec.seed, rec.range).log; } catch (e) { continue; } }
        bouts++;
        for (const ev of log) {
          if (ev.who !== name) continue;
          let k = null;
          switch (ev.t) {
            case "hit": case "miss": k = ev.kind === "melee" ? "⚔️ melee strikes" : "🏹 shots"; break;
            case "spell": case "fizzle": k = "🔮 " + (ev.skill || "spellcraft"); break;
            case "applyDot": k = "☠️ " + (ev.skill || "Poison Cloud"); break;
            case "applyCurse": k = "🕸️ " + (ev.skill || "Curse"); break;
            case "heal": k = "💚 " + (ev.skill || "healing"); break;
            case "hide": k = "🌑 hides in shadows"; break;
            case "item": k = "🧪 potions"; break;
            case "shield": k = "🛡️ Shield of Faith"; break;
            case "summon": k = "🌪️ summons"; break;
            case "summonWeapon": k = "🗡️ Spiritual Weapon"; break;
          }
          if (k) counts[k] = (counts[k] || 0) + 1;
        }
        if (bouts >= 12) break outer;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { bouts, total, top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }

  function styleLine(s, name) {
    const st = styleStats(s, name);
    if (!st.bouts || !st.top.length) return "";
    return `<div class="card-sub">📊 style, from ${st.bouts} parchment${st.bouts === 1 ? "" : "s"}: ${st.top.map(([k, n]) => `${k} ${Math.round((n / st.total) * 100)}%`).join(" · ")}</div>`;
  }

  function profileOverlay(s) {
    const name = ui.profileName;
    const { rec, status } = resolvePerson(s, name);
    const c = game.careerOf(name);
    const cls = rec && CLASSES[rec.classId];
    const temper = rec && rec.personality ? G.data.PERSONALITY.label(rec.personality) : "";
    const fade = rec && rec.age != null ? G.data.AGE.mult(rec.age) : 1;
    const lines = [];
    if (cls) lines.push(`<div class="card-sub">${cls.name}${rec.wins != null ? ` · <b>${rec.wins}</b> career wins` : ""}${rec.reignSeasons != null ? (rec.reignSeasons >= 1 ? ` · ${rec.reignSeasons} year${rec.reignSeasons === 1 ? "" : "s"} on the throne` : " · crowned this year") : ""}</div>`);
    if (rec && rec.age != null) lines.push(`<div class="card-sub">age ${rec.age}${fade < 1 ? ` 🍂 <span class="sys">past peak (${Math.round(fade * 100)}% strength)</span>` : ""}</div>`);
    if (temper) lines.push(`<div class="card-sub">temperament: <b>${temper}</b></div>`);
    if (rec && rec.popularity != null) lines.push(`<div class="card-sub">⭐ <b>${rec.popularity}</b> fame</div>`);
    const career = c
      ? `<div class="card-sub" style="margin-top:8px">📜 The Scribe records <b>${c.bouts}</b> bout${c.bouts === 1 ? "" : "s"}: <b>${c.wins}</b> won (${c.bouts ? Math.round((c.wins / c.bouts) * 100) : 0}%)${c.wins ? ` · crowds rated their wins ${(c.stars / c.wins).toFixed(1)}★` : ""}</div>`
      : `<div class="card-sub" style="margin-top:8px">📜 No bouts in the Scribe records yet.</div>`;
    let h2h = "";
    if (name !== s.player.name) {
      const h = game.headToHead(name, s.player.name);
      if (h.meetings) h2h = `<div class="card-sub">⚔ against you: <b>you ${h.yWins} – ${h.xWins} them</b> across ${h.meetings} meeting${h.meetings === 1 ? "" : "s"}</div>`;
    }
    const unknown = !rec && !c ? `<div class="card-sub">The Scribe leafs through the archive… this name appears in no ledger.</div>` : "";
    return `<div class="overlay" data-act="profile-close">
      <div class="card profile-card" data-act="profile-noop">
        <div class="card-row">
          <div class="avatar">${cls ? cls.emoji : "❓"}</div>
          <div><div class="card-title">${esc(name)} ${status}</div>${lines.join("")}</div>
          <div class="spacer"></div><button class="btn sm ghost" data-act="profile-close">✕</button>
        </div>
        ${career}${arsenalLine(s, name)}${styleLine(s, name)}${h2h}${unknown}
      </div>
    </div>`;
  }

  // A tappable name — anywhere prose mentions a champion (GUI-46).
  function plink(s, n) {
    return `<span class="plink${n === s.player.name ? " you" : ""}" data-act="profile" data-arg="${esc(n)}">${esc(n)}</span>`;
  }

  // Chronicle prose with its refs made tappable (GUI-88): the <b>names</b>
  // the Scribe wrote become links into the champion profiles.
  function chronText(s, e) {
    let t = e.text;
    for (const r of e.refs || []) t = t.split(`<b>${r}</b>`).join(`<b>${plink(s, r)}</b>`);
    return t;
  }

  /* 🏰 The hold's own profile card (GUI-88) — the GUI-46 pattern extended
   * from people to places. Tap the hold's name anywhere: its founding story,
   * its age in years, its line of Lords, and the full chronicle. */
  function holdOverlay(s) {
    const st = s.stronghold || {};
    const arch = st.archetype && G.data.ARCHETYPES[st.archetype];
    const chron = s.chronicle || [];
    const age = s.clock.season - (st.foundedOn || 1) + 1;
    // The line of Lords, derived from the chronicle: the founder, then every
    // hand that took the throne (👑 falls, uprisings, ⚱️ successions).
    const lords = [];
    if (st.founder) lords.push({ name: st.founder.name, y: st.foundedOn || 1 });
    for (const e of chron) {
      if (e.type === "regime" && e.icon === "👑" && e.refs && e.refs[0]) lords.push({ name: e.refs[0], y: e.y });
      else if (e.type === "uprising" && e.refs && e.refs[0]) lords.push({ name: e.refs[0], y: e.y });
      else if (e.type === "succession" && e.refs && e.refs[1]) lords.push({ name: e.refs[1], y: e.y });
    }
    const reigning = s.player && s.player.role === "lord" ? s.player.name : (s.lord || {}).name;
    const nth = age === 1 ? "first" : age + (age % 10 === 2 && age % 100 !== 12 ? "nd" : age % 10 === 3 && age % 100 !== 13 ? "rd" : "th");
    const lines = [];
    if (arch) lines.push(`<div class="card-sub">${arch.emoji} <b>${arch.name}</b>${arch.fx ? ` — <span class="sys">⚙️ ${arch.fx.desc}</span>` : ""}</div>`);
    lines.push(`<div class="card-sub">founded in Year ${st.foundedOn || 1}${st.founder ? ` by ${plink(s, st.founder.name)}` : ""} — its ${nth} year</div>`);
    if (lords.length) lines.push(`<div class="card-sub">👑 the line of Lords: ${lords.map((l) => `${plink(s, l.name)} <span class="sys">(Y${l.y})</span>`).join(" → ")}${reigning ? ` · <b>${esc(reigning)}</b> reigns today` : ""}</div>`);
    const rows = chron.map((e) => `<div class="card-sub crier-row">${e.icon} <span class="sys">Y${e.y}·D${e.d}</span> ${chronText(s, e)}</div>`).join("")
      || `<div class="card-sub">The chronicle's pages are still blank.</div>`;
    return `<div class="overlay" data-act="hold-close">
      <div class="card profile-card" data-act="hold-noop">
        <div class="card-row">
          <div class="avatar">🏰</div>
          <div><div class="card-title">${esc(st.name || "The Stronghold")}</div>${lines.join("")}</div>
          <div class="spacer"></div><button class="btn sm ghost" data-act="hold-close">✕</button>
        </div>
        <div class="card-sub" style="margin-top:8px"><b>📜 The Chronicle</b></div>
        <div class="chron-log">${rows}</div>
      </div>
    </div>`;
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
      return `<div class="card" data-act="profile" data-arg="${esc(r.name)}"><div class="card-row">
        <div class="avatar">${rank === 1 ? "👑" : CLASSES[r.classId].emoji}</div>
        <div><div class="card-title">#${rank} ${r.isPlayer ? `<span class="you">${esc(r.name)}</span> <span class="pill on">you</span>` : esc(r.name)}${temper ? ` <span class="pill">${temper}</span>` : ""}</div>
        <div class="card-sub">${CLASSES[r.classId].name} · ${r.wins} wins${npc ? ` · age ${npc.age}` : ""}</div></div>
        <div class="spacer"></div><span class="pill">⭐ ${r.popularity}</span></div></div>`;
    }).join("");
    const last = s.lastSeason && s.lastSeason.top[0]
      ? `<p class="card-sub center" style="margin-top:10px">Last year's most famous: <b>${esc(s.lastSeason.top[0].name)}</b> (⭐ ${s.lastSeason.top[0].popularity})</p>` : "";
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">⭐ Fame — Day ${s.clock.day}, Year ${s.clock.season}</div>
      <p class="card-sub center" style="margin-bottom:10px">Day champions earn fame by band and bouts won. Fame fades by half each year — the most famous at year's end may challenge the Lord.</p>
      ${rows}${last}
    </div>` + tabbar("fame");
  }

  // The Scout leans in before your bout (GUI-47): who you are about to face.
  function scoutCard(s, n) {
    const { rec } = resolvePerson(s, n);
    const c = game.careerOf(n);
    const cls = rec && CLASSES[rec.classId];
    const temper = rec && rec.personality ? G.data.PERSONALITY.label(rec.personality) : "";
    const fade = rec && rec.age != null ? G.data.AGE.mult(rec.age) : 1;
    const h = game.headToHead(n, s.player.name);
    const h2h = h.meetings
      ? `⚔ against you: <b>you ${h.yWins} – ${h.xWins} them</b> (${h.meetings} meeting${h.meetings === 1 ? "" : "s"})`
      : "⚔ you have never crossed steel — first meeting";
    return `<div class="card scout-card">
      <div class="card-row"><div class="avatar">${cls ? cls.emoji : "❓"}</div>
      <div><div class="card-title" style="font-size:14px">🔍 The Scout’s word on ${plink(s, n)}</div>
      <div class="card-sub">${cls ? cls.name : "?"}${rec && rec.wins != null ? ` · <b>${rec.wins}</b> wins` : ""}${rec && rec.age != null ? ` · age ${rec.age}${fade < 1 ? " 🍂" : ""}` : ""}${temper ? ` · <b>${temper}</b>` : ""}</div>
      ${c ? `<div class="card-sub">record: ${c.wins}/${c.bouts} bouts (${c.bouts ? Math.round((c.wins / c.bouts) * 100) : 0}%)${c.wins ? ` · crowds rate them ${(c.stars / c.wins).toFixed(1)}★` : ""}</div>` : ""}
      ${arsenalLine(s, n)}${styleLine(s, n)}
      <div class="card-sub">${h2h}</div></div></div>
    </div>`;
  }

  function screenBracket(s) {
    const br = s.playerBracket, m = s.pendingBout;
    if (!br) return screenHome(s);
    const name = (id) => game.champName(id);
    const tag = (id) => (id === "player" ? `<b>${plink(s, s.player.name)}</b>` : plink(s, name(id)));
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
      ${m ? scoutCard(s, m.a === "player" ? name(m.b) : name(m.a)) : ""}
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
  // The Scribe's HEADLINE for a parchment (GUI-48): stored spectacle flags
  // first (comeback/nail-biter/rout), then derived angles (upset by win-gap,
  // wars, 5★ classics, 1★ duds). Seeded variants keep the board lively.
  const HEADLINES = {
    comeback: ["🔥 COMEBACK FOR THE AGES!", "🔥 Back from the BRINK!"],
    upset: ["😱 UPSET! The ladder trembles!", "😱 Nobody saw THIS coming!"],
    nailbiter: ["💓 A nail-biter to the last breath", "💓 Decided by a whisker"],
    rout: ["🧹 A ruthless rout", "🧹 Utterly one-sided"],
    war: ["⚔️ A war of attrition", "⚔️ They fought until the lamps burned low"],
    classic: ["🌟 A bout for the ages", "🌟 The crowd will speak of this for years"],
    dud: ["🥱 A dull affair, says the crowd", "🥱 The pigeons watched with more interest"],
  };
  function headline(bt) {
    const seed = (bt.seed || 0) + (bt.rounds || 0) * 7;
    const upset = bt.a && bt.b && bt.a.wins != null && bt.b.wins != null
      && Math.abs(bt.a.wins - bt.b.wins) >= 15
      && bt.winner === (bt.a.wins < bt.b.wins ? bt.a.name : bt.b.name);
    const key = bt.hl === "comeback" ? "comeback"
      : upset ? "upset"
      : bt.hl === "nailbiter" ? "nailbiter"
      : bt.hl === "rout" ? "rout"
      : (bt.rounds || 0) >= 9 ? "war"
      : bt.spec === 5 ? "classic"
      : bt.spec === 1 ? "dud" : null;
    return key ? `<div class="card-sub headline">${pickVar(HEADLINES[key], seed)}</div>` : "";
  }

  // One parchment row (a single bout on the board).
  function boutRow(s, di, bi, bt) {
    const you = (n) => plink(s, n);
    return `<div class="card class-card" data-act="view-bout" data-arg="${di}:${bi}">
      <div class="card-row"><div class="avatar">${bt.throne ? "👑" : CLASSES[(bt.a || {}).classId] ? CLASSES[bt.a.classId].emoji : "⚔️"}</div>
      <div><div class="card-title" style="font-size:14px">${you(bt.a.name)} <span class="sys">vs</span> ${you(bt.b.name)}${bt.throne ? ' <span class="pill on">THRONE DUEL</span>' : ""}</div>
      ${headline(bt)}
      <div class="card-sub">🏆 ${you(bt.winner)} · ${bt.rounds} rounds${bt.spec ? ` · ${starsOf(bt.spec)}` : ""}</div></div>
      <div class="spacer"></div><span class="pill">Read →</span></div></div>`;
  }

  /* The board, foldered: each day's parchments hang grouped by BAND (GUI-58) —
   * pick a category, read its reports. Throne & gauntlet pin above the bands. */
  // One day's bouts, hung by band (the day PANEL under the calendar).
  // A day's bouts grouped by category key → Map("T"|"G"|band → [[bout, bi]]).
  function dayGroups(d) {
    const groups = new Map();
    d.bouts.forEach((bt, bi) => {
      const key = bt.throne ? "T" : bt.gauntlet ? "G" : String(bt.band != null ? bt.band : "X");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([bt, bi]);
    });
    return groups;
  }
  const bandKeyWeight = (k) => (k === "T" ? -2 : k === "G" ? -1 : k === "X" ? 999 : parseInt(k, 10));
  const bandKeyLabel = (k) => (k === "T" ? "👑 The Throne" : k === "G" ? "🛡️ The Gauntlet"
    : k === "X" ? "⚔️ Other bouts" : `🏟️ Band ${G.tournament.bandLabel(+k)}`);

  /* The board (GUI-61/62): a SEASON page (◀ ▶) → a calendar of days → a compact
   * BAND CHIP grid → the chosen band's reports. On wide screens the reports sit
   * in a side panel next to the calendar; on phones they flow beneath. */
  function screenBoard(s) {
    if (!s.board.length) {
      return topbar(s.player) + `<div class="screen board-screen">
        <div class="screen-title">The Bulletin Board</div>
        <p class="card-sub center" style="margin-top:20px">The board is bare — no games have been fought yet. The Scribe waits, quill ready.</p>
      </div>` + tabbar("board");
    }
    const seasons = [...new Set(s.board.map((d) => d.season))].sort((a, b) => a - b);
    if (ui.boardSeason == null || !seasons.includes(ui.boardSeason)) ui.boardSeason = seasons[seasons.length - 1];
    const inSeason = s.board.filter((d) => d.season === ui.boardSeason);
    const dayNums = inSeason.map((d) => d.day);
    if (ui.boardDay == null || !dayNums.includes(ui.boardDay)) ui.boardDay = dayNums[dayNums.length - 1];
    const si = seasons.indexOf(ui.boardSeason);
    const pager = `<div class="alloc-row" style="align-items:center;justify-content:center;gap:14px;margin-bottom:8px">
      <button class="btn sm ghost" data-act="board-season" data-arg="-1" ${si === 0 ? "disabled" : ""}>◀</button>
      <b>Year ${ui.boardSeason}</b>
      <button class="btn sm ghost" data-act="board-season" data-arg="1" ${si === seasons.length - 1 ? "disabled" : ""}>▶</button>
    </div>`;
    const cells = [];
    for (let day = 1; day <= G.data.SEASON.days; day++) {
      const rec = inSeason.find((d) => d.day === day);
      const marks = rec
        ? (rec.bouts.some((b) => b.throne || b.gauntlet) ? "👑" : "") +
          (rec.bouts.some((b) => b.a.name === s.player.name || b.b.name === s.player.name) ? "⭐" : "")
        : "";
      cells.push(`<button class="cal-day ${rec && day === ui.boardDay ? "sel" : ""}" ${rec ? `data-act="board-day" data-arg="${day}"` : "disabled"}>${day}<span class="cal-mark">${marks || "&nbsp;"}</span></button>`);
    }
    const d = inSeason.find((x) => x.day === ui.boardDay);
    const di = s.board.indexOf(d);
    let chips = "", reports = "";
    if (d) {
      const groups = dayGroups(d);
      const keys = [...groups.keys()].sort((a, b) => bandKeyWeight(a) - bandKeyWeight(b));
      if (ui.boardBand == null || !groups.has(ui.boardBand)) {
        // default to where YOU fought, else the marquee category
        ui.boardBand = keys.find((k) => groups.get(k).some(([bt]) => bt.a.name === s.player.name || bt.b.name === s.player.name)) || keys[0];
      }
      chips = `<div class="bandgrid">` + keys.map((k) => {
        const items = groups.get(k);
        const yours = items.some(([bt]) => bt.a.name === s.player.name || bt.b.name === s.player.name);
        const short = k === "T" ? "👑" : k === "G" ? "🛡️" : k === "X" ? "⚔️" : G.tournament.bandLabel(+k).replace(" wins", "");
        return `<button class="band-chip ${k === ui.boardBand ? "sel" : ""}" data-act="board-band" data-arg="${k}">${short}${yours ? " ⭐" : ""}<span class="cal-mark">${items.length}</span></button>`;
      }).join("") + `</div>`;
      const items = groups.get(ui.boardBand) || [];
      reports = `<div class="screen-title">${bandKeyLabel(ui.boardBand)} — Day ${d.day} · ${items.length} bout${items.length === 1 ? "" : "s"}</div>`
        + items.map(([bt, bi]) => boutRow(s, di, bi, bt)).join("");
    }
    return topbar(s.player) + `<div class="screen board-screen">
      <div class="screen-title">The Bulletin Board</div>
      <div class="board-cols">
        <div>
          ${pager}
          <div class="cal">${cells.join("")}</div>
          ${chips}
          <p class="card-sub center" style="margin:6px 0 10px">Pick a day, then a band — 👑 throne · ⭐ you. Parchments stay pinned ${G.data.BOARD.days} days.</p>
        </div>
        <div class="board-right">${reports}</div>
      </div>
    </div>` + tabbar("board");
  }

  // A parchment: the full blow-by-blow, re-rendered deterministically from the
  // seed (or the verbatim log for bouts the champion fought in person).
  /* ---------- the report as a three-way CHAT (GUI-63) ----------
   * The fighters call their OWN actions in punchy first person; the Narrator
   * keeps the scene (rounds, initiative, poison, pets, the fall). */
  const FP = {
    meleeHit: [
      ["A scratch — but I'll take it.", "Just a graze… for now."],
      ["My {w} bites — feel that?", "Clean hit! There's more coming."],
      ["I hammer you back a step!", "That one sank DEEP."],
      ["EVERYTHING behind that blow!", "I nearly split you in two!"],
    ],
    missileHit: [
      ["A nick — hold still, would you?", "Winged you."],
      ["My {w} finds you!", "Square hit — from all the way out here!"],
      ["Punched that clean through your guard!", "That shot ROCKED you."],
      ["A shot they'll talk about for years!", "Nearly dropped you from across the sand!"],
    ],
    crit: ["PERFECT — right through your guard!", "Dead centre! DOWN you go!", "That's the opening I wanted!"],
    miss: ["Wide — curse it!", "Slippery little—", "You won't be that lucky twice."],
    evade: ["Ha! Too slow.", "I'm not where you think I am.", "You're swinging at shadows."],
    charge: ["No more hiding — I'm coming for you!", "Closing in. Let's end this face to face."],
    retreat: ["Back to range — reach me if you can.", "I'll pick you apart from out here."],
    critmiss: ["No—! Overreached… I'm reeling. 😵", "My footing—! A disastrous slip. 😵"],
    recover: ["Still reeling… I can't strike this round.", "Shaking off the daze — you got lucky."],
    hideOk: ["Now you see me… 🌑 now you don't.", "Into the shadows. Sleep lightly."],
    hideFail: ["Spotted—! No matter.", "The shadows refuse me this time."],
    spells: {
      "Magic Missile": ["Bolt of force — it NEVER misses. ✨", "Straight through your guard! ✨"],
      "Lightning Bolt": ["Feel the sky's wrath! ⚡", "Lightning answers me! ⚡"],
      "Fireball": ["BURN! 🔥", "A little warmth for you — catch! 🔥"],
    },
    spellGeneric: ["My {S} strikes true!", "{S} — take it!"],
    applyDot: ["Choke on this cloud! ☠️", "Poison, friend — it's already in your lungs. ☠️"],
    applyCurse: ["A hex upon you — feel your strength drain! 🕸️"],
    shield: ["Faith, shield me! 🛡️ ({amount})", "A wall of light between us. 🛡️ ({amount})"],
    spirit: ["Rise, blade of spirit — fight beside me! 🗡️", "My faith takes form — a floating blade! 🗡️"],
    summon: ["Winds, ANSWER ME! 🌪️ ({hp} HP)", "I call the storm itself to my side! 🌪️ ({hp} HP)"],
    heal: ["Light, mend me… ✚{amt}.", "My wounds close — ✚{amt}. Not done yet."],
    itemLife: ["A gulp of the good stuff — I'm WHOLE again! 🧪", "Potion down — wounds gone! 🧪"],
    itemMana: ["Mana floods back — oh, that's better. 🔷", "Drink deep… the weave returns to me. 🔷"],
    fizzle: ["The weave slips — NOTHING! Argh.", "Fizzled! The magic mocks me."],
    fizzleNoMp: ["Empty… nothing left to cast.", "No mana. Steel will have to do."],
    arrowSwap: ["Switching quivers — {arrow} next.", "{arrow} nocked. Try me now."],
    regen: ["The healers' hands close my wounds. ✚{amt}"],
  };

  /* Temperament VOICES (GUI-49): when a fighter's loudest trait crosses the
   * PERSONALITY.label threshold, their bubbles speak in that voice for the
   * marquee moments — big hits, crits, misses, evades, charges, retreats.
   * Everyone else (and every other event) keeps the neutral pools. */
  const TFP = {
    Ferocious: {
      bigHit: ["BLOOD! Give me MORE!", "I'll tear you APART!"],
      crit: ["RIP AND RUIN!", "Your guard means NOTHING to me!"],
      miss: ["ARGH — stand STILL!", "You can't dodge me forever!"],
      evade: ["Pathetic swing!", "Is that ALL your arm can do?"],
      charge: ["RAAAH — no more distance!", "I'm going to EAT you alive!"],
      retreat: ["Back — but only to charge again!", "Range won't save you from me!"],
    },
    Fearless: {
      bigHit: ["Ha! Felt that, did you?", "Come on — hit me BACK!"],
      crit: ["Straight through — no fear, no hesitation!", "THAT is how the brave strike!"],
      miss: ["A flinch? Never. Again!", "Missed — and still not afraid."],
      evade: ["You'll have to do better than that!", "I don't blink."],
      charge: ["Face me!", "No shield, no fear — HERE I come!"],
      retreat: ["Range favors the bold too.", "I retreat from nothing — I reposition."],
    },
    Ambitious: {
      bigHit: ["One step closer to the throne.", "Remember this blow when they crown me."],
      crit: ["This is what DESTINY feels like!", "Carve my name into the ladder!"],
      miss: ["A setback. Nothing more.", "The climb allows a stumble."],
      evade: ["You won't stall my rise.", "Destiny doesn't stand where you swing."],
      charge: ["History doesn't wait!", "My legend starts at arm's length!"],
      retreat: ["A tactical step — the crown is patient.", "I'll win this from wherever I please."],
    },
    Cunning: {
      bigHit: ["You never saw the real strike coming.", "Exactly where I wanted you."],
      crit: ["The trap SPRINGS!", "Check… and mate."],
      miss: ["Interesting… noted.", "That miss? Bait."],
      evade: ["I read you three moves ago.", "Swing at where I was, by all means."],
      charge: ["Closer… just as planned.", "Let's change the game, shall we?"],
      retreat: ["Chase me. Go on.", "Every step back is a thread in the web."],
    },
    Disciplined: {
      bigHit: ["Form. Timing. Result.", "Practiced ten thousand times. Felt once."],
      crit: ["Textbook. Devastating.", "Precision is mercy — this ends quicker."],
      miss: ["Recalibrating.", "Error logged. It won't repeat."],
      evade: ["Sloppy. I am not.", "Your footwork betrayed that a mile away."],
      charge: ["Advance. Engage.", "Closing distance — by the book."],
      retreat: ["Withdraw. Reset. Continue.", "Distance is a tool like any other."],
    },
    Cruel: {
      bigHit: ["Scream for them, won't you?", "I felt that one from HERE. Delicious."],
      crit: ["Oh, that one will SCAR.", "Beg. It won't help — but do beg."],
      miss: ["Tsk. I wanted that to HURT.", "Hold still — this is meant to be slow."],
      evade: ["Wriggle, little worm.", "Prolong it. I don't mind at all."],
      charge: ["Let me hurt you properly.", "Close enough to hear you whimper."],
      retreat: ["I'll bleed you from afar.", "Die slowly at range, then."],
    },
    Steadfast: {
      bigHit: ["For the Stronghold!", "This arm has never once failed them."],
      crit: ["The wall strikes BACK!", "Stand or fall — I know which I do."],
      miss: ["Steady. Again.", "A miss bends nothing in me."],
      evade: ["I do not break.", "You'll tire before I yield."],
      charge: ["Shoulder to shoulder — forward!", "I hold the line wherever it stands."],
      retreat: ["The line holds, even from range.", "Ground given, never lost."],
    },
    Grasping: {
      bigHit: ["That's coin in MY purse!", "Every drop of that is owed to me!"],
      crit: ["JACKPOT!", "I'll be counting THIS one for weeks!"],
      miss: ["Wasted effort — costly.", "That swing came out of MY winnings."],
      evade: ["You'll not take what's mine!", "Not one copper of damage, thank you."],
      charge: ["Time is money — let's finish this!", "The purse is close — so am I!"],
      retreat: ["I protect my investment.", "Risk management, friend."],
    },
  };

  // One chat line: {side: "L"|"R"|"N"|null, name, text} — null = skip.
  function chatFor(ev, i, ctx) {
    const seed = i * 131 + (ev.roll || 0) * 17 + (ev.dmg || 0) * 5;
    const V = (arr) => pickVar(arr, seed);
    const rollS = ev.roll != null ? ` <span class="roll">[d20: ${ev.roll}]</span>` : "";
    const dmgS = ev.dmg != null ? ` <b>−${ev.dmg}</b>` : "";
    const strikeS = ev.strikes > 1 && ev.strike ? `<span class="sys">${["", "1st", "2nd", "3rd", "4th"][ev.strike] || ev.strike + "th"}:</span> ` : "";
    const w = (name, kind) => ctx.weaponOf(name, kind);
    // `act` = the plain ACTION LABEL above the quip — what they actually did (GUI-64).
    const F = (name, text, act) => ({ side: name === ctx.youName ? "L" : "R", name, text, act: act || "", temper: ctx.temperOf(name) });
    const TV = (name, key) => { const t = TFP[ctx.temperOf(name)]; return t && t[key] ? pickVar(t[key], seed) : null; };
    const N = (text) => ({ side: "N", name: "", text });
    switch (ev.t) {
      case "round":
        if (ev.n === 1) return null;
        return { side: "DIV", name: "", text: `— Round ${ev.n} — ${esc(ctx.youName)} <b>${ev.youHp}</b>/${ev.youMaxHp}${ev.youMaxMp > 0 ? ` · ${ev.youMp}MP` : ""} ⚔ ${esc(ctx.foeName)} <b>${ev.foeHp}</b>/${ev.foeMaxHp}${ev.foeMaxMp > 0 ? ` · ${ev.foeMp}MP` : ""}` };
      case "initiative": return N(`⚡ ${esc(ev.first)} moves first${ev.youRoll != null ? ` <span class="roll">[${Math.max(ev.youRoll, ev.foeRoll)} vs ${Math.min(ev.youRoll, ev.foeRoll)}]</span>` : ""}`);
      case "move": return F(ev.who, TV(ev.who, ev.to === "melee" ? "charge" : "retreat") || V(ev.to === "melee" ? FP.charge : FP.retreat), ev.to === "melee" ? "🏃 Charges to melee" : "↩️ Falls back to range");
      case "hit": {
        const tier = dmgTier(ev.dmg);
        const weapon = ev.arrow && ARROWS[ev.arrow] ? ARROWS[ev.arrow].noun : w(ev.who, ev.kind);
        const base = ev.crit ? (TV(ev.who, "crit") || V(FP.crit))
          : (tier >= 2 && TV(ev.who, "bigHit")) || fill(V((ev.kind === "melee" ? FP.meleeHit : FP.missileHit)[tier]), { w: weapon });
        return F(ev.who, base + dmgS + (ev.crit ? ' <span class="crit">CRIT!</span>' : "") + (ev.dual ? ' <span class="dual-tag">⚔️⚔️ dual</span>' : "") + rollS + shieldNote(ev) + armorNote(ev),
          strikeS + (ev.kind === "melee" ? `⚔️ Strikes — ${weapon}` : `🏹 Shoots — ${weapon}`) + " · HIT");
      }
      case "miss": return F(ev.who, (TV(ev.who, "miss") || V(FP.miss)) + rollS, strikeS + (ev.kind === "melee" ? `⚔️ Strikes — ${w(ev.who, ev.kind)}` : `🏹 Shoots — ${w(ev.who, ev.kind)}`) + " · MISS");
      case "evade": case "dodge": return F(ev.who, (TV(ev.who, "evade") || V(FP.evade)) + (ev.roll != null ? ` <span class="roll">[d20: ${ev.roll}]</span>` : ""), "💨 Evades the attack");
      case "critmiss": return F(ev.who, V(FP.critmiss) + rollS, strikeS + "💫 FUMBLES — stunned next round");
      case "recover": return F(ev.who, V(FP.recover), "😵 Stunned — turn lost");
      case "hide": return F(ev.who, V(ev.success ? FP.hideOk : FP.hideFail) + rollS, ev.success ? "🌑 Hides in shadows" : "🌑 Tries to hide · FAILS");
      case "spell": {
        const pool = FP.spells[ev.skill] || FP.spellGeneric;
        return F(ev.who, fill(V(pool), { S: ev.skill }) + dmgS + (ev.crit ? ' <span class="crit">CRIT!</span>' : "") + rollS + shieldNote(ev) + armorNote(ev), `🔮 Casts ${ev.skill} · HIT`);
      }
      case "fizzle": return F(ev.who, V(ev.reason === "no mp" ? FP.fizzleNoMp : FP.fizzle) + rollS, ev.reason === "no mp" ? "🔮 Tries to cast · NO MANA" : `🔮 Casts ${ev.skill || "a spell"} · FIZZLES`);
      case "applyDot": return F(ev.who, V(FP.applyDot) + ` <span class="poison-tag">${ev.turns} turns</span>` + rollS, `☠️ Casts ${ev.skill || "Poison Cloud"} · lands`);
      case "applyCurse": return F(ev.who, fill(V(FP.applyCurse), { turns: ev.turns }) + rollS, `🕸️ Casts ${ev.skill || "Curse"}`);
      case "heal": return F(ev.who, fill(V(FP.heal), { amt: ev.amt }) + rollS, `💚 Casts ${ev.skill || "a healing prayer"}`);
      case "item": return F(ev.who, V(ev.effect === "fullmana" ? FP.itemMana : FP.itemLife), ev.effect === "fullmana" ? "🔷 Drinks a mana potion" : "🧪 Drinks a healing potion");
      case "shield": return F(ev.who, fill(V(FP.shield), { amount: ev.amount }) + rollS, "🛡️ Casts Shield of Faith");
      case "summonWeapon": return F(ev.who, V(FP.spirit) + ` <span class="sys">(${ev.turns} rounds)</span>` + rollS, "🗡️ Summons a Spiritual Weapon");
      case "summon": return F(ev.who, fill(V(FP.summon), { hp: ev.hp }) + rollS, "🌪️ Summons an Air Elemental");
      case "arrowSwap": return F(ev.who, fill(V(FP.arrowSwap), { arrow: ev.arrow }), `🔄 Loads ${ev.arrow} (full turn)`);
      case "regen": return F(ev.who, fill(V(FP.regen), { amt: ev.amt }), "✚ Tended by the healers");
      // The Narrator keeps the scene: DoTs, pets, arrow effects, the fall.
      case "poison": return N((ev.dotType === "burn" ? "🔥" : "☠️") + ` ${esc(ev.who)} ${ev.dotType === "burn" ? "burns" : "chokes on poison"} for <b>${ev.dmg}</b>.`);
      case "arrowFx": return N(ev.fx === "slow" ? `❄️ Frost slows ${esc(ev.target)} for ${ev.turns} rounds.` : `🔥 ${esc(ev.target)} catches fire — ${ev.turns} rounds of flame.`);
      case "petHit": return N(`${ev.who === "Spiritual Weapon" ? "🗡️ The spirit blade" : "🌪️ The elemental"} tears at ${esc(ev.target)} for <b>${ev.dmg}</b>${ev.crit ? ' <span class="crit">CRIT!</span>' : ""}.${shieldNote(ev)}${armorNote(ev)}`);
      case "petMiss": return N(`🗡️ The spirit blade glances wide of ${esc(ev.target)}.`);
      case "petMove": return N(`🗡️ ${esc(ev.who)} flies in to engage.`);
      case "petDown": return N(`💨 ${esc(ev.who)} is torn apart and scatters.`);
      case "petExpire": return N(`💨 ${esc(ev.who)} fades, its purpose served.`);
      case "end": {
        const W = ev.result === "won" ? ctx.youName : ctx.foeName;
        const L = ev.result === "won" ? ctx.foeName : ctx.youName;
        return { side: "KO", name: "", text: `💀 ${fill(pickVar(DEATH_THEATRE, seed), { W: `<b>${esc(W)}</b>`, L: `<b>${esc(L)}</b>` })}` };
      }
      default: return null;
    }
  }

  /* HP/MP after every log event (drives the duel header, GUI-64). Maxes come
   * from the round snapshots; logs without them (pre-v0.17) hide the bars. */
  function hpTimeline(log, yn, fn) {
    let known = false;
    const st = { yHp: 0, yMax: 0, yMp: 0, yMpMax: 0, fHp: 0, fMax: 0, fMp: 0, fMpMax: 0 };
    const out = [];
    const dmgTo = (name, real) => {
      if (name === yn) st.yHp = Math.max(0, st.yHp - real);
      else if (name === fn) st.fHp = Math.max(0, st.fHp - real);
    };
    const healTo = (name, amt) => {
      if (name === yn) st.yHp = Math.min(st.yMax || 1e9, st.yHp + amt);
      else if (name === fn) st.fHp = Math.min(st.fMax || 1e9, st.fHp + amt);
    };
    for (const ev of log) {
      switch (ev.t) {
        case "round":
          known = true;
          st.yHp = ev.youHp; st.yMax = ev.youMaxHp; st.yMp = ev.youMp; st.yMpMax = ev.youMaxMp;
          st.fHp = ev.foeHp; st.fMax = ev.foeMaxHp; st.fMp = ev.foeMp; st.fMpMax = ev.foeMaxMp;
          break;
        case "hit": case "spell": case "petHit":
          dmgTo(ev.target, Math.max(0, (ev.dmg || 0) - (ev.absorbed || 0) - (ev.mitigated || 0)));
          break;
        case "poison": dmgTo(ev.who, ev.dmg || 0); break;
        case "heal": case "regen": healTo(ev.who, ev.amt || 0); break;
        case "item":
          if (ev.effect === "fullheal") { if (ev.who === yn) st.yHp = st.yMax; else if (ev.who === fn) st.fHp = st.fMax; }
          else if (ev.who === yn) st.yMp = st.yMpMax; else if (ev.who === fn) st.fMp = st.fMpMax;
          break;
      }
      out.push(known ? { ...st } : null);
    }
    return out;
  }

  // One rendered chat row — shared by the parchment AND the live battle (GUI-66).
  function chatRow(c, i, opts) {
    const a = opts.anim ? " anim" : "";
    if (c.side === "DIV") return `<div class="chat-div${a}">${c.text}</div>`;
    if (c.side === "KO") return `<div class="chat-row mid${a}"><div class="bubble ko">${c.text}</div></div>`;
    if (c.side === "N") return `<div class="chat-row mid${a}"><div class="bubble nar">${c.text}</div></div>`;
    const side = (c.side === "L") !== opts.flip ? "right" : "left"; // b.you sits right unless the player is the foe
    const kill = opts.kill ? `<span class="crit">☠️ THE KILLING BLOW</span><br>` : "";
    return `<div class="chat-row ${side}${a}">
      <div class="chat-ava">${opts.emojiOf(c.name)}</div>
      <div class="bubble ${side === "right" ? "me" : "them"}">${kill}<span class="chat-name plink" data-act="profile" data-arg="${esc(c.name)}">${esc(c.name)}${c.temper ? ` <span class="sys">· ${c.temper}</span>` : ""}</span>${c.act ? `<span class="chat-act">${c.act}</span>` : ""}${c.text}</div>
    </div>`;
  }

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
    // The player always chats from the RIGHT side, like any messenger.
    const flip = b.foe.name === s.player.name;
    const emojiOf = (n) => { const c = CLASSES[ctx.classOf(n)]; return c ? c.emoji : "⚔️"; };
    // The last damaging strike before the end is THE KILLING BLOW.
    const endIdx = log.findIndex((e) => e.t === "end");
    let killIdx = -1;
    for (let i = (endIdx < 0 ? log.length : endIdx) - 1; i >= 0; i--) {
      if (["hit", "spell", "petHit", "poison"].includes(log[i].t) && (log[i].dmg || 0) > 0) { killIdx = i; break; }
    }
    const timeline = hpTimeline(log, b.you.name, b.foe.name);
    const rows = []; // [{html, logIdx}] — the theater slices this
    log.forEach((ev, i) => {
      const c = chatFor(ev, i, ctx);
      if (!c) return;
      rows.push({ html: chatRow(c, i, { flip, emojiOf, kill: i === killIdx }), logIdx: i });
    });
    const intro = `<div class="chat-row mid"><div class="bubble nar">⚔️ <b>${esc(b.you.name)}</b> and <b>${esc(b.foe.name)}</b> face off across the sand — the crowd leans in…</div></div>`;

    // ---- the DUEL HEADER: pinned HP/MP bars driven by the timeline ----
    const play = ui.play ? ((ui.play.total = rows.length), (ui.play.idx = Math.min(ui.play.idx, rows.length)), ui.play) : null;
    const shownRows = play ? rows.slice(0, play.idx) : rows;
    const stIdx = play ? (play.idx > 0 ? rows[Math.min(play.idx, rows.length) - 1].logIdx : -1) : log.length - 1;
    const st = stIdx >= 0 ? timeline[stIdx] : timeline.find((x) => x); // first known state pre-play
    const fighterHead = (name, hp, max, mp, mpMax, side) =>
      `<div class="duel-side ${side}"><div class="duel-name">${emojiOf(name)} ${plink(s, name)}</div>${bar("hp", hp, max)}${mpMax > 0 ? bar("mp", mp, mpMax) : ""}</div>`;
    const leftName = flip ? b.you.name : b.foe.name; // whoever chats LEFT
    const head = st ? `<div class="duel-head">${
      leftName === b.foe.name
        ? fighterHead(b.foe.name, st.fHp, st.fMax, st.fMp, st.fMpMax, "left") + `<div class="duel-vs">⚔</div>` + fighterHead(b.you.name, st.yHp, st.yMax, st.yMp, st.yMpMax, "right")
        : fighterHead(b.you.name, st.yHp, st.yMax, st.yMp, st.yMpMax, "left") + `<div class="duel-vs">⚔</div>` + fighterHead(b.foe.name, st.fHp, st.fMax, st.fMp, st.fMpMax, "right")
    }</div>` : "";

    // ---- controls: transcript ↔ the replay theater ----
    const done = play && play.idx >= rows.length;
    const controls = play
      ? `<div class="alloc-row" style="justify-content:center;gap:8px;margin:6px 0">
          ${done
            ? `<button class="btn sm" data-act="replay-start">⏮ Again</button><button class="btn sm ghost" data-act="replay-skip">📜 Transcript</button>`
            : `<button class="btn sm" data-act="replay-toggle">${play.on ? "⏸ Pause" : "▶ Resume"}</button>
               <button class="btn sm ghost" data-act="replay-speed">${play.fast ? "⏩ 2×" : "▶️ 1×"}</button>
               <button class="btn sm ghost" data-act="replay-skip">⏭ Skip</button>`}
        </div>`
      : `<div class="alloc-row" style="justify-content:center;margin:6px 0">
          <button class="btn sm gold" data-act="replay-start">▶ Replay the bout</button>
        </div>`;

    const chatBody = play
      ? `<div class="chat stage">${play.idx === 0 ? intro : ""}${shownRows.map((r) => r.html).join("")}</div>`
      : `<div class="chat">${intro}${rows.map((r) => r.html).join("")}</div>`;

    return topbar(s.player) + `<div class="screen">
      <button class="btn ghost sm" data-act="tab" data-arg="board" style="margin:4px 0 10px">← The board</button>
      <div class="screen-title">${rec.throne ? "👑 The Throne Duel" : "⚔️ " + esc(rec.a.name) + " vs " + esc(rec.b.name)}</div>
      <p class="card-sub center">🏆 ${esc(rec.winner)} · ${rec.rounds} rounds${rec.spec ? ` · ${starsOf(rec.spec)}` : ""}</p>
      ${head}
      ${controls}
      ${chatBody}
      <p class="card-sub center" style="margin-top:8px">— faithfully transcribed by the Scribe 🖋️</p>
    </div>`;
  }

  // The theater's clockwork: reveal the next bubble on a cadence (GUI-64).
  function replayTick() {
    clearTimeout(ui.playTimer);
    if (!ui.play || !ui.play.on) return;
    ui.playTimer = setTimeout(() => {
      if (!ui.play || !ui.play.on) return;
      ui.play.idx += 1;
      if (ui.play.idx >= ui.play.total) ui.play.on = false;
      render(game.state);
    }, ui.play.fast ? 450 : 950);
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
    // 🌾 The larder (GUI-76): stock, this year's price, and the provisioning decree.
    const cap = game.granaryCap();
    const stock = st.stock == null ? cap : st.stock;
    const need = game.provisionNeed();
    const daysLeft = need > 0 ? Math.floor(stock / need) : 99;
    const pol = st.provisionPolicy || "fill";
    const polBtn = (id, label) => `<button class="btn sm ${pol === id ? "" : "ghost"}" data-act="provision" data-arg="${id}">${label}</button>`;
    const granary = `<div class="card"><div class="card-title">🌾 The larder <span class="pill">${stock}/${cap}</span>${stock < need ? ' <span class="pill" style="color:var(--bad,#e66)">⚠️ STARVING</span>' : daysLeft <= 2 ? ' <span class="pill" style="color:var(--warn,#eb5)">runs low</span>' : ""}</div>
      <div class="card-sub">The hold eats <b>${need}</b>/day${st.archetype === "hunter" ? " (the hunt feeds " + G.data.STEW.hunterTrickle + ")" : ""} · grain at <b>${st.grainPrice || 1}g</b> this year. An empty larder wears your fighters, thins the crowd, and — season on season — empties the beds.</div>
      <div class="alloc-row" style="margin-top:6px">${polBtn("fill", "🧺 Keep it full")}${polBtn("half", "⚖️ Half stores")}${polBtn("none", "🚫 Buy nothing")}</div></div>`;
    return `<div class="card"><div class="card-title">📜 Decrees</div>
      ${row("ticketPrice", "🎫", "Ticket price", "g", "Steeper tickets thin the crowd.")}
      ${row("taxRate", "🧾", "Sales tax", "%", "Heavy taxes leave champions poorly geared — and the fights duller.")}
      ${row("purse", "🏆", "Band purse", "g", "Fat purses draw crowds — and drain the coffers.")}
    </div>` + granary + (() => {
      // 🧲 The Pull card (GUI-78): the migration bar the Lord can move.
      const pull = game.pullScore();
      const mig = (s.lastDay || {}).migration;
      return `<div class="card"><div class="card-title">🧲 The hold's Pull <span class="pill ${pull >= 50 ? "on" : ""}">${pull}</span></div>
        <div class="card-sub">Fat purses, sound roofs, light taxes, a full larder, famous names and a steady crown draw settlers — 50 holds the line, less empties beds.${mig ? ` Last year: <b>${mig.arrivals}</b> arrived where <b>${mig.churn}</b> left.` : ""}</div>
        <div class="card-row" style="margin-top:6px">
          <div style="flex:1"><div class="card-title" style="font-size:14px">📯 Heralds abroad: <b>${s.stronghold.heralds || 0}g</b>/year</div>
          <div class="card-sub">Criers in far taverns sing your games — the first coin shouts loudest.</div></div>
          <button class="btn sm ghost" data-act="decree" data-arg="heralds:-25">−</button>
          <button class="btn sm" data-act="decree" data-arg="heralds:25" style="margin-left:6px">+</button></div></div>`;
    })() + (() => {
      // 🐫 The trade card (GUI-77): the founders' ledger is a map of routes.
      const routes = game.tradeRoutes();
      if (!routes.length) return "";
      const stance = st.tradeStance || "export";
      const season = s.clock.season;
      const stanceBtn = (id, label) => `<button class="btn sm ${stance === id ? "" : "ghost"}" data-act="trade-stance" data-arg="${id}">${label}</button>`;
      const rows = routes.map((r) => {
        const arch = G.data.ARCHETYPES[r.archetype];
        const fp = game.foreignPrice(r.name, season);
        return `<div class="card-row" style="margin-top:6px;${r.open ? "" : "opacity:.5"}">
          <div style="flex:1"><div class="card-title" style="font-size:14px">${arch ? arch.emoji : "🏰"} ${esc(r.name)} ${r.kind === "child" ? `<span class="sys">founded by ${plink(s, r.founder)}</span>` : `<span class="sys">neighbour</span>`}</div>
          <div class="card-sub">grain there: <b>${fp}g</b> ${fp < (st.grainPrice || 1) ? "🟢 cheap — buy" : "🔴 dear — sell"}</div></div>
          <button class="btn sm ${r.open ? "" : "ghost"}" data-act="trade-route" data-arg="${esc(r.name)}">${r.open ? "open" : "closed"}</button></div>`;
      }).join("");
      const tr = (s.lastDay || {}).trade;
      return `<div class="card"><div class="card-title">🐫 Trade routes <span class="pill">${routes.filter((r) => r.open).length}/${routes.length} open</span></div>
        <div class="card-sub">Caravans run once a year. ${tr ? `Last year: <b>${tr.net >= 0 ? "+" : ""}${tr.net}🪙</b>${tr.provisions ? ` · +${tr.provisions} provisions` : ""}.` : "Export goods where grain sells dear; stockpile where it's cheap."}</div>
        <div class="alloc-row" style="margin-top:6px">${stanceBtn("export", "💰 Export")}${stanceBtn("balance", "⚖️ Balance")}${stanceBtn("stockpile", "🌾 Stockpile")}</div>
        ${rows}</div>`;
    })();
  }

  // Stronghold buildings (GUI-15): level the arena, and it serves its Lord.
  function buildingsBlock(s) {
    const st = s.stronghold;
    if (!st || !st.buildings) return "";
    const row = ([id, def]) => {
      const lvl = st.buildings[id] || 0;
      const maxed = lvl >= def.max;
      const cost = maxed ? null : game.buildCost(id); // quarry-founded holds pay less (GUI-85)
      const afford = cost != null && st.treasury >= cost;
      // Condition (GUI-75): built buildings wear; a worn one shows its state and a 🔧.
      const c = lvl > 0 ? game.condOf(id) : null;
      const rc = game.repairCost(id);
      const condPill = c != null && c < 100 ? ` <span class="pill" style="${c === 0 ? "color:var(--bad,#e66)" : c < 50 ? "color:var(--warn,#eb5)" : ""}">${c === 0 ? "🏚️ RUIN" : c + "%"}</span>` : "";
      const repairBtn = rc != null ? `<button class="btn sm" data-act="repair" data-arg="${id}" ${st.treasury >= rc ? "" : "disabled"}>🔧 ${rc}</button>` : "";
      return `<div class="card-row" style="margin-top:6px">
        <div style="flex:1"><div class="card-title" style="font-size:14px">${def.emoji} ${def.name} <span class="pill">${"▮".repeat(lvl)}${"▯".repeat(def.max - lvl)}</span>${condPill}</div>
        <div class="card-sub">${def.desc}</div></div>
        ${repairBtn}${maxed ? `<span class="pill on">MAX</span>` : `<button class="btn sm gold" data-act="build" data-arg="${id}" ${afford ? "" : "disabled"}>🏛️ ${cost}</button>`}</div>`;
    };
    const entries = Object.entries(G.data.BUILDINGS);
    const keep = entries.filter(([, d]) => !d.era).map(row).join("");
    const era1 = entries.filter(([, d]) => d.era === 1).map(row).join("");
    const era2 = entries.filter(([, d]) => d.era === 2).map(row).join("");
    const dueIds = Object.keys(G.data.BUILDINGS).filter((id) => game.repairCost(id) != null);
    const dueTotal = dueIds.reduce((sum, id) => sum + game.repairCost(id), 0);
    return `<div class="card"><div class="card-title">🏗️ The Stronghold${dueTotal ? ` <button class="btn sm" data-act="repair-all" ${st.treasury >= dueTotal ? "" : "disabled"}>🔧 Repair all — ${dueTotal}</button>` : ""}</div>${keep}
      <div class="card-sub center" style="margin-top:10px"><b>— Era I · the Arena —</b></div>${era1}
      <div class="card-sub center" style="margin-top:10px"><b>— Era II · Stewardship —</b></div>${era2}</div>`;
  }

  // The Lord's view of a finished day: the games he presided over.
  function screenLordSunset(s) {
    const d = s.lastDay || {};
    let seasonNote = "";
    if (d.seasonEnd) {
      const t = d.seasonEnd.top[0];
      seasonNote = `<div class="levelup">🍂 Year ${d.seasonEnd.season} closes under your reign. ${t ? `<b>${esc(t.name)}</b> is the people's favourite (⭐ ${t.popularity}).` : ""} None dare challenge you… yet.</div>`;
    }
    const L = d.ledger;
    const money = L ? `<div class="card"><div class="card-title">🏛️ The day's ledger <span class="pill">${L.attendance} spectators · avg ${L.avgSpec}★</span></div>
      <div class="card-sub">🎫 Gate ${L.gate} · 🎲 Wagers ${L.wagers} · 🏪 Licences ${L.licences} · 🧾 Tax ${L.tax}</div>
      <div class="card-sub">🏆 Purses −${L.purses} · 🌾 Provisions −${L.provisions || 0}${L.starving ? ' · <b style="color:var(--bad,#e66)">the hold STARVED today</b>' : ""}</div>
      ${d.trade ? `<div class="card-sub">🐫 Caravans (${d.trade.stance}, ${d.trade.routes} route${d.trade.routes === 1 ? "" : "s"}): <b>${d.trade.net >= 0 ? "+" : ""}${d.trade.net}</b> 🪙${d.trade.provisions ? ` · +${d.trade.provisions} provisions` : ""}</div>` : ""}
      <div class="card-title" style="margin-top:6px">${L.net >= 0 ? "Net +" : "Net "}${L.net} 🪙 → treasury <b>${s.stronghold.treasury}</b>${s.stronghold.treasury < 0 ? ' <span class="pill">⚠️ the coffers run dry</span>' : ""}</div>
    </div>` : "";
    return topbar(s.player) + `<div class="screen">
      <div class="screen-title">👑 The games conclude — Day ${d.seasonEnd ? G.data.SEASON.days : s.clock.day - 1}, Year ${d.seasonEnd ? d.seasonEnd.season : s.clock.season}</div>
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
      ${bouts ? `<div class="card"><div class="card-title">The gauntlet</div>${bouts}</div>` : `<p class="card-sub center">You have no household — ${esc(npc.name)} comes to you ${wornPct < 100 ? "<b>bloodied by your walls</b>" : "untouched"}.</p>`}
      <div class="card"><div class="card-row"><div class="avatar">${CLASSES[ch.classId].emoji}</div>
        <div><div class="card-title">${esc(npc.name)} <span class="pill">${CLASSES[ch.classId].name} · ${ch.wins}w</span></div>
        <div class="card-sub">Worn to <b>${wornPct}%</b> — the gauntlet takes its toll. You fight FRESH, on your own sand.</div></div></div></div>
      ${(() => { // 🗼 The Watchtower's report (GUI-81): the taller the tower, the finer the intel.
        const wt = Math.floor(game.bEff("watchtower")); // a crumbling tower sees less (GUI-75)
        if (!wt) return "";
        const temper = npc.personality ? G.data.PERSONALITY.label(npc.personality) : "";
        return `<div class="card"><div class="card-title" style="font-size:14px">🗼 The watchtower's report</div>
          ${temper ? `<div class="card-sub">temperament: <b>${temper}</b></div>` : `<div class="card-sub">an unremarkable temperament</div>`}
          ${wt >= 2 ? arsenalLine(s, npc.name) + styleLine(s, npc.name) : `<div class="card-sub sys">a taller tower would count their blades…</div>`}</div>`;
      })()}
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
        ? `After <b>${t.reignSeasons || "?"}</b> year${t.reignSeasons === 1 ? "" : "s"} of rule, Lord ${esc((s.player || {}).name || "?")} passes in the high seat at a great age, crown untaken. The rarest of endings — the bards will sing of it for a hundred years.`
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
      // GUI-49: the loudest trait names the voice ("" = even-tempered/neutral).
      temperOf: (n) => { const f = fighterOf(n); return f && f.personality ? G.data.PERSONALITY.label(f.personality) : ""; },
    };
  }
  // The last damaging event of a finished fight — narrated as the "final blow".
  function lastBlowLine(b, ctx) {
    for (let i = b.log.length - 1; i >= 0; i--) {
      if (["hit", "spell", "poison", "petHit"].includes(b.log[i].t)) return narrate(b.log[i], i, ctx, false);
    }
    return "";
  }

  // Condensed status tags for the live duel header (GUI-68).
  function duelTags(f) {
    const t = [];
    if (f.poison && f.poison.turns > 0) t.push(`<span class="poison-tag">${f.poison.type === "burn" ? "🔥" : "☠️"}${f.poison.turns}</span>`);
    if (f.cursed > 0) t.push(`<span class="curse-tag">🕸️${f.cursed}</span>`);
    if (f.shield > 0) t.push(`<span class="shield-tag">🛡️${f.shield}</span>`);
    if (f.autoCritNext) t.push(`<span class="hidden-tag">🌑</span>`);
    if (f.slowed > 0) t.push(`<span class="slow-tag">❄️${f.slowed}</span>`);
    if (f.armor && f.armorDurability > 0) t.push(`<span class="armor-tag">${ARMOR[f.armor].emoji}DR${f.armorDR}·${f.armorDurability}</span>`);
    if (f.pet && f.pet.hp !== undefined && f.pet.hp > 0) t.push(`<span class="pill">${f.pet.emoji}${f.pet.hp}/${f.pet.maxHp}</span>`);
    else if (f.pet && f.pet.hp === undefined) t.push(`<span class="pill">${f.pet.emoji}${f.pet.turns != null ? f.pet.turns + "r" : ""}${f.pet.strikes > 1 ? "×" + f.pet.strikes : ""}</span>`);
    return t.length ? `<div class="duel-tags">${t.join("")}</div>` : "";
  }

  // The live duel header — same shape as the parchment (foe LEFT, you RIGHT,
  // matching the chat sides), fed by the living fighters (GUI-68).
  function battleDuelHead(b) {
    const side = (f, cls) => `<div class="duel-side ${cls}">
      <div class="duel-name">${f.emoji} <span class="plink" data-act="profile" data-arg="${esc(f.name)}">${esc(f.name)}</span> <span class="roll">·${f.wins}w</span></div>
      ${bar("hp", f.hp, f.maxHp)}${f.maxMp > 0 ? bar("mp", f.mp, f.maxMp) : ""}${duelTags(f)}
    </div>`;
    return `<div class="duel-head live">${side(b.foe, "left")}<div class="duel-vs">⚔</div>${side(b.you, "right")}</div>`;
  }

  function screenBattle(s) {
    const b = s.battle, pName = s.player.name;
    const ctx = battleCtx(b, pName);
    // The live log speaks the same language as the Scribe reports (GUI-66):
    // chat bubbles, action labels, first-person voices, round dividers.
    const emojiOf = (n) => { const c = CLASSES[ctx.classOf(n)]; return c ? c.emoji : "⚔️"; };
    const intro = `<div class="chat-row mid"><div class="bubble nar">⚔️ <b>${esc(b.you.name)}</b> vs <b>${esc(b.foe.name)}</b> the ${CLASSES[b.foe.classId].name} — the crowd leans in…</div></div>`;
    const lines = intro + b.log.map((ev, i) => {
      const c = chatFor(ev, i, ctx);
      return c ? chatRow(c, i, { flip: false, emojiOf, anim: i >= ui.shownLog }) : "";
    }).join("");
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
      ${battleDuelHead(b)}
      ${rangeBanner(b.range)}
      <div class="log chatlog" id="battle-log">${lines || '<p class="sys shown">The arena bell rings — you face off at missile range. Choose your move…</p>'}</div>
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
    if (ui.holdOpen) html += holdOverlay(s); // beneath a champion profile, if both are open
    if (ui.profileName) html += profileOverlay(s);
    app.innerHTML = html;
    // The replay theater's clockwork runs only while a parchment plays (GUI-64).
    if (s.screen === "parchment") replayTick();
    else if (ui.play) { ui.play = null; clearTimeout(ui.playTimer); }
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
      case "view-bout": { const [di, bi] = arg.split(":"); ui.play = null; clearTimeout(ui.playTimer); game.openBout(parseInt(di, 10), parseInt(bi, 10)); break; }
      case "replay-start": ui.play = { idx: 0, on: true, fast: false, total: Infinity }; render(game.state); break;
      case "replay-toggle": if (ui.play) { ui.play.on = !ui.play.on; render(game.state); } break;
      case "replay-speed": if (ui.play) { ui.play.fast = !ui.play.fast; render(game.state); } break;
      case "replay-skip": ui.play = null; clearTimeout(ui.playTimer); render(game.state); break;
      case "board-band": ui.boardBand = arg; render(game.state); break;
      case "profile": ui.profileName = arg; render(game.state); break;
      case "profile-close": ui.profileName = null; render(game.state); break;
      case "hold": ui.holdOpen = true; render(game.state); break;
      case "hold-close": ui.holdOpen = false; render(game.state); break;
      case "profile-noop": break;
      case "servant-move": { const [sid, dir] = arg.split(":"); game.moveServant(sid, parseInt(dir, 10)); break; }
      case "rename-hold": { const n = typeof prompt === "function" ? prompt("Name your Stronghold:", (game.state.stronghold || {}).name || "") : null; if (n) game.renameHold(n); break; }
      case "repair": game.repairBuilding(arg); break;
      case "provision": game.setProvisionPolicy(arg); break;
      case "trade-stance": game.setTradeStance(arg); break;
      case "trade-route": game.toggleRoute(arg); break;
      case "repair-all": for (const id of Object.keys(G.data.BUILDINGS)) if (game.repairCost(id) != null) game.repairBuilding(id); break;
      case "board-day": ui.boardDay = parseInt(arg, 10); ui.boardBand = null; render(game.state); break;
      case "board-season": {
        const seasons = [...new Set(game.state.board.map((d) => d.season))].sort((a, b) => a - b);
        const si = seasons.indexOf(ui.boardSeason);
        const next = seasons[si + parseInt(arg, 10)];
        if (next != null) { ui.boardSeason = next; ui.boardDay = null; ui.boardBand = null; }
        render(game.state);
        break;
      }
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
        const holdEl = document.getElementById("hold-name");
        game.createCharacter(ui.selectedClass, name.trim(), undefined, holdEl ? holdEl.value : "");
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

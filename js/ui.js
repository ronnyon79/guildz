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

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ---------- top bar / nav ----------
  function topbar(p) {
    return `<div class="topbar">
      <div class="brand">⚔️ Guildz</div>
      <div class="resources">
        <span class="res">🪙 <b>${p ? p.gold : 0}</b></span>
        <span class="res">🏅 <b>${p ? p.wins : 0}</b> wins</span>
      </div>
    </div>`;
  }
  function tabbar(active) {
    const tabs = [["home", "🏟️", "Arena"], ["shop", "🛒", "Shop"], ["hero", "🛡️", "Hero"]];
    return `<nav class="tabbar">${tabs
      .map(([id, ic, label]) => `<button class="tab ${active === id ? "is-active" : ""}" data-act="tab" data-arg="${id}">${ic}<span>${label}</span></button>`)
      .join("")}</nav>`;
  }

  // ---------- screens ----------
  function screenTitle() {
    return `<div class="title-wrap">
      <div class="title-logo">⚔️</div>
      <div class="title-name">Guildz</div>
      <div class="title-sub">Arena of champions</div>
      <button class="btn lg" data-act="new-character">Enter the Arena</button>
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

  function screenHome(s) {
    const p = s.player, m = game.computeMax(p);
    const pools = CLASSES[p.classId].caster ? `${m.maxHp} HP · ${m.maxMp} MP` : `${m.maxHp} HP`;
    return topbar(p) + `<div class="screen">
      <div class="card">
        <div class="card-row"><div class="avatar">${CLASSES[p.classId].emoji}</div>
          <div><div class="card-title">${esc(p.name)} <span class="pill">${CLASSES[p.classId].name}</span></div>
          <div class="card-sub">${pools} · ${p.wins} wins · best streak ${p.bestStreak} 🔥</div></div></div>
        ${classStats(p.classId)}
      </div>
      <button class="btn block lg gold" data-act="enter-arena">⚔️ Enter the Arena</button>
      <p class="card-sub center" style="margin-top:12px">Win streaks earn 🪙50 gold each. Fights open at missile range — <b>Move</b> to close or open the gap, or <b>Attack</b>. Lose once and the day ends, but you keep all gold and stat gains.</p>
    </div>` + tabbar("home");
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

  function narrate(ev, i, ctx, animate) {
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
      case "end": return "";
      default: return "";
    }
    // Visual emphasis for the dramatic beats.
    let extra = "";
    if ((ev.t === "hit" || ev.t === "spell") && ev.crit) extra = "line-crit";
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
      <div class="battle-head"><span class="round">Round ${b.round}</span><span class="streak-pill">${s.streak} win streak 🔥</span></div>
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
      allocBlock = `<p class="muted">${gained}</p>
      <div class="result-actions">
        <button class="btn ghost" data-act="retreat">Retreat &amp; bank</button>
        <button class="btn good" data-act="fight-on">Fight on ⚔️</button>
      </div>`;
    }
    return `<div class="result win">
      <div class="result-emoji">🏆</div>
      <div class="result-title">Victory!</div>
      <p class="muted">${s.streak} win streak</p>
      ${recapBlock(s.battle, p.name, true)}
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
      <p class="muted">You fell after a streak of <b>${r.streak}</b>. The day is over — but your gold and stat gains are yours to keep.</p>
      ${r.reachedBest && r.streak > 0 ? `<div class="levelup">🔥 New best streak: ${r.streak}!</div>` : ""}
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
        const afford = p.gold >= it.cost;
        return `<div class="card"><div class="card-row"><div class="avatar">${it.emoji}</div>
          <div><div class="card-title">${it.name} ${owned ? `<span class="pill">owned ×${owned}</span>` : ""}</div>
          <div class="card-sub">${it.desc}</div></div>
          <div class="spacer"></div>
          <button class="btn sm gold" data-act="buy-item" data-arg="${it.id}" ${afford ? "" : "disabled"}>🪙 ${it.cost}</button></div></div>`;
      }).join("") || `<p class="card-sub center">Nothing in stock yet.</p>`;
      // Special arrows — Thief only.
      let arrowsBlock = "";
      if (s.vendor === "magic" && p.classId === "thief") {
        const cards = Object.values(ARROWS).filter((a) => a.id !== "normal").map((a) => {
          const owned = p.arrows.includes(a.id);
          const active = p.activeArrow === a.id;
          const afford = p.gold >= a.cost;
          let btn;
          if (!owned) btn = `<button class="btn sm gold" data-act="buy-arrow" data-arg="${a.id}" ${afford ? "" : "disabled"}>🪙 ${a.cost}</button>`;
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
          const worn = p.armor === a.id, afford = p.gold >= a.cost;
          const pen = a.initPenalty ? ` · −${a.initPenalty} init` : "";
          const mag = a.magical ? ` · ✨ blocks magic` : "";
          const btn = worn
            ? `<button class="btn sm ghost" disabled>Worn ✓</button>`
            : `<button class="btn sm gold" data-act="buy-armor" data-arg="${a.id}" ${afford ? "" : "disabled"}>🪙 ${a.cost}</button>`;
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
    return topbar(p) + `<div class="screen">
      <div class="screen-title">Vendors</div>${vendors}
      <p class="card-sub center" style="margin-top:10px">You have 🪙 <b>${p.gold}</b> gold.</p>
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
      case "pick-class": ui.selectedClass = arg; render(game.state); break;
      case "create": {
        const name = (document.getElementById("hero-name") || {}).value || "";
        game.createCharacter(ui.selectedClass, name.trim());
        break;
      }
      case "tab": game.go(arg); break;
      case "enter-arena": game.enterArena(); break;
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

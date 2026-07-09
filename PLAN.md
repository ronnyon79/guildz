# Guildz — Project Plan

An arena-style turn-based battle game for the browser (mobile + PC).
Inspired by the **Stronghold** mIRC channel game.

Start **single-player**, prove it's fun, then expand to **multiplayer** — as an
*addition*, not a rewrite.

---

## The Game (design v2 — authentic Stronghold ruleset)

**Core loop:** Pick a class → enter the arena → fight opponents one at a time →
**each round you Move or Attack** → win grants **+50 gold** and **2 stat points** →
keep fighting a growing win-streak → **lose and the day ends** (you keep
everything earned). Gold will buy EQ / items / potions later.

**Classes** (tabletop-style numbers):

| Class | HP | MP | To Hit | To Crit | To Cast | Melee | Missile | Per win |
|-------|----|----|--------|---------|---------|-------|---------|---------|
| 🛡️ Fighter | 25 | 0 | 60% | 5% | — | 1d8 | 1d6 | +2 HP |
| 🗡️ Thief | 25 | 0 | 50% | 10% | — | 1d6 | 1d6 | +2 HP |
| 🔮 Mage | 20 | 20 | 40% | 5% | 60% | 1d4 | 1d4 | allocate 2 pts HP/MP |

- **Range & positioning:** fights open at **missile range**. Each round, **Move**
  (flips missile↔melee) or **Attack** (melee or missile dice by current range).
  If either side moves, range flips **once** — two moves don't cancel.
- **Initiative: Thief → Fighter → Mage.**
- **1d20 to resolve** every attack/cast (roll shown in the log): To Hit is a
  threshold (60%→9+, 50%→11+, 40%→13+); **nat 1 = critical miss** (fails + you
  lose next turn); top of the die = **crit = double damage** (5%→20, 10%→19-20).
  Mages crit on spells too. No armor/defense yet (arrives with EQ).
- **"PvP":** for now you fight **AI opponents shaped like real player characters**,
  scaled to your win count + streak. Multiplayer swaps the AI for a real player.

### Confirmed rules
- **Mage spells:** *Magic Missile* (5 MP, **auto-hits**, 1d8) · *Fireball*
  (10 MP, needs To Cast, 2d10). Spells do not crit.
- **MP:** no in-fight regen (future: potions). Grows only via win allocation.
- **Range vs. initiative:** range flips when a mover acts, in initiative order —
  so if the faster fighter moves first, the slower one attacks at the new range;
  if the faster one attacks first, it resolves at the old range. (Verified.)

---

## Two Modes — the unified arc (design v3)  ← PLANNED, not built

The game grows from one mode into **two ways to play the same world**, joined into
a single roguelike arc. Champion mode is **built & tested**; Lord mode is planned here.

### Background story
The Stronghold is a rundown keep with a fighting pit. Your ambition depends on the
seat you take: as a **Champion** you claw your way up the arena to become the
Stronghold's greatest fighter; as the **Lord** you rebuild that pit into the most
famous **gladiator arena** in the land — a place fighters flock to, guilds fight to
occupy, and crowds pay to watch.

### The one arc: Rise → Rule → Defend
```
   CHAMPION MODE                          LORD MODE
   climb the daily brackets ─┐
   earn Popularity           │
   season's #1 may  ─────────┼──▶ challenge ──▶ WIN → crowned Lord → run the arena
     challenge the Lord      │     the Lord     │      (your champion IS the new Lord)
                             │                  │
   LOSE the Lord fight ◀─────┘                  └──▶ your growing arena breeds the
     = DIE, SERVE (join the Lord's                    champion who will one day
       servants/defenders), or be EXILED              challenge YOU  ── (Defend, later)
       to the wilds (→ Exile mode)
```
- **Champion win condition** = beat the Lord → **become** the Lord (seamless handoff
  into Lord mode with your champion crowned).
- **Champion lose-to-Lord** = choose your fate — **die** (permadeath, run over), **serve**
  (join the Lord's household → the pool he fields as throne **defenders**; see Throne
  defensibility), or **exile to the wilds** → **Exile mode** (survive; if you prosper,
  found your OWN Stronghold elsewhere — see the Exile stub).
- **The elegant tension:** the arena the Lord builds literally draws stronger fighters,
  so a more glorious reign breeds a deadlier eventual challenger. Champion's climb and
  Lord's throne-defense are the *same event from opposite chairs* — built once.

### Shared backbone: the Day / Season / Tournament  ✅ decisions locked
Both modes run on the same tournament engine (competitor's view vs. organizer's view).

- **A Day = sunrise → sunset.** Champions are bucketed into **categories by win-count,
  in bands of 5** (0–4, 5–9, 10–14, …). Each category runs a **single-elimination**
  tournament; **lose a bout = your day ends** (this *is* the original "lose → finish
  the day" rule). Exactly **1 winner per category** at sunset.
- **Day length scales with population** — more champions → bigger brackets → more
  rounds → longer day. (Population = a Stronghold stat; details deferred.)
- **Fairness is emergent:** everyone in a bracket starts the day at equal wins and
  each bout-win advances symmetrically, so finalists are *still* at equal wins — the
  bracket stays internally fair top-to-bottom (only odd-count **byes** create a tiny
  asymmetry — see open Q). Popularity therefore rewards skill, not lucky matchmaking.
- **Two ladders, deliberately separate:**
  - **Wins** — skill/progression. Sets your category; drives HP/MP/gold (the existing
    career). **Every bout-win is a career win and is permanent** (across seasons too).
  - **Popularity** — fame. Earned **only** by winning your category's day.
    **Award = `boutsWon × perBoutValue(band) × spectacle`** — *boutsWon* rewards bracket
    depth (and byes don't inflate it); *perBoutValue(band)* rewards a higher win-band's
    prestige (start **linear**: `5 + winFloor/5` → **5 / 10 / 15** per bout at bands
    0 / 25 / 50); the day's **Spectacle** rating multiplies it for showmanship. (Per-bout
    variant: sum `perBoutValue × spectacle` over each won bout.) Constants tuned via sim.
    Accumulates over a season; decays −50% at its start; gates the Lord challenge.
- **Re-bucketing** happens at each **sunrise** from your current win-count; your
  category is then **locked for that day**.
- **Season:** many days. At **season end**, the **highest-Popularity** champion **may
  (optional)** challenge the Lord.
- **Persistence:** **Wins persist across seasons** (permanent career). **Popularity
  decays −50% at each new season's start** (soft reset — a legend keeps momentum but
  the fame race reopens).

### Spectacle — the crowd rating (decided; concept, tune later)
Every fight is graded for **how much *action* it had** — the crowd wants a show.
Computed from the combat log (all already tallied in our sims):
- **+++** critical hits · huge blows (≥25% of foe max HP in one hit)
- **+++++** comeback (winner rallied from <20% HP) · **++++** nail-biter finish (winner
  also near death) · **++++** decisive rout (fast, dominant kill)
- **++** successful evade/dodge · **+** fumble (groan/laugh) · **+** spell/summon/arrow
  proc / shield-shatter spectacle
- divide by fight length → rewards action **density** (a short crit-fest beats a slog);
  map to a **★☆☆☆☆–★★★★★** Crowd Rating the **Scribe** posts on the Bulletin Board.

Two economic hookups: **(a)** the day's **gate + wagers scale with average Spectacle**
(the Lord *wants* thrilling fights); **(b)** the winner's **Popularity** is multiplied by
Spectacle (fame = who you beat × how excitingly). Weights/curve tuned via sim.

### Champion-mode summit — the only additions needed
Champion mode is otherwise done. To give it its ending we add:
1. **Population of NPC champions** filling the categories (auto-resolve their bouts;
   the human plays their own, turn-based, as today).
2. **The Popularity ladder** (Stronghold-wide fame board; you + NPCs).
3. **The Lord boss fight** — the Lord is a **former champion** (high-win full class kit)
   **+ home-arena advantage** (full HP/MP + chooses range + picks 1 perk — see Throne
   defensibility). Losable but daunting.

### Lord mode — the frame (mostly PROPOSED; confirm before building)
You stop fighting and start **running the arena**: an economy/management layer whose
battles are resolved by the very tournaments above.
- **Goal (locked):** transform the Stronghold into the land's most popular arena.
- **No hard "win" (decided):** you reign until **deposed** (a challenger wins the throne
  duel) or you **die of old age** while undefeated → the throne opens to a **free-for-all
  succession** (anyone may challenge). The "score" is how **long & gloriously** you reign.
  Soft-fail states also depose you: **bankruptcy** / **all guilds departing**.
  (Introduces **Aging** as a real system — the Lord, and likely all champions, have a
  lifespan. See "Throne defensibility & aging" below.)
- **The Lord's decisions (proposed gameplay):** set **guild rents**, set arena **prize
  purses** (lure champions), set **ticket/wager prices** (crowd income), choose
  **building upgrades**. Every knob has a Goldilocks zone — greedy kills the cycle,
  generous bankrupts you.
- **Fights (decided):** the day's bouts **auto-resolve** — no live spectating. A
  **Scribe** records each fight's blow-by-blow (reusing the combat narration) onto a
  **parchment** posted to a public **Bulletin Board**; the Lord (or anyone) opens the
  log to read any fight on demand. The **throne-challenge duel** is always played out.
- **Income lines (decided):** **guild rent** · arena **gate + wager cut** · vendor
  **stall licenses** · **EQ sales tax** (a % on equipment bought at the vendors, set by
  the Lord). Tension knob: a high sales tax fattens the treasury but leaves champions
  less gold → weaker fields → less spectacle → smaller gate.

### Guilds — subsystem #1 (economic graph locked; numbers PROPOSED)
Four class guilds (Fighters' Guild, Thieves' Guild, Mages' Circle, Clerics' Temple).
The money graph (locked in concept):
```
  SPECTATORS ──gate/wagers──▶ ┌────────┐
                              │  LORD   │ ◀──rent── GUILDS ◀──tithe── CHAMPIONS
  LORD ──prize purses──▶ CHAMPIONS      │            │                    │
  LORD ──stall license──▶ VENDORS ──▶ ──┘     (lodging + food)      (arena winnings)
```
- **Champion → tithe → Guild** in exchange for **lodging + food** (a place to sleep).
- **Guild → rent → Lord** for occupying quarters in the Stronghold.
- **Guilds are proposed AUTONOMOUS AI** tenants (not Lord-controlled units): each sets
  its own tithe by what members can afford, recruits when it has surplus lodging, and
  **leaves if bled dry** — which is what makes rent-setting a real negotiation.
- **Diversity matters:** if a class guild dies, that class vanishes from the card →
  less spectacle → smaller gate. This ties the economy back to **class balance** (a
  weak class earns less → tithes less → fragile guild — cf. Mage being the underdog).
- **Numbers to size bottom-up** from known champion earnings (goldForWin 50/100/150):
  tithe rate, rent, lodging capacity, what "food/lodging" mechanically grants, and the
  penalty for a champion who can't pay (evicted? can't fight? — open Q).

### Throne defensibility & aging — ★ needs analysis + sim
**The core tension (user-spotted, correct):** once crowned, the Lord **stops earning
wins**, so their HP/MP/perks **freeze** at coronation — while champions keep leveling.
Unchecked, a champion eventually out-levels the Lord and the throne falls *every* season.
That's *intended in spirit* (no hard win — you delay the inevitable), but the failure to
avoid is "**lose every season with no agency**." Levers that give the Lord agency to
*defend* without personally leveling (they **compound**):
1. **Institutional power that scales with the Stronghold** — the Lord's defense grows via
   **management**: Infirmary (full HP + regen in the duel), a **Champion of the House**,
   best gear from your Armory, home-crowd morale. You level the *arena*, and it defends
   its Lord. Shifts the Lord's power curve from frozen stats → a growing institution.
2. **Aging for everyone** — champions **peak then decline**; a 150-win veteran is *old*.
   Caps + **rotates** the threat instead of ratcheting it upward.
3. **One challenger/season = the Popularity #1 (fame/spectacle), not the raw-wins #1** —
   so the challenger is often a crowd-favorite, not necessarily the strongest fighter.
4. **Servants defend — a GAUNTLET (DECIDED).** A challenge is **optional for the
   challenger** but the **Lord MUST accept**. The challenger must beat the Lord's **servants
   in order, then the Lord** — the **throne falls only when the Lord is beaten**.
   - **No full heal between bouts:** the challenger **replenishes 50% of max HP/MP** per bout
     (value TBD — tune via sim); each defender fights fresh → servants are **attrition**.
   - **Household cap = 3 servants**, all of whom defend. A **4th** joins only if the Lord
     **removes** one — **release** (freed: guild / fight independently / leave), **exile**
     (the wilds, one-way), or **kill** them.
   - **Per-bout outcomes:** a defender the challenger **beats dies** — so even a *held* throne
     can **erode** the stable (→ keep recruiting); a **challenger who loses** to any defender
     faces **die / serve / exile** (serving → joins *this* household); beat everyone incl. the
     **Lord** → throne falls, **deposed Lord** faces die / serve / exile (may *serve* the new
     one). A **servant who WINS** his bout gains a **Win + HP/MP** (→ builds toward an
     **uprising**; Serve mode).
   - The Lord may **order** his servants (speed-bump-first vs. stopper-first) — strategic.
   On regime change, the deposed Lord's **surviving** servants are **freed** (guild / fight
   independently / leave). New Lords start empty → **defend by recruiting, not leveling.**
   OPEN: does a servant's **uprising** run the other servants, or hit the Lord directly (a
   coup)? — Serve-mode pass. Cap (3) + per-bout replenish (50%) tuned by the reign sim.

**Lord's home-arena advantage (DECIDED).** In the throne duel the Lord fights as the
institution:
- **Always on:** enters at **full HP/MP** (fresh vs. a gauntlet-worn challenger) and **chooses
  the opening range** (melee/missile, to suit his class).
- **Picks 1 (from what he has UNLOCKED) before the duel — BUILDING-GATED:** **Home crowd**
  (+To Hit / +To Crit) ← arena **prestige / seating** · **Armory** (best gear in the vault) ←
  the **Armory** built · **Treasury stock** (**1 HP + 1 MP potion**) ← treasury can **afford**
  them. Built nothing → **no pick** (defaults only); invest to unlock and upgrade each option.
The pick is class-flavoured (a Mage Lord wants the MP potion; a Fighter the Armory). OPEN (sim):
the three magnitudes (Treasury's potions look strongest — size as a real trade-off) and each
gate's threshold. New Lords (empty household) lean on the defaults alone → **fragile by design.**

**Plan:** combine all four levers, target an **average reign of ≥5–6 seasons** for skilled
play (user's assumption — confirm via sim), and **prove it with a multi-season sim** — turn
"will the Lord always lose?" into a tuned dial. Still open (mostly sim-tuned): the **gauntlet
cap (3) & per-bout replenish (50%)**, servant **upkeep/housing** cost, and **servant aging**.

### Build log — Champion Summit (BUILD GREENLIT 2026-07-05)
- **GUI-5 Day/Season/Tournament backbone — v0.2.0** ✅ `js/tournament.js`: pure, seeded,
  serializable. Bands of 5 (`bandOf/bucket`, sunrise re-bucket by locking ids at newDay),
  single-elim brackets (`newBracket/reportBout`, entrants−1 bouts), **random byes** (shuffled
  pool pops one), walkover = 0 boutsWon (popularity-safe), `autoBout` (real combat+AI both
  sides, side-alternated, 160-round HP% cap), `runDay` (NPC-only; refuses players — the game
  layer drives interactive bouts via `pendingMatch/reportBout`), `onBout` callback = the seam
  where the caller applies career wins/gold (engine never mutates champions), `winners()` →
  {band: winnerId, boutsWon} for the popularity award. 23 headless tests
  (`tools/test_tournament.js`): structure, byes, walkovers, full 23-champ day on real combat,
  determinism, serializability, player guard.

- **GUI-6 NPC champion population — v0.3.0** ✅ The daily tournament is now THE playable
  arena. `js/roster.js`: 40 resident NPCs (name+epithet, novice-weighted win tiers in
  data.ROSTER), tiny persisted records {id,name,classId,wins} — pools/armor/arrows derived
  from wins; `worldSeed` on the player → deterministic world-gen; old saves migrate.
  `game.js` day loop: enterArena = sunrise (bucket player+NPCs, other bands auto-resolve at
  dawn), bracket screen ↔ interactive bouts (bout win = career win via existing onWin),
  loss finishes the bracket off-screen + sunset board on the loss screen, winning the final
  → 👑 Day Champion screen; withdraw = forfeit (walkover, no career win granted); NPC bout
  winners gain +1 win (mid-day growth, chars rebuilt). UI: bracket screen (rounds, byes,
  your-bout highlight), sunset champions board, day-aware win/loss copy. Tests: 29 headless
  day tests (`tools/test_day.js`) + smoke-rendered all new screens; AI-driven player won 1/9
  days (knockouts are properly hard). Old streak-vs-generated-foe loop retired.

- **GUI-7 Popularity ladder — v0.4.0** ✅ Fame + the world clock. Award (decided formula):
  `boutsWon × perBout(band)` with `perBout = 5 + band` (data.POPULARITY; × Spectacle slots in
  with GUI-8) — applied at sunset to EVERY band champion (walkover = 0). World clock
  {day, season} persisted; **SEASON.days = 10** (NEW tunable, first guess — GUI-30 sim).
  Season roll: final standings recorded pre-decay (lastSeason.top), then **all fame −50%**
  (round), surfaced on the sunset screens ("Season ends!"). New ⭐ Fame tab: ranked ladder
  (top 10 + your rank), clock, last season's most-famous; topbar ⭐; sunset board shows +⭐
  per champion. Migrations for pre-fame saves. 16 headless tests (`tools/test_popularity.js`)
  + 52 regressions green. The season's #1 challenging the Lord = GUI-9.

- **GUI-8 Spectacle / Crowd Rating — v0.5.0** ✅ `js/spectacle.js` (pure): grades every fight
  from its log — crits +3, huge blows (≥25% max HP after soaks) +3, evades +2, fumbles +1,
  casts/procs/shatters +1; finish bonuses comeback +5 / nail-biter +4 / rout +4; density
  (score/rounds) → ★1–5, thresholds CALIBRATED over 2.4k sim bouts to a bell around 3★
  (10/24/37/21/8%). Fame formula now COMPLETE (per-bout variant): champion earns
  Σ perBout(band) × specMult(★) with specMult = ★/3 (3★ = ×1); forfeit walkovers rated 0 →
  pay nothing. Wired into autoBout + player bouts (m.spec persisted per match); crowd verdict
  on win/loss screens (+comeback/nail-biter/rout callouts); ★ on bracket rows. 13 headless
  tests (`tools/test_spectacle.js`) + 68 regressions. Weights/thresholds = GUI-32 sim knobs.

- **GUI-9 + GUI-10 The Lord, the throne & the fates — v0.6.0** ✅ The Rise arc is COMPLETE.
  World-gen Lord (veteran ex-champion, 40–60 wins, seeded, reign backstory; old saves
  migrate). Season's #1 = you → **challenge opens** (optional; entering the next day
  declines). Throne duel with the decided kit: Lord fresh at full HP/MP, **dictates the
  opening range** (engine: newBattle openRange param), **one perk by class** — caster →
  treasury (1 HP + 1 MP potion), martial → armory (top enchanted armor + fire arrows);
  crowd (+5/+5, engine toHit/toCritBonus) implemented for the player-as-Lord era. **Win →
  CORONATION**: role = lord, +1 career win, deposed Lord stays as a resident (60%, seeded)
  or rides out; Lord-mode handoff is a placeholder ("coming update"), exhibition days
  continue. **Lose → die / serve / exile** (GUI-10): die = permadeath (save wiped at
  choice, memorial); exile = one-way run-end stub (Exile mode later); serve = PLAYABLE —
  fight on in his household, top the ladder again → **UPRISING, to the death** (loss =
  instant permadeath). Interim scope recorded: single duel (gauntlet = GUI-16), player-only
  challenges (NPC challengers = Defend phase). 31 headless tests (`tools/test_throne.js`) +
  81 regressions. ⚠️ BALANCE FINDING for GUI-31: Lord difficulty swings wildly by his class
  — a 60-win MAGE lord (poison bypasses armor + elemental + mana potion) burned down a
  481-HP test titan, while martial lords are far tamer. Tune in the reign sim.

- **GUI-11 Worlds + role-aware boot + lord.js — v0.7.0** ✅ Lord mode BEGINS. **Multi-world
  saves** (decided design): `guildz.worlds.v1` index + per-world keys; each universe a
  separate save game; the pre-worlds single save auto-migrates to slot 1 (legacy key
  consumed). **World-select title screen** (role badge, class, wins, clock; delete with
  confirm). **Role-aware boot**: a crowned world resumes as the Lord. **`js/lord.js`** —
  the other chair at the same arena: `holdGames()` runs the whole day NPC-only through the
  SHARED seam (`runDay` → the newly extracted `game.settleDay`), residents earn wins+fame,
  clock/seasons roll under your reign ("none dare challenge you… yet" — Defend phase later),
  Lord dashboard replaces the arena button, lord-sunset screen shows the board. Permadeath/
  exile now erase the WORLD (index + blob). 22 headless tests (`tools/test_worlds.js`) +
  113 regressions (old suites reworked to multi-world keys).

- **GUI-12 + GUI-13 Treasury, income & decrees — v0.8.0** ✅ The money flows. Stronghold
  state {treasury, ticketPrice, taxRate, purse} (data.ECONOMY defaults, all sim-tunable
  GUI-36; migrations). **Income lines:** gate (attendance × price; attendance = (base +
  2/resident) × avg★/3 × demand(price) × prestige(purse)) · wager cut (10% of the book) ·
  stall licences (5g/open vendor/day) · **sales tax** (rate × modelled shop spend/bout).
  **Expenses:** band purses + upkeep. **Tensions WIRED, not cosmetic:** steep tickets thin
  the crowd (demand curve) · heavy tax → residents' gear budgets shrink (roster.combatChar
  goldScale) → weaker fields → duller fights → smaller gate · fat purses draw crowds but
  drain coffers. **Champions pay the tax** at the vendors (taxed prices shown; the Lord pays
  none); NPC-lord default 10% now applies in champion mode too (watch in GUI-36/37 sims).
  **Decrees UI** (Lord home): ticket/tax/purse steppers, clamped; ledger card on the Lord's
  sunset (attendance, all lines, net → treasury; ⚠️ warning when coffers run dry — actual
  bankruptcy-deposition arrives with the Defend phase). Guild rent joins with Guilds. 21
  headless tests (`tools/test_economy.js`) + 135 regressions.

- **GUI-14 Scribe + Bulletin Board — v0.9.0** ✅ Every fight readable. The Scribe records
  every bout: **NPC bouts = pre-fight snapshots + seed only** (prose NEVER stored —
  `tournament.replayBout` re-runs deterministically at read time: the GUI-23 seed-replay
  principle, live); **player bouts + throne duels = verbatim log** (human moves can't be
  re-derived). Board = persisted **ring buffer of BOARD.days=3 days** (results live forever
  in careers; only readable prose ring-buffers). New **📜 Board tab**: days of bout cards
  (winner, rounds, ★, band, 👑 THRONE DUEL badge) → **parchment screen** with the full
  narrated blow-by-blow ("faithfully recorded by the Scribe 🖋️"). Presided (Lord-mode)
  days recorded too. 13 headless tests (`tools/test_board.js`, incl. replay determinism:
  identical log twice, winner + length reproduced) + 156 regressions.

- **GUI-15 Building upgrades — v0.10.0** ✅ Institutional power. data.BUILDINGS ×5, levels
  0–3, treasury-funded (Lord-only, costs escalate, clamped): **Seating** (+15 base crowd/lvl
  → gate, live) · **Armory** (+5% resident gear budgets/lvl — offsets the tax, live; also
  arms the throne defence) · **Training Yard** (1 resident/lvl gains a sparring win per
  presided day, live) · **Infirmary** (+2 HP/round/lvl for the DEFENDING Lord — lands with
  the gauntlet) · **Barracks** (1 servant slot/lvl — the gauntlet's household cap, replacing
  the flat 3). 🏗️ panel on the Lord's home. Migrations. 11 headless tests + 169 regressions.

- **GUI-16 + GUI-41 + GUI-43 The Defend loop — v0.11.0** ✅ The arc CLOSES: Rise → Rule →
  **Defend**. **NPC challengers**: the season's #1 resident (fame > 0) comes for the crown —
  yours if you reign, your Lord's (with YOU fielded) if you serve; the challenge cannot be
  refused. **The GAUNTLET (as decided)**: challenger fights the household in order (strongest
  first) then the Lord; defenders fresh; challenger **replenishes 50% of max HP/MP** per bout
  (capped — a dominant challenger can arrive topped; GUI-31 tunes); **beaten servants DIE**;
  beaten challenger → seeded die/serve/exile (**serve → kneels into your household** if a
  Barracks slot is free; exile/die → leaves the world = first real churn-out). Engine:
  `startHp/startMp` (worn entry) + `regen` (Infirmary heals the defender each round, narrated).
  **GUI-43 live for the player-Lord**: defense-prep screen — choose the opening range + ONE
  building-gated boon (crowd ← Seating, armory ← Armory, treasury potions ← 🏛️200) — full
  HP/MP + infirmary regen default. **Deposed**: usurper crowned (reign 0), household freed
  (emergent: by gauntlet order it's always empty — they fought first), YOU get die/serve/exile
  (a fallen Lord may serve the new one). **GUI-41 fielded defense**: the Lord fields his
  servant — win = +1 win + growth; fall = DEATH, no choice. Household management (decided):
  release 🕊️ / exile 🚪 / kill 💀 buttons. Gauntlet bouts recorded on the Board. 31+1 headless
  tests (`tools/test_defense.js`) + 180 regressions. NOTE: reigns now END — the ≥5–6-season
  target is finally measurable (GUI-31).

- **GUI-17 Aging — v0.12.0** ✅ LORD MODE PROJECT COMPLETE. Everyone ages +1/season
  (player, residents, household, the Lord). **Peak → decline** (data.AGE): prime to 35,
  then pools fade 3%/yr (floor 50%) — applied to residents, the player AND the Lord's kit
  (throne test updated) — the challenger threat now ROTATES. **Retirement churn**: residents
  past 52+(fate%12) bow out and a fresh novice takes the bed (population stable — churn's
  first cycle, D2.2 seed). **Succession**: an NPC Lord past 58+(fate%12) dies on the throne
  → the crown passes to the people's favourite — YOU if you top the fame ladder (bloodless
  coronation; a serving player is freed first), else a resident (reign 0). **The rarest
  ending**: a player-Lord who reaches the end undefeated **dies in the high seat** —
  memorial records the reign length; the run ends in glory. Ages shown on cards (🍂 past
  peak). Migrations derive age from wins. 20 headless tests (`tools/test_aging.js`) + 211
  regressions. Curve/lifespans = GUI-35 sim knobs.

- **GUI-42 Personality — v0.13.0** ✅ Every AI character rolls a seeded 8-trait vector
  (agg/brv/amb/cun/dis/cru/loy/grd, data.PERSONALITY) that RE-WEIGHTS existing decisions —
  0.5 on every trait reproduces the old baseline EXACTLY (variance, not power). Wired:
  combat AI (charge/kite/hide/summon/heal thresholds — verified: ferocious fighter charges
  100% vs timid 29%), ambition gates the throne challenge (the meek #1 stands aside; the
  ambitious #2 rises), loyalty bends the knee (beaten challengers: loyal 50/60 kneel vs
  proud 15/60), deposed-lord stays by loyalty, discipline times the potions. cru/grd
  reserved for household/guild hooks. Temperament pills on the fame ladder (Ferocious,
  Cunning…, >=0.7 only). Deterministic per worldSeed; migrations seeded per id. BUGFIX
  found by tests: retirement arrivals could duplicate a resident name -> II suffix
  (narration keys on names). 14 headless tests + 238 regressions. Guilds (GUI-18/19/20),
  Exile/Adventure (GUI-28/29) & warfare (GUI-38/39) remain PARKED per user.

- **GUI-33 World-gen depth — v0.14.0** ✅ You now join a LIVING world: js/worldgen.js
  pre-simulates **3 background seasons** (data.WORLDGEN, seeded, deterministic) through the
  REAL engines — dawn-to-sunset days, fame + decay, aging + retirement churn, and throne
  challenges WITH TEETH (in 8 probe worlds, 8 thrones changed hands during history — the
  single-duel era is brutal; the household gauntlet is why reigns can now last). On arrival:
  residents carry real fame + grown careers (avg ~34 wins at depth 3), the last day of
  history hangs on the Bulletin Board (seed-replayable), lastSeason standings are real, and
  a fresh INTAKE of 10 hopefuls arrives at the gates with you (bands 0–1 have peers, not
  ghosts — found + fixed: history had emptied the novice bands). Depth study (the GUI-33
  question): 1 season = 192ms/28 famed · 3 = 830ms/37 famed · 5 = 1683ms/37 famed →
  **3 chosen** (lived-in, sub-second). seasons=0 supported (pristine worlds for tests).
  12 headless tests + 240 regressions.

- **GUI-30…37 The sim batch — v0.15.0** ✅ Seven studies, four new sim tools, two tuning
  changes. **GUI-31 (reign length)**: 40 seasons × 6 worlds/config — the DESIGNED gauntlet
  (cap 3, 50% replenish) hits **mean 5.2 seasons** (target ≥5–6) ✓; median 2 (fresh Lords
  with empty households are fragile BY DESIGN), dynasties run to 30 (old-age capped);
  replenish direction correct (75% → 4.0). KEEP cap 3 / 50%. **GUI-37 (Mage)**: equal-wins
  with personalities: Mage 42.4% (35% mid) → APPLIED data-driven arcane mastery
  (mage.spellPowerPer = 3 → +1 spell dmg per 3 wins, engine perk in makeFighter) → 46.2%
  overall / 42% mid. Remaining outlier: Thief@30 = 66% (dual-wield + fire-arrow era —
  user-tuned, left for a future call). **GUI-32 (spectacle)**: personalities ran the old
  curve hot (80% at 3–4★) → RECALIBRATED thresholds ([[2.65,5],[1.5,4],[0.7,3],[0.4,2]])
  over 2.4k personality-era bouts → 11/22/38/21/8 bell ✓. **GUI-36 (economy)**: tensions
  verified — generous reigns BANKRUPT (−764/day), showman modest (+206); FOUND a degenerate
  greedy optimum (+813/day: the tax base ignored the poverty it caused) → tax base now
  scales with gearScale (→ +710; the full counter — purses↔population churn — awaits the
  parked churn/guild systems, noted). **GUI-30 (fame race)**: 4 distinct season-toppers in
  6 seasons — competitive, constants KEPT. **GUI-34 (population)**: 24/40/60 sweep — 40
  confirmed (35ms/day, best ★; 60 = 75ms/day headroom exists). **GUI-35 (aging)**: same-wins
  fighter vs prime twin: 28% @40, 13% @45, 4% @50 — steep but exactly the designed rotation
  (and GUI-31 hits target WITH it); softer 2%/yr noted as the fallback knob. Tools:
  sim_reign / sim_balance2 / sim_economy / sim_aging. 251 regressions green.

- **GUI-21/22/23/24/26 World & Data tranche — v0.16.0** ✅ **Storage adapter (GUI-21)**:
  js/store.js — game logic only calls G.store; backends swap beneath (the persistence twin
  of the combat/AI seam). **IndexedDB backend (GUI-22)**: browsers open the design-v5 "big
  DB" (kv store, async init + in-memory mirror, sync reads, write-through; pre-IDB
  localStorage saves migrate on first boot); headless/tests keep the pure pass-through.
  **Facts live forever**: every bout writes a compact fact row [season,day,band,a,b,winner,
  rounds,★] that OUTLIVES the 3-day parchment ring (cap 4000 in the localStorage era;
  unbounded on a row store) — the "keep all stats" requirement, honoured. **Rollups
  (GUI-24)**: per-champion career aggregates updated incrementally per bout; careerOf() =
  O(1) vs O(rows), verified equal to a full fact scan. **GUI-23 (seed-replay)**: CLOSED —
  implemented in v0.9.0 (replayBout + snapshot+seed records, prose never stored) and
  formalized here. **GUI-26 (controller seam)**: every seat carries controller: "player"|
  "ai" — the governance field multiplayer swaps; server authority itself remains Phase 4.
  **GUI-25 & GUI-27 stay OPEN** (commented in Linear): world GROWTH needs the parked
  Exile/Adventure + warfare modes; a Web Worker earns its keep only at multi-stronghold
  scale (days cost 35ms today). 14 headless tests (tools/test_store.js) + 241 regressions.

- **GUI-44 BUGFIX: dual wield was firing at missile range — v0.16.1** (user-found, reading
  the battle parchments!) applyAction passed actor.weapons to EVERY attack, so a 25-win
  thief shot the off-hand die from a longbow. Fixed: dual wield is MELEE-ONLY (engine +
  the ⚔️×2 button tag). BALANCE LANDSLIDE: the fix collapsed the Thief outlier — overall
  fighter 50.3 / thief 52.6 / mage 46.7 / cleric 50.5 (Thief@30: 66% → 55%); tightest
  spread the game has had (~6 pts). 5-test regression lock (tools/test_dualwield.js) +
  255 regressions green.

- **GUI-45 Battle reports: round headers + death theatre — v0.17.0** (user request from
  reading parchments). Engine now logs a **round snapshot** at every round start (pure
  data, replay-safe) → the narrator renders **“— Round N — A 34/40 · 12MP ⚔ B 20/40 —”**
  dividers in parchments AND the live battle log (round 1 skipped — the intro sets that
  scene; old verbatim logs degrade gracefully; replayed bouts get dividers retroactively).
  The parchment reader marks the last damaging strike **☠️ THE KILLING BLOW —** and the
  end event now closes with seeded **death theatre** (6 variants: “…the sand rushes up to
  meet them. A heartbeat of silence — then the arena ERUPTS.”). 272 regressions green.

- **GUI-56 Selectable battle reports — v0.17.1** (user report). The global mobile
  user-select:none also froze the parchments; the Scribe writes to be READ — .log prose
  (live battle + parchments) is now selectable/quotable; buttons and chrome stay guarded.

- **GUI-57 Flurries read as one action — v0.17.2** (user confusion reading a report: a
  fighter "dodged but also got damaged" — it was TWO strikes of a multi-attack rendered as
  unrelated sentences). Engine tags every blow of a flurry (strike/strikes on hit/miss/
  critmiss/evade/dodge); the Scribe labels them **“1st strike: …grazes for 1 · 2nd strike:
  …turned aside”**. Single attacks stay unlabelled. 276 regressions green.

- **GUI-58 Board foldered by band — v0.18.0** (user request). Each day/parchments now hang
  in collapsible BAND categories (👑 Throne and 🛡️ Gauntlet pinned above, bands ascending),
  collapsed by default with counts + a "you fought here" pill — no more one long list.

- **GUI-59 Walkover labels — v0.18.1** (user: "how come 0 bouts?"). Sparse high bands hold
  one veteran → the day resolves by WALKOVER (designed: 0 boutsWon → +0 fame, no farming an
  empty bracket). The sunset board now says **"🕊️ walkover — no challengers in this band"**
  instead of the puzzling "0 bouts won · +0⭐". OPEN design question posed to the user:
  merge sparse adjacent bands for the day so lone veterans still fight (would amend the
  bands-of-5 rule — awaiting their call).

- **GUI-60 Idle veterans depart — v0.19.0** (USER DESIGN: solves the lone-veteran lockout
  without touching bands-of-5 or the fame-gated challenge). A veteran (25+ wins) who fought
  NO bouts all season decides at the turn by temperament: **ambitious (amb ≥.5) → rides out
  to FOUND their own hold** — written to the persisted **founders ledger** (state.departed,
  last 12), the literal seed of GUI-25 world expansion; **restless (brv ≥.4) → leaves for
  adventure**; the steadfast linger. Fresh hopefuls take the beds (population stable; shared
  arriveHopefuls with retirement churn). Idleness measured from the FACTS store (fought =
  named in any fact row of the closing season — gauntlet counts). Departures announced with
  the season banner ("🐎 …rides out to raise a banner of their own"). Player never
  auto-departs. 10 headless tests (tools/test_departures.js) + 280 regressions (two suites
  updated: departing champions legitimately take their wins/fame with them).

- **GUI-61 The Board calendar — v0.20.0** (user request: the day list grows long).
  The Board is now a **paginated calendar**: one SEASON per page (◀ Season N ▶), a 5×2 grid
  of day cells (👑 = a throne/gauntlet was fought · ⭐ = you fought · dim = parchments taken
  down), and the picked day opens in a PANEL beneath — band folders intact, zero long
  scroll. Parchment retention raised **BOARD.days 3 → 30** (≈ three readable seasons; ring
  tests pin days=3 to keep exercising the trim; facts unchanged). New .cal styles.
  283 regressions green.

- **GUI-62 Band chips + the wide Board — v0.21.0** (user: still too much scrolling).
  The stacked band folders became a compact **CHIP GRID** (👑/🛡️/0–4/5–9/… with bout counts
  + a ⭐ marker; defaults to YOUR band) — pick a chip, read that band. On screens ≥900px the
  Board page alone widens to 1100px and goes **two-column**: calendar + chips left, the
  chosen band s reports in a STICKY, independently-scrolling side panel right; phones keep
  the single column. render() toggles #app.wide per screen. 283 regressions green.

- **GUI-63 The report becomes a three-way CHAT — v0.22.0** (user request: long + confusing).
  Parchments now read like a messenger thread: the two fighters call their OWN actions in
  punchy FIRST PERSON (30+ new voice pools — "My greatsword bites — feel that? −8" · "Ha!
  Too slow." on an evade · "BURN! 🔥" · "No—! Overreached… 😵"), the **player always chats
  from the RIGHT**, the foe left (class-emoji avatars, name tags), and the **Narrator**
  keeps the scene in centered dashed bubbles (initiative, DoT ticks, pets, arrow effects)
  with round-divider rules and the **death theatre in a gold KO bubble**. All tags kept:
  d20 rolls, CRIT, dual, 1st/2nd strike, armor/shield notes, ☠️ THE KILLING BLOW. Bubbles
  selectable. Live battle log unchanged (own pass if wanted). 283 regressions green.

- **GUI-64 Action labels + the replay theater — v0.23.0** (user: quips unclear + immersion
  without scrolling). Every fighter bubble now leads with a PLAIN action label ("⚔️ Strikes —
  greatsword · HIT" / "🔮 Casts Fireball · FIZZLES" / "💨 Evades" / "1st: 🏹 Shoots — longbow
  · MISS") above the first-person quip — WHAT they did, then the voice. And **▶ Replay the
  bout**: a no-scroll THEATER — a fixed one-screen stage where bubbles land on a cadence
  (⏸ pause · ⏩ 2× · ⏭ skip), older ones slide off the top, beneath a **pinned duel header**
  with both fighters HP/MP bars draining LIVE (hpTimeline computed from the log: round
  snapshots + per-event soak-aware damage/heals/potions). Transcript stays the default;
  pre-v0.17 logs (no round snapshots) hide the bars gracefully; clockwork tears down on
  leaving. Verified end-to-end via captured click handler. 283 regressions green.

- **GUI-65 Constant page width — v0.23.1** (user: page + tab bar jumped entering/leaving
  the Board). On desktop #app — and with it the top/tab bars — is ALWAYS 1100px; non-board
  content centres at 660px reading width inside the constant frame; only the Board
  (.board-screen) spans full width for its two columns. JS class toggle removed.

- **GUI-66 Live battles speak chat — v0.24.0** (user request). The in-fight log now uses the
  SAME renderer as the parchments (shared chatRow helper — the two can never diverge): you
  chat from the right, the foe left, action labels + first-person quips, narrator bubbles,
  round dividers, new rows fading in as rounds resolve. Fighter panels/range banner/action
  grid untouched (they ARE the live duel header). Old third-person narrate() retained only
  for the win/loss recap lines. 283 regressions green.

- **GUI-67 BUGFIX: right bubbles rendered left — v0.24.1** (user screenshot). Flexbox trap:
  row-reverse + justify-content:flex-end points LEFT on a reversed axis, so YOUR bubbles
  hugged the left edge too. flex-start on the reversed row = visual right. One line.

- **GUI-68 Live battle: report-style duel header + one-screen lock — v0.25.0** (user
  request). The two stacked fighter panels became the parchment DUEL HEADER — compact
  side-by-side HP/MP bars, foe LEFT / you RIGHT (matching the chat sides), with condensed
  status tags (☠️/🕸️/🛡️/🌑/❄️/armor DR·durability/pet HP or rounds) and career wins. And
  the battle now LOCKS to the viewport (100dvh, overflow hidden): the chat log scrolls
  inside its own box — auto-following new bubbles via the existing scrollTop sync — while
  the action buttons stay pinned. No page scrolling during play. 283 regressions green.

- **GUI-69 BUGFIX: battle still scrolled the page — v0.25.1** (user report). Flexbox again:
  .battle kept base flex:1 (basis 0, grow-with-content) inside #app whose height is auto —
  in flex layout that silently BEATS height:100dvh, so the box grew with the bubbles and
  the page scrolled. flex:none makes the viewport lock real; the log (min-height:0,
  overflow-y:auto) now scrolls in its own box and the scrollTop auto-follow finally bites.

- **GUI-46 Champion profiles — v0.26.0.** Tap ANY name — fame ladder rows, board parchment
  rows, bracket entries, chat-bubble name tags, both duel headers — and a profile card
  overlays: class, career wins, age (🍂 past peak with % strength), temperament, ⭐ fame,
  reign seasons for Lords, and the Scribe career line from the O(1) rollups (bouts, win %,
  avg ★ on wins). resolvePerson() knows you / the Lord / household / residents / the
  departed founders ledger / unknown names ("appears in no ledger"). New plink() helper +
  .overlay/.profile-card CSS. NEW SUITE tools/test_profile.js (14) → 297 total green.

- **GUI-47 Scout your opponent — v0.27.0.** Before your bout, the bracket now carries the
  SCOUT CARD for your pending opponent: class, wins, age (🍂), temperament, career record
  with crowd rating, and **head-to-head vs you** ("you 2 – 1 them across 3 meetings" /
  "you have never crossed steel — first meeting") — powered by new game.headToHead(x,y)
  scanning the immortal fact rows. The same h2h line joins every profile card (GUI-46 pair
  complete: scout → fight → read → tap the name). test_profile grew to 20 → 303 total.

- **GUI-70 Profile combat stats — v0.28.0** (user request). Profile AND scout cards gain:
  **Arsenal** — ❤️ HP / 🔷 MP pools and equipment (weapons with dual-wield ×2, thief arrow
  types, armor with DR) built by the SAME combat-char builders the arena uses
  (playerCombatChar — now exported / lordCombatChar / roster.combatChar with gearScale, so
  tax pressure shows in rivals gear); **📊 Fighting style** — their actual most-used skills
  mined from up to 12 recent parchments (verbatim logs or seed-replays), counting their own
  actions: melee strikes, shots, spells by name, heals, hides, potions, summons — top 4
  with counts. test_profile 20 → 28 → 311 total green.

- **GUI-71 Style as percentages — v0.28.1** (user tweak). The style line now reads action
  SHARES ("⚔️ melee strikes 62% · 🌑 hides 11%" of all their recorded actions) instead of
  raw ×counts — comparable across champions regardless of how many parchments exist.

- **GUI-72 NPC throne challenges — v0.29.0** (user decision: season-end only, same law as
  the player). While YOU hold no seat, the boldest famous resident (fame top-3, amb≥0.3)
  claims the throne at the season roll — YOUR #1 finish always outranks. Resolved through
  the real machinery: household gauntlet in order (50% replenish, fallen servants die),
  then the throne duel vs lordCombatChar; with no household, the KEEP GUARD harries the
  challenger to LORD.keepGuardWear (0.75) of full. Winner takes the throne (roster exit +
  hopeful arrives); loser meets challengerFate. All bouts pinned as 👑/🛡️ parchments on the
  new season s day 1 (replayable); sunset announces the outcome. **Cadence sim-tuned**
  (8 worlds × 15 seasons): challenges ~53% of seasons (1-season cooldown, persisted +
  reset on new world), 33%/challenge topple → NPC Lords fall every ~4.6 seasons (2–9) vs
  the player-Lord design target 5–6 with a true gauntlet. NEW SUITE test_npcthrone (16);
  test_popularity/test_day pin the cooldown (they test fame/day math). 321 green / 18.

- **GUI-73 The keep kneels — v0.30.0** (user design: keep-guard wear is FIRST-Lord-only).
  When an NPC usurps the throne, the guard that harried them SWEARS to the victor: the new
  Lord starts with **3 named servants** (wins = max(20, 0.7×lord s)) — unique names, real
  records, so later challenges fight a REAL recorded gauntlet (🛡️ parchments, replayable).
  Beaten challengers may now KNEEL to NPC Lords too (loyalty roll, cap 3 — the design s
  gauntlet cap), growing walls between reigns. keepGuardWear (0.75) remains only as the
  empty-keep fallback (worldgen s first Lord, or a keep bled dry by a failed storming).
  Sunset names the sworn. **Sim: successor-Lord reigns 5.7 seasons mean** (range 2–9) —
  dead in the 5–6 design band; challenge cadence unchanged (~52%). test_npcthrone → 21;
  326 green / 18 suites.

- **GUI-49 Temperament voices — v0.31.0.** The chat bubbles now speak in CHARACTER: when a
  fighter s loudest trait crosses the label threshold (≥0.7), their marquee moments — big
  hits (tier≥2), crits, misses, evades, charges, retreats — draw from one of 8 temperament
  voice pools (96 new lines): Ferocious ("BLOOD! Give me MORE!"), Cunning ("The trap
  SPRINGS!"), Disciplined ("Form. Timing. Result."), Cruel, Fearless, Ambitious, Steadfast
  ("For the Stronghold!"), Grasping ("JACKPOT!"). Everyone else — and every other event —
  keeps the neutral pools. The bubble name line carries the cue ("Vex · Ferocious"),
  matching the profile card. battleCtx.temperOf() feeds live fights, parchments and the
  theater through the one shared renderer. NEW SUITE test_voices (11, synthetic verbatim
  logs pin each pool provably) → 337 green / 19 suites.

- **GUI-48 Scribe headlines — v0.32.0.** Board parchment rows now carry the Scribe s angle
  in gold italics: 🔥 comebacks / 💓 nail-biters / 🧹 routs (spectacle s own flags, now
  flowing out of autoBout and stored per rec as \`hl\`, incl. player bouts via lastSpec),
  plus derived angles at render: 😱 UPSETS (win-gap ≥15 falls to the underdog), ⚔️ wars of
  attrition (≥9 rounds), 🌟 5★ classics, 🥱 1★ duds. Two seeded phrasings each; ordinary
  bouts stay unadorned. Old recs (no hl) still get the derived angles. test_voices → 17;
  343 green / 19 suites.

- **GUI-53 The town crier — v0.33.0.** A persistent news ring (state.news, cap 20, in the
  save blob) harvested at every settle: throne rebellions (👑 fell / 🛡️ held), founders
  riding out 🐎, adventurers 🌄, retirements 🍂, old-age succession ⚱️, incoming challenges
  ⚠️, your earned challenge right, and season fame leaders ⭐. Surfaced as the 📯 town crier
  card on home (last 6, newest first, date-stamped D·S). NEW SUITE test_crier (7) → 350.

- **GUI-50 Today s field — v0.34.0.** The home screen now shows WHO shares your win-band
  before you commit: 🌅 card with up to 8 rivals (class emoji, tappable name → profile with
  scout intel, wins, age 🍂, temperament), rival count, "…and N more", and the 🕊️ walkover
  callout for empty bands. Lords see no field — they preside. test_crier → 11 → 354.

- **GUI-51 Order your gauntlet — v0.35.0.** The household list is numbered and gains ▲▼
  promote/demote (game.moveServant, Lord-only, persisted — array order IS the wall);
  beginDefense now honours the LORD S chosen order instead of auto-sorting strongest-first.
  Speed-bumps-first vs stopper-first is a real decree (challengers patch 50% between
  bouts). NPC Lords keep sorting strongest-first — their own decree. test_defense → 34
  (order honoured via lastDefense/defenseRun, swaps, bounds, role gate) → 359 green.

- **GUI-52 The clerk s book — v0.36.0.** Lords see their last 7 presided days of treasury
  flow on the dashboard: date-stamped rows with green/red magnitude bars, net per day, the
  running balance after each, and the 7-day total pinned in the title — decree changes now
  visibly move the needle within a week. Ring persisted (state.ledgerLog, reconciles to the
  treasury). test_crier → 17 → 365 green.

- **GUI-54 Name your Stronghold — v0.37.0.** Creation gains a hold-name field (blank → the
  Scribe picks a seeded default from new HOLD_NAMES pools: "Ravenhold", "Stormgate"…, 12×10
  combos). Shown on the home day-line (🏰), the title-screen world cards, the crier header
  ("The crier of Wolfden Keep") and the Lord s title — who may RENAME it (✏️ prompt,
  game.renameHold, Lord-only). Old saves backfilled with the seeded default on load.
  test_crier → 25 → 373 green.

- **GUI-55 PWA install — v0.38.0.** Guildz is installable: manifest.webmanifest (standalone,
  portrait, theme #1a1423), REAL PNG icons (192/512, gold sword on plum — generated
  programmatically in pure node: zlib + hand-built PNG chunks), sw.js offline shell with
  NETWORK-FIRST + cache fallback (updates never stick; cache name keyed to VERSION via
  ?v=, old caches swept on activate), registration in main.js guarded for browsers.
  NEW SUITE test_pwa (15: manifest, PNG signatures/dimensions, strategy, shell-asset
  existence, wiring) → 388 green / 21 suites. Add to Home Screen away. 📱

- **GUI-84 Calendar: plain years — v0.39.0** (Founding tranche 1/5, BUILD GREENLIT
  2026-07-07). 1 season = 1 year is now OFFICIAL: every player-facing date reads in
  **Years** (home day-line, fame ladder, sunset banners, board pager, world cards, crier
  stamps D·Y, reign lengths "N years on the throne") — internal state keys stay `season`
  (no schema churn). `stronghold.foundedOn` persisted (=1: the world epoch IS the first
  hold's founding; migration backfills old saves). NEW SUITE tools/test_calendar.js (16:
  epoch, year labels, roll, worldgen arrival year, backfill) → 404 green / 22 suites.

- **GUI-87 The Hold Chronicle — v0.40.0** (Founding tranche 2/5). The permanent, curated
  counterpart of the 20-cap news ring: `state.chronicle`, append-only, never trimmed, in
  the save blob. Entries {y, d, icon, type, text, refs, k?}: **founding** 🏰 (page one of
  every world; GUI-86 writes the real story) · **regime** 👑/🛡️ (every path: NPC rebellions,
  player coronation, player deposed, walls held by lord/servant/fielded-you, failed player
  challenges) · **uprising** · **succession** ⚱️ · **child** 🐎 (founders riding out) ·
  **milestone** 🏗️ (each building's FIRST raising, k-deduped) · **legend** 💯/🌟 (100th win
  once per name; 5★ throne duels). Refs name real records for GUI-88 tap-through; softfail/
  conquest types reserved (Stewardship/Warfare). Migration: old saves open with the founding
  they never wrote down. NEW SUITE tools/test_chronicle.js (16) → 429 green / 23 suites
  (by direct sum — the old 388 figure undercounted).

- **GUI-86 Worldgen Year-0: the founding comes first — v0.41.0** (Founding tranche 3/5).
  `worldgen.rollFounding(seed)`: a veteran founder (LORD.wins 40–60 — root founders are
  legend; throne difficulty unchanged) + a seeded **archetype** weighted by their loudest
  trait (data.ARCHETYPES ×8, lore-only lines; fingerprints await GUI-85's Era-1 buildings;
  `spite` reserved for exile-founded holds). The founder TAKES THE FIRST THRONE, then the
  3 pre-sim seasons fight on top — `simulateHistory` now returns chronicle-ready `events`
  (👑 usurped / 🛡️ held per history challenge), so on arrival **chronicle, lords line and
  worldgen agree** (probe: 6/6 worlds coherent — the Lord is the founder or the last
  recorded usurper; 5/6 thrones fell — the single-duel era stays brutal, cf. GUI-33).
  The fake reignSeasons 1–4 backstory is RETIRED (real years now; "crowned this year" copy
  for reign 0 on home + profile cards). stronghold.{founder, archetype} persisted; old
  saves retro-roll a coherent origin seeded from worldSeed and their plain founding line
  is enriched. NEW SUITE tools/test_founding.js (18) → 447 green / 24 suites.

- **GUI-88 The hold profile card — v0.42.0** (Founding tranche 4/5). The GUI-46 pattern
  extended from people to PLACES: tap the hold's name — home day-line 🏰, the crier's
  header, the Lord's own title pill — and the hold's card overlays: archetype + founding
  story, "founded in Year 1 by <founder> — its Nth year", the **line of Lords** derived
  from the chronicle (founder → every 👑 usurper/uprising/⚱️ heir, with years; "<name>
  reigns today"), and the full **📜 Chronicle** in its own scrolling box (.chron-log),
  every entry date-stamped Y·D with its **refs tappable** (chronText: the Scribe's
  <b>names</b> become plinks) — champion profiles stack ON TOP of the hold card and
  close back to it. NEW SUITE tools/test_holdcard.js (20) → 467 green / 25 suites.

- **GUI-89 Founder records: departures mint holds — v0.43.0** (Founding tranche 5/5 —
  TRANCHE COMPLETE). When a veteran rides out to found (GUI-60), the ledger now MINTS
  the hold: `mintHold` — seeded name from HOLD_NAMES (never this hold's, never a
  sibling's) + archetype by their temperament (`worldgen.pickArchetype`, extracted from
  the founding roll — same rng stream, worldgen determinism intact). Ledger rows carry
  {holdName, archetype}; the chronicle's 🐎 child entry names the daughter hold and how
  it stands; profile pills read "🐎 founder of Briargate". NEW: an **ambitious deposed
  Lord** (amb ≥ 0.5) who rides out after losing the throne duel founds in **The Exile's
  Spite** 🔥 — ledger row + defiant chronicle entry (the open question resolved:
  personality-gated). Old ledgers backfill deterministically on load. The founders'
  ledger is now a real map of daughter holds — GUI-25's expansion graph and Stewardship's
  trade partners have identities waiting. NEW SUITE tools/test_founderrecords.js (14) →
  481 green / 26 suites.

- **GUI-74 + GUI-80 Stewardship numbers pass + stability sims — v0.44.0** (STEWARDSHIP
  BUILD GREENLIT 2026-07-07; sims-before-code honoured). `tools/sim_stewardship.js`:
  the four systems as a modeled overlay on REAL presided days. Population baseline
  re-anchored to the live truth (**50** = 40 roster + 10 intake → band 40–60, cap ~60,
  floor 30, dying <24). All four plan targets PASS: T1 default +502/day no spiral ·
  T2 greedy neglect dies of starvation exodus in reign season 3 (hoard fat, hold empty)
  · T3 showman grows to the crowding cap 60 / threadbare sags to the floor 30 and holds
  (20-season proof) · T4 4/4 NPC personality policies stay in band. Full sized-constants
  table in the Stewardship section ("Sim requirements — VERIFIED"). No game code —
  GUI-75..79 move the STEW constants into data.js as they build.

- **GUI-81 Era-1 building catalogue — v0.45.0.** Six arena buildings join the five of
  the keep (11 total, 🏗️ panel grouped by era; fresh-world/migration building maps now
  DERIVED from the catalogue). One live hook each (BUILDING_FX): 🍺 **Tavern** +8%
  crowd/lvl + bigger wager stakes · 🏪 **Marketplace** +1 licence line/lvl + 5% wider
  tax base · 👑 **Royal Box** flat noble-seats gate/lvl + a ★ bias in the DRAW only
  (the Scribe's ratings stay honest) · 🧱 **Walls & Gatehouse** — NEW mechanic: an
  unopposed challenger reaching the throne arrives worn through ONE `keepWear(base)`
  helper (player-lord's open keep base 1.0 → 85% at walls 3; NPC keep-guard base 0.75
  → 60%; floor 40%) · ⛪ **Chapel** one loyalty knob (+5pp/lvl): beaten challengers
  kneel more, idle veterans linger (departure thresholds +), Steadfast band champions
  +1⭐/lvl · 🗼 **Watchtower** tiered scouting on defense-prep (t1 temperament, t2
  arsenal + style) and at t3 the crier hears a claim brewing MID-season (once/season,
  persisted watchWarned). NEW SUITE tools/test_era1.js (19) → 500 green / 27 suites.
  GUI-85 fingerprints are now unblocked (Walls/Marketplace/Chapel exist).

- **GUI-85 Archetype fingerprints — v0.46.0.** Every origin leaves ONE permanent mark
  (`applyFingerprint`, guarded once per world; applied at creation AND retro-applied to
  old saves on load — free buildings only fill empty ground, never downgrade). Free
  buildings: 🏚️ Ruin → Walls t1 · 🛤️ Crossroads → Marketplace t1 · ⛪ Pilgrim's →
  Chapel t1. Hoard: ⚔️ Brigand's End +150🏛️ once. **Site traits** (origin-only, can
  never be built, read live from stronghold.archetype): 🕳️ Quarry −10% every raise
  (new `buildCost(id)` helper, UI shows the discounted price; repairs join in GUI-75) ·
  🌊 Ford +10🏛️ traveller toll on every presided gate · 🐺 Hunter −5 daily upkeep
  (becomes a provision trickle in GUI-76) · 🔥 Spite +2 founding company (recorded;
  consumed by the GUI-90 from-scratch start). Hold profile card shows the ⚙️ mark under
  the archetype. NEW SUITE tools/test_fingerprints.js (12) → 512 green / 28 suites.
  Founding & the Hold Chronicle: only GUI-90/91 remain (both wait on Stewardship).

- **GUI-75 Maintenance: buildings age — v0.47.0** (Stewardship system 1/4, sim-sized by
  GUI-74/80). Built buildings carry **condition 0–100** (`stronghold.condition`; a raise
  is fresh mortar at 100; old saves load sound). **Decay 10/season at a presided season's
  close** (+1 seating wear per 40 avg crowd — success wears the benches); NPC reigns
  maintain themselves until GUI-79's policies. **Effects scale linearly** through ONE
  helper — `bEff(id)` = level × condition% — consumed everywhere: ledger (seating/tavern/
  market/royalbox), gearScale (armory), infirmary regen, keepWear (walls), chapel (kneels/
  departures/steadfast fame), yard drills, watchtower tiers + warning, barracks (existing
  servants stay; NEW kneels need a standing roof). At 0 = **OFFLINE** + a 🏚️ crier cry.
  **Repairs by hand**: points × 2g × level (Quarry −10%), per-row 🔧 + "Repair all" on
  the 🏗️ panel, condition pills (%, RUIN). Repair POLICY (budget/priorities) arrives
  with GUI-79's NPC policies; flat upkeep retires when GUI-76 brings provisions. NEW
  SUITE tools/test_maintenance.js (23) → 535 green / 29 suites.

- **GUI-76 Granary & provisions: the hold eats — v0.48.0** (Stewardship system 2/4,
  sim-sized). data.STEW moves in: **1 unit/head/day** (residents + household + the
  Lord's table; 🐺 Hunter's Camp hunts 5 free — its interim upkeep hook retired), grain
  at a **seeded seasonal price 0.7–1.5g** re-rolled each year, larder **cap 80 bare /
  200/400/800** by the new 🌾 **Granary** (Era 2, condition-scaled). Presided days: the
  hold **eats FIRST**, then the steward buys per the **provisioning decree** (🧺 full /
  ⚖️ half / 🚫 none, buttons on the new larder card: stock bar, days-left warning, this
  year's price). **The flat ECONOMY.upkeep is RETIRED** — the ledger's real line is
  provisions. **Hunger's three bites:** starving residents fight WORN (startHp 85% —
  parchment-visible) · the crowd thins 25% · at the season's close a **starvation
  exodus** (25% × starving-fraction, floor 8 souls) empties beds while **immigration
  freezes** (both refill streams). 🍞 crier cry + the chronicle's reserved **softfail**
  type goes live ("Hunger stalked <hold>…", k-deduped per year). NEW SUITE
  tools/test_granary.js (24; test_economy/test_fingerprints updated for the retired
  upkeep) → 559 green / 30 suites.

- **GUI-78 Pull score: migration replaces automatic arrivals — v0.49.0** (Stewardship
  system 3/4, sim-verified weights). `game.pullScore()` (0–100, clamped): purse 25 +
  condition 25 + taxInv 15 + stability 15 + fame 10 + granary 10, plus a **heralds**
  budget (sqrt curve, +15 max at 100g/season — a new decree, ±25, paid at the year's
  turn). Under a **player-Lord**, the automatic 1:1 bed refill is GONE: retirement +
  departure churn ACCUMULATES, and at the season's turn arrivals = churn + (Pull−50)/6,
  growth choked by crowding (1 − pop/64). A **fed** hold never drifts below the floor
  (30); a **starving** one gets NOBODY (the freeze); below **24** it's DYING (☠️
  chronicle softfail + crier scream). A hold at **Pull ≥ 70 draws REAL careers** (arrivals
  up to 15 wins, aged to match — not just novices). Commoner worlds (NPC Lord) still
  refill 1:1 until GUI-79. New 🧲 Pull card on the Lord dashboard (score, last year's
  arrived-vs-left, heralds stepper); 🧲/🕸️ crier lines. NEW SUITE tools/test_pull.js (22;
  test_aging/test_departures updated for Pull-driven refill) → 581 green / 31 suites.

- **GUI-77 Trade: caravans between holds — v0.50.0** (Stewardship system 4/4 — the SimCity
  pillar's four systems are COMPLETE). The founders' ledger becomes a MAP: routes = every
  hold your champions rode out to found (GUI-89) + one seeded worldgen **neighbour** (so
  caravans run from Year 1). Each open route sends one caravan a year at the season turn
  (under a player-Lord), with a seeded **foreign grain price** (band 0.6–1.6, per route ×
  year) that makes the stance a timing call. **Trade-stance decree:** 💰 export (pure gold,
  cap 120 × 15% margin × foreign price) · 🌾 stockpile (buy grain into the larder where it's
  cheap) · ⚖️ balance (half each); plus **per-route open/close**. First-class ledger line
  (on the lord-sunset ledger card) + 🐫 crier headline. New 🐫 Trade card on the dashboard:
  stance buttons, route list with each hold's archetype, founder (tappable), foreign price
  + 🟢cheap/🔴dear cue, open/closed toggle. NEW SUITE tools/test_trade.js (30;
  test_pull heralds isolate updated) → 589 green / 32 suites. Stewardship build is done bar
  GUI-79 (NPC-lord policies) — then GUI-90/91 unlock the from-scratch settlement start.

- **GUI-79 NPC-lord policies: commoner holds flourish or rot — v0.51.0** (Stewardship
  system COMPLETE — the SimCity pillar is fully built). `game.npcLordPolicy(lord)` derives
  decrees + stances from GUI-42 temperament (grd → tax 5–25% & purse 40→0 & skimp-bread;
  dis → repairs on/off; amb → heralds); a neutral 0.5 Lord reproduces today's defaults.
  Migration is now **universal**: `stewardNpcHold()` runs each season under a commoner's
  NPC Lord (decrees LIVE from creation, buildings decay + repair-by-discipline, larder
  set by policy), and the Pull-driven arrivals/floor/dying logic applies to EVERY hold,
  not just the player's. pullScore stability now reads the NPC Lord's `reignSeasons` when
  the player is a commoner (incremented each season). Result (sim-matched): a grasping
  Lord's hold rots (condition falls, tax 24%, Pull ~38, population drains toward the
  floor); a wise one holds/grows (Pull ~80); a neutral one stays in the 40–60 band for
  8 years. Hold card shows a 🧲 thriving/steady/faltering/rotting verdict for your hold.
  Trade + heralds gold stay player-only (NPC treasury abstract in champion mode). NEW
  SUITE tools/test_npcpolicy.js (17; test_aging/economy/maintenance/pull updated for
  universal migration) → 629 green / 33 suites. **Only GUI-90/91 remain** (from-scratch
  settlement start + its sim) before Stewardship + Founding are wholly done.

### Build order (when the user says go)
1. **Champion summit** — NPC population + Popularity ladder + Lord boss fight (finish
   the Rise). Small, self-contained, reuses combat entirely.
2. **Lord frame** — role-aware boot with a **world-select** (multiple save-slot universes,
   each a separate save game; within a world you resume in your current role —
   Champion/Lord/Exile, roles change in place), `lord.js`
   store beside `game.js`, treasury + Renown + Scribe/Bulletin-Board + core day-organizer
   loop; coronation handoff from Champion mode.
3. **Stronghold Stewardship** — the SimCity layer (maintenance / supplies / trade /
   migration); design pass GUI-74 + sims GUI-80 first, then GUI-75→79. ← ADDED 2026-07-07
   (design done, build NOT yet greenlit). Slots before Guilds; Guilds later take over
   the same flows as middlemen.
4. **Founding Day & the Hold Chronicle** — origins/lore + the from-scratch world option.
   ← ADDED 2026-07-07 (design done, build NOT yet greenlit). The retro-lore half
   (worldgen Year-0 roll, chronicle, calendar years, NPC founder records, hold profile
   card) can land **before** Stewardship; the playable from-scratch start now **requires**
   Stewardship — its settlement act IS city-management gameplay (Pull, granary, condition,
   trade) with no arena income — so it ships with or after that pillar.
5. **Guilds** — the tithe→rent→lodging economy + guild AI (own planning pass first).
6. **Economy balance sim** — headless multi-season sim; tune rents/tithes/purses/gate/
   sales-tax until the loop is stable *and* the Lord's choices swing the outcome (same
   rigor as the combat sims).
7. **Defend / closed loop** — challengers rise in your arena and come for your throne.
8. **Exile mode (#3)** — separate design + build (survive the wilds → found a new
   Stronghold). Own pass.
9. **(far future) Stronghold warfare** — many Strongholds in one world battling on a
   battlefield (tactics, siege engines, cavalry). Own grand plan later.

### Serve — mode (the household path) (STUB, plan separately)
The third lose-the-throne fate (die / **serve** / exile), and a full **playable mode**: you
join the victorious Lord's **household** as a servant. **DECIDED:**
- **The Lord may field you to defend his throne** against challengers.
  - **Win** → you gain a **Win + HP/MP** (normal career progression); keep building up.
  - **Lose** → you **die** (a defending servant gets no die/serve/exile choice).
- **Uprising (the way out):** when you judge yourself strong enough, you may **rise against
  your own Lord** — a **Fight to the Death**: **win → you kill him and seize the throne**
  (become Lord); **lose → you die**. No serve/exile mercy — an uprising is final.
- A **deposed Lord** who chooses *serve* becomes the new Lord's servant, so the household can
  hold **former Lords** (strong, high-win defenders).
- If the Lord is toppled by someone else while you serve, you're **freed** (regime-change
  rule: rejoin a Guild / fight independently / leave).
The "**stay and rise from within**" counterpart to Exile's "leave and rebuild elsewhere".
Own build pass (household duties/favor beyond defending; servant UI; how the Lord picks his
defender — cf. Throne defensibility & servant system).

### Exile — mode #3 (STUB, plan separately)
Losing the throne fight can send you to the **wilds** instead of death: a survival mode
where you scrape by and, if you prosper, **found your own Stronghold** elsewhere —
looping back into the Lord arc from a new seat. **One-way: an exile cannot return to their
home Stronghold** (vs. Adventure, which is round-trip) — but both **wander the same shared
wilderness / outside world**. Own design pass (what survival looks like, resources, threats,
the path to founding; whether it can loop back to Champion).
Ties directly into the multi-Stronghold world below.

### Adventure — mode (STUB, plan separately)
The *other* way champions leave the Stronghold (besides Exile): a champion **voluntarily
sets out on adventure** to seek fortune in the wilds, and may **found a new Stronghold**
(feeding world expansion). **DECIDED — Adventure and Exile are two DISTINCT modes**, split
by whether you can go home:
- **Adventure = round-trip** — you **can return to your home Stronghold** and resume your
  career there.
- **Exile = one-way** — banished; you **cannot return** to your home Stronghold; the only
  path forward is founding a new one.

**Both modes share ONE wilderness / outside-world system** — the same map, survival
mechanics, threats, resources and found-a-Stronghold path. They differ only in **entry**
(forced vs. voluntary) and **return-home** (Exile no, Adventure yes). So the wilderness is
built once and reused, like the combat engine across modes.

Also the NPC-departure flavor of D2.3 ("champions leave to find other adventures"). Own
planning pass (what a round-trip yields, its cost/risk, and the founding path).

### Stronghold / Region / Kingdom warfare — far future (STUB)
*(Building support designed 2026-07-07: see "The building catalogue (eras)" → Era 3 —
Stables/cavalry, Smithy, Siege Workshop, Garrison Hall, Kennels & Mews, Moat, Beacon.)*
Long-term vision: one persistent world with a **Kingdom → Region → Stronghold** hierarchy
(Kings, Barons, Lords) where **Strongholds, Regions, and Kingdoms wage war** to conquer
territory — army tactics, siege engines ("heavy machines"), cavalry. A grand-strategy layer
*above* the arena. See **World data & persistence** for the entity/LOD model that keeps this
affordable; the data design there ensures we don't paint ourselves into a corner now.

### Open questions
**Resolved so far:** Popularity −50%/season (soft reset) · award = **boutsWon × perBoutValue(band) × Spectacle**
(formula decided; constants sim-tuned) · every fight gets a **Spectacle/Crowd rating** (feeds gate + fame)
· lose-to-Lord = **die / serve / exile** · challenge **optional but Lord must accept** ·
Lord fields **himself or a servant**; the **loser** (either) faces die/serve/exile · a
**deposed Lord's servants are freed** (rejoin guild / fight independently / leave) so a new
Lord starts empty · **defend-by-recruiting** (servants = beaten challengers who serve) ·
arena bouts **auto-resolve + Scribe/Bulletin Board** · Lord income = rent + gate/wagers +
stall licenses + **EQ sales tax**, all **Lord-decided** knobs · **byes = random** · **multiple
worlds** = each universe a separate save game (roles change in place *within* a world) · **world-gen** = pre-simulate
background seasons so you join a living Stronghold with a real, career-statted Lord · **no
hard win** for the Lord (reign until deposed or die of old age → open succession) · target
reign **≥5–6 seasons** (confirm via sim) · **Aging** is now a system · **Adventure vs Exile**
= distinct modes over **one shared wilderness** (differ by entry + return-home: Adventure round-trip, Exile one-way) · **Serve** = playable household mode (defend the throne: win→Win+HP/MP, lose→die; uprising = fight-to-death for the throne) · **challenge = gauntlet** (≤3 servants then the Lord; +50% HP/MP per bout, no full heal; a 4th servant needs releasing/exiling/killing one — tune via sim).

**Still open (user wants to think more on the ★ ones):**
- ★ **Popularity constants** — formula DECIDED (`boutsWon × perBoutValue(band) × spectacle`;
  perBoutValue starts `5 + winFloor/5`); the sim only tunes the constants.
- ★ **Throne defensibility** — DECIDED: **gauntlet** (≤3 servants then the Lord; +50% HP/MP
  per bout) + the Lord's **home-arena advantage**. Still open (sim-tuned): **target reign
  length** (assume ≥5–6), the **cap (3) & replenish (50%)**, servant **upkeep/housing**, and
  **aging**.
- **Serve / household** — DECIDED: a **playable mode** (household path). Defend the Lord's
  throne (win = Win+HP/MP, lose = die), build up, then **uprising = fight-to-the-death** for
  the throne. Own build pass (household duties/favor, servant UI). See "Serve — mode" above.
- ★ **World-gen depth** — how many background seasons to pre-simulate so the Lord +
  populated bands feel real.
- ★ **Spectacle weights/curve** — tune what thrills the crowd (via sim).
- **Aging model** — the peak→decline curve for champions; Lord lifespan.
- **Champion population model** — seed count for a fresh Stronghold; growth with
  prestige; how champions arrive / retire / die. (Deferred.)
- **Guilds** — full economics (tithe/rent/lodging numbers, non-payment penalty,
  autonomy) on their **own planning pass**.
- **Exile mode (#3)** — its **own planning pass** (survival loop → founding a Stronghold).
- **Stronghold warfare** — its **own grand plan** (multi-Stronghold battlefield).
- **Byes** — DECIDED: **random** bye for odd-count brackets.
- **Sales tax + stall licenses** — **Lord-decided** knobs (he sets the rates); coronation
  defaults + balance tuned via the economy sim.
- **Lord abilities (D1)** — DECIDED: home-arena advantage = full HP/MP + choose opening range
  (default) + **pick 1** of Home crowd / Armory / Treasury (1 HP + 1 MP potion), **building-gated**
  (prestige / Armory / treasury). Magnitudes + gate thresholds tuned by sim.
- **Multiple worlds** — DECIDED: **each universe is a separate save game** (multiple
  save-slot worlds). Within a world your role changes in place (one continuous save per
  world); a **world-select** at boot picks or creates a universe. NB: distinct from the
  many-Strongholds-in-*one*-world hierarchy — these are sealed, independent universes.

---

## Stronghold Stewardship (SimCity layer, design v7)  ← PLANNED, not built

**User direction (2026-07-07):** the Lord needs *city-management* roles, not just arena-tycoon
knobs — "ensuring maintenance of the place, supplies, trade, attract NPCs to the place (so we
don't have only people leaving). In short, city management style." Design greenlit; **no code
until a separate go.**

**What exists today vs. this pillar:** the built Lord is an *arena tycoon* (tickets, purses,
tax, licences, 5 one-shot buildings, flat upkeep). Departures exist (GUI-60, guilds-leave is
designed); **arrivals are automatic 1:1 bed-filling** — nothing attracts anyone, nothing
decays, nothing is consumed, nothing is traded. Stewardship turns those absences into the
Lord's daily job.

### The four systems (all PROPOSED; numbers sim-tuned bottom-up as always)

**1 · Maintenance — buildings age**
- Every building gains **condition 0–100**; decays per season (seating decays faster with
  big crowds — success wears the benches).
- Condition **scales the building's effect** linearly (a 50% infirmary heals half as well);
  at 0 the building is **offline** until repaired.
- **Repairs cost gold** (per-building line in the clerk's book); the flat ECONOMY.upkeep
  constant is retired in favour of real, visible costs.
- Lord role: set a **repair policy** (priority order / budget cap) or repair by hand.

**2 · Supplies — the granary**
- The hold **consumes provisions daily** (residents + household + the Lord's table).
- Sources: **market purchase** (provisioning budget decree) and **trade** (below).
- New building: **Granary** (stock cap; tiers raise it). Stock is visible on the dashboard.
- **Shortage bites:** champions start bouts worn (HP fraction — reuses the startHp
  mechanism), departures accelerate, immigration freezes, crier cries the hunger.
- **Plenty pays:** a full granary feeds the Pull score (below) and slows aging fade? (open Q).

**3 · Trade — caravans between holds**
- Partners: **the founders' ledger** — champions who rode out (GUI-60) founded the very
  holds you now trade with (+ worldgen-seeded neighbours). The dead ledger becomes a map.
- Each season (or day-N) a **caravan** runs per route: export surplus provisions/gear,
  import provisions; **seeded price swings** make timing a decision.
- Lord role: a **trade stance** decree (export surplus / balance / stockpile) + per-route
  open/close. Trade is a first-class **ledger line**; caravans make crier headlines.
- Future hooks: routes are what Warfare raids later threaten; Guilds later become the
  internal distributors of the same flows.

**4 · Attraction — the Pull score (migration)**
- Replaces automatic arrivals. **Pull = f(purses, resident fame, tax rate, granary stock,
  average building condition, throne stability (seasons since last rebellion))** — exact
  weights sim-tuned.
- High pull → **more and better hopefuls** (some arrive with real careers, not just 0–4
  wins); low pull → beds stay empty and the roster **genuinely shrinks**. Population is a
  bar the Lord can fail.
- Lord role: a **heralds budget** decree (spend gold to advertise the games abroad — a
  direct Pull lever with diminishing returns).
- NPC behaviour: hopefuls *choose* the best-pulling hold once multi-stronghold exists
  (GUI-25 synergy); until then Pull scales the arrival stream.

### NPC Lords run the same systems
Simple policy AI (personality-weighted: a Grasping lord under-repairs and over-taxes; a
Disciplined one balances) so holds visibly **flourish or rot** while the player is a
commoner — and future throne challenges gain **economic motive** (challenge the negligent).

### Soft-fail integration
Bankruptcy already deposes (designed). Stewardship adds the *paths* to it: rot, hunger and
emptiness — and their visible warnings (clerk's book lines, crier cries, condition bars).

### Compatibility notes
- **Standalone-now, Guilds-later:** the Granary abstracts food until Guilds unpark; then
  guilds become tithe-fed middlemen of the same flows (no rework — the flows just get owners).
- **World growth (GUI-25):** trade routes + Pull are exactly the edges the multi-stronghold
  world needs; founders' holds gain their first mechanical meaning.
- Save-schema: stronghold gains condition map, granary stock, routes, pull cache — all
  versioned migrations as usual.

### The building catalogue (eras) — ← user-locked 2026-07-07, design only
**Direction:** plan ALL proposed buildings + a far-future warfare set (user: "Stables for
horses?" — yes). Grounded in the historical record: bailey castles held halls, kitchens,
chapels, barracks, stores, stables, forges/workshops, granaries, dovecotes, kennels & mews;
towns added guildhalls, mills, breweries, markets, inns, wells; sieges ran on provisions,
garrisons and carpenter-built engines. House rule unchanged: **every building re-weights a
real system** (one BUILDING_FX hook each, max 3 tiers, doubling costs). The catalogue is
**era-gated** so the 🏗️ panel stays a handful of real decisions per era.

**Era 1 — Arena (hooks LIVE systems; buildable pre-Stewardship):**
- 🍺 **Tavern** — +attendance % / level; +wager stake (drunk bettors bet bigger).
- 🏪 **Marketplace** — +1 vendor licence line / level; widens the sales-tax base.
- 👑 **Royal Box** — presided days: +crowd-rating bias and a flat noble-seats gate line.
- 🧱 **Walls & Gatehouse** — keepGuardWear −5pp / level (challengers arrive MORE worn:
  75→70→65→60%); later a Pull factor ("a safe hold") and siege HP in Warfare.
- ⛪ **Chapel** — loyalty culture: idle-veteran departures less likely; beaten challengers
  kneel more often; tiny fame bonus to Steadfast residents.
- 🗼 **Watchtower** — scout card gains exact HP/MP + arsenal / level; max tier: the crier
  warns of a brewing throne claim a season early.

**Era 2 — Stewardship (gated on GUI-74..78):**
- 🌾 **Granary** (GUI-76) — provision stock cap / tier.
- 🌱 **Fields & Mill** — PRODUCES provisions daily (Fields fill, Granary stores); reduces
  market dependence; a raid target in Warfare.
- 🐄 **Pastures & Barn** — LIVESTOCK (user-named 2026-07-07): a second provision stream
  (meat) + **hides/wool as a second trade good** (armor-vendor synergy: leather prices ↓ a
  touch). Historically baileys kept "poultry and livestock" + barns. Warfare: herds are
  what raiders DRIVE OFF (a soft, recoverable raid loss vs. burned Fields).
- 🔨 **Mason's Lodge** — slows ALL building decay + cuts repair costs / level (the
  maintenance meta-building).
- 🪙 **Counting House** — better caravan prices / level + a small treasury interest tick
  (the trade meta-building).
- 💧 **Deep Well & Cistern** — shortage resilience: hunger/thirst penalties bite later and
  softer (historical siege endurance); small infirmary synergy.
- 🕊️ **Dovecote** — word flies ahead: heralds budget more effective (Pull), caravan price
  quotes visible a day early, crier reach (flavour).

**Era 3 — Warfare (far-future set; designed WITH the warfare grand plan, parked with it):**
- 🐎 **Stables** — user-named. Interim value at Stewardship: caravan range/speed (+routes,
  better margins). Warfare: CAVALRY units, speed on the campaign map.
- ⚒️ **Smithy & Forge** — the armory's big brother: gear quality tier for residents;
  Warfare: forges arms & maintains siege engines (historically carpenters + smiths kept
  the engines working).
- 🏗️ **Siege Workshop** — builds the "heavy machines" already stubbed in the warfare plan
  (trebuchet, mangonel, ram, tower); engines are EXPENSIVE, stored, and lost if the hold
  falls.
- 🎖️ **Garrison Hall** — the barracks' big brother: houses a standing WAR company beyond
  the throne household (soldiers ≠ champions; champions are heroes ON the field).
- 🐕 **Kennels & Mews** — hounds + hunting birds: campaign scouting (see enemy composition
  pre-battle); interim: a small provision trickle (the hunt).
- 🌊 **Moat & Drawbridge** — siege defence: attackers pay a toll in time/casualties before
  walls; interim: +throne stability optics (Pull).
- 🏹 **Arrow Towers** (user-named 2026-07-07) — the walls FIGHT BACK: garrison archers thin
  an attacking force each siege round (casualties before the melee); requires Walls &
  Gatehouse; interim: +1 further keepGuardWear step at max Walls (the towers cover the
  gate). The Watchtower SEES, the Beacon WARNS, the Arrow Towers KILL.
- 🔥 **Beacon Tower** — early warning of marching armies (reaction time); extends the
  Watchtower chain; crier drama ("the beacons are lit!").

**The food chain:** Fields (grain) + Pastures (meat/hides) → Granary (store) → daily
consumption; hides open a second trade good (the provisions-only-v1 open question now has
its v2 answer). **Panel sizing:** Era 1 adds 6 → 11 visible with the existing 5; Era 2
adds 7 → 18; Era 3 adds 8 → 26 total, but each era's panel groups by era with the older rows collapsed.
**NPC-lord builds are personality-flavoured** (Grasping → Counting House first; Steadfast →
Chapel; Ferocious → Garrison) — scouting a hold's skyline becomes intel. All numbers sized
in the GUI-74 design pass; Era 3 numbers wait for the warfare grand plan.

### Sim requirements — ✅ VERIFIED 2026-07-07 (GUI-74 numbers + GUI-80 sim)
`tools/sim_stewardship.js`: the four systems run as a modeled overlay on REAL presided
days (lord.holdGames → actual combat/economy). Baseline re-anchored to the true live
population: **50** (40 roster + 10 intake), so the plan's "~40" targets became 40–60
band / soft cap ~60 / floor ~30 / dying < 24. All four targets pass:
- **T1 no death spiral** ✓ default steward (repair+provision+trade): **+502/day** net
  (stewardship costs −69/day of the old +540), population drifts gently up 49→57.
- **T2 greedy neglect fails in reign season 3** ✓ (tax 25 · ticket 15 · purse 0 · no
  repairs, no provisions): starvation exodus 49→36→25→18 — dying (<24) in season 3,
  "not instantly" honoured (seasons 1–2 are survivable warnings). The hoard stays fat
  (+253/day) while the hold empties — you can strip the asset, and it visibly dies.
- **T3 cap & floor** ✓ showman+heralds grows 49→60 (soft cap, crowding-choked); a
  threadbare-but-FED hold sags 8 grace seasons then −2/season to the **floor 30** and
  stabilizes — never extinct (20-season run).
- **T4 NPC policies** ✓ 4/4 personality policies (grasping/disciplined/steadfast/
  ferocious) hold population in the 40–60 band across 8 seasons.

**The sized numbers (STEW constants — GUI-75..79 move these into data.js):**
provisions **1 unit/head/day** (residents + household + Lord) · grain **1g/unit**,
seeded seasonal swing **0.7–1.5** · bare larder cap **80** (Granary tiers raise) ·
starving days: gate+wagers **−25%**, a fully starving season drives out **25% of
residents** (the exodus IS the failure mode) + immigration freezes · decay **10
condition/season/building** (+1 seating wear per 40 avg crowd) · repair **2g/point**
(×tier) · a rotten hold keeps only **75%→100%** of its crowd by avg condition ·
caravans **1/route/season**, cap **120 units**, margin **15%** (routes = founders'
ledger + 1 seeded neighbour — GUI-89's records feed straight in) · **Pull weights**
purse 25 · condition 25 · taxInv 15 · stability 15 · fame 10 · granary 10 · heralds
+15 max for **100g/season** (sqrt curve) · net migration **(Pull−50)/6 per season** ×
crowding (1 − pop/64) · fed-hold floor **30** · dying **<24** = deposition-grade fail.

### Open questions (for the design pass)
- Does plenty slow aging fade, or is that scope creep? (leaning: cosmetic only)
- Provisions unit & prices — size bottom-up from goldForWin like everything else.
- Trade goods beyond provisions (gear? luxuries for spectacle bonus?) — v1 provisions only?
- Do empty beds affect the tournament (thinner bands = fewer bouts = smaller gate) —
  automatic via existing systems, verify in sim.

## Founding Day & the Hold Chronicle (origins/lore, design v3)  ← PLANNED, not built

**User direction (2026-07-07):** every Stronghold starts somewhere — plan **day 1 of a
hold's life** (what a founder actually does when they create one) and give every hold a
**history, lore and background** that tells the story of how it was created.
**Core decisions LOCKED 2026-07-07:** archetype fingerprints **mechanical from the start** ·
world creation offers **join a living hold OR found from scratch** · founding **treasury =
the founders' purse** · calendar shows **plain years** · chronicle = **full curated event
log**. **REVISED same day (user):** found-from-scratch is **settlement-first** — a group
of adventurers builds the place; the beginning plays as **city management**; only once it
attracts enough people is the **Arena raised** and a **Lord chosen from the founders** —
and the player may decline the crown (fight as a champion instead, or leave the city).
**No code until a separate go.**

### Principle — lore is DERIVED, never invented
Same DNA as seed-replay and the facts store: a founding story is **assembled from real
recorded data**, not random flavor text. Five ingredients, all already in (or planned for)
the save:
- **WHO** — the founder is a **real champion record**: class, career wins, age, temperament
  (GUI-42), fame. The founders' ledger (GUI-60 `state.departed`) already captures exactly this.
- **WHY** — the departure reason, already recorded: **rode out** (ambitious idle veteran) ·
  **exiled** (one-way, Exile mode) · **adventured and stayed** (Adventure mode) · **deposed
  Lord who fled** (a fallen dynasty seeds a rival hold — new, dramatic, cheap).
- **WHENCE** — the **mother hold**. Every hold except the world's first has a parent →
  the world is a **family tree of holds** (worldgen's first hold is the root; GUI-25's
  expansion graph gets its edges for free, and trade routes gain ancestry flavor).
- **WHEN** — an absolute date on the world clock (see Calendar below).
- **HOW** — a seeded **founding archetype** (below), weighted by the founder's temperament.

### Founding archetypes (seeded; temperament-weighted; 8 to start) — fingerprints DECIDED
**DECIDED (2026-07-07): mechanical from the start.** Each archetype = a Scribe phrase-pool
(HOLD_NAMES / death-theatre style) + exactly **ONE mechanical fingerprint** (the buildings
house rule, applied to origins). Two fingerprint kinds: **free buildings** enter at tier 1
and live normally afterwards (decay, upgrades); **site traits** are permanent and CANNOT be
built — only an origin grants them (origins stay meaningful forever). Magnitudes sim-tuned.
- 🏚️ **The Ruin Reclaimed** — an abandoned keep resettled (steadfast/loyal founders).
  ⚙️ free **Walls & Gatehouse** tier 1 at **~40% condition** (the old stones stand, barely).
- ⚔️ **Brigand's End** — an outlaw nest cleared by force (aggressive/brave).
  ⚙️ the brigands' **hoard** — a one-time gold bonus to the founding treasury.
- 🛤️ **The Crossroads Camp** — a trade camp that grew a palisade (cunning/grasping).
  ⚙️ free **Marketplace** tier 1.
- 🕳️ **The Quarry** — built where the stone was already cut (disciplined).
  ⚙️ site trait: **build & repair costs −10%** (the stone is right there).
- 🔥 **The Exile's Spite** — raised in defiance, within sight of the old hold's banners
  (exile-founded only; the chronicle names the Lord who cast them out).
  ⚙️ **+2 founding company** (loyalists followed you out).
- 🌊 **The Ford** — commands a river crossing (trade/warfare geography hook).
  ⚙️ site trait: **better caravan prices** (Stewardship §3); until trade lands, a small
  gate bonus (travellers stop to watch the games).
- ⛪ **The Pilgrim's Rest** — grew around a shrine (steadfast; Chapel affinity).
  ⚙️ free **Chapel** tier 1.
- 🐺 **The Hunter's Camp** — a wilderness camp that put down roots (restless/adventurers).
  ⚙️ site trait: a small daily **provision trickle** (the hunt); pre-Stewardship, a small
  upkeep discount.

### World creation — the player CHOOSES their seat (DECIDED 2026-07-07)
Creating a world now asks a second question after class/name:
- **⚔️ Join a living hold** — today's experience, unchanged: worldgen pre-sims 3 seasons,
  an established Lord reigns, you arrive as a hopeful champion and climb (Rise → Rule →
  Defend). The hold's founding is generated as **retro-lore** (Year 0 rolled first, history
  simmed on top — see context 1 below).
- **🏰 Found from scratch (REVISED — settlement-first)** — **Year 0, Day 1 is playable**,
  but there is **no arena and no Lord yet**: a **group of adventurers** (you among them,
  leading the expedition) decides to build a Stronghold. **Act 1 plays as city management**
  (the Settlement, below) — provisions, construction, trade, attracting settlers. Only when
  the place has drawn enough people is the **Arena raised** — the moment a camp becomes a
  STRONGHOLD — and a **Lord is chosen from among the founders**. The player holds first
  claim (they led the raising) and may **take the crown** (→ Lord mode), **step aside**
  (an NPC founder is acclaimed; you fight as a **champion** in the arena you built), or
  **leave the city** (the adventure/exile door) — the familiar seat / sword / road pattern.
  A tidy side effect: the fragile-Year-0-throne problem dissolves — by the time a throne
  exists, the hold has people to recruit from and a treasury that earned it.

### The four founding contexts — ONE system
1. **World genesis (retrofit).** Worldgen currently conjures a mature hold + Lord with a
   bare `reignSeasons` backstory. Instead it first rolls the **founding** (Year 0: founder,
   archetype, name), THEN pre-sims the 3 background seasons on top. The current Lord may
   **be** the founder — or their successor, if pre-sim history toppled them (the chronicle
   records the change; regime data already exists). Every world's origin becomes coherent:
   chronicle, lords list and founders' ledger all agree.
2. **From-scratch world creation (player-founded, above).** The same founding sequence,
   played rather than generated.
3. **NPC founders (GUI-60, live today).** When a veteran rides out, the departure roll now
   ALSO mints the founding record: hold name (HOLD_NAMES pools), archetype, date, parent
   hold. One tiny record — the full living hold still waits for GUI-25; but the trade
   partners of Stewardship §3 stop being name-only ("Vex's hold") and get real identities.
4. **Player founding via Exile/Adventure (future).** The second playable door: lose the
   throne and be cast out, or ride out by choice — prosper in the wilds, then run the same
   founding sequence with the career (and purse) you carried out.

### Day 1 — the camp, not the throne (REVISED 2026-07-07, user)
**A hold is not born with an arena.** Every founding passes through TWO ACTS; the player
plays them in a from-scratch world (and later via Exile/Adventure founding), NPC foundings
run the same arc compressed off-screen and RECORDED (chronicle: "founded Year N · the Arena
raised Year N+k · first Lord acclaimed").

**Act 1 — the Settlement (city management first):**
- **The founding party:** a seeded **6–10 adventurers** (the player among them in a
  from-scratch world; classes mixed, modest careers). No Lord — the founders' council
  holds the reins, and the player, having led the expedition, **makes the decisions**:
  pure Stewardship play (provisions, construction, repair, trade stance, heralds) with
  **no arena income** — the settlement lives on production + trade + the founding purse.
- **Treasury = the founders' pooled purse (DECIDED, amended):** the party pools its gold
  as founding capital (exile/adventure founding: YOUR career purse leads the pool — the
  champion who prospered founds a richer hold). NPC founders: modelled purses, the same
  math the roster uses for gear budgets.
- **Buildings:** a palisaded camp, nothing else — plus the archetype's fingerprint. The
  settlement act leans on Era-2 production buildings (Fields, Pastures, Granary, Well):
  from-scratch is **a Stewardship game in its first act**.
- **Growth = the Pull score** (Stewardship §4) — a settlement's rise IS the attraction
  system, reused not reinvented. Heralds spread word; condition, stock and safety draw
  settlers.
- **PROPOSED — settlement events:** seeded dangers keep the party's swords relevant
  pre-arena (brigands test the palisade → resolved through the real combat engine as a
  party defense; a bad harvest; a passing caravan). Marked for the design pass — the act
  needs *texture*, not just decrees.
- **The day-1 ceremony:** arrive at the site → the Scribe narrates the archetype scene →
  **name the hold** (player names it; NPCs draw from HOLD_NAMES) → the **founding
  proclamation** pins as the Board's **parchment #0** — permanent, never ring-buffers.

**Act 2 — the Raising of the Arena (the hinge):**
- When the settlement has attracted **enough people** (population threshold, sim-sized)
  and can **afford it**, the founders raise the **ARENA** — the moment a camp becomes a
  Stronghold. The Arena becomes a real, built thing with a date in the chronicle (today's
  game implicitly assumed it always existed).
- **The first games are held, and a Lord is chosen from among the founders.** The player
  holds first claim; declining passes the crown to the most ambitious/esteemed founder
  (amb-weighted seeded acclaim). The player's three doors — **crown / champion / road** —
  mirror the die/serve/exile pattern: every hinge in this game offers seat, sword, or the
  open road.
- From here the existing game takes over ENTIRE: tournaments, fame, decrees, challenges —
  a from-scratch world simply arrives at the same state a join-a-living-hold world starts
  in, having *earned* it.

### The Hold Chronicle — where the lore lives
- **Per-hold chronicle record — the FULL curated event log (DECIDED).** Permanent,
  append-only, one line per event; the 20-cap news ring stays the ticker, the chronicle is
  its permanent counterpart. What enters (curated = major beats only, no daily noise):
  the **founding** entry · every **regime change** (👑 fell / 🛡️ held, challenger named,
  gauntlet toll) · **old-age successions** ⚱️ · **uprisings** · **soft-fails survived or
  suffered** (bankruptcy, famine — Stewardship) · **children** 🐎 (a champion rides out —
  the parent hold's chronicle records the daughter hold, with its name and archetype) ·
  **building milestones** (each building's FIRST raising only, not upgrades) · **legends**
  (a resident's 100th win; a 5★ throne duel) · later, **conquests** (Warfare). Entry =
  {year, day, icon, type, refs, seeded phrase} — refs point at real records (champion ids,
  fact rows), so every line is tappable and verifiable.
- **UI:** tap a hold's name — home day-line 🏰, world cards, trade routes, the founders'
  ledger — and a **hold profile card** overlays (the GUI-46 pattern, extended from people
  to places): the founding story in Scribe prose, the founder (tappable → their champion
  profile), the hold's age in years, the **lords list** (every reign and how it ended),
  notable champions. "Founder of Wolfden Keep" likewise joins the founder's own profile card.
- **Scribe prose:** seeded phrase pools per archetype; the numbers (dates, win counts,
  reign lengths) come from the real records. Deterministic per worldSeed, as ever.

### Calendar (small prerequisite) — DECIDED: plain years
Aging is +1/season (GUI-17), so **1 season = 1 year de facto** — now official: seasons
display as **plain-numbered Years** ("Year 12", i.e. years since the world's first
founding = the world epoch). Each hold stores `foundedOn` (world season), so a hold's age
and "founded in Year 8" derive directly. Cheap: the clock already persists {day, season};
this is display + one field per hold. No era flavor names.

### Hooks & compatibility
- **Stewardship trade (§3):** routes to founders' holds gain identity, archetype and
  ancestry ("your sister-hold, founded by Vex the Grim in Year 8").
- **GUI-25 world growth:** this section defines a hold's **birth state** — the missing
  half of expansion (GUI-60 supplies the founders; this supplies what they found).
- **Warfare (far future):** the chronicle is where conquests get written; the family tree
  makes "the old grudge between sister-holds" a real, derivable thing.
- **Save schema:** hold gains {foundedOn, arenaRaisedOn, founders[], archetype, parentHold,
  chronicle[]}; departed-ledger rows gain {holdName, archetype}. Versioned migrations
  backfill old saves (seeded from worldSeed, so existing worlds retro-gain a consistent
  origin story — including a plausible arena-raising date before their pre-sim history).

### Resolved this pass (2026-07-07)
Fingerprints **mechanical from the start** (one hook each; free buildings tier 1, site
traits origin-only) · world creation = **join a living hold OR found from scratch** (both
playable) · **treasury = the founders' pooled purse** · calendar = **plain years** ·
chronicle = **full curated event log** (curation list above) · from-scratch is
**settlement-first** (a group of adventurers · Act 1 = city management, no arena/Lord ·
Arena raised at a population threshold · **Lord chosen from the founders**, player holds
first claim and may decline — **crown / champion / road**).

### Sized by the founding sim (GUI-91, `tools/sim_founding.js`, 2026-07-09)
Standalone model of the settlement economy (no arena income; party eats, one neighbour
caravan trades, settlers arrive via a settlement Pull). **CHOSEN:** founding **party 8** ·
pooled **purse 1000g** · a scrappy-camp **forage 5 units/day free** (net of provisions) ·
**Arena raised at population ≥ 16 AND treasury ≥ 400g.** Results: competent play (heralds +
repairs + Fields) raises the Arena in **year 2** with ~800g to spare (5/5 runs in the 2–5
band); neglect stretches to year 11 but the purse survives folly; a spendthrift (heralds,
no upkeep) bankrupts by year 8 — so the runway is real in both directions. The player-founder
starts a **veteran** (mirrors GUI-60's 25-win rule) so the champion door is viable.

### Still open (sim/design-pass items)
- **Settlement events** (PROPOSED above): the Act-1 texture set — brigand raids as real
  party-defense combats, harvests, caravans — own mini design list.
- Election acclaim: amb/esteem weights when the player declines (and for NPC foundings).
- Fingerprint magnitudes (hoard size, −10% quarry, Ford prices, Hunter trickle) — sim.
- Deposed-Lord-founds-in-exile: always, or personality-gated (amb/grd high)?
- Chronicle curation threshold — are building milestones/legends too chatty in practice?
  (Watch in play; the type field makes filtering trivial.)

---

## Architecture — the key decision

Logic, rendering, and input are kept **separate** so multiplayer is a bolt-on:

| Layer | File(s) | Role | Multiplayer impact |
|-------|---------|------|--------------------|
| **Engine** | `js/engine.js` | Seeded RNG + pure helpers | unchanged |
| **Data** | `js/data.js` | Classes, skills, gear (content) | unchanged |
| **Combat** | `js/combat.js` | **Pure** `(state, yourAction, foeAction) → state` | unchanged — the server runs this same code |
| **AI** | `js/ai.js` | Picks the opponent's action + generates foes | **replaced by a real player** |
| **Game** | `js/game.js` | Meta: progression, economy, day loop, save/load | logic moves server-side |
| **UI** | `js/ui.js` | Render state + capture taps/clicks | sends actions over network |
| **Boot** | `js/main.js` | Wires it together | connects to server |

The **multiplayer seam** is `js/ai.js`: single-player asks a bot for the
opponent's move; multiplayer asks another player. Combat doesn't know or care.
Battles are **seeded** so a server can replay and verify any fight (anti-cheat).

---

## World data & persistence (design v5 — full-fidelity kingdom DB)  ← PLANNED

> **Redesign (user directive):** persist **every fight in every Stronghold across the whole
> Kingdom, with all stats** — the game's AI (Kings, Barons, Lords, Guilds, champions) reads
> this history to **decide its actions**. The store is therefore not a save file but the
> **decision substrate**: an analytics-grade game database. We keep everything, and make it
> affordable with **rollups + seed-replay**, never by discarding data.

The world is a **6-level containment tree**, each level with a ruler:

```
World (a universe = one separate save game; keep several)
└─ Kingdom ×N          — ruled by a KING; kingdoms wage war
   └─ Region ×N        — ruled by a BARON; regions fight to conquer
      └─ Stronghold ×N — ruled by a LORD; hosts the arena (Champion/Lord modes)
         └─ Guild ×4   — one per class; run by guild officers (Guild roles)
            └─ Champion ×N — the atomic unit (a fighter; may HOLD any role above)
```
Rulers are **references, not copies**: a Stronghold stores `lordId → Champion`, a Region a
`baronId`, etc. A champion exists **once** and can *hold* a role at any tier.

### World genesis & growth (bottom-up, emergent) — ← per user
A new game is **NOT** a pre-built kingdom. It starts as **one Stronghold** (with pre-simmed
history, so it already has an established Lord + populated win-bands to climb). The higher
tiers **crystallize over time** through two forces:
- **Expansion (founding):** champions who **exile** or set out on **adventure** strike out and
  **found new Strongholds** → the world sprouts more strongholds.
- **Consolidation (conquest):** Lords who **battle out neighbouring strongholds** absorb them
  and are promoted — enough conquered strongholds form a **Region** under a **Baron**; enough
  regions form a **Kingdom** under a **King**.
So Region and Kingdom (and Barons/Kings) are **emergent, not predefined**, and reaching a full
Kingdom takes **very long play**. The DB therefore **starts tiny (one Stronghold) and grows** —
early-game compute/storage is trivial and scales only as the world itself does.

### The core problem: scale (and why we still keep everything)
A *mature* kingdom is thousands of champions fighting daily → potentially **millions of fight
records** over a long game (a fresh game is a **single Stronghold** and grows bottom-up — see
World genesis — so the DB starts tiny and only scales as the world does). The requirement is
to **keep them all, with stats, queryably**. Four techniques make that affordable *without
discarding data*:

**1) Full fidelity across the whole Kingdom; LOD only *between* kingdoms.**
Every Stronghold in the player's Kingdom **actually simulates** its daily card (deterministic
combat) and **persists every bout + all stats**. Only **other Kingdoms** stay aggregate
(summary power / treasury / army) until war or travel promotes them. The full-detail boundary
is the **Kingdom**, not the player's Stronghold.
| Shell | Scope | Detail kept |
|---|---|---|
| **Player's Kingdom** | every Region + Stronghold in it | **full** — every fight + all stats, persisted & queryable |
| **Other Kingdoms** | rival kingdoms | aggregate summary until they interact → then promoted to full |
Simulating a whole kingdom's fights daily is cheap (headless combat does thousands/sec) and
runs in a **Web Worker** so the UI stays smooth.

**2) Seed-replay compresses the *narration*, never the stats.**
Every fight stores its **seed + participant snapshot + action stream** and its **summary
stats** (winner, rounds, damage totals, crits, evades, spectacle, KO type, gold moved). The
round-by-round **prose is NOT stored** — it is **re-rendered deterministically from the seed**
when someone opens the Bulletin Board. So "all fight details" stay fully retrievable while
storage holds compact numbers, not megabytes of text.

**3) Rollups make decisions cheap.**
Scanning millions of fight rows per decision is too slow, so we keep **materialized aggregate
tables** (per champion / guild / stronghold / region / season), updated **incrementally** as
each fight lands. The decision AI reads the **rollups**; the raw fight facts remain for
detail, replay, and re-aggregation.

**4) Tiered detail, but nothing deleted.**
A per-round event cache exists only for **recent/notable** fights; older fights fall back to
seed-replay. All **stats and results are retained forever** — only the pre-rendered round
cache is transient.

### The database (schema, staged backends)
A proper **game database** behind a thin **storage-adapter**, so the backend swaps without
touching game logic (same discipline as the AI/combat seam). Star-schema style:
- **Entity (dimension) stores** — current mutable state: `kingdoms`, `regions`, `strongholds`,
  `guilds`, `champions`, `roles`. Normalized; rulers are id references, not copies.
- **Fact stores** (append-only, immutable):
  - `fights` — one row/bout: day, season, strongholdId, band, both championIds, **seed**,
    winner, rounds, + summary stats (dmg, crits, evades, **spectacle**, KO type, gold moved).
  - `economy_ledger` — every money flow (tithe, rent, gate, wager, sales-tax) per day.
  - `season_results`, `regime_changes`, `popularity_history`, `champion_snapshots`.
- **Rollup stores** — materialized aggregates for fast decisions (career stat lines, guild
  health, stronghold prestige/economy, region power), updated incrementally each day.
- **Indexes** on `(strongholdId, season)`, `(championId, season)`, `(guildId)`, … so decision
  queries and Bulletin-Board lookups stay fast.

**Backends (swappable via the adapter):**
- **Now (browser):** **IndexedDB** *is* the big DB — object stores + indexes, holds GBs, async.
  A tiny `localStorage` core just holds the world clock, current-location pointers, and seeds.
- **Later (server / MMO):** the same schema on **SQL (e.g. Postgres, JSONB for snapshots)** or
  a document store; heavy analytics can move to a columnar/OLAP store. Single-player → server
  becomes a swap, not a rewrite.

### Entity records (normalized, versioned)
- Every entity: stable `id`, `type`, `parentId`, `seed`, and only its **own** fields.
- **Champion** (the hot record — thousands of them): keep it *tiny* — class enum, wins,
  hp/mp bonuses, gear ids, armor+durability, **age**, status, `guildId`, optional `roleRef`.
  Integer-coded enums, short ids, delta-encoded vs. the seed baseline.
- **Schema versioned with migrations** (we already migrate saves) so the model can grow.

### Time & determinism
One **world clock** (day → season → year); LOD shells advance at different cadences. Because
everything is seed-deterministic, a shell can be **fast-forwarded / regenerated** instead of
stored step-by-step, and seeded fights stay **replayable** (anti-cheat + lets the Scribe
re-render any logged bout).

### The DB drives the AI (the decision substrate)
Every autonomous agent queries the rollups to act: a **Lord** tunes rent/purse/tax from his
stronghold economy + guild health + attendance trends; a **Guild** sets tithe / recruits /
leaves from member earnings; a **champion** buys gear or decides to challenge the Lord from
his own record; a **Baron / King** wages war from region/kingdom power. This is *why* we
persist everything — the history **is** the AI's input.

### Multiplayer from day one — the controller seam
The architecture must support MP later, so we generalize the existing combat seam **upward into
governance**: every governed entity carries a **controller** — `ai` or a `playerId`.
- **Single-player:** the human controls one Champion (→ Lord → …); every other stronghold,
  guild and ruler is `ai`.
- **Multiplayer:** many humans share **one authoritative world**; each starts in a **separate
  Stronghold**, fights to become its **Lord**, then **battles out other strongholds** to rise
  **Baron → King**. Unclaimed seats stay `ai`; the political hierarchy **is** the PvP endgame.

The same simulation + schema serve both — swapping a controller from `ai` to a player is the
bolt-on (exactly as swapping the combat AI for a remote player is). The world runs
**server-authoritative** with **seeded, replayable** fights (anti-cheat); each client acts on
the slice around its location.

### Why this matches our north star
Single-player now = the whole DB runs **client-side** (IndexedDB, world sim in a Web Worker).
Multiplayer / persistent world later = the **same schema** moves to a **server DB**, the server
becomes authoritative, and clients receive the slice around their location. No rewrite — the
storage-adapter + seam is the bolt-on point.

### New planning items this hierarchy creates (own passes)
- **Warfare at each tier** (Stronghold / Region / Kingdom): the abstract army / siege /
  cavalry layer — far future.
- **Emergence & rulers above the Lord** — how **Regions/Kingdoms form** (founding + conquest
  thresholds), how **Barons/Kings** are made (conquest/promotion), what they do, and how
  conquest transfers territory.
- **NPC daily churn** (D2.2): mechanics for champions arriving/leaving the Stronghold daily.
- **Guild roles** (D2.3): a **non-combat career path** — aging/retiring champions take guild
  offices and *manage* the guild instead of fighting (an off-ramp from the arena).

---

## Character personality (AI variety)  ← PLANNED

Every AI-controlled character carries a **personality** — a small vector of traits **seeded at
creation** (world-gen / recruitment) that **biases its decisions**. Because each character rolls
its own personality, **every game's cast behaves differently**: the decision branches fire
differently run-to-run, opponents become readable *characters*, and replayability jumps.

**It weights the existing decision logic — it is NOT a new tree.** The AI already branches on
thresholds (a Fighter charges ~80% of rounds; a Cleric heals under ~35% HP). Personality
**shifts those thresholds**: an *aggressive* Fighter charges ~95% and presses on while hurt; a
*cautious* one kites and retreats early. Same logic, personality-tuned weights → distinct,
readable behaviour.

**Trait starter set (tune via sim):**
- **Aggression** — attack/close vs. defend/kite/heal.
- **Bravery / risk** — fight-while-hurt, all-in plays, taking on stronger foes.
- **Ambition** — how hard they chase wins/gold and the throne (*do they challenge the Lord?*).
- **Cunning** — Hide, arrow swaps, positioning, spell choice, servant ordering.
- **Discipline** — resource husbandry (when to spend potions/MP).
- **Cruelty ↔ mercy** — as a Lord, **kill vs. exile vs. release** servants; finishing style.
- **Loyalty ↔ treachery** — as a servant, how soon they **uprise**; as a guildmember, stay/leave.
- **Greed ↔ generosity** — as a Lord, how high they set **rent / purse / sales-tax**.

**Scope = every AI controller** (the controller seam again): champions (combat + shopping + when
to challenge), Lords (economy knobs + servant management + fight-personally-or-not), servants
(uprising timing), guilds (tithe / recruit / leave), Barons/Kings (war appetite). A **player**
controller simply overrides personality with real choices.

**Stored** as a compact trait vector on the character record (seeded → deterministic + replayable).
**Flavour bonus:** the **Scribe** can colour narration by personality (a berserker's bout reads
differently from a duelist's).

**Balance guard:** personality adds **variance around the baseline, not power** — the balance sims
must run across a *distribution* of personalities so class balance holds for every temperament,
not just the average.

**Open (tune via sim):** the final trait list, each trait's **effect strength**, and the generation
model — uniform random vectors, or sampled **archetypes** ("Berserker / Tactician / Coward /
Tyrant / Zealot") for readability?

---

## Roadmap

### Phase 1 — Foundation  ✅ done
- [x] Project scaffold, mobile + PC layout
- [x] Seeded RNG engine (`engine.js`)
- [x] Game content: classes, skills, equipment (`data.js`)
- [x] Pure combat engine: rounds, actions, crits, status effects (`combat.js`)

### Phase 2 — Playable single-player core  ✅ done
- [x] Smoke-test the combat engine headless (Node) — 200 battles, no crashes/stalls
- [x] AI opponent policy + foe generator (`ai.js`)
- [x] Meta game: progression, day loop, save/load (`game.js`)
- [x] UI: class select, battle screen, results, shop, character (`ui.js`)
- [x] Boot + wire-up (`main.js`), styling (`style.css`, `index.html`)
- [x] Integration test of full loop (create → fight → level → shop → save/load)
- [x] **Milestone: a full game playable on your phone & PC, no setup**

### Shop / vendors (started)
- Shop tab now lists VENDORS; Magic Shop is live (Blacksmith/Alchemist = "soon").
- Magic Shop items: Potion of Life Restoration (1000g, full HP) and Potion of Mana
  Restoration (800g, full MP) — single-use in-battle consumables (effects `fullheal`
  / `fullmana`). New systems: player `inventory` (itemId→count), `buyItem`,
  vendor navigation (`state.vendor`), in-battle item actions (`item:` in combat),
  and inventory sync after each round. Shown on Hero screen; narrated on use.
  Old saves migrate (empty inventory).

### Rolled initiative (replaced fixed class order)
- Each round both sides roll 1d20 + initBonus; higher acts first (tie → player).
  A slowed fighter auto-loses initiative to a non-slowed one. `rollInitiative` in
  combat; per-round `initiative` log event. Removed the fixed INITIATIVE class order.
- Thief initiative perk: +1 @25 wins, +2 @50. Slightly lowered the Thief overall
  (lost guaranteed-first); tightened early balance (0–10 all 47–54%).

### Special arrows (Thief) — updated
- Lifesteal REMOVED. Fire → 1d10 + burn 1d4/turn (1d3 turns). Ice → 1d10 + SLOW
  (lose initiative 2 rounds), no longer a stun. Arrows vs field now: ice ~50–53%,
  fire ~65–68% (was lifesteal ~88 / fire ~80 / ice-stun ~70). Much healthier.

### Special arrows (Thief) — added
- Magic Shop, Thief-only: Ice (500g, 1d10 + stun this turn), Fire (1000g, 1d12 +
  burn 1d6/turn for 1d3 turns), Lifesteal (2000g, 2d10 + heal for dmg dealt).
  Buy once = owned; a loaded arrow replaces the missile die + adds its effect;
  swapping the active arrow mid-battle costs a full turn. Persists in save.
- Engine: `arrows`/`activeArrow` on fighter, `arrow:` swap action, arrow effects in
  doOneAttack, burn reuses poison DoT with `type`. Stun is SAME-TURN (per user) —
  not a lock because a miss deals no stun.
- BALANCE: big pay-to-power spikes (Thief vs field): Ice ~69–72%, Fire ~74–80%,
  Lifesteal ~81–88%. Thief-only, gold-gated, foes have none. Lifesteal likely
  under-priced/overpowered (permanent 2d10+heal for 2000g). Tune later if desired.

### Thief dual wield @50 wins (added) — FIXED the Fighter late-game dominance
- DUAL WIELD ≠ multi-attack. Multi-attack = N independent To-Hit rolls (`attacks`).
  Dual wield = ONE roll; on hit, damage from `weapons` dice (main full, off-hand
  half, rounded up). All-or-nothing. Distinct engine axes: `attacks` vs `weapons`.
- Key finding: 1 roll vs 2 means HALF the fumble/stun rate (5% vs 9.7%), so raw
  dual wield was actually STRONGER (thief 70% @W50). Off-hand-half damage offsets
  it -> thief 55.8% @W50, even with Fighter 56.7% / Mage 57.7%. Fighter/Thief now
  50/50. The #1 imbalance is solved.
- Cleric W50 perk (extended): Shield of Faith 100% max HP; Spiritual Weapon 1d10
  but MELEE-ONLY (idles at missile range — `meleeOnly` pet flag + `petIdle` log;
  AI moves to melee to enable it). Perk fields shieldPct/spiritDmg/spiritMelee.
- Weapon is INDEPENDENT of the Cleric's range: it flies in on its first round
  (`pet.engaged`, `petMove` log), then strikes every round while the Cleric stays
  safe at missile. (Earlier version wrongly gated on the Cleric's own range.)
- Result @50 now balanced: Fighter 45 / Thief 47 / Mage 57 / Cleric 50. Cleric
  went 40 -> ~50 (viable backline caster); removed the Thief hard-counter (57->47).
- OPEN: Cleric still a bit hot @25 (57%, spiritual weapon scaling); Mage slightly
  high @50 (57%).

### Thief evasion (added)
- Base Thief trait (from win 0): an incoming attack is evaded on a 1d20 >= `evade`
  (data field on the class). `evadeOn` in combat, checked in doOneAttack (physical
  attacks only; spells/pet-attacks bypass). Shown as "💨 Evade X%" in classStats.
- Tuned via sim: 14 (35%) far too strong (thief 63–70%); set to 18 (15%) → thief
  ~52–54% @0–25 wins (was 47/41). W50 still weak (23%) — flat evade can't fix the
  late Fighter gap without over-buffing early. Number is one field, easy to retune.
- INTERPRETATION taken: passive dodge of incoming attacks, available from win 0.
  (If "evade" meant an active flee/escape action, revisit.)
- Scales: 18 (15%) base, improves to 17 (20%) at 50 wins via the evade perk.
  W50 thief 18% -> ~26% overall — helps but Fighter 2-attack still dominates (72%).

### Martial abilities (added)
- New system: win-unlocked active abilities for non-casters (no MP), data-driven
  `abilities: [{id, name, at, ...}]`; new `ability:` action + `autoCritNext` flag.
- Thief "Hide in Shadows" @25 wins: roll To Hit; on success the next attack is a
  guaranteed crit (consumes a turn). Shown on Hero screen; 🌑 hidden status tag.
  Balance-neutral by design (trades a turn for one guaranteed crit) — thief +2% @W25.

### Combat rule: critical miss aborts a flurry
- A nat-1 on any strike of a multi-attack action aborts the remaining strikes AND
  stuns the attacker next round (skipNext). Minor W50 impact (~1%, fumbles are 5%).

### Win-based class perks (added)
- Engine: `attacks` (strikes per attack action, via `doOneAttack` loop) + data-driven
  `perks: [{at, attacks?, toCrit?}]` applied in makeFighter by win count.
- Fighter: +1 attack @10 wins (2), +1 more @25 (3). Thief: crit-on-18 (toCrit 15) @10,
  +1 attack @25 (2). Shown on Hero screen (unlocked/locked).
- BALANCE: over-buffs martials. Fighter dominant @10+ wins (74–80%); Thief 60% @25;
  Cleric collapses (29/16/14%) — can't survive multi-attack burst. W0 unchanged.
  Multi-attack is a ~2–3× damage multiplier — very strong. Needs compensating perks
  for Mage/Cleric or toned-down Fighter attacks.

### Career-race sim (to 75 wins, 10 trials, full loop: alloc + gold + shop)
- Result: Thief 110 battles (win% 68) > Cleric 125 (60) > Mage 149 (51) > Fighter
  171 (44). All reached 75/10.
- KEY FINDING: the SHOP ECONOMY is unbalanced, not the base classes. Thief buys
  Fire arrows (PERMANENT power) ~20 wins in and dominates the rest of its career;
  casters buy consumable potions (smaller boost); Fighter has NOTHING to buy so its
  gold piles up unused → stuck at base, worst in the race.
- FIX: build the Blacksmith (weapons/armor for Fighter + defense for all) so every
  class has a gold sink that converts to power. Would flatten this race.

### Armor system (designed + engine-complete; NOT yet playable — no Blacksmith UI)
- Model: flat Damage Reduction (DR) vs PHYSICAL only. Magic (spells, summons, DoTs,
  arrow effects) bypasses. Enchanted variants (2× cost, +25% durability) also block
  magic. Crit doubled then −DR. Shield of Faith absorbs first, then armor. Evasion
  first. Armor wears 1 durability/physical-hit, breaks at 0 (re-buy).
- Tiers (Blacksmith): Leather DR1 25dur 250g (all) · Chain DR2 50dur 500g (Fighter/
  Cleric, −1 init) · Plate DR3 75dur 1000g (Fighter only, −2 init). Enchanted = 2×.
- Foes buy best affordable armor from their win-gold (`bestAffordableArmor`).
- Gold now SCALES: 50/win (<25), 100 (25–49), 150 (50+) — `goldForWin`/`totalGoldAt`.
- Class perks retuned for the armored meta (all LIVE in data): Fighter 2 attacks @25,
  3 @50. Thief dual wield @25 (was @50). Cleric: Shield 100% @25, Spiritual Weapon
  strikes TWICE @25 (1d8; 1d10 @50). Cleric Holy Smite tried + REMOVED (MP-starved).
- Career sim (to 75 wins, full loop): final band ~30–43%. Cleric 43 / Mage 41.5 /
  Fighter 30.4 / Thief 30.2. Fixed the fighter (was worst) & cleric via volume/free
  offense. ROOT still open: casters (magic bypasses armor) > martials (physical
  soaked) in armored meta. Levers to converge: armor-pierce (user disliked), magic
  reduced by ½ DR, or foes wear less armor.
- ✅ RESOLVED: Blacksmith is now built, live and tested end-to-end (browse by class
  proficiency, buy/equip, DR applies in battle, durability wears + persists, narration,
  Hero card, save/load). Players and foes are now symmetric on armor.
- CAREER-TOURNAMENT FINDING (600-battle sim + equal-wins 1200/pair/band sim): at
  EQUAL wins the classes are still not flat — Thief 57.5 / Fighter 55.4 / Cleric 46.9 /
  Mage 40.2. Balance also SWINGS by win-band (rock-paper-scissors that rotates: Fighter
  spikes @10–20, Thief @25–40, Cleric @50, Mage is the consistent underdog). Deferred:
  buff Mage mid-game / smooth band swings. Balance is "good enough for now" per user.
  Sims saved: `sim_tourney.js`, `sim_equalwins.js`.

### Phase 3 — Make it fun (polish)  ← in progress
Done: rich combat narration (varied, damage-tiered, class/weapon flavor, d20 rolls
kept), opening fight banner, per-line emphasis (crit/heavy/fumble/summon), and a
finishing-blow recap + KO flourish on the victory/defeat screens. All pure UI.

Balance (via `tools/balance.js`, 12k+ battles/matchup, both sides = shipped AI):
- Early/mid game (0–10 wins) is balanced: all classes 47–52%.
- Class identities: Fighter = melee bruiser (closes), Thief = ranged skirmisher
  (1d8 missile, wants distance), Mage = burst caster.
- FIXED: Mage late-game falloff, via Summon Air Elemental (40 MP, HP=caster,
  2d10/round, soaks ~half of physical hits). Equal-footing Mage @25/@50 wins:
  31%/20% -> 54%/59%. Real-play veteran Mage reach≥1: 36% -> 50% (≈ melee classes).
  Slight over-correction @50 wins (Mage 59% vs ~45%) — dial summon cost up if needed.
- OPEN (difficulty curve, not class balance): ~50% lose fight #1, streaks ≥10 rare.
  Retune `ai.generateFoe` ramp — awaiting target streak length.
- Engine has optional off-by-default hooks (`spellPower`, `dodge`) for tuning.
- DONE: UI renders the summoned elemental (HP bar under the Mage + summon/petHit/
  petDown log lines). Verified headless.
- [ ] Balance pass (damage, XP/gold curves, foe scaling)
- [ ] Combat "juice": animations, hit feedback, sound
- [ ] More skills, gear, class identity
- [ ] Onboarding / first-run experience

### Cleric class (added)
- ⛪ Cleric: 24 HP / 24 MP, To Hit 50, To Cast 60, Mace (1d6) + Sling (1d4).
  Spells: Holy Smite (1d10, 6 MP), Cure Wounds (heal 3d8, 8 MP, auto-hit — the
  game's first self-heal), Divine Wrath (2d10, 12 MP). Introduced the `heal`
  spell mechanic. Tuned via sim: all 4 classes 47–52% at 0 wins.
- REDESIGNED per user: removed Holy Smite / Divine Wrath / Curse. Now 25/25 with
  Shield of Faith (10 MP, HP buffer = maxHP, absorbs hits until it breaks — new
  `shield` mechanic + `dealDamage` routing) and Spiritual Weapon (20 MP, permanent
  untargetable pet that attacks with the caster's To Hit/Crit for 1d8 — new
  to-hit pet type), plus the three auto-heal tiers. All work + narrated.
- BALANCE (Spiritual Weapon 5 rounds; Shield 75% maxHP @20 MP): well-balanced.
  @0 wins ~53% overall (edge vs Fighter 64% — early game runs on weapon+mace since
  25 MP can't afford both spirit and shield); @25 wins ~50% overall (58/43/48/50).
  Note: shield % only matters once MP can afford weapon + shield (mid-game onward).
- Engine additions kept: `shield`/`dealDamage`, to-hit pets, timed pets (`turns`),
  `shieldPct`, `petExpire`.
- Spiritual Weapon duration now SCALES: base 5 rounds + 1 per 5 wins (`turns`/`turnsPer`
  in data → dur = turns + floor(wins/turnsPer)). So 5/7/10/15 rounds @ 0/10/25/50 wins.
  Fixed the Cleric's early/mid game (now 51–55% @ W0–10). Slightly hot @ W25 (63%).

### Equipment (started)
- Weapons drive the melee/missile damage dice (class dice kept as unarmed fallback).
- Starting loadout: Fighter = Two-Handed Sword (1d8) + Short Bow (1d6); Thief =
  One-Handed Sword (1d6) + Long Bow (1d8); Mage = Staff (1d4) + Sling (1d4).
- Player carries `equipment: {melee, missile}` (saved; old saves migrate). Foes
  spawn with their class starting weapons. Shown on the Hero screen; weapon names
  appear in combat narration and on the attack buttons.
- Next EQ step: buyable weapons/armor/potions in the Shop (armor adds the missing
  defense layer; a spell-focus/MP potion is the Mage's late-game lever).

### Phase 4 — Multiplayer
- [ ] Small Node server; move authoritative logic + combat engine server-side
- [ ] Account/character persistence
- [ ] Real-time PvP matchmaking (replace the AI seam)
- [ ] Leaderboards / ranked ladder

---

## How to run

Static site — no build step. A tiny Node static server is included:

```bash
node serve.js 47811
# then open http://localhost:47811
```

## Decisions still open (we'll settle as we go)
- Carry HP/MP between streak wins, or full-heal each fight? (v1: full-heal)
- Continue-vs-retreat after each win (risk/reward banking)?
- How punishing should losing be? (v1: keep all progress, day just ends)

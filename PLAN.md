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

### Build order (when the user says go)
1. **Champion summit** — NPC population + Popularity ladder + Lord boss fight (finish
   the Rise). Small, self-contained, reuses combat entirely.
2. **Lord frame** — role-aware boot with a **world-select** (multiple save-slot universes,
   each a separate save game; within a world you resume in your current role —
   Champion/Lord/Exile, roles change in place), `lord.js`
   store beside `game.js`, treasury + Renown + Scribe/Bulletin-Board + core day-organizer
   loop; coronation handoff from Champion mode.
3. **Guilds** — the tithe→rent→lodging economy + guild AI (own planning pass first).
4. **Economy balance sim** — headless multi-season sim; tune rents/tithes/purses/gate/
   sales-tax until the loop is stable *and* the Lord's choices swing the outcome (same
   rigor as the combat sims).
5. **Defend / closed loop** — challengers rise in your arena and come for your throne.
6. **Exile mode (#3)** — separate design + build (survive the wilds → found a new
   Stronghold). Own pass.
7. **(far future) Stronghold warfare** — many Strongholds in one world battling on a
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

/* Career tournament sim — 4 class groups (10 players each), 10 rounds.
 * Each round every group plays every other group; players re-matchmade by
 * similar win-count each round. Real combat.js engine + ai.js decisions +
 * full career progression (gold, stat allocation, shopping, durability). */
function fakeEl(){return {innerHTML:"",addEventListener(){},closest(){return null},classList:{add(){},remove(){}},dataset:{},value:"",style:{}};}
const els={}; global.window=global; global.document={getElementById:id=>(els[id]=els[id]||fakeEl())};
const store={}; global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]};
for (const f of ["engine","data","combat","ai"]) require("/workspace/Guildz/js/"+f+".js");
const { CLASSES, ARMOR, ARMOR_MAXTIER, goldForWin } = G.data;
const combat = G.combat, ai = G.ai, engine = G.engine;

const CLASS_IDS = ["fighter","thief","mage","cleric"];
const GROUP_SIZE = 10, ROUNDS = 10;
const score = (a) => a ? a.dr*2 + (a.magical?1:0) : -1;

// ---- career state ----
function makePlayer(classId, n){
  const c = CLASSES[classId];
  return { id:`${classId[0].toUpperCase()}${n}`, classId, wins:0, gold:0,
    bonusHp:0, bonusMp:0,
    equipment:{...c.startEq}, inventory:{}, arrows:[], activeArrow:"normal",
    armor:null, armorDurability:0,
    battles:0, tourneyWins:0, losses:0, armorBought:0 };
}
function combatChar(p){
  const c = CLASSES[p.classId];
  return { name:p.id, classId:p.classId, wins:p.wins,
    maxHp:c.startHp+p.bonusHp, maxMp:(c.caster?c.startMp+p.bonusMp:0),
    meleeWeapon:p.equipment.melee, missileWeapon:p.equipment.missile,
    items:{...p.inventory}, arrows:p.arrows.slice(), activeArrow:p.activeArrow,
    armor:p.armor, armorDurability:p.armorDurability, isPlayer:true };
}

// ---- shopping & progression ----
function buyBestArmor(p){
  const max = ARMOR_MAXTIER[p.classId]||0;
  let best=null;
  for(const id in ARMOR){ const a=ARMOR[id]; if(a.tier<=max && p.gold>=a.cost && score(a)>score(best)) best=a; }
  const curScore = (p.armor && p.armorDurability>0) ? score(ARMOR[p.armor]) : -1;
  if(best && score(best) > curScore){ p.gold-=best.cost; p.armor=best.id; p.armorDurability=best.durability; p.armorBought++; }
}
function shop(p){
  buyBestArmor(p);
  if(p.classId==="thief"){
    if(!p.arrows.includes("fire") && p.gold>=1000){ p.gold-=1000; p.arrows.push("fire"); }
    else if(!p.arrows.includes("ice") && p.gold>=500){ p.gold-=500; p.arrows.push("ice"); }
    p.activeArrow = p.arrows.includes("fire")?"fire":p.arrows.includes("ice")?"ice":"normal";
  } else if(p.classId==="mage"){
    if(!(p.inventory.potion_mana>0) && p.gold>=1600){ p.gold-=1000; p.inventory.potion_mana=1; }
  } else if(p.classId==="fighter"){
    if(!(p.inventory.potion_healing>0) && p.gold>=2600){ p.gold-=1000; p.inventory.potion_healing=1; }
  }
}
function applyWin(p){
  p.wins++; p.tourneyWins++; p.gold += goldForWin(p.wins);
  const c = CLASSES[p.classId];
  if(c.caster){ const pools=ai.maxPools(p.classId, p.wins, 0.6); p.bonusHp=pools.maxHp-c.startHp; p.bonusMp=pools.maxMp-c.startMp; }
  else p.bonusHp += 2;
  shop(p);
}

// ---- combat stats ----
const STAT = { rounds:0, hits:0, misses:0, crits:0, critmiss:0, evades:0, dodges:0,
  fizzles:0, mitigated:0, armorBroke:0, shields:0, summons:0, heals:0, dotTicks:0, potions:0, draws:0 };
function tally(log){
  for(const e of log){ switch(e.t){
    case "hit": STAT.hits++; if(e.crit)STAT.crits++; STAT.mitigated+=e.mitigated||0; if(e.armorBroke)STAT.armorBroke++; break;
    case "miss": STAT.misses++; break;
    case "critmiss": STAT.critmiss++; break;
    case "evade": STAT.evades++; break;
    case "dodge": STAT.dodges++; break;
    case "fizzle": STAT.fizzles++; break;
    case "spell": if(e.crit)STAT.crits++; STAT.mitigated+=e.mitigated||0; break;
    case "petHit": if(e.crit)STAT.crits++; break;
    case "shield": STAT.shields++; break;
    case "summon": case "summonWeapon": STAT.summons++; break;
    case "heal": STAT.heals++; break;
    case "poison": STAT.dotTicks++; break;
    case "item": STAT.potions++; break;
  }}
}
function syncBack(p,f){ p.armor=f.armor; p.armorDurability=f.armorDurability; p.inventory={...f.items}; p.arrows=f.arrows.slice(); p.activeArrow=f.activeArrow; }

function fight(A, B, seed){
  const aIsYou = (seed & 1)===0;
  const youC = combatChar(aIsYou?A:B), foeC = combatChar(aIsYou?B:A);
  let b = combat.newBattle(youC, foeC, seed);
  let guard=0;
  while(b.phase==="choose" && guard++<160){
    const rngY = engine.makeRng(seed + b.round*40503 + 7);
    const rngF = engine.makeRng(seed + b.round*97 + 91193);
    const aY = ai.chooseAction(b.you, b.foe, b.range, rngY);
    const aF = ai.chooseAction(b.foe, b.you, b.range, rngF);
    b = combat.resolveRound(b, aY, aF);
  }
  STAT.rounds += b.round; tally(b.log);
  const youCareer = aIsYou?A:B, foeCareer = aIsYou?B:A;
  let youWon;
  if(b.phase==="won") youWon=true;
  else if(b.phase==="lost") youWon=false;
  else { STAT.draws++; youWon = (b.you.hp/b.you.maxHp) >= (b.foe.hp/b.foe.maxHp); }
  const winner = youWon?youCareer:foeCareer, loser = youWon?foeCareer:youCareer;
  syncBack(youCareer, b.you); syncBack(foeCareer, b.foe);
  winner.battles++; loser.battles++; loser.losses++;
  applyWin(winner);
  return { winner };
}

// ---- head-to-head matrix ----
const H2H = {}; for(const a of CLASS_IDS){ H2H[a]={}; for(const bb of CLASS_IDS) H2H[a][bb]={w:0,l:0}; }

// ---- build groups & run ----
const groups = {}; for(const cid of CLASS_IDS) groups[cid] = Array.from({length:GROUP_SIZE},(_,i)=>makePlayer(cid,i+1));
const pairings = [];
for(let i=0;i<CLASS_IDS.length;i++) for(let j=i+1;j<CLASS_IDS.length;j++) pairings.push([CLASS_IDS[i],CLASS_IDS[j]]);

let seed = 1000;
for(let r=0;r<ROUNDS;r++){
  const sorted = {}; for(const cid of CLASS_IDS) sorted[cid] = groups[cid].slice().sort((a,b)=>b.wins-a.wins);
  for(const [ca,cb] of pairings){
    for(let i=0;i<GROUP_SIZE;i++){
      const A = sorted[ca][i], B = sorted[cb][i];
      const { winner } = fight(A, B, seed++);
      if(winner.classId===ca){ H2H[ca][cb].w++; H2H[cb][ca].l++; }
      else { H2H[cb][ca].w++; H2H[ca][cb].l++; }
    }
  }
}

// ---- summary ----
const totalBattles = ROUNDS*pairings.length*GROUP_SIZE;
const sum=(arr,f)=>arr.reduce((s,x)=>s+f(x),0), avg=(arr,f)=>sum(arr,f)/arr.length;
const rows = CLASS_IDS.map(cid=>{
  const g=groups[cid], c=CLASSES[cid];
  const wins=sum(g,p=>p.tourneyWins), bt=sum(g,p=>p.battles);
  return { name:c.name, wins, battles:bt, winrate:100*wins/bt,
    avgWins:avg(g,p=>p.wins), maxWins:Math.max(...g.map(p=>p.wins)),
    avgGold:avg(g,p=>p.gold), avgHp:avg(g,p=>c.startHp+p.bonusHp),
    avgMp:c.caster?avg(g,p=>c.startMp+p.bonusMp):0, armorBought:sum(g,p=>p.armorBought) };
}).sort((a,b)=>b.wins-a.wins);

const L=(...a)=>console.log(...a), P=(s,n)=>String(s).padStart(n), E=(s,n)=>String(s).padEnd(n);
L("\n==================== CAREER TOURNAMENT ====================");
L(`${CLASS_IDS.length} groups x ${GROUP_SIZE} players | ${ROUNDS} rounds | ${totalBattles} battles`);
L("Re-matchmade by similar win-count each round.\n");
L("---------- GROUP STANDINGS (by total wins) ----------");
L("Rank  Class     Wins  Battles  Win%   AvgWins  Top   AvgGold  AvgHP  AvgMP  Armor");
rows.forEach((x,i)=>L(
  `${E((i+1)+".",5)} ${E(x.name,8)} ${P(x.wins,4)} ${P(x.battles,7)}  ${P(x.winrate.toFixed(1),4)}%  `+
  `${P(x.avgWins.toFixed(1),6)}  ${P(x.maxWins,3)}  ${P(Math.round(x.avgGold),6)}  ${P(x.avgHp.toFixed(0),4)}  `+
  `${P(x.avgMp?x.avgMp.toFixed(0):"-",4)}  ${P(x.armorBought,4)}`));

L("\n---------- HEAD-TO-HEAD WIN% (row vs column) ----------");
L("           "+CLASS_IDS.map(c=>P(CLASSES[c].name.slice(0,7),8)).join(""));
for(const a of CLASS_IDS){
  let line=E(CLASSES[a].name,11);
  for(const b of CLASS_IDS){
    if(a===b){ line+=P("—",8); continue; }
    const rec=H2H[a][b], t=rec.w+rec.l;
    line+=P(t?`${(100*rec.w/t).toFixed(0)}%`:"-",8);
  }
  L(line);
}
L("(each row = that class's win% vs the column class)");

L("\n---------- COMBAT EVENT STATS (all "+totalBattles+" battles) ----------");
L(`Avg battle length    : ${(STAT.rounds/totalBattles).toFixed(1)} rounds`);
L(`Attacks landed       : ${STAT.hits}  (crits ${STAT.crits} = ${(100*STAT.crits/STAT.hits).toFixed(1)}%)`);
L(`Misses / crit-misses : ${STAT.misses} / ${STAT.critmiss}`);
L(`Thief evades         : ${STAT.evades}`);
L(`Spell fizzles        : ${STAT.fizzles}`);
L(`Heals cast           : ${STAT.heals}`);
L(`Shields raised       : ${STAT.shields}`);
L(`Summons / spirit wpns: ${STAT.summons}`);
L(`DoT ticks (pois/burn): ${STAT.dotTicks}`);
L(`Potions used         : ${STAT.potions}`);
L(`Armor dmg mitigated  : ${STAT.mitigated}  (pieces shattered ${STAT.armorBroke})`);
L(`Draws (round cap)    : ${STAT.draws}`);
L("==========================================================\n");

/* Equal-wins balance test — both combatants built at the EXACT same win count,
 * with the gear a player at that win level would typically own (same rule as
 * foe generation: best affordable armor from totalGoldAt(wins); thief arrows).
 * Isolates true class balance at equal progression — no snowball confound. */
function fakeEl(){return {innerHTML:"",addEventListener(){},closest(){return null},classList:{add(){},remove(){}},dataset:{},value:"",style:{}};}
const els={}; global.window=global; global.document={getElementById:id=>(els[id]=els[id]||fakeEl())};
const store={}; global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]};
for (const f of ["engine","data","combat","ai"]) require("/workspace/Guildz/js/"+f+".js");
const { CLASSES, ARMOR, ARMOR_MAXTIER, totalGoldAt } = G.data;
const combat=G.combat, ai=G.ai, engine=G.engine;

const CLASS_IDS=["fighter","thief","mage","cleric"];
const BANDS=[0,5,10,15,20,25,30,40,50];
const K=1200; // fights per class-pair per band (half each side)

function charAt(cls, wins){
  const c=CLASSES[cls];
  const pools = c.caster ? ai.maxPools(cls,wins,0.6) : {maxHp:c.startHp+2*wins, maxMp:0};
  const armor = ai.__ ? null : bestArmor(cls, totalGoldAt(wins));
  let arrows=[], active="normal";
  if(cls==="thief"){ const g=totalGoldAt(wins)-(armor?ARMOR[armor].cost:0);
    if(g>=1000){arrows=["fire"];active="fire";} else if(g>=500){arrows=["ice"];active="ice";} }
  return { name:cls[0].toUpperCase(), classId:cls, wins, maxHp:pools.maxHp, maxMp:pools.maxMp,
    meleeWeapon:c.startEq.melee, missileWeapon:c.startEq.missile,
    armor, armorDurability:armor?ARMOR[armor].durability:0, arrows, activeArrow:active, items:{}, isPlayer:true };
}
function bestArmor(cls, gold){ const max=ARMOR_MAXTIER[cls]||0; let best=null,s=-1;
  for(const id in ARMOR){const a=ARMOR[id]; if(a.tier<=max&&gold>=a.cost){const sc=a.dr*2+(a.magical?1:0); if(sc>s){s=sc;best=id;}}} return best; }

function fight(cA, cB, seed){
  const aIsYou=(seed&1)===0;
  let b=combat.newBattle(aIsYou?cA:cB, aIsYou?cB:cA, seed);
  let g=0;
  while(b.phase==="choose" && g++<160){
    const rY=engine.makeRng(seed+b.round*40503+7), rF=engine.makeRng(seed+b.round*97+91193);
    b=combat.resolveRound(b, ai.chooseAction(b.you,b.foe,b.range,rY), ai.chooseAction(b.foe,b.you,b.range,rF));
  }
  let youWon = b.phase==="won" ? true : b.phase==="lost" ? false : (b.you.hp/b.you.maxHp)>=(b.foe.hp/b.foe.maxHp);
  // map back to A: A is "you" iff aIsYou
  return youWon===aIsYou; // true => A won
}

// results[band][a][b] = A win% ; overall per class
const per={}; const overall={}; CLASS_IDS.forEach(c=>overall[c]={w:0,t:0});
const pairs=[]; for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)pairs.push([CLASS_IDS[i],CLASS_IDS[j]]);

for(const band of BANDS){
  per[band]={};
  for(const [ca,cb] of pairs){
    const A=charAt(ca,band), B=charAt(cb,band);
    let aw=0;
    for(let k=0;k<K;k++){ if(fight({...A,items:{}}, {...B,items:{}}, band*100000+ (ca.charCodeAt(0)*7+cb.charCodeAt(0))*137 + k*2 +1)) aw++; }
    per[band][ca]=per[band][ca]||{}; per[band][cb]=per[band][cb]||{};
    per[band][ca][cb]=100*aw/K; per[band][cb][ca]=100*(K-aw)/K;
    overall[ca].w+=aw; overall[ca].t+=K; overall[cb].w+=(K-aw); overall[cb].t+=K;
  }
}

const L=(...a)=>console.log(...a), P=(s,n)=>String(s).padStart(n), E=(s,n)=>String(s).padEnd(n);
L("\n============ EQUAL-WINS BALANCE (both sides same win count) ============");
L(`${K} fights per class-pair per band | bands: ${BANDS.join(", ")} wins\n`);

L("Overall win% at equal wins (across all pairs & bands):");
CLASS_IDS.map(c=>({c,wr:100*overall[c].w/overall[c].t})).sort((a,b)=>b.wr-a.wr)
  .forEach(x=>L(`   ${E(CLASSES[x.c].name,9)} ${x.wr.toFixed(1)}%`));

L("\nWin% BY WIN-BAND (row class vs the field average that band):");
L("  Band "+CLASS_IDS.map(c=>P(CLASSES[c].name.slice(0,7),9)).join(""));
for(const band of BANDS){
  let line="  "+P(band,3)+" ";
  for(const c of CLASS_IDS){
    const opps=CLASS_IDS.filter(o=>o!==c);
    const wr=opps.reduce((s,o)=>s+per[band][c][o],0)/opps.length;
    line+=P(wr.toFixed(0)+"%",9);
  }
  L(line);
}
L("  (each cell = that class's avg win% vs the other 3 classes, at that win count)");

L("\nHead-to-head at a few key bands (row vs column win%):");
for(const band of [0,15,30,50]){
  L(`\n  -- ${band} wins --`);
  L("             "+CLASS_IDS.map(c=>P(CLASSES[c].name.slice(0,7),9)).join(""));
  for(const a of CLASS_IDS){
    let line="  "+E(CLASSES[a].name,11);
    for(const b of CLASS_IDS){ line += a===b?P("—",9):P(per[band][a][b].toFixed(0)+"%",9); }
    L(line);
  }
}
L("\n=======================================================================\n");

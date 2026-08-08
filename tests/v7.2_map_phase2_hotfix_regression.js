'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const file=process.argv[2]||path.join(__dirname,'engine.v721.core.bundle.js');
let code=fs.readFileSync(file,'utf8');
const marker='global.GameEngine = GameEngineFacade;';
if(!code.includes(marker)) throw new Error('instrument marker missing');
code=code.replace(marker,`global.__P2TEST__={newGame,ensureExpansion,hexStep,canTraverse,hexDistance,hexAwayDirection,hexBestToward,moveToward,moveAway,knockback,expansionEndPipeline,syncMapState,shrinkZone,activeSupplyPosition,resolveSupplyChoice,mapPositionForLabel,assertCoreInvariants,PHASE};\n${marker}`);
const ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const P=ctx.__P2TEST__,G=ctx.GameEngine,R=[];
const A=(x,m)=>{if(!x)throw Error(m||'assert')};
const T=(name,fn)=>{try{const detail=fn();R.push({name,ok:true,detail})}catch(e){R.push({name,ok:false,error:String(e&&e.stack||e)})}};
function fresh(a='luoji',b='lafeng',seed=72101){
  const s=P.newGame(a,b,{first:0,seed,map:'terraced_arena_9x9'});
  // Keep direct-internal regression deterministic: side 0 owns the expansion unless a test transfers it.
  s.mainActionSide=0;s.mainTurnOwner=0;s.initiativeSide=0;s.turn=0;
  P.syncMapState(s); return s;
}
function setLabel(s,side,label){const c=s.mapState.cells[label];A(c,`missing ${label}`);s.players[side].pos={r:c.row,c:c.col};P.syncMapState(s);}
function findTowardPair(s){
  const cs=Object.values(s.mapState.cells).filter(c=>c.walkable&&c.zone);
  for(const a of cs)for(const b of cs){
    if(a.label===b.label)continue;
    const from={r:a.row,c:a.col},target={r:b.row,c:b.col},d=P.hexDistance(from,target);
    if(d<3)continue;
    const step=P.hexBestToward(s,from,target,target);
    if(step&&P.hexDistance(step,target)<d)return [a,b];
  }
  throw Error('no toward pair');
}
function findAwayPair(s){
  const cs=Object.values(s.mapState.cells).filter(c=>c.walkable&&c.zone);
  for(const a of cs)for(const b of cs){
    if(a.label===b.label)continue;
    const from={r:a.row,c:a.col},target={r:b.row,c:b.col},d=P.hexDistance(from,target);
    if(d>3)continue;
    for(const dir of ['e','ne','nw','w','sw','se']){
      const n=P.hexStep(s,from,dir);
      if(n&&P.canTraverse(s,from,n)&&!(n.r===target.r&&n.c===target.c)&&P.hexDistance(n,target)>d)return [a,b];
    }
  }
  throw Error('no away pair');
}
function findKnockPair(s){
  const cs=Object.values(s.mapState.cells).filter(c=>c.walkable&&c.zone);
  for(const atk of cs)for(const def of cs){
    if(atk.label===def.label)continue;
    const ap={r:atk.row,c:atk.col},dp={r:def.row,c:def.col};
    if(P.hexDistance(ap,dp)!==1)continue;
    const dir=P.hexAwayDirection(s,ap,dp),n=dir&&P.hexStep(s,dp,dir);
    if(n&&P.canTraverse(s,dp,n)&&!(n.r===ap.r&&n.c===ap.c))return [atk,def];
  }
  throw Error('no knock pair');
}

T('hexStep reads MapState cell without legacy exists',()=>{
  const s=fresh();const src=s.mapState.cells.E1;
  A(src.exists===undefined,'reproduction requires MapState cell without exists');
  const step=P.hexStep(s,{r:src.row,c:src.col},'e');
  A(step&&step.label==='F1',`hexStep failed: ${JSON.stringify(step)}`);
  return {from:'E1',to:step.label};
});

T('automatic approach moves and closes distance',()=>{
  const s=fresh();P.ensureExpansion(s,0);const [a,b]=findTowardPair(s);setLabel(s,0,a.label);setLabel(s,1,b.label);
  const before=P.hexDistance(s.players[0].pos,s.players[1].pos);
  P.moveToward({state:s,attacker:0,defender:1,log:{note:'',statusApplied:[]},card:{name:'regression'}},1);
  const after=P.hexDistance(s.players[0].pos,s.players[1].pos);
  A(after<before,`approach did not move ${before}->${after}`);return {from:a.label,target:b.label,before,after};
});

T('automatic retreat moves and increases distance',()=>{
  const s=fresh();P.ensureExpansion(s,0);const [a,b]=findAwayPair(s);setLabel(s,0,a.label);setLabel(s,1,b.label);
  const before=P.hexDistance(s.players[0].pos,s.players[1].pos);
  P.moveAway({state:s,attacker:0,defender:1,log:{note:'',statusApplied:[]},card:{name:'regression'}},1);
  const after=P.hexDistance(s.players[0].pos,s.players[1].pos);
  A(after>before,`retreat did not move ${before}->${after}`);return {from:a.label,threat:b.label,before,after};
});

T('knockback / forced displacement moves defender and occupant',()=>{
  const s=fresh();P.ensureExpansion(s,0);const [a,b]=findKnockPair(s);setLabel(s,0,a.label);setLabel(s,1,b.label);
  const before={...s.players[1].pos},beforeLabel=s.mapState.occupants[1];
  P.knockback({state:s,attacker:0,defender:1,log:{note:'',statusApplied:[]},card:{name:'regression'}},1);
  const after=s.players[1].pos;P.syncMapState(s);
  A(after.r!==before.r||after.c!==before.c,'defender did not move');
  A(s.mapState.occupants[1]!==beforeLabel,'occupant did not change');
  return {attacker:a.label,defenderFrom:b.label,defenderTo:s.mapState.occupants[1]};
});

T('CHASE_WINDOW always owns a live expansion after handoff',()=>{
  const s=fresh('luoji','lafeng',72105);P.ensureExpansion(s,0);s.phase=P.PHASE.PRE_ATTACK;
  s.players[1].mechanics.lafengSeize=true;
  P.expansionEndPipeline(s,{voluntary:true,reason:'regression_lifecycle'});
  A(s.phase===P.PHASE.CHASE_WINDOW,`phase=${s.phase}`);
  A(!!s.expansion,'CHASE_WINDOW has no expansion');
  A(s.expansion.initiativeSide===1,`initiative=${s.expansion.initiativeSide}`);
  P.assertCoreInvariants(s);
  return {phase:s.phase,expansionId:s.expansion.id,initiativeSide:s.expansion.initiativeSide};
});

T('shrink relocation is unique and synchronized',()=>{
  const s=fresh();setLabel(s,0,'E1');setLabel(s,1,'E9');s.section=3;P.syncMapState(s);P.shrinkZone(s);P.syncMapState(s);
  const a=s.mapState.cells[s.mapState.occupants[0]],b=s.mapState.cells[s.mapState.occupants[1]];
  A(a&&b&&a.zone!==false&&b.zone!==false,'relocation outside zone');
  A(s.mapState.occupants[0]!==s.mapState.occupants[1],'double occupancy');
  return {A:s.mapState.occupants[0],B:s.mapState.occupants[1],section:s.section};
});

T('danger-zone damage resolves at expansion end',()=>{
  const s=fresh('lafeng','qiu013',72106);s.section=2;P.syncMapState(s);P.shrinkZone(s);
  const c=Object.values(s.mapState.cells).find(c=>c.danger&&c.zone!==false&&c.walkable);
  A(c,'no danger candidate');setLabel(s,0,c.label);P.ensureExpansion(s,0);s.phase=P.PHASE.PRE_ATTACK;
  const hp=s.players[0].hp;P.expansionEndPipeline(s,{voluntary:true,reason:'danger_regression'});
  A(s.players[0].hp<hp,`danger did not damage ${hp}->${s.players[0].hp}`);
  return {cell:c.label,before:hp,after:s.players[0].hp};
});

T('active supply comes from MapState and rotates after choice',()=>{
  const s=fresh();const sp=P.activeSupplyPosition(s);A(sp,'no active supply');setLabel(s,0,sp.label);P.ensureExpansion(s,0);s.phase=P.PHASE.PRE_ATTACK;
  const before=s.mapState.objectives.supplies.find(x=>x.active).cell;
  P.expansionEndPipeline(s,{voluntary:true,reason:'supply_regression'});A(s.phase===P.PHASE.SUPPLY_CHOICE,'supply choice not opened');
  const rr=P.resolveSupplyChoice(s,0,'shield');A(rr.ok,'supply choice failed');P.syncMapState(s);
  const after=s.mapState.objectives.supplies.find(x=>x.active).cell;A(before!==after,'supply did not rotate');
  return {before,after};
});

T('resource controller/streak uses MapState objective',()=>{
  const s=fresh();const rp=s.mapState.objectives.resource.cell;setLabel(s,0,rp);P.ensureExpansion(s,0);s.phase=P.PHASE.PRE_ATTACK;
  const q=s.players[0].qi;P.expansionEndPipeline(s,{voluntary:true,reason:'resource_regression'});P.syncMapState(s);
  A(s.players[0].mechanics.resourceStreak>=1,'resource streak missing');
  A(s.players[0].qi>=q,'resource qi regressed');
  return {cell:rp,streak:s.players[0].mechanics.resourceStreak,controller:s.mapState.objectives.resource.controller};
});

T('browser UI objective markers are MapState-driven',()=>{
  const html=fs.readFileSync(path.join(__dirname,'斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html'),'utf8');
  A(html.includes('resourceObjectiveCell=S.mapState?.objectives?.resource?.cell'),'resource marker not MapState-driven');
  A(html.includes('activeSupplyLabels=new Set((S.mapState?.objectives?.supplies||[]).filter(x=>x.active)'),'supply marker not active-driven');
  A(!html.includes('if(MAP.supplyPoints.includes(label)){'),'legacy static supply rendering remains');
  return {resource:'MapState',supply:'MapState.active'};
});

const report={engine:G.version,passed:R.filter(x=>x.ok).length,total:R.length,failed:R.filter(x=>!x.ok),results:R};
console.log(JSON.stringify(report,null,2));process.exit(report.passed===report.total?0:1);

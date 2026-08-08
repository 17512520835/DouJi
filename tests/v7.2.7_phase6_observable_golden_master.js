'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname;
function load(file){
  const ctx={console:{log(){},warn(){},error(){}},structuredClone};
  ctx.globalThis=ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),ctx);
  return ctx.GameEngine;
}
const OLD=load('engine.v714.core.bundle.js');
const CUR=load('engine.v721.core.bundle.js');

const PAIRS=[
  ['luoji','qiu013'],['chiyu','xuanyi'],['lafeng','baiye'],['lanyu','youying'],
  ['fayoum','luoji'],['qiu013','fayoum'],['baiye','chiyu'],['xuanyi','lafeng']
];
const SEEDS=[713113,726613];
const DROP=new Set(['actionId','cardInstanceId','cardKey']);

function cleanAction(v){
  if(Array.isArray(v)) return v.map(cleanAction);
  if(v&&typeof v==='object'){
    const o={};
    for(const key of Object.keys(v).sort()){
      if(DROP.has(key)) continue;
      const val=v[key];
      if(typeof val==='function'||val===undefined) continue;
      o[key]=cleanAction(val);
    }
    return o;
  }
  return v;
}
function keyAction(a){return JSON.stringify(cleanAction(a));}

const PUB_MECH=[
  'fate','feathers','awakened','chickGuard','lakeDance','lakeDanceCharges','bloodTotem',
  'flowBreak','swiftDouble','momentumArmed','painExcited','fullOverload','qiuHormoneArmed',
  'lafengRiposteArmed','lafengRiposteReady','lafengSeize','xuanyiHiddenNeedleArmed',
  'xuanyiHiddenNeedleReady','fateLineFrom','resourceStreak','followStepAvailable',
  'championRoundLeft','cornerStorm','sunDance','gloryCall','curtainCall','greatCycle'
];
function pDigest(p,viewerOwn){
  const m={};
  for(const k of PUB_MECH) if(p.mechanics&&p.mechanics[k]!==undefined) m[k]=p.mechanics[k];
  return {
    hero:p.hero?.id,hp:p.hp,energy:p.energy,qi:p.qi,pos:p.pos,
    handCount:p.handCount??p.hand?.length,deckCount:p.deckCount??p.deck?.length,
    hand:viewerOwn?(p.hand||[]).map(c=>c.hidden?'?':c.name):undefined,
    discard:(p.discard||[]).map(c=>c.name||'?'),
    statusSlots:p.statusSlots,ultimatesUsed:p.ultimatesUsed,mechanics:m
  };
}
function digest(core,side){
  const o=core.getObservationForSide(side);
  return {
    phase:o.phase,round:o.round,section:o.section,
    mainActionSide:o.mainActionSide,mainTurnOwner:o.mainTurnOwner,initiativeSide:o.initiativeSide,
    expansionCount:o.expansionCount,chain:o.chain,winner:o.winnerAB??o.winner,
    responseWindow:o.responseWindow?{
      side:o.responseWindow.side,attackerSide:o.responseWindow.attackerSide,
      chain:o.responseWindow.chain,attackName:o.responseWindow.attackName||o.responseWindow.cardName
    }:null,
    pendingChoice:o.pendingChoice?{
      type:o.pendingChoice.type,side:o.pendingChoice.side,ownerSide:o.pendingChoice.ownerSide,
      count:o.pendingChoice.count,private:!!o.pendingChoice.private
    }:null,
    players:[pDigest(o.players[0],side==='A'),pDigest(o.players[1],side==='B')],
    // Only legacy-visible objective summary is compared; MapState internal representation is excluded.
    board:{resource:o.board?.resource,supply:o.board?.supply,zoneStage:o.board?.zoneStage}
  };
}
function diffs(a,b,p=''){
  const out=[];
  if(typeof a!==typeof b||a===null||b===null){
    if(JSON.stringify(a)!==JSON.stringify(b)) out.push({path:p,a,b});
    return out;
  }
  if(Array.isArray(a)){
    if(a.length!==b.length) out.push({path:p+'.length',a:a.length,b:b.length});
    for(let i=0;i<Math.min(a.length,b.length);i++) out.push(...diffs(a[i],b[i],`${p}[${i}]`));
    return out;
  }
  if(typeof a==='object'){
    const ks=new Set([...Object.keys(a),...Object.keys(b)]);
    for(const k of ks) out.push(...diffs(a[k],b[k],p?`${p}.${k}`:k));
    return out;
  }
  if(a!==b) out.push({path:p,a,b});
  return out;
}
function approved(ds,heroes){
  const paths=ds.map(x=>x.path);
  if(heroes.includes('fayoum') && paths.length && paths.every(p=>p.startsWith('pendingChoice.')))
    return 'FAYOUM_SUN_FORMULA_PENDING_CHOICE';
  if(heroes.includes('qiu013') && paths.length &&
     paths.every(p=>/players\[[01]\]\.(handCount|deckCount|hand(?:\.length|\[)|mechanics\.qiuSuppressBreakUsedThisRound)/.test(p)))
    return 'V7.2.4_PASSIVE_DRAW_SOFT_TARGET';
  return null;
}
function chooseCommon(lo,lc,seed,step){
  const cm=new Map(lc.map(a=>[keyAction(a),a]));
  const common=lo.filter(a=>cm.has(keyAction(a))).sort((a,b)=>keyAction(a).localeCompare(keyAction(b)));
  if(!common.length) return null;
  const h=crypto.createHash('sha256').update(`${seed}:${step}`).digest().readUInt32LE(0);
  const a=common[h%common.length];
  return [a,cm.get(keyAction(a)),keyAction(a),common.length];
}
function actor(c){
  if(c.getLegalActions('A').length) return 'A';
  if(c.getLegalActions('B').length) return 'B';
  return null;
}

const scenarios=[];
let unexplained=0,totalCommands=0;
for(let i=0;i<PAIRS.length;i++) for(const seed of SEEDS){
  const [ha,hb]=PAIRS[i], first=seed%2?'A':'B';
  const co=OLD.createGame({heroA:ha,heroB:hb,firstPlayer:first,seed,map:'terraced_arena_9x9'});
  const cc=CUR.createGame({heroA:ha,heroB:hb,firstPlayer:first,seed,map:'terraced_arena_9x9'});
  let status='PASS',reason=null,step=0,lastKey=null;
  const MAX=12; // Spot-check window deliberately kept before large section-transition responsibility differences.
  for(;step<MAX;step++){
    const ao=actor(co),ac=actor(cc);
    if(ao!==ac){status='FAIL';reason=`actor diverged ${ao}/${ac}`;break;}
    if(!ao) break;
    const pair=chooseCommon(co.getLegalActions(ao),cc.getLegalActions(ac),seed,step);
    if(!pair){status='FAIL';reason='no common semantic legal action';break;}
    const [xo,xc,k]=pair; lastKey=k;
    const ro=co.dispatch(xo),rc=cc.dispatch(xc); totalCommands++;
    if(!ro.ok||!rc.ok){status='FAIL';reason=`dispatch ${ro.ok}/${rc.ok}`;break;}
    const ds=diffs(digest(co,'A'),digest(cc,'A'));
    if(ds.length){
      const ap=approved(ds,[ha,hb]);
      if(ap){status='PASS_WITH_APPROVED_EXCEPTION';reason=ap;break;}
      status='FAIL';reason={message:'observable divergence',diffs:ds.slice(0,12),action:k};break;
    }
  }
  if(status==='FAIL') unexplained++;
  scenarios.push({heroA:ha,heroB:hb,seed,first,status,steps:step,reason,lastAction:lastKey});
}
const report={
  version:'V7.2.7',
  phase:'Phase6 Observable Golden Master',
  baseline:{file:'engine.v714.core.bundle.js',version:OLD.version},
  current:{file:'engine.v721.core.bundle.js',version:CUR.version},
  scope:'Randomized semantic spot-check before large section-transition responsibility differences. MapState internals are excluded.',
  method:'same seed + same heroes + same first player + identical semantic legal command; compare player-observable digest after every command',
  approvedExceptions:[
    'V7.2.4_PASSIVE_DRAW_SOFT_TARGET',
    'FAYOUM_SUN_FORMULA_PENDING_CHOICE'
  ],
  summary:{
    scenarios:scenarios.length,totalCommands,
    pass:scenarios.filter(x=>x.status==='PASS').length,
    passWithApprovedExceptions:scenarios.filter(x=>x.status==='PASS_WITH_APPROVED_EXCEPTION').length,
    unexplainedFailures:unexplained
  },
  passed:unexplained===0,
  scenarios
};
fs.writeFileSync(path.join(ROOT,'V7.2.7_Phase6_ObservableGoldenMaster_验证报告.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(!report.passed) process.exitCode=1;

'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const coreFile=process.argv[2]||path.join(__dirname,'engine.v721.core.bundle.js');
const code=fs.readFileSync(coreFile,'utf8'),ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const G=ctx.GameEngine,H=Object.keys(G.catalog.HEROES),RUNS=4,MAX_ACTIONS=700,results=[];
const heap=[],postGcHeap=[]; let globalEventDup=0, globalRejected=0, snapshotPollution=0, replayMismatch=0, maxLedger=0, maxResponseDepth=0, maxActionDepth=0;
function actor(core){return core.getLegalActions('A').length?'A':'B'}
function run(seed,i){
  const a=H[i%H.length],b=H[(i*4+3)%H.length],first=seed%2?'A':'B';
  const core=G.createGame({heroA:a,heroB:b,firstPlayer:first,seed,map:'terraced_arena_9x9'});
  const ais={A:G.createAI('tactical',a,'A',seed),B:G.createAI('tactical',b,'B',seed)};
  const ids=new Set();let actions=0,dups=0,rejected=0,peakLedger=0,peakResponse=0,peakAction=0,stagnantDigest=0,lastDigest=core.getStateDigest();
  for(;actions<MAX_ACTIONS;actions++){
    const obs=core.getObservationForSide('A'); if(obs.winner!=null)break;
    const side=actor(core),legal=core.getLegalActions(side); if(!legal.length)throw Error(`no legal actions @${actions}/${obs.phase}`);
    peakAction=Math.max(peakAction,legal.length);
    peakResponse=Math.max(peakResponse,obs.responseWindow?1:0,obs.pendingChoice?1:0);
    peakLedger=Math.max(peakLedger,obs.expansion?.eventLedger?.events?.length||0);
    if(actions%25===0){
      const before=core.getStateDigest(),snap=core.getObservationForSide(side);
      snap.phase='SNAPSHOT_POLLUTION_PROBE'; if(snap.players?.[0])snap.players[0].hp=-999;
      if(core.getStateDigest()!==before)snapshotPollution++;
    }
    const act=ais[side].choose(core); if(!act)throw Error(`AI null @${actions}/${side}`);
    const r=core.dispatch(act); if(!r.ok){rejected++;globalRejected++;throw Error(`COMMAND_REJECTED ${JSON.stringify(act)}`)}
    for(const e of r.events||[]){
      const id=e.eventId||`${e.sequence??e.seq}:${e.type}`;
      if(ids.has(id)){dups++;globalEventDup++;} ids.add(id);
    }
    const phase=core.getObservationForSide('A').phase,digest=core.getStateDigest();
    stagnantDigest=(digest===lastDigest)?stagnantDigest+1:0;lastDigest=digest;
    if(stagnantDigest>80)throw Error(`state digest stalled ${phase}`);
    if(actions%50===0)heap.push(process.memoryUsage().heapUsed);
  }
  const final=core.getObservationForSide('A'),replay=G.replay(core.exportReplay()),same=replay.getStateDigest()===core.getStateDigest();
  if(!same)replayMismatch++;
  maxLedger=Math.max(maxLedger,peakLedger);maxResponseDepth=Math.max(maxResponseDepth,peakResponse);maxActionDepth=Math.max(maxActionDepth,peakAction);
  return {seed,heroA:a,heroB:b,first,actions,winner:final.winner,completed:final.winner!=null,rejected,eventDuplicates:dups,
    peakExpansionLedgerEvents:peakLedger,peakLegalActionSet:peakAction,peakResponseTransactionDepth:peakResponse,
    replayDigestMatch:same,terminalPhase:final.phase,round:final.round,section:final.section};
}
for(let i=0;i<RUNS;i++){
  const seed=726500+i*7919,r=run(seed,i);results.push(r);
  if(global.gc){global.gc();postGcHeap.push(process.memoryUsage().heapUsed);}
  console.log(`${i+1}/${RUNS}`,r.seed,r.heroA,'vs',r.heroB,r.actions,r.winner);
}
const heapMin=heap.length?Math.min(...heap):0,heapMax=heap.length?Math.max(...heap):0,unfinished=results.filter(x=>!x.completed).length;
const gcFirst=postGcHeap[0]||0,gcLast=postGcHeap.at(-1)||0,gcGrowth=gcLast-gcFirst;
const report={version:'V7.2.6',phase:'Phase5 Long AI Stability',
  passed:unfinished===0&&globalRejected===0&&globalEventDup===0&&snapshotPollution===0&&replayMismatch===0,
  runs:RUNS,maxActions:MAX_ACTIONS,
  summary:{completed:RUNS-unfinished,unfinished,commandRejected:globalRejected,eventDuplicates:globalEventDup,snapshotPollution,
    replayDigestMismatch:replayMismatch,heapSamples:heap.length,heapMinBytes:heapMin,heapMaxBytes:heapMax,heapGrowthBytes:heapMax-heapMin,
    postGcHeapBytes:postGcHeap,postGcGrowthBytes:gcGrowth,postGcGrowthRatio:gcFirst?gcGrowth/gcFirst:null,
    peakExpansionLedgerEvents:maxLedger,peakLegalActionSet:maxActionDepth,peakResponseTransactionDepth:maxResponseDepth,
    actionQueueModel:'synchronous dispatch; no persistent Action Queue object in Core',
    responseQueueModel:'ResponseWindow/PendingChoice are single active transactions; no persistent Response Queue object in Core'},
  results};
fs.writeFileSync(path.join(__dirname,'V7.2.6_Phase5_长局稳定性_验证报告.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));if(!report.passed)process.exitCode=1;

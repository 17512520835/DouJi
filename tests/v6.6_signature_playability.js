'use strict';
require(process.argv[2]||'./engine.v721.core.debug.bundle.js');
const G=global.GameEngine,heroes=Object.keys(G.catalog.HEROES),checks=[];
function check(name,fn){try{checks.push({name,ok:true,detail:fn()??null})}catch(e){checks.push({name,ok:false,error:String(e&&e.stack||e)})}}
for(let i=0;i<heroes.length;i++){
  const a=heroes[i],b=heroes[(i+4)%heroes.length],seed=66000+i*97;
  check(`${a}：当前公共Core可玩性/AI合法性`,()=>{
    const core=G.createGame({heroA:a,heroB:b,firstPlayer:'A',seed,map:'terraced_arena_9x9'});
    const ais={A:G.createAI('role',a,'A',seed+1),B:G.createAI('role',b,'B',seed+2)};let actions=0;
    for(;actions<30;actions++){
      const obs=core.getObservationForSide('A');if(obs.winner!=null)break;
      const side=core.getLegalActions('A').length?'A':'B',legal=core.getLegalActions(side);if(!legal.length)throw Error(`no legal actions @${actions}`);
      const act=ais[side].choose(core);if(!act||!legal.some(x=>x.actionId===act.actionId))throw Error(`illegal AI choice @${actions}`);
      const r=core.dispatch(act);if(!r.ok)throw Error(`COMMAND_REJECTED @${actions}`);
    }
    return {opponent:b,actions,winner:core.getObservationForSide('A').winner};
  });
}
const report={stage:'V6.6 signature playability compatibility (migrated to current public Core)',passed:checks.every(x=>x.ok),checks};
console.log(JSON.stringify(report,null,2));process.exit(report.passed?0:1);

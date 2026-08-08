'use strict';
require('./engine.v721.core.bundle.js');
const G=global.GameEngine,heroes=['luoji','chiyu','lafeng','qiu013','baiye','lanyu','youying','xuanyi','fayoum'];
let games=0,commands=0,failures=[];
function pick(arr,n){return arr[n%arr.length]}
for(let seed=1;seed<=8;seed++){
  const g=G.createGame({heroA:pick(heroes,seed),heroB:pick(heroes,seed+3),firstPlayer:seed%2?'A':'B',seed:72000+seed,map:'terraced_arena_9x9'});
  for(let step=0;step<80;step++){
    const oa=g.getObservationForSide(0),ob=g.getObservationForSide(1);
    if(oa.winnerAB||ob.winnerAB)break;
    const side=oa.currentPlayer==='A'?0:1;
    const obs=side===0?oa:ob;
    let action;
    if(obs.pendingChoice?.type==='scry_order'&&obs.pendingChoice.cards?.length){
      action={kind:'scry_order',choiceId:obs.pendingChoice.id,cardInstanceIds:obs.pendingChoice.cards.map(c=>c.instanceId)};
    }else{
      const legal=g.getLegalActions(side);
      if(!legal.length)break;
      action=legal[(seed*31+step*17)%legal.length];
    }
    const r=g.dispatch(action);commands++;
    if(!r.ok){failures.push({seed,step,side,action,error:r.error});break;}
    const m=g.queryMapState();
    if(!m||Object.keys(m.cells).length!==61){failures.push({seed,step,error:'MapState invalid'});break;}
  }
  games++;
}
console.log(JSON.stringify({engine:G.version,games,commands,failures,ok:failures.length===0},null,2));
process.exit(failures.length?1:0);

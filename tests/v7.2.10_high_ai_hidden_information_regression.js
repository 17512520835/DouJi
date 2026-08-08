'use strict';
const fs=require('fs'),path=require('path');
const files=['engine.v721.core.bundle.js','engine.v721.core.debug.bundle.js'];
const results=[];
function A(x,m){if(!x)throw Error(m)}
for(const file of files){
  const src=fs.readFileSync(path.join(__dirname,file),'utf8');
  const start=src.indexOf('function v7210UnknownCard');
  const end=src.indexOf('\n\nfunction tacticalWithWeights',start);
  A(start>=0&&end>start,`${file}: V7.2.10 lookahead block missing`);
  const block=src.slice(start,end);
  A(block.includes('function v7210PerspectiveState(state,rootSide)'),`${file}: perspective state missing`);
  A(/side!==rootSide&&Array\.isArray\(p\.hand\)/.test(block),`${file}: opponent hand is not masked`);
  A(/Array\.isArray\(p\.deck\)/.test(block),`${file}: hidden deck order is not masked`);
  A(block.includes('const searchBase=v7210PerspectiveState(state,rootSide);'),`${file}: lookahead does not start from information-set state`);
  A(block.includes('applyAction(clone(searchBase),a)'),`${file}: root simulation still starts from full GameState`);
  const choice=block.slice(block.indexOf('function v7210OpponentAwareInternalChoice'));
  A(!choice.includes('applyAction(clone(state),a)'),`${file}: full-state search bypass remains`);
  results.push({file,ok:true});
}
require('./engine.v721.core.bundle.js');
const G=global.GameEngine,heroes=Object.keys(G.catalog.HEROES);let decisions=0,rejected=0;
for(let i=0;i<8;i++){
  const seed=721000+i*173;const a=heroes[i%heroes.length],b=heroes[(i*5+2)%heroes.length];
  const core=G.createGame({heroA:a,heroB:b,firstPlayer:i%2?'B':'A',seed,map:'terraced_arena_9x9'});
  const ais={A:G.createAI('tactical',a,'A',seed+11),B:G.createAI('tactical',b,'B',seed+29)};
  for(let step=0;step<30;step++){
    const oa=core.getObservationForSide('A');if(oa.winner!=null)break;
    const side=core.getLegalActions('A').length?'A':'B';const before=core.getStateDigest();
    const act=ais[side].choose(core);A(act,`null AI action ${seed}/${step}`);A(core.getStateDigest()===before,`AI mutated state ${seed}/${step}`);
    const legal=core.getLegalActions(side);A(legal.some(x=>x.actionId===act.actionId),`illegal AI choice ${seed}/${step}`);
    const r=core.dispatch(act);decisions++;if(!r.ok){rejected++;throw Error(`COMMAND_REJECTED ${seed}/${step}`)}
  }
}
console.log(JSON.stringify({stage:'V7.2.10 High AI Hidden Information Boundary',passed:true,structural:results,behavioral:{decisions,rejected}},null,2));

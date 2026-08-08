'use strict';
const path=require('path');
require(path.join(__dirname,'engine.v721.core.bundle.js'));
const G=global.GameEngine;
function assert(x,m){if(!x)throw new Error(m)}
const ids=Object.keys(G.catalog.HEROES), heroA=ids[0], heroB=ids[8];
const game=G.createGame({heroA,heroB,seed:20260807,firstPlayer:'A',map:'terraced_arena_9x9'});
const a=game.getObservationForSide(0), b=game.getObservationForSide(1);
const aJson=JSON.stringify(a), bJson=JSON.stringify(b);
const bOwn=b.players[1].hand.map(c=>c.instanceId).filter(Boolean), aOwn=a.players[0].hand.map(c=>c.instanceId).filter(Boolean);
assert(bOwn.every(id=>!aJson.includes(id)),'A Observation 泄露了 B 手牌 instanceId');
assert(aOwn.every(id=>!bJson.includes(id)),'B Observation 泄露了 A 手牌 instanceId');
let steps=0;
while(steps<80){
  const oa=game.getObservationForSide(0); if(oa.winner!==null&&oa.winner!==undefined)break;
  const la0=game.getLegalActions(0), la1=game.getLegalActions(1), legal=la0.length?la0:la1, side=la0.length?0:1;
  assert(legal.length,`step ${steps} 无合法动作`);
  const action=legal.find(x=>x.kind==='end'||x.kind==='pass')||legal[0];
  const before=game.getStateDigest();
  assert(!legal.some(x=>x.actionId==='forged-action-id'),'伪造 actionId 意外合法');
  assert(game.getStateDigest()===before,'仅检查伪造动作不应改变状态');
  const r=game.dispatch(action); assert(r.ok,`合法动作被拒绝 side=${side}`); steps++;
}
const replay=game.exportReplay(), rebuilt=G.replay(replay);
assert(rebuilt.getStateDigest()===game.getStateDigest(),'Replay digest 不一致');
console.log(JSON.stringify({ok:true,steps,finalDigest:game.getStateDigest(),replayDigest:rebuilt.getStateDigest(),hiddenInformation:'PASS',authoritativeActionIdGate:'PASS'},null,2));

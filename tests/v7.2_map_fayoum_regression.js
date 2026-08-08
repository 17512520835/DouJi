'use strict';
require('./engine.v721.core.bundle.js');
const G=global.GameEngine;
const R=[];const T=(n,f)=>{try{f();R.push({name:n,ok:true})}catch(e){R.push({name:n,ok:false,error:String(e&&e.stack||e)})}};
const A=(x,m)=>{if(!x)throw Error(m||'assert')};
function gameWithSolar(){
  for(let seed=1;seed<500;seed++){
    const g=G.createGame({heroA:'fayoum',heroB:'luoji',firstPlayer:'A',seed,map:'terraced_arena_9x9'});
    const o=g.getObservationForSide(0);
    if(o.players[0].hand.some(c=>c.name==='太阳算式'))return g;
  }
  throw Error('500 seeds内未抽到太阳算式');
}
T('版本与MapState公开查询',()=>{
  A(/^0\.5\.[12]-map-phase2/.test(G.version),'engine version');
  const g=G.createGame({heroA:'fayoum',heroB:'luoji',firstPlayer:'A',seed:720,map:'terraced_arena_9x9'});
  const m=g.queryMapState();A(m.mapId==='terraced_arena_9x9','map id');A(Object.keys(m.cells).length===61,'cell count');
  A(m.objectives.resource&&m.objectives.supplies.length===2,'objectives');
});
T('太阳算式建立3张牌顶PendingChoice',()=>{
  const g=gameWithSolar(),a=g.getLegalActions(0).find(x=>x.cardName==='太阳算式');A(a,'太阳算式不在legal');
  const r=g.dispatch(a);A(r.ok,'太阳算式拒绝');
  const o=g.getObservationForSide(0);A(o.pendingChoice&&o.pendingChoice.count===3,'不是3张事务');
  A(o.pendingChoice.cards.length===3&&o.pendingChoice.cards.every(c=>c.name),'owner未看到3张');
});
T('牌顶顺序可自定义提交且事务关闭',()=>{
  const g=gameWithSolar(),a=g.getLegalActions(0).find(x=>x.cardName==='太阳算式');A(g.dispatch(a).ok);
  const o=g.getObservationForSide(0),pc=o.pendingChoice,ids=pc.cards.map(c=>c.instanceId||c.id||c.name).reverse();
  const r=g.dispatch({kind:'scry_order',choiceId:pc.id,cardInstanceIds:ids});A(r.ok,'自定义SubmitChoice被拒绝');
  A(!g.getObservationForSide(0).pendingChoice,'事务未关闭');
});
T('对手Observation不能读取私有牌序',()=>{
  const g=gameWithSolar(),a=g.getLegalActions(0).find(x=>x.cardName==='太阳算式');A(g.dispatch(a).ok);
  const o=g.getObservationForSide(1);A(o.pendingChoice?.private===true,'未隐藏PendingChoice');A(!o.pendingChoice.cards,'泄漏牌序');
});
T('MOVE产生距离领域事件',()=>{
  const g=G.createGame({heroA:'fayoum',heroB:'luoji',firstPlayer:'A',seed:721,map:'terraced_arena_9x9'});
  const a=g.getLegalActions(0).find(x=>x.kind==='tactical_step');A(a,'无战术步');
  const r=g.dispatch(a);A(r.ok,'战术步拒绝');
  const types=r.events.map(e=>e.type);A(types.includes('DISTANCE_CHANGED'),'缺DISTANCE_CHANGED');
  A(types.some(x=>['APPROACHED','MOVED_AWAY','LATERAL_MOVE'].includes(x)),'缺距离方向事件');
});
const report={engine:G?.version,passed:R.filter(x=>x.ok).length,total:R.length,failed:R.filter(x=>!x.ok),results:R};
console.log(JSON.stringify(report,null,2));process.exit(report.passed===report.total?0:1);

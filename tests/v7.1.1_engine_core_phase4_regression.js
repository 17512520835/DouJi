'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'engine.v714.core.bundle.js'),'utf8');
const ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const G=ctx.GameEngine, results=[];let passed=0;
function T(name,fn){try{const detail=fn();results.push({name,ok:true,detail});passed++;}catch(e){results.push({name,ok:false,error:String(e&&e.stack||e)})}}
function A(x,m){if(!x)throw Error(m)}
T('生产 API 封口',()=>{
 A(!ctx.V6,'生产 build 不应暴露 global.V6');
 A(G&&G.version==='0.4.0-phase4','GameEngine facade/version');
 const e=G.createGame({heroA:'luoji',heroB:'lafeng',firstPlayer:'A',seed:71401,map:'terraced_arena_9x9'});
 A(Object.keys(e).length===0,'Core 实例不应暴露 _state 等自有可变字段');
 A(e._state===undefined,'_state 不应可见');
 return {facade:Object.keys(G),coreOwnKeys:Object.keys(e)};
});
T('Observation 隐藏信息隔离',()=>{
 const e=G.createGame({heroA:'xuanyi',heroB:'fayoum',firstPlayer:'A',seed:71402,map:'terraced_arena_9x9'});
 const a=e.getObservationForSide(0),b=e.getObservationForSide(1);
 A(a.rngState===undefined&&a.idCounters===undefined,'引擎控制字段泄漏');
 A(a.players[1].hand.every(c=>c.hidden===true),'对手手牌身份泄漏');
 A(a.players[0].deck.every(c=>c.hidden===true),'牌堆顺序泄漏');
 A(b.players[0].hand.every(c=>c.hidden===true),'反向对手手牌身份泄漏');
 return {aHand:a.players[0].hand.length,bHand:b.players[1].hand.length};
});
T('dispatch 事件 delta + sequence',()=>{
 const e=G.createGame({heroA:'luoji',heroB:'lafeng',firstPlayer:'A',seed:71403,map:'terraced_arena_9x9'});
 const a1=e.getLegalActions(0)[0],r1=e.dispatch(a1);A(r1.ok,'command1');
 const obs=e.getObservationForSide(0),side=obs.currentPlayer==='A'?0:1;
 const a2=e.getLegalActions(side)[0];A(a2,'command2 legal');const r2=e.dispatch(a2);A(r2.ok,'command2');
 const ids1=new Set(r1.events.map(e=>e.eventId));A(r2.events.every(e=>!ids1.has(e.eventId)),'第二次 dispatch 重复返回旧事件');
 const seq=[...r1.events,...r2.events].map(e=>e.sequence);for(let i=1;i<seq.length;i++)A(seq[i]>seq[i-1],'event sequence 非严格递增');
 return {first:r1.eventSequence,second:r2.eventSequence};
});
T('Replay digest 确定性',()=>{
 const e=G.createGame({heroA:'chiyu',heroB:'qiu013',firstPlayer:'A',seed:71404,map:'terraced_arena_9x9'});
 for(let i=0;i<50;i++){const o=e.getObservationForSide(0),side=o.currentPlayer==='A'?0:1,acts=e.getLegalActions(side);if(!acts.length||o.winner!=null)break;const r=e.dispatch(acts[i%acts.length]);A(r.ok,'合法动作被拒');}
 const replay=e.exportReplay(),r=G.replay(replay);A(r.getStateDigest()===replay.finalDigest,'replay digest mismatch');
 return {commands:replay.commands.length,digest:replay.finalDigest};
});
T('forbidden mirror 语义扫描契约',()=>{
 const src=code, names=['movedThisExpansion','healedThisExpansion','damageTakenThisExpansion','selfDamageThisExpansion','cardsPlayedThisExpansion','attacksThisExpansion','expansionAttackCards'];
 const bad={};
 for(const n of names){
   const patterns=[new RegExp(`mechanics\\s*\\.\\s*${n}\\b`,'g'),new RegExp(`mechanics\\s*\\[\\s*['"]${n}['"]\\s*\\]`,'g'),new RegExp(`\\b${n}\\s*:`,'g')];
   bad[n]=patterns.reduce((s,p)=>s+(src.match(p)||[]).length,0);
   A(bad[n]===0,`${n} 出现在业务 mechanics 上下文`);
   A(src.includes(`'${n}'`)||src.includes(`"${n}"`),`${n} 应保留在 invariant 禁止名单`);
 }
 return bad;
});
console.log(JSON.stringify({passed,total:results.length,ok:passed===results.length,results},null,2));
if(passed!==results.length)process.exit(1);

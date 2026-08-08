'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'engine.v714.core.debug.bundle.js'),'utf8');
const ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const E=ctx.V6;
function A(x,m){if(!x)throw Error(m)}
function ok(r,label){A(r&&r.ok,label+': '+(r&&r.error));return r.state}
function attack(name,timing){return {name,cost:0,type:'attack',timing,damage:1,condition:timing==='follow'?'hit':'',effect:'',range:99,instanceId:'T:'+name};}
function counterCard(name='测试反击'){return {name,cost:0,type:'counter',timing:'counter',damage:1,condition:'any',effect:'',range:99,instanceId:'D:'+name};}
function setup(seed=1){
  let s=E.newGame('chiyu','fayoum',{first:0,firstPlayer:'A',seed,map:'terraced_arena_9x9'});
  s.players[0].pos={r:4,c:4};s.players[1].pos={r:4,c:5};
  s.players[0].energy=5;s.players[1].energy=5;s.players[1].qi=5;
  s.players[0].hand=[attack('测试起手','starter'),attack('测试追击2','follow'),attack('测试追击3','follow'),attack('测试追击4','follow')];
  s.players[1].hand=[counterCard()];
  return s;
}
function advanceToWindow(targetStep,seed=1){
  let s=setup(seed);
  for(let step=1;step<=targetStep;step++){
    const name=step===1?'测试起手':`测试追击${step}`;
    s=ok(E.playCard(s,0,name,{isFollow:step>1}),`play step ${step}`);
    A(s.phase===E.PHASE.RESPONSE_WINDOW,`step ${step} 未进入 RESPONSE_WINDOW: ${s.phase}`);
    A(s.pendingCard&&s.pendingCard.log&&s.pendingCard.log.step===step,`step ${step} pending 上下文错误`);
    A(!!s.pendingCard.opts?.isFollow===(step>1),`step ${step} isFollow 错误`);
    E.assertCoreInvariants(s);
    if(step<targetStep){s=ok(E.passResponse(s,1),`pass step ${step}`);A(s.phase===E.PHASE.CHASE_WINDOW,`pass step ${step} 后未进入 CHASE_WINDOW: ${s.phase}`);}
  }
  return s;
}
const results=[];function T(name,fn){try{results.push({name,ok:true,detail:fn()})}catch(e){results.push({name,ok:false,error:String(e.stack||e)})}}
T('第1-4击逐击开放响应窗口，前3击放弃响应可续追',()=>{let s=advanceToWindow(4,71301);return {phase:s.phase,step:s.pendingCard.log.step,responseCount:s.expansion.responseCount,chainResolved:s.chain.length};});
for(const step of [2,3,4])T(`第${step}击普通挣脱不会留下挂起响应`,()=>{
  let s=advanceToWindow(step,71310+step);const qi=s.players[1].qi;s=ok(E.struggle(s,1,{burst:false}),`struggle ${step}`);
  A(s.phase!==E.PHASE.RESPONSE_WINDOW,`第${step}击挣脱后仍在响应窗口`);A(!s.pendingCard,`第${step}击挣脱后 pendingCard 未清`);A(s.players[1].qi===qi-2,`第${step}击挣脱未扣2气`);E.assertCoreInvariants(s);return {phase:s.phase,qi:s.players[1].qi,expansionCount:s.expansionCount};
});
for(const step of [2,3,4])T(`第${step}击反击不会留下挂起响应`,()=>{
  let s=advanceToWindow(step,71320+step);s=ok(E.counter(s,1,'测试反击'),`counter ${step}`);
  A(s.phase!==E.PHASE.RESPONSE_WINDOW,`第${step}击反击后仍在响应窗口`);A(!s.pendingCard,`第${step}击反击后 pendingCard 未清`);E.assertCoreInvariants(s);return {phase:s.phase,initiative:s.expansion?.initiativeSide??s.initiativeSide,chainResolved:s.chain.length};
});
for(const step of [2,3,4])T(`第${step}击放弃响应后继续正确结算`,()=>{
  let s=advanceToWindow(step,71330+step);s=ok(E.passResponse(s,1),`pass ${step}`);
  A(s.phase===E.PHASE.CHASE_WINDOW,`第${step}击放弃后不是追击窗口: ${s.phase}`);A(!s.pendingCard,`第${step}击放弃后 pendingCard 未清`);A(s.chain.length===step,`第${step}击放弃后 chain=${s.chain.length}`);A(s.chain.at(-1).step===step,`第${step}击账单序号错`);E.assertCoreInvariants(s);return {phase:s.phase,chain:s.chain.length,lastStep:s.chain.at(-1).step};
});
const report={version:'7.1.3-response-window-stability',passed:results.filter(x=>x.ok).length,total:results.length,ok:results.every(x=>x.ok),results};
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exit(1);

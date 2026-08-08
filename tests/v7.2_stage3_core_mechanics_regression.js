'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const code=fs.readFileSync(path.join(__dirname,'engine.v721.core.debug.bundle.js'),'utf8');
const ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const E=ctx.V6,H=E.HEROES;
function A(x,m){if(!x)throw Error(m)}
function ok(r,label){A(r&&r.ok,label+': '+(r&&r.error));return r.state}
function fresh(a,b='chiyu',seed=72430){let s=E.newGame(a,b,{first:0,firstPlayer:'A',seed,map:'terraced_arena_9x9'});s.phase=E.PHASE.PRE_ATTACK;s.turn=0;s.pendingCard=null;s.players[0].pos={r:4,c:4};s.players[1].pos={r:4,c:5};s.players[0].energy=9;s.players[1].energy=9;s.players[0].qi=9;s.players[1].qi=9;E.ensureExpansion(s,0);return s}
function card(id,name){const c=H[id].cards.find(x=>x.name===name||x.artKey===name);A(c,`找不到${id}/${name}`);return structuredClone(c)}
function runChild(script,args=[]){const p=cp.spawnSync(process.execPath,[script,...args],{cwd:__dirname,encoding:'utf8'});let j=null;try{j=JSON.parse((p.stdout||'').trim())}catch(e){throw Error(`${script} 输出无法解析: ${p.stdout}\n${p.stderr}`)}return {exitCode:p.status,report:j,stderr:(p.stderr||'').trim()||null}}
const results=[];function T(name,category,fn){try{results.push({name,category,status:'PASS',ok:true,detail:fn()??null})}catch(e){results.push({name,category,status:'FAIL',ok:false,error:String(e.stack||e)})}}

T('九角色 Skill 实际释放','Skill',()=>{
 const out=[];let seed=72431;
 for(const id of Object.keys(H)){
  let s=fresh(id,id==='chiyu'?'luoji':'chiyu',seed++);const skill=H[id].skills?.[0];A(skill,`${id} 无技能定义`);
  const before=s.players[0].energy;const r=E.useSkill(s,0,skill.id);A(r.ok,`${id}/${skill.id}: ${r.error}`);s=r.state;
  A((s.players[0].mechanics.skillUsage?.[skill.id]||0)===1,`${id}/${skill.id} 未记录技能使用`);
  A(s.log.some(x=>x.type==='skill'&&x.skillId===skill.id),`${id}/${skill.id} 缺少 skill log`);
  out.push({hero:id,skill:skill.id,energyBefore:before,energyAfter:s.players[0].energy});
 }
 return out;
});

function prepUltimate(id){
 let s=fresh(id,id==='chiyu'?'luoji':'chiyu',72500+Object.keys(H).indexOf(id));const u=H[id].ultimates?.[0];A(u,`${id} 无绝技`);s.players[0].qi=9;
 if(u.chaseFinisher){s.phase=E.PHASE.CHASE_WINDOW;E.ensureExpansion(s,0)}
 if(u.needFly)s.players[0].statusSlots.persistent.push({id:E.PERSISTENT.FLYING,source:'stage3',stacks:1,remainingTriggers:null,meta:{}});
 if(u.needStatus||u.needDownOrStiff||u.needDownStiffOrAir){s.players[1].statusSlots.control.push({id:E.CONTROL.STIFF,source:'stage3',stacks:1,remainingTriggers:null,meta:{}})}
 if(u.chainMin||u.requiresChainStatus){const n=Math.max(u.chainMin||0,1);s.chain=[];for(let i=0;i<n;i++)s.chain.push({cardName:`stage3-${i+1}`,cardType:'attack',statusApplied:(i===0&&u.requiresChainStatus)?['stiff']:[],finalDamage:1,step:i+1})}
 if(u.requiresHealed){E.emitV7Event(s,{type:'HEAL_RESOLVED',side:0,actorId:0,actualHeal:1,payload:{amount:1}})}
 if(u.cardsPlayedMin){for(let i=0;i<u.cardsPlayedMin;i++)E.emitV7Event(s,{type:'CARD_PLAYED',side:0,actorId:0,card:`stage3-card-${i+1}`})}
 return {s,u};
}
T('九角色 Ultimate 实际结算','Ultimate',()=>{
 const out=[];
 for(const id of Object.keys(H)){
  let {s,u}=prepUltimate(id);const hp=s.players[1].hp;const r=E.useUltimate(s,0,u.id);A(r.ok,`${id}/${u.id}: ${r.error}`);s=r.state;
  A(s.players[0].ultimatesUsed.includes(u.id),`${id}/${u.id} 未记录绝技使用`);A(s.players[1].hp<hp,`${id}/${u.id} 未造成有效伤害`);
  out.push({hero:id,ultimate:u.id,damage:hp-s.players[1].hp,phase:s.phase});
 }
 return out;
});

T('Buff：冠军怒吼实际生效','Buff',()=>{let s=fresh('luoji','chiyu',72601);s.players[0].hand=[card('luoji','冠军怒吼')];s=ok(E.playCard(s,0,'冠军怒吼'),'冠军怒吼');A(s.players[0].mechanics.luojiRoarBuff===1,'Buff 标记未建立');return {luojiRoarBuff:s.players[0].mechanics.luojiRoarBuff};});
T('Debuff：尾羽震喝实际施加封技','Debuff',()=>{let s=fresh('chiyu','luoji',72602);s.players[0].hand=[card('chiyu','尾羽震喝')];s=ok(E.playCard(s,0,'尾羽震喝'),'尾羽震喝');A(s.players[1].statusSlots.control.some(x=>x.id===E.CONTROL.SEALED),'目标未获得封技 Debuff');return {control:s.players[1].statusSlots.control.map(x=>x.id)};});
T('ResponseWindow / 多段追击 / 第2-4击反击','ResponseWindow',()=>{const x=runChild('v7.1.3_response_window_multihit_regression.js',['./engine.v721.core.bundle.js']);A(x.exitCode===0&&x.report.ok,'ResponseWindow 回归失败');A(x.report.total===10,'ResponseWindow 用例数量异常');for(const step of [2,3,4])A(x.report.results.some(r=>r.ok&&r.name.includes(`第${step}击反击`)),`缺少第${step}击反击通过项`);A(x.report.results.some(r=>r.ok&&r.name.includes('第1-4击逐击开放响应窗口')),'缺少多段追击 1-4 击窗口通过项');return {passed:x.report.passed,total:x.report.total};});
T('PendingChoice：创建 / 提交 / 私有信息','PendingChoice',()=>{const x=runChild('v7.2_map_fayoum_regression.js');const good=(n)=>x.report.results.find(r=>r.name===n)?.ok===true;A(x.exitCode===0,'PendingChoice 回归脚本失败');A(good('太阳算式建立3张牌顶PendingChoice'),'PendingChoice 创建失败');A(good('牌顶顺序可自定义提交且事务关闭'),'PendingChoice 提交/关闭失败');A(good('对手Observation不能读取私有牌序'),'PendingChoice 私有信息失败');return {exitCode:x.exitCode,failed:x.report.results.filter(r=>!r.ok).map(r=>r.name)};});

const categories=['Skill','Ultimate','Buff','Debuff','ResponseWindow','多段追击','反击','PendingChoice'];
const covered={Skill:results.some(r=>r.category==='Skill'&&r.ok),Ultimate:results.some(r=>r.category==='Ultimate'&&r.ok),Buff:results.some(r=>r.category==='Buff'&&r.ok),Debuff:results.some(r=>r.category==='Debuff'&&r.ok),ResponseWindow:results.some(r=>r.category==='ResponseWindow'&&r.ok),'多段追击':results.some(r=>r.category==='ResponseWindow'&&r.ok),'反击':results.some(r=>r.category==='ResponseWindow'&&r.ok),PendingChoice:results.some(r=>r.category==='PendingChoice'&&r.ok)};
const report={stage:'V7.2 Phase3 - Core Mechanics Closure',engine:E.ENGINE_CORE_VERSION||null,gameplay:E.V7_CORE_VERSION||null,status:results.every(x=>x.ok)&&categories.every(k=>covered[k])?'PASS':'FAIL',passed:results.every(x=>x.ok)&&categories.every(k=>covered[k]),coverage:covered,results};
console.log(JSON.stringify(report,null,2));process.exit(report.passed?0:1);

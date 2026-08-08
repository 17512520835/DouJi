const fs=require('fs'),vm=require('vm');
const file=process.argv[2]||'./engine.v721.core.debug.bundle.js';
const ctx={console,structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const V=ctx.V6,results=[];const A=(x,m)=>{if(!x)throw Error(m||'assert')};
const T=(name,fn)=>{try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:String(e.message||e)})}};
function cloneCards(hero,n){const src=V.HEROES[hero].cards;return Array.from({length:n},(_,i)=>({...src[i%src.length],instanceId:`T:${hero}:${i}`}));}
T('抑制崩坏：5张及以上不再被动超量摸牌',()=>{
  let s=V.newGame('qiu013','xuanyi',{first:0,seed:72401,map:'terraced_arena_9x9'});s.players[0].hand=cloneCards('qiu013',6);s.players[0].hp=s.players[0].hero.hp;
  const before=s.players[0].hand.length,r=V.endExpansion(s,0);A(r.ok!==false,r.error);const n=r.state.players[0].hand.length;
  const log=r.state.log.find(x=>x.type==='mechanic'&&x.mechanic==='suppress_break');A(log,'missing log');A(log.drawn===0,JSON.stringify(log));A(n===before,`${before}->${n}`);
});
T('抑制崩坏：少于5张仍可正常摸1',()=>{
  let s=V.newGame('qiu013','xuanyi',{first:0,seed:72402,map:'terraced_arena_9x9'});s.players[0].hand=cloneCards('qiu013',4);s.players[0].hp=s.players[0].hero.hp;
  const r=V.endExpansion(s,0),log=r.state.log.find(x=>x.type==='mechanic'&&x.mechanic==='suppress_break');A(log?.drawn===1,JSON.stringify(log));A(r.state.players[0].hand.length>=5);
});
T('资源点3+连占：5张以上不再继续被动摸牌',()=>{
  let s=V.newGame('luoji','xuanyi',{first:0,seed:72403,map:'terraced_arena_9x9'});s.players[0].hand=cloneCards('luoji',6);s.players[0].pos={r:4,c:4};s.players[0].mechanics.resourceStreak=2;
  const before=s.players[0].hand.length,r=V.endExpansion(s,0);const log=r.state.log.find(x=>x.type==='resource'&&x.side===0);A(log,'missing resource');A(log.streak===3);A(log.draw===0,JSON.stringify(log));A(r.state.players[0].hand.length===before);
});
T('主动摸牌仍允许超过5张（软目标不是硬上限）',()=>{
  let s=V.newGame('qiu013','xuanyi',{first:0,seed:72404,map:'terraced_arena_9x9'});
  const roar={...V.HEROES.qiu013.cards.find(c=>c.name==='剧痛咆哮'),instanceId:'T:roar'};s.players[0].hand=[roar,...cloneCards('qiu013',5)];s.players[0].energy=5;
  const r=V.playCard(s,0,'剧痛咆哮');A(r.ok!==false,r.error);A(r.state.players[0].hand.length>5,`hand=${r.state.players[0].hand.length}`);
});
const report={stage:'V7.2.4 PassiveDraw soft hand target',passed:results.every(x=>x.ok),total:results.length,results};console.log(JSON.stringify(report,null,2));process.exit(report.passed?0:1);

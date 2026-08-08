const fs=require('fs'),vm=require('vm');
global.window=global;
vm.runInThisContext(fs.readFileSync(__dirname+'/engine.v721.core.debug.bundle.js','utf8'));
const P=global.V6;
function assert(x,msg){if(!x)throw new Error(msg)}
function cloneCard(hero,name){const c=hero.cards.find(x=>x.name===name);assert(c,'missing '+name);return {...c};}
let results=[];
function test(name,fn){try{results.push({name,ok:true,detail:fn()})}catch(e){results.push({name,ok:false,error:String(e.stack||e)})}}

test('白夜：追击+反击死手会触发整备换手',()=>{
  const s=P.newGame('baiye','chiyu',{first:0,seed:72901,map:'terraced_arena_9x9'}),p=s.players[0];
  p.hand=['终成白夜','缩颈防身','幼生惊逃','破壳跃升','湖畔追啄'].map(n=>cloneCard(p.hero,n));
  p.energy=5;p.mechanics.handRedrawUsedThisRound=false;
  const before=p.hand.map(c=>c.name);
  P._finishExpansion(s,0);
  const ev=s.log.filter(x=>x.type==='hand_redraw'&&x.side===0).at(-1);
  assert(ev&&ev.count===5,'dead hand did not redraw');
  assert(p.mechanics.handRedrawUsedThisRound===true,'redraw flag not set');
  return {before,after:p.hand.map(c=>c.name),redrawCount:ev.count};
});

test('有移动/增益等主动牌时不会被误判为死手',()=>{
  const s=P.newGame('baiye','chiyu',{first:0,seed:72902,map:'terraced_arena_9x9'}),p=s.players[0];
  p.hand=['笨拙扑腾','缩颈防身','幼生惊逃','破壳跃升','湖畔追啄'].map(n=>cloneCard(p.hero,n));
  p.mechanics.handRedrawUsedThisRound=false;
  P._finishExpansion(s,0);
  assert(!s.log.some(x=>x.type==='hand_redraw'&&x.side===0),'playable proactive hand was incorrectly redrawn');
  return {hand:p.hand.map(c=>c.name)};
});

const failed=results.filter(x=>!x.ok);
console.log(JSON.stringify({suite:'V7.2.9 dead-hand anti-brick regression',passed:results.length-failed.length,total:results.length,ok:failed.length===0,results},null,2));
if(failed.length)process.exitCode=1;

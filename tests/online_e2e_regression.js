'use strict';
const cp=require('child_process'),path=require('path');
const PORT=18878;
const server=cp.spawn(process.execPath,[path.join(__dirname,'online-server.js'),String(PORT)],{cwd:__dirname,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',d=>stderr+=d);
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function openClient(){return new Promise((resolve,reject)=>{const w=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);w.addEventListener('open',()=>resolve(w));w.addEventListener('error',reject,{once:true})})}
function once(w,pred,timeout=4000){return new Promise((resolve,reject)=>{const t=setTimeout(()=>{w.removeEventListener('message',f);reject(new Error('timeout'))},timeout);function f(e){const m=JSON.parse(e.data);if(pred(m)){clearTimeout(t);w.removeEventListener('message',f);resolve(m)}}w.addEventListener('message',f)})}
(async()=>{try{
  await sleep(220); const a=await openClient(),b=await openClient();
  a.send(JSON.stringify({type:'CREATE_ROOM',heroId:'luoji',name:'A'}));
  const aw=await once(a,m=>m.type==='WELCOME'), roomId=aw.roomId;
  b.send(JSON.stringify({type:'JOIN_ROOM',roomId,heroId:'fayoum',name:'B'}));
  const bw=await once(b,m=>m.type==='WELCOME');
  if(bw.roomId!==roomId)throw new Error('room mismatch');
  const as=await once(a,m=>m.type==='SNAPSHOT'&&m.room.started), bs=await once(b,m=>m.type==='SNAPSHOT'&&m.room.started);
  const aJson=JSON.stringify(as.observation),bJson=JSON.stringify(bs.observation);
  const bIds=bs.observation.players[1].hand.map(c=>c.instanceId).filter(Boolean),aIds=as.observation.players[0].hand.map(c=>c.instanceId).filter(Boolean);
  if(bIds.some(id=>aJson.includes(id)))throw new Error('A payload leaked B private hand id');
  if(aIds.some(id=>bJson.includes(id)))throw new Error('B payload leaked A private hand id');
  const acting=as.legalActions.length?{w:a,s:as}:{w:b,s:bs};
  const bad=once(acting.w,m=>m.type==='ERROR'&&m.code==='ILLEGAL_ACTION');
  acting.w.send(JSON.stringify({type:'COMMAND',baseSeq:acting.s.seq,actionId:'forged-action-id'})); await bad;
  const action=acting.s.legalActions[0]; const nextA=once(a,m=>m.type==='SNAPSHOT'&&m.seq===1),nextB=once(b,m=>m.type==='SNAPSHOT'&&m.seq===1);
  acting.w.send(JSON.stringify({type:'COMMAND',baseSeq:0,actionId:action.actionId})); await Promise.all([nextA,nextB]);
  a.close();b.close(); console.log(JSON.stringify({ok:true,roomId,hiddenPayload:'PASS',illegalActionRejected:'PASS',legalActionAdvancedSeq:'PASS'},null,2));
}finally{server.kill('SIGTERM')}})().catch(e=>{console.error(e.stack||e);if(stderr)console.error(stderr);server.kill('SIGTERM');process.exit(1)});

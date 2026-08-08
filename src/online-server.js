'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require(path.join(__dirname, 'engine.v721.core.bundle.js'));
const GameEngine = global.GameEngine;
if (!GameEngine) throw new Error('GameEngine 未加载');

const PORT = Number(process.env.PORT || process.argv[2] || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();

function randHex(bytes=18){ return crypto.randomBytes(bytes).toString('hex'); }
function roomCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<6;i++) out+=alphabet[crypto.randomInt(alphabet.length)];
  return out;
}
function uniqueRoomCode(){ let c; do c=roomCode(); while(rooms.has(c)); return c; }
function json(ws,obj){ if(ws && ws.readyState===1) ws.send(JSON.stringify(obj)); }
function sideKey(side){ return side===0?'A':'B'; }
function publicRoom(room){
  return {
    roomId:room.id,
    started:!!room.game,
    seq:room.seq,
    players:room.players.map((p,i)=>p?{side:i,heroId:p.heroId,connected:!!p.ws,name:p.name||`玩家${sideKey(i)}`} : null),
    rematchVotes:[...room.rematchVotes]
  };
}
function snapshotFor(room, side){
  if(!room.game) return {type:'ROOM',room:publicRoom(room)};
  return {
    type:'SNAPSHOT', room:publicRoom(room), side, seq:room.seq,
    observation:room.game.getObservationForSide(side),
    legalActions:room.finished ? [] : room.game.getLegalActions(side),
    stateDigest:room.game.getStateDigest(),
    finished:room.finished||null
  };
}
function broadcastRoom(room){
  for(let side=0;side<2;side++){
    const p=room.players[side]; if(!p?.ws) continue;
    json(p.ws, snapshotFor(room,side));
  }
}
function startIfReady(room){
  if(room.game || !room.players[0] || !room.players[1]) return;
  const seed = crypto.randomInt(1,0x7fffffff);
  const firstPlayer = crypto.randomInt(2)===0?'A':'B';
  room.config={heroA:room.players[0].heroId,heroB:room.players[1].heroId,seed,firstPlayer,map:'terraced_arena_9x9'};
  room.game=GameEngine.createGame(room.config);
  room.seq=0; room.finished=null; room.rematchVotes.clear();
}
function attach(ws, room, side){
  const p=room.players[side];
  if(p.ws && p.ws!==ws){ try{p.ws.close(4001,'已在其他页面登录');}catch(_){} }
  p.ws=ws; ws.roomId=room.id; ws.side=side; ws.token=p.token;
  json(ws,{type:'WELCOME',roomId:room.id,side,token:p.token,engineVersion:GameEngine.version,gameplayVersion:GameEngine.gameplayVersion,catalog:{heroes:Object.fromEntries(Object.entries(GameEngine.catalog.HEROES).map(([id,h])=>[id,{id,name:h.name,title:h.title,hp:h.hp,emoji:h.emoji}]))}});
  broadcastRoom(room);
}
function createRoom(ws,msg){
  const heroId=String(msg.heroId||''); if(!GameEngine.catalog.HEROES[heroId]) return json(ws,{type:'ERROR',error:'未知角色'});
  const id=uniqueRoomCode(), token=randHex();
  const room={id,players:[{token,heroId,name:String(msg.name||'').slice(0,20),ws},null],game:null,config:null,seq:0,finished:null,rematchVotes:new Set(),createdAt:Date.now()};
  rooms.set(id,room); attach(ws,room,0);
}
function joinRoom(ws,msg){
  const id=String(msg.roomId||'').toUpperCase(); const room=rooms.get(id); if(!room) return json(ws,{type:'ERROR',error:'房间不存在或服务器已重启'});
  if(room.players[1]) return json(ws,{type:'ERROR',error:'房间已满'});
  const heroId=String(msg.heroId||''); if(!GameEngine.catalog.HEROES[heroId]) return json(ws,{type:'ERROR',error:'未知角色'});
  room.players[1]={token:randHex(),heroId,name:String(msg.name||'').slice(0,20),ws};
  startIfReady(room); attach(ws,room,1);
}
function resume(ws,msg){
  const id=String(msg.roomId||'').toUpperCase(); const token=String(msg.token||''); const room=rooms.get(id); if(!room) return json(ws,{type:'ERROR',error:'房间不存在或服务器已重启',resumeFailed:true});
  const side=room.players.findIndex(p=>p?.token===token); if(side<0) return json(ws,{type:'ERROR',error:'重连凭证无效',resumeFailed:true});
  attach(ws,room,side);
}
function handleCommand(ws,msg){
  const room=rooms.get(ws.roomId); if(!room?.game) return json(ws,{type:'ERROR',error:'对局尚未开始'});
  const side=ws.side; const p=room.players[side]; if(!p || p.token!==ws.token) return json(ws,{type:'ERROR',error:'身份无效'});
  if(room.finished) return json(ws,{type:'ERROR',error:'对局已经结束'});
  if(Number(msg.baseSeq)!==room.seq) return json(ws,{type:'STALE',seq:room.seq,...snapshotFor(room,side)});
  const actionId=String(msg.actionId||'');
  const legal=room.game.getLegalActions(side); const action=legal.find(a=>a.actionId===actionId);
  if(!action) return json(ws,{type:'ERROR',error:'非法或已过期动作：服务器已拒绝，GameState 未变化',code:'ILLEGAL_ACTION',seq:room.seq});
  const result=room.game.dispatch(action);
  if(!result.ok) return json(ws,{type:'ERROR',error:'Core 拒绝动作，GameState 未变化',code:result.error,seq:room.seq});
  room.seq++;
  const obs0=room.game.getObservationForSide(0);
  if(obs0.winner!==null && obs0.winner!==undefined) room.finished={winner:obs0.winner,reason:'CORE_WIN'};
  broadcastRoom(room);
}
function surrender(ws){
  const room=rooms.get(ws.roomId); if(!room?.game || room.finished) return;
  room.finished={winner:1-ws.side,reason:'SURRENDER'}; room.seq++; broadcastRoom(room);
}
function rematch(ws){
  const room=rooms.get(ws.roomId); if(!room || !room.players[ws.side]) return;
  room.rematchVotes.add(ws.side);
  if(room.rematchVotes.size===2){
    const seed=crypto.randomInt(1,0x7fffffff), firstPlayer=crypto.randomInt(2)===0?'A':'B';
    room.config={heroA:room.players[0].heroId,heroB:room.players[1].heroId,seed,firstPlayer,map:'terraced_arena_9x9'};
    room.game=GameEngine.createGame(room.config); room.seq=0; room.finished=null; room.rematchVotes.clear();
  }
  broadcastRoom(room);
}
function handleMessage(ws,text){
  let msg; try{msg=JSON.parse(text);}catch(_){return json(ws,{type:'ERROR',error:'消息不是合法 JSON'});}
  switch(msg.type){
    case 'CREATE_ROOM': return createRoom(ws,msg);
    case 'JOIN_ROOM': return joinRoom(ws,msg);
    case 'RESUME': return resume(ws,msg);
    case 'COMMAND': return handleCommand(ws,msg);
    case 'SURRENDER': return surrender(ws);
    case 'REMATCH': return rematch(ws);
    case 'PING': return json(ws,{type:'PONG',time:Date.now()});
    default: return json(ws,{type:'ERROR',error:'未知消息类型'});
  }
}

// ---- minimal RFC6455 websocket implementation: no third-party dependency ----
function wsAccept(key){ return crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }
function encodeFrame(data, opcode=1){
  const payload=Buffer.from(data); const len=payload.length; let head;
  if(len<126){head=Buffer.alloc(2);head[0]=0x80|opcode;head[1]=len;}
  else if(len<=0xffff){head=Buffer.alloc(4);head[0]=0x80|opcode;head[1]=126;head.writeUInt16BE(len,2);}
  else {head=Buffer.alloc(10);head[0]=0x80|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([head,payload]);
}
function upgradeToWebSocket(req,socket){
  const key=req.headers['sec-websocket-key']; if(!key){socket.destroy();return;}
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+wsAccept(key)+'\r\n\r\n');
  const ws={socket,readyState:1,buffer:Buffer.alloc(0),send(s){if(ws.readyState===1)socket.write(encodeFrame(s));},close(code=1000,reason=''){if(ws.readyState!==1)return;ws.readyState=2;const b=Buffer.alloc(2+Buffer.byteLength(reason));b.writeUInt16BE(code,0);b.write(reason,2);socket.write(encodeFrame(b,8));socket.end();}};
  socket.on('data',chunk=>{ws.buffer=Buffer.concat([ws.buffer,chunk]);parseFrames(ws);});
  socket.on('close',()=>{ws.readyState=3; const room=rooms.get(ws.roomId); if(room && room.players[ws.side]?.ws===ws){room.players[ws.side].ws=null;broadcastRoom(room);}});
  socket.on('error',()=>{});
}
function parseFrames(ws){
  let b=ws.buffer;
  while(b.length>=2){
    const b0=b[0], b1=b[1], opcode=b0&0x0f, masked=!!(b1&0x80); let len=b1&0x7f, off=2;
    if(len===126){if(b.length<4)break;len=b.readUInt16BE(2);off=4;}
    else if(len===127){if(b.length<10)break;const n=b.readBigUInt64BE(2);if(n>BigInt(Number.MAX_SAFE_INTEGER)){ws.close(1009,'too large');return;}len=Number(n);off=10;}
    const maskLen=masked?4:0; if(b.length<off+maskLen+len)break;
    let mask=null;if(masked){mask=b.subarray(off,off+4);off+=4;}
    const payload=Buffer.from(b.subarray(off,off+len)); if(masked)for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
    b=b.subarray(off+len);
    if(opcode===1)handleMessage(ws,payload.toString('utf8'));
    else if(opcode===8){ws.close();return;}
    else if(opcode===9){if(ws.readyState===1)ws.socket.write(encodeFrame(payload,10));}
  }
  ws.buffer=b;
}

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{
  let pathname; try{pathname=decodeURIComponent(new URL(req.url,'http://x').pathname);}catch(_){pathname='/';}
  if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size,engine:GameEngine.version}));}
  if(pathname==='/') pathname='/online.html';
  const file=path.resolve(__dirname,'.'+pathname);
  if(!file.startsWith(path.resolve(__dirname))) {res.writeHead(403);return res.end('Forbidden');}
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404);return res.end('Not Found');}
    res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
});
server.on('upgrade',(req,socket)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname!=='/ws'){socket.destroy();return;}
  upgradeToWebSocket(req,socket);
});
server.listen(PORT,HOST,()=>{
  console.log(`斗鸡 Online server: http://localhost:${PORT}`);
  console.log(`LAN/public: http://<你的服务器IP或域名>:${PORT}`);
  console.log(`Engine ${GameEngine.version} / gameplay ${GameEngine.gameplayVersion}`);
});

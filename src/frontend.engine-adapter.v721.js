(function(global){
'use strict';
const G=global.GameEngine;
if(!G) throw new Error('GameEngine V7.2 Map Core 未加载');

const OBS_SESSION=new WeakMap();
const SESSION_BY_TOKEN=new Map();
let NEXT_SESSION_TOKEN=1;
function bind(obs,rec){
  if(obs&&typeof obs==='object'){
    if(!rec.uiSessionToken) rec.uiSessionToken=`ui-session-${NEXT_SESSION_TOKEN++}`;
    OBS_SESSION.set(obs,rec);
    SESSION_BY_TOKEN.set(rec.uiSessionToken,rec);
    // 必须可被 structuredClone 保留；适配器仍以 Core session 为唯一真源，不信任克隆快照内容。
    obs.__gameUiSessionToken=rec.uiSessionToken;
  }
  return obs;
}
function recOf(obs){
  let r=OBS_SESSION.get(obs);
  if(!r&&obs&&typeof obs==='object'&&obs.__gameUiSessionToken){
    r=SESSION_BY_TOKEN.get(obs.__gameUiSessionToken);
    if(r) OBS_SESSION.set(obs,r);
  }
  if(!r) throw new Error('该状态快照不属于当前 GameEngine 会话');
  return r;
}
function actorSide(obs){
  if(obs?.pendingChoice?.side===0||obs?.pendingChoice?.side===1) return obs.pendingChoice.side;
  if(obs?.phase==='RESPONSE_WINDOW'){
    if(obs?.responseWindow?.responderSide===0||obs?.responseWindow?.responderSide===1) return obs.responseWindow.responderSide;
    if(obs?.pendingCard?.attackerSide===0||obs?.pendingCard?.attackerSide===1) return 1-obs.pendingCard.attackerSide;
  }
  if(obs?.initiativeSide===0||obs?.initiativeSide===1) return obs.initiativeSide;
  if(obs?.mainActionSide===0||obs?.mainActionSide===1) return obs.mainActionSide;
  return 0;
}
function simNewGame(heroA,heroB,options={}){
  const config={heroA,heroB,firstPlayer:options.firstPlayer||'A',seed:options.seed,map:options.map};
  const session=G.createGame(config);
  const rec={session,viewerSide:0,seed:options.seed||1,heroA,heroB,ai:new Map()};
  return bind(session.getObservationForSide(0),rec);
}
function simGetLegalActions(obs){
  const rec=recOf(obs);
  return rec.session.getLegalActions(actorSide(obs));
}
function applyAction(obs,action){
  const rec=recOf(obs), r=rec.session.dispatch(action);
  if(!r.ok) return obs;
  return bind(rec.session.getObservationForSide(rec.viewerSide),rec);
}
function computeCost(obs,side,card,isFollow){
  const rec=recOf(obs), ref=card?.instanceId||card?.id||card?.name;
  const v=rec.session.queryCardCost(side,ref,isFollow);
  return v==null ? (card?.cost??0) : v;
}
function getReachableMovePaths(obs,side,maxSteps,opts={}){
  return recOf(obs).session.queryReachableMovePaths(side,maxSteps,opts);
}
function getMapState(obs){ return recOf(obs).session.queryMapState(); }
function submitPendingChoice(obs,choiceId,cardInstanceIds){
  const rec=recOf(obs);
  const r=rec.session.dispatch({kind:'scry_order',choiceId,cardInstanceIds:[...cardInstanceIds]});
  if(!r.ok) return obs;
  return bind(rec.session.getObservationForSide(rec.viewerSide),rec);
}
function resolveAI(name,heroId){
  return function(obs){
    const rec=recOf(obs), key=`${name}:${heroId}`;
    let ai=rec.ai.get(key);
    if(!ai){ ai=G.createAI(name,heroId,'B',rec.seed); rec.ai.set(key,ai); }
    return ai.choose(rec.session);
  };
}
function deriveSeed(baseSeed,label){
  let h=2166136261>>>0, s=String(baseSeed??0)+'|'+String(label??'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;} return h>>>0;
}
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

global.GameUIEngine=Object.freeze({
  ENGINE_CORE_VERSION:G.version,
  V7_CORE_VERSION:G.gameplayVersion,
  HEROES:G.catalog.HEROES,
  HEX_MAP_DATA:G.catalog.HEX_MAP_DATA,
  simNewGame,simGetLegalActions,applyAction,computeCost,getReachableMovePaths,getMapState,submitPendingChoice,resolveAI,deriveSeed,mulberry32
});
})(window);

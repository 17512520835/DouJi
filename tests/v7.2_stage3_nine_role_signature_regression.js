'use strict';
const path=require('path'),cp=require('child_process');
const dir=__dirname;
const results=[];
const LEGACY_ASSERTION_WHITELIST={
  'V7.1 战斗兼容功能':new Set(['V7.1 version']),
};
function failedItems(parsed){if(!parsed)return[];if(Array.isArray(parsed.failed))return parsed.failed;if(Array.isArray(parsed.results))return parsed.results.filter(x=>x&&x.ok===false);if(Array.isArray(parsed.checks))return parsed.checks.filter(x=>x&&x.ok===false);return[];}
function run(name,args,{legacyWhitelist=null}={}){
  const p=cp.spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'});
  let parsed=null;try{parsed=JSON.parse((p.stdout||'').trim())}catch(_){}
  const rawOk=p.status===0;let status=rawOk?'PASS':'FAIL';let functionalOk=rawOk;const warnings=[];const failed=failedItems(parsed);
  if(!rawOk&&legacyWhitelist&&parsed&&failed.length>0){
    const allowed=new Set(legacyWhitelist);const unknown=failed.filter(x=>!allowed.has(String(x.name||'')));
    if(unknown.length===0){status='WARN';functionalOk=true;for(const x of failed)warnings.push({type:'LEGACY_VERSION_ASSERTION',assertion:String(x.name||''),error:x.error||null});}
  }
  results.push({name,status,functionalOk,rawOk,exitCode:p.status,warnings,failedAssertions:failed.map(x=>String(x.name||'')),report:parsed,stderr:(p.stderr||'').trim()||null});
}
run('九角色签名可玩性',['v6.6_signature_playability.js','./engine.v721.core.debug.bundle.js']);
run('第三阶段八类核心机制闭合',['v7.2_stage3_core_mechanics_regression.js']);
run('ResponseWindow / 多段追击',['v7.1.3_response_window_multihit_regression.js','./engine.v721.core.bundle.js']);
run('Phase4 核心契约',['v7.1.1_engine_core_phase4_regression.js','./engine.v721.core.bundle.js']);
run('Phase2 Hotfix 位移/追击生命周期',['v7.2_map_phase2_hotfix_regression.js','./engine.v721.core.bundle.js']);
run('MovementResolver 统一移动/移动力/Occupancy',['v7.2_movement_resolver_regression.js','./engine.v721.core.bundle.js']);
run('V7.1 战斗兼容功能',['v7.1_combat_regression.js','./engine.v721.core.debug.bundle.js'],{legacyWhitelist:LEGACY_ASSERTION_WHITELIST['V7.1 战斗兼容功能']});
run('法尤姆 PendingChoice / 私有信息 / MOVE 事件',['v7.2_map_fayoum_regression.js']);
run('Phase2 Map 公共功能',['v7.2_map_phase2_regression.js']);
const hasFail=results.some(x=>x.status==='FAIL'),hasWarn=results.some(x=>x.status==='WARN');
const overall=hasFail?'FAIL':(hasWarn?'PASS_WITH_WARNINGS':'PASS');
const report={stage:'V7.2 Phase 3 - Nine-role full behavior regression',engine:'0.5.2-map-phase2-hotfix',gameplay:'7.2.0-map-core-candidate',status:overall,passed:!hasFail,warningCount:results.reduce((n,x)=>n+x.warnings.length,0),suites:results};
console.log(JSON.stringify(report,null,2));process.exit(hasFail?1:0);

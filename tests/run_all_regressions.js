'use strict';
const cp=require('child_process'),path=require('path'),fs=require('fs');
const tests=[
'v7.2.10_combat_feedback_regression.js',
'v7.2.10_high_ai_phase1_regression.js',
'v7.2.10_high_ai_hidden_information_regression.js',
'v7.2.10_high_ai_long_smoke.js',
'v7.2.9_dead_hand_regression.js',
'v7.2_map_phase2_regression.js',
'v7.2_map_phase2_public_api_fuzz.js',
'v7.2_map_phase2_hotfix_regression.js',
'v7.2_movement_resolver_regression.js',
'v7.2.2_movement_direction_regression.js',
'v7.2_stage3_core_mechanics_regression.js',
'v6.6_signature_playability.js',
'v7.2.4_passive_draw_softcap_regression.js',
'v7.2.5_phase4_shrink_special_regression.js',
'v7.1.1_engine_core_phase4_regression.js',
'v7.2.7_phase6_observable_golden_master.js',
'v7.2.6_browser_entry_static_smoke.js',
'v7.2.6_phase5_long_ai_stability.js'
];
const results=[];
for(const file of tests){
  process.stdout.write(`[RUN] ${file} ... `);
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:240000});
  const ok=r.status===0;console.log(ok?'PASS':'FAIL');
  results.push({file,ok,status:r.status,signal:r.signal,stdout:(r.stdout||'').slice(-3000),stderr:(r.stderr||'').slice(-3000)});
  if(!ok)break;
}
const failed=results.filter(x=>!x.ok);
const report={stage:'V7.2.10 candidate full automatic regression',passed:failed.length===0&&results.length===tests.length,passedCount:results.filter(x=>x.ok).length,total:tests.length,failed,results};
fs.writeFileSync(path.join(__dirname,'V7.2.10_候选包_全量自动回归结果.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,passedCount:report.passedCount,total:report.total,failed:failed.map(x=>x.file)},null,2));
if(!report.passed)process.exit(1);

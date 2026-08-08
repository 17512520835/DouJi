'use strict';
const cp=require('child_process'),path=require('path');
const tests=['v7.1.1_engine_core_phase4_regression.js','v7.1.3_response_window_multihit_regression.js'];
const results=[];
for(const file of tests){
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:120000});
  results.push({file,ok:r.status===0,status:r.status,signal:r.signal,stdout:(r.stdout||'').slice(-2000),stderr:(r.stderr||'').slice(-2000)});
}
const failed=results.filter(x=>!x.ok);
console.log(JSON.stringify({stage:'V7.1 combat compatibility gate (migrated to current V7.2.10 bundle)',passed:failed.length===0,total:results.length,failed,results},null,2));
if(failed.length)process.exit(1);

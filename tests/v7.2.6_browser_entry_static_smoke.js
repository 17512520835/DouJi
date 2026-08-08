'use strict';
const fs=require('fs'),path=require('path');
const entry=path.join(__dirname,'斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html');
const html=fs.readFileSync(entry,'utf8'),results=[];
function t(name,ok,detail){results.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');}
const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(x=>x[1]);
t('official entry exists',fs.existsSync(entry),path.basename(entry));
t('entry loads V7.2.1 core',scripts.includes('./engine.v721.core.bundle.js'),scripts.join(', '));
t('entry loads V7.2.1 frontend adapter',scripts.includes('./frontend.engine-adapter.v721.js'),scripts.join(', '));
for(const s of scripts.filter(x=>x.startsWith('./')))t(`dependency exists: ${s}`,fs.existsSync(path.join(__dirname,s.slice(2))),s);
t('entry has browser boot watchdog',/v651-boot-watch/.test(html),'v651-boot-watch');
t('entry has no debug core script reference',!scripts.some(x=>/debug/i.test(x)),scripts.join(', '));
const failed=results.filter(x=>!x.ok);
const report={version:'V7.2.6',phase:'Phase5 Browser Entry Static Smoke',passed:failed.length===0,total:results.length,failed:failed.length,results,
 runtimeBrowserStatus:'BLOCKED_IN_VALIDATION_ENV',
 runtimeBrowserNote:'Validation environment Chromium policy blocks both file:// and localhost navigation. This is an environment restriction, not converted into PASS.'};
fs.writeFileSync(path.join(__dirname,'V7.2.6_Phase5_browserEntrySmoke_验证报告.json'),JSON.stringify(report,null,2));
if(failed.length)process.exitCode=1;

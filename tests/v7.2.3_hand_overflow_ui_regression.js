const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'斗鸡_缩域争鸣_V7.2_Map_Phase2_Hotfix候选.html'),'utf8');
const checks=[
  ['左右浏览按钮存在',/id="handPrev"[\s\S]*id="hand"[\s\S]*id="handNext"/.test(html)],
  ['滚轮映射为横向浏览',/addEventListener\('wheel'[\s\S]*scrollLeft\+=e\.deltaY/.test(html)],
  ['重绘保存并恢复手牌滚动位置',/handScrollLeft[\s\S]*const root=\$\('#hand'\).*restore=[\s\S]*root\.scrollLeft=Math\.min\(restore,max\)/.test(html)],
  ['键盘支持左右与Home-End',/ArrowLeft[\s\S]*ArrowRight[\s\S]*Home[\s\S]*End/.test(html)],
  ['Core合法牌枚举不截断手牌',/out\.cards = p\.hand\.filter/.test(fs.readFileSync(path.join(__dirname,'engine.v721.core.bundle.js'),'utf8'))]
];
const failed=checks.filter(x=>!x[1]);
const report={suite:'V7.2.3 hand overflow UI regression',passed:checks.length-failed.length,total:checks.length,ok:failed.length===0,results:checks.map(([name,ok])=>({name,ok}))};
console.log(JSON.stringify(report,null,2));
process.exit(failed.length?1:0);

/* 판정기 점검: 모든 콘텐츠 선택지를 jsdom으로 돌려 오류·누락 데이터·깨진 숫자를 찾는다.
   사용: cd tools && npm i jsdom && node check.js [장비.json]
   장비 JSON이 없으면 장비 배정은 판정기 데모 장비로 돈다. */
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const errs=[];const w=new JSDOM(src,{runScripts:'dangerously',url:'https://x.test/',beforeParse(w){w.scrollTo=()=>{};w.scrollBy=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.addEventListener('error',e=>errs.push(e.message))}}).window;
if(process.argv[2]) w.gear=JSON.parse(fs.readFileSync(process.argv[2]));
const E=s=>w.eval(s);
const C=E('CONTENTS'),SO=E('SET_OPTS'),SKL=E('SKL'),SPB=E('SPD_BASE'),P=E('PORTRAIT'),SU=E('SETUSE'),SP=E('SPD_ORDER'),SH=E('SHARE'),SRC=E('SHARE_SRC');
const out=[];
for(const c of C){
  for(const l of c.lu){const n=l[0];
    if(l[3]&&!SKL[n])out.push(c.id+': SKL 없음 '+n);
    if(!P[n])out.push(c.id+': 초상화 없음 '+n);
    if(!(n in SPB))out.push(c.id+': SPD_BASE 없음 '+n);}
  if(!SU[c.id])out.push(c.id+': SETUSE 없음');
  if(!SP[c.id])out.push(c.id+': SPD_ORDER 없음');
  if(SH[c.id]){const s=SH[c.id].reduce((a,b)=>a+b,0);if(Math.abs(s-100)>1.5)out.push(c.id+': SHARE 합 '+s.toFixed(1));if(SH[c.id].length!==c.lu.length)out.push(c.id+': SHARE 길이 불일치');}
  if(SRC[c.id]&&/추정/.test(SRC[c.id]))out.push(c.id+': 딜 지분 추정값');
  if(!src.includes('\n# '+c.g))out.push(c.id+': 공략 섹션 "# '+c.g+'" 없음');
}
for(const o of SO){
  for(const pid of o.parts)if(!C.find(c=>c.id===pid))out.push('SET_OPTS '+o.id+': part '+pid+' 없음');
  try{w.setContent(o.id);w.document.getElementById('t-gear').click();w.aRun();
    for(const tab of ['t-gear','t-set','t-goal','t-guide']){w.document.getElementById(tab).click();
      const tx=w.document.querySelector('#p-'+tab.slice(2)).textContent;if(/undefined|NaN/.test(tx))out.push(o.id+' '+tab+' undefined/NaN');}
    out.push('OK '+o.id);
  }catch(e){out.push('THROW '+o.id+' '+e.message)}
}
console.log(out.join('\n'));console.log(errs.length?'페이지 오류: '+errs.slice(0,5).join(' | '):'페이지 오류 없음');

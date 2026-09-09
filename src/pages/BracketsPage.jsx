import React, { useEffect, useRef, useState } from "react";
import { Dropdown, Icon, Modal, Reveal } from "../components/index.js";
import { addChampionshipQualifierManualRegistration, buildChampionshipRecordApplyCompletionOptions, buildNormalizedRuntimeCreateAttempt, buildNormalizedSingleCreateAttempt, championshipEventPickerLabel, completeApplicationEvent, confirmEventParticipantsForBracket, confirmEventTeamsForBracket, createChampionshipAdvancement, createNormalizedBracketRuntime, createNormalizedSingleBracketRuntime, deleteEventBracketRankingAwards, deleteEventBracketResults, deleteNormalizedBracketRuntime, deleteNormalizedSingleBracketRuntime, ensureChampionshipHallOfFameEntry, listChampionshipManualParticipantCandidates, removeChampionshipHallOfFameEntry, fetchNormalizedBracketRuntime, fetchNormalizedSingleBracketRuntime, freezeEventFinalSubmissions, getEvent, getEventRecordContext, getIndividualPlacementPointPolicy, inspectEventParticipantIdentities, isFinalSubmissionRestoreAllowed, isRecordApplyCompletionConfirmed, listChampionshipQualifierDirectSelectionIds, listEventRegistrationSubmissionStatuses, listEventRegistrations, listNormalizedBracketRuntimes, listNormalizedSingleBracketRuntimes, listSubmissionEvents, preflightChampionshipFinalBracket, restoreEventBracketRankingAwards, restoreEventBracketResults, restoreEventFinalSubmissions, revertEventRecordApplication, rollbackEventParticipantIdentityChanges, setChampionshipQualifierDirectSelections, setNormalizedSingleBracketWinner, syncNormalizedBracketMatches, syncEventBracketRankingAwards, syncEventBracketResults, validateEventParticipantEntries, validateEventTeamEntries } from "../services/index.js";
import { buildDefaultTeamMatchLineups, buildTeamMatchSeries, getTeamMatchLineupOptions, getTeamRegistrationAnswerEntries } from "../services/bracketTeamParticipants.js";
import { buildBracketSubmissionStatusModel } from "../services/teamBuilderCore.js";
import { buildBracketPageList } from "../services/historicalBracketReadModel.js";
import { beginNormalizedBracketDraw, completeNormalizedBracketDraw } from "../services/bracketDrawLifecycle.js";
import { ChampionsBracketControls } from "../components/ChampionsBracketControls.jsx";

const uid = () => Math.random().toString(36).slice(2, 9);

/* ============================== 대진표 (Bracket) ============================== */
const BYE="\u2205BYE";
const nextPow2=n=>{let p=1;while(p<n)p*=2;return p;};
const shuffleArr=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

function evalGraph(g){
  const win={},lose={},all=[];
  g.rounds.forEach(r=>r.forEach(m=>all.push(m)));
  if(g.lb) g.lb.forEach(r=>r.forEach(m=>all.push(m)));
  if(g.gf) all.push(g.gf);
  if(g.reset) all.push(g.reset);
  const sp=(s)=>{ if(!s)return null; if(s.bye)return BYE; if(s.pid)return s.pid; if(s.win)return win[s.win]??null; if(s.lose)return lose[s.lose]??null; return null; };
  for(const m of all){
    const pa=sp(m.a),pb=sp(m.b); let w=null,l=null;
    if(m.winner==="a"){w=pa;l=pb;} else if(m.winner==="b"){w=pb;l=pa;}
    else if(pa===BYE&&pb&&pb!==BYE){w=pb;l=BYE;} else if(pb===BYE&&pa&&pa!==BYE){w=pa;l=BYE;}
    else if(pa===BYE&&pb===BYE){w=BYE;l=BYE;}
    win[m.id]=w; lose[m.id]=l;
  }
  return {win,lose,sp};
}
function elimResult(g){
  if(!g) return null;
  const {win,lose}=evalGraph(g);
  const clean=(x)=>x&&x!==BYE?x:null;
  if(g.kind==="double"){
    const gf=g.gf, reset=g.reset;
    const lf=g.lb[g.lb.length-1][0]; const semis=[lf]; if(g.lb.length>=2) semis.push(g.lb[g.lb.length-2][0]);
    const sf=semis.map(m=>lose[m.id]).filter(x=>x&&x!==BYE);
    if(gf.winner==="a"){ // 승자조 챔프가 GF 승리 → 즉시 우승
      return {champ:clean(win[gf.id]), ru:clean(lose[gf.id]), sf, done:!!clean(win[gf.id])};
    }
    if(gf.winner==="b"&&reset){ // 패자조 챔프가 GF 승리 → 리셋 매치로 결정
      return {champ:clean(win[reset.id]), ru:clean(lose[reset.id]), sf, done:!!reset.winner};
    }
    return {champ:null, ru:null, sf, done:false};
  }
  const finalM=g.rounds[g.rounds.length-1][0]; const semis=g.rounds.length>=2?g.rounds[g.rounds.length-2]:[];
  const champ=win[finalM.id]||null, ru=lose[finalM.id]||null;
  const sf=semis.map(m=>lose[m.id]).filter(x=>x&&x!==BYE);
  return {champ:clean(champ), ru:clean(ru), sf, done:!!clean(champ)};
}
function groupStandings(group){
  const w={}; group.members.forEach(m=>w[m]=0);
  group.matches.forEach(mt=>{ if(mt.winner==="a")w[mt.a.pid]++; else if(mt.winner==="b")w[mt.b.pid]++; });
  return [...group.members].sort((x,y)=>w[y]-w[x]).map(name=>({name,wins:w[name]}));
}
function groupDone(g){ return g.groups.every(gr=>gr.matches.every(m=>m.winner)); }
// 매치 승자 설정(불변 업데이트)
function collectGraphMatches(g){ const a=[]; if(!g)return a; g.rounds.forEach(r=>r.forEach(m=>a.push(m))); if(g.lb)g.lb.forEach(r=>r.forEach(m=>a.push(m))); if(g.gf)a.push(g.gf); if(g.reset)a.push(g.reset); return a; }
function cascadeClear(all,id){ const seen=new Set(),stack=[id]; while(stack.length){ const cur=stack.pop();
  all.forEach(m=>{ if(seen.has(m.id))return; if([m.a,m.b].some(s=>s&&(s.win===cur||s.lose===cur))){ m.winner=null; m.series=null; seen.add(m.id); stack.push(m.id); } }); } }
// 승자 선택(토글: 같은 쪽 다시 누르면 취소, 반대쪽 누르면 변경) — 하위 매치 연쇄 초기화
function withPick(b,matchId,side){
  const nb=JSON.parse(JSON.stringify(b));
  for(const g of [nb.graph,nb.knockout]){ if(!g)continue;
    const all=collectGraphMatches(g); const m=all.find(x=>x.id===matchId);
    if(m){ const previous=m.winner; m.winner=(m.winner===side?null:side); cascadeClear(all,m.id); if(g.gf?.id===m.id&&g.reset&&previous!==m.winner){g.reset.winner=null;g.reset.series=null;} return nb; }
  }
  if(nb.groups){ for(const gr of nb.groups){ const m=gr.matches.find(x=>x.id===matchId); if(m){ m.winner=(m.winner===side?null:side); return nb; } } }
  return nb;
}
// 팀전 시리즈 결과 저장(매치에 series 기록 + 전체 승자 반영)
function withSeries(b,matchId,series,winnerSide){
  const nb=JSON.parse(JSON.stringify(b));
  for(const g of [nb.graph,nb.knockout]){ if(!g)continue;
    const all=collectGraphMatches(g); const m=all.find(x=>x.id===matchId);
    if(m){ const previous=m.winner; m.series=series; m.winner=winnerSide; cascadeClear(all,m.id); if(g.gf?.id===m.id&&g.reset&&previous!==m.winner){g.reset.winner=null;g.reset.series=null;} return nb; }
  }
  if(nb.groups){ for(const gr of nb.groups){ const m=gr.matches.find(x=>x.id===matchId); if(m){ m.series=series; m.winner=winnerSide; return nb; } } }
  return nb;
}

/* ===== 마법사 ===== */
/* ===== PNG 다운로드 (우승 이미지 + 대진표 이미지) ===== */
function bkDownload(canvas,filename){ canvas.toBlob(blob=>{ if(!blob)return; const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); },"image/png"); }
function bkRR(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function bkSpaced(ctx,text,cx,y,sp){ ctx.save(); ctx.textAlign="left"; const ws=[...text].map(ch=>ctx.measureText(ch).width+sp); const tot=ws.reduce((a,c)=>a+c,0)-sp; let x=cx-tot/2; for(let i=0;i<text.length;i++){ ctx.fillText(text[i],x,y); x+=ws[i]; } ctx.restore(); }
function bkClip(ctx,t,max){ if(ctx.measureText(t).width<=max)return t; let s=t; while(s.length>1&&ctx.measureText(s+"…").width>max)s=s.slice(0,-1); return s+"…"; }
const BKF='"Wanted Sans Variable", "Wanted Sans", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
/* 워드마크만 사이트와 같은 Anton을 쓴다. 나머지 모든 글자는 본문 서체 하나로 통일. */
const BKM='Anton, sans-serif';
async function bkFonts(){ try{ if(document.fonts&&document.fonts.load){ await document.fonts.load('400 40px Anton'); await document.fonts.ready; } }catch(e){} }
/* 이미지 저장용 브랜드 색 — 사이트 디자인 토큰과 동일 */
const BKC={ navy:"#1B3F86", navyH:"#24509F", ink:"#0D0D0D", t2:"#2C3444",
            t4:"#4E5666", t5:"#6B7383", line:"#E5E8EF", line2:"#D3D9E4",
            soft:"#F5F7FB", soft2:"#EFF3FA", card:"#FFFFFF", white:"#FFFFFF" };

async function downloadChampionPng(b,res,nameOf){
  await bkFonts();
  const S=2,W=1200,H=820; const cv=document.createElement("canvas"); cv.width=W*S; cv.height=H*S;
  const ctx=cv.getContext("2d"); ctx.scale(S,S);

  // 배경: 순백 + 얇은 테두리 한 겹 (그라데이션·반짝이 없음)
  ctx.fillStyle=BKC.card; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=BKC.line; ctx.lineWidth=1; bkRR(ctx,40,40,W-80,H-80,28); ctx.stroke();

  ctx.textAlign="center";
  // 워드마크 (사이트 로고와 같은 Anton)
  ctx.fillStyle=BKC.navy; ctx.font=`400 40px ${BKM}`; bkSpaced(ctx,"YPL",W/2,152,6);
  ctx.fillStyle=BKC.t5; ctx.font=`600 13px ${BKF}`; bkSpaced(ctx,"POKEMON CENTER YONSEI",W/2,178,3);

  // CHAMPION 라벨
  ctx.font=`700 21px ${BKF}`;
  const lw=ctx.measureText("CHAMPION").width+72;
  bkRR(ctx,W/2-lw/2,252,lw,50,12); ctx.fillStyle=BKC.navy; ctx.fill();
  ctx.fillStyle=BKC.white; bkSpaced(ctx,"CHAMPION",W/2,284,8);

  // 챔피언 이름
  const champ=nameOf(res.champ); const part=(b.participants||[]).find(p=>p.id===res.champ);
  let party=""; if(b.mode==="team"){ party=(part?.members||[]).join(", "); }
  else if(part?.party){ party=part.party.split(/[,\n]/).map(x=>x.trim()).filter(Boolean).join(", "); }
  ctx.fillStyle=BKC.ink; ctx.font=`800 120px ${BKF}`;
  ctx.fillText(bkClip(ctx,champ,W-180),W/2,420);

  ctx.strokeStyle=BKC.line2; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(W/2-90,470); ctx.lineTo(W/2+90,470); ctx.stroke();

  let ty=572;
  if(party){ ctx.fillStyle=BKC.t4; ctx.font=`500 23px ${BKF}`;
    ctx.fillText(bkClip(ctx,party,W-200),W/2,522); ty=596; }

  ctx.fillStyle=BKC.t2; ctx.font=`700 36px ${BKF}`;
  ctx.fillText(bkClip(ctx,b.name,W-200),W/2,ty);
  ctx.fillStyle=BKC.t5; ctx.font=`600 19px ${BKF}`; ctx.fillText(b.createdAt,W/2,ty+38);

  // 하단 준우승·4강 (구분선 위)
  const subs=[];
  if(res.ru) subs.push("준우승 "+nameOf(res.ru));
  if(res.sf&&res.sf.length) subs.push("4강 "+res.sf.map(nameOf).join(", "));
  if(subs.length){
    ctx.strokeStyle=BKC.line; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(150,H-132); ctx.lineTo(W-150,H-132); ctx.stroke();
    ctx.fillStyle=BKC.t5; ctx.font=`500 18px ${BKF}`;
    ctx.fillText(bkClip(ctx,subs.join("      "),W-220),W/2,H-96);
  }
  bkDownload(cv,`${b.name}_우승_${champ}.png`);
}

function bkDrawMatch(ctx,x,y,w,h,aTxt,bTxt,aWin,bWin,aBye,bBye){
  bkRR(ctx,x,y,w,h,12); ctx.fillStyle=BKC.card; ctx.fill(); ctx.strokeStyle=BKC.line; ctx.lineWidth=1; ctx.stroke();
  const rowH=h/2; const drawRow=(ry,txt,win,bye)=>{
    if(win){ bkRR(ctx,x+4,ry+3,w-8,rowH-6,8); ctx.fillStyle=BKC.navy; ctx.fill(); }
    ctx.textAlign="left"; ctx.fillStyle=win?BKC.white:(bye?BKC.t5:BKC.ink); ctx.font=`${win?800:600} 14.5px ${BKF}`;
    ctx.fillText(bkClip(ctx,txt||"",w-22),x+12,ry+rowH/2+5);
  };
  drawRow(y,aTxt,aWin,aBye); ctx.strokeStyle=BKC.line; ctx.beginPath(); ctx.moveTo(x+8,y+rowH); ctx.lineTo(x+w-8,y+rowH); ctx.stroke(); drawRow(y+rowH,bTxt,bWin,bBye);
}
// 토너먼트 트리 그리기 → {centers: 라운드별 y중심배열, right:오른쪽끝x, bottom}
function bkDrawTree(ctx,rounds,ev,nameOf,ox,oy,boxW,boxH,gapX,pitch0){
  const centers=[];
  for(let r=0;r<rounds.length;r++){
    centers[r]=[]; const x=ox+r*(boxW+gapX);
    for(let j=0;j<rounds[r].length;j++){
      let cy; if(r===0) cy=oy+j*pitch0+boxH/2; else cy=(centers[r-1][2*j]+centers[r-1][2*j+1])/2;
      centers[r][j]=cy; const m=rounds[r][j];
      const aPid=ev.sp(m.a),bPid=ev.sp(m.b),wp=ev.win[m.id];
      const aTxt=aPid===BYE?"부전승":(aPid?nameOf(aPid):""); const bTxt=bPid===BYE?"부전승":(bPid?nameOf(bPid):"");
      bkDrawMatch(ctx,x,cy-boxH/2,boxW,boxH,aTxt,bTxt, wp&&wp!==BYE&&wp===aPid, wp&&wp!==BYE&&wp===bPid, aPid===BYE,bPid===BYE);
      if(r>0){ // 연결선
        const px=ox+(r-1)*(boxW+gapX)+boxW; const c1=centers[r-1][2*j],c2=centers[r-1][2*j+1]; const midx=px+gapX/2;
        ctx.strokeStyle=BKC.line2; ctx.lineWidth=1.5; ctx.beginPath();
        ctx.moveTo(px,c1); ctx.lineTo(midx,c1); ctx.moveTo(px,c2); ctx.lineTo(midx,c2); ctx.moveTo(midx,c1); ctx.lineTo(midx,c2); ctx.moveTo(midx,(c1+c2)/2); ctx.lineTo(x,(c1+c2)/2); ctx.stroke();
      }
    }
  }
  const right=ox+rounds.length*(boxW+gapX)-gapX;
  const bottom=oy+rounds[0].length*pitch0;
  return {centers,right,bottom};
}

async function downloadBracketPng(b,nameOf){
  await bkFonts();
  const boxW=174,boxH=56,gapX=46,pitch0=boxH+22,padL=34,padT=92;
  const S=2;
  // 측정용 가상 계산
  const blocks=[]; // {type, ...}
  if(b.format==="group"){
    blocks.push({type:"groups"});
    if(b.knockout) blocks.push({type:"elim",g:b.knockout,label:"본선 토너먼트"});
  } else { blocks.push({type:"elim",g:b.graph}); }
  // 캔버스 크기 추정
  let W=700,H=300;
  const estElim=(g)=>{ const wbW=padL+g.rounds.length*(boxW+gapX)-gapX+padL; let h=padT+g.rounds[0].length*pitch0+40;
    if(g.kind==="double"){ h+=70+ (g.lb.reduce((mx,r)=>Math.max(mx,r.length),0))*0+ g.lb.length? 0:0; h+= 60 + Math.max(...g.lb.map(r=>r.length))*(boxH+22)+60; }
    return {w:Math.max(wbW, g.kind==="double"? padL+(g.lb.length+2)*(boxW+gapX):0), h}; };
  let gW=700,gH=0;
  if(b.format==="group"){
    const cols=Math.min(b.groups.length,3); const rows=Math.ceil(b.groups.length/cols);
    const gboxW=250,gboxH=40+Math.max(...b.groups.map(g=>g.members.length))*26+20;
    gW=padL+cols*(gboxW+24)-24+padL; gH=padT+rows*(gboxH+24);
    W=Math.max(W,gW);
    if(b.knockout){ const e=estElim(b.knockout); W=Math.max(W,e.w); gH+=60+e.h; }
    H=gH+40;
  } else { const e=estElim(b.graph); W=Math.max(700,e.w); H=e.h+24; }
  W=Math.ceil(W); H=Math.ceil(H);
  const cv=document.createElement("canvas"); cv.width=W*S; cv.height=H*S; const ctx=cv.getContext("2d"); ctx.scale(S,S);
  ctx.fillStyle=BKC.card; ctx.fillRect(0,0,W,H);
  ctx.textAlign="left"; ctx.fillStyle=BKC.ink; ctx.font=`800 30px ${BKF}`; ctx.fillText(bkClip(ctx,b.name,W-320),34,50);
  ctx.fillStyle=BKC.navy; ctx.font=`400 17px ${BKM}`; bkSpaced(ctx,"YPL",34+13,76,3);
  ctx.fillStyle=BKC.t5; ctx.font=`600 13px ${BKF}`;
  ctx.fillText("POKEMON CENTER YONSEI · "+(b.createdAt||""),34+40,75);
  ctx.strokeStyle=BKC.line; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(34,88); ctx.lineTo(W-34,88); ctx.stroke();
  const res=b.format==="group"?(b.knockout?elimResult(b.knockout):null):elimResult(b.graph);
  if(res&&res.done){ ctx.font=`700 17px ${BKF}`; const t="우승 "+nameOf(res.champ);
    const tw=ctx.measureText(t).width+34; bkRR(ctx,W-34-tw,26,tw,38,10); ctx.fillStyle=BKC.navy; ctx.fill();
    ctx.fillStyle=BKC.white; ctx.textAlign="center"; ctx.fillText(t,W-34-tw/2,51); ctx.textAlign="left"; }
  let curY=padT;
  const drawElimBlock=(g,oy,label)=>{
    if(label){ ctx.fillStyle=BKC.ink; ctx.font=`800 17px ${BKF}`; ctx.fillText(label,34,oy-14); }
    const ev=evalGraph(g);
    const t=bkDrawTree(ctx,g.rounds,ev,nameOf,padL,oy,boxW,boxH,gapX,pitch0);
    let bottom=t.bottom;
    if(g.kind==="double"){
      const lbY=t.bottom+50; ctx.fillStyle=BKC.t2; ctx.font=`800 15px ${BKF}`; ctx.fillText("패자부활전 (Lower Bracket)",padL,lbY-12);
      // LB는 단순 컬럼
      for(let r=0;r<g.lb.length;r++){ const x=padL+r*(boxW+gapX);
        for(let j=0;j<g.lb[r].length;j++){ const m=g.lb[r][j]; const cy=lbY+j*pitch0+boxH/2;
          const aPid=ev.sp(m.a),bPid=ev.sp(m.b),wp=ev.win[m.id];
          bkDrawMatch(ctx,x,cy-boxH/2,boxW,boxH, aPid===BYE?"부전승":(aPid?nameOf(aPid):""), bPid===BYE?"부전승":(bPid?nameOf(bPid):""), wp&&wp!==BYE&&wp===aPid, wp&&wp!==BYE&&wp===bPid, aPid===BYE,bPid===BYE);
        } }
      // 그랜드 파이널
      const gx=padL+g.lb.length*(boxW+gapX); const gy=lbY+boxH/2; const m=g.gf; const aPid=ev.sp(m.a),bPid=ev.sp(m.b),wp=ev.win[m.id];
      ctx.fillStyle=BKC.navy; ctx.font=`800 13.5px ${BKF}`; ctx.fillText("그랜드 파이널",gx,lbY-12);
      bkDrawMatch(ctx,gx,gy-boxH/2,boxW,boxH, aPid?nameOf(aPid):"", bPid?nameOf(bPid):"", wp&&wp===aPid, wp&&wp===bPid,false,false);
      if(g.reset&&g.gf.winner==="b"){ const rx=gx+boxW+gapX; const rm=g.reset; const raPid=ev.sp(rm.a),rbPid=ev.sp(rm.b),rwp=ev.win[rm.id];
        ctx.fillStyle=BKC.navy; ctx.font=`800 13.5px ${BKF}`; ctx.fillText("최종 결승 (리셋)",rx,lbY-12);
        bkDrawMatch(ctx,rx,gy-boxH/2,boxW,boxH, raPid?nameOf(raPid):"", rbPid?nameOf(rbPid):"", rwp&&rwp===raPid, rwp&&rwp===rbPid,false,false); }
      bottom=lbY+Math.max(...g.lb.map(r=>r.length))*pitch0;
    }
    return bottom;
  };
  if(b.format==="group"){
    const cols=Math.min(b.groups.length,3); const gboxW=250;
    b.groups.forEach((gr,gi)=>{ const st=groupStandings(gr); const r=Math.floor(gi/cols),c=gi%cols;
      const gboxH=40+gr.members.length*26+14; const x=padL+c*(gboxW+24); const y=curY+r*( 40+Math.max(...b.groups.map(g=>g.members.length))*26+14 +24);
      bkRR(ctx,x,y,gboxW,gboxH,18); ctx.fillStyle=BKC.card; ctx.fill(); ctx.strokeStyle=BKC.line; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=BKC.ink; ctx.font=`800 16px ${BKF}`; ctx.textAlign="left"; ctx.fillText("그룹 "+gr.name,x+14,y+26);
      st.forEach((s,i)=>{ const ry=y+44+i*26; const adv=i<b.groupCfg.adv; if(adv){ bkRR(ctx,x+8,ry-15,gboxW-16,24,8); ctx.fillStyle=BKC.soft2; ctx.fill(); }
        ctx.fillStyle=adv?BKC.navy:BKC.t4; ctx.font=`${adv?800:500} 13.5px ${BKF}`; ctx.fillText(`${i+1}. ${nameOf(s.name)}`,x+16,ry+2); ctx.textAlign="right"; ctx.fillText(s.wins+"승",x+gboxW-16,ry+2); ctx.textAlign="left"; });
    });
    const rows=Math.ceil(b.groups.length/cols); curY=curY+rows*(40+Math.max(...b.groups.map(g=>g.members.length))*26+14+24)+40;
    if(b.knockout){ drawElimBlock(b.knockout,curY,"본선 토너먼트"); }
  } else { drawElimBlock(b.graph,curY); }
  ctx.textAlign="right"; ctx.fillStyle=BKC.t5; ctx.font=`600 12px ${BKF}`;
  ctx.fillText("YONSEI POKEMON LEAGUE",W-34,H-16); ctx.textAlign="left";
  bkDownload(cv,`${b.name}_대진표.png`);
}

function BracketWizard({ data, onClose, onCreate }){
  const [step,setStep]=useState(1);
  const [name,setName]=useState("");
  const [mode,setMode]=useState("single");      // single=개인전, team=팀전
  const [dbl,setDbl]=useState(false);
  const [format,setFormat]=useState("elim");     // elim | group
  const [countStr,setCountStr]=useState("8");
  const count=Math.max(0,parseInt(countStr)||0);
  const [groups,setGroups]=useState("4");
  const [adv,setAdv]=useState("2");
  const [names,setNames]=useState(Array(8).fill(""));
  const [teams,setTeams]=useState(Array(8).fill(null).map(()=>({name:"",members:""})));
  const [events,setEvents]=useState([]);
  const [eventId,setEventId]=useState("");
  const [manualMode,setManualMode]=useState(false);
  const [eventRegs,setEventRegs]=useState([]);
  const [eventBusy,setEventBusy]=useState(false);
  const [eventError,setEventError]=useState("");
  const [submissionStatuses,setSubmissionStatuses]=useState([]);
  const [submissionStatusError,setSubmissionStatusError]=useState("");
  const [selectedRegistrationIds,setSelectedRegistrationIds]=useState([]);
  const [directRegistrationIds,setDirectRegistrationIds]=useState([]);
  const [addedParticipants,setAddedParticipants]=useState([]);
  const [championshipManualOpen,setChampionshipManualOpen]=useState(false);
  const [championshipManualCandidates,setChampionshipManualCandidates]=useState([]);
  const [championshipManualPlayerId,setChampionshipManualPlayerId]=useState("");
  const [championshipManualReason,setChampionshipManualReason]=useState("");
  const [championshipManualBusy,setChampionshipManualBusy]=useState(false);
  const [creating,setCreating]=useState(false);
  const normalizedAttemptRef=useRef(null);

  useEffect(()=>{
    let cancelled=false;
    listSubmissionEvents()
      .then(rows=>{ if(!cancelled) setEvents([...(rows||[])].sort((a,b)=>{
        const phaseOrder=value=>value==="qualifier"?0:value==="final"?1:2;
        const phaseDiff=phaseOrder(a.championship_phase)-phaseOrder(b.championship_phase);
        return phaseDiff||String(a.name||"").localeCompare(String(b.name||""),"ko");
      })); })
      .catch(error=>{ if(!cancelled) setEventError(error?.message||"대회 목록을 불러오지 못했습니다."); });
    return ()=>{ cancelled=true; };
  },[]);
  const selectLinkedEvent=async(id,{preserveDirectIds=null,preserveSelectedIds=null}={})=>{
    setEventId(id);
    normalizedAttemptRef.current=null;
    setEventError("");
    setEventRegs([]);
    setSubmissionStatuses([]);
    setSubmissionStatusError("");
    setDirectRegistrationIds([]);
    setChampionshipManualOpen(false);
    setChampionshipManualCandidates([]);
    setChampionshipManualPlayerId("");
    setChampionshipManualReason("");
    if(!id) return;

    const event=events.find(x=>x.id===id);
    if(!event) return;

    setName(event.name||"");
    setMode(event.is_team_event?"team":"single");

    if(event.competition_format==="round_robin"){
      setFormat("group");
      setDbl(false);
    }else{
      setFormat("elim");
      setDbl(event.competition_format==="double_elimination");
    }

    setEventBusy(true);
    try{
      const [registrationResult, statusResult, directSelectionResult] = await Promise.allSettled([
        listEventRegistrations(id),
        listEventRegistrationSubmissionStatuses(id),
        event.championship_phase === "qualifier" ? listChampionshipQualifierDirectSelectionIds(id) : Promise.resolve([]),
      ]);
      if (registrationResult.status === "rejected") throw registrationResult.reason;
      const regs = registrationResult.value || [];
      const statuses = statusResult.status === "fulfilled" ? statusResult.value : [];
      if (statusResult.status === "rejected") setSubmissionStatusError(statusResult.reason?.message || "제출 상태를 불러오지 못했습니다.");
      setEventRegs(regs);
      setSubmissionStatuses(statuses || []);
      const directIds = directSelectionResult.status === "fulfilled" ? directSelectionResult.value : [];
      if (directSelectionResult.status === "rejected") setEventError(directSelectionResult.reason?.message || "저장된 본선 직행자를 불러오지 못했습니다.");
      const registrationIds=(regs||[]).map(r=>r.id);
      const nextDirectIds=(preserveDirectIds||directIds).filter(registrationId=>registrationIds.includes(registrationId));
      const nextSelectedIds=preserveSelectedIds
        ? preserveSelectedIds.filter(registrationId=>registrationIds.includes(registrationId)&&!nextDirectIds.includes(registrationId))
        : registrationIds.filter(registrationId=>!nextDirectIds.includes(registrationId));
      setDirectRegistrationIds(nextDirectIds);
      setSelectedRegistrationIds(nextSelectedIds);
      setAddedParticipants([]);

      if(!event.is_team_event){
        const participantNames=(regs||[]).map(r=>r.registration_name||"").filter(Boolean);
        const n=Math.max(2,participantNames.length);
        setCountStr(String(n));
        setNames(Array.from({length:n},(_,i)=>participantNames[i]||""));
      }else{
        setCountStr("8");
        setTeams(Array(8).fill(null).map(()=>({name:"",members:""})));
      }
    }catch(error){
      setEventError(error?.message||"신청자 목록을 불러오지 못했습니다.");
      setSubmissionStatusError(error?.message || "제출 상태를 불러오지 못했습니다.");
    }finally{
      setEventBusy(false);
    }
  };

  const setCnt=(v)=>{ const s=String(v).replace(/[^0-9]/g,"").slice(0,2); setCountStr(s); const n=parseInt(s)||0;
    if(n>=1&&n<=64){ setNames(p=>{const a=Array(n).fill("");for(let i=0;i<n;i++)a[i]=p[i]||"";return a;});
      setTeams(p=>{const a=[];for(let i=0;i<n;i++)a.push(p[i]||{name:"",members:""});return a;}); } };
  const gN=Math.max(2,parseInt(groups)||2), aN=Math.max(1,parseInt(adv)||1);
  const buildParticipants=()=>{
    if(mode==="team") return teams.map(t=>({
      id:uid(),
      name:(t.name||"").trim(),
      members:(t.members||"").split(/[,\n]/).map(s=>s.trim()).filter(Boolean)
    })).filter(t=>t.name);

    if(eventId){
      const registered=eventRegs
        .filter(r=>selectedRegistrationIds.includes(r.id) && !directRegistrationIds.includes(r.id))
        .map(r=>({
          id:uid(),
          name:(r.registration_name||"").trim(),
          registrationId:r.id,
          playerId:r.player_id||null
        }))
        .filter(p=>p.name);

      const added=linkedEvent?.championship_phase ? [] : addedParticipants
        .map(n=>({id:uid(),name:(n||"").trim()}))
        .filter(p=>p.name);

      return [...registered,...added];
    }

    return names
      .map(n=>({id:uid(),name:(n||"").trim()}))
      .filter(p=>p.name);
  };
  const go=async()=>{
    if(creating)return;
    if(linkedEvent?.championship_phase === "qualifier"){
      try{
        await setChampionshipQualifierDirectSelections(linkedEvent.id,directRegistrationIds);
      }catch(error){ setEventError(error?.message||"본선 직행자를 저장하지 못했습니다."); return; }
    }
    const parts=buildParticipants();
    if(parts.length<2){ setEventError(linkedEvent?.championship_phase==="final"?"본선 진출자를 먼저 확정해 주세요.":"참가자(팀)를 2개 이상 입력해주세요."); return; }
    if(format!=="elim"){ setEventError("active Event 대진표는 normalized elimination runtime만 지원합니다."); return; }
    if(linkedEvent?.championship_phase === "final"){
      try{
        const preflight=await preflightChampionshipFinalBracket(linkedEvent.id);
        if(!preflight.ok){ setEventError(preflight.error); return; }
      }catch(error){ setEventError(error?.message||"본선 대진표 생성 조건을 확인하지 못했습니다."); return; }
    }
    const useDbl = dbl && parts.length>=3;
    if(dbl && !useDbl) alert("참가자가 3명 미만이면 더블 엘리미네이션이 성립하지 않아, 단일 엘리미네이션으로 생성됩니다.");
    let normalizedAttempt=null;
    if(eventId&&mode==="single"){
      const attemptKey=JSON.stringify(parts.map(p=>[p.registrationId||null,p.name]));
      if(!normalizedAttemptRef.current||normalizedAttemptRef.current.attemptKey!==attemptKey){
        normalizedAttemptRef.current={attemptKey,...buildNormalizedSingleCreateAttempt(parts)};
      }
      normalizedAttempt=normalizedAttemptRef.current;
    }
    setCreating(true);
    let created=false;
    try{
      created=await onCreate({ id:uid(), name:name.trim()||"새 대회", createdAt:new Date().toISOString().slice(0,10),
        mode, double:useDbl, format, groupCfg:format==="group"?{groups:gN,adv:aN}:null,
        eventId:eventId||null,
        participants:normalizedAttempt
          ? normalizedAttempt.participants.map(p=>({
              id:p.participant_key,
              name:p.display_name,
              registrationId:p.registration_id,
              playerId:p.player_id,
              entryId:p.entry_id,
              entryParticipantId:p.entry_participant_id,
            }))
          : parts,
        normalizedAttempt,
        graph:null, groups:null, knockout:null, status:"active", applied:null });
    }finally{
      setCreating(false);
    }
    if(created)onClose();
  };
  const submissionStatusByRegistrationId = new Map((submissionStatuses || []).map(status => [status.registrationId, status]));
  const formatSubmissionTime = value => value ? new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "";
  const submissionBadge = registrationId => {
    const status = submissionStatusByRegistrationId.get(registrationId);
    if (!status?.hasSubmission) {
      return <span className="bk-hint bk-participant-submission missing">미제출</span>;
    }
    const submittedAt = formatSubmissionTime(status.latestSubmittedAt);
    return (
      <span
        className="bk-hint bk-participant-submission submitted"
        title={submittedAt ? `제출 시간 ${submittedAt}` : undefined}
      >
        제출 완료
      </span>
    );
  };
  const linkedEvent=events.find(event=>event.id===eventId)||null;
  const linkedAnnouncement=(data?.announcements||[]).find(announcement=>
    announcement.id===linkedEvent?.registration_settings?.announcementId
  );
  const linkedFields=linkedAnnouncement?.form?.fields||[];
  const assignedTeamsFor=(name)=>teams
    .filter(team=>(team.members||"").split(/[,\n]/).map(value=>value.trim()).includes(name))
    .map(team=>(team.name||"").trim()||"이름 없는 팀");
  const openChampionshipManualParticipant=async()=>{
    if(!linkedEvent?.championship_phase||championshipManualBusy)return;
    setEventError("");
    setChampionshipManualBusy(true);
    try{
      const candidates=await listChampionshipManualParticipantCandidates(linkedEvent.id);
      setChampionshipManualCandidates(candidates);
      setChampionshipManualPlayerId(candidates[0]?.id||"");
      setChampionshipManualReason("");
      setChampionshipManualOpen(true);
    }catch(error){ setEventError(error?.message||"추가할 참가자 후보를 불러오지 못했습니다."); }
    finally{ setChampionshipManualBusy(false); }
  };
  const addChampionshipManualParticipant=async()=>{
    if(!linkedEvent?.championship_phase||!championshipManualPlayerId||championshipManualBusy)return;
    setEventError("");
    setChampionshipManualBusy(true);
    try{
      if(linkedEvent.championship_phase==="qualifier"){
        await addChampionshipQualifierManualRegistration({qualifierEventId:linkedEvent.id,playerId:championshipManualPlayerId});
      }else{
        await createChampionshipAdvancement({finalEventId:linkedEvent.id,playerId:championshipManualPlayerId,advancementType:"manual",reason:championshipManualReason});
      }
      await selectLinkedEvent(linkedEvent.id,{
        preserveDirectIds:directRegistrationIds,
        preserveSelectedIds:selectedRegistrationIds,
      });
    }catch(error){ setEventError(error?.message||"수동 참가자를 추가하지 못했습니다."); }
    finally{ setChampionshipManualBusy(false); }
  };
  return (<div className="bk-create">
    <div className="bk-head">
      <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon n="back" size={14}/>목록</button>
      <h2>새 대진표</h2>
    </div>
    <div className="bk-stepper">
      <span className={step===1?"on":""}>1 대회 설정</span><i/>
      <span className={step===2?"on":""}>2 참가자 확정</span>
    </div>
    <div className="card form-card swap" key={step}>
    {step===1&&<>
      <div className="field">
        <label>신청 대회 선택</label>
        <Dropdown
          value={manualMode?"__manual__":eventId}
          onChange={v=>{
            if(v==="__manual__"){
              setManualMode(true);
              normalizedAttemptRef.current=null;
              setEventId("");
              setEventRegs([]);
              setEventError("");
              return;
            }
            setManualMode(false);
            selectLinkedEvent(v);
          }}
          placeholder={eventBusy?"불러오는 중...":"대회를 선택하세요"}
          options={[
            ...events.map(ev=>({value:ev.id,label:championshipEventPickerLabel(ev)})),
            {value:"__manual__",label:"연결하지 않고 새로 만들기"}
          ]}
        />
        {eventError&&<div className="bk-hint" style={{color:"var(--loss)"}}>{eventError}</div>}
        {eventId&&!eventBusy&&
          <div className="bk-hint">
            신청자 {eventRegs.length}명 · 공지에 설정된 대회 정보와 참가자 명단을 사용합니다.
            {mode!=="team"&&submissionStatusError&&<span style={{display:"block",color:"var(--loss)",marginTop:4}}>파티 제출 상태: {submissionStatusError}</span>}
          </div>
        }
      </div>

      {manualMode&&<>
        <div className="field">
          <label>대회명</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 37회 파이컵"/>
        </div>

        <div className="field">
          <label>경기 방식</label>
          <div className="bk-seg">
            <button type="button" className={mode==="single"?"on":""} onClick={()=>setMode("single")}>개인전</button>
            <button type="button" className={mode==="team"?"on":""} onClick={()=>setMode("team")}>팀전</button>
          </div>
        </div>

        <div className="field">
          <label>대진 형식</label>
          <div className="bk-seg">
            <button type="button" className={format==="elim"?"on":""} onClick={()=>setFormat("elim")}>토너먼트</button>
            <button type="button" className={format==="group"?"on":""} onClick={()=>setFormat("group")}>조별예선 + 본선</button>
          </div>
        </div>

        {format==="elim"&&
          <label className="bk-check">
            <input type="checkbox" checked={dbl} onChange={e=>setDbl(e.target.checked)}/>
            <span>더블 엘리미네이션 <i>(패자부활전)</i></span>
          </label>
        }

        {format==="group"&&
          <div className="bk-grow2">
            <div className="field">
              <label>그룹 수</label>
              <input type="text" inputMode="numeric" value={groups} onChange={e=>setGroups(e.target.value.replace(/[^0-9]/g,"").slice(0,2))} placeholder="예: 4"/>
            </div>
            <div className="field">
              <label>그룹별 본선 진출</label>
              <input type="text" inputMode="numeric" value={adv} onChange={e=>setAdv(e.target.value.replace(/[^0-9]/g,"").slice(0,2))} placeholder="예: 2"/>
            </div>
          </div>
        }
      </>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button
          className="btn btn-primary"
          onClick={()=>setStep(2)}
          disabled={!manualMode&&!eventId}
        >
          다음 →
        </button>
      </div>
    </>}    {step===2&&<>
      {eventId&&mode!=="team" ? <>
        {linkedEvent?.championship_phase==="qualifier"&&<div className="field">
          <label>본선 직행자 선택</label>
          <div className="bk-hint">신청자 중 운영자가 직접 선택합니다. 직행자는 선발전 대진표 참가자에서 제외되며, 아직 본선 Registration은 만들지 않습니다.</div>
          <div className="bk-fill">{eventRegs.map((reg,i)=>{const checked=directRegistrationIds.includes(reg.id);return <label className="bk-pin" key={`direct-${reg.id}`} style={{animationDelay:(i*18)+"ms",cursor:"pointer"}}><span className="bk-pin-no gold">{i+1}</span><input type="checkbox" checked={checked} onChange={()=>{setDirectRegistrationIds(prev=>checked?prev.filter(id=>id!==reg.id):[...prev,reg.id]);setSelectedRegistrationIds(prev=>checked?prev:[...prev.filter(id=>id!==reg.id)]);}} style={{width:"auto"}}/><span style={{flex:1,fontWeight:700}}>{reg.registration_name}</span><span className="bk-hint" style={{margin:0}}>{checked?"본선 직행":""}</span></label>;})}</div>
        </div>}
        <div className="field">
          <label>참가자 확정</label>
          <div className="bk-hint">
            {linkedEvent?.championship_phase==="qualifier"?`직행자 ${directRegistrationIds.length}명은 제외하고 선발전 실제 참가자를 확정합니다. `:"신청자 중 실제 참가자를 선택합니다. "}참가 확정 {selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length}명 / 신청 {eventRegs.length}명
          </div>
        </div>

        <div className="bk-fill bk-participant-confirm-list">
          {eventRegs.map((reg,i)=>{
            if(linkedEvent?.championship_phase==="qualifier"&&directRegistrationIds.includes(reg.id)) return null;
            const checked=selectedRegistrationIds.includes(reg.id);
            return (
              <label className="bk-pin bk-participant-confirm-row" key={reg.id} style={{animationDelay:(i*22)+"ms",cursor:"pointer"}}>
                <span className="bk-pin-no">{i+1}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={()=>{
                    setSelectedRegistrationIds(prev=>
                      checked ? prev.filter(id=>id!==reg.id) : [...prev,reg.id]
                    );
                  }}
                  style={{width:"auto"}}
                />
                <span className="bk-participant-name">{reg.registration_name}</span>
                {submissionBadge(reg.id)}
                {!checked&&<span className="bk-hint bk-participant-absent">불참</span>}
              </label>
            );
          })}

          {!linkedEvent?.championship_phase && addedParticipants.map((name,i)=>(
            <div className="bk-pin bk-participant-confirm-row bk-participant-added" key={`added-${i}`}>
              <span className="bk-pin-no gold">+</span>
              <input
                value={name}
                onChange={e=>setAddedParticipants(prev=>prev.map((x,j)=>j===i?e.target.value:x))}
                placeholder="추가 참가자 이름"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={()=>setAddedParticipants(prev=>prev.filter((_,j)=>j!==i))}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <div className="row-actions" style={{justifyContent:"space-between",marginTop:10}}>
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={()=>setSelectedRegistrationIds(eventRegs.map(r=>r.id))}
            >
              전체 선택
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={()=>setSelectedRegistrationIds([])}
            >
              전체 해제
            </button>
          </div>
          {linkedEvent?.championship_phase ? <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={openChampionshipManualParticipant}
            disabled={championshipManualBusy}
          >
            + 참가자 추가
          </button> : <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={()=>setAddedParticipants(prev=>[...prev,""])}
          >
            + 참가자 추가
          </button>}
        </div>
        {championshipManualOpen&&linkedEvent?.championship_phase&&<div className="field" style={{marginTop:10}}>
          <label>참가자 추가</label>
          <div className="bk-grow2">
            <Dropdown
              value={championshipManualPlayerId}
              onChange={setChampionshipManualPlayerId}
              placeholder="선수 선택"
              options={championshipManualCandidates.map(player=>({value:player.id,label:player.display_name}))}
            />
            {linkedEvent.championship_phase==="final"&&<input
              value={championshipManualReason}
              onChange={event=>setChampionshipManualReason(event.target.value)}
              placeholder="운영 사유 (선택)"
            />}
          </div>
          <div className="row-actions" style={{justifyContent:"flex-end",marginTop:8}}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={championshipManualBusy} onClick={()=>setChampionshipManualOpen(false)}>취소</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!championshipManualPlayerId||championshipManualBusy} onClick={addChampionshipManualParticipant}>추가</button>
          </div>
        </div>}
        {linkedEvent?.championship_phase==="qualifier"&&(()=>{const capacity=Number(linkedEvent?.competition_settings?.championship?.finalCapacity)||0;const actual=selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length;const target=capacity-directRegistrationIds.length;const eliminated=actual-target;return <div className="bk-hint" style={{marginTop:10}}>본선 정원 {capacity}명 · 본선 직행 {directRegistrationIds.length}명 · 선발전 실제 참가 {actual}명 · 선발전 통과 필요 {target}명 · 필요 탈락 {Math.max(0,eliminated)}명{actual<target&&<span style={{color:"var(--loss)"}}> — 신청/참가 인원이 부족해 본선 정원을 채울 수 없습니다.</span>}</div>;})()}
      </> : <>
        {eventId&&mode==="team"&&<div className="field">
          <label>신청자 / 팀 지망</label>
          <div className="bk-hint">신청서에 저장된 팀 지망을 참고해 아래 기존 팀 편성 입력에서 최종 배정합니다.</div>
          <div className="bk-fill">
            {eventRegs.map((reg,i)=>{
              const answers=getTeamRegistrationAnswerEntries(reg,linkedFields);
              const assigned=assignedTeamsFor(reg.registration_name);
              return <div className="bk-pin" key={reg.id} style={{animationDelay:(i*22)+"ms"}}>
                <span className="bk-pin-no">{i+1}</span>
                <div style={{flex:1,minWidth:0}}>
                  <b>{reg.registration_name}</b>
                  <div className="bk-hint" style={{marginTop:3}}>
                    {answers.length
                      ? answers.map(answer=>`${answer.label}: ${answer.value||"-"}`).join(" · ")
                      : "저장된 팀 지망 답변 없음"}
                  </div>
                </div>
                <span className="bk-hint" style={{margin:0}}>
                  {assigned.length===0?"미배정":assigned.length===1?assigned[0]:"중복 배정"}
                </span>
              </div>;
            })}
          </div>
        </div>}

        <div className="field"><label>{mode==="team"?"팀 수":"참가자 수"}</label>
          <div className="bk-count">
            <button type="button" onClick={()=>setCnt(Math.max(2,count-1))}>−</button>
            <input type="text" inputMode="numeric" value={countStr} onChange={e=>setCnt(e.target.value)}/>
            <button type="button" onClick={()=>setCnt(Math.min(64,count+1))}>＋</button>
          </div>
          <div className="bk-hint">{(()=>{
            if(format==="group") return `${gN}개 그룹, 그룹당 약 ${Math.ceil(Math.max(count,1)/gN)}명, 상위 ${aN}명 본선`;
            const sz=nextPow2(Math.max(count,2));
            return `${sz}강 대진, 부전승 ${sz-count}개 자동 추가`;
          })()}</div>
        </div>

        <div className="bk-fill">
          {mode==="team"
            ? teams.map((t,i)=>(<div className="bk-team-card" key={i} style={{animationDelay:(i*28)+"ms"}}>
                <span className="bk-pin-no gold">{i+1}</span>
                <input className="bk-tc-name" value={t.name} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder={`팀 ${i+1} 이름`}/>
                <input className="bk-tc-mem" value={t.members} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,members:e.target.value}:x))} placeholder="팀원 (쉼표로 구분)"/>
              </div>))
            : names.map((n,i)=>(<div className="bk-pin" key={i} style={{animationDelay:(i*22)+"ms"}}>
                <span className="bk-pin-no">{i+1}</span>
                <input value={n} onChange={e=>setNames(names.map((x,j)=>j===i?e.target.value:x))} placeholder={`참가자 ${i+1}`}/>
              </div>))}
        </div>
      </>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={()=>setStep(1)}><Icon n="back" size={14}/>이전</button>
        <button className="btn btn-primary" onClick={go} disabled={creating}>{creating?"생성 중…":"대진표 생성"}</button>
      </div>
    </>}
    </div>
  </div>);
}

/* ===== 팀 대결(실제 lineup + 에이스 결정전) ===== */
const teamMatchDisplayName=(value)=>{ const name=String(value??""); const trimmed=name.trim(); return /^\d+$/.test(trimmed)?`${trimmed}팀`:name; };
function TeamMatchModal({ teamA, teamB, init, onClose, onSave }){
  const defaults=buildDefaultTeamMatchLineups(teamA,teamB);
  const optionsA=getTeamMatchLineupOptions(teamA),optionsB=getTeamMatchLineupOptions(teamB);
  const N=defaults.normalBoutCount;
  const initialLineup=(stored,fallback)=>Array.from({length:N},(_,i)=>Array.isArray(stored)?(stored[i]||""):(fallback[i]||""));
  const [lineupA,setLineupA]=useState(()=>initialLineup(init?.lineupA,defaults.lineupA));
  const [lineupB,setLineupB]=useState(()=>initialLineup(init?.lineupB,defaults.lineupB));
  const [games,setGames]=useState(()=>{ const g=Array(N).fill(null); (init?.games||[]).forEach((w,i)=>{if(i<N)g[i]=w;}); return g; });
  const [aceA,setAceA]=useState(init?.ace?.a||defaults.captainA||"");
  const [aceB,setAceB]=useState(init?.ace?.b||defaults.captainB||"");
  const [aceW,setAceW]=useState(init?.ace?.winner||null);
  const setGame=(i,w)=>setGames(games.map((x,j)=>j===i?(x===w?null:w):x));
  let a=0,b=0; games.forEach(w=>{if(w==="a")a++;else if(w==="b")b++;});
  const allPlayed=N>0&&games.every(w=>w); const tie=allPlayed&&a===b;
  const allPlayers=lineupA.every(Boolean)&&lineupB.every(Boolean);
  const decided=allPlayers&&allPlayed&&(!tie||(!!aceA&&!!aceB&&!!aceW));
  const confirm=()=>{ if(!decided){alert("모든 실제 lineup 선수와 대결 결과(동점 시 타이브레이커 포함)를 입력하세요.");return;}
    const result=buildTeamMatchSeries(teamA,teamB,{lineupA,lineupB,games,ace:tie?{a:aceA,b:aceB,winner:aceW}:null}); onSave(result.series,result.winnerSide); };
  const side=(value,onChange,options,winner,onWin,label)=><div className="bk-bout-side"><div className="bk-bout-player"><Dropdown value={value} onChange={onChange} placeholder="선수 선택" options={options}/></div><button type="button" className={"bk-bout-win"+(winner?" is-win":"")} onClick={onWin} aria-label={label} aria-pressed={winner}>{winner?"✓ 승":"승"}</button></div>;
  const displayTeamA=teamMatchDisplayName(teamA.name),displayTeamB=teamMatchDisplayName(teamB.name);
  return (<Modal title={`${displayTeamA} vs ${displayTeamB}`} hint="실제 출전 선수를 선택하고 모든 개인전 결과를 입력하세요." onClose={onClose}>
    <div className="swap bk-team-match-modal">
      <div className="bk-bout-columns" aria-hidden="true"><span/><strong>{displayTeamA}</strong><span/><strong>{displayTeamB}</strong></div>
      <div className="bk-series">{Array.from({length:N}).map((_,i)=>(<div className="bk-series-row bk-bout-row" key={i}>
        <span className="bk-series-no bk-bout-label">{i+1}경기</span>
        {side(lineupA[i],v=>setLineupA(lineupA.map((name,j)=>j===i?v:name)),optionsA,games[i]==="a",()=>setGame(i,"a"),`${i+1}경기 A팀 승리`)}
        <span className="bk-series-vs">vs</span>
        {side(lineupB[i],v=>setLineupB(lineupB.map((name,j)=>j===i?v:name)),optionsB,games[i]==="b",()=>setGame(i,"b"),`${i+1}경기 B팀 승리`)}
      </div>))}</div>
      {tie&&<div className="bk-ace">
        <div className="bk-ace-h">타이브레이커</div>
        <div className="bk-series-row bk-bout-row bk-bout-row-ace"><span className="bk-bout-label-spacer" aria-hidden="true"/>{side(aceA,setAceA,optionsA,aceW==="a",()=>setAceW(aceW==="a"?null:"a"),"타이브레이커 A팀 승리")}<span className="bk-series-vs">vs</span>{side(aceB,setAceB,optionsB,aceW==="b",()=>setAceW(aceW==="b"?null:"b"),"타이브레이커 B팀 승리")}</div>
      </div>}
      <div className="modal-actions bk-team-match-actions"><button className="btn btn-ghost" onClick={onClose}>취소</button><button className="btn btn-primary" onClick={confirm} disabled={!decided}>대결 확정 ✓</button></div>
    </div>
  </Modal>);
}

/* ===== 매치 카드 ===== */
function MatchCard({ m, ev, nameOf, admin, onPick, compact, teamMode, onOpenTeam }){
  if(!m) return null;
  const pa=ev.sp(m.a), pb=ev.sp(m.b);
  const decided=!!m.winner;
  const bothReal=pa&&pb&&pa!==BYE&&pb!==BYE;
  if(teamMode){
    const clickable=admin&&(bothReal||decided);
    const rowT=(side,pid)=>{ const isWin=decided&&m.winner===side; const isBye=pid===BYE;
      return <div className={"bk-slot"+(isWin?" win":"")+(isBye?" bye":"")}><span className="bk-tn">{pid===BYE?"부전승":(pid?nameOf(pid):"…")}</span></div>; };
    return <div className={"bk-match"+(compact?" cmp":"")+(clickable?" team-click":"")} onClick={()=>clickable&&onOpenTeam(m,pa,pb)} title={clickable?"클릭하여 팀 대결 진행/수정":""}>{rowT("a",pa)}{rowT("b",pb)}</div>;
  }
  const canPick=admin&&bothReal;
  const row=(side,pid)=>{
    const isWin=decided&&m.winner===side; const isBye=pid===BYE;
    const txt=pid===BYE?"부전승":(pid?nameOf(pid):"…");
    return <button type="button" className={"bk-slot"+(isWin?" win":"")+(isBye?" bye":"")+(canPick?" pick":"")} disabled={!canPick} onClick={()=>canPick&&onPick(m.id,side)} title={canPick?(decided?"승자 변경 / 같은 쪽 다시 클릭 시 취소":"클릭하여 승자 선택"):""}>{txt}</button>;
  };
  return <div className={"bk-match"+(compact?" cmp":"")}>{row("a",pa)}{row("b",pb)}</div>;
}

/* ===== 대진표 보드 ===== */
const BK_SLOT_H=42, BK_MATCH_H=BK_SLOT_H*2+4+10, BK_PITCH0=BK_MATCH_H+26; // 매치높이 98, 1라운드 세로간격
function treeCenters(rounds){
  const centers=[];
  for(let r=0;r<rounds.length;r++){ centers[r]=[];
    for(let j=0;j<rounds[r].length;j++){ centers[r][j]= r===0 ? (j*BK_PITCH0+BK_MATCH_H/2) : (centers[r-1][2*j]+centers[r-1][2*j+1])/2; } }
  return { centers, totalH: (rounds[0]?.length||1)*BK_PITCH0 };
}
function ElimBoard({ g, nameOf, admin, onPick, teamMode, onOpenTeam, qualifier=false }){
  const ev=evalGraph(g);
  const rlabel=(len)=>{ const names={1:"결승",2:"4강",4:"8강",8:"16강",16:"32강"}; return names[len]||`${len*2}강`; };
  const { centers, totalH }=treeCenters(g.rounds);
  return (<div className="bk-scroll"><div className="bk-tree">
    {g.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
      <div className="bk-col-h">{g.kind==="double"?("WB R"+(ri+1)):rlabel(r.length)}</div>
      <div className="bk-col-body" style={{height:totalH}}>
        {r.map((m,j)=>(<div className="bk-mpos" key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>
          <MatchCard m={m} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam}/>
        </div>))}
      </div>
    </div>))}
  </div>
  {g.kind==="double"&&<div className="bk-lb"><div className="bk-lb-h">패자부활전 (Lower Bracket)</div><div className="bk-cols">
    {g.lb.map((r,ri)=>(<div className="bk-col" key={ri}><div className="bk-col-h">LB R{ri+1}</div>
      {r.map(m=><MatchCard key={m.id} m={m} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam}/>)}
    </div>))}
    {!qualifier&&<div className="bk-col"><div className="bk-col-h gf">그랜드 파이널</div><MatchCard m={g.gf} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam}/></div>}
    {!qualifier&&g.reset&&g.gf.winner==="b"&&<div className="bk-col"><div className="bk-col-h gf">최종 결승 (리셋)</div><MatchCard m={g.reset} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam}/></div>}
  </div></div>}
  </div>);
}

function formatBracketSubmissionTime(value) {
  return value
    ? new Date(value).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

function SubmissionStatusPanel({ model, busy, error, expanded, onToggle, onRetry }) {
  const renderMember = member => (
    <div className="bk-submission-member" key={member.registrationId}>
      <span className="bk-submission-member-name">{member.name}</span>
      <span className={`bk-submission-state${member.hasSubmission ? " submitted" : ""}`}>
        {member.hasSubmission
          ? `제출 완료${formatBracketSubmissionTime(member.latestSubmittedAt) ? ` · ${formatBracketSubmissionTime(member.latestSubmittedAt)}` : ""}`
          : "미제출"}
      </span>
    </div>
  );

  return (
    <section className="bk-submission" aria-label="파티 제출 현황">
      <button
        type="button"
        className="bk-submission-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={busy && model.total === 0}
      >
        <span className="bk-submission-title">파티 제출 현황</span>
        <span className="bk-submission-summary">
          {busy && model.total === 0 ? "불러오는 중…" : `${model.submitted} / ${model.total} 제출`}
          <span className="bk-submission-chevron" aria-hidden="true">{expanded ? "▲" : "▼"}</span>
        </span>
      </button>
      {error && <div className="bk-submission-error">
        <span>{error}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>다시 불러오기</button>
      </div>}
      {expanded && !busy && !error && model.total > 0 && (
        <div className="bk-submission-detail">
          {model.mode === "team" ? (
            <div className="bk-submission-groups">
              {model.teams.map(team => (
                <div className="bk-submission-group" key={team.entryId}>
                  <div className="bk-submission-group-head">
                    <strong>{team.teamName}</strong>
                    <span>{team.submitted} / {team.total}</span>
                  </div>
                  <div className="bk-submission-members">{team.members.map(renderMember)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bk-submission-members bk-submission-individuals">
              {model.participants.map(renderMember)}
            </div>
          )}
        </div>
      )}
      {expanded && !busy && !error && model.total === 0 && (
        <div className="bk-submission-empty">확정된 Registration 연결이 없어 제출 현황을 표시할 수 없습니다.</div>
      )}
    </section>
  );
}

function BracketBoard({ b, admin, flash, onApply, deleting=false, readOnly=false, refreshNormalized, onNormalizedReverted }){
  const nameOf=(pid)=>{ const p=(b.participants||[]).find(x=>x.id===pid); return p?p.name:pid; };
  const teamMode=b.mode==="team";
  const locked=!!b.applied||deleting||readOnly;
  const [matchMutationBusy,setMatchMutationBusy]=useState(false);
  const matchMutationBusyRef=useRef(false);
  const editAdmin=admin&&!locked&&!matchMutationBusy;
  const [series,setSeries]=useState(null);
  const [submissionStatuses,setSubmissionStatuses]=useState([]);
  const [submissionStatusError,setSubmissionStatusError]=useState("");
  const [submissionStatusBusy,setSubmissionStatusBusy]=useState(Boolean(b.eventId));
  const [submissionStatusExpanded,setSubmissionStatusExpanded]=useState(false);
  const [submissionStatusReloadKey,setSubmissionStatusReloadKey]=useState(0);
  const [championshipRefreshKey,setChampionshipRefreshKey]=useState(0);
  const [championshipEvent,setChampionshipEvent]=useState(null);
  const [hallOfFameBusy,setHallOfFameBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    if(!b.eventId){ setChampionshipEvent(null); return undefined; }
    getEvent(b.eventId)
      .then(event=>{ if(!cancelled) setChampionshipEvent(event||null); })
      .catch(()=>{ if(!cancelled) setChampionshipEvent(null); });
    return ()=>{ cancelled=true; };
  },[b.eventId]);
  useEffect(()=>{
    if(!b.eventId){
      setSubmissionStatuses([]);
      setSubmissionStatusError("");
      setSubmissionStatusBusy(false);
      return;
    }
    let cancelled=false;
    setSubmissionStatusBusy(true);
    setSubmissionStatusError("");
    const loadStatuses=()=>listEventRegistrationSubmissionStatuses(b.eventId)
      .then(rows=>{ if(!cancelled){ setSubmissionStatuses(rows||[]); setSubmissionStatusError(""); } })
      .catch(error=>{ if(!cancelled) setSubmissionStatusError(error?.message||"파티 제출 현황을 불러오지 못했습니다."); })
      .finally(()=>{ if(!cancelled) setSubmissionStatusBusy(false); });
    loadStatuses();
    const interval=setInterval(()=>{ if(!document.hidden) loadStatuses(); },10000);
    const onFocus=()=>loadStatuses();
    window.addEventListener("focus",onFocus);
    return ()=>{ cancelled=true; clearInterval(interval); window.removeEventListener("focus",onFocus); };
  },[b.eventId,submissionStatusReloadKey]);
  const submissionStatusModel=buildBracketSubmissionStatusModel(b,submissionStatuses);
  const pickNormalized=async(matchId,side)=>{
    if(readOnly||locked||matchMutationBusyRef.current)return;
    const match=collectGraphMatches(b.graph).find(row=>row.id===matchId);
    if(!match||!b.eventId||!b.projection?.runtimeId)return;
    const current=evalGraph(b.graph);
    const entryId=side==="a"?current.sp(match.a):current.sp(match.b);
    if(!entryId||entryId===BYE)return;
    const winnerEntryId=match.winner===side?null:entryId;
    matchMutationBusyRef.current=true;
    setMatchMutationBusy(true);
    try{
      if (!b.double && !teamMode) {
        await setNormalizedSingleBracketWinner({
          runtimeId:b.projection.runtimeId,
          eventId:b.eventId,
          sourceNodeKey:matchId,
          winnerEntryId,
        });
      } else {
        await syncNormalizedBracketMatches(b.eventId, withPick(b, matchId, side));
      }
      await refreshNormalized?.();
      setChampionshipRefreshKey(value=>value+1);
      flash(winnerEntryId?"승자를 저장했습니다":"승자를 취소했습니다");
    }catch(error){
      await refreshNormalized?.();
      setChampionshipRefreshKey(value=>value+1);
      flash(`normalized 승자 저장 실패: ${error?.message||"알 수 없는 오류"}`);
    }finally{
      matchMutationBusyRef.current=false;
      setMatchMutationBusy(false);
    }
  };
  const pick=(matchId,side)=>{
    if(readOnly||locked)return;
    void pickNormalized(matchId,side);
  };
  const openTeam=(m,pa,pb)=>{ if(readOnly||locked)return; const A=(b.participants||[]).find(p=>p.id===pa),B=(b.participants||[]).find(p=>p.id===pb); if(!A||!B)return; setSeries({m,A,B}); };
  const saveSeries=async(sObj,winnerSide)=>{
    if(readOnly||locked)return;
    if(matchMutationBusyRef.current)return;
    matchMutationBusyRef.current=true;
    setMatchMutationBusy(true);
    try{
      await syncNormalizedBracketMatches(b.eventId,withSeries(b,series.m.id,sObj,winnerSide));
      await refreshNormalized?.();
      setSeries(null);
      flash("팀전 결과를 저장했습니다");
    }catch(error){
      await refreshNormalized?.();
      flash(`팀전 결과 저장 실패: ${error?.message||"알 수 없는 오류"}`);
    }finally{
      matchMutationBusyRef.current=false;
      setMatchMutationBusy(false);
    }
  };
  const res = b.format==="group" ? (b.knockout?elimResult(b.knockout):null) : elimResult(b.graph);
  const undoApplied=async()=>{
    if(readOnly)return;
    if(!b.applied)return;
    if(!confirm("이 대진표의 기록 반영을 취소할까요? 회차·랭킹·시즌 성적과 연결된 Event 기록 상태가 함께 원복됩니다."))return;
    let previousHallOfFame=null;
    let previousAwardRows=null;
    let previousResultRows=null;
    try{
      const hallOfFameCleanup=await removeChampionshipHallOfFameEntry(b.eventId);
      if(hallOfFameCleanup.removed)previousHallOfFame=hallOfFameCleanup;
      const awardCleanup=await deleteEventBracketRankingAwards(b.eventId,b);
      if(!awardCleanup.skipped)previousAwardRows=awardCleanup.previousRows;
      const resultCleanup=await deleteEventBracketResults(b.eventId,b);
      if(!resultCleanup.skipped)previousResultRows=resultCleanup.previousRows;
      await revertEventRecordApplication(b.eventId,[]);
      await onNormalizedReverted?.();
      flash("기록 반영을 취소했습니다");
    }catch(error){
      try{
        if(previousResultRows!==null) await restoreEventBracketResults(b.eventId,previousResultRows);
        if(previousAwardRows!==null) await restoreEventBracketRankingAwards(b.eventId,previousAwardRows);
        if(previousHallOfFame?.hallOfFameId) await ensureChampionshipHallOfFameEntry(b.eventId,{hallOfFameId:previousHallOfFame.hallOfFameId});
      }catch(restoreError){
        flash(`normalized 기록 원복과 보상 복구에 실패했습니다: ${error?.message||"알 수 없는 오류"} / ${restoreError?.message||"알 수 없는 오류"}`);
        return;
      }
      flash(`normalized 기록 반영 취소를 중단하고 이전 상태로 복구했습니다: ${error?.message||"알 수 없는 오류"}`);
    }
  };
  return (<div className="bk-board swap">
    {readOnly&&<p className="bk-hint">과거 완료 대진표입니다. 조회만 가능하며 수정·삭제·기록 반영은 지원하지 않습니다.</p>}
    {b.eventId&&<SubmissionStatusPanel
      model={submissionStatusModel}
      busy={submissionStatusBusy}
      error={submissionStatusError}
      expanded={submissionStatusExpanded}
      onToggle={()=>setSubmissionStatusExpanded(value=>!value)}
      onRetry={()=>setSubmissionStatusReloadKey(value=>value+1)}
    />}
    {admin&&championshipEvent?.championship_phase==="qualifier"&&<ChampionsBracketControls eventId={b.eventId} placement="qualifier" refreshKey={championshipRefreshKey} onChanged={()=>void refreshNormalized?.()}/>}
    {b.format==="elim"&&<ElimBoard g={b.graph} nameOf={nameOf} admin={editAdmin} onPick={pick} teamMode={teamMode} onOpenTeam={openTeam} qualifier={championshipEvent?.championship_phase==="qualifier"}/>}
    {res&&res.done&&championshipEvent?.championship_phase!=="qualifier"&&<div className="bk-champ-banner">
      <span className="bk-cb-k"><Icon n="trophy" size={15}/> 우승</span><span className="bk-cb-n">{nameOf(res.champ)}</span>{res.ru&&<span className="bk-cb-ru">준우승 {nameOf(res.ru)}</span>}
      <div className="bk-cb-actions">
        <button className="btn btn-ghost btn-sm" onClick={()=>downloadChampionPng(b,res,nameOf)}><Icon n="image" size={15}/>우승 이미지</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>downloadBracketPng(b,nameOf)}><Icon n="image" size={15}/>대진표 이미지</button>
        {admin&&!readOnly&&!b.applied&&championshipEvent?.championship_phase!=="qualifier"&&<button className="btn btn-gold btn-sm" onClick={()=>onApply(b,res)}>기록에 반영 →</button>}
        {b.applied&&<><span className="bk-applied"><Icon n="check" size={14}/> 기록 반영됨</span>{!readOnly&&admin&&championshipEvent?.event_type==="champions"&&championshipEvent?.championship_phase==="final"&&<button className="btn btn-ghost btn-sm" disabled={hallOfFameBusy} onClick={async()=>{setHallOfFameBusy(true);try{await ensureChampionshipHallOfFameEntry(b.eventId);flash("명예의 전당 등록 ✓");}catch(error){flash(`명예의 전당 등록 실패: ${error?.message||"알 수 없는 오류"}`);}finally{setHallOfFameBusy(false);}}}>{hallOfFameBusy?"명예의 전당 등록 중…":"명예의 전당 재시도"}</button>}{!readOnly&&admin&&<button className="btn btn-ghost btn-sm" onClick={undoApplied}>반영 취소</button>}</>}
      </div>
    </div>}
    {series&&<TeamMatchModal teamA={series.A} teamB={series.B} init={series.m.series} onClose={()=>setSeries(null)} onSave={saveSeries}/>}
  </div>);
}

/* ===== 기록 반영 모달 ===== */
function BracketApply({ b, res, data, onClose, flash, refresh, onNormalizedApplied }){
  const partOf=(pid)=>(b.participants||[]).find(x=>x.id===pid);
  const nameOf=(pid)=>{ const p=partOf(pid); return p?p.name:pid; };
  const team=b.mode==="team";
  const tours=data.tournaments||[]; const seasons=data.seasons||[];
  const [tkey,setTkey]=useState(tours[0]?.key||"");
  const [date,setDate]=useState(new Date().toISOString().slice(0,7).replace("-","."));
  const [roundStr,setRoundStr]=useState("");
  const [season,setSeason]=useState(seasons[seasons.length-1]?.name||"");
  const [champ,setChamp]=useState(false);
  const [rule,setRule]=useState("");
  const [bumpRank,setBumpRank]=useState(true);
  const [bumpSeason,setBumpSeason]=useState(true);
  const [rankKey,setRankKey]=useState((data.rankings||[])[0]?.key||"");
  const [ptWin,setPtWin]=useState(team?"30":"60"); const [ptRu,setPtRu]=useState(team?"20":"40"); const [ptSf,setPtSf]=useState(team?"0":"20");
  const [override,setOverride]=useState({});
  const linked=Boolean(b.eventId);
  const normalizedRuntime=b.projection?.source==="normalized";
  const [linkedContext,setLinkedContext]=useState(null);
  const [linkedContextError,setLinkedContextError]=useState("");
  const [linkedContextBusy,setLinkedContextBusy]=useState(linked);
  const identityReviewRequired=linked&&!team&&(b.participants||[]).some(participant=>
    participant?.identityReviewRequired||
    participant?.identityStatus==="ambiguous"||
    participant?.identityStatus==="new"||
    !participant?.playerId||
    !participant?.registrationId||
    !participant?.entryId
  );
  const [identityPreview,setIdentityPreview]=useState([]);
  const [identityPreviewError,setIdentityPreviewError]=useState("");
  const [identityPreviewBusy,setIdentityPreviewBusy]=useState(identityReviewRequired);
  const qualifierEvent=linkedContext?.event?.championship_phase==="qualifier";
  useEffect(()=>{
    if(!b.eventId) return;
    let cancelled=false;
    setLinkedContextBusy(true);
    setLinkedContextError("");
    getEventRecordContext(b.eventId)
      .then(context=>{
        if(cancelled) return;
        setLinkedContext(context);
        setSeason(context.season.name);
        setChamp(context.event.event_type==="champions");
        if(context.event.event_type==="champions" && Number.isInteger(Number(context.event.round_number)) && Number(context.event.round_number)>0){
          setRoundStr(String(context.event.round_number));
        }
        const pointPolicy=team
          ? getTeamPlacementPointPolicy(context.event)
          : getIndividualPlacementPointPolicy(context.event);
        setBumpRank(pointPolicy.enabled);
        setBumpSeason(pointPolicy.enabled&&context.event.event_type!=="champions");
        if(pointPolicy.points){
          setPtWin(String(pointPolicy.points.win));
          setPtRu(String(pointPolicy.points.ru));
          setPtSf(String(pointPolicy.points.sf));
        }
        const preferredKey=pointPolicy.division==="rookie"
          ? "rookie"
          : pointPolicy.division==="light"
            ? "pylite"
            : pointPolicy.division==="master"
              ? "master"
              : "pycup";
        if(tours.some(t=>t.key===preferredKey)) setTkey(preferredKey);
      })
      .catch(error=>{ if(!cancelled) setLinkedContextError(error?.message||"연결 대회의 시즌을 확인하지 못했습니다."); })
      .finally(()=>{ if(!cancelled) setLinkedContextBusy(false); });
    return ()=>{ cancelled=true; };
  },[b.eventId]);
  useEffect(()=>{
    if(!identityReviewRequired){
      setIdentityPreview([]);
      setIdentityPreviewError("");
      setIdentityPreviewBusy(false);
      return;
    }
    let cancelled=false;
    setIdentityPreviewBusy(true);
    setIdentityPreviewError("");

    inspectEventParticipantIdentities(b.eventId,b.participants||[])
      .then(rows=>{
        if(!cancelled) setIdentityPreview(rows||[]);
      })
      .catch(error=>{
        if(!cancelled) setIdentityPreviewError(error?.message||"참가자 Player 상태를 확인하지 못했습니다.");
      })
      .finally(()=>{
        if(!cancelled) setIdentityPreviewBusy(false);
      });

    return ()=>{ cancelled=true; };
  },[b.eventId,b.participants,identityReviewRequired]);

  const pN=(s)=>{ const v=parseFloat(s); return isNaN(v)?0:v; };
  const ptWinN=pN(ptWin), ptRuN=pN(ptRu), ptSfN=pN(ptSf);
  const r1=(n)=>Math.round(n*10)/10;
  const setPt=(fn)=>(e)=>fn(e.target.value.replace(/[^0-9.]/g,""));
  const memListOf=(pid)=>partOf(pid)?.members||[];
  const curT=tours.find(x=>x.key===tkey);
  const [preview,setPreview]=useState(null);
  const manualExcluded=!!curT&&(curT.key==="rookie"||/루키/.test(curT.label||""));
  const linkedPointPolicy=linkedContext
    ? (team
      ? getTeamPlacementPointPolicy(linkedContext.event)
      : getIndividualPlacementPointPolicy(linkedContext.event))
    : null;
  const excluded=linked ? linkedPointPolicy?.enabled===false : manualExcluded;
  const recordSeason=linked ? (linkedContext?.season?.name||"") : season;
  const autoNext=String((curT?.rounds?.reduce((mx,r)=>Math.max(mx,parseInt(r.round)||0),0)||0)+1);
  const placements=[]; if(res.champ)placements.push({pid:res.champ,pts:ptWinN,label:"우승"});
  if(res.ru)placements.push({pid:res.ru,pts:ptRuN,label:"준우승"});
  if(!team)res.sf.forEach(pid=>placements.push({pid,pts:ptSfN,label:"4강"}));
  const alloc=[]; if(team){ placements.forEach(pl=>{ const p=partOf(pl.pid); const mem=p?.members||[]; mem.forEach(m=>alloc.push({key:pl.pid+"|"+m,team:p?.name,member:m,label:pl.label,base:pl.pts})); }); }
  const allocVal=(a)=>{ const o=override[a.key]; return (o===undefined||o==="")?a.base:pN(o); };
  const rankEra=(data.rankings||[]).find(r=>r.key===rankKey);
  const rankRows=rankEra?.rows||[];
  const isNew=(name)=>!rankRows.some(r=>r.name===name);
  const showBadge=bumpRank&&!excluded&&!!rankKey;
  const badgeFor=(name)=>showBadge?<span className={"bk-exist "+(isNew(name)?"new":"old")}>{isNew(name)?"신규":"기존"}</span>:null;
  const computeDeltas=()=>{ const deltas={};
    const add=(name,d)=>{ if(!name)return; const c=deltas[name]||{win:0,ru:0,top4:0,points:0}; deltas[name]={win:c.win+(d.win||0),ru:c.ru+(d.ru||0),top4:c.top4+(d.top4||0),points:c.points+(d.points||0)}; };
    if(team){ alloc.forEach(a=>add(a.member,{points:allocVal(a)})); }
    else { add(nameOf(res.champ),{win:1,points:ptWinN}); if(res.ru)add(nameOf(res.ru),{ru:1,points:ptRuN}); res.sf.map(nameOf).forEach(n=>add(n,{top4:1,points:ptSfN})); }
    return deltas; };
  const buildResult=()=>{
    const roundNum=roundStr.trim()||autoNext;
    const deltas=computeDeltas();
    const willRank=bumpRank&&rankKey&&!excluded, willSeason=bumpSeason&&recordSeason&&!champ&&!excluded;
    return { deltas, roundNum, willRank, willSeason };
  };
  const prepare=()=>{
    if(qualifierEvent){alert("qualifier는 Placement Result/Award를 만들지 않습니다. Champions 운영에서 필요한 진출자를 확정한 뒤 qualifier를 종료하세요.");return;}
    if(!curT){alert("회차를 추가할 대회를 선택하세요.");return;}
    if(linkedContextBusy){alert("연결 대회의 시즌 정보를 불러오는 중입니다.");return;}
    if(linkedContextError){alert(linkedContextError);return;}
    if(!recordSeason){alert("기록을 반영할 시즌을 선택하세요.");return;}
    setPreview(buildResult());
  };
  const commit=async()=>{
    if(!preview) return;
    let previousResultRows=null;
    let previousAwardRows=null;
    let finalSubmissionFreeze=null;
    try{
      const participants=b.participants||[];
      const actualParticipants=team ? participants.filter(p=>Array.isArray(p?.members)) : participants;
      if(!actualParticipants.length || actualParticipants.some(p=>!p.entryId)){
        throw new Error("normalized Event runtime에 완전한 Entry identity가 없어 기록을 반영할 수 없습니다.");
      }
      if(team) await validateEventTeamEntries(b.eventId,actualParticipants);
      else await validateEventParticipantEntries(b.eventId,participants);
      const resultSync=await syncEventBracketResults(b.eventId,b,res);
      if(!resultSync.skipped) previousResultRows=resultSync.previousRows;
      const awardSync=await syncEventBracketRankingAwards(b.eventId,b);
      previousAwardRows=awardSync.previousRows;
      finalSubmissionFreeze=(await freezeEventFinalSubmissions(b.eventId)).snapshot;
    }catch(error){
      try{
        if(previousAwardRows!==null) await restoreEventBracketRankingAwards(b.eventId,previousAwardRows);
        if(previousResultRows!==null) await restoreEventBracketResults(b.eventId,previousResultRows);
      }catch(restoreError){
        flash(`기록 반영 사전 검증과 normalized 복구에 실패했습니다: ${error?.message||"알 수 없는 오류"} / ${restoreError?.message||"알 수 없는 오류"}`);
        return;
      }
      flash(`기록 반영 사전 검증에 실패했습니다: ${error?.message||"알 수 없는 오류"}`);
      return;
    }

    try{
        const completionOptions=buildChampionshipRecordApplyCompletionOptions({
          event: linkedContext?.event,
          roundNumber: preview.roundNum,
          revealOfficialRosters: true,
        });
        const completed=await completeApplicationEvent(b.eventId,completionOptions);
        await onNormalizedApplied?.(completed);
        try{
          await ensureChampionshipHallOfFameEntry(b.eventId);
        }catch(error){
          flash(`기록 반영은 완료됐지만 Hall of Fame 등록에 실패했습니다. Champions 운영에서 재시도해 주세요: ${error?.message||"알 수 없는 오류"}`);
          onClose();
          return;
        }
        flash("기록에 반영했습니다");
        onClose();
      }catch(error){
        let currentEvent=null;
        try{ currentEvent=await getEvent(b.eventId); }catch{}
        if(isRecordApplyCompletionConfirmed(currentEvent,{requireTeamReveal:true})){
          await onNormalizedApplied?.(currentEvent);
          flash("Event 완료 응답은 실패했지만 재조회 결과 기록 반영이 완료되었습니다.");
          onClose();
          return;
        }
        try{
          if(finalSubmissionFreeze!==null&&isFinalSubmissionRestoreAllowed(currentEvent)){
            await restoreEventFinalSubmissions(b.eventId,finalSubmissionFreeze);
          }
          if(previousAwardRows!==null) await restoreEventBracketRankingAwards(b.eventId,previousAwardRows);
          if(previousResultRows!==null) await restoreEventBracketResults(b.eventId,previousResultRows);
          await refresh?.();
          flash(`normalized 기록 반영 실패로 이전 상태를 복구했습니다: ${error?.message||"알 수 없는 오류"}`);
        }catch(restoreError){
          flash(`normalized 기록 반영과 보상 복구에 실패했습니다: ${error?.message||"알 수 없는 오류"} / ${restoreError?.message||"알 수 없는 오류"}`);
        }
      }
  };
  if(preview){
    const changes=Object.entries(preview.deltas).map(([name,d])=>{ const cur=rankRows.find(r=>r.name===name); return {name,isNew:!cur,curPts:cur?.points||0,d}; });
    return (<Modal title="반영 전 확인" hint={excluded
      ? "아래 내용으로 공식 기록에 반영합니다. Champions 성적은 랭킹에 반영되지 않습니다."
      : "아래 내용으로 기록에 반영합니다. 포인트 변동을 확인한 뒤 진행하세요."} onClose={()=>setPreview(null)}>
      <div className="swap" key="pre">
      <div className="bk-applybox">
        <div className="bk-ab-meta">{team?"팀전":"개인전"}{champ?" 챔피언스 시리즈":""}</div>
        <div>{curT.label} <b>{preview.roundNum}회</b>{recordSeason?`, ${recordSeason}`:""}{rule.trim()?`, ${rule.trim()}`:""}</div>
        <div><Icon n="trophy" size={14}/> <b>{nameOf(res.champ)}</b>{res.ru?<>, 준우승 {nameOf(res.ru)}</>:null}{res.sf.length?<>, 4강 {res.sf.map(nameOf).join(", ")}</>:null}</div>
      </div>
      {linked&&!team&&(
        !!identityPreviewError ||
        identityPreview.some(row=>row.status!=="existing")
      )&&
  <div className="field">
    <label>참가자 Player 확인</label>
    {identityPreviewBusy
      ? <div className="bk-hint">Player 정보를 확인하는 중입니다.</div>
      : identityPreviewError
        ? <div className="bk-hint" style={{color:"var(--loss)"}}>{identityPreviewError}</div>
        : <div className="bk-chg">
            {identityPreview.map(row=>(
              <div className="bk-chg-row" key={row.participantId}>
                <span className={"bk-exist "+(row.status==="existing"?"old":"new")}>
                  {row.status==="existing"
                    ? "기존 Player"
                    : row.status==="new"
                      ? "신규 Player"
                      : "확인 필요"}
                </span>
                <b>{row.name}</b>
                <span className="bk-hint" style={{marginLeft:"auto"}}>
                  {row.status==="existing"
                    ? "기존 identity 사용"
                    : row.status==="new"
                      ? "기록 반영 시 Player 생성"
                      : "동일 이름 Player가 여러 명 존재"}
                  {row.willCreateRegistration ? " · 참가 등록 생성 예정" : ""}
                </span>
              </div>
            ))}
          </div>
    }
  </div>
}
      {preview.willRank ? <div className="field"><label>누적 랭킹 「{rankEra?.label}」 포인트 변동</label>
        <div className="bk-chg">{changes.map(c=><div className="bk-chg-row" key={c.name}>
          <span className={"bk-exist "+(c.isNew?"new":"old")}>{c.isNew?"랭킹 신규":"랭킹 기존"}</span><b>{c.name}</b>
          <span className="bk-chg-pts">{c.curPts}<Icon n="arrow" size={12}/>{r1(c.curPts+c.d.points)}</span>
          {c.d.points?<span className="bk-chg-d">+{r1(c.d.points)}</span>:null}
          {(c.d.win||c.d.ru||c.d.top4)?<span className="bk-chg-cnt">{c.d.win?`승+${c.d.win} `:""}{c.d.ru?`준+${c.d.ru} `:""}{c.d.top4?`4강+${c.d.top4}`:""}</span>:null}
        </div>)}</div>
      </div> : <div className="bk-hint">{excluded?`${curT.label}은(는) 누적 랭킹과 시즌별 성적에 반영되지 않고 회차 기록에만 추가됩니다.`:"누적 랭킹 반영이 꺼져 있어 회차 기록에만 추가됩니다."}</div>}
      {preview.willSeason&&<div className="bk-hint">시즌별 성적 「{recordSeason}」에도 동일한 점수와 성적이 반영됩니다.</div>}
      <div className="modal-actions">
  <button className="btn btn-ghost" onClick={()=>setPreview(null)}><Icon n="back" size={14}/>뒤로</button>
  <button
    className="btn btn-primary"
    onClick={commit}
    disabled={
      linked&&!team&&(
        identityPreviewBusy||
        !!identityPreviewError||
        identityPreview.some(row=>row.status==="ambiguous")
      )
    }
  >
    이대로 반영
  </button>
</div>
      </div>
    </Modal>);
  }
  return (<Modal
    title="기록에 반영"
    hint={linked
      ? "연결된 Event의 대회 정보와 정책을 기준으로 기록을 반영합니다."
      : "수동 대회 정보를 설정해 기록에 반영합니다."}
    onClose={onClose}
  >
    <div className="swap" key="form">
      <div className="bk-applybox">
        <div className="bk-ab-meta">
          {team?"팀전":"개인전"}
          {linked&&linkedContext?.event?.division
            ? ` · ${linkedContext.event.division==="master"?"Master":linkedContext.event.division==="rookie"?"Rookie":linkedContext.event.division}`
            : ""}
        </div>
        <div><Icon n="trophy" size={14}/> 우승 <b>{nameOf(res.champ)}</b></div>
        {res.ru&&<div><Icon n="medal" size={14}/> 준우승 <b>{nameOf(res.ru)}</b></div>}
        {res.sf.length>0&&<div><Icon n="medal" size={14}/> 4강 <b>{res.sf.map(nameOf).join(", ")}</b></div>}
      </div>

      {linked ? <>
        {linkedContextBusy&&
          <div className="bk-hint">연결된 대회 정보를 불러오는 중입니다.</div>
        }

        {linkedContextError&&
          <div className="bk-hint" style={{color:"var(--loss)"}}>{linkedContextError}</div>
        }

        {!linkedContextBusy&&!linkedContextError&&<>
          <div className="bk-grow2">
            <div className="field">
              <label>기록 분류</label>
              <div className="bk-hint">
                {curT?.label||"분류 확인 필요"} · 연결 Event 기준
              </div>
            </div>

            <div className="field">
              <label>시즌</label>
              <div className="bk-hint">
                {recordSeason||"시즌 정보 없음"} · 연결 Event 기준
              </div>
            </div>
          </div>

          <div className="bk-grow2">
            <div className="field">
              <label>회차 번호</label>
              <input
                value={roundStr}
                onChange={e=>setRoundStr(e.target.value)}
                placeholder={autoNext}
              />
            </div>

            <div className="field">
              <label>날짜 표기</label>
              <input
                value={date}
                onChange={e=>setDate(e.target.value)}
                placeholder="2026.09"
              />
            </div>
          </div>

          <div className="field">
            <label>반영 내용</label>
            <div className="bk-applybox">
              <div><Icon n="check" size={13}/> {curT?.label||"회차"} 기록</div>
              <div>
                {excluded
                  ? "— 누적 랭킹 미반영"
                  : `누적 랭킹${rankEra?.label?` · ${rankEra.label}`:""}`}
              </div>
              <div>
                {excluded||champ
                  ? "— 시즌별 성적 미반영"
                  : `시즌별 성적 · ${recordSeason}`}
              </div>
            </div>
          </div>

          {!excluded&&
            <div className="field">
              <label>등수별 점수</label>
              <div className="bk-hint">
                {team
                  ? `우승 ${ptWinN} · 준우승 ${ptRuN}`
                  : `우승 ${ptWinN} · 준우승 ${ptRuN} · 4강 ${ptSfN}`}
              </div>
            </div>
          }
        </>}
      </> : <>
        <div className="field">
          <label>형식</label>
          <div className="ed-seg">
            <button type="button" className={!champ?"on":""} onClick={()=>setChamp(false)}>일반 (파이컵)</button>
            <button type="button" className={champ?"on":""} onClick={()=>setChamp(true)}>챔피언스 시리즈</button>
          </div>
        </div>

        <div className="bk-grow2">
          <div className="field">
            <label>추가할 대회(회차 묶음)</label>
            <Dropdown
              value={tkey}
              onChange={setTkey}
              placeholder="대회 선택"
              options={tours.map(t=>({value:t.key,label:t.label}))}
            />
          </div>

          <div className="field">
            <label>시즌</label>
            <Dropdown
              value={season}
              onChange={setSeason}
              options={seasons.map(s=>({value:s.name,label:s.name}))}
            />
          </div>
        </div>

        <div className="bk-grow2">
          <div className="field">
            <label>회차 번호</label>
            <input value={roundStr} onChange={e=>setRoundStr(e.target.value)}/>
          </div>

          <div className="field">
            <label>날짜 표기</label>
            <input value={date} onChange={e=>setDate(e.target.value)} placeholder="2026.07"/>
          </div>
        </div>

        <div className="field">
          <label>대회 룰 (선택)</label>
          <input value={rule} onChange={e=>setRule(e.target.value)} placeholder="예: 모노타입 / 랜덤 배틀 / 6세대 63"/>
        </div>

        <div className="field">
          <label>등수별 점수{team?" (팀원별 고정 점수)":""}</label>
          <div className="bk-pts">
            <div className="bk-pt"><span>우승</span><input value={ptWin} onChange={setPt(setPtWin)}/></div>
            <div className="bk-pt"><span>준우승</span><input value={ptRu} onChange={setPt(setPtRu)}/></div>
            {!team&&<div className="bk-pt"><span>4강</span><input value={ptSf} onChange={setPt(setPtSf)}/></div>}
          </div>
        </div>

        {team&&alloc.length>0&&
          <div className="field">
            <label>팀원별 점수 배분 (개별 수정 가능)</label>
            <div className="bk-alloc">
              {alloc.map(a=>
                <div className="bk-alloc-row" key={a.key}>
                  <span className={"bk-alloc-tag "+(a.label==="우승"?"w":a.label==="준우승"?"r":"s")}>{a.label}</span>
                  <b>{a.member}</b>
                  {badgeFor(a.member)}
                  <span className="bk-alloc-team">{a.team}</span>
                  <input
                    value={override[a.key]??""}
                    placeholder={String(a.base)}
                    onChange={e=>setOverride({...override,[a.key]:e.target.value.replace(/[^0-9.]/g,"")})}
                  />
                </div>
              )}
            </div>
          </div>
        }

        <label className="bk-check">
          <input
            type="checkbox"
            checked={bumpRank&&!excluded}
            onChange={e=>setBumpRank(e.target.checked)}
            disabled={excluded}
          />
          <span>
            누적 랭킹 반영 {excluded?"— 이 대회는 제외":(team?"(점수 배분)":"(승/준/4강 + 점수)")}
          </span>
        </label>

        {bumpRank&&!excluded&&
          <div className="field">
            <label>반영할 누적 랭킹</label>
            <Dropdown
              value={rankKey}
              onChange={setRankKey}
              placeholder="랭킹 선택"
              options={(data.rankings||[]).map(r=>({value:r.key,label:r.label}))}
            />
          </div>
        }

        <label className="bk-check">
          <input
            type="checkbox"
            checked={bumpSeason&&!champ&&!excluded}
            onChange={e=>setBumpSeason(e.target.checked)}
            disabled={!recordSeason||champ||excluded}
          />
          <span>
            시즌별 성적 반영 {excluded?"— 이 대회는 제외":champ?"— 챔피언스 시리즈는 제외":(recordSeason?`(${recordSeason})`:"— 시즌을 먼저 선택")}
          </span>
        </label>
      </>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={prepare} disabled={linked&&linkedContextBusy}>
          반영하기 →
        </button>
      </div>
    </div>
  </Modal>);
}

/* ===== 추첨 애니메이션 ===== */
function BracketDraw({ b, onDone }){
  const nameOf=(pid)=>{ const p=(b.participants||[]).find(x=>x.id===pid); return p?p.name:pid; };
  const allNames=(b.participants||[]).map(p=>p.name);
  const rlabel=(len)=>{ const names={1:"결승",2:"4강",4:"8강",8:"16강",16:"32강"}; return names[len]||`${len*2}강`; };
  const group=b.format==="group";
  // 채울 슬롯 순서(참가자만) 및 각 슬롯의 순번 계산
  const order={}; let k=0;
  if(group){ b.groups.forEach((g,gi)=>g.members.forEach((mem,mi)=>{ order["g"+gi+"_"+mi]=k++; })); }
  else { b.graph.rounds[0].forEach((m,mi)=>["a","b"].forEach((side,si)=>{ const s=m[side]; if(s.pid) order["m"+mi+"_"+si]=k++; })); }
  const total=k;
  const [n,setN]=useState(0); const [roll,setRoll]=useState("");
  useEffect(()=>{
    if(n>=total){ const t=setTimeout(onDone,950); return ()=>clearTimeout(t); }
    let ticks=0; const iv=setInterval(()=>{ setRoll(allNames[Math.floor(Math.random()*allNames.length)]||""); if(++ticks>=9){ clearInterval(iv); const t=setTimeout(()=>setN(x=>x+1),140); return ()=>clearTimeout(t); } },70);
    return ()=>clearInterval(iv);
  },[n]); // eslint-disable-line
  const slotFor=(key,pid,bye)=>{
    if(bye) return <div className="bk-slot bye">부전승</div>;
    const ord=order[key];
    if(ord<n) return <div className={"bk-slot dset"+(ord===n-1?" pop":"")}>{nameOf(pid)}</div>;
    if(ord===n) return <div className="bk-slot drolling">{roll||"…"}</div>;
    return <div className="bk-slot dwait"><i/></div>;
  };
  const done=n>=total;
  return (<div className="bk-drawwrap swap">
    <div className="bk-draw-h">{done?"대진 확정":"대진 추첨 중…"} <span className="bk-draw-cnt">{Math.min(n,total)} / {total}</span></div>
    {group ? (
      <div className="bk-groups">{b.groups.map((g,gi)=>(
        <div className="bk-group" key={g.id}><div className="bk-group-h">그룹 {g.name}</div>
          <div className="bk-draw-mem">{g.members.map((mem,mi)=>slotFor("g"+gi+"_"+mi,mem,false))}</div>
        </div>))}</div>
    ) : (()=>{ const {centers,totalH}=treeCenters(b.graph.rounds);
      return (<div className="bk-scroll"><div className="bk-tree">
        {b.graph.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
          <div className="bk-col-h">{b.graph.kind==="double"?("WB R"+(ri+1)):rlabel(r.length)}</div>
          <div className="bk-col-body" style={{height:totalH}}>
            {r.map((m,j)=>(<div className="bk-mpos" key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>
              {ri===0
                ? <div className="bk-match">{slotFor("m"+j+"_0",m.a.pid,m.a.bye)}{slotFor("m"+j+"_1",m.b.pid,m.b.bye)}</div>
                : <div className="bk-match tbd"><div className="bk-slot dwait"><i/></div><div className="bk-slot dwait"><i/></div></div>}
            </div>))}
          </div>
        </div>))}
      </div></div>);
    })()}
    <div className="bk-draw-actions"><button className="btn btn-ghost btn-sm" onClick={onDone}>{done?"완료":"건너뛰기"}<Icon n="arrow" size={14}/></button></div>
  </div>);
}

/* ===== 대진표 메인 ===== */
export default function BracketsPage({ data, admin, flash, refresh }){
  const [normalizedBrackets,setNormalizedBrackets]=useState([]);
  const [normalizedLoadError,setNormalizedLoadError]=useState("");
  const [normalizedInitialReady,setNormalizedInitialReady]=useState(false);
  const loadNormalized=async({initial=false}={})=>{
    try{
      const rows=await listNormalizedBracketRuntimes();
      setNormalizedBrackets(rows.map(row=>row.bracket));
      setNormalizedLoadError("");
      return rows;
    }catch(error){
      setNormalizedLoadError(error?.message||"normalized bracket을 불러오지 못했습니다.");
      return [];
    }finally{
      if(initial) setNormalizedInitialReady(true);
    }
  };
  useEffect(()=>{ void loadNormalized({initial:true}); },[]);
  const requestedEventId=new URLSearchParams(window.location.search).get("eventId");
  // Active Event-linked brackets are normalized-only. Completed pre-normalized
  // graphs without an Event id are a separate, display-only historical source.
  const list=normalizedInitialReady
    ? buildBracketPageList(normalizedBrackets,data?.brackets||[])
    : [];
  const [openId,setOpenId]=useState(null);
  const [wizard,setWizard]=useState(false);
  const [apply,setApply]=useState(null);
  const [drawId,setDrawId]=useState(null);
  const [deletingId,setDeletingId]=useState(null);
  const deletingRef=useRef(false);
  const open=list.find(b=>b.id===openId);
  useEffect(()=>{
    if(!requestedEventId) return;
    const target=list.find(b=>b.eventId===requestedEventId);
    if(target) setOpenId(target.id);
  },[requestedEventId,normalizedInitialReady,normalizedBrackets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const create=async(b)=>{
    const normalizedCandidate=Boolean(
      b.eventId&&b.format==="elim"&&(b.mode==="single"||b.mode==="team")
    );
    if(!normalizedCandidate){
      flash("Event-linked 단일/더블/팀 대진표만 지원합니다. active bracket은 normalized runtime으로만 생성됩니다.");
      return false;
    }
    if(normalizedCandidate){
      if(b.eventId&&list.some(existing=>existing.eventId===b.eventId)){
        flash("이 Event에 연결된 대진표가 이미 있습니다.");
        return false;
      }

      // The existing Single RPC owns identity creation. Team and Double use
      // the confirmed Entry/EntryParticipant graph, then persist only the
      // runtime draw and identity ownership through the generic RPC.
      if(b.mode==="single"&&!b.double){
      try{
        const attempt=b.normalizedAttempt||buildNormalizedSingleCreateAttempt(b.participants||[]);
        await createNormalizedSingleBracketRuntime({
          runtimeId:attempt.runtimeId,
          eventId:b.eventId,
          participants:attempt.participants,
          slots:attempt.slots,
        });
        const loaded=await fetchNormalizedSingleBracketRuntime(b.eventId,attempt.runtimeId);
        if(!loaded) throw new Error("생성된 normalized bracket runtime을 다시 읽지 못했습니다.");
        // The Single create RPC already persists its BYE closure and every
        // formed Match. Do not run the generic sync here: it can overwrite
        // canonical sequence_no values for formed downstream nodes.
        const presentation=beginNormalizedBracketDraw(loaded.bracket);
        setNormalizedBrackets(previous=>[
          ...previous.filter(row=>row.eventId!==b.eventId),
          presentation.bracket,
        ]);
        setOpenId(presentation.openId);
        setDrawId(presentation.drawId);
        flash("대회를 생성했습니다");
        return true;
      }catch(error){
        await loadNormalized();
        flash(`normalized 대진표 생성 실패: ${error?.message||"알 수 없는 오류"}`);
        return false;
      }
      }

      let confirmation=null;
      let createdRuntime=false;
      let runtimeId=null;
      try{
        confirmation=b.mode==="team"
          ? await confirmEventTeamsForBracket(b.eventId,b.participants||[])
          : await confirmEventParticipantsForBracket(b.eventId,b.participants||[]);
        const confirmedParticipants=confirmation.participants||[];
        const identityChangeByEntryParticipantId=new Map((confirmation.identityChanges||[]).map(change=>[change.entryParticipantId,change]));
        const withChange=(member, base)=>{
          const change=identityChangeByEntryParticipantId.get(member.entryParticipantId)||{};
          return {
            ...base,
            player_was_created:Boolean(change.playerWasCreated),
            registration_was_created:Boolean(change.registrationWasCreated),
            registration_player_was_changed:Boolean(change.registrationPlayerWasLinked),
            previous_registration_player_id:change.previousRegistrationPlayerId||null,
            entry_was_created:Boolean(change.entryWasCreated),
            entry_participant_was_created:true,
          };
        };
        const runtimeParticipants=b.mode==="team"
          ? confirmedParticipants.flatMap(team=>(team.memberIdentities||[]).map(member=>({
              ...withChange(member,{
                participant_key:`${team.id}:${member.entryParticipantId}`,
                display_name:team.name,
                entry_type:"team",
                player_id:member.playerId,
                registration_id:member.registrationId,
                entry_id:team.entryId,
                entry_participant_id:member.entryParticipantId,
                member_order:member.memberOrder,
                role:member.role,
              }),
            })))
          : confirmedParticipants.map(participant=>({
              ...withChange(participant,{
                participant_key:participant.id,
                display_name:participant.name,
                entry_type:"individual",
                player_id:participant.playerId,
                registration_id:participant.registrationId,
                entry_id:participant.entryId,
                entry_participant_id:participant.entryParticipantId,
                member_order:1,
              }),
            }));
        const attempt=buildNormalizedRuntimeCreateAttempt(confirmedParticipants);
        runtimeId=attempt.runtimeId;
        await createNormalizedBracketRuntime({
          runtimeId:attempt.runtimeId,
          eventId:b.eventId,
          topologyKind:b.double?"double_elimination":"single_elimination",
          participants:runtimeParticipants,
          slots:attempt.slots,
        });
        createdRuntime=true;
        let loaded=await fetchNormalizedBracketRuntime(b.eventId,attempt.runtimeId);
        if(!loaded) throw new Error("생성된 normalized bracket runtime을 다시 읽지 못했습니다.");
        await syncNormalizedBracketMatches(b.eventId,loaded.bracket);
        loaded=await fetchNormalizedBracketRuntime(b.eventId,attempt.runtimeId);
        if(!loaded) throw new Error("formed Match materialize 후 normalized bracket runtime을 다시 읽지 못했습니다.");
        const presentation=beginNormalizedBracketDraw(loaded.bracket);
        setNormalizedBrackets(previous=>[
          ...previous.filter(row=>row.eventId!==b.eventId),
          presentation.bracket,
        ]);
        setOpenId(presentation.openId);
        setDrawId(presentation.drawId);
        flash("대회를 생성했습니다");
        return true;
      }catch(error){
        let cleanupError=null;
        if(createdRuntime){
          try{ await deleteNormalizedBracketRuntime({runtimeId,eventId:b.eventId}); }
          catch(runtimeError){ cleanupError=runtimeError; }
        }
        if(confirmation&&!cleanupError&&!createdRuntime){
          try{ await rollbackEventParticipantIdentityChanges(b.eventId,confirmation.identityChanges); }
          catch(rollbackError){ cleanupError=rollbackError; }
        }
        await refresh?.();
        await loadNormalized();
        flash(cleanupError
          ? `normalized 대진표 생성 실패 후 참가 확정 원복에도 실패했습니다: ${error?.message||"알 수 없는 오류"} / ${cleanupError?.message||"알 수 없는 오류"}`
          : `normalized 대진표 생성 실패로 참가 확정을 원복했습니다: ${error?.message||"알 수 없는 오류"}`);
        return false;
      }
    }
  };
  const del=async(b)=>{
    if(b.readOnly){ flash("과거 완료 대진표는 조회 전용입니다."); return; }
    if(b.applied){alert("기록 반영 취소 후 대진표를 삭제할 수 있습니다.");return;}
    if(deletingRef.current)return;
    deletingRef.current=true;
    setDeletingId(b.id);

    try{
      if(!confirm(`'${b.name}' 대회를 삭제할까요?`))return;

      if(b.projection?.source==="normalized"){
        try{
          const deleteRuntime=b.mode==="single"&&b.projection?.topology==="single_elimination"
            ? deleteNormalizedSingleBracketRuntime
            : deleteNormalizedBracketRuntime;
          await deleteRuntime({
            runtimeId:b.projection.runtimeId,
            eventId:b.eventId,
          });
          setNormalizedBrackets(previous=>previous.filter(row=>row.eventId!==b.eventId));
          setOpenId(null);
          flash("대진표를 삭제했습니다");
        }catch(error){
          const rows=await loadNormalized();
          const runtimeStillExists=(rows||[]).some(row=>
            row?.bracket?.eventId===b.eventId
            && row?.bracket?.projection?.runtimeId===b.projection?.runtimeId
          );
          if(!runtimeStillExists){
            setOpenId(null);
            flash("대진표를 삭제했습니다");
          }else{
            flash(`normalized 대진표 삭제 실패: ${error?.message||"알 수 없는 오류"}`);
          }
        }
        return;
      }

      flash("legacy bracket은 active runtime으로 지원하지 않습니다.");
    }finally{
      deletingRef.current=false;
      setDeletingId(null);
    }
  };
  const statusTag=(b)=>{ const r=b.format==="group"?(b.knockout?elimResult(b.knockout):null):elimResult(b.graph); if(b.applied)return"기록 반영됨"; if(r&&r.done)return"종료"; return"진행 중"; };
  return (<section className="sec">
    <Reveal className="sec-head"><h2>대진표</h2>
      <p className="sub">대회 대진을 직접 생성하고 결과를 입력하면, 확정된 성적이 기록에 연동됩니다.</p>
      {normalizedLoadError&&<p className="bk-hint" style={{color:"var(--loss)"}}>normalized bracket 오류: {normalizedLoadError}</p>}
      {admin&&<div className="row-actions"><button className="btn btn-primary btn-sm" disabled={!!deletingId} onClick={()=>setWizard(true)}><Icon n="plus" size={15}/>새 대진표</button></div>}
    </Reveal>
    {!open&&!wizard&&<div className="bk-list swap">
      {!normalizedInitialReady
        ? <div className="bk-empty">대진표를 불러오는 중입니다.</div>
        : list.length===0&&<div className="bk-empty">아직 생성된 대회가 없습니다.{admin&&" 우측 상단에서 새 대회를 만들어보세요."}</div>}
      {list.map(b=>(<button className="bk-card" key={b.id} onClick={()=>setOpenId(b.id)}>
        <div className="bk-card-top"><span className={"bk-badge "+(b.applied?"done":"live")}>{statusTag(b)}</span><span className="bk-card-date tnum">{b.createdAt}</span></div>
        <div className="bk-card-name">{b.name}</div>
        <div className="bk-card-meta">{b.mode==="team"?"팀전":"개인전"}, {b.format==="group"?"조별예선+본선":(b.double?"더블 엘리미네이션":"싱글 엘리미네이션")}, {b.participants.length}{b.mode==="team"?"팀":"명"}</div>
      </button>))}
    </div>}
    {open&&!wizard&&<div className="bk-open swap">
      <div className="bk-open-bar"><button className="btn btn-ghost btn-sm" disabled={deletingId===open.id} onClick={()=>{setOpenId(null);setDrawId(null);}}><Icon n="back" size={14}/>목록</button><div className="bk-open-title">{open.name}</div>{!open.readOnly&&admin&&<button className="btn btn-ghost btn-sm" disabled={!!open.applied||deletingId===open.id} title={open.applied?"기록 반영 취소 후 삭제할 수 있습니다.":""} onClick={()=>del(open)} style={{marginLeft:"auto",color:"var(--loss)"}}>{deletingId===open.id?"삭제 중…":"삭제"}</button>}</div>
       {drawId===open.id ? <BracketDraw b={open} onDone={()=>setDrawId(completeNormalizedBracketDraw())}/> : <BracketBoard b={open} admin={admin} flash={flash} readOnly={open.readOnly} refreshNormalized={loadNormalized} onNormalizedReverted={loadNormalized} deleting={deletingId===open.id} onApply={(b,res)=>setApply({b,res})}/>}
    </div>}
    {wizard&&<BracketWizard data={data} onClose={()=>setWizard(false)} onCreate={create}/>}
     {apply&&<BracketApply b={apply.b} res={apply.res} data={data} flash={flash} refresh={refresh} onNormalizedApplied={loadNormalized} onClose={()=>{setApply(null);void loadNormalized();}}/>}
  </section>);
}

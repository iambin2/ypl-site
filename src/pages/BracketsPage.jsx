import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { backWith, popHandlers, pushHistory } from "../components/layout/history.js";
import { formatDate } from "../services/dateFormat.js";
import { Button, Dropdown, Empty, ErrorNote, Field, FormError, Icon, ListSearch, Loader, Modal, Prose, STAGGER, Segmented, siteAlert, siteConfirm, sitePrompt, transition } from "../components/index.js";
import { BackLink, Choice, Counter, Dock, Row, Status, TabsLine } from "../components/common/Board.jsx";
import { dotDate } from "../services/dateFormat.js";
import { addChampionshipQualifierManualRegistration, applyEventRecord, resetSubmissionPin, revertEventRecord, championsData, fetchPlayerChampionRosters, fetchRegistrationFinalRosters, buildChampionshipRecordApplyCompletionOptions, buildNormalizedRuntimeCreateAttempt, buildNormalizedSingleCreateAttempt, championshipEventPickerLabel, confirmEventParticipantsForBracket, confirmEventTeamsForBracket, createChampionshipAdvancement, createNormalizedBracketRuntime, createNormalizedSingleBracketRuntime, deleteNormalizedBracketRuntime, deleteNormalizedSingleBracketRuntime, ensureChampionshipHallOfFameEntry, listChampionshipManualParticipantCandidates, fetchNormalizedBracketRuntime, fetchNormalizedSingleBracketRuntime, readBracketMatchStamp, getEvent, getEventRecordContext, getIndividualPlacementPointPolicy, inspectEventParticipantIdentities, lastPlacementPoints, isRecordApplyCompletionConfirmed, listChampionshipQualifierDirectSelectionIds, listEventRegistrationSubmissionStatuses, listEventRegistrations, listNormalizedBracketRuntimes, listSubmissionEvents, preflightChampionshipFinalBracket, rollbackEventParticipantIdentityChanges, setChampionshipQualifierDirectSelections, setNormalizedSingleBracketWinner, readMatchOutcomes, setNormalizedMatchOutcome, syncNormalizedBracketMatches, validateEventParticipantEntries, validateEventTeamEntries } from "../services/index.js";
import { buildDefaultTeamMatchLineups, buildTeamMatchSeries, getTeamMatchLineupOptions, getTeamRegistrationAnswerEntries } from "../services/bracketTeamParticipants.js";
import { getTeamPlacementPointPolicy } from "../services/bracketRankingAwardSnapshot.js";
import { buildBracketSubmissionStatusModel } from "../services/teamBuilderCore.js";
import { buildBracketPageList } from "../services/historicalBracketReadModel.js";
import { beginNormalizedBracketDraw, completeNormalizedBracketDraw } from "../services/bracketDrawLifecycle.js";
import { ChampionsBracketControls } from "../components/ChampionsBracketControls.jsx";
import { applyTitleAwards, evaluateTitleAwards } from "../services/titleAwards.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { drawPlan } from "../services/bracketProjection.js";
import Seg from "../components/common/Seg.jsx";
import { WORDMARK_PATH } from "../components/layout/SiteHeader.jsx";
import { PRIVATE_BRACKETS_KEY, createCommunityItem, deleteCommunityItem, patchCommunityItem, readCommunity, shareLink, verifyCommunityPin } from "../services/communityStore.js";
import { PIN_DENIED } from "../services/communityItems.js";
import { PRIVATE_BRACKET_MAX, buildPrivateGraph, createPrivateBracket, parseParticipantNames } from "../services/privateBracket.js";

const uid = () => Math.random().toString(36).slice(2, 9);

/* ============================== 대진표 (Bracket) ============================== */
const BYE="\u2205BYE";
const nextPow2=n=>{let p=1;while(p<n)p*=2;return p;};

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
/* 이미지 저장도 사이트와 같은 서체와 네이비 다크 토큰을 쓴다. */
const BKF='"Albert Sans", "Freesentation", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const BKM=BKF;
/* 이미지는 테마와 상관없이 네이비 판이다. 색은 토큰에서 읽어 사이트와 어긋나지 않는다. */
let BKC=null;
function bkInks(){ const css=getComputedStyle(document.documentElement), v=n=>css.getPropertyValue(n).trim();
  BKC={ bg:v("--navy"), card:v("--navy-1"), ink:v("--white"), t2:v("--mist"), t5:v("--mist"), line2:v("--navy-2"), primary:v("--white"), onPrimary:v("--navy") }; }
async function bkFonts(){ bkInks(); try{ if(document.fonts&&document.fonts.load){ await Promise.all(["700","600","400"].flatMap(w=>[document.fonts.load(w+' 40px "Freesentation"',"가"),document.fonts.load(w+' 40px "Albert Sans"',"A")])); await document.fonts.ready; } }catch(e){} }
function bkPage(ctx,W,H){ ctx.fillStyle=BKC.bg; ctx.fillRect(0,0,W,H); }
/* YPL 워드마크: 사이트 상단 바와 같은 그린 글자. x는 align 기준점, y는 글자 아래끝, h는 글자 높이. */
function bkWordmark(ctx,x,y,h,align="left"){
  const k=h/100, w=310*k, left=align==="center"?x-w/2:x;
  ctx.save(); ctx.translate(left,y-h); ctx.scale(k,k);
  ctx.transform(1,0,Math.tan(-12*Math.PI/180),1,0,0); ctx.translate(21,0);
  ctx.fillStyle=BKC.ink; ctx.fill(new Path2D(WORDMARK_PATH),"evenodd");
  ctx.restore(); return w;
}

async function downloadChampionPng(b,res,nameOf){
  await bkFonts();
  const S=2,W=1200,H=820; const cv=document.createElement("canvas"); cv.width=W*S; cv.height=H*S;
  const ctx=cv.getContext("2d"); ctx.scale(S,S);

  // 배경: 네이비 단색, 테두리 없음
  bkPage(ctx,W,H);

  ctx.textAlign="center";
  // 워드마크: 상단 바와 같은 그린 글자
  bkWordmark(ctx,W/2,152,36,"center");
  ctx.fillStyle=BKC.t5; ctx.font=`700 13px ${BKM}`; ctx.fillText("Yonsei Pokémon League",W/2,184);

  // CHAMPION 머리말
  ctx.fillStyle=BKC.t2; ctx.font=`700 20px ${BKM}`; ctx.fillText("우승",W/2,288);

  // 챔피언 이름
  const champ=nameOf(res.champ); const part=(b.participants||[]).find(p=>p.id===res.champ);
  let party=""; if(b.mode==="team"){ party=(part?.members||[]).join(", "); }
  else if(part?.party){ party=part.party.split(/[,\n]/).map(x=>x.trim()).filter(Boolean).join(", "); }
  ctx.font=`700 136px ${BKF}`; const champTxt=bkClip(ctx,champ,W-180); const cw=ctx.measureText(champTxt).width;
  ctx.fillStyle=BKC.ink; ctx.fillText(champTxt,W/2,420);

  let ty=572;
  if(party){ ctx.fillStyle=BKC.t2; ctx.font=`400 20px ${BKF}`;
    ctx.fillText(bkClip(ctx,party,W-200),W/2,522); ty=596; }

  ctx.fillStyle=BKC.ink; ctx.font=`700 32px ${BKF}`;
  ctx.fillText(bkClip(ctx,b.name,W-200),W/2,ty);
  ctx.fillStyle=BKC.t5; ctx.font=`400 20px ${BKF}`; ctx.fillText(formatDate(b.createdAt)+(b.private?", 사설 대진표 (공식 기록 아님)":""),W/2,ty+38);

  // 하단 준우승과 4강 (선 없이 간격으로 나눔)
  const subs=[];
  if(res.ru) subs.push("준우승 "+nameOf(res.ru));
  if(res.sf&&res.sf.length) subs.push("4강 "+res.sf.map(nameOf).join(", "));
  if(subs.length){
    ctx.fillStyle=BKC.t5; ctx.font=`400 20px ${BKF}`;
    ctx.fillText(bkClip(ctx,subs.join("      "),W-220),W/2,H-96);
  }
  bkDownload(cv,`${b.name}_우승_${champ}.png`);
}

function bkDrawMatch(ctx,x,y,w,h,aTxt,bTxt,aWin,bWin,aBye,bBye){
  bkRR(ctx,x,y,w,h,0); ctx.fillStyle=BKC.card; ctx.fill();
  const rowH=h/2; const drawRow=(ry,txt,win,bye)=>{
    if(win){ bkRR(ctx,x+4,ry+4,w-8,rowH-8,0); ctx.fillStyle=BKC.primary; ctx.fill(); }
    ctx.textAlign="left"; ctx.fillStyle=win?BKC.onPrimary:(bye?BKC.t5:BKC.ink); ctx.font=`${win?700:400} 16px ${BKF}`;
    ctx.fillText(bkClip(ctx,txt||"",w-22),x+12,ry+rowH/2+5);
  };
  drawRow(y,aTxt,aWin,aBye); drawRow(y+rowH,bTxt,bWin,bBye);
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
  const boxW=220,boxH=84,gapX=52,pitch0=boxH+52,padL=32,padT=136;
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
  bkPage(ctx,W,H);
  ctx.textAlign="left"; ctx.fillStyle=BKC.ink; ctx.font=`700 32px ${BKF}`; ctx.fillText(bkClip(ctx,b.name,W-320),34,50);
  const wmW=bkWordmark(ctx,34,77,14);
  ctx.fillStyle=BKC.t5; ctx.font=`400 13px ${BKF}`;
  ctx.fillText(formatDate(b.createdAt)+(b.private?", 사설 대진표 (공식 기록 아님)":""),34+wmW+12,76);
  const res=b.format==="group"?(b.knockout?elimResult(b.knockout):null):elimResult(b.graph);
  if(res&&res.done){ ctx.font=`700 16px ${BKF}`; const t="우승 "+nameOf(res.champ);
    const tw=ctx.measureText(t).width+34; bkRR(ctx,W-34-tw,26,tw,38,0); ctx.fillStyle=BKC.primary; ctx.fill();
    ctx.fillStyle=BKC.onPrimary; ctx.textAlign="center"; ctx.fillText(t,W-34-tw/2,51); ctx.textAlign="left"; }
  let curY=padT;
  const drawElimBlock=(g,oy,label)=>{
    if(label){ ctx.fillStyle=BKC.ink; ctx.font=`700 16px ${BKF}`; ctx.fillText(label,34,oy-14); }
    const ev=evalGraph(g);
    const t=bkDrawTree(ctx,g.rounds,ev,nameOf,padL,oy,boxW,boxH,gapX,pitch0);
    let bottom=t.bottom;
    if(g.kind==="double"){
      const lbY=t.bottom+50; ctx.fillStyle=BKC.t2; ctx.font=`700 16px ${BKF}`; ctx.fillText("패자부활전",padL,lbY-12);
      // LB는 단순 컬럼
      for(let r=0;r<g.lb.length;r++){ const x=padL+r*(boxW+gapX);
        for(let j=0;j<g.lb[r].length;j++){ const m=g.lb[r][j]; const cy=lbY+j*pitch0+boxH/2;
          const aPid=ev.sp(m.a),bPid=ev.sp(m.b),wp=ev.win[m.id];
          bkDrawMatch(ctx,x,cy-boxH/2,boxW,boxH, aPid===BYE?"부전승":(aPid?nameOf(aPid):""), bPid===BYE?"부전승":(bPid?nameOf(bPid):""), wp&&wp!==BYE&&wp===aPid, wp&&wp!==BYE&&wp===bPid, aPid===BYE,bPid===BYE);
        } }
      // 그랜드 파이널
      const gx=padL+g.lb.length*(boxW+gapX); const gy=lbY+boxH/2; const m=g.gf; const aPid=ev.sp(m.a),bPid=ev.sp(m.b),wp=ev.win[m.id];
      ctx.fillStyle=BKC.ink; ctx.font=`700 13px ${BKF}`; ctx.fillText("그랜드 파이널",gx,lbY-12);
      bkDrawMatch(ctx,gx,gy-boxH/2,boxW,boxH, aPid?nameOf(aPid):"", bPid?nameOf(bPid):"", wp&&wp===aPid, wp&&wp===bPid,false,false);
      if(g.reset&&g.gf.winner==="b"){ const rx=gx+boxW+gapX; const rm=g.reset; const raPid=ev.sp(rm.a),rbPid=ev.sp(rm.b),rwp=ev.win[rm.id];
        ctx.fillStyle=BKC.ink; ctx.font=`700 13px ${BKF}`; ctx.fillText("최종 결승 (리셋)",rx,lbY-12);
        bkDrawMatch(ctx,rx,gy-boxH/2,boxW,boxH, raPid?nameOf(raPid):"", rbPid?nameOf(rbPid):"", rwp&&rwp===raPid, rwp&&rwp===rbPid,false,false); }
      bottom=lbY+Math.max(...g.lb.map(r=>r.length))*pitch0;
    }
    return bottom;
  };
  if(b.format==="group"){
    const cols=Math.min(b.groups.length,3); const gboxW=250;
    b.groups.forEach((gr,gi)=>{ const st=groupStandings(gr); const r=Math.floor(gi/cols),c=gi%cols;
      const gboxH=40+gr.members.length*26+14; const x=padL+c*(gboxW+24); const y=curY+r*( 40+Math.max(...b.groups.map(g=>g.members.length))*26+14 +24);
      bkRR(ctx,x,y,gboxW,gboxH,0); ctx.fillStyle=BKC.card; ctx.fill();
      ctx.fillStyle=BKC.ink; ctx.font=`700 16px ${BKF}`; ctx.textAlign="left"; ctx.fillText("그룹 "+gr.name,x+14,y+26);
      st.forEach((s,i)=>{ const ry=y+44+i*26; const adv=i<b.groupCfg.adv; if(adv){ bkRR(ctx,x+8,ry-15,gboxW-16,24,0); ctx.fillStyle=BKC.primary; ctx.fill(); }
        ctx.fillStyle=adv?BKC.onPrimary:BKC.t2; ctx.font=`${adv?700:400} 13px ${BKF}`; ctx.fillText(`${i+1}. ${nameOf(s.name)}`,x+16,ry+2); ctx.textAlign="right"; ctx.fillText(s.wins+"승",x+gboxW-16,ry+2); ctx.textAlign="left"; });
    });
    const rows=Math.ceil(b.groups.length/cols); curY=curY+rows*(40+Math.max(...b.groups.map(g=>g.members.length))*26+14+24)+40;
    if(b.knockout){ drawElimBlock(b.knockout,curY,"본선 토너먼트"); }
  } else { drawElimBlock(b.graph,curY); }
  ctx.textAlign="right"; ctx.fillStyle=BKC.t5; ctx.font=`700 13px ${BKM}`;
  ctx.fillText("Yonsei Pokémon League",W-34,H-16); ctx.textAlign="left";
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
  /* 3 대진 배치: 만들기 전에 추첨을 보여 주고 자리를 바꾼다. parts는 이 배치가 가리키는 참가자 그대로다 */
  const [placement,setPlacement]=useState(null);
  const [held,setHeld]=useState(null);
  const dragFrom=useRef(null);

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
      const [registrationResult, directSelectionResult] = await Promise.allSettled([
        listEventRegistrations(id),
        event.championship_phase === "qualifier" ? listChampionshipQualifierDirectSelectionIds(id) : Promise.resolve([]),
      ]);
      if (registrationResult.status === "rejected") throw registrationResult.reason;
      const regs = registrationResult.value || [];
      let statuses=[];
      try{ statuses=await listEventRegistrationSubmissionStatuses(id,regs); }
      catch(statusError){ setSubmissionStatusError(statusError?.message || "제출 상태를 불러오지 못했습니다."); }
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
    const parts=(step===3&&placement?.parts)||buildParticipants();
    if(parts.length<2){ setEventError(linkedEvent?.championship_phase==="final"?"본선 진출자를 먼저 확정해 주세요.":"참가자(팀)를 2개 이상 입력해 주세요."); return; }
    if(format!=="elim"){ setEventError("진행 중인 대회의 대진표는 토너먼트 방식만 지원합니다."); return; }
    if(linkedEvent?.championship_phase === "final"){
      try{
        const preflight=await preflightChampionshipFinalBracket(linkedEvent.id);
        if(!preflight.ok){ setEventError(preflight.error); return; }
      }catch(error){ setEventError(error?.message||"본선 대진표 생성 조건을 확인하지 못했습니다."); return; }
    }
    const useDbl = dbl && parts.length>=3;
    if(dbl && !useDbl) await siteAlert("싱글 엘리미네이션으로 생성합니다.","참가자가 3명 미만이면 더블 엘리미네이션이 성립하지 않습니다.");
    let normalizedAttempt=null;
    if(eventId&&mode==="single"){
      const attemptKey=JSON.stringify([parts.map(p=>[p.registrationId||null,p.name]),(step===3&&placement?.plan)||null]);
      if(!normalizedAttemptRef.current||normalizedAttemptRef.current.attemptKey!==attemptKey){
        normalizedAttemptRef.current={attemptKey,...buildNormalizedSingleCreateAttempt(parts,{plan:(step===3&&placement?.plan)||null})};
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
        plan:(step===3&&placement?.plan)||null,
        graph:null, groups:null, knockout:null, status:"active", applied:null });
    }finally{
      setCreating(false);
    }
    if(created)onClose();
  };
  const submissionStatusByRegistrationId = new Map((submissionStatuses || []).map(status => [status.registrationId, status]));
  const formatSubmissionTime = value => value ? formatDate(value, { time: true }) : "";
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
  const confirmedCount=selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length;
  const placeable=Boolean(eventId)&&format==="elim";
  const startPlacement=()=>{
    const parts=buildParticipants();
    if(parts.length<2){ setEventError(linkedEvent?.championship_phase==="final"?"본선 진출자를 먼저 확정해 주세요.":"참가자(팀)를 2개 이상 입력해 주세요."); return; }
    setEventError("");
    setHeld(null);
    setPlacement({parts,plan:drawPlan(parts.map(p=>p.id))});
    setStep(3);
  };
  const redraw=()=>{ setHeld(null); setPlacement(p=>p&&{...p,plan:drawPlan(p.parts.map(x=>x.id))}); };
  const swapPlaces=(x,y)=>{ if(!x||!y||x===y)return; setPlacement(p=>({...p,plan:p.plan.map(pair=>pair.map(k=>k===x?y:k===y?x:k))})); };
  const placeName=key=>placement?.parts.find(p=>p.id===key)?.name||"";
  const tapPlace=key=>{ if(dragFrom.current?.moved){ dragFrom.current=null; return; } if(held==null) setHeld(key); else { swapPlaces(held,key); setHeld(null); } };
  const placeCell=key=>key==null
    ? <span className="bk-place-name bye t15">부전승</span>
    : <button type="button" data-key={key} className={"bk-place-name t15 "+(held===key?"inv":"")} aria-pressed={held===key}
        onPointerDown={e=>{ if(e.pointerType==="mouse") dragFrom.current={key,x:e.clientX,y:e.clientY,moved:false}; }}
        onClick={()=>tapPlace(key)}>{placeName(key)}</button>;
  const dropPlace=e=>{
    const from=dragFrom.current; if(!from)return;
    if(Math.hypot(e.clientX-from.x,e.clientY-from.y)<8){ dragFrom.current=null; return; }
    from.moved=true;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-key]");
    if(target) swapPlaces(from.key,target.dataset.key);
    setHeld(null);
  };
  const stepCell=(n,label)=><span className={"bk-step "+(step===n?"inv":"pn")} aria-current={step===n?"step":undefined}><span className="num">{n}</span>{step>n&&<Icon n="check" size={16}/>}{label}</span>;
  return (<div className="bk-create">
    <BackLink to="대진표" onClick={onClose}/>
    <header className="bk-head"><h2 className="t20">대진표 만들기</h2>{(linkedEvent?.name||name)&&<span className="t12 dim">{linkedEvent?.name||name}</span>}</header>
    <div className={"stack bk-stepper"+(placeable?" three":"")}>{stepCell(1,"대회 설정")}{stepCell(2,"참가자 확정")}{placeable&&stepCell(3,"대진 배치")}</div>
    <div className="form-card swap" key={step}>
    {step===1&&<>
      <div className="field">
        <label htmlFor="bk-reg-event">신청 대회 선택</label>
        <Dropdown
          id="bk-reg-event"
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
          placeholder={eventBusy?"불러오는 중…":"대회를 선택해 주세요."}
          options={[
            ...events.map(ev=>({value:ev.id,label:championshipEventPickerLabel(ev)})),
            {value:"__manual__",label:"연결하지 않고 새로 만들기"}
          ]}
        />
        {eventError&&<FormError>{eventError}</FormError>}
        {eventId&&!eventBusy&&
          <div className="bk-hint">
            공지에 설정된 대회 정보와 신청자 {eventRegs.length}명의 명단을 사용합니다.
            {mode!=="team"&&submissionStatusError&&<span style={{display:"block",color:"var(--lit)",marginTop:"var(--s1)"}}>파티 제출 상태: {submissionStatusError}</span>}
          </div>
        }
      </div>

      {manualMode&&<>
        <Field label="대회명"><input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 37회 파이컵"/></Field>

        <div className="field">
          <span className="field-label">경기 방식</span>
          <Choice name="bk-mode" options={["개인전","팀전"]} value={mode==="team"?"팀전":"개인전"} onChange={v=>setMode(v==="팀전"?"team":"single")}/>
        </div>

        <div className="field">
          <span className="field-label">대진 형식</span>
          <Choice name="bk-format" options={["토너먼트","조별예선 + 본선"]} value={format==="group"?"조별예선 + 본선":"토너먼트"} onChange={v=>setFormat(v==="토너먼트"?"elim":"group")}/>
        </div>

        {format==="elim"&&
          <label className="bk-check">
            <input type="checkbox" checked={dbl} onChange={e=>setDbl(e.target.checked)}/>
            <span>더블 엘리미네이션 <i>(패자부활전)</i></span>
          </label>
        }

        {format==="group"&&
          <div className="bk-grow2">
            <Field label="그룹 수"><input type="text" inputMode="numeric" value={groups} onChange={e=>setGroups(e.target.value.replace(/[^0-9]/g,"").slice(0,2))} placeholder="예: 4"/></Field>
            <Field label="그룹별 본선 진출"><input type="text" inputMode="numeric" value={adv} onChange={e=>setAdv(e.target.value.replace(/[^0-9]/g,"").slice(0,2))} placeholder="예: 2"/></Field>
          </div>
        }
      </>}

      <Dock>
        <div className="stack bk-dock">
          <Button variant="main" onClick={()=>setStep(2)} disabled={!manualMode&&!eventId}>다음</Button>
          <Button variant="second" onClick={onClose}>취소</Button>
        </div>
      </Dock>
    </>}    {step===2&&<>
      {eventId&&mode!=="team" ? <>
        {linkedEvent?.championship_phase==="qualifier"&&<div className="field">
          <span className="field-label">본선 직행자 선택</span>
          <div className="bk-hint">신청자 중 운영자가 직접 선택합니다. 직행자는 선발전 대진표에서 빠지며, 본선 참가 신청은 아직 만들지 않습니다.</div>
          <div className="bk-fill">{eventRegs.map((reg,i)=>{const checked=directRegistrationIds.includes(reg.id);return <label className="bk-pin" key={`direct-${reg.id}`} style={{animationDelay:(i*STAGGER.row)+"ms",cursor:"pointer"}}><span className="bk-pin-no gold">{i+1}</span><input type="checkbox" checked={checked} onChange={()=>{setDirectRegistrationIds(prev=>checked?prev.filter(id=>id!==reg.id):[...prev,reg.id]);setSelectedRegistrationIds(prev=>checked?prev:[...prev.filter(id=>id!==reg.id)]);}} style={{width:"auto"}}/><span style={{flex:1,fontWeight: 600}}>{reg.registration_name}</span><span className="bk-hint" style={{margin:0}}>{checked?"본선 직행":""}</span></label>;})}</div>
        </div>}
        <div className="stack bk-counters">
          <Counter label="신청" value={eventRegs.length} cells={Math.max(2,String(eventRegs.length).length)}/>
          <Counter label="확정" value={confirmedCount} cells={Math.max(2,String(eventRegs.length).length)}/>
          <Counter label="불참" value={Math.max(0,eventRegs.length-directRegistrationIds.length-confirmedCount)} cells={Math.max(2,String(eventRegs.length).length)}/>
        </div>
        <div className="field">
          <span className="field-label">참가자 확정</span>
          <div className="bk-hint">
            {linkedEvent?.championship_phase==="qualifier"?`직행자 ${directRegistrationIds.length}명은 제외하고 선발전 실제 참가자를 확정합니다. `:"신청자 중 실제 참가자를 선택합니다. "}참가 확정 {selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length}명 / 신청 {eventRegs.length}명
          </div>
        </div>

        <div className="bk-fill bk-participant-confirm-list">
          {eventRegs.map((reg,i)=>{
            if(linkedEvent?.championship_phase==="qualifier"&&directRegistrationIds.includes(reg.id)) return null;
            const checked=selectedRegistrationIds.includes(reg.id);
            return (
              <label className="bk-pin bk-participant-confirm-row" key={reg.id} style={{animationDelay:(i*STAGGER.row)+"ms",cursor:"pointer"}}>
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
                aria-label="추가 참가자 이름"
                value={name}
                onChange={e=>setAddedParticipants(prev=>prev.map((x,j)=>j===i?e.target.value:x))}
                placeholder="추가 참가자 이름"
              />
              <Button
                type="button"
                size="sm"
                onClick={()=>setAddedParticipants(prev=>prev.filter((_,j)=>j!==i))}
              >
                삭제
              </Button>
            </div>
          ))}
        </div>

        <div className="row-actions" style={{justifyContent:"space-between",marginTop:"var(--s3)"}}>
          <div>
            <Button
              type="button"
              size="sm"
              onClick={()=>setSelectedRegistrationIds(eventRegs.map(r=>r.id))}
            >
              전체 선택
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={()=>setSelectedRegistrationIds([])}
            >
              전체 해제
            </Button>
          </div>
          {linkedEvent?.championship_phase ? <Button
            type="button"
            size="sm"
            onClick={openChampionshipManualParticipant}
            disabled={championshipManualBusy}
          >
            참가자 추가
          </Button> : <Button
            type="button"
            size="sm"
            onClick={()=>setAddedParticipants(prev=>[...prev,""])}
          >
            참가자 추가
          </Button>}
        </div>
        {championshipManualOpen&&linkedEvent?.championship_phase&&<div className="field" style={{marginTop:"var(--s3)"}}>
          <span className="field-label">참가자 추가</span>
          <div className="bk-grow2">
            <Dropdown
              value={championshipManualPlayerId}
              onChange={setChampionshipManualPlayerId}
              placeholder="선수 선택"
              options={championshipManualCandidates.map(player=>({value:player.id,label:player.display_name}))}
            />
            {linkedEvent.championship_phase==="final"&&<input
              aria-label="운영 사유 (선택)"
              value={championshipManualReason}
              onChange={event=>setChampionshipManualReason(event.target.value)}
              placeholder="운영 사유 (선택)"
            />}
          </div>
          <div className="row-actions" style={{justifyContent:"flex-end",marginTop:"var(--s2)"}}>
            <Button type="button" size="sm" disabled={championshipManualBusy} onClick={()=>setChampionshipManualOpen(false)}>취소</Button>
            <Button type="button" variant="primary" size="sm" disabled={!championshipManualPlayerId||championshipManualBusy} onClick={addChampionshipManualParticipant}>추가</Button>
          </div>
        </div>}
        {linkedEvent?.championship_phase==="qualifier"&&(()=>{const capacity=Number(linkedEvent?.competition_settings?.championship?.finalCapacity)||0;const actual=selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length;const target=capacity-directRegistrationIds.length;const eliminated=actual-target;return <div className="bk-hint" style={{marginTop:"var(--s2)"}}>본선 정원은 {capacity}명이고 본선 직행은 {directRegistrationIds.length}명입니다. 선발전에는 {actual}명이 참가해 {target}명이 통과하므로 {Math.max(0,eliminated)}명이 탈락해야 합니다.{actual<target&&<span style={{color:"var(--lit)"}}> 참가 인원이 부족해 본선 정원을 채울 수 없습니다.</span>}</div>;})()}
      </> : <>
        {eventId&&mode==="team"&&<div className="field">
          <span className="field-label">신청자 / 팀 지망</span>
          <div className="bk-hint">신청서에 저장된 팀 지망을 참고해 아래 기존 팀 편성 입력에서 최종 배정합니다.</div>
          <div className="bk-fill">
            {eventRegs.map((reg,i)=>{
              const answers=getTeamRegistrationAnswerEntries(reg,linkedFields);
              const assigned=assignedTeamsFor(reg.registration_name);
              return <div className="bk-pin" key={reg.id} style={{animationDelay:(i*STAGGER.row)+"ms"}}>
                <span className="bk-pin-no">{i+1}</span>
                <div style={{flex:1,minWidth:0}}>
                  <b>{reg.registration_name}</b>
                  <div className="bk-hint" style={{marginTop:"var(--s1)"}}>
                    {answers.length
                      ? answers.map(answer=>`${answer.label}: ${answer.value||"-"}`).join(", ")
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

        <div className="field"><span className="field-label">{mode==="team"?"팀 수":"참가자 수"}</span>
          <div className="bk-count">
            <button type="button" onClick={()=>setCnt(Math.max(2,count-1))} aria-label="하나 줄이기"><Icon n="minus" size={16}/></button>
            <input type="text" inputMode="numeric" aria-label={mode==="team"?"팀 수":"참가자 수"} value={countStr} onChange={e=>setCnt(e.target.value)}/>
            <button type="button" onClick={()=>setCnt(Math.min(64,count+1))} aria-label="하나 늘리기"><Icon n="plus" size={16}/></button>
          </div>
          <div className="bk-hint">{(()=>{
            if(format==="group") return `${gN}개 그룹, 그룹당 약 ${Math.ceil(Math.max(count,1)/gN)}명, 상위 ${aN}명 본선`;
            const sz=nextPow2(Math.max(count,2));
            return `${sz}강 대진, 부전승 ${sz-count}개 자동 추가`;
          })()}</div>
        </div>

        <div className="bk-fill">
          {mode==="team"
            ? teams.map((t,i)=>(<div className="bk-team-card" key={i} style={{animationDelay:(i*STAGGER.row)+"ms"}}>
                <span className="bk-pin-no gold">{i+1}</span>
                <input className="bk-tc-name" value={t.name} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder={`팀 ${i+1} 이름`} aria-label={`팀 ${i+1} 이름`}/>
                <input className="bk-tc-mem" value={t.members} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,members:e.target.value}:x))} placeholder="팀원 (쉼표로 구분)" aria-label="팀원 (쉼표로 구분)"/>
              </div>))
            : names.map((n,i)=>(<div className="bk-pin" key={i} style={{animationDelay:(i*STAGGER.row)+"ms"}}>
                <span className="bk-pin-no">{i+1}</span>
                <input value={n} onChange={e=>setNames(names.map((x,j)=>j===i?e.target.value:x))} placeholder={`참가자 ${i+1}`} aria-label={`참가자 ${i+1}`}/>
              </div>))}
        </div>
      </>}

      <Dock>
        <div className="stack bk-dock">
          {placeable
            ? <Button variant="main" onClick={startPlacement}>{mode!=="team"?`${buildParticipants().length}명으로 추첨`:"추첨"}</Button>
            : <Button variant="main" icon="check" onClick={go} disabled={creating} loading={creating}>{eventId&&mode!=="team"?`${buildParticipants().length}명으로 대진표 만들기`:"대진표 만들기"}</Button>}
          <Button variant="second" onClick={()=>setStep(1)}>이전</Button>
        </div>
      </Dock>
    </>}

    {step===3&&placement&&<>
      {eventError&&<FormError>{eventError}</FormError>}
      <div className="stack bk-place-tools"><Button variant="second" onClick={redraw}>다시 추첨</Button></div>
      <p className="t12 reg dim">M1과 M2, M3과 M4의 승자가 차례로 만납니다. 이름을 끌어 다른 이름에 놓거나, 두 이름을 차례로 누르면 자리가 바뀝니다. 부전승 자리는 추첨이 정합니다.</p>
      <div className="stack bk-place" onPointerUp={dropPlace} onPointerLeave={()=>{ if(dragFrom.current&&!dragFrom.current.moved) dragFrom.current=null; }}>
        {placement.plan.map(([a,b],i)=><div className="pn bk-place-row" key={i}>
          <span className="t12 dim num">M{i+1}</span>{placeCell(a)}<span className="t12 dim">vs</span>{placeCell(b)}
        </div>)}
      </div>
      <Dock>
        <div className="stack bk-dock">
          <Button variant="main" icon="check" onClick={go} disabled={creating} loading={creating}>대결 확정</Button>
          <Button variant="second" onClick={()=>{ setHeld(null); setStep(2); }}>이전</Button>
        </div>
      </Dock>
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
  const confirm=()=>{ if(!decided){siteAlert("결과를 모두 입력해 주세요.","실제 출전 선수와 모든 대결 결과를 입력해야 저장할 수 있습니다. 동점이면 타이브레이커도 입력해 주세요.");return;}
    const result=buildTeamMatchSeries(teamA,teamB,{lineupA,lineupB,games,ace:tie?{a:aceA,b:aceB,winner:aceW}:null}); onSave(result.series,result.winnerSide); };
  const side=(value,onChange,options,winner,onWin,label)=><div className="bk-bout-side"><div className="bk-bout-player"><Dropdown value={value} onChange={onChange} placeholder="선수 선택" options={options}/></div><button type="button" className={"bk-bout-win"+(winner?" is-win":"")} onClick={onWin} aria-label={label} aria-pressed={winner}>{winner?<><Icon n="check" size={16}/>승</>:"승"}</button></div>;
  const displayTeamA=teamMatchDisplayName(teamA.name),displayTeamB=teamMatchDisplayName(teamB.name);
  return (<Modal title={`${displayTeamA} vs ${displayTeamB}`} hint="실제 출전 선수를 선택하고 모든 개인전 결과를 입력해 주세요." onClose={onClose}>
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
      <div className="modal-actions bk-team-match-actions"><Button onClick={onClose}>취소</Button><Button variant="primary" onClick={confirm} disabled={!decided}>대결 확정</Button></div>
    </div>
  </Modal>);
}

/* ===== 경기 상자 (DESIGN.md "Brackets") =====
   두 줄, 36씩, 사이에 이음매. 이긴 줄은 반전되고 진 줄은 흐려진다. 아직 정해지지 않은 자리는 흐린 글자다.
   점수는 게임별 승자가 있을 때(팀전 시리즈)만 이긴 게임 수로 쓰고, 없으면 승자만 보인다. */
const seriesScore=(m,side)=>{ const s=m?.series; if(!s?.games) return null; return s.games.filter(w=>w===side).length+(s.ace?.winner===side?1:0); };
function MatchCard({ m, ev, nameOf, admin, onPick, compact, teamMode, onOpenTeam, seedOf }){
  if(!m) return null;
  const pa=ev.sp(m.a), pb=ev.sp(m.b);
  const decided=!!m.winner;
  const bothReal=pa&&pb&&pa!==BYE&&pb!==BYE;
  const line=(side,pid,Tag,extra)=>{
    const isWin=decided&&m.winner===side, isBye=pid===BYE, lost=decided&&!isWin, n=seedOf?seedOf(pid):null, score=seriesScore(m,side)??(side==="a"?m.scoreA:m.scoreB)??null;
    return <Tag {...extra} className={"mb-row"+(isWin?" inv":"")+(lost?" lost":"")+(isBye||!pid?" wait":"")}>
      <i className="mb-seed num t12" aria-hidden={!n}>{n||""}</i>
      <span className="mb-name">{pid===BYE?"부전승":(pid?nameOf(pid):"대기")}</span>
      {lost&&m.forfeit?<span className="mb-score t12">불참</span>:score!=null&&<span className="mb-score num">{score}</span>}
    </Tag>;
  };
  if(teamMode){
    const clickable=admin&&(bothReal||decided);
    const Box=clickable?"button":"div";
    return <Box {...(clickable?{type:"button"}:{})} className={"mb"+(compact?" cmp":"")+(clickable?" team-click":"")} onClick={()=>clickable&&onOpenTeam(m,pa,pb)} title={clickable?"눌러서 팀 대결 진행 또는 수정":""}>{line("a",pa,"span")}{line("b",pb,"span")}</Box>;
  }
  const canPick=admin&&bothReal;
  const pickProps=side=>({type:"button",disabled:!canPick,onClick:()=>canPick&&onPick(m.id,side),title:canPick?(decided?"다른 쪽을 누르면 승자 변경, 같은 쪽을 다시 누르면 취소":"눌러서 승자 선택"):""});
  return <div className={"mb"+(compact?" cmp":"")+(canPick?" can-pick":"")}>{line("a",pa,"button",pickProps("a"))}{line("b",pb,"button",pickProps("b"))}</div>;
}

/* ===== 결과 입력 (docs/redesign-next c8) =====
   경기 칩으로 경기를 고르고 이긴 줄을 눌러 승자를 정한다. 대진표의 줄을 누르는 것과 같은 일이며(같은 줄을 다시 누르면 취소),
   저장은 누를 때마다 된다. 개인전의 게임 점수와 불참은 경기 데이터에 칸이 없어 다루지 않는다. */
const stageOf=(g,m)=>{
  const ri=g.rounds.findIndex(r=>r.includes(m));
  if(ri>=0){ if(g.kind==="double") return `승자조 ${ri+1}라운드`; const len=g.rounds[ri].length; return len===1?"결승":`${len*2}강`; }
  const li=(g.lb||[]).findIndex(r=>r.includes(m));
  if(li>=0) return `패자조 ${li+1}라운드`;
  return m===g.reset?"리셋 결승":"결승";
};
function ResultEntry({ g, nameOf, seedOf, onPick, teamMode, onOpenTeam, busy, outcomeOn=false, onOutcome }){
  const ev=evalGraph(g);
  const rows=collectGraphMatches(g).map(m=>({m,a:ev.sp(m.a),b:ev.sp(m.b)})).filter(x=>x.a&&x.b&&x.a!==BYE&&x.b!==BYE);
  const [chosen,setChosen]=useState(null);
  const [draft,setDraft]=useState(null);
  const cur=rows.find(x=>x.m.id===chosen)||rows.find(x=>!x.m.winner)||rows[rows.length-1];
  if(!cur) return null;
  const at=rows.indexOf(cur);
  const next=rows.slice(at+1).find(x=>!x.m.winner)||rows.find(x=>!x.m.winner&&x!==cur);
  /* 점수는 승자가 정해진 경기에만, 이 칸에서 고친 뒤 한 번에 저장한다. 이긴 선수의 점수가 더 커야 한다(서버도 같은 검사를 한다) */
  const scored=outcomeOn&&!teamMode&&Boolean(cur.m.winner)&&!cur.m.forfeit;
  const saved=[cur.m.scoreA??null,cur.m.scoreB??null];
  const shown=draft&&draft.id===cur.m.id?draft.score:saved;
  const dirty=scored&&(shown[0]!==saved[0]||shown[1]!==saved[1]);
  const bump=(i,d)=>{ const next=[...shown]; next[i]=Math.max(0,Math.min(9,(next[i]??0)+d)); if(next[1-i]==null) next[1-i]=0; setDraft({id:cur.m.id,score:next}); };
  const winIndex=cur.m.winner==="a"?0:1;
  const scoreError=dirty&&shown[0]!=null&&shown[winIndex]<=shown[1-winIndex]?"이긴 선수의 점수가 더 커야 합니다.":"";
  const saveScore=async()=>{ await onOutcome(cur.m.id,{scoreA:shown[0],scoreB:shown[1],forfeit:false}); setDraft(null); };
  const goNext=async()=>{ if(dirty){ if(scoreError)return; await saveScore(); } if(next) setChosen(next.m.id); };
  const side=(s,pid)=>{
    const win=cur.m.winner===s, decided=Boolean(cur.m.winner), i=s==="a"?0:1;
    const line=teamMode?"눌러서 팀 대결 입력":win?"승자, 다시 누르면 취소":decided?(cur.m.forfeit?"불참":"눌러서 승자로 바꾸기"):"눌러서 승자로";
    return <div className={"bk-entry-row "+(win?"inv":"pn")+(scored?" scored":"")}>
      <button type="button" className="bk-entry-pick" disabled={busy} aria-pressed={win}
        onClick={()=>teamMode?onOpenTeam(cur.m,cur.a,cur.b):onPick(cur.m.id,s)}>
        <span className="t12 dim num">{seedOf(pid)||""}</span>
        <span className="bk-entry-name"><b className="t20">{nameOf(pid)}</b><span className="t12 reg">{line}</span></span>
        {win&&!scored&&<Icon n="check" size={20}/>}
      </button>
      {scored&&<span className="bk-entry-score" role="group" aria-label={`${nameOf(pid)} 점수`}>
        <button type="button" className="bk-entry-step" onClick={()=>bump(i,-1)} disabled={busy||!shown[i]} aria-label={`${nameOf(pid)} 점수 내리기`}><Icon n="minus" size={20}/></button>
        <Seg value={shown[i]==null?"":String(shown[i])} cells={1} h={40} label={shown[i]==null?"점수 없음":`${shown[i]}점`}/>
        <button type="button" className="bk-entry-step" onClick={()=>bump(i,1)} disabled={busy||shown[i]>=9} aria-label={`${nameOf(pid)} 점수 올리기`}><Icon n="plus" size={20}/></button>
      </span>}
    </div>;
  };
  return (<section className="bk-entry" aria-label="결과 입력">
    <h2 className="t20">결과 입력</h2>
    <div className="bk-entry-chips" role="tablist" aria-label="경기">{rows.map((x,i)=><button type="button" role="tab" aria-selected={x===cur} key={x.m.id}
      className={"bk-entry-chip t12 "+(x===cur?"inv":"pn")+(x.m.winner?" done":"")} onClick={()=>setChosen(x.m.id)}>{x.m.winner&&<Icon n="check" size={16}/>}M{i+1}</button>)}</div>
    <div className="stack">
      <p className="pn bk-entry-head t12"><span className="dim">M{at+1}, {stageOf(g,cur.m)}</span>{cur.m.winner?<span>결과 확정</span>:<span className="bk-entry-live"><i className="lamp sig" aria-hidden="true"/>진행 중</span>}</p>
      {side("a",cur.a)}{side("b",cur.b)}
    </div>
    {outcomeOn&&!teamMode&&cur.m.winner&&<div className="stack bk-entry-actions">
      <Button variant="second" disabled={busy} onClick={()=>onOutcome(cur.m.id,{forfeit:!cur.m.forfeit})}>{cur.m.forfeit?"불참 취소":`${nameOf(cur.m.winner==="a"?cur.b:cur.a)} 불참 처리`}</Button>
    </div>}
    {scoreError&&<p className="t12 reg bk-entry-error"><span className="bang" aria-hidden="true">!</span>{scoreError}</p>}
    {(next||dirty)&&<Button variant={dirty?"main":"second"} icon={dirty&&!next?"check":"arrow"} disabled={busy||Boolean(scoreError)} onClick={goNext}>
      {dirty?(next?`저장하고 다음 경기 M${rows.indexOf(next)+1}`:"점수 저장"):`다음 경기 M${rows.indexOf(next)+1}`}</Button>}
  </section>);
}

/* ===== 대진표 보드 =====
   경기 상자는 74(36, 이음매 2, 36). 첫 열의 상자는 94 간격(상자와 20)으로 서고, 다음 열은 앞의 두 상자 사이에 선다.
   끝난 경기의 승자 길은 2px의 켜진 선, 아직인 길은 1px 선이다. */
const BK_ROW_H=36, BK_MATCH_H=BK_ROW_H*2+2, BK_PITCH0=BK_MATCH_H+20;
function treeCenters(rounds){
  const centers=[];
  for(let r=0;r<rounds.length;r++){ centers[r]=[];
    for(let j=0;j<rounds[r].length;j++){ centers[r][j]= r===0 ? (j*BK_PITCH0+BK_MATCH_H/2) : (centers[r-1][2*j]+centers[r-1][2*j+1])/2; } }
  return { centers, totalH: Math.max(BK_MATCH_H,(rounds[0]?.length||1)*BK_PITCH0-20) };
}
function ElimBoard({ g, nameOf, admin, onPick, teamMode, onOpenTeam, qualifier=false, seedOf }){
  const ev=evalGraph(g);
  const finalRes=elimResult(g);
  const pathOf=(m)=>{ const w=ev.win[m.id]; return !w||w===BYE?"":" won"; };
  const rlabel=(len)=>{ const names={1:"결승",2:"4강",4:"8강",8:"16강",16:"32강"}; return names[len]||`${len*2}강`; };
  const { centers, totalH }=treeCenters(g.rounds);
  const card=m=><MatchCard m={m} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam} seedOf={seedOf}/>;
  return (<div className="bk-scroll" role="region" aria-label="대진표" tabIndex={0}><div className="bk-tree">
    {g.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
      <div className="bk-col-h t12 dim">{g.kind==="double"?("승자조 "+(ri+1)+"R"):rlabel(r.length)}</div>
      <div className="bk-col-body" style={{height:totalH,"--bk-pitch":(BK_PITCH0*Math.pow(2,ri))+"px"}}>
        {r.map((m,j)=>(<div className={"bk-mpos"+pathOf(m)} key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>{card(m)}</div>))}
      </div>
    </div>))}
    {g.kind!=="double"&&finalRes&&finalRes.champ&&<div className="bk-col2 bk-champ-col">
      <div className="bk-col-h t12 dim">우승</div>
      <div className="bk-col-body" style={{height:totalH}}>
        <div className="bk-mpos" style={{top:(centers[g.rounds.length-1][0]-BK_MATCH_H/2)+"px"}}>
          <div className="bk-champ-node inv"><span className="t12">우승</span><b className="t15">{nameOf(finalRes.champ)}</b></div>
        </div>
      </div>
    </div>}
  </div>
  {g.kind==="double"&&<div className="bk-lb"><div className="bk-lb-h t15">패자부활전</div><div className="bk-cols">
    {g.lb.map((r,ri)=>(<div className="bk-col" key={ri}><div className="bk-col-h t12 dim">패자조 {ri+1}R</div>
      {r.map(m=><React.Fragment key={m.id}>{card(m)}</React.Fragment>)}
    </div>))}
    {!qualifier&&<div className="bk-col"><div className="bk-col-h gf">그랜드 파이널</div>{card(g.gf)}</div>}
    {!qualifier&&g.reset&&g.gf.winner==="b"&&<div className="bk-col"><div className="bk-col-h gf">최종 결승 (리셋)</div>{card(g.reset)}</div>}
    {!qualifier&&finalRes&&finalRes.champ&&<div className="bk-col bk-champ-col">
      <div className="bk-col-h gf">우승</div>
      <div className="bk-champ-node inv"><span className="t12">우승</span><b className="t15">{nameOf(finalRes.champ)}</b></div>
    </div>}
  </div></div>}
  </div>);
}

function formatBracketSubmissionTime(value) {
  return value
    ? formatDate(value, { time: true })
    : "";
}

function SubmissionStatusPanel({ model, busy, error, expanded, onToggle, onRefresh, onResetPin }) {
  const renderMember = member => (
    <div className="bk-submission-member" key={member.registrationId}>
      <span className="bk-submission-member-name">{member.name}</span>
      <span className={`bk-submission-state${member.hasSubmission ? " submitted" : ""}`}>
        {member.hasSubmission
          ? `제출 완료${formatBracketSubmissionTime(member.latestSubmittedAt) ? ` (${formatBracketSubmissionTime(member.latestSubmittedAt)})` : ""}`
          : "미제출"}
      </span>
      {onResetPin&&<button type="button" className="bd-del sm" onClick={()=>onResetPin(member)}>비밀번호 초기화</button>}
    </div>
  );

  return (
    <section className="bk-submission sq" aria-label="파티 제출 현황">
      <div className="bk-submission-head">
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
            <span className={"bk-submission-chevron"+(expanded?" open":"")} aria-hidden="true"><Icon n="chev" size={16}/></span>
          </span>
        </button>
        <button type="button" className="bk-submission-refresh" onClick={onRefresh} disabled={busy} aria-label="파티 제출 현황 새로고침" title="새로고침">
          <Icon n="refresh" size={16}/>
        </button>
      </div>
      {error && <ErrorNote action="다시 불러오기" onRetry={onRefresh}>{error}</ErrorNote>}
      {expanded && !busy && !error && model.total > 0 && (
        <div className="bk-submission-detail">
          {model.mode === "team" ? (
            <div className="bk-submission-groups">
              {model.teams.map(team => (
                <div className="bk-submission-group sq" key={team.entryId}>
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
        <div className="bk-submission-empty">확정된 참가 신청이 없어 제출 현황을 표시할 수 없습니다.</div>
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
    return ()=>{ cancelled=true; };
  },[b.eventId,submissionStatusReloadKey]);
  const submissionStatusModel=buildBracketSubmissionStatusModel(b,submissionStatuses);
  /* 점수와 불참(docs/db/match_outcome.sql): 그 SQL 전에는 null이라 화면에 나오지 않는다 */
  const [outcomes,setOutcomes]=useState(null);
  const [outcomeKey,setOutcomeKey]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    if(!b.eventId||teamMode){ setOutcomes(null); return undefined; }
    readMatchOutcomes(b.eventId).then(map=>{ if(!cancelled) setOutcomes(map); }).catch(()=>{ if(!cancelled) setOutcomes(null); });
    return ()=>{ cancelled=true; };
  },[b.eventId,teamMode,championshipRefreshKey,outcomeKey,b.graph]);
  if(outcomes&&b.graph) collectGraphMatches(b.graph).forEach(m=>{ const o=outcomes.get(m.id); m.scoreA=o?.score_a??null; m.scoreB=o?.score_b??null; m.forfeit=o?.resolution==="forfeit"&&Boolean(m.winner); });
  const saveOutcome=async(matchId,{scoreA=null,scoreB=null,forfeit=false})=>{
    if(readOnly||locked||matchMutationBusyRef.current)return;
    matchMutationBusyRef.current=true;
    setMatchMutationBusy(true);
    try{
      await setNormalizedMatchOutcome({eventId:b.eventId,sourceNodeKey:matchId,scoreA,scoreB,forfeit});
      setOutcomeKey(value=>value+1);
      flash(forfeit?"불참으로 남겼습니다.":scoreA!=null?"점수를 저장했습니다.":"불참을 취소했습니다.");
    }catch(error){
      setOutcomeKey(value=>value+1);
      flash(`저장하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);
    }finally{
      matchMutationBusyRef.current=false;
      setMatchMutationBusy(false);
    }
  };
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
      /* c8 되돌리기: 새로 정한 승자만 되돌린다. 같은 쪽을 다시 누르는 것(승자 취소)과 같은 일이고, 그사이 바뀌었으면 하지 않는다.
         이미 있던 승자를 바꾼 것은 아래 경기가 지워지므로 정확히 되돌릴 수 없어 붙이지 않는다. */
      const undo=winnerEntryId&&!match.winner?{label:"되돌리기",run:()=>{
        const now=collectGraphMatches(latestRef.current.b.graph).find(row=>row.id===matchId);
        if(now?.winner===side) void latestRef.current.pickNormalized(matchId,side);
      }}:undefined;
      flash(winnerEntryId?"승자를 저장했습니다.":"승자를 취소했습니다.",undo);
    }catch(error){
      await refreshNormalized?.();
      setChampionshipRefreshKey(value=>value+1);
      flash(`승자를 저장하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);
    }finally{
      matchMutationBusyRef.current=false;
      setMatchMutationBusy(false);
    }
  };
  const latestRef=useRef(null);
  latestRef.current={b,pickNormalized};
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
      flash("팀전 결과를 저장했습니다.");
    }catch(error){
      await refreshNormalized?.();
      flash(`팀전 결과를 저장하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);
    }finally{
      matchMutationBusyRef.current=false;
      setMatchMutationBusy(false);
    }
  };
  const res = b.format==="group" ? (b.knockout?elimResult(b.knockout):null) : elimResult(b.graph);
  const resetPin=async(member)=>{
    if(!(await siteConfirm({title:"제출 비밀번호 초기화",body:`${member.name}의 제출 비밀번호를 지웁니다. 다음 제출 때 새로 정하며, 제출한 파티는 그대로 남습니다.`,confirmLabel:"초기화"})))return;
    try{ await resetSubmissionPin(member.registrationId); flash("제출 비밀번호를 초기화했습니다."); }
    catch(error){ flash(error?.message||"제출 비밀번호를 초기화하지 못했습니다."); }
  };
  const undoApplied=async()=>{
    if(readOnly)return;
    if(!b.applied)return;
    if(!(await siteConfirm({title:"기록 반영 취소",body:"이 대진표의 기록 반영을 취소할까요? 회차, 랭킹, 시즌 성적과 연결된 대회의 기록 상태가 함께 되돌아갑니다.",confirmLabel:"반영 취소",danger:true})))return;
    try{
      await revertEventRecord(b.eventId);
      await onNormalizedReverted?.();
      flash("기록 반영을 취소했습니다.");
    }catch(error){
      flash(`기록 반영을 취소하지 못했습니다. 바뀐 내용은 없습니다. ${error?.message||"원인을 확인하지 못했습니다."}`);
    }
  };
  return (<div className="bk-board swap">
    {readOnly&&admin&&<p className="bk-hint">이미 끝난 과거 대진표입니다. 볼 수만 있고 수정, 삭제, 기록 반영은 할 수 없습니다.</p>}
    {res&&res.done&&championshipEvent?.championship_phase!=="qualifier"&&<section className="bk-result" aria-labelledby="bk-champ-name">
      <div className="inv bk-winner"><span className="t12">우승</span><h2 className="t20" id="bk-champ-name">{nameOf(res.champ)}</h2></div>
      {/* 날짜와 참가 수는 바로 위 대회 머리에 있다. 여기에는 결과만 한 번. */}
      {(res.ru||(res.sf&&res.sf.length>0))&&<Places res={res} nameOf={nameOf}/>}
      <div className="bk-cb-actions">
        <Button variant="second" onClick={()=>downloadChampionPng(b,res,nameOf)}>우승 이미지</Button>
        <Button variant="second" onClick={()=>downloadBracketPng(b,nameOf)}>대진표 이미지</Button>
        {admin&&!readOnly&&!b.applied&&championshipEvent?.championship_phase!=="qualifier"&&<Button variant="main" onClick={()=>onApply(b,res)}>기록에 반영</Button>}
        {b.applied&&<>{admin&&<span className="bk-applied"><Icon n="check" size={16}/> 기록 반영됨</span>}{!readOnly&&admin&&championshipEvent?.event_type==="champions"&&championshipEvent?.championship_phase==="final"&&<Button size="sm" disabled={hallOfFameBusy} onClick={async()=>{setHallOfFameBusy(true);try{await ensureChampionshipHallOfFameEntry(b.eventId);flash("명예의 전당 등록 ✓");}catch(error){flash(`명예의 전당에 등록하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);}finally{setHallOfFameBusy(false);}}} loading={hallOfFameBusy}>명예의 전당 재시도</Button>}{!readOnly&&admin&&<Button size="sm" onClick={undoApplied}>반영 취소</Button>}</>}
      </div>
    </section>}
    {b.eventId&&(admin||!(res&&res.done))&&<SubmissionStatusPanel
      model={submissionStatusModel}
      busy={submissionStatusBusy}
      error={submissionStatusError}
      expanded={submissionStatusExpanded}
      onToggle={()=>setSubmissionStatusExpanded(value=>!value)}
      onRefresh={()=>setSubmissionStatusReloadKey(value=>value+1)}
      onResetPin={admin?resetPin:null}
    />}
    {admin&&championshipEvent?.championship_phase==="qualifier"&&<ChampionsBracketControls eventId={b.eventId} placement="qualifier" refreshKey={championshipRefreshKey} onChanged={()=>void refreshNormalized?.()}/>}
    {admin&&!locked&&b.format==="elim"&&b.graph&&!(res&&res.done)&&<ResultEntry g={b.graph} nameOf={nameOf} busy={matchMutationBusy} onPick={pick} teamMode={teamMode} onOpenTeam={openTeam} outcomeOn={Boolean(outcomes)} onOutcome={saveOutcome}
      seedOf={(pid)=>{const i=(b.participants||[]).findIndex(x=>x.id===pid);return i>=0?i+1:null;}}/>}
    {b.format==="elim"&&<ElimBoard g={b.graph} nameOf={nameOf} admin={editAdmin} onPick={pick} teamMode={teamMode} onOpenTeam={openTeam} qualifier={championshipEvent?.championship_phase==="qualifier"} seedOf={(pid)=>{const i=(b.participants||[]).findIndex(x=>x.id===pid);return i>=0?i+1:null;}}/>}
    {series&&<TeamMatchModal teamA={series.A} teamB={series.B} init={series.m.series} onClose={()=>setSeries(null)} onSave={saveSeries}/>}
  </div>);
}

/* ===== 기록 반영 모달 ===== */
function BracketApply({ b, res, data, save, onClose, flash, refresh, onNormalizedApplied }){
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
  /* 지난 대회와 같게(c12): 기록에 반영된 가장 최근의 같은 종류 대회가 준 점수를 칸에 넣는다. 저장은 반영할 때 한 번이다 */
  const [lastPoints,setLastPoints]=useState({busy:false,note:""});
  const copyLastPoints=async()=>{
    setLastPoints({busy:true,note:""});
    try{
      const points=await lastPlacementPoints({isTeam:team});
      if(!points){ setLastPoints({busy:false,note:"기록에 반영된 지난 대회가 없습니다."}); return; }
      setPtWin(String(points.win)); setPtRu(String(points.ru)); if(!team) setPtSf(String(points.sf));
      setLastPoints({busy:false,note:`${points.eventName||"지난 대회"}의 점수를 넣었습니다.`});
    }catch(error){ setLastPoints({busy:false,note:error?.message||"지난 대회의 점수를 불러오지 못했습니다."}); }
  };
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
        if(!cancelled) setIdentityPreviewError(error?.message||"참가자의 선수 정보를 확인하지 못했습니다.");
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
  const [awards,setAwards]=useState(null);
  const [awardPicks,setAwardPicks]=useState(()=>new Set());
  const [awardBusy,setAwardBusy]=useState(false);
  const [applying,setApplying]=useState(false);
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
    if(qualifierEvent){siteAlert("선발전은 기록에 반영하지 않습니다.","선발전은 순위와 포인트를 기록하지 않습니다. 챔피언스 운영에서 본선 진출자를 확정한 뒤 선발전을 종료해 주세요.");return;}
    if(!curT){siteAlert("대회를 선택해 주세요.","회차를 추가할 대회를 먼저 선택해 주세요.");return;}
    if(linkedContextBusy){siteAlert("잠시만 기다려 주세요.","연결 대회의 시즌 정보를 불러오는 중입니다.");return;}
    if(linkedContextError){siteAlert("연결 대회를 확인하지 못했습니다.",linkedContextError);return;}
    if(!recordSeason){siteAlert("시즌을 선택해 주세요.","기록을 반영할 시즌을 먼저 선택해 주세요.");return;}
    setPreview(buildResult());
  };
  // 기록 반영이 끝난 뒤, 고정된 공식 파티로 칭호 조건을 확인한다. 판정 실패는 기록 반영을 막지 않는다.
  const findTitleAwards=async(event)=>{
    const placements=[
      ...(res.champ?[{pid:res.champ,placement:"champion"}]:[]),
      ...(res.ru?[{pid:res.ru,placement:"runner_up"}]:[]),
      ...(team?[]:res.sf.map(pid=>({pid,placement:"semifinalist"}))),
    ].map(({pid,placement})=>{ const p=partOf(pid); return {placement,playerId:p?.playerId||null,registrationId:p?.registrationId||null,names:team?(memListOf(pid).length?memListOf(pid):[nameOf(pid)]):[nameOf(pid)]}; });
    const [rosters,detailData,directory]=await Promise.all([
      team?new Map():fetchRegistrationFinalRosters(placements.map(p=>p.registrationId)).catch(()=>new Map()),
      team?null:championsData.load().catch(()=>null),
      team?null:loadRecordsPokemonDirectory().catch(()=>null),
    ]);
    const champion=placements.find(p=>p.placement==="champion");
    // 팀전 우승 팀이 치른 경기(BYE 제외)와 각 경기의 세트 결과
    const championTeamSeries=team&&res.champ&&b.graph?(()=>{
      const g=b.graph; const {sp}=evalGraph(g);
      const all=[...g.rounds.flat(),...(g.lb||[]).flat(),...(g.gf?[g.gf]:[]),...(g.reset?[g.reset]:[])];
      return all.flatMap(m=>{ const a=sp(m.a), z=sp(m.b); if(!m.winner||!a||!z||a===BYE||z===BYE||(a!==res.champ&&z!==res.champ)) return []; return [{side:a===res.champ?"a":"b",series:m.series||null}]; });
    })():null;
    const partnerWins=champion?.playerId&&directory
      ? {[champion.playerId]:await fetchPlayerChampionRosters(champion.playerId).catch(()=>[])}
      : {};
    return evaluateTitleAwards({
      titleGroups:data.titleGroups||[],
      event,
      placements:placements.map(p=>({...p,roster:rosters.get(p.registrationId)||null})),
      detailData,
      partnerWins,
      championOrdinal:preview?.roundNum,
      pokemonName:directory?(id=>directory.get(id)?.displayName||""):null,
      championTeamSeries,
    });
  };
  const finishWithTitles=async(event)=>{
    const found=await findTitleAwards(event||linkedContext?.event).catch(()=>[]);
    if(!found.length){ flash("기록에 반영했습니다."); onClose(); return; }
    setAwardPicks(new Set(found.map(a=>a.key)));
    setAwards(found);
  };
  const grantTitles=async()=>{
    setAwardBusy(true);
    const chosen=awards.filter(a=>awardPicks.has(a.key));
    const ok=await save({...data,titleGroups:applyTitleAwards(data.titleGroups||[],chosen)});
    setAwardBusy(false);
    flash(ok?"기록과 칭호에 반영했습니다.":"기록은 반영했지만 칭호는 저장하지 못해 이 화면에만 반영됐습니다.");
    onClose();
  };
  const skipTitles=()=>{ if(awardBusy) return; flash("기록에 반영했습니다."); onClose(); };
  const commit=async()=>{
    if(!preview||applying) return;
    setApplying(true);
    try{ await commitRecords(); }finally{ setApplying(false); }
  };
  const commitRecords=async()=>{
    try{
      const participants=b.participants||[];
      const actualParticipants=team ? participants.filter(p=>Array.isArray(p?.members)) : participants;
      if(!actualParticipants.length || actualParticipants.some(p=>!p.entryId)){
        throw new Error("대진표에 참가자 정보가 모두 연결되지 않아 기록을 반영할 수 없습니다.");
      }
      if(team) await validateEventTeamEntries(b.eventId,actualParticipants);
      else await validateEventParticipantEntries(b.eventId,participants);
      const completed=await applyEventRecord(b.eventId,b,res,buildChampionshipRecordApplyCompletionOptions({
        event: linkedContext?.event,
        roundNumber: preview.roundNum,
        revealOfficialRosters: true,
      }));
      await onNormalizedApplied?.(completed);
      await finishWithTitles(linkedContext?.event);
    }catch(error){
      // 한 트랜잭션이라 반쯤 반영된 상태는 없다. 응답만 끊겼는지 대회 상태로 확인한다.
      let currentEvent=null;
      try{ currentEvent=await getEvent(b.eventId); }catch{ /* 확인하지 못하면 실패로 안내한다 */ }
      if(isRecordApplyCompletionConfirmed(currentEvent,{requireTeamReveal:true})){
        await onNormalizedApplied?.(currentEvent);
        flash("응답이 끊겼지만 다시 확인해 보니 기록은 반영되었습니다.");
        onClose();
        return;
      }
      flash(`기록을 반영하지 못했습니다. 바뀐 내용은 없습니다. ${error?.message||"원인을 확인하지 못했습니다."}`);
    }
  };
  if(awards){
    const toggle=(key)=>setAwardPicks(cur=>{ const next=new Set(cur); next.has(key)?next.delete(key):next.add(key); return next; });
    return (<Modal title="칭호 획득" hint="이번 대회로 칭호 조건을 만족한 트레이너가 있습니다. 칭호에도 반영할까요?" onClose={skipTitles}>
      <div className="swap" key="titles">
        <div className="bk-chg">{awards.map(a=>(
          <label className="bk-chg-row bk-award" key={a.key}>
            <input type="checkbox" checked={awardPicks.has(a.key)} onChange={()=>toggle(a.key)}/>
            <b>{a.groupKey==="partner"?a.title:a.holder}</b>
            <span className="bk-exist old">{a.label}</span>
            <span className="bk-chg-cnt">{a.reason}</span>
          </label>
        ))}</div>
        <div className="modal-actions">
          <Button onClick={skipTitles} disabled={awardBusy}>나중에</Button>
          <Button variant="primary" onClick={grantTitles} disabled={awardBusy||!awardPicks.size} loading={awardBusy}>칭호에 반영</Button>
        </div>
      </div>
    </Modal>);
  }
  if(preview){
    const changes=Object.entries(preview.deltas).map(([name,d])=>{ const cur=rankRows.find(r=>r.name===name); return {name,isNew:!cur,curPts:cur?.points||0,d}; });
    return (<Modal title="반영 전 확인" hint={excluded
      ? "아래 내용으로 공식 기록에 반영합니다. 챔피언스 성적은 랭킹에 반영되지 않습니다."
      : "아래 내용으로 기록에 반영합니다. 포인트 변동을 확인한 뒤 진행해 주세요."} onClose={()=>{ if(!applying) setPreview(null); }}>
      <div className="swap" key="pre">
      <div className="bk-applybox">
        <div className="bk-ab-meta">{team?"팀전":"개인전"}{champ?" 챔피언스 시리즈":""}</div>
        <div>{curT.label} <b>{preview.roundNum}회</b>{recordSeason?`, ${recordSeason}`:""}{rule.trim()?`, ${rule.trim()}`:""}</div>
        <div>우승 <b>{nameOf(res.champ)}</b>{res.ru?<>, 준우승 {nameOf(res.ru)}</>:null}{res.sf.length?<>, 4강 {res.sf.map(nameOf).join(", ")}</>:null}</div>
      </div>
      {linked&&!team&&(
        !!identityPreviewError ||
        identityPreview.some(row=>row.status!=="existing")
      )&&
  <div className="field">
    <span className="field-label">참가자 선수 정보 확인</span>
    {identityPreviewBusy
      ? <div className="bk-hint">선수 정보를 확인하는 중입니다.</div>
      : identityPreviewError
        ? <FormError>{identityPreviewError}</FormError>
        : <div className="bk-chg">
            {identityPreview.map(row=>(
              <div className="bk-chg-row" key={row.participantId}>
                <span className={"bk-exist "+(row.status==="existing"?"old":"new")}>
                  {row.status==="existing"
                    ? "기존 선수"
                    : row.status==="new"
                      ? "신규 선수"
                      : "확인 필요"}
                </span>
                <b>{row.name}</b>
                <span className="bk-hint" style={{marginLeft:"auto"}}>
                  {row.status==="existing"
                    ? "기존 선수 정보 사용"
                    : row.status==="new"
                      ? "기록 반영 시 선수 등록"
                      : "같은 이름의 선수가 여러 명 있음"}
                  {row.willCreateRegistration ? ", 참가 등록 생성 예정" : ""}
                </span>
              </div>
            ))}
          </div>
    }
  </div>
}
      {preview.willRank ? <div className="field"><span className="field-label">누적 랭킹 「{rankEra?.label}」 포인트 변동</span>
        <div className="bk-chg">{changes.map(c=><div className="bk-chg-row" key={c.name}>
          <span className={"bk-exist "+(c.isNew?"new":"old")}>{c.isNew?"랭킹 신규":"랭킹 기존"}</span><b>{c.name}</b>
          <span className="bk-chg-pts">{c.curPts}<Icon n="arrow" size={16}/>{r1(c.curPts+c.d.points)}</span>
          {c.d.points?<span className="bk-chg-d">+{r1(c.d.points)}</span>:null}
          {(c.d.win||c.d.ru||c.d.top4)?<span className="bk-chg-cnt">{c.d.win?`승+${c.d.win} `:""}{c.d.ru?`준+${c.d.ru} `:""}{c.d.top4?`4강+${c.d.top4}`:""}</span>:null}
        </div>)}</div>
      </div> : <div className="bk-hint">{excluded?`${curT.label}은(는) 누적 랭킹과 시즌별 성적에 반영되지 않고 회차 기록에만 추가됩니다.`:"누적 랭킹 반영이 꺼져 있어 회차 기록에만 추가됩니다."}</div>}
      {preview.willSeason&&<div className="bk-hint">시즌별 성적 「{recordSeason}」에도 동일한 점수와 성적이 반영됩니다.</div>}
      <div className="modal-actions">
  <Button onClick={()=>setPreview(null)} disabled={applying}>뒤로</Button>
  <Button
    variant="primary"
    onClick={commit}
    disabled={
      applying||
      linked&&!team&&(
        identityPreviewBusy||
        !!identityPreviewError||
        identityPreview.some(row=>row.status==="ambiguous")
      )
    }
   loading={applying}>이대로 반영</Button>
</div>
      </div>
    </Modal>);
  }
  return (<Modal
    title="기록에 반영"
    hint={linked
      ? "연결된 대회의 정보와 규칙을 기준으로 기록을 반영합니다."
      : "수동 대회 정보를 설정해 기록에 반영합니다."}
    onClose={onClose}
  >
    <div className="swap" key="form">
      <p className="t12 dim bk-apply-meta">순위, {team?"팀전":"개인전"}
          {linked&&linkedContext?.event?.division
            ? `, ${linkedContext.event.division==="master"?"마스터 리그":linkedContext.event.division==="rookie"?"루키 리그":linkedContext.event.division==="light"?"파이컵 라이트":linkedContext.event.division}`
            : ""}</p>
      <dl className="stack bk-apply-places">
        {placements.map((pl,i)=><div className={(i===0?"inv":"pn")+" spec-row"} key={pl.label+pl.pid}><dt className="t12">{pl.label}</dt><dd className="t15">{nameOf(pl.pid)}</dd></div>)}
        {team&&res.sf.length>0&&<div className="pn spec-row"><dt className="t12">4강</dt><dd className="t15">{res.sf.map(nameOf).join(", ")}</dd></div>}
      </dl>

      {linked ? <>
        {linkedContextBusy&&
          <Loader small/>
        }

        {linkedContextError&&
          <FormError>{linkedContextError}</FormError>
        }

        {!linkedContextBusy&&!linkedContextError&&<>
          <div className="bk-grow2">
            <div className="field">
              <span className="field-label">기록 분류</span>
              <div className="bk-hint">
                {curT?.label||"분류 확인 필요"} (연결된 대회 기준)
              </div>
            </div>

            <div className="field">
              <span className="field-label">시즌</span>
              <div className="bk-hint">
                {recordSeason||"시즌 정보 없음"} (연결된 대회 기준)
              </div>
            </div>
          </div>

          <div className="bk-grow2">
            <Field label="회차 번호"><input
                value={roundStr}
                onChange={e=>setRoundStr(e.target.value)}
                placeholder={autoNext}
              /></Field>

            <Field label="날짜 표기"><input
                value={date}
                onChange={e=>setDate(e.target.value)}
                placeholder="2026.09"
              /></Field>
          </div>

          <div className="field">
            <span className="field-label">반영 내용</span>
            <div className="bk-applybox">
              <div><Icon n="check" size={16}/> {curT?.label||"회차"} 기록</div>
              <div>
                {excluded
                  ? "누적 랭킹 미반영"
                  : `누적 랭킹${rankEra?.label?` (${rankEra.label})`:""}`}
              </div>
              <div>
                {excluded||champ
                  ? "시즌별 성적 미반영"
                  : `시즌별 성적 (${recordSeason})`}
              </div>
            </div>
          </div>

          {!excluded&&
            <div className="field">
              <span className="field-label">{rankEra?.label?`${rankEra.label}에 더할 점수`:"등수별 점수"}</span>
              <div className="stack bk-apply-points">
                {placements.map(pl=><div className="pn bk-apply-point" key={pl.label+pl.pid}><span className="t15">{nameOf(pl.pid)}</span><span className="t12 dim">{pl.label}</span><b className="t15 num">+{pl.pts}</b></div>)}
              </div>
            </div>
          }
        </>}
      </> : <>
        <div className="field">
          <span className="field-label">형식</span>
          <Segmented value={champ} onChange={setChamp} ariaLabel="형식" options={[[false,"일반 (파이컵)"],[true,"챔피언스 시리즈"]]}/>
        </div>

        <div className="bk-grow2">
          <div className="field">
            <label htmlFor="bk-add-round">추가할 대회(회차 묶음)</label>
            <Dropdown
              id="bk-add-round"
              value={tkey}
              onChange={setTkey}
              placeholder="대회 선택"
              options={tours.map(t=>({value:t.key,label:t.label}))}
            />
          </div>

          <div className="field">
            <label htmlFor="bk-add-season">시즌</label>
            <Dropdown
              id="bk-add-season"
              value={season}
              onChange={setSeason}
              options={seasons.map(s=>({value:s.name,label:s.name}))}
            />
          </div>
        </div>

        <div className="bk-grow2">
          <Field label="회차 번호"><input value={roundStr} onChange={e=>setRoundStr(e.target.value)}/></Field>

          <Field label="날짜 표기"><input value={date} onChange={e=>setDate(e.target.value)} placeholder="2026.07"/></Field>
        </div>

        <Field label="대회 룰 (선택)"><input value={rule} onChange={e=>setRule(e.target.value)} placeholder="예: 모노타입 / 랜덤 배틀 / 6세대 63"/></Field>

        <div className="field">
          <div className="bk-pts-head"><span className="field-label">등수별 점수{team?" (팀원별 고정 점수)":""}</span><Button variant="link" onClick={copyLastPoints} disabled={lastPoints.busy} loading={lastPoints.busy}>지난 대회와 같게</Button></div>
          {lastPoints.note&&<p className="t12 reg dim bk-pts-note">{lastPoints.note}</p>}
          <div className="bk-pts">
            <div className="bk-pt"><span>우승</span><input aria-label="우승 점수" value={ptWin} onChange={setPt(setPtWin)}/></div>
            <div className="bk-pt"><span>준우승</span><input aria-label="준우승 점수" value={ptRu} onChange={setPt(setPtRu)}/></div>
            {!team&&<div className="bk-pt"><span>4강</span><input aria-label="4강 점수" value={ptSf} onChange={setPt(setPtSf)}/></div>}
          </div>
        </div>

        {team&&alloc.length>0&&
          <div className="field">
            <span className="field-label">팀원별 점수 배분 (개별 수정 가능)</span>
            <div className="bk-alloc">
              {alloc.map(a=>
                <div className="bk-alloc-row" key={a.key}>
                  <span className={"bk-alloc-tag "+(a.label==="우승"?"w":a.label==="준우승"?"r":"s")}>{a.label}</span>
                  <b>{a.member}</b>
                  {badgeFor(a.member)}
                  <span className="bk-alloc-team">{a.team}</span>
                  <input
                    aria-label={`${a.label} 점수`}
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
            누적 랭킹 반영 {excluded?"(이 대회는 제외)":(team?"(점수 배분)":"(승/준/4강 + 점수)")}
          </span>
        </label>

        {bumpRank&&!excluded&&
          <div className="field">
            <label htmlFor="bk-rank-era">반영할 누적 랭킹</label>
            <Dropdown
              id="bk-rank-era"
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
            시즌별 성적 반영 {excluded?"(이 대회는 제외)":champ?"(챔피언스 시리즈는 제외)":(recordSeason?`(${recordSeason})`:"(시즌을 먼저 선택)")}
          </span>
        </label>
      </>}

      <div className="stack bk-dock bk-apply-actions">
        <Button variant="main" icon="check" onClick={prepare} disabled={linked&&linkedContextBusy}>기록에 반영</Button>
        <Button variant="second" onClick={onClose}>나중에</Button>
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
    <div className="bk-draw-h"><h2 className="t20">{done?"대진 확정":"대진 추첨 중"}</h2><span className="t15 bk-draw-cnt num">{Math.min(n,total)} / {total}</span></div>
    {group ? (
      <div className="bk-groups">{b.groups.map((g,gi)=>(
        <div className="bk-group" key={g.id}><div className="bk-group-h">그룹 {g.name}</div>
          <div className="bk-draw-mem">{g.members.map((mem,mi)=>slotFor("g"+gi+"_"+mi,mem,false))}</div>
        </div>))}</div>
    ) : (()=>{ const {centers,totalH}=treeCenters(b.graph.rounds);
      return (<div className="bk-scroll sq" role="region" aria-label="대진표" tabIndex={0}><div className="bk-tree">
        {b.graph.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
          <div className="bk-col-h">{b.graph.kind==="double"?("승자조 "+(ri+1)+"R"):rlabel(r.length)}</div>
          <div className="bk-col-body" style={{height:totalH,"--bk-pitch":(BK_PITCH0*Math.pow(2,ri))+"px"}}>
            {r.map((m,j)=>(<div className="bk-mpos" key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>
              {ri===0
                ? <div className="bk-match sq">{slotFor("m"+j+"_0",m.a.pid,m.a.bye)}{slotFor("m"+j+"_1",m.b.pid,m.b.bye)}</div>
                : <div className="bk-match sq tbd"><div className="bk-slot dwait"><i/></div><div className="bk-slot dwait"><i/></div></div>}
            </div>))}
          </div>
        </div>))}
      </div></div>);
    })()}
    <Dock><Button variant="main" icon={done?"check":"arrow"} onClick={onDone}>{done?"대진 확정":"건너뛰기"}</Button></Dock>
  </div>);
}

/* ===== 사설 대진표 =====
   누구나 만드는 연습용 대진표. 공식 대진표와 같은 보드, 추첨, 이미지 그리기를 쓰지만:
   - 저장은 communityStore 의 별도 행(ypl_private_brackets_v1)뿐이다. 정규화 스키마, 기록 반영, 랭킹, 명예의 전당 경로가 없다.
   - 화면마다 "사설" 표시와 기록 미반영 안내가 붙고, 이미지에도 사설 대진표라고 적힌다.
   - 관리(결과 입력, 다시 추첨, 삭제)는 만들 때 정한 비밀번호로 연다. 사이트 관리자는 언제나 정리할 수 있다. */
const PB_UNLOCK_KEY="ypl-private-brackets:unlocked";
// 연 대진표의 비밀번호. 쓸 때마다 서버가 확인하므로 이 탭이 닫힐 때까지 기억한다.
const readUnlocked=()=>{ try{ return new Map(Object.entries(JSON.parse(sessionStorage.getItem(PB_UNLOCK_KEY)||"{}"))); }catch{ return new Map(); } };
const writeUnlocked=map=>{ try{ sessionStorage.setItem(PB_UNLOCK_KEY,JSON.stringify(Object.fromEntries(map))); }catch{ /* 이 탭에서만 기억 못 함 */ } };
const pbFormat=b=>b.double?"더블 엘리미네이션":"싱글 엘리미네이션";
/* 우승 카드의 나머지 입상: 라벨과 값의 상자가 아니라 기록 > 대회 카드처럼 순위 이름표 뒤에 이름이 오는 줄(Consistency) */
function Places({ res, nameOf }){
  const lines=[["준우승",res.ru?[nameOf(res.ru)]:[]],["4강",(res.sf||[]).map(nameOf)]].filter(([,names])=>names.length);
  return <dl className="stack bk-places">{lines.map(([label,names])=><div className="pn spec-row" key={label}><dt className="t12 dim">{label}</dt><dd className="t15">{names.join(", ")}</dd></div>)}</dl>;
}
const pbStatus=b=>elimResult(b.graph)?.done?"종료":"진행 중";
const pbHasPicks=b=>collectGraphMatches(b.graph).some(m=>m.winner);

function PrivateBracketCreate({ onClose, onCreate }){
  const [name,setName]=useState(""); const [host,setHost]=useState(()=>{ try{return localStorage.getItem("ypl-board-nick")||"";}catch{return "";} });
  const [pin,setPin]=useState(""); const [namesText,setNamesText]=useState(""); const [double,setDouble]=useState("single");
  const [order,setOrder]=useState("random"); const [note,setNote]=useState(""); const [busy,setBusy]=useState(false);
  const names=parseParticipantNames(namesText);
  const submit=async()=>{
    if(busy)return;
    if(!name.trim()){siteAlert("대진표 이름을 입력해 주세요.");return;}
    if(!host.trim()){siteAlert("개설자 닉네임을 입력해 주세요.","대진표를 만든 사람으로 표시됩니다.");return;}
    if(pin.length!==4){siteAlert("관리 비밀번호 4자리를 정해 주세요.","결과 입력과 삭제에 필요합니다. 다른 사람은 대진표를 보기만 합니다.");return;}
    if(names.length<2){siteAlert("참가자를 2명 이상 적어 주세요.","한 줄에 한 명씩, 또는 쉼표로 나눠 적습니다.");return;}
    if(names.length>PRIVATE_BRACKET_MAX){siteAlert(`참가자는 ${PRIVATE_BRACKET_MAX}명까지 넣을 수 있습니다.`);return;}
    setBusy(true);
    try{ await onCreate({name,host,pin,names,double:double==="double",order,note}); }
    finally{ setBusy(false); }
  };
  return (<Modal title="새 사설 대진표" hint="공식 기록과 랭킹에 반영되지 않는 연습용 대진표입니다." onClose={onClose}>
    <div className="swap" key="pb-create">
      <Field label="대진표 이름"><input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 동아리방 금요 연습전" maxLength={40}/></Field>
      <div className="bk-grow2">
        <Field label="개설자 닉네임"><input value={host} onChange={e=>setHost(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></Field>
        <Field label="관리 비밀번호 (숫자 4자리)"><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="결과 입력에 필요" inputMode="numeric"/></Field>
      </div>
      <div className="field"><label htmlFor="pb-names">참가자 {names.length>0&&<span className="tnum">{names.length}명</span>}</label>
        <textarea id="pb-names" value={namesText} onChange={e=>setNamesText(e.target.value)} rows={6} placeholder={"한 줄에 한 명씩 적거나 쉼표로 나눠 붙여넣어 주세요.\n지우\n이슬\n웅"}/></div>
      <div className="field"><span className="field-label">방식</span><Segmented value={double} onChange={setDouble} ariaLabel="대진 방식" options={[["single","싱글 엘리미네이션"],["double","더블 엘리미네이션"]]}/></div>
      <div className="field"><span className="field-label">대진 배치</span><Segmented value={order} onChange={setOrder} ariaLabel="대진 배치" options={[["random","무작위 추첨"],["input","적은 순서대로"]]}/></div>
      {order==="input"&&<p className="bk-hint">1번과 2번, 3번과 4번이 차례로 만나고, 부전승은 뒤쪽 경기에 들어갑니다.</p>}
      <Field label="안내 (선택)"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="규칙, 일정, 장소 등을 적어 주세요."/></Field>
      <div className="modal-actions"><Button onClick={onClose}>취소</Button><Button variant="primary" disabled={busy} onClick={submit} loading={busy}>대진표 만들기</Button></div>
    </div>
  </Modal>);
}

/* 만든 뒤 고칠 수 있는 것: 이름, 개설자, 안내, 참가자 이름(오타). 인원과 대진은 그대로 둔다. */
function PrivateBracketEdit({ b, onClose, onSave }){
  const [name,setName]=useState(b.name); const [host,setHost]=useState(b.host||""); const [note,setNote]=useState(b.note||"");
  const [names,setNames]=useState(()=>b.participants.map(p=>p.name)); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    const clean=names.map(n=>n.trim().slice(0,20));
    if(!name.trim()){siteAlert("대진표 이름을 입력해 주세요.");return;}
    if(clean.some(n=>!n)){siteAlert("참가자 이름을 입력해 주세요.");return;}
    if(new Set(clean).size!==clean.length){siteAlert("같은 이름의 참가자가 있습니다.","이름이 겹치지 않게 고쳐 주세요.");return;}
    setBusy(true);
    try{ await onSave({name:name.trim().slice(0,40),host:host.trim().slice(0,20),note:note.trim().slice(0,1000),
      participants:b.participants.map((p,i)=>({...p,name:clean[i]}))}); }
    finally{ setBusy(false); }
  };
  return (<Modal title="대진표 수정" hint="인원과 대진은 그대로 두고 이름과 안내만 고칩니다." onClose={onClose}>
    <div className="swap" key="pb-edit">
      <Field label="대진표 이름"><input value={name} onChange={e=>setName(e.target.value)} maxLength={40}/></Field>
      <Field label="개설자 닉네임"><input value={host} onChange={e=>setHost(e.target.value)} maxLength={20}/></Field>
      <div className="field"><span className="field-label">참가자 이름</span>
        {names.map((n,i)=><input key={b.participants[i].id} value={n} aria-label={`참가자 ${i+1}`} maxLength={20} style={{marginTop:i?8:0}} onChange={e=>{const v=e.target.value; setNames(cur=>cur.map((x,k)=>k===i?v:x));}}/>)}</div>
      <Field label="안내 (선택)"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}/></Field>
      <div className="modal-actions"><Button onClick={onClose}>취소</Button><Button variant="primary" disabled={busy} onClick={submit} loading={busy}>저장</Button></div>
    </div>
  </Modal>);
}

function PrivateBrackets({ admin, flash, tabs }){
  const [list,setList]=useState(()=>peekRead(PRIVATE_BRACKETS_KEY)||null);
  const [fresh,setFresh]=useState(false);
  const [loadError,setLoadError]=useState("");
  const reload=async()=>{ try{ setList(await freshRead(PRIVATE_BRACKETS_KEY,()=>readCommunity(PRIVATE_BRACKETS_KEY))); setLoadError(""); }catch(error){ setLoadError(error?.message||"사설 대진표를 불러오지 못했습니다."); }finally{ setFresh(true); } };
  useEffect(()=>{ void reload(); },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q,setQ]=useState("");
  const [creating,setCreating]=useState(false);
  const [openId,setOpenId]=useState(()=>new URLSearchParams(window.location.search).get("pb"));
  const [drawId,setDrawId]=useState(null);
  const [unlocked,setUnlocked]=useState(readUnlocked);
  const [busy,setBusy]=useState(false); const [editing,setEditing]=useState(false);
  useEffect(()=>{ const onPop=()=>{ setOpenId(new URLSearchParams(window.location.search).get("pb")||null); setDrawId(null); }; popHandlers.add(onPop); return ()=>{ popHandlers.delete(onPop); }; },[]);
  const sorted=[...(list||[])].sort((a,b)=>(a.createdAt<b.createdAt?1:-1));
  const kw=q.trim().toLowerCase();
  const shown=kw?sorted.filter(b=>[b.name,b.host,...(b.participants||[]).map(p=>p.name)].some(t=>String(t||"").toLowerCase().includes(kw))):sorted;
  const open=openId?(list||[]).find(b=>b.id===openId):null;
  const canEdit=Boolean(open&&(admin||unlocked.has(open.id)));
  const nameOf=pid=>open?.participants?.find(p=>p.id===pid)?.name||pid;

  const openBracket=(b,{draw=false}={})=>{ const url=new URL(window.location.href); url.searchParams.set("tab","private"); url.searchParams.set("pb",b.id);
    pushHistory({...window.history.state,pb:b.id},url); setDrawId(draw?b.id:null); transition(()=>flushSync(()=>setOpenId(b.id)),{shared:"pb-"+b.id}); };
  const closeBracket=()=>{ setDrawId(null); if(window.history.state?.pb) backWith(open?"pb-"+open.id:null);
    else { const url=new URL(window.location.href); url.searchParams.delete("pb"); window.history.replaceState(window.history.state,"",url); transition(()=>flushSync(()=>setOpenId(null)),{shared:open?"pb-"+open.id:null,dir:"back"}); } };
  const unlock=(id,pin)=>{ const next=new Map(unlocked); next.set(id,pin); setUnlocked(next); writeUnlocked(next); };
  const lock=id=>{ const next=new Map(unlocked); next.delete(id); setUnlocked(next); writeUnlocked(next); };
  // 최신 대진표 위에서 바꿔, 다른 기기에서 입력한 결과를 덮지 않는다.
  const write=async(id,change,done)=>{ setBusy(true);
    try{
      const current=(await readCommunity(PRIVATE_BRACKETS_KEY)).find(x=>x.id===id);
      if(!current) throw new Error("삭제되었거나 찾을 수 없는 대진표입니다.");
      const patch=change(current);
      await patchCommunityItem(PRIVATE_BRACKETS_KEY,id,patch,{pin:unlocked.get(id)||""});
      setList(items=>items.map(x=>x.id===id?{...x,...patch}:x));
      if(done)flash(done); return true; }
    catch(error){ siteAlert("저장하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); void reload(); return false; } finally{ setBusy(false); } };

  const create=async({pin,...input})=>{
    let b; try{ b=createPrivateBracket(input); }catch(error){ siteAlert("대진표를 만들 수 없습니다.",error?.message||""); return; }
    setBusy(true);
    try{ await createCommunityItem(PRIVATE_BRACKETS_KEY,b.id,b,{pin}); await reload(); flash("사설 대진표를 만들었습니다."); }
    catch(error){ siteAlert("저장하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); return; }
    finally{ setBusy(false); }
    try{ localStorage.setItem("ypl-board-nick",b.host); }catch{ /* 기억 못 해도 된다 */ }
    unlock(b.id,pin); setCreating(false); openBracket(b,{draw:b.order==="random"});
  };
  const verifyPin=async(title)=>{
    const pin=await sitePrompt({title,body:"대진표를 만들 때 정한 관리 비밀번호를 입력해 주세요.",label:"관리 비밀번호",placeholder:"숫자 4자리",confirmLabel:"열기",secret:true,inputMode:"numeric"});
    if(pin===null)return false;
    const status=await verifyCommunityPin(PRIVATE_BRACKETS_KEY,open.id,pin).catch(()=>"failed");
    if(status!=="ok"){ siteAlert(PIN_DENIED[status]||"비밀번호를 확인하지 못했습니다.","만든 사람에게 확인해 주세요."); return false; }
    unlock(open.id,pin); return true;
  };
  const askUnlock=async()=>{ if(await verifyPin("결과 입력")) flash("이제 승자를 눌러 결과를 입력할 수 있습니다."); };
  const startEdit=async()=>{ if(canEdit||await verifyPin("대진표 수정")) setEditing(true); };
  const saveEdit=async v=>{ if(await write(open.id,()=>({...v,updatedAt:new Date().toISOString()}),"수정했습니다.")) setEditing(false); };
  const pick=(matchId,side)=>{ if(busy||!canEdit)return; const id=open.id; const at=new Date().toISOString();
    setList(items=>items.map(x=>x.id===id?withPick(x,matchId,side):x));
    void write(id,x=>({...withPick(x,matchId,side),updatedAt:at})); };
  const redraw=async()=>{ if(!(await siteConfirm({title:"다시 추첨",body:"참가자는 그대로 두고 대진을 새로 섞습니다.",confirmLabel:"다시 추첨"})))return;
    const id=open.id; let graph;
    try{ graph=buildPrivateGraph(open.participants.map(p=>p.id),{double:open.double,order:"random"}); }catch(error){ siteAlert("다시 추첨하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); return; }
    if(await write(id,()=>({graph,order:"random",updatedAt:new Date().toISOString()}))) setDrawId(id); };
  const del=async()=>{
    let pin=unlocked.get(open.id)||"";
    if(!admin&&!unlocked.has(open.id)){
      pin=await sitePrompt({title:"대진표 삭제",body:"대진표를 만들 때 정한 관리 비밀번호를 입력해 주세요.",label:"관리 비밀번호",placeholder:"숫자 4자리",confirmLabel:"삭제",secret:true,inputMode:"numeric"});
      if(pin===null)return;
    } else if(!(await siteConfirm({title:"대진표 삭제",body:`‘${open.name}’ 사설 대진표를 삭제할까요? 되돌릴 수 없습니다.`,confirmLabel:"삭제",danger:true}))) return;
    const id=open.id;
    try{ await deleteCommunityItem(PRIVATE_BRACKETS_KEY,id,pin); }
    catch(error){ siteAlert("삭제하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); return; }
    await reload(); flash("삭제됨"); lock(id); closeBracket(); };
  const share=async()=>{ const r=await shareLink({view:"bracket",tab:"private",pb:open.id},open.name); if(r==="copied")flash("주소를 복사했습니다."); };

  if(openId&&!open) return (<section className="bk"><div className="bk-open">
    <BackLink to="사설 대진표" onClick={closeBracket}/>
    {fresh?<Empty title="대진표를 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다."/>:<Loader/>}
  </div></section>);

  if(open){ const res=elimResult(open.graph); const live=!res?.done; const pngBracket={...open,private:true};
    return (<section className="bk"><div className="bk-open">
      <header className="bk-head-open">
        <BackLink to="사설 대진표" onClick={closeBracket}/>
        {live&&<p className="bk-live t12"><Status live>{pbStatus(open)}</Status></p>}
        <h1 className="t20 bk-open-title" data-vt={"pb-"+open.id}>{open.name}</h1>
        <p className="t12 dim reg bk-open-line">사설, {open.host?`${open.host} 개설, `:""}{pbFormat(open)}, {open.participants.length}명{open.createdAt?`, ${formatDate(open.createdAt)}`:""}</p>
        {open.note&&<div className="bk-note"><Prose text={open.note}/></div>}
        <p className="pn2 bk-info t12 reg dim"><Icon n="info" size={20}/><span>누구나 만들 수 있는 사설 대진표입니다. 결과는 공식 기록, 랭킹, 칭호에 반영되지 않습니다.</span></p>
        <div className="stack bk-actions">
          {canEdit
            ? <>{!admin&&<Button variant="second" onClick={()=>lock(open.id)}>입력 마치기</Button>}
                {!pbHasPicks(open)&&<Button variant="second" disabled={busy} onClick={redraw}>다시 추첨</Button>}</>
            : <Button variant="second" onClick={askUnlock}>결과 입력</Button>}
          <Button variant="second" onClick={share}>링크 공유</Button>
          <Button variant="second" onClick={()=>downloadBracketPng(pngBracket,nameOf)}>대진표 이미지</Button>
          {res?.done&&<Button variant="second" onClick={()=>downloadChampionPng(pngBracket,res,nameOf)}>우승 이미지</Button>}
          <Button variant="second" disabled={busy} onClick={startEdit}>수정</Button>
          {(canEdit||admin)&&<Button variant="second" disabled={busy} onClick={del}>삭제</Button>}
        </div>
        {canEdit&&<p className="t12 dim reg bk-pick-hint">이긴 쪽 이름을 누르면 다음 경기로 올라갑니다. 같은 쪽을 다시 누르면 취소됩니다.</p>}
      </header>
      {drawId===open.id
        ? <BracketDraw b={open} onDone={()=>setDrawId(null)}/>
        : <div className="bk-board swap">
            {res?.done&&<section className="bk-result" aria-labelledby="pb-champ-name">
              <div className="inv bk-winner"><span className="t12">우승</span><h2 className="t20" id="pb-champ-name">{nameOf(res.champ)}</h2></div>
              {(res.ru||(res.sf&&res.sf.length>0))&&<Places res={res} nameOf={nameOf}/>}
            </section>}
            <ElimBoard g={open.graph} nameOf={nameOf} admin={canEdit&&!busy} onPick={pick} seedOf={pid=>{const i=open.participants.findIndex(x=>x.id===pid);return open.order==="input"&&i>=0?i+1:null;}}/>
          </div>}
      {editing&&<PrivateBracketEdit b={open} onClose={()=>setEditing(false)} onSave={saveEdit}/>}
    </div></section>);
  }

  return (<section className="bk">
    <header className="bk-head"><h1 className="t32">대진표</h1></header>
    {tabs}
    <p className="pn2 bk-info t12 reg dim"><Icon n="info" size={20}/><span>누구나 만들 수 있는 사설 대진표입니다. 결과는 공식 기록, 랭킹, 칭호에 반영되지 않습니다.</span></p>
    <div className="bk-new"><Button variant="main" icon="plus" onClick={()=>setCreating(true)}>새 사설 대진표</Button></div>
    <div className="bk-search"><ListSearch q={q} setQ={setQ} placeholder="대진표, 개설자, 참가자 검색" count={shown.length}/></div>
    {loadError&&<ErrorNote onRetry={reload}>{loadError}</ErrorNote>}
    {!list&&!loadError?<Loader/>:shown.length===0
      ? (kw?<Empty className="swap" title="검색 결과가 없습니다." desc={`‘${kw}’에 맞는 사설 대진표를 찾지 못했습니다.`}/>
           :<Empty className="swap" title="아직 사설 대진표가 없습니다." desc="참가자 이름만 적으면 바로 대진을 추첨하고, 링크로 결과를 함께 볼 수 있습니다."/>)
      : <div className="stack bk-rows">{shown.map(b=><BracketRow key={b.id} b={b} vt={"pb-"+b.id} live={pbStatus(b)==="진행 중"}
          line={`${b.host?`${b.host} 개설, `:""}${b.participants.length}명, ${pbFormat(b)}`} onOpen={()=>openBracket(b)}/>)}</div>}
    {creating&&<PrivateBracketCreate onClose={()=>setCreating(false)} onCreate={create}/>}
  </section>);
}
/* ===== 사설 대진표 끝 ===== */

function BracketRow({ b, vt, live, line, end, onOpen }){
  const d=dotDate(b.createdAt);
  return <Row title={<span data-vt={vt}>{b.name}</span>} line={line} onClick={onOpen}
    value={live?<Status live>진행 중</Status>:<Status>{end||(d?<><span className="num">{d.day}</span> 종료</>:"종료")}</Status>}/>;
}

/* ===== 대진표 메인 ===== */
export default function BracketsPage({ data, admin, save, flash, refresh }){
  // 다시 들어오면 지난 조회 결과로 바로 그리고, 새 조회가 끝나면 바뀐 경우에만 다시 그린다(관리자는 늘 새 결과만).
  const seenRows=useRef(admin?undefined:peekRead("brackets"));
  const [normalizedBrackets,setNormalizedBrackets]=useState(()=>(seenRows.current||[]).map(row=>row.bracket));
  const [normalizedLoadError,setNormalizedLoadError]=useState("");
  const [normalizedInitialReady,setNormalizedInitialReady]=useState(Boolean(seenRows.current));
  const loadNormalized=async({initial=false}={})=>{
    try{
      const rows=await freshRead("brackets",listNormalizedBracketRuntimes);
      if(rows!==seenRows.current){ seenRows.current=rows; setNormalizedBrackets(rows.map(row=>row.bracket)); }
      setNormalizedLoadError("");
      return rows;
    }catch(error){
      setNormalizedLoadError(error?.message||"대진표를 불러오지 못했습니다.");
      return [];
    }finally{
      if(initial) setNormalizedInitialReady(true);
    }
  };
  useEffect(()=>{ void loadNormalized({initial:true}); },[]);
  // A deep link is consumed once; afterwards ?eventId= only mirrors the open bracket.
  const requestedEventIdRef=useRef(new URLSearchParams(window.location.search).get("eventId"));
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
  // 관람 중인 진행 대진표는 화면이 보이는 동안 15초마다 그 대회의 경기만 확인하고, 달라졌을 때 전체를 다시 읽는다.
  // 경기 밖의 변화(기록 반영)는 2분마다의 전체 조회가 따라잡는다.
  // 관리자는 자기 쓰기 뒤에 이미 다시 읽고, 바뀐 것이 없으면 다시 그리지 않는다.
  const liveEventId=!admin&&!drawId&&open?.status==="active"&&open?.projection?.source==="normalized"?open.eventId:null;
  const liveRuntimeId=open?.projection?.runtimeId||null;
  useEffect(()=>{
    if(!liveEventId) return undefined;
    let busy=false, stamp=null, sameTicks=0;
    const tick=async()=>{
      if(busy||document.visibilityState!=="visible") return;
      busy=true;
      try{
        const next=await readBracketMatchStamp(liveEventId);
        if(next===stamp&&++sameTicks<8) return;
        stamp=next; sameTicks=0;
        const loaded=await fetchNormalizedSingleBracketRuntime(liveEventId,liveRuntimeId);
        if(loaded?.bracket) setNormalizedBrackets(prev=>prev.map(b=>b.eventId===liveEventId&&JSON.stringify(b)!==JSON.stringify(loaded.bracket)?loaded.bracket:b));
      }catch{ /* 다음 차례에 다시 읽는다 */ }
      finally{ busy=false; }
    };
    const iv=setInterval(tick,15000);
    const onVisible=()=>{ if(document.visibilityState==="visible") void tick(); };
    document.addEventListener("visibilitychange",onVisible);
    return ()=>{ clearInterval(iv); document.removeEventListener("visibilitychange",onVisible); };
  },[liveEventId,liveRuntimeId]);
  useEffect(()=>{
    if(!requestedEventIdRef.current) return;
    const target=list.find(b=>b.eventId===requestedEventIdRef.current);
    if(!target) return;
    requestedEventIdRef.current=null;
    setOpenId(target.id);
  },[normalizedInitialReady,normalizedBrackets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep ?eventId= in step with the open bracket, so refresh and shared links
  // match the screen and a closed bracket does not reopen.
  useEffect(()=>{
    if(!normalizedInitialReady) return;
    const url=new URL(window.location.href);
    if(open?.eventId) url.searchParams.set("eventId",open.eventId); else url.searchParams.delete("eventId");
    if(url.href!==window.location.href) window.history.replaceState(window.history.state,"",url);
  },[open?.eventId,normalizedInitialReady]);
  // Opening a bracket is a history entry, so the phone's back button returns
  // to the list instead of leaving the bracket page.
  const openBracket=(b)=>{
    const url=new URL(window.location.href);
    if(b.eventId) url.searchParams.set("eventId",b.eventId); else url.searchParams.delete("eventId");
    pushHistory({...window.history.state,bracketId:b.id},url);
    transition(()=>flushSync(()=>setOpenId(b.id)),{shared:"b-"+b.id});
  };
  const closeBracket=()=>{
    setDrawId(null);
    if(window.history.state?.bracketId) backWith(open?"b-"+open.id:null);
    else transition(()=>flushSync(()=>setOpenId(null)),{shared:open?"b-"+open.id:null,dir:"back"});
  };
  // Back and forward reach the open bracket through App's page transition, in the same render as the view.
  useEffect(()=>{
    const onPop=()=>{ setOpenId(window.history.state?.bracketId||null); setDrawId(null); };
    popHandlers.add(onPop);
    return ()=>{ popHandlers.delete(onPop); };
  },[]);
  const create=async(b)=>{
    const normalizedCandidate=Boolean(
      b.eventId&&b.format==="elim"&&(b.mode==="single"||b.mode==="team")
    );
    if(!normalizedCandidate){
      flash("대회와 연결된 싱글, 더블, 팀전 대진표만 만들 수 있습니다.");
      return false;
    }
    if(normalizedCandidate){
      if(b.eventId&&list.some(existing=>existing.eventId===b.eventId)){
        flash("이 대회에 연결된 대진표가 이미 있습니다.");
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
        if(!loaded) throw new Error("만든 대진표를 다시 불러오지 못했습니다.");
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
        flash("대회를 생성했습니다.");
        return true;
      }catch(error){
        await loadNormalized();
        flash(`대진표를 만들지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);
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
        const attempt=buildNormalizedRuntimeCreateAttempt(confirmedParticipants,{plan:b.plan||null});
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
        if(!loaded) throw new Error("만든 대진표를 다시 불러오지 못했습니다.");
        await syncNormalizedBracketMatches(b.eventId,loaded.bracket);
        loaded=await fetchNormalizedBracketRuntime(b.eventId,attempt.runtimeId);
        if(!loaded) throw new Error("경기를 만든 뒤 대진표를 다시 불러오지 못했습니다.");
        const presentation=beginNormalizedBracketDraw(loaded.bracket);
        setNormalizedBrackets(previous=>[
          ...previous.filter(row=>row.eventId!==b.eventId),
          presentation.bracket,
        ]);
        setOpenId(presentation.openId);
        setDrawId(presentation.drawId);
        flash("대회를 생성했습니다.");
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
          ? `대진표를 만들지 못했고 참가 확정도 되돌리지 못했습니다. ${error?.message||"원인을 확인하지 못했습니다."} / ${cleanupError?.message||"원인을 확인하지 못했습니다."}`
          : `대진표를 만들지 못해 참가 확정을 되돌렸습니다. ${error?.message||"원인을 확인하지 못했습니다."}`);
        return false;
      }
    }
  };
  const del=async(b)=>{
    if(b.readOnly){ flash("이미 끝난 과거 대진표는 볼 수만 있습니다."); return; }
    if(b.applied){siteAlert("기록 반영을 먼저 취소해 주세요.","기록 반영 취소 후 대진표를 삭제할 수 있습니다.");return;}
    if(deletingRef.current)return;
    if(!(await siteConfirm({title:"대진표 삭제",body:`‘${b.name}’ 대회를 삭제할까요?`,confirmLabel:"삭제",danger:true})))return;
    if(deletingRef.current)return;
    deletingRef.current=true;
    setDeletingId(b.id);

    try{

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
          closeBracket();
          flash("대진표를 삭제했습니다.");
        }catch(error){
          const rows=await loadNormalized();
          const runtimeStillExists=(rows||[]).some(row=>
            row?.bracket?.eventId===b.eventId
            && row?.bracket?.projection?.runtimeId===b.projection?.runtimeId
          );
          if(!runtimeStillExists){
            closeBracket();
            flash("대진표를 삭제했습니다.");
          }else{
            flash(`대진표를 삭제하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);
          }
        }
        return;
      }

      flash("과거 대진표는 진행할 수 없습니다.");
    }finally{
      deletingRef.current=false;
      setDeletingId(null);
    }
  };
  // 공식과 사설은 한 화면의 두 탭(?tab=private). 사설 탭은 공식 대진표의 상태와 저장을 전혀 쓰지 않는다.
  const [tab,setTab]=useState(()=>new URLSearchParams(window.location.search).get("tab")==="private"?"private":"official");
  const changeTab=t=>{ setTab(t); const url=new URL(window.location.href); if(t==="private")url.searchParams.set("tab","private"); else url.searchParams.delete("tab"); url.searchParams.delete("pb"); window.history.replaceState(window.history.state,"",url); };
  const tabsEl=()=><div className="bk-tabs"><TabsLine value={tab} onChange={changeTab} label="대진표 종류" options={[["official","공식"],["private","사설"]]}/></div>;
  if(tab==="private"&&!open) return <PrivateBrackets admin={admin} flash={flash} tabs={tabsEl()}/>;
  const bracketFormat=(b)=>b.format==="group"?"조별예선과 본선":(b.double?"더블 엘리미네이션":"싱글 엘리미네이션");
  const winnerOf=(b)=>{ const r=b.format==="group"?(b.knockout?elimResult(b.knockout):null):elimResult(b.graph); return r?.done?(b.participants||[]).find(p=>p.id===r.champ)?.name||"":""; };
  const statusTag=(b)=>{ const r=b.format==="group"?(b.knockout?elimResult(b.knockout):null):elimResult(b.graph); if(b.applied||(r&&r.done))return admin?(b.applied?"기록 반영됨":"기록 반영 전"):"종료"; return"진행 중"; };
  const lineOf=(b)=>[`${(b.participants||[]).length}${b.mode==="team"?"팀":"명"}`, b.mode==="team"?"팀전":"", bracketFormat(b), statusTag(b)!=="진행 중"&&winnerOf(b)?`우승 ${winnerOf(b)}`:""].filter(Boolean).join(", ");
  return (<section className="bk">
    {!open&&!wizard&&<header className="bk-head">
      <h1 className="t32">대진표</h1>
      {admin&&<Button variant="link" disabled={!!deletingId} onClick={()=>setWizard(true)}>새 대진표</Button>}
    </header>}
    {!open&&!wizard&&normalizedLoadError&&<ErrorNote>대진표를 불러오지 못했습니다. {normalizedLoadError}</ErrorNote>}
    {!open&&!wizard&&tabsEl()}
    {!open&&!wizard&&<div className="bk-list swap">
      {!normalizedInitialReady
        ? <Loader/>
        : list.length===0&&<Empty title="아직 만들어진 대진표가 없습니다." desc="참가자를 등록하고 대진을 생성하면 결과가 기록에 자동으로 반영됩니다.">
            {admin&&<Button variant="second" onClick={()=>setWizard(true)}>첫 대진표 만들기</Button>}
          </Empty>}
      {list.length>0&&<div className="stack bk-rows">{list.map(b=><BracketRow key={b.id} b={b} vt={"b-"+b.id} live={statusTag(b)==="진행 중"}
        line={lineOf(b)} end={admin&&statusTag(b)!=="진행 중"?statusTag(b):null} onOpen={()=>openBracket(b)}/>)}</div>}
    </div>}
    {open&&!wizard&&<div className="bk-open">
      <header className="bk-head-open">
        <BackLink to="대진표" onClick={deletingId===open.id?undefined:closeBracket}/>
        {statusTag(open)==="진행 중"&&<p className="bk-live t12"><Status live>진행 중</Status></p>}
        <h1 className="t20 bk-open-title" data-vt={"b-"+open.id}>{open.name}</h1>
        <p className="t12 dim reg bk-open-line">{open.mode==="team"?"팀전":"개인전"}, {bracketFormat(open)}, {(open.participants||[]).length}{open.mode==="team"?"팀":"명"}{open.createdAt?`, ${formatDate(open.createdAt)}`:""}{admin&&statusTag(open)!=="진행 중"?`, ${statusTag(open)}`:""}</p>
        {!open.readOnly&&admin&&<div className="stack bk-actions"><Button variant="second" disabled={!!open.applied||deletingId===open.id} title={open.applied?"기록 반영 취소 후 삭제할 수 있습니다.":""} onClick={()=>del(open)}>{deletingId===open.id?"삭제 중…":"삭제"}</Button></div>}
      </header>
       {drawId===open.id ? <BracketDraw b={open} onDone={()=>setDrawId(completeNormalizedBracketDraw())}/> : <BracketBoard b={open} admin={admin} flash={flash} readOnly={open.readOnly} refreshNormalized={loadNormalized} onNormalizedReverted={loadNormalized} deleting={deletingId===open.id} onApply={(b,res)=>setApply({b,res})}/>}
    </div>}
    {wizard&&<BracketWizard data={data} onClose={()=>setWizard(false)} onCreate={create}/>}
     {apply&&<BracketApply b={apply.b} res={apply.res} data={data} save={save} flash={flash} refresh={refresh} onNormalizedApplied={loadNormalized} onClose={()=>{setApply(null);void loadNormalized();}}/>}
  </section>);
}

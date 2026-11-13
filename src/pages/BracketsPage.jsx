import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { backWith, popHandlers, pushHistory } from "../components/layout/history.js";
import { formatDate } from "../services/dateFormat.js";
import { josa } from "../services/josa.js";
import { Button, Dropdown, Empty, ErrorNote, Field, FormError, Icon, ListSearch, Loader, Modal, Prose, STAGGER, Segmented, siteAlert, siteConfirm, sitePrompt, transition } from "../components/index.js";
import { BackLink, Counter, Dock, Lead, Row, Status, Steps, TabsLine, Toast, useArrival } from "../components/common/Board.jsx";
import { reduced } from "../components/common/motion.js";
import { dotDate } from "../services/dateFormat.js";
import { addChampionshipQualifierManualRegistration, applyEventRecord, recommendChampionshipDirectEntrants, resetSubmissionPin, revertEventRecord, championsData, fetchPlayerChampionRosters, fetchRegistrationFinalRosters, buildChampionshipRecordApplyCompletionOptions, buildNormalizedRuntimeCreateAttempt, buildNormalizedSingleCreateAttempt, championshipEventPickerLabel, confirmEventTeamsForBracket, createChampionshipAdvancement, createNormalizedBracketRuntime, deleteNormalizedBracketRuntime, deleteNormalizedSingleBracketRuntime, ensureChampionshipHallOfFameEntry, listChampionshipManualParticipantCandidates, fetchNormalizedBracketRuntime, fetchNormalizedSingleBracketRuntime, readBracketMatchStamp, getEvent, sitePlayed, getEventRecordContext, getIndividualPlacementPointPolicy, inspectEventParticipantIdentities, lastPlacementPoints, isRecordApplyCompletionConfirmed, listChampionshipQualifierDirectSelectionIds, listEventRegistrationSubmissionStatuses, listEventRegistrations, listNormalizedBracketRuntimes, loadPrivateAnswers, listSubmissionEvents, preflightChampionshipFinalBracket, rollbackEventParticipantIdentityChanges, setChampionshipQualifierDirectSelections, setNormalizedSingleBracketWinner, readMatchOutcomes, setNormalizedMatchOutcome, syncNormalizedBracketMatches, validateEventParticipantEntries, validateEventTeamEntries } from "../services/index.js";
import { buildDefaultTeamMatchLineups, buildTeamMatchSeries, getTeamMatchLineupOptions, getTeamRegistrationAnswerEntries } from "../services/bracketTeamParticipants.js";
import { getTeamPlacementPointPolicy } from "../services/bracketRankingAwardSnapshot.js";
import { buildBracketSubmissionStatusModel, playerNameKey } from "../services/teamBuilderCore.js";
import { buildBracketPageList } from "../services/historicalBracketReadModel.js";
import { beginNormalizedBracketDraw, completeNormalizedBracketDraw } from "../services/bracketDrawLifecycle.js";
import { ChampionsBracketControls } from "../components/ChampionsBracketControls.jsx";
import { applyTitleAwards, evaluateTitleAwards, revertTitleAwards } from "../services/titleAwards.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { drawPlan } from "../services/bracketProjection.js";
import { GROUP_TOPOLOGY, groupDraw, validateGroupConfig } from "../services/groupBracketCore.js";
import { createGroupFinal, createGroupPlayoff, createIndividualBracketDraw, listSameRoundRookieChampions, reopenGroupStage, setGroupFinalWinner, setGroupStageWinner } from "../services/normalizedCompetitionService.js";
import { BYE, clearedByPick, collectGraphMatches, evalGraph, withPick, withSeries } from "../services/bracketWinnerPlan.js";
import { matchStage } from "../services/recordsAnalytics.js";
import { battleForMatch, battleHref, battleWinnerEntry, listEventBattles, officialBattleHref, retryBattleApply, voidBattle } from "../services/battleService.js";
import { parseBoutKey, teamBouts } from "../services/teamBouts.js";
import Seg from "../components/common/Seg.jsx";
import { WORDMARK_PATH } from "../components/layout/SiteHeader.jsx";
import { PRIVATE_BRACKETS_KEY, createCommunityItem, deleteCommunityItem, patchCommunityItem, readCommunity, readErrorText, shareLink, verifyCommunityPin } from "../services/communityStore.js";
import { PIN_DENIED } from "../services/communityItems.js";
import { PRIVATE_BRACKET_MAX, buildPrivateBracketPatch, buildPrivateGraph, createPrivateBracket, parseParticipantNames } from "../services/privateBracket.js";
import { leagueIntakeId, leagueIntakeOptions } from "../services/leagueIntake.js";

const uid = () => Math.random().toString(36).slice(2, 9);

/* ============================== 대진표 (Bracket) ============================== */
const nextPow2=n=>{let p=1;while(p<n)p*=2;return p;};

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
  if(group.standing) return group.standing.rows.map(row=>({name:row.id,wins:row.wins}));
  const w={}; group.members.forEach(m=>w[m]=0);
  group.matches.forEach(mt=>{ if(mt.winner==="a")w[mt.a.pid]++; else if(mt.winner==="b")w[mt.b.pid]++; });
  return [...group.members].sort((x,y)=>w[y]-w[x]).map(name=>({name,wins:w[name]}));
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
  const [topologyKind,setTopologyKind]=useState("");
  const [groupFinalFormat,setGroupFinalFormat]=useState("single_elimination");
  const dbl=topologyKind==="double_elimination";
  const [format,setFormat]=useState("elim");     // elim | group
  const [countStr,setCountStr]=useState("8");
  const count=Math.max(0,parseInt(countStr)||0);
  const [groups,setGroups]=useState("2");
  const [adv,setAdv]=useState("2");
  const [teams,setTeams]=useState(Array(8).fill(null).map(()=>({name:"",members:""})));
  const [events,setEvents]=useState([]);
  const [eventListLoading,setEventListLoading]=useState(true);
  const [eventId,setEventId]=useState("");
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
  const eventRequestRef=useRef(0);

  useEffect(()=>{
    let cancelled=false;
    listSubmissionEvents()
      .then(rows=>{ if(!cancelled) setEvents([...(rows||[])].sort((a,b)=>{
        const phaseOrder=value=>value==="qualifier"?0:value==="final"?1:2;
        const phaseDiff=phaseOrder(a.championship_phase)-phaseOrder(b.championship_phase);
        return phaseDiff||String(a.name||"").localeCompare(String(b.name||""),"ko");
      })); })
      .catch(error=>{ if(!cancelled) setEventError(error?.message||"대회 목록을 불러오지 못했습니다."); })
      .finally(()=>{ if(!cancelled) setEventListLoading(false); });
    return ()=>{ cancelled=true; };
  },[]);
  const selectLinkedEvent=async(id,{preserveDirectIds=null,preserveSelectedIds=null}={})=>{
    const request=++eventRequestRef.current;
    setEventId(id);
    normalizedAttemptRef.current=null;
    setEventError("");
    setEventRegs([]);
    setSelectedRegistrationIds([]);
    setSubmissionStatuses([]);
    setSubmissionStatusError("");
    setDirectRegistrationIds([]);
    setChampionshipManualOpen(false);
    setChampionshipManualCandidates([]);
    setChampionshipManualPlayerId("");
    setChampionshipManualReason("");
    if(!id){setEventBusy(false);return;}

    const event=events.find(x=>x.id===id);
    if(!event) return;

    setName(event.name||"");
    setMode(event.is_team_event?"team":"single");

    setFormat("elim");
    setTopologyKind("");
    setAddedParticipants([]);

    setEventBusy(true);
    try{
      const [registrationResult, directSelectionResult, championResult] = await Promise.allSettled([
        listEventRegistrations(id),
        event.championship_phase === "qualifier" ? listChampionshipQualifierDirectSelectionIds(id) : Promise.resolve([]),
        leagueIntakeId(event)&&event.division==="master" ? listSameRoundRookieChampions(id) : Promise.resolve([]),
      ]);
      if (registrationResult.status === "rejected") throw registrationResult.reason;
      // 팀 지망 같은 비공개 답은 운영진만 읽는 표에서 따로 온다(docs/db/private_answers.sql)
      const loaded = registrationResult.value || [];
      if(championResult.status==="rejected") throw championResult.reason;
      const champions=championResult.value||[];
      const championIds=new Set(champions.map(row=>row.player_id));
      const hidden = await loadPrivateAnswers(loaded.map(r=>r.id));
      const realRegs = loaded.map(r=>({
        ...r,
        ...(hidden.has(r.id)?{registration_data:{...r.registration_data,answers:{...r.registration_data?.answers,...hidden.get(r.id)}}}:{}),
        rookieChampion:championIds.has(r.player_id),
      }));
      const regs=[...realRegs,...champions.filter(c=>!loaded.some(r=>r.id===c.registration_id||r.player_id===c.player_id)).map(c=>({
        id:`rookie:${c.player_id}`,player_id:c.player_id,registration_name:c.registration_name||c.display_name,
        rookieChampion:true,candidateOnly:true,
      }))];
      let statuses=[];
      try{ statuses=await listEventRegistrationSubmissionStatuses(id,realRegs); }
      catch(statusError){ if(request===eventRequestRef.current)setSubmissionStatusError(statusError?.message || "제출 상태를 불러오지 못했습니다."); }
      if(request!==eventRequestRef.current)return;
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

      if(event.is_team_event){
        setCountStr("8");
        setTeams(Array(8).fill(null).map(()=>({name:"",members:""})));
      }
    }catch(error){
      if(request!==eventRequestRef.current)return;
      setEventError(error?.message||"신청자 목록을 불러오지 못했습니다.");
      setSubmissionStatusError(error?.message || "제출 상태를 불러오지 못했습니다.");
    }finally{
      if(request===eventRequestRef.current)setEventBusy(false);
    }
  };

  const setCnt=(v)=>{ const s=String(v).replace(/[^0-9]/g,"").slice(0,2); setCountStr(s); const n=parseInt(s)||0;
    if(n>=1&&n<=64){
      setTeams(p=>{const a=[];for(let i=0;i<n;i++)a.push(p[i]||{name:"",members:""});return a;}); } };
  const gN=Number(groups), aN=Number(adv);
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
          registrationId:r.candidateOnly?null:r.id,
          playerId:r.player_id||null,
          rookieChampion:r.candidateOnly
        }))
        .filter(p=>p.name);

      const added=linkedEvent?.championship_phase ? [] : addedParticipants
        .map(n=>({id:uid(),name:(n||"").trim()}))
        .filter(p=>p.name);

      return [...registered,...added];
    }

    return [];
  };
  const go=async()=>{
    if(creating)return;
    if(!topologyKind){setEventError("대진 방식을 선택해 주세요.");return;}
    if(linkedEvent?.championship_phase === "qualifier"){
      try{
        await setChampionshipQualifierDirectSelections(linkedEvent.id,directRegistrationIds);
      }catch(error){ setEventError(error?.message||"본선 직행자를 저장하지 못했습니다."); return; }
    }
    let parts=(step===3&&placement?.parts)||buildParticipants();
    if(parts.length<2){ setEventError(linkedEvent?.championship_phase==="final"?"본선 진출자를 먼저 확정해 주세요.":"참가자(팀)를 2개 이상 입력해 주세요."); return; }
    if(!eventId){setEventError("대회와 연결된 대진표를 만들어 주세요.");return;}
    if(format==="group"){
      try{validateGroupConfig(parts.length,gN,aN,groupFinalFormat);}
      catch(error){setEventError(error.message);return;}
    }
    if(linkedEvent?.championship_phase === "final"){
      try{
        const preflight=await preflightChampionshipFinalBracket(linkedEvent.id);
        if(!preflight.ok){ setEventError(preflight.error); return; }
      }catch(error){ setEventError(error?.message||"본선 대진표 생성 조건을 확인하지 못했습니다."); return; }
    }
    if(dbl&&parts.length<3){setEventError("더블 엘리미네이션은 참가자가 3명 이상이어야 합니다.");return;}
    if(new Set(parts.map(p=>playerNameKey(p.name))).size!==parts.length){setEventError("같은 이름의 참가자가 중복되어 있습니다.");return;}
    const useDbl = dbl;
    setCreating(true);
    let created=false;
    try{
      let normalizedAttempt=null;
      if(eventId&&mode==="single"){
        const attemptKey=JSON.stringify([topologyKind,format==="group"?[gN,aN,groupFinalFormat]:null,
          parts.map(p=>[p.registrationId||null,p.playerId||null,p.name]),(step===3&&placement?.plan)||null]);
        if(!normalizedAttemptRef.current||normalizedAttemptRef.current.attemptKey!==attemptKey){
          normalizedAttemptRef.current={attemptKey,...buildNormalizedSingleCreateAttempt(parts,{plan:format==="elim"?(step===3&&placement?.plan)||null:null})};
        }
        normalizedAttempt=normalizedAttemptRef.current;
      }
      created=await onCreate({ id:uid(), name:name.trim()||"새 대회", createdAt:new Date().toISOString().slice(0,10),
        mode, double:useDbl, format, groupCfg:format==="group"?{groups:gN,adv:aN,finalFormat:groupFinalFormat}:null,
        rookiePlayers:parts.filter(p=>p.rookieChampion).map(p=>p.playerId),
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
    }catch(error){setEventError(error?.message||"대진표를 생성하지 못했습니다.");}
    finally{setCreating(false);}
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
  const groupAvailable=Boolean(linkedEvent&&!linkedEvent.is_team_event&&!linkedEvent.championship_phase&&linkedEvent.event_type!=="champions");
  /* 직행 추천: 시즌 랭킹 상위 4명 가운데 신청한 사람(docs/db/champions_direct_recommendation.sql). 고르는 것은 운영자다 */
  const [directPicks,setDirectPicks]=useState([]);
  const qualifierId=linkedEvent?.championship_phase==="qualifier"?linkedEvent.id:null;
  useEffect(()=>{
    let live=true;
    setDirectPicks([]);
    if(qualifierId) recommendChampionshipDirectEntrants(qualifierId).then(rows=>{ if(live) setDirectPicks(rows||[]); });
    return ()=>{ live=false; };
  },[qualifierId]);
  const pickFor=id=>directPicks.find(pick=>pick.registrationId===id);
  const takeDirectPicks=()=>{ const ids=directPicks.map(pick=>pick.registrationId); setDirectRegistrationIds(ids); setSelectedRegistrationIds(prev=>prev.filter(id=>!ids.includes(id))); };
  const selectedIntakeId=leagueIntakeId(linkedEvent);
  const intakeEvents=selectedIntakeId?events.filter(event=>leagueIntakeId(event)===selectedIntakeId):[];
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
  const placeable=Boolean(eventId);
  const startPlacement=()=>{
    if(!topologyKind){setEventError("대진 방식을 선택해 주세요.");return;}
    const parts=buildParticipants();
    if(format==="group"){
      try{validateGroupConfig(parts.length,gN,aN,groupFinalFormat);}
      catch(error){setEventError(error.message);return;}
    }
    if(dbl&&parts.length<3){setEventError("더블 엘리미네이션은 참가자가 3명 이상이어야 합니다.");return;}
    if(new Set(parts.map(p=>playerNameKey(p.name))).size!==parts.length){setEventError("같은 이름의 참가자가 중복되어 있습니다.");return;}
    if(parts.length<2){ setEventError(linkedEvent?.championship_phase==="final"?"본선 진출자를 먼저 확정해 주세요.":"참가자(팀)를 2개 이상 입력해 주세요."); return; }
    setEventError("");
    setHeld(null);
    setPlacement({parts,plan:format==="group"?groupDraw(parts.map(p=>p.id),gN):drawPlan(parts.map(p=>p.id))});
    setStep(3);
  };
  const redraw=()=>{ setHeld(null); setPlacement(p=>p&&{...p,plan:format==="group"?groupDraw(p.parts.map(x=>x.id),gN):drawPlan(p.parts.map(x=>x.id))}); };
  const swapPlaces=(x,y)=>{ if(!x||!y||x===y)return; setPlacement(p=>({...p,plan:p.plan.map(pair=>pair.map(k=>k===x?y:k===y?x:k))})); };
  const placeName=key=>placement?.parts.find(p=>p.id===key)?.name||"";
  const tapPlace=key=>{ if(dragFrom.current?.moved){ dragFrom.current=null; return; } if(held==null) setHeld(key); else { swapPlaces(held,key); setHeld(null); } };
  const placeCell=key=>key==null
    ? <span className="bk-place-name bye t15">부전승</span>
    : <button type="button" data-key={key} className={"bk-place-name t15 "+(held===key?"inv":"")} aria-pressed={held===key}
        onPointerDown={e=>{ if(e.pointerType==="mouse") dragFrom.current={key,x:e.clientX,y:e.clientY,moved:false}; }}
        onClick={()=>tapPlace(key)}>{placeName(key)}</button>;
  const dragPlace=e=>{ const from=dragFrom.current; if(from&&!from.lit&&Math.hypot(e.clientX-from.x,e.clientY-from.y)>=8){ from.lit=true; setHeld(from.key); } };
  const dropPlace=e=>{
    const from=dragFrom.current; if(!from)return;
    if(Math.hypot(e.clientX-from.x,e.clientY-from.y)<8){ dragFrom.current=null; return; }
    from.moved=true;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-key]");
    if(target) swapPlaces(from.key,target.dataset.key);
    setHeld(null);
  };
  return (<div className="bk-create">
    <BackLink to="대진표" onClick={onClose}/>
    <header className="bk-head"><h1 className="t32">대진표 만들기</h1>{(linkedEvent?.name||name)&&<span className="t12 dim">{linkedEvent?.name||name}</span>}</header>
    <Steps labels={placeable?["대회 설정","참가자 확정","대진 배치"]:["대회 설정","참가자 확정"]} at={step}/>
    <div className="form-card swap" key={step}>
    {step===1&&<>
      {eventListLoading?<Loader/>:!events.length?<>
        {eventError?<ErrorNote>{eventError}</ErrorNote>:<Empty title="연결할 대회가 없습니다."
          desc="공지에서 대회를 연결한 신청서를 먼저 등록해 주세요. 기록을 반영한 대회는 이 목록에 표시하지 않습니다."/>}
        <Dock><Button variant="second" onClick={onClose}>대진표로 돌아가기</Button></Dock>
      </>:<>
      <div className="field">
        <label htmlFor="bk-reg-event">신청 대회 선택</label>
        <Dropdown
          id="bk-reg-event"
          value={selectedIntakeId?`intake:${selectedIntakeId}`:eventId}
          onChange={v=>{
            const selected=v.startsWith("intake:")
              ? events.find(event=>leagueIntakeId(event)===v.slice(7)&&event.division==="master")||events.find(event=>leagueIntakeId(event)===v.slice(7))
              : events.find(event=>event.id===v);
            selectLinkedEvent(selected?.id||"");
          }}
          placeholder={eventBusy?"불러오는 중…":"대회를 선택해 주세요."}
          options={leagueIntakeOptions(events).map(option=>({value:option.value,label:option.label||championshipEventPickerLabel(option.event)}))}
        />
        {selectedIntakeId&&<div className="field">
          <span className="field-label">대진표 리그</span>
          <Segmented value={linkedEvent.division} onChange={division=>{const event=intakeEvents.find(row=>row.division===division);if(event)selectLinkedEvent(event.id);}} ariaLabel="대진표 리그" options={intakeEvents.map(event=>[event.division,event.division==="master"?"마스터":"루키"])}/>
        </div>}
        {linkedEvent?.is_team_event&&linkedEvent.division==="master"&&<div className="bk-hint">팀전은 마스터로 진행합니다.</div>}
        {eventError&&<FormError>{eventError}</FormError>}
        {eventId&&!eventBusy&&mode!=="team"&&submissionStatusError&&<div className="bk-hint" style={{color:"var(--lit)"}}>파티 제출 상태: {submissionStatusError}</div>}
      </div>

      <Field label="대진 방식" hint={!linkedEvent?"신청 대회를 먼저 선택해 주세요.":groupAvailable?"생성한 뒤에는 바꿀 수 없습니다.":linkedEvent.is_team_event?"팀전은 싱글 또는 더블 엘리미네이션으로 진행합니다.":"챔피언스는 선발전과 본선에서 각각 싱글 또는 더블 엘리미네이션을 선택합니다."}>
        <Dropdown disabled={!linkedEvent} value={topologyKind} onChange={value=>{setTopologyKind(value);setFormat(value===GROUP_TOPOLOGY?"group":"elim");}} placeholder="대진 방식을 선택해 주세요." ariaLabel="대진 방식" options={[{value:"single_elimination",label:"싱글 엘리미네이션"},{value:"double_elimination",label:"더블 엘리미네이션"},...(groupAvailable?[{value:GROUP_TOPOLOGY,label:"조별리그 후 본선"}]:[])]} />
      </Field>
      {topologyKind===GROUP_TOPOLOGY&&<>
        <div className="bk-grow2">
          <Field label="조 수"><input type="number" min="1" max="32" value={groups} onChange={e=>setGroups(e.target.value)}/></Field>
          <Field label="조별 진출 인원"><input type="number" min="1" max="63" value={adv} onChange={e=>setAdv(e.target.value)}/></Field>
        </div>
        <Field label="본선 방식" hint="진출자는 조 순위에 따른 시드 없이 본선을 추첨합니다.">
          <Dropdown ariaLabel="본선 방식" value={groupFinalFormat} onChange={setGroupFinalFormat} options={[{value:"single_elimination",label:"싱글 엘리미네이션"},{value:"double_elimination",label:"더블 엘리미네이션"}]}/>
        </Field>
      </>}
      <Dock>
        <div className="stack bk-dock">
          <Button variant="second" onClick={onClose}>취소</Button>
          <Button variant="main" onClick={()=>setStep(2)} disabled={!topologyKind||!eventId||eventBusy}>다음</Button>
        </div>
      </Dock>
      </>}
    </>}    {step===2&&<>
      {eventError&&<FormError>{eventError}</FormError>}
      {eventId&&mode!=="team" ? <>
        {linkedEvent?.championship_phase==="qualifier"&&<div className="field">
          <span className="field-label">본선 직행자 선택</span>
          <div className="bk-hint">신청자 중 운영자가 직접 선택합니다. 직행자는 선발전 대진표에서 빠지며, 본선 참가 신청은 아직 만들지 않습니다.{directPicks.length>0&&` 시즌 랭킹 상위 신청자 ${directPicks.length}명을 추천합니다.`}</div>
          {directPicks.length>0&&!(directPicks.length===directRegistrationIds.length&&directPicks.every(pick=>directRegistrationIds.includes(pick.registrationId)))&&<Button variant="second" size="sm" onClick={takeDirectPicks}>추천대로 선택</Button>}
          <div className="bk-fill">{eventRegs.map((reg,i)=>{const checked=directRegistrationIds.includes(reg.id);return <label className="bk-pin" key={`direct-${reg.id}`} style={{animationDelay:(i*STAGGER.row)+"ms",cursor:"pointer"}}><span className="bk-pin-no gold">{i+1}</span><input type="checkbox" checked={checked} onChange={()=>{setDirectRegistrationIds(prev=>checked?prev.filter(id=>id!==reg.id):[...prev,reg.id]);setSelectedRegistrationIds(prev=>checked?prev:[...prev.filter(id=>id!==reg.id)]);}} /><span style={{flex:1,fontWeight: 600}}>{reg.registration_name}</span><span className="bk-hint" style={{margin:0}}>{[checked?"본선 직행":pickFor(reg.id)&&"추천",pickFor(reg.id)&&`시즌 ${pickFor(reg.id).rank}위`].filter(Boolean).join(", ")}</span></label>;})}</div>
        </div>}
        <div className="stack bk-counters">
          <Counter label="신청" value={eventRegs.length} cells={Math.max(2,String(eventRegs.length).length)}/>
          <Counter label="확정" value={confirmedCount} cells={Math.max(2,String(eventRegs.length).length)}/>
          <Counter label="불참" value={Math.max(0,eventRegs.length-directRegistrationIds.length-confirmedCount)} cells={Math.max(2,String(eventRegs.length).length)}/>
        </div>
        <div className="field">
          <span className="field-label">참가자 확정</span>
          {linkedEvent?.championship_phase==="qualifier"&&<div className="bk-hint">직행자 {directRegistrationIds.length}명은 제외하고 선발전 실제 참가자를 확정합니다.</div>}
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
                  
                />
                <span className="bk-participant-name">{reg.registration_name}</span>
                {reg.rookieChampion&&<span className="bk-hint">이번 회차 루키 우승자</span>}
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
              <Button variant="second"
                type="button"
                size="sm"
                onClick={()=>setAddedParticipants(prev=>prev.filter((_,j)=>j!==i))}
              >
                삭제
              </Button>
            </div>
          ))}
        </div>

        <div className="stack bk-pin-keys">
            <Button variant="second"
              type="button"
              size="sm"
              onClick={()=>setSelectedRegistrationIds(eventRegs.map(r=>r.id))}
            >
              전체 선택
            </Button>
            <Button variant="second"
              type="button"
              size="sm"
              onClick={()=>setSelectedRegistrationIds([])}
            >
              전체 해제
            </Button>
          {linkedEvent?.championship_phase ? <Button variant="second"
            type="button"
            size="sm"
            onClick={openChampionshipManualParticipant}
            disabled={championshipManualBusy}
          >
            참가자 추가
          </Button> : <Button variant="second"
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
            <Button variant="second" type="button" size="sm" disabled={championshipManualBusy} onClick={()=>setChampionshipManualOpen(false)}>취소</Button>
            <Button type="button" variant="main" icon="check" size="sm" disabled={!championshipManualPlayerId||championshipManualBusy} onClick={addChampionshipManualParticipant}>추가</Button>
          </div>
        </div>}
        {linkedEvent?.championship_phase==="qualifier"&&(()=>{const capacity=Number(linkedEvent?.competition_settings?.championship?.finalCapacity)||0;const actual=selectedRegistrationIds.filter(id=>!directRegistrationIds.includes(id)).length;const target=capacity-directRegistrationIds.length;const eliminated=actual-target;return <div className="bk-hint" style={{marginTop:"var(--s2)"}}>본선 정원은 {capacity}명이고 본선 직행은 {directRegistrationIds.length}명입니다. 선발전에는 {actual}명이 참가해 {target}명이 통과하므로 {Math.max(0,eliminated)}명이 탈락해야 합니다.{actual<target&&<span style={{color:"var(--lit)"}}> 참가 인원이 부족해 본선 정원을 채울 수 없습니다.</span>}</div>;})()}
      </> : <>
        {eventId&&mode==="team"&&<div className="field">
          <span className="field-label">신청자 / 팀 지망</span>
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
          {teams.map((t,i)=>(<div className="bk-team-card" key={i} style={{animationDelay:(i*STAGGER.row)+"ms"}}>
                <span className="bk-pin-no gold">{i+1}</span>
                <input className="bk-tc-name" value={t.name} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder={`팀 ${i+1} 이름`} aria-label={`팀 ${i+1} 이름`}/>
                <input className="bk-tc-mem" value={t.members} onChange={e=>setTeams(teams.map((x,j)=>j===i?{...x,members:e.target.value}:x))} placeholder="팀원 (쉼표로 구분)" aria-label="팀원 (쉼표로 구분)"/>
              </div>))}
        </div>
      </>}

      <Dock>
        <div className="stack bk-dock">
          <Button variant="second" onClick={()=>setStep(1)}>이전</Button>
          {placeable
            ? <Button variant="main" onClick={startPlacement}>{mode!=="team"?`${buildParticipants().length}명으로 추첨`:"추첨"}</Button>
            : <Button variant="main" icon="check" onClick={go} disabled={creating} loading={creating}>{eventId&&mode!=="team"?`${buildParticipants().length}명으로 대진표 만들기`:"대진표 만들기"}</Button>}
        </div>
      </Dock>
    </>}

    {step===3&&placement&&<>
      <div className="stack bk-place-tools"><Button variant="second" onClick={redraw}>다시 추첨</Button></div>
      <p className="t12 reg dim">이름을 끌어 다른 이름에 놓거나, 두 이름을 차례로 누르면 자리가 바뀝니다.</p>
      <div className="stack bk-place" onPointerMove={dragPlace} onPointerUp={dropPlace} onPointerLeave={()=>{ if(dragFrom.current&&!dragFrom.current.moved) dragFrom.current=null; }}>
        {format==="group"?placement.plan.map((pool,i)=><section className="stack" key={i}>
          <h2 className="t20">{i+1}조</h2>
          {pool.map(key=><div className="pn" key={key}>{placeCell(key)}</div>)}
        </section>):placement.plan.map(([a,b],i)=><div className="pn bk-place-row" key={i}>
          <span className="t12 dim num">M{i+1}</span>{placeCell(a)}<span className="t12 dim">vs</span>{placeCell(b)}
        </div>)}
      </div>
      <Dock toast={eventError&&<Toast error>{eventError}</Toast>}>
        <div className="stack bk-dock">
          <Button variant="second" onClick={()=>{ setHeld(null); setStep(2); }}>이전</Button>
          <Button variant="main" icon="check" onClick={go} disabled={creating} loading={creating}>대결 확정</Button>
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
  // team: 폰에서는 두 팀의 머리 줄이 없으므로 각 칸이 제 팀의 이름을 달고 선다
  const side=(value,onChange,options,winner,onWin,label,team)=><div className="bk-bout-side"><span className="bk-bout-team t12 dim">{team}</span><div className="bk-bout-player"><Dropdown value={value} onChange={onChange} placeholder="선수 선택" ariaLabel={`${team} 선수`} options={options}/></div><button type="button" className={"bk-bout-win"+(winner?" is-win":"")} onClick={onWin} aria-label={label} aria-pressed={winner}>{winner?<><Icon n="check" size={16}/>승</>:"승"}</button></div>;
  const displayTeamA=teamMatchDisplayName(teamA.name),displayTeamB=teamMatchDisplayName(teamB.name);
  return (<Modal title={`${displayTeamA} vs ${displayTeamB}`} hint="실제 출전 선수를 선택하고 모든 개인전 결과를 입력해 주세요." onClose={onClose}>
    <div className="swap bk-team-match-modal">
      <div className="bk-bout-columns" aria-hidden="true"><span/><strong>{displayTeamA}</strong><span/><strong>{displayTeamB}</strong></div>
      <div className="bk-series">{Array.from({length:N}).map((_,i)=>(<div className="bk-series-row bk-bout-row" key={i}>
        <span className="bk-series-no bk-bout-label">{i+1}경기</span>
        {side(lineupA[i],v=>setLineupA(lineupA.map((name,j)=>j===i?v:name)),optionsA,games[i]==="a",()=>setGame(i,"a"),`${i+1}경기 A팀 승리`,displayTeamA)}
        <span className="bk-series-vs">vs</span>
        {side(lineupB[i],v=>setLineupB(lineupB.map((name,j)=>j===i?v:name)),optionsB,games[i]==="b",()=>setGame(i,"b"),`${i+1}경기 B팀 승리`,displayTeamB)}
      </div>))}</div>
      {tie&&<div className="bk-ace">
        <div className="bk-ace-h">타이브레이커</div>
        <div className="bk-series-row bk-bout-row bk-bout-row-ace"><span className="bk-bout-label-spacer" aria-hidden="true"/>{side(aceA,setAceA,optionsA,aceW==="a",()=>setAceW(aceW==="a"?null:"a"),"타이브레이커 A팀 승리",displayTeamA)}<span className="bk-series-vs">vs</span>{side(aceB,setAceB,optionsB,aceW==="b",()=>setAceW(aceW==="b"?null:"b"),"타이브레이커 B팀 승리",displayTeamB)}</div>
      </div>}
      <div className="modal-actions bk-team-match-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={confirm} disabled={!decided}>대결 확정</Button></div>
    </div>
  </Modal>);
}

/* ===== 경기 상자 (DESIGN.md "Brackets") =====
   두 줄, 36씩, 사이에 이음매. 이긴 줄은 반전되고 진 줄은 흐려진다. 아직 정해지지 않은 자리는 흐린 글자다.
   점수는 게임별 승자가 있을 때(팀전 시리즈)만 이긴 게임 수로 쓰고, 없으면 승자만 보인다. */
const seriesScore=(m,side)=>{ const s=m?.series; if(!s?.games) return null; return s.games.filter(w=>w===side).length+(s.ace?.winner===side?1:0); };
const slotName=(pid,nameOf)=>pid===BYE?"부전승":(pid?nameOf(pid):"대기");
const sideScore=(m,side)=>seriesScore(m,side)??(side==="a"?m.scoreA:m.scoreB)??null;
function MatchCard({ m, ev, nameOf, admin, onPick, compact, teamMode, onOpenTeam, seedOf, onOpen, battle }){
  if(!m) return null;
  const pa=ev.sp(m.a), pb=ev.sp(m.b);
  const decided=!!m.winner;
  // a match being played as a site battle carries the amber lamp (DESIGN.md "Battle": the battle is the board's live match)
  const live=battle&&battle.status!=="ended"&&!m.winner?<i className="lamp sig mb-lamp" aria-hidden="true"/>:null;
  const bothReal=pa&&pb&&pa!==BYE&&pb!==BYE;
  const line=(side,pid,Tag,extra)=>{
    const isWin=decided&&m.winner===side, isBye=pid===BYE, lost=decided&&!isWin, n=seedOf?seedOf(pid):null, score=sideScore(m,side);
    return <Tag {...extra} className={"mb-row"+(isWin?" inv":"")+(lost?" lost":"")+(isBye||!pid?" wait":"")}>
      <i className="mb-seed num t12" aria-hidden={!n}>{n||""}</i>
      <span className="mb-name">{slotName(pid,nameOf)}</span>
      {lost&&m.forfeit?<span className="mb-score t12">불참</span>:score!=null&&<span className="mb-score num">{score}</span>}
    </Tag>;
  };
  /* a visitor presses the whole box (DESIGN.md "Open": the whole match box is the target): on a phone the names end in an ellipsis,
     so the sheet says them in full with the result */
  if(!admin&&onOpen&&[pa,pb].some(pid=>pid&&pid!==BYE))
    return <button type="button" className={"mb can-open"+(compact?" cmp":"")} onClick={()=>onOpen(m)} aria-label={`${slotName(pa,nameOf)}, ${slotName(pb,nameOf)}, ${live?"배틀 진행 중, ":""}경기 보기`}>{line("a",pa,"span")}{line("b",pb,"span")}{live}</button>;
  if(teamMode){
    const clickable=admin&&(bothReal||decided);
    const Box=clickable?"button":"div";
    return <Box {...(clickable?{type:"button"}:{})} className={"mb"+(compact?" cmp":"")+(clickable?" team-click":"")} onClick={()=>clickable&&onOpenTeam(m,pa,pb)} title={clickable?"눌러서 팀 대결 진행 또는 수정":""}>{line("a",pa,"span")}{line("b",pb,"span")}</Box>;
  }
  const canPick=admin&&bothReal;
  const pickProps=side=>({type:"button",disabled:!canPick,onClick:()=>canPick&&onPick(m.id,side),title:canPick?(decided?"다른 쪽을 누르면 승자 변경, 같은 쪽을 다시 누르면 취소":"눌러서 승자 선택"):""});
  return <div className={"mb"+(compact?" cmp":"")+(canPick?" can-pick":"")}>{line("a",pa,"button",pickProps("a"))}{line("b",pb,"button",pickProps("b"))}{live}</div>;
}
/* a match's battle in its sheet: watching it while it runs, its replay once it ended, or starting one for an open official match.
   A battle that cannot give the match a winner (a tie, a void one, one that could not go in) leaves the match open to be played again.
   The operator's result entry adds 다시 넣기 for a result that did not go in and 배틀 무효 for a battle nobody will finish. */
function MatchBattle({ m, ev, battle, startable, eventId, admin=false, onChanged }){
  const pa=ev.sp(m.a), pb=ev.sp(m.b);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState("");
  const run=async fn=>{ setBusy(true); setNote(""); try{ await fn(); onChanged?.(); }catch(e){ setNote(e?.message||"잠시 뒤 다시 시도해 주세요."); }finally{ setBusy(false); } };
  const canStart=startable&&!m.winner&&pa&&pb&&pa!==BYE&&pb!==BYE;
  const error=note&&<p className="t12 reg bk-entry-error"><span className="bang" aria-hidden="true">!</span>{note}</p>;
  if(battle&&battle.status!=="ended") return <div className="stack mb-battle">
    <Row title="사이트 배틀" line={battle.status==="waiting"?"한 선수가 들어와 상대를 기다리는 중입니다.":"지금 배틀로 치르는 중입니다."} lamp={battle.status==="waiting"?"대기":"진행 중"} sig={battle.status!=="waiting"}/>
    <Button variant="second" href={battleHref(battle.id)}>{battle.status==="waiting"?"경기 들어가기":"관전"}</Button>
    {admin&&<Button variant="link" disabled={busy} onClick={async()=>{
      if(await siteConfirm({title:"배틀 무효",body:"이 배틀을 닫습니다. 진행 중이던 배틀은 무효로 끝나 리플레이로 남고, 대진표에는 아무것도 넣지 않습니다. 승자는 결과 입력에서 정합니다.",confirmLabel:"무효",danger:true})) await run(()=>voidBattle(battle.id));
    }}>배틀 무효</Button>}
    {error}
  </div>;
  if(battle){
    const winner=battleWinnerEntry(battle), matchWinner=m.winner?ev.sp(m[m.winner]):null;
    const line=battle.applied_at?"배틀 결과가 대진표에 들어갔습니다."
      :battle.ended_by==="void"?`배틀이 무효가 되었습니다. ${battle.apply_error||""}`.trim()
      :matchWinner&&winner===matchWinner?"배틀 결과와 같은 승자가 대진표에 들어가 있습니다."
      :battle.apply_error?`배틀 결과를 대진표에 넣지 못했습니다. ${battle.apply_error}`
      :"배틀 결과를 대진표에 넣는 중입니다.";
    const unsettled=!winner||Boolean(battle.apply_error)||battle.ended_by==="void";
    return <div className="stack mb-battle">
      <Row title="사이트 배틀" line={line}/>
      {canStart&&unsettled&&<Button variant="main" href={officialBattleHref(eventId,m.id)}>배틀로 다시 경기</Button>}
      <Button variant="second" href={battleHref(battle.id)}>리플레이</Button>
      {admin&&!m.winner&&winner&&!battle.applied_at&&battle.ended_by!=="void"&&<Button variant="link" disabled={busy} onClick={()=>run(()=>retryBattleApply(battle.id))}>다시 넣기</Button>}
      {error}
    </div>;
  }
  if(canStart) return <div className="stack mb-battle">
    <Button variant="main" href={officialBattleHref(eventId,m.id)}>배틀로 경기</Button>
  </div>;
  return null;
}
/* a team match played as site battles (src/services/teamBouts.js): each bout is its own battle, entered by the member who plays it
   with their own party PIN. Nothing goes into the bracket until every bout has a winner (and the 에이스 결정전 when they tie); then
   the whole series goes in at once, as the operators' team entry would put it. boutCount: the larger team's members. */
function TeamBouts({ m, ev, battles, boutCount, startable, eventId, admin=false, onChanged }){
  const [busy,setBusy]=useState(false);
  const pa=ev.sp(m.a), pb=ev.sp(m.b);
  if(m.winner||!pa||!pb||pa===BYE||pb===BYE||!boutCount) return null;
  const state=teamBouts(battles,m.id,[pa,pb],boutCount);
  const rows=[...state.bouts,...(state.ace?[state.ace]:[])];
  if(!startable&&!rows.some(x=>x.battle)) return null;
  const done=state.winner?"모든 판이 끝났습니다. 시리즈를 대진표에 넣는 중입니다."
    :state.aceNeeded?`일반 판이 ${state.winsA} 대 ${state.winsB} 동점입니다. 에이스 결정전으로 정합니다.`
    :"";
  const bout=x=>{
    const label=x.n?`${x.n}경기`:"에이스 결정전", b=x.battle, open=b&&b.status!=="ended";
    const names=`${x.a?.name||"미정"}, ${x.b?.name||"미정"}`;
    const line=open?(b.status==="waiting"?`${label}, 상대를 기다리는 중`:`${label}, 진행 중`)
      :x.winner?`${label}, ${(x.winner==="a"?x.a:x.b)?.name||""} 승리`
      :b?`${label}, ${b.ended_by==="void"?"무효":"무승부"}, 다시 치를 판`:`${label}, 결과 전`;
    /* 아직 아무도 앉지 않은 판은 그 판의 이름이 제목이다(미정, 미정이 아니라 3경기). 리플레이와 배틀 무효는 두 줄 사이에 뜬 글자가
       아니라 그 줄의 오른쪽 끝에 선다 (2026-11-10) */
    const seated=Boolean(x.a?.name||x.b?.name);
    const voidKey=admin&&open&&<Button variant="link" disabled={busy} onClick={async()=>{
        if(!await siteConfirm({title:"배틀 무효",body:`${label}의 배틀을 닫습니다. 진행 중이던 배틀은 무효로 끝나 리플레이로 남고, 이 판은 다시 치릅니다.`,confirmLabel:"무효",danger:true})) return;
        setBusy(true); try{ await voidBattle(b.id); onChanged?.(); }finally{ setBusy(false); }
      }}>배틀 무효</Button>;
    const replayKey=!open&&x.winner&&b&&<Button variant="link" href={battleHref(b.id)}>리플레이</Button>;
    return <div className="stack" key={x.key}>
      <Row title={seated?names:label} line={seated?line:line.slice(label.length+2)} value={voidKey||replayKey||undefined} lamp={open?"진행 중":null} sig={open}/>
      {open?<Button variant="second" href={battleHref(b.id)}>{b.status==="waiting"?`${label} 들어가기`:`${label} 관전`}</Button>
        :!x.winner&&startable&&<Button variant="second" href={officialBattleHref(eventId,x.key)}>{label} 배틀로 경기</Button>}
    </div>;
  };
  return <div className="stack mb-battle">
    <Row title={`사이트 배틀, ${state.winsA} 대 ${state.winsB}`} line={done}/>
    {rows.map(bout)}
  </div>;
}
/* the official battles of an event, read with the bracket's own 15 second rhythm. A battle that put its winner in makes the
   bracket read itself again, so an operator's screen shows the result without a reload. */
function useEventBattles(eventId, onApplied){
  const [list,setList]=useState([]);
  const appliedRef=useRef(null);
  const retriedRef=useRef(new Set());
  useEffect(()=>{
    if(!eventId) return undefined;
    let stopped=false;
    const tick=async()=>{
      if(document.visibilityState!=="visible") return;
      const next=await listEventBattles(eventId);
      if(stopped) return;
      const applied=next.filter(x=>x.applied_at).map(x=>x.id).join(",");
      if(appliedRef.current!==null&&applied!==appliedRef.current) onApplied?.();
      appliedRef.current=applied;
      setList(next);
      /* a battle that ended with a winner but neither went in nor left a reason: the function stopped between the end and the
         bracket. Ask it once more (once a page), after the function has had its own half minute. */
      for(const x of next){
        if(x.status!=="ended"||x.applied_at||x.apply_error||x.ended_by==="void"||!battleWinnerEntry(x)||retriedRef.current.has(x.id)) continue;
        if(Date.now()-new Date(x.updated_at).getTime()<30000) continue;
        retriedRef.current.add(x.id);
        void retryBattleApply(x.id).catch(()=>{});
      }
    };
    void tick();
    const iv=setInterval(tick,15000);
    return ()=>{ stopped=true; clearInterval(iv); };
  },[eventId]);
  return list;
}
/* a match's sheet: the round, the two sides at full length with the winner inverted and named 승자, the score; a team match adds its bouts */
function MatchSheet({ g, m, ev, nameOf, onClose, battle, startable, eventId, battles=[], boutCount=0 }){
  const s=m.series, bouts=Array.isArray(s?.games)?s.games:[];
  const side=(key,pid)=>{
    const win=m.winner===key, lost=Boolean(m.winner)&&!win, score=sideScore(m,key);
    return <Row key={key} className={win?"inv":""} title={slotName(pid,nameOf)} line={win?"승자":lost?(m.forfeit?"불참":"패배"):"결과 전"}
      value={score!=null&&!(lost&&m.forfeit)?<span className="num t20">{score}</span>:null}/>;
  };
  const bout=(label,a,b,w)=><Row key={label} title={`${a||"미정"}, ${b||"미정"}`} line={`${label}, ${w==="a"?a:w==="b"?b:"결과 전"}${w?" 승리":""}`}/>;
  return (<Modal title={stageOf(g,m)} hint={m.winner?"결과가 확정된 경기입니다.":"아직 결과가 없는 경기입니다."} onClose={onClose}>
    <div className="stack">{side("a",ev.sp(m.a))}{side("b",ev.sp(m.b))}</div>
    {boutCount?<TeamBouts m={m} ev={ev} battles={battles} boutCount={boutCount} startable={startable} eventId={eventId}/>
      :<MatchBattle m={m} ev={ev} battle={battle} startable={startable} eventId={eventId}/>}
    {bouts.length>0&&<div className="stack mb-bouts">
      {bouts.map((w,i)=>bout(`${i+1}경기`,s.lineupA?.[i],s.lineupB?.[i],w))}
      {s.ace&&bout("타이브레이커",s.ace.a,s.ace.b,s.ace.winner)}
    </div>}
  </Modal>);
}

/* ===== 결과 입력 =====
   경기 칩으로 경기를 고르고 이긴 줄을 눌러 승자를 정한다. 대진표의 줄을 누르는 것과 같은 일이며(같은 줄을 다시 누르면 취소),
   저장은 누를 때마다 된다. 개인전의 게임 점수와 불참은 경기 데이터에 칸이 없어 다루지 않는다. */
const stageOf=(g,m)=>{
  const ri=g.rounds.findIndex(r=>r.includes(m));
  if(ri>=0){ if(g.kind==="double") return `승자조 ${ri+1}라운드`; const len=g.rounds[ri].length; return len===1?"결승":`${len*2}강`; }
  const li=(g.lb||[]).findIndex(r=>r.includes(m));
  if(li>=0) return `패자조 ${li+1}라운드`;
  return m===g.reset?"리셋 결승":"결승";
};
function ResultEntry({ g, nameOf, seedOf, onPick, teamMode, onOpenTeam, busy, outcomeOn=false, onOutcome, battles=[], startable=false, eventId=null, onBattleChanged, boutsOf=()=>0 }){
  const ev=evalGraph(g);
  // the reset final exists only once the losers' side has won the grand final, as on the board
  const rows=collectGraphMatches(g).filter(m=>m!==g.reset||g.gf?.winner==="b").map(m=>({m,a:ev.sp(m.a),b:ev.sp(m.b)})).filter(x=>x.a&&x.b&&x.a!==BYE&&x.b!==BYE);
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
    <div className="stack swap" key={cur.m.id}>
      <p className="pn bk-entry-head t12"><span className="dim">M{at+1}, {stageOf(g,cur.m)}</span>{cur.m.winner?<span>결과 확정</span>:<span className="bk-entry-live"><i className="lamp sig" aria-hidden="true"/>진행 중</span>}</p>
      {side("a",cur.a)}{side("b",cur.b)}
    </div>
    {teamMode?<TeamBouts m={cur.m} ev={ev} battles={battles} boutCount={boutsOf(cur.m,ev)} startable={startable} eventId={eventId} admin onChanged={onBattleChanged}/>
      :<MatchBattle m={cur.m} ev={ev} battle={battleForMatch(battles,cur.m.id,[cur.a,cur.b])} startable={startable} eventId={eventId} admin onChanged={onBattleChanged}/>}
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
const roundName=(len)=>({1:"결승",2:"4강",4:"8강",8:"16강",16:"32강"})[len]||`${len*2}강`;
/* 진행 중인 단일 토너먼트의 지금 라운드: 승자가 정해지지 않은 첫 라운드와 그 라운드에서 끝난 경기 수 (상태 띠) */
function liveProgress(b){
  if(b.format==="group"&&!b.knockout&&b.groups?.length){
    const games=b.groups.flatMap(g=>g.matches);
    return `조별 경기 ${games.filter(m=>m.winner).length}/${games.length} 종료`;
  }
  const g=b.format==="group"?b.knockout:b.graph;
  if(!g||g.kind==="double"||!g.rounds?.length) return "";
  const ev=evalGraph(g);
  const ri=g.rounds.findIndex(r=>r.some(m=>!ev.win[m.id]));
  if(ri<0) return "";
  const r=g.rounds[ri];
  return `${roundName(r.length)} ${r.filter(m=>ev.win[m.id]).length}/${r.length} 종료`;
}
function treeCenters(rounds){
  const centers=[];
  for(let r=0;r<rounds.length;r++){ centers[r]=[];
    for(let j=0;j<rounds[r].length;j++){ centers[r][j]= r===0 ? (j*BK_PITCH0+BK_MATCH_H/2) : (centers[r-1][2*j]+centers[r-1][2*j+1])/2; } }
  return { centers, totalH: Math.max(BK_MATCH_H,(rounds[0]?.length||1)*BK_PITCH0-20) };
}
function ElimBoard({ g, nameOf, admin, onPick, teamMode, onOpenTeam, qualifier=false, seedOf, battles=[], startable=false, eventId=null, boutsOf=()=>0 }){
  const ev=evalGraph(g);
  const finalRes=elimResult(g);
  const rlabel=roundName;
  const { centers, totalH }=treeCenters(g.rounds);
  /* the lines: one drawing over the whole tree, measured from the boxes as they stand (offsets, so a lighting rise never bends them).
     Out of each box a road to the middle of its pair and on into the next box; a decided road is a 2px lit line drawn over the rest,
     so it runs unbroken from the winner's box to the next. */
  const treeRef=useRef(null);
  const [wires,setWires]=useState(null);
  const won=m=>{ const w=ev.win[m.id]; return Boolean(w)&&w!==BYE; };
  const winKey=g.rounds.map(r=>r.map(m=>ev.win[m.id]||"").join(",")).join("|")+(finalRes?.champ||"");
  useLayoutEffect(()=>{
    const tree=treeRef.current;
    if(!tree||g.kind==="double") return undefined;
    const at=el=>{ let x=0,y=0; for(let n=el;n&&n!==tree;n=n.offsetParent){ x+=n.offsetLeft; y+=n.offsetTop; } return { x, y, w:el.offsetWidth, h:el.offsetHeight }; };
    const draw=()=>{
      const box=(ri,j)=>{ const el=tree.querySelector(`[data-r="${ri}"][data-j="${j}"] > .mb`); return el?at(el):null; };
      const dim=[], lit=[];
      for(let ri=1;ri<g.rounds.length;ri++) g.rounds[ri].forEach((m,j)=>{
        const t=box(ri,j); if(!t) return;
        const ty=t.y+t.h/2; let xm=null; const roads=[];
        [2*j,2*j+1].forEach(k=>{ const f=g.rounds[ri-1][k]; const b=f&&box(ri-1,k); if(!b) return;
          const fy=b.y+b.h/2, fx=b.x+b.w; xm=Math.round((fx+t.x)/2);
          (won(f)?lit:dim).push(`M${fx} ${fy}H${xm}V${ty}`); roads.push(won(f)); });
        if(xm!=null) (roads.every(Boolean)?lit:dim).push(`M${xm} ${ty}H${t.x}`);
      });
      const fin=box(g.rounds.length-1,0), champ=tree.querySelector(".bk-champ-col .bk-champ-node");
      if(fin&&champ){ const c=at(champ); (finalRes?.champ?lit:dim).push(`M${fin.x+fin.w} ${fin.y+fin.h/2}H${c.x}`); }
      setWires({ w:tree.scrollWidth, h:tree.scrollHeight, dim:dim.join(""), lit:lit.join("") });
    };
    draw();
    const watch=typeof ResizeObserver==="function"?new ResizeObserver(draw):null;
    watch?.observe(tree);
    return ()=>watch?.disconnect();
  },[winKey,g.rounds.length,g.kind]);
  const [seen,setSeen]=useState(null);
  // a team match is live while any of its bouts is (the lamp on its box)
  const liveBout=m=>battles.find(x=>x.status!=="ended"&&parseBoutKey(x.source_node_key)?.parent===m.id)||null;
  const card=m=><MatchCard m={m} ev={ev} nameOf={nameOf} admin={admin} onPick={onPick} teamMode={teamMode} onOpenTeam={onOpenTeam} seedOf={seedOf} onOpen={setSeen} battle={teamMode?liveBout(m):battleForMatch(battles,m.id,[ev.sp(m.a),ev.sp(m.b)])}/>;
  return (<div className="bk-scroll" role="region" aria-label="대진표" tabIndex={0}>
  {seen&&<MatchSheet g={g} m={seen} ev={ev} nameOf={nameOf} onClose={()=>setSeen(null)} battle={battleForMatch(battles,seen.id,[ev.sp(seen.a),ev.sp(seen.b)])} startable={startable} eventId={eventId} battles={battles} boutCount={teamMode?boutsOf(seen,ev):0}/>}
  <div className="bk-tree" ref={treeRef}>
    {wires&&<svg className="bk-wires" width={wires.w} height={wires.h} aria-hidden="true"><path className="dim" d={wires.dim}/><path className="lit" d={wires.lit}/></svg>}
    {g.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
      <div className="bk-col-h t12 dim">{g.kind==="double"?("승자조 "+(ri+1)+"R"):rlabel(r.length)}</div>
      <div className="bk-col-body" style={{height:totalH,"--bk-pitch":(BK_PITCH0*Math.pow(2,ri))+"px"}}>
        {r.map((m,j)=>(<div className="bk-mpos" data-r={ri} data-j={j} key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>{card(m)}</div>))}
      </div>
    </div>))}
    {/* the 우승 panel stands from the start and lights when the final ends */}
    {g.kind!=="double"&&!qualifier&&<div className={"bk-col2 bk-champ-col"+(finalRes?.champ?" on":"")}>
      <div className="bk-col-h t12 dim">우승</div>
      <div className="bk-col-body" style={{height:totalH}}>
        <div className="bk-mpos bk-champ-pos" style={{top:(centers[g.rounds.length-1][0]-BK_MATCH_H/2)+"px"}}>
          {finalRes?.champ
            ? <div className="bk-champ-node inv"><span className="t12">우승</span><b className="t15">{nameOf(finalRes.champ)}</b></div>
            : <div className="pn bk-champ-node wait"><span className="t12">결승이 끝나면 켜집니다.</span></div>}
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

// 좁은 줄의 날짜(DESIGN.md "Numbers, dates, time"): 09.13 15:50, 날짜와 시각은 한 줄에
function formatBracketSubmissionTime(value) {
  const at = dotDate(value);
  return at ? [at.day, at.clock].filter(Boolean).join(" ") : "";
}

/* 마감 뒤 제출은 막지 않는다(어쩔 수 없는 사람을 위해). 운영진에게만 그 횟수를 상태 자리에 보인다: 마지막 제출도 마감 뒤라 그 시각이 곁에 선다.
   따로 줄을 두면 격자의 한 줄이 통째로 높아진다. */
function SubmissionStatusPanel({ model, busy, error, expanded, onToggle, onRefresh, onResetPin, showLate = false }) {
  const renderMember = member => (
    <div className="bk-submission-member" key={member.registrationId}>
      <span className="bk-submission-member-name">{member.name}</span>
      <span className={`bk-submission-state${member.hasSubmission ? " submitted" : ""}`}>
        {member.hasSubmission
          ? `${showLate&&member.lateSubmittedAt?.length ? `마감 뒤 ${member.lateSubmittedAt.length}번` : "제출 완료"}${formatBracketSubmissionTime(member.latestSubmittedAt) ? ` ${formatBracketSubmissionTime(member.latestSubmittedAt)}` : ""}`
          : "미제출"}
      </span>
      {onResetPin&&<button type="button" className="bd-del sm" onClick={()=>onResetPin(member)}>비밀번호 초기화</button>}
    </div>
  );
  const lateCount = showLate ? (model.mode === "team" ? model.teams.flatMap(team => team.members) : model.participants || []).filter(member => member.lateSubmittedAt?.length).length : 0;

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
            {busy && model.total === 0 ? "불러오는 중…" : `${model.submitted} / ${model.total} 제출${lateCount ? `, 마감 뒤 ${lateCount}명` : ""}`}
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

function GroupStageBoard({b,admin,busy,run,nameOf,battles,startable,refresh}){
  const roundRobin = {sp:slot=>slot?.pid};
  const renderMatch=(match,editable)=><div className="stack pn" key={match.id}>
    <Row title={`${nameOf(match.a.pid)} vs ${nameOf(match.b.pid)}`} line={match.winner?`승자 ${nameOf(match[match.winner].pid)}`:"경기 전"}/>
    {editable&&<div className="stack bk-dock">
      {["a","b"].map(side=><Button key={side} variant={match.winner===side?"main":"second"} disabled={busy}
        onClick={()=>run(()=>setGroupStageWinner(b,match,match.winner===side?null:match[side].pid))}>
        {match.winner===side?`${nameOf(match[side].pid)} 승자 취소`:`${nameOf(match[side].pid)} 승리`}
      </Button>)}
    </div>}
    <MatchBattle m={match} ev={roundRobin} battle={battleForMatch(battles,match.id,[match.a.pid,match.b.pid])} startable={startable&&!b.knockout}
      eventId={b.eventId} admin={admin} onChanged={refresh}/>
  </div>;
  return <div className="stack">
    {b.groups.map(group=>{
      const {rows,ready,next,cutoff,complete,qualified}=group.standing;
      return <section className="stack" key={group.id}>
        <h2 className="t20">{group.name}조</h2>
        {rows.map(row=><Row key={row.id} title={nameOf(row.id)}
          line={[complete?(row.tied?`공동 ${row.rank}위`:`${row.rank}위`):null,`${row.wins}승`,row.reason==="승자승"?row.reason:null].filter(Boolean).join(", ")}
          value={ready?(qualified.includes(row.id)?"본선 진출":"조별 탈락"):null}/>)}
        {group.matches.map(match=>renderMatch(match,admin&&!b.knockout&&!group.playoffs.length?true:admin?false:undefined))}
        {cutoff&&<Row title="순위 결정전" line={ready?"진출자가 확정되었습니다.":`동률 선수 ${cutoff.ids.length}명 중 ${cutoff.places}명이 진출합니다.`}/>}
        {group.playoffs.map((match,i)=>renderMatch(match,admin&&!b.knockout&&i===group.playoffs.length-1?true:admin?false:undefined))}
        {admin&&!b.knockout&&next&&<Button variant="second" disabled={busy} onClick={()=>run(()=>createGroupPlayoff(b,group.id))}>단판 결정전 추첨</Button>}
        {admin&&group.playoffs.length>0&&!b.knockout&&<Button variant="link" disabled={busy} onClick={async()=>{
          if(await siteConfirm({title:"순위 결정전 초기화",body:"이 조의 결정전과 결과를 지우고 조별 결과 수정을 엽니다.",confirmLabel:"초기화",danger:true})){
            await run(()=>reopenGroupStage(b,group.id));
          }
        }}>결정전 초기화</Button>}
      </section>;
    })}
    {admin&&!b.knockout&&b.groupCfg.ready&&<Button variant="main" disabled={busy} onClick={()=>run(()=>createGroupFinal(b))}>본선 추첨 및 확정</Button>}
    {admin&&b.knockout&&<Button variant="link" disabled={busy} onClick={async()=>{
      if(await siteConfirm({title:"본선 배치 취소",body:"아직 결과가 없는 본선 배치를 지우고 조별 단계로 돌아갑니다.",confirmLabel:"배치 취소",danger:true})){
        await run(()=>reopenGroupStage(b));
      }
    }}>본선 배치 취소</Button>}
  </div>;
}

function BracketBoard({ b, admin, flash, onApply, deleting=false, readOnly=false, refreshNormalized, onNormalizedReverted, data, save }){
  const nameOf=(pid)=>{ const p=(b.participants||[]).find(x=>x.id===pid); return p?p.name:pid; };
  const teamMode=b.mode==="team";
  const locked=!!b.applied||deleting||readOnly;
  const [matchMutationBusy,setMatchMutationBusy]=useState(false);
  const matchMutationBusyRef=useRef(false);
  const editAdmin=admin&&!locked&&!matchMutationBusy;
  // site battles: individual official brackets in progress can play a match as a battle; its winner goes in by itself
  const battles=useEventBattles(b.eventId&&b.projection?.source==="normalized"?b.eventId:null,()=>void refreshNormalized?.());
  const [series,setSeries]=useState(null);
  const [submissionStatuses,setSubmissionStatuses]=useState([]);
  const [submissionStatusError,setSubmissionStatusError]=useState("");
  const [submissionStatusBusy,setSubmissionStatusBusy]=useState(Boolean(b.eventId));
  const [submissionStatusExpanded,setSubmissionStatusExpanded]=useState(false);
  const [submissionStatusReloadKey,setSubmissionStatusReloadKey]=useState(0);
  const [championshipRefreshKey,setChampionshipRefreshKey]=useState(0);
  const [championshipEvent,setChampionshipEvent]=useState(null);
  const [hallOfFameBusy,setHallOfFameBusy]=useState(false);
  // the battle server only seats players of a running, unrecorded event (battle_official_seat); the button waits for the same
  // a team match has as many bouts as the larger team has members (buildDefaultTeamMatchLineups)
  const boutsOf=(m,ev)=>{ const size=id=>(b.participants||[]).find(x=>x.id===id)?.members?.length||0; return Math.max(size(ev.sp(m.a)),size(ev.sp(m.b))); };
  const battleStartable=Boolean(b.eventId&&b.projection?.runtimeId&&!locked&&b.status!=="done"&&championshipEvent?.status==="running"&&!championshipEvent.record_applied_at&&sitePlayed(championshipEvent));
  const runGroup=async(action)=>{
    if(!admin||locked||matchMutationBusyRef.current)return;
    matchMutationBusyRef.current=true;
    setMatchMutationBusy(true);
    try{await action();await refreshNormalized?.();}
    catch(error){flash(error?.message||"대진표를 저장하지 못했습니다.");await refreshNormalized?.();}
    finally{matchMutationBusyRef.current=false;setMatchMutationBusy(false);}
  };
  const pickGroupFinal=async(matchId,side)=>{
    if(!admin||locked||matchMutationBusyRef.current)return;
    const cleared=clearedByPick(b,matchId,side);
    if(cleared.length&&!(await siteConfirm({title:"본선 결과 변경",body:`이어진 경기 ${cleared.length}개의 결과가 지워집니다.`,confirmLabel:"변경",danger:true})))return;
    await runGroup(()=>setGroupFinalWinner(b,matchId,side));
  };
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
    /* 확정된 승자를 바꾸거나 취소하면 이어진 경기의 결과가 지워지고, 되돌리기가 없다: 무엇이 지워지는지 말하고 한 번 묻는다
       (DESIGN.md "Composing a screen" 18, 2026-11-08 관리자 워크스페이스) */
    if(match.winner){
      const cleared=clearedByPick(b,matchId,side);
      if(cleared.length){
        const stages=[...new Set(cleared.map(id=>matchStage(b,id)).filter(Boolean))].join(", ");
        const cancel=match.winner===side;
        if(!(await siteConfirm({title:cancel?"승자 취소":"승자 바꾸기",body:`이 경기의 승자를 ${cancel?"취소하면":"바꾸면"} 이어진 경기 ${cleared.length}개의 결과가 지워집니다${stages?` (${stages})`:""}. 지운 결과는 다시 입력해야 합니다.`,confirmLabel:cancel?"승자 취소":"바꾸기",danger:true})))return;
      }
    }
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
      /* 되돌리기: 새로 정한 승자만 되돌린다. 같은 쪽을 다시 누르는 것(승자 취소)과 같은 일이고, 그사이 바뀌었으면 하지 않는다.
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
    if(!(await siteConfirm({title:"기록 반영 취소",body:"이 대진표의 기록 반영을 취소할까요? 회차, 랭킹, 시즌 성적, 이 대회로 받은 칭호, 연결된 대회의 기록 상태가 함께 되돌아갑니다.",confirmLabel:"반영 취소",danger:true})))return;
    try{
      await revertEventRecord(b.eventId);
      await onNormalizedReverted?.();
      // 칭호는 site_data 에 산다. 기록이 이미 되돌아갔으니 칭호 저장이 실패해도 취소 자체는 끝난 것이다.
      const currentTitles=data?.titleGroups||[];
      const titleGroups=revertTitleAwards(currentTitles,b.eventId);
      if(titleGroups!==currentTitles){
        const ok=await save({...data,titleGroups},"기록 반영과 이 대회로 받은 칭호를 취소했습니다.");
        if(!ok) flash("기록 반영은 취소했지만 칭호는 되돌리지 못했습니다. 칭호 화면에서 확인해 주세요.");
        return;
      }
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
        <Button variant="second" className="bk-img" onClick={()=>downloadChampionPng(b,res,nameOf)}>우승 이미지</Button>
        <Button variant="second" className="bk-img" onClick={()=>downloadBracketPng(b,nameOf)}>대진표 이미지</Button>
        {/* the one main action docks above the bars on a scrolling screen (DESIGN.md "Controls") */}
        {admin&&!readOnly&&!b.applied&&championshipEvent?.championship_phase!=="qualifier"&&<Dock><Button variant="main" icon="check" onClick={()=>onApply(b,res)}>기록에 반영</Button></Dock>}
        {b.applied&&<>{admin&&<span className="bk-applied"><Icon n="check" size={16}/> 기록 반영됨</span>}{!readOnly&&admin&&championshipEvent?.event_type==="champions"&&championshipEvent?.championship_phase==="final"&&<Button variant="link" size="sm" disabled={hallOfFameBusy} onClick={async()=>{setHallOfFameBusy(true);try{await ensureChampionshipHallOfFameEntry(b.eventId);flash("명예의 전당 등록 ✓");}catch(error){flash(`명예의 전당에 등록하지 못했습니다. ${error?.message||"잠시 뒤 다시 시도해 주세요."}`);}finally{setHallOfFameBusy(false);}}} loading={hallOfFameBusy}>명예의 전당 재시도</Button>}{!readOnly&&admin&&<Button variant="link" size="sm" onClick={undoApplied}>반영 취소</Button>}</>}
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
      showLate={admin}
    />}
    {admin&&championshipEvent?.championship_phase==="qualifier"&&<ChampionsBracketControls eventId={b.eventId} placement="qualifier" refreshKey={championshipRefreshKey} onChanged={()=>void refreshNormalized?.()}/>}
    {b.projection?.topology===GROUP_TOPOLOGY&&<GroupStageBoard b={b} admin={admin&&!locked} busy={matchMutationBusy}
      run={runGroup} nameOf={nameOf} battles={battles} startable={battleStartable} refresh={()=>void refreshNormalized?.()}/>}
    {b.projection?.topology===GROUP_TOPOLOGY&&b.knockout&&<>
      <h2 className="t20">본선</h2>
      {editAdmin&&!(res&&res.done)&&<ResultEntry g={b.knockout} nameOf={nameOf} busy={matchMutationBusy} onPick={pickGroupFinal}
        battles={battles} startable={battleStartable} eventId={b.eventId} onBattleChanged={()=>void refreshNormalized?.()}/>}
      <ElimBoard g={b.knockout} nameOf={nameOf} admin={editAdmin} onPick={pickGroupFinal} battles={battles}
        startable={battleStartable} eventId={b.eventId}/>
    </>}
    {admin&&!locked&&b.format==="elim"&&b.graph&&!(res&&res.done)&&<ResultEntry g={b.graph} nameOf={nameOf} busy={matchMutationBusy} onPick={pick} teamMode={teamMode} onOpenTeam={openTeam} outcomeOn={Boolean(outcomes)} onOutcome={saveOutcome}
      battles={battles} startable={battleStartable} eventId={b.eventId} onBattleChanged={()=>void refreshNormalized?.()} boutsOf={boutsOf}
      seedOf={(pid)=>{const i=(b.participants||[]).findIndex(x=>x.id===pid);return i>=0?i+1:null;}}/>}
    {b.format==="elim"&&<ElimBoard g={b.graph} nameOf={nameOf} admin={editAdmin} onPick={pick} teamMode={teamMode} onOpenTeam={openTeam} qualifier={championshipEvent?.championship_phase==="qualifier"} seedOf={(pid)=>{const i=(b.participants||[]).findIndex(x=>x.id===pid);return i>=0?i+1:null;}}
      battles={battles} startable={battleStartable} eventId={b.eventId} boutsOf={boutsOf}/>}
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
  /* 지난 대회와 같게: 기록에 반영된 가장 최근의 같은 종류 대회가 준 점수를 칸에 넣는다. 저장은 반영할 때 한 번이다 */
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
  const [guard,setGuard]=useState(""); // what stops 기록에 반영, said on the sheet
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
    if(linkedContextBusy||linkedContextError) return; // the key is off while the linked event loads or has failed; the form says why
    const stop=qualifierEvent?"선발전은 기록에 반영하지 않습니다. 선발전 현황에서 본선 진출자를 확정해 주세요."
      :!curT?"회차를 추가할 대회를 먼저 선택해 주세요."
      :!recordSeason?"기록을 반영할 시즌을 먼저 선택해 주세요.":"";
    setGuard(stop); if(stop) return;
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
    const chosen=awards.filter(a=>awardPicks.has(a.key)).map(a=>({...a,eventId:b.eventId}));
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
          <Button variant="second" onClick={skipTitles} disabled={awardBusy}>나중에</Button>
          <Button variant="main" icon="check" onClick={grantTitles} disabled={awardBusy||!awardPicks.size} loading={awardBusy}>칭호에 반영</Button>
        </div>
      </div>
    </Modal>);
  }
  if(preview){
    const changes=Object.entries(preview.deltas).map(([name,d])=>{ const cur=rankRows.find(r=>r.name===name); return {name,isNew:!cur,curPts:cur?.points||0,d}; });
    return (<Modal title="반영 전 확인" hint={excluded
      ? (champ?"아래 내용으로 공식 기록에 반영합니다. 챔피언스 성적은 랭킹에 반영되지 않습니다.":"아래 내용으로 공식 기록에 반영합니다.")
      : "아래 내용으로 기록에 반영합니다. 포인트 변동을 확인한 뒤 진행해 주세요."} onClose={()=>{ if(!applying) setPreview(null); }}>
      <div className="swap" key="pre">
      <div className="bk-applybox">
        <div className="bk-ab-meta">{team?"팀전":"개인전"}{champ?" 챔피언스 시리즈":""}</div>
        <div><span>{curT.label} <b>{preview.roundNum}회</b>{recordSeason?`, ${recordSeason}`:""}{rule.trim()?`, ${rule.trim()}`:""}</span></div>
        <div><span>우승 <b>{nameOf(res.champ)}</b>{res.ru?<>, 준우승 {nameOf(res.ru)}</>:null}{res.sf.length?<>, 4강 {res.sf.map(nameOf).join(", ")}</>:null}</span></div>
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
      </div> : <div className="bk-hint">{excluded?`${josa(curT.label, "topic")} 누적 랭킹과 시즌별 성적에 반영되지 않고 회차 기록에만 추가됩니다.`:"누적 랭킹 반영이 꺼져 있어 회차 기록에만 추가됩니다."}</div>}
      {preview.willSeason&&<div className="bk-hint">시즌별 성적 「{recordSeason}」에도 동일한 점수와 성적이 반영됩니다.</div>}
      <div className="modal-actions">
  <Button variant="second" onClick={()=>setPreview(null)} disabled={applying}>뒤로</Button>
  <Button
    variant="main" icon="check"
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
    onClose={onClose}
  >
    <div className="swap" key="form">
      <p className="t12 dim bk-apply-meta">순위, {team?"팀전":"개인전"}
          {linked&&linkedContext?.event?.division
            ? `, ${linkedContext.event.division==="master"?"마스터 리그":linkedContext.event.division==="rookie"?"루키 리그":linkedContext.event.division==="light"?"파이컵 라이트":linkedContext.event.division==="other"?"일반 대회":linkedContext.event.division}`
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
              <div><Icon n="check" size={16}/><span>{curT?.label||"회차"} 기록</span></div>
              <div className={excluded?"dim":undefined}><Icon n={excluded?"minus":"check"} size={16}/><span>
                {excluded
                  ? "누적 랭킹 미반영"
                  : `누적 랭킹${rankEra?.label?` (${rankEra.label})`:""}`}
              </span></div>
              <div className={excluded||champ?"dim":undefined}><Icon n={excluded||champ?"minus":"check"} size={16}/><span>
                {excluded||champ
                  ? "시즌별 성적 미반영"
                  : `시즌별 성적 (${recordSeason})`}
              </span></div>
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

      {guard&&<FormError>{guard}</FormError>}
      <div className="modal-actions">
        <Button variant="second" onClick={onClose}>나중에</Button>
        <Button variant="main" icon="check" onClick={prepare} disabled={linked&&(linkedContextBusy||Boolean(linkedContextError))}>기록에 반영</Button>
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
  // 움직임을 줄인 기기에서는 굴리지 않고 뽑힌 대진을 바로 세운다
  const [n,setN]=useState(()=>reduced()?total:0); const [roll,setRoll]=useState("");
  // 지금 뽑는 자리가 창 밖이면 따라간다 (2026-11-10: 13명부터는 추첨의 대부분이 화면 밖에서 일어났다)
  const rolling=useRef(null);
  useEffect(()=>{ rolling.current?.scrollIntoView({block:"nearest",inline:"nearest",behavior:reduced()?"auto":"smooth"}); },[n]);
  useEffect(()=>{
    if(n>=total){ const t=setTimeout(onDone,950); return ()=>clearTimeout(t); }
    let ticks=0; const iv=setInterval(()=>{ setRoll(allNames[Math.floor(Math.random()*allNames.length)]||""); if(++ticks>=9){ clearInterval(iv); const t=setTimeout(()=>setN(x=>x+1),140); return ()=>clearTimeout(t); } },70);
    return ()=>clearInterval(iv);
  },[n]); // eslint-disable-line
  /* 대진표의 칸 그대로 그린다(.mb, .mb-row): 이름이 들어와도 칸의 크기가 바뀌지 않고, 추첨이 끝나 대진표로 바뀔 때 같은 자리에 선다.
     아직 뽑지 않은 칸은 빈 줄, 뽑는 칸은 한 단 밝게, 부전승과 다음 라운드의 대기는 대진표와 같은 흐린 글자다. */
  const row=(cls,text,ref)=><div className={"mb-row"+cls} ref={ref}><i className="mb-seed num t12" aria-hidden="true"/><span className="mb-name">{text}</span></div>;
  const slotFor=(key,pid,bye)=>{
    if(bye) return row(" wait","부전승");
    const ord=order[key];
    if(ord<n) return row(ord===n-1?" pop":"",nameOf(pid));
    if(ord===n) return row(" drolling",roll,rolling);
    return row(" wait","");
  };
  const done=n>=total;
  const skip=<Button variant={done?"main":"second"} size="sm" icon={done?"check":undefined} onClick={onDone}>{done?"대진 확정":"건너뛰기"}</Button>;
  return (<div className="bk-drawwrap swap">
    <div className="bk-draw-h"><h2 className="t20">{done?"대진 확정":"대진 추첨 중"}</h2><span className="t15 bk-draw-cnt num">{Math.min(n,total)} / {total}</span><span className="bk-draw-skip">{skip}</span></div>
    {group ? (
      <div className="bk-groups">{b.groups.map((g,gi)=>(
        <div className="bk-group" key={g.id}><div className="bk-group-h">그룹 {g.name}</div>
          <div className="mb">{g.members.map((mem,mi)=>slotFor("g"+gi+"_"+mi,mem,false))}</div>
        </div>))}</div>
    ) : (()=>{ const {centers,totalH}=treeCenters(b.graph.rounds);
      return (<div className="bk-scroll sq" role="region" aria-label="대진표" tabIndex={0}><div className="bk-tree">
        {b.graph.rounds.map((r,ri)=>(<div className="bk-col2" key={ri}>
          <div className="bk-col-h t12 dim">{b.graph.kind==="double"?("승자조 "+(ri+1)+"R"):rlabel(r.length)}</div>
          <div className="bk-col-body" style={{height:totalH,"--bk-pitch":(BK_PITCH0*Math.pow(2,ri))+"px"}}>
            {r.map((m,j)=>(<div className="bk-mpos" key={m.id} style={{top:(centers[ri][j]-BK_MATCH_H/2)+"px"}}>
              {ri===0
                ? <div className="mb">{slotFor("m"+j+"_0",m.a.pid,m.a.bye)}{slotFor("m"+j+"_1",m.b.pid,m.b.bye)}</div>
                : <div className="mb">{row(" wait","대기")}{row(" wait","대기")}</div>}
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
const pbChamp=b=>{ const r=elimResult(b.graph); return r?.done?b.participants.find(p=>p.id===r.champ)?.name||"":""; };
const pbHasPicks=b=>collectGraphMatches(b.graph).some(m=>m.winner);

function PrivateBracketCreate({ onClose, onCreate }){
  const [name,setName]=useState(""); const [host,setHost]=useState(()=>{ try{return localStorage.getItem("ypl-board-nick")||"";}catch{return "";} });
  const [pin,setPin]=useState(""); const [namesText,setNamesText]=useState(""); const [double,setDouble]=useState("single");
  const [order,setOrder]=useState("random"); const [note,setNote]=useState(""); const [busy,setBusy]=useState(false);
  const names=parseParticipantNames(namesText);
  /* what is missing is said under its own field (DESIGN.md "Controls", Error on a field), every field at once: a dialog laid over this
     sheet said one at a time and hid the field it was about (2026-11-10) */
  const [tried,setTried]=useState(false);
  const bad={ name:!name.trim()&&"대진표 이름을 입력해 주세요.", host:!host.trim()&&"개설자 닉네임을 입력해 주세요.", pin:pin.length!==4&&"숫자 4자리를 정해 주세요.",
    names:names.length<2?"참가자를 2명 이상 적어 주세요.":names.length>PRIVATE_BRACKET_MAX&&`참가자는 ${PRIVATE_BRACKET_MAX}명까지 넣을 수 있습니다.` };
  const submit=async()=>{
    if(busy)return;
    if(Object.values(bad).some(Boolean)){ setTried(true); return; }
    setBusy(true);
    try{ await onCreate({name,host,pin,names,double:double==="double",order,note}); }
    finally{ setBusy(false); }
  };
  return (<Modal title="새 사설 대진표" onClose={onClose}>
    <div className="swap" key="pb-create">
      <Field label="대진표 이름" error={tried&&bad.name}><input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 동아리방 금요 연습전" maxLength={40}/></Field>
      <div className="bk-grow2">
        <Field label="개설자 닉네임" error={tried&&bad.host}><input value={host} onChange={e=>setHost(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></Field>
        <Field label="관리 비밀번호 (숫자 4자리)" error={tried&&bad.pin}><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="결과 입력에 필요" inputMode="numeric"/></Field>
      </div>
      <div className="field"><label htmlFor="pb-names">참가자 {names.length>0&&<span className="tnum">{names.length}명</span>}</label>
        <textarea id="pb-names" value={namesText} onChange={e=>setNamesText(e.target.value)} rows={6} placeholder={"한 줄에 한 명씩 적거나 쉼표로 나눠 붙여넣어 주세요.\n지우\n이슬\n웅"} aria-invalid={tried&&bad.names?true:undefined}/>
        {tried&&bad.names&&<FormError>{bad.names}</FormError>}</div>
      <div className="field"><span className="field-label">방식</span><Segmented value={double} onChange={setDouble} ariaLabel="대진 방식" options={[["single","싱글 엘리미네이션"],["double","더블 엘리미네이션"]]}/></div>
      <div className="field"><span className="field-label">대진 배치</span><Segmented value={order} onChange={setOrder} ariaLabel="대진 배치" options={[["random","무작위 추첨"],["input","적은 순서대로"]]}/></div>
      <Field label="안내 (선택)"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="규칙, 일정, 장소 등을 적어 주세요."/></Field>
      <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" disabled={busy} onClick={submit} loading={busy}>대진표 만들기</Button></div>
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
  return (<Modal title="대진표 수정" onClose={onClose}>
    <div className="swap" key="pb-edit">
      <Field label="대진표 이름"><input value={name} onChange={e=>setName(e.target.value)} maxLength={40}/></Field>
      <Field label="개설자 닉네임"><input value={host} onChange={e=>setHost(e.target.value)} maxLength={20}/></Field>
      <div className="field"><span className="field-label">참가자 이름</span>
        {names.map((n,i)=><input key={b.participants[i].id} value={n} aria-label={`참가자 ${i+1}`} maxLength={20} style={{marginTop:i?8:0}} onChange={e=>{const v=e.target.value; setNames(cur=>cur.map((x,k)=>k===i?v:x));}}/>)}</div>
      <Field label="안내 (선택)"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}/></Field>
      <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" disabled={busy} onClick={submit} loading={busy}>저장</Button></div>
    </div>
  </Modal>);
}

function PrivateBrackets({ admin, flash, tabs }){
  const [list,setList]=useState(()=>peekRead(PRIVATE_BRACKETS_KEY)||null);
  const listArrived=useArrival(Boolean(list));
  const [fresh,setFresh]=useState(false);
  const [loadError,setLoadError]=useState("");
  const reload=async()=>{ try{ setList(await freshRead(PRIVATE_BRACKETS_KEY,()=>readCommunity(PRIVATE_BRACKETS_KEY))); setLoadError(""); }catch(error){ setLoadError(readErrorText(error,"사설 대진표를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.")); }finally{ setFresh(true); } };
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
  // Read the current draw, then let the DB reject a competing save by its token.
  const write=async(id,change,done)=>{ setBusy(true);
    try{
      const expectedUpdatedAt=(list||[]).find(x=>x.id===id)?.updatedAt;
      const current=(await readCommunity(PRIVATE_BRACKETS_KEY)).find(x=>x.id===id);
      const patch=buildPrivateBracketPatch(current,expectedUpdatedAt,change);
      await patchCommunityItem(PRIVATE_BRACKETS_KEY,id,patch,{pin:unlocked.get(id)||"",expectedUpdatedAt:current.updatedAt});
      await reload();
      if(done)flash(done); return true; }
    catch(error){ siteAlert("저장하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); void reload(); return false; } finally{ setBusy(false); } };

  const create=async({pin,...input})=>{
    let b; try{ b=createPrivateBracket(input); }catch(error){ siteAlert("대진표를 만들 수 없습니다.",error?.message||""); return; }
    setBusy(true);
    try{ await createCommunityItem(PRIVATE_BRACKETS_KEY,b.id,b,{pin}); await reload(); if(b.order!=="random") flash("사설 대진표를 만들었습니다."); } // 추첨이 시작되면 화면이 말한다
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
        <h1 className="t32 bk-open-title" data-vt={"pb-"+open.id}>{open.name}</h1>
        <p className="t12 dim reg bk-open-line">사설, {open.host?`${open.host} 개설, `:""}{pbFormat(open)}, {open.participants.length}명{open.createdAt?`, ${formatDate(open.createdAt)}`:""}</p>
        {open.note&&<div className="bk-note"><Prose text={open.note}/></div>}
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
    {/* the search with its main action at the row's right end, as the board's 글쓰기 stands (DESIGN.md "Controls": beside a search it
        keeps its own width): alone over the search it was a white bar across the whole 1200 (2026-11-10) */}
    <div className="bd-tools stack"><ListSearch q={q} setQ={setQ} placeholder="대진표, 개설자, 참가자 검색" count={shown.length}/><Button variant="main" icon="plus" onClick={()=>setCreating(true)}>새 사설 대진표</Button></div>
    {loadError&&<ErrorNote action="다시 불러오기" onRetry={reload}>{loadError}</ErrorNote>}
    {!list?(!loadError&&<Loader/>):shown.length===0
      ? (kw?<Empty className="swap" title="검색 결과가 없습니다."/>
           :<Empty className="swap" title="아직 사설 대진표가 없습니다."/>)
      : <div className="stack bk-rows" ref={listArrived}>{shown.map((b,i)=><BracketRow key={b.id} b={b} lead={i===0&&!kw} vt={"pb-"+b.id} live={pbStatus(b)==="진행 중"}
          line={`${b.host?`${b.host} 개설, `:""}${b.participants.length}명, ${pbFormat(b)}${pbChamp(b)?`, 우승 ${pbChamp(b)}`:""}`} onOpen={()=>openBracket(b)}/>)}</div>}
    {creating&&<PrivateBracketCreate onClose={()=>setCreating(false)} onCreate={create}/>}
  </section>);
}
/* ===== 사설 대진표 끝 ===== */

/* only what runs carries a status: an ended bracket says 우승 in its grey line, so its end shows the date alone (nothing when the
   old record has none) instead of 종료 on every row */
function BracketRow({ b, vt, live, line, end, onOpen, lead=false }){
  const d=dotDate(b.createdAt);
  /* the newest of a list stands as a lead panel: its date lit, the amber lamp while it runs */
  if(lead) return <Lead date={d?.day} title={<span data-vt={vt}>{b.name}</span>} line={[line,end].filter(Boolean).join(", ")}
    lamp={live?"진행 중":null} sig={live} onClick={onOpen} label={`${b.name}, ${[line,live?"진행 중":end].filter(Boolean).join(", ")}`}/>;
  return <Row title={<span data-vt={vt}>{b.name}</span>} line={line} onClick={onOpen}
    value={live?<Status live>진행 중</Status>:end?<Status>{end}</Status>:d?<Status><span className="num">{d.day}<span className="wd">{d.weekday}</span></span></Status>:null}/>;
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
      setNormalizedLoadError(readErrorText(error,"잠시 뒤 다시 시도해 주세요."));
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
      b.eventId&&(b.mode==="single"||(b.mode==="team"&&b.format==="elim"))
    );
    if(!normalizedCandidate){
      flash("공식 대진표는 대회를 선택한 뒤 만들 수 있습니다.");
      return false;
    }
    if(normalizedCandidate){
      if(b.eventId&&list.some(existing=>existing.eventId===b.eventId)){
        flash("이 대회에 연결된 대진표가 이미 있습니다.");
        return false;
      }

      // Individual registration, slots and formed matches are saved together.
      // The existing team confirmation and runtime path stays separate.
      if(b.mode==="single"){
      try{
        const attempt=b.normalizedAttempt||buildNormalizedSingleCreateAttempt(b.participants||[]);
        await createIndividualBracketDraw({eventId:b.eventId,attempt,
          topology:b.format==="group"?GROUP_TOPOLOGY:b.double?"double_elimination":"single_elimination",
          groupPlan:b.plan,advance:b.groupCfg?.adv,finalFormat:b.groupCfg?.finalFormat,rookiePlayers:b.rookiePlayers,
        });
        const loaded=await fetchNormalizedSingleBracketRuntime(b.eventId,attempt.runtimeId);
        if(!loaded) throw new Error("만든 대진표를 다시 불러오지 못했습니다.");
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
        confirmation=await confirmEventTeamsForBracket(b.eventId,b.participants||[]);
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
        const runtimeParticipants=confirmedParticipants.flatMap(team=>(team.memberIdentities||[]).map(member=>({
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
            })));
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
  // the list comes from the server after the page stands: it lights the moment it arrives
  const listArrived=useArrival(normalizedInitialReady);
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
      {admin&&<Button variant="link" disabled={!!deletingId} onClick={()=>transition(()=>flushSync(()=>setWizard(true)))}>새 대진표</Button>}
    </header>}
    {!open&&!wizard&&normalizedLoadError&&<ErrorNote action="다시 불러오기" onRetry={()=>void loadNormalized({initial:true})}>대진표를 불러오지 못했습니다. {normalizedLoadError}</ErrorNote>}
    {!open&&!wizard&&tabsEl()}
    {!open&&!wizard&&<div className="bk-list swap" ref={listArrived}>
      {!normalizedInitialReady
        ? <Loader/>
        : list.length===0&&<Empty title="아직 만들어진 대진표가 없습니다.">
            {admin&&<Button variant="second" onClick={()=>transition(()=>flushSync(()=>setWizard(true)))}>첫 대진표 만들기</Button>}
          </Empty>}
      {list.length>0&&<div className="stack bk-rows">{list.map((b,i)=><BracketRow key={b.id} b={b} lead={i===0} vt={"b-"+b.id} live={statusTag(b)==="진행 중"}
        line={lineOf(b)} end={admin&&statusTag(b)!=="진행 중"?statusTag(b):null} onOpen={()=>openBracket(b)}/>)}</div>}
    </div>}
    {open&&!wizard&&(()=>{ const openRes=open.format==="group"?(open.knockout?elimResult(open.knockout):null):elimResult(open.graph);
      const openName=pid=>{ const p=(open.participants||[]).find(x=>x.id===pid); return p?p.name:pid; };
      return <div className="bk-open">
      <header className="bk-head-open">
        <BackLink to="대진표" onClick={deletingId===open.id?undefined:closeBracket}/>
        <div className="bk-open-row">
          <div className="bk-open-copy">
            <h1 className="t32 bk-open-title" data-vt={"b-"+open.id}>{open.name}</h1>
            <p className="t12 dim reg bk-open-line">{open.mode==="team"?"팀전":"개인전"}, {bracketFormat(open)}, {(open.participants||[]).length}{open.mode==="team"?"팀":"명"}{open.createdAt?`, ${formatDate(open.createdAt)}`:""}{admin&&statusTag(open)!=="진행 중"?`, ${statusTag(open)}`:""}</p>
          </div>
          {/* desktop: the images stand beside the title; a phone keeps them under the result */}
          {openRes?.done&&<div className="stack bk-tools">
            <Button variant="second" size="sm" onClick={()=>downloadChampionPng(open,openRes,openName)}>우승 이미지</Button>
            <Button variant="second" size="sm" onClick={()=>downloadBracketPng(open,openName)}>대진표 이미지</Button>
          </div>}
        </div>
        {statusTag(open)==="진행 중"&&<p className="pn bk-strip t12"><Status live>진행 중</Status>{liveProgress(open)&&<span className="dim">{liveProgress(open)}</span>}</p>}
      </header>
       {drawId===open.id ? <BracketDraw b={open} onDone={()=>setDrawId(completeNormalizedBracketDraw())}/> : <BracketBoard b={open} admin={admin} flash={flash} readOnly={open.readOnly} refreshNormalized={loadNormalized} onNormalizedReverted={loadNormalized} data={data} save={save} deleting={deletingId===open.id} onApply={(b,res)=>setApply({b,res})}/>}
      {/* a delete that cannot be undone stands last, after everything the bracket shows */}
      {!open.readOnly&&admin&&<div className="stack bk-actions bk-delete"><Button variant="second" disabled={!!open.applied} loading={deletingId===open.id} title={open.applied?"기록 반영 취소 후 삭제할 수 있습니다.":""} onClick={()=>del(open)}>삭제</Button></div>}
    </div>; })()}
    {wizard&&<BracketWizard data={data} onClose={()=>transition(()=>flushSync(()=>setWizard(false)),{dir:"back"})} onCreate={create}/>}
     {apply&&<BracketApply b={apply.b} res={apply.res} data={data} save={save} flash={flash} refresh={refresh} onNormalizedApplied={loadNormalized} onClose={()=>{setApply(null);void loadNormalized();}}/>}
  </section>);
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BackLink, Chips, Choice, Counter, Dock, Question, Row, SectionHead, Toast } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import { PushLink } from "../components/common/PushControl.jsx";
import Seg from "../components/common/Seg.jsx";
import { isNewNotice, markNoticeSeen } from "../components/common/seenNotices.js";
import { Dropdown, Empty, Icon, ListSearch, Modal, Pager, Prose, siteAlert, siteConfirm, transition } from "../components/index.js";
import { backWith, popHandlers, pushHistory } from "../components/layout/history.js";
import { CHAMPIONSHIP_FINAL_FORMAT, CHAMPIONSHIP_QUALIFIER_FORMAT } from "../services/championsCore.js";
import { dotDate, formatDate } from "../services/dateFormat.js";
import { builderRouteSearch, listEventApplications, listEventRegistrationSubmissionStatuses, resetSubmissionPin, resolveChampionshipSubmissionEvents } from "../services/index.js";

const fmtDT=iso=>formatDate(iso,{time:true});

const PAGE_SIZE=8;
const DAY_MS=86400000;
/* 그날 0시까지 남은 날. 일까지 없으면 null. */
function daysTo(raw, now=new Date()){
  const n=String(raw||"").match(/\d+/g);
  if(!n||n.length<3) return null;
  const day=new Date(+n[0],+n[1]-1,+n[2]);
  return Number.isNaN(day.getTime())?null:Math.round((day-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/DAY_MS);
}
const FORMAT={double_elimination:"더블 엘리미네이션",single_elimination:"싱글 엘리미네이션",round_robin:"리그전"};
const BATTLE={singles:"싱글 배틀",doubles:"더블 배틀"};

/* 대회 공지의 판과 표(DESIGN.md "Notices"): 공지의 대회 정보(eventDraft)만 읽는다. */
function eventFacts(a){
  const d=a.form?.eventDraft; if(!d) return null;
  const champions=d.eventType==="champions";
  const held=champions?[["선발전",d.qualifierHeldOn??d.heldOn],["본선",d.finalHeldOn]]:[["",d.heldOn]];
  const next=held.map(([k,raw])=>({k,raw,dday:daysTo(raw)})).filter(x=>x.dday!=null&&x.dday>=0).sort((p,q)=>p.dday-q.dday)[0]||null;
  const rows=[
    ...held.filter(([,raw])=>raw).map(([k,raw])=>[k?`${k} 일시`:"일시",formatDate(raw,{time:true})]),
    ...(BATTLE[d.battleFormat]?[["형식",BATTLE[d.battleFormat]]]:[]),
    ...(champions?[["방식",`선발전 ${FORMAT[CHAMPIONSHIP_QUALIFIER_FORMAT]}, 본선 ${FORMAT[CHAMPIONSHIP_FINAL_FORMAT]}`]]:FORMAT[d.competitionFormat]?[["방식",FORMAT[d.competitionFormat]]]:[]),
    ["단위",d.isTeamEvent?"팀전":"개인전"],
    ...(champions?[["선발전 제출",d.qualifierSubmissionTargetAt],["본선 제출",d.finalSubmissionTargetAt]]:[["파티 제출",d.submissionTargetAt]]).filter(([,t])=>t).map(([k,t])=>[k,`${formatDate(t,{time:true})}까지`]),
  ];
  return {next,rows};
}

/* 공지 목록의 한 줄: 제목, 그 아래 회색 줄의 날짜(고정이면 고정이 켜진다), 줄 끝의 램프 칸. 새 글이면 램프가 켜진다(seenNotices.js) */
const NoticeRow=({a,onOpen})=>{
  const d=dotDate(a.date), fresh=isNewNotice(a);
  return <Row title={a.title} line={<>{d?<><span className="num">{d.day}</span> {d.weekday}</>:formatDate(a.date)}{a.pinned&&<b className="nw-pin">고정</b>}</>} lamp={fresh} label={fresh?`${a.title}, ${formatDate(a.date)}, 새 글`:undefined} onClick={onOpen}/>;
};

/* 공지: 목록에서 제목을 누르면 본문 화면으로 넘어간다. 신청은 공지 위에 서는 한 장이고, 파티 제출은 팀 빌더로 간다.
   연 공지는 주소(?notice=)와 기록 한 칸에 남는다. (docs/redesign-next c4, c11, c15, c17, c20) */
export default function NewsPage({ data, admin, setModal, save, submitForm, refresh, go }) {
  const [q,setQ]=useState(""); const [page,setPage]=useState(1);
  const [fill,setFill]=useState(null); const [respId,setRespId]=useState(null);
  const [eventResponses,setEventResponses]=useState({});
  const [championshipSubmissionEvents,setChampionshipSubmissionEvents]=useState({});
  const [seen,setSeen]=useState({});
  // ?notice=<id>로 들어오면(공유한 링크) 그 공지를 바로 연다. 닫으면 주소에서도 지운다.
  const [article,setArticle]=useState(()=>new URLSearchParams(window.location.search).get("notice"));
  const listScroll=useRef(0);
  const refreshEventApplications=useCallback(async announcement=>{
    if(!announcement?.form?.eventId) return false;
    try{
      const rows=await listEventApplications(announcement.form.eventId);
      setEventResponses(previous=>({...previous,[announcement.id]:rows}));
      setSeen(previous=>({...previous,[announcement.id]:new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}));
      return true;
    }catch(error){
      console.error(error);
      return false;
    }
  },[]);
  const refreshPublicResponses=async announcement=>{
    if(announcement?.form?.eventId) return refreshEventApplications(announcement);
    if(!refresh) return false;
    await refresh();
    setSeen(previous=>({...previous,[announcement.id]:new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}));
    return true;
  };
  useEffect(()=>{
    const targets=(data.announcements||[]).filter(a=>
      a.form?.enabled&&a.form?.eventId&&(
        admin||(a.form.fields||[]).some(f=>f.public)
      )
    );
    if(!targets.length) return;
    let cancelled=false;
    Promise.all(targets.map(async a=>{
      try{ return [a.id,await listEventApplications(a.form.eventId)]; }
      catch(error){ console.error(error); return [a.id,[]]; }
    })).then(rows=>{
      if(cancelled) return;
      setEventResponses(Object.fromEntries(rows));
    });
    return ()=>{cancelled=true;};
  },[admin,data.announcements]);
  useEffect(()=>{
    const targets=(data.announcements||[]).filter(a=>a.form?.eventId&&a.form?.eventDraft?.eventType==="champions");
    if(!targets.length){ setChampionshipSubmissionEvents({}); return; }
    let cancelled=false;
    Promise.all(targets.map(async announcement=>{
      try{return [announcement.id,await resolveChampionshipSubmissionEvents(announcement.form.eventId)];}
      catch(error){ console.error(error); return [announcement.id,{error:error?.message||"챔피언스 선발전과 본선 정보를 확인하지 못했습니다."}]; }
    })).then(rows=>{if(!cancelled)setChampionshipSubmissionEvents(Object.fromEntries(rows));});
    return ()=>{cancelled=true;};
  },[data.announcements]);
  // 공지를 여는 것은 기록 한 칸: 폰의 뒤로 가기가 목록으로 돌아오고, 공지 탭을 다시 누르면 목록이 된다
  useEffect(()=>{ const onPop=()=>setArticle(new URLSearchParams(window.location.search).get("notice")||null); popHandlers.add(onPop); return ()=>{ popHandlers.delete(onPop); }; },[]);
  useEffect(()=>{ markNoticeSeen(article); },[article]);
  const openArticle=id=>{ listScroll.current=window.scrollY; const url=new URL(window.location.href); url.searchParams.set("notice",id);
    pushHistory({...window.history.state,notice:id},url); transition(()=>flushSync(()=>setArticle(id)),{shared:"n-"+id}); };
  const closeArticle=()=>{ const id=article; if(window.history.state?.notice) return backWith("n-"+id);
    const url=new URL(window.location.href); if(url.searchParams.has("notice")){ url.searchParams.delete("notice"); window.history.replaceState(window.history.state,"",url); } transition(()=>flushSync(()=>setArticle(null)),{shared:"n-"+id,dir:"back",scrollY:listScroll.current}); };
  const href=(u)=>/^https?:\/\//.test(u)?u:"https://"+u;
  const all=[...data.announcements].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(a.date<b.date?1:-1));
  const kw=q.trim().toLowerCase();
  const list=kw?all.filter(a=>[a.title,a.body,a.date].some(t=>String(t||"").toLowerCase().includes(kw))):all;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  const cur=Math.min(page,pages);
  const shown=list.slice((cur-1)*PAGE_SIZE,cur*PAGE_SIZE);
  useEffect(()=>{setPage(1);},[q]);
  const respAnn=respId?data.announcements.find(a=>a.id===respId):null;
  const resetPin=async(row)=>{
    if(!(await siteConfirm({title:"제출 비밀번호 초기화",body:`${row.registrationName}의 제출 비밀번호를 지웁니다. 다음 제출 때 새로 정하며, 제출한 파티는 그대로 남습니다.`,confirmLabel:"초기화"})))return;
    try{ await resetSubmissionPin(row.id); siteAlert("제출 비밀번호를 초기화했습니다."); }
    catch(error){ siteAlert("초기화하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); }
  };
  const delResp=(rid)=>{ const announcements=data.announcements.map(a=>a.id!==respId?a:{...a,form:{...(a.form||{}),responses:((a.form||{}).responses||[]).filter(r=>r.id!==rid)}}); save({...data,announcements}); };
  const a=article?data.announcements.find(x=>x.id===article):null;
  useEffect(()=>{ setFill(null); },[article]);
  const modals=<>
    {respAnn&&<FormResponsesModal ann={respAnn} responsesOverride={respAnn.form?.eventId?(eventResponses[respAnn.id]||[]):null} onClose={()=>setRespId(null)} onDeleteResp={respAnn.form?.eventId?null:delResp} onResetPin={respAnn.form?.eventId?resetPin:null}/>}
  </>;

  const fillAnn=a&&fill===a.id?a:null;
  if(fillAnn){
    return (<FormPage ann={fillAnn} responsesOverride={fillAnn.form?.eventId?(eventResponses[fillAnn.id]||[]):null} onBack={()=>setFill(null)}
      onSubmit={async answers=>{
        const ok=await submitForm(fillAnn.id,answers);
        if(ok===true&&fillAnn.form?.eventId) await refreshEventApplications(fillAnn);
        return ok;
      }}/>);
  }

  if(a){
    const hasForm=a.form&&a.form.enabled; const championshipSubmission=championshipSubmissionEvents[a.id];
    const openBuilder=(eventId)=>{if(go)go("builder",{eventId});else window.location.search=builderRouteSearch(eventId,window.location.search);};
    const facts=eventFacts(a);
    const next=facts?.next;
    const applied=a.form?.eventId&&eventResponses[a.id]?eventResponses[a.id].length:null;
    const clock=next?.dday===0?dotDate(next.raw)?.clock:"";
    // 주 행동은 하나다: 신청을 받으면 참가 신청, 아니면 파티 제출. 나머지는 패널 버튼으로 선다.
    const submits=[
      ...(a.form?.eventId&&a.form?.eventDraft?.eventType!=="champions"?[["파티 제출",a.form.eventId]]:[]),
      ...(championshipSubmission?.isChampionship?[["선발전 파티 제출",championshipSubmission.qualifierEvent.id],["본선 파티 제출",championshipSubmission.finalEvent.id]]:[]),
    ];
    const main=hasForm?[a.form.buttonLabel||"참가 신청",()=>setFill(a.id)]:submits[0]?[submits[0][0],()=>openBuilder(submits[0][1])]:null;
    const seconds=hasForm?submits:submits.slice(1);
    const others=all.filter(x=>x.id!==a.id).slice(0,5);
    // 데스크톱은 709와 439 두 단: 왼쪽은 본문, 오른쪽은 대회의 사실과 행동, 그 아래 다른 공지. 폰은 지금 순서 그대로 한 단.
    return (<section className="nw nw-art">
      <header className="nw-art-head">
        <BackLink to="공지" onClick={closeArticle}/>
        <p className="t12 dim reg nw-date">{a.pinned&&"고정, "}{formatDate(a.date)}</p>
        <h1 className="t32 nw-title" data-vt={"n-"+a.id}>{a.title}</h1>
      </header>
      <aside className="nw-aside">
        {(next||applied!=null)&&<div className="stack nw-counts">
          {next&&(next.dday===0
            ? <Counter label={`${next.k?next.k+" ":""}오늘 진행 중`} lamp="sig" value={clock||"  :  "} cells={4} after={<span className="t15">시작</span>}/>
            : <Counter label={`${next.k||"대회"}까지`} lamp value={String(next.dday).padStart(2,"0")} cells={next.dday>=100?3:2} unit="일" after={<span className="t15">일</span>}/>)}
          {applied!=null&&<Counter label="신청" value={applied} cells={applied>=100?3:2} unit="명"/>}
        </div>}
        {facts?.rows.length>0&&<div className={"stack nw-spec"+(next||applied!=null?" joined":"")}>
          {facts.rows.map(([k,v])=><div className="pn spec-row" key={k}><span className="t12 dim">{k}</span><span className="t15">{v}</span></div>)}
        </div>}
        {(seconds.length>0||a.link||a.link2)&&<div className="stack nw-more">
          {seconds.map(([label,id])=><Button variant="second" key={label} onClick={()=>openBuilder(id)}>{label}</Button>)}
          {a.link&&<Button variant="second" href={href(a.link)} target="_blank" rel="noopener noreferrer">{a.linkLabel||"링크 바로가기"}<Icon n="ext" size={16}/></Button>}
          {a.link2&&<Button variant="second" href={href(a.link2)} target="_blank" rel="noopener noreferrer">{a.link2Label||"링크 바로가기"}<Icon n="ext" size={16}/></Button>}
        </div>}
        {admin&&<div className="stack nw-admin">
          {(hasForm||a.form?.eventId)&&<Button variant="second" onClick={()=>setRespId(a.id)}>응답 보기 {a.form.eventId?(eventResponses[a.id]||[]).length:(a.form.responses||[]).length}</Button>}
          <Button variant="second" onClick={()=>setModal({type:"ann",item:a})}>수정</Button>
        </div>}
        {main&&<div className="nw-main-act"><Dock><Button variant="main" onClick={main[1]}>{main[0]}</Button></Dock></div>}
        {others.length>0&&<section className="nw-others" aria-labelledby="nw-others">
          <SectionHead id="nw-others" title="다른 공지"/>
          <div className="stack">{others.map(x=><NoticeRow key={x.id} a={x} onOpen={()=>openArticle(x.id)}/>)}</div>
        </section>}
      </aside>
      <div className="nw-main">
        {a.body&&<div className="nw-body"><Prose text={a.body}/></div>}
        {hasForm&&(a.form.fields||[]).some(f=>f.public)&&<div className="nw-resp"><PublicResponses
          ann={a}
          responsesOverride={a.form?.eventId?(eventResponses[a.id]||[]):null}
          onRefresh={()=>refreshPublicResponses(a)}
          updatedAt={seen[a.id]||""}
        /></div>}
      </div>
      {modals}
    </section>);
  }

  return (<section className="nw">
    <header className="nw-head">
      <h1 className="t32">공지</h1>
      <span className="nw-tools">
        {admin&&<Button variant="link" onClick={()=>setModal({type:"ann"})}>공지 작성</Button>}
        <PushLink/>
      </span>
    </header>
    <div className="nw-search"><ListSearch q={q} setQ={setQ} placeholder="공지 제목과 내용 검색" count={list.length}/></div>
    {list.length===0?(kw
      ? <>
        <div className="pn nw-none"><Seg value={0} h={40} cells={2} label="0건"/><div><b className="t15">맞는 공지가 없습니다.</b><p className="t12 dim reg">{`‘${kw}’에 맞는 공지를 찾지 못했습니다.`}</p></div></div>
        {all.length>0&&<><p className="t12 dim nw-recent">최근 공지</p><div className="stack nw-list">{all.slice(0,3).map(a=><NoticeRow key={a.id} a={a} onOpen={()=>openArticle(a.id)}/>)}</div></>}
      </>
      : <Empty title="등록된 공지가 없습니다." desc="대회 일정과 운영 소식이 올라오면 이곳에 표시됩니다."/>)
    : <div className="stack nw-list">{shown.map(a=><NoticeRow key={a.id} a={a} onOpen={()=>openArticle(a.id)}/>)}</div>}
    <div className="nw-pager"><Pager page={cur} pages={pages} onGo={setPage}/></div>
    {modals}
  </section>);
}

/* ===== 공개 응답 목록 (예: 실시간 밴 리스트) ===== */
function PublicResponses({ ann, compact, onRefresh, updatedAt, responsesOverride=null }){
  const form=ann.form||{};
  const fields=(form.fields||[]).filter(f=>f.public);
  const [open,setOpen]=useState(false); // 기본은 접힘 — 응답이 쌓여도 화면이 길어지지 않도록
  if(!fields.length) return null;
  const resp=[...(responsesOverride??form.responses??[])].sort((a,b)=>(a.createdAt<b.createdAt?-1:1));
  const val=(r,f)=>{ const v=(r.answers||{})[f.id]; return Array.isArray(v)?v.join(", "):String(v||""); };
  return (<div className={"pr-wrap fold"+(open?" open":"")+(compact?" compact":"")}>
    <button type="button" className="fold-head pr-fold-head" onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}>
      <span className="pr-title">{form.publicTitle||"현재까지 신청 현황"}</span>
      <span className="pr-n">{resp.length}명</span>
      <span className="fold-chev" aria-hidden="true"><Icon n="chev" size={16}/></span>
    </button>
    {open&&<div className="pr-body swap">
      {resp.length===0
        ? <div className="pr-empty">아직 신청자가 없습니다. 첫 신청자를 기다립니다.</div>
        : <div className="pr-list">
            {resp.map((r,i)=>(<div className="pr-row" key={r.id}>
              <span className="pr-name">{i+1}</span>
              <div className="pr-vals">
                {fields.map(f=>{ const v=val(r,f); if(!v) return null;
                  return (<div className="pr-val" key={f.id}>
                    {fields.length>1&&<span className="pr-flabel">{f.label||"응답"}</span>}
                    <span className="pr-vtext">{v}</span>
                  </div>); })}
              </div>
            </div>))}
          </div>}
      <div className="pr-foot">
        {onRefresh&&<button className="pr-refresh" onClick={e=>{e.stopPropagation();onRefresh();}} aria-label="공개 응답 새로고침" title="새로고침"><Icon n="refresh" size={16}/></button>}
        {updatedAt&&<span>마지막 확인 {updatedAt}</span>}
      </div>
    </div>}
  </div>);
}


/* ===== 참가 신청: 공지 위에 서는 한 장. 신청은 화면 아래에 붙은 한 버튼이고, 빠진 답은 그 칸 아래에서 알린다. ===== */
function FormPage({ ann, responsesOverride=null, onBack, onSubmit }){
  const form=ann.form||{}; const fields=form.fields||[];
  const [ans,setAns]=useState({}); const [registrationName,setRegistrationName]=useState(""); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  const [errors,setErrors]=useState({}); const [failed,setFailed]=useState("");
  const set=(id,v)=>{ setAns(a=>({...a,[id]:v})); setErrors(e=>({...e,[id]:""})); };
  const submit=async()=>{
    const next={};
    if(form.eventId&&!registrationName.trim()) next.name="참가자 이름을 입력해 주세요.";
    for(const f of fields){ if(f.required){ const v=ans[f.id]; const empty=Array.isArray(v)?v.length===0:!String(v||"").trim(); if(empty) next[f.id]=`‘${f.label||"질문"}’ 항목에 답해 주세요.`; } }
    setErrors(next); setFailed("");
    const first=Object.keys(next)[0];
    if(first){ document.getElementById(first==="name"?"ff-name":`ff-${first}`)?.focus(); return; }
    setBusy(true); const ok=await onSubmit({registrationName:registrationName.trim(),answers:ans}); setBusy(false);
    if(typeof ok==="string"){ setFailed(ok); return; }
    if(ok===false){ setFailed("신청 저장을 확인하지 못했습니다."); return; }
    setDone(true);
  };
  const required=form.eventId||fields.some(f=>f.required);
  if(done) return (<section className="nw">
    <BackLink to={ann.title} onClick={onBack}/>
    <h1 className="t20 nw-form-title">{form.buttonLabel||"참가 신청"}</h1>
    <div className="inv nw-done"><span className="box on"><Icon n="check" size={16}/></span><div><b className="t15">신청이 접수되었습니다.</b><p className="t12 reg">결과와 안내는 공지로 알려 드립니다.</p></div></div>
    <Dock><Button variant="main" onClick={onBack}>공지 보기</Button></Dock>
  </section>);
  return (<section className="nw">
    <BackLink to={ann.title} onClick={onBack}/>
    <h1 className="t20 nw-form-title">{form.buttonLabel||"참가 신청"}</h1>
    {required&&<p className="t12 dim reg nw-req">* 표시는 필수입니다.</p>}
    {fields.some(f=>f.public)&&<PublicResponses ann={ann} compact responsesOverride={responsesOverride}/>}
    <div className="nw-fields">
      {form.eventId&&<Question id="ff-name" label="참가자 이름" required error={errors.name}>
        <input id="ff-name" className="in" aria-required="true" aria-invalid={errors.name?true:undefined} type="text" value={registrationName} onChange={e=>{setRegistrationName(e.target.value);setErrors(x=>({...x,name:""}));}} placeholder="신청자 본인의 이름을 입력해 주세요." autoComplete="name"/>
      </Question>}
      {form.eventDraft?.division==="both"&&<p className="t12 dim reg">루키와 마스터를 함께 접수합니다. 개인 마스터 참가 또는 개인 루키나 라이트 우승 이력이 있으면 마스터로 배정됩니다.</p>}
      {fields.length===0&&!form.eventId&&<p className="t15 reg dim">등록된 질문이 없습니다.</p>}
      {fields.map((f,i)=>{ const label=f.label||`질문 ${i+1}`, id=`ff-${f.id}`, error=errors[f.id];
        const text={id,className:"in","aria-required":f.required||undefined,"aria-invalid":error?true:undefined,value:ans[f.id]||"",onChange:e=>set(f.id,e.target.value),placeholder:"답변을 입력해 주세요."};
        return (<Question key={f.id} id={id} label={label} required={f.required} error={error} group={f.type==="single"||f.type==="multi"}>
          {f.type==="short"&&<input type="text" {...text}/>}
          {f.type==="long"&&<textarea {...text}/>}
          {(f.type==="single"||f.type==="multi")&&<Choice name={f.id} options={f.options||[]} value={ans[f.id]} onChange={v=>set(f.id,v)} multiple={f.type==="multi"}/>}
          {f.type==="dropdown"&&<Dropdown id={id} value={ans[f.id]||""} onChange={v=>set(f.id,v)} options={(f.options||[]).map(o=>({value:o,label:o}))} placeholder="선택해 주세요."/>}
        </Question>);
      })}
    </div>
    <Dock toast={failed&&<Toast error action="다시 시도" onAction={submit}>{failed}</Toast>}>
      <Button variant="main" onClick={submit} disabled={busy}>{busy?"보내는 중…":"신청하기"}</Button>
      <p className="t12 dim reg dock-note">결과와 안내는 공지로 알려 드립니다.</p>
    </Dock>
  </section>);
}
function FormResponsesModal({ ann, onClose, onDeleteResp, responsesOverride, onResetPin }){
  const form=ann.form||{}; const fields=form.fields||[]; const normalized=Array.isArray(responsesOverride); const resp=[...(normalized?responsesOverride:(form.responses||[]))].sort((a,b)=>(a.createdAt<b.createdAt?-1:1));
  const unified=normalized&&form.eventDraft?.division==="both";
  const divisionLabel=r=>r.division==="master"?"마스터":r.division==="rookie"?"루키":"확인 필요";
  const cell=(v)=>Array.isArray(v)?v.join(", "):(v==null?"":String(v));
  const csv=()=>{
    const esc=(s)=>{ s=String(s==null?"":s); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const header=["번호","제출 시각",...(normalized?["참가자 이름"]:[]),...(unified?["리그"]:[]),...fields.map(f=>f.label||"질문")];
    const rows=resp.map((r,i)=>[i+1,fmtDT(r.createdAt),...(normalized?[r.registrationName||""]:[]),...(unified?[divisionLabel(r)]:[]),...fields.map(f=>cell(r.answers&&r.answers[f.id]))]);
    const text="\ufeff"+[header,...rows].map(row=>row.map(esc).join(",")).join("\r\n");
    const blob=new Blob([text],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`${String(ann.title||"응답").replace(/[\\/:*?"<>|]/g,"_")}_응답.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  /* c8 신청자: the counts lit (신청, 파티 제출, 미제출), a name search and CSV in one row, chips for who has submitted, each entry a row
     with its answers in a grey line and the lit lamp beside 제출. The submission state is read only, for an event-linked notice. */
  const [q,setQ]=useState(""), [filter,setFilter]=useState("all"), [subs,setSubs]=useState(null);
  useEffect(()=>{
    if(!normalized||!form.eventId) return undefined;
    let on=true;
    listEventRegistrationSubmissionStatuses(form.eventId).then(rows=>{ if(on) setSubs(new Map(rows.map(x=>[x.registrationId,x]))); }).catch(error=>console.warn("submission statuses read failed",error));
    return ()=>{ on=false; };
  },[normalized,form.eventId]);
  const sent=r=>Boolean(subs?.get(r.id)?.hasSubmission);
  const nameOf=r=>r.registrationName||(fields[0]?cell(r.answers&&r.answers[fields[0].id]):"");
  const sentCount=subs?resp.filter(sent).length:0;
  const shown=resp.filter(r=>(!q.trim()||nameOf(r).includes(q.trim()))&&(filter==="all"||(filter==="sent")===sent(r)));
  const cellsFor=n=>Math.max(2,String(n).length);
  return (<Modal title="신청자" hint={ann.title} onClose={onClose}>
    <div className="stack fr-counters"><Counter label="신청" value={resp.length} cells={cellsFor(resp.length)}/>
      {subs&&<><Counter label="파티 제출" value={sentCount} cells={cellsFor(resp.length)}/><Counter label="미제출" value={resp.length-sentCount} cells={cellsFor(resp.length)}/></>}</div>
    {unified&&<p className="t12 reg dim">마스터 {resp.filter(row=>row.division==="master").length}명, 루키 {resp.filter(row=>row.division==="rookie").length}명</p>}
    {resp.length>0&&<div className="stack fr-bar">
      <label className="pn search-in"><Icon n="search" size={20}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="이름 검색" aria-label="이름 검색"/></label>
      <button type="button" className="pn fr-csv" onClick={csv}><Icon n="download" size={16}/>CSV</button>
    </div>}
    {resp.length>0&&subs&&<div className="fr-chips"><Chips value={filter} onChange={setFilter} label="제출 여부" options={[["all",`전체 ${resp.length}`],["sent",`파티 제출 ${sentCount}`],["unsent",`미제출 ${resp.length-sentCount}`]]}/></div>}
    {resp.length===0?<p className="t15 reg dim fr-empty">아직 접수된 신청이 없습니다.</p>:
      <div className="stack fr-rows">{shown.map(r=>(<div className="pn fr-row" key={r.id}>
        <span className="t12 dim fr-no num">{resp.indexOf(r)+1}</span>
        <div className="fr-main">
          <div className="fr-name"><b className="t15">{nameOf(r)||"이름 없음"}</b>{unified&&<span className="t12 dim">{divisionLabel(r)}</span>}<span className="t12 reg dim num">{fmtDT(r.createdAt)}</span></div>
          {fields.length>0&&<span className="t12 reg dim fr-answers">{fields.map(f=>`${f.label||"질문"} ${cell(r.answers&&r.answers[f.id])||"없음"}`).join(", ")}</span>}
        </div>
        <div className="fr-actions">
          {subs&&(sent(r)?<span className="t12 fr-sent"><i className="lamp" aria-hidden="true"/>제출</span>:<span className="t12 dim">미제출</span>)}
          {onResetPin&&<Button variant="link" onClick={()=>onResetPin(r)}>비밀번호 초기화</Button>}
          {onDeleteResp&&<button type="button" className="fr-del" onClick={async()=>{if(await siteConfirm({title:"응답 삭제",body:"이 응답을 삭제할까요? 삭제한 응답은 되돌릴 수 없습니다.",confirmLabel:"삭제",danger:true}))onDeleteResp(r.id);}} aria-label="삭제" title="삭제"><Icon n="trash" size={16}/></button>}
        </div>
      </div>))}
      {!shown.length&&<p className="t15 reg dim fr-empty">{q.trim()?"이 이름의 신청이 없습니다.":"해당하는 신청이 없습니다."}</p>}</div>}
  </Modal>);
}

import React, { lazy, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { bracketRouteSearch, readInitialAppView } from "./services/appRouting.js";
import { loadSiteData, saveSiteData, submitAnnouncementResponse } from "./services/siteDataService.js";
import { WRITE_CONFLICT } from "./services/revisionedRow.js";
import HomePage from "./pages/HomePage.jsx";
import MorePage from "./pages/MorePage.jsx";
import { SiteHeader, SiteFooter, NAV_ITEMS, SiteDialogHost } from "./components/index.js";
import { DISCORD_URL } from "./components/layout/SiteHeader.jsx";
import TabBar, { MORE_ITEMS, useWideNav } from "./components/layout/Navigation.jsx";
import Menu from "./components/common/Menu.jsx";
import Toaster from "./components/common/Toaster.jsx";
import { DUR, light, reduced, themeTurn, transition } from "./components/common/motion.js";
import { initHistory, popHandlers, popped, pushHistory } from "./components/layout/history.js";
import AdminModeBar from "./admin/AdminModeBar.jsx";
import { onAdminSessionLost, signOutAdmin } from "./storage.js";
import LazyContent from "./components/common/LazyContent.jsx";
import Loader, { Busy } from "./components/common/Loader.jsx";

/* 페이지 조각은 처음 필요할 때 불러오되, 한 번 불러오면 같은 컴포넌트로 바로 그린다.
   화면 전환은 새 페이지를 같은 틀 안에서 즉시 그려야 하므로(전환 중 "불러오는 중"이 끼지 않게)
   이동하기 전에 조각을 먼저 받아 둔다. 받지 못하면 오류를 던져 LazyContent 가 새로고침을 권한다. */
function lazyPage(load) {
  let mod = null, err = null, pending = null;
  const preload = () => pending || (pending = load().then(m => { mod = m; }, e => { err = e; pending = null; throw e; }));
  function Page(props) {
    if (err) throw err;
    if (!mod) throw preload();
    const C = mod.default;
    return <C {...props} />;
  }
  Page.preload = preload;
  // 한가할 때 미리 받기: 실패해도 기록하지 않는다. 실제로 이동할 때 preload 가 다시 받고, 그때의 실패만 오류로 보인다.
  Page.prefetch = () => (mod ? Promise.resolve() : load().then(m => { mod = m; }, () => {}));
  Page.ready = () => Boolean(mod);
  return Page;
}

const AboutPage = lazyPage(() => import("./pages/AboutPage.jsx"));
const BoardPage = lazyPage(() => import("./pages/BoardPage.jsx"));
const BracketsPage = lazyPage(() => import("./pages/BracketsPage.jsx"));
const ChampionsPage = lazyPage(() => import("./pages/ChampionsPage.jsx"));
const NewsPage = lazyPage(() => import("./pages/NewsPage.jsx"));
const RecordsPage = lazyPage(() => import("./pages/RecordsPage.jsx"));
const TeamBuilderPage = lazyPage(() => import("./pages/TeamBuilderPage.jsx"));
const CalculatorPage = lazyPage(() => import("./pages/CalculatorPage.jsx"));
const TitlesPage = lazyPage(() => import("./pages/TitlesPage.jsx"));
const AdminModalHost = lazy(() => import("./admin/AdminModalHost.jsx"));
const PAGES = { about: AboutPage, board: BoardPage, bracket: BracketsPage, champions: ChampionsPage, news: NewsPage, records: RecordsPage, builder: TeamBuilderPage, calc: CalculatorPage, titles: TitlesPage };
const ready = v => !PAGES[v] || PAGES[v].ready();
/* 다음 프레임이 화면에 나간 뒤에 실행한다(rAF 다음의 작업): 그 프레임에 이미 시작한 반응(누름, 알약)이 먼저 보인다. */
const afterPaint = run => requestAnimationFrame(() => setTimeout(run, 0));
const whenReady = (v, run) => { if (ready(v)) run(); else PAGES[v].preload().then(run, run); };

/* =========================================================================
   YPL — Yonsei Pokemon League  (Matte, docs/redesign-glass/DECISIONS.md 23차)
   방문자 조회, 관리자 편집, window.storage(shared) 영구저장
   ========================================================================= */

/* 저장된(Supabase) 데이터의 일부 텍스트를 최신 표기로 교정 — 로드 시 메모리에서 적용 */
function normalizeData(d){
  if(!d || typeof d!=="object") return d;
  const labelFix={"파이컵 Lite":"파이컵 라이트","PY-CUP Lite":"파이컵 라이트","파이컵 lite":"파이컵 라이트"};
  const groupDesc={champion:"챔피언스 시리즈 우승",partner:"같은 포켓몬으로 2회 이상 우승",event:"파이컵 라이트 등 이벤트 대회 우승"};
  const tournaments=Array.isArray(d.tournaments)?d.tournaments.map(t=>t&&labelFix[t.label]?{...t,label:labelFix[t.label]}:t):d.tournaments;
  const titleGroups=Array.isArray(d.titleGroups)?d.titleGroups.map(g=>g&&groupDesc[g.key]?{...g,desc:groupDesc[g.key]}:g):d.titleGroups;
  const brackets=Array.isArray(d.brackets)?d.brackets:[];
  return {...d,tournaments,titleGroups,brackets};
}

/* ============================== 공통 ============================== */

/* ============================== 앱 ============================== */
export default function App() {
  const [data,setData]=useState(null); const [view,setView]=useState(()=>readInitialAppView(window.location.search));
  const [admin,setAdmin]=useState(false); const [toast,setToast]=useState(null); const [modal,setModal]=useState(null);
  const [more,setMore]=useState(null);
  // 가는 중인 화면: 누른 즉시 바의 줄이 옮겨 가고 지금 화면은 흐려지며, 다음 화면이 늦으면 바쁨 칸이 선다.
  const [going,setGoing]=useState(null);
  // 시드는 저장소가 비었을 때만 쓰므로 첫 번들에서 뺐다.
  useEffect(()=>{(async()=>setData(normalizeData((await loadSiteData())||(await import("./data/siteSeed.js")).SEED)))();},[]);
  // 첫 진입은 어느 화면이든 꺼진 판에서 켜진다(DESIGN.md "Motion"). 홈은 제 패널을 스스로 켠다.
  const litOnce=useRef(false);
  useLayoutEffect(()=>{ if(!data||litOnce.current)return; litOnce.current=true; if(view!=="home") light(document.getElementById("ypl-main")); },[data]);
  // 다크가 첫 방문이다(스코어보드). 고른 기록이 라이트면 라이트, "system"이면 기기의 설정을 따른다.
  // 예전 키는 열 때마다 저장돼 고른 기록이 아니라서 쓰지 않는다.
  const [themePref,setThemePref]=useState(()=>{
    try{ const t=localStorage.getItem("ypl-theme"); return t==="light"||t==="system"?t:"dark"; }catch(e){ return "dark"; }
  });
  const lightQuery=useMemo(()=>typeof matchMedia==="function"?matchMedia("(prefers-color-scheme: light)"):null,[]);
  const [systemLight,setSystemLight]=useState(()=>Boolean(lightQuery?.matches));
  useEffect(()=>{ if(!lightQuery)return; const on=e=>setSystemLight(e.matches); lightQuery.addEventListener("change",on); return ()=>lightQuery.removeEventListener("change",on); },[lightQuery]);
  const dark=themePref==="system"?!systemLight:themePref!=="light";
  /* B6: 화면은 그 자리에 있고 색만 한 프레임에 바뀐다. 아무것도 움직이지 않는다. */
  const chooseTheme=useCallback((pref)=>{
    try{ localStorage.setItem("ypl-theme", pref); }catch(e){}
    themeTurn(()=>flushSync(()=>setThemePref(pref)));
  },[]);
  const switchTheme=useCallback(()=>chooseTheme(dark?"light":"dark"),[dark,chooseTheme]);
  /* 테마는 <html> 에 건다 — 페이지, 오버스크롤 영역, 스크롤바, 브라우저 주소창 색이 한 바탕을 쓴다. */
  useLayoutEffect(()=>{
    const root=document.documentElement;
    root.dataset.theme=dark?"dark":"light";
    root.style.colorScheme=dark?"dark":"light";
  },[dark]);
  /* 탭 제목 — 뒤로 가기 목록과 브라우저 탭에서 어디에 있었는지 구분되게 화면 이름을 붙인다. */
  useEffect(()=>{
    const label=view==="more"?"더보기":(NAV_ITEMS.find(([key])=>key===view)||[])[1];
    document.title=label?`${label} | YPL`:"YPL | 연세 포켓몬 리그 Yonsei Pokémon League";
    // 검색 엔진에 화면 주소만 알린다. eventId와 배포 갱신용 __ypl_v 같은 덧붙은 값은 뺀다.
    document.querySelector('link[rel="canonical"]')?.setAttribute("href",`https://iambin2.github.io/ypl-site/${view==="home"?"":`?view=${view}`}`);
  },[view]);
  useEffect(()=>{
    initHistory();
    const onPopState=()=>{
      const {from,to,shared,scrollY}=popped();
      const next=readInitialAppView(window.location.search);
      // 기록을 따르는 페이지 상태(열린 대진표)는 popHandlers 로 전환 안에서 바꾼다.
      // 공유 요소의 자리를 잰 다음, 페이지의 바뀐 화면까지 한 번에 그려야 그 요소가 제자리를 찾는다.
      setGoing(next);
      afterPaint(()=>whenReady(next,()=>transition(()=>flushSync(()=>{popHandlers.forEach(f=>f());setView(next);setMore(null);setGoing(null);}),{dir:to<from?"back":"forward",shared,scrollY})));
    };
    window.addEventListener("popstate",onPopState);
    return ()=>window.removeEventListener("popstate",onPopState);
  },[]);
  const go=useCallback((v, options={})=>{
    // 지금 탭을 다시 누르면 맨 위로 부드럽게 올라간다. 그 탭 안에서 공지, 글, 대진표를 열어 두었으면 목록으로 돌아간다.
    const here=new URLSearchParams(window.location.search);
    const inside=["notice","post","pb"].some(key=>here.has(key))||(view==="bracket"&&here.has("eventId"))||Boolean(window.history.state?.bracketId);
    if(v===view&&!inside&&!options.eventId&&!options.notice&&!options.trainer&&!options.tab){ setMore(null); window.scrollTo({top:0,behavior:reduced()?"auto":"smooth"}); return; }
    if((v==="builder"||v==="bracket")&&options.eventId){
      const url=new URL(window.location.href);
      url.search= v==="builder" ? `view=builder&eventId=${encodeURIComponent(options.eventId)}` : bracketRouteSearch(options.eventId, window.location.search).slice(1);
      pushHistory({view:v,eventId:options.eventId},url);
    }else{
      // 모든 탭이 주소에 남는다 — 새로고침, 뒤로 가기, 링크 공유 모두 같은 화면으로 돌아온다.
      const url=new URL(window.location.href);
      url.searchParams.delete("eventId");
      // 한 화면 안의 항목을 바로 여는 링크: 공지(?notice=), 트레이너 기록(?trainer=), 랭킹 탭(?tab=rank).
      ["notice","trainer","tab","format","post","pb"].forEach(key=>url.searchParams.delete(key));
      if(v==="news"&&options.notice) url.searchParams.set("notice",options.notice);
      if(v==="records"&&options.trainer) url.searchParams.set("trainer",options.trainer);
      if((v==="records"||v==="board"||v==="bracket")&&options.tab) url.searchParams.set("tab",options.tab);
      // 게시판의 샘플과 파티 소개글(?post=), 사설 대진표(?pb=)를 바로 여는 링크
      if(v==="board"&&options.post) url.searchParams.set("post",options.post);
      if(v==="board"&&options.format==="double") url.searchParams.set("format","double");
      // 팀 빌더의 룰 설정(reg, cup, type)은 빌더 주소에만 남긴다.
      if(v!=="builder") ["reg","cup","type"].forEach(key=>url.searchParams.delete(key));
      if(v==="home") url.searchParams.delete("view"); else url.searchParams.set("view",v);
      if(inside||url.href!==window.location.href) pushHistory({view:v},url);
    }
    // I1: 지금 화면은 바로 비키고, 새 화면이 맨 위에서 살짝 위로 올라온다.
    // 누름의 반응이 먼저다: 눌림이 보인 프레임이 나간 뒤에 새 페이지를 그린다.
    if(v!==view) setGoing(v);
    afterPaint(()=>whenReady(v,()=>transition(()=>flushSync(()=>{if(v===view)popHandlers.forEach(f=>f());setView(v);setMore(null);setGoing(null);}),{shared:options.shared,scrollY:0})));
  },[view]);
  const flash=useCallback((m,action)=>setToast({id:Date.now()+Math.random(),text:m,action}),[]);
  useEffect(()=>{ onAdminSessionLost(()=>{ setAdmin(false); flash("로그인이 만료되었습니다. 다시 로그인해 주세요."); }); },[flash]);
  const refresh=useCallback(async()=>{ const fresh=await loadSiteData(); if(fresh) setData(normalizeData(fresh)); },[]);
  const save=useCallback(async(next,doneMessage="저장했습니다.")=>{
    const sanitized={...next,brackets:Array.isArray(next?.brackets)?next.brackets.filter(b=>b?.projection?.source!=="normalized"):next?.brackets};
    setData(sanitized);
    const saved=await saveSiteData(sanitized);
    // 다른 운영자가 먼저 저장했다. 덮어쓰지 않고 최신 내용을 불러온다. 편집 창은 열린 채로 남아 다시 저장할 수 있다.
    if(saved===WRITE_CONFLICT){ await refresh(); flash("다른 운영자가 먼저 저장해 최신 내용을 불러왔습니다. 다시 저장해 주세요."); return false; }
    flash(saved?doneMessage:"저장하지 못해 이 화면에만 반영됐습니다.");
    return saved;
  },[flash,refresh]);
  const submitForm=useCallback(async(annId,payload)=>{
    const announcement=(data.announcements||[]).find(a=>a.id===annId);
    const form=announcement?.form||{};
    const answers=payload?.answers&&typeof payload.answers==="object"?payload.answers:payload;

    try{
      if(form.eventId){
        const { submitEventApplication } = await import("./services/normalizedCompetitionService.js");
        await submitEventApplication({
          eventId:form.eventId,
          registrationName:payload?.registrationName||"",
          registrationData:{
            answers:answers||{},
            announcementId:annId,
          },
        });
      }else{
        if(!(await submitAnnouncementResponse(annId,answers||{}))) return false;
        await refresh();
      }
      flash("신청을 접수했습니다.");
      return true;
    }catch(error){
      // 중복 신청, 마감 같은 이유는 신청서가 그대로 보여 준다. 재시도 안내로 덮지 않는다.
      return error?.message||"신청을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    }
  },[data,flash,refresh]);
  // 첫 화면이 그려지고 브라우저가 한가해지면 나머지 페이지 조각을 미리 받아 둔다. 첫 이동도 기다림 없이 전환된다.
  // 한 번에 하나씩, 앞 조각이 다 들어온 뒤 다음 한가한 틈에: 모두 한꺼번에 평가하면 폰에서 화면이 한동안 굳는다.
  const loaded=Boolean(data);
  // 계산기는 빼 둔다: 데미지 엔진의 평가만 폰에서 수백 ms라 한가한 틈에도 화면이 굳는다. 그 화면으로 갈 기색(더보기 열기, 탭에 손이나 포인터)이 보일 때 받는다.
  // 명예의 전당도 뺀다: 옛 파티 이미지 표(legacyPartyImages, 압축해도 248KB)를 달고 와 첫 방문 전송량의 30%를 차지했다.
  useEffect(()=>{
    if(!loaded||navigator.connection?.saveData) return undefined;
    const queue=Object.values(PAGES).filter(p=>p!==CalculatorPage&&p!==ChampionsPage);
    let handle=null, stopped=false;
    const later=f=>window.requestIdleCallback?window.requestIdleCallback(f,{timeout:2000}):setTimeout(f,400);
    const next=()=>{ if(stopped||!queue.length) return; handle=later(()=>{ if(!stopped) queue.shift().prefetch().then(next); }); };
    // 첫 화면의 기록과 챔피언 그림이 먼저 받는다: 한가한 틈은 네트워크를 기다리는 동안에도 오므로 조각들이 그 줄에 끼어들었다(LCP 대기 72%).
    const first=setTimeout(next,2000);
    return ()=>{ stopped=true; clearTimeout(first); if(window.requestIdleCallback) window.cancelIdleCallback(handle); else clearTimeout(handle); };
  },[loaded]);
  useEffect(()=>{
    const intent=e=>{ const v=e.target.closest?.("[data-tab]")?.dataset.tab; if(PAGES[v]) PAGES[v].prefetch(); };
    addEventListener("pointerover",intent,{passive:true}); addEventListener("pointerdown",intent,{passive:true});
    return ()=>{ removeEventListener("pointerover",intent); removeEventListener("pointerdown",intent); };
  },[]);
  const logout=()=>{ signOutAdmin(); setAdmin(false); };
  const onAdmin=()=>{ setMore(null); admin?logout():setModal({type:"login"}); };
  // 무거운 조각은 시트가 다 올라온 뒤에 받는다: 여는 순간에 평가하면 시트가 굳는다.
  const toggleMore=el=>{ if(!more) setTimeout(()=>{ CalculatorPage.prefetch(); ChampionsPage.prefetch(); },DUR.lift); setMore(m=>m?null:el); };
  const wideNav=useWideNav();
  const moreItems=[
    ...MORE_ITEMS.map(([key,label])=>({key,label,current:view===key,onSelect:()=>go(key)})),
    {key:"sep",sep:true},
    {key:"discord",label:"디스코드 참여",href:DISCORD_URL},
    {key:"admin",label:admin?"관리자 로그아웃":"관리자 로그인",onSelect:onAdmin},
  ];
  return (
    <div className={"ypl"+(admin?" is-admin":"")}>
      {/* 키보드로 들어온 사람은 매번 바 전체를 지나야 본문에 닿았다. */}
      <a className="skip-link" href="#ypl-main">본문으로 건너뛰기</a>
      <SiteHeader view={going||view} onNavigate={go} dark={dark} onToggleTheme={switchTheme}
        moreOpen={Boolean(more)} onMore={toggleMore}/>

      <div className="wrap"><main className={"page"+(data?"":" page--wait")+(going?" is-going":"")} id="ypl-main" tabIndex={-1} key={view}>
        {!data ? <Loader/> : <LazyContent>
        {view==="home"&&<HomePage data={data} go={go} admin={admin}/>}
        {view==="about"&&<AboutPage go={go}/>}
        {view==="more"&&<MorePage go={go} themePref={themePref} onTheme={chooseTheme} admin={admin} onAdmin={onAdmin}/>}
        {view==="news"&&<NewsPage data={data} admin={admin} setModal={setModal} save={save} submitForm={submitForm} refresh={refresh} go={go}/>}
        {view==="board"&&<BoardPage data={data} admin={admin} save={save} flash={flash} go={go}/>}
        {view==="records"&&<RecordsPage data={data} admin={admin} setModal={setModal} save={save}/>}
        {view==="bracket"&&<BracketsPage data={data} admin={admin} save={save} flash={flash} refresh={refresh}/>}
        {view==="builder"&&<TeamBuilderPage go={go} flash={flash} admin={admin}/>}
        {view==="calc"&&<CalculatorPage/>}
        {view==="titles"&&<TitlesPage data={data} admin={admin} setModal={setModal} go={go}/>}
        {view==="champions"&&<ChampionsPage data={data} admin={admin} setModal={setModal} go={go}/>}
        </LazyContent>}
      </main>
      {going&&<div className="y-going" role="status" aria-label="불러오는 중"><Busy/></div>}
      </div>
      {data&&<SiteFooter onNavigate={go} tagline={data.meta&&data.meta.tagline} onAdmin={wideNav&&!admin?onAdmin:null}/>}

      <TabBar view={going||view} onNavigate={go}/>
      {admin&&<AdminModeBar onLogout={logout}/>}
      {more&&<Menu anchor={more} title="더보기" items={moreItems} onClose={()=>setMore(null)}/>}
      <Toaster feed={toast}/>
      <SiteDialogHost/>

      {modal&&<LazyContent key={modal.type} onClose={()=>setModal(null)}><AdminModalHost
        modal={modal}
        data={data}
        setModal={setModal}
        save={save}
        refresh={refresh}
        setAdmin={setAdmin}
        flash={flash}
      /></LazyContent>}
    </div>
  );
}

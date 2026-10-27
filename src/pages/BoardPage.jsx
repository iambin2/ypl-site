import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Empty, Icon, ListSearch, Loader, Modal, PageHead, Pager, Prose, Segmented, siteAlert, siteConfirm, sitePrompt, transition } from "../components/index.js";
import { backWith, popHandlers, pushHistory } from "../components/layout/history.js";
import { saveTeamSheetImage } from "../components/teamSheetImage.js";
import { CUP_RULES, REGULATIONS, TYPE_OPTIONS } from "../data/index.js";
import { championsData } from "../services/index.js";
import { formatDate } from "../services/dateFormat.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { SHOWCASE_KEY, hashPin, newCommunityId, pinMatches, readCommunity, shareLink, updateCommunity } from "../services/communityStore.js";
import { DRAFT_STORAGE_KEY, INCOMING_TEAM_KEY, TEAM_STORAGE_KEY, normalizeDraft, normalizeSavedTeam, onSpriteError, savedTeamSheet, spriteUrl } from "../services/teamBuilderCore.js";

const uid = () => Math.random().toString(36).slice(2, 9);
const PAGE_SIZE = 10;

/* ============================== BOARD (자유게시판) ============================== */
const fmtDT=iso=>formatDate(iso,{time:true});

function parseMedia(url){
  if(!url) return null; const u=String(url).trim(); if(!u) return null;
  const yt=u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if(yt) return {type:"youtube",id:yt[1]};
  const full=/^https?:\/\//i.test(u)?u:"https://"+u;
  if(/\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(u)) return {type:"image",url:full};
  return {type:"link",url:full};
}
function MediaEmbed({ url }){
  const m=parseMedia(url); if(!m) return null;
  if(m.type==="youtube") return <div className="bd-yt"><iframe src={"https://www.youtube.com/embed/"+m.id} title="유튜브 영상" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div>;
  if(m.type==="image") return <a className="bd-img" href={m.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt="첨부 이미지" loading="lazy" decoding="async"/></a>;
  return <a className="ann-link" href={m.url} target="_blank" rel="noopener noreferrer" style={{marginTop:8}}>{m.url}<Icon n="ext" size={13}/></a>;
}

function BoardCompose({ onClose, onSubmit }){
  const [nick,setNick]=useState(""); const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [pin,setPin]=useState(""); const [link,setLink]=useState(""); const [secret,setSecret]=useState(false);
  const submit=()=>{ if(!nick.trim()){siteAlert("닉네임을 입력해 주세요.","글쓴이로 표시될 닉네임이 필요합니다.");return;} if(!title.trim()){siteAlert("제목을 입력해 주세요.");return;}
    onSubmit({nick:nick.trim().slice(0,20),title:title.trim().slice(0,60),body:body.trim(),pin:pin.trim(),link:link.trim(),secret}); };
  return (<Modal title="새 글 작성" onClose={onClose}>
    <div className="swap" key="compose">
      <div className="bk-grow2">
        <div className="field"><label>닉네임</label><input value={nick} onChange={e=>setNick(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></div>
        <div className="field"><label>수정, 삭제 비밀번호 (선택, 숫자 4자리)</label><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="예: 1234" inputMode="numeric"/></div>
      </div>
      <div className="field"><label>제목</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="제목을 입력하세요." maxLength={60}/></div>
      <div className="field"><label>내용</label><textarea value={body} onChange={e=>setBody(e.target.value)} rows={6} placeholder="자유롭게 작성해 주세요."/></div>
      <div className="field"><label>이미지 또는 유튜브 링크 (선택)</label><input value={link} onChange={e=>setLink(e.target.value)} placeholder="이미지 주소 또는 유튜브 링크를 붙여넣으세요."/>
        {link.trim()&&<div className="bd-preview"><div className="bd-preview-h">미리보기</div><MediaEmbed url={link}/></div>}
      </div>
      <label className="bk-check"><input type="checkbox" checked={secret} onChange={e=>setSecret(e.target.checked)}/><span><Icon n="lock" size={14}/> 관리자에게만 보이기 <i>(건의, 비공개)</i></span></label>
      {secret&&<div className="bk-hint">이 글은 관리자만 볼 수 있습니다. 다른 방문자에게는 목록에도 표시되지 않습니다.</div>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>취소</button><button className="btn btn-primary" onClick={submit}>등록</button></div>
    </div>
  </Modal>);
}

/* 본인 확인. 자유게시판 글은 숫자를 그대로(pin), 샘플과 파티 글은 해시(pinHash)로 갖고 있다. 관리자는 묻지 않는다. */
async function authorize(record,what,verb,admin){
  if(admin) return verb!=="삭제"||siteConfirm({title:`${what} 삭제`,body:`이 ${what}을 삭제할까요? 삭제한 ${what}은 되돌릴 수 없습니다.`,confirmLabel:"삭제",danger:true});
  if(!record.pin&&!record.pinHash){ siteAlert(`비밀번호가 없는 ${what}입니다.`,`관리자에게 ${verb} 요청을 해 주세요.`); return false; }
  const pin=await sitePrompt({title:`${what} ${verb}`,body:`본인 ${what}을 ${verb}하려면 작성할 때 정한 비밀번호를 입력하세요.`,label:"비밀번호",placeholder:"숫자 4자리",confirmLabel:verb==="삭제"?"삭제":"확인",secret:true,inputMode:"numeric"});
  if(pin===null) return false;
  if(!(record.pinHash?await pinMatches(record,pin):pin===record.pin)){ siteAlert("비밀번호가 일치하지 않습니다.","작성할 때 입력한 숫자 4자리를 다시 확인해 주세요."); return false; }
  return true;
}

/* 글과 댓글 수정 시트. initial 에 있는 칸만 보여 준다(title, body, link, secret). */
function EditSheet({ heading, initial, onClose, onSave }){
  const [v,setV]=useState(initial); const [busy,setBusy]=useState(false);
  const set=k=>e=>setV(s=>({...s,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));
  const has=k=>k in initial;
  const submit=async()=>{
    const next={...v}; for(const k of ["title","body","link"]) if(has(k)) next[k]=String(next[k]||"").trim();
    if(has("title")&&!next.title){siteAlert("제목을 입력해 주세요.");return;}
    if(!has("title")&&!next.body&&!next.link){siteAlert("내용이나 링크를 입력해 주세요.");return;}
    if(has("title")) next.title=next.title.slice(0,60);
    setBusy(true); try{ await onSave(next); }finally{ setBusy(false); }
  };
  return (<Modal title={heading} onClose={onClose}>
    <div className="swap" key="edit">
      {has("title")&&<div className="field"><label>제목</label><input value={v.title} onChange={set("title")} maxLength={60}/></div>}
      {has("body")&&<div className="field"><label>내용</label><textarea value={v.body} onChange={set("body")} rows={has("title")?6:3}/></div>}
      {has("link")&&<div className="field"><label>이미지 또는 유튜브 링크 (선택)</label><input value={v.link} onChange={set("link")} placeholder="이미지 주소 또는 유튜브 링크를 붙여넣으세요."/>
        {v.link.trim()&&<div className="bd-preview"><div className="bd-preview-h">미리보기</div><MediaEmbed url={v.link}/></div>}</div>}
      {has("secret")&&<label className="bk-check"><input type="checkbox" checked={v.secret} onChange={set("secret")}/><span><Icon n="lock" size={14}/> 관리자에게만 보이기 <i>(건의, 비공개)</i></span></label>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy?"저장 중…":"저장"}</button></div>
    </div>
  </Modal>);
}
const Edited=({ at })=>at?<span className="bd-date">수정됨</span>:null;

function CommentForm({ onSubmit }){
  const [nick,setNick]=useState(""); const [body,setBody]=useState(""); const [pin,setPin]=useState(""); const [link,setLink]=useState("");
  const submit=()=>{ if(!nick.trim()){siteAlert("닉네임을 입력해 주세요.","댓글 작성자로 표시될 닉네임이 필요합니다.");return;} if(!body.trim()&&!link.trim()){siteAlert("댓글이나 링크를 입력해 주세요.");return;}
    onSubmit({nick:nick.trim().slice(0,20),body:body.trim(),pin:pin.trim(),link:link.trim()}); setBody(""); setPin(""); setLink(""); };
  return (<div className="bd-cform">
    <div className="bd-cform-row">
      <input className="bd-cform-nick" value={nick} onChange={e=>setNick(e.target.value)} placeholder="닉네임" maxLength={20}/>
      <input className="bd-cform-pin" value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="비밀번호(선택)" inputMode="numeric"/>
    </div>
    <div className="bd-cform-row">
      <input className="bd-cform-body" value={body} onChange={e=>setBody(e.target.value)} placeholder="댓글 달기…" onKeyDown={e=>{if(e.key==="Enter")submit();}}/>
      <button className="btn btn-primary btn-sm" onClick={submit}>등록</button>
    </div>
    <input className="bd-cform-link" value={link} onChange={e=>setLink(e.target.value)} placeholder="이미지 또는 유튜브 링크 (선택)"/>
  </div>);
}

/* 게시판: 공지와 같은 문법. 목록에서 글을 누르면 본문 화면으로 넘어가고, 누른 제목이 본문 제목 자리로 이어진다(I2).
   주소는 그대로(?view=board) 두고 화면 안의 상태로만 바꾼다. 댓글과 삭제는 본문 화면에 모은다. */
function FreeBoard({ data, admin, save, flash, tabs }){
  const [q,setQ]=useState(""); const [page,setPage]=useState(1);
  const all=[...(data.board||[])].filter(p=>admin||!p.secret).sort((a,b)=>(a.createdAt<b.createdAt?1:-1));
  const kw=q.trim().toLowerCase();
  const list=kw?all.filter(p=>[p.title,p.body,p.nick].some(t=>String(t||"").toLowerCase().includes(kw))):all;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  const cur=Math.min(page,pages);
  const shown=list.slice((cur-1)*PAGE_SIZE,cur*PAGE_SIZE);
  useEffect(()=>{setPage(1);},[q]);
  const [article,setArticle]=useState(null);
  const listScroll=useRef(0);
  const [compose,setCompose]=useState(false);
  const openPost=id=>{ listScroll.current=window.scrollY; transition(()=>flushSync(()=>setArticle(id)),{shared:"b-"+id}); };
  const closePost=()=>{ const id=article; transition(()=>flushSync(()=>setArticle(null)),{shared:"b-"+id,dir:"back",scrollY:listScroll.current}); };
  const addPost=(post)=>{ save({...data,board:[{...post,id:uid(),createdAt:new Date().toISOString(),comments:[]},...(data.board||[])]}); setCompose(false); flash("글을 등록했습니다."); };
  const [editing,setEditing]=useState(null);
  const delPost=async(p)=>{ if(!(await authorize(p,"글","삭제",admin)))return; closePost(); save({...data,board:(data.board||[]).filter(x=>x.id!==p.id)}); flash("삭제됨"); };
  const addComment=(p,c)=>{ save({...data,board:(data.board||[]).map(x=>x.id===p.id?{...x,comments:[...(x.comments||[]),{...c,id:uid(),createdAt:new Date().toISOString()}]}:x)}); flash("댓글을 등록했습니다."); };
  const delComment=async(p,c)=>{ if(!(await authorize(c,"댓글","삭제",admin)))return;
    save({...data,board:(data.board||[]).map(x=>x.id===p.id?{...x,comments:(x.comments||[]).filter(y=>y.id!==c.id)}:x)}); };
  const editPost=async(p)=>{ if(await authorize(p,"글","수정",admin)) setEditing({heading:"글 수정",initial:{title:p.title||"",body:p.body||"",link:p.link||"",secret:Boolean(p.secret)},
    apply:v=>(data.board||[]).map(x=>x.id===p.id?{...x,...v,editedAt:new Date().toISOString()}:x)}); };
  const editComment=async(p,c)=>{ if(await authorize(c,"댓글","수정",admin)) setEditing({heading:"댓글 수정",initial:{body:c.body||"",link:c.link||""},
    apply:v=>(data.board||[]).map(x=>x.id===p.id?{...x,comments:(x.comments||[]).map(y=>y.id===c.id?{...y,...v,editedAt:new Date().toISOString()}:y)}:x)}); };
  const saveEdit=v=>{ save({...data,board:editing.apply(v)}); setEditing(null); flash("수정했습니다."); };
  const editSheet=editing&&<EditSheet {...editing} onClose={()=>setEditing(null)} onSave={saveEdit}/>;

  const p=article?all.find(x=>x.id===article):null;
  if(p){ const cc=(p.comments||[]).length;
    return (<section className="sec">
      <article className="nb-article">
        <button type="button" className="nb-back press" onClick={closePost}><Icon n="back" size={18}/><span>게시판</span></button>
        <header className="nb-a-head">
          <h1 className="title nb-a-title" data-vt={"b-"+p.id}>{p.title||p.body||"(제목 없음)"}</h1>
          <p className="caption nb-a-meta">{p.secret&&<span className="bd-lock"><Icon n="lock" size={12}/> 관리자 전용</span>}<b className="bd-nick">{p.nick}</b><span className="tnum">{fmtDT(p.createdAt)}</span><Edited at={p.editedAt}/></p>
        </header>
        {(p.body||p.link)&&<div className="nb-body card">
          <Prose text={p.body}/>
          {p.link&&<MediaEmbed url={p.link}/>}
        </div>}
        <div className="bd-tools"><button className="bd-del press" onClick={()=>editPost(p)}>수정</button><button className="bd-del press" onClick={()=>delPost(p)}>삭제</button></div>
        <div className="bd-cmts card">
          <h2 className="bd-cmts-h">댓글{cc>0?` ${cc}`:""}</h2>
          {(p.comments||[]).map(c=>(<div className="bd-cmt" key={c.id}>
            <div className="bd-cmt-main"><div className="bd-cmt-top"><b>{c.nick}</b><span className="bd-date tnum">{fmtDT(c.createdAt)}</span><Edited at={c.editedAt}/><button className="bd-del sm" onClick={()=>editComment(p,c)}>수정</button><button className="bd-del sm" onClick={()=>delComment(p,c)}>삭제</button></div><div className="bd-cmt-body">{c.body}{c.link&&<MediaEmbed url={c.link}/>}</div></div>
          </div>))}
          <CommentForm onSubmit={(c)=>addComment(p,c)}/>
        </div>
      </article>
      {editSheet}
    </section>);
  }

  return (<section className="sec">
    <PageHead plain="게시판" desc="로그인 없이 닉네임으로 자유롭게 글과 댓글을 남기는 공간입니다.">
      {tabs}
      <div className="y-page-aside">
        <ListSearch q={q} setQ={setQ} placeholder="제목, 내용, 글쓴이 검색" count={list.length}/>
        <button className="ypl-btn ypl-btn--primary ypl-btn--sm press" onClick={()=>setCompose(true)}><Icon n="plus" size={16}/>글쓰기</button>
      </div>
    </PageHead>
    <div className="bd-list swap">
      {list.length===0&&(kw
        ? <Empty icon="search" title="검색 결과가 없습니다." desc={`‘${kw}’에 맞는 글을 찾지 못했습니다.`}/>
        : <Empty icon="list" title="아직 글이 없습니다." desc="첫 글을 남기면 이곳에 표시됩니다."/>)}
      {shown.map(p=>{ const cc=(p.comments||[]).length;
        return (<button type="button" className={"bd-head press"+(p.secret?" secret":"")} key={p.id} onClick={()=>openPost(p.id)}>
          <span className="bd-main">
            <span className="bd-title">{p.secret&&<span className="bd-lock"><Icon n="lock" size={12}/> 관리자 전용</span>}<span data-vt={"b-"+p.id}>{p.title||p.body||"(제목 없음)"}</span></span>
            <span className="bd-meta"><b className="bd-nick">{p.nick}</b><span className="bd-date tnum">{fmtDT(p.createdAt)}</span></span>
          </span>
          {cc>0&&<span className="bd-cc">댓글 {cc}</span>}
        </button>);})}
    </div>
    <Pager page={cur} pages={pages} onGo={setPage}/>
    {compose&&<BoardCompose onClose={()=>setCompose(false)} onSubmit={addPost}/>}
  </section>);
}

/* ============================== 샘플과 파티 소개글 ==============================
   팀 빌더에서 만든 팀을 그대로 올리고, 읽는 사람은 같은 팀을 자기 팀 빌더로 가져가거나 이미지로 저장한다.
   글은 site_data 의 별도 행(communityStore)에 두며 공식 기록과 이어지지 않는다. 팀은 직렬화된 멤버만 저장하고,
   자세한 시트는 읽을 때 지금의 배틀 데이터로 다시 만든다(글 하나 약 2 KB, 시트까지 담으면 그 네 배). */
const BOARD_TABS=[["free","자유"],["sample","샘플"],["party","파티"]];
const KIND_LABEL={sample:"샘플",party:"파티"};
// 배틀 형식. 형식을 고르기 전에 올라온 글(format 없음)은 모두 싱글이다.
const FORMAT_TABS=[["single","싱글"],["double","더블"]];
const FORMAT_LABEL=Object.fromEntries(FORMAT_TABS);
const formatOf=post=>post?.format==="double"?"double":"single";

let teamDisplay=null;
function loadTeamDisplay(){
  return teamDisplay ||= Promise.all([championsData.load(),championsData.loadSpeciesNames()])
    .then(([detailData,names])=>({detailData,koreanNames:names.koreanByEnglish}))
    .catch(error=>{ teamDisplay=null; throw error; });
}
function useTeamDisplay(enabled=true){
  const [state,setState]=useState(null);
  useEffect(()=>{ if(!enabled)return undefined; let live=true;
    loadTeamDisplay().then(d=>live&&setState(d),()=>live&&setState("error"));
    return ()=>{ live=false; }; },[enabled]);
  return state;
}
function sheetOf(team,display){
  if(!display||display==="error") return [];
  return savedTeamSheet(team,{...display,legalItems:championsData.legalItems(display.detailData,team?.regulationId)});
}
export function ruleSummary(team){
  const reg=REGULATIONS[team?.regulationId]; const cup=CUP_RULES[team?.cupRuleId];
  const type=TYPE_OPTIONS.find(t=>t.id===team?.cupRuleSettings?.assignedType);
  return [reg?.name,cup&&cup.kind!=="none"?`${cup.name}${type?" "+type.korean:""}`:""].filter(Boolean).join(", ");
}
function PartySprites({ members=[], big=false }){
  return <span className={"sc-sprites"+(big?" big":"")} aria-hidden="true">
    {members.map((m,i)=><img key={i} src={spriteUrl(m.pokemonName)} alt="" loading="lazy" decoding="async" onError={onSpriteError()}/>)}
  </span>;
}

/* 팀 시트: 빌더 편집기에 있는 모든 값을 한 카드에. 이미지 저장도 같은 모델을 그린다. */
function TeamSheetView({ sheet }){
  return <div className={"sc-sheet"+(sheet.length>1?" multi":"")}>{sheet.map((row,i)=>(
    <article className="sc-mon card" key={i}>
      <header className="sc-mon-head">
        <img className="sc-mon-sprite" src={row.sprite} alt="" onError={onSpriteError()}/>
        <div className="sc-mon-who">
          <h3 className="sc-mon-name">{row.name}</h3>
          <span className="sc-mon-sub">{[row.english!==row.name?row.english:"",row.num!=null?`No. ${String(row.num).padStart(4,"0")}`:""].filter(Boolean).join("  ")}</span>
          <div className="tb-types">{row.types.map(t=><span key={t.id} className={`tb-type type-${t.id}`}>{t.label}</span>)}</div>
        </div>
      </header>
      {row.unresolved&&<p className="bk-hint">지금 데이터에서 확인할 수 없는 포켓몬입니다.</p>}
      <dl className="sc-facts">
        <div><dt>특성</dt><dd>{row.ability||"없음"}</dd></div>
        <div><dt>도구</dt><dd>{row.item||"없음"}</dd></div>
        <div><dt>성격</dt><dd>{row.nature}<small>{row.natureEffect}</small></dd></div>
      </dl>
      <div className="sc-stats" role="table" aria-label={`${row.name} 능력치`}>
        <div className="sc-stat sc-stat-h" role="row"><span role="columnheader">능력</span><span role="columnheader">종족값</span><span role="columnheader">능력 포인트 {row.spTotal} / 66</span><span role="columnheader">최종</span></div>
        {row.stats.map(st=>(<div className="sc-stat" role="row" key={st.key}>
          <b role="cell">{st.label}{st.mark==="+"?" ↑":st.mark==="-"?" ↓":""}</b>
          <span role="cell" className="tnum">{st.base??""}</span>
          <span role="cell" className="sc-sp"><i style={{"--sp":st.sp/32}}/><em className={"tnum"+(st.sp?" on":"")}>{st.sp}</em></span>
          <strong role="cell" className="tnum">{st.final}</strong>
        </div>))}
      </div>
      <ul className="sc-moves">{Array.from({length:4},(_,k)=>{ const mv=row.moves[k];
        return <li key={k} className={mv?`type-${mv.type?.id||""}`:"empty"}>{mv?<><b>{mv.name}</b><small>{[mv.type?.label,mv.category].filter(Boolean).join(" ")}</small></>:<small>기술 없음</small>}</li>; })}</ul>
    </article>))}</div>;
}

function readLocalTeams(){
  const out=[];
  try{
    const draft=normalizeDraft(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)||"null"),REGULATIONS);
    if(draft?.members?.length) out.push({...draft,id:"draft",name:"작업 중인 팀",working:true});
  }catch{ /* 없음 */ }
  try{
    const saved=JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY)||"[]");
    if(Array.isArray(saved)) saved.map(normalizeSavedTeam).filter(t=>t?.members?.length).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).forEach(t=>out.push(t));
  }catch{ /* 없음 */ }
  return out;
}

/* 게시판에서 바로 올릴 때: 이 브라우저의 팀 빌더에 있는 팀 중에서 고른다 */
function TeamPicker({ kind, onPick, onClose, go }){
  const teams=readLocalTeams();
  return (<Modal title={`${KIND_LABEL[kind]} 올리기`} hint="팀 빌더에 저장된 팀에서 고릅니다." onClose={onClose}>
    <div className="swap" key="pick">
      {teams.length===0
        ? <p className="bk-hint">이 브라우저의 팀 빌더에 저장된 팀이 없습니다. 팀 빌더에서 팀을 만든 뒤 그곳에서 바로 올릴 수 있습니다.</p>
        : <ul className="sc-pick">{teams.map(t=>(<li key={t.id}><button type="button" className="sc-pick-row press" onClick={()=>onPick(t)}>
            <span className="sc-pick-main"><b>{t.name}</b><small>{ruleSummary(t)}, {t.members.length}마리</small></span>
            <PartySprites members={t.members}/>
          </button></li>))}</ul>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>닫기</button><button className="btn btn-primary" onClick={()=>{onClose();go?.("builder");}}>팀 빌더 열기<Icon n="arrow" size={14}/></button></div>
    </div>
  </Modal>);
}

/* 소개글 작성. 팀 빌더와 게시판이 함께 쓴다. team 은 직렬화된 팀(빌더의 저장 팀과 같은 모양). */
export function ShowcaseCompose({ team, kind:initialKind="party", format:initialFormat="single", initialIndex=0, onClose, onPosted }){
  const display=useTeamDisplay();
  const members=team?.members||[];
  const [kind,setKind]=useState(members.length===1?"sample":initialKind);
  const [format,setFormat]=useState(initialFormat);
  const [index,setIndex]=useState(Math.min(initialIndex,Math.max(0,members.length-1)));
  const [nick,setNick]=useState(()=>{ try{return localStorage.getItem("ypl-board-nick")||"";}catch{return "";} });
  const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [pin,setPin]=useState(""); const [busy,setBusy]=useState(false);
  const sheet=sheetOf(team,display);
  const nameAt=i=>sheet[i]?.name||members[i]?.pokemonName||"";
  const autoTitle=kind==="sample"?`${nameAt(index)} 샘플`:(team?.name&&!team.working?team.name:`${nameAt(0)} 파티`);
  const submit=async()=>{
    if(busy)return;
    if(!nick.trim()){siteAlert("닉네임을 입력해 주세요.","글쓴이로 표시될 닉네임이 필요합니다.");return;}
    if(!members.length){siteAlert("올릴 포켓몬이 없습니다.");return;}
    setBusy(true);
    try{
      const id=newCommunityId();
      const picked=kind==="sample"?[members[index]]:members;
      const names=(kind==="sample"?[sheet[index]]:sheet).map(r=>r?.name).filter(Boolean);
      const post={ id, kind, format, nick:nick.trim().slice(0,20), title:(title.trim()||autoTitle).slice(0,60), body:body.trim().slice(0,4000),
        pinHash:pin?await hashPin(id,pin):"", createdAt:new Date().toISOString(), names,
        team:{ name:team?.working?"":String(team?.name||"").slice(0,40), regulationId:team?.regulationId, cupRuleId:team?.cupRuleId||"none", cupRuleSettings:team?.cupRuleSettings||{assignedType:""}, members:picked },
        comments:[] };
      await updateCommunity(SHOWCASE_KEY,list=>[post,...list]);
      try{ localStorage.setItem("ypl-board-nick",post.nick); }catch{ /* 기억 못 해도 된다 */ }
      onPosted?.(post);
    }catch(error){ siteAlert("올리지 못했습니다.",error?.message||""); }
    finally{ setBusy(false); }
  };
  return (<Modal title={`${KIND_LABEL[kind]} 소개글 쓰기`} hint={ruleSummary(team)} onClose={onClose}>
    <div className="swap" key="compose">
      <div className="field"><label>배틀 형식</label><Segmented value={format} onChange={setFormat} ariaLabel="배틀 형식" options={FORMAT_TABS}/></div>
      {members.length>1&&<div className="field"><label>올릴 내용</label><Segmented value={kind} onChange={setKind} ariaLabel="소개글 종류" options={[["party",`파티 전체 ${members.length}마리`],["sample","한 마리 샘플"]]}/></div>}
      {kind==="sample"&&members.length>1&&<div className="field"><label>샘플로 올릴 포켓몬</label>
        <div className="sc-choose" role="radiogroup" aria-label="샘플로 올릴 포켓몬">{members.map((m,i)=>(
          <button type="button" key={i} role="radio" aria-checked={i===index} className={"sc-choose-mon press"+(i===index?" on":"")} onClick={()=>setIndex(i)}>
            <img src={spriteUrl(m.pokemonName)} alt="" onError={onSpriteError()}/><span>{nameAt(i)}</span>
          </button>))}</div></div>}
      {kind==="party"&&<div className="field"><PartySprites members={members} big/></div>}
      <div className="bk-grow2">
        <div className="field"><label>닉네임</label><input value={nick} onChange={e=>setNick(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></div>
        <div className="field"><label>수정, 삭제 비밀번호 (선택, 숫자 4자리)</label><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="예: 1234" inputMode="numeric"/></div>
      </div>
      <div className="field"><label>제목</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={autoTitle} maxLength={60}/></div>
      <div className="field"><label>소개</label><textarea value={body} onChange={e=>setBody(e.target.value)} rows={6} placeholder={kind==="sample"?"채용 이유, 노리는 상대, 운용법을 적어 주세요.":"컨셉, 선출 방법, 주의할 상대를 적어 주세요."}/></div>
      <p className="bk-hint">특성, 도구, 성격, 능력 포인트, 기술이 모두 함께 올라가고, 읽는 사람이 자기 팀 빌더로 가져갈 수 있습니다.</p>
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={busy||!display} onClick={submit}>{busy?"올리는 중…":"올리기"}</button></div>
    </div>
  </Modal>);
}

/* 게시판의 글을 팀 빌더로 넘긴다. 빌더가 내 팀에 새로 저장하고 연다. */
function openInBuilder(post,go){
  try{ sessionStorage.setItem(INCOMING_TEAM_KEY,JSON.stringify({...post.team,name:(post.title||post.team?.name||"게시판에서 가져온 팀").slice(0,40)})); }
  catch{ siteAlert("팀을 넘기지 못했습니다.","이 브라우저에서 저장소를 쓸 수 없습니다."); return; }
  go("builder");
}

function ShowcaseBoard({ kind, format, setFormat, admin, flash, go, tabs }){
  const label=KIND_LABEL[kind];
  const [posts,setPosts]=useState(()=>peekRead(SHOWCASE_KEY)||null);
  const [loadError,setLoadError]=useState("");
  const [fresh,setFresh]=useState(false);
  const reload=async()=>{ try{ setPosts(await freshRead(SHOWCASE_KEY,()=>readCommunity(SHOWCASE_KEY))); setLoadError(""); }catch(error){ setLoadError(error?.message||"글을 불러오지 못했습니다."); }finally{ setFresh(true); } };
  useEffect(()=>{ void reload(); },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q,setQ]=useState(""); const [page,setPage]=useState(1);
  useEffect(()=>{setPage(1);},[q]);
  const [picking,setPicking]=useState(false); const [composeTeam,setComposeTeam]=useState(null);
  const [article,setArticle]=useState(()=>new URLSearchParams(window.location.search).get("post"));
  const listScroll=useRef(0);
  const all=(posts||[]).filter(p=>p.kind===kind&&formatOf(p)===format).sort((a,b)=>(a.createdAt<b.createdAt?1:-1));
  const kw=q.trim().toLowerCase();
  const list=kw?all.filter(p=>[p.title,p.body,p.nick,...(p.names||[]),...(p.team?.members||[]).map(m=>m.pokemonName)].some(t=>String(t||"").toLowerCase().includes(kw))):all;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE)); const cur=Math.min(page,pages);
  const shown=list.slice((cur-1)*PAGE_SIZE,cur*PAGE_SIZE);
  const p=article?(posts||[]).find(x=>x.id===article):null;
  const display=useTeamDisplay(Boolean(p));

  // 글을 여는 것은 기록 한 칸: 폰의 뒤로 가기가 목록으로 돌아온다
  useEffect(()=>{ const onPop=()=>setArticle(new URLSearchParams(window.location.search).get("post")||null); popHandlers.add(onPop); return ()=>{ popHandlers.delete(onPop); }; },[]);
  const openPost=id=>{ listScroll.current=window.scrollY; const url=new URL(window.location.href); url.searchParams.set("tab",kind); url.searchParams.set("post",id);
    pushHistory({...window.history.state,post:id},url); transition(()=>flushSync(()=>setArticle(id)),{shared:"s-"+id}); };
  const closePost=()=>{ const id=article; if(window.history.state?.post) backWith("s-"+id);
    else { const url=new URL(window.location.href); url.searchParams.delete("post"); window.history.replaceState(window.history.state,"",url); transition(()=>flushSync(()=>setArticle(null)),{shared:"s-"+id,dir:"back",scrollY:listScroll.current}); } };

  const mutate=async(fn,done)=>{ try{ setPosts(await updateCommunity(SHOWCASE_KEY,fn)); if(done)flash(done); return true; }catch(error){ siteAlert("저장하지 못했습니다.",error?.message||""); return false; } };
  const [editing,setEditing]=useState(null);
  const delPost=async(post)=>{ if(!(await authorize(post,"글","삭제",admin)))return; if(await mutate(list=>list.filter(x=>x.id!==post.id),"삭제됨")) closePost(); };
  const addComment=async(post,c)=>{ const id=newCommunityId(); const {pin,...rest}=c;
    const comment={...rest,id,pinHash:pin?await hashPin(id,pin):"",createdAt:new Date().toISOString()};
    await mutate(list=>list.map(x=>x.id===post.id?{...x,comments:[...(x.comments||[]),comment]}:x),"댓글을 등록했습니다."); };
  const delComment=async(post,c)=>{ if(!(await authorize(c,"댓글","삭제",admin)))return;
    await mutate(list=>list.map(x=>x.id===post.id?{...x,comments:(x.comments||[]).filter(y=>y.id!==c.id)}:x)); };
  const editPost=async(post)=>{ if(await authorize(post,"글","수정",admin)) setEditing({heading:"글 수정",initial:{title:post.title||"",body:post.body||""},
    apply:(list,v,at)=>list.map(x=>x.id===post.id?{...x,...v,body:v.body.slice(0,4000),editedAt:at}:x)}); };
  const editComment=async(post,c)=>{ if(await authorize(c,"댓글","수정",admin)) setEditing({heading:"댓글 수정",initial:{body:c.body||"",link:c.link||""},
    apply:(list,v,at)=>list.map(x=>x.id===post.id?{...x,comments:(x.comments||[]).map(y=>y.id===c.id?{...y,...v,editedAt:at}:y)}:x)}); };
  const saveEdit=async v=>{ const at=new Date().toISOString(); if(await mutate(list=>editing.apply(list,v,at),"수정했습니다.")) setEditing(null); };
  const [imageBusy,setImageBusy]=useState(false);
  const saveImage=async(post,sheet)=>{ if(imageBusy)return; setImageBusy(true);
    try{ const r=await saveTeamSheetImage(sheet,{title:post.title,meta:[FORMAT_LABEL[formatOf(post)],ruleSummary(post.team),`${sheet.length}마리`].join(", "),author:post.nick,date:new Date(post.createdAt)}); if(r==="downloaded")flash("이미지를 저장했습니다."); }
    catch(error){ siteAlert("이미지를 만들지 못했습니다.",error?.message||""); } finally{ setImageBusy(false); } };
  const share=async(post)=>{ const r=await shareLink({view:"board",tab:post.kind,...(formatOf(post)==="double"&&{format:"double"}),post:post.id},post.title); if(r==="copied")flash("주소를 복사했습니다."); };

  if(article&&!p) return (<section className="sec"><article className="nb-article">
    <button type="button" className="nb-back press" onClick={closePost}><Icon n="back" size={18}/><span>{label}</span></button>
    {fresh?<Empty icon="search" title="글을 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다."/>:<Loader/>}
  </article></section>);
  if(p){ const sheet=sheetOf(p.team,display); const cc=(p.comments||[]).length;
    return (<section className="sec">
      <article className="nb-article">
        <button type="button" className="nb-back press" onClick={closePost}><Icon n="back" size={18}/><span>{label}</span></button>
        <header className="nb-a-head">
          <h1 className="title nb-a-title" data-vt={"s-"+p.id}>{p.title}</h1>
          <p className="caption nb-a-meta"><b className="bd-nick">{p.nick}</b><span className="tnum">{fmtDT(p.createdAt)}</span><Edited at={p.editedAt}/><span>{FORMAT_LABEL[formatOf(p)]}</span><span>{ruleSummary(p.team)}</span></p>
        </header>
        <div className="sc-actions">
          <button className="ypl-btn ypl-btn--primary ypl-btn--sm press" onClick={()=>openInBuilder(p,go)}>팀 빌더에서 열기<Icon n="arrow" size={14}/></button>
          <button className="ypl-btn ypl-btn--glass ypl-btn--sm press" disabled={!sheet.length||imageBusy} onClick={()=>saveImage(p,sheet)}>{imageBusy?"만드는 중…":"이미지 저장"}</button>
          <button className="ypl-btn ypl-btn--glass ypl-btn--sm press" onClick={()=>share(p)}>링크 공유</button>
          <button className="bd-del press" onClick={()=>editPost(p)}>수정</button>
          <button className="bd-del press" onClick={()=>delPost(p)}>삭제</button>
        </div>
        {/* 샘플은 카드 한 장이라, 넓은 화면에서는 카드를 왼쪽에 두고 소개와 댓글을 오른쪽 칸에 세운다(위 모서리를 카드와 맞춘다) */}
        <div className={"sc-post"+(p.kind==="sample"?" split":"")}>
        {p.body&&<div className="nb-body card sc-body"><Prose text={p.body}/></div>}
        <div className="sc-post-sheet">{display==="error"?<p className="bk-error">배틀 데이터를 불러오지 못해 세팅을 보여 줄 수 없습니다. 팀 빌더에서 열면 확인할 수 있습니다.</p>
          :!display?<Loader small/>:<TeamSheetView sheet={sheet}/>}</div>
        <div className="bd-cmts card">
          <h2 className="bd-cmts-h">댓글{cc>0?` ${cc}`:""}</h2>
          {(p.comments||[]).map(c=>(<div className="bd-cmt" key={c.id}>
            <div className="bd-cmt-main"><div className="bd-cmt-top"><b>{c.nick}</b><span className="bd-date tnum">{fmtDT(c.createdAt)}</span><Edited at={c.editedAt}/><button className="bd-del sm" onClick={()=>editComment(p,c)}>수정</button><button className="bd-del sm" onClick={()=>delComment(p,c)}>삭제</button></div><div className="bd-cmt-body">{c.body}{c.link&&<MediaEmbed url={c.link}/>}</div></div>
          </div>))}
          <CommentForm onSubmit={(c)=>addComment(p,c)}/>
        </div>
        </div>
      </article>
      {editing&&<EditSheet {...editing} onClose={()=>setEditing(null)} onSave={saveEdit}/>}
    </section>);
  }

  return (<section className="sec">
    <PageHead plain="게시판" desc={kind==="sample"?"포켓몬 한 마리의 세팅과 운용법을 나누는 곳입니다. 팀 빌더에서 바로 올리고 가져갈 수 있습니다.":"파티 전체를 소개하는 곳입니다. 마음에 드는 파티는 내 팀 빌더로 바로 가져갈 수 있습니다."}>
      {tabs}
      <div className="y-page-aside">
        <ListSearch q={q} setQ={setQ} placeholder="제목, 포켓몬, 글쓴이 검색" count={list.length}/>
        <button className="ypl-btn ypl-btn--primary ypl-btn--sm press" onClick={()=>setPicking(true)}><Icon n="plus" size={16}/>{label} 올리기</button>
      </div>
    </PageHead>
    {loadError&&<div className="sc-error"><p className="bk-error">{loadError}</p><button className="ypl-btn ypl-btn--glass ypl-btn--sm press" onClick={reload}>다시 시도</button></div>}
    {!posts&&!loadError?<Loader/>:<div className={(kind==="party"?"sc-grid":"bd-list")+" swap"}>
      {list.length===0&&(kw
        ? <Empty icon="search" title="검색 결과가 없습니다." desc={`‘${kw}’에 맞는 ${FORMAT_LABEL[format]} ${label} 글을 찾지 못했습니다.`}/>
        : <Empty icon="list" title={`아직 ${FORMAT_LABEL[format]} ${label} 글이 없습니다.`} desc={`팀 빌더에서 팀을 만들고 ‘게시판에 올리기’를 누르면 첫 ${FORMAT_LABEL[format]} ${label} 글이 됩니다.`}/>)}
      {shown.map(post=>{ const cc=(post.comments||[]).length;
        return kind==="party"
          ? <button type="button" className="sc-tile card press" key={post.id} onClick={()=>openPost(post.id)}>
              <PartySprites members={post.team?.members}/>
              <span className="sc-tile-foot">
                <span className="bd-main"><span className="bd-title" data-vt={"s-"+post.id}>{post.title}</span>
                  <span className="bd-meta"><b className="bd-nick">{post.nick}</b><span>{REGULATIONS[post.team?.regulationId]?.shortName||""}</span><span className="bd-date tnum">{fmtDT(post.createdAt)}</span></span></span>
                {cc>0&&<span className="bd-cc">댓글 {cc}</span>}
              </span>
            </button>
          : <button type="button" className="bd-head sc-row press" key={post.id} onClick={()=>openPost(post.id)}>
              <img className="sc-row-sprite" src={spriteUrl(post.team?.members?.[0]?.pokemonName)} alt="" loading="lazy" decoding="async" onError={onSpriteError()}/>
              <span className="bd-main"><span className="bd-title" data-vt={"s-"+post.id}>{post.title}</span>
                <span className="bd-meta"><b className="bd-nick">{post.nick}</b><span>{post.names?.[0]||""}</span><span className="bd-date tnum">{fmtDT(post.createdAt)}</span></span></span>
              {cc>0&&<span className="bd-cc">댓글 {cc}</span>}
            </button>; })}
    </div>}
    <Pager page={cur} pages={pages} onGo={setPage}/>
    {picking&&<TeamPicker kind={kind} go={go} onClose={()=>setPicking(false)} onPick={t=>{setPicking(false);setComposeTeam(t);}}/>}
    {composeTeam&&<ShowcaseCompose team={composeTeam} kind={kind} format={format} onClose={()=>setComposeTeam(null)} onPosted={post=>{ setComposeTeam(null); flash("글을 올렸습니다."); void reload(); if(post.format!==format) setFormat(post.format); if(post.kind!==kind) go?.("board",{tab:post.kind,format:post.format}); }}/>}
  </section>);
}

export default function BoardPage(props){
  const [tab,setTab]=useState(()=>{ const t=new URLSearchParams(window.location.search).get("tab"); return BOARD_TABS.some(([k])=>k===t)?t:"free"; });
  const [format,setFormat]=useState(()=>formatOf({format:new URLSearchParams(window.location.search).get("format")}));
  const replaceUrl=(key,value)=>{ const url=new URL(window.location.href); if(value)url.searchParams.set(key,value); else url.searchParams.delete(key); url.searchParams.delete("post"); window.history.replaceState(window.history.state,"",url); };
  const changeTab=t=>{ setTab(t); replaceUrl("tab",t==="free"?"":t); };
  const changeFormat=f=>{ setFormat(f); replaceUrl("format",f==="double"?f:""); };
  const tabs=<div className="bd-tabs"><Segmented value={tab} onChange={changeTab} ariaLabel="게시판 종류" options={BOARD_TABS}/>
    {tab!=="free"&&<Segmented value={format} onChange={changeFormat} ariaLabel="배틀 형식" options={FORMAT_TABS}/>}</div>;
  return tab==="free"?<FreeBoard {...props} tabs={tabs}/>:<ShowcaseBoard key={tab} kind={tab} format={format} setFormat={changeFormat} {...props} tabs={tabs}/>;
}

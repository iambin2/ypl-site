import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Empty, Icon, ListSearch, Loader, Modal, Pager, Prose, Segmented, siteAlert, siteConfirm, sitePrompt, transition, ErrorNote } from "../components/index.js";
import { reduced } from "../components/common/motion.js";
import { backWith, popHandlers, pushHistory } from "../components/layout/history.js";
import { saveTeamSheetImage } from "../components/teamSheetImage.js";
import { CUP_RULES, REGULATIONS, TYPE_OPTIONS } from "../data/index.js";
import { formatDate } from "../services/dateFormat.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { FREE_BOARD_KEY, SHOWCASE_KEY, createCommunityItem, deleteCommunityItem, newCommunityId, patchCommunityItem, readCommunity, shareLink, verifyCommunityPin } from "../services/communityStore.js";
import { PIN_DENIED } from "../services/communityItems.js";
import { DRAFT_STORAGE_KEY, INCOMING_TEAM_KEY, TEAM_STORAGE_KEY, normalizeDraft, normalizeSavedTeam, onSpriteError, spriteUrl } from "../services/teamBuilderCore.js";
import { takeBoardDraft } from "../services/battleService.js";
import Button from "../components/common/Button.jsx";
import { BackLink, Chips, Dock, Mon, Row, SectionHead, TabsLine } from "../components/common/Board.jsx";
import { dotDate } from "../services/dateFormat.js";

const dotDay=dotDate;
import TeamSheet, { sheetOf, useTeamDisplay } from "../components/common/TeamSheet.jsx";
import Field from "../components/common/Field.jsx";

const PAGE_SIZE = 8;

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
  return <a className="ann-link" href={m.url} target="_blank" rel="noopener noreferrer" style={{marginTop:"var(--s2)"}}>{m.url}<Icon n="ext" size={16}/></a>;
}

function BoardCompose({ onClose, onSubmit, initial=null }){
  const [nick,setNick]=useState(""); const [title,setTitle]=useState(initial?.title||""); const [body,setBody]=useState(initial?.body||""); const [pin,setPin]=useState(""); const [link,setLink]=useState(""); const [secret,setSecret]=useState(false);
  const submit=()=>{ if(!nick.trim()){siteAlert("닉네임을 입력해 주세요.","글쓴이로 표시될 닉네임이 필요합니다.");return;} if(!title.trim()){siteAlert("제목을 입력해 주세요.");return;}
    onSubmit({nick:nick.trim().slice(0,20),title:title.trim().slice(0,60),body:body.trim(),pin:pin.trim(),link:link.trim(),secret}); };
  return (<Modal title="새 글 작성" onClose={onClose}>
    <div className="swap" key="compose">
      <div className="bk-grow2">
        <Field label="닉네임"><input value={nick} onChange={e=>setNick(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></Field>
        <Field label="수정, 삭제 비밀번호 (선택, 숫자 4자리)"><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="예: 1234" inputMode="numeric"/></Field>
      </div>
      <Field label="제목"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="제목을 입력해 주세요." maxLength={60}/></Field>
      <Field label="내용"><textarea value={body} onChange={e=>setBody(e.target.value)} rows={6} placeholder="자유롭게 작성해 주세요."/></Field>
      <div className="field"><label htmlFor="bd-link">이미지 또는 유튜브 링크 (선택)</label><input id="bd-link" value={link} onChange={e=>setLink(e.target.value)} placeholder="이미지 주소 또는 유튜브 링크를 붙여넣어 주세요." aria-label="이미지 주소 또는 유튜브 링크를 붙여넣어 주세요."/>
        {link.trim()&&<div className="bd-preview"><div className="bd-preview-h">미리보기</div><MediaEmbed url={link}/></div>}
      </div>
      <label className="bk-check"><input type="checkbox" checked={secret} onChange={e=>setSecret(e.target.checked)}/><span><Icon n="lock" size={16}/> 관리자에게만 보이기 <i>(건의, 비공개)</i></span></label>
      {secret&&<div className="bk-hint">이 글은 관리자만 볼 수 있습니다. 다른 방문자에게는 목록에도 표시되지 않습니다.</div>}
      <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit}>등록</Button></div>
    </div>
  </Modal>);
}

/* 본인 확인. 비밀번호는 서버가 대조한다. 확인되면 뒤따르는 쓰기에 쓸 비밀번호를, 멈추면 null 을 돌려준다. 관리자는 묻지 않는다. */
async function authorize(key,record,what,verb,admin){
  if(admin){
    if(verb==="삭제"&&!(await siteConfirm({title:`${what} 삭제`,body:`이 ${what}을 삭제할까요? 삭제한 ${what}은 되돌릴 수 없습니다.`,confirmLabel:"삭제",danger:true}))) return null;
    return "";
  }
  if(!record.hasPin){ siteAlert(`비밀번호가 없는 ${what}입니다.`,`관리자에게 ${verb} 요청을 해 주세요.`); return null; }
  const pin=await sitePrompt({title:`${what} ${verb}`,body:`본인 ${what}을 ${verb}하려면 작성할 때 정한 비밀번호를 입력해 주세요.`,label:"비밀번호",placeholder:"숫자 4자리",confirmLabel:verb==="삭제"?"삭제":"확인",secret:true,inputMode:"numeric"});
  if(pin===null) return null;
  try{
    const status=await verifyCommunityPin(key,record.id,pin);
    if(status==="ok") return pin;
    siteAlert(PIN_DENIED[status]||"비밀번호를 확인하지 못했습니다.",status==="wrong_pin"?"작성할 때 입력한 숫자 4자리를 다시 확인해 주세요.":"");
  }catch(error){ siteAlert("비밀번호를 확인하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); }
  return null;
}

/* 게시판 한 칸의 읽기와 쓰기. 쓰기가 끝나면 서버의 목록을 다시 읽어, 화면이 저장되지 않은 내용을 보여 주지 않는다. */
function useCommunityList(key,admin,flash){
  const [posts,setPosts]=useState(()=>peekRead(key)||null);
  const [loadError,setLoadError]=useState("");
  const [fresh,setFresh]=useState(false);
  const reload=async()=>{ try{ setPosts(await freshRead(key,()=>readCommunity(key))); setLoadError(""); }catch(error){ setLoadError(error?.message||"글을 불러오지 못했습니다."); }finally{ setFresh(true); } };
  // 관리자 전용 글은 로그인한 뒤에야 내려온다.
  useEffect(()=>{ void reload(); },[admin]); // eslint-disable-line react-hooks/exhaustive-deps
  const run=async(write,done)=>{ try{ await write(); await reload(); if(done)flash(done); return true; }catch(error){ siteAlert("저장하지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); return false; } };
  return {posts,loadError,fresh,reload,run};
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
      {has("title")&&<Field label="제목"><input value={v.title} onChange={set("title")} maxLength={60}/></Field>}
      {has("body")&&<Field label="내용"><textarea value={v.body} onChange={set("body")} rows={has("title")?6:3}/></Field>}
      {has("link")&&<div className="field"><label htmlFor="bd-edit-link">이미지 또는 유튜브 링크 (선택)</label><input id="bd-edit-link" value={v.link} onChange={set("link")} placeholder="이미지 주소 또는 유튜브 링크를 붙여넣어 주세요." aria-label="이미지 주소 또는 유튜브 링크를 붙여넣어 주세요."/>
        {v.link.trim()&&<div className="bd-preview"><div className="bd-preview-h">미리보기</div><MediaEmbed url={v.link}/></div>}</div>}
      {has("secret")&&<label className="bk-check"><input type="checkbox" checked={v.secret} onChange={set("secret")}/><span><Icon n="lock" size={16}/> 관리자에게만 보이기 <i>(건의, 비공개)</i></span></label>}
      <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" disabled={busy} onClick={submit} loading={busy}>저장</Button></div>
    </div>
  </Modal>);
}
const Edited=({ at })=>at?<span>, 수정됨</span>:null;

function CommentForm({ onSubmit }){
  const [nick,setNick]=useState(""); const [body,setBody]=useState(""); const [pin,setPin]=useState(""); const [link,setLink]=useState("");
  const submit=()=>{ if(!nick.trim()){siteAlert("닉네임을 입력해 주세요.","댓글 작성자로 표시될 닉네임이 필요합니다.");return;} if(!body.trim()&&!link.trim()){siteAlert("댓글이나 링크를 입력해 주세요.");return;}
    onSubmit({nick:nick.trim().slice(0,20),body:body.trim(),pin:pin.trim(),link:link.trim()}); setBody(""); setPin(""); setLink(""); };
  return (<div className="bd-cform stack">
    {/* each field is a cell: its label 12 over what is typed, so a placeholder never stands in for the label (DESIGN.md "Controls") */}
    <div className="bd-cform-row">
      <label className="cell bd-cform-nick"><span className="cell-label">닉네임</span><input value={nick} onChange={e=>setNick(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></label>
      <label className="cell bd-cform-pin"><span className="cell-label">비밀번호 (선택)</span><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="숫자 4자리" inputMode="numeric"/></label>
    </div>
    <div className="bd-cform-row">
      <label className="cell bd-cform-body"><span className="cell-label">댓글</span><input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit();}}/></label>
      <Button variant="main" icon="check" size="sm" onClick={submit}>등록</Button>
    </div>
    <label className="cell bd-cform-link"><span className="cell-label">이미지 또는 유튜브 링크 (선택)</span><input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://"/></label>
  </div>);
}

/* 게시판: 공지와 같은 문법. 목록에서 글을 누르면 본문 화면으로 넘어가고, 누른 제목이 본문 제목 자리로 이어진다(I2).
   연 글은 주소(?post=)와 기록 한 칸에 남는다. 댓글과 삭제는 본문 화면에 모은다. */
function FreeBoard({ admin, flash, tabs }){
  const [q,setQ]=useState(""); const [page,setPage]=useState(1);
  const {posts,loadError,fresh,reload,run}=useCommunityList(FREE_BOARD_KEY,admin,flash);
  const all=[...(posts||[])].sort((a,b)=>(a.createdAt<b.createdAt?1:-1));
  const kw=q.trim().toLowerCase();
  const list=kw?all.filter(p=>[p.title,p.body,p.nick].some(t=>String(t||"").toLowerCase().includes(kw))):all;
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  const cur=Math.min(page,pages);
  const shown=list.slice((cur-1)*PAGE_SIZE,cur*PAGE_SIZE);
  useEffect(()=>{setPage(1);},[q]);
  const [article,setArticle]=useState(()=>new URLSearchParams(window.location.search).get("post"));
  const listScroll=useRef(0);
  // 끝난 배틀의 게시판에 공유가 넘긴 초안이 있으면 글쓰기를 그 초안으로 연다(battleService.js)
  // (an effect, not the state initializer: StrictMode calls an initializer twice and the second would find it already taken)
  const [compose,setCompose]=useState(false);
  useEffect(()=>{ const draft=takeBoardDraft(); if(draft) setCompose(draft); },[]);
  // 글을 여는 것은 기록 한 칸: 폰의 뒤로 가기가 목록으로 돌아온다
  useEffect(()=>{ const onPop=()=>setArticle(new URLSearchParams(window.location.search).get("post")||null); popHandlers.add(onPop); return ()=>{ popHandlers.delete(onPop); }; },[]);
  const openPost=id=>{ listScroll.current=window.scrollY; const url=new URL(window.location.href); url.searchParams.set("post",id);
    pushHistory({...window.history.state,post:id},url); transition(()=>flushSync(()=>setArticle(id)),{shared:"b-"+id}); };
  const closePost=()=>{ const id=article; if(window.history.state?.post) return backWith("b-"+id);
    const url=new URL(window.location.href); url.searchParams.delete("post"); window.history.replaceState(window.history.state,"",url); transition(()=>flushSync(()=>setArticle(null)),{shared:"b-"+id,dir:"back",scrollY:listScroll.current}); };
  const [editing,setEditing]=useState(null);
  const addPost=async({pin,secret,...post})=>{ if(await run(()=>createCommunityItem(FREE_BOARD_KEY,newCommunityId(),post,{pin,secret}),"글을 등록했습니다.")) setCompose(false); };
  const delPost=async(p)=>{ const pin=await authorize(FREE_BOARD_KEY,p,"글","삭제",admin); if(pin===null)return; if(await run(()=>deleteCommunityItem(FREE_BOARD_KEY,p.id,pin),"삭제됨")) closePost(); };
  const addComment=({pin,...c},p)=>run(()=>createCommunityItem(FREE_BOARD_KEY,newCommunityId(),c,{parentId:p.id,pin}),"댓글을 등록했습니다.");
  const delComment=async(p,c)=>{ const pin=await authorize(FREE_BOARD_KEY,c,"댓글","삭제",admin); if(pin===null)return; await run(()=>deleteCommunityItem(FREE_BOARD_KEY,c.id,pin)); };
  const editPost=async(p)=>{ const pin=await authorize(FREE_BOARD_KEY,p,"글","수정",admin); if(pin!==null) setEditing({heading:"글 수정",id:p.id,pin,initial:{title:p.title||"",body:p.body||"",link:p.link||"",secret:Boolean(p.secret)}}); };
  const editComment=async(p,c)=>{ const pin=await authorize(FREE_BOARD_KEY,c,"댓글","수정",admin); if(pin!==null) setEditing({heading:"댓글 수정",id:c.id,pin,initial:{body:c.body||"",link:c.link||""}}); };
  const saveEdit=async({secret,...v})=>{ if(await run(()=>patchCommunityItem(FREE_BOARD_KEY,editing.id,{...v,editedAt:new Date().toISOString()},{secret,pin:editing.pin}),"수정했습니다.")) setEditing(null); };
  const editSheet=editing&&<EditSheet {...editing} onClose={()=>setEditing(null)} onSave={saveEdit}/>;

  const p=article?all.find(x=>x.id===article):null;
  if(article&&!p) return (<section className="bd"><BackLink to="게시판" onClick={closePost}/>
    {fresh?<Empty title="글을 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다."/>:<Loader/>}
  </section>);
  if(p){ const cc=(p.comments||[]).length;
    return (<section className="bd">
      <article>
        <BackLink to="게시판" onClick={closePost}/>
        <p className="t12 dim reg bd-date-line">{[p.secret&&"관리자 전용",p.nick,fmtDT(p.createdAt)].filter(Boolean).join(", ")}<Edited at={p.editedAt}/></p>
        <h1 className="t32 bd-title-h" data-vt={"b-"+p.id}>{p.title||p.body||"(제목 없음)"}</h1>
        {(p.body||p.link)&&<div className="bd-body">
          <Prose text={p.body}/>
          {p.link&&<MediaEmbed url={p.link}/>}
        </div>}
        <div className="stack bd-actions"><Button variant="second" onClick={()=>editPost(p)}>수정</Button><Button variant="second" onClick={()=>delPost(p)}>삭제</Button></div>
        <div className="bd-cmts">
          <h2 className="t20 bd-cmts-h">댓글{cc>0?<span className="dim"> {cc}</span>:""}</h2>
          {(p.comments||[]).map(c=>(<div className="pn bd-cmt" key={c.id}>
            <div className="bd-cmt-top"><b className="t12">{c.nick}</b><span className="t12 dim num">{fmtDT(c.createdAt)}</span><Edited at={c.editedAt}/><button className="bd-act t12" onClick={()=>editComment(p,c)}>수정</button><button className="bd-act t12" onClick={()=>delComment(p,c)}>삭제</button></div><div className="read bd-cmt-body">{c.body}{c.link&&<MediaEmbed url={c.link}/>}</div>
          </div>))}
          <CommentForm onSubmit={(c)=>addComment(c,p)}/>
        </div>
      </article>
      {editSheet}
    </section>);
  }

  return (<section className="bd">
    <h1 className="t32">게시판</h1>
    {tabs}
    <div className="bd-tools stack"><ListSearch q={q} setQ={setQ} placeholder="제목, 내용, 글쓴이" count={list.length}/><Button variant="main" icon="plus" onClick={()=>setCompose(true)}>글쓰기</Button></div>
    <div className="stack bd-list swap">
      {loadError&&<ErrorNote action="다시 불러오기" onRetry={reload}>{loadError}</ErrorNote>}
      {!loadError&&!posts&&!fresh&&<Loader/>}
      {!loadError&&posts&&list.length===0&&(kw
        ? <Empty title="검색 결과가 없습니다." desc={`‘${kw}’에 맞는 글을 찾지 못했습니다.`}/>
        : <Empty title="아직 글이 없습니다." desc="첫 글을 남기면 이곳에 표시됩니다."/>)}
      {shown.map(p=>{ const cc=(p.comments||[]).length; const d=dotDay(p.createdAt);
        return <Row key={p.id} title={<span data-vt={"b-"+p.id}>{p.title||p.body||"(제목 없음)"}</span>}
          line={<>{p.secret&&"관리자 전용, "}{p.nick}{d&&<span className="bd-day"><span className="num">{d.day}</span> {d.weekday}</span>}</>}
          value={cc>0?<span className="t12 dim">댓글 {cc}</span>:undefined} onClick={()=>openPost(p.id)}/>;})}
    </div>
    <div className="bd-pager"><Pager page={cur} pages={pages} onGo={setPage}/></div>
    {compose&&<BoardCompose initial={typeof compose==="object"?compose:null} onClose={()=>setCompose(false)} onSubmit={addPost}/>}
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
        : <ul className="sc-pick">{teams.map(t=>(<li key={t.id}><button type="button" className="sc-pick-row" onClick={()=>onPick(t)}>
            <span className="sc-pick-main"><b>{t.name}</b><small>{ruleSummary(t)}, {t.members.length}마리</small></span>
            <PartySprites members={t.members}/>
          </button></li>))}</ul>}
      <div className="modal-actions"><Button variant="second" onClick={onClose}>닫기</Button><Button variant="main" onClick={()=>{onClose();go?.("builder");}}>팀 빌더 열기</Button></div>
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
        createdAt:new Date().toISOString(), names,
        team:{ name:team?.working?"":String(team?.name||"").slice(0,40), regulationId:team?.regulationId, cupRuleId:team?.cupRuleId||"none", cupRuleSettings:team?.cupRuleSettings||{assignedType:""}, members:picked },
        comments:[] };
      await createCommunityItem(SHOWCASE_KEY,id,post,{pin});
      try{ localStorage.setItem("ypl-board-nick",post.nick); }catch{ /* 기억 못 해도 된다 */ }
      onPosted?.(post);
    }catch(error){ siteAlert("글을 올리지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); }
    finally{ setBusy(false); }
  };
  return (<Modal title={`${KIND_LABEL[kind]} 소개글 쓰기`} hint={ruleSummary(team)} onClose={onClose}>
    <div className="swap" key="compose">
      <div className="field"><span className="field-label">배틀 형식</span><Segmented value={format} onChange={setFormat} ariaLabel="배틀 형식" options={FORMAT_TABS}/></div>
      {members.length>1&&<div className="field"><span className="field-label">올릴 내용</span><Segmented value={kind} onChange={setKind} ariaLabel="소개글 종류" options={[["party",`파티 전체 ${members.length}마리`],["sample","한 마리 샘플"]]}/></div>}
      {kind==="sample"&&members.length>1&&<div className="field"><span className="field-label">샘플로 올릴 포켓몬</span>
        <div className="sc-choose" role="radiogroup" aria-label="샘플로 올릴 포켓몬">{members.map((m,i)=>(
          <button type="button" key={i} role="radio" aria-checked={i===index} className={"sc-choose-mon"+(i===index?" on":"")} onClick={()=>setIndex(i)}>
            <img src={spriteUrl(m.pokemonName)} alt="" onError={onSpriteError()}/><span>{nameAt(i)}</span>
          </button>))}</div></div>}
      {kind==="party"&&<div className="field"><PartySprites members={members} big/></div>}
      <div className="bk-grow2">
        <Field label="닉네임"><input value={nick} onChange={e=>setNick(e.target.value)} placeholder="예: 지나가던트레이너" maxLength={20}/></Field>
        <Field label="수정, 삭제 비밀번호 (선택, 숫자 4자리)"><input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="예: 1234" inputMode="numeric"/></Field>
      </div>
      <Field label="제목"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={autoTitle} maxLength={60}/></Field>
      <Field label="소개"><textarea value={body} onChange={e=>setBody(e.target.value)} rows={6} placeholder={kind==="sample"?"채용 이유, 노리는 상대, 운용법을 적어 주세요.":"컨셉, 선출 방법, 주의할 상대를 적어 주세요."}/></Field>
      <p className="bk-hint">특성, 도구, 성격, 능력 포인트, 기술이 모두 함께 올라가고, 읽는 사람이 자기 팀 빌더로 가져갈 수 있습니다.</p>
      <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" disabled={busy||!display} onClick={submit} loading={busy}>올리기</Button></div>
    </div>
  </Modal>);
}

/* 게시판의 글을 팀 빌더로 넘긴다. 빌더가 내 팀에 새로 저장하고 연다. */
function openInBuilder(post,go){
  try{ sessionStorage.setItem(INCOMING_TEAM_KEY,JSON.stringify({...post.team,name:(post.title||post.team?.name||"게시판에서 가져온 팀").slice(0,40)})); }
  catch{ siteAlert("팀을 넘기지 못했습니다.","이 브라우저에서는 저장할 수 없습니다. 시크릿 창이라면 일반 창에서 다시 열어 주세요."); return; }
  go("builder");
}

function ShowcaseBoard({ kind, format, setFormat, admin, flash, go, tabs }){
  const label=KIND_LABEL[kind];
  const {posts,loadError,fresh,reload,run}=useCommunityList(SHOWCASE_KEY,admin,flash);
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

  const [editing,setEditing]=useState(null);
  const delPost=async(post)=>{ const pin=await authorize(SHOWCASE_KEY,post,"글","삭제",admin); if(pin===null)return; if(await run(()=>deleteCommunityItem(SHOWCASE_KEY,post.id,pin),"삭제됨")) closePost(); };
  const addComment=async(post,{pin,...c})=>{ await run(()=>createCommunityItem(SHOWCASE_KEY,newCommunityId(),c,{parentId:post.id,pin}),"댓글을 등록했습니다."); };
  const delComment=async(post,c)=>{ const pin=await authorize(SHOWCASE_KEY,c,"댓글","삭제",admin); if(pin===null)return; await run(()=>deleteCommunityItem(SHOWCASE_KEY,c.id,pin)); };
  const editPost=async(post)=>{ const pin=await authorize(SHOWCASE_KEY,post,"글","수정",admin); if(pin!==null) setEditing({heading:"글 수정",id:post.id,pin,cap:true,initial:{title:post.title||"",body:post.body||""}}); };
  const editComment=async(post,c)=>{ const pin=await authorize(SHOWCASE_KEY,c,"댓글","수정",admin); if(pin!==null) setEditing({heading:"댓글 수정",id:c.id,pin,initial:{body:c.body||"",link:c.link||""}}); };
  const saveEdit=async v=>{ const next=editing.cap?{...v,body:v.body.slice(0,4000)}:v; if(await run(()=>patchCommunityItem(SHOWCASE_KEY,editing.id,{...next,editedAt:new Date().toISOString()},{pin:editing.pin}),"수정했습니다.")) setEditing(null); };
  const [imageBusy,setImageBusy]=useState(false);
  const saveImage=async(post,sheet)=>{ if(imageBusy)return; setImageBusy(true);
    try{ const r=await saveTeamSheetImage(sheet,{title:post.title,meta:[FORMAT_LABEL[formatOf(post)],ruleSummary(post.team),`${sheet.length}마리`].join(", "),author:post.nick,date:new Date(post.createdAt)}); if(r==="downloaded")flash("이미지를 저장했습니다."); }
    catch(error){ siteAlert("이미지를 만들지 못했습니다.",error?.message||"잠시 뒤 다시 시도해 주세요."); } finally{ setImageBusy(false); } };
  const share=async(post)=>{ const r=await shareLink({view:"board",tab:post.kind,...(formatOf(post)==="double"&&{format:"double"}),post:post.id},post.title); if(r==="copied")flash("주소를 복사했습니다."); };

  if(article&&!p) return (<section className="bd"><BackLink to={label} onClick={closePost}/>
    {fresh?<Empty title="글을 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다."/>:<Loader/>}
  </section>);
  if(p){ const sheet=sheetOf(p.team,display); const cc=(p.comments||[]).length; const one=p.kind==="sample";
    const toCase=i=>document.getElementById(`bd-case-${p.id}-${i}`)?.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"});
    // 쇼케이스 글은 팀을 보여 주고 가져가게 하는 글이다. 파티: 여섯이 맨 앞에 크게(누르면 그 세팅으로), 바로 아래 가져가는 행동, 글쓴이의 말,
    // 포켓몬별 세팅(한 줄에 셋), 댓글. 샘플: 한 마리의 세팅이 왼쪽에 서 있고, 오른쪽에 행동, 말, 댓글이 흐른다.
    return (<section className="bd">
      <article className={"bd-art "+(one?"one":"many")}>
        <header className="bd-art-head">
          <BackLink to={label} onClick={closePost}/>
          <h1 className="t32 bd-title-h" data-vt={"s-"+p.id}>{p.title}</h1>
          <p className="t12 dim reg bd-date-line">{[label,FORMAT_LABEL[formatOf(p)],ruleSummary(p.team),p.nick,fmtDT(p.createdAt)].filter(Boolean).join(", ")}<Edited at={p.editedAt}/></p>
        </header>
        {!one&&<div className="bd-six">{(p.team?.members||[]).map((m,i)=>{ const name=(sheet[i]?.name)||m.pokemonName;
          return <button type="button" className="pn stand bd-cell" key={i} onClick={()=>toCase(i)} aria-label={`${name} 세팅 보기`}><Mon src={spriteUrl(m.pokemonName)}/><span className="floor bd-band"><b className="t15">{name}</b></span></button>; })}</div>}
        <div className="stack bd-bar">
          <Dock><Button variant="main" onClick={()=>openInBuilder(p,go)}>팀 빌더에서 열기</Button></Dock>
          <Button variant="second" disabled={!sheet.length||imageBusy} onClick={()=>saveImage(p,sheet)} loading={imageBusy}>이미지 저장</Button>
          <Button variant="second" onClick={()=>share(p)}>링크 공유</Button>
          <Button variant="second" onClick={()=>editPost(p)}>수정</Button>
          <Button variant="second" onClick={()=>delPost(p)}>삭제</Button>
        </div>
        {p.body&&<div className="bd-body"><Prose text={p.body}/></div>}
        <section className="sc-post-sheet" aria-label="포켓몬별 세팅">
          {!one&&<SectionHead id={"bd-sets-"+p.id} title="포켓몬별 세팅"/>}
          {display==="error"?<ErrorNote>배틀 데이터를 불러오지 못해 세팅을 보여 줄 수 없습니다. 팀 빌더에서 열면 확인할 수 있습니다.</ErrorNote>
            :!display?<Loader small/>:<TeamSheet sheet={sheet} idPrefix={`bd-case-${p.id}-`}/>}
        </section>
        <section className="bd-cmts" aria-labelledby={"bd-cmts-"+p.id}>
          <SectionHead id={"bd-cmts-"+p.id} title={cc>0?`댓글 ${cc}`:"댓글"}/>
          {(p.comments||[]).map(c=>(<div className="pn bd-cmt" key={c.id}>
            <div className="bd-cmt-top"><b className="t12">{c.nick}</b><span className="t12 dim num">{fmtDT(c.createdAt)}</span><Edited at={c.editedAt}/><button className="bd-act t12" onClick={()=>editComment(p,c)}>수정</button><button className="bd-act t12" onClick={()=>delComment(p,c)}>삭제</button></div><div className="read bd-cmt-body">{c.body}{c.link&&<MediaEmbed url={c.link}/>}</div>
          </div>))}
          <CommentForm onSubmit={(c)=>addComment(p,c)}/>
        </section>
      </article>
      {editing&&<EditSheet {...editing} onClose={()=>setEditing(null)} onSave={saveEdit}/>}
    </section>);
  }

  return (<section className="bd">
    <h1 className="t32">게시판</h1>
    {tabs}
    <p className="t12 dim reg bd-desc">{kind==="sample"?"포켓몬 한 마리의 세팅과 운용법을 나누는 곳입니다. 팀 빌더에서 바로 올리고 가져갈 수 있습니다.":"파티 전체를 소개하는 곳입니다. 마음에 드는 파티는 내 팀 빌더로 바로 가져갈 수 있습니다."}</p>
    <div className="bd-tools stack"><ListSearch q={q} setQ={setQ} placeholder="제목, 포켓몬, 글쓴이" count={list.length}/><Button variant="main" icon="plus" onClick={()=>setPicking(true)}>{label} 올리기</Button></div>
    {loadError&&<ErrorNote onRetry={reload}>{loadError}</ErrorNote>}
    {!posts&&!loadError?<Loader/>:<div className="stack bd-list swap">
      {list.length===0&&(kw
        ? <Empty title="검색 결과가 없습니다." desc={`‘${kw}’에 맞는 ${FORMAT_LABEL[format]} ${label} 글을 찾지 못했습니다.`}/>
        : <Empty title={`아직 ${FORMAT_LABEL[format]} ${label} 글이 없습니다.`} desc={`팀 빌더에서 팀을 만들고 ‘게시판에 올리기’를 누르면 첫 ${FORMAT_LABEL[format]} ${label} 글이 됩니다.`}/>)}
      {shown.map(post=>{ const cc=(post.comments||[]).length;
        const by=[post.nick,kind==="party"?REGULATIONS[post.team?.regulationId]?.shortName:post.names?.[0],cc>0&&`댓글 ${cc}`].filter(Boolean).join(", ");
        // 기록의 파티 줄과 같은 꼴: 제목과 회색 줄, 그리고 그림(파티는 여섯, 샘플은 한 마리를 앞에)
        return <button type="button" className={"pn bd-post"+(kind==="sample"?" one":"")} key={post.id} onClick={()=>openPost(post.id)} aria-label={`${post.title}, ${by}`}>
          <span className="bd-post-top"><b className="t15" data-vt={"s-"+post.id}>{post.title}</b><span className="t12 dim">{by}</span></span>
          <span className="bd-minis" aria-hidden="true">{(post.team?.members||[]).map((m,i)=><span className="stand bd-mini" key={i}><i className="floor"/><Mon src={spriteUrl(m.pokemonName)}/></span>)}</span>
        </button>; })}
    </div>}
    <div className="bd-pager"><Pager page={cur} pages={pages} onGo={setPage}/></div>
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
  const tabs=<div className="bd-tabs"><TabsLine value={tab} onChange={changeTab} label="게시판 종류" options={BOARD_TABS}/>
    {tab!=="free"&&<div className="bd-format"><Chips value={format} onChange={changeFormat} label="배틀 형식" options={FORMAT_TABS}/></div>}</div>;
  return tab==="free"?<FreeBoard {...props} tabs={tabs}/>:<ShowcaseBoard key={tab} kind={tab} format={format} setFormat={changeFormat} {...props} tabs={tabs}/>;
}

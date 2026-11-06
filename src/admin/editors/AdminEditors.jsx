import Icon from "../../components/common/Icon.jsx";
import React, { useEffect, useState } from "react";
import { normTeam as normalizeLegacyParty } from "../../services/legacyPartyImages.js";
import { Dropdown, Modal, Segmented, siteAlert } from "../../components/index.js";
import { CUP_RULES, REGULATIONS } from "../../data/index.js";
import { getApplicationEventTypeLabel } from "../../services/bracketTeamParticipants.js";
import { announcementEventType, changeAnnouncementEventType, normalizedAnnouncementDivision } from "../../services/leagueIntake.js";
import { listAvailableChampionshipEditions } from "../../services/normalizedCompetitionService.js";
import { CHAMPIONSHIP_FINAL_FORMAT, CHAMPIONSHIP_QUALIFIER_FORMAT } from "../../services/championsCore.js";
import { isAutoCheckedTitle } from "../../services/titleAwards.js";
import { loadHallOfFameArtworkLookup, resolveHallOfFameArtwork } from "../../services/hallOfFamePresentation.js";
import { loadRecordsPokemonDirectory } from "../../services/recordsPokemon.js";
import { copyEventRules, eventNameBase, eventSubtitleOf, formatEventName, isEventLinked } from "../../services/eventName.js";
import { formatDate } from "../../services/dateFormat.js";
import { missingAnnouncementTimes } from "../../services/announcementTimes.js";
import { signInAdmin } from "../../storage.js";
import Button from "../../components/common/Button.jsx";
import Field, { FormError } from "../../components/common/Field.jsx";
import { Cell } from "../../components/common/Board.jsx";
import PickerSheet from "../../components/common/PickerSheet.jsx";

const uid = () => Math.random().toString(36).slice(2, 9);

export function LoginModal({ onClose, onSuccess }) {
  const [id,setId]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy) return;
    setBusy(true); setErr("");
    try{ await signInAdmin(id,pw); onSuccess(); }
    catch(error){ setErr(error?.message||"로그인하지 못했습니다. 아이디와 비밀번호를 확인해 주세요."); setBusy(false); }
  };
  return (<Modal title="관리자 로그인" hint="운영진 전용입니다. 관리자 계정으로 로그인해 주세요." onClose={onClose}>
    <Field label="아이디"><input autoComplete="username" autoCapitalize="none" value={id} onChange={e=>setId(e.target.value)}/></Field>
    <Field label="비밀번호" error={err}><input type="password" autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
    <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit} loading={busy}>로그인</Button></div>
  </Modal>);
}
export function ChampionEditor({ item, onClose, onSave, onDelete, normTeam = normalizeLegacyParty }) {
  const [gen,setGen]=useState(item?.gen||""),[season,setSeason]=useState(item?.season||""),[name,setName]=useState(item?.name||""),[slabel,setSlabel]=useState(item?.slabel||"");
  const [mons,setMons]=useState(()=>{ const t=normTeam(item?.team); const a=[]; for(let i=0;i<6;i++)a.push(t[i]||{name:"",img:""}); return a; });
  const [artwork,setArtwork]=useState(null);
  useEffect(()=>{ loadHallOfFameArtworkLookup().then(setArtwork,()=>setArtwork(new Map())); },[]);
  // the names the pictures are found by, offered as the operator types (the browser's own list): a name is picked, not guessed
  const [monNames,setMonNames]=useState([]);
  useEffect(()=>{ loadRecordsPokemonDirectory().then(d=>setMonNames([...new Set([...d.values()].map(r=>r.displayName).filter(Boolean))]),()=>{}); },[]);
  const setMon=(i,patch)=>setMons(ms=>ms.map((m,j)=>j===i?{...m,...patch}:m));
  const submit=()=>{ if(!name.trim()){siteAlert("챔피언 이름을 입력해 주세요.");return;}
    // site_data는 방문할 때마다 통째로 내려받으므로 base64 이미지는 저장하지 않는다. 그림은 이름으로 찾는다.
    const team=mons.filter(m=>m.name.trim()).map(m=>({name:m.name.trim(),img:m.img&&!m.img.startsWith("data:")?m.img:""}));
    onSave({id:item?.id||uid(),gen:gen.trim(),season:parseInt(season)||0,slabel:slabel.trim()||undefined,name:name.trim(),team}); };
  return (<Modal title={item?"챔피언 수정":"챔피언 추가"} onClose={onClose}>
    <div className="bk-grow2">
      <Field label="대수"><input value={gen} onChange={e=>setGen(e.target.value)} placeholder="예: 6대"/></Field>
      <Field label="시즌 번호"><input value={season} onChange={e=>setSeason(e.target.value)} placeholder="예: 6"/></Field>
    </div>
    <Field label="챔피언 이름"><input value={name} onChange={e=>setName(e.target.value)}/></Field>
    <Field label="시즌 라벨 (선택)"><input value={slabel} onChange={e=>setSlabel(e.target.value)} placeholder="예: YPL 시즌 2"/></Field>
    <div className="field"><span className="field-label">우승 엔트리</span>
      <div className="ch-grid">{mons.map((m,i)=>{ const img=resolveHallOfFameArtwork(m,artwork)||m.img; return (<div className="ch-slot" key={i}>
        <div className="ch-imgwrap">
          <div className="ch-img">{img?<img src={img} alt="" loading="lazy" decoding="async"/>:<span className="ch-plus">{m.name.trim()?"이미지 없음":""}</span>}</div>
        </div>
        <input className="ch-name" value={m.name} onChange={e=>setMon(i,{name:e.target.value,img:""})} list="ch-mon-names" placeholder="포켓몬 이름" aria-label={`${i+1}번째 포켓몬`}/>
      </div>); })}</div>
      <datalist id="ch-mon-names">{monNames.map(n=><option key={n} value={n}/>)}</datalist>
      <div className="bk-hint">이름을 입력하면 맞는 포켓몬이 아래에 나오고, 고르면 그림이 바로 표시됩니다.</div>
    </div>
    <div className="modal-actions">{onDelete&&<Button variant="second" onClick={onDelete}>삭제</Button>}<Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit}>저장</Button></div>
  </Modal>);
}

/* 해당자를 고른다: 이름을 치면 아는 이름(기록의 트레이너, 파트너는 포켓몬)이 아래에 나오고, Enter나 추가로 칩이 된다.
   칩의 ×로 뺀다. 저장되는 모양(이름 배열)은 그대로다. */
function HolderPicker({ id, names, value, onChange, placeholder }) {
  const [draft,setDraft]=useState("");
  const add=()=>{ const n=draft.trim(); if(n&&!value.includes(n)) onChange([...value,n]); setDraft(""); };
  return (<div className="holder-pick">
    {value.length>0&&<div className="chips holder-chips">{value.map(n=><button type="button" key={n} className="pn" onClick={()=>onChange(value.filter(x=>x!==n))} aria-label={`${n} 빼기`}>{n}<Icon n="x" size={16}/></button>)}</div>}
    <div className="holder-add">
      <input id={id} value={draft} list={`${id}-names`} placeholder={placeholder} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } }}/>
      <Button variant="second" size="sm" onClick={add} disabled={!draft.trim()}>추가</Button>
    </div>
    <datalist id={`${id}-names`}>{names.filter(n=>!value.includes(n)).map(n=><option key={n} value={n}/>)}</datalist>
  </div>);
}

export function TitleItemEditor({ groupKey, item, data, onClose, onSave, onDelete }) {
  const partner=groupKey==="partner";
  const [name,setName]=useState(item?.name||""),[desc,setDesc]=useState(item?.desc||""),[holders,setHolders]=useState(item?.holders||[]);
  // 고를 이름: 파트너는 포켓몬 이름, 그 밖은 기록의 트레이너(이미 칭호를 받은 이름과 챔피언을 먼저, 기록을 읽으면 더한다)
  const [names,setNames]=useState(()=>partner?[]:[...new Set([...(data?.titleGroups||[]).flatMap(g=>g.key==="partner"?[]:(g.items||[]).flatMap(t=>t.holders||[])),...(data?.champions||[]).map(c=>c.name)].filter(Boolean))]);
  useEffect(()=>{
    let on=true;
    const more=list=>on&&setNames(cur=>[...new Set([...cur,...list.filter(Boolean)])]);
    if(partner){ loadRecordsPokemonDirectory().then(d=>more([...d.values()].map(r=>r.displayName)),()=>{}); return ()=>{ on=false; }; }
    (async()=>{ try{
      const [{freshRead},normalized,projection]=await Promise.all([import("../../services/readCache.js"),import("../../services/normalizedRecordsService.js"),import("../../services/normalizedRecordsProjection.js")]);
      if(!normalized.normalizedRecordsReadEnabled()) return;
      const raw=await freshRead("records",normalized.fetchNormalizedRecordsSnapshot,60*1000);
      more((projection.buildNormalizedRecordsProjection(data,raw,null).trainers||[]).map(t=>t.name));
    }catch{ /* 고를 이름이 적을 뿐, 직접 칠 수 있다 */ } })();
    return ()=>{ on=false; };
  },[]);
  const submit=()=>onSave({id:item?.id||uid(),name:name.trim(),desc:desc.trim()||undefined,holders});
  return (<Modal title={item?"칭호 수정":"칭호 추가"} hint={partner?"이름에는 트레이너를, 아래에는 파트너 포켓몬을 고릅니다.":"해당자를 이름으로 골라 더합니다."} onClose={onClose}>
    <Field label={partner?"트레이너":"칭호 이름"}><input value={name} onChange={e=>setName(e.target.value)}/></Field>
    {!partner&&<Field label="설명 (선택)"><input value={desc} onChange={e=>setDesc(e.target.value)}/></Field>}
    <div className="field"><label htmlFor="title-holder">{partner?"파트너 포켓몬":"해당자"}</label>
      <HolderPicker id="title-holder" names={names} value={holders} onChange={setHolders} placeholder={partner?"예: 한카리아스":"예: 정두호"}/></div>
    {isAutoCheckedTitle(groupKey,name.trim())&&<div className="bk-hint fb-reveal">기록 반영 때 조건을 자동으로 확인하는 칭호입니다.</div>}
    <div className="modal-actions">{onDelete&&<Button variant="second" onClick={onDelete}>삭제</Button>}<Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit}>저장</Button></div>
  </Modal>);
}
const Q_TYPES=[
  {value:"short",label:"단답형"},
  {value:"long",label:"장문형"},
  {value:"single",label:"객관식 (한 개 선택)"},
  {value:"multi",label:"체크박스 (여러 개 선택)"},
  {value:"dropdown",label:"드롭다운"},
];
const isChoice=(t)=>t==="single"||t==="multi"||t==="dropdown";
function FormBuilder({ form, setForm, earlier = [] }){
  const [pickEarlier,setPickEarlier]=useState(false);
  const enabled=!!(form&&form.enabled);
  const fields=(form&&form.fields)||[];
  const patchForm=(p)=>setForm({buttonLabel:"참가 신청",fields:[],responses:[],...(form||{}),...p});
  const setFields=(next)=>patchForm({fields:next});
  const addField=()=>setFields([...fields,{id:uid(),type:"short",label:"",required:false,options:[]}]);
  const patch=(id,p)=>setFields(fields.map(f=>f.id===id?{...f,...p}:f));
  const del=(id)=>setFields(fields.filter(f=>f.id!==id));
  const move=(i,d)=>{ const j=i+d; if(j<0||j>=fields.length)return; const a=[...fields]; [a[i],a[j]]=[a[j],a[i]]; setFields(a); };
  const changeType=(f,v)=>patch(f.id,{type:v,options:isChoice(v)?((f.options&&f.options.length)?f.options:["선택지 1"]):[]});
  const eventDraft=form?.eventDraft||{};
  const eventTypeValue=announcementEventType(eventDraft);
  const legacyLightEvent=eventTypeValue==="light";
  const eventTypeOptions=[
    ...(legacyLightEvent?[{value:"light",label:`${getApplicationEventTypeLabel("light")} (기존)`,disabled:true}]:[]),
    {value:"pokecup",label:getApplicationEventTypeLabel("pokecup")},
    {value:"general",label:"일반 대회"},
    {value:"champions",label:getApplicationEventTypeLabel("champions")},
  ];
  const isChampions=eventTypeValue==="champions";
  const isGeneral=eventTypeValue==="general";
  const [editions,setEditions]=useState([]),[editionError,setEditionError]=useState(""),[editionBusy,setEditionBusy]=useState(false);
  const battleFormat=eventDraft.battleFormat||"";
  useEffect(()=>{
    let cancelled=false;
    setEditions([]);setEditionError("");setEditionBusy(false);
    if(!enabled||!isChampions||form?.eventId||!battleFormat)return;
    setEditionBusy(true);
    listAvailableChampionshipEditions(battleFormat).then(rows=>{if(!cancelled)setEditions(rows);})
      .catch(error=>{if(!cancelled)setEditionError(error.message);})
      .finally(()=>{if(!cancelled)setEditionBusy(false);});
    return ()=>{cancelled=true;};
  },[enabled,isChampions,form?.eventId,battleFormat]);
  const isTeamEvent=!isChampions&&Boolean(eventDraft.isTeamEvent);
  const divisionValue=normalizedAnnouncementDivision(form);
  const divisionOptions=isTeamEvent?[divisionValue]:isGeneral?["other"]:["both","light"];
  const competitionOptions=[{value:"double_elimination",label:"더블 엘리미네이션"},{value:"single_elimination",label:"싱글 엘리미네이션"},...(divisionValue==="both"?[]:[{value:"round_robin",label:"리그전"}])];
  const hasLegacyDivision=!divisionOptions.includes(divisionValue);
  const divisionDropdownOptions=[
    ...(hasLegacyDivision?[{value:"__legacy__",label:divisionValue==="master"?"기존 마스터 단독 접수":divisionValue==="rookie"?"기존 루키 단독 접수":"기존 미분류",disabled:true}]:[]),
    ...divisionOptions.map(value=>({value,label:value==="both"?"루키와 마스터 동시 접수":value==="light"?"파이컵 라이트":"마스터 리그"})),
  ];
  // 대회 이름은 조립된다(services/eventName.js). 운영진은 부제만 쓰고, 완성될 이름을 여기서 미리 본다.
  const eventLinked=isEventLinked(form);
  const nameFields={eventType:eventTypeValue,division:isChampions||divisionValue==="both"?null:divisionValue,isTeamEvent,battleFormat};
  const subtitleValue=eventDraft.subtitle??eventSubtitleOf(eventDraft.name,nameFields);
  const draftRound=Number((String(eventDraft.name||"").match(/^(\d+)회/)||[])[1])||null;
  const chosenRound=form?.eventId?draftRound:editions.find(ed=>ed.id===eventDraft.competitionEditionId)?.round_number;
  const roundKnown=Boolean(chosenRound);
  const nameBase=eventNameBase(nameFields);
  const namePreview=(nameBase&&!roundKnown?"N회 ":"")+formatEventName({...nameFields,round:roundKnown?chosenRound:null,subtitle:subtitleValue});
  return (<div className="fb-wrap">
    <button type="button" className="pn row switch-row fb-switch" role="switch" aria-checked={enabled} onClick={()=>patchForm({enabled:!enabled})}>
      <span className="row-main"><b className="t15">대회 신청 받기</b><span className="t12 dim">사이트에서 바로 신청받습니다.</span></span>
      <span className={"sw" + (enabled ? " on" : "")} aria-hidden="true"><i /></span>
    </button>
    {enabled&&<>
      <Field label="신청 버튼 문구" hint="버튼의 말은 짧은 명사로, 마침표 없이 적습니다. 예: 참가 신청"><input value={(form&&form.buttonLabel)||""} onChange={e=>patchForm({buttonLabel:e.target.value})} placeholder="참가 신청"/></Field>
      <Field label="신청 마감 시각" hint="이 시각이 지나면 신청 버튼이 닫히고, 홈의 신청 접수 중 램프가 꺼집니다."><input type="datetime-local" value={form?.closesAt||""} onChange={e=>patchForm({closesAt:e.target.value})}/></Field>
      <div className="fb-q">
        <div className="fb-q-top fb-section-head"><span className="t12 dim">대회 설정</span>{earlier.length>0&&!form?.eventId&&<Button variant="link" onClick={()=>setPickEarlier(true)}>지난 대회에서 불러오기</Button>}</div>
        {pickEarlier&&<PickerSheet title="지난 대회에서 불러오기" placeholder="공지 제목 검색" items={earlier.map(a=>({value:a.id,label:a.title||"(제목 없음)",sub:[formatDate(a.date),a.form?.eventDraft?.name].filter(Boolean).join(", "),search:String(a.title||"").toLowerCase().replace(/\s+/g,"")}))}
          onPick={id=>{ const from=earlier.find(a=>a.id===id); if(from) setForm(copyEventRules(from,form)); }} onClose={()=>setPickEarlier(false)}/>}
        <div className="fb-note" style={{marginBottom:"var(--s3)"}}>참가자 이름은 신청 화면에서 따로 입력받습니다. 아래 설정은 이 신청서와 연결된 대회의 공통 규칙입니다.</div>
        <label className="bk-check" style={{marginBottom:"var(--s3)"}}><input type="checkbox" checked={eventLinked} onChange={e=>patchForm({eventDraft:{...eventDraft,linked:e.target.checked}})} disabled={Boolean(form?.eventId)}/><span>이 신청서를 대회와 연결</span></label>
        {eventLinked&&<>
        <div className="field"><span className="field-label">{nameBase?"부제":"대회 이름"} {nameBase&&<span className="fb-note">(선택)</span>}</span><input value={subtitleValue} onChange={e=>patchForm({eventDraft:{...eventDraft,subtitle:e.target.value}})} placeholder={nameBase?"예: 리전 워즈":"예: 배틀부 세미나 미니대회 1조"}/><div className="fb-note">대회 이름은 {namePreview||"(이름 없음)"}{nameBase&&!roundKnown?". 회차는 저장할 때 자동으로 매겨집니다.":"."}</div></div>
        <div className="cells fb-cells">
        <Cell label="대회 종류"><Dropdown value={eventTypeValue} disabled={legacyLightEvent||Boolean(form?.leagueIntakeId)} ariaLabel="대회 종류" onChange={eventType=>patchForm({eventDraft:changeAnnouncementEventType(eventDraft,eventType)})} options={eventTypeOptions}/></Cell>
        <Cell label="접수 구분">{isChampions||isTeamEvent||isGeneral?<span>{isChampions?"해당 없음":isGeneral?"일반 대회":divisionValue==="light"?"기존 라이트 팀전":"마스터"}</span>:<Dropdown value={hasLegacyDivision?"__legacy__":divisionValue} disabled={Boolean(form?.leagueIntakeId)} ariaLabel="접수 구분" onChange={value=>patchForm({eventDraft:{...eventDraft,subtitle:subtitleValue,division:value}})} options={divisionDropdownOptions}/>}</Cell>
        <Cell label="참가 단위"><Dropdown value={isTeamEvent?"team":"individual"} disabled={isChampions||isGeneral||Boolean(form?.eventId)} ariaLabel="참가 단위" onChange={value=>{const nextTeam=value==="team";patchForm({eventDraft:{...eventDraft,isTeamEvent:nextTeam,division:nextTeam?"master":"both"}});}} options={[{value:"individual",label:`개인전${isChampions||isGeneral?" (고정)":""}`},{value:"team",label:"팀전"}]}/></Cell>
        <Cell label="배틀 형식"><Dropdown value={(form?.eventDraft?.battleFormat)||""} placeholder="선택" ariaLabel="배틀 형식" onChange={value=>patchForm({eventDraft:{...(form?.eventDraft||{}),battleFormat:value||null,competitionEditionId:null}})} options={[{value:"singles",label:"싱글"},{value:"doubles",label:"더블"}]}/></Cell>
        {!isTeamEvent&&<Cell label="경기 진행"><Dropdown value={["site","random"].includes(eventDraft.matchPlay)?eventDraft.matchPlay:"champions"} ariaLabel="경기 진행" onChange={value=>patchForm({eventDraft:{...eventDraft,matchPlay:value}})} options={[{value:"champions",label:"포켓몬 챔피언스"},{value:"site",label:"사이트 배틀"},{value:"random",label:"랜덤 배틀"}]}/></Cell>}
        {isChampions&&!form?.eventId&&<Cell label="챔피언스 회차" wide><Dropdown value={eventDraft.competitionEditionId||"__new__"} disabled={!battleFormat||editionBusy} ariaLabel="챔피언스 회차" onChange={value=>patchForm({eventDraft:{...eventDraft,competitionEditionId:value==="__new__"?null:value}})} options={[{value:"__new__",label:"새 회차 생성"},...editions.map(ed=>({value:ed.id,label:`${ed.round_number}회에 ${battleFormat==="doubles"?"더블":"싱글"} 추가`}))]}/></Cell>}
        <Cell label="대진 방식" wide={isChampions}>{isChampions?<span>선발전 {CHAMPIONSHIP_QUALIFIER_FORMAT==="double_elimination"?"더블 엘리미네이션":""}, 본선 {CHAMPIONSHIP_FINAL_FORMAT==="single_elimination"?"싱글 엘리미네이션":""} (고정)</span>:<Dropdown value={(form?.eventDraft?.competitionFormat)||""} placeholder="선택" ariaLabel="대진 방식" onChange={value=>patchForm({eventDraft:{...(form?.eventDraft||{}),competitionFormat:value||null}})} options={competitionOptions}/>}</Cell>
        <Cell label="레귤레이션"><Dropdown value={(form?.eventDraft?.regulationId)||Object.keys(REGULATIONS)[0]||""} ariaLabel="레귤레이션" onChange={value=>patchForm({eventDraft:{...(form?.eventDraft||{}),regulationId:value}})} options={Object.values(REGULATIONS).map(reg=>({value:reg.id,label:reg.name}))}/></Cell>
        <Cell label="파이컵 추가 룰"><Dropdown value={(form?.eventDraft?.cupRuleId)||"none"} ariaLabel="파이컵 추가 룰" onChange={value=>patchForm({eventDraft:{...(form?.eventDraft||{}),cupRuleId:value}})} options={Object.values(CUP_RULES).map(rule=>({value:rule.id,label:rule.name}))}/></Cell>
        </div>
        {isGeneral&&<div className="fb-note">공식 회차와 랭킹에 포함하지 않는 일반 대회입니다.</div>}
        {isTeamEvent&&divisionValue!=="light"&&<div className="fb-note">팀전은 마스터로 진행합니다.</div>}
        {!isChampions&&!isTeamEvent&&divisionValue==="both"&&<div className="fb-note">개인 마스터 참가 또는 개인 루키나 라이트 우승 이력으로 리그를 배정합니다. 대진표 생성에서 리그를 선택합니다.</div>}
        {isChampions&&!form?.eventId&&<div className="fb-note">{battleFormat?"새 회차를 만들거나 기존 회차에 다른 종목을 추가합니다. 선발전과 본선은 같은 회차를 사용합니다.":"챔피언스 회차는 배틀 형식을 먼저 선택해 주세요."}</div>}
        {editionError&&<FormError>{editionError}</FormError>}
        {isChampions&&<div className="field"><span className="field-label">본선 정원</span><input type="number" min="2" value={form?.eventDraft?.finalCapacity||""} onChange={e=>patchForm({eventDraft:{...eventDraft,finalCapacity:e.target.value}})} placeholder="8" aria-label="8"/><div className="fb-note">선발전과 본선은 같은 챔피언스 회차로 진행합니다.</div></div>}
        <Field label={<>기록 표시 룰 <span className="fb-note">(선택, 자유 입력)</span></>}><input value={(form?.eventDraft?.recordRuleLabel)||""} onChange={e=>patchForm({eventDraft:{...(form?.eventDraft||{}),recordRuleLabel:e.target.value}})} placeholder="예: 모노타입 챌린지"/></Field>
        {!isChampions&&<div className="bk-grow2">
          <Field label={<>칭호 보상 <span className="fb-note">(선택)</span></>}><input value={eventDraft.titleAward?.name||""} onChange={e=>patchForm({eventDraft:{...eventDraft,titleAward:{scope:"champion",...(eventDraft.titleAward||{}),name:e.target.value}}})} placeholder="예: 초신성"/></Field>
          <Field label="칭호 부여 대상"><Dropdown value={eventDraft.titleAward?.scope||"champion"} disabled={!eventDraft.titleAward?.name?.trim()} ariaLabel="칭호 부여 대상" onChange={scope=>patchForm({eventDraft:{...eventDraft,titleAward:{...(eventDraft.titleAward||{}),scope}}})} options={[{value:"champion",label:"우승자"},{value:"top4",label:"4강 이상"}]}/></Field>
        </div>}
        {isChampions? <>
          <div className="bk-grow2">
            <Field label="선발전 날짜"><input type="date" value={eventDraft.qualifierHeldOn??eventDraft.heldOn??""} onChange={e=>patchForm({eventDraft:{...eventDraft,qualifierHeldOn:e.target.value}})}/></Field>
            <Field label="본선 날짜"><input type="date" value={eventDraft.finalHeldOn||""} onChange={e=>patchForm({eventDraft:{...eventDraft,finalHeldOn:e.target.value}})}/></Field>
          </div>
          <div className="bk-grow2" style={{marginBottom:0}}>
            <Field label="선발전 시작 시각"><input type="time" value={eventDraft.qualifierStartTime||""} onChange={e=>patchForm({eventDraft:{...eventDraft,qualifierStartTime:e.target.value}})}/></Field>
            <Field label="본선 시작 시각"><input type="time" value={eventDraft.finalStartTime||""} onChange={e=>patchForm({eventDraft:{...eventDraft,finalStartTime:e.target.value}})}/></Field>
          </div>
        </> : <>
          <div className="bk-grow2" style={{marginBottom:0}}>
            <Field label="대회일"><input type="date" value={(form?.eventDraft?.heldOn)||""} onChange={e=>patchForm({eventDraft:{...(form?.eventDraft||{}),heldOn:e.target.value}})}/></Field>
            <Field label="시작 시각"><input type="time" value={(form?.eventDraft?.startTime)||""} onChange={e=>patchForm({eventDraft:{...(form?.eventDraft||{}),startTime:e.target.value}})}/></Field>
          </div>
        </>}
        </>}
      </div>
      {fields.some(f=>f.public)&&<div className="field fb-reveal"><label htmlFor="fb-public-title">공개 목록 제목</label><input id="fb-public-title" value={(form&&form.publicTitle)||""} onChange={e=>patchForm({publicTitle:e.target.value})} placeholder="예: 현재까지 밴 리스트" aria-label="예: 현재까지 밴 리스트"/></div>}
      {fields.map((f,i)=>(<div className="fb-q" key={f.id}>
        <div className="fb-q-top">
          <span className="fb-qn">{i+1}</span>
          <Dropdown value={f.type} onChange={v=>changeType(f,v)} options={Q_TYPES}/>
          <div className="fb-q-move">
            <button type="button" className="fb-ic" onClick={()=>move(i,-1)} disabled={i===0} title="위로"><Icon n="up" size={16}/></button>
            <button type="button" className="fb-ic" onClick={()=>move(i,1)} disabled={i===fields.length-1} title="아래로"><Icon n="down" size={16}/></button>
            <button type="button" className="fb-ic del" onClick={()=>del(f.id)} title="질문 삭제"><Icon n="x" size={16}/></button>
          </div>
        </div>
        <input className="fb-label" value={f.label} onChange={e=>patch(f.id,{label:e.target.value})} placeholder={`질문 ${i+1} (예: 참가자 이름)`} aria-label={`질문 ${i+1} (예: 참가자 이름)`}/>
        {isChoice(f.type)&&<div className="fb-opts">
          {(f.options||[]).map((op,oi)=>(<div className="fb-opt" key={oi}>
            <span className={"fb-dot "+f.type} aria-hidden="true">{f.type==="dropdown"?oi+1:null}</span>
            <input value={op} onChange={e=>patch(f.id,{options:f.options.map((x,k)=>k===oi?e.target.value:x)})} placeholder={`선택지 ${oi+1}`} aria-label={`선택지 ${oi+1}`}/>
            <button type="button" className="fb-ic del" onClick={()=>patch(f.id,{options:f.options.filter((_,k)=>k!==oi)})} disabled={(f.options||[]).length<=1} title="선택지 삭제"><Icon n="x" size={16}/></button>
          </div>))}
          <button type="button" className="fb-addopt" onClick={()=>patch(f.id,{options:[...(f.options||[]),""]})}>선택지 추가</button>
        </div>}
        <div className="fb-q-foot">
          <label className="fb-req"><input type="checkbox" checked={!!f.required} onChange={e=>patch(f.id,{required:e.target.checked})}/> 필수 응답</label>
          <label className="fb-req"><input type="checkbox" checked={!!f.public} onChange={e=>patch(f.id,{public:e.target.checked})}/> 답변 공개 <span className="fb-note">(모두에게 실시간 표시)</span></label>
        </div>
      </div>))}
      <button type="button" className="fb-addq" onClick={addField}>질문 추가</button>
    </>}
  </div>);
}
export function AnnEditor({ item, onClose, onSave, onDelete, earlier = [] }) {
  const [announcementId]=useState(()=>item?.id||uid());
  const [date,setDate]=useState(item?.date||new Date().toISOString().slice(0,10)),[title,setTitle]=useState(item?.title||""),[body,setBody]=useState(item?.body||""),[pinned,setPinned]=useState(item?.pinned||false),[link,setLink]=useState(item?.link||""),[linkLabel,setLinkLabel]=useState(item?.linkLabel||""),[link2,setLink2]=useState(item?.link2||""),[link2Label,setLink2Label]=useState(item?.link2Label||"");
  const [form,setForm]=useState(item?.form||{enabled:false,buttonLabel:"참가 신청",fields:[],responses:[]});
  const [linkOpen,setLinkOpen]=useState(!!(item?.link||item?.link2)); // 이미 링크가 있으면 펼친 상태로 시작
  const championsDraft=form?.eventDraft?.eventType==="champions";
  const normalizedEventDraft=form?.enabled?{...(form.eventDraft||{}),eventType:form?.eventDraft?.eventType||"pokecup",division:normalizedAnnouncementDivision(form),isTeamEvent:championsDraft?false:Boolean(form?.eventDraft?.isTeamEvent),battleFormat:form?.eventDraft?.battleFormat||null,competitionFormat:championsDraft?null:(form?.eventDraft?.competitionFormat||null),regulationId:form?.eventDraft?.regulationId||Object.keys(REGULATIONS)[0]||null,cupRuleId:form?.eventDraft?.cupRuleId||"none"}:form?.eventDraft;
  if(form?.enabled&&normalizedEventDraft) normalizedEventDraft.subtitle=normalizedEventDraft.subtitle??eventSubtitleOf(normalizedEventDraft.name,{eventType:normalizedEventDraft.eventType,division:normalizedEventDraft.division==="both"?null:normalizedEventDraft.division,isTeamEvent:normalizedEventDraft.isTeamEvent,battleFormat:normalizedEventDraft.battleFormat});
  return (<Modal title={item?"공지 수정":"공지 작성"} onClose={onClose}>
    <Field label="날짜"><input value={date} onChange={e=>setDate(e.target.value)} placeholder="2024-05-26"/></Field>
    <Field label="제목"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field>
    <Field label="내용"><textarea value={body} onChange={e=>setBody(e.target.value)} style={{minHeight:"calc(var(--s21) + var(--s13))"}}/></Field>
    <FormBuilder form={form} setForm={setForm} earlier={earlier.filter(a=>a.id!==item?.id&&a.form?.enabled&&a.form?.eventDraft)}/>
    <div className={"fold"+(linkOpen?" open":"")}>
      <button type="button" className="fold-head" onClick={()=>setLinkOpen(v=>!v)}>
        <span className="fold-title">링크 첨부 <span className="fold-note">(구글폼 등 외부 링크, 선택)</span></span>
        {(link||link2)&&!linkOpen&&<span className="fold-badge">{[link,link2].filter(Boolean).length}</span>}
        <span className="fold-chev" aria-hidden="true"><Icon n="chev" size={16}/></span>
      </button>
      {linkOpen&&<div className="fold-body">
        <Field label="링크 1 (선택)" hint="누르면 새 탭으로 이동합니다."><input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://forms.gle/..."/></Field>
        <Field label="링크 1 버튼 문구 (선택)" hint="버튼의 말은 짧은 명사로, 마침표 없이 적습니다. 예: 참가 신청"><input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="참가 신청"/></Field>
        <Field label="링크 2 (선택)"><input value={link2} onChange={e=>setLink2(e.target.value)} placeholder="https://..."/></Field>
        <Field label="링크 2 버튼 문구 (선택)" flush><input value={link2Label} onChange={e=>setLink2Label(e.target.value)} placeholder="랜덤 파트너 추첨"/></Field>
      </div>}
    </div>
    <div className="field"><input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)} id="pin"/><label htmlFor="pin" style={{margin:0}}>상단 고정</label></div>
    <div className="modal-actions">{onDelete&&<Button variant="second" onClick={onDelete}>삭제</Button>}<Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={()=>{ const missing=missingAnnouncementTimes(form); if(missing.length){ siteAlert(`${missing.join(", ")}을 입력해 주세요.`,"신청을 받는 공지는 신청이 언제 닫히고 대회가 몇 시에 시작하는지 알려야 합니다. 홈의 전광판이 이 시각으로 마감과 시작을 셉니다."); return; } onSave({id:announcementId,date,title:title.trim()||"(제목 없음)",body,pinned,link:link.trim(),linkLabel:linkLabel.trim(),link2:link2.trim(),link2Label:link2Label.trim(),form:{...form,eventDraft:normalizedEventDraft}}); }}>저장</Button></div>
  </Modal>);
}
export function StandingsEditor({ title, rows, onClose, onSave }) {
  const [list,setList]=useState(rows.map(r=>({...r})));
  const upd=(i,k,v)=>setList(list.map((r,j)=>j===i?{...r,[k]:v}:r));
  const del=(i)=>setList(list.filter((_,j)=>j!==i));
  const add=()=>setList([...list,{name:"",win:0,ru:0,top4:0,points:0}]);
  const submit=()=>onSave(list.filter(r=>r.name&&r.name.trim()).map(r=>({name:r.name.trim(),win:+r.win||0,ru:+r.ru||0,top4:+r.top4||0,points:+r.points||0,...(r.note?{note:r.note}:{})})));
  return (<Modal title={`${title} 수정`} hint="이름과 성적을 입력해 주세요. 표시는 포인트 순으로 자동 정렬됩니다." onClose={onClose}>
    <div className="ed-grid ed-head"><span>트레이너</span><span>우승</span><span>준우승</span><span>4강</span><span>포인트</span><span/></div>
    <div className="ed-scroll">{list.map((r,i)=>(<div className="ed-grid" key={i}>
      <input value={r.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="이름" aria-label="이름"/>
      <input type="number" aria-label="우승" value={r.win} onChange={e=>upd(i,"win",e.target.value)}/>
      <input type="number" aria-label="준우승" value={r.ru} onChange={e=>upd(i,"ru",e.target.value)}/>
      <input type="number" aria-label="4강" value={r.top4} onChange={e=>upd(i,"top4",e.target.value)}/>
      <input type="number" aria-label="포인트" value={r.points} onChange={e=>upd(i,"points",e.target.value)}/>
      <button className="ed-del" onClick={()=>del(i)} title="삭제"><Icon n="x" size={16}/></button>
    </div>))}</div>
    <Button variant="second" size="sm" style={{marginTop:"var(--s3)"}} onClick={add}>트레이너 추가</Button>
    <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit}>저장</Button></div>
  </Modal>);
}
export function RoundsEditor({ title, rounds, onClose, onSave, seasons }) {
  const splitL=(s)=>String(s||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  const dkey=(d)=>{const m=String(d||"").match(/\d+/g)||[];return (+(m[0]||0))*1e8+(+(m[1]||0))*1e6+(+(m[2]||0))*1e4;};
  const rkey=(rd)=>{const n=parseInt(String(rd||""),10);return isNaN(n)?999999:n;};
  const sortRows=(arr)=>arr.map((r,i)=>({r,i})).sort((a,b)=>(dkey(a.r.date)-dkey(b.r.date))||(rkey(a.r.round)-rkey(b.r.round))||(a.i-b.i)).map(x=>x.r);
  const init=(r)=>({
    id:r.id||uid(), recordMeta:r.recordMeta||null,
    team:!!r.team, champ:!!r.champ, date:r.date||"", round:r.round||"", rule:r.rule||"", season:r.season||"",
    win:r.win||"", ru:r.ru||"",
    winM:(r.winMembers||[]).join(", "), ruM:(r.ruMembers||[]).join(", "),
    sfText:r.team?"":(r.sf||[]).join(", "),
    sfTeams:r.team?(r.sf||[]).map((nm,i)=>({name:nm,mem:((r.sfMembers||[])[i]||[]).join(", ")})):[],
  });
  const [list,setList]=useState(rounds.map(init));
  const [autoSort,setAutoSort]=useState(true);
  const upd=(i,k,v)=>setList(list.map((r,j)=>j===i?{...r,[k]:v}:r));
  const del=(i)=>setList(list.filter((_,j)=>j!==i));
  const add=()=>setList([...list,init({})]);
  const moveUp=(i)=>{if(i<=0)return;setAutoSort(false);setList(arr=>{const a=[...arr];[a[i-1],a[i]]=[a[i],a[i-1]];return a;});};
  const moveDown=(i)=>{setAutoSort(false);setList(arr=>{if(i>=arr.length-1)return arr;const a=[...arr];[a[i],a[i+1]]=[a[i+1],a[i]];return a;});};
  const sortNow=()=>{setAutoSort(true);setList(arr=>sortRows(arr));};
  const sfUpd=(i,k,key,v)=>setList(list.map((r,j)=>j!==i?r:{...r,sfTeams:r.sfTeams.map((t,m)=>m===k?{...t,[key]:v}:t)}));
  const sfAdd=(i)=>setList(list.map((r,j)=>j===i?{...r,sfTeams:[...r.sfTeams,{name:"",mem:""}]}:r));
  const sfDel=(i,k)=>setList(list.map((r,j)=>j===i?{...r,sfTeams:r.sfTeams.filter((_,m)=>m!==k)}:r));
  const submit=()=>{
    let out=list.filter(r=>r.team?(String(r.win).trim()||splitL(r.winM).length>0):String(r.win).trim()).map(r=>{
      const base={id:r.id||uid(),date:String(r.date).trim(),round:String(r.round).trim(),rule:String(r.rule).trim(),win:String(r.win).trim(),ru:String(r.ru).trim(),...(String(r.season).trim()?{season:String(r.season).trim()}:{}),...(r.recordMeta?{recordMeta:r.recordMeta}:{})};
      const champ=r.champ?{champ:true}:{};
      if(r.team){
        const sfT=r.sfTeams.filter(t=>String(t.name).trim()||splitL(t.mem).length>0);
        return {...base,...champ,team:true,winMembers:splitL(r.winM),ruMembers:splitL(r.ruM),sf:sfT.map(t=>t.name.trim()),sfMembers:sfT.map(t=>splitL(t.mem))};
      }
      return {...base,...champ,team:false,sf:splitL(r.sfText)};
    });
    if(autoSort) out=sortRows(out);
    onSave(out);
  };
  return (<Modal title={`${title} 회차 수정`} hint="개인전과 팀전, 일반과 챔피언스 시리즈를 고르고 결과를 입력해 주세요. 저장하면 날짜순으로 자동 정렬되며, 화살표 버튼으로 순서를 직접 바꿀 수도 있습니다." onClose={onClose}>
    <div className="pts-note" style={{marginBottom:"var(--s5)"}}>포인트 기준은 우승 <b>60</b>, 준우승 <b>40</b>, 4강 <b>20</b>점입니다. 팀전 여부, 팀원 수, 대회 사정에 따라 달라질 수 있으므로 누적 포인트는 랭킹 편집에서 직접 입력합니다.</div>
    <div style={{display:"flex",alignItems:"center",gap:"var(--s3)",flexWrap:"wrap",marginBottom:"var(--s5)"}}>
      <Button variant="second" size="sm" onClick={add}>회차 추가 (맨 아래)</Button>
      <Button variant="second" size="sm" onClick={sortNow}>날짜순 정렬</Button>
      <label className="ed-auto"><input type="checkbox" checked={autoSort} onChange={e=>setAutoSort(e.target.checked)}/> 저장 시 자동 날짜정렬</label>
    </div>
    <div className="ed-scroll">{list.map((r,i)=>(<div className="ed-round" key={i}>
      <div className="ed-rtop"><input className="ed-w" value={r.date} onChange={e=>upd(i,"date",e.target.value)} placeholder="날짜 (2025.06)" aria-label="날짜 (2025.06)"/><input className="ed-w" value={r.round} onChange={e=>upd(i,"round",e.target.value)} placeholder="회차" aria-label="회차"/><button className="ed-mv" onClick={()=>moveUp(i)} disabled={i===0} title="위로" aria-label="위로"><Icon n="up" size={16}/></button><button className="ed-mv" onClick={()=>moveDown(i)} disabled={i===list.length-1} title="아래로" aria-label="아래로"><Icon n="down" size={16}/></button><button className="ed-del" onClick={()=>del(i)} title="삭제"><Icon n="x" size={16}/></button></div>
      <div style={{display:"flex",gap:"var(--s2)",flexWrap:"wrap"}}>
        <Segmented value={!!r.team} onChange={v=>upd(i,"team",v)} ariaLabel="경기 방식" options={[[false,"개인전"],[true,"팀전"]]}/>
        <Segmented value={!!r.champ} onChange={v=>upd(i,"champ",v)} ariaLabel="형식" options={[[false,"일반"],[true,"챔피언스 시리즈"]]}/>
      </div>
      {!r.team?<>
        <div className="ed-r2"><input value={r.win} onChange={e=>upd(i,"win",e.target.value)} placeholder="우승" aria-label="우승"/><input value={r.ru} onChange={e=>upd(i,"ru",e.target.value)} placeholder="준우승" aria-label="준우승"/></div>
        <input value={r.sfText} onChange={e=>upd(i,"sfText",e.target.value)} placeholder="4강 (쉼표 구분)" aria-label="4강 (쉼표 구분)"/>
      </>:<>
        <div className="ed-team"><span className="ed-rk gold">우승 팀</span>
          <input value={r.win} onChange={e=>upd(i,"win",e.target.value)} placeholder="팀 이름 (선택)" aria-label="팀 이름 (선택)"/>
          <input value={r.winM} onChange={e=>upd(i,"winM",e.target.value)} placeholder="팀원 (쉼표 구분, 인원 제한 없음)" aria-label="팀원 (쉼표 구분, 인원 제한 없음)"/></div>
        <div className="ed-team"><span className="ed-rk">준우승 팀</span>
          <input value={r.ru} onChange={e=>upd(i,"ru",e.target.value)} placeholder="팀 이름 (선택)" aria-label="팀 이름 (선택)"/>
          <input value={r.ruM} onChange={e=>upd(i,"ruM",e.target.value)} placeholder="팀원 (쉼표 구분)" aria-label="팀원 (쉼표 구분)"/></div>
        {r.sfTeams.map((t,k)=>(<div className="ed-team" key={k}><span className="ed-rk">4강 팀 {k+1} <button className="ed-x" onClick={()=>sfDel(i,k)}><Icon n="x" size={16}/></button></span>
          <input value={t.name} onChange={e=>sfUpd(i,k,"name",e.target.value)} placeholder="팀 이름 (선택)" aria-label="팀 이름 (선택)"/>
          <input value={t.mem} onChange={e=>sfUpd(i,k,"mem",e.target.value)} placeholder="팀원 (쉼표 구분)" aria-label="팀원 (쉼표 구분)"/></div>))}
        <Button variant="second" size="sm" onClick={()=>sfAdd(i)} style={{alignSelf:"flex-start"}}>4강 팀 추가</Button>
      </>}
      <div className="ed-r2"><Dropdown value={r.season||""} onChange={v=>upd(i,"season",v)} options={[{value:"",label:"(시즌 미지정)"},...((seasons||[]).map(n=>({value:n,label:n}))),...((r.season&&!(seasons||[]).includes(r.season))?[{value:r.season,label:r.season+" (기존)"}]:[])]}/><input value={r.rule} onChange={e=>upd(i,"rule",e.target.value)} placeholder="룰 (예: 모노타입 / 6세대 63 팀전)" aria-label="룰 (예: 모노타입 / 6세대 63 팀전)"/></div>
    </div>))}</div>
    <div className="modal-actions"><Button variant="second" onClick={onClose}>취소</Button><Button variant="main" icon="check" onClick={submit}>저장</Button></div>
  </Modal>);
}

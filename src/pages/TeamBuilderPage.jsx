import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Dropdown, Icon, Loader, Modal, PageHead, Reveal, STAGGER, Segmented, celebrate, centerOf, siteAlert, siteConfirm } from "../components/index.js";
import PickerSheet, { PickField } from "../components/common/PickerSheet.jsx";
import { saveTeamSheetImage } from "../components/teamSheetImage.js";
import { ShowcaseCompose } from "./BoardPage.jsx";
import { EASE_OUT, reduced } from "../components/common/motion.js";
import { CUP_RULES, DEFAULT_REGULATION_ID, KO, REGULATIONS, TYPE_OPTIONS, resolveRegulationId } from "../data/index.js";
import { championsData, findSubmissionRegistration, getEvent, getSubmissionWriteGate, submitEventTeamSnapshot } from "../services/index.js";
import {
  ALIGNMENTS,
  DRAFT_SAVE_DELAY_MS,
  DRAFT_SCHEMA_VERSION,
  DRAFT_STORAGE_KEY,
  STAT_KEYS,
  STAT_LABELS,
  TEAM_SCHEMA_VERSION,
  TEAM_STORAGE_KEY,
  TYPE_KO,
  alignmentDisplay,
  alignmentFor,
  abilityName,
  bilingualName,
  buildTeamSheet,
  INCOMING_TEAM_KEY,
  calculatedStat,
  dexRecord,
  itemDisplay,
  itemName,
  learnsetFor,
  localizedPokemonName,
  makeMember,
  makeUid,
  BUILDER_SORTS,
  builderSearchSuggestions,
  builderSearchVocabulary,
  builderSortValue,
  matchesBuilderSearch,
  parseBuilderSearch,
  memberFromSaved,
  CATEGORY_KO,
  moveEnglishName,
  moveMetadata,
  moveName,
  normalizeDraft,
  normalizeSavedTeam,
  membersRemovedByRuleChange,
  pokemonMatchesCupRule,
  pokemonPoolForRegulation,
  replaceMemberPokemon,
  requiredItemForPokemon,
  formatSavedDate,
  serializeMembers,
  speciesIdentity,
  spriteUrl,
  onSpriteError,
  validateSubmissionEligibility,
  validateTeam,
  resolveEventRuleSelection,
} from "../services/teamBuilderCore.js";


function readInitialRuleState() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("eventId") || "";
  const regulationId = resolveRegulationId(params.get("reg"));
  const requestedCup = params.get("cup") || "none";
  const cupRuleId = CUP_RULES[requestedCup] ? requestedCup : "none";
  const requestedType = params.get("type") || "";
  const assignedTypeId = CUP_RULES[cupRuleId]?.kind === "monotype" && TYPE_OPTIONS.some(type => type.id === requestedType) ? requestedType : "";
  return { eventId, regulationId, cupRuleId, assignedTypeId };
}

function syncRuleUrl(regulationId, cupRuleId, assignedTypeId) {
  const url = new URL(window.location.href);
  url.searchParams.set("reg", regulationId);
  if (cupRuleId && cupRuleId !== "none") url.searchParams.set("cup", cupRuleId);
  else url.searchParams.delete("cup");
  const cupRule = CUP_RULES[cupRuleId] || CUP_RULES.none;
  if (cupRule.kind === "monotype" && assignedTypeId) url.searchParams.set("type", assignedTypeId);
  else url.searchParams.delete("type");
  window.history.replaceState({}, "", url);
}

function readSavedTeams() {
  try {
    const raw = localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedTeam).filter(Boolean).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch (error) {
    console.warn("[YPL] 저장된 팀을 읽지 못했습니다.", error);
    return null;
  }
}

function writeSavedTeams(teams) {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
    return true;
  } catch (error) {
    console.error("[YPL] 팀 저장 실패", error);
    return false;
  }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? normalizeDraft(JSON.parse(raw), REGULATIONS) : null;
  } catch (error) {
    console.warn("[YPL] 임시저장 데이터를 읽지 못했습니다.", error);
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) { /* noop */ }
    return null;
  }
}

const SEARCH_KIND_LABEL = { type: "타입", move: "기술", ability: "특성" };
const MOVE_CATEGORY_OPTIONS = [
  { value: "", label: "모든 분류" },
  { value: "Physical", label: "물리" },
  { value: "Special", label: "특수" },
  { value: "Status", label: "변화" },
];

function TypeBadges({ types = [] }) {
  return <div className="tb-types">{types.map(type => <span key={type} className={`tb-type type-${championsData.toID(type)}`}>{TYPE_KO[type] || type}</span>)}</div>;
}

/* Showdown 목록처럼 행마다 여섯 종족값과 합계. 한국 커뮤니티의 HABCDS 표기, 정렬 중인 값은 굵고 밝게. */
const STAT_LETTERS = { hp: "H", atk: "A", def: "B", spa: "C", spd: "D", spe: "S", bst: "합" };
function BaseStatStrip({ stats, sortId }) {
  if (!stats) return null;
  const values = { ...stats, bst: STAT_KEYS.reduce((sum, key) => sum + (stats[key] || 0), 0) };
  return (
    <span className="tb-base-strip" aria-label={`종족값 ${STAT_KEYS.map(key => `${STAT_LABELS[key]} ${stats[key]}`).join(", ")}, 합계 ${values.bst}`}>
      {Object.keys(STAT_LETTERS).map(key => <span key={key} className={sortId === key ? "on" : ""} aria-hidden="true"><i>{STAT_LETTERS[key]}</i>{values[key]}</span>)}
    </span>
  );
}

/* 목록은 편집과 따로 그린다. 359행(화면 요소 약 9천 개)을 능력 포인트나 기술이 바뀔 때마다 다시 그리면
   슬라이더 한 칸에 100ms가 걸렸다. 목록이 받는 값은 팀의 종 구성이 바뀔 때만 새로 만들어진다. */
const PoolList = memo(function PoolList({ pool, detailData, displayPokemon, sortId, occupancy, selectedUid, onAdd }) {
  return (
    <div className="tb-pokemon-list">
      {pool.map(pokemon => {
        const details = dexRecord(detailData, pokemon);
        const sameSpeciesMember = occupancy.get(speciesIdentity(detailData, pokemon));
        const already = Boolean(sameSpeciesMember);
        const canReplaceSelected = sameSpeciesMember?.uid === selectedUid && sameSpeciesMember.name !== pokemon.name;
        return (
          <button key={pokemon.name} className="tb-pokemon-row" onClick={() => onAdd(pokemon)} disabled={already && !canReplaceSelected}>
            <img src={spriteUrl(pokemon.name)} alt="" loading="lazy" decoding="async" onError={onSpriteError()} />
            <span className="tb-pokemon-copy"><strong>{displayPokemon(pokemon)}</strong><small>{displayPokemon(pokemon) !== pokemon.name ? pokemon.name : ""}{details?.num ? `${displayPokemon(pokemon) !== pokemon.name ? " " : ""}#${String(details.num).padStart(4, "0")}` : ""}</small></span>
            <TypeBadges types={details?.types || []} />
            <BaseStatStrip stats={details?.baseStats} sortId={sortId} />
            <span className="tb-add-mark">
              <Icon n={canReplaceSelected ? "refresh" : already ? "check" : "plus"} size={16} />
            </span>
          </button>
        );
      })}
      {!pool.length && <div className="tb-pool-empty">검색 결과가 없습니다.</div>}
    </div>
  );
});

function TeamSlot({ index, member, active, displayName, itemLabel, onSelect, onRemove }) {
  if (!member) {
    return (
      <div className="tb-slot empty">
        <span className="tb-slot-no">{index + 1}</span>
        <div className="tb-slot-empty">포켓몬을 추가하세요.</div>
      </div>
    );
  }
  const moveCount = member.moves.filter(Boolean).length;
  const unresolved = member.resolutionState === "unresolved";
  return (
    <button type="button" className={"tb-slot" + (active ? " active" : "") + (unresolved ? " unresolved" : "")} onClick={onSelect}>
      <span className="tb-slot-no">{index + 1}</span>
      <img src={spriteUrl(member.pokemon.name)} alt="" className="tb-slot-sprite" onError={onSpriteError()} />
      <span className="tb-slot-copy">
        <strong>{displayName}</strong>
        <small>{unresolved ? "현재 규칙에서 확인할 수 없는 포켓몬" : `${itemLabel || "도구 없음"}, 기술 ${moveCount}/4`}</small>
      </span>
      <span
        role="button"
        tabIndex={0}
        className="tb-slot-remove"
        aria-label={`${displayName} 제거`}
        onClick={event => { event.stopPropagation(); onRemove(); }}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); event.stopPropagation(); onRemove();
          }
        }}
      ><Icon n="x" size={13} /></span>
    </button>
  );
}

function ValidationPanel({ result, regulationName, cupRuleSummary, teamLength, configuredSpecialRule }) {
  let title;
  let message;
  let icon;
  if (result.status === "invalid") {
    title = "규정 위반";
    message = `${result.errors.length}개의 규정 위반을 확인했습니다.`;
    icon = <Icon n="x" size={15} />;
  } else if (result.status === "valid") {
    title = "검증 통과";
    message = `${regulationName}, ${cupRuleSummary} 기준으로 포켓몬 구성과 세팅이 최종 검증을 통과했습니다.`;
    icon = <Icon n="check" size={15} />;
  } else {
    title = teamLength || configuredSpecialRule ? "미완성" : "팀을 구성해 주세요.";
    message = teamLength || configuredSpecialRule
      ? "규정 위반은 확인되지 않았지만 최종 검증에 필요한 룰 설정 또는 팀 세팅이 아직 완료되지 않았습니다."
      : "포켓몬을 선택하고 각 포켓몬의 세팅을 완료해 주세요.";
    icon = <Icon n="alert" size={15} />;
  }

  const messages = [
    ...result.errors.map(messageText => ({ type: "error", message: messageText })),
    ...result.incomplete.map(messageText => ({ type: "incomplete", message: messageText })),
    ...result.warnings.map(messageText => ({ type: "warning", message: messageText })),
  ];

  return (
    <div className={`tb-validation ${result.status}`}>
      <div className="tb-validation-head">
        <span className="tb-validation-icon">{icon}</span>
        <div><strong>{title}</strong><span>{message}</span></div>
      </div>
      {messages.length > 0 && <ul>{messages.slice(0, 8).map(({ type, message: detail }, index) => <li className={type} key={`${type}-${detail}-${index}`}>{detail}</li>)}</ul>}
      {messages.length > 8 && <div className="tb-more">외 {messages.length - 8}개</div>}
    </div>
  );
}

function OfficialSubmissionPanel({
  eventId,
  eventContext,
  eventContextStatus,
  eventContextError,
  regulationName,
  cupRuleSummary,
  registrationName,
  onRegistrationNameChange,
  onLookup,
  lookupBusy,
  lookupError,
  registration,
  eligibility,
  submissionBusy,
  submissionError,
  onSubmit,
}) {
  if (!eventId) return null;
  const eventGate = eventContext ? getSubmissionWriteGate(eventContext) : null;
  const state = eventContextError || eventContextStatus === "error"
    ? "invalid"
    : !eventContext || eventContextStatus !== "ready"
      ? "incomplete"
      : eventGate && !eventGate.allowed
        ? "invalid"
      : !registration
        ? "incomplete"
        : eligibility?.eligible ? "valid" : "invalid";
  const title = state === "valid"
    ? "제출 준비 완료"
    : state === "invalid"
      ? "제출 불가"
      : !registration ? "신청자 확인 필요" : "대회 확인 필요";
  const icon = <Icon n={state === "valid" ? "check" : state === "invalid" ? "x" : "alert"} size={15} />;
  const messages = [
    ...(eventContextError ? [eventContextError] : []),
    ...(eventGate && !eventGate.allowed && !eligibility?.errors?.includes(eventGate.error) ? [eventGate.error] : []),
    ...(lookupError ? [lookupError] : []),
    ...(eligibility?.errors || []),
    ...(eligibility?.warnings || []),
    ...(submissionError ? [submissionError] : []),
  ];
  const latestSubmission = registration?.latestSubmission || null;
  const submittedAt = latestSubmission?.submitted_at || latestSubmission?.submittedAt || null;
  const formatSubmissionTime = value => value ? new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "";
  return (
    <div className={`tb-validation official-submission ${state}`}>
      <div className="tb-validation-head">
        <span className="tb-validation-icon">{icon}</span>
        <div>
          <strong>{eventContext?.name || "공식 파티 제출 준비"}</strong>
          <span>{title}{registration ? ` (${registration.registration.registration_name})` : ""}</span>
        </div>
      </div>
      {eventContext && <div className="tb-official-meta">
        <span>{regulationName || eventContext.regulation_id || "레귤레이션 확인 필요"}</span>
        <span>{cupRuleSummary || eventContext.cup_rule_id || "추가 룰 없음"}</span>
        {eventContext.submission_target_at && <span>권장 제출 시각 {new Date(eventContext.submission_target_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</span>}
      </div>}
      <div className="tb-official-lookup">
        <input
          className="tb-input"
          value={registrationName}
          onChange={event => onRegistrationNameChange(event.target.value)}
          placeholder="신청자 본인의 이름을 입력하세요."
          aria-label="신청자 이름"
          autoComplete="name"
          disabled={lookupBusy}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLookup} disabled={lookupBusy || !registrationName.trim()}>{lookupBusy ? "확인 중…" : "신청자 확인"}</button>
      </div>
      {messages.length > 0 && <ul>{messages.slice(0, 8).map((message, index) => <li className={eligibility?.errors?.includes(message) || lookupError === message || eventContextError === message || submissionError === message ? "error" : "incomplete"} key={`${message}-${index}`}>{message}</li>)}</ul>}
      {state === "valid" && <div className="tb-official-submit">
        <button type="button" className="btn tb-main-btn" onClick={onSubmit} disabled={submissionBusy}>
          {submissionBusy ? "제출 중…" : latestSubmission ? "다시 제출하기" : "파티 제출하기"}
        </button>
        {submittedAt && <span className="tb-field-meta">제출 완료 시각 {formatSubmissionTime(submittedAt)}</span>}
      </div>}
    </div>
  );
}

export default function TeamBuilderPage({ go, flash } = {}) {
  const initialRuleStateRef = useRef(null);
  if (!initialRuleStateRef.current) initialRuleStateRef.current = readInitialRuleState();
  const initialEventId = initialRuleStateRef.current.eventId;
  const [eventId] = useState(initialEventId);
  const [regulationId, setRegulationId] = useState(initialRuleStateRef.current.regulationId);
  const [cupRuleId, setCupRuleId] = useState(initialRuleStateRef.current.cupRuleId);
  const [assignedTypeId, setAssignedTypeId] = useState(initialRuleStateRef.current.assignedTypeId);
  const [team, setTeam] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [query, setQuery] = useState("");
  const [searchChips, setSearchChips] = useState([]);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortId, setSortId] = useState("name");
  const [sortReversed, setSortReversed] = useState(false);
  const [moveTypeFilter, setMoveTypeFilter] = useState("");
  const [moveCategoryFilter, setMoveCategoryFilter] = useState("");
  const [detailData, setDetailData] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [koreanNames, setKoreanNames] = useState(new Map());
  const [localizationStatus, setLocalizationStatus] = useState("loading");
  const [savedTeams, setSavedTeams] = useState([]);
  const [activeSavedTeamId, setActiveSavedTeamId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState("idle");
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [pendingRuleChange, setPendingRuleChange] = useState(null);
  const [pendingTeamChange, setPendingTeamChange] = useState(null);
  const [eventContext, setEventContext] = useState(null);
  const [eventContextStatus, setEventContextStatus] = useState(initialEventId ? "loading" : "idle");
  const [eventContextError, setEventContextError] = useState("");
  const [registrationName, setRegistrationName] = useState("");
  const [registration, setRegistration] = useState(null);
  const [registrationLookupError, setRegistrationLookupError] = useState("");
  const [registrationLookupBusy, setRegistrationLookupBusy] = useState(false);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [shareTeam, setShareTeam] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  /* N5: 폰에서는 같은 상태를 규정, 포켓몬 선택, 팀 구성의 세 단계로 나눠 보여 준다. 데스크톱은 한 화면. */
  const [step, setStep] = useState("pool");
  const stepsRef = useRef(null);
  const changeStep = useCallback(next => {
    flushSync(() => setStep(next));
    const bar = stepsRef.current;
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: "start" });
    if (!reduced()) document.querySelectorAll(`.tb-page [data-tb-step="${next}"]`).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: i * 40, easing: EASE_OUT, fill: "backwards" }));
  }, []);
  const draftTimerRef = useRef(null);
  const restoringDraftRef = useRef(false);
  const unrestoredDraftExistsRef = useRef(false);

  const regulation = REGULATIONS[regulationId] || REGULATIONS[DEFAULT_REGULATION_ID];
  const cupRule = CUP_RULES[cupRuleId] || CUP_RULES.none;
  const selectedType = TYPE_OPTIONS.find(type => type.id === assignedTypeId) || null;
  const selectedMember = team.find(member => member.uid === selectedUid) || null;
  const selectedDetails = dexRecord(detailData, selectedMember?.pokemon);
  const legalItems = useMemo(() => detailData ? championsData.legalItems(detailData, regulationId) : [], [detailData, regulationId]);
  const selectablePokemonPool = useMemo(
    () => pokemonPoolForRegulation(regulation, detailData, legalItems),
    [regulation, detailData, legalItems],
  );
  const selectedRequiredItem = requiredItemForPokemon(detailData, selectedMember?.pokemon);

  const displayPokemon = useCallback(pokemon => localizedPokemonName(pokemon, koreanNames), [koreanNames]);
  const markDirty = useCallback(() => {
    unrestoredDraftExistsRef.current = false;
    setDirty(true);
  }, []);

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setEventContextStatus("loading");
    setEventContextError("");
    getEvent(eventId).then(event => {
      if (cancelled) return;
      if (!event) throw new Error("연결된 대회를 찾을 수 없습니다.");
      setEventContext(event);
      setEventContextStatus("ready");
    }).catch(error => {
      if (cancelled) return;
      setEventContext(null);
      setEventContextStatus("error");
      setEventContextError(error?.message || "대회 정보를 불러오지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    try {
      const probe = "__ypl-team-builder-storage-probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      setStorageAvailable(true);
    } catch (error) {
      console.warn("[YPL] 브라우저 저장소를 사용할 수 없습니다.", error);
      setStorageAvailable(false);
    }

    const loadedTeams = readSavedTeams();
    const existing = loadedTeams || [];
    if (loadedTeams === null) setStorageAvailable(false);
    setSavedTeams(existing);
    const draft = readDraft();
    if (draft) {
      const requestedParams = new URLSearchParams(window.location.search);
      const requestedReg = requestedParams.get("reg");
      const requestedCup = requestedParams.get("cup");
      const requestedType = requestedParams.get("type");
      const conflictsWithExplicitLink = (requestedReg && requestedReg !== draft.regulationId)
        || (requestedCup && requestedCup !== draft.cupRuleId)
        || (requestedType && requestedType !== draft.cupRuleSettings.assignedType);

      if (conflictsWithExplicitLink) {
        unrestoredDraftExistsRef.current = true;
      } else {
        const reg = REGULATIONS[draft.regulationId];
        restoringDraftRef.current = true;
        try {
          const restored = draft.members.map(member => memberFromSaved(member, reg));
          setRegulationId(draft.regulationId);
          setCupRuleId(draft.cupRuleId);
          setAssignedTypeId(draft.cupRuleSettings.assignedType || "");
          setTeam(restored);
          const selected = restored[Math.min(draft.selectedIndex, Math.max(0, restored.length - 1))];
          setSelectedUid(selected?.uid || restored[0]?.uid || null);
          setActiveSavedTeamId(existing.some(teamItem => teamItem.id === draft.activeSavedTeamId) ? draft.activeSavedTeamId : null);
          setDirty(draft.dirty || (!draft.activeSavedTeamId && restored.length > 0));
          setDraftStatus("saved");
          setDraftSavedAt(draft.savedAt || null);
          unrestoredDraftExistsRef.current = false;
          syncRuleUrl(draft.regulationId, draft.cupRuleId, draft.cupRuleSettings.assignedType || "");
        } finally {
          restoringDraftRef.current = false;
        }
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!detailData) return;
    setTeam(current => current.map(member => {
      if (member.resolutionState === "unresolved") {
        const savedMember = serializeMembers([member])[0];
        const restored = memberFromSaved(savedMember, regulation, { detailData });
        if (restored.resolutionState === "resolved") return { ...restored, uid: member.uid };
      }
      const details = dexRecord(detailData, member.pokemon);
      const requiredItem = requiredItemForPokemon(detailData, member.pokemon);
      const ability = member.ability && details?.abilities?.includes(member.ability)
        ? member.ability
        : details?.abilities?.[0] || member.ability;
      const item = requiredItem || member.item;
      return ability !== member.ability || item !== member.item ? { ...member, ability, item } : member;
    }));
  }, [detailData, regulation]);

  useEffect(() => {
    let cancelled = false;
    setDetailStatus("loading");
    championsData.load().then(data => {
      if (cancelled) return;
      setDetailData(data);
      setDetailStatus("ready");
      setTeam(current => current.map(member => {
        if (member.ability) return member;
        const details = dexRecord(data, member.pokemon);
        return details?.abilities?.length ? { ...member, ability: details.abilities[0] } : member;
      }));
    }).catch(error => {
      console.error("Champions detail data unavailable:", error);
      if (!cancelled) setDetailStatus("error");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    championsData.loadSpeciesNames().then(names => {
      if (cancelled) return;
      setKoreanNames(names.koreanByEnglish);
      setLocalizationStatus("ready");
    }).catch(error => {
      console.warn("Korean species names unavailable:", error);
      if (!cancelled) setLocalizationStatus("error");
    });
    return () => { cancelled = true; };
  }, []);

  const makeDraftSnapshot = useCallback(() => ({
    schemaVersion: DRAFT_SCHEMA_VERSION,
    regulationId,
    cupRuleId,
    cupRuleSettings: { assignedType: cupRule.kind === "monotype" ? assignedTypeId : "" },
    activeSavedTeamId: activeSavedTeamId || null,
    dirty: Boolean(dirty),
    selectedIndex: Math.max(0, team.findIndex(member => member.uid === selectedUid)),
    savedAt: new Date().toISOString(),
    members: serializeMembers(team, { detailData }),
  }), [regulationId, cupRuleId, cupRule.kind, assignedTypeId, activeSavedTeamId, dirty, team, selectedUid, detailData]);

  const persistDraftNow = useCallback(() => {
    if (!hydrated || !storageAvailable || restoringDraftRef.current) return false;
    if (unrestoredDraftExistsRef.current && !dirty && !team.length && !activeSavedTeamId) return false;
    try {
      if (!team.length && !activeSavedTeamId && !dirty) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setDraftStatus("idle");
        setDraftSavedAt(null);
        return true;
      }
      const snapshot = makeDraftSnapshot();
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
      setDraftStatus("saved");
      setDraftSavedAt(snapshot.savedAt);
      setStorageAvailable(true);
      return true;
    } catch (error) {
      console.error("[YPL] 임시저장 실패", error);
      setDraftStatus("error");
      setStorageAvailable(false);
      return false;
    }
  }, [hydrated, storageAvailable, team.length, activeSavedTeamId, dirty, makeDraftSnapshot]);

  useEffect(() => {
    if (!hydrated || !storageAvailable || restoringDraftRef.current) return undefined;
    if (unrestoredDraftExistsRef.current && !dirty && !team.length && !activeSavedTeamId) return undefined;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftStatus("pending");
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      persistDraftNow();
    }, DRAFT_SAVE_DELAY_MS);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [hydrated, regulationId, cupRuleId, assignedTypeId, team, selectedUid, activeSavedTeamId, dirty, persistDraftNow]);

  useEffect(() => {
    const flush = () => persistDraftNow();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistDraftNow]);

  useEffect(() => {
    if (!hydrated) return;
    syncRuleUrl(regulationId, cupRuleId, cupRule.kind === "monotype" ? assignedTypeId : "");
  }, [hydrated, regulationId, cupRuleId, cupRule.kind, assignedTypeId]);

  const currentSaved = savedTeams.find(saved => saved.id === activeSavedTeamId) || null;

  const validation = useMemo(() => validateTeam({
    team,
    regulation,
    regulationId,
    cupRuleId,
    assignedTypeId,
    detailData,
    detailStatus,
    legalItems,
    displayPokemon,
  }), [team, regulation, regulationId, cupRuleId, assignedTypeId, detailData, detailStatus, legalItems, displayPokemon]);

  const submissionEligibility = useMemo(() => {
    if (!eventId || !registration || eventContextError || !eventContext) return null;
    const gate = getSubmissionWriteGate(eventContext);
    if (!gate.allowed) {
      return { eligible: false, errors: [gate.error], warnings: [] };
    }
    const eligibility = validateSubmissionEligibility({
      team,
      regulation,
      regulationId,
      cupRuleId,
      assignedTypeId,
      detailData,
      detailStatus,
      legalItems,
      displayPokemon,
    });
    return gate.warning
      ? { ...eligibility, warnings: [...eligibility.warnings, gate.warning] }
      : eligibility;
  }, [eventId, registration, eventContext, eventContextError, team, regulation, regulationId, cupRuleId, assignedTypeId, detailData, detailStatus, legalItems, displayPokemon]);

  const lookupSubmissionRegistration = useCallback(async () => {
    if (!eventId || !registrationName.trim()) return;
    setRegistrationLookupBusy(true);
    setRegistrationLookupError("");
    setSubmissionError("");
    setRegistration(null);
    try {
      const result = await findSubmissionRegistration(eventId, registrationName);
      if (!result) {
        setRegistrationLookupError("해당 이름의 참가 신청을 찾을 수 없습니다.");
      } else {
        setRegistration(result);
      }
    } catch (error) {
      setRegistrationLookupError(error?.code === "YPL_AMBIGUOUS_REGISTRATION"
        ? "동일한 이름의 신청자가 있어 자동으로 확인할 수 없습니다. 운영진에게 문의해 주세요."
        : error?.message || "신청 정보를 확인하지 못했습니다.");
    } finally {
      setRegistrationLookupBusy(false);
    }
  }, [eventId, registrationName]);

  const submitCurrentTeam = useCallback(async () => {
    if (!eventContext || !registration || !submissionEligibility?.eligible || submissionBusy) return;
    setSubmissionBusy(true);
    setSubmissionError("");
    try {
      const saved = await submitEventTeamSnapshot({
        eventId,
        registrationId: registration.registration.id,
        registrationName,
        registrationSource: registration.registration.registration_source,
        eligibility: submissionEligibility,
        team,
        regulationId,
        cupRuleId,
        cupRuleSettings: { assignedType: cupRule.kind === "monotype" ? assignedTypeId : "" },
        detailData,
      });
      setRegistration(current => current ? { ...current, latestSubmission: {
        id: saved.submission_id,
        registration_id: registration.registration.id,
        snapshot_id: saved.snapshot_id,
        revision: saved.revision,
        submitted_at: saved.submittedAt,
        source: "team_builder",
      } } : current);
      // L5, P2: 제출이 저장된 순간 흰 빛이 한 번 퍼지고 안드로이드에서 짧게 진동한다
      requestAnimationFrame(() => celebrate?.(...centerOf(document.querySelector(".tb-official-submit") || document.querySelector(".tb-validation-wrap"))));
    } catch (error) {
      setSubmissionError(error?.message || "파티 제출을 저장하지 못했습니다.");
    } finally {
      setSubmissionBusy(false);
    }
  }, [eventContext, registration, submissionEligibility, submissionBusy, eventId, registrationName, team, regulationId, cupRuleId, cupRule.kind, assignedTypeId, detailData]);

  const eligiblePool = useMemo(() => {
    const base = selectablePokemonPool;
    if (cupRule.kind !== "monotype") return base;
    if (!assignedTypeId || !detailData) return [];
    return base.filter(pokemon => pokemonMatchesCupRule({ pokemon, cupRuleId, assignedTypeId, detailData }));
  }, [selectablePokemonPool, cupRule.kind, assignedTypeId, detailData, cupRuleId]);

  const searchVocabulary = useMemo(() => builderSearchVocabulary(detailData, eligiblePool), [detailData, eligiblePool]);
  const searchSuggestions = useMemo(() => builderSearchSuggestions(searchVocabulary, query, searchChips), [searchVocabulary, query, searchChips]);
  const showSuggestions = searchFocused && searchSuggestions.length > 0;
  // 입력한 글자는 바로 보이고, 359행 거르기와 다시 그리기는 그 뒤에 따라온다(React가 입력을 먼저 처리한다).
  const deferredQuery = useDeferredValue(query);
  const deferredChips = useDeferredValue(searchChips);
  const searchFilters = useMemo(() => [...deferredChips, ...parseBuilderSearch(detailData, deferredQuery)], [deferredChips, detailData, deferredQuery]);
  const filteredPool = useMemo(() => {
    const byName = (a, b) => displayPokemon(a).localeCompare(displayPokemon(b), "ko");
    const direction = sortReversed ? -1 : 1;
    const value = pokemon => builderSortValue(detailData, pokemon, sortId) ?? -1;
    return eligiblePool
      .filter(pokemon => matchesBuilderSearch(detailData, pokemon, displayPokemon(pokemon), searchFilters))
      .sort((a, b) => sortId === "name" ? byName(a, b) * direction : (value(b) - value(a)) * direction || byName(a, b));
  }, [eligiblePool, detailData, displayPokemon, searchFilters, sortId, sortReversed]);

  // 목록이 보는 팀은 종 구성(누가 어느 칸에 있는지)뿐이다. 능력 포인트, 기술, 도구가 바뀌어도 같은 값을 돌려준다.
  const occupancyKey = team.map(member => `${member.uid}:${member.pokemon?.name}`).join("|");
  const occupancy = useMemo(() => new Map(team.map(member => [speciesIdentity(detailData, member.pokemon), { uid: member.uid, name: member.pokemon?.name }])),
    [occupancyKey, detailData]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSearchChip = useCallback(entry => {
    if (!entry) return;
    setSearchChips(current => [...current, { kind: entry.kind, id: entry.id, label: entry.label }]);
    setQuery("");
    setSuggestIndex(0);
  }, []);

  const onSearchKeyDown = event => {
    if (event.nativeEvent.isComposing) return; // a Korean IME is still composing; its Enter only commits the syllable
    if (event.key === "ArrowDown" && showSuggestions) {
      event.preventDefault();
      setSuggestIndex(index => (index + 1) % searchSuggestions.length);
    } else if (event.key === "ArrowUp" && showSuggestions) {
      event.preventDefault();
      setSuggestIndex(index => (index - 1 + searchSuggestions.length) % searchSuggestions.length);
    } else if (event.key === "Enter" && showSuggestions) {
      event.preventDefault();
      addSearchChip(searchSuggestions[suggestIndex] || searchSuggestions[0]);
    } else if (event.key === "Escape") {
      setSearchFocused(false);
    } else if (event.key === "Backspace" && !query && searchChips.length) {
      setSearchChips(current => current.slice(0, -1));
    }
  };

  const updateMember = useCallback((uid, patch) => {
    setTeam(current => current.map(member => member.uid === uid ? { ...member, ...patch } : member));
    markDirty();
  }, [markDirty]);

  const updateStat = useCallback((member, key, value) => {
    const otherTotal = STAT_KEYS.filter(stat => stat !== key).reduce((sum, stat) => sum + Number(member.statPoints?.[stat] || 0), 0);
    const maxByTotal = Math.max(0, 66 - otherTotal);
    const next = Math.max(0, Math.min(32, maxByTotal, Number(value) || 0));
    updateMember(member.uid, { statPoints: { ...member.statPoints, [key]: next } });
  }, [updateMember]);

  const addPokemon = useCallback(pokemon => {
    if (!pokemonMatchesCupRule({ pokemon, cupRuleId, assignedTypeId, detailData })) return;
    const identity = speciesIdentity(detailData, pokemon);
    const sameSpeciesMember = team.find(member => speciesIdentity(detailData, member.pokemon) === identity);
    if (sameSpeciesMember) {
      if (sameSpeciesMember.uid !== selectedUid || sameSpeciesMember.pokemon.name === pokemon.name) return;
      const replacement = replaceMemberPokemon(sameSpeciesMember, pokemon, { detailData });
      setTeam(current => current.map(member => member.uid === sameSpeciesMember.uid ? replacement : member));
      markDirty();
      return;
    }
    if (team.length >= (regulation.maxTeamSize || 6)) return;
    const member = makeMember(pokemon, { detailData });
    const details = dexRecord(detailData, pokemon);
    if (details?.abilities?.length) member.ability = details.abilities[0];
    setTeam(current => [...current, member]);
    setSelectedUid(member.uid);
    markDirty();
  }, [team, regulation.maxTeamSize, detailData, cupRuleId, assignedTypeId, selectedUid, markDirty]);

  const addPokemonRef = useRef(addPokemon);
  addPokemonRef.current = addPokemon;
  const onAddPokemon = useCallback(pokemon => addPokemonRef.current(pokemon), []);

  const removeMember = useCallback(uid => {
    const index = team.findIndex(member => member.uid === uid);
    const next = team.filter(member => member.uid !== uid);
    setTeam(next);
    if (uid === selectedUid) setSelectedUid(next[index]?.uid || next[index - 1]?.uid || null);
    markDirty();
  }, [team, selectedUid, markDirty]);

  const applyRuleChange = useCallback(change => {
    const nextRegulation = REGULATIONS[change.regulationId] || regulation;
    const nextTeam = team.filter(member => !change.removedUids.includes(member.uid));
    setRegulationId(change.regulationId);
    setCupRuleId(change.cupRuleId);
    setAssignedTypeId(change.assignedTypeId);
    setTeam(nextTeam);
    if (!nextTeam.some(member => member.uid === selectedUid)) setSelectedUid(nextTeam[0]?.uid || null);
    setPendingRuleChange(null);
    markDirty();
    return nextRegulation;
  }, [regulation, team, selectedUid, markDirty]);

  const requestRuleChange = useCallback(change => {
    if (!change.removedMembers.length) {
      applyRuleChange({ ...change, removedUids: [] });
      return;
    }
    setPendingRuleChange({
      ...change,
      removedUids: change.removedMembers.map(member => member.uid),
    });
  }, [applyRuleChange]);

  const switchRegulation = useCallback(nextId => {
    const next = REGULATIONS[nextId];
    if (!next || nextId === regulationId) return;
    // Preserve the existing regulation-change semantics: only the new
    // regulation's Pokémon pool removes members. Cup legality remains the
    // validator's responsibility until its own rule is changed.
    const removedMembers = membersRemovedByRuleChange({ team, regulation: next, cupRuleId: "none", detailData });
    requestRuleChange({ regulationId: nextId, cupRuleId, assignedTypeId, removedMembers });
  }, [regulationId, team, cupRuleId, assignedTypeId, detailData, requestRuleChange]);

  const switchCupRule = useCallback(nextId => {
    if (!CUP_RULES[nextId] || nextId === cupRuleId) return;
    const nextAssignedTypeId = "";
    const nextRule = CUP_RULES[nextId];
    const removedMembers = membersRemovedByRuleChange({ team, regulation, cupRuleId: nextId, assignedTypeId: nextAssignedTypeId, detailData });
    requestRuleChange({ regulationId, cupRuleId: nextId, assignedTypeId: nextAssignedTypeId, removedMembers, ruleName: nextRule.name });
  }, [cupRuleId, team, regulation, regulationId, detailData, requestRuleChange]);

  const switchCupRuleType = useCallback(nextTypeId => {
    const next = TYPE_OPTIONS.some(type => type.id === nextTypeId) ? nextTypeId : "";
    if (next === assignedTypeId) return;
    const removedMembers = membersRemovedByRuleChange({ team, regulation, cupRuleId, assignedTypeId: next, detailData });
    requestRuleChange({ regulationId, cupRuleId, assignedTypeId: next, removedMembers, ruleName: CUP_RULES[cupRuleId]?.name });
  }, [assignedTypeId, team, regulation, cupRuleId, regulationId, detailData, requestRuleChange]);

  const eventRuleSelection = useMemo(() => {
    return resolveEventRuleSelection(eventContext);
  }, [eventContext]);

  useEffect(() => {
    if (!eventRuleSelection || eventRuleSelection.error) {
      if (eventRuleSelection?.error) setEventContextError(eventRuleSelection.error);
      return;
    }
    const { regulationId: nextRegulationId, cupRuleId: nextCupRuleId } = eventRuleSelection;
    const nextAssignedTypeId = CUP_RULES[nextCupRuleId].kind === "monotype"
      && TYPE_OPTIONS.some(type => type.id === assignedTypeId) ? assignedTypeId : "";
    if (regulationId === nextRegulationId && cupRuleId === nextCupRuleId && assignedTypeId === nextAssignedTypeId) return;
    const nextRegulation = REGULATIONS[nextRegulationId];
    const removedMembers = membersRemovedByRuleChange({
      team,
      regulation: nextRegulation,
      cupRuleId: nextCupRuleId,
      assignedTypeId: nextAssignedTypeId,
      detailData,
    });
    requestRuleChange({
      regulationId: nextRegulationId,
      cupRuleId: nextCupRuleId,
      assignedTypeId: nextAssignedTypeId,
      removedMembers,
      ruleName: CUP_RULES[nextCupRuleId].name,
    });
  }, [eventRuleSelection, regulationId, cupRuleId, assignedTypeId, team, detailData, requestRuleChange]);

  const resetTeam = useCallback(async () => {
    if (team.length && !(await siteConfirm({ title: "팀 초기화", body: "현재 팀 구성을 모두 초기화할까요?", confirmLabel: "초기화", danger: true }))) return;
    setTeam([]);
    setSelectedUid(null);
    setActiveSavedTeamId(null);
    setDirty(false);
    setSaveName("");
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) { /* noop */ }
    unrestoredDraftExistsRef.current = false;
    setDraftStatus("idle");
    setDraftSavedAt(null);
  }, [team.length]);

  const defaultTeamName = useCallback(() => {
    const base = cupRule.kind === "monotype" && selectedType
      ? `${regulation.shortName} ${selectedType.korean} 모노타입`
      : `${regulation.shortName} 팀`;
    const existingNames = new Set(savedTeams.map(saved => saved.name));
    if (!existingNames.has(base)) return base;
    let index = 2;
    while (existingNames.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  }, [cupRule.kind, selectedType, regulation.shortName, savedTeams]);

  const openLibrary = useCallback((focusSave = false) => {
    if (!storageAvailable) return;
    setSaveName(currentSaved?.name || defaultTeamName());
    setSaveMessage("");
    setLibraryOpen(true);
    if (focusSave) setTimeout(() => {
      const input = document.querySelector(".tb-team-name");
      input?.focus();
      input?.select?.();
    }, 20);
  }, [storageAvailable, currentSaved, defaultTeamName]);

  const saveWorkingTeam = useCallback(({ name, forceNew = false, allowEmpty = false } = {}) => {
    if (!storageAvailable) {
      setSaveMessage("이 브라우저에서는 로컬 저장소를 사용할 수 없습니다.");
      return null;
    }
    if (!allowEmpty && !team.length) {
      setSaveMessage("포켓몬을 1마리 이상 추가한 뒤 저장해 주세요.");
      return null;
    }
    const normalizedName = String(name || "").trim();
    if (!normalizedName) {
      setSaveMessage("팀 이름을 입력해 주세요.");
      setTimeout(() => document.querySelector(".tb-team-name")?.focus(), 0);
      return null;
    }
    const now = new Date().toISOString();
    const existing = forceNew ? null : savedTeams.find(saved => saved.id === activeSavedTeamId) || null;
    const snapshot = {
      schemaVersion: TEAM_SCHEMA_VERSION,
      id: existing?.id || makeUid("saved"),
      name: normalizedName.slice(0, 40),
      regulationId,
      cupRuleId,
      cupRuleSettings: { assignedType: cupRule.kind === "monotype" ? assignedTypeId : "" },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      members: serializeMembers(team, { detailData }),
    };
    const next = existing
      ? savedTeams.map(saved => saved.id === existing.id ? snapshot : saved)
      : [snapshot, ...savedTeams];
    next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (!writeSavedTeams(next)) {
      setStorageAvailable(false);
      setSaveMessage("팀을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.");
      return null;
    }
    setStorageAvailable(true);
    setSavedTeams(next);
    setActiveSavedTeamId(snapshot.id);
    setDirty(false);
    setSaveName(snapshot.name);
    return snapshot;
  }, [storageAvailable, saveName, savedTeams, activeSavedTeamId, regulationId, cupRuleId, cupRule.kind, assignedTypeId, team, detailData]);

  const saveCurrentTeam = useCallback(() => {
    const snapshot = saveWorkingTeam({ name: saveName });
    if (snapshot) setSaveMessage("저장되었습니다.");
  }, [saveName, saveWorkingTeam]);

  const applyTeamChange = useCallback(change => {
    if (change.kind === "new") {
      setTeam([]);
      setSelectedUid(null);
      setActiveSavedTeamId(null);
      setDirty(false);
      setSaveName("");
      setSaveMessage("");
      setLibraryOpen(false);
      return;
    }
    const saved = change.saved;
    const reg = REGULATIONS[saved.regulationId];
    if (!reg) {
      siteAlert("팀을 불러올 수 없습니다.", `저장된 레귤레이션(${saved.regulationId})을 현재 팀 빌더에서 찾을 수 없습니다.`);
      return;
    }
    const restored = saved.members.map(member => memberFromSaved(member, reg, { detailData }));
    const unresolvedCount = restored.filter(member => member.resolutionState === "unresolved").length;
    setRegulationId(saved.regulationId);
    setCupRuleId(CUP_RULES[saved.cupRuleId] ? saved.cupRuleId : "none");
    setAssignedTypeId(saved.cupRuleSettings?.assignedType || "");
    setTeam(restored);
    setSelectedUid(restored[0]?.uid || null);
    setActiveSavedTeamId(saved.id);
    setDirty(false);
    setSaveName(saved.name);
    setSaveMessage("");
    setLibraryOpen(false);
    if (unresolvedCount) siteAlert("일부 포켓몬을 확인할 수 없습니다.", `${unresolvedCount}마리는 현재 ${reg.shortName} 데이터에서 확인할 수 없습니다. 원본 데이터는 보존되며 복구 후 제출할 수 있습니다.`);
  }, [detailData]);

  const requestTeamChange = useCallback(change => {
    if (change.kind === "load" && change.saved.id === activeSavedTeamId) {
      setLibraryOpen(false);
      return;
    }
    if (dirty) {
      setPendingTeamChange(change);
      return;
    }
    applyTeamChange(change);
  }, [activeSavedTeamId, dirty, applyTeamChange]);

  const loadSavedTeam = useCallback(saved => {
    requestTeamChange({ kind: "load", saved });
  }, [requestTeamChange]);

  const startNewTeam = useCallback(() => {
    requestTeamChange({ kind: "new" });
  }, [requestTeamChange]);

  const continuePendingTeamChange = useCallback(() => {
    if (!pendingTeamChange) return;
    const name = currentSaved?.name || defaultTeamName();
    const snapshot = saveWorkingTeam({
      name,
      allowEmpty: true,
    });
    if (!snapshot) return;
    setPendingTeamChange(null);
    applyTeamChange(pendingTeamChange);
  }, [pendingTeamChange, currentSaved, defaultTeamName, saveWorkingTeam, applyTeamChange]);

  const duplicateCurrentTeam = useCallback(() => {
    if (!team.length) {
      setSaveMessage("복제할 포켓몬을 1마리 이상 추가해 주세요.");
      return;
    }
    const base = `${currentSaved?.name || defaultTeamName()} 복사본`;
    let name = base;
    let index = 2;
    const existingNames = new Set(savedTeams.map(saved => saved.name));
    while (existingNames.has(name)) name = `${base} ${index++}`;
    const snapshot = saveWorkingTeam({ name, forceNew: true });
    if (snapshot) setSaveMessage(`“${snapshot.name}”으로 복제했습니다.`);
  }, [team.length, currentSaved, defaultTeamName, savedTeams, saveWorkingTeam]);

  const duplicateSavedTeam = useCallback(saved => {
    const now = new Date().toISOString();
    const base = `${saved.name} 복사본`;
    let name = base;
    let index = 2;
    const existingNames = new Set(savedTeams.map(item => item.name));
    while (existingNames.has(name)) name = `${base} ${index++}`;
    const copy = {
      ...JSON.parse(JSON.stringify(saved)),
      id: makeUid("saved"),
      name: name.slice(0, 40),
      createdAt: now,
      updatedAt: now,
    };
    const next = [copy, ...savedTeams];
    if (!writeSavedTeams(next)) {
      setStorageAvailable(false);
      return;
    }
    setStorageAvailable(true);
    setSavedTeams(next);
  }, [savedTeams]);

  const deleteSavedTeam = useCallback(async saved => {
    if (!(await siteConfirm({ title: "팀 삭제", body: `“${saved.name}” 팀을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`, confirmLabel: "삭제", danger: true }))) return;
    const next = savedTeams.filter(item => item.id !== saved.id);
    if (!writeSavedTeams(next)) {
      setStorageAvailable(false);
      return;
    }
    setStorageAvailable(true);
    setSavedTeams(next);
    if (activeSavedTeamId === saved.id) {
      setActiveSavedTeamId(null);
      setDirty(team.length > 0);
    }
  }, [savedTeams, activeSavedTeamId, team.length]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape" && libraryOpen) setLibraryOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        openLibrary(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openLibrary, libraryOpen]);

  const usedItemsByOthers = useMemo(() => new Set(team.filter(member => member.uid !== selectedUid).map(member => member.item).filter(Boolean)), [team, selectedUid]);
  const learnset = useMemo(() => selectedMember ? learnsetFor(detailData, selectedMember.pokemon) : [], [detailData, selectedMember]);

  // 도구와 기술은 검색 시트에서 고른다. 다른 포켓몬이 든 도구는 이유와 함께 흐리게 남겨 둔다(같은 도구 중복 금지).
  const [picker, setPicker] = useState(null);
  useEffect(() => { setPicker(null); }, [selectedUid]);
  const itemPickItems = useMemo(() => [
    { value: "", label: "도구 없음", search: "도구없음none" },
    ...legalItems.map(item => {
      const korean = itemName(detailData, item.id);
      const taken = usedItemsByOthers.has(item.id) && item.id !== selectedMember?.item;
      return { value: item.id, label: korean, sub: taken ? "다른 포켓몬이 사용 중" : (item.name !== korean ? item.name : ""), search: `${korean}${item.name}`, disabled: taken };
    }).sort((a, b) => a.label.localeCompare(b.label, "ko")),
  ], [legalItems, usedItemsByOthers, selectedMember?.item, detailData]);

  const moveMatchesFilters = moveId => {
    const move = detailData?.moves?.[moveId];
    return (!moveTypeFilter || championsData.toID(move?.type) === moveTypeFilter) && (!moveCategoryFilter || move?.category === moveCategoryFilter);
  };
  useEffect(() => { setMoveTypeFilter(""); setMoveCategoryFilter(""); }, [selectedUid]);

  const movePickItems = slot => {
    if (!selectedMember || typeof slot !== "number") return [];
    const current = selectedMember.moves[slot] || "";
    const usedElsewhere = new Set(selectedMember.moves.filter((move, index) => move && index !== slot));
    return learnset.filter(id => id === current || (!usedElsewhere.has(id) && moveMatchesFilters(id))).map(id => {
      const move = detailData?.moves?.[id];
      const korean = moveName(detailData, id);
      return {
        value: id, label: korean,
        sub: `${TYPE_KO[move?.type] || move?.type || ""} ${CATEGORY_KO[move?.category] || ""}${move?.category !== "Status" && move?.basePower ? `, 위력 ${move.basePower}` : ""}`,
        trailing: move?.category === "Status" ? null : move?.basePower || null,
        search: `${korean}${moveEnglishName(detailData, id)}`,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "ko"));
  };
  const setMoveAt = (slot, moveId) => {
    const moves = [...selectedMember.moves];
    moves[slot] = moveId;
    updateMember(selectedMember.uid, { moves });
  };

  const currentCupRuleSummary = useMemo(() => {
    if (cupRule.kind === "none") return "추가 룰 없음";
    if (cupRule.kind === "monotype") return selectedType ? `${cupRule.name} (${selectedType.korean})` : `${cupRule.name} (타입 미선택)`;
    return cupRule.name;
  }, [cupRule, selectedType]);

  /* 게시판의 "팀 빌더에서 열기": 넘어온 팀을 내 팀에 새로 저장하고 연다. 바뀐 내용이 있으면 기존 확인창이 먼저 묻는다. */
  useEffect(() => {
    if (!hydrated) return;
    let incoming = null;
    try { incoming = JSON.parse(sessionStorage.getItem(INCOMING_TEAM_KEY) || "null"); sessionStorage.removeItem(INCOMING_TEAM_KEY); } catch (_) { /* 없음 */ }
    if (!incoming || !REGULATIONS[incoming.regulationId]) return;
    const now = new Date().toISOString();
    const saved = normalizeSavedTeam({ ...incoming, schemaVersion: TEAM_SCHEMA_VERSION, id: makeUid("saved"), createdAt: now, updatedAt: now });
    if (!saved) return;
    if (storageAvailable) {
      const next = [saved, ...savedTeams];
      if (writeSavedTeams(next)) { setSavedTeams(next); flash?.(`‘${saved.name}’ 팀을 내 팀에 저장했습니다.`); }
    }
    requestTeamChange({ kind: "load", saved });
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamTitle = currentSaved?.name || `${regulation.shortName} 팀`;
  const saveTeamImage = useCallback(async () => {
    if (imageBusy || !team.length) return;
    setImageBusy(true);
    try {
      const sheet = buildTeamSheet(team, { detailData, displayPokemon });
      const result = await saveTeamSheetImage(sheet, { title: teamTitle, meta: `${regulation.name}, ${currentCupRuleSummary}, ${team.length}마리` });
      if (result === "downloaded") flash?.("이미지를 저장했습니다.");
    } catch (error) {
      siteAlert("이미지를 만들지 못했습니다.", error?.message || "");
    } finally {
      setImageBusy(false);
    }
  }, [imageBusy, team, detailData, displayPokemon, teamTitle, regulation.name, currentCupRuleSummary, flash]);
  const openShare = useCallback(() => {
    if (!team.length) return;
    setShareTeam({
      name: currentSaved?.name || "", working: !currentSaved, regulationId, cupRuleId,
      cupRuleSettings: { assignedType: cupRule.kind === "monotype" ? assignedTypeId : "" },
      members: serializeMembers(team, { detailData }),
    });
  }, [team, currentSaved, regulationId, cupRuleId, cupRule.kind, assignedTypeId, detailData]);

  useEffect(() => {
    if (!detailData) return;
    const hasTranslation = (bucket, id, englishName) => {
      const dict = KO?.[bucket] || {};
      return Boolean(dict[championsData.toID(englishName)] || dict[championsData.toID(id)]);
    };

    const itemIds = new Set();
    for (const regId of Object.keys(REGULATIONS)) {
      for (const item of championsData.legalItems(detailData, regId)) itemIds.add(item.id);
    }

    const moveIds = new Set();
    for (const reg of Object.values(REGULATIONS)) {
      for (const pokemon of reg.pokemon) {
        for (const moveId of learnsetFor(detailData, pokemon)) moveIds.add(moveId);
      }
    }

    const abilityNames = new Set();
    for (const reg of Object.values(REGULATIONS)) {
      for (const pokemon of reg.pokemon) {
        const details = dexRecord(detailData, pokemon);
        for (const ability of details?.abilities || []) if (ability) abilityNames.add(ability);
      }
    }

    const missingItems = [...itemIds]
      .filter(id => !hasTranslation("items", id, detailData.items?.[id]?.name || id))
      .sort()
      .map(id => ({ id, english: detailData.items?.[id]?.name || id }));
    const missingMoves = [...moveIds]
      .filter(id => !hasTranslation("moves", id, detailData.moves?.[id]?.name || id))
      .sort()
      .map(id => ({ id, english: detailData.moves?.[id]?.name || id }));
    const missingAbilities = [...abilityNames]
      .filter(name => !hasTranslation("abilities", name, name))
      .sort();
    const missingPokemon = koreanNames.size
      ? [...new Set(Object.values(REGULATIONS).flatMap(reg => reg.pokemon.map(pokemon => pokemon.name)))]
        .filter(name => localizedPokemonName({ name }, koreanNames) === name)
      : [];

    const result = {
      checkedAt: new Date().toISOString(),
      regulations: Object.keys(REGULATIONS),
      itemsChecked: itemIds.size,
      movesChecked: moveIds.size,
      abilitiesChecked: abilityNames.size,
      missingItems,
      missingMoves,
      missingAbilities,
      missingPokemon,
    };
    window.YPL_LOCALIZATION_AUDIT = result;
    if (missingItems.length || missingMoves.length || missingAbilities.length || missingPokemon.length) console.warn("[YPL] 한국어 번역 누락 감지", result);
    else console.info(`[YPL] 한국어 번역 검사 통과: 도구 ${itemIds.size}, 기술 ${moveIds.size}, 특성 ${abilityNames.size}`);
  }, [detailData, koreanNames]);

  const dataStatusText = detailStatus === "ready" ? "배틀 데이터 연결됨" : detailStatus === "error" ? "상세 데이터 연결 실패" : "배틀 데이터 불러오는 중";
  const localizationText = localizationStatus === "ready" ? "한국어 이름 사용" : localizationStatus === "error" ? "영문 이름 사용" : "한국어 이름 준비 중…";
  const draftText = draftStatus === "saved" ? "임시저장됨" : draftStatus === "pending" ? "임시저장 중…" : draftStatus === "error" ? "임시저장 실패" : "";
  const hasWorkingState = team.length > 0 || Boolean(activeSavedTeamId) || cupRuleId !== "none" || Boolean(assignedTypeId);

  return (
    <section className="sec tb-page" data-step={step}>
      <PageHead plain="팀 빌더" desc="포켓몬 챔피언스 규정에 맞춰 엔트리를 구성하고 브라우저에 저장할 수 있습니다.">
        <div className="tb-hero-actions">
          <button className="btn btn-ghost" disabled={!storageAvailable} onClick={() => openLibrary(false)}>내 팀 <span className="tb-count-badge">{savedTeams.length}</span></button>
          <button className="btn tb-main-btn tb-save-btn" disabled={!storageAvailable} onClick={() => openLibrary(true)}>{currentSaved ? (dirty ? "변경사항 저장" : "저장됨") : "팀 저장"}</button>
        </div>
      </PageHead>

      <div className="tb-steps" ref={stepsRef}>
        <Segmented value={step} onChange={changeStep} ariaLabel="팀 빌더 단계" options={[["rules", "규정"], ["pool", "포켓몬 선택"], ["team", "팀 구성"]]} />
      </div>

      <Reveal className="tb-rule-card" delay={STAGGER.row * 1} data-tb-step="rules">
        <div className="tb-rule-grid">
          <label className="tb-field">
            <span>레귤레이션{eventId ? " (대회 기준)" : ""}</span>
            <Dropdown className="tb-dd" value={regulationId} onChange={switchRegulation} disabled={Boolean(eventId)} ariaLabel="레귤레이션"
              options={Object.values(REGULATIONS).map(reg => ({ value: reg.id, label: reg.name + (reg.status === "current" ? " (현행)" : reg.status === "past" ? " (이전)" : "") }))} />
          </label>
          <label className="tb-field">
            <span>파이컵 추가 룰{eventId ? " (대회 기준)" : ""}</span>
            <Dropdown className="tb-dd" value={cupRuleId} onChange={switchCupRule} disabled={Boolean(eventId)} ariaLabel="파이컵 추가 룰"
              options={Object.values(CUP_RULES).map(rule => ({ value: rule.id, label: rule.name }))} />
          </label>
          {cupRule.kind === "monotype" && <label className="tb-field">
            <span>지정 타입{eventId ? " (대회 기준)" : ""}</span>
            <Dropdown className="tb-dd" value={assignedTypeId} onChange={switchCupRuleType} placeholder="타입을 선택하세요." ariaLabel="지정 타입"
              options={TYPE_OPTIONS.map(type => ({ value: type.id, label: `${type.korean} (${type.english})` }))} />
          </label>}
        </div>
        <div className="tb-rule-meta">
          <span className={`tb-status-chip ${regulation.status}`}>{regulation.status === "current" ? "현행" : "이전"}</span>
          <span>{regulation.period}</span>
          <span>{regulation.description}</span>
          {cupRule.kind !== "none" && <span>{cupRule.description}</span>}
        </div>
      </Reveal>

      <Reveal className="tb-validation-wrap" delay={STAGGER.row * 2} data-tb-step="team">
        <OfficialSubmissionPanel
          eventId={eventId}
          eventContext={eventContext}
          eventContextStatus={eventContextStatus}
          eventContextError={eventContextError}
          regulationName={regulation.name}
          cupRuleSummary={currentCupRuleSummary}
          registrationName={registrationName}
          onRegistrationNameChange={value => { setRegistrationName(value); setRegistration(null); setRegistrationLookupError(""); setSubmissionError(""); }}
          onLookup={lookupSubmissionRegistration}
          lookupBusy={registrationLookupBusy}
          lookupError={registrationLookupError}
          registration={registration}
          eligibility={submissionEligibility}
          submissionBusy={submissionBusy}
          submissionError={submissionError}
          onSubmit={submitCurrentTeam}
        />
      </Reveal>

      {(team.length > 0 || cupRule.kind !== "none") && <Reveal className="tb-validation-wrap" delay={STAGGER.row * 2} data-tb-step="team">
        <ValidationPanel
          result={validation}
          regulationName={regulation.name}
          cupRuleSummary={currentCupRuleSummary}
          teamLength={team.length}
          configuredSpecialRule={cupRule.kind !== "none"}
        />
      </Reveal>}

      <div className="tb-layout">
        <Reveal className="tb-panel tb-pool-panel" delay={STAGGER.row * 3} data-tb-step="pool">
          <div className="tb-panel-head">
            <div><h2>포켓몬 선택</h2></div>
            <strong className="tb-pool-count">{cupRule.kind === "monotype" && selectedType ? `${selectedType.korean} ` : ""}{eligiblePool.length}<small> / {selectablePokemonPool.length}</small></strong>
          </div>
          {(detailStatus!=="ready"||localizationStatus!=="ready")&&<div className="tb-data-line"><span className={`tb-dot ${detailStatus}`}/>{[detailStatus!=="ready"&&dataStatusText,localizationStatus!=="ready"&&localizationText].filter(Boolean).join(", ")}</div>}
          <div className="tb-search-row">
            <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={18}/></span>
            <input
              className="tb-input"
              value={query}
              onChange={event => { setQuery(event.target.value); setSuggestIndex(0); setSearchFocused(true); }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={onSearchKeyDown}
              placeholder="이름, 기술, 특성, 타입 검색"
              role="combobox"
              aria-label="포켓몬 검색"
              aria-expanded={showSuggestions}
              aria-controls="tb-search-suggest"
              aria-autocomplete="list"
              autoComplete="off"
            />
            {(query || searchChips.length > 0) && <button className="tb-clear" onClick={() => { setQuery(""); setSearchChips([]); }} aria-label="검색 조건 모두 지우기"><Icon n="x" size={12} /></button>}
            {showSuggestions && (
              <div className="dd-menu glass-l3 tb-suggest" id="tb-search-suggest" role="listbox" aria-label="검색 조건 후보">
                {searchSuggestions.map((entry, index) => (
                  <React.Fragment key={`${entry.kind}:${entry.id}`}>
                    {(index === 0 || searchSuggestions[index - 1].kind !== entry.kind) && <div className="tb-suggest-head">{SEARCH_KIND_LABEL[entry.kind]}</div>}
                    <button type="button" className={"dd-opt" + (index === suggestIndex ? " sel" : "")} role="option" aria-selected={index === suggestIndex}
                      onMouseDown={event => event.preventDefault()} onClick={() => addSearchChip(entry)}>
                      {entry.label}{entry.english && entry.english !== entry.label && <small>{entry.english}</small>}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          {searchChips.length > 0 && (
            <div className="tb-chips">
              {searchChips.map((chip, index) => (
                <button type="button" key={`${chip.kind}:${chip.id}`} className="tb-chip" aria-label={`${SEARCH_KIND_LABEL[chip.kind]} ${chip.label} 조건 지우기`}
                  onClick={() => setSearchChips(current => current.filter((_, chipIndex) => chipIndex !== index))}>
                  <small>{SEARCH_KIND_LABEL[chip.kind]}</small>{chip.label}<Icon n="x" size={11} />
                </button>
              ))}
            </div>
          )}
          <div className="tb-sort-row">
            <Dropdown className="tb-dd" value={sortId} onChange={setSortId} ariaLabel="정렬 기준" options={BUILDER_SORTS.map(sort => ({ value: sort.id, label: sort.label }))} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSortReversed(current => !current)} aria-pressed={sortReversed}>
              {sortId === "name" ? (sortReversed ? "역순" : "가나다순") : (sortReversed ? "낮은 순" : "높은 순")}
            </button>
          </div>
          {cupRule.kind === "monotype" && !assignedTypeId ? (
            <div className="tb-pool-empty">모노타입 챌린지의 타입을 선택해 주세요.</div>
          ) : cupRule.kind === "monotype" && !detailData && detailStatus === "loading" ? (
            <Loader small />
          ) : cupRule.kind === "monotype" && !detailData ? (
            <div className="tb-pool-empty">타입 데이터를 불러오지 못해 모노타입 포켓몬을 판정할 수 없습니다.</div>
          ) : (
            <PoolList pool={filteredPool} detailData={detailData} displayPokemon={displayPokemon} sortId={sortId} occupancy={occupancy} selectedUid={selectedUid} onAdd={onAddPokemon} />
          )}
        </Reveal>

        <div className="tb-main-column" data-tb-step="team">
          <Reveal className="tb-panel" delay={STAGGER.row * 4}>
            <div className="tb-panel-head tb-team-head">
              <div>
                <div className="tb-team-title-line"><h2>팀 구성</h2><span className="tb-current-team">{currentSaved?.name || "저장되지 않은 팀"}</span>{dirty && <span className="tb-dirty-badge">변경사항 있음</span>}{hasWorkingState && draftText && <span className={`tb-draft-badge ${draftStatus}`} title={draftStatus === "saved" && draftSavedAt ? `마지막 임시저장: ${formatSavedDate(draftSavedAt)}` : undefined}>{draftText}</span>}</div>
              </div>
              <strong className="tb-pool-count">{team.length}<small> / {regulation.maxTeamSize || 6}</small></strong>
            </div>
            <div className="tb-team-slots">
              {Array.from({ length: regulation.maxTeamSize || 6 }, (_, index) => {
                const member = team[index];
                return <TeamSlot key={member?.uid || `slot-${index}`} index={index} member={member} active={member?.uid === selectedUid} displayName={member ? displayPokemon(member.pokemon) : ""} itemLabel={member?.item ? itemName(detailData, member.item) : ""} onSelect={() => setSelectedUid(member?.uid || null)} onRemove={() => member && removeMember(member.uid)} />;
              })}
            </div>
            <div className="tb-team-actions">
              <span>{draftSavedAt && draftStatus === "saved" ? `마지막 임시저장 ${new Date(draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "변경사항은 이 브라우저에 자동 임시저장됩니다."}</span>
              <button className="btn btn-ghost btn-sm" onClick={resetTeam}>초기화</button>
            </div>
            {team.length > 0 && <div className="tb-share-actions">
              <button className="btn btn-ghost btn-sm" disabled={imageBusy || detailStatus === "loading"} onClick={saveTeamImage}>{imageBusy ? "이미지 만드는 중…" : "이미지로 저장"}</button>
              <button className="btn btn-ghost btn-sm" disabled={detailStatus === "loading"} onClick={openShare}>게시판에 올리기</button>
            </div>}
          </Reveal>

          <Reveal className="tb-panel tb-editor" delay={STAGGER.row * 5}>
            {!selectedMember ? (
              <div className="tb-editor-empty"><strong>세팅할 포켓몬을 선택하세요.</strong><span>왼쪽 목록에서 추가하거나 위 팀 슬롯을 선택하면 상세 설정을 편집할 수 있습니다.</span></div>
            ) : (
              <>
                <div className="tb-editor-head">
                  <img src={spriteUrl(selectedMember.pokemon.name)} alt="" onError={onSpriteError()} />
                  <div className="tb-editor-title">
                    <h2>{displayPokemon(selectedMember.pokemon)}</h2>
                    {displayPokemon(selectedMember.pokemon) !== selectedMember.pokemon.name && <span>{selectedMember.pokemon.name}</span>}
                    <small>{selectedDetails?.num != null ? `National Dex #${String(selectedDetails.num).padStart(4, "0")}` : "전국도감 번호 확인 중"}</small>
                    <TypeBadges types={selectedDetails?.types || []} />
                  </div>
                </div>

                <div className="tb-editor-grid two">
                  <label className="tb-field"><span>특성</span>
                    <Dropdown className="tb-dd" value={selectedMember.ability || ""} disabled={!selectedDetails?.abilities?.length}
                      onChange={value => updateMember(selectedMember.uid, { ability: value })} ariaLabel="특성"
                      placeholder={detailStatus === "error" ? "데이터 연결 실패" : "데이터 로딩 중…"}
                      options={(selectedDetails?.abilities || []).map(ability => ({ value: ability, label: bilingualName(abilityName(ability), ability) }))} />
                  </label>
                  <label className="tb-field"><span>성격</span>
                    <Dropdown className="tb-dd" value={selectedMember.alignment || "serious"} onChange={value => updateMember(selectedMember.uid, { alignment: value })} ariaLabel="성격"
                      options={ALIGNMENTS.map(alignment => ({ value: alignment.id, label: alignmentDisplay(alignment) }))} />
                  </label>
                </div>

                <div className="tb-editor-section">
                  <div className="tb-subhead"><div><strong>능력 포인트</strong><span>개별 최대 32, 총합 최대 66</span></div><b className={STAT_KEYS.reduce((sum, key) => sum + Number(selectedMember.statPoints?.[key] || 0), 0) > 66 ? "over" : ""}>{STAT_KEYS.reduce((sum, key) => sum + Number(selectedMember.statPoints?.[key] || 0), 0)} / 66</b></div>
                  <div className="tb-stats">
                    {STAT_KEYS.map(key => {
                      const nature = alignmentFor(selectedMember);
                      const point = Number(selectedMember.statPoints?.[key] || 0);
                      const base = selectedDetails?.baseStats?.[key];
                      const final = calculatedStat(base, point, key, nature);
                      return (
                        <div className="tb-stat-row" key={key}>
                          <div className="tb-stat-label"><strong>{STAT_LABELS[key]}{nature.plus === key ? " ↑" : nature.minus === key ? " ↓" : ""}</strong><span>Base {base ?? "—"}</span></div>
                          <input type="range" min="0" max="32" step="1" value={point} onChange={event => updateStat(selectedMember, key, event.target.value)} />
                          <input className="tb-stat-number" type="number" min="0" max="32" step="1" value={point} onChange={event => updateStat(selectedMember, key, event.target.value)} aria-label={`${STAT_LABELS[key]} Stat Point`} />
                          <div className="tb-final-stat"><span>최종</span><strong>{final}</strong></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="tb-editor-section">
                  <div className="tb-subhead"><div><strong>도구</strong><span>{regulation.shortName} 사용 가능, 같은 도구 중복 금지</span></div></div>
                  {selectedRequiredItem ? (
                    <>
                      <div className="tb-locked-item" role="textbox" aria-readonly="true" aria-label="메가폼 전용 도구">
                        <span>{itemDisplay(detailData, selectedRequiredItem)}</span><Icon n="lock" size={15} />
                      </div>
                      <div className="tb-field-meta">선택한 메가폼에 필요한 도구로 자동 지정되며 변경할 수 없습니다.</div>
                    </>
                  ) : (
                    <PickField label="도구" value={selectedMember.item ? itemDisplay(detailData, selectedMember.item) : ""}
                      placeholder={!detailData ? (detailStatus === "error" ? "데이터 연결 실패" : "데이터 로딩 중…") : "도구 없음"}
                      disabled={!detailData} onOpen={() => setPicker("item")} onClear={() => updateMember(selectedMember.uid, { item: "" })} />
                  )}
                </div>

                <div className="tb-editor-section">
                  <div className="tb-subhead"><div><strong>기술</strong><span>학습 가능한 기술 중 4개 선택</span></div><b>{selectedMember.moves.filter(Boolean).length} / 4</b></div>
                  <div className="tb-move-filters">
                    <Dropdown className="tb-dd" value={moveTypeFilter} onChange={setMoveTypeFilter} ariaLabel="기술 타입 필터" disabled={!detailData}
                      options={[{ value: "", label: "모든 타입" }, ...TYPE_OPTIONS.map(type => ({ value: type.id, label: type.korean }))]} />
                    <Dropdown className="tb-dd" value={moveCategoryFilter} onChange={setMoveCategoryFilter} ariaLabel="기술 분류 필터" disabled={!detailData}
                      options={MOVE_CATEGORY_OPTIONS} />
                  </div>
                  <div className="tb-moves">
                    {Array.from({ length: 4 }, (_, index) => {
                      const selectedMove = selectedMember.moves[index] || "";
                      const move = detailData?.moves?.[selectedMove];
                      return (
                        <div className="tb-field tb-move-field" key={`${selectedMember.uid}-move-${index}`}>
                          <span>기술 {index + 1}</span>
                          <PickField label={`기술 ${index + 1}`} value={selectedMove ? moveName(detailData, selectedMove) : ""}
                            placeholder={detailStatus === "error" ? "데이터 연결 실패" : !detailData ? "데이터 로딩 중…" : "기술 선택"}
                            typeId={championsData.toID(move?.type)} typeLabel={move ? TYPE_KO[move.type] || move.type : ""}
                            disabled={!detailData} onOpen={() => setPicker(index)} onClear={() => setMoveAt(index, "")} />
                          <div className="tb-field-meta">{selectedMove ? moveMetadata(detailData, selectedMove) : (learnset.length || !detailData ? "" : "현재 포켓몬의 기술 목록을 불러오지 못했습니다.")}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </Reveal>

        </div>
      </div>

      {selectedMember && picker === "item" && <PickerSheet title="도구" placeholder="도구 이름 검색 (한글, 영문)" items={itemPickItems}
        selected={selectedMember.item || ""} onPick={id => updateMember(selectedMember.uid, { item: id })} onClose={() => setPicker(null)} />}
      {selectedMember && typeof picker === "number" && <PickerSheet title={`기술 ${picker + 1}`} placeholder="기술 이름 검색 (한글, 영문)" items={movePickItems(picker)}
        selected={selectedMember.moves[picker] || ""} onPick={id => setMoveAt(picker, id)} onClose={() => setPicker(null)}
        emptyText={learnset.length ? "조건에 맞는 기술이 없습니다. 위의 타입과 분류 필터를 확인해 주세요." : "현재 포켓몬의 기술 목록을 불러오지 못했습니다."} />}
      {shareTeam && <ShowcaseCompose team={shareTeam} initialIndex={Math.max(0, team.findIndex(member => member.uid === selectedUid))} onClose={() => setShareTeam(null)}
        onPosted={post => { setShareTeam(null); flash?.("게시판에 올렸습니다."); go?.("board", { tab: post.kind, format: post.format, post: post.id }); }} />}
      {pendingRuleChange && <Modal title="규칙 변경 확인" onClose={() => setPendingRuleChange(null)}>
        <p className="tb-rule-confirm-copy">규칙을 변경하면 현재 팀에서 사용할 수 없는 다음 포켓몬이 제거됩니다.</p>
        <ul className="tb-rule-confirm-list">
          {pendingRuleChange.removedMembers.map(member => <li key={member.uid}>{displayPokemon(member.pokemon)}</li>)}
        </ul>
        <p className="tb-rule-confirm-copy">계속 변경하시겠습니까?</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPendingRuleChange(null)}>취소</button>
          <button type="button" className="btn tb-main-btn" onClick={() => applyRuleChange(pendingRuleChange)}>규칙 변경</button>
        </div>
      </Modal>}

      {pendingTeamChange && <Modal title="팀 전환 전 저장" onClose={() => setPendingTeamChange(null)}>
        <p className="tb-rule-confirm-copy">저장되지 않은 변경사항이 있습니다. 현재 변경을 저장한 뒤 계속하면 팀 전환 중에도 변경사항이 유지됩니다.</p>
        <p className="tb-rule-confirm-copy">{currentSaved ? `“${currentSaved.name}” 팀에 현재 변경사항을 저장합니다.` : `현재 팀을 “${defaultTeamName()}” 이름의 새 저장 팀으로 보관합니다.`}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPendingTeamChange(null)}>취소</button>
          <button type="button" className="btn tb-main-btn" onClick={continuePendingTeamChange}>저장 후 계속</button>
        </div>
      </Modal>}

      {libraryOpen && <Modal title="내 팀" hint="불러오기 후 수정하고 다시 저장하면 기존 팀을 덮어씁니다." onClose={() => setLibraryOpen(false)}>
        <div className="tb-library-save">
          <label className="tb-field"><span>현재 팀 저장</span><input className="tb-input tb-team-name" maxLength={40} value={saveName} onChange={event => setSaveName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); saveCurrentTeam(); } }} placeholder="팀 이름" /></label>
          <div className="tb-library-save-meta"><span>{regulation.name}, {currentCupRuleSummary}, {team.length}/6마리</span><span>이 브라우저에 저장됩니다.</span><span>미완성이거나 규정을 위반한 팀도 임시로 저장할 수 있습니다.</span></div>
          <div className="tb-library-save-row">
            <div className="tb-library-workspace-actions">
              <button className="btn btn-ghost btn-sm" disabled={!storageAvailable} onClick={startNewTeam}>새 팀</button>
              <button className="btn btn-ghost btn-sm" disabled={!storageAvailable || team.length === 0} onClick={duplicateCurrentTeam}>현재 팀 복제</button>
            </div>
            <button className="btn tb-main-btn btn-sm" disabled={!storageAvailable || team.length === 0} onClick={saveCurrentTeam}>{currentSaved ? "변경사항 저장" : "새 팀 저장"}</button>
          </div>
          {saveMessage && <div className="tb-save-message">{saveMessage}</div>}
        </div>
        <div className="tb-saved-list">
          {savedTeams.map(saved => {
            const savedReg = REGULATIONS[saved.regulationId];
            const type = TYPE_OPTIONS.find(option => option.id === saved.cupRuleSettings?.assignedType);
            return (
              <div className="tb-saved-team" key={saved.id}>
                <button type="button" className="tb-saved-main tb-saved-load" onClick={() => loadSavedTeam(saved)}>
                  <strong>{saved.name}{saved.id === activeSavedTeamId && <span className="tb-active-saved">현재</span>}</strong>
                  <span>{savedReg?.shortName || saved.regulationId}{saved.cupRuleId !== "none" ? `, ${(CUP_RULES[saved.cupRuleId]?.shortName || "룰")}${type ? ` (${type.korean})` : ""}` : ""}, {saved.members.length}/6마리, {formatSavedDate(saved.updatedAt)} 수정</span>
                  <div className="tb-saved-icons">{saved.members.map((member, index) => <img key={`${member.pokemonName}-${index}`} src={spriteUrl(member.pokemonName)} alt="" title={member.pokemonName} onError={onSpriteError()} />)}</div>
                </button>
                <div className="tb-saved-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => duplicateSavedTeam(saved)}>복제</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteSavedTeam(saved)}>삭제</button>
                </div>
              </div>
            );
          })}
          {!savedTeams.length && <div className="tb-library-empty">아직 저장된 팀이 없습니다.</div>}
        </div>
      </Modal>}
    </section>
  );
}

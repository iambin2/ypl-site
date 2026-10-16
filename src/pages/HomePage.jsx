import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Roll, Icon, rankRows } from "../components/index.js";
import { startStage } from "../components/home/bracketStage.js";
import { TITLE, titleBlock } from "../components/home/brandTitle.js";
import { displaySeasonLabel, generationNumberFromLegacyLabel } from "../services/seasonLabel.js";
import { formatDate } from "../services/dateFormat.js";
import { leagueTitle } from "../services/eventName.js";
import { readInitialAppView } from "../services/appRouting.js";

/* 날짜 문자열을 비교 가능한 숫자로. "2026.05.02" / "2026.05" / "2024년 11월" 모두 처리한다. */
function dateKey(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n) return 0;
  const y = +(n[0] || 0), m = +(n[1] || 0), d = +(n[2] || 0);
  return y * 10000 + m * 100 + d;
}
const genOf = g => String(g || "").replace(/\s*챔피언\s*$/, "");
/* 세대는 명예의 전당과 같은 숫자와 단위("6대")로. 숫자를 못 읽으면 적힌 그대로. */
function GenLabel({ label }) {
  const n = generationNumberFromLegacyLabel(label);
  return <span className="hx-gen-n">{n ? <><span className="fig">{n}</span><span className="unit">대</span></> : label}</span>;
}
const DAY_MS = 86400000;
/* "2026-10-04", "2026.10.04", "2026-10-04T15:21" → 그날 0시의 Date. 일까지 없으면 null. */
function dayOf(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n || n.length < 3) return null;
  const d = new Date(+n[0], +n[1] - 1, +n[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/* 홈 첫 화면의 다음 행동. 이미 불러온 공지(site_data)의 대회 정보만 읽는다. 새 조회는 없다. */
function nextEvent(announcements, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const a of announcements || []) {
    const draft = a?.form?.enabled ? a.form.eventDraft : null;
    if (!draft) continue;
    const champions = draft.eventType === "champions";
    const dates = champions ? [draft.qualifierHeldOn ?? draft.heldOn, draft.finalHeldOn] : [draft.heldOn];
    for (const raw of dates) {
      const day = dayOf(raw);
      if (!day) continue;
      const dday = Math.round((day - today) / DAY_MS);
      if (dday < 0 || (best && best.dday <= dday)) continue;
      best = { a, draft, champions, raw, dday };
    }
  }
  return best;
}

/* D2: 무대의 밝기는 대회 상태를 따른다. 오늘 열리면 진행 중, 다가오면 접수 중, 없으면 종료. */
export function stageStateOf(announcements) {
  const upcoming = nextEvent(announcements);
  return !upcoming ? "done" : upcoming.dday === 0 ? "live" : "open";
}

/* 최근 결과: 우승자가 있는 회차 중 최신 세 줄. 챔피언스 시리즈도 포함한다.
   첫 그림은 이미 불러온 예전 기록으로, 이어서 기록 페이지와 같은 공식 기록 조회("records" 캐시 공유)로 바꾼다. */
const hasWinner = r => String(r.win || "").trim() || (r.winMembers || []).length;
const latest = rows => rows.filter(hasWinner).sort((a, b) => dateKey(b.date) - dateKey(a.date)).slice(0, 3);
function legacyRecent(data) {
  return latest((data.tournaments || []).flatMap(t => (t.rounds || []).map(r => ({
    ...r, title: r.champ ? "챔피언스 시리즈" : leagueTitle(t.label),
  }))));
}
/* 시즌 순위: 공식 기록에서는 최신 시즌이 맨 앞, 예전 기록(site_data)에서는 맨 뒤다. */
function legacySeason(data) {
  const seasons = data.seasons || [];
  return seasons[seasons.length - 1] || null;
}
/* 공식 기록은 홈으로 들어온 순간 사이트 데이터와 나란히 읽기 시작한다(사이트 데이터를 기다린 뒤 읽으면 왕복이 한 번 더 붙는다).
   마지막 결과는 기억해 두고, 홈에 다시 오면 예전 기록을 거치지 않고 그 결과로 바로 그린다. 새 조회가 같으면 다시 그리지 않는다. */
const readOfficial = () => Promise.all([
  import("../services/normalizedRecordsService.js"),
  import("../services/normalizedRecordsProjection.js"),
  import("../services/recordsAnalytics.js"),
  import("../services/readCache.js"),
]).then(async ([svc, projection, analytics, { freshRead }]) => [
  svc.normalizedRecordsReadEnabled() ? await freshRead("records", svc.fetchNormalizedRecordsSnapshot) : null,
  projection,
  analytics,
]);
let bootRead = readInitialAppView(window.location.search) === "home" ? readOfficial() : null;
bootRead?.catch(() => {});
let homeSeen = null;

function useHomeRecords(data) {
  const initial = () => (homeSeen?.data === data ? homeSeen.state : { recent: legacyRecent(data), season: legacySeason(data) });
  const [state, setState] = useState(initial);
  useEffect(() => {
    let cancelled = false;
    setState(initial);
    const read = bootRead || readOfficial();
    bootRead = null;
    read.then(([raw, { buildNormalizedRecordsProjection }, { displayRecordMeta }]) => {
      if (!raw || cancelled) return;
      if (homeSeen?.data === data && homeSeen.raw === raw) return;
      const snapshot = buildNormalizedRecordsProjection(data, raw, null);
      const next = {
        recent: latest((snapshot.archives || []).map(a => ({
          ...a,
          title: a.championSeries ? "챔피언스 시리즈" : leagueTitle(a.tournamentName),
          rule: displayRecordMeta(a.rule),
          ru: [].concat(a.ru || []).join(", "),
        }))),
        season: (snapshot.ranking?.seasons || [])[0] || legacySeason(data),
      };
      homeSeen = { data, raw, state: next };
      setState(next);
    }).catch(error => console.warn("홈 기록: 공식 기록을 읽지 못해 예전 기록을 보여줍니다.", error));
    return () => { cancelled = true; };
  }, [data]);
  return state;
}

/* 표지의 첫 등장(대진표가 그려지며 이름이 선다)은 사이트에 들어올 때마다 한 번이다.
   판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다(개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 보통의 화면 전환만. */
let coverPending = true;
const firstCover = () => coverPending;

/* 표지의 이름: 워드마크의 글자로 그린 YONSEI POKEMON LEAGUE, 제목 크기의 한 단계 위(--display-l) */
const NAME = { kind: "mark", step: "l", lines: TITLE };
const fig = n => (n ? { kind: "fig", lines: [String(n)] } : null);

/* 캔버스가 없을 때의 이름: 무대가 그리는 것과 같은 글자와 기울기 */
function NameMark() {
  const b = titleBlock();
  return (
    <svg className="hx-mark" viewBox={`${b.left} 0 ${b.right - b.left} ${b.h}`} style={{ "--w": (b.right - b.left) / 100 }} aria-hidden="true">
      <g transform="skewX(-12)">{b.glyphs.map((g, i) => <path key={i} transform={`translate(${g.x} ${g.y})`} d={g.d} fillRule="evenodd" />)}</g>
    </svg>
  );
}

/* 한 장: 화면에 붙은 무대 위에 제목과 내용. 큰 숫자는 뒤의 캔버스가 그린다(무대가 없으면 글자로 선다). */
function Act({ id, title, sub, more, figure, staged, children }) {
  return (
    <section className="hx-act hx-ch" aria-labelledby={id}>
      <div className="hx-pin" data-pin>
        {!staged && figure ? <p className="hx-fig" aria-hidden="true">{figure}</p> : null}
        <div className="hx-txt">
          <div className="hx-ch-head">
            <div className="hx-ch-title">
              <h2 className="display" id={id}>{title}</h2>
              {sub && <p className="callout">{sub}</p>}
            </div>
            {more && <button type="button" className="ypl-more press" onClick={more[1]}>{more[0]}<Icon n="chevr" size={14} /></button>}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

/* ============================== HOME ==============================
   대진(DECISIONS 9차): 표지 하나와 세 장. 화면 전체에 16강 대진표가 새겨져 있고, 장이 바뀔 때마다 한 라운드가 끝나
   빛이 이긴 쪽으로만 올라간다. 그 위에 표지는 리그의 이름, 세 장은 큰 숫자가 선다(src/components/home/bracketStage.js).
   이름은 늘 표지에 있고 다가오는 대회의 남은 날은 그 아래 글에 선다. 세 장의 숫자는 최신 회차, 이번 시즌 트레이너 수, 챔피언 세대 수.
   이미 불러온 공지와 기록만 읽는다(새 조회 없음). 로고는 홈 무대에 쓰지 않는다. */
export default function HomePage({ data, go }) {
  const [enter] = useState(firstCover);
  const rootRef = useRef(null);
  const stage = useRef(null);
  const [staged, setStaged] = useState(false);

  const champs = useMemo(() => [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0)), [data.champions]);
  const { recent, season } = useHomeRecords(data);
  const notice = useMemo(() => [...(data.announcements || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null, [data.announcements]);
  const ranked = useMemo(() => rankRows(season?.rows || []), [season]);
  const standings = ranked.slice(0, 5);
  const top = Math.max(1, ...standings.map(r => r.points || 0));
  const round = Math.max(0, ...recent.map(r => +r.round || 0));

  /* 대회 단계: 표지의 큰 그림과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming;
    const today = dday === 0;
    return {
      today, dday,
      name: draft.name || a.title,
      status: today ? "오늘 열립니다" : "참가 신청 중",
      dueLabel: today ? `오늘 ${formatDate(raw, { time: true })}` : formatDate(raw, { time: true }),
    };
  }, [data.announcements]);
  const primary = !now ? ["기록 보기", "records"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청하기", "news"];
  const dday = now ? (now.today ? "오늘" : `D-${now.dday}`) : null;

  const figures = useMemo(() => [
    NAME, fig(round), fig(ranked.length), fig(champs.length),
  ], [round, ranked.length, champs.length]);

  /* 무대는 한 번, 그리기 전에 켠다(평면 배치가 한 프레임 비치지 않게). 낮은 화면(가로로 든 폰)과 캔버스를 못 쓰는 기기는 평면 배치로 남는다. */
  const figuresRef = useRef(figures);
  figuresRef.current = figures;
  useLayoutEffect(() => {
    coverPending = false;
    if (innerHeight < 520) return undefined;
    const g = startStage(rootRef.current, figuresRef.current, { intro: enter });
    if (!g) return undefined;
    stage.current = { g, figures: figuresRef.current };
    setStaged(true);
    return () => { g.stop(); stage.current = null; };
  }, [enter]);
  useEffect(() => {
    const s = stage.current;
    if (s && s.figures !== figures) { s.figures = figures; s.g.setFigures(figures); }
  }, [figures]);

  return (<div className={"home" + (staged ? " staged" : "")} ref={rootRef}>
    <section className="hx-act hx-cover" aria-labelledby="hx-title">
      <div className="hx-pin" data-pin>
        <h1 className={"hx-title" + (staged ? " sr-only" : "")} id="hx-title"><span className="sr-only">Yonsei Pokémon League</span>{!staged && <NameMark />}</h1>
        <div className="hx-txt">
          {now && <div className="hx-moment">
            <span className="hx-dday tnum">{dday}</span>
            <span className="hx-moment-name">{now.name}</span>
            <span className="hx-moment-meta">{now.today && <i className="live-dot" aria-hidden="true" />}{now.dueLabel}, {now.status}</span>
          </div>}
          <div className="hx-actions">
            <button type="button" className="ypl-btn ypl-btn--primary press hl" onClick={() => go(primary[1])}>{primary[0]}</button>
            <button type="button" className="ypl-btn ypl-btn--glass press hl" onClick={() => go("about")}>리그 소개</button>
          </div>
          {notice && <button type="button" className="hx-notice press" onClick={() => go("news", { notice: notice.id })}>
            <b>공지</b><span className="hx-notice-t">{notice.title}</span><Icon n="chevr" size={14} />
          </button>}
        </div>
      </div>
    </section>

    <Act id="hx-battle" title="모든 배틀." sub={round ? `${round}회의 대회, 최근 결과` : "최근 대회 결과"} more={["전체 기록", () => go("records")]} figure={round || null} staged={staged}>
      {recent.length ? <ol className="ypl-group hx-list">{recent.map((r, i) => {
        const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
        return (
          <li key={i}>
            <button type="button" className="ypl-row hx-result" onClick={() => r.eventId && r.source === "normalized" ? go("bracket", { eventId: r.eventId }) : go("records")}>
              <span className="hx-result-main">
                <span className="ypl-row__title">{[r.round && `${r.round}회`, r.title].filter(Boolean).join(" ")}</span>
                <span className="ypl-row__meta">{[formatDate(r.date), r.rule].filter(Boolean).join(" ")}</span>
              </span>
              <span className="hx-result-win"><span className="ypl-row__meta">우승</span><b>{win}</b></span>
            </button>
          </li>
        );
      })}</ol>
        : <div className="ypl-empty"><p>아직 등록된 대회 결과가 없습니다.</p></div>}
    </Act>

    <Act id="hx-record" title="모든 기록." sub={`${season?.name || "이번 시즌"} 순위${ranked.length ? `, ${ranked.length}명의 트레이너` : ""}`} more={["전체 랭킹", () => go("records", { tab: "rank" })]} figure={ranked.length || null} staged={staged}>
      {standings.length ? <ol className="ypl-group hx-standings">{standings.map((r, i) => (
        <li key={r.name}>
          <button type="button" className="ypl-row hx-standing" style={{ "--w": (r.points || 0) / top, "--i": i }} onClick={() => go("records", { trainer: r.name })}>
            <i className="hx-bar" aria-hidden="true" />
            <span className={"hx-rank fig r" + Math.min(r.rank, 4)}>{r.rank}</span>
            <span className="ypl-row__title">{r.name}</span>
            <span className="hx-pts tnum"><b><Roll value={r.points || 0} /></b><span className="unit">점</span></span>
          </button>
        </li>
      ))}</ol>
        : <div className="ypl-empty"><p>이번 시즌 순위는 첫 대회가 끝나면 나옵니다.</p></div>}
    </Act>

    <Act id="hx-champ" title="모든 챔피언." sub="챔피언스 시리즈 역대 우승자" more={["명예의 전당", () => go("champions")]} figure={champs.length || null} staged={staged}>
      {champs.length ? <ol className="hx-lineage card">{champs.slice(-6).map((c, i, list) => (
        <li key={c.id || c.name || i} className={i === list.length - 1 ? "now" : ""}>
          <button type="button" className="hx-gen press" onClick={() => go("champions")}>
            <GenLabel label={genOf(c.gen)} />
            <b>{c.name}</b>
            <span className="caption">{displaySeasonLabel(c.slabel) || (c.season ? `시즌 ${c.season}` : "")}</span>
          </button>
        </li>
      ))}</ol>
        : <div className="ypl-empty"><p>아직 등록된 챔피언이 없습니다.</p></div>}
    </Act>
  </div>);
}

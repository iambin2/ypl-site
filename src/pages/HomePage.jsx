import React, { useEffect, useMemo, useRef, useState } from "react";
import { Reveal, Icon, STAGGER, SectionHead, ordinal } from "../components/index.js";
import useCursorLight from "../components/common/useCursorLight.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";
import { loadHallOfFameArtworkLookup, resolveHallOfFameArtwork } from "../services/hallOfFamePresentation.js";

/* 날짜 문자열을 비교 가능한 숫자로. "2026.05.02" / "2026.05" / "2024년 11월" 모두 처리한다. */
function dateKey(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n) return 0;
  const y = +(n[0] || 0), m = +(n[1] || 0), d = +(n[2] || 0);
  return y * 10000 + m * 100 + d;
}
const genOf = g => String(g || "").replace(/\s*챔피언\s*$/, "");
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_MS = 86400000;
const pad = n => String(n).padStart(2, "0");
/* "2026-10-04", "2026.10.04", "2026-10-04T15:21" → 그날 0시의 Date. 일까지 없으면 null. */
function dayOf(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n || n.length < 3) return null;
  const d = new Date(+n[0], +n[1] - 1, +n[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/* 03 숫자와 표기: 같은 해 안의 날짜는 "10.11 토", 시각이 있으면 "10.11 토 19:00" */
function shortDay(s) {
  const d = dayOf(s);
  if (!d) return "";
  const time = String(s).match(/[T\s](\d{1,2}):(\d{2})/);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${WEEKDAY[d.getDay()]}${time ? ` ${pad(time[1])}:${time[2]}` : ""}`;
}
/* 03: 메타 줄의 날짜는 "2026년 7월" */
const yearMonth = s => { const n = String(s || "").match(/\d+/g) || []; return n.length >= 2 ? `${n[0]}년 ${+n[1]}월` : ""; };
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

const EXPLORE = [
  ["bracket", "Live", "대진표", "진행 중인 대회의 대진과 결과를 바로 봅니다."],
  ["records", "Records", "기록", "트레이너, 대회, 포켓몬, 랭킹 기록을 모았습니다."],
  ["champions", "Hall of Fame", "명예의 전당", "역대 챔피언과 우승 파티를 봅니다."],
  ["titles", "Titles", "칭호", "트레이너들이 얻은 칭호를 모아 봅니다."],
  ["builder", "Tool", "팀 빌더", "현재 레귤레이션으로 파티를 짜고 저장합니다."],
  ["news", "News", "공지", "대회 소식을 읽고 바로 신청합니다."],
];

const Arrow = () => <i className="ypl-arrow" aria-hidden="true"><Icon n="arrow" size={14} /></i>;

/* 현재 챔피언: 우승 파티 여섯 칸. 파티 그림표(legacyPartyImages)는 크기가 커서 홈에서는 따로 불러온다. */
function useParty(team) {
  const [party, setParty] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!team?.length) { setParty([]); return undefined; }
    import("../services/legacyPartyImages.js").then(async ({ normTeam }) => {
      const members = normTeam(team).filter(m => m.name || m.img || m.pokemonId);
      const lookup = members.some(m => !m.img) ? await loadHallOfFameArtworkLookup().catch(() => null) : null;
      if (!cancelled) setParty(members.map(m => ({ name: m.name, img: m.img || resolveHallOfFameArtwork(m, lookup) })));
    });
    return () => { cancelled = true; };
  }, [team]);
  return party;
}

function ChampionCard({ reigning }) {
  const ref = useRef(null);
  useCursorLight(ref);
  const party = useParty(reigning.team);
  const gen = genOf(reigning.gen);
  const n = Number((gen.match(/^(\d+)대$/) || [])[1]) || 0;
  const season = displaySeasonLabel(reigning.slabel);
  const slots = [...party, ...Array(Math.max(0, 6 - party.length)).fill(null)].slice(0, Math.max(6, party.length));
  return (
    <div className="ypl-feature glass sq follow" ref={ref}>
      {n > 0 && <span className="ypl-feature-wm silver-live" aria-hidden="true">{n}</span>}
      <div className="ypl-feature-who">
        <span className="eyebrow">{n > 0 ? `${ordinal(n)} Champion` : "Champion"}</span>
        <span className="ypl-feature-name silver-live">{reigning.name}</span>
        <span className="ypl-feature-sub">{season ? `${season} 챔피언` : gen}</span>
      </div>
      <ol className="ypl-pods" aria-label="우승 파티">
        {slots.map((m, i) => (
          <li className="ypl-pod sq" key={i}>
            {m?.img && <img src={m.img} alt={m.name} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}
            {m && !m.img && <span className="ypl-pod-name">{m.name}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ============================== HOME ============================== */
export default function HomePage({ data, go }) {
  const heroRef = useRef(null);
  useCursorLight(heroRef);

  const reigning = useMemo(() => {
    const champs = [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0));
    return champs.length ? champs[champs.length - 1] : null;
  }, [data.champions]);

  /* 최근 결과: 저장된 회차 중 회차 번호와 우승자가 있는 것만, 최신 세 줄 */
  const recent = useMemo(() => {
    const out = [];
    for (const t of data.tournaments || []) {
      for (const r of t.rounds || []) {
        if (!r.round) continue;
        if (!String(r.win || "").trim() && !(r.winMembers || []).length) continue;
        out.push({ t, r, k: dateKey(r.date) });
      }
    }
    return out.sort((a, b) => b.k - a.k).slice(0, 3);
  }, [data.tournaments]);

  /* 대회 단계: 히어로의 주 행동과 NOW 띠가 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming;
    const today = dday === 0;
    return {
      today,
      text: `${draft.name || a.title} ${today ? "오늘 열립니다" : "참가 신청 중"}`,
      due: today ? shortDay(raw) : `${shortDay(raw)} D-${dday}`,
      dueLabel: today ? `오늘 ${shortDay(raw)}` : `${shortDay(raw)}, ${dday}일 남음`,
      to: today ? "bracket" : "news",
    };
  }, [data.announcements]);

  const primary = !now ? ["기록 보기", "records"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청하기", "news"];

  return (<div className="home">
    {/* ---------- Hero: 세 줄 문구, 소개 한 줄, 버튼 둘 ---------- */}
    <section className="hm-hero follow" ref={heroRef}>
      <span className="eyebrow">Yonsei Pokémon League</span>
      <h1><span>모든 배틀.</span><span>모든 기록.</span><span className="silver-live">모든 챔피언.</span></h1>
      <p>포켓몬 센터 연세점이 운영하는 공식 배틀 리그입니다.<br />대회 공지부터 대진표, 기록과 명예의 전당까지 이곳에서 확인하세요.</p>
      <div className="hm-hero-actions">
        <button className="ypl-btn ypl-btn--primary press" onClick={() => go(primary[1])}>{primary[0]}</button>
        <button className="ypl-btn ypl-btn--glass press" onClick={() => go("about")}>리그 소개</button>
      </div>
    </section>

    {/* ---------- NowBar: 진행 중인 대회가 없으면 그리지 않는다 ---------- */}
    {now && <Reveal tag="button" className="hm-now glass lift sq" onClick={() => go(now.to)}>
      <i className="live-dot" aria-hidden="true" />
      <span className="hm-now-text"><span className="eyebrow">Now</span><b>{now.text}</b></span>
      <span className="hm-now-due" aria-label={now.dueLabel}>{now.due}</span>
      <Arrow />
    </Reveal>}

    {/* ---------- 리그 둘러보기: 기능 카드 여섯 ---------- */}
    <section className="hm-sec" aria-labelledby="hm-explore-h">
      <SectionHead id="hm-explore-h" eyebrow="Explore" plain="리그" silver="둘러보기" />
      <div className="hm-explore">
        {EXPLORE.map(([to, eyebrow, title, desc], i) => (
          <Reveal tag="button" key={to} delay={Math.min(i, 5) * STAGGER.tile} className="hm-xcard glass lift sq" onClick={() => go(to)}>
            <span className="eyebrow hm-xcard-eb">{to === "bracket" && now?.today && <i className="live-dot" aria-hidden="true" />}{eyebrow}</span>
            <b>{title}</b>
            <span className="hm-xcard-desc">{desc}</span>
            <Arrow />
          </Reveal>
        ))}
      </div>
    </section>

    {/* ---------- 현재 챔피언과 최근 결과: 데스크톱 7:5 ---------- */}
    <div className={"hm-sec hm-duo" + (reigning ? "" : " solo")}>
      {reigning && <Reveal tag="section" aria-labelledby="hm-champ-h">
        <SectionHead id="hm-champ-h" eyebrow="Champion" plain="현재" silver="챔피언" more={["명예의 전당", () => go("champions")]} />
        <ChampionCard reigning={reigning} />
      </Reveal>}

      <Reveal tag="section" aria-labelledby="hm-results-h">
        <SectionHead id="hm-results-h" eyebrow="Results" plain="최근" silver="결과" more={["전체 기록", () => go("records")]} />
        {recent.length ? <ul className="ypl-group sq hm-results">{recent.map(({ t, r }, i) => {
          const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
          const ru = (r.ruMembers || []).length ? r.ru || "준우승 팀" : r.ru;
          return (
            <li key={i}>
              <button className="ypl-row hm-result" onClick={() => go("records")}>
                <span className="hm-round"><span className="fig silver">{r.round}</span><span className="unit">회</span></span>
                <span className="hm-result-main">
                  <span className="ypl-row__title">{t.label}</span>
                  <span className="ypl-row__meta">{[yearMonth(r.date), r.rule].filter(Boolean).join(" ")}</span>
                </span>
                <span className="hm-result-end">
                  <b>{win}</b>
                  {ru && <span className="ypl-row__meta">준우승 {ru}</span>}
                </span>
              </button>
            </li>
          );
        })}</ul>
          : <div className="ypl-empty sq"><p>아직 등록된 대회 결과가 없습니다.</p></div>}
      </Reveal>
    </div>
  </div>);
}

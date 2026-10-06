import React, { useMemo } from "react";
import { Reveal, Icon, STAGGER } from "../components/index.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";

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
const fullDay = s => { const d = dayOf(s); return d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : String(s || ""); };
const BATTLE = { singles: "싱글", doubles: "더블" };
const BRACKET = { single_elimination: "싱글 엘리미네이션", double_elimination: "더블 엘리미네이션" };
const STEPS = ["공고", "신청", "제출", "대진", "결과"];

/* 홈 첫 화면의 다음 행동. 이미 불러온 공지(site_data)의 대회 정보만 읽는다. 새 조회는 없다.
   오늘 이후의 대회가 있으면 그 대회의 단계를, 없으면 최근 대회 결과를 같은 자리에 둔다. */
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

function LeadTile({ lead }) {
  return (
    <Reveal tag="section" className="hm-lead sq" aria-labelledby="hm-lead-title">
      <div className="hm-lead-main">
        <span className="ypl-chip ypl-chip--lead">{lead.live && <i className="ypl-ping" aria-hidden="true" />}{lead.chip}</span>
        <h2 className="hm-lead-title" id="hm-lead-title">{lead.title}</h2>
        {lead.facts.length > 0 && <dl className="hm-facts">
          {lead.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>}
        <ol className="hm-steps" aria-label={`대회 단계, ${STEPS[lead.step]} 단계`}>
          {STEPS.map((s, i) => <li key={s} className={(i <= lead.step ? "on" : "") + (i === lead.step ? " now" : "")} aria-current={i === lead.step ? "step" : undefined}><i />{s}</li>)}
        </ol>
        {lead.next && <p className="hm-next"><b>{lead.next[0]}</b><span>{lead.next[1]}</span></p>}
        <div className="hm-lead-actions">
          <button className="ypl-btn ypl-btn--lg ypl-btn--on-lead press" onClick={lead.primary[1]}>{lead.primary[0]}<Icon n="arrow" size={20} /></button>
          {lead.secondary && <button className="ypl-btn ypl-btn--lg ypl-btn--lead-tonal press hm-lead-second" onClick={lead.secondary[1]}>{lead.secondary[0]}</button>}
        </div>
      </div>
      {lead.poster && <p className="hm-poster">
        <span className="num" aria-hidden="true">{lead.poster[0]}</span>
        {lead.poster[2] && <span className="unit" aria-hidden="true">{lead.poster[2]}</span>}
        <span className="sr-only">{lead.poster[1]}</span>
      </p>}
    </Reveal>
  );
}

function ListEmpty({ title, desc }) {
  return <div className="ypl-empty sq"><b>{title}</b><p>{desc}</p></div>;
}

/* ============================== HOME ============================== */
export default function HomePage({ data, go, admin }) {
  const eras = data.rankings || [];
  const ypl = eras.find(e => e.key === "era2") || eras[0];
  const top = ypl ? [...ypl.rows].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 5) : [];

  const reigning = useMemo(() => {
    const champs = [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0));
    return champs.length ? champs[champs.length - 1] : null;
  }, [data.champions]);

  /* 최근 대회 결과 — 저장된 회차 중 우승자가 확정된 것만, 최신 4건 */
  const recent = useMemo(() => {
    const out = [];
    for (const t of data.tournaments || []) {
      for (const r of t.rounds || []) {
        const win = String(r.win || "").trim();
        const winTeam = (r.winMembers || []).length > 0;
        if (!win && !winTeam) continue;
        out.push({ t, r, k: dateKey(r.date) });
      }
    }
    return out.sort((a, b) => b.k - a.k).slice(0, 4);
  }, [data.tournaments]);

  /* 공지 — 고정 공지를 먼저, 그다음 최신순 */
  const notices = useMemo(
    () => [...(data.announcements || [])].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || dateKey(b.date) - dateKey(a.date)
    ).slice(0, 5),
    [data.announcements]
  );

  const posts = useMemo(
    () => [...(data.board || [])]
      .filter(p => admin || !p.secret)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5),
    [data.board, admin]
  );

  const lead = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (upcoming) {
      const { a, draft, champions, raw, dday } = upcoming;
      const eventId = a.form.eventId;
      const canSubmit = Boolean(eventId && !champions);
      const today = dday === 0;
      const kind = [draft.isTeamEvent ? "팀전" : "개인전", BATTLE[draft.battleFormat]].filter(Boolean).join(", ");
      return {
        live: true,
        chip: today ? "오늘 대회가 열립니다" : "참가 신청 접수 중",
        title: draft.name || a.title,
        poster: today ? ["D-DAY", "오늘"] : [`D-${dday}`, `${dday}일 남음`],
        facts: [["대회일", shortDay(raw)], ["방식", BRACKET[draft.competitionFormat] || (champions ? "선발전과 본선" : "")], ["참가", kind]].filter(([, v]) => v),
        step: today ? 3 : 1,
        next: today
          ? ["대진", "경기는 YPL 디스코드에서 진행됩니다"]
          : canSubmit && draft.submissionTargetAt
            ? ["파티 제출", `${shortDay(draft.submissionTargetAt)}까지 권장`]
            : ["대회", shortDay(raw)],
        primary: today ? ["대진표 보기", () => go("bracket")] : [a.form.buttonLabel || "참가 신청하기", () => go("news")],
        secondary: today ? ["공지 읽기", () => go("news")] : canSubmit ? ["파티 제출하기", () => go("builder", { eventId })] : null,
      };
    }
    const last = recent[0];
    if (last) {
      const { t, r } = last;
      const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
      const ru = (r.ruMembers || []).length ? r.ru || "준우승 팀" : r.ru;
      const d = dayOf(r.date);
      const ym = String(r.date || "").match(/\d+/g) || [];
      return {
        live: false,
        chip: "최근 대회 결과",
        title: `${t.label}${r.round ? ` ${r.round}회` : ""}`,
        /* 기록에는 일까지 있는 날짜와 월까지만 있는 날짜가 섞여 있다. 월까지면 "8" + 단위 "월" */
        poster: d ? [`${pad(d.getMonth() + 1)}.${pad(d.getDate())}`, `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`]
          : ym.length >= 2 ? [String(+ym[1]), `${ym[0]}년 ${+ym[1]}월`, "월"] : null,
        facts: [["우승", win], ["준우승", ru], ["방식", [r.rule, r.team ? "팀전" : ""].filter(Boolean).join(", ")]].filter(([, v]) => v),
        step: 4,
        next: ["결과", `${fullDay(r.date)} 기록에 반영됨`],
        primary: ["결과 보기", () => go("records")],
        secondary: ["공지 읽기", () => go("news")],
      };
    }
    return {
      live: false, chip: "대회 준비 중", title: "다음 대회를 준비하고 있습니다", poster: null, facts: [], step: 0, next: null,
      primary: ["공지 읽기", () => go("news")], secondary: null,
    };
  }, [data.announcements, recent, go]);

  const gen = reigning ? genOf(reigning.gen) : "";
  const genNum = gen.match(/^(\d+)대$/);

  return (<div className="home">
    <h1 className="sr-only">Yonsei Pokémon League</h1>
    <LeadTile lead={lead} />

    {/* ---------- recent results ---------- */}
    {recent.length > 0 && <section className="hm-sec" aria-labelledby="hm-results-h">
      <div className="ypl-sech">
        <h2 id="hm-results-h">최근 대회 결과</h2>
        <button className="ypl-more" onClick={() => go("records")}>전체 기록<Icon n="chevr" size={16} /></button>
      </div>
      <div className="hm-results">
        {recent.map(({ t, r }, i) => {
          const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
          return (
            <Reveal tag="button" key={i} delay={i * STAGGER.tile} className="hm-result sq press press-tile" onClick={() => go("records")}>
              <span className="hm-result-date num">{fullDay(r.date)}</span>
              <span className="hm-result-title">{t.label}{r.round ? ` ${r.round}회` : ""}</span>
              <span className="hm-result-win"><span>우승</span><b>{win}</b></span>
            </Reveal>
          );
        })}
      </div>
    </section>}

    {/* ---------- ranking + champion ---------- */}
    <section className="hm-sec" aria-labelledby="hm-rank-h">
      <div className="ypl-sech">
        <h2 id="hm-rank-h">YPL 랭킹</h2>
        <button className="ypl-more" onClick={() => go("records")}>전체 랭킹<Icon n="chevr" size={16} /></button>
      </div>
      <div className="hm-rank-grid">
        {top.length ? <ol className="ypl-group sq hm-rank">{top.map((r, i) => (
          <li key={r.name}>
            <button className="ypl-row press" onClick={() => go("records")}>
              <span className="hm-rank-n num">{i + 1}</span>
              <span>
                <span className="ypl-row__title">{r.name}</span>
                <span className="ypl-row__meta">우승 {r.win || 0}, 준우승 {r.ru || 0}, 4강 {r.top4 || 0}</span>
              </span>
              <span className="hm-rank-pt"><span className="num">{(r.points || 0).toLocaleString("ko-KR")}</span><span className="unit">점</span></span>
            </button>
          </li>))}</ol>
          : <ListEmpty title="집계된 랭킹이 없습니다." desc="대회 결과가 확정되면 점수가 누적됩니다." />}

      {reigning && <Reveal tag="button" className="hm-champ sq press press-tile" onClick={() => go("champions")}>
        <span className="ypl-chip ypl-chip--ink">현 챔피언</span>
        <span className="hm-champ-gen">
          {genNum ? <><span className="num">{genNum[1]}</span><span className="unit">대</span></> : <span className="hm-champ-gen-tx">{gen}</span>}
        </span>
        <span className="hm-champ-name">{reigning.name}</span>
        <span className="hm-champ-season">{displaySeasonLabel(reigning.slabel)}</span>
        <span className="ypl-more hm-champ-more">명예의 전당<Icon n="chevr" size={16} /></span>
      </Reveal>}
      </div>
    </section>

    {/* ---------- notices + board ---------- */}
    <section className="hm-sec hm-two" aria-label="공지와 게시판">
      <div>
        <div className="ypl-sech">
          <h2>공지</h2>
          <button className="ypl-more" onClick={() => go("news")}>전체 공지<Icon n="chevr" size={16} /></button>
        </div>
        {notices.length ? <ul className="ypl-group sq">{notices.map(n => (
          <li key={n.id}>
            <button className="ypl-row press" onClick={() => go("news")}>
              <span>
                <span className="ypl-row__title">{n.title}</span>
                <span className="ypl-row__meta tnum">{n.pinned ? `고정 공지, ${fullDay(n.date)}` : fullDay(n.date)}</span>
              </span>
              <Icon n="chevr" size={16} className="hm-row-go" />
            </button>
          </li>))}</ul>
          : <ListEmpty title="등록된 공지가 없습니다." desc="새 대회가 공고되면 이곳에 표시됩니다." />}
      </div>

      <div>
        <div className="ypl-sech">
          <h2>게시판</h2>
          <button className="ypl-more" onClick={() => go("board")}>전체 보기<Icon n="chevr" size={16} /></button>
        </div>
        {posts.length ? <ul className="ypl-group sq">{posts.map(p => (
          <li key={p.id}>
            <button className="ypl-row press" onClick={() => go("board")}>
              <span>
                <span className="ypl-row__title">{p.secret && <Icon n="lock" size={16} className="hm-lock" />}{p.title || p.body || "(제목 없음)"}</span>
                <span className="ypl-row__meta tnum">{p.nick}, {String(p.createdAt || "").slice(0, 10).replace(/-/g, ".")}</span>
              </span>
              {(p.comments || []).length > 0
                ? <span className="ypl-row__end hm-post-c"><Icon n="msg" size={16} />{p.comments.length}<span className="sr-only">개 댓글</span></span>
                : <Icon n="chevr" size={16} className="hm-row-go" />}
            </button>
          </li>))}</ul>
          : <ListEmpty title="아직 글이 없습니다." desc="첫 글을 남기면 이곳에 표시됩니다." />}
      </div>
    </section>
  </div>);
}

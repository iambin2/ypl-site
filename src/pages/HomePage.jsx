import React, { useMemo } from "react";
import { Reveal, Icon, Empty } from "../components/index.js";
import { DISCORD_URL } from "../components/layout/SiteHeader.jsx";

/* 날짜 문자열을 비교 가능한 숫자로. "2026.05.02" / "2026.05" / "2024년 11월" 모두 처리한다. */
function dateKey(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n) return 0;
  const y = +(n[0] || 0), m = +(n[1] || 0), d = +(n[2] || 0);
  return y * 10000 + m * 100 + d;
}
const genOf = g => String(g || "").replace(/\s*챔피언\s*$/, "");
/* YPL 시즌은 3월 1일·9월 1일에 넘어간다. 2026-09-01 = 시즌 3 (ARCHITECTURE.md §8). */
function currentYplSeason(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const half = y * 2 + (m >= 9 ? 1 : m >= 3 ? 0 : -1);
  const season = 3 + half - (2026 * 2 + 1);
  return season >= 3 ? season : null;
}
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function dateParts(s) {
  const n = String(s || "").match(/\d+/g) || [];
  const y = n[0] || "", m = n[1] ? n[1].padStart(2, "0") : "", d = n[2] ? n[2].padStart(2, "0") : "";
  const day = y && m && d ? new Date(+y, +m - 1, +d).getDay() : null;
  return { y, m, d, weekday: day == null || Number.isNaN(day) ? "" : WEEKDAY[day] + "요일" };
}

/* ============================== HOME ============================== */
export default function HomePage({ data, go, admin }) {
  const eras = data.rankings || [];
  const ypl = eras.find(e => e.key === "era2") || eras[0];
  const top = ypl ? [...ypl.rows].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 5) : [];

  const champs = useMemo(
    () => [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0)),
    [data.champions]
  );
  const shown = champs.slice(-6);
  const reigning = champs.length ? champs[champs.length - 1] : null;


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

  /* 기록 탭의 "전체 N회차" 와 같은 수를 센다. */
  const rounds = useMemo(
    () => (data.tournaments || []).reduce((n, t) => n + (t.rounds || []).length, 0),
    [data.tournaments]
  );
  const season = currentYplSeason();

  /* 다음 대회 / 최신 공지 — 고정 공지를 우선하고, 그 다음 최신순 */
  const news = useMemo(
    () => [...(data.announcements || [])].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || dateKey(b.date) - dateKey(a.date)
    )[0],
    [data.announcements]
  );
  const accepting = !!(news && news.form && news.form.enabled && (news.form.fields || []).length);
  const nd = dateParts(news && news.date);

  const posts = useMemo(
    () => [...(data.board || [])]
      .filter(p => admin || !p.secret)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5),
    [data.board, admin]
  );

  return (<div className="home">
    {/* ---------- hero ---------- */}
    <section className="hm-hero">
      <Reveal className="hm-hero-copy">
        <h1 className="hm-title" aria-label="Yonsei Pokémon League">
          <span>Yonsei</span><span>Pokémon</span><span>League</span>
        </h1>
        <p className="hm-lead">{data.meta.tagline}</p>
        <div className="hm-cta">
          <button className="btn btn-primary hm-btn" onClick={() => go("records")}>기록 보기<Icon n="arrow" size={16} /></button>
          <button className="btn btn-ghost hm-btn" onClick={() => go("about")}>리그 소개</button>
        </div>
        <div className="hm-facts"><p className="tnum">
          {season && <span>YPL 시즌 {season} 진행 중</span>}<span>2023.05 창설</span><span>기록된 대회 {rounds}회</span>{champs.length > 0 && <span>역대 챔피언 {champs.length}명</span>}
        </p></div>
      </Reveal>

      {news && <Reveal tag="button" delay={120} className="hm-event" onClick={() => go("news")}>
        <span className="hm-event-date tnum">
          <b>{nd.m}.{nd.d}</b>
          <small>{nd.y}{nd.weekday && ` · ${nd.weekday}`}</small>
        </span>
        <span className="hm-event-body">
          <span className="hm-event-t">{news.title}</span>
          {accepting
            ? <span className="hm-live"><i />참가 신청 접수 중</span>
            : <span className="hm-event-meta">{news.pinned ? "고정 공지" : "최신 공지"}</span>}
        </span>
        <span className="hm-event-go">
          {accepting ? (news.form.buttonLabel || "참가 신청하기") : "공지 읽기"}<Icon n="arrow" size={16} />
        </span>
      </Reveal>}
    </section>

    {/* ---------- recent results ---------- */}
    {recent.length > 0 && <section className="hm-sec">
      <Reveal className="sech">
        <h2>최근 대회 결과</h2>
        <button className="more" onClick={() => go("records")}>전체 기록<Icon n="chevr" size={15} /></button>
      </Reveal>
      <div className="hm-results">
        {recent.map(({ t, r }, i) => {
          const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
          const ru = (r.ruMembers || []).length ? r.ru || "준우승 팀" : r.ru;
          const meta = [r.rule || "", r.team ? "팀전" : ""].filter(Boolean).join(" · ");
          return (
            <Reveal tag="button" key={i} delay={i * 60} className={"hm-result" + (r.champ ? " major" : "")} onClick={() => go("records")}>
              <span className="hm-result-top tnum">
                <span>{r.date}</span>
                {r.champ && <span className="hm-major">챔피언스 시리즈</span>}
              </span>
              <span className="hm-result-name">{t.label}{r.round ? ` ${r.round}회` : ""}</span>
              <span className="hm-result-meta">{meta || " "}</span>
              <span className="hm-podium">
                <span className="win"><small><Icon n="trophy" size={13} />우승</small><b>{win}</b></span>
                {ru && <span><small>준우승</small><b>{ru}</b></span>}
              </span>
            </Reveal>
          );
        })}
      </div>
    </section>}

    {/* ---------- standings + board ---------- */}
    <section className="hm-sec hm-two">
      <div>
        <Reveal className="sech">
          <h2>YPL 랭킹</h2>
          <button className="more" onClick={() => go("records")}>전체 랭킹<Icon n="chevr" size={15} /></button>
        </Reveal>
        {top.length ? <ol className="hm-rank">{top.map((r, i) => (
          <Reveal tag="li" key={i} delay={i * 40}>
            <button className={"hm-rank-row" + (i === 0 ? " one" : "")} onClick={() => go("records")}>
              <span className="hm-rank-n">{i + 1}</span>
              <span className="hm-rank-who">
                <b>{r.name}</b>
                <span className="tnum">우승 {r.win || 0} · 준우승 {r.ru || 0} · 4강 {r.top4 || 0}</span>
              </span>
              <span className="hm-rank-pt">{r.points}<em>pt</em></span>
            </button>
          </Reveal>))}</ol>
          : <Empty icon="medal" title="집계된 랭킹이 없습니다" desc="대회 결과가 확정되면 점수가 누적됩니다." />}
      </div>

      <div>
        <Reveal className="sech">
          <h2>게시판</h2>
          <button className="more" onClick={() => go("board")}>전체 보기<Icon n="chevr" size={15} /></button>
        </Reveal>
        {posts.length ? <ul className="hm-posts">{posts.map((p, i) => (
          <Reveal tag="li" key={p.id} delay={i * 40}>
            <button className="hm-post" onClick={() => go("board")}>
              <span className="hm-post-t">{p.secret && <Icon n="lock" size={13} />}{p.title || p.body || "(제목 없음)"}</span>
              <span className="hm-post-m tnum">
                <span>{p.nick}</span>
                <span>{String(p.createdAt || "").slice(0, 10).replace(/-/g, ".")}</span>
                {(p.comments || []).length > 0 && <span className="hm-post-c"><Icon n="msg" size={12} />{p.comments.length}</span>}
              </span>
            </button>
          </Reveal>))}</ul>
          : <Empty icon="list" title="아직 글이 없습니다" desc="첫 글을 남기면 이곳에 표시됩니다." />}
      </div>
    </section>

    {/* ---------- hall of fame ---------- */}
    {shown.length > 0 && <section className="hm-sec">
      <Reveal className="sech">
        <h2>명예의 전당</h2>
        <button className="more" onClick={() => go("champions")}>우승 엔트리 보기<Icon n="chevr" size={15} /></button>
      </Reveal>
      <Reveal className="hm-hof" style={{ "--n": shown.length }}>
        {shown.map(c => {
          const now = c === reigning;
          return (
            <button key={c.id} className={"hm-hof-cell" + (now ? " now" : "")} onClick={() => go("champions")}>
              <span className="nm">{c.name}{now && <><Icon n="crown" size={16} /><span className="sr-only">현 챔피언</span></>}</span>
              <span className="s">{genOf(c.gen)} · {c.slabel}</span>
            </button>
          );
        })}
      </Reveal>
    </section>}

    {/* ---------- community ---------- */}
    <Reveal tag="section" className="hm-join">
      <div>
        <h2>배틀과 중계는<br />디스코드에서 열립니다.</h2>
        <p>대진이 확정되면 경기는 YPL 디스코드에서 진행되고 실시간으로 중계됩니다.</p>
      </div>
      <a className="btn btn-brand hm-btn" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
        <Icon n="discord" size={17} />디스코드 참여
      </a>
    </Reveal>
  </div>);
}

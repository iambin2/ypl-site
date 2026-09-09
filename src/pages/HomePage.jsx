import React, { useMemo } from "react";
import { Reveal, Icon } from "../components/index.js";

/* 날짜 문자열을 비교 가능한 숫자로. "2026.05.02" / "2026.05" / "2024년 11월" 모두 처리한다. */
function dateKey(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n) return 0;
  const y = +(n[0] || 0), m = +(n[1] || 0), d = +(n[2] || 0);
  return y * 10000 + m * 100 + d;
}

/* ============================== HOME ============================== */
export default function HomePage({ data, go, admin }) {
  const eras = data.rankings || [];
  const ypl = eras.find(e => e.key === "era2") || eras[0];
  const top3 = ypl ? [...ypl.rows].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 3) : [];
  const maxPts = top3.length ? Math.max(...top3.map(r => r.points || 0)) || 1 : 1;

  const champs = useMemo(
    () => [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0)),
    [data.champions]
  );
  const shown = champs.slice(-6);
  const lastSeason = champs.length ? champs[champs.length - 1].season : null;

  /* 최근 대회 결과 — 저장된 회차 중 우승자가 확정된 것만, 최신 3건 */
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
    return out.sort((a, b) => b.k - a.k).slice(0, 3);
  }, [data.tournaments]);

  /* 다음 대회 / 최신 공지 — 고정 공지를 우선하고, 그 다음 최신순 */
  const news = useMemo(
    () => [...(data.announcements || [])].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || dateKey(b.date) - dateKey(a.date)
    )[0],
    [data.announcements]
  );
  const accepting = !!(news && news.form && (news.form.fields || []).length);

  const posts = useMemo(
    () => [...(data.board || [])]
      .filter(p => admin || !p.secret)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 3),
    [data.board, admin]
  );

  return (<section className="home">
    <div className="home-top">
      <Reveal className="home-hero">
        <h1 className="disp mark">YPL</h1>
        <span className="home-en">YONSEI POKÉMON LEAGUE</span>
        <p className="home-tag">{data.meta.tagline}</p>
      </Reveal>

      {news && <Reveal tag="button" className="nextev" delay={60} onClick={() => go("news")}>
        <span className="nextev-k">
          <b>{accepting ? "다음 대회" : "최신 공지"}</b>
          <span>공지 보기<Icon n="arrow" size={14} /></span>
        </span>
        <span className="nextev-d tnum">{news.date}</span>
        <span className="nextev-t">{news.title}</span>
        {news.body && <span className="nextev-b">{news.body}</span>}
        <span className="nextev-cta">
          <span className="btn btn-primary btn-sm">
            {accepting ? (news.form.buttonLabel || "참가 신청하기") : "공지 읽기"}
          </span>
          <span className="btn btn-ghost btn-sm">전체 공지</span>
        </span>
      </Reveal>}
    </div>

    {recent.length > 0 && <section className="home-sec">
      <Reveal className="sech">
        <h2>최근 대회 결과</h2>
        <button className="more" onClick={() => go("records")}>전체 기록<Icon n="arrow" size={14} /></button>
      </Reveal>
      <div className="reslist">
        {recent.map(({ t, r }, i) => {
          const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
          const ru = (r.ruMembers || []).length ? r.ru || "준우승 팀" : r.ru;
          const meta = [r.champ ? "챔피언스 시리즈" : "", r.rule || "", r.team ? "팀전" : ""]
            .filter(Boolean).join(" · ");
          return (
            <Reveal tag="button" key={i} delay={i * 50} className="resrow" onClick={() => go("records")}>
              <span className="d tnum">{r.date}</span>
              <span className="ev"><b>{t.label}{r.round ? ` · ${r.round}회` : ""}</b><span>{meta}</span></span>
              <span className="pl win"><small>우승</small><b>{win}</b></span>
              <span className="pl">{ru ? <><small>준우승</small><b>{ru}</b></> : null}</span>
              <span className="go"><Icon n="arrow" size={16} /></span>
            </Reveal>
          );
        })}
      </div>
    </section>}

    <section className="home-sec home-two">
      <div>
        <Reveal className="sech">
          <h2>게시판<small>최근 글</small></h2>
          <button className="more" onClick={() => go("board")}>전체 보기<Icon n="arrow" size={14} /></button>
        </Reveal>
        {posts.length ? <div className="postlist">{posts.map((p, i) => (
          <Reveal tag="button" key={p.id} delay={i * 50} className="postrow" onClick={() => go("board")}>
            <b>{p.secret && <Icon n="lock" size={14} />}{p.title || p.body || "(제목 없음)"}</b>
            <span><em>{p.nick}</em></span>
          </Reveal>))}</div>
          : <div className="hc-empty">아직 글이 없습니다.</div>}
      </div>

      <div>
        <Reveal className="sech">
          <h2>YPL 랭킹<small>누적</small></h2>
          <button className="more" onClick={() => go("records")}>전체 랭킹<Icon n="arrow" size={14} /></button>
        </Reveal>
        {top3.length ? <div className="hrank">{top3.map((r, i) => (
          <Reveal tag="button" key={i} delay={i * 50} className={"hrrow" + (i === 0 ? " top" : "")} onClick={() => go("records")}>
            <span className="n tnum">{i + 1}</span>
            <span className="who"><b>{r.name}</b>
              <span className="tnum">우승 {r.win || 0} · 준우승 {r.ru || 0} · 4강 {r.top4 || 0}</span></span>
            <span className="pts tnum">{r.points}<em>pt</em></span>
            <span className="hbar"><i style={{ width: Math.max(4, Math.round((r.points || 0) / maxPts * 100)) + "%" }} /></span>
          </Reveal>))}</div>
          : <div className="hc-empty">데이터 없음</div>}
      </div>
    </section>

    {champs.length > 0 && <section className="home-sec">
      <Reveal className="sech">
        <h2>명예의 전당<small>챔피언스 시리즈 우승자</small></h2>
        <button className="more" onClick={() => go("champions")}>우승 엔트리 보기<Icon n="arrow" size={14} /></button>
      </Reveal>
      <div className="hoftl" style={{ "--hof-n": Math.min(6, shown.length) }}>
        {shown.map(c => (
          <button key={c.id} className={"hofc" + (c.season === lastSeason ? " now" : "")} onClick={() => go("champions")}>
            <span className="g">{c.gen}{c.season === lastSeason ? " · 현 챔피언" : ""}</span>
            <span className="nm">{c.name}</span>
            <span className="s">{c.slabel}</span>
          </button>))}
      </div>
    </section>}
  </section>);
}

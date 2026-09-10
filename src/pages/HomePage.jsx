import React, { useMemo } from "react";
import { Reveal, Icon } from "../components/index.js";

/* 날짜 문자열을 비교 가능한 숫자로. "2026.05.02" / "2026.05" / "2024년 11월" 모두 처리한다. */
function dateKey(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n) return 0;
  const y = +(n[0] || 0), m = +(n[1] || 0), d = +(n[2] || 0);
  return y * 10000 + m * 100 + d;
}

/* 히어로의 재질 — 리그 자신의 도형. 그라디언트가 아니라 헤어라인으로 그린 8시드 대진표. */
function BracketArt() {
  return (
    <div className="home-art" aria-hidden="true">
      <svg viewBox="0 0 600 560" fill="none" stroke="currentColor"
        strokeWidth="1" strokeLinecap="square">
        <path d="M0 25h110M0 95h110M0 165h110M0 235h110M0 305h110M0 375h110M0 445h110M0 515h110" />
        <path d="M110 25v70M110 165v70M110 305v70M110 445v70" />
        <path d="M110 60h140M110 200h140M110 340h140M110 480h140" />
        <path d="M250 60v140M250 340v140" />
        <path d="M250 130h140M250 410h140" />
        <path d="M390 130v280" />
        <path d="M390 270h108" />
        <circle cx="528" cy="270" r="30" />
      </svg>
    </div>
  );
}

/* ============================== HOME ============================== */
export default function HomePage({ data, go, admin }) {
  const eras = data.rankings || [];
  const ypl = eras.find(e => e.key === "era2") || eras[0];
  const top4 = ypl ? [...ypl.rows].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 4) : [];

  const champs = useMemo(
    () => [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0)),
    [data.champions]
  );
  const shown = champs.slice(-6);
  const lastSeason = champs.length ? champs[champs.length - 1].season : null;

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

  /* 콜로폰 — 등록부의 판권장. 큰 숫자를 늘어놓는 대신 한 줄로 읽힌다. */
  const colophon = useMemo(() => {
    let rounds = 0;
    for (const t of data.tournaments || []) rounds += (t.rounds || []).length;
    const names = new Set();
    for (const e of data.rankings || []) for (const r of e.rows || []) if (r.name) names.add(r.name);
    const last = champs.length ? champs[champs.length - 1] : null;
    return {
      rounds,
      trainers: names.size,
      season: last ? (last.slabel || ("SEASON " + last.season)) : "",
    };
  }, [data.tournaments, data.rankings, champs]);

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
      .slice(0, 4),
    [data.board, admin]
  );

  return (<section className="home">
    <div className="home-band">
      <div className="home-rules" aria-hidden="true" />
      <BracketArt />
      <div className="home-top">
        <Reveal className="home-hero">
          <h1 className="disp mark">YPL</h1>
          <span className="home-en">YONSEI POKÉMON LEAGUE</span>
          <p className="home-tag">{data.meta.tagline}</p>
          <div className="home-colophon">
            <span><b className="tnum">2023.05</b> 창설</span><i />
            <span>정규 대회 <b className="tnum">{colophon.rounds}</b>회</span><i />
            <span>등록 트레이너 <b className="tnum">{colophon.trainers}</b>명</span>
            {colophon.season && <><i /><span>현 시즌 <b>{colophon.season}</b></span></>}
          </div>
        </Reveal>

        {news && <Reveal tag="button" className="nextev y-plate-raised" delay={60} onClick={() => go("news")}>
          <span className="nextev-k">
            <span className="nextev-live"><i />{accepting ? "다음 대회" : "최신 공지"}</span>
            <span className="more">공지 전체<Icon n="arrow" size={13} /></span>
          </span>
          <span className="nextev-d tnum">{news.date}</span>
          <span className="nextev-t">{news.title}</span>
          {news.body && <span className="nextev-b">{news.body}</span>}
          <span className="nextev-cta">
            <span className="y-btn y-btn-primary">
              {accepting ? (news.form.buttonLabel || "참가 신청하기") : "공지 읽기"}
            </span>
            <span className="y-btn y-btn-secondary">전체 공지</span>
          </span>
        </Reveal>}
      </div>
    </div>

    {recent.length > 0 && <section className="home-sec">
      <Reveal className="sech">
        <h2>최근 대회 결과</h2>
        <button className="more" onClick={() => go("records")}>전체 기록<Icon n="arrow" size={13} /></button>
      </Reveal>
      <div className="y-rows">
        {recent.map(({ t, r }, i) => {
          const win = (r.winMembers || []).length ? r.win || "우승 팀" : r.win;
          const ru = (r.ruMembers || []).length ? r.ru || "준우승 팀" : r.ru;
          /* 챔피언스 시리즈는 배지가 아니라 이 행의 부제로 표시한다. */
          const meta = r.champ
            ? "챔피언스 시리즈"
            : [r.rule || "", r.team ? "팀전" : ""].filter(Boolean).join(" · ");
          return (
            <Reveal tag="button" key={i} delay={i * 40} className="y-row" onClick={() => go("records")}>
              <span className="y-row-rail tnum">{r.date}</span>
              <span className="y-row-main">
                <b>{t.label}{r.round ? ` · ${r.round}회` : ""}</b>
                {meta && <span className={r.champ ? "major" : ""}>{meta}</span>}
              </span>
              <span className="y-row-aside">
                <span className="y-kv win"><small>우승</small><b>{win}</b></span>
                {ru && <span className="y-kv"><small>준우승</small><b>{ru}</b></span>}
              </span>
              <span className="y-row-chev"><Icon n="arrow" size={16} /></span>
            </Reveal>
          );
        })}
      </div>
    </section>}

    <section className="home-sec home-two">
      <div>
        <Reveal className="sech">
          <h2>게시판<small>최근 글</small></h2>
          <button className="more" onClick={() => go("board")}>전체 보기<Icon n="arrow" size={13} /></button>
        </Reveal>
        {posts.length ? <div className="y-rows">{posts.map((p, i) => (
          <Reveal tag="button" key={p.id} delay={i * 40} className="y-row post-row" onClick={() => go("board")}>
            <span className="y-row-rail tnum" style={{ textAlign: "center" }}>
              {String(p.createdAt || "").slice(5, 10).replace("-", ".")}
            </span>
            <span className="y-row-main">
              <b>{p.secret && <Icon n="lock" size={13} />}{p.title || p.body || "(제목 없음)"}</b>
              <span>{p.nick}</span>
            </span>
            <span className="y-row-aside" />
            <span className="y-row-chev"><Icon n="arrow" size={16} /></span>
          </Reveal>))}</div>
          : <div className="y-empty home-empty">
            <div className="y-empty-mark"><Icon n="list" size={20} /></div>
            <div>
              <h3>아직 글이 없습니다</h3>
              <p>첫 글을 남기면 이곳에 표시됩니다.</p>
            </div>
          </div>}
      </div>

      <div>
        <Reveal className="sech">
          <h2>YPL 랭킹<small>누적</small></h2>
          <button className="more" onClick={() => go("records")}>전체 랭킹<Icon n="arrow" size={13} /></button>
        </Reveal>
        {top4.length ? <div className="y-rows">{top4.map((r, i) => (
          <Reveal tag="button" key={i} delay={i * 40} className="y-row hrank-row" onClick={() => go("records")}>
            <span className={"hrank-n tnum" + (i === 0 ? " one" : "")}>{i + 1}</span>
            <span className="y-row-main">
              <b>{r.name}</b>
              <span className="tnum">우승 {r.win || 0} · 준우승 {r.ru || 0} · 4강 {r.top4 || 0}</span>
            </span>
            <span className={"hrank-pt tnum" + (i === 0 ? " one" : "")}>{r.points}<em>pt</em></span>
          </Reveal>))}</div>
          : <div className="y-empty home-empty">
            <div className="y-empty-mark"><Icon n="medal" size={20} /></div>
            <div><h3>집계된 랭킹이 없습니다</h3><p>대회 결과가 확정되면 점수가 누적됩니다.</p></div>
          </div>}
      </div>
    </section>

    {champs.length > 0 && <section className="home-sec">
      <Reveal className="sech">
        <h2>명예의 전당<small>챔피언스 시리즈 우승자</small></h2>
        <button className="more" onClick={() => go("champions")}>우승 엔트리 보기<Icon n="arrow" size={13} /></button>
      </Reveal>
      <div className="y-plate home-champstrip" style={{ "--hof-n": Math.min(6, shown.length) }}>
        {shown.map(c => (
          <button key={c.id} className={"hcell" + (c.season === lastSeason ? " now" : "")} onClick={() => go("champions")}>
            <span className="g">{c.gen}{c.season === lastSeason ? " · 현 챔피언" : ""}</span>
            <span className="nm">{c.name}</span>
            <span className="s">{c.slabel}</span>
          </button>))}
      </div>
    </section>}
  </section>);
}

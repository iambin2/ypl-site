import React, { useEffect, useState } from "react";
import { Reveal, Icon } from "../components/index.js";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  generationNumberFromLegacyLabel,
  legacyChampionLabel,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";

/* ============================== CHAMPIONS ==============================
   현 챔피언은 여섯 장 중 한 장이 아니다. 큰 판 하나 + 역대 등록부 목록.       */
export default function ChampionsPage({ data, admin, setModal, normTeam, go }) {
  const [normalizedChamps, setNormalizedChamps] = useState(null);
  const [artworkLookup, setArtworkLookup] = useState(null);
  const normalizedEnabled = championsOperationsEnabled();
  useEffect(() => {
    let cancelled = false;
    if (!normalizedEnabled) return undefined;
    fetchNormalizedChampionsHallOfFame()
      .then(rows => { if (!cancelled) setNormalizedChamps(rows); })
      .catch(error => { console.warn("normalized Champions read failed", error); if (!cancelled) setNormalizedChamps([]); });
    return () => { cancelled = true; };
  }, [normalizedEnabled]);
  useEffect(() => {
    let cancelled = false;
    loadHallOfFameArtworkLookup()
      .then(lookup => { if (!cancelled) setArtworkLookup(lookup); })
      .catch(() => { if (!cancelled) setArtworkLookup(new Map()); });
    return () => { cancelled = true; };
  }, []);
  const legacyChamps = Array.isArray(data.champions) ? data.champions : [];
  const remoteRows = Array.isArray(normalizedChamps) ? normalizedChamps : [];
  const legacyByGeneration = new Map();
  for (const row of remoteRows.filter(row => row.kind === "legacy")) legacyByGeneration.set(row.generationNumber, row);
  for (const row of legacyChamps) {
    legacyByGeneration.set(generationNumberFromLegacyLabel(row.gen), {
      ...row,
      kind: "legacy",
      generationNumber: generationNumberFromLegacyLabel(row.gen),
    });
  }
  const champs = [
    ...legacyByGeneration.values(),
    ...remoteRows.filter(row => row.kind === "normalized"),
  ].sort((a, b) => Number(a.generationNumber || 0) - Number(b.generationNumber || 0)
    || String(a.format || "").localeCompare(String(b.format || "")));

  const [pop, setPop] = useState(null);
  useEffect(() => {
    if (!pop) return;
    const f = (e) => { if (e.key === "Escape") setPop(null); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [pop]);

  const genLabel = c => (c.kind === "normalized" ? c.gen : legacyChampionLabel(c.gen));
  const seasonLabel = c => c.slabel || ("SEASON " + c.season);

  const reigning = champs.length ? champs[champs.length - 1] : null;
  const past = champs.slice(0, -1).reverse();
  const reigningTeam = reigning ? normTeam(reigning.team).filter(m => m.name || m.img || m.pokemonId) : [];

  return (<section className="sec">
    <Reveal className="sec-head">
      <div>
        <h2>명예의 전당</h2>
        <p className="sub">챔피언스 시리즈를 제패한 역대 챔피언과 그날의 우승 엔트리를 보관합니다.</p>
      </div>
      <div className="y-page-aside">
        <span className="y-chip y-chip-ghost">역대 챔피언 <b className="tnum" style={{ marginLeft: 4 }}>{champs.length}</b>명</span>
        {admin && <button className="y-btn y-btn-secondary" onClick={() => setModal({ type: "champion" })}>
          <Icon n="plus" size={13} />레거시 챔피언 추가
        </button>}
      </div>
    </Reveal>

    {reigning && <Reveal className="reign">
      <div className="reign-l">
        <span className="reign-crown" aria-hidden="true"><Icon n="crown" size={22} /></span>
        <h3 className="reign-name">{reigning.name}</h3>
        <div className="reign-season">현 챔피언 · {genLabel(reigning)} · {seasonLabel(reigning)}</div>
        <button className="btn btn-primary reign-cta" onClick={() => setPop(reigning)}>
          우승 엔트리 크게 보기<Icon n="arrow" size={15} />
        </button>
      </div>
      <ol className="reign-team" aria-label="우승 엔트리">
        {reigningTeam.map((m, j) => {
          const fallback = resolveHallOfFameArtwork(m, artworkLookup); const img = m.img || fallback;
          return (
            <li className="reign-mon" key={j} style={{ "--i": j }}>
              <span className="reign-mon-art">{img
                ? <img src={img} alt="" loading="lazy" decoding="async" onError={event => { if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; else event.currentTarget.style.visibility = "hidden"; }} />
                : <em>{(m.name || "").slice(0, 2)}</em>}</span>
              <b>{m.name}</b>
            </li>
          );
        })}
      </ol>
    </Reveal>}

    {past.length > 0 && <section className="hof-past">
      <div className="sech">
        <h2>역대 챔피언</h2>
        <span className="y-label">즉위 순 · 최신 → 초대</span>
      </div>
      <div className="y-rows">
        {past.map((c, i) => {
          const team = normTeam(c.team).filter(m => m.name);
          return (
            <Reveal tag="button" key={c.id || i} delay={i * 40} className="y-row reg-row"
              onClick={() => setPop(c)} aria-label={c.name + " 우승 엔트리 보기"}>
              <span className="reg-ord">{genLabel(c)}</span>
              <span className="reg-id">
                <span className="reg-name">{c.name}</span>
                <span className="reg-season">{seasonLabel(c)}</span>
              </span>
              <span className="reg-entry">
                {team.map((m, j) => <span key={j}>{m.name}</span>)}
              </span>
              <span className="y-row-chev"><Icon n="arrow" size={16} /></span>
            </Reveal>
          );
        })}
      </div>
      {admin && <div className="hof-admin">
        {past.filter(c => c.kind !== "normalized").map(c => (
          <button key={"e" + c.id} className="y-btn y-btn-quiet" onClick={() => setModal({ type: "champion", item: c })}>
            <Icon n="edit" size={13} />{c.name} 수정
          </button>
        ))}
      </div>}
    </section>}

    {pop && <div className="overlay" onClick={() => setPop(null)}>
      <div className="modal hof-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${pop.name} 우승 엔트리`}>
        <div className="hofm-bar">
          <button type="button" className="hofm-x" onClick={() => setPop(null)} aria-label="닫기"><Icon n="x" size={14} /></button>
        </div>
        <div className="hofm-top">
          <div className="hofm-nm">{pop.name}</div>
          <div className="hofm-gen">{genLabel(pop)} · {seasonLabel(pop)} 우승 엔트리</div>
        </div>
        <div className="hofm-team">{normTeam(pop.team).filter(m => m.name || m.img || m.pokemonId).map((m, j) => {
          const fallback = resolveHallOfFameArtwork(m, artworkLookup); const img = m.img || fallback; return (
            <div className={"hofm-poke" + (img ? "" : " noimg")} key={j} style={{ animationDelay: (j * 70) + "ms" }}>
              <div className="hofm-sp">{img ? <img src={img} alt={m.name} loading="lazy" decoding="async" onError={event => { if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} /> : <span className="hofm-ph">{(m.name || "").slice(0, 2)}</span>}</div>
              <div className="hofm-pn">{m.name}</div>
            </div>);
        })}</div>
        <div className="modal-actions"><button className="y-btn y-btn-primary" onClick={() => setPop(null)}>닫기</button></div>
      </div>
    </div>}
  </section>);
}

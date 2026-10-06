import React, { useEffect, useRef, useState } from "react";
import { normTeam as normalizeLegacyParty } from "../services/legacyPartyImages.js";
import { Icon, PageHead, Reveal, STAGGER, SectionHead, ordinal, useExitAnimation } from "../components/index.js";
import useCursorLight from "../components/common/useCursorLight.js";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  generationNumberFromLegacyLabel,
  legacyChampionLabel,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";

/* ============================== CHAMPIONS ==============================
   현 챔피언은 화면에 하나뿐인 피처 카드(우승 파티 여섯 받침), 역대 챔피언은 유리 목록. */
export default function ChampionsPage({ data, admin, setModal, normTeam = normalizeLegacyParty, go }) {
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

  const leadRef = useRef(null);
  useCursorLight(leadRef);
  const [pop, setPop] = useState(null);
  useEffect(() => {
    if (!pop) return;
    const f = (e) => {
      if (e.key !== "Escape") return;
      const live = document.querySelectorAll(".overlay:not(.is-closing)");
      if (live[live.length - 1]?.querySelector(".hof-modal")) setPop(null);
    };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [pop]);

  const genLabel = c => (c.kind === "normalized" ? c.gen : legacyChampionLabel(c.gen));
  const seasonLabel = c => displaySeasonLabel(c.slabel) || ("시즌 " + c.season);

  const reigning = champs.length ? champs[champs.length - 1] : null;
  const past = champs.slice(0, -1).reverse();
  const reigningTeam = reigning ? normTeam(reigning.team).filter(m => m.name || m.img || m.pokemonId) : [];
  const teamNames = c => normTeam(c.team).filter(m => m.name).map(m => m.name).join(", ");

  const reigningSlots = [...reigningTeam, ...Array(Math.max(0, 6 - reigningTeam.length)).fill(null)];

  return (<section className="sec">
    <PageHead eyebrow="Hall of Fame" plain="명예의" silver="전당" desc="챔피언스 시리즈를 제패한 역대 챔피언과 그날의 우승 엔트리를 보관합니다.">
      {admin && <button className="ypl-btn ypl-btn--tonal ypl-btn--sm press" onClick={() => setModal({ type: "champion" })}>
        <Icon n="plus" size={13} />이전 챔피언 추가
      </button>}
    </PageHead>

    {reigning && <section className="ypl-feature glass sq follow" ref={leadRef} aria-labelledby="hof-reigning">
      {reigning.generationNumber > 0 && <span className="ypl-feature-wm silver-live" aria-hidden="true">{reigning.generationNumber}</span>}
      <div className="ypl-feature-who">
        <span className="eyebrow">{reigning.generationNumber > 0 ? `${ordinal(reigning.generationNumber)} Champion` : "Champion"}</span>
        <h3 className="ypl-feature-name silver-live" id="hof-reigning">{reigning.name}</h3>
        <span className="ypl-feature-sub">{seasonLabel(reigning)} 챔피언</span>
      </div>
      <ol className="ypl-pods" aria-label="우승 엔트리">
        {reigningSlots.map((m, j) => {
          const fallback = m && resolveHallOfFameArtwork(m, artworkLookup); const img = m && (m.img || fallback);
          return (
            <li className="ypl-pod sq" key={j}>
              {img && <img src={img} alt={m.name || ""} loading="lazy" decoding="async" onError={event => { if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; else event.currentTarget.style.visibility = "hidden"; }} />}
              {m && !img && <span className="ypl-pod-name">{m.name}</span>}
            </li>
          );
        })}
      </ol>
      <button className="ypl-btn ypl-btn--primary press rc-lead-cta" onClick={() => setPop(reigning)}>
        우승 엔트리 크게 보기<Icon n="arrow" size={15} />
      </button>
    </section>}

    {past.length > 0 && <section className="hof-past">
      <SectionHead eyebrow="Champions" plain="역대" silver="챔피언" />
      <Reveal tag="ol" className="ypl-group sq">
        {past.map((c, i) => (
          <li key={c.id || i}>
            <button className="ypl-row hof-row" onClick={() => setPop(c)} aria-label={c.name + " 우승 엔트리 보기"}>
              <span className="hof-gen">{c.generationNumber > 0
                ? <><span className="fig silver">{c.generationNumber}</span><span className="unit">대</span></>
                : <span className="unit">{genLabel(c)}</span>}</span>
              <span className="hof-main">
                <span className="ypl-row__title">{c.name}</span>
                <span className="ypl-row__meta">{seasonLabel(c)} 우승</span>
                {teamNames(c) && <span className="ypl-row__meta hof-entry">{teamNames(c)}</span>}
              </span>
              <Icon n="chevr" size={16} className="hof-chev" />
            </button>
          </li>
        ))}
      </Reveal>
      {admin && <div className="hof-admin">
        {past.filter(c => c.kind !== "normalized").map(c => (
          <button key={"e" + c.id} className="ypl-btn ypl-btn--tonal ypl-btn--sm press" onClick={() => setModal({ type: "champion", item: c })}>
            <Icon n="edit" size={13} />{c.name} 수정
          </button>
        ))}
      </div>}
    </section>}

    {pop && <HofOverlay onClose={() => setPop(null)}>
      <div className="modal hof-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${pop.name} 우승 엔트리`}>
        <div className="hofm-bar">
          <button type="button" className="hofm-x" onClick={() => setPop(null)} aria-label="닫기"><Icon n="x" size={14} /></button>
        </div>
        <div className="hofm-top">
          <div className="hofm-nm">{pop.name}</div>
          <div className="hofm-gen">{genLabel(pop)}의 {seasonLabel(pop)} 우승 엔트리</div>
        </div>
        <div className="hofm-team">{normTeam(pop.team).filter(m => m.name || m.img || m.pokemonId).map((m, j) => {
          const fallback = resolveHallOfFameArtwork(m, artworkLookup); const img = m.img || fallback; return (
            <div className={"hofm-poke sq" + (img ? "" : " noimg")} key={j} style={{ animationDelay: (j * STAGGER.tile) + "ms" }}>
              <div className="hofm-sp">{img ? <img src={img} alt={m.name} loading="lazy" decoding="async" onError={event => { if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} /> : <span className="hofm-ph">{(m.name || "").slice(0, 2)}</span>}</div>
              <div className="hofm-pn">{m.name}</div>
            </div>);
        })}</div>
        <div className="modal-actions"><button className="ypl-btn ypl-btn--primary press" onClick={() => setPop(null)}>닫기</button></div>
      </div>
    </HofOverlay>}
  </section>);
}

/* 명예의 전당 엔트리 창도 다른 대화상자와 같은 닫힘 애니메이션과 스크롤 잠금을 쓴다. */
function HofOverlay({ onClose, children }) {
  const ref = useRef(null);
  useExitAnimation(ref, { replacedBy: ".overlay" });
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = previous; };
  }, []);
  return <div className="overlay" ref={ref} onClick={onClose}>{children}</div>;
}

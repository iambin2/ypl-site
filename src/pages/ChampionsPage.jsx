import React, { useEffect, useState } from "react";
import { normTeam as normalizeLegacyParty } from "../services/legacyPartyImages.js";
import { Empty, Icon, Modal, PageHead, Reveal, SectionHead } from "../components/index.js";
import PartyStage from "../components/common/PartyStage.jsx";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  legacyChampionLabel,
  mergeHallOfFame,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";
import { onSpriteError } from "../services/teamBuilderCore.js";

/* ============================== CHAMPIONS ==============================
   현 챔피언은 천장 빛 아래 무대에, 역대 챔피언은 벽에 걸린 동판으로. 동판을 누르면 같은 무대의 시트가 열린다. */
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
  const champs = mergeHallOfFame(data.champions, normalizedChamps);

  const [pop, setPop] = useState(null);

  const genLabel = c => (c.kind === "normalized" ? c.gen : legacyChampionLabel(c.gen));
  const seasonLabel = c => displaySeasonLabel(c.slabel) || ("시즌 " + c.season);

  const reigning = champs.length ? champs[champs.length - 1] : null;
  const past = champs.slice(0, -1).reverse();
  const genMark = c => c.generationNumber > 0
    ? <><span className="fig">{c.generationNumber}</span><span className="unit">대</span></>
    : <span className="unit">{genLabel(c)}</span>;
  // 전당의 전시: 받침 없이 바닥에 선 파티(PartyStage)와, 박물관 설명판처럼 그 아래 이름들
  const partyOf = c => normTeam(c.team).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
    .map(m => ({ name: m.name || "", img: resolveHallOfFameArtwork(m, artworkLookup) }));
  const plate = members => members.some(m => m.name) && <span className="hof-plate">{members.map(m => m.name).filter(Boolean).join(", ")}</span>;
  const reigningTeam = reigning ? partyOf(reigning) : [];
  const teamNames = c => normTeam(c.team).filter(m => m.name).map(m => m.name).join(", ");

  return (<section className="sec">
    <PageHead plain="명예의" silver="전당" desc="챔피언스 시리즈를 제패한 역대 챔피언과 그날의 우승 엔트리를 보관합니다.">
      {admin && <button className="ypl-btn ypl-btn--tonal ypl-btn--sm press" onClick={() => setModal({ type: "champion" })}>
        <Icon n="plus" size={16} />이전 챔피언 추가
      </button>}
    </PageHead>

    {!reigning && <Empty title="등록된 챔피언이 없습니다." desc="챔피언의 우승 기록이 등록되면 이곳에 표시됩니다." />}
    {/* 현 챔피언: 홈 표지와 같은 무대. 동판의 글처럼 세대, 이름, 시즌을 새기고, 우승 파티가 받침 없이 천장 빛 아래 바닥에 선다. */}
    {reigning && <section className="hof-stage" aria-labelledby="hof-reigning">
      <div className="hof-stage-who">
        <span className="hof-eyebrow">{genLabel(reigning)}</span>
        <h2 className="hofs-name" id="hof-reigning">{reigning.name}</h2>
        <span className="callout">{seasonLabel(reigning)} 우승</span>
      </div>
      <PartyStage label="우승 엔트리" members={reigningTeam}>{plate(reigningTeam)}</PartyStage>
      <button className="ypl-btn ypl-btn--primary press hl" onClick={e => setPop({ c: reigning, from: e.currentTarget.closest(".hof-stage").querySelector(".hofs-name") })}>
        우승 엔트리 크게 보기
      </button>
    </section>}

    {/* 역대 챔피언: 벽에 나란히 걸린 동판. 판마다 세대, 이름, 시즌, 그리고 작은 바닥에 선 우승 파티. */}
    {past.length > 0 && <section className="hof-past">
      <SectionHead plain="역대" silver="챔피언" />
      <Reveal tag="ol" className="hof-wall">
        {past.map((c, i) => (
          <li key={c.id || i}>
            <button className="card hof-plaque press" onClick={e => setPop({ c, from: e.currentTarget.querySelector(".hof-plaque-name") })} aria-label={c.name + " 우승 엔트리 보기"}>
              <span className="hof-plaque-top">
                <span className="hof-gen">{genMark(c)}</span>
                <Icon n="chevr" size={16} className="hof-chev" />
              </span>
              <span className="hof-plaque-name">{c.name}</span>
              <span className="hof-plaque-meta">{seasonLabel(c)} 우승</span>
              {partyOf(c).length > 0 && <span className="hof-mini" role="img" aria-label={teamNames(c)}>
                {partyOf(c).map((m, j) => (
                  <span className="hof-mini-mon" key={j}>
                    {m.img ? <img src={m.img} alt="" loading="lazy" decoding="async" onError={onSpriteError()} /> : <span className="hof-mini-ph">{m.name.slice(0, 1)}</span>}
                    <i className="hx-contact" aria-hidden="true" />
                  </span>
                ))}
              </span>}
            </button>
          </li>
        ))}
      </Reveal>
      {admin && <div className="hof-admin">
        {past.filter(c => c.kind !== "normalized").map(c => (
          <button key={"e" + c.id} className="ypl-btn ypl-btn--tonal ypl-btn--sm press" onClick={() => setModal({ type: "champion", item: c })}>
            <Icon n="edit" size={16} />{c.name} 수정
          </button>
        ))}
      </div>}
    </section>}

    {/* 엔트리 시트: 같은 동판과 같은 무대. 파티는 가운데부터 차례로 선다. */}
    {pop && (() => { const c = pop.c, team = partyOf(c); return <Modal label={`${c.name} 우승 엔트리`} className="hof-modal" onClose={() => setPop(null)} fly={{ from: pop.from, selector: ".hofm-nm" }}>
      <div className="hofm-top">
        <span className="hof-eyebrow">{genLabel(c)}</span>
        <div className="hofm-nm">{c.name}</div>
        <div className="hofm-gen">{seasonLabel(c)} 우승 엔트리</div>
      </div>
      {team.length > 0 && <PartyStage label="우승 엔트리" members={team} enter>{plate(team)}</PartyStage>}
      <div className="modal-actions"><button className="ypl-btn ypl-btn--glass press" onClick={() => setPop(null)}>닫기</button>{go && <button className="ypl-btn ypl-btn--primary press" onClick={() => { setPop(null); go("records", { trainer: c.name }); }}>{c.name} 기록 보기</button>}</div>
    </Modal>; })()}
  </section>);
}

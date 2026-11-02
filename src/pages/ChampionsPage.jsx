import React, { useEffect, useState } from "react";
import { normTeam as normalizeLegacyParty } from "../services/legacyPartyImages.js";
import { Empty } from "../components/index.js";
import { Mon, SectionHead } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  mergeHallOfFame,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";

/* ============================== CHAMPIONS ==============================
   (DESIGN.md "Titles and hall of fame", docs/redesign-next c6) 현 챔피언의 줄은 반전되고, 그 파티는 여섯 칸에 바닥을 딛고 이름을 바닥에 둔다.
   이전 챔피언은 줄마다 세대, 이름, 시즌과 여섯 마리를 작게 둔다. 줄을 누르면 파티 시트가 열린다. */
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

  // 세대는 어디서나 숫자로("초대"가 아니라 "1대"), 문장은 "6대 챔피언, YPL 시즌 2 우승" 한 가지로 쓴다.
  const genLabel = c => generationText(c.gen) ? `${generationText(c.gen)} 챔피언` : "챔피언";
  const seasonLabel = c => displaySeasonLabel(c.slabel) || ("시즌 " + c.season);
  const partyOf = c => normTeam(c.team).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
    .map(m => ({ name: m.name || "", img: resolveHallOfFameArtwork(m, artworkLookup) }));
  const gen = c => c.generationNumber > 0 ? <span className="tt-gen"><span className="num t20">{c.generationNumber}</span><span className="t12 dim">대</span></span> : <span className="t12">{generationText(c.gen)}</span>;

  const reigning = champs.length ? champs[champs.length - 1] : null;
  const past = champs.slice(0, -1).reverse();

  return (<section className="hof">
    <h1 className="t32">명예의 전당</h1>
    <p className="t12 dim reg hof-desc">챔피언스 시리즈를 제패한 역대 챔피언과 그날의 우승 엔트리를 보관합니다.</p>
    {!reigning && <Empty title="등록된 챔피언이 없습니다." desc="챔피언의 우승 기록이 등록되면 이곳에 표시됩니다." />}
    {reigning && <div className="hof-now">
      <button type="button" className="inv hof-head" onClick={() => setPop(reigning)} aria-label={`${genLabel(reigning)} ${reigning.name}, ${seasonLabel(reigning)} 우승 엔트리 보기`}>
        {gen(reigning)}<span className="hof-who"><b className="t15">{reigning.name}</b><span className="t12">{seasonLabel(reigning)} 우승, 현 챔피언</span></span>
      </button>
      <div className="hof-six">
        {partyOf(reigning).map((m, i) => <span className="pn stand hof-cell" key={i}><Mon src={m.img} /><b className="floor hof-band t12">{m.name}</b></span>)}
      </div>
      {((go) || admin) && <div className="stack hof-actions">
        {go && <Button variant="second" onClick={() => go("records", { trainer: reigning.name })}>{reigning.name} 기록 보기</Button>}
        {admin && <Button variant="second" onClick={() => setModal({ type: "champion" })}>이전 챔피언 추가</Button>}
      </div>}
    </div>}

    {past.length > 0 && <section className="hof-past" aria-labelledby="hof-past-h">
      <SectionHead id="hof-past-h" title="이전 챔피언" />
      <div className="stack">
        {past.map((c, i) => (<React.Fragment key={c.id || i}>
          <button type="button" className="pn hof-row" onClick={() => setPop(c)} aria-label={`${genLabel(c)} ${c.name}, ${seasonLabel(c)} 우승 엔트리 보기`}>
            <span className="hof-row-gen">{gen(c)}</span>
            <span className="hof-row-body">
              <span className="hof-row-top"><b className="t15">{c.name}</b><span className="t12 dim">{seasonLabel(c)} 우승</span></span>
              <span className="hof-minis">{partyOf(c).map((m, k) => <span className="stand hof-mini" key={k}><i className="floor" aria-hidden="true" /><Mon src={m.img} /></span>)}</span>
            </span>
          </button>
          {/* the edit stands under its own row, named by the generation, so two reigns of one trainer never read alike */}
          {admin && c.kind !== "normalized" && <Button variant="second" size="sm" onClick={() => setModal({ type: "champion", item: c })}>{[generationText(c.gen), c.name, "수정"].filter(Boolean).join(" ")}</Button>}
        </React.Fragment>))}
      </div>
    </section>}

    {pop && <ChampionSheet name={pop.name} hint={`${genLabel(pop)}, ${seasonLabel(pop)} 우승`} party={partyOf(pop)} onClose={() => setPop(null)}>
      {go && <Button variant="main" onClick={() => { setPop(null); go("records", { trainer: pop.name }); }}>{pop.name} 기록 보기</Button>}
    </ChampionSheet>}
  </section>);
}

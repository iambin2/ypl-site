import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUR, STAGGER, place, seal, stand } from "../components/common/motion.js";
import { normTeam as normalizeLegacyParty } from "../services/legacyPartyImages.js";
import { Empty, Icon, SectionHead } from "../components/index.js";
import Case from "../components/common/Case.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  mergeHallOfFame,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";
import Button from "../components/common/Button.jsx";

/* 전당의 첫 등장은 사이트에 들어올 때마다 한 번(홈과 같은 규칙). 다시 오면 다 선 전당이 화면 전환으로 선다. */
let hallPending = true;

/* 첫 등장은 1초 안에: 제목과 설명이 솟고, 케이스가 서고, 사선 면 하나가 창을 지나간다. */
function openHall(cover) {
  place([...cover.querySelectorAll(".hof-lead > *")], { delay: STAGGER.tile, step: DUR.press });
  const box = cover.querySelector(".case");
  stand(box, { delay: STAGGER.tile * 2 });
  seal(box, 540);
}

/* ============================== CHAMPIONS ==============================
   모든 챔피언이 같은 케이스다. 현 챔피언은 네이비 표지에 크게 서고, 역대 챔피언은 흰 페이지에 나란히 걸린다. */
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
  const hallRef = useRef(null);
  const hasHall = Boolean(champs.length);
  useLayoutEffect(() => {
    if (!hasHall) return;
    const first = hallPending;
    hallPending = false;
    if (first) openHall(hallRef.current);
  }, [hasHall]);

  // 세대는 어디서나 숫자로("초대"가 아니라 "1대"), 문장은 "6대 챔피언, YPL 시즌 2 우승" 한 가지로 쓴다.
  const genLabel = c => generationText(c.gen) ? `${generationText(c.gen)} 챔피언` : "챔피언";
  const seasonLabel = c => displaySeasonLabel(c.slabel) || ("시즌 " + c.season);
  const lineOf = c => `${c.generationNumber > 0 ? "" : genLabel(c) + ", "}${seasonLabel(c)} 우승`;
  const caseOf = c => <Case title={c.name} line={lineOf(c)} fig={c.generationNumber || null} unit="대" party={partyOf(c)} onClick={() => setPop(c)} label={`${genLabel(c)} ${c.name}, ${seasonLabel(c)} 우승 엔트리 보기`} />;

  const reigning = champs.length ? champs[champs.length - 1] : null;
  const past = champs.slice(0, -1).reverse();
  const partyOf = c => normTeam(c.team).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
    .map(m => ({ name: m.name || "", img: resolveHallOfFameArtwork(m, artworkLookup) }));

  return (<div className="hof">
    <div className="hm-cover hof-cover" ref={hallRef}>
      <section className="hof-lead">
        <h1>명예의 전당</h1>
        <p className="hof-desc">챔피언스 시리즈를 제패한 역대 챔피언과 그날의 우승 엔트리를 보관합니다.</p>
        {((reigning && go) || admin) && <div className="hm-actions">
          {reigning && go && <Button variant="inverse" size="lg" onClick={() => go("records", { trainer: reigning.name })}>{reigning.name} 기록 보기</Button>}
          {admin && <Button size="lg" onClick={() => setModal({ type: "champion" })}><Icon n="plus" size={16} />이전 챔피언 추가</Button>}
        </div>}
      </section>
      {reigning && caseOf(reigning)}
    </div>

    <div className="hm-wrap hof-past">
      {!reigning && <Empty title="등록된 챔피언이 없습니다." desc="챔피언의 우승 기록이 등록되면 이곳에 표시됩니다." />}
      {past.length > 0 && <SectionHead plain="역대" silver="챔피언" />}
      {past.length > 0 && <ol className="case-grid">
        {past.map((c, i) => <li key={c.id || i}>{caseOf(c)}</li>)}
      </ol>}
      {admin && past.length > 0 && <div className="hof-admin">
        {past.filter(c => c.kind !== "normalized").map(c => (
          <Button key={"e" + c.id} size="sm" onClick={() => setModal({ type: "champion", item: c })}>
            {c.name} 수정
          </Button>
        ))}
      </div>}
    </div>

    {pop && <ChampionSheet name={pop.name} hint={`${genLabel(pop)}, ${seasonLabel(pop)} 우승`} party={partyOf(pop)} onClose={() => setPop(null)}>
      <Button onClick={() => setPop(null)}>닫기</Button>
      {go && <Button variant="primary" onClick={() => { setPop(null); go("records", { trainer: pop.name }); }}>{pop.name} 기록 보기</Button>}
    </ChampionSheet>}
  </div>);
}

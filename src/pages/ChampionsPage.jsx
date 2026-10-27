import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EASE_IN_OUT, EASE_OUT, reduced } from "../components/common/motion.js";
import { normTeam as normalizeLegacyParty } from "../services/legacyPartyImages.js";
import { Empty, Icon, Modal, PageHead, Reveal, SectionHead } from "../components/index.js";
import PartyStage, { arrive } from "../components/common/PartyStage.jsx";
import { championsOperationsEnabled, fetchNormalizedChampionsHallOfFame } from "../services/index.js";
import {
  mergeHallOfFame,
  loadHallOfFameArtworkLookup,
  resolveHallOfFameArtwork,
} from "../services/hallOfFamePresentation.js";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";
import { onSpriteError } from "../services/teamBuilderCore.js";

/* 전당의 첫 등장은 사이트에 들어올 때마다 한 번(홈의 아레나와 같은 규칙). 다시 오면 다 켜진 전당이 화면 전환으로 선다. */
let hallPending = true;

/* 첫 등장, 무겁고 느리게: 천장의 빛줄기가 켜지고, 단상의 원이 가운데에서 바닥에 퍼지고, 파티가 가운데부터 서고,
   이름이 어둠과 흐림을 벗은 뒤 빛의 띠 하나가 글자를 지나간다. 마지막에 설명과 버튼. 움직임 줄이기에서는 다 켜진 채로 선다. */
function openHall(st) {
  const q = s => [...st.querySelectorAll(s)];
  const play = (els, kf, o) => els.forEach(el => el?.animate(kf, { easing: EASE_OUT, fill: "backwards", ...o }));
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  play([st], fade, { duration: 1600, pseudoElement: "::before" });
  play([st], fade, { duration: 1600, delay: 200, pseudoElement: "::after" });
  const floor = st.querySelector(".hx-floor");
  play([floor], fade, { duration: 1400, delay: 400, pseudoElement: "::before" });
  play([floor], [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "none" }], { duration: 1800, delay: 500, pseudoElement: "::after" });
  const mons = q(".hx-mon"), mid = (mons.length - 1) / 2;
  arrive(mons.sort((a, b) => Math.abs(+a.dataset.i - mid) - Math.abs(+b.dataset.i - mid)), 900, 90);
  play(q(".hofs-name"), [{ opacity: 0, filter: "blur(24px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 2000, delay: 1300 });
  q(".hofs-name > span").forEach(el => el.animate([{ backgroundPosition: "100% 0, 0 0" }, { backgroundPosition: "0% 0, 0 0" }], { duration: 2400, delay: 2400, easing: EASE_IN_OUT }));
  play(q(".hof-stage-who .callout, .hof-plate, .hof-stage > .ypl-btn"), [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 2800 });
}

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
  const hallRef = useRef(null);
  const hasHall = Boolean(champs.length);
  useLayoutEffect(() => {
    if (!hallRef.current) return;
    const first = hallPending;
    hallPending = false;
    if (first && !reduced()) openHall(hallRef.current);
  }, [hasHall]);

  // 세대는 어디서나 숫자로("초대"가 아니라 "1대"), 문장은 "6대 챔피언, YPL 시즌 2 우승" 한 가지로 쓴다.
  const genLabel = c => generationText(c.gen) ? `${generationText(c.gen)} 챔피언` : "챔피언";
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
    {/* 현 챔피언: 홈 표지와 같은 무대. 홈의 명판처럼 이름을 새기고 그 아래 한 줄에 세대와 시즌을 둔 뒤, 우승 파티가 받침 없이 천장 빛 아래 바닥에 선다. */}
    {reigning && <section className="hof-stage" aria-labelledby="hof-reigning" ref={hallRef}>
      <div className="hof-stage-who">
        <h2 className="hofs-name" id="hof-reigning"><span>{reigning.name}</span></h2>
        <span className="callout">{genLabel(reigning)}, {seasonLabel(reigning)} 우승</span>
      </div>
      <PartyStage label="우승 엔트리" members={reigningTeam} dais>{plate(reigningTeam)}</PartyStage>
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
            {c.name} 수정
          </button>
        ))}
      </div>}
    </section>}

    {/* 엔트리 시트: 같은 동판과 같은 무대. 파티는 가운데부터 차례로 선다. */}
    {pop && (() => { const c = pop.c, team = partyOf(c); return <Modal label={`${c.name} 우승 엔트리`} className="hof-modal" onClose={() => setPop(null)} fly={{ from: pop.from, selector: ".hofm-nm" }}>
      <div className="hofm-top">
        <div className="hofm-nm">{c.name}</div>
        <div className="hofm-gen">{genLabel(c)}, {seasonLabel(c)} 우승</div>
      </div>
      {team.length > 0 && <PartyStage label="우승 엔트리" members={team} enter dais>{plate(team)}</PartyStage>}
      <div className="modal-actions"><button className="ypl-btn ypl-btn--glass press" onClick={() => setPop(null)}>닫기</button>{go && <button className="ypl-btn ypl-btn--primary press" onClick={() => { setPop(null); go("records", { trainer: c.name }); }}>{c.name} 기록 보기</button>}</div>
    </Modal>; })()}
  </section>);
}

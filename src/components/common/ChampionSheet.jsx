import React, { Suspense, lazy } from "react";
import { Mon } from "./Board.jsx";
import Loader from "./Loader.jsx";
import Modal from "./Modal.jsx";
import Seg from "./Seg.jsx";

/* 세부 명판은 배틀 데이터와 팀 시트 모델을 쓰므로, 세부 값이 있는 우승을 열 때만 받는다(홈의 첫 번들에 넣지 않는다) */
const ChampionPlaques = lazy(() => import("./ChampionPlaques.jsx"));
const hasSets = sets => (sets || []).some(set => set?.move_1_id);

/* 챔피언 시트 (DESIGN.md "Titles and hall of fame", 2026-11-03): 홈의 챔피언 패널과 전당의 명판이 여는 한 장.
   맨 위는 반전된 인장 한 장(결정된 것만 반전된다): 현 챔피언이면 그 말, 세대는 84의 세그먼트로 켜진다.
   그날의 세부 값(sets)이 있으면 여섯이 한 마리씩 명판으로 선다. 세부 값을 받기 전의 우승은 여섯이 이름 띠 위에 선다.
   데스크톱은 콘텐츠 폭이다. children 은 아래의 행동. */
export default function ChampionSheet({ name, line, generation = 0, genText = "", reigning = false, party, sets, regulationId, onClose, children }) {
  const six = note => <>
    <div className="hof-six">
      {party.map((m, i) => <span className="pn stand hof-cell" key={i}><Mon src={m.img} /><b className="floor hof-band t15">{m.name}</b></span>)}
    </div>
    <p className="t12 mute reg hof-sheet-note">{note}</p>
  </>;
  return (
    <Modal title={name} hint={line} className="wide" onClose={onClose}>
      <div className="inv hof-seal">
        <span className="t12">{reigning ? "현 챔피언" : "명예의 전당"}</span>
        {generation > 0
          ? <span className="hof-gen"><Seg value={String(generation)} h={84} cells={Math.max(2, String(generation).length)} label={`${generation}대 챔피언`} /><span className="t20">대 챔피언</span></span>
          : <b className="t32">{genText ? `${genText} 챔피언` : "챔피언"}</b>}
      </div>
      {hasSets(sets)
        ? <Suspense fallback={<Loader small />}><ChampionPlaques sets={sets} regulationId={regulationId} fallback={six("배틀 데이터를 불러오지 못해 포켓몬 구성만 보입니다.")} /></Suspense>
        : six("이 우승 엔트리는 포켓몬 구성만 기록되어 있습니다.")}
      {children && <div className="hof-sheet-act">{children}</div>}
    </Modal>
  );
}

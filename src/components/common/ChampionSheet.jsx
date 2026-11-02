import React from "react";
import { Mon } from "./Board.jsx";
import Modal from "./Modal.jsx";

/* 챔피언 시트: 홈의 챔피언 패널과 전당의 명판이 여는 한 장. 데스크톱은 콘텐츠 폭으로 넓어 여섯이 크게 한 줄에 선다. children 은 아래의 행동. */
export default function ChampionSheet({ name, hint, party, onClose, children }) {
  return (
    <Modal title={name} hint={hint} className="wide" onClose={onClose}>
      <div className="hof-six">
        {party.map((m, i) => <span className="pn stand hof-cell" key={i}><Mon src={m.img} /><b className="floor hof-band t15">{m.name}</b></span>)}
      </div>
      {children && <div className="hof-sheet-act">{children}</div>}
    </Modal>
  );
}

import React from "react";
import { Mon } from "./Board.jsx";
import Modal from "./Modal.jsx";

/* 챔피언 시트: 홈의 챔피언 패널과 전당의 줄이 여는 한 장. 우승 엔트리 여섯이 바닥을 딛고, 이름이 바닥 띠에 선다. children 은 아래의 행동. */
export default function ChampionSheet({ name, hint, party, onClose, children }) {
  return (
    <Modal title={name} hint={hint} onClose={onClose}>
      <div className="hof-six">
        {party.map((m, i) => <span className="pn stand hof-cell" key={i}><Mon src={m.img} /><b className="floor hof-band t12">{m.name}</b></span>)}
      </div>
      {children && <div className="hof-sheet-act">{children}</div>}
    </Modal>
  );
}

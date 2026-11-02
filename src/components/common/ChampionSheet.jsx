import React from "react";
import Modal from "./Modal.jsx";

/* 챔피언 시트: 홈의 슬랩과 전당의 케이스가 여는 한 장. 이름 아래에 우승 엔트리를 창마다 세운다. children 은 아래의 행동. */
export default function ChampionSheet({ name, hint, party, onClose, children }) {
  return (
    <Modal title={name} hint={hint} className="hm-sheet" onClose={onClose}>
      <ul className="hm-party">
        {party.map((m, i) => <li key={i}><span className="hm-tile">{m.img && <img src={m.img} alt="" />}</span>{m.name}</li>)}
      </ul>
      <div className="modal-actions">{children}</div>
    </Modal>
  );
}

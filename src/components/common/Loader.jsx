import React from "react";
import Seg from "./Seg.jsx";

/* 불러오는 동안(DESIGN.md "Motion", Loading, Busy): 자리는 크기대로 서고, 세그먼트 한 칸이 둘레의 막대를 차례로 켠다.
   막대마다 제 상자(svg)라 브라우저가 화면을 그리느라 바쁠 때도 합성기에서 계속 돈다. small 은 카드나 목록 안의 자리. */
export function Busy({ h = 40 }) {
  return (
    <span className="y-busy" aria-hidden="true">
      <Seg value="" h={h} cells={1} label="" />
      {[1, 2, 3, 4, 5, 6].map(n => <span className={"y-bar n" + n} key={n}><Seg value="8" h={h} cells={1} label="" /></span>)}
    </span>
  );
}
export default function Loader({ small = false, label = "불러오는 중" }) {
  return <div className={"y-loader" + (small ? " sm" : "")} role="status" aria-label={label}><Busy h={small ? 32 : 40} /></div>;
}

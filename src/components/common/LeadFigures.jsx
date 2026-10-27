import React from "react";
import Roll from "./Roll.jsx";

/* 리드 카드 안의 숫자들. 화면에 하나뿐인 큰 점수(숫자와 단위, 그 아래 라벨)와 그 옆의 성적 칸.
   기록, 명예의 전당, 칭호, 대진표가 같은 모양을 쓴다. 숫자가 먼저, 회색 라벨은 그 아래(규칙 2). 숫자는 바뀔 때 굴러간다(K4). */
export function Poster({ label, value, unit }) {
  const numeric = typeof value === "number" || /^\d[\d,]*$/.test(String(value ?? ""));
  return (
    <p className="rc-poster">
      <span className="rc-poster-fig" aria-hidden="true"><span className="rc-poster-num">{numeric ? <Roll value={String(value).replace(/,/g, "")} /> : value}</span><span className="unit">{unit}</span></span>
      <span className="rc-poster-label" aria-hidden="true">{label}</span>
      <span className="sr-only">{label} {value}{unit}</span>
    </p>
  );
}

/* 칸의 값이 "25회", "8명"처럼 정수와 단위뿐이면 점수판 숫자(SUIT 800, 28px)와 작은 단위로 세운다(규칙 4). */
const COUNT = /^(\d+(?:\.\d+)?)(회|명|팀|점|종|건|개|%)$/;
const factValue = v => {
  const m = COUNT.exec(String(v ?? ""));
  return m ? <><span className="fig">{m[1]}</span><span className="unit">{m[2]}</span></> : v;
};

export function Facts({ items }) {
  // 한 묶음은 한 모양이다: 모두 짧으면 같은 폭의 칸, 하나라도 길면(팀 이름 여럿, "싱글 엘리미네이션") 묶음 전체가 라벨과 값의 줄이 된다.
  const rows = items.some(([, v]) => String(v ?? "").length > 6);
  return (
    <dl className={"rc-facts" + (rows ? " rows" : "")}>
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="tnum">{rows ? v : factValue(v)}</dd></div>)}
    </dl>
  );
}

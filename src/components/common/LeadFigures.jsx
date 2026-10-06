import React from "react";

/* 리드 타일 안의 숫자들. 화면에 하나뿐인 포스터 숫자(라벨, 숫자, 단위)와
   그 옆의 사실 목록. 기록, 명예의 전당, 칭호, 대진표가 같은 모양을 쓴다. */
export function Poster({ label, value, unit }) {
  return (
    <p className="rc-poster">
      <span className="rc-poster-label" aria-hidden="true">{label}</span>
      <span className="rc-poster-fig" aria-hidden="true"><span className="num">{value}</span><span className="unit">{unit}</span></span>
      <span className="sr-only">{label} {value}{unit}</span>
    </p>
  );
}

export function Facts({ items }) {
  return (
    <dl className="rc-facts">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="tnum">{v}</dd></div>)}
    </dl>
  );
}

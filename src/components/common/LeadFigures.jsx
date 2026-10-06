import React from "react";

/* 리드 카드 안의 숫자들. 화면에 하나뿐인 실버 점수(라벨, 숫자, 단위)와
   그 옆의 성적 칸. 기록, 명예의 전당, 칭호, 대진표가 같은 모양을 쓴다. */
export function Poster({ label, value, unit }) {
  return (
    <p className="rc-poster">
      <span className="rc-poster-label" aria-hidden="true">{label}</span>
      <span className="rc-poster-fig" aria-hidden="true"><span className="rc-poster-num silver">{value}</span><span className="unit">{unit}</span></span>
      <span className="sr-only">{label} {value}{unit}</span>
    </p>
  );
}

export function Facts({ items }) {
  return (
    <dl className="rc-facts">
      {items.map(([k, v]) => <div className="sq" key={k}><dt>{k}</dt><dd className="tnum">{v}</dd></div>)}
    </dl>
  );
}

/* 1st, 2nd, 3rd, 11th: 피처 카드 머리말의 회차 표기 */
export const ordinal = n => { const v = n % 100; return n + (["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"); };

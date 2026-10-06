import React from "react";
import Reveal from "./Reveal.jsx";

/* 페이지 머리(법전 PageHead): 라틴 머리말, 두 톤 제목(뒤 낱말이 실버), 설명 한 줄.
   children은 설명 아래의 관리 버튼 자리. */
export default function PageHead({ eyebrow, plain, silver, desc, children }) {
  return (
    <Reveal className="ypl-head">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{plain} <span className="silver">{silver}</span></h1>
      {desc && <p>{desc}</p>}
      {children}
    </Reveal>
  );
}

/* 섹션 머리: 라틴 머리말, 두 톤 제목(뒤 낱말이 실버), 오른쪽 링크 */
export function SectionHead({ id, eyebrow, plain, silver, more }) {
  return (
    <div className="ypl-sech">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id}>{plain} <span className="silver">{silver}</span></h2>
      </div>
      {more && <button className="ypl-more" onClick={more[1]}>{more[0]} →</button>}
    </div>
  );
}

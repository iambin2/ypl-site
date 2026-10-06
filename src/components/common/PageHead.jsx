import React from "react";
import Reveal from "./Reveal.jsx";

/* 페이지 머리(법전 PageHead): 라틴 머리말, 두 톤 제목(뒤 낱말이 실버), 설명 한 줄. */
export default function PageHead({ eyebrow, plain, silver, desc }) {
  return (
    <Reveal className="ypl-head">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{plain} <span className="silver">{silver}</span></h1>
      {desc && <p>{desc}</p>}
    </Reveal>
  );
}

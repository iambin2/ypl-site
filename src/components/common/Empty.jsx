import React from "react";

/* 빈 화면은 사이트에 한 종류뿐입니다(법전 EmptyState).
   내용이 놓일 면 안에서 왼쪽 축에 제목 한 줄, 설명 한 줄. 그림과 큰 아이콘은 두지 않습니다. */
export default function Empty({ title, desc, className = "" }) {
  return (
    <div className={"ypl-empty sq" + (className ? " " + className : "")}>
      <b>{title}</b>
      {desc && <p>{desc}</p>}
    </div>
  );
}

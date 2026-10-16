import React from "react";

/* 빈 상태는 문장만(L3). 내용이 놓일 자리에서 제목 한 줄, 설명 한 줄. 그림과 큰 아이콘은 두지 않는다. */
export default function Empty({ title, desc, className = "", children }) {
  return (
    <div className={"ypl-empty" + (className ? " " + className : "")}>
      <b>{title}</b>
      {desc && <p>{desc}</p>}
      {children}
    </div>
  );
}

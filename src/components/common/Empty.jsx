import React from "react";
import Icon from "./Icon.jsx";

/* 빈 화면은 사이트에 한 종류뿐입니다.
   표시 · 제목 한 줄 · 설명 한 줄. 그 외에는 아무것도 놓지 않습니다.
   (이전에는 공지는 회색 문장, 게시판은 다른 여백, 홈은 또 다른 상자였습니다.) */
export default function Empty({ icon = "list", title, desc, className = "" }) {
  return (
    <div className={"y-empty" + (className ? " " + className : "")}>
      <div className="y-empty-mark"><Icon n={icon} size={20} /></div>
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
    </div>
  );
}

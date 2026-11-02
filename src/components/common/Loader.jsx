import React from "react";

/* 불러오는 동안은 꺼진 판이다(DESIGN.md "Motion", Loading): 자리만 잡고 아무것도 돌지 않는다. 스피너도 로딩 워드마크도 없다.
   small 은 카드나 목록 안의 자리. */
export default function Loader({ small = false, label = "불러오는 중" }) {
  return <div className={"y-loader" + (small ? " sm" : "")} role="status" aria-label={label} />;
}

import React from "react";

/* 숫자는 굴러가지 않는다(DESIGN.md "Motion": nothing rolls). 값이 바뀌면 그 자리에서 바뀐다.
   읽는 값이고 7세그먼트가 아닌 곳의 숫자다. 판이 알리는 숫자는 Seg.jsx로 그린다. */
export default function Roll({ value, format = n => n.toLocaleString("ko-KR") }) {
  return <span className="tnum">{format(Number(value) || 0)}</span>;
}

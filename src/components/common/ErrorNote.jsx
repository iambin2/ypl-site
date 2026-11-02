import React from "react";
import { Bang } from "./Board.jsx";
import Button from "./Button.jsx";

/* 무엇이 잘못됐는지 한 문장과 다시 해 볼 버튼 하나(DESIGN.md "Errors and empty"): 색이 아니라 반전된 ! 칸과 문장으로 알린다.
   구역의 에러도 화면 전체의 에러도 이 모양이다. 입력 한 칸의 에러는 Question(Board.jsx)이 맡는다. */
export default function ErrorNote({ children, action = "다시 시도", onRetry }) {
  return (
    <div className="pn error-note" role="alert">
      <p className="error-say t15"><Bang />{children}</p>
      {onRetry && <Button variant="second" onClick={onRetry}>{action}</Button>}
    </div>
  );
}

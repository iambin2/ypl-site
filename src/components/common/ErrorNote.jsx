import React from "react";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";

/* 무엇이 잘못됐는지 한 문장과 다시 해 볼 버튼 하나. 구역의 에러도 화면 전체의 에러도 이 모양이다.
   입력 한 칸의 에러는 FormError가 맡는다. */
export default function ErrorNote({ children, action = "다시 시도", onRetry }) {
  return (
    <div className="error-note" role="alert">
      <p><Icon n="alert" size={20} />{children}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>{action}</Button>}
    </div>
  );
}

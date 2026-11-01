import React, { cloneElement, useId } from "react";
import Icon from "./Icon.jsx";

/* 라벨은 늘 보이고 입력창과 이어진다. 도움말과 에러는 입력창 바로 아래, 에러가 있으면 도움말 자리를 대신한다.
   control 하나를 children으로 받아 id와 aria-describedby를 건다. flush는 마지막 칸의 아래 여백을 지운다. */
export default function Field({ label, hint, error, flush = false, children }) {
  const auto = useId();
  const id = children.props.id || auto;
  const note = error || hint;
  return (
    <div className={"field" + (flush ? " field--flush" : "")}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, "aria-describedby": note ? `${id}-note` : undefined, "aria-invalid": error ? true : undefined })}
      {error ? <FormError id={`${id}-note`}>{error}</FormError> : hint && <p className="hint" id={`${id}-note`}>{hint}</p>}
    </div>
  );
}

/* 폼의 에러 한 줄: 색이 아니라 아이콘과 굵기로 알린다. 입력 시점이 아니라 제출할 때 나타난다. */
export function FormError({ id, children }) {
  return <p className="form-error" id={id} role="alert"><Icon n="alert" size={16} />{children}</p>;
}

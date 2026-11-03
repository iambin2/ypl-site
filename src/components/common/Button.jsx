import React from "react";
import Icon from "./Icon.jsx";
import { Busy } from "./Loader.jsx";

/* 버튼은 이 하나다. 위계는 variant, 높이는 size로만 정한다. href가 있으면 링크로 그린다.
   variant: main(전광판의 주 행동: 반전된 52 면, 글자는 왼쪽, →(icon으로 바꿀 수 있다)는 오른쪽, 한 화면에 하나), second(패널 버튼 52, 글자는 가운데),
   link(밑줄 단어, 12, 혼자 서면 size="lg"로 15),
   primary와 destructive(반전된 면, 글자는 가운데: 시트와 대화상자의 확정), secondary(밑줄 단어, 기본값).
   size: sm 44, md와 lg 52. loading은 글자 자리를 지킨 채 폭을 바꾸지 않고, 글자 대신 도는 세그먼트 한 칸(Busy)을 얹는다.
   className은 놓일 자리를 정하는 데만 쓴다. */
export default function Button({ variant = "secondary", size = "md", loading = false, href, className = "", disabled, icon = "arrow", children, ...rest }) {
  const cls = `btn btn--${variant} btn--${size}${className ? " " + className : ""}`;
  const body = variant === "main" ? <>{children}<Icon n={icon} size={20} /></> : children;
  if (href) return <a className={cls} href={href} {...rest}>{body}</a>;
  return <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{body}{loading && <Busy h={32} />}</button>;
}

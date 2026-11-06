import React from "react";
import Icon from "./Icon.jsx";
import { Busy } from "./Loader.jsx";

/* 버튼은 이 하나다. 위계는 variant 셋뿐이고(DESIGN.md "Hierarchy"), 높이는 size로만 정한다. href가 있으면 링크로 그린다.
   variant: main(1등급 행동: 반전된 52 면, 표시가 글자 앞에 붙어 둘이 왼쪽에 함께 선다(2026-11-06, "+ 글쓰기"의 꼴을 모든 표시로).
   나아가면 →, 확정하면 icon="check"로 ✓, 만들면 icon="plus"로 +. 한 화면, 한 시트에 하나),
   second(2등급: 패널 버튼 52, 작은 행동의 줄에서는 sm 44, 글자는 가운데, 기본값), link(3등급: 밑줄 단어, 12, 혼자 서면 size="lg"로 15).
   size: sm 44, md와 lg 52. loading은 글자 자리를 지킨 채 폭을 바꾸지 않고, 글자 대신 도는 세그먼트 한 칸(Busy)을 얹는다.
   className은 놓일 자리를 정하는 데만 쓴다. */
export default function Button({ variant = "second", size = "md", loading = false, href, className = "", disabled, icon = "arrow", children, ...rest }) {
  const cls = `btn btn--${variant} btn--${size}${className ? " " + className : ""}`;
  const body = variant === "main" ? <><Icon n={icon} size={20} />{children}</> : children;
  if (href) return <a className={cls} href={href} {...rest}>{body}</a>;
  return <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{body}{loading && <Busy h={32} />}</button>;
}

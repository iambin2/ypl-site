import React from "react";

/* 버튼은 이 하나다. 위계는 variant, 높이는 size로만 정한다. href가 있으면 링크로 그린다.
   variant: primary(한 영역에 하나), secondary, tertiary, destructive, inverse(네이비 면 위).
   size: sm 44, md와 lg 52. loading은 글자 자리를 지킨 채 폭을 바꾸지 않고 스피너만 얹는다.
   className은 놓일 자리를 정하는 데만 쓴다. */
export default function Button({ variant = "secondary", size = "md", loading = false, href, className = "", disabled, children, ...rest }) {
  const cls = `btn btn--${variant} btn--${size}${className ? " " + className : ""}`;
  if (href) return <a className={cls} href={href} {...rest}>{children}</a>;
  return <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{children}</button>;
}

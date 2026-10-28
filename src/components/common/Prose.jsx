import React from "react";
import { blocksOf, groupsOf, headingOf, inlineOf } from "../../services/prosePresentation.js";

const inline = text => inlineOf(text).map((s, i) => s.href ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a> : s.bold ? <strong key={i}>{s.text}</strong> : s.text);

/* 공지와 게시판 본문(N6). 문단은 한 줄씩 쌓고, 목록인 부분(팀 편성 등)은 칸으로 나란히 놓아 넓은 화면을 채운다. */
export default function Prose({ text }) {
  const groups = groupsOf(blocksOf(text));
  if (!groups.length) return null;
  return (
    <div className="prose">
      {groups.map((g, i) => g.grid
        ? <div className="prose-grid" key={i}>{g.items.map((b, k) => <p key={k}>{inline(b)}</p>)}</div>
        : g.items.map((b, k) => { const { heading, body } = headingOf(b);
          return <React.Fragment key={i + "-" + k}>{heading && <h3 className="headline">{inline(heading)}</h3>}{body && <p>{inline(body)}</p>}</React.Fragment>; }))}
    </div>
  );
}

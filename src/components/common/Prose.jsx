import React from "react";
import { blocksOf, groupsOf } from "../../services/prosePresentation.js";

/* 공지와 게시판 본문(N6). 문단은 한 줄씩 쌓고, 목록인 부분(팀 편성 등)은 칸으로 나란히 놓아 넓은 화면을 채운다. */
export default function Prose({ text }) {
  const groups = groupsOf(blocksOf(text));
  if (!groups.length) return null;
  return (
    <div className="prose">
      {groups.map((g, i) => g.grid
        ? <div className="prose-grid" key={i}>{g.items.map((b, k) => <p key={k}>{b}</p>)}</div>
        : g.items.map((b, k) => <p key={i + "-" + k}>{b}</p>))}
    </div>
  );
}

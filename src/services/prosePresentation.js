/* 공지와 게시판 본문을 문단 묶음으로 나눈다. 빈 줄이 묶음의 경계다.
   짧은 줄 여러 개로 된 묶음이 셋 이상 이어지면(팀 편성처럼 목록인 부분) 칸으로 나란히 놓을 한 무리로 묶는다. */
export const blocksOf = text => String(text || "").split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean);

const listy = b => { const lines = b.split("\n"); return lines.length >= 2 && lines.every(l => l.trim().length <= 28); };

export function groupsOf(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1], grid = listy(b);
    if (last && last.grid === grid) last.items.push(b); else out.push({ grid, items: [b] });
  }
  // 두 개 이하로 이어진 짧은 묶음은 칸으로 나누지 않는다
  return out.map(g => g.grid && g.items.length < 3 ? { grid: false, items: g.items } : g);
}

/* 관리자가 붙여 넣는 글은 마크다운 몇 가지를 쓴다. 그 몇 가지만 읽는다: 줄 첫머리의 #(제목), **굵게**, [글](주소)와 맨 주소(링크).
   묶음의 첫 줄이 #로 시작하면 그 줄은 제목, 나머지는 본문이다. */
const HEADING = /^#{1,3}[ \t]+/;
export function headingOf(block) {
  const [first, ...rest] = block.split("\n");
  return HEADING.test(first) ? { heading: first.replace(HEADING, "").trim(), body: rest.join("\n").trim() } : { heading: "", body: block };
}
const INLINE = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,!?"'])/g;
export function inlineOf(text) {
  const out = []; let at = 0;
  for (const m of String(text || "").matchAll(INLINE)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    if (m[1]) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2] || m[4], href: m[3] || m[4] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

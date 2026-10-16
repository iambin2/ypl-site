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

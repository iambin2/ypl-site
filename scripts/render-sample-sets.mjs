// Writes docs/sample-sets/m-c-singles.md and m-c-doubles.md from the notes scripts/tune-sets.mjs leaves beside them: each species'
// most played set with its spread before and after, the role, the plan, the speed tier, what the new points change, the damage it
// deals and takes against the 20 most used threats, its ladder partners, and what is still to be checked.
//
//   node scripts/render-sample-sets.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DIR = new URL("../docs/sample-sets/", import.meta.url);
const KIND_KO = { singles: "싱글", doubles: "더블" };
const list = items => (items.length ? items.map(x => `  - ${x}`).join("\n") : "  - 해당 없음");
for (const kind of ["singles", "doubles"]) {
  const file = new URL(`m-c-${kind}.json`, DIR);
  if (!existsSync(file)) continue;
  const notes = Object.values(JSON.parse(readFileSync(file, "utf8"))).sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0));
  const changed = notes.filter(n => n.spread.old !== n.spread.new).length;
  const lines = [
    `# 포켓몬 챔피언스 M-C ${KIND_KO[kind]} 샘플 세트`,
    "",
    `scripts/tune-sets.mjs가 노력치를 다시 배분한 ${notes.length}종을 랭커 사용률 순으로 적었습니다. 방법과 측정은 docs/SAMPLE_SETS.md에 있습니다. 노력치는 포켓몬 챔피언스의 능력 포인트(한 능력치 최대 32, 합계 66)로 적고, H A B C D S는 HP, 공격, 방어, 특수공격, 특수방어, 스피드입니다. 종마다 가장 많이 쓰이는 세트를 보이고, 나머지 세트도 같은 방법으로 다시 배분했습니다.`,
    "",
    `- 가장 많이 쓰이는 세트의 노력치가 바뀐 종: ${changed}종, 그대로인 종: ${notes.length - changed}종`,
    "",
  ];
  for (const n of notes) {
    lines.push(
      `## ${n.name}: ${n.role}`,
      "",
      `- 세트: ${n.ability}, ${n.item}, ${n.nature}, ${n.moves.join(", ")}${n.sets > 1 ? ` (이 종의 세트 ${n.sets}개 중 가장 많이 쓰이는 것)` : ""}`,
      `- 노력치: ${n.spread.old} → ${n.spread.new}`,
      `- 핵심 운용: ${n.strategy}`,
      `- 스피드: ${n.speed}`,
      `- 재배분으로 얻은 것:`, list(n.gained),
      `- 재배분으로 잃은 것:`, list(n.lost),
      `- 주는 피해:`, list(n.offense),
      `- 받는 피해:`, list(n.defense),
      `- 랭커 파티의 단짝: ${n.partners.join(", ") || "자료 없음"}`,
      `- 추가 검증 필요:`, list(n.verify),
      "",
    );
  }
  writeFileSync(new URL(`m-c-${kind}.md`, DIR), lines.join("\n"));
  console.log(`m-c-${kind}.md: ${notes.length}, spread changed ${changed}`);
}

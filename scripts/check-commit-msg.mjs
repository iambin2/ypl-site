// The commit law (CLAUDE.md "Commit messages"): every commit says what problem it saw, how it was thought through, where it is headed,
// and the user's own words that asked for it. Run by .githooks/commit-msg on a message file and by tests/commitMessage.test.mjs on history.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SECTIONS = [
  ["문제 인식", /^문제 인식/],
  ["사고 과정", /^사고 과정/],
  ["기획 방향성", /^기획 방향성/],
  ["프롬프트", /^(사용자 )?프롬프트/],
];

// a merge or a rebase step is not a change of its own
const EXEMPT = /^(Merge |fixup! |squash! |amend! )/;

// names each missing or empty section; [] means the message keeps the law
export function missingSections(message) {
  const lines = message.replace(/\r\n/g, "\n").split("\n").filter(l => !l.startsWith("#"));
  if (EXEMPT.test(lines[0] || "")) return [];
  const heads = lines.map(l => SECTIONS.findIndex(([, re]) => re.test(l)));
  return SECTIONS.filter((_, k) => {
    const at = heads.indexOf(k);
    if (at < 0) return true;
    const rest = lines[at].replace(SECTIONS[k][1], "").replace(/^[^:]*:/, "").trim();
    if (rest) return false;
    for (let j = at + 1; j < lines.length && heads[j] < 0; j++) if (lines[j].trim()) return false;
    return true;
  }).map(([name]) => name);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const missing = missingSections(readFileSync(process.argv[2], "utf8"));
  if (missing.length) {
    console.error(`커밋 메시지에 빠진 단락: ${missing.join(", ")}\n` +
      "각 단락은 줄 첫머리의 제목(문제 인식:, 사고 과정:, 기획 방향성:, 프롬프트:)과 내용 한 줄 이상입니다. CLAUDE.md \"Commit messages\" 참고.");
    process.exit(1);
  }
}

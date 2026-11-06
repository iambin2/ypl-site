// The commit law as a test: the checker itself, the hook being wired, and every commit since the law began keeping it.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { missingSections } from "../scripts/check-commit-msg.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
// the first commit written under the law; everything after it is held to it
const LAW_SINCE = "9f28607";

const GOOD = "Do a thing\n\n문제 인식:\n- 무엇이 틀렸다\n\n사고 과정:\n- 왜 이렇게\n\n기획 방향성:\n- 어디로\n\n프롬프트 (사용자 지시):\n- \"해줘\"\n";

test("the checker passes a full message and names what a short one lacks", () => {
  assert.deepEqual(missingSections(GOOD), []);
  assert.deepEqual(missingSections("Fix\n\n문제 인식: 하나\n사고 과정: 둘\n"), ["기획 방향성", "프롬프트"]);
  assert.deepEqual(missingSections(GOOD.replace("- 어디로\n", "")), ["기획 방향성"], "a heading with nothing under it is missing");
  assert.deepEqual(missingSections("# 문제 인식: only a comment\nx"), ["문제 인식", "사고 과정", "기획 방향성", "프롬프트"]);
  assert.deepEqual(missingSections("Merge branch 'main'"), []);
});

test("the commit-msg hook calls the checker and npm install wires it", () => {
  assert.match(readFileSync(`${ROOT}/.githooks/commit-msg`, "utf8"), /scripts\/check-commit-msg\.mjs/);
  assert.match(JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")).scripts.prepare, /core\.hooksPath \.githooks/);
  assert.match(readFileSync(`${ROOT}/CLAUDE.md`, "utf8"), /## Commit messages/);
});

test("every commit since the law began keeps it", t => {
  if (!existsSync(`${ROOT}/.git`)) return t.skip("not a git checkout");
  let range;
  try { git("cat-file", "-e", `${LAW_SINCE}^{commit}`); range = `${LAW_SINCE}..HEAD`; } catch { range = "-1"; } // a shallow CI checkout sees HEAD only
  const log = git("log", "--no-merges", "--format=%H%x1f%ae%x1f%B%x1e", range);
  const broken = log.split("\x1e").map(s => s.trim()).filter(Boolean).map(s => s.split("\x1f"))
    .filter(([, email]) => !/\[bot\]/.test(email)) // the weekly data pull requests are written by a workflow
    .map(([sha, , body]) => [sha.slice(0, 7), body.split("\n")[0], missingSections(body)])
    .filter(([, , miss]) => miss.length);
  assert.deepEqual(broken, [], broken.map(([s, subj, m]) => `${s} ${subj}: ${m.join(", ")}`).join("\n"));
});

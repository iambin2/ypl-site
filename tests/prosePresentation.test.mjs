import test from "node:test";
import assert from "node:assert/strict";
import { blocksOf, groupsOf, headingOf, inlineOf } from "../src/services/prosePresentation.js";

test("a notice body splits into paragraphs, and a run of three or more short lists becomes one grid", () => {
  const body = "관동 레즈\n팀장: 이제빈\n송하준\n\n 성도 울브즈\n팀장: 이상준\n\n호연 제츠\n팀장: 김원의\n\n팀장분들은 각 팀 톡방을 하나씩 만들어서 팀원들을 초대해 주세요!\n대회 전까지 간단하게 인사도 나누고요.\n\n각 지역 화이팅입니다!";
  const groups = groupsOf(blocksOf(body));
  assert.deepEqual(groups.map(g => [g.grid, g.items.length]), [[true, 3], [false, 2]]);
  assert.equal(groups[0].items[1], "성도 울브즈\n팀장: 이상준", "a block's stray leading space is trimmed");
});

test("two short lists, single lines and an empty body stay plain", () => {
  assert.deepEqual(groupsOf(blocksOf("가\n나\n\n다\n라\n\n마")).map(g => g.grid), [false, false]);
  assert.deepEqual(groupsOf(blocksOf("  \n\n ")), []);
});

test("a block opening with # is a heading over its body; other blocks are left alone", () => {
  assert.deepEqual(headingOf("## 📅 대회 일정"), { heading: "📅 대회 일정", body: "" });
  assert.deepEqual(headingOf("# 규칙\n- 싱글 배틀"), { heading: "규칙", body: "- 싱글 배틀" });
  assert.deepEqual(headingOf("#해시태그 아님"), { heading: "", body: "#해시태그 아님" });
});

test("bold, markdown links and bare links become parts; the rest stays text", () => {
  assert.deepEqual(inlineOf("NPC [목록](https://docs.google.com/x?a=1#b)을 보세요"), [{ text: "NPC " }, { text: "목록", href: "https://docs.google.com/x?a=1#b" }, { text: "을 보세요" }]);
  assert.deepEqual(inlineOf("**필수** 확인: https://ypl.gg/a."), [{ text: "필수", bold: true }, { text: " 확인: " }, { text: "https://ypl.gg/a", href: "https://ypl.gg/a" }, { text: "." }]);
  assert.deepEqual(inlineOf("그냥 글"), [{ text: "그냥 글" }]);
});

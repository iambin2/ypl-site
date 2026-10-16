import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanEventNamePart,
  eventSubtitleOf,
  formatEventName,
  isCleanEventName,
  isEventLinked,
  leagueTitle,
  recordRoundTitle,
} from "../src/services/eventName.js";

test("every event kind assembles to one grammar", () => {
  const cases = [
    [{ round: 36, eventType: "pokecup", division: "master" }, "36회 파이컵 마스터 리그"],
    [{ round: 36, eventType: "pokecup", division: "rookie" }, "36회 파이컵 루키 리그"],
    [{ round: 7, eventType: "pokecup", division: "light", subtitle: "모노타입 챌린지" }, "7회 파이컵 라이트 모노타입 챌린지"],
    [{ round: 6, eventType: "light" }, "6회 파이컵 라이트"],
    [{ round: 37, eventType: "pokecup", division: "master", isTeamEvent: true, subtitle: "리전 워즈" }, "37회 파이컵 팀전 리전 워즈"],
    [{ round: 8, eventType: "pokecup", division: "light", isTeamEvent: true }, "8회 파이컵 라이트 팀전"],
    [{ round: 7, eventType: "champions" }, "7회 챔피언스 시리즈"],
    [{ round: 24, eventType: "pokecup" }, "24회 파이컵"],
    [{ eventType: "pokecup", division: "other", subtitle: "배틀부 세미나 미니대회 1조" }, "배틀부 세미나 미니대회 1조"],
  ];
  for (const [fields, expected] of cases) {
    assert.equal(formatEventName(fields), expected);
    assert.ok(isCleanEventName(expected), expected);
  }
});

test("typed separators and glued league names are cleaned out of subtitles", () => {
  assert.equal(cleanEventNamePart("  리전 | 워즈 · 2  "), "리전 워즈 2");
  assert.equal(cleanEventNamePart("마스터리그"), "마스터 리그");
  assert.equal(formatEventName({ round: 1, eventType: "pokecup", division: "master", subtitle: "| 개막전" }), "1회 파이컵 마스터 리그 개막전");
  assert.ok(!isCleanEventName("36회 파이컵 | 마스터리그"));
  assert.ok(!isCleanEventName(""));
});

test("record rounds read like assembled event names", () => {
  assert.equal(recordRoundTitle("마스터 리그", 36), "36회 파이컵 마스터 리그");
  assert.equal(recordRoundTitle("루키리그", "5"), "5회 파이컵 루키 리그");
  assert.equal(recordRoundTitle("파이컵 라이트", 7), "7회 파이컵 라이트");
  assert.equal(recordRoundTitle("챔피언스 시리즈", ""), "챔피언스 시리즈");
  assert.equal(leagueTitle("마스터 리그"), "파이컵 마스터 리그");
});

test("old drafts give their subtitle back from the stored name", () => {
  const team = { eventType: "pokecup", division: "master", isTeamEvent: true };
  assert.equal(eventSubtitleOf("37회 파이컵 팀전 | 리전 워즈", team), "리전 워즈");
  assert.equal(eventSubtitleOf("7회 파이컵 라이트", { eventType: "pokecup", division: "light" }), "");
  assert.equal(eventSubtitleOf("미니대회2조", { eventType: "pokecup", division: "other" }), "미니대회2조");
});

test("a form links to an Event only when linked, already linked, or carrying an old typed name", () => {
  assert.equal(isEventLinked({ eventId: "e1", eventDraft: { linked: false } }), true);
  assert.equal(isEventLinked({ eventDraft: { linked: true } }), true);
  assert.equal(isEventLinked({ eventDraft: { name: "36회 파이컵" } }), true);
  assert.equal(isEventLinked({ eventDraft: {} }), false);
  assert.equal(isEventLinked(null), false);
});

test("the DB guard and the Champions RPC agree with the formatter", () => {
  const guard = readFileSync("docs/db/event_name_constraint.sql", "utf8");
  assert.match(guard, /add constraint events_name_clean/);
  const rpc = readFileSync("docs/db/champions_application_event_pair_rpc.sql", "utf8");
  assert.doesNotMatch(rpc, /' · (본선|선발전)'/);
});

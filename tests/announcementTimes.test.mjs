import assert from "node:assert/strict";
import test from "node:test";
import { applicationsClosed, applicationsOpen, missingAnnouncementTimes } from "../src/services/announcementTimes.js";

const now = new Date(2026, 10, 3, 15, 0);
const linked = { linked: true, eventType: "pokecup", heldOn: "2026-11-07" };

test("an open application must state when it closes and when its event starts", () => {
  assert.deepEqual(missingAnnouncementTimes({ enabled: true, eventDraft: linked }, now), ["신청 마감 시각", "시작 시각"]);
  assert.deepEqual(missingAnnouncementTimes({ enabled: true, closesAt: "2026-11-03T23:59", eventDraft: { ...linked, startTime: "16:00" } }, now), []);
  assert.deepEqual(missingAnnouncementTimes({ enabled: true, eventDraft: { linked: true, eventType: "champions", qualifierHeldOn: "2026-12-01", finalHeldOn: "2026-12-08" } }, now),
    ["신청 마감 시각", "선발전 시작 시각", "본선 시작 시각"]);
});

test("a form that is off, or an event already over, edits freely; a form with no event needs only its closing time", () => {
  assert.deepEqual(missingAnnouncementTimes({ enabled: false }, now), []);
  assert.deepEqual(missingAnnouncementTimes({ enabled: true, eventDraft: { ...linked, heldOn: "2026-10-04" } }, now), []);
  assert.deepEqual(missingAnnouncementTimes({ enabled: true, eventDraft: { linked: false } }, now), ["신청 마감 시각"]);
});

test("applications are open only before a stated closing time", () => {
  assert.equal(applicationsOpen({ enabled: true, closesAt: "2026-11-03T23:59" }, now), true);
  assert.equal(applicationsOpen({ enabled: true, closesAt: "2026-11-03T12:00" }, now), false);
  assert.equal(applicationsOpen({ enabled: true }, now), false);
  assert.equal(applicationsClosed({ enabled: true, closesAt: "2026-11-03T12:00" }, now), true);
  assert.equal(applicationsClosed({ enabled: true }, now), false);
});

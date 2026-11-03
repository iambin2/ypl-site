import assert from "node:assert/strict";
import test from "node:test";
import { submissionDue } from "../src/services/submissionDue.js";
import { partyDeadlines } from "../src/services/announcementTimes.js";

const now = new Date(2026, 10, 3, 15, 0);

test("party submission closes when the event starts, not at a separate time", () => {
  assert.deepEqual(partyDeadlines({ heldOn: "2026-11-07", startTime: "16:00", submissionTargetAt: "2026-11-06T12:02" }), ["2026-11-07T16:00"]);
  assert.deepEqual(partyDeadlines({ eventType: "champions", heldOn: "2026-11-07", qualifierStartTime: "9:00", finalHeldOn: "2026-11-14", finalStartTime: "18:00" }),
    ["2026-11-07T09:00", "2026-11-14T18:00"]);
  assert.deepEqual(partyDeadlines({ heldOn: "2026-11-07", submissionTargetAt: "2026-11-06T12:02" }), [null], "no start time, no deadline");
});

test("days ahead count calendar days, the event day counts hours", () => {
  assert.deepEqual(submissionDue({ heldOn: "2026-11-06", startTime: "12:02" }, now), { value: 3, unit: "일" });
  assert.deepEqual(submissionDue({ heldOn: "2026-11-03", startTime: "20:30" }, now), { value: 6, unit: "시간" });
});

test("a started or undated event shows nothing; champions take the nearest start ahead", () => {
  assert.equal(submissionDue({ heldOn: "2026-11-03", startTime: "14:00" }, now), null);
  assert.equal(submissionDue({}, now), null);
  assert.deepEqual(submissionDue({ eventType: "champions", qualifierHeldOn: "2026-11-01", qualifierStartTime: "12:00", finalHeldOn: "2026-11-10", finalStartTime: "12:00" }, now), { value: 7, unit: "일" });
});

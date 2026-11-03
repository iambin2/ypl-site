import assert from "node:assert/strict";
import test from "node:test";
import { submissionDue } from "../src/services/submissionDue.js";

const now = new Date(2026, 10, 3, 15, 0);

test("days ahead count calendar days, the last day counts hours", () => {
  assert.deepEqual(submissionDue({ submissionTargetAt: "2026-11-06T12:02" }, false, now), { value: 3, unit: "일" });
  assert.deepEqual(submissionDue({ submissionTargetAt: "2026-11-03T20:30" }, false, now), { value: 6, unit: "시간" });
});

test("a past or missing time shows nothing; champions take the nearest ahead", () => {
  assert.equal(submissionDue({ submissionTargetAt: "2026-11-02T12:00" }, false, now), null);
  assert.equal(submissionDue({}, false, now), null);
  assert.deepEqual(submissionDue({ qualifierSubmissionTargetAt: "2026-11-01T12:00", finalSubmissionTargetAt: "2026-11-10T12:00" }, true, now), { value: 7, unit: "일" });
});

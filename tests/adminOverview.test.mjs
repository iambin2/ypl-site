// 운영 (DESIGN.md "Admin"): the step an event stands at and the operators' list come from the overview alone.
import test from "node:test";
import assert from "node:assert/strict";
import { adminTasks, eventStep } from "../src/services/adminTasks.js";

test("an event stands at the step its notice and bracket say", () => {
  assert.equal(eventStep({ open: true, bracket: null, left: 0 }), 1, "applications open");
  assert.equal(eventStep({ open: false, bracket: null, left: 0 }), 2, "closed, no bracket yet");
  assert.equal(eventStep({ open: false, bracket: {}, left: 3 }), 3, "matches undecided");
  assert.equal(eventStep({ open: false, bracket: {}, left: 0 }), 4, "every match decided");
  assert.equal(eventStep({ open: true, bracket: null, left: 0, awaiting: true }), 4, "a day past with no bracket has its record left");
  assert.equal(eventStep({ open: false, bracket: {}, left: 2, awaiting: true }), 3, "results still come before the record");
});

test("the list is what waits, in the order it happens, and an open application is not a task", () => {
  const e = (id, step, more = {}) => ({ id, name: id, step, stage: "8강", done: 1, total: 4, left: 3, applicants: 9, submitted: 5, entrants: 8, battles: 0, awaiting: false, ...more });
  const tasks = adminTasks({ events: [e("A", 3), e("B", 1), e("C", 2), e("D", 4, { awaiting: true })], requests: [{ requested_name: "가" }], battles: 0 });
  assert.deepEqual(tasks.map(t => t.kind), ["play", "draw", "record"], "link requests have their own block, not a row");
  assert.match(tasks[0].line, /3경기 남음/);
  assert.match(tasks[2].line, /대회일이 지났습니다/);
  assert.deepEqual(adminTasks(null), []);
});

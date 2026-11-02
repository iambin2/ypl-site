import test from "node:test";
import assert from "node:assert/strict";
import { isNewNotice } from "../src/components/common/seenNotices.js";

test("a notice is new for seven days after its date (Lamps)", () => {
  const now = new Date(2026, 10, 2, 15);
  assert.equal(isNewNotice({ id: "a", date: "2026-10-28" }, now), true);
  assert.equal(isNewNotice({ id: "b", date: "2026.11.02 09:00" }, now), true);
  assert.equal(isNewNotice({ id: "c", date: "2026-10-26" }, now), false);
  assert.equal(isNewNotice({ id: "d", date: "2026-11-05" }, now), false, "a future date is not new yet");
  assert.equal(isNewNotice({ id: "e", date: "2026.11" }, now), false, "a month alone has no day");
  assert.equal(isNewNotice({ date: "2026-11-01" }, now), false, "no id, nothing to remember");
});

import test from "node:test";
import assert from "node:assert/strict";
import { pushMode } from "../src/services/announcementPushPolicy.js";

const phone = { connected: true, hasPush: false, ios: false, standalone: false };

test("a browser with push can toggle it", () => {
  assert.equal(pushMode({ ...phone, hasPush: true }), "ready");
  assert.equal(pushMode({ ...phone, hasPush: true, ios: true, standalone: true }), "ready");
});

test("iOS Safari without push is told to add the site to the home screen", () => {
  assert.equal(pushMode({ ...phone, ios: true }), "install");
});

test("a browser without push still shows the button and explains why", () => {
  assert.equal(pushMode(phone), "unsupported");
  assert.equal(pushMode({ ...phone, ios: true, standalone: true }), "unsupported");
});

test("nothing shows without Supabase", () => {
  assert.equal(pushMode({ ...phone, hasPush: true, connected: false }), "none");
});

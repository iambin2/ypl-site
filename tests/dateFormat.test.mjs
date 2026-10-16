import assert from "node:assert/strict";
import test from "node:test";
import { formatDate } from "../src/services/dateFormat.js";

const now = new Date(2026, 9, 11);

test("every stored date shape reads the same way", () => {
  assert.equal(formatDate("2026-10-04", { now }), "10월 4일 (일)");
  assert.equal(formatDate("2026.10.04", { now }), "10월 4일 (일)");
  assert.equal(formatDate("2025.11.26", { now }), "2025년 11월 26일 (수)");
  assert.equal(formatDate("2026.08", { now }), "2026년 8월");
  assert.equal(formatDate("2026.06.", { now }), "2026년 6월");
  assert.equal(formatDate("2024년 11월", { now }), "2024년 11월");
  assert.equal(formatDate(new Date(2026, 7, 18, 22, 57), { now, time: true }), "8월 18일 (화) 오후 10:57");
  assert.equal(formatDate("2026-10-04T00:05", { now, time: true }), "10월 4일 (일) 오전 12:05");
});

test("missing or unreadable dates render as nothing, never a dash", () => {
  for (const value of [null, undefined, "", "-", "날짜 미정"]) assert.equal(formatDate(value, { now }), "");
});

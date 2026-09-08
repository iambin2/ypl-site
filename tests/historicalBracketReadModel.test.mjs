import assert from "node:assert/strict";
import test from "node:test";
import { buildBracketPageList, isHistoricalReadOnlyBracket } from "../src/services/historicalBracketReadModel.js";
import { readFileSync } from "node:fs";

const historical = [
  { id: "dqpjmlw", name: "36회 파이컵", status: "done", eventId: null, projection: { source: null } },
  { id: "6cctrml", name: "36회 파이컵 | 마스터리그", status: "done", eventId: null, projection: { source: null } },
  { id: "6qhb5vl", name: "6회 챔피언스 시리즈", status: "done", eventId: null, projection: { source: null } },
];

test("three completed pre-normalized brackets remain visible as read-only history", () => {
  const list = buildBracketPageList([], historical);
  assert.deepEqual(list.map(row => row.name), historical.map(row => row.name));
  assert.ok(list.every(row => row.readOnly && row.historical && isHistoricalReadOnlyBracket(row)));
});

test("Event-linked or non-completed legacy graphs never enter the historical display list", () => {
  const list = buildBracketPageList(
    [{ id: "normalized", eventId: "event-a", projection: { source: "normalized" } }],
    [...historical, { id: "linked", status: "done", eventId: "event-a", projection: { source: null } }, { id: "open", status: "running", eventId: null, projection: { source: null } }]
  );
  assert.equal(list.length, 4);
  assert.equal(list[0].id, "normalized");
  assert.ok(list.slice(1).every(row => row.readOnly));
});

test("merged normalized and historical cards use a stable newest-first timestamp", () => {
  const list = buildBracketPageList(
    [
      { id: "runtime-old", eventId: "event-old", runtimeCreatedAt: "2026-09-01T00:00:00Z", projection: { source: "normalized" } },
      { id: "runtime-new", eventId: "event-new", runtimeCreatedAt: "2026-09-03T00:00:00Z", projection: { source: "normalized" } },
    ],
    [{ id: "history-mid", name: "과거", status: "done", createdAt: "2026-09-02T00:00:00Z", projection: { source: null } }]
  );
  assert.deepEqual(list.map(row => row.id), ["runtime-new", "history-mid", "runtime-old"]);
});

test("read-only historical rendering cannot enter active mutation controls", () => {
  const page = readFileSync("src/pages/BracketsPage.jsx", "utf8");
  assert.doesNotMatch(page, /과거 기록/);
  assert.match(page, /const locked=!!b\.applied\|\|deleting\|\|readOnly/);
  assert.match(page, /if\(readOnly\|\|locked\|\|matchMutationBusyRef\.current\)return/);
  assert.match(page, /if\(b\.readOnly\)\{ flash\("과거 완료 대진표는 조회 전용입니다\."\); return; \}/);
  assert.match(page, /admin&&!readOnly&&!b\.applied/);
  assert.match(page, /readOnly=\{open\.readOnly\}/);
});

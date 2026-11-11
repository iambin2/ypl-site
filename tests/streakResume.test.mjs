// 도전의 탑: the account's run as the server holds it, kept on a device that did not hold it (keepStreakResume).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const source = readFileSync(new URL("../src/services/battleService.js", import.meta.url), "utf8")
  .replace('import { callFunction, supa } from "../storage.js";', "const callFunction = null, supa = null;");
const { keepStreakResume, readStreakDraft, currentStreakGame, readSeat } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("a run picked elsewhere replaces this device's stale draft with its game and seat", () => {
  store.clear();
  localStorage.setItem("ypl-battle:streak-draft", JSON.stringify({ run: { run_id: "old" }, draft: [[{ species: "Raichu" }]] }));
  assert.equal(keepStreakResume({ run: { run_id: "r" }, id: "g1", token: "t", side: "p1", wins: 0, lives: 1, daily: null, party: ["Raichu"] }), true);
  assert.equal(readStreakDraft(), null);
  assert.equal(currentStreakGame(), "g1");
  assert.equal(readSeat("g1").token, "t");
});

test("a draft waiting on the server replaces another run's, and the same run's is left alone", () => {
  store.clear();
  localStorage.setItem("ypl-battle:streak-draft", JSON.stringify({ run: { run_id: "old" }, draft: [] }));
  assert.equal(keepStreakResume({ run: { run_id: "new" }, draft: [[{ species: "Pikachu" }]] }), true);
  assert.equal(readStreakDraft().run.run_id, "new");
  assert.equal(keepStreakResume({ run: { run_id: "new" }, draft: [[{ species: "Pikachu" }]] }), false);
});

test("no run on the server drops a stale draft; a game this device holds changes nothing", () => {
  store.clear();
  localStorage.setItem("ypl-battle:streak-draft", JSON.stringify({ run: { run_id: "old" }, draft: [] }));
  assert.equal(keepStreakResume({ run: null }), true);
  assert.equal(readStreakDraft(), null);
  assert.equal(keepStreakResume({ run: { run_id: "r" }, id: "g1", known: true }), false);
  assert.equal(keepStreakResume({ run: null }), false);
});

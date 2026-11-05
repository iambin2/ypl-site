import assert from "node:assert/strict";
import test from "node:test";
import { trainerLeague } from "../src/services/recordsPresentation.js";

// the committee's rule (2026-11-05), checked against their 27 master leaguers on the live records the same day
test("a trainer is master after an individual master league or an individual rookie, light or classic cup win", () => {
  const row = (tournamentKey, placement, extra = {}) => ({ tournamentKey, placement, team: false, ...extra });
  assert.equal(trainerLeague({ history: [row("master", "participant")] }), "master");
  assert.equal(trainerLeague({ placements: [row("rookie", "win")] }), "master");
  assert.equal(trainerLeague({ placements: [row("pylite", "win")] }), "master");
  assert.equal(trainerLeague({ placements: [row("pycup", "win")] }), "master");
  assert.equal(trainerLeague({ history: [row("rookie", "ru"), row("pycup", "sf")] }), "rookie", "a place short of the win is still rookie");
  assert.equal(trainerLeague({ history: [row("master", "win", { team: true })] }), "rookie", "team events do not count");
  assert.equal(trainerLeague({ history: [row("master", "sf", { championSeries: true })] }), "rookie", "the Champions series does not count");
  assert.equal(trainerLeague({}), "rookie");
});

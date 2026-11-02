import assert from "node:assert/strict";
import test from "node:test";
import { placementPointsOf } from "../src/services/bracketRankingAwardSnapshot.js";

test("an applied event's place points read back from its placement awards", () => {
  const individual = [
    { award_kind: "placement", points_delta: 60, win_delta: 1, runner_up_delta: 0, top4_delta: 0 },
    { award_kind: "placement", points_delta: 40, win_delta: 0, runner_up_delta: 1, top4_delta: 0 },
    { award_kind: "placement", points_delta: 20, win_delta: 0, runner_up_delta: 0, top4_delta: 1 },
    { award_kind: "correction", points_delta: -5, win_delta: 1, runner_up_delta: 0, top4_delta: 0 },
  ];
  assert.deepEqual(placementPointsOf(individual), { win: 60, ru: 40, sf: 20 });
  // a team event pays no 4강: it reads 0
  assert.deepEqual(placementPointsOf(individual.slice(0, 2)), { win: 60, ru: 40, sf: 0 });
  // no champion points, nothing to copy
  assert.equal(placementPointsOf(individual.slice(1)), null);
  assert.equal(placementPointsOf([]), null);
});

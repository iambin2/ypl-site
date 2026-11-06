// The battle screen's poll: how often it asks, when it stops, and when a player's view is fetched again.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/services/battleService.js", import.meta.url), "utf8")
  .replace('import { callFunction, supa } from "../storage.js";', "const callFunction = null, supa = null;");
const { battlePollDelay, playerViewIsCurrent } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("an open battle is asked often, an idle one less, a finished one not at all", () => {
  const active = { status: "active", kind: "friendly" };
  assert.equal(battlePollDelay(undefined, 0), 1500, "still loading");
  assert.equal(battlePollDelay(active, 59_000), 1500);
  assert.equal(battlePollDelay(active, 60_000), 3000);
  assert.equal(battlePollDelay({ status: "waiting" }, 299_000), 3000);
  assert.equal(battlePollDelay(active, 300_000), 6000);
  assert.equal(battlePollDelay(null, 0), null, "a cancelled battle");
  assert.equal(battlePollDelay({ status: "ended", kind: "friendly" }, 0), null);
  assert.equal(battlePollDelay({ status: "ended", kind: "friendly" }, 0, true), 3000, "a seat keeps reading for the other player's 다시하기");
  assert.equal(battlePollDelay({ status: "ended", kind: "friendly", rematch_id: "abcdefabcdef" }, 0, true), null, "the rematch is there");
  assert.equal(battlePollDelay({ status: "ended", kind: "friendly" }, 600_000, true), null, "not for ever");
  assert.equal(battlePollDelay({ status: "ended", kind: "official", applied_at: null, apply_error: null }, 0), 4500, "waits for its bracket line");
  assert.equal(battlePollDelay({ status: "ended", kind: "official", applied_at: "2026-11-05T00:00:00Z" }, 0), null);
  assert.equal(battlePollDelay({ status: "ended", kind: "official", apply_error: "무승부" }, 0), null);
});

test("a player's view is fetched again only when the engine moved", () => {
  const row = (version, log, status = "active") => ({ version, status, spectator_log: log });
  assert.equal(playerViewIsCurrent(null, null, row(1, "a")), false, "no view yet");
  assert.equal(playerViewIsCurrent({ version: 4 }, null, row(4, "a")), true, "the view of this very version");
  assert.equal(playerViewIsCurrent({ version: 4 }, row(4, "a"), row(5, "a")), true, "the other side's waiting choice");
  assert.equal(playerViewIsCurrent({ version: 4 }, row(4, "a"), row(5, "a\nb")), false, "a turn was played");
  assert.equal(playerViewIsCurrent({ version: 4 }, row(4, "a"), row(5, "a", "ended")), false, "a forfeit");
  assert.equal(playerViewIsCurrent({}, null, row(5, "a")), false, "an older function's view without a version");
  assert.equal(playerViewIsCurrent({}, row(4, "a"), row(5, "a")), true);
});

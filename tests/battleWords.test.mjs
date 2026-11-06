// What the battle screen says and marks, against the engine's rules (feedback 2026-11-06 and scripts/battle-fuzz.mjs, which found the rest).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentTypes, effectWord, effectiveness, moveType, weatherSuppressed } from "../src/pages/battle/battleWords.js";
import { createBattleReader, revives, slotPasses } from "../src/services/battleLog.js";

const text = JSON.parse(readFileSync(new URL("../src/data/battle-text-ko.json", import.meta.url), "utf8"));
const detail = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const res = { text, detail };
const read = lines => { const r = createBattleReader({ text, moves: detail.moves, perspective: "p1" }); const said = []; for (const l of lines) said.push(...(r.read(l).lines || [])); return { r, said }; };

test("a counted effect is said as a number, never its id (Supreme Overlord's fallen2 stood on the plate)", () => {
  assert.equal(effectWord(res, "fallen2"), "쓰러진 동료 2");
  assert.equal(effectWord(res, "perish3"), "멸망의노래 3");
  assert.match(effectWord(res, "confusion"), /[가-힣]/);
});

test("the moves that are not their type on the chart are marked as they land", () => {
  assert.equal(effectiveness("Ice", ["Water"], "freezedry"), 2, "Freeze-Dry hits Water ×2");
  assert.equal(effectiveness("Ice", ["Water", "Flying"], "freezedry"), 4);
  assert.equal(effectiveness("Ice", ["Water"], "icebeam"), 0.5);
  assert.equal(effectiveness("Fighting", ["Normal"], "flyingpress"), 2);
  assert.equal(effectiveness("Fighting", ["Grass"], "flyingpress"), 2, "Flying's matchup on top");
  assert.equal(effectiveness("Ground", ["Flying"], "thousandarrows"), 1);
});

test("a move goes out as the type its user, the weather or its form makes it", () => {
  assert.equal(moveType("hypervoice", "Normal", { ability: "pixilate" }), "Fairy");
  assert.equal(moveType("doubleedge", "Normal", { ability: "dragonize" }), "Dragon", "Champions' Dragonize");
  assert.equal(moveType("weatherball", "Normal", { ability: "pixilate" }, {}), "Normal", "an -ate ability leaves Weather Ball alone");
  assert.equal(moveType("weatherball", "Normal", {}, { weather: "SunnyDay" }), "Fire");
  assert.equal(moveType("weatherball", "Normal", {}, { weather: "RainDance", suppressed: true }), "Normal", "Cloud Nine or Air Lock out");
  assert.equal(moveType("weatherball", "Normal", { item: "Utility Umbrella" }, { weather: "RainDance" }), "Normal");
  assert.equal(moveType("weatherball", "Normal", { item: "Utility Umbrella" }, { weather: "Sandstorm" }), "Rock");
  assert.equal(moveType("aurawheel", "Electric", { species: "Morpeko-Hangry" }), "Dark");
  assert.equal(moveType("ragingbull", "Normal", { species: "Tauros-Paldea-Combat" }), "Fighting");
  assert.equal(moveType("surf", "Water", { ability: "normalize" }), "Normal");
  assert.equal(moveType("hypervoice", "Normal", { ability: "liquidvoice" }), "Water");
  assert.ok(weatherSuppressed([{ ability: "Cloud Nine" }]));
});

test("the screen follows a changed typing: Soak, Trick-or-Treat, Roost for its turn, Transform", () => {
  const start = ["|player|p1|가|", "|player|p2|나|", "|switch|p1a: Gyarados|Gyarados, L50|150/150", "|switch|p2a: Corviknight|Corviknight, L50|100/100", "|turn|1"];
  let { r, said } = read([...start, "|-start|p2a: Corviknight|typeadd|Ghost|[from] move: Trick-or-Treat"]);
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Flying", "Steel", "Ghost"]);
  r.read("|-start|p2a: Corviknight|typechange|Water|[from] move: Soak");
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Water"], "Soak replaces the added type too");
  ({ said } = { said: r.read("|-end|p2a: Corviknight|typechange").lines || [] });
  assert.deepEqual(said, [], "a typing put back says nothing");
  ({ r } = read([...start, "|move|p2a: Corviknight|Roost|p2a: Corviknight", "|-singleturn|p2a: Corviknight|move: Roost"]));
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Steel"]);
  r.read("|upkeep");
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Flying", "Steel"], "Roost lasts its turn");
  ({ r } = read([...start, "|-boost|p1a: Gyarados|atk|2", "|switch|p2a: Ditto|Ditto, L50|100/100", "|-transform|p2a: Ditto|p1a: Gyarados|[from] ability: Imposter"]));
  assert.deepEqual(r.state.sides.p2.active[0].boosts, { atk: 2 }, "Transform takes the stat changes");
  const fallen = read([...start, "|-start|p2a: Corviknight|fallen2|[silent]", "|-end|p2a: Corviknight|fallen2|[silent]"]).said;
  assert.deepEqual(fallen.filter(l => /fallen/.test(l)), []);
});

test("Revival Blessing asks for a fainted Pokémon, and passes when there is none", () => {
  const mons = [{ condition: "41/204", active: true }, { condition: "55/147", active: true, reviving: true }, { condition: "172/172", active: false }, { condition: "0 fnt", active: false }];
  const request = { forceSwitch: [false, true], side: { pokemon: mons } };
  assert.ok(revives(request, 1));
  assert.equal(slotPasses(request, 1), false, "a fainted one can come back");
  assert.equal(slotPasses({ ...request, side: { pokemon: mons.slice(0, 3) } }, 1), true, "no fainted one: the place passes");
});

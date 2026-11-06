import assert from "node:assert/strict";
import test from "node:test";

import { GEN } from "../src/services/calculatorCore.js";
import { TYPE_OPTIONS } from "../src/data/index.js";
import { damageDealt, damageTaken, effectiveness, multiplierMark, teamMatchups } from "../src/services/teamTypeChart.js";

const at = (row, english) => row[TYPE_OPTIONS.findIndex(type => type.english === english)];

test("the builder's chart is the calculator's chart, all 324 pairs", () => {
  for (const { english: attacking } of TYPE_OPTIONS)
    for (const { english: defending } of TYPE_OPTIONS)
      assert.equal(effectiveness(attacking, defending), GEN.types.get(attacking.toLowerCase()).effectiveness[defending] ?? 1, `${attacking} → ${defending}`);
});

test("damage taken multiplies both types and counts the ability", () => {
  const garchomp = damageTaken(["Dragon", "Ground"]);
  assert.equal(at(garchomp, "Ice"), 4);
  assert.equal(at(garchomp, "Electric"), 0);
  assert.equal(at(garchomp, "Fire"), 0.5);
  const rotomWash = damageTaken(["Electric", "Water"], "Levitate");
  assert.equal(at(rotomWash, "Ground"), 0);
  assert.equal(at(damageTaken(["Grass", "Steel"], "Thick Fat"), "Fire"), 2);
});

test("damage dealt keeps the best damaging move a type, -ate abilities and odd moves included", () => {
  const eq = { id: "earthquake", type: "Ground", category: "Physical" };
  const swords = { id: "swordsdance", type: "Normal", category: "Status" };
  const row = damageDealt([eq, swords]);
  assert.equal(at(row, "Steel").m, 2);
  assert.equal(at(row, "Steel").move, eq);
  assert.equal(at(row, "Flying").m, 0);
  assert.deepEqual(damageDealt([swords]), TYPE_OPTIONS.map(() => null));
  const voice = { id: "hypervoice", type: "Normal", category: "Special" };
  assert.equal(at(damageDealt([voice], "Pixilate"), "Dragon").m, 2);
  assert.equal(at(damageDealt([{ id: "freezedry", type: "Ice", category: "Special" }]), "Water").m, 2);
  assert.equal(at(damageDealt([{ id: "closecombat", type: "Fighting", category: "Physical" }], "Scrappy"), "Ghost").m, 1);
  assert.equal(at(damageDealt([{ id: "seismictoss", type: "Fighting", category: "Physical" }]), "Normal"), null);
});

test("team rows count weak, resisting and hitting members", () => {
  const rows = teamMatchups([
    { types: ["Dragon", "Ground"], ability: "", moves: [{ id: "earthquake", type: "Ground", category: "Physical" }] },
    { types: ["Fire", "Flying"], ability: "", moves: [] },
  ]);
  const ice = rows.find(row => row.type.english === "Ice");
  assert.deepEqual(ice.defence, [4, 1]);
  assert.equal(ice.weak, 1);
  const ground = rows.find(row => row.type.english === "Ground");
  assert.equal(ground.resist, 1);
  const steel = rows.find(row => row.type.english === "Steel");
  assert.equal(steel.hits, 1);
  assert.equal(steel.offence[1], null);
});

test("marks are the battle's marks, nothing for neutral", () => {
  assert.deepEqual([4, 2, 1, 0.5, 0.25, 0, null].map(multiplierMark), ["×4", "×2", "", "×½", "×¼", "×0", ""]);
});

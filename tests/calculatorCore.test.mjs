import assert from "node:assert/strict";
import test from "node:test";

import {
  applySpeedModifier,
  buildPokemon,
  damageFor,
  defensiveMatchups,
  emptyField,
  emptySide,
  koLabel,
  normalizeSide,
  percentOf,
  sideFromMember,
  speedDuel,
  speedLines,
  statRange,
  weightMovePower,
} from "../src/services/calculatorCore.js";

const detailData = {
  pokedex: {
    garchomp: { id: "garchomp", name: "Garchomp", abilities: ["Sand Veil", "Rough Skin"], types: ["Dragon", "Ground"], baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } },
    dragonite: { id: "dragonite", name: "Dragonite", abilities: ["Inner Focus", "Multiscale"], types: ["Dragon", "Flying"], baseStats: { hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80 } },
  },
  moves: {
    outrage: { id: "outrage", name: "Outrage" },
    earthquake: { id: "earthquake", name: "Earthquake" },
    swordsdance: { id: "swordsdance", name: "Swords Dance" },
  },
  items: { choicescarf: { id: "choicescarf", name: "Choice Scarf" } },
};

const side = patch => ({ ...emptySide(), ...patch });
const chomp = side({ name: "Garchomp", sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 } });
const nite = side({ name: "Dragonite", ability: "Inner Focus" });
const duel = (attackerSide, defenderSide, moveId, field = emptyField()) => damageFor({
  detailData,
  attacker: buildPokemon(detailData, detailData.pokedex.garchomp, attackerSide),
  defender: buildPokemon(detailData, detailData.pokedex.dragonite, defenderSide),
  attackerSide, defenderSide, field, moveId,
});

test("damage matches the published Champions reference (32 Atk Garchomp Outrage vs 0 HP Dragonite)", () => {
  const result = duel(chomp, nite, "outrage");
  assert.equal(result.min, 216);
  assert.equal(result.max, 254);
  assert.equal(result.minPct, 130.1);
  assert.equal(result.maxPct, 153);
  assert.equal(result.koText, "확정 1타");
  assert.equal(result.rolls.length, 16);
});

test("immunity, status moves, and side conditions", () => {
  assert.equal(duel(chomp, nite, "earthquake").koText, "효과 없음");
  assert.equal(duel(chomp, nite, "swordsdance").status, true);
  const screened = duel(chomp, { ...nite, conds: { reflect: true } }, "outrage");
  assert.ok(screened.max < 254, "reflect on the defender's side lowers damage");
  assert.equal(duel(chomp, nite, "notamove"), null);
});

test("Multiscale at full HP halves damage, and HP percent turns it off", () => {
  const scaled = duel(chomp, { ...nite, ability: "Multiscale" }, "outrage");
  const chipped = duel(chomp, { ...nite, ability: "Multiscale", hp: 99 }, "outrage");
  assert.ok(scaled.max < chipped.max / 1.8);
});

test("KO labels are Korean", () => {
  assert.equal(koLabel({ n: 2, chance: 1 }), "확정 2타");
  assert.equal(koLabel({ n: 1, chance: 0.4375 }), "난수 1타 (43.8%)");
  assert.equal(koLabel({ n: 0, chance: 0 }, 200, 30), "7타 이상");
  assert.equal(percentOf(216, 166), 130.1);
});

test("speed duel honours scarf, tailwind and trick room", () => {
  const a = side({ name: "Garchomp" });
  const b = side({ name: "Dragonite", item: "choicescarf" });
  const make = (s, id) => buildPokemon(detailData, detailData.pokedex[id], s);
  const base = speedDuel({ a: make(a, "garchomp"), b: make(b, "dragonite"), sideA: a, sideB: b, field: emptyField() });
  assert.deepEqual([base.speedA, base.speedB, base.first], [122, 150, "b"]);
  const tail = { ...a, conds: { tailwind: true } };
  assert.equal(speedDuel({ a: make(tail, "garchomp"), b: make(b, "dragonite"), sideA: tail, sideB: b, field: emptyField() }).first, "a");
  const room = { ...emptyField(), flags: { trickRoom: true } };
  assert.equal(speedDuel({ a: make(a, "garchomp"), b: make(b, "dragonite"), sideA: a, sideB: b, field: room }).first, "a");
});

test("speed lines and modifiers", () => {
  assert.deepEqual(speedLines(102), { max: 169, neutral: 154, none: 122, min: 109 });
  assert.equal(applySpeedModifier(101, "1.5"), 151);
  assert.equal(applySpeedModifier(103, "1.5"), 154);
  assert.equal(applySpeedModifier(155, "0.5"), 77);
  assert.equal(applySpeedModifier(100, "2"), 200);
});

test("type chart, weight power and stat ranges", () => {
  const chart = defensiveMatchups(["Dragon", "Ground"]);
  assert.deepEqual(chart[4], ["Ice"]);
  assert.deepEqual(chart[0], ["Electric"]);
  assert.ok(chart[2].includes("Fairy") && chart[2].includes("Dragon"));
  assert.equal(weightMovePower(95), 80);
  assert.equal(weightMovePower(210), 120);
  assert.deepEqual(statRange(108, "hp"), [183, 215]);
  assert.deepEqual(statRange(130, "atk"), [135, 200]);
});

test("stored sides are clamped and team members convert", () => {
  const restored = normalizeSide({ name: "Garchomp", sp: { atk: 99, spe: -3 }, boosts: { atk: 9 }, hp: 0, nature: "nope", moves: ["outrage", 5], conds: { reflect: 1, bogus: true } });
  assert.equal(restored.sp.atk, 32);
  assert.equal(restored.sp.spe, 0);
  assert.equal(restored.boosts.atk, 6);
  assert.equal(restored.hp, 1);
  assert.equal(restored.nature, "serious");
  assert.deepEqual(restored.moves, ["outrage", "", "", ""]);
  assert.deepEqual(restored.conds, { reflect: true });
  const fromMember = sideFromMember({ pokemon: { name: "Garchomp" }, ability: "Rough Skin", item: "choicescarf", alignment: "jolly", statPoints: { spe: 32 }, moves: ["earthquake"] });
  assert.equal(fromMember.nature, "jolly");
  assert.equal(fromMember.sp.spe, 32);
  assert.deepEqual(fromMember.moves, ["earthquake", "", "", ""]);
});

test("Champions PP: base capped at 20, then full PP Ups", async () => {
  const { championsPP } = await import("../src/services/teamBuilderCore.js");
  assert.deepEqual([5, 10, 15, 20, 35, 40].map(championsPP), [8, 12, 16, 20, 20, 20]);
  assert.equal(championsPP(null), null);
});

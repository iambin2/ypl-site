// The weekly blend of YPL's computer battles into the computer's set beliefs (scripts/learn-cpu-sets.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Teams } from "@pkmn/sim";
import { learn, MIN_PLAYERS, MIN_SEEN, RATE } from "../scripts/learn-cpu-sets.mjs";

const SETS = JSON.parse(readFileSync(new URL("../src/data/random-sets.json", import.meta.url), "utf8"));
const FORMAT = "gen9championsbssregmc";
const pool = SETS["m-c"].singles;
const venusaur = () => pool.find(e => e.species === "Venusaur");
const asSet = (entry, set, name = "") => ({ name, species: entry.species, ability: set.ability, item: set.items[0], moves: [...set.moves], nature: set.nature, evs: { ...set.evs }, level: 50 });
const record = team => ({ format_id: FORMAT, input_log: `>start {"formatid":"${FORMAT}","seed":[1,2,3,4]}\n>player p1 ${JSON.stringify({ name: "선수", team: Teams.pack(team) })}\n>player p2 {"name":"컴퓨터","team":""}` });

// Venusaur sets the ladder does not have
const OWN = { name: "", species: "Venusaur", ability: "Chlorophyll", item: "Life Orb", moves: ["Giga Drain", "Sludge Bomb", "Earth Power", "Sleep Powder"], nature: "Modest", evs: { hp: 2, spa: 32, spe: 32 }, level: 50 };
const ODD = { ...OWN, item: "Leftovers", moves: ["Giga Drain", "Sludge Bomb", "Leech Seed", "Protect"], nature: "Calm", evs: { hp: 32, spd: 32, spe: 2 } };
const others = pool.filter(e => e.species !== "Venusaur" && !e.sets[0].mega);
// person i: OWN Venusaur and five Pokémon no other person brings, so no two people look alike
const person = i => [OWN, ...others.slice(i * 5, i * 5 + 5).map(e => asSet(e, e.sets[0]))];
const randomParty = () => [venusaur(), ...others.slice(0, 5)].map(e => asSet(e, e.sets[0]));

test("too few players leave the beliefs as they are", () => {
  const out = learn(SETS, Array.from({ length: MIN_PLAYERS - 1 }, (_, i) => record(person(i))));
  assert.equal(out.learned, false);
  assert.equal(out.sets, SETS);
});

test("player sets blend in lightly, random and repeated parties do not count, and a rerun does not drift", () => {
  const records = [...Array.from({ length: 40 }, (_, i) => record(person(i))), record(person(0)), record(randomParty()), record(randomParty())];
  const out = learn(SETS, records);
  assert.equal(out.learned, true);
  assert.equal(out.used, 40);
  assert.equal(out.players, 40);
  assert.equal(out.skipped, 3);
  const entry = out.sets["m-c"].singles.find(e => e.species === "Venusaur");
  const mine = entry.sets.find(s => s.ypl);
  assert.ok(mine, "the YPL set joins");
  assert.deepEqual(mine.items, ["Life Orb"]);
  // 40 players of 40: the share is RATE * 40 / 60
  assert.ok(Math.abs(mine.weight - RATE * 40 / 60) <= 0.02, `weight ${mine.weight}`);
  assert.deepEqual(entry.sets.filter(s => !s.ypl).map(s => s.baseWeight), venusaur().sets.map(s => s.weight));
  // the original data is untouched, and learning again from the learned file gives the same file
  assert.equal(venusaur().sets.some(s => s.ypl || s.baseWeight != null), false);
  const again = learn(out.sets, records);
  delete again.sets.learned; delete out.sets.learned;
  assert.deepEqual(again.sets, out.sets);
});

test("one person playing many times, changing a Pokémon each time, counts as one player", () => {
  const people = Array.from({ length: 40 }, (_, i) => record(person(i)));
  const tail = others.slice(-80);
  const core = tail.slice(0, 4).map(e => asSet(e, e.sets[0]));
  // the same ODD Venusaur and four Pokémon, the sixth changed every time, 60 battles
  const grinder = Array.from({ length: 60 }, (_, k) => record([ODD, ...core, asSet(tail[4 + k], tail[4 + k].sets[0])]));
  const out = learn(SETS, [...people, ...grinder]);
  assert.equal(out.used, 100);
  assert.equal(out.players, 41);
  const entry = out.sets["m-c"].singles.find(e => e.species === "Venusaur");
  assert.equal(entry.sets.filter(s => s.ypl).length, 1, `ODD needs ${MIN_SEEN} players to join`);
  assert.deepEqual(entry.sets.find(s => s.ypl).items, ["Life Orb"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { pokemonSamples, sampleUsage } from "../src/services/recordsPresentation.js";

const set = (item, ability, moves) => ({ item_id: item, ability_id: ability, nature_id: "timid", move_1_id: moves[0], move_2_id: moves[1] });
const rosters = [
  { id: "old", owner: "가", date: "2026-01-01", pokemon: ["누리레느"], sets: [set("leftovers", "torrent", ["aquajet", "moonblast"])] },
  { id: "new", owner: "나", date: "2026-02-01", pokemon: ["한카리아스", "누리레느"], sets: [set("lifeorb", "roughskin", ["earthquake"]), set("leftovers", "liquidvoice", ["aquajet"])] },
  { id: "names-only", owner: "다", date: "2026-03-01", pokemon: ["누리레느"] },
  { id: "empty-set", owner: "라", date: "2026-03-02", pokemon: ["누리레느"], sets: [{ item_id: "leftovers" }] },
];

test("a sample is read at the Pokémon's own slot, newest first, and a roster without a set gives none", () => {
  const samples = pokemonSamples(rosters, "누리레느");
  assert.deepEqual(samples.map(s => s.roster.id), ["new", "old"]);
  assert.equal(samples[0].set.ability_id, "liquidvoice");
});

test("usage counts each sample once and ranks what is used most", () => {
  const usage = sampleUsage(pokemonSamples(rosters, "누리레느"));
  assert.equal(usage.total, 2);
  assert.deepEqual(usage.items, [{ id: "leftovers", count: 2, rate: 100 }]);
  assert.deepEqual(usage.moves[0], { id: "aquajet", count: 2, rate: 100 });
  assert.deepEqual(usage.moves[1], { id: "moonblast", count: 1, rate: 50 });
});

test("no samples give an empty usage, not a division by zero", () => {
  assert.deepEqual(sampleUsage([]), { total: 0, items: [], abilities: [], natures: [], moves: [] });
});

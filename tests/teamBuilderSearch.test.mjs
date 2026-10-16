import test from "node:test";
import assert from "node:assert/strict";
import { matchesBuilderSearch, parseBuilderSearch } from "../src/services/teamBuilderCore.js";

const detailData = {
  pokedex: {
    pikachu: { id: "pikachu", name: "Pikachu", types: ["Electric"], abilities: ["Static", "Lightning Rod"] },
    incineroar: { id: "incineroar", name: "Incineroar", types: ["Fire", "Dark"], abilities: ["Blaze", "Intimidate"] },
  },
  learnsets: { pikachu: ["thunderbolt", "fakeout"], incineroar: ["fakeout", "flareblitz"] },
  moves: { thunderbolt: { name: "Thunderbolt" }, fakeout: { name: "Fake Out" }, flareblitz: { name: "Flare Blitz" } },
};
const pool = [{ name: "Pikachu" }, { name: "Incineroar" }];
const search = query => {
  const filters = parseBuilderSearch(detailData, query);
  return pool.filter(pokemon => matchesBuilderSearch(detailData, pokemon, pokemon.name, filters)).map(pokemon => pokemon.name);
};

test("builder search filters by move, ability, type and name like Showdown", () => {
  assert.deepEqual(search("Fake Out"), ["Pikachu", "Incineroar"]);
  assert.deepEqual(search("속이기"), ["Pikachu", "Incineroar"]);
  assert.deepEqual(search("fake out, intimidate"), ["Incineroar"]);
  assert.deepEqual(search("위협"), ["Incineroar"]);
  assert.deepEqual(search("전기"), ["Pikachu"]);
  assert.deepEqual(search("thunderbolt"), ["Pikachu"]);
  assert.deepEqual(search("pika"), ["Pikachu"]);
  assert.deepEqual(search("intimidate, pika"), []);
});

test("builder search falls back to names before detail data loads", () => {
  assert.deepEqual(parseBuilderSearch(null, "fire"), [{ kind: "name", term: "fire" }]);
});

test("builder search suggests start-of-name matches first, grouped like Showdown", async () => {
  const { builderSearchVocabulary, builderSearchSuggestions } = await import("../src/services/teamBuilderCore.js");
  const vocabulary = builderSearchVocabulary(detailData, pool);
  const suggest = (query, active) => builderSearchSuggestions(vocabulary, query, active).map(entry => `${entry.kind}:${entry.id}`);
  assert.deepEqual(suggest("fla"), ["move:flareblitz"]);
  assert.deepEqual(suggest("속"), ["move:fakeout"]);
  // "Intimidate" starts with "in", so it ranks above the mid-name "Lightning Rod"
  assert.deepEqual(suggest("in"), ["type:fighting", "type:flying", "ability:intimidate", "ability:lightningrod"]);
  assert.equal(suggest("intim")[0], "ability:intimidate");
  assert.deepEqual(suggest("intim", [{ kind: "ability", id: "intimidate" }]), []);
  assert.deepEqual(suggest(""), []);
});

test("builder sort values follow base stats and total", async () => {
  const { builderSortValue } = await import("../src/services/teamBuilderCore.js");
  const data = { pokedex: { pikachu: { baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 } } } };
  assert.equal(builderSortValue(data, { name: "Pikachu" }, "spe"), 90);
  assert.equal(builderSortValue(data, { name: "Pikachu" }, "bst"), 320);
  assert.equal(builderSortValue(data, { name: "Pikachu" }, "name"), null);
});

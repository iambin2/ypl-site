import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildChampionsData, validateChampionsData } from "../scripts/build-champions-data.mjs";

const sources = {
  pokedex: '\tpikachu: {\n\t\tnum: 25,\n\t\tname: "Pikachu",\n\t\ttypes: ["Electric"],\n\t\tbaseStats: {hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90},\n\t\tabilities: {0: "Static", H: "Lightning Rod"},\n\t},',
  moves: '\tthunderbolt: {\n\t\tnum: 85,\n\t\taccuracy: 100,\n\t\tbasePower: 90,\n\t\tcategory: "Special",\n\t\tname: "Thunderbolt",\n\t\tpp: 15,\n\t\tpriority: 0,\n\t\ttype: "Electric",\n\t},',
  items: '\tleftovers: {\n\t\tname: "Leftovers",\n\t\tnum: 234,\n\t},\n\tlifeorb: {\n\t\tname: "Life Orb",\n\t\tisNonstandard: "Unobtainable",\n\t},',
  championsLearnsets: '\tpikachu: {\n\t\tlearnset: {\n\t\t\tthunderbolt: ["9M"],\n\t\t},\n\t},',
  championsMoves: '\tthunderbolt: {\n\t\tpp: 20,\n\t},',
  championsItems: '\tlifeorb: {\n\t\tisNonstandard: null,\n\t},',
  speciesNames: "pokemon_species_id,local_language_id,name,genus\n25,3,피카츄,쥐포켓몬\n25,9,Pikachu,Mouse Pokémon\n83,3,파오리,청둥오리포켓몬\n83,9,Farfetch’d,Wild Duck Pokémon\n",
};

test("the build applies champions overrides and folds Korean names into the same file", () => {
  const data = buildChampionsData(sources);
  assert.deepEqual(Object.keys(data), ["pokedex", "learnsets", "moves", "items", "speciesNames"]);
  assert.deepEqual(data.pokedex.pikachu.abilities, ["Static", "Lightning Rod"]);
  assert.deepEqual(data.learnsets.pikachu, ["thunderbolt"]);
  assert.equal(data.moves.thunderbolt.pp, 20);
  assert.equal(data.items.lifeorb.isNonstandard, null);
  assert.equal(data.speciesNames.koreanById["25"], "피카츄");
  assert.equal(data.speciesNames.koreanByEnglish["farfetch'd"], "파오리");
});

test("validation rejects a thin build and accepts the committed file", () => {
  assert.throws(() => validateChampionsData(buildChampionsData(sources)), /pokedex entries: 1 \(expected at least 1000\)/);
  assert.throws(() => validateChampionsData(buildChampionsData({ ...sources, pokedex: "" })), /pikachu is incomplete/);
  const committed = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => validateChampionsData(committed));
});

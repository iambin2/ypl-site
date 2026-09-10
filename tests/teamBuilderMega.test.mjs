import test from "node:test";
import assert from "node:assert/strict";
import { parsePokedex } from "../src/services/championsData.js";
import {
  dexRecord,
  fromTeamSnapshotV1,
  localizedPokemonName,
  makeMember,
  matchesPokemonSearch,
  memberFromSaved,
  membersRemovedByRuleChange,
  pokemonMatchesCupRule,
  pokemonPoolForRegulation,
  replaceMemberPokemon,
  requiredItemForPokemon,
  serializeMembers,
  speciesIdentity,
  spriteSlug,
  toTeamSnapshotV1,
  validateTeam,
} from "../src/services/teamBuilderCore.js";

const regulation = {
  id: "mega-test",
  shortName: "MEGA",
  maxTeamSize: 6,
  pokemon: ["Gyarados", "Charizard", "Metagross", "Salamence"].map((name, index) => ({ id: `base-${index}`, name })),
};

const detailData = {
  pokedex: {
    gyarados: { id: "gyarados", num: 130, name: "Gyarados", baseSpecies: "Gyarados", types: ["Water", "Flying"], abilities: ["Intimidate"], baseStats: { hp: 95, atk: 125, def: 79, spa: 60, spd: 100, spe: 81 } },
    gyaradosmega: { id: "gyaradosmega", num: 130, name: "Gyarados-Mega", baseSpecies: "Gyarados", forme: "Mega", requiredItem: "Gyaradosite", types: ["Water", "Dark"], abilities: ["Mold Breaker"], baseStats: { hp: 95, atk: 155, def: 109, spa: 70, spd: 130, spe: 81 } },
    charizard: { id: "charizard", num: 6, name: "Charizard", baseSpecies: "Charizard", types: ["Fire", "Flying"], abilities: ["Blaze"], baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 } },
    charizardmegax: { id: "charizardmegax", num: 6, name: "Charizard-Mega-X", baseSpecies: "Charizard", forme: "Mega-X", requiredItem: "Charizardite X", types: ["Fire", "Dragon"], abilities: ["Tough Claws"], baseStats: { hp: 78, atk: 130, def: 111, spa: 130, spd: 85, spe: 100 } },
    charizardmegay: { id: "charizardmegay", num: 6, name: "Charizard-Mega-Y", baseSpecies: "Charizard", forme: "Mega-Y", requiredItem: "Charizardite Y", types: ["Fire", "Flying"], abilities: ["Drought"], baseStats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100 } },
    metagross: { id: "metagross", num: 376, name: "Metagross", baseSpecies: "Metagross", types: ["Steel", "Psychic"], abilities: ["Clear Body"] },
    metagrossmega: { id: "metagrossmega", num: 376, name: "Metagross-Mega", baseSpecies: "Metagross", forme: "Mega", requiredItem: "Metagrossite", types: ["Steel", "Psychic"], abilities: ["Tough Claws"] },
    salamence: { id: "salamence", num: 373, name: "Salamence", baseSpecies: "Salamence", types: ["Dragon", "Flying"], abilities: ["Intimidate"] },
    salamencemega: { id: "salamencemega", num: 373, name: "Salamence-Mega", baseSpecies: "Salamence", forme: "Mega", requiredItem: "Salamencite", types: ["Dragon", "Flying"], abilities: ["Aerilate"] },
  },
  items: Object.fromEntries([
    ["gyaradosite", "Gyaradosite"],
    ["charizarditex", "Charizardite X"],
    ["charizarditey", "Charizardite Y"],
    ["metagrossite", "Metagrossite"],
    ["salamencite", "Salamencite"],
    ["leftovers", "Leftovers"],
  ].map(([id, name]) => [id, { id, name, isNonstandard: null }])),
  learnsets: {
    gyarados: ["waterfall"], charizard: ["flamethrower"], metagross: ["meteormash"], salamence: ["dragonclaw"],
  },
  moves: {},
};

const legalItems = Object.values(detailData.items);
const pool = pokemonPoolForRegulation(regulation, detailData, legalItems);
const pokemon = name => pool.find(entry => entry.name === name);

function megaMember(name) {
  const member = makeMember(pokemon(name), { detailData });
  member.ability = dexRecord(detailData, member.pokemon).abilities[0];
  return member;
}

test("Showdown Pokédex parsing retains Mega form and required-item metadata", () => {
  const parsed = parsePokedex(`export const Pokedex = {\n\tgyaradosmega: {\n\t\tnum: 130,\n\t\tname: "Gyarados-Mega",\n\t\tbaseSpecies: "Gyarados",\n\t\tforme: "Mega",\n\t\ttypes: ["Water", "Dark"],\n\t\tbaseStats: { hp: 95, atk: 155, def: 109, spa: 70, spd: 130, spe: 81 },\n\t\tabilities: { 0: "Mold Breaker" },\n\t\trequiredItem: "Gyaradosite",\n\t},\n};`);
  assert.equal(parsed.gyaradosmega.forme, "Mega");
  assert.equal(parsed.gyaradosmega.requiredItem, "Gyaradosite");
  assert.deepEqual(parsed.gyaradosmega.types, ["Water", "Dark"]);
  assert.equal(parsed.gyaradosmega.baseStats.atk, 155);
  assert.deepEqual(parsed.gyaradosmega.abilities, ["Mold Breaker"]);
});

test("Mega choices are derived from allowed base species and legal required stones", () => {
  assert.deepEqual(
    pool.filter(entry => entry.isMegaForm).map(entry => entry.name).sort(),
    ["Charizard-Mega-X", "Charizard-Mega-Y", "Gyarados-Mega", "Metagross-Mega", "Salamence-Mega"].sort(),
  );
  assert.equal(pokemonPoolForRegulation(regulation, detailData, []).some(entry => entry.isMegaForm), false);
  assert.deepEqual(
    pokemonPoolForRegulation(regulation, detailData, [{ id: "gyaradosite" }]).filter(entry => entry.isMegaForm).map(entry => entry.name),
    ["Gyarados-Mega"],
  );
});

test("Mega display data uses the selected form while competition monotype checks the base form", () => {
  const mega = pokemon("Gyarados-Mega");
  const details = dexRecord(detailData, mega);
  assert.equal(details.baseStats.atk, 155);
  assert.deepEqual(details.types, ["Water", "Dark"]);
  assert.deepEqual(details.abilities, ["Mold Breaker"]);
  assert.equal(requiredItemForPokemon(detailData, mega), "gyaradosite");
  assert.equal(pokemonMatchesCupRule({ pokemon: mega, cupRuleId: "monotype-challenge", assignedTypeId: "flying", detailData }), true);
  assert.equal(pokemonMatchesCupRule({ pokemon: mega, cupRuleId: "monotype-challenge", assignedTypeId: "dark", detailData }), false);
});

test("Mega X and Y retain distinct forms, stones, stats, types, and abilities", () => {
  const x = pokemon("Charizard-Mega-X");
  const y = pokemon("Charizard-Mega-Y");
  assert.equal(requiredItemForPokemon(detailData, x), "charizarditex");
  assert.equal(requiredItemForPokemon(detailData, y), "charizarditey");
  assert.equal(dexRecord(detailData, x).baseStats.def, 111);
  assert.equal(dexRecord(detailData, y).baseStats.spa, 159);
  assert.deepEqual(dexRecord(detailData, x).types, ["Fire", "Dragon"]);
  assert.deepEqual(dexRecord(detailData, y).abilities, ["Drought"]);
});

test("Mega selection and persistence force the required stone and restore form identity", () => {
  const member = megaMember("Gyarados-Mega");
  assert.equal(member.item, "gyaradosite");
  member.item = "leftovers";

  const saved = serializeMembers([member], { detailData });
  assert.equal(saved[0].pokemonId, "gyaradosmega");
  assert.equal(saved[0].item, "gyaradosite");
  const restored = memberFromSaved(saved[0], regulation, { detailData });
  assert.equal(restored.pokemon.name, "Gyarados-Mega");
  assert.equal(restored.item, "gyaradosite");

  const snapshot = toTeamSnapshotV1({ team: [member], regulationId: regulation.id, cupRuleId: "none", detailData });
  assert.equal(snapshot.members[0].pokemon_id, "gyaradosmega");
  assert.equal(snapshot.members[0].item_id, "gyaradosite");
  const loaded = fromTeamSnapshotV1({ snapshot: snapshot.snapshot, members: snapshot.members, regulation, detailData });
  assert.equal(loaded.team[0].pokemon.name, "Gyarados-Mega");
  assert.equal(loaded.team[0].item, "gyaradosite");
});

test("switching between base and Mega forms preserves existing item semantics", () => {
  const base = makeMember(pokemon("Gyarados"), { detailData });
  base.item = "leftovers";
  const mega = replaceMemberPokemon(base, pokemon("Gyarados-Mega"), { detailData });
  assert.equal(mega.item, "gyaradosite");
  assert.equal(mega.ability, "Mold Breaker");
  const restoredBase = replaceMemberPokemon(mega, pokemon("Gyarados"), { detailData });
  assert.equal(restoredBase.item, "gyaradosite");
  assert.equal(restoredBase.ability, "Intimidate");
  assert.equal(restoredBase.pokemon.name, "Gyarados");
});

test("Species Clause rejects base plus Mega and Mega X plus Mega Y", () => {
  const gyarados = makeMember(pokemon("Gyarados"), { detailData });
  const gyaradosMega = megaMember("Gyarados-Mega");
  assert.equal(speciesIdentity(detailData, gyarados.pokemon), speciesIdentity(detailData, gyaradosMega.pokemon));
  const mixed = validateTeam({ team: [gyarados, gyaradosMega], regulation, regulationId: regulation.id, cupRuleId: "none", detailData, detailStatus: "ready", legalItems });
  assert.ok(mixed.errors.some(error => error.includes("Species Clause")));

  const variants = validateTeam({ team: [megaMember("Charizard-Mega-X"), megaMember("Charizard-Mega-Y")], regulation, regulationId: regulation.id, cupRuleId: "none", detailData, detailStatus: "ready", legalItems });
  assert.ok(variants.errors.some(error => error.includes("Species Clause")));
});

test("different Mega species coexist without a team-level Mega limit", () => {
  const team = [megaMember("Gyarados-Mega"), megaMember("Metagross-Mega"), megaMember("Salamence-Mega")];
  const result = validateTeam({ team, regulation, regulationId: regulation.id, cupRuleId: "none", detailData, detailStatus: "ready", legalItems });
  assert.equal(result.errors.length, 0);
});

test("illegal or mismatched Mega stones fail through the existing legality pipeline", () => {
  const member = megaMember("Gyarados-Mega");
  member.item = "leftovers";
  const mismatch = validateTeam({ team: [member], regulation, regulationId: regulation.id, cupRuleId: "none", detailData, detailStatus: "ready", legalItems });
  assert.ok(mismatch.errors.some(error => error.includes("반드시 지녀야")));

  member.item = "gyaradosite";
  const forbidden = validateTeam({ team: [member], regulation, regulationId: regulation.id, cupRuleId: "none", detailData, detailStatus: "ready", legalItems: [{ id: "leftovers" }] });
  assert.ok(forbidden.errors.some(error => error.includes("사용할 수 없습니다")));
});

test("regulation changes retain an otherwise allowed Mega as invalid instead of deleting it", () => {
  const member = megaMember("Gyarados-Mega");
  assert.deepEqual(membersRemovedByRuleChange({ team: [member], regulation, cupRuleId: "none", detailData }), []);
  const noGyarados = { ...regulation, pokemon: regulation.pokemon.filter(entry => entry.name !== "Gyarados") };
  assert.deepEqual(membersRemovedByRuleChange({ team: [member], regulation: noGyarados, cupRuleId: "none", detailData }), [member]);
});

test("Mega names support Korean and Showdown-style English search and sprites", () => {
  const korean = new Map([["gyarados", "갸라도스"], ["charizard", "리자몽"]]);
  const gyaradosMega = pokemon("Gyarados-Mega");
  const charizardX = pokemon("Charizard-Mega-X");
  assert.equal(localizedPokemonName(gyaradosMega, korean), "갸라도스-메가");
  assert.equal(localizedPokemonName(charizardX, korean), "리자몽-메가X");
  for (const query of ["갸라도스", "Gyarados", "Mega Gyarados", "Gyarados-Mega", "메가 갸라도스"]) {
    assert.equal(matchesPokemonSearch(gyaradosMega, "갸라도스-메가", query), true, query);
  }
  assert.equal(spriteSlug("Gyarados-Mega"), "gyarados-mega");
  assert.equal(spriteSlug("Charizard-Mega-X"), "charizard-megax");
});

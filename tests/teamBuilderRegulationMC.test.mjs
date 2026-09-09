import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REGULATION_ID,
  REGULATIONS,
  resolveRegulationId,
} from "../src/data/index.js";
import {
  DRAFT_SCHEMA_VERSION,
  LEGACY_PERSISTED_REGULATION_ID,
  TEAM_SCHEMA_VERSION,
  canonicalBaseName,
  dataId,
  localizedPokemonName,
  normalizeDraft,
  normalizeSavedTeam,
  resolveCanonicalPokemonIdentity,
  speciesIdentity,
  spriteSlug,
} from "../src/services/teamBuilderCore.js";
import {
  MB_ONLY_ITEM_IDS,
  MC_ONLY_ITEM_IDS,
  legalItems,
} from "../src/services/championsData.js";

function names(regulationId) {
  return REGULATIONS[regulationId].pokemon.map(pokemon => pokemon.name);
}

function assertProperSubset(smaller, larger) {
  const largerNames = new Set(larger);
  assert.ok(smaller.length < larger.length);
  for (const name of smaller) assert.ok(largerNames.has(name), `${name} must remain in the later regulation`);
}

test("Regulation M-C is current and extends the duplicate-free historical rosters", () => {
  const ma = names("m-a");
  const mb = names("m-b");
  const mc = names("m-c");

  assertProperSubset(ma, mb);
  assertProperSubset(mb, mc);
  for (const [id, roster] of [["m-a", ma], ["m-b", mb], ["m-c", mc]]) {
    assert.equal(new Set(roster).size, roster.length, `${id} must not contain duplicate entries`);
  }
  assert.equal(mc.length - mb.length, 29);
  assert.equal(REGULATIONS["m-c"].status, "current");
  assert.equal(REGULATIONS["m-b"].status, "past");
  assert.equal(REGULATIONS["m-a"].status, "past");
});

test("M-C default resolver preserves explicit historical selections", () => {
  assert.equal(DEFAULT_REGULATION_ID, "m-c");
  assert.equal(resolveRegulationId(), "m-c");
  assert.equal(resolveRegulationId("m-c"), "m-c");
  assert.equal(resolveRegulationId("m-b"), "m-b");
  assert.equal(resolveRegulationId("m-a"), "m-a");
  assert.equal(resolveRegulationId("unknown"), "m-c");
});

test("M-C additions are illegal in M-B while an inherited M-B entry stays legal", () => {
  const mb = new Set(names("m-b"));
  const mc = new Set(names("m-c"));
  for (const name of ["Rillaboom", "Baxcalibur", "Wigglytuff", "Salamence"]) {
    assert.equal(mb.has(name), false);
    assert.equal(mc.has(name), true);
  }
  assert.equal(mb.has("Gholdengo"), true);
  assert.equal(mc.has("Gholdengo"), true);
});

const formCases = [
  ["Persian [Alolan Form]", "Persian", "persianalola", "persian-alola", 53],
  ["Toxtricity [Low Key Form]", "Toxtricity", "toxtricitylowkey", "toxtricity-lowkey", 849],
  ["Indeedee [Female]", "Indeedee", "indeedeef", "indeedee-f", 876],
  ["Squawkabilly [Blue Plumage]", "Squawkabilly", "squawkabillyblue", "squawkabilly-blue", 931],
  ["Squawkabilly [Yellow Plumage]", "Squawkabilly", "squawkabillyyellow", "squawkabilly-yellow", 931],
  ["Squawkabilly [White Plumage]", "Squawkabilly", "squawkabillywhite", "squawkabilly-white", 931],
];

const formDetailData = {
  pokedex: Object.fromEntries(formCases.flatMap(([, baseName, id, , num]) => [
    [id, { id, num, name: id, baseSpecies: baseName }],
    [baseName.toLowerCase(), { id: baseName.toLowerCase(), num, name: baseName, baseSpecies: baseName }],
  ])),
};

test("M-C forms keep distinct data IDs and shared Species Clause identities", () => {
  const koreanNames = new Map([
    ["persian", "페르시온"],
    ["toxtricity", "스트린더"],
    ["indeedee", "에써르"],
    ["squawkabilly", "시비꼬"],
  ]);
  for (const [name, baseName, expectedId, expectedSprite, num] of formCases) {
    const pokemon = REGULATIONS["m-c"].pokemon.find(entry => entry.name === name);
    const base = REGULATIONS["m-c"].pokemon.find(entry => entry.name === baseName);
    assert.ok(pokemon);
    assert.ok(base);
    assert.equal(dataId(pokemon), expectedId);
    assert.equal(resolveCanonicalPokemonIdentity({ pokemon }, { detailData: formDetailData }).pokemonId, expectedId);
    assert.equal(canonicalBaseName(name), baseName);
    assert.equal(speciesIdentity(formDetailData, pokemon), `dex-${num}`);
    assert.equal(speciesIdentity(formDetailData, pokemon), speciesIdentity(formDetailData, base));
    assert.equal(spriteSlug(name), expectedSprite);
    assert.equal(localizedPokemonName(pokemon, koreanNames), name);
  }
});

test("M-C item delta composes with the existing M-B item delta", () => {
  assert.equal(MC_ONLY_ITEM_IDS.size, 18);
  const requestedIds = ["rockyhelmet", "airballoon", "salamencite", "baxcalibrite"];
  const data = {
    items: Object.fromEntries([...requestedIds, "lifeorb"].map(id => [id, { id, name: id, isNonstandard: null }])),
  };
  const idsFor = regulationId => new Set(legalItems(data, regulationId).map(item => item.id));

  for (const id of requestedIds) {
    assert.equal(idsFor("m-a").has(id), false);
    assert.equal(idsFor("m-b").has(id), false);
    assert.equal(idsFor("m-c").has(id), true);
  }
  assert.ok(MB_ONLY_ITEM_IDS.has("lifeorb"));
  assert.equal(idsFor("m-a").has("lifeorb"), false);
  assert.equal(idsFor("m-b").has("lifeorb"), true);
  assert.equal(idsFor("m-c").has("lifeorb"), true);
});

test("schema v3 keeps pre-M-C missing regulation history on M-B", () => {
  assert.equal(TEAM_SCHEMA_VERSION, 3);
  assert.equal(DRAFT_SCHEMA_VERSION, 3);
  assert.equal(LEGACY_PERSISTED_REGULATION_ID, "m-b");

  const saved = normalizeSavedTeam({
    schemaVersion: 2,
    id: "legacy-no-regulation",
    name: "기존 팀",
    members: [],
  });
  const draft = normalizeDraft({
    schemaVersion: 2,
    members: [],
  }, REGULATIONS);

  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.regulationId, "m-b");
  assert.equal(draft.schemaVersion, 3);
  assert.equal(draft.regulationId, "m-b");
});

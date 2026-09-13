import assert from "node:assert/strict";
import test from "node:test";

import { REGULATIONS } from "../src/data/index.js";
import { load, legalItems } from "../src/services/championsData.js";
import {
  dexRecord,
  fromTeamSnapshotV1,
  makeMember,
  memberFromSaved,
  pokemonPoolForRegulation,
  resolveCanonicalPokemonIdentity,
  serializeMembers,
  validateSubmissionEligibility,
} from "../src/services/teamBuilderCore.js";
import { buildTeamSnapshotSubmission } from "../src/services/teamSubmission.js";

const detailDataPromise = load();

function selectableEntries(detailData) {
  return Object.entries(REGULATIONS).flatMap(([regulationId, regulation]) => {
    const items = legalItems(detailData, regulationId);
    return pokemonPoolForRegulation(regulation, detailData, items)
      .map(pokemon => ({ regulationId, regulation, items, pokemon }));
  });
}

test("every selectable Pokémon and form resolves to a canonical and stable species identity", async () => {
  const detailData = await detailDataPromise;
  const entries = selectableEntries(detailData);
  const failures = [];

  for (const { regulationId, pokemon } of entries) {
    const identity = resolveCanonicalPokemonIdentity({ pokemon }, { detailData });
    const record = dexRecord(detailData, pokemon);
    if (!identity.resolved || !identity.pokemonId || !identity.speciesIdentity || record?.num == null) {
      failures.push({ regulationId, name: pokemon.name, identity, dexNumber: record?.num ?? null });
    }
  }

  assert.ok(entries.length > 0);
  assert.deepEqual(failures, []);
});

test("Vivillon cosmetic selection passes the real submission validation and payload path", async () => {
  const detailData = await detailDataPromise;
  const regulation = REGULATIONS["m-c"];
  const items = legalItems(detailData, regulation.id);
  const pool = pokemonPoolForRegulation(regulation, detailData, items);
  const pokemon = pool.find(entry => entry.name === "Vivillon [High Plains Pattern]");
  assert.ok(pokemon);

  const member = makeMember(pokemon, { detailData });
  const eligibility = validateSubmissionEligibility({
    team: [member],
    regulation,
    regulationId: regulation.id,
    cupRuleId: "monotype-challenge",
    assignedTypeId: "flying",
    detailData,
    detailStatus: "ready",
    legalItems: items,
    displayPokemon: entry => entry.name === pokemon.name ? "비비용" : entry.name,
  });
  assert.equal(eligibility.errors.some(error => error.includes("canonical Pokémon identity")), false);
  assert.equal(eligibility.eligible, true);

  const payload = buildTeamSnapshotSubmission({
    event: { id: "vivillon-event", status: "open", cup_rule_id: "monotype-challenge" },
    registration: {
      id: "vivillon-registration",
      event_id: "vivillon-event",
      registration_name: "테스터",
      registration_source: "application",
    },
    registrationName: "테스터",
    eligibility,
    team: [member],
    regulationId: regulation.id,
    cupRuleId: "monotype-challenge",
    detailData,
  });
  assert.equal(payload.members[0].pokemon_id, "vivillon");
  assert.equal(payload.members[0].pokemon_name_snapshot, "Vivillon [High Plains Pattern]");

  const snapshotRestore = fromTeamSnapshotV1({
    snapshot: payload.snapshot,
    members: payload.members,
    regulation,
    detailData,
  });
  assert.equal(snapshotRestore.ok, true);
  assert.equal(snapshotRestore.team[0].pokemon.name, "Vivillon [High Plains Pattern]");

  const saved = serializeMembers([member], { detailData });
  const restored = memberFromSaved(saved[0], regulation, { detailData, legalItems: items });
  assert.equal(saved[0].pokemonId, "vivillon");
  assert.equal(restored.pokemon.name, "Vivillon [High Plains Pattern]");
});

test("representative base, regional, Mega, alternate, and cosmetic forms retain policy identities", async () => {
  const detailData = await detailDataPromise;
  const entries = selectableEntries(detailData);
  const byName = new Map(entries.map(entry => [entry.pokemon.name, entry.pokemon]));
  const cases = [
    ["Pikachu", "pikachu"],
    ["Raichu [Alolan Form]", "raichualola"],
    ["Charizard-Mega-X", "charizardmegax"],
    ["Heat Rotom", "rotomheat"],
    ["Vivillon [High Plains Pattern]", "vivillon"],
    ["Florges [Yellow Flower]", "florges"],
  ];

  for (const [name, expectedId] of cases) {
    const pokemon = byName.get(name);
    assert.ok(pokemon, `${name} must be selectable`);
    assert.equal(resolveCanonicalPokemonIdentity({ pokemon }, { detailData }).pokemonId, expectedId);
  }

  assert.equal(
    resolveCanonicalPokemonIdentity({ pokemon: { name: "Vivillon [Invented Pattern]" } }, { detailData }).resolved,
    false,
  );
});

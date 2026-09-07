import assert from "node:assert/strict";
import test from "node:test";

import {
  advancementCancellationError,
  buildChampionshipSettings,
  buildFinalRegistrationPayload,
  championshipAdvancementLabel,
  championshipFinalCapacity,
  championshipFinalCreatePreflight,
  championshipEventPickerLabel,
  championshipGeneration,
  championshipScheduleDraft,
  deriveQualifierSurvivorState,
  isChampionshipFinal,
  isChampionshipQualifier,
  qualifierCompletionState,
  normalizeChampionshipApplicationDraft,
  validateAdvancementInput,
} from "../src/services/championsCore.js";

const qualifier = {
  id: "qualifier",
  event_type: "champions",
  championship_phase: "qualifier",
  championship_final_event_id: "final",
  qualification_slots: 2,
  status: "running",
};
const final = {
  id: "final",
  event_type: "champions",
  championship_phase: "final",
  status: "open",
  competition_settings: { championship: { generationNumber: 7, finalCapacity: 4 } },
};

test("Champions phase and settings are read from existing Event fields", () => {
  assert.equal(isChampionshipQualifier(qualifier), true);
  assert.equal(isChampionshipFinal(final), true);
  assert.equal(championshipGeneration(final), 7);
  assert.equal(championshipFinalCapacity(final), 4);
  assert.equal(championshipGeneration({ competition_settings: { championship: { generation: 9 } } }), 9);
  assert.equal(championshipGeneration({ competition_settings: { championship: { generationNumber: 8 } } }), 8);
  assert.equal(championshipGeneration({}), null);
  assert.deepEqual(buildChampionshipSettings(final, { generationNumber: 8, finalCapacity: 8 }), {
    championship: { generation: 8, finalCapacity: 8 },
  });
});

test("Champions notice draft keeps battle format selectable and fixes canonical pair settings", () => {
  const draft = normalizeChampionshipApplicationDraft({
    name: "7대 챔피언스",
    eventType: "champions",
    division: "master",
    isTeamEvent: true,
    battleFormat: "doubles",
    competitionFormat: "single_elimination",
    generation: "7",
    finalCapacity: "8",
    qualificationSlots: "4",
  });
  assert.equal(draft.division, null);
  assert.equal(draft.isTeamEvent, false);
  assert.equal(draft.battleFormat, "doubles");
  assert.equal(draft.competitionFormat, null);
  assert.equal(draft.generation, 7);
  assert.equal(draft.finalCapacity, 8);
  assert.equal(draft.qualificationSlots, null);
  assert.equal(draft.qualifierHeldOn, null);
  assert.equal(draft.finalHeldOn, null);
});

test("Champions phase schedules use the legacy values only as Qualifier compatibility fallback", () => {
  assert.deepEqual(championshipScheduleDraft({ heldOn: "2026-09-01", submissionTargetAt: "2026-09-01T09:00" }), {
    qualifierHeldOn: "2026-09-01",
    finalHeldOn: null,
    qualifierSubmissionTargetAt: "2026-09-01T09:00",
    finalSubmissionTargetAt: null,
  });
  const draft = normalizeChampionshipApplicationDraft({
    name: "8대 챔피언스", battleFormat: "singles", generation: 8, finalCapacity: 8, qualificationSlots: 4,
    heldOn: "legacy", qualifierHeldOn: "qualifier", finalHeldOn: "final",
    submissionTargetAt: "legacy-submit", qualifierSubmissionTargetAt: "qualifier-submit", finalSubmissionTargetAt: "final-submit",
  });
  assert.equal(draft.qualifierHeldOn, "qualifier");
  assert.equal(draft.finalHeldOn, "final");
  assert.equal(draft.qualifierSubmissionTargetAt, "qualifier-submit");
  assert.equal(draft.finalSubmissionTargetAt, "final-submit");
});

test("Champions picker labels both phases without hiding an empty Final", () => {
  assert.equal(championshipEventPickerLabel({ ...qualifier, name: "7대 챔피언스 · 선발전" }), "[선발전] 7대 챔피언스 · 선발전");
  assert.equal(championshipEventPickerLabel({ ...final, name: "7대 챔피언스 · 본선" }), "[본선] 7대 챔피언스 · 본선");
});

test("advancement validation reserves direct/ranking and qualifier sources for Qualifier apply", () => {
  assert.match(validateAdvancementInput({
    finalEvent: final,
    existingAdvancements: [],
    playerId: "player-a",
    advancementType: "ranking",
  }).join(" "), /Qualifier 기록 반영/);
  assert.deepEqual(validateAdvancementInput({
    finalEvent: final,
    existingAdvancements: [
      { player_id: "player-a" }, { player_id: "player-b" },
      { player_id: "player-c" }, { player_id: "player-d" },
    ],
    playerId: "player-e",
    advancementType: "manual",
    finalCapacity: 4,
  }), []);
  assert.match(validateAdvancementInput({
    finalEvent: final,
    existingAdvancements: [{ player_id: "player-a" }],
    playerId: "player-a",
    advancementType: "ranking",
  }).join(" "), /이미 본선/);
  assert.match(validateAdvancementInput({
    finalEvent: final,
    qualifierEvent: qualifier,
    existingAdvancements: [],
    playerId: "player-a",
    advancementType: "qualifier",
    sourceEntry: { id: "entry-a", event_id: "qualifier", player_id: "player-b" },
  }).join(" "), /Qualifier 기록 반영/);
});

test("final registration is a new advancement registration and contains no Entry", () => {
  const payload = buildFinalRegistrationPayload({ finalEvent: final, player: { id: "player-a", display_name: "A" }, reason: "replacement" });
  assert.equal(payload.event_id, "final");
  assert.equal(payload.player_id, "player-a");
  assert.equal(payload.registration_source, "advancement");
  assert.equal(payload.registration_data.champions.generation, 7);
  assert.equal("entry_id" in payload, false);
});

test("Qualifier survivor state derives the target from final capacity minus persisted directs", () => {
  const entries = ["a", "b", "c", "d", "e"].map(id => ({ id, status: "active" }));
  const atFive = deriveQualifierSurvivorState({ entries, finalCapacity: 8, directCount: 4, matches: [] });
  assert.equal(atFive.aliveCount, 5);
  assert.equal(atFive.remainingEliminations, 1);
  assert.equal(atFive.readyToFinalize, false);
  const oneLoss = deriveQualifierSurvivorState({ entries, finalCapacity: 8, directCount: 4, matches: [{ entry_a_id: "a", entry_b_id: "b", winner_entry_id: "a" }] });
  assert.equal(oneLoss.aliveCount, 5);
  const ready = deriveQualifierSurvivorState({ entries, finalCapacity: 8, directCount: 4, matches: [
    { entry_a_id: "a", entry_b_id: "b", winner_entry_id: "a" },
    { entry_a_id: "c", entry_b_id: "b", winner_entry_id: "c" },
  ] });
  assert.deepEqual(ready.eliminatedEntryIds, ["b"]);
  assert.equal(ready.lossCountByEntryId.b, 2);
  assert.equal(ready.readyToFinalize, true);
  assert.equal(ready.requiredEliminations, 1);
  assert.equal(ready.directCount, 4);
  const fourSlots = { ...qualifier, qualification_slots: 4 };
  assert.equal(qualifierCompletionState({ qualifierEvent: fourSlots, survivorState: atFive }).ok, false);
  assert.equal(qualifierCompletionState({ qualifierEvent: fourSlots, survivorState: ready }).ok, true);
  assert.equal(qualifierCompletionState({ qualifierEvent: { ...fourSlots, status: "completed" }, survivorState: ready }).alreadyCompleted, true);
});

test("Final creation requires completed qualifier and the complete persisted entrant set", () => {
  const finalRegistrations = [{ id: "direct-a" }, { id: "direct-b" }, { id: "qualified-a" }, { id: "qualified-b" }];
  const advancements = [
    { final_registration_id: "direct-a", advancement_type: "ranking" },
    { final_registration_id: "direct-b", advancement_type: "ranking" },
    { final_registration_id: "qualified-a", advancement_type: "qualifier" },
    { final_registration_id: "qualified-b", advancement_type: "qualifier" },
  ];
  assert.match(championshipFinalCreatePreflight({ finalEvent: final, qualifierEvent: qualifier, qualifierAdvancementCount: 2, directAdvancementCount: 2, finalRegistrations, advancements }).error, /선발전이 아직 종료/);
  const completedQualifier = { ...qualifier, status: "completed" };
  assert.equal(championshipFinalCreatePreflight({ finalEvent: final, qualifierEvent: completedQualifier, qualifierAdvancementCount: 2, directAdvancementCount: 2, finalRegistrations, advancements }).ok, true);
  assert.match(championshipFinalCreatePreflight({ finalEvent: final, qualifierEvent: completedQualifier, qualifierAdvancementCount: 1, directAdvancementCount: 2, finalRegistrations, advancements }).error, /1\/2/);
  const manualRegistrations = [...finalRegistrations, { id: "manual-a" }];
  const manualAdvancements = [...advancements, { final_registration_id: "manual-a", advancement_type: "manual" }];
  assert.equal(championshipFinalCreatePreflight({ finalEvent: final, qualifierEvent: completedQualifier, qualifierAdvancementCount: 2, directAdvancementCount: 2, finalRegistrations: manualRegistrations, advancements: manualAdvancements }).ok, true);
  assert.match(championshipFinalCreatePreflight({ finalEvent: final, qualifierEvent: completedQualifier, qualifierAdvancementCount: 2, directAdvancementCount: 1, finalRegistrations, advancements }).error, /본선 직행자가 1\/2/);
  assert.equal(championshipAdvancementLabel("ranking"), "직행");
  assert.equal(championshipAdvancementLabel("qualifier"), "선발전 통과");
  assert.equal(championshipAdvancementLabel("manual"), "운영 대체");
});

test("advancement cancellation fails closed once downstream facts exist", () => {
  assert.equal(advancementCancellationError({}), null);
  assert.match(advancementCancellationError({ submissions: 1 }), /후속 사실/);
  assert.match(advancementCancellationError({ matches: 1 }), /후속 사실/);
});

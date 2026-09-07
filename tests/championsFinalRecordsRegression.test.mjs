import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildChampionshipRecordApplyCompletionOptions } from "../src/services/championsCore.js";
import { buildChampionshipHallOfFameParty } from "../src/services/hallOfFamePresentation.js";
import { buildNormalizedRecordsProjection } from "../src/services/normalizedRecordsProjection.js";

const FINAL_EVENT = {
  id: "champions-final-7",
  event_type: "champions",
  championship_phase: "final",
  status: "running",
};

function legacyData() {
  return { rankings: [], seasons: [], tournaments: [], brackets: [], champions: [], titleGroups: [] };
}

function finalRaw() {
  return {
    schema: "ypl_schema_validation",
    seasons: [{ id: "season-3", name: "YPL 시즌 3", series: "ypl", number: 3, sort_order: 3 }],
    events: [{
      ...FINAL_EVENT,
      season_id: "season-3",
      name: "제7회 챔피언스 · 본선",
      round_number: 7,
      battle_format: "singles",
      competition_format: "single_elimination",
      is_team_event: false,
      status: "completed",
      record_applied_at: "2026-09-08T00:00:00Z",
      team_revealed_at: "2026-09-08T00:00:00Z",
      held_on: "2026-09-08",
      date_precision: "exact",
    }],
    players: [
      { id: "player-final", display_name: "Finalist" },
      { id: "player-absent", display_name: "Absent" },
    ],
    entries: [{ id: "entry-final", event_id: FINAL_EVENT.id, entry_type: "individual", status: "active" }],
    entryParticipants: [{ id: "ep-final", event_id: FINAL_EVENT.id, entry_id: "entry-final", registration_id: "reg-final", player_id: "player-final" }],
    results: [{ id: "result-final", event_id: FINAL_EVENT.id, entry_id: "entry-final", placement_code: "champion", placement_label: "우승", rank_min: 1 }],
    matches: [],
    rankingBaselines: [],
    rankingAwards: [],
    eventRegistrations: [
      { id: "reg-final", event_id: FINAL_EVENT.id, player_id: "player-final", final_submission_id: "submission-final" },
      { id: "reg-absent", event_id: FINAL_EVENT.id, player_id: "player-absent", final_submission_id: "submission-absent" },
    ],
    registrationSubmissions: [
      { id: "submission-final", registration_id: "reg-final", snapshot_id: "snapshot-final" },
      { id: "submission-absent", registration_id: "reg-absent", snapshot_id: "snapshot-absent" },
    ],
    teamSnapshots: [{ id: "snapshot-final" }, { id: "snapshot-absent" }],
    teamSnapshotMembers: [
      ["gardevoir", "Gardevoir", "가디안"],
      ["slurpuff", "Slurpuff", "나루림"],
      ["primarina", "Primarina", "누리레느"],
      ["sylveon", "Sylveon", "님피아"],
      ["dedenne", "Dedenne", "데덴네"],
      ["tinkaton", "Tinkaton", "두드리짱"],
    ].map(([pokemon_id, pokemon_name_snapshot], index) => ({
      id: `member-${pokemon_id}`,
      snapshot_id: "snapshot-final",
      slot: index + 1,
      pokemon_id,
      pokemon_name_snapshot,
    })).concat([{ id: "member-absent", snapshot_id: "snapshot-absent", slot: 1, pokemon_id: "eevee", pokemon_name_snapshot: "Eevee" }]),
  };
}

const directory = new Map([
  ["gardevoir", { pokemonId: "gardevoir", canonicalName: "Gardevoir", displayName: "가디안", dexNumber: 282 }],
  ["slurpuff", { pokemonId: "slurpuff", canonicalName: "Slurpuff", displayName: "나루림", dexNumber: 685 }],
  ["primarina", { pokemonId: "primarina", canonicalName: "Primarina", displayName: "누리레느", dexNumber: 730 }],
  ["sylveon", { pokemonId: "sylveon", canonicalName: "Sylveon", displayName: "님피아", dexNumber: 700 }],
  ["dedenne", { pokemonId: "dedenne", canonicalName: "Dedenne", displayName: "데덴네", dexNumber: 702 }],
  ["tinkaton", { pokemonId: "tinkaton", canonicalName: "Tinkaton", displayName: "두드리짱", dexNumber: 959 }],
]);

test("Champions Final record-apply input becomes the authoritative ordinal and reveal request", () => {
  assert.deepEqual(
    buildChampionshipRecordApplyCompletionOptions({ event: FINAL_EVENT, roundNumber: "7", revealOfficialRosters: false }),
    { revealOfficialRosters: true, championshipOrdinal: 7 },
  );
  assert.throws(
    () => buildChampionshipRecordApplyCompletionOptions({ event: FINAL_EVENT, roundNumber: "7회" }),
    /1 이상의 정수/,
  );
});

test("ordinary record application publishes official rosters independently of team format", () => {
  assert.deepEqual(
    buildChampionshipRecordApplyCompletionOptions({
      event: { event_type: "light", is_team_event: false },
      revealOfficialRosters: true,
    }),
    { revealOfficialRosters: true },
  );
});

test("Champions Final official frozen roster drives the 7회 archive and Pokémon statistics", () => {
  const snapshot = buildNormalizedRecordsProjection(legacyData(), finalRaw(), directory);
  const archive = snapshot.archives.find((row) => row.id === FINAL_EVENT.id);
  assert.equal(archive.round, 7);
  assert.equal(archive.championSeries, true);
  assert.equal(snapshot.rosters.length, 1, "EntryParticipant 없는 submitted Registration은 Records roster가 될 수 없다");
  assert.deepEqual(snapshot.rosters[0].pokemon, ["가디안", "나루림", "누리레느", "님피아", "데덴네", "두드리짱"]);
  assert.deepEqual(snapshot.pokemon.map((row) => row.name).sort(), ["가디안", "나루림", "누리레느", "님피아", "데덴네", "두드리짱"].sort());
  assert.ok(snapshot.pokemon.every((row) => row.entries === 1));
});

test("Champions Final placement Records remain available without a RankingAward ledger", () => {
  const snapshot = buildNormalizedRecordsProjection(legacyData(), finalRaw(), directory);
  const archive = snapshot.archives.find((row) => row.id === FINAL_EVENT.id);
  assert.equal(finalRaw().rankingAwards.length, 0);
  assert.equal(archive.championSeries, true);
  assert.equal(archive.round, 7);
  assert.equal(snapshot.rosters.length, 1);
});

test("HOF party uses the shared Records localization while artwork stays pokemon-id based", () => {
  const artwork = new Map([["gardevoir", "art:gardevoir"]]);
  const party = buildChampionshipHallOfFameParty([
    { slot: 2, pokemon_id: "slurpuff", pokemon_name_snapshot: "Slurpuff" },
    { slot: 1, pokemon_id: "gardevoir", pokemon_name_snapshot: "Gardevoir" },
  ], directory, artwork);
  assert.deepEqual(party.map((member) => member.name), ["가디안", "나루림"]);
  assert.equal(party[0].img, "art:gardevoir");
  assert.equal(party[1].pokemonId, "slurpuff");
});

test("Champions pair completion and HOF source make round_number the single ordinal", () => {
  const completionSql = readFileSync("docs/db/champions_final_record_apply_rpc.sql", "utf8");
  const pairSql = readFileSync("docs/db/champions_application_event_pair_rpc.sql", "utf8");
  assert.match(completionSql, /complete_championship_final_record_application/i);
  assert.match(completionSql, /round_number = p_ordinal/i);
  assert.match(completionSql, /team_revealed_at = v_now/i);
  assert.match(completionSql, /\{championship,generation\}/i);
  assert.match(completionSql, /release_championship_final_record_application/i);
  assert.match(completionSql, /recordApplyOrdinalSnapshot/i);
  assert.match(pairSql, /v_generation := v_event\.round_number/i);
  assert.match(pairSql, /round_number, event_type/i);
});

test("Champions pair and record-apply UI cannot expose a ranking payout", () => {
  const pairService = readFileSync("src/services/championsService.js", "utf8");
  const bracketsPage = readFileSync("src/pages/BracketsPage.jsx", "utf8");
  assert.match(pairService, /rankingEnabled:\s*false/);
  assert.match(bracketsPage, /Champions 성적은 랭킹에 반영되지 않습니다/);
  assert.match(bracketsPage, /const excluded=linked \? linkedPointPolicy\?\.enabled===false : manualExcluded/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const news = readFileSync(new URL("../src/pages/NewsPage.jsx", import.meta.url), "utf8");
const brackets = readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8");
const controls = readFileSync(new URL("../src/components/ChampionsBracketControls.jsx", import.meta.url), "utf8");
const championsService = readFileSync(new URL("../src/services/championsService.js", import.meta.url), "utf8");
const championsCore = readFileSync(new URL("../src/services/championsCore.js", import.meta.url), "utf8");
const normalizedService = readFileSync(new URL("../src/services/normalizedCompetitionService.js", import.meta.url), "utf8");

test("Champions notice resolves the Final from the Qualifier relation and exposes separate submission routes", () => {
  assert.match(news, /resolveChampionshipSubmissionEvents\(announcement\.form\.eventId\)/);
  assert.match(news, /선발전 파티 제출/);
  assert.match(news, /본선 파티 제출/);
  assert.match(championsService, /event\.championship_final_event_id/);
  assert.doesNotMatch(news, /form\?\.finalEventId/);
});

test("Champions participant additions use phase-specific durable paths", () => {
  assert.match(brackets, /addChampionshipQualifierManualRegistration/);
  assert.match(brackets, /listChampionshipManualParticipantCandidates/);
  assert.match(brackets, /advancementType:"manual"/);
  assert.match(brackets, /linkedEvent\?\.championship_phase \? \[\] : addedParticipants/);
  assert.match(brackets, /linkedEvent\?\.championship_phase \? <button/);
  assert.match(championsService, /add_championship_qualifier_manual_registration/);
  assert.match(championsService, /championshipFinalCreatePreflight/);
  assert.match(championsService, /advancementType !== "manual"/);
  assert.match(brackets, /preflightChampionshipFinalBracket\(linkedEvent\.id\)/);
  assert.match(brackets, /qualifier=\{championshipEvent\?\.championship_phase==="qualifier"\}/);
  assert.match(brackets, /!qualifier&&<div className="bk-col"><div className="bk-col-h gf">그랜드 파이널<\/div>/);
});

test("Qualifier controls derive survivors and never expose manual survivor selection", () => {
  assert.match(controls, /deriveQualifierSurvivorState/);
  assert.match(controls, /본선 직행 \{directRows\.length\}명/);
  assert.match(controls, /선발전 기록 반영/);
  assert.doesNotMatch(controls, /type="checkbox"/);
  assert.match(championsCore, /직행\/선발전 통과 advancement는 Qualifier 기록 반영에서만 생성할 수 있습니다/);
  assert.match(normalizedService, /본선 진출 인원이 확정되어 선발전 경기를 더 진행할 수 없습니다/);
});

test("Final wizard reuses ordinary participant confirmation without Champions management controls", () => {
  assert.match(brackets, /<label>참가자 확정<\/label>/);
  assert.match(brackets, /eventRegs\.map\(\(reg,i\)=>\{/);
  assert.match(brackets, /setSelectedRegistrationIds/);
  assert.match(brackets, /preflightChampionshipFinalBracket\(linkedEvent\.id\)/);
  assert.doesNotMatch(brackets, /placement="final"/);
  assert.doesNotMatch(brackets, /운영 대체 추가/);
  assert.match(brackets, /createChampionshipAdvancement/);
  assert.match(brackets, /\+ 참가자 추가/);
  assert.doesNotMatch(controls, /운영 대체 추가/);
  assert.doesNotMatch(controls, /불참 처리/);
  assert.doesNotMatch(controls, /본선 참가자/);
  assert.match(championsService, /championshipFinalCreatePreflight/);
  assert.match(normalizedService, /assertChampionshipFinalRuntimePreflight/);
});

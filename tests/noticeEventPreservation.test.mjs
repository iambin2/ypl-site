import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  announcementDeletionBlockedMessage,
  buildAnnouncementDeletionPreflight,
  emptyAnnouncementDeletionCounts,
} from "../src/services/announcementDeletionPolicy.js";

const service = readFileSync("src/services/normalizedCompetitionService.js", "utf8");
const admin = readFileSync("src/admin/AdminModalHost.jsx", "utf8");

function facts(overrides = {}) {
  return {
    phase: null,
    recordApplied: false,
    counts: { ...emptyAnnouncementDeletionCounts(), ...(overrides.counts || {}) },
    ...overrides,
  };
}

test("pristine ordinary Event is the only ordinary announcement deletion allowed state", () => {
  const preflight = buildAnnouncementDeletionPreflight([facts()]);
  assert.equal(preflight.allowed, true);
  assert.equal(preflight.reason, null);
});

test("ordinary Registration, Submission, bracket, and record facts block with priority", () => {
  assert.equal(buildAnnouncementDeletionPreflight([facts({ counts: { registrations: 1 } })]).reason, "registrations_exist");
  assert.equal(buildAnnouncementDeletionPreflight([facts({ counts: { registrations: 4, submissions: 2 } })]).reason, "submissions_exist");
  assert.equal(buildAnnouncementDeletionPreflight([facts({ counts: { submissions: 2, entries: 4, matches: 3 } })]).reason, "bracket_progress_exists");
  assert.equal(buildAnnouncementDeletionPreflight([facts({ recordApplied: true, counts: { results: 1 } })]).reason, "record_applied");
});

test("results category includes Result, RankingAward, and HallOfFame", () => {
  for (const counts of [{ results: 1 }, { rankingAwards: 1 }, { hallOfFame: 1 }]) {
    assert.equal(buildAnnouncementDeletionPreflight([facts({ counts })]).reason, "results_exist");
  }
});

test("Champions pair blocks on either phase and reports the phase with the most progressed fact", () => {
  const pristine = buildAnnouncementDeletionPreflight([facts({ phase: "qualifier" }), facts({ phase: "final" })]);
  assert.equal(pristine.allowed, true);

  const qualifierRegistration = buildAnnouncementDeletionPreflight([
    facts({ phase: "qualifier", counts: { registrations: 11 } }),
    facts({ phase: "final" }),
  ]);
  assert.equal(qualifierRegistration.reason, "registrations_exist");
  assert.equal(qualifierRegistration.phase, "qualifier");
  assert.match(announcementDeletionBlockedMessage(qualifierRegistration), /선발전에 참가 신청자 11명/);

  const finalRegistration = buildAnnouncementDeletionPreflight([
    facts({ phase: "qualifier", counts: { registrations: 11 } }),
    facts({ phase: "final", counts: { registrations: 4 } }),
  ]);
  assert.equal(finalRegistration.phase, "final");
  assert.match(announcementDeletionBlockedMessage(finalRegistration), /본선에 참가 신청자 4명/);

  const finalResults = buildAnnouncementDeletionPreflight([
    facts({ phase: "qualifier", counts: { bracketRuntimes: 1 } }),
    facts({ phase: "final", counts: { results: 1 } }),
  ]);
  assert.equal(finalResults.reason, "results_exist");
  assert.equal(finalResults.phase, "final");
  assert.match(announcementDeletionBlockedMessage(finalResults), /본선에 경기 결과 또는 기록이 저장되어/);
});

test("service preflight inventories every canonical downstream fact before cancellation", () => {
  const start = service.indexOf("async function countAnnouncementDeletionFacts");
  const body = service.slice(start, service.indexOf("export async function preflightAnnouncementDeletion", start));
  for (const table of ["event_registrations", "registration_submissions", "entries", "entry_participants", "bracket_runtimes", "matches", "results", "ranking_awards", "hall_of_fame_entries"]) {
    assert.match(body, new RegExp(table));
  }
  assert.match(body, /record_applied_at/);
});

test("UI preflights before any announcement save and blocked path has no mutation or restore", () => {
  const deleteBody = admin.slice(admin.indexOf("onDelete={modal.item"), admin.indexOf("if (modal.type === \"standings\")"));
  assert.match(deleteBody, /preflightAnnouncementDeletion\(eventId\)/);
  assert.match(deleteBody, /if \(!preflight\.allowed\)[\s\S]*return;/);
  assert.ok(deleteBody.indexOf("preflightAnnouncementDeletion(eventId)") < deleteBody.indexOf("const nextData"));
  assert.ok(deleteBody.indexOf("if (!preflight.allowed)") < deleteBody.indexOf("const nextData"));
  assert.doesNotMatch(deleteBody, /save\(data\)/);
  assert.doesNotMatch(deleteBody, /preserved/);
});

test("allowed cancellation clears the Event announcement reference and never physically deletes Events", () => {
  const start = service.indexOf("export async function cancelApplicationEvent");
  const body = service.slice(start, service.indexOf("export async function freezeEventFinalSubmissions", start));
  assert.match(body, /delete registrationSettings\.announcementId/);
  assert.match(body, /status: "cancelled"/);
  assert.doesNotMatch(body, /\.delete\(\)/);
});

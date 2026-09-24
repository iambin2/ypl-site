import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const newsPage = readFileSync(new URL("../src/pages/NewsPage.jsx", import.meta.url), "utf8");
const bracketsPage = readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/normalizedCompetitionService.js", import.meta.url), "utf8");

test("Event-linked public responses use normalized registration answers for both public views", () => {
  assert.match(newsPage, /admin\|\|\(a\.form\.fields\|\|\[\]\)\.some\(f=>f\.public\)/);
  assert.match(newsPage, /responsesOverride=\{a\.form\?\.eventId\?\(eventResponses\[a\.id\]\|\|\[\]\):null\}/);
  assert.match(newsPage, /responsesOverride=\{fillAnn\.form\?\.eventId\?\(eventResponses\[fillAnn\.id\]\|\|\[\]\):null\}/);
  assert.match(newsPage, /const fields=\(form\.fields\|\|\[\]\)\.filter\(f=>f\.public\)/);
  assert.match(service, /registration_data\?\.answers\s*\|\|\s*\{\}/);
});

test("Supabase-backed response views load once and expose only explicit refreshes", () => {
  assert.doesNotMatch(newsPage, /setInterval/);
  assert.match(newsPage, /if\(announcement\?\.form\?\.eventId\) return refreshEventApplications\(announcement\)/);
  assert.match(newsPage, /onRefresh=\{\(\)=>refreshPublicResponses\(a\)\}/);

  const bracketBoard = bracketsPage.slice(
    bracketsPage.indexOf("function BracketBoard"),
    bracketsPage.indexOf("/* ===== 기록 반영 모달 ===== */")
  );
  assert.doesNotMatch(bracketBoard, /setInterval/);
  assert.doesNotMatch(bracketBoard, /addEventListener\("focus"/);
  assert.match(bracketBoard, /loadStatuses\(\)/);
  assert.match(bracketBoard, /onRefresh=\{\(\)=>setSubmissionStatusReloadKey/);
});

test("successful Event application creation refetches only that Event registration list", () => {
  assert.match(newsPage, /const ok=await submitForm\(fillAnn\.id,answers\)/);
  assert.match(newsPage, /if\(ok!==false&&fillAnn\.form\?\.eventId\) await refreshEventApplications\(fillAnn\)/);
  assert.match(newsPage, /listEventApplications\(announcement\.form\.eventId\)/);
});

test("bracket Event selection reuses loaded registrations for submission status", () => {
  assert.match(bracketsPage, /statuses=await listEventRegistrationSubmissionStatuses\(id,regs\)/);
  assert.match(service, /listEventRegistrationSubmissionStatuses\(eventId, knownRegistrations = null\)/);
  assert.match(service, /if\(!Array\.isArray\(registrationRows\)\)/);
});

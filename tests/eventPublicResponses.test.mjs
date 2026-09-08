import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const newsPage = readFileSync(new URL("../src/pages/NewsPage.jsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/normalizedCompetitionService.js", import.meta.url), "utf8");

test("Event-linked public responses use normalized registration answers for both public views", () => {
  assert.match(newsPage, /admin\|\|\(a\.form\.fields\|\|\[\]\)\.some\(f=>f\.public\)/);
  assert.match(newsPage, /responsesOverride=\{a\.form\?\.eventId\?\(eventResponses\[a\.id\]\|\|\[\]\):null\}/);
  assert.match(newsPage, /responsesOverride=\{fillAnn\.form\?\.eventId\?\(eventResponses\[fillAnn\.id\]\|\|\[\]\):null\}/);
  assert.match(newsPage, /const fields=\(form\.fields\|\|\[\]\)\.filter\(f=>f\.public\)/);
  assert.match(service, /registration_data\?\.answers\s*\|\|\s*\{\}/);
});

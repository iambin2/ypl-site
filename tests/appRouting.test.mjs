import assert from "node:assert/strict";
import test from "node:test";
import { isUnknownPath } from "../src/services/appRouting.js";

const BASE = "/ypl-site/";

test("the site's own addresses are known", () => {
  assert.equal(isUnknownPath("/ypl-site/", BASE), false);
  assert.equal(isUnknownPath("/ypl-site/index.html", BASE), false);
});

test("anything else under the base is a 404", () => {
  assert.equal(isUnknownPath("/ypl-site/news", BASE), true);
  assert.equal(isUnknownPath("/ypl-site/404.html", BASE), true);
});

test("outside the base nothing is judged", () => {
  assert.equal(isUnknownPath("/", BASE), false);
});

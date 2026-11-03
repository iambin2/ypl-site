import assert from "node:assert/strict";
import test from "node:test";
import { isUnknownPath, isUnknownView } from "../src/services/appRouting.js";

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

test("a view the site does not have is a 404, no view is the home", () => {
  assert.equal(isUnknownView("?view=calculator"), true);
  assert.equal(isUnknownView("?view=calc"), false);
  assert.equal(isUnknownView(""), false);
  assert.equal(isUnknownView("?notice=abc"), false);
});

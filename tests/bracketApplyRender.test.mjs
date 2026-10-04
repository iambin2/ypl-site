import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import React from "react";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("vite"))("esbuild");

test("completed bracket opens record application with the supplied save callback", () => {
  const bracket = {
    id: "runtime-1", eventId: "event-1", name: "Completed cup",
    format: "elim", mode: "single", participants: [],
    graph: { kind: "single", rounds: [[{
      id: "final", a: { pid: "entry-a" }, b: { pid: "entry-b" }, winner: "a",
    }]] },
  };
  const states = [[bracket], "", true, bracket.id];
  let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = value; }];
    },
    useEffect() {},
    useRef: value => ({ current: value }),
  };
  const module = { exports: {} };
  const { code } = transformSync(readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8"), {
    loader: "jsx", format: "cjs",
  });
  vm.runInNewContext(code, {
    module, exports: module.exports, URLSearchParams,
    window: { location: { search: "" } },
    require: name => name === "react" ? react
      : name.endsWith("historicalBracketReadModel.js") ? { buildBracketPageList: rows => rows }
      : name.endsWith("components/index.js") ? { Reveal: "div", Icon: "span" }
      : {},
  });
  function findElement(node, name) {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(child => findElement(child, name)).find(Boolean);
    if (node.type?.name === name) return node;
    return findElement(node.props?.children, name);
  }
  const save = async () => true;
  const props = { data: {}, admin: true, save, flash() {} };
  const render = () => { cursor = 0; return module.exports.default(props); };
  const board = findElement(render(), "BracketBoard");
  assert.ok(board, "completed bracket remains viewable");
  const result = { champ: "entry-a", ru: "entry-b", sf: [], done: true };
  board.props.onApply(bracket, result);
  const modal = findElement(render(), "BracketApply");
  assert.ok(modal, "record application opens without a render exception");
  assert.strictEqual(modal.props.save, save);
  assert.strictEqual(modal.props.b, bracket);
  assert.strictEqual(modal.props.res, result);
});

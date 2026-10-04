import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getIndividualPlacementPointPolicy, getTeamPlacementPointPolicy } from "../src/services/bracketRankingAwardSnapshot.js";

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

for (const mode of ["single", "team"]) {
  test(`${mode} record modal renders after Event context loads and opens confirmation`, async () => {
    const states = [];
    const effects = [];
    let cursor = 0;
    let mounted = false;
    const react = { ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    };
    const context = { season: { name: "YPL Season 3" }, event: {
      id: "event-1", event_type: "pokecup", division: "master", is_team_event: mode === "team",
    } };
    const module = { exports: {} };
    const source = readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8");
    const { code } = transformSync(`${source}\nexport { BracketApply };`, { loader: "jsx", format: "cjs" });
    vm.runInNewContext(code, {
      module, exports: module.exports,
      require: name => name === "react" ? react
        : name.endsWith("bracketRankingAwardSnapshot.js") ? { getTeamPlacementPointPolicy }
        : name.endsWith("services/index.js") ? {
          getEventRecordContext: async () => context,
          getIndividualPlacementPointPolicy, getTeamPlacementPointPolicy,
        }
        : name.endsWith("components/index.js") ? {
          Modal: ({ children }) => React.createElement("section", null, children), Icon: "span",
        } : {},
    });
    const b = { eventId: "event-1", mode, projection: { source: "normalized" }, participants: [
      { id: "entry-a", name: "A", playerId: "player-a", registrationId: "reg-a", entryId: "entry-a", members: ["Alice"] },
      { id: "entry-b", name: "B", playerId: "player-b", registrationId: "reg-b", entryId: "entry-b", members: ["Bob"] },
    ] };
    const props = { b, res: { champ: "entry-a", ru: "entry-b", sf: [] }, data: {
      tournaments: [{ key: "master", label: "Master", rounds: [] }], seasons: [], rankings: [],
    }, save() { assert.fail("render must not save"); }, onClose() {}, flash() {} };
    const render = () => { cursor = 0; return module.exports.BracketApply(props); };
    assert.match(renderToStaticMarkup(render()), /불러오는 중/);
    mounted = true;
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    const form = render();
    const html = renderToStaticMarkup(form);
    assert.doesNotMatch(html, /불러오는 중|not defined/);
    assert.match(html, /YPL Season 3/);
    assert.ok(html.includes(mode === "team" ? "우승 30점, 준우승 20점" : "우승 60점, 준우승 40점, 4강 20점"));
    function findPrepare(node) {
      if (!node) return null;
      if (Array.isArray(node)) return node.map(findPrepare).find(Boolean);
      if (node.type === "button" && node.props.children?.[0] === "반영하기") return node;
      return findPrepare(node.props?.children);
    }
    const prepare = findPrepare(form);
    assert.ok(prepare);
    assert.equal(prepare.props.disabled, false);
    prepare.props.onClick();
    const confirmation = render();
    assert.equal(confirmation.props.title, "반영 전 확인");
    assert.match(renderToStaticMarkup(confirmation), /이대로 반영/);
  });
}

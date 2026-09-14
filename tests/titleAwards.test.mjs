import assert from "node:assert/strict";
import test from "node:test";

import { applyTitleAwards, evaluateTitleAwards, normalizeEventTitleAward, pokemonRegion } from "../src/services/titleAwards.js";

const pokedex = {
  squirtle: { id: "squirtle", num: 7, name: "Squirtle", types: ["Water"] },
  totodile: { id: "totodile", num: 158, name: "Totodile", types: ["Water"] },
  marill: { id: "marill", num: 183, name: "Marill", types: ["Water", "Fairy"] },
  vulpixalola: { id: "vulpixalola", num: 37, name: "Vulpix-Alola", forme: "Alola", types: ["Ice"] },
  gyarados: { id: "gyarados", num: 130, name: "Gyarados", types: ["Water", "Flying"] },
  gyaradosmega: { id: "gyaradosmega", num: 130, name: "Gyarados-Mega", baseSpecies: "Gyarados", forme: "Mega", requiredItem: "Gyaradosite", types: ["Water", "Dark"] },
};
const detailData = { pokedex };

const groups = () => [
  { key: "champion", items: [] },
  { key: "type", items: [{ id: "t1", name: "물 엑스퍼트", holders: ["기존"] }, { id: "t2", name: "비행 엑스퍼트", holders: [] }] },
  { key: "region", items: [{ id: "r1", name: "성도 엘리트", holders: [] }, { id: "r2", name: "관동 엘리트", holders: [] }] },
  { key: "partner", items: [] },
  { key: "etc", items: [{ id: "e1", name: "슈퍼루키", holders: [] }, { id: "e2", name: "버스드라이버", holders: [] }] },
  { key: "event", items: [] },
];
const member = (pokemon_id) => ({ pokemon_id });

test("region uses regional forms and dex generations", () => {
  assert.equal(pokemonRegion(pokedex.totodile), "성도");
  assert.equal(pokemonRegion(pokedex.vulpixalola), "알로라");
});

test("monotype top4 roster earns type and region titles, existing holders are skipped", () => {
  const out = evaluateTitleAwards({
    titleGroups: groups(),
    event: { name: "제3회 파이컵", division: "master" },
    detailData,
    placements: [
      { placement: "semifinalist", names: ["기존"], roster: [member("squirtle"), member("gyarados")] },
      { placement: "runner_up", names: ["이제빈"], roster: [member("totodile"), member("marill")] },
    ],
  });
  const keys = out.map((a) => a.key);
  assert.ok(keys.includes("region|성도 엘리트|이제빈"));
  assert.ok(keys.includes("type|물 엑스퍼트|이제빈"));
  assert.ok(!keys.some((key) => key.endsWith("|기존") && key.startsWith("type|물")));
  assert.ok(keys.includes("region|관동 엘리트|기존"));
  assert.ok(!keys.some((key) => key.startsWith("etc|")), "etc titles require a win");
});

test("mega evolution counts as its base species, unknown pokemon fails closed", () => {
  const out = evaluateTitleAwards({
    titleGroups: groups(), event: { name: "A" }, detailData,
    placements: [
      { placement: "champion", names: ["가"], roster: [member("gyaradosmega"), member("squirtle")] },
      { placement: "runner_up", names: ["나"], roster: [member("squirtle"), member("missingno")] },
    ],
  });
  assert.ok(out.some((a) => a.key === "type|물 엑스퍼트|가"));
  assert.ok(!out.some((a) => a.holder === "나"));
});

test("rookie, event award and partner", () => {
  const titleGroups = groups();
  const out = evaluateTitleAwards({
    titleGroups,
    event: { name: "제2회 파이컵 라이트", division: "rookie", competition_settings: { titleAward: { name: "초신성", scope: "top4" } } },
    detailData,
    placements: [
      { placement: "champion", names: ["정두호"], playerId: "p1", roster: [member("squirtle"), member("totodile")] },
      { placement: "runner_up", names: ["이종우"], roster: null },
    ],
    partnerWins: { p1: [["squirtle", "gyarados"], ["squirtle", "totodile"]] },
    pokemonName: (id) => ({ squirtle: "꼬부기" })[id] || "",
  });
  const keys = out.map((a) => a.key);
  for (const key of ["etc|슈퍼루키|정두호", "event|초신성|정두호", "event|초신성|이종우", "partner|정두호|꼬부기"]) {
    assert.ok(keys.includes(key), key);
  }

  const next = applyTitleAwards(titleGroups, out, () => "new");
  assert.deepEqual(next.find((g) => g.key === "event").items, [{ id: "new", name: "초신성", desc: "제2회 파이컵 라이트 4강 이상", holders: ["정두호", "이종우"] }]);
  assert.deepEqual(next.find((g) => g.key === "partner").items[0].holders, ["꼬부기"]);
  assert.deepEqual(next.find((g) => g.key === "type").items[0].holders, ["기존", "정두호"]);
});

test("team events only get the event award, for every team member", () => {
  const out = evaluateTitleAwards({
    titleGroups: groups(), detailData,
    event: { name: "팀전", is_team_event: true, competition_settings: { titleAward: { name: "전화기" } } },
    placements: [{ placement: "champion", names: ["가", "나"], roster: null }, { placement: "runner_up", names: ["다"], roster: null }],
  });
  assert.deepEqual(out.map((a) => a.holder), ["가", "나"]);
});

test("empty title award is not stored", () => {
  assert.equal(normalizeEventTitleAward({ name: "  " }), null);
  assert.deepEqual(normalizeEventTitleAward({ name: " RED ", scope: "x" }), { name: "RED", scope: "champion" });
});

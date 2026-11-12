import test from "node:test";
import assert from "node:assert/strict";
import { generationOfTitle, normalizeTitleLook, regionOfTitle, titleCounts, titleLook, typeOfTitle } from "../src/services/titleLooks.js";

test("a title's look keeps only what can be drawn", () => {
  assert.equal(normalizeTitleLook(null), null);
  assert.equal(normalizeTitleLook({ bands: [] }), null, "a look needs a colour");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire", "nope", "water", "grass", "ice"], mons: ["피카츄"] }),
    { bands: ["fire", "water", "grass"], mons: ["피카츄"] }, "three known bands at most");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], mons: ["피카츄", "라이츄"] }).mons, ["피카츄"], "a picture a band at most");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], mons: ["", ""] }).mons, [], "empty pictures are none");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], mark: "mega", mons: ["x"] }), { bands: [], mons: [], mark: "mega" }, "the Mega emblem brings its own colours");
});

test("a title without a look falls back to its preset, then to one plain band", () => {
  assert.deepEqual(titleLook({ name: "버스 드라이버" }).bands, ["steel"], "a preset is found whatever the spacing");
  assert.deepEqual(titleLook({ name: "메가진화의 계승자" }), { bands: [], mons: [], mark: "mega" });
  assert.deepEqual(titleLook({ name: "전화기", look: { bands: ["dark"] } }), { bands: ["dark"], mons: [] }, "the operators' choice wins");
  assert.deepEqual(titleLook({ name: "새 칭호" }), { bands: ["normal"], mons: [] });
});

test("a title's name gives its type, region or generation", () => {
  assert.equal(typeOfTitle("에스퍼 엑스퍼트"), "psychic");
  assert.equal(typeOfTitle("슈퍼루키"), null);
  assert.equal(regionOfTitle("히스이 엘리트"), "히스이");
  assert.equal(generationOfTitle("초대 챔피언"), 1);
  assert.equal(generationOfTitle("6대 챔피언"), 6);
  assert.equal(generationOfTitle("챔피언"), null);
});

test("the page's three counts", () => {
  assert.deepEqual(titleCounts([{ items: [{ holders: ["a"] }, { holders: [] }] }, { items: [{}] }]), { total: 3, owned: 1, empty: 2 });
});

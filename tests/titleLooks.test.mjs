import test from "node:test";
import assert from "node:assert/strict";
import { championMedal, eraOfSeason, generationOfTitle, normalizeTitleLook, ownMedal, partnerMedal, regionMedal, regionOfTitle, titleCounts, titleLook, typeMedal, typeOfTitle } from "../src/services/titleLooks.js";

test("a title's look keeps only what can be drawn", () => {
  assert.equal(normalizeTitleLook(null), null);
  assert.equal(normalizeTitleLook({ bands: [] }), null, "a look needs a colour");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire", "nope", "water", "grass", "ice"] }), { bands: ["fire", "water", "grass"] }, "three known bands at most");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], device: "torch", mons: ["피카츄"] }), { bands: ["fire"], device: "torch" }, "a drawn device; no Pokémon picture");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], device: "pikachu" }), { bands: ["fire"] }, "an unknown device is none");
  assert.deepEqual(normalizeTitleLook({ bands: ["fire"], mark: "mega", device: "torch" }), { bands: [], mark: "mega" }, "the Mega emblem brings its own colours");
});

test("a title without a look falls back to its preset, then to one plain band", () => {
  assert.deepEqual(titleLook({ name: "버스 드라이버" }), { bands: ["steel"], device: "bus" }, "a preset is found whatever the spacing");
  assert.deepEqual(titleLook({ name: "메가진화의 계승자" }), { bands: [], mark: "mega" });
  assert.deepEqual(titleLook({ name: "전화기", look: { bands: ["dark"] } }), { bands: ["dark"] }, "the operators' choice wins");
  assert.deepEqual(titleLook({ name: "새 칭호" }), { bands: ["normal"] });
});

test("every title becomes a medal of its own kind", () => {
  assert.deepEqual(typeMedal("fire"), { glyphs: ["fire"], enamel: ["fire"] });
  assert.deepEqual(regionMedal("성도"), { scene: "성도", enamel: ["flying"] });
  assert.deepEqual(partnerMedal("water"), { device: "paw", enamel: ["water"] });
  assert.deepEqual(partnerMedal(undefined).enamel, ["normal"]);
  assert.deepEqual(ownMedal({ name: "RED" }), { device: "n151", enamel: ["fire"] });
  assert.deepEqual(ownMedal({ name: "몽키매직" }), { glyphs: ["grass", "fire", "water"], enamel: ["grass", "fire", "water"] });
  assert.deepEqual(ownMedal({ name: "메가진화의 계승자" }), { mark: "mega" });
  assert.notDeepEqual(ownMedal({ name: "스승" }), ownMedal({ name: "제자" }), "a teacher and a pupil are told apart");
  assert.deepEqual(championMedal(2, "클래식 시즌 2"), { champ: { gen: 2, era: "classic" }, tier: "gold" });
  assert.equal(championMedal(6, "YPL 시즌 2").champ.era, "ypl");
  assert.equal(eraOfSeason("CLASSIC SEASON 1"), "classic");
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

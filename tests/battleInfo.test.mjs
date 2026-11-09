// What each move, ability and item does, in the games' Korean words (scripts/build-battle-info.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INFO_FILL, MEGA_STONE_FILL, clean, megaStoneText, parseCsv, toId } from "../scripts/build-battle-info.mjs";

const info = JSON.parse(readFileSync(new URL("../src/data/battle-info-ko.json", import.meta.url), "utf8"));

test("common moves, abilities and items have their Korean text", () => {
  for (const id of ["swordsdance", "earthquake", "protect", "visegrip"]) assert.match(info.moves[id], /[가-힣]/, id);
  for (const id of ["intimidate", "pressure"]) assert.match(info.abilities[id], /[가-힣]/, id);
  for (const id of ["leftovers", "choicescarf", "focussash", "leek"]) assert.match(info.items[id], /[가-힣]/, id);
});

test("what PokeAPI lacks is filled from INFO_FILL and the Mega stone sentence", () => {
  assert.equal(info.moves.kowtowcleave, INFO_FILL.moves.kowtowcleave);
  assert.equal(info.abilities.goodasgold, INFO_FILL.abilities.goodasgold);
  assert.equal(info.items.fairyfeather, INFO_FILL.items.fairyfeather);
  assert.equal(info.items.boosterenergy, "에너지가 가득한 캡슐. 어떤 특성을 가진 포켓몬에게 지니게 하면 그 힘을 증폭시킨다.");
  assert.equal(info.abilities.protosynthesis, "부스트에너지를 지니고 있거나 날씨가 맑을 때 가장 높은 능력이 올라간다.");
  assert.equal(info.moves.axekick, INFO_FILL.moves.axekick);
  assert.match(info.moves.axekick, /[가-힣]/);
  assert.equal(info.items.garchompitez, megaStoneText("한카리아스"));
  assert.equal(info.items.garchompitez, info.items.garchompite, "the new stone reads like the old one");
  for (const id of MEGA_STONE_FILL) assert.ok(info.items[id], id);
});

test("no move keeps Scarlet and Violet's dropped-move notice", () => {
  assert.equal(info.moves.karatechop, "날카로운 당수로 상대를 때려서 공격한다. 급소에 맞기 쉽다.");
  for (const [id, text] of Object.entries(info.moves)) assert.doesNotMatch(text, /^사용할 수 없는 기술입니다/, id);
});

test("every text is one clean line, none empty", () => {
  for (const kind of ["moves", "abilities", "items"]) {
    for (const [id, text] of Object.entries(info[kind])) {
      assert.ok(text && text === text.trim(), `${kind}.${id} empty or untrimmed`);
      assert.doesNotMatch(text, /[\n\r\f­]|\s{2}/, `${kind}.${id}`);
    }
  }
});

test("the build reads quoted CSV and joins the games' line breaks", () => {
  assert.deepEqual(parseCsv('id,text\n1,"a\nb, ""c"""\n2,d\n'), [{ id: "1", text: 'a\nb, "c"' }, { id: "2", text: "d" }]);
  assert.equal(clean("싸움의 춤을\n격렬하게\f춰서­  기세를 "), "싸움의 춤을 격렬하게 춰서 기세를");
  assert.equal(toId("swords-dance"), "swordsdance");
  assert.equal(toId("As One (Glastrier)"), "asoneglastrier");
});

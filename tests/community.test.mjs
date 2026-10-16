import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPrivateGraph, createPrivateBracket, parseParticipantNames } from "../src/services/privateBracket.js";
import { buildTeamSheet, makeMember, savedTeamSheet, serializeMembers } from "../src/services/teamBuilderCore.js";

const firstRound = graph => graph.rounds[0].flatMap(match => [match.a, match.b]);

test("private bracket: a random draw seats everyone once and spreads the byes", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const graph = buildPrivateGraph(ids, { random: () => 0.42 });
  assert.equal(graph.kind, "single");
  assert.equal(graph.rounds.length, 3);
  const seats = firstRound(graph);
  assert.deepEqual(seats.filter(s => s.pid).map(s => s.pid).sort(), ids);
  assert.equal(seats.filter(s => s.bye).length, 2);
  assert.ok(graph.rounds[0].every(m => !(m.a.bye && m.b.bye)), "no bye meets a bye");
});

test("private bracket: input order pairs 1-2, 3-4 and gives the byes to the last matches", () => {
  const graph = buildPrivateGraph(["1", "2", "3", "4", "5", "6"], { order: "input" });
  assert.deepEqual(firstRound(graph).map(s => s.pid || "BYE"), ["1", "2", "3", "4", "5", "BYE", "6", "BYE"]);
});

test("private bracket: double elimination needs three, otherwise it stays single", () => {
  assert.equal(buildPrivateGraph(["a", "b", "c", "d", "e"], { double: true }).kind, "double");
  assert.equal(buildPrivateGraph(["a", "b"], { double: true }).kind, "single");
  assert.equal(createPrivateBracket({ name: "", host: "", names: ["a", "b"], double: true }).double, false);
  assert.throws(() => buildPrivateGraph(["solo"]), /2명 이상/);
});

test("private bracket: names are trimmed, deduplicated and split on lines or commas", () => {
  assert.deepEqual(parseParticipantNames(" 지우 \n이슬,웅\n지우\n\n"), ["지우", "이슬", "웅"]);
});

test("private bracket and showcase never reach official data", () => {
  for (const file of ["src/services/privateBracket.js", "src/services/communityStore.js"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /normalizedCompetitionService|recordSync|RankingAward|saveSiteData|ypl_data_v4|SITE_DATA_KEY|\.rpc\(/, file);
  }
  const store = readFileSync("src/services/communityStore.js", "utf8");
  assert.match(store, /SHOWCASE_KEY = "ypl_showcase_v1"/);
  assert.match(store, /PRIVATE_BRACKETS_KEY = "ypl_private_brackets_v1"/);
  // 사설 대진표 화면은 공식 대진표의 기록 반영, 정규화 저장 함수를 부르지 않는다.
  const page = readFileSync("src/pages/BracketsPage.jsx", "utf8");
  const privateBlock = page.slice(page.indexOf("/* ===== 사설 대진표 ====="), page.indexOf("/* ===== 사설 대진표 끝 ===== */"));
  assert.ok(privateBlock.length > 200, "private bracket block is marked");
  assert.doesNotMatch(privateBlock, /onApply|BracketApply|syncEvent|Normalized|setNormalized|save\(|createChampionship|RankingAward/);
});

test("team sheet carries every field of the editor", () => {
  const data = JSON.parse(readFileSync("src/data/champions-data.json", "utf8"));
  const garchomp = { id: "garchomp", name: "Garchomp" };
  const member = { ...makeMember(garchomp), ability: "Rough Skin", alignment: "jolly", item: "choicescarf",
    statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, moves: ["earthquake", "dragonclaw", "", "rockslide"] };
  const [row] = buildTeamSheet([member], { detailData: data, displayPokemon: () => "한카리아스" });
  assert.equal(row.name, "한카리아스");
  assert.equal(row.english, "Garchomp");
  assert.deepEqual(row.types.map(t => t.id), ["dragon", "ground"]);
  assert.ok(row.ability && row.item && row.nature, "ability, item and nature are named");
  assert.equal(row.natureEffect, "스피드↑ 특공↓");
  assert.equal(row.spTotal, 66);
  const spe = row.stats.find(s => s.key === "spe");
  assert.equal(spe.base, 102);
  assert.equal(spe.mark, "+");
  assert.equal(spe.final, Math.floor((102 + 32 + 20) * 1.1));
  assert.equal(row.moves.length, 3);
  assert.ok(row.moves.every(m => m.name && m.type && m.category));

  // 직렬화한 팀이 같은 시트로 되살아난다(게시판 소개글과 이미지가 이 길을 쓴다)
  const saved = { regulationId: "m-c", members: serializeMembers([member], { detailData: data }) };
  const [again] = savedTeamSheet(saved, { detailData: data });
  assert.equal(again.english, "Garchomp");
  assert.deepEqual(again.stats, row.stats);
});

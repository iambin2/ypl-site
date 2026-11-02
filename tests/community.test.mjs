import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyLocalWrite, assembleCommunityItems } from "../src/services/communityItems.js";
import { buildPrivateBracketPatch, buildPrivateGraph, createPrivateBracket, parseParticipantNames } from "../src/services/privateBracket.js";
import { buildTeamSheet, makeMember, savedTeamSheet, serializeMembers } from "../src/services/teamBuilderCore.js";

const firstRound = graph => graph.rounds[0].flatMap(match => [match.a, match.b]);

test("an older visible draw cannot select a winner on another device's redraw",()=>{
  const current={updatedAt:"new-draw",graph:{match:{a:"different player"}}};
  let changed=false;
  assert.throws(()=>buildPrivateBracketPatch(current,"old-draw",()=>{changed=true;}),/다른 기기/);
  assert.equal(changed,false);
  assert.deepEqual(buildPrivateBracketPatch(current,"new-draw",x=>({graph:x.graph})),{graph:current.graph});
  assert.throws(()=>buildPrivateBracketPatch(null,null,()=>({})),/찾을 수 없는/);
});

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

test("private brackets seat every participant once for 2 to 64 players in either format within the DB size limit",()=>{
  for(let n=2;n<=64;n++)for(const double of [false,true]) {
    const bracket=createPrivateBracket({names:Array.from({length:n},(_,i)=>`참가자 ${i}`),double,random:()=>0.42});
    const seats=firstRound(bracket.graph);
    assert.equal(new Set(seats.filter(s=>s.pid).map(s=>s.pid)).size,n);
    assert.ok(bracket.graph.rounds[0].every(m=>!(m.a.bye&&m.b.bye)));
    assert.ok(Buffer.byteLength(JSON.stringify(bracket))<=32768);
  }
});

test("private bracket and showcase never reach official data", () => {
  for (const file of ["src/services/privateBracket.js", "src/services/communityStore.js"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /normalizedCompetitionService|recordSync|RankingAward|saveSiteData|ypl_data_v4|SITE_DATA_KEY|\.rpc\((?!"community_write")/, file);
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

test("community rows come back in the shape the boards read", () => {
  const row = (id, parent_id, created_at, payload = {}) => ({ id, parent_id, created_at, payload, secret: false, has_pin: id === "a" });
  const items = assembleCommunityItems([
    row("c2", "a", "2026-10-03"), row("a", null, "2026-10-01", { title: "첫 글" }), row("c1", "a", "2026-10-02"), row("b", null, "2026-10-04"),
  ]);
  assert.deepEqual(items.map(item => item.id), ["b", "a"], "newest first");
  assert.equal(items[1].title, "첫 글");
  assert.equal(items[1].hasPin, true);
  assert.deepEqual(items[1].comments.map(comment => comment.id), ["c1", "c2"], "comments oldest first");
  assert.deepEqual(items[0].comments, []);
});

test("the offline store applies the same writes", () => {
  let items = applyLocalWrite([], { action: "create", id: "p", payload: { title: "글" } });
  items = applyLocalWrite(items, { action: "create", id: "c", parentId: "p", payload: { body: "댓글" } });
  assert.equal(items[0].comments[0].body, "댓글");
  items = applyLocalWrite(items, { action: "update", id: "c", payload: { body: "수정" } });
  items = applyLocalWrite(items, { action: "update", id: "p", payload: { title: "새 제목" }, secret: true });
  assert.equal(items[0].comments[0].body, "수정");
  assert.equal(items[0].title, "새 제목");
  assert.equal(items[0].secret, true);
  items = applyLocalWrite(items, { action: "delete", id: "c" });
  assert.deepEqual(items[0].comments, []);
  assert.deepEqual(applyLocalWrite(items, { action: "delete", id: "p" }), []);
});

test("no public row keeps a pin and no visitor writes a shared row", () => {
  const sources = ["src/pages/BoardPage.jsx", "src/pages/BracketsPage.jsx", "src/services/communityStore.js", "src/services/communityItems.js"].map(file => readFileSync(file, "utf8"));
  for (const source of sources) assert.doesNotMatch(source, /pinHash|hashPin|pinMatches|updateCommunity|data\.board/);
  const gates = readFileSync("docs/db/visitor_gates.sql", "utf8");
  assert.match(gates, /revoke all on table public\.visitor_pins from public, anon, authenticated/);
  assert.match(gates, /using \(not secret or/);
});

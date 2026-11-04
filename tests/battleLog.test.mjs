// Real battles from the engine read back as the screen reads them: Korean sentences with no placeholder left,
// the field state matching the engine's own, and a verb for every move.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBattleReader, readWholeLog, josa, parseHP } from "../src/services/battleLog.js";
import { formatId, startBattle, choose, readout } from "../supabase/functions/battle/engine.mjs";

const text = JSON.parse(readFileSync(new URL("../src/data/battle-text-ko.json", import.meta.url), "utf8"));
const { moves } = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const sp = s => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...s });
const set = (species, item, ability, moveset, nature, evs) => ({ species, item, ability, moves: moveset, nature, evs: sp(evs), level: 50 });
const TEAM = [
  set("Garchomp", "Choice Scarf", "Rough Skin", ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"], "Jolly", { hp: 2, atk: 32, spe: 32 }),
  set("Charizard-Mega-Y", "Charizardite Y", "Blaze", ["Heat Wave", "Air Slash", "Solar Beam", "Protect"], "Timid", { hp: 2, spa: 32, spe: 32 }),
  set("Incineroar", "Sitrus Berry", "Intimidate", ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"], "Adamant", { hp: 32, atk: 32, spd: 2 }),
  set("Rotom-Wash", "Leftovers", "Levitate", ["Hydro Pump", "Thunderbolt", "Will-O-Wisp", "Protect"], "Modest", { hp: 32, spa: 32, spd: 2 }),
  set("Kingambit", "Black Glasses", "Defiant", ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Protect"], "Adamant", { hp: 32, atk: 32, spe: 2 }),
  set("Sinistcha", "Mental Herb", "Hospitality", ["Matcha Gotcha", "Rage Powder", "Trick Room", "Strength Sap"], "Relaxed", { hp: 32, def: 32, spa: 2 }),
];

function play(kind, seed) {
  const battle = startBattle({ formatid: formatId("m-c", kind), seed, p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } });
  let s = seed[0] * 977 + seed[1];
  const rand = n => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) % n; };
  for (let step = 0; step < 2000 && !battle.ended; step++) {
    for (const side of ["p1", "p2"]) {
      const request = battle[side].activeRequest;
      if (!request || request.wait || battle[side].isChoiceDone()) continue;
      for (let tries = 0; tries < 30; tries++) {
        let choice = "default";
        if (!request.teamPreview && !request.forceSwitch) choice = request.active.map((a, i) => {
          if (request.side.pokemon[i].condition.endsWith(" fnt")) return "pass";
          const j = rand(a.moves.length);
          const t = kind === "doubles" && ["normal", "any", "adjacentFoe"].includes(a.moves[j].target) ? ` ${rand(2) + 1}` : "";
          return `move ${j + 1}${t}${a.canMegaEvo && rand(2) ? " mega" : ""}`;
        }).join(", ");
        if (choose(battle, {}, side, choice).ok) break;
      }
    }
  }
  return battle;
}

test("josa follows the last syllable", () => {
  assert.equal(josa("리자몽", "topic"), "리자몽은");
  assert.equal(josa("피카츄", "topic"), "피카츄는");
  assert.equal(josa("한카리아스", "subject"), "한카리아스가");
  assert.equal(josa("생명의구슬", "directional"), "생명의구슬로");
  assert.equal(josa("물", "directional"), "물로", "ㄹ takes 로");
  assert.equal(josa("화염방사", "object"), "화염방사를");
  assert.deepEqual(parseHP("0 fnt"), { hp: 0, maxhp: 0, status: "fnt" });
  assert.deepEqual(parseHP("141/156 par"), { hp: 141, maxhp: 156, status: "par" });
});

test("a whole battle reads as Korean, with no placeholder left and the field as the engine has it", () => {
  for (const kind of ["singles", "doubles"]) for (const seed of [[1, 2, 3, 4], [7, 7, 7, 7], [2, 9, 4, 1]]) {
    const battle = play(kind, seed);
    const out = readout(battle);
    const { state, turns } = readWholeLog(out.sideLog.p1, { text, moves, perspective: "p1" });
    const all = turns.flatMap(t => t.lines);
    assert.ok(all.length > 5, "it says something");
    assert.deepEqual(all.filter(line => /[{}]|\[[A-Z]+/.test(line)), [], "no placeholder survives");
    assert.ok(all.some(line => /의 .+!$/.test(line) && /[가-힣]/.test(line)), "moves are announced in Korean");
    assert.equal(state.ended, battle.ended);
    assert.equal(state.winner, out.winner);
    for (const [i, mon] of battle.p1.active.entries()) {
      const seen = state.sides.p1.active[i];
      if (!mon || !seen) continue;
      assert.equal(seen.hp, mon.hp, `${kind}: own HP is exact`);
    }
  }
});

test("moves become the battle verbs: strike for physical, chase for special, self for a move on itself", () => {
  const reader = createBattleReader({ text, moves, perspective: "p1" });
  reader.read("|player|p1|가||");
  reader.read("|player|p2|나||");
  reader.read("|switch|p1a: Garchomp|Garchomp, L50, M|185/185");
  reader.read("|switch|p2a: Charizard|Charizard, L50, F|100/100");
  assert.deepEqual(reader.read("|move|p1a: Garchomp|Earthquake|p2a: Charizard").event.verb, "strike");
  const special = reader.read("|move|p2a: Charizard|Heat Wave|p1a: Garchomp|[spread] p1a");
  assert.equal(special.event.verb, "chase");
  assert.equal(special.event.type, "Fire");
  assert.deepEqual(special.lines, ["상대 리자몽의 열풍!"]);
  assert.equal(reader.read("|move|p1a: Garchomp|Protect|p1a: Garchomp").event.verb, "self");
  const hit = reader.read("|-damage|p1a: Garchomp|90/185");
  assert.deepEqual(hit.event, { verb: "take", ident: "p1a: Garchomp", hp: 90, maxhp: 185 });
  assert.deepEqual(reader.read("|faint|p2a: Charizard").lines, ["상대 리자몽은 쓰러졌다!"]);
  assert.deepEqual(reader.read("|-sidestart|p1: 가|move: Tailwind").lines, ["우리 편에게 순풍이 불기 시작했다!"]);
  reader.read("|switch|p1a: Charizard|Charizard, L50, M|155/155");
  reader.read("|detailschange|p1a: Charizard|Charizard-Mega-Y, L50, M");
  const mega = reader.read("|-mega|p1a: Charizard|Charizard|Charizardite Y");
  assert.equal(mega.lines[1], "리자몽은 메가리자몽으로 메가진화했다!", "the Pokémon is named as it was before it evolved");
  assert.equal(mega.event.verb, "mega");
});

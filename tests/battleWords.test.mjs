// What the battle screen says and marks, against the engine's rules (feedback 2026-11-06 and scripts/battle-fuzz.mjs, which found the rest).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentTypes, effectWord, effectiveness, movePower, moveType, weatherSuppressed } from "../src/pages/battle/battleWords.js";
import { createBattleReader, revives, slotPasses } from "../src/services/battleLog.js";

const text = JSON.parse(readFileSync(new URL("../src/data/battle-text-ko.json", import.meta.url), "utf8"));
const detail = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const res = { text, detail };
const read = lines => { const r = createBattleReader({ text, moves: detail.moves, perspective: "p1" }); const said = []; for (const l of lines) said.push(...(r.read(l).lines || [])); return { r, said }; };

test("a counted effect is said as a number, never its id (Supreme Overlord's fallen2 stood on the plate)", () => {
  assert.equal(effectWord(res, "fallen2"), "쓰러진 동료 2");
  assert.equal(effectWord(res, "perish3"), "멸망의노래 3");
  assert.match(effectWord(res, "confusion"), /[가-힣]/);
});

test("the moves that are not their type on the chart are marked as they land", () => {
  assert.equal(effectiveness("Ice", ["Water"], "freezedry"), 2, "Freeze-Dry hits Water ×2");
  assert.equal(effectiveness("Ice", ["Water", "Flying"], "freezedry"), 4);
  assert.equal(effectiveness("Ice", ["Water"], "icebeam"), 0.5);
  assert.equal(effectiveness("Fighting", ["Normal"], "flyingpress"), 2);
  assert.equal(effectiveness("Fighting", ["Grass"], "flyingpress"), 2, "Flying's matchup on top");
  assert.equal(effectiveness("Ground", ["Flying"], "thousandarrows"), 1);
});

test("a move goes out as the type its user, the weather or its form makes it", () => {
  assert.equal(moveType("hypervoice", "Normal", { ability: "pixilate" }), "Fairy");
  assert.equal(moveType("doubleedge", "Normal", { ability: "dragonize" }), "Dragon", "Champions' Dragonize");
  assert.equal(moveType("weatherball", "Normal", { ability: "pixilate" }, {}), "Normal", "an -ate ability leaves Weather Ball alone");
  assert.equal(moveType("weatherball", "Normal", {}, { weather: "SunnyDay" }), "Fire");
  assert.equal(moveType("weatherball", "Normal", {}, { weather: "RainDance", suppressed: true }), "Normal", "Cloud Nine or Air Lock out");
  assert.equal(moveType("weatherball", "Normal", { item: "Utility Umbrella" }, { weather: "RainDance" }), "Normal");
  assert.equal(moveType("weatherball", "Normal", { item: "Utility Umbrella" }, { weather: "Sandstorm" }), "Rock");
  assert.equal(moveType("aurawheel", "Electric", { species: "Morpeko-Hangry" }), "Dark");
  assert.equal(moveType("ragingbull", "Normal", { species: "Tauros-Paldea-Combat" }), "Fighting");
  assert.equal(moveType("surf", "Water", { ability: "normalize" }), "Normal");
  assert.equal(moveType("hypervoice", "Normal", { ability: "liquidvoice" }), "Water");
  assert.ok(weatherSuppressed([{ ability: "Cloud Nine" }]));
});

test("the screen follows a changed typing: Soak, Trick-or-Treat, Roost for its turn, Transform", () => {
  const start = ["|player|p1|가|", "|player|p2|나|", "|switch|p1a: Gyarados|Gyarados, L50|150/150", "|switch|p2a: Corviknight|Corviknight, L50|100/100", "|turn|1"];
  let { r, said } = read([...start, "|-start|p2a: Corviknight|typeadd|Ghost|[from] move: Trick-or-Treat"]);
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Flying", "Steel", "Ghost"]);
  r.read("|-start|p2a: Corviknight|typechange|Water|[from] move: Soak");
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Water"], "Soak replaces the added type too");
  ({ said } = { said: r.read("|-end|p2a: Corviknight|typechange").lines || [] });
  assert.deepEqual(said, [], "a typing put back says nothing");
  ({ r } = read([...start, "|move|p2a: Corviknight|Roost|p2a: Corviknight", "|-singleturn|p2a: Corviknight|move: Roost"]));
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Steel"]);
  r.read("|upkeep");
  assert.deepEqual(currentTypes(res, r.state.sides.p2.active[0]), ["Flying", "Steel"], "Roost lasts its turn");
  ({ r } = read([...start, "|-boost|p1a: Gyarados|atk|2", "|switch|p2a: Ditto|Ditto, L50|100/100", "|-transform|p2a: Ditto|p1a: Gyarados|[from] ability: Imposter"]));
  assert.deepEqual(r.state.sides.p2.active[0].boosts, { atk: 2 }, "Transform takes the stat changes");
  const fallen = read([...start, "|-start|p2a: Corviknight|fallen2|[silent]", "|-end|p2a: Corviknight|fallen2|[silent]"]).said;
  assert.deepEqual(fallen.filter(l => /fallen/.test(l)), []);
});

test("Revival Blessing asks for a fainted Pokémon, and passes when there is none", () => {
  const mons = [{ condition: "41/204", active: true }, { condition: "55/147", active: true, reviving: true }, { condition: "172/172", active: false }, { condition: "0 fnt", active: false }];
  const request = { forceSwitch: [false, true], side: { pokemon: mons } };
  assert.ok(revives(request, 1));
  assert.equal(slotPasses(request, 1), false, "a fainted one can come back");
  assert.equal(slotPasses({ ...request, side: { pokemon: mons.slice(0, 3) } }, 1), true, "no fainted one: the place passes");
});

test("a move key says the power it goes out with now (어시스트파워 and 웨더볼 kept their book power)", () => {
  assert.equal(movePower("storedpower", 20, { boosts: { spa: 2, spd: 2, spe: -1 } }), 100, "20 more for each stage up, none taken for a fall");
  assert.equal(movePower("weatherball", 50, {}, null, { weather: "RainDance" }), 100);
  assert.equal(movePower("weatherball", 50, { item: "Utility Umbrella" }, null, { weather: "RainDance" }), 50, "no rain under an umbrella");
  assert.equal(movePower("weatherball", 50, {}, null, { weather: "SunnyDay", suppressed: true }), 50, "Cloud Nine or Air Lock out");
  assert.equal(movePower("terrainpulse", 50, { types: ["Grass"] }, null, { fields: ["Electric Terrain"] }), 100);
  assert.equal(movePower("terrainpulse", 50, { types: ["Flying"] }, null, { fields: ["Electric Terrain"] }), 50, "off the ground, no terrain");
  assert.equal(moveType("terrainpulse", "Normal", { types: ["Flying"] }, { fields: ["Electric Terrain"] }), "Normal", "nor its type");
  assert.equal(movePower("facade", 70, { status: "brn" }), 140);
  assert.equal(movePower("facade", 70, { status: "slp" }), 70, "sleep does not count");
  assert.equal(movePower("acrobatics", 55, { item: "" }), 110);
  assert.equal(movePower("acrobatics", 55, { item: "Sitrus Berry" }), 55);
  assert.equal(movePower("eruption", 150, { hp: 75, maxhp: 150 }), 75);
  assert.equal(movePower("reversal", 0, { hp: 3, maxhp: 150 }), 200);
  assert.equal(movePower("lastrespects", 50, { fainted: 2 }), 150);
  assert.equal(movePower("ragefist", 50, { hits: 9 }), 350, "up to 350");
  assert.equal(movePower("solarbeam", 120, {}, null, { weather: "Sandstorm" }), 60);
  assert.equal(movePower("hex", 65, {}, { status: "par" }), 130);
  assert.equal(movePower("hex", 65, {}, null), 65, "no lone target: its book power");
  assert.equal(movePower("venoshock", 65, {}, { status: "tox" }), 130);
  assert.equal(movePower("brine", 65, {}, { hp: 50, maxhp: 100 }), 130);
  assert.equal(movePower("lowkick", 0, {}, { species: "Garchomp" }), 80, "95 kg");
  assert.equal(movePower("heavyslam", 0, { species: "Copperajah" }, { species: "Garchomp" }), 120);
  assert.equal(movePower("risingvoltage", 70, {}, { types: ["Ground"] }, { fields: ["Electric Terrain"] }), 140);
  assert.equal(movePower("risingvoltage", 70, {}, { types: ["Flying"] }, { fields: ["Electric Terrain"] }), 70);
});

test("Rage Fist counts the blows a Pokémon takes from moves, and a switch starts it again", () => {
  const start = ["|player|p1|가|", "|player|p2|나|", "|switch|p1a: Annihilape|Annihilape, L50|187/187", "|switch|p2a: Milotic|Milotic, L50|100/100", "|turn|1"];
  const { r } = read([...start, "|move|p2a: Milotic|Scald|p1a: Annihilape", "|-damage|p1a: Annihilape|130/187", "|-damage|p1a: Annihilape|119/187 brn|[from] brn"]);
  assert.equal(r.state.sides.p1.active[0].hits, 1, "the burn is not a blow");
  r.read("|switch|p1a: Oranguru|Oranguru, L50|197/197");
  r.read("|switch|p1a: Annihilape|Annihilape, L50|119/187 brn");
  assert.equal(r.state.sides.p1.active[0].hits, 0);
});

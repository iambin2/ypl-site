// 배틀 전수 테스트: node scripts/battle-fuzz.mjs [battles=300] [seed=1]
// Plays battles between random parties from the sample sets (singles and doubles, M-C and M-B) with random choices, reads each
// player's log as the screen reads it, and after every step compares what the screen would show with the engine's own state:
//   - every message line: no placeholder, no English left in it
//   - each Pokémon out: species, status, stat changes, own HP exactly, and every effect's name said in Korean
//   - each move key's matchup mark against each foe out, against the engine's own matchup for that move
//   - each move key's power, against the engine's own count of it (the move's basePowerCallback, onModifyMove and onBasePower)
// It prints what differs, grouped, with an example of each. Nothing is written anywhere.
import { readFileSync } from "node:fs";
import { formatId, startBattle, choose, readout, randomTeam } from "../supabase/functions/battle/engine.mjs";
import { createBattleReader, revives, slotPasses, toID } from "../src/services/battleLog.js";
import { HIDDEN_VOLATILES, SPEED_POWER, currentTypes, effectWord, effectiveness, movePower, moveType, weatherSuppressed } from "../src/pages/battle/battleWords.js";

const text = JSON.parse(readFileSync(new URL("../src/data/battle-text-ko.json", import.meta.url), "utf8"));
const detail = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const res = { text, detail };
const N = Number(process.argv[2] || 300);
let s = Number(process.argv[3] || 1);
const rand = n => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) % n; };
const random = () => rand(1e9) / 1e9;

const found = new Map(); // kind -> { count, examples }
const moved = new Map(); // move -> keys checked where its power was not its book power
const note = (kind, example) => { const f = found.get(kind) || { count: 0, examples: [] }; f.count += 1; if (f.examples.length < 3 && !f.examples.includes(example)) f.examples.push(example); found.set(kind, f); };
const typesOf = species => detail.pokedex[toID(species)]?.types || [];
const LATIN_OK = /\b(PP|HP|Lv\d*|VS)\b/g;

function choiceFor(request, kind) {
  const free = request.side.pokemon.map((m, i) => (!m.active && !m.condition.endsWith(" fnt") ? i + 1 : 0)).filter(Boolean);
  if (request.teamPreview) return `team ${request.side.pokemon.slice(0, request.maxChosenTeamSize || 6).map((_, i) => i + 1).join(", ")}`;
  const fainted = request.side.pokemon.map((m, i) => (!m.active && m.condition.endsWith(" fnt") ? i + 1 : 0)).filter(Boolean);
  if (request.forceSwitch) return request.forceSwitch.map((_, i) => { const pool = revives(request, i) ? fainted : free; return slotPasses(request, i) ? "pass" : `switch ${pool.splice(rand(pool.length), 1)[0]}`; }).join(", ");
  return request.active.map((a, i) => {
    if (request.side.pokemon[i].condition.endsWith(" fnt")) return "pass";
    // now and then a switch, so switching, Baton Pass and hazards on entry are played too
    if (!a.trapped && free.length && rand(8) === 0) return `switch ${free.splice(rand(free.length), 1)[0]}`;
    const usable = a.moves.map((m, j) => (m.disabled ? -1 : j)).filter(j => j >= 0);
    const j = usable.length ? usable[rand(usable.length)] : 0;
    // an ally move goes to the partner's place, standing or empty, as the screen sends it
    const t = kind !== "doubles" ? "" : ["normal", "any", "adjacentFoe"].includes(a.moves[j].target) ? ` ${rand(2) + 1}` : a.moves[j].target === "adjacentAlly" ? ` -${2 - i}` : "";
    return `move ${j + 1}${t}${a.canMegaEvo && rand(2) ? " mega" : ""}`;
  }).join(", ");
}

// the engine's own matchup for a move, from the attacker to the target as they stand (typing only: an ability the screen cannot know
// yet, such as Levitate, is left out, as the screen leaves it out)
function truth(battle, attacker, target, id) {
  const move = battle.dex.getActiveMove(id);
  battle.singleEvent("ModifyType", move, null, attacker, target, move, move);
  battle.runEvent("ModifyType", attacker, target, move, move);
  if (!battle.dex.getImmunity(move, target.getTypes()) && !move.ignoreImmunity) return { m: 0, type: move.type };
  return { m: 2 ** target.runEffectiveness(move), type: move.type };
}

// the engine's power for a move from the attacker to the target now: its own rules only, no ability's or item's multiplier
function enginePower(battle, attacker, target, id) {
  const move = battle.dex.getActiveMove(id);
  let factor = 1;
  const ctx = Object.create(battle);
  Object.assign(ctx, { chainModify: f => { factor *= Array.isArray(f) ? f[0] / f[1] : f; }, debug() {}, hint() {}, add() {}, attrLastMove() {} });
  move.onModifyMove?.call(ctx, move, attacker, target);
  let bp = move.basePowerCallback ? move.basePowerCallback.call(ctx, attacker, target, move) : move.basePower;
  move.onBasePower?.call(ctx, bp, attacker, target, move);
  bp *= factor;
  return bp > 0 ? Math.max(1, Math.floor(bp)) : bp;
}
// the moves whose power turns on what the screen cannot know or the order of the turn; the screen keeps their book power
const POWER_UNKNOWN = new Set([...SPEED_POWER, "knockoff", "payback", "boltbeak", "fishiousrend", "avalanche", "assurance", "temperflare", "stompingtantrum", "lashout", "retaliate", "ficklebeam", "collisioncourse", "electrodrift", "return", "frustration", "tripleaxel", "triplekick"]);

function check(battle, reader, kind, where) {
  for (const side of ["p1", "p2"]) battle[side].active.forEach((mon, slot) => {
    const seen = reader.state.sides[side].active[slot];
    if (!mon || mon.fainted || !seen) return;
    // an Illusion shows the disguise's species and typing to both players, as the games do; its HP, status and changes are its own
    const masked = Boolean(mon.illusion);
    if (!masked && toID(seen.species) !== toID(mon.species.name)) note("species differs", `${where} ${side}: screen ${seen.species}, engine ${mon.species.name}`);
    if ((seen.status || "") !== (mon.status || "")) note("status differs", `${where} ${side} ${mon.species.name}: screen ${seen.status || "-"}, engine ${mon.status || "-"}`);
    const a = Object.fromEntries(Object.entries(seen.boosts || {}).filter(([, v]) => v)), b = Object.fromEntries(Object.entries(mon.boosts).filter(([, v]) => v));
    if (JSON.stringify(Object.entries(a).sort()) !== JSON.stringify(Object.entries(b).sort())) note("stat changes differ", `${where} ${side} ${mon.species.name}: screen ${JSON.stringify(a)}, engine ${JSON.stringify(b)}`);
    if (side === "p1" && seen.hp !== mon.hp) note("own HP differs", `${where} ${mon.species.name}: screen ${seen.hp}, engine ${mon.hp}`);
    for (const v of seen.volatiles || []) if (!HIDDEN_VOLATILES.has(v) && !/[가-힣]/.test(effectWord(res, v))) note("effect without a Korean name", v);
    // "???" is what Burn Up and Double Shock leave in the engine's list where a type went: no type at all
    const shownTypes = currentTypes(res, seen).join("/"), realTypes = mon.getTypes().filter(t => t !== "???").join("/");
    if (!masked && shownTypes !== realTypes) note("typing on screen differs from the engine's", `${mon.species.name}: screen ${shownTypes}, engine ${realTypes}`);
  });
  // the move keys: what the screen marks against each foe out
  const request = battle.p1.activeRequest;
  if (!request?.active || request.wait) return;
  request.active.forEach((a, slot) => {
    const attacker = battle.p1.active[slot];
    if (!attacker || attacker.fainted) return;
    const user = { species: reader.state.sides.p1.active[slot]?.species, ability: request.side.pokemon[slot].ability, item: request.side.pokemon[slot].item, types: currentTypes(res, reader.state.sides.p1.active[slot]), volatiles: reader.state.sides.p1.active[slot]?.volatiles };
    // what the screen knows of the field: our own abilities from the request, the foe's once announced
    const out = [...request.side.pokemon.filter(p => p.active).map(p => ({ ability: p.ability })), ...reader.state.sides.p2.active];
    for (const m of a.moves) {
      const data = detail.moves[m.id];
      // a delayed move is judged when it lands, not when it is chosen
      if (!data || data.category === "Status" || ["futuresight", "doomdesire"].includes(m.id)) continue;
      battle.p2.active.forEach((foe, fslot) => {
        const seen = reader.state.sides.p2.active[fslot];
        // behind an Illusion the screen marks the disguise; an intact Disguise has the engine say ×1 while it blocks the blow
        if (!foe || foe.fainted || !seen || foe.illusion || (foe.ability === "disguise" && /^Mimikyu/.test(foe.species.name) && !foe.abilityState?.busted && foe.species.id !== "mimikyubusted")) return;
        const type = moveType(m.id, data.type, user, { weather: reader.state.weather, fields: reader.state.fields, suppressed: weatherSuppressed(out) });
        const shown = effectiveness(type, currentTypes(res, seen), m.id);
        const real = truth(battle, attacker, foe, m.id);
        // judged on the typing the screen shows, so a changed typing is reported once above, not again for every move
        if (currentTypes(res, seen).join("/") !== foe.getTypes().filter(t => t !== "???").join("/")) return;
        if (type !== real.type) note(`move type on its key differs: ${m.id}`, `${attacker.species.name} (${attacker.ability}, ${attacker.item}) ${m.id}: screen ${type}, engine ${real.type}; out: ${[...battle.p1.active, ...battle.p2.active].filter(Boolean).map(p => `${p.species.name}/${p.ability}`).join(" ")}; weather ${battle.field.weather}`);
        // power: against a lone foe, the one the key is judged against
        const foesOut = battle.p2.active.filter(f => f && !f.fainted);
        const own = reader.state.sides.p1.active[slot];
        if (foesOut.length === 1 && !POWER_UNKNOWN.has(m.id) && !(foe.ability === "levitate" && !seen.ability)) {
          const fallen = request.side.pokemon.filter(p => p.condition.endsWith(" fnt")).length;
          const hpNow = Number(request.side.pokemon[slot].condition.split("/")[0]), hpMax = Number(request.side.pokemon[slot].condition.split("/")[1]?.split(" ")[0]);
          const shownBP = movePower(m.id, data.basePower, { ...user, hp: hpNow, maxhp: hpMax, status: own?.status, boosts: own?.boosts, volatiles: own?.volatiles, fainted: fallen, hits: own?.hits },
            { ...seen, types: currentTypes(res, seen) }, { weather: reader.state.weather, fields: reader.state.fields, suppressed: weatherSuppressed(out) });
          const realBP = enginePower(battle, attacker, foe, m.id);
          if (realBP !== data.basePower) moved.set(m.id, (moved.get(m.id) || 0) + 1);
          if (shownBP !== realBP) note(`move power on its key differs: ${m.id}`, `${attacker.species.name} (${attacker.ability}, ${attacker.item}, ${attacker.hp}/${attacker.maxhp}, ${attacker.status}) ${m.id} into ${foe.species.name} (${foe.status}, ${foe.hp}/${foe.maxhp}): screen ${shownBP}, engine ${realBP}; weather ${battle.field.weather}, terrain ${battle.field.terrain}`);
        }
        if (shown !== real.m) note(`matchup mark differs: ${m.id}${real.type !== type ? ` (its type becomes ${real.type})` : ""}`, `${attacker.species.name} (${attacker.ability}) ${m.id} into ${foe.species.name} ${foe.getTypes().join("/")}: screen ×${shown}, engine ×${real.m}`);
      });
    }
  });
}

let played = 0, turns = 0;
for (let n = 0; n < N; n++) {
  const reg = n % 3 === 2 ? "m-b" : "m-c", kind = n % 2 ? "doubles" : "singles", formatid = formatId(reg, kind);
  let battle;
  try { battle = startBattle({ formatid, seed: [rand(65535), rand(65535), rand(65535), rand(65535)], p1: { name: "가", team: randomTeam(formatid, random) }, p2: { name: "나", team: randomTeam(formatid, random) } }); }
  catch (e) { note("could not start", e.message); continue; }
  const reader = createBattleReader({ text, moves: detail.moves, pokedex: detail.pokedex, perspective: "p1" });
  let read = 0;
  for (let step = 0; step < 3000 && !battle.ended; step++) {
    for (const side of ["p1", "p2"]) {
      const request = battle[side].activeRequest;
      if (!request || request.wait || battle[side].isChoiceDone()) continue;
      let ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) ok = choose(battle, {}, side, choiceFor(request, kind)).ok;
      if (!ok) { note("no choice the engine takes", `${formatid} #${n} turn ${battle.turn} ${side}`); if (process.env.DUMP == n) console.log(JSON.stringify(request).slice(0, 3000), choiceFor(request, kind)); battle.ended = true; break; }
    }
    const lines = readout(battle).sideLog.p1.split("\n");
    for (; read < lines.length; read++) {
      let out;
      try { out = reader.read(lines[read]); } catch (e) { note("reader threw", `${lines[read]} :: ${e.message}`); continue; }
      for (const said of out.lines || []) {
        if (/[{}]|\[[A-Z]+/.test(said)) note("placeholder left in a message", said);
        if (/[A-Za-z]{3,}/.test(said.replace(LATIN_OK, ""))) note("English left in a message", said);
      }
    }
    check(battle, reader, kind, `${formatid} #${n} turn ${battle.turn}`);
  }
  if (process.env.DUMP == n) console.log(readout(battle).sideLog.p1.split(String.fromCharCode(10)).filter(l => new RegExp(process.env.GREP || "boost").test(l)).join(" || "));
  played += 1; turns += battle.turn;
}
console.log(`${played} battles, ${turns} turns`);
console.log(`power off its book value, checked: ${[...moved].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(", ") || "none"}`);
for (const [kind, f] of [...found].sort((a, b) => b[1].count - a[1].count)) console.log(`\n[${f.count}] ${kind}\n  ${f.examples.join("\n  ")}`);
if (!found.size) console.log("nothing differs");

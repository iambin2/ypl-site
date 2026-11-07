import { Generations } from "@smogon/calc";
import { toID } from "../../services/battleLog.js";

/* 배틀 화면의 말과 상성 (DESIGN.md "Battle"). The stage, the plates, the sheet and the move keys read these; plain JS, so the battle
   tests (tests/battleWords.test.mjs, scripts/battle-fuzz.mjs) check them against the engine as the screen shows them. */
const GEN = Generations.get(9);

/* a move's full PP in 포켓몬 챔피언스: its base PP in fives, each five and one more worth four (5 is 8, 10 is 12, 15 is 16, 20 is 20),
   as the engine's champions mod counts it (calculatePP). The foe's PP is read as this less what it was seen to spend.
   ponytail: the few moves PP never raises (noPPBoosts) are not in the data; they read a little high here */
export const maxPP = (res, id) => { const pp = res.detail.moves[toID(id)]?.pp; return pp ? (pp / 5 + 1) * 4 : null; };
export const STATUS = { brn: "화상", par: "마비", slp: "잠듦", frz: "얼음", psn: "독", tox: "맹독" };
export const STAT = { atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드", accuracy: "명중", evasion: "회피" };
const VOLATILE = { confusion: "혼란", substitute: "대타출동", taunt: "도발", encore: "앙코르", leechseed: "씨뿌리기", attract: "헤롱헤롱", torment: "트집", disable: "사슬묶기", healblock: "회복봉인", yawn: "하품", perishsong: "멸망의노래", curse: "저주", focusenergy: "기충전", magnetrise: "전자부유", ingrain: "뿌리박기", aquaring: "아쿠아링", saltcure: "소금절이", partiallytrapped: "속박", smackdown: "떨어뜨리기", throatchop: "지옥찌르기", tarshot: "타르샷", charge: "충전", stockpile: "비축", laserfocus: "일점집중", typechange: "타입 변화", dynamax: "다이맥스" };
// a changed typing is shown as the typing itself (currentTypes), never as an effect
export const HIDDEN_VOLATILES = new Set(["typechange", "typeadd"]);

/* an effect's name as the screen says it. Some come with a count in their id (Supreme Overlord's fallen2, Perish Song's perish3,
   Stockpile's stockpile2): the count is said as a number, never the id (feedback 2026-11-06: "fallen2" stood on the plate) */
const COUNTED = [[/^fallen(\d)$/, n => `쓰러진 동료 ${n}`], [/^perish(\d)$/, n => `멸망의노래 ${n}`], [/^stockpile(\d)$/, n => `비축 ${n}`]];
// a side's condition is the move that laid it (독압정 poison, 스텔스록 rock, 리플렉터 psychic), so its tag takes that move's type
export const effectType = id => toID(GEN.moves.get(id)?.type || "normal");

export function effectWord(res, id) {
  for (const [re, say] of COUNTED) { const m = re.exec(id); if (m) return say(m[1]); }
  return VOLATILE[id] || res.text.moves[id]?.name || res.text.abilities[id]?.name || res.text.items?.[id]?.name || res.text.default[id]?.weatherName || id;
}

/* a move against a typing, as the games mark it (×4, ×2, ×1, ×½, ×¼, ×0). Most moves are their type on the chart; a few are not
   (feedback 2026-11-06: 프리즈드라이 was marked as any Ice move): Freeze-Dry hits Water ×2, Flying Press adds Flying's matchup,
   Thousand Arrows reaches a Flying type at ×1 */
const cell = (type, target) => GEN.types.get(toID(type))?.effectiveness?.[target] ?? 1;
export function effectiveness(moveType, types, moveId = "") {
  const id = toID(moveId);
  return types.reduce((p, t) => {
    if (id === "freezedry" && t === "Water") return p * 2;
    if (id === "thousandarrows" && t === "Flying") return p;
    return p * cell(moveType, t) * (id === "flyingpress" ? cell("Flying", t) : 1);
  }, 1);
}
export const effLabel = m => ({ 4: "×4", 2: "×2", 1: "×1", .5: "×½", .25: "×¼", 0: "×0" })[m] ?? `×${m}`;

// a Pokémon's typing as it stands now: its species', or what a move or an ability made of it (battleLog.js tracks types, addedType)
export function currentTypes(res, mon) {
  if (!mon) return [];
  const base = mon.types?.length ? mon.types : res.detail.pokedex[toID(mon.species)]?.types || [];
  const all = mon.addedType && !base.includes(mon.addedType) ? [...base, mon.addedType] : base;
  // a roosting Pokémon sets its Flying type aside for the turn; one that was only Flying is Normal meanwhile
  if (!mon.roost || !all.includes("Flying")) return all;
  const grounded = all.filter(t => t !== "Flying");
  return grounded.length ? grounded : ["Normal"];
}
// the weather counts for nothing while a Pokémon with Cloud Nine or Air Lock is out (its ability is known once it is announced)
export const weatherSuppressed = mons => mons.some(m => ["cloudnine", "airlock"].includes(toID(m?.ability)));

/* the type a move goes out as, which the move's own entry does not always say (feedback 2026-11-06: matchups marked on the wrong
   type): the user's ability turns Normal moves (Pixilate and its kin, Champions' Dragonize too), Normalize turns every move Normal, Liquid Voice turns sound
   moves Water; Weather Ball takes the weather, Terrain Pulse the terrain; a form decides Aura Wheel, Raging Bull and Ivy Cudgel;
   Revelation Dance takes the user's first type. user: { species, ability, item, types }; field: { weather, fields, suppressed } */
const ATE = { pixilate: "Fairy", aerilate: "Flying", refrigerate: "Ice", galvanize: "Electric", dragonize: "Dragon" };
// the moves an ability leaves their own type (as the engine lists them)
const KEEP_TYPE = ["judgment", "multiattack", "naturalgift", "revelationdance", "technoblast", "terrainpulse", "weatherball"];
const WEATHER = { sunnyday: "Fire", desolateland: "Fire", raindance: "Water", primordialsea: "Water", sandstorm: "Rock", hail: "Ice", snow: "Ice", snowscape: "Ice" };
const TERRAIN = { electricterrain: "Electric", grassyterrain: "Grass", mistyterrain: "Fairy", psychicterrain: "Psychic" };
const FORM_TYPE = { aurawheel: { morpekohangry: "Dark" }, ragingbull: { taurospaldeacombat: "Fighting", taurospaldeablaze: "Fire", taurospaldeaaqua: "Water" }, ivycudgel: { ogerponwellspring: "Water", ogerponhearthflame: "Fire", ogerponcornerstone: "Rock" } };
// the weather as it reaches this Pokémon: none while suppressed, and a Utility Umbrella keeps sun and rain off its holder
function weatherAt(user = {}, field = {}) {
  const w = field.suppressed ? "" : toID(field.weather);
  return toID(user.item) === "utilityumbrella" && /sunny|rain|desolate|primordial/.test(w) ? "" : w;
}
const terrainOf = field => (field.fields || []).map(toID).find(f => TERRAIN[f]) || "";
// on the ground, as the engine's isGrounded asks (an ability not yet announced, such as Levitate, cannot be known and counts as none)
export function grounded(mon = {}, field = {}) {
  const v = mon.volatiles || [], item = toID(mon.item);
  if ((field.fields || []).some(f => toID(f) === "gravity") || v.includes("ingrain") || v.includes("smackdown") || item === "ironball") return true;
  if ((mon.types || []).includes("Flying") || toID(mon.ability) === "levitate" || v.includes("magnetrise") || v.includes("telekinesis")) return false;
  return item !== "airballoon";
}
export function moveType(id, baseType, user = {}, field = {}) {
  id = toID(id);
  const ability = toID(user.ability), form = toID(user.species);
  let type = baseType;
  if (id === "weatherball") type = WEATHER[weatherAt(user, field)] || type;
  else if (id === "terrainpulse" && grounded(user, field)) type = TERRAIN[terrainOf(field)] || type;
  else if (FORM_TYPE[id]) type = FORM_TYPE[id][form] || type;
  else if (id === "revelationdance" && user.types?.[0]) type = user.types[0];
  if (ability === "normalize" && !KEEP_TYPE.includes(id) && !["hiddenpower", "struggle"].includes(id)) return "Normal";
  if (ATE[ability] && type === "Normal" && !KEEP_TYPE.includes(id)) return ATE[ability];
  if (ability === "liquidvoice" && GEN.moves.get(id)?.flags?.sound) return "Water";
  return type;
}

/* the power a move goes out with now, as the engine's own basePowerCallback and the move's onBasePower count it (feedback
   2026-11-07: 어시스트파워 and 웨더볼 kept their book power through every boost and weather). Only the move's own rule: an
   ability's or an item's multiplier (Technician, Life Orb) is not in it, as the key has always shown the move's power.
   user: { hp, maxhp, status, boosts, item, ability, species, types, volatiles, fainted (its side's fallen), hits (Rage Fist) };
   target: the one foe it would hit, as the screen reads it (its HP in percent is enough), or null when that is not one Pokémon,
   in which case a move that turns on its target keeps its book power. Gyro Ball and Electro Ball turn on a speed the screen cannot
   know, so they keep theirs too (SPEED_POWER). */
export const SPEED_POWER = new Set(["gyroball", "electroball"]);
const STATUS_OF = { hex: s => !!s, infernalparade: s => !!s, venoshock: s => s === "psn" || s === "tox", barbbarrage: s => s === "psn" || s === "tox", wakeupslap: s => s === "slp", smellingsalts: s => s === "par" };
const ups = boosts => Object.values(boosts || {}).reduce((n, v) => n + Math.max(0, v), 0);
const pinch = (hp, maxhp) => { const r = Math.max(Math.floor(hp * 48 / maxhp), 1); return r < 2 ? 200 : r < 5 ? 150 : r < 10 ? 100 : r < 17 ? 80 : r < 33 ? 40 : 20; };
// weight in hectograms as the engine keeps it, with the abilities and the item that change it
function weightOf(mon) {
  const sp = GEN.species.get(toID(mon.species)) || GEN.species.get(toID(String(mon.species).split("-")[0]));
  if (!sp?.weightkg) return null;
  let hg = Math.round(sp.weightkg * 10);
  const ability = toID(mon.ability);
  if (ability === "heavymetal") hg *= 2; else if (ability === "lightmetal") hg = Math.max(1, Math.floor(hg / 2));
  if (toID(mon.item) === "floatstone") hg = Math.max(1, Math.floor(hg / 2));
  return hg;
}
const byWeight = hg => (hg >= 2000 ? 120 : hg >= 1000 ? 100 : hg >= 500 ? 80 : hg >= 250 ? 60 : hg >= 100 ? 40 : 20);
const byRatio = (mine, theirs) => (mine >= theirs * 5 ? 120 : mine >= theirs * 4 ? 100 : mine >= theirs * 3 ? 80 : mine >= theirs * 2 ? 60 : 40);
const squeeze = (top, hp, maxhp) => Math.floor(Math.floor((top * (100 * Math.floor(hp * 4096 / maxhp)) + 2048 - 1) / 4096) / 100) || 1;

export function movePower(id, basePower, user = {}, target = null, field = {}) {
  id = toID(id);
  const t = target, w = weatherAt(user, field), terrain = terrainOf(field);
  let bp = basePower;
  if (id === "storedpower" || id === "powertrip") bp = basePower + 20 * ups(user.boosts);
  else if (id === "weatherball") bp = WEATHER[w] ? basePower * 2 : basePower;
  else if (id === "terrainpulse") bp = terrain && grounded(user, field) ? basePower * 2 : basePower;
  else if (id === "expandingforce") bp = terrain === "psychicterrain" && grounded(user, field) ? basePower * 1.5 : basePower;
  else if (id === "psyblade") bp = terrain === "electricterrain" ? basePower * 1.5 : basePower;
  else if (id === "solarbeam" || id === "solarblade") bp = /rain|primordial|sand|hail|snow/.test(w) ? basePower * 0.5 : basePower;
  else if (id === "facade") bp = user.status && user.status !== "slp" ? basePower * 2 : basePower;
  else if (id === "acrobatics") bp = user.item === "" ? basePower * 2 : basePower;
  else if (["eruption", "waterspout", "dragonenergy"].includes(id) && user.maxhp) bp = basePower * user.hp / user.maxhp;
  else if ((id === "reversal" || id === "flail") && user.maxhp) bp = pinch(user.hp, user.maxhp);
  else if (id === "lastrespects") bp = 50 + 50 * (user.fainted || 0);
  else if (id === "ragefist") bp = Math.min(350, 50 + 50 * (user.hits || 0));
  else if (!t) return basePower;
  else if (STATUS_OF[id]) bp = STATUS_OF[id](t.status) || (["hex", "infernalparade", "wakeupslap"].includes(id) && toID(t.ability) === "comatose") ? basePower * 2 : basePower;
  else if (id === "brine") bp = t.hp * 2 <= t.maxhp ? basePower * 2 : basePower;
  else if (id === "risingvoltage") bp = terrain === "electricterrain" && grounded(t, field) ? basePower * 2 : basePower;
  else if (id === "punishment") bp = Math.min(200, 60 + 20 * ups(t.boosts));
  else if ((id === "wringout" || id === "crushgrip" || id === "hardpress") && t.maxhp) bp = squeeze(id === "hardpress" ? 100 : 120, t.hp, t.maxhp);
  else if (id === "lowkick" || id === "grassknot") { const hg = weightOf(t); bp = hg == null ? basePower : byWeight(hg); }
  else if (id === "heavyslam" || id === "heatcrash") { const a = weightOf(user), b = weightOf(t); bp = a == null || b == null ? basePower : byRatio(a, b); }
  return bp > 0 ? Math.max(1, Math.floor(bp)) : bp;
}

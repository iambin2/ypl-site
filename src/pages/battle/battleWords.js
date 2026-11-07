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
export function moveType(id, baseType, user = {}, field = {}) {
  id = toID(id);
  const ability = toID(user.ability), form = toID(user.species);
  let type = baseType;
  if (id === "weatherball" && !field.suppressed) {
    const w = toID(field.weather);
    // a Utility Umbrella keeps sun and rain off its holder, Weather Ball included
    if (!(toID(user.item) === "utilityumbrella" && /sunny|rain|desolate|primordial/.test(w))) type = WEATHER[w] || type;
  }
  else if (id === "terrainpulse") type = (field.fields || []).map(f => TERRAIN[toID(f)]).find(Boolean) || type;
  else if (FORM_TYPE[id]) type = FORM_TYPE[id][form] || type;
  else if (id === "revelationdance" && user.types?.[0]) type = user.types[0];
  if (ability === "normalize" && !KEEP_TYPE.includes(id) && !["hiddenpower", "struggle"].includes(id)) return "Normal";
  if (ATE[ability] && type === "Normal" && !KEEP_TYPE.includes(id)) return ATE[ability];
  if (ability === "liquidvoice" && GEN.moves.get(id)?.flags?.sound) return "Water";
  return type;
}

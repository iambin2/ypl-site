// Battle calculator: damage, speed and Pokédex reads for Pokémon Champions.
// The damage engine is @smogon/calc generation 0 (Champions: level 50, no IVs, Stat Points 0-32).
// Everything here is pure; the page owns state and storage.
import { Field, Generations, Move, Pokemon, calculate } from "@smogon/calc";
import { getFinalSpeed } from "@smogon/calc/dist/mechanics/util.js";
import { TYPE_OPTIONS } from "../data/index.js";
import { toID } from "./championsData.js";
import { ALIGNMENTS, STAT_KEYS, calculatedStat } from "./teamBuilderCore.js";

export const GEN = Generations.get(0);
export const BOOST_KEYS = ["atk", "def", "spa", "spd", "spe"];
export const CALC_STORAGE_KEY = "ypl-calculator:v1";

export const STATUS_OPTIONS = [
  { value: "", label: "상태이상 없음" },
  { value: "brn", label: "화상" },
  { value: "par", label: "마비" },
  { value: "psn", label: "독" },
  { value: "tox", label: "맹독" },
  { value: "slp", label: "잠듦" },
  { value: "frz", label: "얼음" },
];
export const WEATHER_OPTIONS = [
  { value: "", label: "날씨 없음" },
  { value: "Sun", label: "쾌청" },
  { value: "Rain", label: "비" },
  { value: "Sand", label: "모래바람" },
  { value: "Snow", label: "설경" },
];
export const TERRAIN_OPTIONS = [
  { value: "", label: "필드 없음" },
  { value: "Electric", label: "일렉트릭필드" },
  { value: "Grassy", label: "그래스필드" },
  { value: "Misty", label: "미스트필드" },
  { value: "Psychic", label: "사이코필드" },
];
// Conditions that belong to one side of the field. When that side attacks, its own row applies as attackerSide.
export const SIDE_CONDITIONS = [
  { key: "helpingHand", flag: "isHelpingHand", label: "도우미" },
  { key: "charge", flag: "isCharge", label: "충전" },
  { key: "battery", flag: "isBattery", label: "배터리" },
  { key: "powerSpot", flag: "isPowerSpot", label: "파워스폿" },
  { key: "steelySpirit", flag: "isSteelySpirit", label: "강철정신" },
  { key: "flowerGift", flag: "isFlowerGift", label: "플라워기프트" },
  { key: "reflect", flag: "isReflect", label: "리플렉터" },
  { key: "lightScreen", flag: "isLightScreen", label: "빛의장막" },
  { key: "auroraVeil", flag: "isAuroraVeil", label: "오로라베일" },
  { key: "friendGuard", flag: "isFriendGuard", label: "프렌드가드" },
  { key: "tailwind", flag: "isTailwind", label: "순풍" },
  { key: "sr", flag: "isSR", label: "스텔스록" },
];
export const FIELD_CONDITIONS = [
  { key: "isTabletsOfRuin", label: "재앙의목간" },
  { key: "isSwordOfRuin", label: "재앙의검" },
  { key: "isVesselOfRuin", label: "재앙의그릇" },
  { key: "isBeadsOfRuin", label: "재앙의구슬" },
  { key: "isFairyAura", label: "페어리오라" },
  { key: "isDarkAura", label: "다크오라" },
  { key: "isAuraBreak", label: "오라브레이크" },
  { key: "isGravity", label: "중력" },
  { key: "trickRoom", label: "트릭룸" },
];
// Abilities whose effect the engine applies only when told they are active.
export const TOGGLE_ABILITIES = new Set(["Flash Fire", "Unburden", "Slow Start", "Stakeout", "Plus", "Minus", "Electromorphosis", "Intimidate"]);
const AUTO_BOOST_ABILITIES = new Set(["Protosynthesis", "Quark Drive"]);

const zeroStats = keys => Object.fromEntries(keys.map(key => [key, 0]));
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

export function emptySide() {
  return {
    name: "", ability: "", item: "", nature: "serious", abilityOn: false, status: "", hp: 100, crit: false,
    sp: zeroStats(STAT_KEYS), boosts: zeroStats(BOOST_KEYS), moves: ["", "", "", ""], conds: {},
  };
}

export function emptyField() {
  return { format: "Singles", weather: "", terrain: "", flags: {} };
}

// Storage is a convenience: anything malformed falls back to an empty slot instead of breaking the page.
export function normalizeSide(raw) {
  const side = emptySide();
  if (!raw || typeof raw !== "object") return side;
  side.name = typeof raw.name === "string" ? raw.name : "";
  side.ability = typeof raw.ability === "string" ? raw.ability : "";
  side.item = typeof raw.item === "string" ? raw.item : "";
  side.nature = ALIGNMENTS.some(nature => nature.id === raw.nature) ? raw.nature : "serious";
  side.abilityOn = Boolean(raw.abilityOn);
  side.status = STATUS_OPTIONS.some(option => option.value === raw.status) ? raw.status : "";
  side.hp = clampInt(raw.hp ?? 100, 1, 100);
  side.crit = Boolean(raw.crit);
  for (const key of STAT_KEYS) side.sp[key] = clampInt(raw.sp?.[key], 0, 32);
  for (const key of BOOST_KEYS) side.boosts[key] = clampInt(raw.boosts?.[key], -6, 6);
  side.moves = Array.from({ length: 4 }, (_, index) => typeof raw.moves?.[index] === "string" ? raw.moves[index] : "");
  side.conds = Object.fromEntries(SIDE_CONDITIONS.filter(({ key }) => raw.conds?.[key]).map(({ key }) => [key, true]));
  return side;
}

export function normalizeField(raw) {
  const field = emptyField();
  if (!raw || typeof raw !== "object") return field;
  field.format = raw.format === "Doubles" ? "Doubles" : "Singles";
  field.weather = WEATHER_OPTIONS.some(option => option.value === raw.weather) ? raw.weather : "";
  field.terrain = TERRAIN_OPTIONS.some(option => option.value === raw.terrain) ? raw.terrain : "";
  field.flags = Object.fromEntries(FIELD_CONDITIONS.filter(({ key }) => raw.flags?.[key]).map(({ key }) => [key, true]));
  return field;
}

export function spTotal(side) {
  return STAT_KEYS.reduce((sum, key) => sum + (Number(side?.sp?.[key]) || 0), 0);
}

// A team builder member becomes a calculator side; conditions and boosts start clean.
export function sideFromMember(member) {
  return normalizeSide({
    name: member?.pokemon?.name || "",
    ability: member?.ability || "",
    item: member?.item || "",
    nature: member?.alignment || "serious",
    sp: member?.statPoints,
    moves: member?.moves,
  });
}

// record: a Showdown pokedex record (championsData). Returns null when the engine does not know the species.
export function buildPokemon(detailData, record, side) {
  if (!record || !GEN.species.get(record.id)) return null;
  const nature = ALIGNMENTS.find(entry => entry.id === side.nature) || ALIGNMENTS[0];
  const ability = side.ability || record.abilities?.[0] || undefined;
  const pokemon = new Pokemon(GEN, record.name, {
    ability,
    item: side.item ? detailData?.items?.[side.item]?.name || undefined : undefined,
    nature: nature.name,
    evs: side.sp,
    boosts: side.boosts,
    status: side.status || undefined,
    abilityOn: TOGGLE_ABILITIES.has(ability) ? side.abilityOn : false,
    boostedStat: AUTO_BOOST_ABILITIES.has(ability) ? "auto" : undefined,
  });
  pokemon.originalCurHP = Math.max(1, Math.floor((pokemon.maxHP() * side.hp) / 100));
  return pokemon;
}

export function buildField(field, attackerSide, defenderSide) {
  const sideState = side => Object.fromEntries(SIDE_CONDITIONS.map(({ key, flag }) => [flag, Boolean(side?.conds?.[key])]));
  const flags = field?.flags || {};
  return new Field({
    gameType: field?.format === "Doubles" ? "Doubles" : "Singles",
    weather: field?.weather || undefined,
    terrain: field?.terrain || undefined,
    ...Object.fromEntries(FIELD_CONDITIONS.filter(({ key }) => key !== "trickRoom").map(({ key }) => [key, Boolean(flags[key])])),
    attackerSide: sideState(attackerSide),
    defenderSide: sideState(defenderSide),
  });
}

// Showdown's percentage: floored to one decimal so 130.19% never reads as a sure 130.2%.
export const percentOf = (damage, hp) => hp > 0 ? Math.floor((damage * 1000) / hp) / 10 : 0;

function flatRolls(damage) {
  if (typeof damage === "number") return [damage];
  if (Array.isArray(damage[0])) {
    // Multi-hit with different rolls per hit: sum the per-roll columns.
    return damage[0].map((_, index) => damage.reduce((sum, hit) => sum + hit[index], 0));
  }
  return damage;
}

export function koLabel(ko, hp, max) {
  if (ko?.n > 0) return ko.chance >= 1 ? `확정 ${ko.n}타` : `난수 ${ko.n}타 (${Math.round(ko.chance * 1000) / 10}%)`;
  if (max > 0 && hp > 0) return `${Math.ceil(hp / max)}타 이상`;
  return "";
}

// One move from attacker to defender. Returns null for a move the engine cannot resolve.
export function damageFor({ detailData, attacker, defender, attackerSide, defenderSide, field, moveId }) {
  if (!attacker || !defender || !moveId) return null;
  const moveRecord = detailData?.moves?.[moveId];
  if (!moveRecord || !GEN.moves.get(moveId)) return null;
  const move = new Move(GEN, moveRecord.name, { isCrit: Boolean(attackerSide?.crit) });
  const summary = { moveId, type: move.type, category: move.category, basePower: move.bp };
  if (move.category === "Status") return { ...summary, status: true };
  let result;
  try {
    result = calculate(GEN, attacker, defender, move, buildField(field, attackerSide, defenderSide));
  } catch (error) {
    return { ...summary, error: true };
  }
  const rolls = flatRolls(result.damage);
  const min = rolls[0] ?? 0;
  const max = rolls[rolls.length - 1] ?? 0;
  const hp = result.defender.maxHP();
  const curHP = result.defender.curHP();
  let ko = { chance: 0, n: 0 };
  if (max > 0) {
    try { ko = result.kochance(false); } catch (error) { ko = { chance: 0, n: 0 }; }
  }
  return {
    ...summary,
    basePower: result.move.bp,
    type: result.move.type,
    rolls, min, max, hp, curHP,
    minPct: percentOf(min, hp), maxPct: percentOf(max, hp),
    ko: { n: ko.n || 0, chance: ko.chance || 0 },
    koText: max > 0 ? koLabel(ko, curHP, max) : "효과 없음",
    attackStat: result.attacker.stats, defenseStat: result.defender.stats,
  };
}

// Both sides' final speeds and who moves first under the shared field.
export function speedDuel({ a, b, sideA, sideB, field }) {
  if (!a || !b) return null;
  const engineField = buildField(field, sideA, sideB);
  const speedA = getFinalSpeed(GEN, a, engineField, engineField.attackerSide);
  const speedB = getFinalSpeed(GEN, b, engineField, engineField.defenderSide);
  const trickRoom = Boolean(field?.flags?.trickRoom);
  const first = speedA === speedB ? "tie" : (speedA > speedB) !== trickRoom ? "a" : "b";
  return { speedA, speedB, first, trickRoom };
}

// Game rounding for a 4096-based modifier: halves round down.
const pokeRound = value => (value % 1 > 0.5 ? Math.ceil(value) : Math.floor(value));
export const SPEED_MODIFIERS = [
  { value: "1", label: "보정 없음" },
  { value: "1.5", label: "1.5배 (스카프, 랭크 +1)" },
  { value: "2", label: "2배 (순풍, 랭크 +2)" },
  { value: "0.5", label: "0.5배 (마비)" },
];
export function applySpeedModifier(speed, modifier) {
  const m = Number(modifier) || 1;
  if (m === 0.5) return Math.floor((speed * 50) / 100);
  return pokeRound(speed * m);
}

const SPEED_SPREADS = [
  { key: "max", label: "최속", sp: 32, nature: "timid" },
  { key: "neutral", label: "준속", sp: 32, nature: "serious" },
  { key: "none", label: "무보정", sp: 0, nature: "serious" },
  { key: "min", label: "최저", sp: 0, nature: "brave" },
];
export const SPEED_SPREAD_LABELS = Object.fromEntries(SPEED_SPREADS.map(spread => [spread.key, spread.label]));

// The common speed lines of one species, before any modifier.
export function speedLines(base, modifier = "1") {
  return Object.fromEntries(SPEED_SPREADS.map(spread => {
    const nature = ALIGNMENTS.find(entry => entry.id === spread.nature);
    return [spread.key, applySpeedModifier(calculatedStat(base, spread.sp, "spe", nature), modifier)];
  }));
}

// Defensive type chart for a typing: { 4: [...], 2: [...], 1: [...], 0.5: [...], 0.25: [...], 0: [...] }.
export function defensiveMatchups(types = []) {
  const groups = { 4: [], 2: [], 1: [], 0.5: [], 0.25: [], 0: [] };
  for (const attacking of TYPE_OPTIONS) {
    const chart = GEN.types.get(attacking.id);
    const multiplier = types.reduce((product, type) => product * (chart?.effectiveness?.[type] ?? 1), 1);
    groups[multiplier]?.push(attacking.english);
  }
  return groups;
}

export function weightOf(record) {
  return record ? GEN.species.get(record.id)?.weightkg ?? null : null;
}

// Low Kick and Grass Knot power by target weight.
export function weightMovePower(weightkg) {
  if (weightkg == null) return null;
  return weightkg >= 200 ? 120 : weightkg >= 100 ? 100 : weightkg >= 50 ? 80 : weightkg >= 25 ? 60 : weightkg >= 10 ? 40 : 20;
}

// Final stat range at level 50: 0 SP with a hindering nature up to 32 SP with a helping one.
export function statRange(base, key) {
  const down = ALIGNMENTS.find(entry => entry.minus === key) || ALIGNMENTS[0];
  const up = ALIGNMENTS.find(entry => entry.plus === key) || ALIGNMENTS[0];
  if (key === "hp") return [calculatedStat(base, 0, key), calculatedStat(base, 32, key)];
  return [calculatedStat(base, 0, key, down), calculatedStat(base, 32, key, up)];
}

export { toID };

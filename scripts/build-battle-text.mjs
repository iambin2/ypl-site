// Builds src/data/battle-text-ko.json, the battle messages the battle screen speaks, from Showdown's Korean text (MIT).
// The Korean battle messages are the game's own, taken by Showdown from Pokémon Champions; they are quoted as they are
// (DESIGN.md, Voice and tone). A message Showdown has not translated yet falls back to its English.
//
//   node scripts/build-battle-text.mjs
//
// The commit is the one the battle engine is built from (supabase/functions/battle/engine.mjs, ENGINE), so a move's
// messages match the engine that plays it. Moving the engine means moving this commit and running the script again.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formDisplayName } from "../src/services/recordsPokemon.js";
import { KO } from "../src/data/teamBuilderLocalization.js";

export const SHOWDOWN_COMMIT = "035c1a1f3c2ed286cda4c0d8623800699cd2c1c0";
const BASE = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN_COMMIT}/data/text`;
const OUTPUT = new URL("../src/data/battle-text-ko.json", import.meta.url);
const DROP = new Set(["desc", "shortDesc", "flavor"]);
const CHAMPIONS = new URL("../src/data/champions-data.json", import.meta.url);

// Lines Showdown has not translated yet, in the game's own voice, so the battle never speaks English. Used only where the
// Korean file has nothing; a line Showdown translates later wins. Most are the generic fallbacks under an effect's own line.
export const KO_FILL = {
  default: {
    default: {
      start: "  ({POKEMON}에게 {EFFECT}의 효과가 생겼다!)",
      activate: "  ({EFFECT}의 효과가 나타났다!)",
      startTeamEffect: "  ({TEAM}에게 {EFFECT}의 효과가 생겼다!)",
      endTeamEffect: "  ({TEAM}의 {EFFECT} 효과가 끝났다!)",
      startFieldEffect: "  ({EFFECT}의 효과가 생겼다!)",
      endFieldEffect: "  ({EFFECT}의 효과가 끝났다!)",
      eatItem: "  {POKEMON:topic} {ITEM:object} 먹었다!",
      removeItem: "  {POKEMON}의 {ITEM:subject} 없어졌다!",
      activateItem: "  {POKEMON:topic} {ITEM:object} 사용했다!",
      healFromEffect: "  {POKEMON:topic} {EFFECT:directional} 체력을 회복했다!",
      damagePercentage: "  ({POKEMON:topic} 체력을 {PERCENTAGE}% 잃었다!)",
      boostFromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 올라갔다!",
      boost2FromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 크게 올라갔다!",
      boost3FromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 매우 크게 올라갔다!",
      unboostFromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 떨어졌다!",
      unboost2FromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 크게 떨어졌다!",
      unboost3FromItem: "  {ITEM} 때문에 {POKEMON}의 {STAT:subject} 매우 크게 떨어졌다!",
      cantNoMove: "  {POKEMON:topic} 움직일 수 없다!",
      typeChangeFromEffect: "  {POKEMON:topic} {EFFECT} 때문에 {TYPE}타입이 됐다!",
    },
  },
  moves: {
    brickbreak: { activate: "  {POKEMON:topic} {TEAM}의 벽을 깨뜨렸다!" },
    ragingbull: { activate: "  {POKEMON:topic} {TEAM}의 벽을 깨뜨렸다!" },
    conversion: { typeChange: "  {SOURCE}의 타입으로 바뀌었다!" },
    mindblown: { damage: "  ({POKEMON:topic} 자신의 체력을 깎아 기술의 위력을 올렸다!)" },
    pursuit: { activate: "  ({TARGET:topic} 교체되려 하고 있다...)" },
    roost: { start: "  ({POKEMON:topic} 이번 턴 동안 비행타입이 아니게 됐다)" },
    wrap: { move: "  {POKEMON}의 공격이 계속된다!" },
  },
  abilities: {
    forewarn: { activateNoTarget: "  {POKEMON:topic} 위험예지로 {MOVE:object} 알아챘다!" },
    naturalcure: { activate: "  ({POKEMON:topic} 자연회복으로 상태 이상이 나았다!)" },
    persistent: { activate: "  {POKEMON:topic} {MOVE}의 효과를 2턴 늘렸다!" },
  },
};

// The text files are object literals behind one type annotation, at a fixed commit of a trusted repository.
function evaluate(source) {
  const module = { exports: {} };
  const body = source.replace(/^import .*$/gm, "").replace(/export const (\w+)\s*:[^=]+=/g, "module.exports.$1 =");
  new Function("module", body)(module);
  return module.exports;
}

// Strings only, the top-level (current generation) ones, Korean first and English under it.
function merge(english = {}, korean = {}, fill = {}) {
  const out = {};
  for (const [id, entry] of Object.entries(english)) {
    const row = {};
    for (const [key, value] of Object.entries(entry || {})) {
      if (typeof value !== "string" || DROP.has(key)) continue;
      const ko = korean?.[id]?.[key];
      row[key] = typeof ko === "string" ? ko : fill[id]?.[key] ?? value;
    }
    if (Object.keys(row).length) out[id] = row;
  }
  return out;
}

// A name Showdown has not translated (mega stones, the newest items) takes the one the team builder shows.
const named = (table, korean = {}) => {
  for (const [id, row] of Object.entries(table)) if (row.name && !/[가-힣]/.test(row.name) && korean[id]) row.name = korean[id];
  return table;
};

export function buildBattleText(files, champions = { pokedex: {}, speciesNames: {} }) {
  const en = name => Object.values(evaluate(files[`en/${name}`]))[0];
  const ko = name => Object.values(evaluate(files[`ko/${name}`]))[0];
  const koNames = evaluate(files["ko/names"]);
  const enNames = evaluate(files["en/names"]);
  const pick = (table, key) => Object.fromEntries(Object.entries(enNames[table] || {}).map(([id, value]) => [id, typeof koNames[table]?.[id] === "string" ? koNames[table][id] : value]));
  const pokedex = Object.fromEntries(Object.entries(merge(en("pokedex"), ko("pokedex"))).map(([id, row]) => [id, row.name]));
  // A form Showdown names only in English (알로라 나인테일, 메가 forms) takes the name the team builder and the records give it.
  for (const [id, record] of Object.entries(champions.pokedex)) {
    const own = pokedex[String(record.baseSpecies).toLowerCase().replace(/[^a-z0-9]/g, "")];
    const base = /[가-힣]/.test(own) ? own : champions.speciesNames?.koreanById?.[record.num];
    if (pokedex[id] && /[가-힣]/.test(base) && !/[가-힣]/.test(pokedex[id])) pokedex[id] = formDisplayName(record, base);
  }
  return {
    commit: SHOWDOWN_COMMIT,
    default: merge(en("default"), ko("default"), KO_FILL.default),
    moves: named(merge(en("moves"), ko("moves"), KO_FILL.moves), KO.moves),
    abilities: named(merge(en("abilities"), ko("abilities"), KO_FILL.abilities), KO.abilities),
    items: named(merge(en("items"), ko("items")), KO.items),
    pokedex,
    stats: pick("StatNames"),
    types: pick("TypeNames"),
  };
}

export function validateBattleText(data) {
  const problems = [];
  if (!/^\{POKEMON\}의 \*\*\{MOVE\}\*\*!$/.test(data.default?.default?.move || "")) problems.push("the move message is not the Korean one");
  if (data.moves?.flamethrower?.name !== "화염방사") problems.push("move names are not Korean");
  if (data.pokedex?.charizard !== "리자몽") problems.push("species names are not Korean");
  if (Object.keys(data.moves || {}).length < 900) problems.push("too few moves");
  if (problems.length) throw new Error(`battle text failed validation:\n- ${problems.join("\n- ")}`);
  return data;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = ["default", "moves", "abilities", "items", "pokedex", "names"];
  const files = {};
  await Promise.all(names.flatMap(name => ["en", "ko"].map(async lang => {
    const url = lang === "en" ? `${BASE}/${name}.ts` : `${BASE}/ko/${name}.ts`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    files[`${lang}/${name}`] = await response.text();
  })));
  const json = JSON.stringify(validateBattleText(buildBattleText(files, JSON.parse(readFileSync(CHAMPIONS, "utf8")))));
  writeFileSync(OUTPUT, json);
  console.log(`${fileURLToPath(OUTPUT)}: ${(json.length / 1024).toFixed(0)} KB`);
}

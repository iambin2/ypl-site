// Builds src/data/battle-text-ko.json, the battle messages the battle screen speaks, from Showdown's Korean text (MIT).
// The Korean battle messages are the game's own, taken by Showdown from Pokémon Champions; they are quoted as they are
// (DESIGN.md, Voice and tone). A message Showdown has not translated yet falls back to its English.
//
//   node scripts/build-battle-text.mjs
//
// The commit is the one the battle engine is built from (supabase/functions/battle/engine.mjs, ENGINE), so a move's
// messages match the engine that plays it. Moving the engine means moving this commit and running the script again.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SHOWDOWN_COMMIT = "035c1a1f3c2ed286cda4c0d8623800699cd2c1c0";
const BASE = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN_COMMIT}/data/text`;
const OUTPUT = new URL("../src/data/battle-text-ko.json", import.meta.url);
const DROP = new Set(["desc", "shortDesc", "flavor"]);

// The text files are object literals behind one type annotation, at a fixed commit of a trusted repository.
function evaluate(source) {
  const module = { exports: {} };
  const body = source.replace(/^import .*$/gm, "").replace(/export const (\w+)\s*:[^=]+=/g, "module.exports.$1 =");
  new Function("module", body)(module);
  return module.exports;
}

// Strings only, the top-level (current generation) ones, Korean first and English under it.
function merge(english = {}, korean = {}) {
  const out = {};
  for (const [id, entry] of Object.entries(english)) {
    const row = {};
    for (const [key, value] of Object.entries(entry || {})) {
      if (typeof value !== "string" || DROP.has(key)) continue;
      const ko = korean?.[id]?.[key];
      row[key] = typeof ko === "string" ? ko : value;
    }
    if (Object.keys(row).length) out[id] = row;
  }
  return out;
}

export function buildBattleText(files) {
  const en = name => Object.values(evaluate(files[`en/${name}`]))[0];
  const ko = name => Object.values(evaluate(files[`ko/${name}`]))[0];
  const koNames = evaluate(files["ko/names"]);
  const enNames = evaluate(files["en/names"]);
  const pick = (table, key) => Object.fromEntries(Object.entries(enNames[table] || {}).map(([id, value]) => [id, typeof koNames[table]?.[id] === "string" ? koNames[table][id] : value]));
  const pokedex = merge(en("pokedex"), ko("pokedex"));
  return {
    commit: SHOWDOWN_COMMIT,
    default: merge(en("default"), ko("default")),
    moves: merge(en("moves"), ko("moves")),
    abilities: merge(en("abilities"), ko("abilities")),
    items: merge(en("items"), ko("items")),
    pokedex: Object.fromEntries(Object.entries(pokedex).map(([id, row]) => [id, row.name])),
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
  const json = JSON.stringify(validateBattleText(buildBattleText(files)));
  writeFileSync(OUTPUT, json);
  console.log(`${fileURLToPath(OUTPUT)}: ${(json.length / 1024).toFixed(0)} KB`);
}

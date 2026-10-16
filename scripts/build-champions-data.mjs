// Builds src/data/champions-data.json, the one file the team builder,
// calculator and records load at runtime (src/services/championsData.js).
//
//   npm run data:champions
//
// The JSON is committed, not generated in the deploy: the deploy then has no
// dependency on GitHub raw or PokeAPI, the test suite runs against exactly the
// data that ships, and an upstream format change shows up as a failed run or a
// reviewable diff instead of a silently broken site. The weekly
// .github/workflows/refresh-champions-data.yml runs this script and opens a
// pull request when the data changed; run it by hand for a new regulation.
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyItemOverrides,
  applyMoveOverrides,
  parseItems,
  parseLearnsets,
  parseMoves,
  parsePokedex,
  parseSpeciesNames,
} from "../src/services/championsData.js";

const SHOWDOWN = "https://raw.githubusercontent.com/smogon/pokemon-showdown/refs/heads/master/data";
export const SOURCES = {
  pokedex: `${SHOWDOWN}/pokedex.ts`,
  moves: `${SHOWDOWN}/moves.ts`,
  items: `${SHOWDOWN}/items.ts`,
  championsLearnsets: `${SHOWDOWN}/mods/champions/learnsets.ts`,
  championsMoves: `${SHOWDOWN}/mods/champions/moves.ts`,
  championsItems: `${SHOWDOWN}/mods/champions/items.ts`,
  speciesNames: "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv",
};
const OUTPUT = new URL("../src/data/champions-data.json", import.meta.url);

export function buildChampionsData(text) {
  const { koreanById, koreanByEnglish } = parseSpeciesNames(text.speciesNames);
  return {
    pokedex: parsePokedex(text.pokedex),
    learnsets: parseLearnsets(text.championsLearnsets),
    moves: applyMoveOverrides(parseMoves(text.moves), text.championsMoves),
    items: applyItemOverrides(parseItems(text.items), text.championsItems),
    speciesNames: {
      koreanById: Object.fromEntries(koreanById),
      koreanByEnglish: Object.fromEntries(koreanByEnglish),
    },
  };
}

// A parser that quietly matches nothing yields a valid but empty file, so
// check sizes and a few known records before anything is written.
export function validateChampionsData(data) {
  const problems = [];
  const atLeast = (label, value, min) => {
    if (!(value >= min)) problems.push(`${label}: ${value} (expected at least ${min})`);
  };
  atLeast("pokedex entries", Object.keys(data.pokedex || {}).length, 1000);
  atLeast("champions learnsets", Object.keys(data.learnsets || {}).length, 100);
  atLeast("moves", Object.keys(data.moves || {}).length, 800);
  atLeast("items", Object.keys(data.items || {}).length, 400);
  atLeast("Korean species names", Object.keys(data.speciesNames?.koreanById || {}).length, 1000);
  const pikachu = data.pokedex?.pikachu;
  if (pikachu?.num !== 25 || pikachu?.baseStats?.spe !== 90 || !pikachu?.abilities?.length) problems.push("pokedex.pikachu is incomplete");
  if (!data.learnsets?.pikachu?.includes("thunderbolt")) problems.push("learnsets.pikachu lacks thunderbolt");
  if (data.moves?.thunderbolt?.basePower !== 90 || data.moves?.thunderbolt?.type !== "Electric") problems.push("moves.thunderbolt is incomplete");
  if (data.items?.leftovers?.name !== "Leftovers") problems.push("items.leftovers is missing");
  if (data.speciesNames?.koreanByEnglish?.pikachu !== "피카츄") problems.push("speciesNames lacks 피카츄");
  if (problems.length) throw new Error(`Champions data failed validation:\n- ${problems.join("\n- ")}`);
  return data;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([key, url]) => [key, await fetchText(url)]));
  const data = validateChampionsData(buildChampionsData(Object.fromEntries(entries)));
  const json = JSON.stringify(data);
  writeFileSync(OUTPUT, json);
  console.log(`${fileURLToPath(OUTPUT)}: ${(json.length / 1024).toFixed(0)} KB, ${Object.keys(data.pokedex).length} species, ${Object.keys(data.learnsets).length} learnsets, ${Object.keys(data.moves).length} moves, ${Object.keys(data.items).length} items`);
}

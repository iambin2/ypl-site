import { load as loadChampionsData, loadSpeciesNames } from "./championsData.js";
import { REGULATIONS } from "../data/index.js";
import { canonicalBaseName, localizedPokemonName, pokemonPoolForRegulation, resolveCanonicalPokemonId } from "./teamBuilderCore.js";

const clean = (value) => String(value || "").trim();
// PokeAPI spells Farfetch’d/Sirfetch’d with U+2019; Showdown names use ASCII.
const key = (value) => clean(value).toLowerCase().replace(/’/g, "'");

function formDisplayName(record, korean) {
  const id = key(record?.id);
  if (!korean) return clean(record?.name);
  // Official Korean mega naming, matching legacy snapshots such as 메가메타그로스.
  const mega = clean(record?.forme).match(/^Mega(?:-([A-Z]))?$/);
  if (mega) return `메가${korean}${mega[1] || ""}`;
  if (id.endsWith("alola")) return `알로라 ${korean}`;
  if (id.endsWith("hisui")) return `히스이 ${korean}`;
  if (id.endsWith("galar")) return `가라르 ${korean}`;
  if (id === "rotomheat") return `히트${korean}`;
  if (id === "rotomwash") return `워시${korean}`;
  if (id === "rotomfrost") return `프로스트${korean}`;
  if (id === "rotomfan") return `스핀${korean}`;
  if (id === "rotommow") return `커트${korean}`;
  return korean;
}

// Records show the exact name the team builder showed when the party was
// built, so forms such as 루가루암 (한밤중의 모습) stay distinct.
function builderNamesById(detailData, koreanByEnglish) {
  const names = new Map();
  for (const regulation of Object.values(REGULATIONS)) {
    for (const pokemon of pokemonPoolForRegulation(regulation, detailData, [], { includeUnavailableMega: true })) {
      const id = resolveCanonicalPokemonId(detailData, pokemon);
      const record = detailData.pokedex?.[id];
      // Cosmetic forms resolve to the base record; the base entry names it.
      if (!record || names.has(id) || (pokemon.name !== canonicalBaseName(pokemon.name) && record.name === record.baseSpecies)) continue;
      const localized = localizedPokemonName(pokemon, koreanByEnglish);
      if (localized !== pokemon.name) names.set(id, localized);
    }
  }
  return names;
}

export function buildRecordsPokemonDirectory(detailData, speciesNames) {
  const directory = new Map();
  const koreanById = speciesNames?.koreanById || new Map();
  const koreanByEnglish = speciesNames?.koreanByEnglish || new Map();
  const builderNames = builderNamesById(detailData || {}, koreanByEnglish);
  for (const [id, record] of Object.entries(detailData?.pokedex || {})) {
    const canonicalName = clean(record?.name);
    const korean = koreanById.get(String(record?.num)) || koreanByEnglish.get(key(canonicalName));
    directory.set(id, {
      pokemonId: id,
      dexNumber: record?.num ?? null,
      canonicalName,
      baseSpecies: clean(record?.baseSpecies),
      forme: clean(record?.forme),
      displayName: builderNames.get(id) || formDisplayName({ ...record, id }, korean),
    });
  }
  return directory;
}

export function resolveRecordsPokemonName(pokemonId, snapshotName, directory) {
  const fallback = clean(snapshotName);
  const canonical = directory?.get?.(clean(pokemonId));
  if (!canonical) return fallback;
  return clean(canonical.displayName || canonical.canonicalName || fallback) || fallback;
}

function isSpriteName(value) {
  const candidate = clean(value);
  return Boolean(candidate && /[a-z0-9]/i.test(candidate) && !/[^\x00-\x7f]/.test(candidate));
}

export function resolveRecordsSpriteName(pokemonId, snapshotName, directory) {
  const snapshot = clean(snapshotName);
  if (isSpriteName(snapshot)) return snapshot;
  return clean(directory?.get?.(clean(pokemonId))?.canonicalName);
}

export async function loadRecordsPokemonDirectory() {
  const [detailData, speciesNames] = await Promise.all([loadChampionsData(), loadSpeciesNames()]);
  return buildRecordsPokemonDirectory(detailData, speciesNames);
}

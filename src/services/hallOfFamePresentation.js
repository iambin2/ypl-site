import { displaySeasonLabel, generationNumberFromLegacyLabel } from "./seasonLabel.js";
import { loadRecordsPokemonDirectory, resolveRecordsPokemonName } from "./recordsPokemon.js";
import { spriteUrlForSlug } from "./teamBuilderCore.js";

const clean = (value) => String(value || "").trim();
// Spacing varies between stored names (오거폰(우물의가면), 오거폰 (우물의 가면)); match without it.
const key = (value) => clean(value).toLowerCase().replace(/\s+/g, "");

export function isNormalizedChampionsHallOfFame(event = {}) {
  return event?.event_type === "champions" && event?.championship_phase === "final";
}

export function normalizedChampionLabel(generationNumber, battleFormat) {
  const generation = Number(generationNumber);
  if (!Number.isInteger(generation) || generation <= 0) return "챔피언";
  const format = battleFormat === "singles" ? "싱글" : battleFormat === "doubles" ? "더블" : "";
  return `${generation}대${format ? ` ${format}` : ""} 챔피언`;
}

export function legacyChampionLabel(label) {
  const stored = clean(label);
  if (!stored) return "챔피언";
  return /챔피언\s*$/.test(stored) ? stored : `${stored} 챔피언`;
}

export function normalizedSeasonLabel(season = {}) {
  const series = clean(season?.series).toUpperCase();
  const number = Number(season?.number);
  if (!series || !Number.isInteger(number) || number <= 0) return "";
  return displaySeasonLabel(`${series} SEASON ${number}`);
}

export { generationNumberFromLegacyLabel };

const showdownId = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

// Form names no directory entry spells: the official Pokédex names (pokemonkorea.co.kr)
// and the older legacy spellings.
const LEGACY_FORM_IDS = {
  "다투곰(붉은 달)": "ursalunabloodmoon",
  "다투곰(블러드문)": "ursalunabloodmoon",
  "드레디어(히스이의 모습)": "lilliganthisui",
  "드레디어(히스이)": "lilliganthisui",
  "쉐이미(스카이폼)": "shayminsky",
  "오거폰(우물의 가면)": "ogerponwellspring",
  "오거폰(물)": "ogerponwellspring",
};

// The team builder's PokeOS 3D renders; forms are named base-forme there.
export function showdownSpriteUrl(record = {}) {
  const base = showdownId(record.baseSpecies || record.canonicalName);
  const forme = showdownId(record.forme);
  return base ? spriteUrlForSlug(`${base}${forme ? `-${forme}` : ""}`) : "";
}

export function buildHallOfFameArtworkLookup(directory) {
  const lookup = new Map();
  const add = (candidate, image) => {
    // First record wins, so a shared Korean name stays on the base form.
    if (key(candidate) && !lookup.has(key(candidate))) lookup.set(key(candidate), image);
  };
  for (const [pokemonId, record] of directory || []) {
    const image = showdownSpriteUrl(record);
    if (!image) continue;
    for (const candidate of [pokemonId, record?.pokemonId, record?.canonicalName, record?.displayName]) add(candidate, image);
  }
  for (const [name, pokemonId] of Object.entries(LEGACY_FORM_IDS)) {
    const record = directory?.get?.(pokemonId);
    if (record) lookup.set(key(name), showdownSpriteUrl(record));
  }
  return lookup;
}

let artworkLookupPromise = null;

export function loadHallOfFameArtworkLookup() {
  if (!artworkLookupPromise) {
    artworkLookupPromise = loadRecordsPokemonDirectory().then(buildHallOfFameArtworkLookup);
  }
  return artworkLookupPromise;
}

export function resolveHallOfFameArtwork(member = {}, lookup) {
  for (const candidate of [member?.pokemonId, member?.pokemon_id, member?.id, member?.name]) {
    const image = lookup?.get?.(key(candidate));
    if (image) return image;
  }
  return "";
}

export function buildChampionshipHallOfFameParty(members = [], pokemonDirectory = new Map(), artworkLookup = new Map()) {
  return (Array.isArray(members) ? members : [])
    .slice()
    .sort((a, b) => Number(a?.slot || 0) - Number(b?.slot || 0))
    .map((member) => ({
      name: resolveRecordsPokemonName(member?.pokemon_id, member?.pokemon_name_snapshot, pokemonDirectory),
      pokemonId: member?.pokemon_id || "",
      img: resolveHallOfFameArtwork({ pokemonId: member?.pokemon_id, name: member?.pokemon_name_snapshot }, artworkLookup),
    }));
}

const MB_ONLY_ITEM_IDS = new Set([
  // Regulation M-B newly added standard held items.
  'widelens', 'muscleband', 'wiseglasses', 'expertbelt', 'lightclay',
  'lifeorb', 'zoomlens', 'metronome', 'ironball', 'icyrock',
  'smoothrock', 'heatrock', 'damprock', 'shedshell', 'bigroot',
  // Mega Stones newly enabled together with the M-B Mega Evolutions.
  'raichunitex', 'raichunitey', 'sceptilite', 'blazikenite', 'swampertite',
  'mawilite', 'metagrossite', 'staraptite', 'scolipite', 'scraftinite',
  'eelektrossite', 'pyroarite', 'malamarite', 'barbaracite', 'dragalgite', 'falinksite',
]);

const MC_ONLY_ITEM_IDS = new Set([
  // Regulation M-C newly added standard held items.
  'airballoon', 'bindingband', 'ejectbutton', 'electricseed', 'grassyseed', 'leek',
  'mistyseed', 'normalgem', 'psychicseed', 'redcard', 'rockyhelmet', 'terrainextender',
  // Mega Stones newly enabled together with the M-C Mega Evolutions.
  'absolitez', 'baxcalibrite', 'garchompitez', 'golisopite', 'lucarionitez', 'salamencite',
]);

// Built by scripts/build-champions-data.mjs (npm run data:champions). Vite
// emits it under a content hash, so the browser HTTP cache is enough.
const DATA_URL = new URL('../data/champions-data.json', import.meta.url).href;

// The old raw-source cache lived in localStorage (ypl-champions-data-v1..v7).
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('ypl-champions-data-')) localStorage.removeItem(key);
  }
} catch {
  // No storage, nothing to clean.
}

function toID(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function topLevelEntries(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const entries = new Map();
  let id = null;
  let buffer = [];

  for (const line of lines) {
    const start = line.match(/^\t([a-z0-9]+): \{$/);
    if (!id && start) {
      id = start[1];
      buffer = [line];
      continue;
    }
    if (!id) continue;
    buffer.push(line);
    if (line === '\t},') {
      entries.set(id, buffer.join('\n'));
      id = null;
      buffer = [];
    }
  }
  return entries;
}

// Close on the same quote that opened, so "King's Shield" is not cut at the apostrophe.
const QUOTED = /(["'])(.+?)\1/g;

function parseQuoted(raw, key) {
  const re = new RegExp(`\\b${key}:\\s*${QUOTED.source}`);
  return raw.match(re)?.[2] || '';
}

function parseNumber(raw, key) {
  const re = new RegExp(`\\b${key}:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const value = raw.match(re)?.[1];
  return value === undefined ? null : Number(value);
}

function parseBooleanishNonstandard(raw) {
  const nullMatch = raw.match(/\bisNonstandard:\s*null/);
  if (nullMatch) return null;
  const text = parseQuoted(raw, 'isNonstandard');
  return text || undefined;
}

function parseStats(raw) {
  const body = raw.match(/\bbaseStats:\s*\{([^}]+)\}/)?.[1];
  if (!body) return null;
  const out = {};
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    const value = body.match(new RegExp(`\\b${stat}:\\s*(\\d+)`))?.[1];
    if (value !== undefined) out[stat] = Number(value);
  }
  return Object.keys(out).length === 6 ? out : null;
}

function parseAbilities(raw) {
  const body = raw.match(/\babilities:\s*\{([^}]+)\}/)?.[1];
  if (!body) return [];
  return [...body.matchAll(QUOTED)].map(m => m[2]);
}

function parseQuotedArray(raw, key) {
  const body = raw.match(new RegExp(`\\b${key}:\\s*\\[([\\s\\S]*?)\\]`))?.[1];
  if (!body) return [];
  return [...body.matchAll(QUOTED)].map(m => m[2]);
}

function parsePokedex(source) {
  const out = {};
  for (const [id, raw] of topLevelEntries(source)) {
    const name = parseQuoted(raw, 'name');
    const num = parseNumber(raw, 'num');
    const baseStats = parseStats(raw);
    const abilities = parseAbilities(raw);
    const typesBody = raw.match(/\btypes:\s*\[([^\]]+)\]/)?.[1] || '';
    const types = [...typesBody.matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
    if (!name || num === null) continue;
    out[id] = {
      id,
      num,
      name,
      baseSpecies: parseQuoted(raw, 'baseSpecies') || name,
      forme: parseQuoted(raw, 'forme'),
      requiredItem: parseQuoted(raw, 'requiredItem'),
      cosmeticFormes: parseQuotedArray(raw, 'cosmeticFormes'),
      baseStats,
      abilities,
      types,
    };
  }
  return out;
}

function parseLearnsets(source) {
  const out = {};
  for (const [id, raw] of topLevelEntries(source)) {
    const moves = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^\t{3}([a-z0-9]+): \[/);
      if (m) moves.push(m[1]);
    }
    if (moves.length) out[id] = [...new Set(moves)];
  }
  return out;
}

function parseMoves(source) {
  const out = {};
  for (const [id, raw] of topLevelEntries(source)) {
    const name = parseQuoted(raw, 'name');
    if (!name) continue;
    const accuracyText = raw.match(/\baccuracy:\s*(true|\d+)/)?.[1];
    out[id] = {
      id,
      name,
      type: parseQuoted(raw, 'type'),
      category: parseQuoted(raw, 'category'),
      basePower: parseNumber(raw, 'basePower') ?? 0,
      accuracy: accuracyText === 'true' ? true : accuracyText ? Number(accuracyText) : null,
      pp: parseNumber(raw, 'pp'),
      priority: parseNumber(raw, 'priority') ?? 0,
      isNonstandard: parseBooleanishNonstandard(raw),
    };
  }
  return out;
}

function applyMoveOverrides(base, source) {
  for (const [id, raw] of topLevelEntries(source)) {
    const target = base[id] || { id, name: id };
    const name = parseQuoted(raw, 'name');
    const type = parseQuoted(raw, 'type');
    const category = parseQuoted(raw, 'category');
    if (name) target.name = name;
    if (type) target.type = type;
    if (category) target.category = category;
    for (const key of ['basePower', 'pp', 'priority']) {
      const n = parseNumber(raw, key);
      if (n !== null) target[key] = n;
    }
    const accuracyText = raw.match(/\baccuracy:\s*(true|\d+)/)?.[1];
    if (accuracyText) target.accuracy = accuracyText === 'true' ? true : Number(accuracyText);
    const nonstandard = parseBooleanishNonstandard(raw);
    if (nonstandard !== undefined) target.isNonstandard = nonstandard;
    base[id] = target;
  }
  return base;
}

function parseItems(source) {
  const out = {};
  for (const [id, raw] of topLevelEntries(source)) {
    const name = parseQuoted(raw, 'name');
    if (!name) continue;
    out[id] = {
      id,
      name,
      isNonstandard: parseBooleanishNonstandard(raw),
      megaStone: parseQuoted(raw, 'megaStone'),
    };
  }
  return out;
}

function applyItemOverrides(base, source) {
  for (const [id, raw] of topLevelEntries(source)) {
    const target = base[id] || { id, name: id };
    const name = parseQuoted(raw, 'name');
    if (name) target.name = name;
    const nonstandard = parseBooleanishNonstandard(raw);
    if (nonstandard !== undefined) target.isNonstandard = nonstandard;
    base[id] = target;
  }
  return base;
}

// PokeAPI spells Farfetch’d/Sirfetch’d with U+2019; Showdown names use ASCII.
const speciesNameKey = name => String(name || '').trim().toLowerCase().replace(/’/g, "'");

// PokeAPI pokemon_species_names.csv: species id, language id (3 Korean, 9 English), name.
function parseSpeciesNames(csv) {
  const englishById = new Map();
  const koreanById = new Map();
  for (const line of String(csv || '').split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    const thirdComma = line.indexOf(',', secondComma + 1);
    if (firstComma < 0 || secondComma < 0 || thirdComma < 0) continue;
    const id = line.slice(0, firstComma);
    const lang = line.slice(firstComma + 1, secondComma);
    const name = line.slice(secondComma + 1, thirdComma).replace(/^"|"$/g, '').replace(/""/g, '"');
    if (lang === '9') englishById.set(id, name);
    if (lang === '3') koreanById.set(id, name);
  }
  const koreanByEnglish = new Map();
  for (const [id, english] of englishById) {
    const korean = koreanById.get(id);
    if (korean) koreanByEnglish.set(speciesNameKey(english), korean);
  }
  return { koreanById, koreanByEnglish };
}

let pendingText = null;

// Share the immutable text only; every caller parses its own mutable objects.
function fetchData() {
  return pendingText ||= fetch(DATA_URL).then(response => {
    if (!response.ok) throw new Error(`${response.status} ${DATA_URL}`);
    return response.text();
  }).catch(error => {
    pendingText = null;
    throw error;
  });
}

async function load() {
  const { pokedex, learnsets, moves, items } = JSON.parse(await fetchData());
  return { pokedex, learnsets, moves, items };
}

// { koreanById: Map(dex number → 한국어), koreanByEnglish: Map(English key → 한국어) }
async function loadSpeciesNames() {
  const { speciesNames } = JSON.parse(await fetchData());
  return {
    koreanById: new Map(Object.entries(speciesNames.koreanById)),
    koreanByEnglish: new Map(Object.entries(speciesNames.koreanByEnglish)),
  };
}

function legalItems(data, regulationId) {
  const values = Object.values(data?.items || {})
    .filter(item => item.name && (item.isNonstandard === null || item.isNonstandard === undefined))
    .filter(item => regulationId !== 'm-a' || !MB_ONLY_ITEM_IDS.has(item.id))
    .filter(item => regulationId === 'm-c' || !MC_ONLY_ITEM_IDS.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return values;
}


export {
  load, loadSpeciesNames, legalItems, toID, MB_ONLY_ITEM_IDS, MC_ONLY_ITEM_IDS,
  parsePokedex, parseLearnsets, parseMoves, applyMoveOverrides, parseItems, applyItemOverrides, parseSpeciesNames,
};

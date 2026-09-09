import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_REGULATION_ID,
  REGULATIONS,
  resolveRegulationId,
} from '../src/data/teamBuilderRegulations.js';
import {
  DATA_ID_OVERRIDES,
  LEGACY_PERSISTED_REGULATION_ID,
  canonicalBaseName,
  dataId,
  normalizeDraft,
  normalizeSavedTeam,
  speciesIdentity,
  spriteSlug,
} from '../src/services/teamBuilderCore.js';
import { legalItems, MB_ONLY_ITEM_IDS, MC_ONLY_ITEM_IDS } from '../src/services/championsData.js';

const pokemonNames = regulationId => REGULATIONS[regulationId].pokemon.map(pokemon => pokemon.name);
const hasPokemon = (regulationId, name) => pokemonNames(regulationId).includes(name);

test('regulation roster inheritance is complete and duplicate-free', () => {
  const ma = pokemonNames('m-a');
  const mb = pokemonNames('m-b');
  const mc = pokemonNames('m-c');

  assert.equal(REGULATIONS['m-a'].status, 'past');
  assert.equal(REGULATIONS['m-b'].status, 'past');
  assert.equal(REGULATIONS['m-c'].status, 'current');
  assert.equal(REGULATIONS['m-c'].period, '2026.09.09 – 2026.12.02');
  assert.equal(new Set(ma).size, ma.length);
  assert.equal(new Set(mb).size, mb.length);
  assert.equal(new Set(mc).size, mc.length);
  assert.ok(ma.every(name => mb.includes(name)), 'M-A must be a subset of M-B');
  assert.ok(mb.every(name => mc.includes(name)), 'M-B must be a subset of M-C');
  assert.equal(mc.length - mb.length, 29, 'M-C must add 24 official entries and 5 form entries');
});

test('M-C-only Pokémon are not legal in M-B', () => {
  for (const name of ['Rillaboom', 'Baxcalibur', 'Wigglytuff', 'Salamence']) {
    assert.equal(hasPokemon('m-b', name), false, `${name} must be illegal in M-B`);
    assert.equal(hasPokemon('m-c', name), true, `${name} must be legal in M-C`);
  }
  assert.equal(hasPokemon('m-b', 'Sceptile'), true);
  assert.equal(hasPokemon('m-c', 'Sceptile'), true);
});

test('M-C form data IDs and Species Clause fallback identities are stable', () => {
  const formIds = {
    'Persian [Alolan Form]': 'persianalola',
    'Toxtricity [Low Key Form]': 'toxtricitylowkey',
    'Indeedee [Female]': 'indeedeef',
    'Squawkabilly [Blue Plumage]': 'squawkabillyblue',
    'Squawkabilly [Yellow Plumage]': 'squawkabillyyellow',
    'Squawkabilly [White Plumage]': 'squawkabillywhite',
  };
  for (const [name, expected] of Object.entries(formIds)) {
    assert.equal(DATA_ID_OVERRIDES[name], expected);
    assert.equal(dataId({ name }), expected);
    assert.equal(hasPokemon('m-c', name), true);
  }
  assert.equal(spriteSlug('Persian [Alolan Form]'), 'persian-alola');
  assert.equal(spriteSlug('Toxtricity [Low Key Form]'), 'toxtricity-lowkey');
  assert.equal(spriteSlug('Indeedee [Female]'), 'indeedee-f');
  assert.equal(spriteSlug('Squawkabilly [Blue Plumage]'), 'squawkabilly-blue');
  assert.equal(spriteSlug('Squawkabilly [Yellow Plumage]'), 'squawkabilly-yellow');
  assert.equal(spriteSlug('Squawkabilly [White Plumage]'), 'squawkabilly-white');

  for (const [base, form] of [
    ['Toxtricity', 'Toxtricity [Low Key Form]'],
    ['Indeedee', 'Indeedee [Female]'],
    ['Squawkabilly', 'Squawkabilly [Blue Plumage]'],
    ['Squawkabilly [Yellow Plumage]', 'Squawkabilly [White Plumage]'],
  ]) {
    assert.equal(canonicalBaseName(form), canonicalBaseName(base));
    assert.equal(speciesIdentity(null, { name: form }), speciesIdentity(null, { name: base }));
  }
});

test('item legality distinguishes M-A, M-B, and M-C', () => {
  assert.equal(MC_ONLY_ITEM_IDS.size, 18);
  const data = {
    items: Object.fromEntries([
      ['oranberry', { id: 'oranberry', name: 'Oran Berry' }],
      ['lifeorb', { id: 'lifeorb', name: 'Life Orb' }],
      ['rockyhelmet', { id: 'rockyhelmet', name: 'Rocky Helmet' }],
      ['airballoon', { id: 'airballoon', name: 'Air Balloon' }],
      ['salamencite', { id: 'salamencite', name: 'Salamencite' }],
      ['baxcalibrite', { id: 'baxcalibrite', name: 'Baxcalibrite' }],
    ]),
  };
  const ids = regulationId => new Set(legalItems(data, regulationId).map(item => item.id));

  assert.equal(MB_ONLY_ITEM_IDS.has('lifeorb'), true);
  assert.deepEqual([...ids('m-a')].sort(), ['oranberry']);
  assert.equal(ids('m-b').has('lifeorb'), true);
  for (const item of ['rockyhelmet', 'airballoon', 'salamencite', 'baxcalibrite']) {
    assert.equal(ids('m-b').has(item), false, `${item} must be illegal in M-B`);
    assert.equal(ids('m-c').has(item), true, `${item} must be legal in M-C`);
  }
  assert.equal(ids('m-c').has('lifeorb'), true);
});

test('new page default is M-C while saved data keeps its historical M-B fallback', () => {
  assert.equal(DEFAULT_REGULATION_ID, 'm-c');
  assert.equal(resolveRegulationId(null), 'm-c');
  assert.equal(resolveRegulationId('m-b'), 'm-b');
  assert.equal(resolveRegulationId('missing-regulation'), 'm-c');
  assert.equal(LEGACY_PERSISTED_REGULATION_ID, 'm-b');

  const saved = normalizeSavedTeam({ id: 'old-team', members: [] });
  const draft = normalizeDraft({ members: [] }, REGULATIONS);
  assert.equal(saved.regulationId, 'm-b');
  assert.equal(draft.regulationId, 'm-b');
});

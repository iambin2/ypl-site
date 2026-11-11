/* 연승 도전의 판 (docs/BATTLE_STREAK.md). 배틀 함수(index.ts)가 쓰는 엔진 쪽 전부다: 판 만들기와 서버에서 두는 컴퓨터의 차례.
   컴퓨터는 휴대폰의 컴퓨터와 같고(battleCpu.js), 요청마다 새로 만들어 저장된 추리(memory)를 이어 받는다. */
import { Dex } from "@pkmn/sim";
import { CPU_NAME, choose, fairPool, formatId, randomTeam, shuffled, startBattle, validateTeam, weighted } from "./engine.mjs";
import { createCpu, quickChoice } from "../../../src/services/battleCpu.js";
import { MEGA_STONE, RANK_BANDS, STREAK_BAN, STREAK_BATTLE_FORMAT, STREAK_REGULATION, bandOf, doorsOf, streakCpuOptions, streakMaster } from "../../../src/services/streak.js";
import RANKER from "../../../src/data/ranker-teams.json" with { type: "json" };
import TOWER_TIERS from "../../../src/data/tower-tiers.json" with { type: "json" };

export const STREAK_FORMAT = formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT);

/* The computer (p2) takes every turn it owes, from the state the engine stands in. A choice that commits (p1 owes nothing, as after
   p1's own choice or on a forced switch of the computer's alone) plays on, and the computer looks again. A choice that waits for p1
   is not kept in the state (engine.mjs choose): it is returned as pending, with the state as it stood before it, so the next choice of
   p1 plays both. A choice the engine refuses is chosen once more (the refusal makes the engine mark what was hidden, as a Shadow
   Tag trapped: 2026-11-07, docs/BATTLE_STREAK.md 4장), and only then is the strongest attack played. wins picks the 난이도. */
export function computerTurns(engine, wins, memory, random = Math.random, hard = false) {
  for (let step = 0; step < 8; step++) {
    const req = engine.p2.activeRequest;
    if (engine.ended || !req || req.wait || engine.p2.isChoiceDone()) break;
    const state = engine.toJSON();
    let picked = null, done = null;
    for (let tries = 0; tries < 2 && !done?.ok; tries++) {
      const cpu = createCpu(engine.format.id, { ...streakCpuOptions(wins, hard), random, memory });
      try { picked = cpu.decide(engine, "p2"); } catch (error) { console.error("cpu", error); picked = null; }
      memory = cpu.memory();
      done = picked ? choose(engine, null, "p2", picked) : null;
      if (!done?.ok) console.warn("cpu choice refused", picked, done?.error);
    }
    if (!done?.ok) {
      picked = quickChoice(engine, "p2");
      done = choose(engine, null, "p2", picked);
      if (!done.ok) throw new Error(`the computer has no choice the engine takes: ${done.error}`);
    }
    if (!done.committed) return { state, pending: { p2: picked }, memory };
  }
  return { state: engine.toJSON(), pending: {}, memory };
}

/* ---------- the tower's own pool (2026-11-11, docs/BATTLE_STREAK.md 14장) ----------
   The foes are the ladder's top teams (src/data/ranker-teams.json: six species and their items, scripts/build-ranker-teams.mjs), and
   the draft offers the species those teams bring, with the items they bring them with. The moves, ability, nature and spread come
   from the sample sets (random-sets.json, the ladder's 1760+ statistics): a set that carries the ranker's item, drawn by weight. This
   one place is where the game's own statistics would come in, if the open data's owner allows it (14.8). */
const LOCKS = /^(Choice (Band|Specs|Scarf)|Assault Vest)$/;
const statusMove = set => set.moves.some(m => Dex.moves.get(m).category === "Status");
// the items each species is brought with on the ladder's top teams, by how often
const HELD = new Map();
for (const t of RANKER.teams) for (const m of t.team) if (m.item) {
  const held = HELD.get(m.species) || new Map();
  held.set(m.item, (held.get(m.item) || 0) + 1);
  HELD.set(m.species, held);
}
// the tower's species with their sample sets, what the ban keeps out already taken out (engine.mjs fairPool)
const pools = new Map();
function towerPool(ban) {
  if (!pools.has(ban)) pools.set(ban, new Map(fairPool(STREAK_FORMAT, ban).filter(e => e.species in TOWER_TIERS).map(e => [e.species, e])));
  return pools.get(ban);
}
/* a sample set of the species that holds the item: one that carries it, by weight, or else one that can (never a Mega set for an item
   that is not its stone, never a status move under a Choice item or an Assault Vest). No item: a set that is not a Mega's. null when
   none can */
function setFor(entry, item, random) {
  const carry = item ? entry.sets.filter(set => set.items.includes(item)) : [];
  const sets = carry.length ? carry : item && MEGA_STONE.test(item) ? [] : entry.sets.filter(set => !set.mega && !(LOCKS.test(item) && statusMove(set)));
  return sets.length ? weighted(sets, random) : null;
}
const member = (species, set, item) => ({ name: "", species, ability: set.ability, item, moves: [...set.moves], nature: set.nature, evs: { ...set.evs }, ...(set.ivs ? { ivs: { ...set.ivs } } : {}), level: 50 });
const SPARE_ITEMS = ["Sitrus Berry", "Lum Berry", "Leftovers", "Shell Bell", "Expert Belt", "Life Orb"];
/* a ranker team as a party: each one's set holding the ranker's item. An item the tower bans gives way to the set's next free one.
   null when a species has no set or the party is refused */
function rankerParty(team, random, ban = STREAK_BAN) {
  const pool = towerPool(ban), used = new Set(team.map(m => m.item).filter(Boolean)), out = [];
  for (const m of team) {
    const entry = pool.get(m.species);
    const banned = ban.items.includes(m.item);
    const set = entry && setFor(entry, banned ? "" : m.item, random);
    if (!set) return null;
    let item = m.item;
    if (banned) {
      item = [...set.items, ...SPARE_ITEMS].find(i => !used.has(i) && !MEGA_STONE.test(i) && !(LOCKS.test(i) && statusMove(set)));
      if (!item) return null;
      used.add(item);
    }
    out.push(member(m.species, set, item));
  }
  return validateTeam(STREAK_FORMAT, out) ? null : out;
}
/* the foe of a game: a ranker team drawn from the rank band of its floor and door (streak.js bandOf), with its season and rank, which
   the screen shows. kind: "even", "hard" or "gate" */
export function foeTeam(wins, kind = "even", random = Math.random) {
  const [hi, lo] = RANK_BANDS[bandOf(wins, kind)];
  const teams = RANKER.teams.filter(t => t.rank >= hi && t.rank <= lo);
  for (let tries = 0; tries < 12; tries++) {
    const t = teams[Math.floor(random() * teams.length)];
    const party = rankerParty(t.team, random);
    if (party) return { team: party, season: t.season, rank: t.rank };
  }
  throw new Error(`no ranker team could be made a party in band ${hi}-${lo}`);
}

/* A new game of the run: the seed and the computer's party drawn here (foe: the team behind the door chosen, { team, season, rank };
   none: a ranker team of the game's own band), and the computer's team preview already chosen. name: the trainer's, as the battle row
   shows it. party: the player's, carried from the last game (with a swap made); a screen from before the draft draws one. */
export function streakGame(name, wins, random = Math.random, party = null, foe = null, hard = false) {
  const seed = Array.from({ length: 4 }, () => Math.floor(random() * 0x10000));
  const p1Team = party || randomTeam(STREAK_FORMAT, random, { ban: STREAK_BAN });
  const against = foe?.team ? foe : foeTeam(wins, streakMaster(wins) ? "gate" : "even", random);
  const engine = startBattle({
    formatid: STREAK_FORMAT, seed,
    p1: { name, team: p1Team },
    p2: { name: CPU_NAME, team: against.team },
  });
  return { engine, p1Team, foe: { season: against.season ?? null, rank: against.rank ?? null }, ...computerTurns(engine, wins, undefined, random, hard) };
}

/* the doors to the next game (13장, streak.js doorsOf): a ranker team drawn for each, kept by the run until the next game is opened,
   and told to the player as species only, as a team preview shows them, with the team's season and rank (14장). The gatekeeper's
   door shows nothing. wins: the wins before the next game */
export function streakDoors(wins, random = Math.random) {
  return doorsOf(wins).map(kind => ({ kind, ...foeTeam(wins, kind, random) }));
}
export const shownDoors = doors => (doors || []).map(d => (d.kind === "gate" ? { kind: d.kind, species: [] } : { kind: d.kind, species: d.team.map(m => m.species), season: d.season ?? null, rank: d.rank ?? null }));

/* 도전의 탑's opening draft (13장, streak.js STREAK_DRAFT; 14장: from the tower's pool): count candidates from each of the tower's six
   tiers (src/data/tower-tiers.json), strongest first, every candidate of its own species, holding an item the ladder's top teams bring
   it with (by how often) in the set that carries it. A candidate keeps back-up items (items), so a party picked from it never holds an
   item twice (engine.mjs draftParty). */
export function draftOffer(random = Math.random, { ban = STREAK_BAN, count = 3 } = {}) {
  const pool = towerPool(ban);
  const rows = Array.from({ length: 6 }, () => []);
  for (const [species, tier] of Object.entries(TOWER_TIERS)) if (pool.has(species)) rows[tier].push(pool.get(species));
  const bases = new Set();
  return rows.map(list => {
    const row = [];
    for (const entry of shuffled(list, random)) {
      if (row.length >= count) break;
      const base = Dex.species.get(entry.species).baseSpecies;
      if (bases.has(base)) continue;
      // the row's last place is never a Mega when the others are, so every row has a choice that leaves room for one Mega in all
      const noMega = row.length === count - 1 && row.every(c => c.mega);
      const held = [...(HELD.get(entry.species) || [])].filter(([item]) => !ban.items.includes(item) && !(noMega && MEGA_STONE.test(item)));
      const item = held.length ? weighted(held.map(([item, weight]) => ({ item, weight })), random).item : "";
      const set = setFor(entry, item, random) || (noMega ? setFor(entry, "", random) : null);
      if (!set || (noMega && set.mega)) continue;
      const mega = Boolean(set.mega);
      const own = item && (set.items.includes(item) || !mega) ? item : set.items[0];
      // back-ups: the ladder's other items for it, then the set's own; a Mega keeps its stone only
      const items = mega ? [own] : [...new Set([own, ...held.map(([i]) => i).filter(i => !MEGA_STONE.test(i) && !(LOCKS.test(i) && statusMove(set))), ...set.items])].filter(Boolean);
      bases.add(base);
      row.push({ species: entry.species, ability: set.ability, item: own, items, moves: [...set.moves], nature: set.nature, evs: { ...set.evs }, ...(set.ivs ? { ivs: { ...set.ivs } } : {}), mega });
    }
    return row;
  });
}

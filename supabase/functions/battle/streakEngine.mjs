/* 연승 도전의 판 (docs/BATTLE_STREAK.md). 배틀 함수(index.ts)가 쓰는 엔진 쪽 전부다: 판 만들기와 서버에서 두는 컴퓨터의 차례.
   컴퓨터는 휴대폰의 컴퓨터와 같고(battleCpu.js), 요청마다 새로 만들어 저장된 추리(memory)를 이어 받는다. */
import { Dex } from "@pkmn/sim";
import { CPU_NAME, choose, formatId, randomTeam, shuffled, startBattle, weighted } from "./engine.mjs";
import { createCpu, quickChoice } from "../../../src/services/battleCpu.js";
import { MEGA_STONE, STREAK_BAN, STREAK_BATTLE_FORMAT, STREAK_REGULATION, doorsOf, streakCpuOptions } from "../../../src/services/streak.js";
import { HELD, LOCKS, setFor, statusMove, towerFoe, towerPool } from "./towerBuild.mjs";
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

/* ---------- the foes (2026-11-11, docs/BATTLE_STREAK.md 15장) ----------
   A foe is a party built for its game from the whole random pool by one of four builders that learned from the ladder's top teams
   (towerBuild.mjs). The draft still offers the ladder's species with the items they bring them with (14장). seen: the species this run
   has been shown, which a foe seldom brings again (none on a daily run). */
export const foeTeam = (random = Math.random, seen = []) => towerFoe(random, seen);
// a list of species with the newest last, each once, at most SEEN_KEPT (15.6)
const SEEN_KEPT = 36;
export const seenWith = (seen, more) => [...new Set([...(seen || []), ...more].reverse())].reverse().slice(-SEEN_KEPT);

/* A new game of the run: the seed and the computer's party drawn here (foe: the team behind the door chosen, { team }; none: a foe
   built here), and the computer's team preview already chosen. name: the trainer's, as the battle row shows it. party: the player's,
   carried from the last game (with a swap made); a screen from before the draft draws one. seen: the run's species shown (15.6); the
   foe's six are added to it (foeSeen) */
export function streakGame(name, wins, random = Math.random, party = null, foe = null, hard = false, seen = []) {
  const seed = Array.from({ length: 4 }, () => Math.floor(random() * 0x10000));
  const p1Team = party || randomTeam(STREAK_FORMAT, random, { ban: STREAK_BAN });
  const against = foe?.team ? foe : foeTeam(random, seen);
  const engine = startBattle({
    formatid: STREAK_FORMAT, seed,
    p1: { name, team: p1Team },
    p2: { name: CPU_NAME, team: against.team },
  });
  return { engine, p1Team, foeSeen: seenWith(seen, against.team.map(m => m.species)), ...computerTurns(engine, wins, undefined, random, hard) };
}

/* the doors to the next game (13장, streak.js doorsOf): a foe built for each, kept by the run until the next game is opened, and told to
   the player as species only, as a team preview shows them. The second door does not bring back the first's six. The gatekeeper's
   door shows nothing. wins: the wins before the next game; seen: the run's species shown (15.6) */
export function streakDoors(wins, random = Math.random, seen = []) {
  let known = seen || [];
  return doorsOf(wins).map(kind => {
    const foe = foeTeam(random, known);
    known = seenWith(known, foe.team.map(m => m.species));
    return { kind, team: foe.team };
  });
}
export const shownDoors = doors => (doors || []).map(d => (d.kind === "gate" ? { kind: d.kind, species: [] } : { kind: d.kind, species: d.team.map(m => m.species) }));

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

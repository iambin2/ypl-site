// Teaches the computer opponent how YPL plays: blends the sets players bring against it (public.cpu_battles, docs/db/cpu_battles.sql)
// into what it believes a Pokémon carries (src/data/random-sets.json, built by scripts/build-random-sets.mjs from the ladder).
//
// Only the player's party (p1) is read: the computer's own party is drawn from these very sets, and a player's random party is too,
// so a party whose every Pokémon is a sample set as it stands is left out.
// One person playing a lot must not tilt the computer. A record keeps no name, so a player is read from the party: parties that share
// most of their sets (the same team again, or with a Pokémon or two changed) count as one player, and each player has one vote per
// Pokémon, split among the sets they tried. The ladder stays the base: YPL's share for a Pokémon grows with how many players brought it
// and never passes RATE. A set the ladder does not have joins once MIN_SEEN players brought it. Every run starts again from the
// ladder's weights (kept as baseWeight), so it can run every week without drifting, and build-random-sets.mjs resets it all.
// ponytail: a player is guessed from party likeness; one person with many unlike teams still counts as many. An anonymous device id on
// each record (docs/db/cpu_battles.sql, the battle function, CpuRoom) is the upgrade if that is seen.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/learn-cpu-sets.mjs   (reads the records, writes random-sets.json)
//   node scripts/learn-cpu-sets.mjs --from records.json [--dry]                      (records as [{ format_id, input_log }])
// Under MIN_PLAYERS players nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Teams, toID } from "@pkmn/sim";
import { formatId, validateTeam } from "../supabase/functions/battle/engine.mjs";
import { idleMoves } from "./setFit.mjs";

export const RATE = 0.3, HALF = 20, MIN_SEEN = 3, MIN_PLAYERS = 30, NEW_PER_SPECIES = 2;

const KIND_OF = Object.fromEntries(["m-c", "m-b"].flatMap(reg => ["singles", "doubles"].map(kind => [formatId(reg, kind), [reg, kind]])));
const shape = set => `${toID(set.ability)}|${set.moves.map(toID).sort().join(",")}|${set.nature}`;
const keyOf = (ability, moves, item) => `${toID(ability)}|${moves.map(toID).sort().join(",")}|${toID(item)}`;

export function playerParty(inputLog) {
  const line = String(inputLog).split("\n").find(l => l.startsWith(">player p1 "));
  if (!line) return null;
  const team = Teams.unpack(JSON.parse(line.slice(">player p1 ".length)).team);
  return team?.length ? team : null;
}

// parties that share at least two thirds of the smaller one's sets, as one player (union-find over parties sharing a set)
function players(parties) {
  const root = parties.map((_, i) => i);
  const find = i => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
  const holders = new Map();
  parties.forEach((party, i) => {
    const shared = new Map();
    for (const key of party.keys) for (const j of holders.get(key) || []) shared.set(j, (shared.get(j) || 0) + 1);
    for (const [j, n] of shared) if (n * 3 >= Math.min(party.keys.size, parties[j].keys.size) * 2) root[find(i)] = find(j);
    for (const key of party.keys) (holders.get(key) || holders.set(key, []).get(key)).push(i);
  });
  const groups = new Map();
  parties.forEach((party, i) => (groups.get(find(i)) || groups.set(find(i), []).get(find(i))).push(party));
  return [...groups.values()];
}

/* sets: the parsed random-sets.json; records: [{ format_id, input_log }]. Returns { sets, used, players, skipped, learned } with
   sets blended in place of a copy. validate(formatid, set) says whether a new set may join. */
export function learn(sets, records, { validate = (formatid, set) => !validateTeam(formatid, [set]) } = {}) {
  const out = structuredClone(sets);
  const seen = new Set();
  const byFormat = {}; // "reg/kind" → [{ keys: Set of species|set keys, team }]
  let used = 0, skipped = 0;
  for (const record of records) {
    const where = KIND_OF[record.format_id];
    const pool = where && out[where[0]]?.[where[1]];
    let team;
    try { team = pool && playerParty(record.input_log); } catch { team = null; }
    if (!team) { skipped++; continue; }
    const dedupe = record.format_id + Teams.pack(team);
    if (seen.has(dedupe)) { skipped++; continue; }
    seen.add(dedupe);
    const bySpecies = new Map(pool.map(entry => [toID(entry.species), entry]));
    // a random party: every Pokémon is one of its sample sets as it stands (the item may be a back-up)
    if (team.every(set => bySpecies.get(toID(set.species))?.sets.some(s => !s.ypl && shape(s) === shape(set)))) { skipped++; continue; }
    team = team.filter(set => bySpecies.has(toID(set.species)) && set.moves?.length);
    if (!team.length) { skipped++; continue; }
    used++;
    (byFormat[where.join("/")] ||= []).push({ team, keys: new Set(team.map(set => `${toID(set.species)}|${shape(set)}|${toID(set.item)}`)) });
  }

  const counts = {}; // "reg/kind" → species id → { players, keys: key → { votes, players, set } }
  let playerCount = 0;
  for (const [where, parties] of Object.entries(byFormat)) {
    const book = counts[where] = {};
    for (const group of players(parties)) {
      playerCount++;
      const tried = {}; // species id → key → set
      for (const { team } of group) for (const set of team) (tried[toID(set.species)] ||= {})[keyOf(set.ability, set.moves, set.item)] = set;
      for (const [id, keys] of Object.entries(tried)) {
        const tally = book[id] ||= { players: 0, keys: {} };
        tally.players++;
        const split = 1 / Object.keys(keys).length;
        for (const [key, set] of Object.entries(keys)) {
          const k = tally.keys[key] ||= { votes: 0, players: 0, set };
          k.votes += split;
          k.players++;
        }
      }
    }
  }
  if (playerCount < MIN_PLAYERS) return { sets, used, players: playerCount, skipped, learned: false };

  for (const [where, book] of Object.entries(counts)) {
    const [reg, kind] = where.split("/");
    const formatid = formatId(reg, kind);
    for (const entry of out[reg][kind]) {
      const tally = book[toID(entry.species)];
      // back to the ladder's own sets and weights before blending again
      entry.sets = entry.sets.filter(s => !s.ypl).map(s => ({ ...s, baseWeight: s.baseWeight ?? s.weight }));
      const baseTotal = entry.sets.reduce((sum, s) => sum + s.baseWeight, 0) || 1;
      const alpha = tally ? RATE * tally.players / (tally.players + HALF) : 0;
      const share = key => (tally?.keys[key]?.votes || 0) / (tally?.players || 1);
      for (const s of entry.sets) s.weight = (1 - alpha) * s.baseWeight / baseTotal + alpha * share(keyOf(s.ability, s.moves, s.items[0]));
      if (tally) {
        const known = new Set(entry.sets.map(s => keyOf(s.ability, s.moves, s.items[0])));
        const fresh = Object.entries(tally.keys).filter(([key, k]) => k.players >= MIN_SEEN && !known.has(key)).sort((a, b) => b[1].votes - a[1].votes)
          .map(([key, { set }]) => ({ key, set: { name: "", species: entry.species, ability: set.ability, item: set.item, moves: set.moves, nature: set.nature, evs: set.evs, ...(set.ivs ? { ivs: set.ivs } : {}), level: 50 } }))
          // a set that plays as it should in this kind of battle (no Follow Me in singles, scripts/setFit.mjs)
          .filter(({ set }) => validate(formatid, set) && !idleMoves({ kind, ...set }).length).slice(0, NEW_PER_SPECIES);
        for (const { key, set } of fresh) entry.sets.push({
          weight: alpha * share(key), baseWeight: 0, ypl: true, ability: set.ability, items: [set.item],
          moves: set.moves, nature: set.nature, evs: set.evs, ...(set.ivs ? { ivs: set.ivs } : {}),
        });
      }
      const total = entry.sets.reduce((sum, s) => sum + s.weight, 0) || 1;
      for (const s of entry.sets) s.weight = Math.round(Math.max(0.01, s.weight / total) * 100) / 100;
    }
  }
  out.learned = { from: "YPL computer battles", parties: used, players: playerCount, built: new Date().toISOString().slice(0, 10) };
  return { sets: out, used, players: playerCount, skipped, learned: true };
}

export async function fetchRecords() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (or --from <file>)");
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/cpu_battles?select=format_id,input_log&order=created_at.asc&limit=1000&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`cpu_battles: ${res.status} ${await res.text()}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < 1000) return all;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const OUT = new URL("../src/data/random-sets.json", import.meta.url);
  const from = process.argv.indexOf("--from");
  const records = from > 0 ? JSON.parse(readFileSync(process.argv[from + 1], "utf8")) : await fetchRecords();
  const { sets, used, players, skipped, learned } = learn(JSON.parse(readFileSync(OUT, "utf8")), records);
  console.log(`${records.length} records, ${used} player parties used as ${players} players, ${skipped} left out (random, repeated or unreadable)`);
  if (!learned) console.log(`under ${MIN_PLAYERS} players: random-sets.json is left as it is`);
  else if (process.argv.includes("--dry")) console.log("dry run: nothing written");
  else { writeFileSync(OUT, JSON.stringify(sets)); console.log("wrote", OUT.pathname); }
}

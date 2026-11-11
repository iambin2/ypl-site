// The battle engine: Pokémon Showdown's simulator as @pkmn/sim packages it (MIT), with no database and no I/O.
// The battle function runs it bundled (npm run build:battle); tests/battleEngine.test.mjs runs this source in Node.
// Every ruling is Showdown's. This file only picks the format, carries choices in and reads the logs out.
import { Battle, Dex, TeamValidator, Teams, extractChannelMessages } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import * as championsregmb from "@pkmn/mods/championsregmb";
import { requestKey } from "../../../src/services/battleLog.js";
import RANDOM_SETS from "../../../src/data/random-sets.json" with { type: "json" };
import { BAND, MASTER_PLAN, PLAN, TIERS, balanced, ratingOf, tierOf } from "../../../src/services/partyBalance.js";
export { requestKey };

// Pinned in package.json; the deployed function runs the bundle scripts/build-battle-engine.mjs makes of this file. A battle keeps the engine it was played on, so its log can be replayed on it.
export const ENGINE = "@pkmn/sim@0.10.13 (smogon/pokemon-showdown@035c1a1f)";

const DEX = {
  "m-c": Dex.mod("champions", champions),
  "m-b": Dex.mod("championsregmb", championsregmb),
};
// The site's two battle formats per regulation (src/data/teamBuilderRegulations.js), as Showdown names them.
const FORMAT_IDS = {
  "m-c": { singles: "gen9championsbssregmc", doubles: "gen9championsvgc2026regmc" },
  "m-b": { singles: "gen9championsbssregmb", doubles: "gen9championsvgc2026regmb" },
};
const DEX_OF_FORMAT = Object.fromEntries(Object.entries(FORMAT_IDS).flatMap(([reg, ids]) => Object.values(ids).map(id => [id, DEX[reg]])));
// Deserialization finds a format through the base Dex, so it must know the modded ones too.
for (const dex of Object.values(DEX)) Dex.formats.extend(dex.formats.all().filter(f => DEX_OF_FORMAT[f.id] && !Dex.formats.get(f.id).exists));

// Showdown keeps the winner by name only, so two players with one name would both read as p1.
// The winning side's id is kept on the battle as well; it is a plain field, so it survives toJSON and fromJSON.
const showdownWin = Battle.prototype.win;
Battle.prototype.win = function (side) {
  const winner = typeof side === "string" ? this.getSide(side) : this.sides.includes(side) ? side : null;
  const ok = showdownWin.call(this, side);
  if (ok) this.winnerSide = winner?.id || "tie";
  return ok;
};

export function formatId(regulation, battleFormat) {
  const id = FORMAT_IDS[regulation]?.[battleFormat];
  if (!id) throw new Error(`unknown format: ${regulation} ${battleFormat}`);
  return id;
}

// A Mega or another battle-only form is brought as its base form and changes in battle, as in the game.
// A party still being built may leave the ability empty: the species' first ability stands in, as the game always has one.
function teamFor(formatid, sets) {
  const dex = DEX_OF_FORMAT[formatid];
  return sets.map(set => {
    const species = dex.species.get(set.species);
    const base = typeof species.battleOnly === "string" ? dex.species.get(species.battleOnly) : species;
    /* the base form keeps only an ability of its own: a Mega's (saved by the team builder before 2026-11-06) let it start with it,
       so 메가리자몽Y brought Drought's sun in on turn 0 as if it had already evolved, and the validator let it through */
    const own = Object.values(base.abilities || {});
    const ability = base !== species && set.ability && !own.some(a => dex.toID(a) === dex.toID(set.ability)) ? "" : set.ability;
    return { ...set, name: set.name || "", species: base.name, ability: ability || own[0] || "" };
  });
}

/* null when the team may battle, otherwise the reasons. A party still being built battles as it stands (the committee, 2026-11-05):
   one to six Pokémon, Showdown's own six-Pokémon minimum lifted; what is illegal is still refused by Showdown's validator.
   A Pokémon with no move cannot act at all, so it is refused here, in Korean. */
export function validateTeam(formatid, sets) {
  if (!Array.isArray(sets) || !sets.length || sets.length > 6) return ["파티는 1마리에서 6마리까지입니다."];
  const bare = sets.find(set => !(set?.moves || []).filter(Boolean).length);
  if (bare) return [`기술이 하나도 없는 포켓몬(${bare.species})이 있습니다. 기술을 하나 이상 넣어 주세요.`];
  const validator = new TeamValidator(formatid, DEX_OF_FORMAT[formatid]);
  validator.ruleTable.minTeamSize = 1;
  return validator.validateTeam(teamFor(formatid, sets));
}

/* A random party (the committee, 2026-11-05: random battles for friendlies and as a way Light events are played): six species from
   the sample sets scripts/build-random-sets.mjs builds from the ladder's usage statistics, kept to the regulation. One of each species,
   one set of each drawn by how often it is played, at most one Mega Stone, and no item twice (the item clause): a set's first item that
   is still free, from back-ups chosen for that set, so no Pokémon goes without. It is checked by the validator like any party, and drawn
   again in the rare case it is refused. meta draws the species by how often the ladder brings them (the computer's party), instead of
   every species alike. */
const KIND_OF = Object.fromEntries(Object.entries(FORMAT_IDS).flatMap(([reg, ids]) => Object.entries(ids).map(([kind, id]) => [id, [reg, kind]])));
export function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function weighted(list, random) {
  let roll = random() * list.reduce((sum, entry) => sum + entry.weight, 0);
  return list.find(entry => (roll -= entry.weight) < 0) || list[list.length - 1];
}
// the sample sets of a format's species ({ species, usage, sets }), which the computer opponent also reads as what a Pokémon may carry
export function setPool(formatid) {
  const [reg, kind] = KIND_OF[formatid] || [];
  return RANDOM_SETS[reg]?.[kind] || [];
}
// a weighted order without repeats (Efraimidis and Spirakis): each one's key is random^(1/weight), largest first
const weightedOrder = (list, weight, random) => list.map(entry => [Math.pow(random(), 1 / weight(entry)), entry]).sort((a, b) => b[0] - a[0]).map(([, entry]) => entry);
/* Every random party is balanced (docs/BATTLE_STREAK.md 11장, src/services/partyBalance.js): one species from each of six tiers of
   measured strength, and the six shares summing to within BAND of the plan's mean, so who draws what no longer decides a game.
   meta: within a tier, drawn by ladder usage, as the computer's party is. master: MASTER_PLAN, a tier up (scripts/rate-species.mjs).
   even: every species alike with no balance, as before 2026-11-09 (scripts/rate-species.mjs measures the tiers on these, and the
   computer's benchmark keeps the parties its table was measured on). top: only from the most used this many (even draws only).
   ban: { items, moves } kept out of the party (도전의 탑, streak.js STREAK_BAN): a set with a banned move is not drawn, and a banned
   item gives way to the set's next one. (도전의 탑's foes are built by towerBuild.mjs since 2026-11-11, 15장.) */
export function randomTeam(formatid, random = Math.random, { meta = false, top = 0, even = false, master = false, ban = null } = {}) {
  const all = ban ? fairPool(formatid, ban) : setPool(formatid);
  if (!all.length) throw new Error(`no random sets for ${formatid}`);
  if (!even && balanced(formatid)) {
    const team = balancedTeam(formatid, all, random, meta, master ? MASTER_PLAN : PLAN);
    if (team) return team;
  }
  const pool = top ? [...all].sort((a, b) => (b.usage || 0) - (a.usage || 0)).slice(0, top) : all;
  for (let tries = 0; tries < 30; tries++) {
    const team = drawInto(formatid, [meta ? weightedOrder(pool, e => (e.usage || 0) + 0.01, random) : shuffled(pool, random)], random);
    if (team.length === 6 && !validateTeam(formatid, team)) return team;
  }
  throw new Error(`could not draw a random party for ${formatid}`);
}
// a format's pool without what a ban names, built once for each ban (the tiers are kept for each pool, balancedTeam)
const fairPools = new Map();
export function fairPool(formatid, ban) {
  if (!fairPools.has(ban)) fairPools.set(ban, new Map());
  const made = fairPools.get(ban);
  if (!made.has(formatid)) {
    const items = new Set(ban.items), moves = new Set(ban.moves);
    made.set(formatid, setPool(formatid).map(entry => ({
      ...entry,
      sets: entry.sets.filter(set => !set.moves.some(m => moves.has(m))).map(set => ({ ...set, items: set.items.filter(i => !items.has(i)) })).filter(set => set.items.length),
    })).filter(entry => entry.sets.length));
  }
  return made.get(formatid);
}
/* one Pokémon from each list in turn (the next of the list that fits): one of each species, one set of each drawn by how often it is
   played, at most one Mega Stone, no item twice. A single list fills all six from it */
function drawInto(formatid, lists, random) {
  const dex = DEX_OF_FORMAT[formatid];
  const team = [], bases = new Set(), items = new Set();
  let mega = false;
  for (const list of lists) {
    const want = lists.length === 1 ? 6 : team.length + 1;
    for (const entry of list) {
      if (team.length >= want) break;
      const base = dex.species.get(entry.species).baseSpecies;
      if (bases.has(base)) continue;
      const sets = mega ? entry.sets.filter(set => !set.mega) : entry.sets;
      if (!sets.length) continue;
      const set = weighted(sets, random);
      const item = set.items.find(name => !items.has(name));
      if (!item) continue;
      bases.add(base);
      items.add(item);
      if (set.mega) mega = true;
      team.push({ name: "", species: entry.species, ability: set.ability, item, moves: [...set.moves], nature: set.nature, evs: { ...set.evs }, ...(set.ivs ? { ivs: { ...set.ivs } } : {}), level: 50 });
    }
  }
  return team;
}
const tierCache = new Map();
// a pool's species by tier with each tier's mean share, kept for each pool (a format's own, or its pool under a ban), not for each format
function tiersOf(formatid, all) {
  if (!tierCache.has(all)) {
    const tiers = Array.from({ length: TIERS }, () => []);
    for (const entry of all) tiers[tierOf(formatid, entry.species)].push(entry);
    const mean = tiers.map(list => list.reduce((s, e) => s + ratingOf(formatid, e.species), 0) / Math.max(1, list.length));
    tierCache.set(all, { tiers, mean });
  }
  return tierCache.get(all);
}
function balancedTeam(formatid, all, random, meta, plan) {
  const { tiers, mean } = tiersOf(formatid, all);
  if (plan.some(t => !tiers[t].length)) return null;
  const target = plan.reduce((s, t) => s + mean[t], 0);
  let best = null, bestGap = Infinity;
  for (let tries = 0; tries < 80; tries++) {
    // the tiers in a new order each time, so the one Mega a party may hold is not always the strongest tier's
    const lists = shuffled(plan, random).map(t => (meta ? weightedOrder(tiers[t], e => (e.usage || 0) + 0.01, random) : shuffled(tiers[t], random)));
    const team = drawInto(formatid, lists, random);
    if (team.length !== 6) continue;
    const gap = Math.abs(team.reduce((s, m) => s + ratingOf(formatid, m.species), 0) - target);
    if (gap > BAND && gap >= bestGap) continue;
    if (validateTeam(formatid, team)) continue;
    if (gap <= BAND) return team;
    best = team; bestGap = gap;
  }
  return best;
}

/* the party a draft's picks make (picks: one species from each tier's row, in the rows' order): the reason it cannot be, "pick" (not
   one of the row's), "mega" (a second Mega Stone), "item" (no free item left for one), "illegal" (refused by the validator), or the
   party. An item already taken goes to the set's next one, in the rows' order. */
const SPARE_ITEMS = ["Sitrus Berry", "Lum Berry", "Leftovers", "Shell Bell", "Expert Belt", "Life Orb"];
export function draftParty(formatid, offer, picks) {
  if (!Array.isArray(offer) || !Array.isArray(picks) || picks.length !== offer.length) return "pick";
  const chosen = offer.map((row, i) => row.find(c => c.species === picks[i]));
  if (chosen.some(c => !c)) return "pick";
  if (chosen.filter(c => c.mega).length > 1) return "mega";
  const used = new Set(), team = [];
  for (const c of chosen) {
    // when every item of its set is taken, an item every party may carry that is still free (1 in 1000 random picks, 2026-11-11)
    const item = c.items.find(name => !used.has(name)) || SPARE_ITEMS.find(name => !used.has(name));
    if (!item) return "item";
    used.add(item);
    const { items, mega, ...set } = c;
    team.push({ ...set, name: "", item, level: 50 });
  }
  return validateTeam(formatid, team) ? "illegal" : team;
}

function capture(battle) {
  const errors = { p1: "", p2: "" };
  battle.send = (type, data) => {
    if (type !== "sideupdate") return;
    const [side, line] = String(data).split("\n");
    if (line?.startsWith("|error|")) errors[side] = line.slice("|error|".length);
  };
  return errors;
}

export function startBattle({ formatid, seed, p1, p2 }) {
  const battle = new Battle({ formatid, seed }, DEX_OF_FORMAT[formatid]);
  capture(battle);
  battle.setPlayer("p1", { name: p1.name, team: teamFor(formatid, p1.team) });
  battle.setPlayer("p2", { name: p2.name, team: teamFor(formatid, p2.team) });
  return battle;
}

export const loadBattle = state => Battle.fromJSON(state);

// Applies the other side's waiting choice, then this one. committed means the engine ran the turn (or the team preview).
// A choice that waits for the other side is not in the state: the caller keeps it as pending and the state as it was.
// rq, when given, is requestKey of the request the player answered: a choice made on a request that has since moved on
// (a lost response sent again, a screen behind the battle) is refused as stale, never played on the next one.
// Showdown's default and auto are refused: in doubles they log a move with no target, so the input log would not replay.
// Nothing here ever chooses for a player; a player who does not choose loses by forfeit, not by an automatic choice.
export function choose(battle, pending, side, choice, rq) {
  if (rq != null && rq !== requestKey(battle.turn, battle[side]?.activeRequest)) return { ok: false, stale: true, error: "The request has changed" };
  if (/(^|,)\s*(default|auto)\s*(,|$)/i.test(String(choice))) return { ok: false, error: "[Invalid choice] Choose explicitly" };
  const errors = capture(battle);
  const before = battle.inputLog.length;
  for (const [other, waiting] of Object.entries(pending || {})) if (other !== side && waiting) battle.choose(other, waiting);
  if (!battle.choose(side, String(choice))) return { ok: false, error: errors[side] || "Invalid choice" };
  return { ok: true, committed: battle.inputLog.length > before };
}

export function forfeit(battle, side) {
  battle.lose(side);
  battle.inputLog.push(`>forcelose ${side}`);
}

// What each reader may see. Channel 0 is the spectators' log, 1 and 2 each player's (their own secrets included), -1 everything.
export function readout(battle) {
  const log = battle.log.join("\n");
  const channels = extractChannelMessages(log, [0, 1, 2]);
  const winner = !battle.ended ? null : battle.winnerSide || (battle.winner === battle.p1.name ? "p1" : battle.winner === battle.p2.name ? "p2" : "tie");
  return {
    turn: battle.turn,
    ended: battle.ended,
    winner,
    spectatorLog: channels[0].join("\n"),
    sideLog: { p1: channels[1].join("\n"), p2: channels[2].join("\n") },
    request: { p1: battle.ended ? null : battle.p1.activeRequest, p2: battle.ended ? null : battle.p2.activeRequest },
    log,
    inputLog: battle.inputLog.join("\n"),
  };
}

// Plays a stored input log again from its seed. A finished battle replays to the very log it ended with.
export function replay(inputLog) {
  const lines = String(inputLog).split("\n");
  const start = JSON.parse(lines[0].replace(/^>start /, ""));
  const battle = new Battle(start, DEX_OF_FORMAT[start.formatid]);
  for (const line of lines.slice(1)) {
    const [command, ...rest] = line.slice(1).split(" ");
    const arg = rest.join(" ");
    if (command === "player") battle.setPlayer(rest[0], JSON.parse(rest.slice(1).join(" ")));
    else if (command === "p1" || command === "p2") { if (!battle.choose(command, arg)) throw new Error(`replay refused ${line}`); }
    else if (command === "forcelose") forfeit(battle, arg);
    else if (!command.startsWith("version")) throw new Error(`replay cannot read ${line}`);
  }
  return battle;
}

// the party a side brought, read off a stored input log (the beaten party of a won 연승 도전 game, which a swap takes one from)
export function sideTeam(inputLog, side) {
  const line = String(inputLog ?? "").split("\n").find(l => l.startsWith(`>player ${side} `));
  return line ? Teams.unpack(JSON.parse(line.slice(`>player ${side} `.length)).team) || [] : [];
}

/* A finished battle with the computer, as the player's device sends it (docs/db/cpu_battles.sql): only its input log, and every fact
   kept is read off this engine replaying it. It must replay to an end, both parties must be legal, and p2 must be the computer.
   The player's name is taken out before anything is kept (a name plays no part in a battle), so the record holds no one's name.
   ponytail: nothing proves the computer chose p2's moves (the device could play both sides); a weekly count that reads these
   should weigh a record lightly, and per-device limits come when someone abuses it. */
export const CPU_NAME = "컴퓨터";
const PLAYER_NAME = "선수";
export function readCpuRecord(inputLog) {
  const sent = String(inputLog ?? "");
  if (!sent.startsWith(">start ") || sent.length > 256 * 1024) throw new Error("not a battle record");
  const text = sent.split("\n").map(line => {
    if (!line.startsWith(">player p1 ")) return line;
    const player = JSON.parse(line.slice(">player p1 ".length));
    return `>player p1 ${JSON.stringify({ ...player, name: PLAYER_NAME })}`;
  }).join("\n");
  const battle = replay(text);
  if (!battle.ended) throw new Error("the battle has not ended");
  if (battle.p2.name !== CPU_NAME) throw new Error("p2 is not the computer");
  const formatid = battle.format.id;
  for (const line of text.split("\n").filter(l => l.startsWith(">player "))) {
    const { team } = JSON.parse(line.replace(/^>player p[12] /, ""));
    const problems = validateTeam(formatid, Teams.unpack(team));
    if (problems) throw new Error(`illegal party: ${problems[0]}`);
  }
  const out = readout(battle);
  return { inputLog: text, formatid, winner: out.winner, endedBy: /^>forcelose /m.test(text) ? "forfeit" : "battle", turns: battle.turn };
}

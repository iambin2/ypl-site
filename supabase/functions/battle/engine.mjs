// The battle engine: Pokémon Showdown's simulator as @pkmn/sim packages it (MIT), with no database and no I/O.
// The battle function runs it bundled (npm run build:battle); tests/battleEngine.test.mjs runs this source in Node.
// Every ruling is Showdown's. This file only picks the format, carries choices in and reads the logs out.
import { Battle, Dex, TeamValidator, extractChannelMessages } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import * as championsregmb from "@pkmn/mods/championsregmb";
import { requestKey } from "../../../src/services/battleLog.js";
import RANDOM_SETS from "../../../src/data/random-sets.json" with { type: "json" };
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
    return { ...set, name: set.name || "", species: base.name, ability: set.ability || base.abilities?.[0] || "" };
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
   Showdown's gen 9 random battle sets kept to the regulation (scripts/build-random-sets.mjs), one of each species, no item twice
   (the item clause), a role of each, four of its moves, and points and a nature for how it attacks. It is checked by the
   validator like any party, and drawn again in the rare case it is refused. */
const KIND_OF = Object.fromEntries(Object.entries(FORMAT_IDS).flatMap(([reg, ids]) => Object.entries(ids).map(([kind, id]) => [id, [reg, kind]])));
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function randomTeam(formatid, random = Math.random) {
  const [reg, kind] = KIND_OF[formatid] || [];
  const pool = RANDOM_SETS[reg]?.[kind];
  if (!pool?.length) throw new Error(`no random sets for ${formatid}`);
  const dex = DEX_OF_FORMAT[formatid];
  const pick = list => list[Math.floor(random() * list.length)];
  for (let tries = 0; tries < 30; tries++) {
    const team = [], bases = new Set(), items = new Set();
    for (const entry of shuffled(pool, random)) {
      if (team.length === 6) break;
      const base = dex.species.get(entry.species).baseSpecies;
      if (bases.has(base)) continue;
      const role = pick(entry.roles);
      const item = shuffled(role.items, random).find(name => !items.has(name)) || "";
      const moves = shuffled(role.moves, random).slice(0, 4);
      const count = category => moves.filter(move => dex.moves.get(move).category === category).length;
      const stat = count("Physical") >= count("Special") ? "atk" : "spa";
      bases.add(base);
      if (item) items.add(item);
      team.push({ name: "", species: entry.species, ability: pick(role.abilities), item, moves, nature: stat === "atk" ? "Adamant" : "Modest", evs: { hp: 2, [stat]: 32, spe: 32 }, level: 50 });
    }
    if (team.length === 6 && !validateTeam(formatid, team)) return team;
  }
  throw new Error(`could not draw a random party for ${formatid}`);
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

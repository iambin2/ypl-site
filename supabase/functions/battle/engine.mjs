// The battle engine: Pokémon Showdown's simulator as @pkmn/sim packages it (MIT), with no database and no I/O.
// The battle function runs it bundled (npm run build:battle); tests/battleEngine.test.mjs runs this source in Node.
// Every ruling is Showdown's. This file only picks the format, carries choices in and reads the logs out.
import { Battle, Dex, TeamValidator, extractChannelMessages } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import * as championsregmb from "@pkmn/mods/championsregmb";
import { requestKey } from "../../../src/services/battleLog.js";
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

export function formatId(regulation, battleFormat) {
  const id = FORMAT_IDS[regulation]?.[battleFormat];
  if (!id) throw new Error(`unknown format: ${regulation} ${battleFormat}`);
  return id;
}

// A Mega or another battle-only form is brought as its base form and changes in battle, as in the game.
function teamFor(formatid, sets) {
  const dex = DEX_OF_FORMAT[formatid];
  return sets.map(set => {
    const species = dex.species.get(set.species);
    return { ...set, name: set.name || "", species: typeof species.battleOnly === "string" ? species.battleOnly : species.name };
  });
}

// null when the team is legal for the format, otherwise Showdown's reasons.
export function validateTeam(formatid, sets) {
  if (!Array.isArray(sets) || !sets.length || sets.length > 6) return ["A team is one to six Pokémon."];
  return new TeamValidator(formatid, DEX_OF_FORMAT[formatid]).validateTeam(teamFor(formatid, sets));
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
  const winner = !battle.ended ? null : battle.winner === battle.p1.name ? "p1" : battle.winner === battle.p2.name ? "p2" : "tie";
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

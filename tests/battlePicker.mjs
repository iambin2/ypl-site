// A player for the engine tests who reads only its request, as the site's screen does (the engine refuses Showdown's default).
import { revives, slotPasses } from "../src/services/battleLog.js";

// a team preview or a forced switch answered as the site's screen answers it (the engine refuses Showdown's default)
export function explicit(request) {
  const mons = request.side.pokemon;
  if (request.teamPreview) return `team ${mons.slice(0, request.maxChosenTeamSize || mons.length).map((_, i) => i + 1).join(", ")}`;
  const free = mons.map((m, i) => (!m.active && !m.condition.endsWith(" fnt") ? i + 1 : 0)).filter(Boolean);
  const fainted = mons.map((m, i) => (!m.active && m.condition.endsWith(" fnt") ? i + 1 : 0)).filter(Boolean);
  // Revival Blessing names a fainted one
  return request.forceSwitch.map((_, i) => (slotPasses(request, i) ? "pass" : `switch ${(revives(request, i) ? fainted : free).shift()}`)).join(", ");
}

// A player who reads only its request, as the site's screen does: a legal move with an explicit target.
export function picker(seed) {
  let s = seed;
  const rand = n => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) % n; };
  return (request, gameType) => {
    if (request.teamPreview || request.forceSwitch) return explicit(request);
    return request.active.map((active, i) => {
      const mon = request.side.pokemon[i];
      if (!mon || mon.condition.endsWith(" fnt") || active.commanding) return "pass";
      const usable = active.moves.map((m, j) => ({ m, j })).filter(x => !x.m.disabled);
      const { m, j } = usable.length ? usable[rand(usable.length)] : { m: active.moves[0], j: 0 };
      let target = "";
      if (gameType === "doubles" && ["normal", "any", "adjacentFoe"].includes(m.target)) target = ` ${rand(2) + 1}`;
      else if (gameType === "doubles" && m.target === "adjacentAlly") target = ` -${2 - i}`;
      else if (gameType === "doubles" && m.target === "adjacentAllyOrSelf") target = ` -${i + 1}`;
      return `move ${j + 1}${target}`;
    }).join(", ");
  };
}


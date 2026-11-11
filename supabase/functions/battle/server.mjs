// What the battle function needs, bundled into one file by scripts/build-battle-engine.mjs: the engine, and the same bracket
// winner calculation the operator's screen runs (src/services/bracketWinnerPlan.js), so a battle applies its winner exactly as
// an operator would.
export * from "./engine.mjs";
export { planMatchWinner, planTeamSeries, projectRuntimeFacts } from "../../../src/services/bracketWinnerPlan.js";
// a team match played bout by bout (src/services/teamBouts.js): its series goes in once every bout has a winner
export { parseBoutKey, seriesFromBouts, teamBouts } from "../../../src/services/teamBouts.js";
// the 연승 도전's computer (docs/BATTLE_STREAK.md): the same computer the phones play, made afresh for each choice from its memory
export { STREAK_FORMAT, computerTurns, shownDoors, streakDoors, streakGame } from "./streakEngine.mjs";
export { STREAK_BAN, STREAK_DRAFT, STREAK_REGULATION, seeded, streakFresh, streakMaster, streakRelights, swapParty } from "../../../src/services/streak.js";

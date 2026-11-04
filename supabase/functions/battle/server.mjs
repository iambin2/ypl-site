// What the battle function needs, bundled into one file by scripts/build-battle-engine.mjs: the engine, and the same bracket
// winner calculation the operator's screen runs (src/services/bracketWinnerPlan.js), so a battle applies its winner exactly as
// an operator would.
export * from "./engine.mjs";
export { planMatchWinner, projectRuntimeFacts } from "../../../src/services/bracketWinnerPlan.js";

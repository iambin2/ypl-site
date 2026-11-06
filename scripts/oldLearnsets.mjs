// Every older generation's learnsets and event legality: half the engine's size, and read only by the team validator, while
// 포켓몬 챔피언스 brings its own full learnsets (@pkmn/mods/champions). Both bundles of the engine leave them out: the battle
// function's (scripts/build-battle-engine.mjs, esbuild) and the computer battle's worker (vite.config.js, Rollup).
// The validator passed and refused exactly as the full engine on 8000 checks without them (2026-11-04).
export const OLD_LEARNSETS = /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/](mods[\\/]gen(2|6|8|8bdsp|8legends)[\\/])?(learnsets|legality)\.mjs$/;
export const emptyFor = path => (/legality\.mjs$/.test(path) ? "export const Legality = {};" : "export const Learnsets = {};");

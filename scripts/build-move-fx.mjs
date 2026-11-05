// Writes src/data/move-fx.json: every Champions move's staging script (scripts/move-anims.mjs, written from the game's own move
// descriptions), which src/pages/battle/moveFx.js plays. Rerun after editing move-anims.mjs: node scripts/build-move-fx.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ANIMS } from "./move-anims.mjs";

const OUT = fileURLToPath(new URL("../src/data/move-fx.json", import.meta.url));
writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(ANIMS).sort(([a], [b]) => a.localeCompare(b)))) + "\n");
console.log(`${OUT}: ${Object.keys(ANIMS).length} moves`);

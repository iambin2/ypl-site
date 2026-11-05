// Every move a Pokémon can know in Champions has a staging script (scripts/move-anims.mjs, from the game's own move description),
// and every verb, mark and projectile in those scripts is one moveFx.js draws (DESIGN.md "Battle", What the stage plays).
// A word moveFx.js does not know would quietly fall back to a plain flight, so a typo shows here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANIMS } from "../scripts/move-anims.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const data = JSON.parse(read("src/data/champions-data.json"));
const built = JSON.parse(read("src/data/move-fx.json"));
const source = read("src/pages/battle/moveFx.js");
const verbs = new Set([...source.matchAll(/\bD\.(\w+) =/g)].map(m => m[1]));
const block = name => source.slice(source.indexOf(`const ${name} = {`), source.indexOf("};", source.indexOf(`const ${name} = {`)));
const marks = new Set([...block("MARKS").matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]).concat(["body", "fang", "claw", "slash", "cross"]));
const shots = new Set([...block("SHOT").matchAll(/\b(\w+): \[/g)].map(m => m[1]));

test("every Champions move has a staging script, and move-fx.json is built from move-anims.mjs", () => {
  const learnable = [...new Set(Object.values(data.learnsets).flat())].filter(id => data.moves[id]);
  assert.ok(learnable.length > 400);
  assert.deepEqual(learnable.filter(id => !ANIMS[id]), [], "moves with no script in scripts/move-anims.mjs");
  assert.deepEqual(built, Object.fromEntries(Object.entries(ANIMS).sort(([a], [b]) => a.localeCompare(b))), "rerun node scripts/build-move-fx.mjs");
});

test("every verb, mark and projectile in the scripts is drawn by moveFx.js", () => {
  const unknown = [];
  for (const [id, script] of Object.entries(ANIMS)) for (const phase of script.split(" then ")) {
    const [verb, noun] = phase.trim().split(/\s+/);
    if (!verbs.has(verb)) unknown.push(`${id}: verb ${verb}`);
    if (verb === "hit" && noun && !marks.has(noun)) unknown.push(`${id}: mark ${noun}`);
    if ((verb === "shoot" || verb === "rain") && noun && !shots.has(noun)) unknown.push(`${id}: shape ${noun}`);
  }
  assert.deepEqual(unknown, []);
});

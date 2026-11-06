// The battle's sound (DESIGN.md "Battle", Sound): every sound the stage names exists, every type lands with its own sound, and every
// verb a move's script uses makes a sound, through its drawing, its gesture or the event it sets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIBRARY, VERB_SOUNDS, EVENT_VERBS, TYPE_HIT } from "../src/pages/battle/sfx.js";

const read = f => readFileSync(new URL(`../src/pages/battle/${f}`, import.meta.url), "utf8");
const TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

test("every named sound is in the library", () => {
  const files = ["stageFx.js", "moveFx.js", "Stage.jsx", "sfx.js", "../BattlePage.jsx"].map(read).join("\n");
  const named = [...files.matchAll(/\bsfx\(\s*"([A-Za-z_]+)"/g)].map(m => m[1]);
  assert.ok(named.length > 40);
  for (const n of [...named, ...Object.values(VERB_SOUNDS), "st_brn", "st_par", "st_psn", "st_slp", "st_frz", "rain", "sun", "sand", "snow", "win", "lose", "draw"]) assert.ok(LIBRARY[n], `no sound "${n}"`);
});

test("every type lands with its own sound", () => {
  for (const t of TYPES) assert.equal(typeof TYPE_HIT[t], "function", t);
});

test("every verb of every move sounds", () => {
  const src = read("moveFx.js");
  const loud = /\b(charge|aura|lunge|fly|stream|fallOn|beamStrip|boltStrip|slashStrip|pathStrip|orbs|quake|heal|boost|ailment|sway|morph|leave|gatherUp|underneath|dropOnto|sfx)\(|\bD\.\w+\(/;
  const bodies = Object.fromEntries(src.split(/\n {2}D\.(\w+) = /).slice(1).reduce((out, part, i, all) => (i % 2 ? out : [...out, [part, all[i + 1].split(/\n {2}(?:D\.|const \w+ = \(|function |\/\/ |\/\*)/)[0]]]), []));
  const moves = JSON.parse(readFileSync(new URL("../src/data/move-fx.json", import.meta.url), "utf8"));
  const verbs = new Set(Object.values(moves).flatMap(s => s.split(" then ").map(p => p.trim().split(/\s+/)[0])));
  for (const v of verbs) {
    assert.ok(bodies[v] !== undefined, `verb "${v}" is not drawn`);
    assert.ok(loud.test(bodies[v]) || VERB_SOUNDS[v] || EVENT_VERBS.includes(v), `verb "${v}" makes no sound`);
  }
});

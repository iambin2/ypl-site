import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePokedex } from "../src/services/championsData.js";
import { showdownSpriteUrl } from "../src/services/hallOfFamePresentation.js";

// Showdown's layout: one tab before an entry's id, two before its fields
const source = String.raw`export const Pokedex = {
	sirfetchd: {
		num: 865,
		name: "Sirfetch’d",
		types: ["Fighting"],
		baseStats: {hp: 62, atk: 135, def: 95, spa: 68, spd: 82, spe: 65},
		abilities: {0: "Steadfast", H: "Scrappy"},
	},
};`;

test("escapes in the TypeScript source are read as the letters they stand for", () => {
  const { sirfetchd } = parsePokedex(source);
  assert.equal(sirfetchd.name, "Sirfetch’d");
  assert.match(showdownSpriteUrl(sirfetchd), /\/sirfetchd\.webp$/);
});

test("the shipped data holds no escape left as letters", () => {
  assert.equal(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8").includes("\\\\u"), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDirectoryJson } from "../scripts/build-champions-data.mjs";

test("concurrent directories preserve localized values and independent maps from one small request", async t => {
  const bundle = JSON.stringify({ pikachu: [25, "Pikachu", "Pikachu", "", "피카츄"] });
  const urls = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async url => {
    urls.push(String(url));
    await new Promise(resolve => setImmediate(resolve));
    if (fail) return { ok: false, status: 503 };
    return { ok: true, text: async () => bundle };
  });
  // A fresh module instance so the shared request starts cold.
  const { loadRecordsPokemonDirectory: load } = await import(`../src/services/recordsPokemon.js?directory-test=${Date.now()}`);

  fail = true;
  await assert.rejects(load(), /503/);
  fail = false;
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(urls.length, 2);
  // The names only, never the 822 KB battle data.
  assert.match(urls[1], /\/src\/data\/records-pokemon\.json$/);
  assert.deepEqual(first, second);
  assert.deepEqual(first.get("pikachu"), { pokemonId: "pikachu", dexNumber: 25, canonicalName: "Pikachu", baseSpecies: "Pikachu", forme: "", displayName: "피카츄" });
  first.get("pikachu").displayName = "caller mutation";
  assert.equal(second.get("pikachu").displayName, "피카츄");
  assert.equal((await load()).get("pikachu").displayName, "피카츄");
  assert.equal(urls.length, 2);
});

test("the committed directory is what the code builds from the committed bundle (npm run data:directory)", () => {
  const read = name => readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8");
  assert.equal(read("records-pokemon.json"), buildDirectoryJson(JSON.parse(read("champions-data.json"))));
});

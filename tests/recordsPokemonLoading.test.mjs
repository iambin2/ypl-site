import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("concurrent directories preserve localized values and independent maps from one data request", async t => {
  const bundle = JSON.stringify({
    pokedex: { pikachu: { id: "pikachu", num: 25, name: "Pikachu", baseSpecies: "Pikachu", forme: "", types: ["Electric"], abilities: ["Static"] } },
    learnsets: {},
    moves: {},
    items: {},
    speciesNames: { koreanById: { 25: "피카츄" }, koreanByEnglish: { pikachu: "피카츄" } },
  });
  let requests = 0;
  let fail = false;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    await new Promise(resolve => setImmediate(resolve));
    if (fail) return { ok: false, status: 503 };
    return { ok: true, text: async () => bundle };
  });
  // Fresh module instances so the shared request starts cold.
  const source = readFileSync(new URL("../src/services/recordsPokemon.js", import.meta.url), "utf8")
    .replace('"./championsData.js"', JSON.stringify(new URL(`../src/services/championsData.js?directory-test=${Date.now()}`, import.meta.url).href))
    .replace(/"(\.\.?\/[^"]+\.js)"/g, (_, path) => JSON.stringify(new URL(path, new URL("../src/services/", import.meta.url)).href));
  const { loadRecordsPokemonDirectory: load } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

  fail = true;
  await assert.rejects(load(), /503/);
  fail = false;
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(requests, 2);
  assert.deepEqual(first, second);
  assert.equal(first.get("pikachu").displayName, "피카츄");
  first.get("pikachu").displayName = "caller mutation";
  assert.equal(second.get("pikachu").displayName, "피카츄");
  assert.equal((await load()).get("pikachu").displayName, "피카츄");
  assert.equal(requests, 2);
});

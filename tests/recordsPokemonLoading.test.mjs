import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("concurrent directories preserve localized values and independent maps without a persistent cache", async t => {
  let requests = 0;
  const pokedex = '\tpikachu: {\n\t\tname: "Pikachu",\n\t\tnum: 25,\n\t\ttypes: ["Electric"],\n\t\tbaseStats: {hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90},\n\t\tabilities: {0: "Static"},\n\t},';
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem() { throw new Error("blocked"); } } });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });
  let fail = false;
  t.mock.method(globalThis, "fetch", async url => {
    requests++;
    await new Promise(resolve => setImmediate(resolve));
    if (fail) return { ok: false, status: 503 };
    return { ok: true, text: async () => String(url).endsWith(".csv")
      ? "pokemon_species_id,local_language_id,name,genus\n25,9,Pikachu,Mouse\n25,3,피카츄,쥐\n"
      : pokedex };
  });
  const source = readFileSync(new URL("../src/services/recordsPokemon.js", import.meta.url), "utf8")
    .replace('"./championsData.js"', JSON.stringify(new URL(`../src/services/championsData.js?directory-test=${Date.now()}`, import.meta.url).href));
  const { loadRecordsPokemonDirectory: load } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(requests, 7);
  assert.deepEqual(first, second);
  assert.equal(first.get("pikachu").displayName, "피카츄");
  first.get("pikachu").displayName = "caller mutation";
  assert.equal(second.get("pikachu").displayName, "피카츄");
  const before = requests;
  assert.equal((await load()).get("pikachu").displayName, "피카츄");
  assert.equal(requests - before, 7);
  fail = true;
  await assert.rejects(load(), /503/);
  await new Promise(resolve => setImmediate(resolve));
  fail = false;
  assert.equal((await load()).get("pikachu").displayName, "피카츄");
});

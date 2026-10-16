import assert from "node:assert/strict";
import test from "node:test";

const bundle = JSON.stringify({
  pokedex: { pikachu: { id: "pikachu", num: 25, name: "Pikachu", types: ["Electric"], abilities: ["Static"] } },
  learnsets: { pikachu: ["thunderbolt"] },
  moves: { thunderbolt: { id: "thunderbolt", name: "Thunderbolt", type: "Electric", basePower: 90 } },
  items: { leftovers: { id: "leftovers", name: "Leftovers", isNonstandard: null } },
  speciesNames: { koreanById: { 25: "피카츄" }, koreanByEnglish: { pikachu: "피카츄" } },
});

async function setup(t, { storage = new Map() } = {}) {
  const urls = [];
  let fail = false;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });
  // Object.keys(localStorage) lists stored keys in browsers; a plain object does the same here.
  const localStorage = Object.fromEntries(storage);
  Object.defineProperty(localStorage, "removeItem", { value: key => { delete localStorage[key]; } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
  t.mock.method(globalThis, "fetch", async url => {
    urls.push(String(url));
    await new Promise(resolve => setImmediate(resolve));
    if (fail) throw new Error("offline");
    return { ok: true, text: async () => bundle };
  });
  const module = await import(`../src/services/championsData.js?loading-test=${Date.now()}-${Math.random()}`);
  return { ...module, localStorage, urls, setFail(value) { fail = value; } };
}

test("quoted names keep apostrophes inside double quotes", async () => {
  const { parsePokedex } = await import("../src/services/championsData.js");
  const dex = parsePokedex('\toricoriopau: {\n\t\tname: "Oricorio-Pa\'u",\n\t\tnum: 741,\n\t\tabilities: {0: "Mind\'s Eye", 1: \'Static\'},\n\t},');
  assert.equal(dex.oricoriopau.name, "Oricorio-Pa'u");
  assert.deepEqual(dex.oricoriopau.abilities, ["Mind's Eye", "Static"]);
});

test("details and Korean names come from one same-origin file, fetched once, with isolated return values", async t => {
  const loader = await setup(t);
  const [first, names] = await Promise.all([loader.load(), loader.loadSpeciesNames()]);
  assert.equal(loader.urls.length, 1);
  assert.match(loader.urls[0], /\/src\/data\/champions-data\.json$/);
  assert.doesNotMatch(loader.urls[0], /githubusercontent/);
  assert.deepEqual(Object.keys(first), ["pokedex", "learnsets", "moves", "items"]);
  assert.equal(names.koreanByEnglish.get("pikachu"), "피카츄");
  assert.equal(names.koreanById.get("25"), "피카츄");
  first.pokedex.pikachu.name = "changed by caller";
  assert.equal((await loader.load()).pokedex.pikachu.name, "Pikachu");
  assert.equal(loader.urls.length, 1);
});

test("details retry after a failed request", async t => {
  const loader = await setup(t);
  loader.setFail(true);
  await assert.rejects(loader.load(), /offline/);
  loader.setFail(false);
  assert.equal((await loader.load()).pokedex.pikachu.num, 25);
  assert.equal(loader.urls.length, 2);
});

test("concurrent callers retain independent mutable detail objects", async t => {
  const loader = await setup(t);
  const [first, second] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(loader.urls.length, 1);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  first.pokedex.pikachu.name = "caller mutation";
  assert.equal(second.pokedex.pikachu.name, "Pikachu");
});

test("the retired localStorage source caches are removed", async t => {
  const loader = await setup(t, { storage: new Map([
    ["ypl-champions-data-v6", "{}"],
    ["ypl-champions-data-v7", "{}"],
    ["ypl-team-builder", "keep"],
  ]) });
  assert.deepEqual(Object.keys(loader.localStorage), ["ypl-team-builder"]);
});

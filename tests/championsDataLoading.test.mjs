import assert from "node:assert/strict";
import test from "node:test";

const pokedex = '\tpikachu: {\n\t\tname: "Pikachu",\n\t\tnum: 25,\n\t\ttypes: ["Electric"],\n\t\tbaseStats: {hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90},\n\t\tabilities: {0: "Static"},\n\t},';
async function setup(t, { blocked = false } = {}) {
  const cache = new Map();
  let requests = 0, fail = false;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key) { if (blocked) throw new Error("blocked"); return cache.get(key) || null; },
    setItem(key, value) { if (blocked) throw new Error("blocked"); cache.set(key, value); },
  } });
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    await new Promise(resolve => setImmediate(resolve));
    if (fail) throw new Error("offline");
    return { ok: true, text: async () => pokedex };
  });
  const module = await import(`../src/services/championsData.js?loading-test=${Date.now()}-${Math.random()}`);
  return { ...module, cache, count: () => requests, setFail(value) { fail = value; } };
}

test("cold details use six sources, preserve twelve-hour cache and isolated return values", async t => {
  const loader = await setup(t);
  const first = await loader.load();
  assert.equal(loader.count(), 6);
  assert.equal(first.pokedex.pikachu.name, "Pikachu");
  first.pokedex.pikachu.name = "changed by caller";
  assert.equal((await loader.load()).pokedex.pikachu.name, "Pikachu");
  assert.equal(loader.count(), 6);
  const [key, raw] = [...loader.cache][0];
  loader.cache.set(key, JSON.stringify({ ...JSON.parse(raw), savedAt: Date.now() - 12 * 60 * 60 * 1000 - 1 }));
  await loader.load();
  assert.equal(loader.count(), 12);
});

test("details work with blocked storage and retry after failure", async t => {
  const loader = await setup(t, { blocked: true });
  loader.setFail(true);
  await assert.rejects(loader.load(), /offline/);
  // Let every failed source settle before changing the simulated network.
  await new Promise(resolve => setImmediate(resolve));
  loader.setFail(false);
  assert.equal((await loader.load()).pokedex.pikachu.num, 25);
  const before = loader.count();
  await loader.load();
  assert.equal(loader.count() - before, 6);
});

test("concurrent cold callers retain independent mutable detail objects", async t => {
  const loader = await setup(t, { blocked: true });
  const [first, second] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(loader.count(), 6);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  first.pokedex.pikachu.name = "caller mutation";
  assert.equal(second.pokedex.pikachu.name, "Pikachu");
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { APP_VIEWS, readInitialAppView, builderRouteSearch, bracketRouteSearch } from "../src/services/appRouting.js";

// Capture the original App helpers before relocating them. The golden digest
// covers all names and complete data URLs, not only image count or dimensions.
const imageModule = new URL("../src/services/legacyPartyImages.js", import.meta.url);
async function imageHelpers() {
  if (existsSync(imageModule)) return import(imageModule.href);
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const table = app.slice(app.indexOf("let __POKE_CACHE"), app.indexOf("/* ============================== 시드"));
  const normalize = app.match(/^function normTeam\(team\).*$/m)?.[0];
  const context = {};
  vm.runInNewContext(`${table}\n${normalize}\nglobalThis.helpers={pokeImgTable,pokeImg,normTeam};`, context);
  return context.helpers;
}

test("all nine direct views and invalid view fallback preserve routing", () => {
  assert.deepEqual([...APP_VIEWS].sort(), ["about", "board", "bracket", "builder", "champions", "home", "news", "records", "titles"]);
  for (const view of APP_VIEWS) assert.equal(readInitialAppView(`?view=${view}&eventId=event-1`), view);
  for (const search of ["", "?view=unknown", "?view=", "?view=HOME"]) assert.equal(readInitialAppView(search), "home");
  for (const route of [builderRouteSearch, bracketRouteSearch]) {
    const params = new URLSearchParams(route("event / 한글", "?keep=yes&__ypl_v=old"));
    assert.equal(params.get("eventId"), "event / 한글");
    assert.equal(params.get("keep"), "yes");
    assert.equal(params.get("__ypl_v"), "old");
    assert.equal(new URLSearchParams(route(null, params.toString())).has("eventId"), false);
  }
});

test("legacy image lookup preserves all 30 original data URLs and singleton identity", async () => {
  const { pokeImgTable, pokeImg } = await imageHelpers();
  const table = pokeImgTable();
  assert.equal(table, pokeImgTable());
  assert.equal(Object.keys(table).length, 30);
  assert.equal(createHash("sha256").update(JSON.stringify(table)).digest("hex"),
    "bc7134aa1976324c421f220c570d47375932aa7482cf59039edb43641a376d49");
  for (const [name, image] of Object.entries(table)) assert.equal(pokeImg(name), image);
  for (const name of ["", null, undefined, "missing"]) assert.equal(pokeImg(name), "");
});

test("legacy party normalization preserves custom images, aliases, and editor save payload", async () => {
  const { normTeam, pokeImg } = await imageHelpers();
  const input = ["픽시", { name: "픽시", img: "data:image/png;base64,custom", pokemon_id: "clefable" }, null, { name: "missing" }];
  const before = JSON.stringify(input);
  const normalized = JSON.parse(JSON.stringify(normTeam(input)));
  assert.deepEqual(normalized, [
    { name: "픽시", img: pokeImg("픽시"), pokemonId: "" },
    { name: "픽시", img: "data:image/png;base64,custom", pokemonId: "clefable" },
    { name: "", img: "", pokemonId: "" },
    { name: "missing", img: "", pokemonId: "" },
  ]);
  const saved = normalized.filter(m => m.name.trim() || m.img).map(m => ({ name: m.name.trim(), img: m.img || "" }));
  assert.equal(JSON.stringify(saved), JSON.stringify([
    { name: "픽시", img: pokeImg("픽시") },
    { name: "픽시", img: "data:image/png;base64,custom" },
    { name: "missing", img: "" },
  ]));
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(normTeam(undefined)), "[]");
});

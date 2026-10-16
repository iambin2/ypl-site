import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import config from "../vite.config.js";

test("production version check preserves base, query, one-shot fetch and reload guard", async () => {
  const build = config({ command: "build" });
  assert.equal(build.base, "/ypl-site/");
  const plugin = build.plugins.find(p => p.name === "ypl-production-version");
  plugin.configResolved({ base: build.base });
  let asset;
  plugin.generateBundle.call({ emitFile(value) { asset = value; } });
  assert.equal(asset.fileName, "version.json");
  const version = JSON.parse(asset.source).version;
  const [{ children: script, injectTo }] = plugin.transformIndexHtml();
  assert.equal(injectTo, "head-prepend");
  assert.equal(config({ command: "serve" }).plugins.some(p => p.name === plugin.name), false);
  for (const scenario of ["same", "new", "guard", "failed", "invalid", "timeout"]) {
    const requests = [], replaced = [], timers = [];
    const location = {
      origin: "https://example.test",
      href: `https://example.test/ypl-site/?view=bracket&eventId=event-1&keep=yes${scenario === "guard" ? "&__ypl_v=next" : ""}`,
      replace(value) { replaced.push(value); },
    };
    vm.runInNewContext(script, {
      URL, AbortController, location,
      setTimeout(callback, delay) { timers.push({ callback, delay }); return 1; },
      clearTimeout() {},
      fetch: async (url, options) => {
        requests.push({ url: String(url), options });
        if (scenario === "failed" || scenario === "timeout") throw new Error(scenario);
        return { ok: true, json: async () => ({ version: scenario === "same" ? version : scenario === "invalid" ? null : "next" }) };
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url).pathname, "/ypl-site/version.json");
    assert.equal(requests[0].options.cache, "no-store");
    assert.equal(timers[0].delay, 3000);
    timers[0].callback();
    assert.equal(requests[0].options.signal.aborted, true);
    assert.equal(replaced.length, scenario === "new" ? 1 : 0);
    if (replaced.length) {
      const next = new URL(replaced[0]);
      assert.equal(next.searchParams.get("view"), "bracket");
      assert.equal(next.searchParams.get("eventId"), "event-1");
      assert.equal(next.searchParams.get("keep"), "yes");
      assert.equal(next.searchParams.get("__ypl_v"), "next");
    }
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { transformSync } from "esbuild";

// Transform JSX with the already-installed build tool; no new test dependency.
function loadJsx(file) {
  const module = { exports: {} };
  const require = createRequire(file);
  const { code } = transformSync(readFileSync(file, "utf8"), { loader: "jsx", format: "cjs" });
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => name.endsWith(".jsx") ? loadJsx(path.resolve(path.dirname(file), name)) : require(name),
  });
  return module.exports;
}
const { default: LazyContent } = loadJsx(fileURLToPath(new URL("../src/components/common/LazyContent.jsx", import.meta.url)));

test("deferred content renders existing children without an extra visible wrapper", () => {
  const html = renderToString(React.createElement(LazyContent, null, React.createElement("h2", null, "기록")));
  assert.ok(html.includes("<h2>기록</h2>"));
  assert.ok(!html.includes("불러오는 중"));
});

test("pending page has a live loading state and rejected chunk offers a reload", () => {
  const Pending = React.lazy(() => new Promise(() => {}));
  const html = renderToString(React.createElement(LazyContent, null, React.createElement(Pending)));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes("불러오는 중"));
  const boundary = new LazyContent({ children: null });
  boundary.state = LazyContent.getDerivedStateFromError(new Error("chunk failed"));
  const error = renderToString(boundary.render());
  assert.ok(error.includes('role="alert"'));
  assert.ok(error.includes("새로고침"));
});

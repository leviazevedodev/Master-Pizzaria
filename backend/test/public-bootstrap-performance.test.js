import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("bootstrap público consolida o carregamento e usa cache curto", async () => {
  const server = await source("../src/server.js");

  assert.match(server, /app\.get\("\/api\/public\/bootstrap"/);
  assert.match(server, /const publicBootstrapCache = createAsyncTtlCache/);
  assert.match(server, /ttlMs: 10_000/);
  assert.match(server, /availableProducts: products/);
  assert.match(server, /stale-while-revalidate=50/);
  assert.match(server, /Server-Timing/);
});

test("endpoints públicos antigos continuam disponíveis", async () => {
  const server = await source("../src/server.js");

  for (const path of [
    "/api/settings",
    "/api/store-hours",
    "/api/categories",
    "/api/subcategories",
    "/api/products",
    "/api/promotions",
    "/api/highlights",
  ]) {
    assert.match(server, new RegExp(`app\\.get\\("${path.replaceAll("/", "\\/")}"`));
  }
});

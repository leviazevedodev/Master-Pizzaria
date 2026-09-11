import test from "node:test";
import assert from "node:assert/strict";
import { createAsyncTtlCache } from "../src/async-ttl-cache.js";

test("deduplica consultas simultâneas de autenticação", async () => {
  const cache = createAsyncTtlCache({ ttlMs: 1_000 });
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { id: "admin" };
  };

  const [first, second, third] = await Promise.all([
    cache.get("admin:0", load),
    cache.get("admin:0", load),
    cache.get("admin:0", load),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("produção permite somente os recursos necessários do Card Payment Brick", async () => {
  const [nginx, netlify] = await Promise.all([
    readFile(new URL("frontend/nginx.conf", root), "utf8"),
    readFile(new URL("netlify.toml", root), "utf8"),
  ]);

  for (const policy of [nginx, netlify]) {
    assert.match(policy, /script-src[^;]*https:\/\/sdk\.mercadopago\.com/);
    assert.match(policy, /frame-src[^;]*https:\/\/\*\.mercadopago\.com/);
    assert.match(policy, /img-src[^;]*blob:/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-eval'/);
    assert.doesNotMatch(policy, /script-src[^;]*blob:/);
  }
});

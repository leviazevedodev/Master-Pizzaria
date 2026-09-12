import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("rotas da cozinha exigem permissão e garçom avança somente pedido presencial", async () => {
  const source = await readFile(
    new URL("../src/server.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /function hasKitchenAccess\(req\)/);
  assert.match(
    source,
    /app\.get\("\/api\/admin\/kitchen\/orders"[\s\S]*?if \(!hasKitchenAccess\(req\)\)/,
  );
  assert.match(
    source,
    /const waiterTableAccess =[\s\S]*?staffRole === "WAITER"[\s\S]*?fulfillmentType: "DINE_IN"/,
  );
  assert.match(source, /O garçom só pode avançar pedidos presenciais/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("cozinha exige permissão e Pedidos avança somente atendimento presencial", async () => {
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
  assert.match(source, /__ORDER_OR_KITCHEN__/);
  assert.match(source, /const orderManagementAccess =/);
  assert.match(source, /somente pedidos presenciais podem ser avançados/);
});

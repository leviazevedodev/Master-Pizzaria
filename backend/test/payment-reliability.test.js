import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverUrl = new URL("../src/server.js", import.meta.url);

test("webhook só confirma depois de sincronizar o pagamento", async () => {
  const source = await readFile(serverUrl, "utf8");
  const start = source.indexOf('"/api/payments/mercadopago/webhook"');
  const end = source.indexOf('"/api/payments/mercadopago/sync"', start);
  const route = source.slice(start, end);
  assert.match(route, /await syncMercadoPagoPayment/);
  assert.match(route, /PAYMENT_SYNC_RETRY/);
  assert.ok(
    route.indexOf("await syncMercadoPagoPayment") <
      route.indexOf("matched: Boolean(synced)"),
  );
});

test("Pix criado é vinculado antes da reconciliação e não cai no rollback pré-criação", async () => {
  const source = await readFile(serverUrl, "utf8");
  const start = source.indexOf('if (paymentMethod === "PIX")');
  const end = source.indexOf("const serialized =", start);
  const block = source.slice(start, end);
  assert.match(block, /const pixPaymentId/);
  assert.match(block, /paymentExternalId: pixPaymentId/);
  assert.match(block, /confirmação será reconciliada/);
  assert.ok(
    block.indexOf("paymentExternalId: pixPaymentId") <
      block.lastIndexOf("syncMercadoPagoPayment"),
  );
});

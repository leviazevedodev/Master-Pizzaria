import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildOrderPushPayload,
  normalizePushSubscription,
  readWebPushConfig,
} from "../src/push-notifications.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Web Push só fica ativo com o trio VAPID completo", () => {
  assert.equal(readWebPushConfig({}).configured, false);
  assert.equal(
    readWebPushConfig({
      WEB_PUSH_PUBLIC_KEY: "publica",
      WEB_PUSH_PRIVATE_KEY: "privada",
      WEB_PUSH_SUBJECT: "mailto:contato@example.com",
    }).configured,
    true,
  );
});

test("assinatura exige endpoint HTTPS e as duas chaves", () => {
  assert.deepEqual(
    normalizePushSubscription({
      endpoint: "https://push.example/subscription/123",
      keys: { p256dh: "abc_DEF-123", auth: "auth_123" },
    }),
    {
      endpoint: "https://push.example/subscription/123",
      p256dh: "abc_DEF-123",
      auth: "auth_123",
    },
  );
  assert.equal(
    normalizePushSubscription({
      endpoint: "http://push.example/subscription/123",
      keys: { p256dh: "abc", auth: "def" },
    }),
    null,
  );
});

test("payload informa a etapa e abre somente o acompanhamento do pedido", () => {
  const payload = buildOrderPushPayload(
    {
      id: "order-1",
      shortCode: "AB12CD34",
      trackingCode: "tracking-code",
      status: "PREPARING",
    },
    "Master Pizzaria",
  );
  assert.match(payload.title, /Master Pizzaria/);
  assert.match(payload.body, /preparação/);
  assert.equal(payload.data.url, "/pedido/tracking-code");
});

test("migração liga assinaturas aos pedidos e adiciona ajuste do contador", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260924000000_web_push_and_customer_counter/migration.sql"),
  ]);
  assert.match(schema, /model PushSubscription/);
  assert.match(schema, /model PushOrderSubscription/);
  assert.match(schema, /deliveredOrdersCounterOffset\s+Int\s+@default\(0\)/);
  assert.match(migration, /CREATE TABLE "PushSubscription"/);
  assert.match(migration, /ON DELETE CASCADE/);
});

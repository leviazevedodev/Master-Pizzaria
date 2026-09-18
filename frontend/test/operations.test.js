import assert from "node:assert/strict";
import test from "node:test";
import { kitchenCountdown, managementErrorMessage } from "../src/lib/operations.js";

const start = "2026-09-14T12:00:00Z";
const now = Date.parse(start);
test("kitchen countdown uses the confirmed ETA and decreases across polls", () => {
  const order = { status: "PREPARING", acceptedAt: start, estimatedTo: "2026-09-14T12:20:00Z", estimatedDeliveryMax: 20 };
  assert.deepEqual(kitchenCountdown(order, now + 10 * 60000), {
    label: "10:00", ratio: 0.5, tone: "normal", description: "Tempo previsto restante: 10:00",
  });
  assert.equal(kitchenCountdown(order, now + 19 * 60000).tone, "soon");
  assert.equal(kitchenCountdown(order, now + 21 * 60000).label, "+1:00");
  assert.equal(kitchenCountdown(order, now + 21 * 60000).ratio, 0);
});
test("new orders have a countdown, ready tickets stop it, invalid dates are explicit", () => {
  assert.equal(kitchenCountdown({ status: "RECEIVED", createdAt: start }, now, 30).label, "30:00");
  assert.equal(kitchenCountdown({ status: "READY_FOR_TABLE" }, now).label, "Pronto");
  assert.equal(kitchenCountdown({ status: "PREPARING", createdAt: "bad" }, now).label, "—");
});
test("management errors only prescribe migrations for an identified schema failure", () => {
  assert.doesNotMatch(managementErrorMessage({ response: { status: 500 } }), /migrações|estrutura|schema/i);
  assert.match(managementErrorMessage({ response: { data: { code: "DATABASE_SCHEMA_OUTDATED" } } }), /migrações/);
  assert.equal(managementErrorMessage({ response: { data: { message: "Banco temporariamente indisponível." } } }), "Banco temporariamente indisponível.");
  assert.match(managementErrorMessage({ response: { status: 403 } }), /permissão/);
});

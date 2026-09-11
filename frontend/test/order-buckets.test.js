import test from "node:test";
import assert from "node:assert/strict";
import { buildOrderBuckets } from "../src/lib/orderBuckets.js";

const orders = [
  { id: "delivery", fulfillmentType: "DELIVERY", status: "RECEIVED" },
  {
    id: "delivery-ready",
    fulfillmentType: "DELIVERY",
    status: "READY_FOR_DELIVERY",
  },
  { id: "pickup-ready", fulfillmentType: "PICKUP", status: "READY_FOR_PICKUP" },
  { id: "table-new", fulfillmentType: "DINE_IN", status: "RECEIVED" },
  { id: "table-ready", fulfillmentType: "DINE_IN", status: "READY_FOR_TABLE" },
  { id: "table-served", fulfillmentType: "DINE_IN", status: "SERVED" },
];

test("Atendimento inclui pedidos presenciais nas filas correspondentes", () => {
  const buckets = buildOrderBuckets(orders, { includeDineIn: true });
  assert.deepEqual(
    buckets.RECEIVED.map((order) => order.id),
    ["delivery", "table-new"],
  );
  assert.deepEqual(
    buckets.READY_FOR_TABLE.map((order) => order.id),
    ["table-ready"],
  );
  assert.deepEqual(
    buckets.OPEN.map((order) => order.id),
    ["delivery", "table-new"],
  );
  assert.deepEqual(
    buckets.SERVED.map((order) => order.id),
    ["table-served"],
  );
});

test("pedidos prontos e servidos saem de Em aberto e continuam nas filas específicas", () => {
  const buckets = buildOrderBuckets(orders, { includeDineIn: true });
  assert.deepEqual(
    buckets.OPEN.map((order) => order.id),
    ["delivery", "table-new"],
  );
  assert.deepEqual(
    buckets.READY_FOR_DELIVERY.map((order) => order.id),
    ["delivery-ready"],
  );
  assert.deepEqual(
    buckets.READY_FOR_PICKUP.map((order) => order.id),
    ["pickup-ready"],
  );
  assert.deepEqual(
    buckets.READY_FOR_TABLE.map((order) => order.id),
    ["table-ready"],
  );
  assert.deepEqual(
    buckets.SERVED.map((order) => order.id),
    ["table-served"],
  );
});

test("Gestão geral de pedidos continua separada das comandas", () => {
  const buckets = buildOrderBuckets(orders);
  assert.deepEqual(
    buckets.OPEN.map((order) => order.id),
    ["delivery"],
  );
});

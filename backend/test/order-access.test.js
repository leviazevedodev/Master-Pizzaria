import assert from "node:assert/strict";
import test from "node:test";
import { adminOrderFilter } from "../src/order-access.js";

test("equipe de Pedidos recebe pedidos online e presenciais", () => {
  const where = adminOrderFilter({ role: "STAFF", userId: "staff-1" });

  assert.equal(where.fulfillmentType, undefined);
  assert.deepEqual(where.OR, [
    { paymentStatus: { in: ["APPROVED", "CASH_PENDING", "REFUNDED"] } },
    { status: "CANCELED" },
  ]);
});

test("garçom continua restrito aos presenciais prontos para servir", () => {
  assert.deepEqual(adminOrderFilter({ role: "WAITER", userId: "waiter-1" }), {
    paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
    fulfillmentType: "DINE_IN",
    status: "READY_FOR_TABLE",
  });
});

test("entregador recebe fila livre e somente o próprio histórico ativo", () => {
  const where = adminOrderFilter({ role: "DELIVERY", userId: "courier-1" });

  assert.equal(where.fulfillmentType, "DELIVERY");
  assert.deepEqual(where.OR[0], {
    status: "READY_FOR_DELIVERY",
    assignedCourierId: null,
  });
  assert.deepEqual(where.OR[1], {
    status: "OUT_FOR_DELIVERY",
    assignedCourierId: "courier-1",
  });
});

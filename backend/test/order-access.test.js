import assert from "node:assert/strict";
import test from "node:test";
import { adminOrderFilter, canMarkKitchenPrinted, COURIER_DELIVERED_VISIBILITY_MS } from "../src/order-access.js";

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

test("entregador vê entregue há 6 dias, mas não há 7 dias; gestão mantém histórico completo", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const courier = adminOrderFilter({ role: "DELIVERY", userId: "courier-1", now });
  const cutoff = courier.OR[2].deliveredAt.gt;
  assert.equal(cutoff.getTime(), now.getTime() - COURIER_DELIVERED_VISIBILITY_MS);
  assert.ok(new Date(now.getTime() - 6 * 86400000) > cutoff);
  assert.ok(!(new Date(now.getTime() - 7 * 86400000) > cutoff));
  assert.equal(courier.OR[2].OR[0].assignedCourierId, "courier-1");
  const admin = adminOrderFilter({ role: "STAFF", userId: "staff-1", now });
  assert.equal(admin.OR[0].paymentStatus.in.includes("APPROVED"), true);
  assert.equal(admin.deliveredAt, undefined);
});

test("entregador não consegue registrar impressão mesmo com permissão indevida", () => {
  assert.equal(canMarkKitchenPrinted("DELIVERY", true), false);
  assert.equal(canMarkKitchenPrinted("STAFF", true), true);
  assert.equal(canMarkKitchenPrinted("STAFF", false), false);
});

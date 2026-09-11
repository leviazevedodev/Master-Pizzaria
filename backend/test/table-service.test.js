import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTablePayment,
  summarizeTableOrders,
  tableLabel,
} from "../src/table-service.js";

test("summarizeTableOrders ignora cancelados e soma rodadas", () => {
  const summary = summarizeTableOrders([
    {
      status: "PREPARING",
      total: "39.90",
      items: [{ quantity: 2 }, { quantity: 1 }],
    },
    {
      status: "READY_FOR_TABLE",
      total: 10.1,
      items: [{ quantity: 1 }],
    },
    { status: "CANCELED", total: 500, items: [{ quantity: 10 }] },
  ]);
  assert.deepEqual(summary, {
    orderCount: 2,
    itemCount: 4,
    subtotal: 50,
    preparingCount: 1,
    readyCount: 1,
    servedCount: 0,
  });
});

test("calculateTablePayment calcula troco sem erro de ponto flutuante", () => {
  assert.deepEqual(calculateTablePayment(49.9, "CASH", 60), {
    ok: true,
    total: 49.9,
    amountPaid: 60,
    changeAmount: 10.1,
  });
});

test("calculateTablePayment rejeita dinheiro insuficiente", () => {
  const result = calculateTablePayment(50, "CASH", 49.99);
  assert.equal(result.ok, false);
});

test("pagamento eletrônico baixa exatamente o total", () => {
  assert.deepEqual(calculateTablePayment(31.25, "PIX", 100), {
    ok: true,
    total: 31.25,
    amountPaid: 31.25,
    changeAmount: 0,
  });
});

test("pagamento personalizado baixa exatamente o total", () => {
  assert.deepEqual(calculateTablePayment(31.25, "CUSTOM", undefined), {
    ok: true,
    total: 31.25,
    amountPaid: 31.25,
    changeAmount: 0,
  });
});

test("tableLabel usa apelido e possui fallback", () => {
  assert.equal(tableLabel({ number: 4, name: "Varanda" }), "Varanda");
  assert.equal(tableLabel({ number: 4 }), "Mesa 4");
});

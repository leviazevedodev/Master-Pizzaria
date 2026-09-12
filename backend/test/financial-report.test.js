import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinancialSummary,
  buildFinancialSummaryFromTotals,
} from "../src/financial-report.js";

test("resumo financeiro separa venda, cancelamento, estorno e líquido", () => {
  const summary = buildFinancialSummary([
    { status: "DELIVERED", paymentStatus: "APPROVED", total: "100.00" },
    { status: "DELIVERED", paymentStatus: "CASH_PENDING", total: 50 },
    { status: "CANCELED", paymentStatus: "REFUNDED", total: 30 },
    { status: "CANCELED", paymentStatus: "CANCELED", total: 20 },
    { status: "PREPARING", paymentStatus: "APPROVED", total: 99 },
  ]);

  assert.deepEqual(summary, {
    orders: 2,
    completedOrders: 2,
    canceledOrders: 2,
    refundedOrders: 1,
    grossRevenue: 180,
    canceledValue: 50,
    refundedValue: 30,
    netRevenue: 150,
    revenue: 150,
    averageTicket: 75,
  });
});

test("resumo financeiro vazio não produz NaN", () => {
  assert.deepEqual(buildFinancialSummary([]), {
    orders: 0,
    completedOrders: 0,
    canceledOrders: 0,
    refundedOrders: 0,
    grossRevenue: 0,
    canceledValue: 0,
    refundedValue: 0,
    netRevenue: 0,
    revenue: 0,
    averageTicket: 0,
  });
});

test("resumo agregado mantém precisão sem depender da lista de ranking", () => {
  const summary = buildFinancialSummaryFromTotals({
    completedOrders: 12500,
    completedValue: "400000.25",
    canceledOrders: 320,
    canceledValue: "8400.30",
    refundedOrders: 12,
    refundedValue: "612.40",
  });

  assert.equal(summary.grossRevenue, 400612.65);
  assert.equal(summary.netRevenue, 400000.25);
  assert.equal(summary.averageTicket, 32);
});

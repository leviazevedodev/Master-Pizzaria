import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRMED_PAYMENT_STATUSES,
  customerCanCancel,
  customerVisibleStatus,
  isConfirmedPaymentStatus,
} from "../src/customer-order.js";

test("cliente só vê Entregando depois que o entregador aceita", () => {
  assert.equal(customerVisibleStatus("READY_FOR_DELIVERY"), "PREPARING");
  assert.equal(customerVisibleStatus("OUT_FOR_DELIVERY"), "OUT_FOR_DELIVERY");
});

test("pedido da mesa permanece em preparo até ser servido", () => {
  assert.equal(customerVisibleStatus("READY_FOR_TABLE"), "PREPARING");
  assert.equal(customerVisibleStatus("SERVED"), "SERVED");
});

test("cancelamento imediato existe apenas antes do preparo", () => {
  assert.equal(customerCanCancel("SCHEDULED"), true);
  assert.equal(customerCanCancel("RECEIVED"), true);
  assert.equal(customerCanCancel("PREPARING"), false);
});

test("tentativa online pendente não conta no limite diário", () => {
  assert.deepEqual(CONFIRMED_PAYMENT_STATUSES, ["APPROVED", "CASH_PENDING"]);
  assert.equal(isConfirmedPaymentStatus("PENDING"), false);
  assert.equal(isConfirmedPaymentStatus("APPROVED"), true);
});

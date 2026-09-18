import test from "node:test";
import assert from "node:assert/strict";
import {
  canDispatchCouriers,
  isCourierDispatchPath,
} from "../src/admin-permissions.js";

const activeAdmin = { isAdmin: true, staffActive: true, staffRole: "STAFF" };

test("somente proprietário ou equipe autorizada pode despachar entregadores", () => {
  assert.equal(canDispatchCouriers(activeAdmin, null), true);
  assert.equal(canDispatchCouriers(activeAdmin, ["orders"]), true);
  assert.equal(canDispatchCouriers(activeAdmin, ["delivery"]), false);
});

test("entregador e garçom não podem atribuir corridas pela API administrativa", () => {
  assert.equal(
    canDispatchCouriers({ ...activeAdmin, staffRole: "DELIVERY" }, ["orders"]),
    false,
  );
  assert.equal(
    canDispatchCouriers({ ...activeAdmin, staffRole: "WAITER" }, ["orders"]),
    false,
  );
  assert.equal(
    canDispatchCouriers({ ...activeAdmin, staffActive: false }, ["orders"]),
    false,
  );
});

test("somente as rotas de despacho são reconhecidas como atribuição de corrida", () => {
  assert.equal(isCourierDispatchPath("/orders/order-1/assign-courier"), true);
  assert.equal(isCourierDispatchPath("/orders/order-1/assign-courier/"), true);
  assert.equal(isCourierDispatchPath("/courier/auto-assign/order-1"), true);
  assert.equal(isCourierDispatchPath("/courier/auto-assign/order-1/"), true);
  assert.equal(isCourierDispatchPath("/orders/order-1"), false);
  assert.equal(isCourierDispatchPath("/courier/orders"), false);
});

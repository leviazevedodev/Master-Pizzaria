import assert from "node:assert/strict";
import test from "node:test";
import { canManageDineInOrders, tableRoutePermission } from "../src/dine-in-access.js";

const staff = { isAdmin: true, staffRole: "STAFF", staffActive: true };
const actions = [
  ["POST", "/table-orders/order-1/served"],
  ["POST", "/table-orders/order-1/cancel"],
  ["GET", "/table-session-summary/session-1"],
  ["POST", "/table-sessions/session-1/close"],
];

test("permissão orders autoriza o fluxo presencial sem exigir tables", () => {
  assert.equal(canManageDineInOrders(staff, ["orders"]), true);
  for (const [method, path] of actions) {
    assert.equal(tableRoutePermission(path, method), "__TABLE_ORDER__");
    assert.equal(tableRoutePermission(`${path}/`, method), "__TABLE_ORDER__");
  }
});

test("cadastro, abertura e edição de comanda continuam exigindo tables", () => {
  for (const [method, path] of [
    ["GET", "/tables"], ["POST", "/tables"], ["POST", "/tables/bulk"],
    ["PATCH", "/tables/table-1"], ["DELETE", "/tables/table-1"],
    ["POST", "/tables/table-1/open"], ["PATCH", "/table-sessions/session-1"],
    ["POST", "/table-sessions/session-1/cancel"], ["GET", "/table-sessions/history"],
    ["GET", "/table-catalog"], ["POST", "/table-orders/order-1/cancel/extra"],
  ]) assert.equal(tableRoutePermission(path, method), "tables", `${method} ${path}`);
  for (const [, path] of actions)
    assert.equal(tableRoutePermission(path, "DELETE"), "tables");
  assert.equal(tableRoutePermission("/orders", "GET"), null);
});

test("entregador e conta inativa nunca recebem permissão para fechar mesas", () => {
  for (const permissions of [null, ["orders"], ["tables"], ["orders", "tables"]]) {
    assert.equal(canManageDineInOrders({ ...staff, staffRole: "DELIVERY" }, permissions), false);
    assert.equal(canManageDineInOrders({ ...staff, staffActive: false }, permissions), false);
    assert.equal(canManageDineInOrders({ ...staff, isAdmin: false }, permissions), false);
  }
  assert.equal(canManageDineInOrders(undefined, ["orders"]), false);
  assert.equal(canManageDineInOrders(staff, []), false);
  assert.equal(canManageDineInOrders(staff, ["kitchen", "overview"]), false);
});

test("proprietário e equipe de mesas mantêm acesso existente", () => {
  assert.equal(canManageDineInOrders(staff, null), true);
  assert.equal(canManageDineInOrders(staff, ["tables"]), true);
  assert.equal(canManageDineInOrders({ ...staff, staffRole: "WAITER" }, []), true);
});

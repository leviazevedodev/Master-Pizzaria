import test from "node:test";
import assert from "node:assert/strict";
import { permissionNeededForAdminRequest } from "../src/admin-route-permissions.js";

const permission = (path, method = "GET", body = undefined) =>
  permissionNeededForAdminRequest({ path, method, body });

test("mapeia rotas administrativas sensíveis antes das permissões genéricas", () => {
  assert.equal(
    permission("/orders/order-1/assign-courier", "POST"),
    "__COURIER_DISPATCH__",
  );
  assert.equal(
    permission("/orders/order-1/assign-courier/", "POST"),
    "__COURIER_DISPATCH__",
  );
  assert.equal(
    permission("/courier/auto-assign/order-1", "POST"),
    "__COURIER_DISPATCH__",
  );
  assert.equal(
    permission("/kitchen/orders/order-1/advance", "PATCH"),
    "__ORDER_OR_KITCHEN__",
  );
});

test("separa configurações operacionais, de entrega e da loja", () => {
  assert.equal(permission("/settings", "GET"), "__SHARED_SETTINGS__");
  assert.equal(
    permission("/settings", "PATCH", { isOpen: true, pickupEnabled: true }),
    "operations",
  );
  assert.equal(
    permission("/settings", "PATCH", { deliveryMinimumKm: 10 }),
    "delivery",
  );
  assert.equal(permission("/settings", "PATCH", { storeName: "Loja" }), "settings");
});

test("nega por padrão qualquer rota administrativa sem mapeamento", () => {
  assert.equal(permission("/rota-nova-sem-permissao"), null);
});

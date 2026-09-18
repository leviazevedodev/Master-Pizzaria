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
  assert.equal(
    permission("/settings", "PATCH", {
      publicReviewsEnabled: true,
      rewardsMode: "POINTS",
    }),
    "promotions",
  );
});

test("marketing e moderação usam a permissão de promoções", () => {
  assert.equal(permission("/campaigns"), "promotions");
  assert.equal(permission("/reviews/review-1", "PATCH"), "promotions");
});

test("nega por padrão qualquer rota administrativa sem mapeamento", () => {
  assert.equal(permission("/rota-nova-sem-permissao"), null);
});

test("catálogo central de sabores possui leitura e escrita mapeadas", () => {
  assert.equal(permission("/flavors"), "__ALTERATION_READ__");
  assert.equal(permission("/flavor-groups"), "__ALTERATION_READ__");
  assert.equal(permission("/sizes"), "__ALTERATION_READ__");
  assert.equal(permission("/sizes/size-1", "PATCH"), "products");
  assert.equal(permission("/flavors/flavor-1", "PATCH"), "__FLAVOR_WRITE__");
  assert.equal(
    permission("/flavor-groups/group-1", "DELETE"),
    "__FLAVOR_WRITE__",
  );
});

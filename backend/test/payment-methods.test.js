import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TABLE_PAYMENT_METHODS,
  normalizeCustomPaymentMethods,
  normalizeTablePaymentMethods,
  resolveCustomPaymentMethod,
} from "../src/payment-methods.js";

test("normaliza métodos personalizados e remove nomes duplicados", () => {
  const methods = normalizeCustomPaymentMethods([
    { id: "voucher", label: "  Vale   refeição " },
    { id: "outro", label: "vale refeição" },
    { id: "", label: "Fiado", siteEnabled: false },
  ]);
  assert.equal(methods.length, 2);
  assert.equal(methods[0].label, "Vale refeição");
  assert.equal(methods[0].siteEnabled, false);
  assert.equal(methods[1].siteEnabled, false);
  assert.equal(methods[1].tableEnabled, true);
});

test("resolve somente método ativo e liberado no canal solicitado", () => {
  const settings = {
    customPaymentMethods: [
      {
        id: "voucher",
        label: "Vale-refeição",
        active: true,
        siteEnabled: false,
        tableEnabled: true,
      },
    ],
  };
  assert.equal(resolveCustomPaymentMethod(settings, "CUSTOM:voucher", "SITE"), null);
  assert.equal(
    resolveCustomPaymentMethod(settings, "CUSTOM:voucher", "TABLE")?.label,
    "Vale-refeição",
  );
});

test("as mesas começam com dinheiro, Pix, crédito e débito e permitem remover todos", () => {
  assert.deepEqual(normalizeTablePaymentMethods(undefined), DEFAULT_TABLE_PAYMENT_METHODS);
  assert.deepEqual(
    normalizeTablePaymentMethods(["cash", "PIX", "CREDIT", "credit", "invalid"]),
    ["CASH", "PIX", "CREDIT"],
  );
  assert.deepEqual(normalizeTablePaymentMethods([]), []);
});

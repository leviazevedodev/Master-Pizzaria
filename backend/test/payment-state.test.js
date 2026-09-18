import assert from "node:assert/strict";
import test from "node:test";
import {
  nextPaymentState,
  paymentStatusFromProvider,
  releasesReservedBenefits,
} from "../src/payment-state.js";

test("traduz os estados do Mercado Pago sem promover estados desconhecidos", () => {
  assert.equal(paymentStatusFromProvider("approved"), "APPROVED");
  assert.equal(paymentStatusFromProvider("charged_back"), "REFUNDED");
  assert.equal(paymentStatusFromProvider("cancelled"), "REJECTED");
  assert.equal(paymentStatusFromProvider("in_process"), "PENDING");
});

test("evento atrasado não regride aprovação ou reembolso", () => {
  const paidAt = new Date("2026-09-15T10:00:00Z");
  assert.deepEqual(nextPaymentState("APPROVED", "pending", paidAt), {
    status: "APPROVED",
    paidAt,
    ignored: true,
  });
  assert.deepEqual(nextPaymentState("REFUNDED", "approved", paidAt), {
    status: "REFUNDED",
    paidAt,
    ignored: true,
  });
});

test("benefício reservado é liberado uma única vez", () => {
  assert.equal(releasesReservedBenefits("PENDING", "REJECTED"), true);
  assert.equal(releasesReservedBenefits("APPROVED", "REFUNDED"), true);
  assert.equal(releasesReservedBenefits("REJECTED", "REJECTED"), false);
  assert.equal(releasesReservedBenefits("REFUNDED", "REFUNDED"), false);
});

test("aprovação sem data do provedor recebe um horário seguro", () => {
  const now = new Date("2026-09-15T11:00:00Z");
  assert.deepEqual(nextPaymentState("PENDING", "approved", null, null, now), {
    status: "APPROVED",
    paidAt: now,
    ignored: false,
  });
});

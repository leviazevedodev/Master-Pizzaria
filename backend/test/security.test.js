import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  detectImageMime,
  escapeHtml,
  isTrustedMercadoPagoUrl,
  verifyMercadoPagoSignature,
} from "../src/security.js";

test("escapeHtml neutralizes values inserted into email HTML", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("detectImageMime checks file signatures instead of client MIME only", () => {
  assert.equal(
    detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    detectImageMime(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(detectImageMime(Buffer.from("not really an image")), null);
});

test("Mercado Pago redirect allowlist requires HTTPS and an official host", () => {
  assert.equal(
    isTrustedMercadoPagoUrl(
      "https://www.mercadopago.com.br/checkout/v1/redirect",
    ),
    true,
  );
  assert.equal(
    isTrustedMercadoPagoUrl("https://sandbox.mercadopago.com/checkout"),
    true,
  );
  assert.equal(
    isTrustedMercadoPagoUrl("http://www.mercadopago.com.br/checkout"),
    false,
  );
  assert.equal(
    isTrustedMercadoPagoUrl("https://mercadopago.com.br.evil.example/checkout"),
    false,
  );
});

test("Mercado Pago webhook signature is verified in constant-time compatible format", () => {
  const secret = "test-webhook-secret";
  const dataId = "123456789";
  const xRequestId = "request-abc";
  const ts = "1704908010";
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`id:${dataId};request-id:${xRequestId};ts:${ts};`)
    .digest("hex");
  assert.equal(
    verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${digest}`,
      xRequestId,
      dataId,
      secret,
    }),
    true,
  );
  assert.equal(
    verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${"0".repeat(64)}`,
      xRequestId,
      dataId,
      secret,
    }),
    false,
  );
});

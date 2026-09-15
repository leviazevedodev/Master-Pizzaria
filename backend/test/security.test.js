import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  detectImageMime,
  escapeHtml,
  isTrustedMercadoPagoUrl,
  normalizeTrustedGoogleMapsUrl,
  paymentIdempotencyKey,
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

test("idempotência do cartão impede duas cobranças do pedido mesmo com tokens distintos", () => {
  const first = paymentIdempotencyKey("order-1", "card-token-1");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, paymentIdempotencyKey("order-1", "card-token-1"));
  assert.equal(first, paymentIdempotencyKey("order-1", "card-token-2"));
  assert.notEqual(first, paymentIdempotencyKey("order-2", "card-token-1"));
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

test("link de localização aceita somente hosts oficiais do Google Maps", () => {
  assert.equal(
    normalizeTrustedGoogleMapsUrl("https://maps.app.goo.gl/abc123"),
    "https://maps.app.goo.gl/abc123",
  );
  assert.equal(
    normalizeTrustedGoogleMapsUrl("https://www.google.com/maps/@-10.9,-37.1,15z"),
    "https://www.google.com/maps/@-10.9,-37.1,15z",
  );
  assert.equal(
    normalizeTrustedGoogleMapsUrl("https://google.com.evil.example/maps"),
    "",
  );
  assert.equal(normalizeTrustedGoogleMapsUrl("http://maps.google.com/maps"), "");
});

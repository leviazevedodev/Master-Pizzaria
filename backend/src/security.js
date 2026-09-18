import crypto from "node:crypto";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export function isTrustedMercadoPagoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return /(^|\.)mercadopago\.(com|com\.br|com\.ar|com\.mx|com\.co|com\.pe|com\.uy|cl)$/.test(
      host,
    );
  } catch {
    return false;
  }
}

export function paymentIdempotencyKey(orderId) {
  const order = String(orderId || "");
  if (!order) return "";
  return crypto
    .createHash("sha256")
    .update(`mercadopago-card:${order}`)
    .digest("hex");
}

export function normalizeTrustedGoogleMapsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    const trusted =
      host === "maps.app.goo.gl" ||
      host === "maps.google.com" ||
      (host === "goo.gl" && url.pathname.startsWith("/maps")) ||
      host === "google.com" ||
      host.endsWith(".google.com") ||
      /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
    return trusted ? url.href : "";
  } catch {
    return "";
  }
}

export function verifyMercadoPagoSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}) {
  if (!xSignature || !dataId || !secret) return false;
  const values = Object.fromEntries(
    String(xSignature)
      .split(",")
      .map((part) => part.trim().split("=", 2)),
  );
  if (
    !/^\d+$/.test(values.ts || "") ||
    !/^[a-f0-9]{64}$/i.test(values.v1 || "")
  )
    return false;

  let manifest = `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${String(xRequestId)};`;
  manifest += `ts:${values.ts};`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest();
  const received = Buffer.from(values.v1, "hex");
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}

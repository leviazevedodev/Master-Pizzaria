import crypto from "node:crypto";

export const CUSTOM_PAYMENT_PREFIX = "CUSTOM:";

const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function normalizeCustomPaymentMethods(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const labels = new Set();
  const result = [];
  for (const raw of value.slice(0, 20)) {
    const label = text(raw?.label, 40).replace(/\s+/g, " ");
    if (label.length < 2) continue;
    const labelKey = label.toLocaleLowerCase("pt-BR");
    let id = text(raw?.id, 64).replace(/[^A-Za-z0-9_-]/g, "");
    if (!id)
      id = crypto
        .createHash("sha256")
        .update(labelKey)
        .digest("hex")
        .slice(0, 20);
    if (ids.has(id) || labels.has(labelKey)) continue;
    ids.add(id);
    labels.add(labelKey);
    result.push({
      id,
      label,
      active: raw?.active !== false,
      // Métodos personalizados são acordos presenciais da loja. O checkout
      // público aceita somente os meios padronizados e validados no servidor.
      siteEnabled: false,
      tableEnabled: raw?.tableEnabled !== false,
    });
  }
  return result;
}

export function resolveCustomPaymentMethod(settings, rawValue, channel) {
  const value = text(rawValue, 80);
  if (!value.startsWith(CUSTOM_PAYMENT_PREFIX)) return null;
  const id = value.slice(CUSTOM_PAYMENT_PREFIX.length);
  return (
    normalizeCustomPaymentMethods(settings?.customPaymentMethods).find(
      (method) =>
        method.id === id &&
        method.active &&
        (channel === "TABLE" ? method.tableEnabled : method.siteEnabled),
    ) || null
  );
}

import { PRODUCT_FLAVOR_PRICE_MODES } from "./flavor-pricing.js";
import { cleanText } from "./sanitization.js";

export async function syncProductFlavors(tx, productId, flavorIds, flavorConfigs = []) {
  const unique = [...new Set((flavorIds || []).map((id) => cleanText(id, 80)).filter(Boolean))];
  const configs = new Map();
  if (!Array.isArray(flavorConfigs))
    throw Object.assign(new Error("Configuração de sabores inválida."), { code: "INVALID_CATALOG_CONFIGURATION" });
  for (const row of flavorConfigs) {
    const flavorId = cleanText(row?.flavorId, 80);
    const priceMode = cleanText(row?.priceMode, 30).toUpperCase() || "BASE_PRICE";
    const surcharge = Number(row?.surcharge ?? 0);
    if (!flavorId || configs.has(flavorId) || !PRODUCT_FLAVOR_PRICE_MODES.has(priceMode) ||
        !Number.isFinite(surcharge) || surcharge < 0 || surcharge > 10000 ||
        Math.abs(surcharge * 100 - Math.round(surcharge * 100)) > 1e-7)
      throw Object.assign(new Error("Configuração de preço de sabor inválida."), { code: "INVALID_CATALOG_CONFIGURATION" });
    configs.set(flavorId, { priceMode, surcharge: priceMode === "SURCHARGE" ? surcharge : 0 });
  }
  await tx.productFlavor.updateMany({ where: { productId, flavorId: { notIn: unique } }, data: { enabled: false } });
  for (const [sortOrder, flavorId] of unique.entries()) {
    const rule = configs.get(flavorId);
    await tx.productFlavor.upsert({
      where: { productId_flavorId: { productId, flavorId } },
      create: { productId, flavorId, sortOrder, enabled: true, ...(rule || { priceMode: "BASE_PRICE", surcharge: 0 }) },
      update: { sortOrder, enabled: true, ...(rule || {}) },
    });
  }
}

import { isProductAvailableAt } from "./catalog.js";

// A composição vendida fica no pedido; editar um combo não altera pedidos antigos.
export function snapshotComboItems(product) {
  if (!product.isCombo) return [];
  return (product.comboItems || []).map((entry) => ({
    productId: entry.productId,
    name: entry.product?.name || "Produto",
    quantity: Number(entry.quantity),
    sizeId: entry.sizeId || null,
    sizeName: entry.size?.name || null,
  }));
}

export function comboComponentIsAvailable(entry, date, timezone, quantity = 1) {
  const product = entry.product;
  if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 20) return false;
  if (!product || product.deletedAt || !isProductAvailableAt(product, date, timezone)) return false;
  const sizes = (product.productSizes || []).filter((row) => row.size?.active !== false);
  if (entry.sizeId ? !sizes.some((row) => row.sizeId === entry.sizeId) : sizes.length) return false;
  return !product.stockTracked || Number(product.stockQuantity || 0) >= Number(entry.quantity) * quantity;
}

export function comboIsAvailableAt(product, date, timezone) {
  return !product.isCombo || (
    product.comboItems?.length >= 2 &&
    product.comboItems.every((entry) => comboComponentIsAvailable(entry, date, timezone))
  );
}

export function collectOrderStockNeeds(items) {
  const products = new Map(), flavors = new Map(), options = new Map();
  const add = (map, id, quantity) => { if (id) map.set(id, (map.get(id) || 0) + quantity); };
  for (const item of items) {
    add(products, item.productId, item.quantity);
    for (const component of Array.isArray(item.comboItems) ? item.comboItems : [])
      add(products, component.productId, component.quantity * item.quantity);
    for (const flavor of item.flavors || []) {
      if (flavor.productId !== item.productId) add(products, flavor.productId, item.quantity);
      add(flavors, flavor.flavorId, item.quantity);
    }
    for (const option of item.options || []) add(options, option.optionId, item.quantity);
  }
  // Todas as vendas travam os mesmos registros na mesma ordem, inclusive
  // quando dois combos possuem os produtos em posições opostas.
  const sorted = (map) => new Map([...map].sort(([a], [b]) => a.localeCompare(b)));
  return { products: sorted(products), flavors: sorted(flavors), options: sorted(options) };
}

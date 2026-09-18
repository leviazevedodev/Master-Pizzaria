import { isProductAvailableAt } from "./catalog.js";

const COMBO_SLOT_TYPES = new Set([
  "FIXED_PRODUCT",
  "PRODUCT_CHOICE",
  "CONFIGURABLE_PIZZA",
]);

export class ComboConfigurationError extends Error {
  constructor(code, message, httpStatus = 400, details = {}) {
    super(message);
    this.name = "ComboConfigurationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const comboFail = (code, message, httpStatus, details) => {
  throw new ComboConfigurationError(code, message, httpStatus, details);
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const activeSimplePrice = (row, now = new Date()) =>
  row?.promoActive &&
  row?.promoPrice != null &&
  Number(row.promoPrice) >= 0 &&
  Number(row.promoPrice) < Number(row.price) &&
  (!row.promoStartAt || new Date(row.promoStartAt) <= now) &&
  (!row.promoEndAt || new Date(row.promoEndAt) >= now)
    ? Number(row.promoPrice)
    : Number(row?.price || 0);

const signedRuleAmount = (rule, normalPrice = 0) => {
  const amount = Math.max(0, Number(rule?.amount || 0));
  switch (rule?.pricingRule) {
    case "SURCHARGE":
      return amount;
    case "DISCOUNT":
      return -amount;
    case "INCLUDED":
      return 0;
    case "NORMAL":
      return normalPrice;
    default:
      return 0;
  }
};

export function resolveComboFlavorRule(slot, flavor) {
  const specific = (slot.flavorRules || []).find(
    (entry) => entry.flavorId === flavor.id,
  );
  if (specific) return specific;
  const group = (slot.flavorGroupRules || []).find(
    (entry) => entry.flavorGroupId === flavor.groupId,
  );
  if (group) return group;
  return slot.flavorScope === "ALL"
    ? { pricingRule: "INCLUDED", amount: 0 }
    : { pricingRule: "BLOCKED", amount: 0 };
}

function flavorSupportsSize(flavor, sizeId) {
  return (flavor.sizes || []).some(
    (entry) =>
      entry.sizeId === sizeId &&
      entry.available !== false &&
      entry.size?.active !== false,
  );
}

export function comboSlotIsAvailable(slot, date, timezone, orderQuantity = 1) {
  if (!COMBO_SLOT_TYPES.has(slot?.type)) return false;
  const requiredUnits = Number(slot.quantity || 0) * Number(orderQuantity || 0);
  if (!Number.isInteger(requiredUnits) || requiredUnits < 1) return false;
  if (slot.type === "CONFIGURABLE_PIZZA") {
    const base = slot.baseProduct;
    if (
      !base ||
      !slot.sizeId ||
      base.deletedAt ||
      !isProductAvailableAt(base, date, timezone) ||
      (base.stockTracked && Number(base.stockQuantity || 0) < requiredUnits) ||
      !(base.productSizes || []).some(
        (entry) => entry.sizeId === slot.sizeId && entry.size?.active !== false,
      )
    )
      return false;
    return (base.productFlavors || []).some(({ flavor }) => {
      const rule = flavor && resolveComboFlavorRule(slot, flavor);
      return (
        flavor?.active &&
        (!flavor.stockTracked ||
          Number(flavor.stockQuantity || 0) >= requiredUnits) &&
        flavorSupportsSize(flavor, slot.sizeId) &&
        rule?.pricingRule !== "BLOCKED"
      );
    });
  }
  return (slot.products || []).some((entry) =>
    comboComponentIsAvailable(
      { ...entry, quantity: slot.quantity },
      date,
      timezone,
      orderQuantity,
    ),
  );
}

/**
 * Valida escolhas de um combo já carregado do banco e devolve somente
 * snapshots e acréscimos calculados por regras confiáveis do servidor.
 */
export function resolveComboSelection(
  product,
  rawSelections,
  date,
  timezone,
  orderQuantity = 1,
) {
  const slots = Array.isArray(product?.comboSlots) ? product.comboSlots : [];
  if (!product?.isCombo || !slots.length)
    comboFail("COMBO_NOT_CONFIGURABLE", "Este combo não possui opções configuráveis.");
  const requested = new Map();
  for (const row of Array.isArray(rawSelections) ? rawSelections : []) {
    const slotId = typeof row?.slotId === "string" ? row.slotId.trim() : "";
    if (!slotId || requested.has(slotId))
      comboFail("INVALID_COMBO_SELECTION", "A configuração do combo é inválida.");
    requested.set(slotId, row);
  }
  if ([...requested.keys()].some((id) => !slots.some((slot) => slot.id === id)))
    comboFail("COMBO_SLOT_NOT_FOUND", "O combo foi atualizado. Escolha novamente uma opção.", 409);

  const snapshots = [];
  let adjustment = 0;
  for (const slot of slots) {
    const input = requested.get(slot.id) || {};
    if (!comboSlotIsAvailable(slot, date, timezone, orderQuantity))
      comboFail(
        "COMBO_SLOT_UNAVAILABLE",
        `${slot.name || "Um item do combo"} não está disponível no momento.`,
        409,
        { slotId: slot.id },
      );
    if (slot.type === "FIXED_PRODUCT" || slot.type === "PRODUCT_CHOICE") {
      const chosen =
        slot.type === "FIXED_PRODUCT"
          ? slot.products?.[0]
          : (slot.products || []).find(
              (entry) =>
                entry.id === input.choiceId ||
                (entry.productId === input.productId &&
                  (!input.sizeId || entry.sizeId === input.sizeId)),
            );
      if (!chosen)
        comboFail(
          "COMBO_PRODUCT_REQUIRED",
          `Escolha uma opção válida em ${slot.name || "um item do combo"}.`,
          400,
          { slotId: slot.id },
        );
      if (
        !comboComponentIsAvailable(
          { ...chosen, quantity: slot.quantity },
          date,
          timezone,
          orderQuantity,
        )
      )
        comboFail(
          "COMBO_PRODUCT_UNAVAILABLE",
          `${chosen.product?.name || "A opção escolhida"} não está disponível.`,
          409,
        );
      const itemAdjustment = Number(chosen.priceAdjustment || 0) * slot.quantity;
      adjustment += itemAdjustment;
      snapshots.push({
        slotId: slot.id,
        slotType: slot.type,
        slotName: slot.name,
        choiceId: chosen.id,
        productId: chosen.productId,
        name: chosen.product?.name || slot.name || "Produto",
        quantity: slot.quantity,
        sizeId: chosen.sizeId || null,
        sizeName: chosen.size?.name || null,
        priceAdjustment: roundMoney(itemAdjustment),
        flavors: [],
        options: [],
      });
      continue;
    }

    const base = slot.baseProduct;
    const flavorIds = [
      ...new Set(
        (Array.isArray(input.flavorIds) ? input.flavorIds : [])
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean),
      ),
    ];
    const sizeLimit = Math.max(1, Number(slot.size?.maxFlavors || 1));
    const limit = Math.min(
      4,
      Math.max(1, Number(base.maxFlavors || 1)),
      slot.maxFlavors == null
        ? sizeLimit
        : Math.max(1, Number(slot.maxFlavors)),
    );
    if (!flavorIds.length || flavorIds.length > limit)
      comboFail(
        "COMBO_FLAVOR_LIMIT",
        `${slot.name || "A pizza"} permite ${limit === 1 ? "1 sabor" : `até ${limit} sabores`}.`,
      );
    const catalog = new Map(
      (base.productFlavors || []).map(({ flavor }) => [flavor.id, flavor]),
    );
    const flavors = flavorIds.map((id) => catalog.get(id));
    if (flavors.some((flavor) => !flavor))
      comboFail("COMBO_FLAVOR_NOT_ALLOWED", "Este sabor não faz parte do combo.");
    let flavorAdjustment = 0;
    const flavorSnapshots = flavors.map((flavor) => {
      const rule = resolveComboFlavorRule(slot, flavor);
      if (
        !flavor.active ||
        !flavorSupportsSize(flavor, slot.sizeId) ||
        rule.pricingRule === "BLOCKED"
      )
        comboFail(
          "COMBO_FLAVOR_NOT_ALLOWED",
          `O sabor ${flavor.name} não está disponível neste combo ou tamanho.`,
          409,
        );
      if (flavors.length > 1 && flavor.allowHalfAndHalf !== true)
        comboFail(
          "COMBO_FLAVOR_HALF_NOT_ALLOWED",
          `O sabor ${flavor.name} não permite meio a meio.`,
          409,
        );
      if (
        flavor.stockTracked &&
        Number(flavor.stockQuantity || 0) < slot.quantity * orderQuantity
      )
        comboFail("OUT_OF_STOCK", `O sabor ${flavor.name} está sem estoque.`, 409);
      const value = signedRuleAmount(rule);
      flavorAdjustment += value / flavors.length;
      return {
        flavorId: flavor.id,
        productId: flavor.sourceProductId || null,
        name: flavor.name,
        unitPrice: roundMoney(value / flavors.length),
        ruleAmount: roundMoney(value),
        pricingRule: rule.pricingRule,
      };
    });

    const optionIds = [
      ...new Set(
        (Array.isArray(input.optionIds) ? input.optionIds : [])
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean),
      ),
    ];
    if (!slot.allowModifiers && optionIds.length)
      comboFail("COMBO_MODIFIERS_BLOCKED", "Este combo não permite bordas ou adicionais.");
    const allowedGroups = new Map(
      (base.modifierGroups || [])
        .filter((entry) => entry.group?.active)
        .map((entry) => [entry.groupId, entry.group]),
    );
    const optionCatalog = new Map(
      [...allowedGroups.values()].flatMap((group) =>
        (group.options || []).filter((option) => option.active).map((option) => [option.id, option]),
      ),
    );
    const selectedByGroup = new Map();
    let optionAdjustment = 0;
    const optionSnapshots = optionIds.map((id) => {
      const option = optionCatalog.get(id);
      if (!option)
        comboFail("COMBO_MODIFIER_NOT_ALLOWED", "Uma borda ou adicional não faz parte deste combo.");
      const rule = (slot.modifierRules || []).find((entry) => entry.optionId === id);
      if (rule?.pricingRule === "BLOCKED")
        comboFail("COMBO_MODIFIER_NOT_ALLOWED", `${option.name} não é permitido neste combo.`);
      const group = allowedGroups.get(option.groupId);
      if (
        option.stockTracked &&
        Number(option.stockQuantity || 0) < slot.quantity * orderQuantity
      )
        comboFail(
          "OUT_OF_STOCK",
          `O adicional ${option.name} está sem estoque.`,
          409,
        );
      const list = selectedByGroup.get(option.groupId) || [];
      list.push(option);
      selectedByGroup.set(option.groupId, list);
      const normalPrice = activeSimplePrice(option, date);
      const fallbackRule = slot.modifierPricingMode === "INCLUDED" ? "INCLUDED" : "NORMAL";
      const value = signedRuleAmount(rule || { pricingRule: fallbackRule }, normalPrice);
      optionAdjustment += value;
      return {
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        unitPrice: roundMoney(value),
        pricingRule: rule?.pricingRule || fallbackRule,
      };
    });
    if (slot.allowModifiers) {
      for (const [groupId, group] of allowedGroups) {
        const count = (selectedByGroup.get(groupId) || []).length;
        const minimum = group.required
          ? Math.max(1, Number(group.minSelect || 0))
          : Number(group.minSelect || 0);
        if (count < minimum || count > Number(group.maxSelect || 1))
          comboFail(
            "COMBO_MODIFIER_SELECTION_INVALID",
            `Revise as opções de ${group.name}.`,
          );
      }
    }
    const slotAdjustment = (flavorAdjustment + optionAdjustment) * slot.quantity;
    adjustment += slotAdjustment;
    snapshots.push({
      slotId: slot.id,
      slotType: slot.type,
      slotName: slot.name,
      productId: base.id,
      name: base.name,
      quantity: slot.quantity,
      sizeId: slot.sizeId,
      sizeName: slot.size?.name || null,
      priceAdjustment: roundMoney(slotAdjustment),
      flavors: flavorSnapshots,
      options: optionSnapshots,
    });
  }
  return { snapshots, adjustment: roundMoney(adjustment) };
}

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
  if (!product.isCombo) return true;
  if (product.comboSlots?.length)
    return (
      product.comboSlots.length >= 2 &&
      product.comboSlots.every((slot) => comboSlotIsAvailable(slot, date, timezone))
    );
  return (
    product.comboItems?.length >= 2 &&
    product.comboItems.every((entry) =>
      comboComponentIsAvailable(entry, date, timezone),
    )
  );
}

export function collectOrderStockNeeds(items) {
  const products = new Map(), flavors = new Map(), options = new Map();
  const add = (map, id, quantity) => { if (id) map.set(id, (map.get(id) || 0) + quantity); };
  for (const item of items) {
    add(products, item.productId, item.quantity);
    for (const component of Array.isArray(item.comboItems) ? item.comboItems : [])
      {
        const componentQuantity = component.quantity * item.quantity;
        add(products, component.productId, componentQuantity);
        for (const flavor of component.flavors || [])
          add(flavors, flavor.flavorId, componentQuantity);
        for (const option of component.options || [])
          add(options, option.optionId, componentQuantity);
      }
    for (const flavor of item.flavors || []) {
      // Sabores do catálogo central podem manter `productId` apenas como
      // referência histórica. Nesse caso o estoque canônico é o Flavor e não
      // outra pizza inteira. Pedidos legados, sem flavorId, preservam a baixa
      // pelo produto-sabor antigo.
      if (!flavor.flavorId && flavor.productId !== item.productId)
        add(products, flavor.productId, item.quantity);
      add(flavors, flavor.flavorId, item.quantity);
    }
    for (const option of item.options || []) add(options, option.optionId, item.quantity);
  }
  // Todas as vendas travam os mesmos registros na mesma ordem, inclusive
  // quando dois combos possuem os produtos em posições opostas.
  const sorted = (map) => new Map([...map].sort(([a], [b]) => a.localeCompare(b)));
  return { products: sorted(products), flavors: sorted(flavors), options: sorted(options) };
}

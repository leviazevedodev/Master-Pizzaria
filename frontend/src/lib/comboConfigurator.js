import { initialModifierSelections } from "./productCustomizer.js";

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function comboFlavorRule(slot, flavor) {
  const exact = (slot.flavorRules || []).find(
    (entry) => entry.flavorId === flavor.id,
  );
  if (exact) return exact;
  const groupId = flavor.group?.id || flavor.groupId;
  const group = (slot.flavorGroupRules || []).find(
    (entry) => entry.flavorGroupId === groupId,
  );
  if (group) return group;
  return slot.flavorScope === "ALL"
    ? { pricingRule: "INCLUDED", amount: 0 }
    : { pricingRule: "BLOCKED", amount: 0 };
}

export function availableComboFlavors(slot) {
  const sizeId = slot.sizeId || slot.size?.id;
  return (slot.baseProduct?.availableFlavors || []).filter((flavor) => {
    const sizeAvailable = (flavor.availableSizes || flavor.sizes || []).some(
      (size) =>
        (size.sizeId === sizeId || size.id === sizeId) &&
        size.available !== false,
    );
    return (
      flavor.active !== false &&
      flavor.stockAvailable !== false &&
      sizeAvailable &&
      comboFlavorRule(slot, flavor).pricingRule !== "BLOCKED"
    );
  });
}

export function comboSlotMaxFlavors(slot) {
  const available = availableComboFlavors(slot);
  const splitEligible = available.filter(
    (flavor) => flavor.allowHalfAndHalf !== false,
  );
  const availableLimit =
    splitEligible.length >= 2 ? splitEligible.length : 1;
  return Math.max(
    1,
    Math.min(
      4,
      Number(slot.baseProduct?.maxFlavors || 1),
      Number(slot.maxFlavors || slot.size?.maxFlavors || 1),
      availableLimit,
    ),
  );
}

export function availableComboModifierOptions(slot, group) {
  if (!slot.allowModifiers || group?.active === false) return [];
  return (group?.options || []).filter((option) => {
    if (option.active === false || option.stockAvailable === false) return false;
    const rule = (slot.modifierRules || []).find(
      (entry) => entry.optionId === option.id,
    );
    return rule?.pricingRule !== "BLOCKED";
  });
}

export function initialComboSelections(combo) {
  return Object.fromEntries(
    (combo.comboSlots || []).map((slot) => {
      if (slot.type === "PRODUCT_CHOICE") {
        const choice = (slot.products || []).find(
          (entry) => entry.product?.available !== false && entry.product?.stockAvailable !== false,
        );
        return [
          slot.id,
          {
            slotId: slot.id,
            choiceId: choice?.id || "",
            productId: choice?.productId || "",
            sizeId: choice?.sizeId || null,
          },
        ];
      }
      if (slot.type === "CONFIGURABLE_PIZZA") {
        const flavor = availableComboFlavors(slot)[0];
        const defaults = slot.allowModifiers
          ? initialModifierSelections(
              (slot.baseProduct?.availableModifierGroups || []).map((group) => ({
                ...group,
                options: availableComboModifierOptions(slot, group),
              })),
            )
          : {};
        return [
          slot.id,
          {
            slotId: slot.id,
            flavorIds: flavor ? [flavor.id] : [],
            optionIds: Object.values(defaults).flat(),
            targetCount: 1,
          },
        ];
      }
      return [slot.id, { slotId: slot.id }];
    }),
  );
}

export function comboSelectionBlockReason(slot, selection = {}) {
  if (slot.type === "PRODUCT_CHOICE") {
    const choice = (slot.products || []).find(
      (entry) => entry.id === selection.choiceId,
    );
    if (
      !choice ||
      choice.product?.available === false ||
      choice.product?.stockAvailable === false
    )
      return `Escolha uma opção em ${slot.name}.`;
  }
  if (slot.type !== "CONFIGURABLE_PIZZA") return "";
  const flavors = availableComboFlavors(slot);
  const selected = Array.isArray(selection.flavorIds)
    ? selection.flavorIds
    : [];
  const target = Math.max(1, Number(selection.targetCount || 1));
  if (!selected.length || selected.length !== target)
    return `Escolha ${target} ${target === 1 ? "sabor" : "sabores"} em ${slot.name}.`;
  if (selected.some((id) => !flavors.some((flavor) => flavor.id === id)))
    return `Revise os sabores de ${slot.name}.`;
  if (
    selected.length > 1 &&
    selected.some(
      (id) => flavors.find((flavor) => flavor.id === id)?.allowHalfAndHalf === false,
    )
  )
    return `Um dos sabores escolhidos em ${slot.name} não permite meio a meio.`;
  if (selected.length > comboSlotMaxFlavors(slot))
    return `Revise os sabores de ${slot.name}.`;
  const optionIds = new Set(selection.optionIds || []);
  if (!slot.allowModifiers && optionIds.size)
    return `${slot.name} não aceita adicionais.`;
  const knownOptionIds = new Set();
  for (const group of slot.baseProduct?.availableModifierGroups || []) {
    const options = availableComboModifierOptions(slot, group);
    options.forEach((option) => knownOptionIds.add(option.id));
    const count = options.filter((option) =>
      optionIds.has(option.id),
    ).length;
    const minimum = group.required
      ? Math.max(1, Number(group.minSelect || 0))
      : Number(group.minSelect || 0);
    if (slot.allowModifiers && count < minimum)
      return `Escolha uma opção em ${group.name}.`;
    if (count > Number(group.maxSelect || 1))
      return `Revise as opções de ${group.name}.`;
  }
  if ([...optionIds].some((id) => !knownOptionIds.has(id)))
    return `Revise os adicionais de ${slot.name}.`;
  return "";
}

function signedRule(rule, normalPrice = 0) {
  const amount = Math.max(0, Number(rule?.amount || 0));
  if (rule?.pricingRule === "SURCHARGE") return amount;
  if (rule?.pricingRule === "DISCOUNT") return -amount;
  if (rule?.pricingRule === "NORMAL") return normalPrice;
  return 0;
}

export function localComboAdjustment(combo, selections) {
  let total = 0;
  for (const slot of combo.comboSlots || []) {
    const selection = selections[slot.id] || {};
    if (slot.type === "PRODUCT_CHOICE") {
      const choice = (slot.products || []).find(
        (entry) => entry.id === selection.choiceId,
      );
      total += Number(choice?.priceAdjustment || 0) * Number(slot.quantity || 1);
    }
    if (slot.type !== "CONFIGURABLE_PIZZA") continue;
    const flavors = availableComboFlavors(slot).filter((flavor) =>
      (selection.flavorIds || []).includes(flavor.id),
    );
    const flavorAdjustment = flavors.length
      ? flavors.reduce(
          (sum, flavor) => sum + signedRule(comboFlavorRule(slot, flavor)),
          0,
        ) / flavors.length
      : 0;
    const options = (slot.baseProduct?.availableModifierGroups || [])
      .flatMap((group) => group.options || [])
      .filter((option) => (selection.optionIds || []).includes(option.id));
    const optionAdjustment = options.reduce((sum, option) => {
      const rule = (slot.modifierRules || []).find(
        (entry) => entry.optionId === option.id,
      );
      const fallback =
        slot.modifierPricingMode === "INCLUDED"
          ? { pricingRule: "INCLUDED" }
          : { pricingRule: "NORMAL" };
      return sum + signedRule(rule || fallback, Number(option.price || 0));
    }, 0);
    total +=
      (flavorAdjustment + optionAdjustment) * Number(slot.quantity || 1);
  }
  return roundMoney(total);
}

export function serializeComboSelections(combo, selections) {
  return (combo.comboSlots || [])
    .filter((slot) => slot.type !== "FIXED_PRODUCT")
    .map((slot) => {
      const selection = selections[slot.id] || {};
      return {
        slotId: slot.id,
        ...(slot.type === "PRODUCT_CHOICE"
          ? {
              choiceId: selection.choiceId || null,
              productId: selection.productId || null,
              sizeId: selection.sizeId || null,
            }
          : {
              flavorIds: [...(selection.flavorIds || [])],
              optionIds: [...(selection.optionIds || [])],
            }),
      };
    });
}

export function comboCartKey(comboId, comboSelections, notes = "") {
  const canonical = (comboSelections || [])
    .map((entry) => ({
      slotId: entry.slotId,
      choiceId: entry.choiceId || null,
      productId: entry.productId || null,
      sizeId: entry.sizeId || null,
      flavorIds: [...(entry.flavorIds || [])].sort(),
      optionIds: [...(entry.optionIds || [])].sort(),
    }))
    .sort((a, b) => a.slotId.localeCompare(b.slotId));
  return [
    comboId,
    "combo-v2",
    JSON.stringify(canonical),
    String(notes || "").trim().toLocaleLowerCase("pt-BR"),
  ].join("::");
}

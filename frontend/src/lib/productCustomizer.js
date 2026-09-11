function minimumForGroup(group) {
  return group.required
    ? Math.max(1, Number(group.minSelect || 0))
    : Number(group.minSelect || 0);
}

export function initialModifierSelections(groups = []) {
  const selections = {};
  for (const group of groups) {
    const activeOptions = (group.options || []).filter(
      (option) => option.active !== false,
    );
    if (minimumForGroup(group) !== 1 || !activeOptions.length) continue;

    const isCrust = /borda/i.test(String(group.name || ""));
    const standardCrust = isCrust
      ? activeOptions.find((option) =>
          /^(tradicional|normal|sem borda)$/i.test(
            String(option.name || "").trim(),
          ),
        ) || activeOptions.find((option) => Number(option.price || 0) === 0)
      : null;
    const defaultOption =
      standardCrust || (activeOptions.length === 1 ? activeOptions[0] : null);
    if (defaultOption) selections[group.id] = [defaultOption.id];
  }
  return selections;
}

export function customizerBlockReason({
  sizes = [],
  selectedSize,
  hasFlavorChoice,
  chosenCount,
  targetCount,
  modifierGroups = [],
  selectedOptions = {},
}) {
  if (sizes.length && !selectedSize) return "Escolha um tamanho.";
  if (hasFlavorChoice && chosenCount !== targetCount)
    return `Escolha ${targetCount} sabor(es) para continuar.`;

  for (const group of modifierGroups) {
    const selectedCount = (selectedOptions[group.id] || []).length;
    const minimum = minimumForGroup(group);
    const maximum = Math.max(minimum, Number(group.maxSelect || 1));
    if (selectedCount < minimum)
      return `Escolha ${minimum === 1 ? "uma opção" : `pelo menos ${minimum} opções`} em ${group.name}.`;
    if (selectedCount > maximum)
      return `${group.name} permite no máximo ${maximum} opções.`;
  }
  return "";
}

export function isTableCatalogProduct(product) {
  return Boolean(
    product &&
      product.available !== false &&
      product.stockAvailable !== false,
  );
}

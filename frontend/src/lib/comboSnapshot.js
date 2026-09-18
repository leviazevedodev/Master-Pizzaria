const nonEmptyNames = (items, field) =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item?.[field] || item?.name || "").trim())
    .filter(Boolean);

export function comboSnapshotItemLabel(item, multiplier = 1) {
  const quantity =
    Math.max(1, Number(item?.quantity || 1)) *
    Math.max(1, Number(multiplier || 1));
  const name = String(item?.name || item?.product?.name || "Produto").trim();
  const sizeName = String(item?.sizeName || item?.size?.name || "").trim();
  return `${quantity}× ${name}${sizeName ? ` • ${sizeName}` : ""}`;
}

export function comboSnapshotDetailLines(item) {
  const lines = [];
  const slotName = String(item?.slotName || "").trim();
  const itemName = String(item?.name || item?.product?.name || "").trim();
  if (slotName && slotName.toLocaleLowerCase("pt-BR") !== itemName.toLocaleLowerCase("pt-BR"))
    lines.push(`Escolha: ${slotName}`);

  const flavors = nonEmptyNames(item?.flavors, "name");
  if (flavors.length) lines.push(`Sabores: ${flavors.join(" / ")}`);

  const options = (Array.isArray(item?.options) ? item.options : [])
    .map((option) => {
      const name = String(option?.optionName || option?.name || "").trim();
      const group = String(option?.groupName || "").trim();
      return name ? (group ? `${group}: ${name}` : name) : "";
    })
    .filter(Boolean);
  if (options.length) lines.push(`Adicionais: ${options.join(" / ")}`);
  return lines;
}

export function comboSnapshotText(item, multiplier = 1) {
  return [
    comboSnapshotItemLabel(item, multiplier),
    ...comboSnapshotDetailLines(item),
  ].join(" — ");
}

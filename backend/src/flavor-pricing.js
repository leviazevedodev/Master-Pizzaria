const PIZZA_PRICING_MODES = new Set([
  "MAX",
  "AVERAGE",
  "PROPORTIONAL",
  "SUM",
]);
const FLAVOR_SIZE_PRICING_MODES = new Set(["FIXED", "SURCHARGE"]);

export class FlavorPricingError extends Error {
  constructor(code, message, details = {}, httpStatus = 400) {
    super(message);
    this.name = "FlavorPricingError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
  }
}

const fail = (code, message, details, httpStatus) => {
  throw new FlavorPricingError(code, message, details, httpStatus);
};

function moneyToCents(value, field, code = "INVALID_MONEY_VALUE") {
  const amount = Number(value);
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > Number.MAX_SAFE_INTEGER / 100
  )
    fail(code, `${field} deve ser um valor monetário válido.`, { field }, 500);
  return Math.round((amount + Number.EPSILON) * 100);
}

const centsToMoney = (value) => Number((value / 100).toFixed(2));

export function roundMoney(value) {
  return centsToMoney(moneyToCents(value, "value"));
}

export function normalizePizzaFlavorPricingMode(value) {
  const mode = String(value || "").trim().toUpperCase();
  if (!PIZZA_PRICING_MODES.has(mode)) return null;
  return mode === "SUM" ? "AVERAGE" : mode;
}

function normalizeFlavorIds(flavorIds) {
  if (!Array.isArray(flavorIds) || !flavorIds.length)
    fail(
      "FLAVOR_REQUIRED",
      "Escolha pelo menos um sabor para montar a pizza.",
    );

  const ids = flavorIds.map((id) =>
    typeof id === "string" ? id.trim() : "",
  );
  if (ids.some((id) => !id))
    fail(
      "INVALID_FLAVOR_ID",
      "A seleção contém um identificador de sabor inválido.",
    );
  if (new Set(ids).size !== ids.length)
    fail(
      "DUPLICATE_FLAVOR_ID",
      "O mesmo sabor não pode ser selecionado mais de uma vez.",
    );
  return ids;
}

function catalogById(flavors) {
  if (!Array.isArray(flavors))
    fail(
      "INVALID_FLAVOR_CATALOG",
      "O catálogo de sabores não está disponível.",
      {},
      500,
    );
  const catalog = new Map();
  for (const flavor of flavors) {
    const id = typeof flavor?.id === "string" ? flavor.id.trim() : "";
    if (!id) continue;
    if (catalog.has(id))
      fail(
        "INVALID_FLAVOR_CATALOG",
        "O catálogo contém sabores duplicados.",
        { flavorId: id },
        500,
      );
    catalog.set(id, flavor);
  }
  return catalog;
}

function sizeRuleFor(flavor, sizeId) {
  const rules = Array.isArray(flavor.sizes) ? flavor.sizes : [];
  const rule = rules.find((entry) => entry?.sizeId === sizeId);
  if (!rule)
    fail(
      "FLAVOR_SIZE_NOT_CONFIGURED",
      `O sabor ${flavor.name || "selecionado"} não está configurado para esse tamanho.`,
      { flavorId: flavor.id, sizeId },
      409,
    );
  if (rule.available !== true || rule.size?.active === false)
    fail(
      "FLAVOR_SIZE_UNAVAILABLE",
      `O sabor ${flavor.name || "selecionado"} não está disponível nesse tamanho.`,
      { flavorId: flavor.id, sizeId },
      409,
    );
  return rule;
}

function quoteFlavor(flavor, sizeId, basePriceCents) {
  const rule = sizeRuleFor(flavor, sizeId);
  const pricingMode = String(rule.pricingMode || "").trim().toUpperCase();
  if (!FLAVOR_SIZE_PRICING_MODES.has(pricingMode))
    fail(
      "INVALID_FLAVOR_SIZE_PRICING_MODE",
      `A regra de preço do sabor ${flavor.name || "selecionado"} é inválida.`,
      { flavorId: flavor.id, sizeId, pricingMode: rule.pricingMode },
      500,
    );
  const configuredPriceCents = moneyToCents(
    rule.price,
    "flavorSize.price",
    "INVALID_FLAVOR_SIZE_PRICE",
  );
  const effectivePriceCents =
    pricingMode === "SURCHARGE"
      ? basePriceCents + configuredPriceCents
      : configuredPriceCents;
  if (!Number.isSafeInteger(effectivePriceCents))
    fail(
      "INVALID_FLAVOR_SIZE_PRICE",
      `O preço do sabor ${flavor.name || "selecionado"} é inválido.`,
      { flavorId: flavor.id, sizeId },
      500,
    );

  return {
    flavorId: flavor.id,
    name: flavor.name || "Sabor",
    groupId: flavor.groupId || null,
    sizeId,
    pricingMode,
    configuredPrice: centsToMoney(configuredPriceCents),
    basePriceApplied:
      pricingMode === "SURCHARGE" ? centsToMoney(basePriceCents) : null,
    effectivePrice: centsToMoney(effectivePriceCents),
    effectivePriceCents,
  };
}

/**
 * Cota uma seleção usando somente IDs enviados pelo cliente e preços carregados
 * pelo backend em `flavors`. Valores monetários do payload do cliente não devem
 * ser repassados para esta função.
 */
export function quoteFlavorSelection({
  basePrice,
  sizeId,
  flavorIds,
  flavors,
  maxFlavors = 1,
  allowFlavorSplit = true,
  pricingMode = "MAX",
}) {
  const normalizedSizeId =
    typeof sizeId === "string" ? sizeId.trim() : "";
  if (!normalizedSizeId)
    fail("SIZE_REQUIRED", "Escolha um tamanho válido para a pizza.");

  const basePriceCents = moneyToCents(
    basePrice,
    "basePrice",
    "INVALID_BASE_PRICE",
  );
  const ids = normalizeFlavorIds(flavorIds);
  const limit = Number(maxFlavors);
  if (!Number.isInteger(limit) || limit < 1)
    fail(
      "INVALID_MAX_FLAVORS",
      "O limite de sabores configurado para a pizza é inválido.",
      { maxFlavors },
      500,
    );
  if (ids.length > limit)
    fail(
      "FLAVOR_LIMIT_EXCEEDED",
      `Essa pizza permite no máximo ${limit} ${limit === 1 ? "sabor" : "sabores"}.`,
      { selected: ids.length, maxFlavors: limit },
    );

  const requestedMode = String(pricingMode || "").trim().toUpperCase();
  const normalizedMode = normalizePizzaFlavorPricingMode(requestedMode);
  if (!normalizedMode)
    fail(
      "INVALID_PIZZA_PRICING_MODE",
      "O modo de cálculo dos sabores é inválido.",
      { pricingMode },
      500,
    );

  if (ids.length > 1 && allowFlavorSplit !== true)
    fail(
      "FLAVOR_SPLIT_NOT_ALLOWED",
      "Essa pizza não permite a escolha de mais de um sabor.",
    );

  const catalog = catalogById(flavors);
  const selected = ids.map((id) => {
    const flavor = catalog.get(id);
    if (!flavor)
      fail(
        "FLAVOR_NOT_FOUND",
        "Um dos sabores escolhidos não existe no catálogo.",
        { flavorId: id },
      );
    if (flavor.active !== true)
      fail(
        "FLAVOR_INACTIVE",
        `O sabor ${flavor.name || "selecionado"} está indisponível.`,
        { flavorId: id },
        409,
      );
    if (ids.length > 1 && flavor.allowHalfAndHalf !== true)
      fail(
        "FLAVOR_HALF_NOT_ALLOWED",
        `O sabor ${flavor.name || "selecionado"} não permite meio a meio.`,
        { flavorId: id },
        409,
      );
    return flavor;
  });

  const internalBreakdown = selected.map((flavor) =>
    quoteFlavor(flavor, normalizedSizeId, basePriceCents),
  );
  const quotedCents = internalBreakdown.map(
    (entry) => entry.effectivePriceCents,
  );
  const priceCents =
    normalizedMode === "MAX"
      ? Math.max(...quotedCents)
      : Math.round(
          quotedCents.reduce((total, value) => total + value, 0) /
            quotedCents.length,
        );
  const breakdown = internalBreakdown.map(
    ({ effectivePriceCents: _internal, ...entry }) => entry,
  );
  const price = centsToMoney(priceCents);

  return {
    sizeId: normalizedSizeId,
    flavorIds: ids,
    flavorCount: ids.length,
    maxFlavors: limit,
    basePrice: centsToMoney(basePriceCents),
    requestedPricingMode: requestedMode,
    pricingMode: normalizedMode,
    legacySumMode: requestedMode === "SUM",
    price,
    unitPrice: price,
    breakdown,
  };
}

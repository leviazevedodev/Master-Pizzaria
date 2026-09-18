import { booleanValue, boundedInteger } from "./input-validation.js";
import { cleanText, safeMediaUrl } from "./sanitization.js";

const invalidCombo = (message) =>
  Object.assign(new Error(message), { code: "INVALID_COMBO" });

export const comboSlugBase = (value) =>
  String(value || "combo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 82) || "combo";

async function uniqueComboSlug(tx, name, excludeId = null) {
  const base = comboSlugBase(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    const existing = await tx.product.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function ensureComboCategory(tx) {
  let category = await tx.category.findFirst({
    where: { OR: [{ slug: "combos" }, { name: "Combos" }] },
  });
  if (category) {
    return category.active
      ? category
      : tx.category.update({ where: { id: category.id }, data: { active: true } });
  }
  const last = await tx.category.aggregate({ _max: { sortOrder: true } });
  return tx.category.create({
    data: {
      name: "Combos",
      slug: "combos",
      sortOrder: Number(last._max.sortOrder || 0) + 1,
      active: true,
    },
  });
}

export async function validateComboItems(tx, rawItems, comboId = null) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map((entry, sortOrder) => ({
      productId: cleanText(entry?.productId, 80),
      sizeId: cleanText(entry?.sizeId, 80) || null,
      quantity: boundedInteger(entry?.quantity ?? 1, 1, 20),
      sortOrder,
    }))
    .filter((entry) => entry.productId);

  if (items.some((entry) => entry.quantity == null)) {
    throw invalidCombo("A quantidade de um item do combo é inválida.");
  }
  if (items.some((entry) => entry.productId === comboId)) {
    throw invalidCombo("Um combo não pode conter ele mesmo.");
  }
  if (new Set(items.map((entry) => entry.productId)).size !== items.length) {
    throw invalidCombo("Não repita o mesmo produto: ajuste sua quantidade no combo.");
  }
  if (items.length < 2 || items.length > 20) {
    throw invalidCombo("Escolha entre 2 e 20 produtos diferentes para o combo.");
  }

  const products = await tx.product.findMany({
    where: {
      id: { in: items.map((entry) => entry.productId) },
      isCombo: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      productSizes: { include: { size: true } },
    },
  });
  if (products.length !== items.length) {
    throw invalidCombo("O combo contém produto inexistente, arquivado ou outro combo.");
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  for (const item of items) {
    const product = productsById.get(item.productId);
    const sizes = product.productSizes.filter((row) => row.size.active);
    const validSize = item.sizeId
      ? sizes.some((row) => row.sizeId === item.sizeId)
      : sizes.length === 0;
    if (!validSize) {
      throw invalidCombo(`Escolha um tamanho válido para ${product.name} no combo.`);
    }
  }
  return items;
}

async function syncComboItems(tx, comboId, items) {
  await tx.comboItem.deleteMany({ where: { comboId } });
  await tx.comboItem.createMany({
    data: items.map((entry) => ({ ...entry, comboId })),
  });
}

const SLOT_TYPES = new Set([
  "FIXED_PRODUCT",
  "PRODUCT_CHOICE",
  "CONFIGURABLE_PIZZA",
]);
const FLAVOR_SCOPES = new Set(["ALL", "GROUPS", "MANUAL"]);
const FLAVOR_RULES = new Set([
  "INCLUDED",
  "SURCHARGE",
  "DISCOUNT",
  "BLOCKED",
]);
const MODIFIER_RULES = new Set([
  "NORMAL",
  "INCLUDED",
  "SURCHARGE",
  "DISCOUNT",
  "BLOCKED",
]);

const boundedMoney = (value, { negative = false } = {}) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) &&
    amount <= 99_999_999.99 &&
    (negative ? amount >= -99_999_999.99 : amount >= 0)
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : null;
};

function normalizeRules(rawRules, idField, allowedRules) {
  const rows = (Array.isArray(rawRules) ? rawRules : [])
    .map((entry) => ({
      [idField]: cleanText(entry?.[idField], 80),
      pricingRule: cleanText(entry?.pricingRule, 30).toUpperCase(),
      amount: boundedMoney(entry?.amount),
    }))
    .filter((entry) => entry[idField]);
  if (
    rows.some(
      (entry) =>
        !allowedRules.has(entry.pricingRule) || entry.amount == null,
    ) ||
    new Set(rows.map((entry) => entry[idField])).size !== rows.length
  )
    throw invalidCombo("Uma regra de preço do combo é inválida ou está repetida.");
  return rows;
}

export async function validateComboSlots(tx, rawSlots, comboId = null) {
  const rows = Array.isArray(rawSlots) ? rawSlots : [];
  if (rows.length < 2 || rows.length > 20)
    throw invalidCombo("Configure entre 2 e 20 itens para o combo.");

  const slots = rows.map((entry, sortOrder) => {
    const type = cleanText(entry?.type, 40).toUpperCase();
    const quantity = boundedInteger(entry?.quantity ?? 1, 1, 20);
    if (!SLOT_TYPES.has(type) || quantity == null)
      throw invalidCombo("Um tipo ou quantidade de item do combo é inválido.");
    const flavorScope = cleanText(entry?.flavorScope, 20).toUpperCase() || "ALL";
    if (!FLAVOR_SCOPES.has(flavorScope))
      throw invalidCombo("A regra de sabores do combo é inválida.");
    const rawMax = entry?.maxFlavors;
    const maxFlavors =
      rawMax === "" || rawMax == null
        ? null
        : boundedInteger(rawMax, 1, 4);
    if (rawMax !== "" && rawMax != null && maxFlavors == null)
      throw invalidCombo("O limite de sabores do combo deve ficar entre 1 e 4.");
    const modifierPricingMode =
      cleanText(entry?.modifierPricingMode, 20).toUpperCase() || "NORMAL";
    if (!new Set(["NORMAL", "INCLUDED"]).has(modifierPricingMode))
      throw invalidCombo("A cobrança de adicionais do combo é inválida.");
    const products = (Array.isArray(entry?.products) ? entry.products : [])
      .map((choice, choiceOrder) => ({
        productId: cleanText(choice?.productId, 80),
        sizeId: cleanText(choice?.sizeId, 80) || null,
        priceAdjustment: boundedMoney(choice?.priceAdjustment, {
          negative: true,
        }),
        sortOrder: choiceOrder,
      }))
      .filter((choice) => choice.productId);
    if (products.some((choice) => choice.priceAdjustment == null))
      throw invalidCombo("O acréscimo de uma opção do combo é inválido.");
    const choiceKeys = products.map(
      (choice) => `${choice.productId}:${choice.sizeId || ""}`,
    );
    if (new Set(choiceKeys).size !== choiceKeys.length)
      throw invalidCombo("Não repita o mesmo produto e tamanho no mesmo item.");
    return {
      type,
      name: cleanText(entry?.name, 100),
      quantity,
      sortOrder,
      baseProductId: cleanText(entry?.baseProductId, 80) || null,
      sizeId: cleanText(entry?.sizeId, 80) || null,
      flavorScope,
      maxFlavors,
      allowModifiers: booleanValue(entry?.allowModifiers),
      modifierPricingMode,
      products,
      flavorGroupRules: normalizeRules(
        entry?.flavorGroupRules,
        "flavorGroupId",
        FLAVOR_RULES,
      ),
      flavorRules: normalizeRules(
        entry?.flavorRules,
        "flavorId",
        FLAVOR_RULES,
      ),
      modifierRules: normalizeRules(
        entry?.modifierRules,
        "optionId",
        MODIFIER_RULES,
      ),
    };
  });

  const productIds = [
    ...new Set(
      slots
        .flatMap((slot) => [
          slot.baseProductId,
          ...slot.products.map((choice) => choice.productId),
        ])
        .filter(Boolean),
    ),
  ];
  if (productIds.includes(comboId))
    throw invalidCombo("Um combo não pode conter ele mesmo.");
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isCombo: false, deletedAt: null },
    select: {
      id: true,
      name: true,
      allowFlavorSplit: true,
      maxFlavors: true,
      productSizes: { include: { size: true } },
      productFlavors: {
        include: { flavor: { include: { group: true, sizes: true } } },
      },
      modifierGroups: {
        include: { group: { include: { options: true } } },
      },
    },
  });
  if (products.length !== productIds.length)
    throw invalidCombo("O combo contém produto inexistente, arquivado ou outro combo.");
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const slot of slots) {
    if (["FIXED_PRODUCT", "PRODUCT_CHOICE"].includes(slot.type)) {
      const requiredChoices = slot.type === "FIXED_PRODUCT" ? 1 : 2;
      if (
        (slot.type === "FIXED_PRODUCT" && slot.products.length !== 1) ||
        (slot.type === "PRODUCT_CHOICE" && slot.products.length < requiredChoices)
      )
        throw invalidCombo(
          slot.type === "FIXED_PRODUCT"
            ? "Um item fixo deve possuir exatamente um produto."
            : "Uma escolha deve possuir pelo menos dois produtos.",
        );
      for (const choice of slot.products) {
        const product = productMap.get(choice.productId);
        const activeSizes = product.productSizes.filter(
          (entry) => entry.size.active,
        );
        const validSize = choice.sizeId
          ? activeSizes.some((entry) => entry.sizeId === choice.sizeId)
          : activeSizes.length === 0;
        if (!validSize)
          throw invalidCombo(
            `Escolha um tamanho válido para ${product.name} no combo.`,
          );
      }
      slot.name ||=
        slot.type === "FIXED_PRODUCT"
          ? productMap.get(slot.products[0].productId).name
          : `Escolha ${slot.sortOrder + 1}`;
      slot.baseProductId = null;
      slot.sizeId = null;
      slot.flavorScope = "ALL";
      slot.maxFlavors = null;
      slot.flavorGroupRules = [];
      slot.flavorRules = [];
      slot.modifierRules = [];
      slot.allowModifiers = false;
      slot.modifierPricingMode = "NORMAL";
      continue;
    }

    const base = productMap.get(slot.baseProductId);
    if (!base?.allowFlavorSplit || !slot.sizeId)
      throw invalidCombo("Escolha uma pizza base e um tamanho para a pizza configurável.");
    const size = base.productSizes.find(
      (entry) => entry.sizeId === slot.sizeId && entry.size.active,
    );
    if (!size)
      throw invalidCombo(`O tamanho escolhido não está disponível para ${base.name}.`);
    const effectiveMaxFlavors = Math.min(
      4,
      Math.max(1, Number(base.maxFlavors || 1)),
      Math.max(1, Number(size.size.maxFlavors || 4)),
    );
    if (
      slot.maxFlavors != null &&
      Number(slot.maxFlavors) > effectiveMaxFlavors
    )
      throw invalidCombo(
        `${base.name} no tamanho ${size.size.name} permite no máximo ${effectiveMaxFlavors} sabor(es).`,
      );
    const linkedFlavors = new Map(
      base.productFlavors.map((entry) => [entry.flavorId, entry.flavor]),
    );
    if (!linkedFlavors.size)
      throw invalidCombo(`${base.name} não possui sabores vinculados.`);
    const allowedGroupIds = new Set(
      [...linkedFlavors.values()].map((flavor) => flavor.groupId).filter(Boolean),
    );
    if (
      slot.flavorGroupRules.some(
        (rule) => !allowedGroupIds.has(rule.flavorGroupId),
      ) ||
      slot.flavorRules.some((rule) => !linkedFlavors.has(rule.flavorId))
    )
      throw invalidCombo("Uma regra usa grupo ou sabor que não pertence à pizza base.");
    const specificRules = new Map(
      slot.flavorRules.map((rule) => [rule.flavorId, rule]),
    );
    const groupRules = new Map(
      slot.flavorGroupRules.map((rule) => [rule.flavorGroupId, rule]),
    );
    const hasAvailableFlavor = [...linkedFlavors.values()].some((flavor) => {
      const rule =
        specificRules.get(flavor.id) ||
        groupRules.get(flavor.groupId) ||
        (slot.flavorScope === "ALL"
          ? { pricingRule: "INCLUDED" }
          : { pricingRule: "BLOCKED" });
      return (
        flavor.active !== false &&
        rule.pricingRule !== "BLOCKED" &&
        (flavor.sizes || []).some(
          (entry) => entry.sizeId === slot.sizeId && entry.available !== false,
        )
      );
    });
    if (!hasAvailableFlavor)
      throw invalidCombo(
        `${base.name} não possui sabor permitido e disponível para o tamanho escolhido.`,
      );
    const activeOptionIds = new Set(
      base.modifierGroups.flatMap((entry) =>
        entry.group.options.filter((option) => option.active).map((option) => option.id),
      ),
    );
    if (slot.modifierRules.some((rule) => !activeOptionIds.has(rule.optionId)))
      throw invalidCombo("Uma regra usa borda ou adicional que não pertence à pizza base.");
    if (!slot.allowModifiers) slot.modifierRules = [];
    slot.products = [];
    slot.name ||= `Pizza ${size.size.name}`;
  }
  return slots;
}

async function syncComboSlots(tx, comboId, slots) {
  await tx.comboSlot.deleteMany({ where: { comboId } });
  for (const slot of slots) {
    const {
      products,
      flavorGroupRules,
      flavorRules,
      modifierRules,
      ...data
    } = slot;
    await tx.comboSlot.create({
      data: {
        ...data,
        comboId,
        products: products.length ? { create: products } : undefined,
        flavorGroupRules: flavorGroupRules.length
          ? { create: flavorGroupRules }
          : undefined,
        flavorRules: flavorRules.length ? { create: flavorRules } : undefined,
        modifierRules: modifierRules.length
          ? { create: modifierRules }
          : undefined,
      },
    });
  }
}

function readComboFields(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body?.name !== undefined) {
    const name = cleanText(body?.name, 100);
    if (name.length < 2) throw invalidCombo("Informe um nome válido para o combo.");
    data.name = name;
  }
  if (!partial || body?.description !== undefined) {
    const description = cleanText(body?.description, 350);
    if (!description) throw invalidCombo("Informe a descrição do combo.");
    data.description = description;
  }
  if (!partial || body?.price !== undefined) {
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99) {
      throw invalidCombo("Informe um preço válido para o combo.");
    }
    data.price = price;
  }
  if (!partial || body?.image !== undefined) {
    const image = safeMediaUrl(body?.image) || null;
    if (body?.image && !image) throw invalidCombo("A imagem do combo é inválida.");
    data.image = image;
  }
  if (body?.available !== undefined) data.available = booleanValue(body.available);
  return data;
}

export function registerComboAdminRoutes({
  app,
  prisma,
  auth,
  admin,
  productInclude,
  serializeProduct,
  writeAdminLog,
}) {
  const include = productInclude;

  app.get("/api/admin/combos", auth, admin, async (req, res) => {
    const rows = await prisma.product.findMany({
      where: req.query.archived === "1"
        ? { isCombo: true }
        : { isCombo: true, deletedAt: null },
      include,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    res.json(rows.map(serializeProduct));
  });

  app.post("/api/admin/combos", auth, admin, async (req, res) => {
    const fields = readComboFields(req.body);
    const combo = await prisma.$transaction(async (tx) => {
      const slots = Array.isArray(req.body?.slots)
        ? await validateComboSlots(tx, req.body.slots)
        : null;
      const items = slots
        ? null
        : await validateComboItems(tx, req.body?.items);
      const category = await ensureComboCategory(tx);
      const sort = await tx.product.aggregate({
        where: { isCombo: true },
        _max: { sortOrder: true },
      });
      const product = await tx.product.create({
        data: {
          ...fields,
          slug: await uniqueComboSlug(tx, fields.name),
          badge: "Combo",
          isCombo: true,
          categoryId: category.id,
          available: fields.available ?? true,
          sortOrder: Number(sort._max.sortOrder || 0) + 1,
        },
      });
      if (slots) await syncComboSlots(tx, product.id, slots);
      else await syncComboItems(tx, product.id, items);
      return tx.product.findUnique({ where: { id: product.id }, include });
    });
    await writeAdminLog(req, "CREATE_COMBO", "Product", combo.id, {
      name: combo.name,
      items: combo.comboSlots?.length || combo.comboItems.length,
    });
    res.status(201).json(serializeProduct(combo));
  });

  app.patch("/api/admin/combos/:id", auth, admin, async (req, res) => {
    const combo = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({
        where: { id: req.params.id, isCombo: true },
      });
      if (!current) {
        throw Object.assign(new Error("Combo não encontrado."), { code: "P2025" });
      }
      const data = readComboFields(req.body, { partial: true });
      if (data.name) data.slug = await uniqueComboSlug(tx, data.name, current.id);
      const slots = Array.isArray(req.body?.slots)
        ? await validateComboSlots(tx, req.body.slots, current.id)
        : null;
      const items = !slots && Array.isArray(req.body?.items)
        ? await validateComboItems(tx, req.body.items, current.id)
        : null;
      await tx.product.update({ where: { id: current.id }, data });
      if (slots) await syncComboSlots(tx, current.id, slots);
      else if (items) {
        await syncComboItems(tx, current.id, items);
        // Clientes administrativos de uma versão anterior continuam podendo
        // editar combos fixos durante um deploy gradual. Os slots equivalentes
        // são atualizados junto, sem apagar a composição legada.
        const compatibleSlots = items.map((item, index) => ({
          type: "FIXED_PRODUCT",
          name: "",
          quantity: item.quantity,
          sortOrder: index,
          baseProductId: null,
          sizeId: null,
          flavorScope: "ALL",
          maxFlavors: null,
          allowModifiers: false,
          modifierPricingMode: "NORMAL",
          products: [
            {
              productId: item.productId,
              sizeId: item.sizeId,
              priceAdjustment: 0,
              sortOrder: 0,
            },
          ],
          flavorGroupRules: [],
          flavorRules: [],
          modifierRules: [],
        }));
        await syncComboSlots(
          tx,
          current.id,
          await validateComboSlots(tx, compatibleSlots, current.id),
        );
      }
      return tx.product.findUnique({ where: { id: current.id }, include });
    });
    await writeAdminLog(req, "UPDATE_COMBO", "Product", combo.id, { name: combo.name });
    res.json(serializeProduct(combo));
  });

  app.delete("/api/admin/combos/:id", auth, admin, async (req, res) => {
    const combo = await prisma.product.update({
      where: { id: req.params.id, isCombo: true },
      data: { available: false, deletedAt: new Date() },
    });
    await writeAdminLog(req, "ARCHIVE_COMBO", "Product", combo.id, { name: combo.name });
    res.json({ ok: true, id: combo.id, archived: true });
  });
}
